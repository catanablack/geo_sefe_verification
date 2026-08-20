import { Line } from "@react-three/drei";
import { Vector3 } from "three";

interface ConflictHighlightProps {
  from: { x: number; z: number };
  to: { x: number; z: number };
}

/**
 * Draws a bright connecting line from a braking vehicle to whichever
 * pedestrian or vehicle its `SafetyResult.conflictId` identifies as the
 * actual cause, plus a small ring marker around that object — so when a
 * car's `SafetyAura` turns red, it's immediately obvious which specific
 * object is responsible rather than just "something nearby".
 */
export default function ConflictHighlight({ from, to }: ConflictHighlightProps) {
  const points = [new Vector3(from.x, 0.6, from.z), new Vector3(to.x, 0.6, to.z)];
  return (
    <>
      <Line points={points} color="#ef4444" lineWidth={2} transparent opacity={0.7} />
      <group position={[to.x, 0.6, to.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[0.85, 1.05, 32]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.95} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
