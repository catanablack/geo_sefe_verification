import type { SimulationRunResponse, TelemetryFrame, Trajectory, VerifyResponse } from "../types";

const API_BASE = ""; // proxied via vite.config.ts in dev; same-origin in production

/** POST a candidate trajectory to the backend verification engine. */
export async function verifyTrajectory(
  trajectory: Trajectory,
  minMarginM?: number
): Promise<VerifyResponse> {
  const res = await fetch(`${API_BASE}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trajectory, min_margin_m: minMarginM }),
  });
  if (!res.ok) {
    throw new Error(`verifyTrajectory failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Trigger a simulation harness benchmark run. */
export async function runSimulation(
  scenarioSet: "public_benchmark" | "procedural" | "edge_cases",
  numScenarios = 100
): Promise<SimulationRunResponse> {
  const res = await fetch(`${API_BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario_set: scenarioSet, num_scenarios: numScenarios }),
  });
  if (!res.ok) {
    throw new Error(`runSimulation failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Open a live telemetry WebSocket, invoking `onFrame` for each streamed frame. */
export function subscribeTelemetry(onFrame: (frame: TelemetryFrame) => void): () => void {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/telemetry/stream`);

  socket.onmessage = (event) => {
    const frame: TelemetryFrame = JSON.parse(event.data);
    onFrame(frame);
  };

  return () => socket.close();
}
