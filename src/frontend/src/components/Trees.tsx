import type { RoadPoint } from "../city/cityLayout";

interface TreesProps {
  positions: RoadPoint[];
}

/** Simple cone-and-trunk trees scattered along sidewalks for small-town scenery. */
export default function Trees({ positions }: TreesProps) {
  return (
    <group>
      {positions.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.2, 1.2, 6]} />
            <meshStandardMaterial color="#6b4423" />
          </mesh>
          <mesh position={[0, 1.7, 0]} castShadow>
            <coneGeometry args={[1.1, 2.4, 8]} />
            <meshStandardMaterial color="#2f6b3a" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
