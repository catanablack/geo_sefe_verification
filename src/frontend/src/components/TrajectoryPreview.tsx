import { Line } from "@react-three/drei";
import { Vector3 } from "three";
import type { RoadPoint } from "../city/cityLayout";

interface TrajectoryPreviewProps {
  from: RoadPoint;
  to: RoadPoint;
  isSafe: boolean;
}

/**
 * Draws the car's look-ahead segment (current position -> forecasted
 * position), colored green/red by the client-side safety check — the
 * visual analog of `SafetyVerdict` from the verification engine.
 */
export default function TrajectoryPreview({ from, to, isSafe }: TrajectoryPreviewProps) {
  const points = [new Vector3(from.x, 0.4, from.z), new Vector3(to.x, 0.4, to.z)];
  return <Line points={points} color={isSafe ? "#22c55e" : "#ef4444"} lineWidth={4} />;
}
