import { useMemo, useRef } from "react";
import { InstancedMesh, Object3D, Color } from "three";
import { useFrame } from "@react-three/fiber";
import type { OccupiedVoxel } from "../types";

interface OccupancyGridLayerProps {
  voxels: OccupiedVoxel[];
  resolutionM: number;
}

/**
 * Renders the probabilistic occupancy grid as instanced boxes, colored by
 * occupancy probability (opacity) and uncertainty (hue), matching the
 * `VoxelGrid` produced by `src/spatial_fusion`.
 */
export default function OccupancyGridLayer({ voxels, resolutionM }: OccupancyGridLayerProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    voxels.forEach((voxel, i) => {
      dummy.position.set(voxel.x, voxel.z, voxel.y); // Y-up in three.js
      dummy.scale.setScalar(resolutionM);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const color = new Color().setHSL(0.6 - voxel.uncertainty * 0.6, 1, 0.5);
      mesh.setColorAt(i, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, voxels.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial transparent opacity={0.6} />
    </instancedMesh>
  );
}
