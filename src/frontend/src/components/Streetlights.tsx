import type { RoadPoint } from "../city/cityLayout";

interface StreetlightsProps {
  positions: RoadPoint[];
}

/** Simple pole-and-lamp streetlights placed at intersection corners. */
export default function Streetlights({ positions }: StreetlightsProps) {
  return (
    <group>
      {positions.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, 2.2, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 4.4, 8]} />
            <meshStandardMaterial color="#333333" />
          </mesh>
          <mesh position={[0, 4.5, 0]}>
            <sphereGeometry args={[0.2, 12, 12]} />
            <meshStandardMaterial color="#fff2c0" emissive="#fff2c0" emissiveIntensity={1.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
