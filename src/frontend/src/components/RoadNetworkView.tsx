import { useMemo } from "react";
import * as THREE from "three";
import type { RoadNetwork } from "../city/cityLayout";
import { ROAD_TILE_LENGTH_M, getRoadSurfaceTexture } from "../city/roadTextures";

interface RoadNetworkViewProps {
  network: RoadNetwork;
  roadWidth: number;
  sidewalkWidth: number;
}

// Layer heights (meters above the ground plane at y=0), spaced with a wide
// enough margin to avoid z-fighting flicker between coplanar meshes at this
// scene's scale (see also the Canvas's logarithmicDepthBuffer in
// CityScene.tsx). Node (intersection) layers sit clearly above their
// segment counterparts so the intersection patches unambiguously win the
// depth test where the two overlap, instead of two near-coincident planes
// fighting for the same pixel every frame.
const SEGMENT_SIDEWALK_Y = 0.05;
const NODE_SIDEWALK_Y = 0.07;
const SEGMENT_ROAD_Y = 0.12;
const NODE_ROAD_Y = 0.14;

interface RoadSurfacePlaneProps {
  length: number;
  roadWidth: number;
}

/** A single road segment's driving surface: the shared, cached lane-marking
 * texture (yellow dashed center line + white edge lines) cloned and tiled
 * to this segment's exact length so the two-way road divider reads clearly
 * regardless of block size. */
function RoadSurfacePlane({ length, roadWidth }: RoadSurfacePlaneProps) {
  const material = useMemo(() => {
    const texture = getRoadSurfaceTexture(roadWidth).clone();
    texture.needsUpdate = true;
    texture.repeat.set(1, length / ROAD_TILE_LENGTH_M);
    return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 });
  }, [length, roadWidth]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEGMENT_ROAD_Y, 0]} receiveShadow material={material}>
      <planeGeometry args={[roadWidth, length]} />
    </mesh>
  );
}

/**
 * Renders the full street grid (multiple intersections) as two-way road
 * segments — asphalt with a yellow dashed center divider and white lane-edge
 * lines — plus sidewalk strips underneath, and a plain intersection patch at
 * every node so perpendicular roads and sidewalks join cleanly.
 */
export default function RoadNetworkView({ network, roadWidth, sidewalkWidth }: RoadNetworkViewProps) {
  const segments = useMemo(
    () =>
      network.edges.map((edge) => {
        const a = network.nodes[edge.a];
        const b = network.nodes[edge.b];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const yawRad = Math.atan2(dx, dz);
        const midX = (a.x + b.x) / 2;
        const midZ = (a.z + b.z) / 2;
        return { id: edge.id, length: edge.length, yawRad, midX, midZ };
      }),
    [network]
  );

  const nodes = useMemo(() => Object.values(network.nodes), [network]);
  const intersectionSize = roadWidth + sidewalkWidth * 2;

  return (
    <group>
      {segments.map((seg) => (
        <group key={seg.id} position={[seg.midX, 0, seg.midZ]} rotation={[0, seg.yawRad, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEGMENT_SIDEWALK_Y, 0]} receiveShadow>
            <planeGeometry args={[roadWidth + sidewalkWidth * 2, seg.length]} />
            <meshStandardMaterial color="#cbc7bd" />
          </mesh>
          <RoadSurfacePlane length={seg.length} roadWidth={roadWidth} />
        </group>
      ))}
      {nodes.map((node) => (
        <group key={node.id} position={[node.x, 0, node.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, NODE_SIDEWALK_Y, 0]} receiveShadow>
            <planeGeometry args={[intersectionSize, intersectionSize]} />
            <meshStandardMaterial color="#cbc7bd" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, NODE_ROAD_Y, 0]} receiveShadow>
            <planeGeometry args={[roadWidth, roadWidth]} />
            <meshStandardMaterial color="#3a3a3f" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
