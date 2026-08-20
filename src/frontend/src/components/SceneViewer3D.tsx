import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import OccupancyGridLayer from "./OccupancyGridLayer";
import TrajectoryOverlay from "./TrajectoryOverlay";
import type { TelemetryFrame } from "../types";

interface SceneViewer3DProps {
  frame: TelemetryFrame | null;
}

/**
 * Root Three.js scene (via react-three-fiber). Renders the voxel occupancy
 * grid, the active/verified trajectory, and dynamic-agent forecasts streamed
 * from the backend's /telemetry WebSocket.
 */
export default function SceneViewer3D({ frame }: SceneViewer3DProps) {
  return (
    <Canvas camera={{ position: [20, 20, 20], fov: 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />
      <gridHelper args={[100, 100]} />
      {frame && (
        <>
          <OccupancyGridLayer voxels={frame.occupiedVoxels} resolutionM={frame.resolutionM} />
          <TrajectoryOverlay trajectory={frame.activeTrajectory} verdict={frame.verdict} />
        </>
      )}
      <OrbitControls />
    </Canvas>
  );
}
