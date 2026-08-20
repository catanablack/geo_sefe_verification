import type { SafetyResult } from "../sim/simulation";
import type { FleetMetricsSnapshot } from "../sim/metrics";

interface SimStatusPanelProps {
  verdicts: SafetyResult[] | null;
  colors: string[];
  metrics: FleetMetricsSnapshot | null;
}

const PANEL_BG = "#0b0f14";
const CARD_BG = "#12181f";
const BORDER = "#1f2937";
const TEXT_MUTED = "#8b95a1";
const SAFE_COLOR = "#22c55e";
const WARN_COLOR = "#f59e0b";
const DANGER_COLOR = "#ef4444";

function formatS(s: number): string {
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

interface MetricCardProps {
  label: string;
  value: string;
  sublabel?: string;
  accent?: string;
}

function MetricCard({ label, value, sublabel, accent }: MetricCardProps) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: "10px 12px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase", color: TEXT_MUTED, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ?? "#e5e7eb", lineHeight: 1.1 }}>{value}</div>
      {sublabel && <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>{sublabel}</div>}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: TEXT_MUTED,
        margin: "18px 0 8px",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Professional-style safety-verification dashboard: a simplified,
 * client-side stand-in for the reporting a real deployment of the
 * Geometric Collision-Safety Verification Engine + Constraint-Aware
 * Trajectory Arbitration Module (see PROJECT_PLAN.md secs 3 & 4) would
 * surface — verification throughput/latency, live and worst-case safety
 * margins, near-miss/incident counts, and a conflict-cause breakdown — on
 * top of the original per-vehicle margin table.
 */
export default function SimStatusPanel({ verdicts, colors, metrics }: SimStatusPanelProps) {
  if (!verdicts || !metrics) {
    return (
      <div style={{ padding: 16, background: PANEL_BG, height: "100%" }}>
        <div style={{ color: TEXT_MUTED }}>Initializing verification engine…</div>
      </div>
    );
  }

  const unsafeCount = verdicts.filter((v) => !v.isSafe).length;
  const overallStatus = unsafeCount === 0 ? "safe" : "arbitrating";
  const statusColor = overallStatus === "safe" ? SAFE_COLOR : WARN_COLOR;

  return (
    <div style={{ padding: 16, background: PANEL_BG, minHeight: "100%", boxSizing: "border-box" }}>
      <div>
        <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: TEXT_MUTED }}>
          Geometric Safety Verification Platform — PoC
        </div>
        <h2 style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 700 }}>Live Fleet Safety Verification</h2>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: CARD_BG,
          border: `1px solid ${statusColor}55`,
          borderRadius: 8,
          padding: "10px 12px",
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            background: statusColor,
            boxShadow: `0 0 8px ${statusColor}`,
            flexShrink: 0,
          }}
        />
        <div style={{ fontWeight: 700, fontSize: 13, color: statusColor }}>
          {overallStatus === "safe"
            ? "ALL TRAJECTORIES VERIFIED SAFE"
            : `${unsafeCount} VEHICLE${unsafeCount > 1 ? "S" : ""} UNDER ARBITRATION`}
        </div>
      </div>

      <SectionHeading>Verification Performance</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <MetricCard label="Latency (avg)" value={`${metrics.avgLatencyMs.toFixed(2)} ms`} sublabel={`last: ${metrics.lastLatencyMs.toFixed(2)} ms`} />
        <MetricCard label="Throughput" value={`${metrics.throughputHz.toFixed(0)} Hz`} sublabel="verification cycles/sec" />
        <MetricCard label="Session Time" value={formatS(metrics.elapsedSimS)} sublabel={`${metrics.totalFrames.toLocaleString()} cycles`} />
        <MetricCard label="Fleet Size" value={`${metrics.fleetSize}`} sublabel={`${metrics.currentAvgSpeedMps.toFixed(1)} m/s avg speed`} />
      </div>

      <SectionHeading>Safety Margins</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <MetricCard
          label="Current Min Margin"
          value={`${metrics.currentMinMarginM.toFixed(2)} m`}
          accent={metrics.currentMinMarginM < 1 ? DANGER_COLOR : metrics.currentMinMarginM < 2.5 ? WARN_COLOR : SAFE_COLOR}
        />
        <MetricCard
          label="Worst Margin (session)"
          value={`${metrics.worstMarginEverM.toFixed(2)} m`}
          accent={metrics.worstMarginEverM < 1 ? DANGER_COLOR : metrics.worstMarginEverM < 2.5 ? WARN_COLOR : SAFE_COLOR}
        />
        <MetricCard label="Average Margin" value={`${metrics.currentAvgMarginM.toFixed(2)} m`} />
        <MetricCard
          label="Near-Miss Events"
          value={`${metrics.nearMissEvents}`}
          sublabel="cycles with margin < 1.0 m"
          accent={metrics.nearMissEvents > 0 ? WARN_COLOR : SAFE_COLOR}
        />
      </div>

      <SectionHeading>Arbitration Activity</SectionHeading>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <MetricCard label="Active Braking" value={`${metrics.activeBrakingCount}`} sublabel="vehicles now" />
        <MetricCard
          label="Conflict Cause (pedestrian / vehicle)"
          value={`${metrics.pedestrianConflictFrames.toLocaleString()} / ${metrics.vehicleConflictFrames.toLocaleString()}`}
          sublabel="cumulative cycles"
        />
      </div>

      <SectionHeading>Per-Vehicle Verdicts</SectionHeading>
      <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: TEXT_MUTED }}>
            <th style={{ paddingBottom: 6, fontWeight: 600 }}>Vehicle</th>
            <th style={{ paddingBottom: 6, fontWeight: 600 }}>Margin</th>
            <th style={{ paddingBottom: 6, fontWeight: 600 }}>Conflict</th>
          </tr>
        </thead>
        <tbody>
          {verdicts.map((v, i) => (
            <tr key={v.vehicleId} style={{ borderTop: `1px solid ${BORDER}` }}>
              <td style={{ padding: "6px 0" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 9,
                    height: 9,
                    borderRadius: 4.5,
                    background: colors[i],
                    marginRight: 7,
                  }}
                />
                {v.vehicleId}
              </td>
              <td style={{ color: v.isSafe ? SAFE_COLOR : DANGER_COLOR, fontWeight: 600 }}>{v.minMarginM.toFixed(1)} m</td>
              <td style={{ color: TEXT_MUTED }}>{v.conflictId ? `vs ${v.conflictId}` : v.cause ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: 11, lineHeight: 1.5, color: TEXT_MUTED, marginTop: 16 }}>
        Client-side approximation of the Geometric Collision-Safety Verification
        Engine and Constraint-Aware Trajectory Arbitration Module: each vehicle
        independently checks a look-ahead safety margin against every wandering
        pedestrian's forecasted path and every other vehicle's projected path
        (following, oncoming, and intersection cross-traffic), arbitrating
        speed on violation. Latency/throughput figures reflect this
        simplified in-browser check, not the production swept-volume/SDF
        engine's real-time performance budget.
      </p>
    </div>
  );
}
