/**
 * Procedural generation of a small-town layout: a grid road network with
 * multiple intersections, subdivided building lots (small-town scale, with
 * a modest "downtown" cluster near the center), sidewalks, trees, and
 * streetlights. Deterministic (seeded) so the layout is stable across
 * re-renders.
 */

export interface RoadNode {
  id: string;
  x: number;
  z: number;
}

export interface RoadEdge {
  id: string;
  a: string; // node id
  b: string; // node id
  length: number;
}

/** Grid graph of the town's streets: nodes are intersections, edges are
 * road segments between adjacent intersections. */
export interface RoadNetwork {
  nodes: Record<string, RoadNode>;
  edges: RoadEdge[];
  adjacency: Record<string, string[]>; // nodeId -> neighbor nodeIds
}

/** Approximate hue/saturation/lightness ranges for a real-world building
 * exterior material (brick, stucco, concrete, glass, etc.), used instead
 * of a fully random hue so the skyline reads as plausible architecture
 * rather than an arbitrary rainbow. `modern` materials (glass/steel
 * curtain walls, slate) are weighted toward taller downtown towers;
 * `traditional` materials (brick, stucco, brownstone, siding) are weighted
 * toward the lower-rise outskirts. */
interface BuildingMaterialFamily {
  hueMin: number;
  hueMax: number;
  satMin: number;
  satMax: number;
  lightMin: number;
  lightMax: number;
  modern: boolean;
}

const BUILDING_MATERIAL_FAMILIES: BuildingMaterialFamily[] = [
  { hueMin: 8, hueMax: 22, satMin: 35, satMax: 55, lightMin: 28, lightMax: 42, modern: false }, // red/brown brick
  { hueMin: 30, hueMax: 45, satMin: 15, satMax: 30, lightMin: 55, lightMax: 72, modern: false }, // beige/tan stucco
  { hueMin: 30, hueMax: 45, satMin: 4, satMax: 12, lightMin: 50, lightMax: 68, modern: false }, // warm gray concrete
  { hueMin: 40, hueMax: 52, satMin: 12, satMax: 22, lightMin: 75, lightMax: 88, modern: false }, // cream/off-white siding
  { hueMin: 20, hueMax: 30, satMin: 25, satMax: 40, lightMin: 22, lightMax: 34, modern: false }, // brownstone
  { hueMin: 200, hueMax: 215, satMin: 8, satMax: 18, lightMin: 42, lightMax: 58, modern: true }, // steel/glass curtain wall
  { hueMin: 195, hueMax: 205, satMin: 20, satMax: 35, lightMin: 45, lightMax: 60, modern: true }, // blue-tinted glass
  { hueMin: 210, hueMax: 220, satMin: 5, satMax: 10, lightMin: 30, lightMax: 45, modern: true }, // slate gray
];

/** Pick a material family for one building, weighting modern (glass/steel)
 * materials more heavily downtown and traditional materials (brick,
 * stucco, brownstone) more heavily elsewhere, so tall towers tend to look
 * glassy and the surrounding low-rise blocks look brick-and-stucco. */
function pickBuildingMaterialFamily(isDowntown: boolean, rand: () => number): BuildingMaterialFamily {
  const modernFamilies = BUILDING_MATERIAL_FAMILIES.filter((f) => f.modern);
  const traditionalFamilies = BUILDING_MATERIAL_FAMILIES.filter((f) => !f.modern);
  const preferModern = isDowntown ? rand() < 0.65 : rand() < 0.15;
  const pool = preferModern ? modernFamilies : traditionalFamilies;
  return pool[Math.floor(rand() * pool.length)];
}

export interface Building {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: string;
}

/** A generic 2D ground-plane point, used for prop placement (trees, lights)
 * and for the pedestrian crossing position. */
export interface RoadPoint {
  x: number;
  z: number;
}

