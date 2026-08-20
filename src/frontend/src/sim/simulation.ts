/**
 * Minimal client-side stand-in for the platform's verification + arbitration
 * modules (see src/verification_engine and src/trajectory_arbitration on the
 * backend). Pure, framework-agnostic functions: routes a fleet of vehicles
 * over the town's road network graph, driving each vehicle offset to the
 * right-hand lane of its current edge (two-way streets), and checks each
 * vehicle's look-ahead safety margin against every wandering pedestrian's
 * forecasted path and against every other vehicle's look-ahead path
 * (covering same-lane following, oncoming, and intersection cross-traffic
 * collisions). Vehicles always yield to pedestrians. For vehicle-vehicle
 * conflicts (including crossing traffic at intersections), whichever
 * vehicle is closer to completing its current road segment is treated as
 * having arrived first and keeps going; the other yields. Yielding is
 * implemented as a physically-grounded braking limit (maximum safe speed
 * derived from stopping distance = speed^2 / (2 * deceleration)) rather
 * than a percentage-based speed blend, so a braking vehicle is guaranteed
 * to be able to stop before reaching the point where it would otherwise
 * violate the safety margin.
 *
 * Cross-street turns are smoothed rather than snapped: as a vehicle nears
 * an intersection it pre-selects its next road segment a little early and
 * blends both heading and lane-offset direction from the current edge
 * toward the next edge over a short "corner" distance, so it visually
 * rounds the corner like a real car instead of instantly pivoting at the
 * node — while the underlying centerline position always advances strictly
 * from the vehicle's real `distanceOnEdgeM`, so nothing ever teleports.
 *
 * Critically, collision look-ahead sampling (`resolvedPoseAheadM`) and the
 * rendered pose (`vehicleRenderPose`) are BOTH built from the exact same
 * underlying path-projection function, parameterized only by how far ahead
 * to project. This guarantees the safety system always "sees" a vehicle
 * exactly where it will actually be drawn, including while it is mid-turn
 * and projected across an intersection onto its pending next edge — so
 * turning vehicles can no longer visually swing toward a hazard that the
 * collision math failed to sample.
 *
 * This is a simplified PoC approximation, not the swept-volume / SDF engine
 * described in PROJECT_PLAN.md.
 */
import type { RoadNetwork } from "../city/cityLayout";
import type { PedestrianState } from "./pedestrians";

export interface Pose2D {
  x: number;
  z: number;
  headingRad: number;
}

export interface VehicleConfig {
  cruiseSpeedMps: number;
  safetyMarginM: number;
  lookAheadS: number;
  vehicleLengthM: number;
  /** Maximum braking deceleration (m/s^2) used to derive the safe speed
   * limit from the distance to the nearest upcoming hazard. */
  maxDecelMps2: number;
  /** Maximum acceleration (m/s^2) used when speeding back up toward
   * cruise speed once a hazard has cleared. */
  maxAccelMps2: number;
}

export const DEFAULT_VEHICLE_CONFIG: VehicleConfig = {
  cruiseSpeedMps: 8,
  safetyMarginM: 4,
  lookAheadS: 1.6,
  vehicleLengthM: 4.6,
  maxDecelMps2: 6,
  maxAccelMps2: 3,
};

/** Number of interpolated samples (in addition to the current pose) taken
 * along each vehicle's look-ahead path when checking for collisions — a
 * coarse discretized stand-in for the backend's continuous swept-volume
 * analysis. */
const VEHICLE_PATH_SAMPLES = 10;

/** Fraction of the road width a vehicle is offset from the centerline, to
 * the right of its direction of travel — keeps opposing traffic on a
 * two-way street in separate lanes either side of the yellow divider. */
const LANE_OFFSET_FRACTION = 0.25;

/** Treated as a small point-safety buffer around each pedestrian when
 * checking a vehicle's look-ahead path clearance. */
const PEDESTRIAN_RADIUS_M = 0.4;

/** Extra clearance (beyond the base `safetyMarginM`) required specifically
 * when directly following another vehicle in the same lane (as opposed to
 * a one-off crossing-path conflict) — gives trailing vehicles a bigger,
 * more realistic following gap and additional reaction buffer instead of
 * braking to a margin that leaves them nearly touching bumpers. */
const FOLLOWING_EXTRA_MARGIN_M = 2.5;
// Required safety buffer used for vehicle-vehicle checks is direction-aware
// (see `directionalHalfExtentM` reuse in `evaluateVehicleVehicleConflict`):
// the full `safetyMarginM` (+ extra when following) applies to hazards
// ahead/behind, while only this much smaller lateral buffer applies to
// hazards directly alongside — real cars in adjacent/oncoming lanes pass
// with well under a car length of side clearance, so applying the full
// longitudinal following margin to lateral separation as well falsely
// flagged same-time passing traffic in different lanes as "too close",
// making both vehicles brake for each other simultaneously (a gridlock
// even though neither was ever on a collision course).
const LATERAL_SAFETY_MARGIN_M = 0.5;

/** Half the real car body width (Car.tsx's boxGeometry is 1.8m wide), used
 * together with each vehicle's half-length as the two semi-axes of the
 * directional body-clearance ellipse (see `directionalHalfExtentM`) for
 * vehicle-vehicle conflicts. */
const VEHICLE_HALF_WIDTH_M = 0.9;

/** Distance (meters) before reaching an intersection node over which a
 * vehicle's heading and lane-offset direction are blended toward its next
 * road segment, so turns look like a rounded arc rather than an instant
 * pivot. Kept short/realistic — this is a purely visual steering easing,
 * NOT the distance at which the next segment becomes visible for
 * collision purposes (see `pendingSelectionDistanceM` in `stepFleet`). */
const CORNER_BLEND_DISTANCE_M = 6;

/** Minimum turn speed factor (fraction of cruise speed) applied at a sharp
 * (~90 degree or greater) turn; smaller angles interpolate toward 1. */
const MIN_TURN_SPEED_FACTOR = 0.4;

const FLEET_COLORS = ["#2563eb", "#16a34a", "#eab308", "#9333ea", "#ea580c", "#0891b2"];

