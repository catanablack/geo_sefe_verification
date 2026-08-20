import type { Pose2D } from "../sim/simulation";

interface PedestrianAgentProps {
  pose: Pose2D;
  color: string;
}

/** Abstract but recognizably human-shaped marker for one wandering
 * pedestrian, oriented to face its current walking direction: a rounded
 * head, a tapered torso, and two simple leg stubs, so pedestrians read
 * clearly as "a person" rather than a generic capsule/pill shape. */
export default function PedestrianAgent({ pose, color }: PedestrianAgentProps) {
  return (
    <group position={[pose.x, 0, pose.z]} rotation={[0, pose.headingRad, 0]}>
      {/* Head */}
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshStandardMaterial color="#f1c27d" />
      </mesh>
      {/* Torso */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.65, 4, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.11, 0.35, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.55, 4, 6]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0.11, 0.35, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.55, 4, 6]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
    </group>
  );
}