export interface CityLayout {
  network: RoadNetwork;
  buildings: Building[];
  trees: RoadPoint[];
  streetlights: RoadPoint[];
  /** Sidewalk-centerline points pedestrians wander between (see
   * sim/pedestrians.ts), including waypoints along both sides of every
   * edge and at every intersection corner so pedestrians can cross streets. */
  pedestrianWaypoints: RoadPoint[];
  roadWidth: number;
  sidewalkWidth: number;
  blockSize: number;
  citySpan: number;
}

export interface CityConfig {
  /** Number of intersection rows/columns; (rows-1) x (cols-1) blocks result. */
  rows?: number;
  cols?: number;
  blockSize?: number;
  roadWidth?: number;
  sidewalkWidth?: number;
  seed?: number;
}

/** Small deterministic PRNG (mulberry32) so the layout/fleet are stable per seed. */
export function createSeededRandom(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildNetwork(rows: number, cols: number, cell: number, offsetX: number, offsetZ: number): RoadNetwork {
  const nodes: Record<string, RoadNode> = {};
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const id = `${i}_${j}`;
      nodes[id] = { id, x: j * cell - offsetX, z: i * cell - offsetZ };
    }
  }

  const edges: RoadEdge[] = [];
  const adjacency: Record<string, string[]> = {};
  const addEdge = (aId: string, bId: string) => {
    const a = nodes[aId];
    const b = nodes[bId];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    edges.push({ id: `${aId}-${bId}`, a: aId, b: bId, length });
    (adjacency[aId] ??= []).push(bId);
    (adjacency[bId] ??= []).push(aId);
  };

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const id = `${i}_${j}`;
      if (j < cols - 1) addEdge(id, `${i}_${j + 1}`);
      if (i < rows - 1) addEdge(id, `${i + 1}_${j}`);
    }
  }

  return { nodes, edges, adjacency };
}

function generateBuildings(
  rows: number,
  cols: number,
  cell: number,
  offsetX: number,
  offsetZ: number,
  blockSize: number,
  roadWidth: number,
  rand: () => number
): Building[] {
  const buildings: Building[] = [];
  const centerI = (rows - 2) / 2;
  const centerJ = (cols - 2) / 2;

  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const x0 = j * cell - offsetX + roadWidth / 2;
      const z0 = i * cell - offsetZ + roadWidth / 2;
      const lot = blockSize / 2;
      const isDowntown = Math.abs(i - centerI) < 1 && Math.abs(j - centerJ) < 1;

      for (let li = 0; li < 2; li++) {
        for (let lj = 0; lj < 2; lj++) {
          const margin = lot * (0.1 + rand() * 0.08);
          const width = lot - margin * 2;
          const depth = lot - margin * 2;
          const height = isDowntown ? 10 + rand() * 22 : 4 + rand() * 8;
          const bx = x0 + lj * lot + lot / 2;
          const bz = z0 + li * lot + lot / 2;
          // Building color drawn from a curated real-world material family
          // (brick, stucco, concrete, brownstone, glass/steel) rather than a
          // fully random hue, so the skyline reads as plausible architecture
          // instead of an arbitrary rainbow — see BUILDING_MATERIAL_FAMILIES.
          const family = pickBuildingMaterialFamily(isDowntown, rand);
          const hue = family.hueMin + rand() * (family.hueMax - family.hueMin);
          const saturation = family.satMin + rand() * (family.satMax - family.satMin);
          const lightness = family.lightMin + rand() * (family.lightMax - family.lightMin);

          buildings.push({
            id: `bldg-${i}-${j}-${li}-${lj}`,
            x: bx,
            z: bz,
            width,
            depth,
            height,
            color: `hsl(${hue.toFixed(1)}, ${saturation.toFixed(1)}%, ${lightness.toFixed(1)}%)`,
          });
        }
      }
    }
  }

  return buildings;
}