export interface VehicleState {
  id: string;
  color: string;
  fromNodeId: string;
  toNodeId: string;
  distanceOnEdgeM: number;
  speedMps: number;
  /** Next node chosen ahead of time once the vehicle enters the corner
   * blend zone near `toNodeId`, so heading/lane position can be smoothly
   * eased toward it before the vehicle actually crosses the intersection.
   * Null outside the blend zone. */
  pendingToNodeId: string | null;
}

export interface SafetyResult {
  vehicleId: string;
  isSafe: boolean;
  minMarginM: number;
  cause: "pedestrian" | "vehicle" | null;
  /** Id of whichever pedestrian or vehicle triggered the tightest margin. */
  conflictId: string | null;
  lookAheadPose: Pose2D;
}

export interface FleetStepResult {
  vehicles: VehicleState[];
  poses: Pose2D[];
  verdicts: SafetyResult[];
}

function edgeBetween(network: RoadNetwork, aId: string, bId: string) {
  const edge = network.edges.find((e) => (e.a === aId && e.b === bId) || (e.a === bId && e.b === aId));
  if (!edge) throw new Error(`No road edge between ${aId} and ${bId}`);
  return edge;
}

function pickNextNode(network: RoadNetwork, currentNodeId: string, cameFromNodeId: string, rand: () => number): string {
  const neighbors = network.adjacency[currentNodeId];
  const options = neighbors.filter((n) => n !== cameFromNodeId);
  const pool = options.length > 0 ? options : neighbors; // dead end -> allow U-turn
  return pool[Math.floor(rand() * pool.length)];
}

/** Remaining distance (meters) until `vehicle` reaches the far end of its
 * current road segment — used as a simple, position-based proxy for "how
 * close is this vehicle to the intersection/lane point it's heading
 * toward", which in turn determines right-of-way below. */
function remainingEdgeDistanceM(network: RoadNetwork, vehicle: VehicleState): number {
  const edge = edgeBetween(network, vehicle.fromNodeId, vehicle.toNodeId);
  return edge.length - vehicle.distanceOnEdgeM;
}

/** Minimum speed (m/s) assumed when estimating time-to-arrival, so a fully
 * stopped or crawling vehicle is still treated as "arriving soon" rather
 * than infinitely far in the future (which would wrongly grant it
 * priority forever while it accelerates back up). */
const MIN_ARRIVAL_SPEED_MPS = 0.5;

/** Estimated time (seconds) until `vehicle` reaches the far end of its
 * current road segment, given its current speed. Used (instead of raw
 * remaining distance) to decide right-of-way, since a slow/far vehicle
 * must not be granted priority over a fast/near vehicle just because it
 * happens to have a larger `remainingEdgeDistanceM` — arrival order should
 * reflect actual arrival time, not static position. */
function estimatedArrivalTimeS(remainingM: number, speedMps: number): number {
  return remainingM / Math.max(speedMps, MIN_ARRIVAL_SPEED_MPS);
}

/** True if `self` must yield to `other` when their paths conflict. The
 * vehicle estimated to arrive LATER at the end of its current segment
 * yields to the one arriving sooner (i.e. "arrived first"), covering both
 * same-edge following (trailing vehicle yields) and intersection
 * cross-traffic (later-arriving vehicle yields) — using time-to-arrival
 * rather than raw distance so speed differences are accounted for. A
 * deterministic id tie-break ensures exactly one of any conflicting pair
 * yields — never both (deadlock) and never neither (collision). */
function mustYieldTo(arrivalSelfS: number, arrivalOtherS: number, selfId: string, otherId: string): boolean {
  if (arrivalSelfS !== arrivalOtherS) return arrivalSelfS > arrivalOtherS;
  return selfId > otherId;
}

/** True if `otherPose` lies behind `selfPose` relative to self's own
 * direction of travel (negative dot product of the relative position
 * vector with self's forward vector, derived from the same
 * atan2(dx,dz)-based heading convention used throughout this file).
 * Vehicles never reverse, so anything behind self can never be a hazard
 * THIS vehicle needs to react to — maintaining a safe gap from something
 * approaching (or already sitting) behind is solely the trailing vehicle's
 * responsibility. Without this check, a leading vehicle would also see the
 * shrinking gap and consider itself obligated to yield/brake for the
 * vehicle behind it (since the old `sameLaneAhead`/proximity checks were
 * direction-agnostic), so BOTH vehicles in a pair would brake for each
 * other at once — a self-reinforcing stall that looked like a deadlock. */
function isBehindSelf(selfPose: Pose2D, otherPose: Pose2D): boolean {
  const forwardX = Math.sin(selfPose.headingRad);
  const forwardZ = Math.cos(selfPose.headingRad);
  const dot = (otherPose.x - selfPose.x) * forwardX + (otherPose.z - selfPose.z) * forwardZ;
  if (dot >= 0) return false;
  // Only a genuine "trailing, same-direction" vehicle is exempt from this
  // vehicle's own hazard checks (see doc above) — a vehicle positioned
  // behind self but heading in a substantially different direction is NOT
  // simply following and can still be closing in on a real collision
  // course (e.g. right after self completes a turn onto a two-way street,
  // an oncoming vehicle approaching from the direction self just came from
  // sits "behind" self's new heading, but it is a genuine hazard, not a
  // trailing follower). Require the other vehicle to be heading roughly
  // the same way (within 90 degrees) before exempting it as solely the
  // trailing vehicle's own responsibility.
  const headingDiffRad = normalizeAngleRad(otherPose.headingRad - selfPose.headingRad);
  return Math.abs(headingDiffRad) < Math.PI / 2;
}

