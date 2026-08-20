interface SafetyAuraProps {
  x: number;
  z: number;
  radiusM: number;
  isSafe: boolean;
}

/**
 * Flat, ground-projected translucent disc + ring drawn around each vehicle
 * representing its safety-margin "sensing" zone — a simplified, honest
 * stand-in for the real look-ahead PATH clearance the verification engine
 * actually checks (see `evaluateVehicleVehicleConflict`/`evaluatePathConflict`
 * in sim/simulation.ts, which sample along the vehicle's forecasted path
 * rather than a static circle around its current position). Drawn here as
 * a simple radius centered on the vehicle purely to make the safety buffer
 * *perceptible* at a glance: green/translucent while every hazard is
 * outside the margin, brighter red once something has violated it (paired
 * with `ConflictHighlight`, which calls out exactly what).
 */
export default function SafetyAura({ x, z, radiusM, isSafe }: SafetyAuraProps) {
  const color = isSafe ? "#22c55e" : "#ef4444";
  return (
    <group position={[x, 0.6, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <circleGeometry args={[radiusM, 48]} />
        <meshBasicMaterial color={color} transparent opacity={isSafe ? 0.05 : 0.13} depthWrite={false} />
      </mesh>
      <mesh>
        <ringGeometry args={[radiusM - 0.1, radiusM, 48]} />
        <meshBasicMaterial color={color} transparent opacity={isSafe ? 0.4 : 0.85} depthWrite={false} />
      </mesh>
    </group>
  );
}
