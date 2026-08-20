/**
 * Headless stress test for the client-side fleet simulation (sim/simulation.ts
 * + sim/pedestrians.ts). Replays the exact same modules and seeds used by
 * CityScene.tsx for many simulated seconds, and flags any frame where two
 * vehicles' or a vehicle/pedestrian's TRUE rendered positions (not the
 * look-ahead forecast) come closer than their combined physical radius —
 * i.e. an actual body-to-body collision, as opposed to a safety-margin
 * verdict. Run with: npx tsx scripts/simulationStressTest.ts
 */
import { createSeededRandom, generateCityLayout } from "../src/city/cityLayout";
import { createVehicleFleet, stepFleet, DEFAULT_VEHICLE_CONFIG, type Pose2D } from "../src/sim/simulation";
import { createPedestrians, stepPedestrians, DEFAULT_PEDESTRIAN_WALK_CONFIG } from "../src/sim/pedestrians";

const VEHICLE_COUNT = 5;
const PEDESTRIAN_COUNT = 14;
const SIM_SECONDS = 600; // 10 simulated minutes
const DELTA_S = 1 / 30; // matches a 30fps frame budget, clamped like the app does

const PEDESTRIAN_RADIUS_M = 0.6; // rough pedestrian body radius
// Real car mesh half-extents from Car.tsx's boxGeometry ([1.8, 0.7, 4.2]) —
// used for an accurate oriented-rectangle overlap check (SAT) rather than a
// circular approximation, since a circle of radius = half-length would
// falsely flag two vehicles that are simply side-by-side in adjacent/
// opposing lanes (laterally separated, not actually overlapping) as
// colliding.
const VEHICLE_HALF_LENGTH_M = 2.1;
const VEHICLE_HALF_WIDTH_M = 0.9;

/** Shortest distance from a point to an oriented rectangle (car body),
 * computed by transforming the point into the rectangle's local frame,
 * clamping to the half-extents, and measuring the distance back to the
 * original point. More accurate than a circle approximation, since a
 * pedestrian directly ahead/behind the car (along its long axis) is much
 * farther from the body than one directly beside it (along its short axis). */