/** Wrap an angle (radians) to (-PI, PI]. */
function normalizeAngleRad(angleRad: number): number {
  let a = angleRad % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Interpolate from angle `a` to angle `b` by fraction `t`, taking the
 * shorter angular path (so a car turning from heading 170° to -170° rotates
 * through 180° rather than spinning the long way around). */
function lerpAngleRad(a: number, b: number, t: number): number {
  return a + normalizeAngleRad(b - a) * t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ease-in/ease-out curve (0 at t=0, 1 at t=1, zero slope at both ends) used
 * to make the corner blend accelerate into and decelerate out of the turn
 * rather than moving at a constant rate. */
function smoothstep01(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Unit vector pointing to the right of travel for a given heading, using
 * the same atan2(dx, dz) convention as `poseOnEdge`/`Car.tsx` (heading h
 * implies a forward direction of (sin h, cos h), so right-of-travel is
 * (-cos h, sin h)). */
function rightVectorForHeading(headingRad: number): { x: number; z: number } {
  return { x: -Math.cos(headingRad), z: Math.sin(headingRad) };
}

/** Interpolate a pose (position + heading), unoffset, `distanceOnEdgeM`
 * meters along the directed edge from `fromNodeId` to `toNodeId`. */
function centerlinePoseOnEdge(network: RoadNetwork, fromNodeId: string, toNodeId: string, distanceOnEdgeM: number): Pose2D {
  const from = network.nodes[fromNodeId];
  const to = network.nodes[toNodeId];
  const edge = edgeBetween(network, fromNodeId, toNodeId);
  const t = edge.length === 0 ? 0 : distanceOnEdgeM / edge.length;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const x = from.x + dx * t;
  const z = from.z + dz * t;
  const headingRad = Math.atan2(dx, dz);
  return { x, z, headingRad };
}

/** Interpolate a pose (position + heading) `distanceOnEdgeM` meters along the
 * directed edge from `fromNodeId` to `toNodeId`, offset `lateralOffsetM`
 * meters to the right of the direction of travel (right-hand lane). */
export function poseOnEdge(
  network: RoadNetwork,
  fromNodeId: string,
  toNodeId: string,
  distanceOnEdgeM: number,
  lateralOffsetM = 0
): Pose2D {
  const base = centerlinePoseOnEdge(network, fromNodeId, toNodeId, distanceOnEdgeM);
  const right = rightVectorForHeading(base.headingRad);
  return { x: base.x + right.x * lateralOffsetM, z: base.z + right.z * lateralOffsetM, headingRad: base.headingRad };
}

/** Resolve the pose `aheadDistanceM` meters ahead of a vehicle's CURRENT
 * position (`distanceOnEdgeM` on the edge `fromNodeId -> toNodeId`).
 *
 * This is the single source of truth for "where will this vehicle's body
 * be at a given point along its future path", used identically by both the
 * rendered pose and the collision look-ahead sampling so the two can never
 * diverge:
 *  - While still short of the corner blend zone (or with no pending next
 *    edge chosen yet), it's simply the straight interpolation on the
 *    current edge.
 *  - Within `blendDistanceM` of the node (once `pendingToNodeId` is known),
 *    heading and the right-of-travel lane-offset direction are eased
 *    toward the next edge's values — but the underlying centerline point
 *    stays exactly the true position on the current edge (or, once
 *    `aheadDistanceM` carries past the edge end, on the pending edge) —
 *    so position itself is always physically continuous; only the facing
 *    direction and lateral offset rotate smoothly through the turn.
 *  - Beyond the current edge's end (if the projected distance overshoots
 *    it and a pending next edge is known), the projection continues onto
 *    that next edge. If no pending edge is known yet, the projection
 *    simply clamps at the edge end (matching pre-turn behavior).
 */
function resolvedPoseAheadM(
  network: RoadNetwork,
  vehicle: VehicleState,
  aheadDistanceM: number,
  laneOffsetM: number,
  blendDistanceM: number
): Pose2D {
  const edge = edgeBetween(network, vehicle.fromNodeId, vehicle.toNodeId);
  const projectedDistanceM = vehicle.distanceOnEdgeM + aheadDistanceM;

  if (projectedDistanceM > edge.length && vehicle.pendingToNodeId !== null) {
    // Fully past the intersection: continue straight onto the next edge.
    const nextEdge = edgeBetween(network, vehicle.toNodeId, vehicle.pendingToNodeId);
    const distanceIntoNextM = Math.min(projectedDistanceM - edge.length, nextEdge.length);
    return poseOnEdge(network, vehicle.toNodeId, vehicle.pendingToNodeId, distanceIntoNextM, laneOffsetM);
  }

  const clampedDistanceM = Math.min(projectedDistanceM, edge.length);
  const basePose = centerlinePoseOnEdge(network, vehicle.fromNodeId, vehicle.toNodeId, clampedDistanceM);
  const remainingAtPointM = edge.length - clampedDistanceM;

  if (vehicle.pendingToNodeId === null || remainingAtPointM > blendDistanceM) {
    const right = rightVectorForHeading(basePose.headingRad);
    return { x: basePose.x + right.x * laneOffsetM, z: basePose.z + right.z * laneOffsetM, headingRad: basePose.headingRad };
  }

  // Within the corner blend zone: interpolate the actual physical
  // right-hand-lane point between "current edge, own heading, offset" and
  // "next edge at distance 0, next heading, offset" — NOT the centerline
  // point with a rotating offset vector applied to it. Rotating the offset
  // vector at a fixed (stale) centerline location sweeps the lateral
  // position across the full lane width as heading rotates, which can
  // carry the car's rendered/collision position into the opposing lane or
  // off the road mid-turn. Interpolating between two points that are each
  // already correctly offset within their own lane instead traces a
  // bounded arc that stays within the road corridor, while still landing
  // exactly on the next edge's own lane point as the vehicle crosses the
  // node (both endpoints share the same node location, so no pop).
  const nextHeadingRad = centerlinePoseOnEdge(network, vehicle.toNodeId, vehicle.pendingToNodeId, 0).headingRad;
  const t = smoothstep01(1 - remainingAtPointM / blendDistanceM);
  const blendedHeadingRad = lerpAngleRad(basePose.headingRad, nextHeadingRad, t);
  const currentRight = rightVectorForHeading(basePose.headingRad);
  const nextRight = rightVectorForHeading(nextHeadingRad);
  const pointAx = basePose.x + currentRight.x * laneOffsetM;
  const pointAz = basePose.z + currentRight.z * laneOffsetM;
  const nodePose = network.nodes[vehicle.toNodeId];
  const pointBx = nodePose.x + nextRight.x * laneOffsetM;
  const pointBz = nodePose.z + nextRight.z * laneOffsetM;
  return {
    x: lerp(pointAx, pointBx, t),
    z: lerp(pointAz, pointBz, t),
    headingRad: blendedHeadingRad,
  };
}

/** The pose a vehicle is actually rendered at — simply the resolved pose
 * zero meters ahead of its current position. */
function vehicleRenderPose(network: RoadNetwork, vehicle: VehicleState, laneOffsetM: number, blendDistanceM: number): Pose2D {
  return resolvedPoseAheadM(network, vehicle, 0, laneOffsetM, blendDistanceM);
}

/** How much a vehicle should ease its speed down for the sharpness of its
 * upcoming turn (1 = no reduction / straight through, `MIN_TURN_SPEED_FACTOR`
 * = a tight ~90-degree-or-sharper turn), ramped in smoothly as the vehicle
 * approaches the corner via the same blend fraction used for heading. */
function turnSpeedFactor(network: RoadNetwork, vehicle: VehicleState, remainingM: number, effectiveBlendM: number): number {
  if (vehicle.pendingToNodeId === null || remainingM > effectiveBlendM) return 1;

  const currentHeadingRad = centerlinePoseOnEdge(network, vehicle.fromNodeId, vehicle.toNodeId, vehicle.distanceOnEdgeM).headingRad;
  const nextHeadingRad = centerlinePoseOnEdge(network, vehicle.toNodeId, vehicle.pendingToNodeId, 0).headingRad;
  const turnAngleRad = Math.abs(normalizeAngleRad(nextHeadingRad - currentHeadingRad));
  const sharpness = Math.min(1, turnAngleRad / (Math.PI / 2));
  const targetFactor = lerp(1, MIN_TURN_SPEED_FACTOR, sharpness);

  const t = smoothstep01(1 - remainingM / effectiveBlendM);
  return lerp(1, targetFactor, t);
}

interface SampledPath {
  poses: Pose2D[];
  /** Distance (meters) from the vehicle's current position to each sample,
   * assuming it continues at its current speed — used to translate a
   * detected conflict back into a required stopping distance. */
  aheadDistancesM: number[];
}

/** Sample `VEHICLE_PATH_SAMPLES + 1` poses (including the current one) along
 * `vehicle`'s look-ahead path over `config.lookAheadS`, built from the same
 * `resolvedPoseAheadM` projection used for rendering — so a turning
 * vehicle's collision path always matches where it will actually be drawn,
 * including projecting across the intersection onto its pending next edge
 * once look-ahead distance carries that far. */
function sampleLookAheadPath(
  network: RoadNetwork,
  vehicle: VehicleState,
  config: VehicleConfig,
  laneOffsetM: number,
  blendDistanceM: number
): SampledPath {
  const travelM = vehicle.speedMps * config.lookAheadS;

  const poses: Pose2D[] = [];
  const aheadDistancesM: number[] = [];
  for (let s = 0; s <= VEHICLE_PATH_SAMPLES; s++) {
    const aheadDistanceM = (travelM * s) / VEHICLE_PATH_SAMPLES;
    poses.push(resolvedPoseAheadM(network, vehicle, aheadDistanceM, laneOffsetM, blendDistanceM));
    aheadDistancesM.push(aheadDistanceM);
  }
  return { poses, aheadDistancesM };
}

/** Linearly extrapolate a pedestrian's position at each of the same
 * `VEHICLE_PATH_SAMPLES + 1` look-ahead times used for vehicle paths, so a
 * vehicle's path can be checked against the pedestrian's whole forecasted
 * short-term path rather than a single future point. */
function samplePedestrianPath(ped: PedestrianState, lookAheadS: number): { x: number; z: number }[] {
  const points: { x: number; z: number }[] = [];
  for (let s = 0; s <= VEHICLE_PATH_SAMPLES; s++) {
    const t = (s / VEHICLE_PATH_SAMPLES) * lookAheadS;
    points.push({ x: ped.x + ped.vx * t, z: ped.z + ped.vz * t });
  }
  return points;
}

interface ConflictResult {
  /** Worst (smallest) body-to-body clearance found anywhere along the
   * sampled path, in meters beyond `combinedRadiusM` — used for the
   * reported safety verdict. */
  marginM: number;
  /** Distance (meters) from the vehicle's current position to the nearest
   * sample point at which the margin drops below `safetyMarginM` —
   * Infinity if no such point exists. Used to derive a safe braking speed
   * that guarantees the vehicle can stop before reaching that point. */
  aheadDistanceM: number;
}

/** Check a vehicle's sampled look-ahead path against another path (either
 * another vehicle's sampled poses or a pedestrian's forecasted points). */
function evaluatePathConflict(
  selfPath: SampledPath,
  otherPoints: { x: number; z: number }[],
  combinedRadiusM: number,
  safetyMarginM: number
): ConflictResult {
  let marginM = Infinity;
  let aheadDistanceM = Infinity;

  for (let i = 0; i < selfPath.poses.length; i++) {
    const pose = selfPath.poses[i];
    let marginAtI = Infinity;
    for (const point of otherPoints) {
      const distance = Math.hypot(pose.x - point.x, pose.z - point.z);
      const candidateMargin = distance - combinedRadiusM;
      if (candidateMargin < marginAtI) marginAtI = candidateMargin;
    }
    if (marginAtI < marginM) marginM = marginAtI;
    if (marginAtI < safetyMarginM && selfPath.aheadDistancesM[i] < aheadDistanceM) {
      aheadDistanceM = selfPath.aheadDistancesM[i];
    }
  }

  return { marginM, aheadDistanceM };
}

/** Exact distance (meters) from a rectangular car body's center to its own
 * boundary, along the ray toward the vector (dx, dz) FROM the vehicle's
 * own position — i.e. how far the vehicle's real rectangular body (half-
 * length `halfLengthM` along its own heading, half-width `halfWidthM`
 * perpendicular to it) actually extends in that specific direction, using
 * the same atan2(dx,dz)-based heading convention as
 * `rightVectorForHeading`/`centerlinePoseOnEdge` (forward = (sin h, cos
 * h)). A ray from the rectangle's center exits through whichever face
 * (front/back or left/right) it reaches first, giving the true boundary
 * distance `min(halfLengthM / |cos(theta)|, halfWidthM / |sin(theta)|)`
 * where theta is the angle between the ray and the vehicle's forward axis.
 *
 * This smoothly interpolates between a vehicle's short profile (only its
 * half-width) when approached from directly beside it and its long
 * profile (its full half-length) when approached from directly ahead or
 * behind, matching how a real rectangular car body actually presents a
 * different apparent size depending on approach angle — unlike a single
 * fixed circular radius, which either drastically overestimates lateral
 * clearance (if sized to the length, causing vehicles in different/
 * oncoming lanes to falsely detect each other as "too close" and brake
 * for each other, sometimes both at once, until they lock up) or
 * underestimates longitudinal clearance (if sized to the width, letting
 * a vehicle following another too closely go undetected). An earlier
 * ellipse-shaped approximation (same two semi-axes) was tried here but
 * underestimates the true rectangle's extent at diagonal angles (an
 * elongated rectangle's corners reach further than an ellipse with the
 * same semi-axes), which let real body overlaps slip through undetected
 * during diagonal/crossing/turning encounters — this exact boundary-
 * distance formula does not have that gap. */
function directionalHalfExtentM(headingRad: number, dx: number, dz: number, halfLengthM: number, halfWidthM: number): number {
  const distance = Math.hypot(dx, dz);
  if (distance === 0) return halfLengthM;
  const forwardComponent = dx * Math.sin(headingRad) + dz * Math.cos(headingRad);
  const rightComponent = dx * Math.cos(headingRad) - dz * Math.sin(headingRad);
  const absCos = Math.abs(forwardComponent) / distance;
  const absSin = Math.abs(rightComponent) / distance;
  const tForward = absCos > 1e-9 ? halfLengthM / absCos : Infinity;
  const tRight = absSin > 1e-9 ? halfWidthM / absSin : Infinity;
  return Math.min(tForward, tRight);
}

/** Check a vehicle's sampled look-ahead path against another vehicle's
 * sampled look-ahead path, using each vehicle's actual heading at every
 * pair of sample points to compute a realistic, direction-aware combined
 * body clearance (see `directionalHalfExtentM`) instead of a single fixed
 * circular radius. This is what correctly distinguishes "two vehicles
 * closing in nose-to-tail in the same lane" (full combined length
 * required) from "two vehicles simply passing each other in adjacent or
 * oncoming lanes" (only their combined half-widths required) from
 * diagonal/crossing encounters at an intersection (something in between),
 * all from the same geometry rather than a same-lane-only special case. */
interface VehicleConflictResult extends ConflictResult {
  /** Worst (most negative) body clearance MINUS the direction-aware
   * required safety buffer (see `directionalSafetyMarginM`) found anywhere
   * along the sampled path — negative means a genuine conflict exists at
   * that point, taking into account that hazards ahead require a much
   * larger buffer than hazards directly alongside. This (not the raw
   * `marginM`) is what should gate whether this pair is actually treated
   * as unsafe. */
  violationMarginM: number;
}

/** Required safety buffer for a hazard positioned at (dx, dz) relative to a
 * vehicle heading `selfHeadingRad`, blended by approach angle exactly like
 * `directionalHalfExtentM` blends body size: `longitudinalMarginM` when the
 * hazard is directly ahead/behind (closing/following risk needs a big
 * stopping buffer), a reduced lateral margin when it's directly alongside
 * AND the other vehicle is traveling roughly parallel or oncoming (a real
 * same-time passing situation in an adjacent/oncoming lane only needs
 * modest lane-keeping clearance), and smoothly in between otherwise.
 *
 * The lateral relaxation is itself gated by how parallel the two vehicles'
 * headings are (`otherHeadingRad`): an instantaneous lateral bearing does
 * NOT mean a safe passing encounter when the other vehicle is heading
 * across this one's path at an angle (turning/crossing traffic at an
 * intersection) rather than driving in a parallel/oncoming lane — in that
 * case the current sideways-looking bearing is about to become a head-on
 * one as the paths converge, so the full longitudinal margin still
 * applies regardless of the bearing at this particular sample. Blending
 * the lateral margin back up toward the longitudinal one as headings
 * diverge from parallel/anti-parallel prevents relaxing the buffer for
 * genuine crossing/turning conflicts (which a purely bearing-based blend
 * let slip through as real body overlaps). */
function directionalSafetyMarginM(
  selfHeadingRad: number,
  otherHeadingRad: number,
  dx: number,
  dz: number,
  longitudinalMarginM: number,
  lateralMarginM: number
): number {
  const headingDiff = otherHeadingRad - selfHeadingRad;
  const parallelness = Math.abs(Math.cos(headingDiff)); // 1 = same/opposite direction, 0 = perpendicular/crossing
  const effectiveLateralMarginM = lateralMarginM + (longitudinalMarginM - lateralMarginM) * (1 - parallelness);
  return directionalHalfExtentM(selfHeadingRad, dx, dz, longitudinalMarginM, effectiveLateralMarginM);
}

function evaluateVehicleVehicleConflict(
  selfPath: SampledPath,
  otherPath: SampledPath,
  halfLengthM: number,
  halfWidthM: number,
  longitudinalMarginM: number,
  lateralMarginM: number
): VehicleConflictResult {
  let marginM = Infinity;
  let violationMarginM = Infinity;
  let aheadDistanceM = Infinity;

  for (let i = 0; i < selfPath.poses.length; i++) {
    const selfPose = selfPath.poses[i];
    let marginAtI = Infinity;
    let violationAtI = Infinity;
    for (const otherPose of otherPath.poses) {
      const dx = otherPose.x - selfPose.x;
      const dz = otherPose.z - selfPose.z;
      const distance = Math.hypot(dx, dz);
      const selfExtentM = directionalHalfExtentM(selfPose.headingRad, dx, dz, halfLengthM, halfWidthM);
      const otherExtentM = directionalHalfExtentM(otherPose.headingRad, -dx, -dz, halfLengthM, halfWidthM);
      const candidateMargin = distance - selfExtentM - otherExtentM;
      if (candidateMargin < marginAtI) marginAtI = candidateMargin;

      const requiredMarginM = directionalSafetyMarginM(selfPose.headingRad, otherPose.headingRad, dx, dz, longitudinalMarginM, lateralMarginM);
      const candidateViolation = candidateMargin - requiredMarginM;
      if (candidateViolation < violationAtI) violationAtI = candidateViolation;
    }
    if (marginAtI < marginM) marginM = marginAtI;
    if (violationAtI < violationMarginM) violationMarginM = violationAtI;
    if (violationAtI < 0 && selfPath.aheadDistancesM[i] < aheadDistanceM) {
      aheadDistanceM = selfPath.aheadDistancesM[i];
    }
  }

  return { marginM, violationMarginM, aheadDistanceM };
}

/** Create a fleet of `count` vehicles, each starting on a random edge of the
 * road network, colored distinctly for visual identification. */
export function createVehicleFleet(
  network: RoadNetwork,
  count: number,
  config: VehicleConfig,
  rand: () => number
): VehicleState[] {
  const nodeIds = Object.keys(network.nodes);
  const vehicles: VehicleState[] = [];

  for (let i = 0; i < count; i++) {
    const fromNodeId = nodeIds[Math.floor(rand() * nodeIds.length)];
    const neighbors = network.adjacency[fromNodeId];
    const toNodeId = neighbors[Math.floor(rand() * neighbors.length)];
    const edge = edgeBetween(network, fromNodeId, toNodeId);

    vehicles.push({
      id: `car-${i + 1}`,
      color: FLEET_COLORS[i % FLEET_COLORS.length],
      fromNodeId,
      toNodeId,
      distanceOnEdgeM: rand() * edge.length,
      speedMps: config.cruiseSpeedMps,
      pendingToNodeId: null,
    });
  }

  return vehicles;
}

/** Advance the entire vehicle fleet by `deltaS` seconds.
 *
 * For each vehicle: computes a look-ahead path (offset into its right-hand
 * lane, and projected across the intersection onto its pending next edge
 * once in range), checks it against (a) every pedestrian's forecasted
 * short-term path and (b) every other vehicle's sampled look-ahead path in
 * world space — this covers same-lane following, oncoming traffic, and
 * cross-traffic converging on a shared intersection, since it does not
 * depend on both vehicles sharing the same directed edge, and now also
 * catches conflicts that only appear once a turning vehicle's path is
 * projected into its new lane. Vehicles always yield to pedestrians. For
 * vehicle-vehicle conflicts, the vehicle estimated to arrive LATER at the
 * end of its current road segment (by time, not raw distance, so speed
 * differences are respected) yields — the other continues at cruise speed
 * — so a first-arriving vehicle at an intersection is never forced to stop
 * for later traffic. As an unconditional safety net, a vehicle also always
 * responds if it is already closer than the safety margin to another
 * vehicle right now, regardless of arrival-time priority, so a
 * mis-attributed right-of-way (or two vehicles that already ended up too
 * close) can never result in continued acceleration into the other.
 *
 * A yielding vehicle's speed is capped at a physically-derived safe speed
 * limit (`sqrt(2 * maxDecelMps2 * distanceToHazardM)`) — the fastest it
 * could be going right now and still stop, at `maxDecelMps2`, before
 * reaching the point along its path where it would violate the safety
 * margin. Approaching an intersection, a vehicle also pre-selects its next
 * road segment once within `CORNER_BLEND_DISTANCE_M` of the node and eases
 * both its rendered heading/lane-offset direction and its speed toward
 * that next segment, so turns look like a rounded arc rather than an
 * instant pivot, with sharper turns slowing the vehicle down more. Its
 * centerline position always advances strictly from `distanceOnEdgeM`, so
 * it never teleports. Speed changes are themselves bounded by
 * `maxDecelMps2` / `maxAccelMps2` per frame, so braking is both fast
 * enough to react and physically consistent.
 */
export function stepFleet(
  network: RoadNetwork,
  vehicles: VehicleState[],
  pedestrians: PedestrianState[],
  vehicleConfig: VehicleConfig,
  roadWidth: number,
  deltaS: number,
  rand: () => number
): FleetStepResult {
  const laneOffsetM = roadWidth * LANE_OFFSET_FRACTION;
  const remainingDistancesM = vehicles.map((v) => remainingEdgeDistanceM(network, v));
  const arrivalTimesS = vehicles.map((v, i) => estimatedArrivalTimeS(remainingDistancesM[i], v.speedMps));
  const effectiveBlendDistancesM = vehicles.map((v) => {
    const edge = edgeBetween(network, v.fromNodeId, v.toNodeId);
    return Math.min(CORNER_BLEND_DISTANCE_M, edge.length * 0.45);
  });

  // How far before an intersection a vehicle commits to (and can "see")
  // its next road segment for COLLISION purposes — deliberately much
  // larger than the short visual blend distance above. Using only the
  // visual blend distance here would mean a vehicle cruising at full speed
  // only discovers a hazard already sitting on the road it's about to turn
  // onto with barely enough room left to physically stop (e.g. at 8 m/s,
  // ~5.3m of stopping distance is needed but the 6m blend zone left almost
  // no buffer) — a discontinuous "surprise" reveal that caused vehicles to
  // overlap already-stopped traffic just past a corner. Selecting the
  // pending edge as soon as it comes within the vehicle's full look-ahead
  // reach (speed * lookAheadS) gives it the same reaction horizon across an
  // intersection as it already has in a straight line.
  const pendingSelectionDistancesM = vehicles.map((v, i) =>
    Math.max(effectiveBlendDistancesM[i], v.speedMps * vehicleConfig.lookAheadS)
  );

  // Pre-select each vehicle's next road segment once within that horizon
  // (kept stable thereafter, no re-randomizing), BEFORE building look-ahead
  // paths, so collision sampling and rendering both see the same pending
  // edge for this frame. The short visual turn-blend (heading/lane-offset
  // easing) still only activates within CORNER_BLEND_DISTANCE_M regardless
  // of when pendingToNodeId itself was set (see resolvedPoseAheadM), so
  // this earlier reveal only affects hazard visibility, not turn visuals.
  const vehiclesWithPending: VehicleState[] = vehicles.map((v, i) => {
    if (v.pendingToNodeId !== null || remainingDistancesM[i] > pendingSelectionDistancesM[i]) return v;
    return { ...v, pendingToNodeId: pickNextNode(network, v.toNodeId, v.fromNodeId, rand) };
  });

  const lookAheadPaths: SampledPath[] = vehiclesWithPending.map((v, i) =>
    sampleLookAheadPath(network, v, vehicleConfig, laneOffsetM, effectiveBlendDistancesM[i])
  );
  const pedestrianPaths = pedestrians.map((ped) => samplePedestrianPath(ped, vehicleConfig.lookAheadS));
  const poses: Pose2D[] = [];
  const verdicts: SafetyResult[] = [];
  const nextVehicles: VehicleState[] = [];

  vehiclesWithPending.forEach((vehicle, index) => {
    const edge = edgeBetween(network, vehicle.fromNodeId, vehicle.toNodeId);
    const remainingM = remainingDistancesM[index];
    const effectiveBlendM = effectiveBlendDistancesM[index];

    const selfPath = lookAheadPaths[index];
    const lookAheadPose = selfPath.poses[selfPath.poses.length - 1];
    const renderPose = vehicleRenderPose(network, vehicle, laneOffsetM, effectiveBlendM);
    poses.push(renderPose);

    let minMarginM = Infinity;
    let cause: SafetyResult["cause"] = null;
    let conflictId: string | null = null;
    // Nearest point (meters ahead, along this vehicle's own path) at which
    // ANY hazard this vehicle must respect would violate the safety
    // margin — drives the physically-grounded braking limit below,
    // independent of which hazard has the numerically worst margin.
    let nearestHazardDistanceM = Infinity;
    // Set true whenever a hazard this vehicle must respond to actually
    // violates its required safety buffer (direction-aware for other
    // vehicles, flat for pedestrians) — drives `isSafe` directly instead of
    // comparing the raw display-only `minMarginM` against a single flat
    // threshold at the end.
    let hasUnsafeConflict = false;

    // Pedestrians always have the right of way — no priority contest. The
    // combined radius accounts for the vehicle's own body (approximated as
    // a circle of radius vehicleLengthM / 2, consistent with how
    // vehicle-vehicle conflicts already treat vehicle size below) PLUS the
    // pedestrian's radius — not just the pedestrian's radius alone, which
    // would measure clearance from the pedestrian to the car's center
    // point rather than its body edge and could let the car's actual body
    // pass through/over a "safe" pedestrian.
    const vehicleBodyRadiusM = vehicleConfig.vehicleLengthM / 2;
    pedestrians.forEach((ped, pedIndex) => {
      const result = evaluatePathConflict(
        selfPath,
        pedestrianPaths[pedIndex],
        vehicleBodyRadiusM + PEDESTRIAN_RADIUS_M,
        vehicleConfig.safetyMarginM
      );
      if (result.marginM < minMarginM) {
        minMarginM = result.marginM;
        cause = "pedestrian";
        conflictId = ped.id;
      }
      if (result.marginM < vehicleConfig.safetyMarginM) hasUnsafeConflict = true;
      if (result.aheadDistanceM < nearestHazardDistanceM) nearestHazardDistanceM = result.aheadDistanceM;
    });

    // Vehicle-vehicle conflicts (same-lane following, intersection
    // cross-traffic, and turning paths projected across the intersection
    // alike): only the vehicle that must yield brakes for a given pair, so
    // the first-arriving vehicle always continues through. As an
    // unconditional safety net on top of that arbitration, a vehicle ALSO
    // always responds to another vehicle it is already closer to than the
    // safety margin RIGHT NOW (immediate clearance, ignoring arrival-time
    // priority) — this guarantees that even if right-of-way was
    // mis-attributed (e.g. due to a sudden speed change) or two vehicles
    // already ended up too close, neither one can keep accelerating into
    // the other; at least one of them braking is always sufficient to
    // prevent the gap from shrinking further, and using immediate (not
    // look-ahead) clearance means both sides of a close pair detect it.
    for (let j = 0; j < vehiclesWithPending.length; j++) {
      if (j === index) continue;
      const other = vehiclesWithPending[j];

      // Only manage collisions ahead of this vehicle or to the side
      // (crossing/intersection traffic) — never behind. See isBehindSelf.
      if (isBehindSelf(selfPath.poses[0], lookAheadPaths[j].poses[0])) continue;

      const sameLaneAhead =
        (vehicle.fromNodeId === other.fromNodeId && vehicle.toNodeId === other.toNodeId) ||
        (vehicle.toNodeId === other.fromNodeId && vehicle.pendingToNodeId === other.toNodeId);
      const longitudinalMarginM = sameLaneAhead ? vehicleConfig.safetyMarginM + FOLLOWING_EXTRA_MARGIN_M : vehicleConfig.safetyMarginM;

      // Direction-aware combined body clearance (see
      // `directionalHalfExtentM`): naturally resolves to close to the full
      // combined vehicle length when the other vehicle is nose-to-tail
      // ahead (same-lane following), close to just the combined half-width
      // when it's directly alongside (adjacent/oncoming lane traffic), and
      // smoothly in between for diagonal/crossing encounters at an
      // intersection — instead of a same-lane-only binary switch, so
      // vehicles legitimately passing each other in different lanes are no
      // longer falsely flagged as "too close" to each other. On top of
      // that, the REQUIRED safety buffer itself is also direction-aware
      // (`directionalSafetyMarginM`/`violationMarginM`): a hazard directly
      // ahead needs the full longitudinal margin, but one merely alongside
      // in another lane only needs a small lateral margin, so real (but
      // safe) passing clearance no longer reads as a violation.
      const halfLengthM = vehicleConfig.vehicleLengthM / 2;
      const result = evaluateVehicleVehicleConflict(
        selfPath,
        lookAheadPaths[j],
        halfLengthM,
        VEHICLE_HALF_WIDTH_M,
        longitudinalMarginM,
        LATERAL_SAFETY_MARGIN_M
      );
      if (result.violationMarginM >= 0) continue; // no conflict anywhere along the path

      const nowSelfPose = selfPath.poses[0];
      const nowOtherPose = lookAheadPaths[j].poses[0];
      const nowDx = nowOtherPose.x - nowSelfPose.x;
      const nowDz = nowOtherPose.z - nowSelfPose.z;
      const nowCombinedRadiusM =
        directionalHalfExtentM(nowSelfPose.headingRad, nowDx, nowDz, halfLengthM, VEHICLE_HALF_WIDTH_M) +
        directionalHalfExtentM(nowOtherPose.headingRad, -nowDx, -nowDz, halfLengthM, VEHICLE_HALF_WIDTH_M);
      const immediateMarginM = Math.hypot(nowDx, nowDz) - nowCombinedRadiusM;
      const nowRequiredMarginM = directionalSafetyMarginM(
        nowSelfPose.headingRad,
        nowOtherPose.headingRad,
        nowDx,
        nowDz,
        longitudinalMarginM,
        LATERAL_SAFETY_MARGIN_M
      );
      const alreadyTooClose = immediateMarginM < nowRequiredMarginM;
      // `alreadyTooClose` must never independently override the
      // antisymmetric arrival-time priority decision below: if it did,
      // BOTH vehicles in a pair could simultaneously measure themselves as
      // "already too close" (the check is inherently evaluated from both
      // sides at once) and each would force itself into an unconditional
      // brake-now stop — freezing both of them in place forever (each
      // waiting on the other) instead of exactly one of them braking as
      // intended. Instead, treat it purely as a reinforcement of whichever
      // side `mustYieldTo` already decided must yield: that side gets an
      // immediate hard stop (zero effective distance) rather than trusting
      // gradual look-ahead braking, while the side with genuine arrival
      // priority is never forced to yield just because of proximity.
      const selfMustYieldByPriority = mustYieldTo(arrivalTimesS[index], arrivalTimesS[j], vehicle.id, vehiclesWithPending[j].id);
      const shouldHonorAlreadyTooClose = alreadyTooClose && selfMustYieldByPriority;

      // Arrival-time priority is meant to break ties between vehicles on
      // CROSSING paths (who goes first through a shared point) — it is not
      // meaningful for plain same-lane following, where the trailing
      // vehicle can never have "priority" to drive through the one ahead
      // of it regardless of an unrelated arrival-time metric. Detected via
      // `sameLaneAhead` above (other vehicle is directly ahead on the same
      // edge, or on the edge this vehicle is about to turn onto) and always
      // responded to.

      const mustYield = shouldHonorAlreadyTooClose || sameLaneAhead || selfMustYieldByPriority;
      if (!mustYield) continue; // this vehicle has priority for this pair

      if (result.marginM < minMarginM) {
        minMarginM = result.marginM;
        cause = "vehicle";
        conflictId = vehiclesWithPending[j].id;
      }
      hasUnsafeConflict = true;
      // Already too close right now -> brake as if the hazard were at zero
      // distance ahead (full stop this frame), instead of trusting the
      // look-ahead sample spacing to have caught it. `result.aheadDistanceM`
      // already reflects the direction-aware required margin (see above),
      // so no further adjustment needed here.
      const effectiveAheadDistanceM = shouldHonorAlreadyTooClose ? 0 : result.aheadDistanceM;
      if (effectiveAheadDistanceM < nearestHazardDistanceM) nearestHazardDistanceM = effectiveAheadDistanceM;
    }

    if (minMarginM === Infinity) {
      minMarginM = vehicleConfig.safetyMarginM * 2; // no relevant hazard nearby
    }

    // `isSafe` is driven by an explicit flag rather than comparing `minMarginM`
    // (a raw, undirected body-clearance number kept only for display/
    // debugging) against a single flat threshold — vehicle-vehicle hazards
    // are gated by the direction-aware `violationMarginM` above, which a
    // flat comparison here would otherwise contradict for legitimate
    // different-lane passing (real clearance can be under `safetyMarginM`
    // while still being perfectly safe alongside another lane).
    const isSafe = !hasUnsafeConflict;
    verdicts.push({ vehicleId: vehicle.id, isSafe, minMarginM, cause, conflictId, lookAheadPose });

    // Physically-grounded safe speed limit: the fastest this vehicle could
    // be going right now and still stop (at maxDecelMps2) before reaching
    // the nearest point along its path that would violate the safety
    // margin. No hazard within the look-ahead horizon -> no limit beyond
    // cruise speed.
    const hazardSpeedLimitMps =
      nearestHazardDistanceM === Infinity
        ? vehicleConfig.cruiseSpeedMps
        : Math.min(vehicleConfig.cruiseSpeedMps, Math.sqrt(2 * vehicleConfig.maxDecelMps2 * nearestHazardDistanceM));

    // Ease speed down for sharper upcoming turns, like a real driver
    // slowing into a corner rather than taking it at cruise speed.
    const turnFactor = turnSpeedFactor(network, vehicle, remainingM, effectiveBlendM);
    const speedLimitMps = Math.min(hazardSpeedLimitMps, vehicleConfig.cruiseSpeedMps * turnFactor);

    // Move speed toward the limit, but never change it faster than the
    // vehicle's real acceleration/deceleration bounds allow.
    const speedMps =
      vehicle.speedMps > speedLimitMps
        ? Math.max(speedLimitMps, vehicle.speedMps - vehicleConfig.maxDecelMps2 * deltaS)
        : Math.min(speedLimitMps, vehicle.speedMps + vehicleConfig.maxAccelMps2 * deltaS);

    let distanceOnEdgeM = vehicle.distanceOnEdgeM + speedMps * deltaS;
    let fromNodeId = vehicle.fromNodeId;
    let toNodeId = vehicle.toNodeId;
    let pendingToNodeId = vehicle.pendingToNodeId;

    if (distanceOnEdgeM >= edge.length) {
      distanceOnEdgeM -= edge.length;
      const arrivedNodeId = toNodeId;
      const newNext = pendingToNodeId ?? pickNextNode(network, arrivedNodeId, fromNodeId, rand);
      fromNodeId = arrivedNodeId;
      toNodeId = newNext;
      pendingToNodeId = null;
    }

    nextVehicles.push({ id: vehicle.id, color: vehicle.color, fromNodeId, toNodeId, distanceOnEdgeM, speedMps, pendingToNodeId });
  });

  return { vehicles: nextVehicles, poses, verdicts };
}
