import CityScene from "./components/CityScene";

/**
 * Minimal PoC: a car driving through a small procedurally generated city,
 * with a simplified client-side safety-verification check (pedestrian
 * crossing) standing in for the full verification_engine / trajectory_
 * arbitration modules described in PROJECT_PLAN.md. Live backend telemetry
 * integration (src/api, src/services/apiClient.ts, SceneViewer3D) remains
 * available for wiring up once those modules are implemented.
 */
export default function App() {
  return <CityScene />;
}