function distancePointToOrientedRect(
  point: { x: number; z: number },
  rectCenter: { x: number; z: number },
  heading: number,
  halfLengthM: number,
  halfWidthM: number
): number {
  const dx = point.x - rectCenter.x;
  const dz = point.z - rectCenter.z;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  // Project into local (forward, right) frame.
  const localForward = dx * fx + dz * fz;
  const localRight = dx * rx + dz * rz;
  const clampedForward = Math.max(-halfLengthM, Math.min(halfLengthM, localForward));
  const clampedRight = Math.max(-halfWidthM, Math.min(halfWidthM, localRight));
  const closestX = rectCenter.x + fx * clampedForward + rx * clampedRight;
  const closestZ = rectCenter.z + fz * clampedForward + rz * clampedRight;
  return Math.hypot(point.x - closestX, point.z - closestZ);
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Separating Axis Theorem overlap test for two oriented rectangles
 * (car bodies), each defined by a center, heading (radians, atan2(dx,dz)
 * convention: forward = (sin h, cos h)), half-length, and half-width.
 * Returns true if the rectangles overlap (an actual body collision). */
function orientedRectanglesOverlap(
  centerA: { x: number; z: number },
  headingA: number,
  centerB: { x: number; z: number },
  headingB: number,
  halfLengthM: number,
  halfWidthM: number
): boolean {
  // Each rectangle's local axes in world space: forward (length axis) and
  // right (width axis).
  const axes = [
    { x: Math.sin(headingA), z: Math.cos(headingA) }, // A forward
    { x: Math.cos(headingA), z: -Math.sin(headingA) }, // A right
    { x: Math.sin(headingB), z: Math.cos(headingB) }, // B forward
    { x: Math.cos(headingB), z: -Math.sin(headingB) }, // B right
  ];

  const cornersFor = (center: { x: number; z: number }, heading: number) => {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    const corners: { x: number; z: number }[] = [];
    for (const sl of [1, -1]) {
      for (const sw of [1, -1]) {
        corners.push({
          x: center.x + fx * halfLengthM * sl + rx * halfWidthM * sw,
          z: center.z + fz * halfLengthM * sl + rz * halfWidthM * sw,
        });
      }
    }
    return corners;
  };

  const cornersA = cornersFor(centerA, headingA);
  const cornersB = cornersFor(centerB, headingB);

  for (const axis of axes) {
    const projA = cornersA.map((c) => c.x * axis.x + c.z * axis.z);
    const projB = cornersB.map((c) => c.x * axis.x + c.z * axis.z);
    const minA = Math.min(...projA);
    const maxA = Math.max(...projA);
    const minB = Math.min(...projB);
    const maxB = Math.max(...projB);
    if (maxA < minB || maxB < minA) return false; // separating axis found -> no overlap
  }
  return true; // no separating axis on any tested axis -> overlap
}

interface CollisionEvent {
  tSeconds: number;
  kind: "vehicle-vehicle" | "vehicle-pedestrian";
  aId: string;
  bId: string;
  distanceM: number;
  requiredM: number;
}

function runOnce(layoutSeed: number, vehicleSeed: number, pedestrianSeed: number, simRandSeed: number) {
  const layout = generateCityLayout({ rows: 4, cols: 4, seed: layoutSeed });
  const network = layout.network;
  const roadWidth = layout.roadWidth;

  let vehicles = createVehicleFleet(network, VEHICLE_COUNT, DEFAULT_VEHICLE_CONFIG, createSeededRandom(vehicleSeed));
  let pedestrians = createPedestrians(
    layout.pedestrianWaypoints,
    PEDESTRIAN_COUNT,
    DEFAULT_PEDESTRIAN_WALK_CONFIG,
    createSeededRandom(pedestrianSeed)
  );
  const simRand = createSeededRandom(simRandSeed);

  const collisions: CollisionEvent[] = [];
  const steps = Math.round(SIM_SECONDS / DELTA_S);

  let poses: Pose2D[] = [];

  for (let step = 0; step < steps; step++) {
    const tSeconds = step * DELTA_S;

    pedestrians = stepPedestrians(pedestrians, layout.pedestrianWaypoints, DEFAULT_PEDESTRIAN_WALK_CONFIG, DELTA_S, simRand, poses);
    const result = stepFleet(network, vehicles, pedestrians, DEFAULT_VEHICLE_CONFIG, roadWidth, DELTA_S, simRand);
    vehicles = result.vehicles;
    poses = result.poses;

    // Vehicle-vehicle: accurate oriented-rectangle (SAT) overlap check using
    // real car body dimensions and each car's actual heading — avoids
    // false positives from cars that are simply side-by-side in adjacent/
    // opposing lanes (laterally separated but not actually touching).
    for (let i = 0; i < poses.length; i++) {
      for (let j = i + 1; j < poses.length; j++) {
        const overlap = orientedRectanglesOverlap(
          poses[i],
          poses[i].headingRad,
          poses[j],
          poses[j].headingRad,
          VEHICLE_HALF_LENGTH_M,
          VEHICLE_HALF_WIDTH_M
        );
        if (overlap) {
          collisions.push({
            tSeconds,
            kind: "vehicle-vehicle",
            aId: vehicles[i].id,
            bId: vehicles[j].id,
            distanceM: distance(poses[i], poses[j]),
            requiredM: 0,
          });
        }
      }
    }

    // Vehicle-pedestrian: distance from the pedestrian point to the car's
    // actual oriented rectangular body (not just its center), so a
    // pedestrian ahead/behind the car (long axis) isn't flagged the same
    // as one directly beside it (short axis).
    for (let i = 0; i < poses.length; i++) {
      for (const ped of pedestrians) {
        const d = distancePointToOrientedRect(ped, poses[i], poses[i].headingRad, VEHICLE_HALF_LENGTH_M, VEHICLE_HALF_WIDTH_M);
        const required = PEDESTRIAN_RADIUS_M;
        if (d < required) {
          collisions.push({
            tSeconds,
            kind: "vehicle-pedestrian",
            aId: vehicles[i].id,
            bId: ped.id,
            distanceM: d,
            requiredM: required,
          });
        }
      }
    }
  }

  return collisions;
}

function summarize(label: string, collisions: CollisionEvent[]) {
  console.log(`\n=== ${label}: ${collisions.length} collision frame(s) ===`);
  if (collisions.length === 0) return;

  // De-duplicate consecutive frames for the same pair into "incidents".
  const incidents: { kind: string; pair: string; startS: number; endS: number; minDistanceM: number }[] = [];
  const openByPair = new Map<string, (typeof incidents)[number]>();

  for (const c of collisions) {
    const pairKey = `${c.kind}:${[c.aId, c.bId].sort().join("|")}`;
    const open = openByPair.get(pairKey);
    if (open && c.tSeconds - open.endS <= DELTA_S * 3) {
      open.endS = c.tSeconds;
      open.minDistanceM = Math.min(open.minDistanceM, c.distanceM);
    } else {
      const incident = { kind: c.kind, pair: pairKey, startS: c.tSeconds, endS: c.tSeconds, minDistanceM: c.distanceM };
      incidents.push(incident);
      openByPair.set(pairKey, incident);
    }
  }

  console.log(`  -> ${incidents.length} distinct incident(s):`);
  for (const inc of incidents.slice(0, 30)) {
    console.log(
      `     [${inc.kind}] ${inc.pair} t=${inc.startS.toFixed(2)}s-${inc.endS.toFixed(2)}s minDist=${inc.minDistanceM.toFixed(2)}m`
    );
  }
  if (incidents.length > 30) console.log(`     ...and ${incidents.length - 30} more`);
}

const seedSets: [number, number, number, number][] = [
  [1234, 1234, 5678, 9999], // matches the live app's exact seeds
  [42, 111, 222, 333],
  [7, 8, 9, 10],
  [1000, 2000, 3000, 4000],
];

let totalCollisions = 0;
for (const [layoutSeed, vehicleSeed, pedestrianSeed, simRandSeed] of seedSets) {
  const collisions = runOnce(layoutSeed, vehicleSeed, pedestrianSeed, simRandSeed);
  totalCollisions += collisions.length;
  summarize(`seeds(layout=${layoutSeed}, vehicles=${vehicleSeed}, peds=${pedestrianSeed}, sim=${simRandSeed})`, collisions);
}

console.log(`\nTOTAL collision frames across ${seedSets.length} runs (${SIM_SECONDS}s each): ${totalCollisions}`);
process.exit(totalCollisions > 0 ? 1 : 0);
