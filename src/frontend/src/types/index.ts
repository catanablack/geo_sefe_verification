/** Shared TypeScript types mirroring the backend's `src/api/schemas.py` DTOs. */

export interface Waypoint {
  x: number;
  y: number;
  headingRad: number;
  timestampS: number;
  velocityMps: number;
}

export type VehicleClass = "robotaxi" | "trucking" | "last_mile_delivery";

export interface Trajectory {
  trajectoryId: string;
  waypoints: Waypoint[];
  vehicleClass: VehicleClass;
}

export interface SafetyVerdict {
  trajectoryId: string;
  isSafe: boolean;
  minSafetyMarginM: number;
  violationTimestampS: number | null;
  evidenceRef: string | null;
}

export interface AgentForecast {
  agentId: string;
  predictedPositions: { x: number; y: number; headingRad: number }[];
  horizonS: number;
  confidence: number;
}

/** A single downsampled occupancy voxel, as streamed over /telemetry for rendering. */
export interface OccupiedVoxel {
  x: number;
  y: number;
  z: number;
  occupancy: number; // [0, 1]
  uncertainty: number; // [0, 1]
}

/** One frame pushed over the /telemetry WebSocket, consumed by SceneViewer3D. */
export interface TelemetryFrame {
  timestampS: number;
  resolutionM: number;
  occupiedVoxels: OccupiedVoxel[];
  activeTrajectory: Trajectory | null;
  verdict: SafetyVerdict | null;
  agentForecasts: AgentForecast[];
}

/** Response shape for POST /verify, mirroring `src/api/schemas.py::VerifyResponse`. */
export interface VerifyResponse {
  verdict: SafetyVerdict;
  alternatives: Trajectory[];
}

/** Response shape for POST /simulate, mirroring `src/api/schemas.py::SimulationRunResponse`. */
export interface SimulationRunResponse {
  totalScenarios: number;
  accuracy: number;
  meanLatencyMs: number;
  p99LatencyMs: number;
  arbitrationSuccessRate: number;
}
