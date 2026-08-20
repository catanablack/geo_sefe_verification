import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Vector3 } from "three";
import type { SafetyVerdict, Trajectory } from "../types";

interface TrajectoryOverlayProps {
  trajectory: Trajectory | null;
  verdict: SafetyVerdict | null;
}

/**
 * Renders the active candidate/verified trajectory as a 3D polyline, colored
 * green when `verdict.isSafe` is true and red otherwise — the visual
 * counterpart of `SafetyVerdict` from `verification_engine`.
 */
export default function TrajectoryOverlay({ trajectory, verdict }: TrajectoryOverlayProps) {
  const points = useMemo(() => {
    if (!trajectory) return [];
    return trajectory.waypoints.map((wp) => new Vector3(wp.x, 0.1, wp.y));
  }, [trajectory]);

  if (points.length < 2) return null;

  const color = verdict?.isSafe === false ? "red" : "limegreen";

  return <Line points={points} color={color} lineWidth={3} />;
}
