import { useMemo } from "react";
import * as THREE from "three";
import type { Building } from "../city/cityLayout";
import { getWindowStyleTexture } from "../city/buildingTextures";

interface BuildingMeshProps {
  building: Building;
  styleIndex: number;
}

const ROOF_COLOR = "#565b63";
const PLINTH_COLOR = "#4b4640";

/**
 * A single building: textured walls (procedural window-tile pattern tinted
 * by the building's own color), a slate parapet roof cap, a dark plinth at
 * street level, and an occasional rooftop utility unit for skyline variety.
 */
export default function BuildingMesh({ building, styleIndex }: BuildingMeshProps) {
  // Deterministic per-building material variation (glossiness/roughness),
  // derived from the building's id so it's stable across re-renders without
  // needing an extra RNG draw or a data-model change — a subset of
  // buildings read as smoother/more reflective "glass tower" facades while
  // most stay matte, adding material variety on top of the randomized color.
  const materialHash = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < building.id.length; i++) hash = (hash * 31 + building.id.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }, [building.id]);
  const isGlossy = materialHash % 100 < 25;
  const roughness = isGlossy ? 0.25 + ((materialHash % 20) / 100) : 0.75 + ((materialHash % 20) / 100);
  const metalness = isGlossy ? 0.35 + ((materialHash % 15) / 100) : 0.02 + ((materialHash % 6) / 100);

  const wallMaterial = useMemo(() => {
    const baseTexture = getWindowStyleTexture(styleIndex);
    const texture = baseTexture.clone();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const columns = Math.max(1, Math.round(building.width / 2.6));
    const rows = Math.max(1, Math.round(building.height / 3.2));
    texture.repeat.set(columns, rows);
    texture.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
      map: texture,
      color: building.color,
      roughness,
      metalness,
    });
  }, [building.color, building.width, building.height, styleIndex, roughness, metalness]);

  const sideMaterials = useMemo(() => {
    const capMaterial = new THREE.MeshStandardMaterial({ color: building.color, roughness: 0.85 });
    // Box face order: [+x, -x, +y (top), -y (bottom), +z, -z]. Only the four
    // side faces get the window texture; top/bottom reuse a plain material
    // since the top is covered by the parapet cap mesh and the bottom is
    // never visible.
    return [wallMaterial, wallMaterial, capMaterial, capMaterial, wallMaterial, wallMaterial];
  }, [wallMaterial, building.color]);

  const hasRooftopUnit = useMemo(() => {
    // Deterministic pseudo-random flag derived from the building id so it
    // stays stable across re-renders without needing an extra RNG draw.
    let hash = 0;
    for (let i = 0; i < building.id.length; i++) hash = (hash * 31 + building.id.charCodeAt(i)) | 0;
    return Math.abs(hash) % 100 < 30;
  }, [building.id]);

  return (
    <group position={[building.x, 0, building.z]}>
      {/* plinth / foundation */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[building.width + 0.3, 0.6, building.depth + 0.3]} />
        <meshStandardMaterial color={PLINTH_COLOR} roughness={0.9} />
      </mesh>

      {/* main tower — side faces use the window-tile material via a
          per-face material array; top/bottom reuse a plain material. */}
      <mesh position={[0, building.height / 2, 0]} castShadow receiveShadow material={sideMaterials}>
        <boxGeometry args={[building.width, building.height, building.depth]} />
      </mesh>

      {/* parapet roof cap */}
      <mesh position={[0, building.height + 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[building.width + 0.4, 0.4, building.depth + 0.4]} />
        <meshStandardMaterial color={ROOF_COLOR} roughness={0.7} />
      </mesh>

      {hasRooftopUnit && (
        <mesh position={[building.width * 0.15, building.height + 0.8, building.depth * 0.1]} castShadow>
          <boxGeometry args={[Math.min(2.5, building.width * 0.3), 0.8, Math.min(2.5, building.depth * 0.3)]} />
          <meshStandardMaterial color="#8a8f96" roughness={0.6} metalness={0.2} />
        </mesh>
      )}
    </group>
  );
}
