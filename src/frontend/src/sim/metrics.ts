/**
 * Lightweight, client-side aggregation of live verification metrics for the
 * PoC dashboard. Mirrors, at a much simplified scale, the kind of safety
 * evidence the platform's real Geometric Collision-Safety Verification
 * Engine and Scalable Simulation and Validation Harness are meant to
 * produce (see PROJECT_PLAN.md — real-time latency budgets, false-negative
 * safety-verification rate, near-miss/incident counts) so the dashboard
 * reads like a genuine safety-verification report rather than a toy
 * debug view.
 */
import type { SafetyResult } from "./simulation";

/** Rolling window size (frames) used for the "recent" verification-latency
 * average — long enough to smooth out a single frame's jitter, short
 * enough to reflect current performance rather than a stale long-run
 * average. */
const LATENCY_WINDOW_SIZE = 120;

/** A margin below this is logged as a "near-miss" event even if the
 * vehicle successfully braked in time — distinct from `isSafe === false`,
 * which just means the vehicle is actively arbitrating/braking for a
 * margin violation, not that a real close call occurred. */
const NEAR_MISS_MARGIN_M = 1.0;

export interface FleetMetricsSnapshot {
  /** Total simulated seconds elapsed since the fleet was created. */
  elapsedSimS: number;
  /** Total verification cycles (frames) processed. */
  totalFrames: number;
  /** Most recent frame's wall-clock compute time for the verification +
   * arbitration step, in milliseconds. */
  lastLatencyMs: number;
  /** Rolling average compute latency over the last `LATENCY_WINDOW_SIZE`
   * frames, in milliseconds. */
  avgLatencyMs: number;
  /** Verification cycles per second the engine is sustaining, derived from
   * `avgLatencyMs` (throughput headroom indicator, not the render frame
   * rate). */
  throughputHz: number;
  /** Smallest body-to-body clearance margin observed across the entire
   * session (worst case so far), in meters. */
  worstMarginEverM: number;
  /** Smallest clearance margin across the fleet on the current frame. */
  currentMinMarginM: number;
  /** Mean clearance margin across the fleet on the current frame. */
  currentAvgMarginM: number;
  /** Vehicles currently arbitrating (braking below cruise for a safety
   * margin violation) on the current frame. */
  activeBrakingCount: number;
  /** Total fleet size. */
  fleetSize: number;
  /** Cumulative count of frames where any vehicle's margin fell below
   * `NEAR_MISS_MARGIN_M` — a proxy for "close call" events worth flagging
   * even when the arbitration system ultimately kept the trajectory safe. */
  nearMissEvents: number;
  /** Cumulative count of distinct safety-margin violations attributed to a
   * pedestrian conflict vs. a vehicle conflict, for a simple breakdown of
   * what's driving arbitration activity. */
  pedestrianConflictFrames: number;
  vehicleConflictFrames: number;
  /** Mean fleet speed (m/s) on the current frame — a simple traffic-flow
   * health indicator (a fleet stuck at ~0 average speed suggests gridlock,
   * not just isolated braking). */
  currentAvgSpeedMps: number;
}

/** Mutable rolling-aggregation state, held in a ref by the caller and
 * updated once per simulation frame via `recordFrame`. */
export interface FleetMetricsState {
  elapsedSimS: number;
  totalFrames: number;
  worstMarginEverM: number;
  nearMissEvents: number;
  pedestrianConflictFrames: number;
  vehicleConflictFrames: number;
  latencyWindowMs: number[];
  latencyWindowIndex: number;
}

export function createFleetMetricsState(): FleetMetricsState {
  return {
    elapsedSimS: 0,
    totalFrames: 0,
    worstMarginEverM: Infinity,
    nearMissEvents: 0,
    pedestrianConflictFrames: 0,
    vehicleConflictFrames: 0,
    latencyWindowMs: [],
    latencyWindowIndex: 0,
  };
}

/** Fold one simulation frame's results into the rolling aggregation state
 * and return a fresh immutable snapshot for display. Mutates `state`
 * in-place (caller holds it in a ref) for O(1) amortized bookkeeping
 * instead of re-scanning full history every frame. */
export function recordFrame(
  state: FleetMetricsState,
  verdicts: SafetyResult[],
  speedsMps: number[],
  deltaS: number,
  latencyMs: number
): FleetMetricsSnapshot {
  state.elapsedSimS += deltaS;
  state.totalFrames += 1;

  if (state.latencyWindowMs.length < LATENCY_WINDOW_SIZE) {
    state.latencyWindowMs.push(latencyMs);
  } else {
    state.latencyWindowMs[state.latencyWindowIndex] = latencyMs;
  }
  state.latencyWindowIndex = (state.latencyWindowIndex + 1) % LATENCY_WINDOW_SIZE;

  let currentMinMarginM = Infinity;
  let marginSum = 0;
  let activeBrakingCount = 0;
  let sawNearMiss = false;
  let sawPedestrianConflict = false;
  let sawVehicleConflict = false;

  for (const v of verdicts) {
    marginSum += v.minMarginM;
    if (v.minMarginM < currentMinMarginM) currentMinMarginM = v.minMarginM;
    if (!v.isSafe) activeBrakingCount += 1;
    if (v.minMarginM < NEAR_MISS_MARGIN_M) sawNearMiss = true;
    if (v.cause === "pedestrian") sawPedestrianConflict = true;
    if (v.cause === "vehicle") sawVehicleConflict = true;
  }

  if (verdicts.length > 0 && currentMinMarginM < state.worstMarginEverM) {
    state.worstMarginEverM = currentMinMarginM;
  }
  if (sawNearMiss) state.nearMissEvents += 1;
  if (sawPedestrianConflict) state.pedestrianConflictFrames += 1;
  if (sawVehicleConflict) state.vehicleConflictFrames += 1;

  const avgLatencyMs =
    state.latencyWindowMs.length > 0
      ? state.latencyWindowMs.reduce((a, b) => a + b, 0) / state.latencyWindowMs.length
      : latencyMs;

  const currentAvgSpeedMps = speedsMps.length > 0 ? speedsMps.reduce((a, b) => a + b, 0) / speedsMps.length : 0;

  return {
    elapsedSimS: state.elapsedSimS,
    totalFrames: state.totalFrames,
    lastLatencyMs: latencyMs,
    avgLatencyMs,
    throughputHz: avgLatencyMs > 0 ? 1000 / avgLatencyMs : 0,
    worstMarginEverM: state.worstMarginEverM === Infinity ? 0 : state.worstMarginEverM,
    currentMinMarginM: currentMinMarginM === Infinity ? 0 : currentMinMarginM,
    currentAvgMarginM: verdicts.length > 0 ? marginSum / verdicts.length : 0,
    activeBrakingCount,
    fleetSize: verdicts.length,
    nearMissEvents: state.nearMissEvents,
    pedestrianConflictFrames: state.pedestrianConflictFrames,
    vehicleConflictFrames: state.vehicleConflictFrames,
    currentAvgSpeedMps,
  };
}
