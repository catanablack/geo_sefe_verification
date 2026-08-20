import type { Pose2D } from "../sim/simulation";

interface CarProps {
  pose: Pose2D;
  baseColor: string;
  isSafe: boolean;
}

/**
 * Simple boxes-and-cylinders car mesh. Authored facing local +Z; heading is
 * measured as atan2(dx, dz) so `rotation-y = pose.headingRad` aligns the
 * car's front with its direction of travel along the road network. Each
 * vehicle keeps its own fleet color while safe, and turns red while braking
 * for a safety-margin violation.
 */
export default function Car({ pose, baseColor, isSafe }: CarProps) {
  const bodyColor = isSafe ? baseColor : "#dc2626";

  return (
    <group position={[pose.x, 0, pose.z]} rotation={[0, pose.headingRad, 0]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.8, 0.7, 4.2]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      <mesh position={[0, 1.05, -0.2]} castShadow>
        <boxGeometry args={[1.5, 0.5, 2]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      {[
        [-0.9, 0.35, 1.4],
        [0.9, 0.35, 1.4],
        [-0.9, 0.35, -1.4],
        [0.9, 0.35, -1.4],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.35, 0.35, 0.3, 16]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
      ))}
    </group>
  );
}
