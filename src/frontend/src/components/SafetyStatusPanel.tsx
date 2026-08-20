import type { TelemetryFrame } from "../types";

interface SafetyStatusPanelProps {
  frame: TelemetryFrame | null;
}

/**
 * 2D dashboard panel summarizing the current `SafetyVerdict`, minimum
 * safety margin, and active dynamic-agent forecast count, alongside the
 * 3D scene rendered by `SceneViewer3D`.
 */
export default function SafetyStatusPanel({ frame }: SafetyStatusPanelProps) {
  if (!frame) {
    return <div>Waiting for telemetry…</div>;
  }

  const { verdict, agentForecasts } = frame;

  return (
    <div>
      <h2>Safety Status</h2>
      {verdict ? (
        <>
          <p style={{ color: verdict.isSafe ? "limegreen" : "red", fontWeight: "bold" }}>
            {verdict.isSafe ? "VERIFIED SAFE" : "VERIFICATION FAILED"}
          </p>
          <p>Trajectory: {verdict.trajectoryId}</p>
          <p>Min safety margin: {verdict.minSafetyMarginM.toFixed(2)} m</p>
          {verdict.violationTimestampS !== null && (
            <p>Violation at t = {verdict.violationTimestampS.toFixed(2)} s</p>
          )}
        </>
      ) : (
        <p>No active verdict.</p>
      )}
      <h3>Forecasted Agents ({agentForecasts.length})</h3>
      <ul>
        {agentForecasts.map((agent) => (
          <li key={agent.agentId}>
            {agent.agentId} — confidence {(agent.confidence * 100).toFixed(0)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