function generateTrees(network: RoadNetwork, roadWidth: number, sidewalkWidth: number, rand: () => number): RoadPoint[] {
  const trees: RoadPoint[] = [];
  const offsetAmount = roadWidth / 2 + sidewalkWidth + 1.2;
  const spacingM = 9;
  const marginM = 4;

  for (const edge of network.edges) {
    const a = network.nodes[edge.a];
    const b = network.nodes[edge.b];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = edge.length || 1;
    const dirX = dx / len;
    const dirZ = dz / len;
    const perpX = -dirZ;
    const perpZ = dirX;

    let travelled = marginM;
    let side = 1;
    while (travelled < len - marginM) {
      if (rand() > 0.35) {
        const px = a.x + dirX * travelled + perpX * offsetAmount * side;
        const pz = a.z + dirZ * travelled + perpZ * offsetAmount * side;
        trees.push({ x: px, z: pz });
      }
      side *= -1;
      travelled += spacingM;
    }
  }

  return trees;
}

function generateStreetlights(network: RoadNetwork, roadWidth: number): RoadPoint[] {
  const offset = roadWidth / 2 + 0.6;
  return Object.values(network.nodes).map((node) => ({ x: node.x + offset, z: node.z + offset }));
}

/** Walkable points along the sidewalk centerline on both sides of every
 * edge (regularly spaced, no random dropout so pedestrians always have a
 * dense enough set of nearby targets to wander between), plus four corner
 * points at every intersection so pedestrians naturally cross streets when
 * wandering from one side's waypoints to the other's. */
function generateSidewalkWaypoints(network: RoadNetwork, roadWidth: number, sidewalkWidth: number): RoadPoint[] {
  const waypoints: RoadPoint[] = [];
  const offsetAmount = roadWidth / 2 + sidewalkWidth / 2;
  const spacingM = 6;

  for (const edge of network.edges) {
    const a = network.nodes[edge.a];
    const b = network.nodes[edge.b];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = edge.length || 1;
    const dirX = dx / len;
    const dirZ = dz / len;
    const perpX = -dirZ;
    const perpZ = dirX;

    const steps = Math.max(1, Math.round(len / spacingM));
    for (let s = 1; s < steps; s++) {
      const travelled = (len * s) / steps;
      for (const side of [1, -1]) {
        const px = a.x + dirX * travelled + perpX * offsetAmount * side;
        const pz = a.z + dirZ * travelled + perpZ * offsetAmount * side;
        waypoints.push({ x: px, z: pz });
      }
    }
  }

  const cornerOffset = offsetAmount + roadWidth / 2;
  for (const node of Object.values(network.nodes)) {
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        waypoints.push({ x: node.x + cornerOffset * sx, z: node.z + cornerOffset * sz });
      }
    }
  }

  return waypoints;
}

export function generateCityLayout(config: CityConfig = {}): CityLayout {
  const { rows = 4, cols = 4, blockSize = 20, roadWidth = 7, sidewalkWidth = 1.6, seed = 42 } = config;
  const rand = createSeededRandom(seed);
  const cell = blockSize + roadWidth;
  const offsetX = ((cols - 1) * cell) / 2;
  const offsetZ = ((rows - 1) * cell) / 2;

  const network = buildNetwork(rows, cols, cell, offsetX, offsetZ);
  const buildings = generateBuildings(rows, cols, cell, offsetX, offsetZ, blockSize, roadWidth, rand);
  const trees = generateTrees(network, roadWidth, sidewalkWidth, rand);
  const streetlights = generateStreetlights(network, roadWidth);
  const pedestrianWaypoints = generateSidewalkWaypoints(network, roadWidth, sidewalkWidth);

  const citySpan = Math.max((cols - 1) * cell, (rows - 1) * cell) + blockSize;

  return {
    network,
    buildings,
    trees,
    streetlights,
    pedestrianWaypoints,
    roadWidth,
    sidewalkWidth,
    blockSize,
    citySpan,
  };
}

