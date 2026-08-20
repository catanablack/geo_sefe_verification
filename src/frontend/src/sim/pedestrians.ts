/**
 * Multiple-pedestrian random-walk simulation, independent of the vehicle
 * fleet simulation (see sim/simulation.ts). Each pedestrian wanders between
 * sidewalk waypoints (see city/cityLayout.ts generateSidewalkWaypoints),
 * occasionally picking a new nearby waypoint to walk toward — including
 * waypoints across the street — so pedestrians naturally cross roads that
 * the vehicle fleet's safety check must account for.
 */
import type { RoadPoint } from "../city/cityLayout";

export interface PedestrianWalkConfig {
  walkSpeedMps: number;
  arriveRadiusM: number;
  /** Bias target selection to waypoints within this radius when possible,
   * so pedestrians wander locally rather than teleporting across town. */
  wanderRadiusM: number;
}

export const DEFAULT_PEDESTRIAN_WALK_CONFIG: PedestrianWalkConfig = {
  walkSpeedMps: 1.3,
  arriveRadiusM: 1.0,
  wanderRadiusM: 28,
};

// Pedestrians have no other awareness of vehicles (their waypoint routing
// happily crosses a road exactly where a car might be sitting), so without
// some local steering a pedestrian would walk straight through a stopped or
// braking vehicle even though the vehicle side already yields unconditionally
// to pedestrians. This radius/strength pair makes a pedestrian nudge around
// a nearby vehicle's body while still making progress toward its real target,
// like a person naturally stepping around a car blocking their path.
// Radius is measured from the NEAREST POINT ON THE CAR'S BODY (see
// `closestPointOnVehicleBody` below), not just its center, so it only needs
// to cover clearance beyond the body itself rather than the body's full
// half-length too.
const VEHICLE_AVOID_RADIUS_M = 3.5;
const VEHICLE_AVOID_STRENGTH = 3.5;

/** Half the real vehicle body length (see Car.tsx / VehicleConfig.vehicleLengthM
 * = 4.6), used to treat a vehicle as a line segment along its heading rather
 * than a single point, so avoidance correctly covers the front/rear bumpers
 * of a car that's pointed toward or across a pedestrian's path. */
const VEHICLE_HALF_LENGTH_M = 2.3;

export interface PedestrianState {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  targetX: number;
  targetZ: number;
}

/** A pedestrian's position `aheadS` seconds in the future, used by the
 * vehicle fleet's safety check. */
export interface PredictedPedestrian {
  id: string;
  x: number;
  z: number;
}

/** A vehicle obstacle as seen by pedestrian avoidance steering: its render
 * pose (center + heading), used to treat the vehicle as an oriented body
 * rather than a single point. */
export interface VehicleObstacle {
  x: number;
  z: number;
  headingRad: number;
}

/** Closest point on a vehicle's body centerline (approximated as a line
 * segment of length `2 * VEHICLE_HALF_LENGTH_M` through its center, along
 * its heading) to the given point — lets pedestrian avoidance treat a car
 * as its actual elongated body instead of a single center point, so a
 * pedestrian can't be clipped by a bumper just because it was more than
 * `VEHICLE_AVOID_RADIUS_M` from the car's center. */
function closestPointOnVehicleBody(veh: VehicleObstacle, px: number, pz: number): { x: number; z: number } {
  const dirX = Math.sin(veh.headingRad);
  const dirZ = Math.cos(veh.headingRad);
  const relX = px - veh.x;
  const relZ = pz - veh.z;
  const t = Math.max(-VEHICLE_HALF_LENGTH_M, Math.min(VEHICLE_HALF_LENGTH_M, relX * dirX + relZ * dirZ));
  return { x: veh.x + dirX * t, z: veh.z + dirZ * t };
}

function pickNewTarget(
  current: RoadPoint,
  waypoints: RoadPoint[],
  wanderRadiusM: number,
  rand: () => number
): RoadPoint {
  const nearby = waypoints.filter((w) => Math.hypot(w.x - current.x, w.z - current.z) <= wanderRadiusM);
  const pool = nearby.length > 1 ? nearby : waypoints;

  let choice = pool[Math.floor(rand() * pool.length)];
  let attempts = 0;
  while (Math.hypot(choice.x - current.x, choice.z - current.z) < 1 && attempts < 5) {
    choice = pool[Math.floor(rand() * pool.length)];
    attempts++;
  }
  return choice;
}

/** Spawn `count` pedestrians at random waypoints, each already walking
 * toward a random nearby waypoint. */
export function createPedestrians(
  waypoints: RoadPoint[],
  count: number,
  config: PedestrianWalkConfig,
  rand: () => number
): PedestrianState[] {
  const pedestrians: PedestrianState[] = [];
  for (let i = 0; i < count; i++) {
    const start = waypoints[Math.floor(rand() * waypoints.length)];
    const target = pickNewTarget(start, waypoints, config.wanderRadiusM, rand);
    pedestrians.push({
      id: `ped-${i + 1}`,
      x: start.x,
      z: start.z,
      vx: 0,
      vz: 0,
      targetX: target.x,
      targetZ: target.z,
    });
  }
  return pedestrians;
}

/** Advance every pedestrian by `deltaS` seconds: step toward its current
 * target waypoint at `config.walkSpeedMps`, picking a new nearby random
 * target whenever it arrives, while steering around any nearby vehicle
 * body (`vehicleObstacles`, typically the previous frame's vehicle render
 * poses) rather than walking straight through it. */
export function stepPedestrians(
  pedestrians: PedestrianState[],
  waypoints: RoadPoint[],
  config: PedestrianWalkConfig,
  deltaS: number,
  rand: () => number,
  vehicleObstacles: VehicleObstacle[] = []
): PedestrianState[] {
  return pedestrians.map((ped) => {
    const dx = ped.targetX - ped.x;
    const dz = ped.targetZ - ped.z;
    const distance = Math.hypot(dx, dz);

    if (distance <= config.arriveRadiusM) {
      const next = pickNewTarget({ x: ped.x, z: ped.z }, waypoints, config.wanderRadiusM, rand);
      return { ...ped, vx: 0, vz: 0, targetX: next.x, targetZ: next.z };
    }

    // Base steering: straight toward the target, plus a repulsion vector
    // away from any vehicle within the avoidance radius, weighted stronger
    // the closer the vehicle is — lets the pedestrian curve around a
    // blocking car while still making progress toward its real goal. Uses
    // the closest point on the vehicle's actual body (not just its center)
    // so the avoidance zone correctly covers the front/rear bumpers of a
    // car that's pointed across the pedestrian's path, not just a small
    // circle around its middle.
    let steerX = dx / distance;
    let steerZ = dz / distance;
    for (const veh of vehicleObstacles) {
      const closest = closestPointOnVehicleBody(veh, ped.x, ped.z);
      const ox = ped.x - closest.x;
      const oz = ped.z - closest.z;
      const obstacleDistance = Math.hypot(ox, oz);
      if (obstacleDistance > 0 && obstacleDistance < VEHICLE_AVOID_RADIUS_M) {
        const weight = (VEHICLE_AVOID_RADIUS_M - obstacleDistance) / VEHICLE_AVOID_RADIUS_M;
        steerX += (ox / obstacleDistance) * weight * VEHICLE_AVOID_STRENGTH;
        steerZ += (oz / obstacleDistance) * weight * VEHICLE_AVOID_STRENGTH;
      }
    }
    const steerLength = Math.hypot(steerX, steerZ) || 1;
    const vx = (steerX / steerLength) * config.walkSpeedMps;
    const vz = (steerZ / steerLength) * config.walkSpeedMps;
    return { ...ped, x: ped.x + vx * deltaS, z: ped.z + vz * deltaS, vx, vz };
  });
}

/** Linearly extrapolate a pedestrian's position `aheadS` seconds into the
 * future from its current velocity — a simple stand-in for the backend's
 * GNN-based predictive occupancy forecasting module. */
export function predictPedestrianPosition(ped: PedestrianState, aheadS: number): PredictedPedestrian {
  return { id: ped.id, x: ped.x + ped.vx * aheadS, z: ped.z + ped.vz * aheadS };
}

/** Facing direction derived from current velocity (radians, same
 * atan2(x, z) convention used by Pose2D elsewhere). */
export function pedestrianHeadingRad(ped: PedestrianState): number {
  if (ped.vx === 0 && ped.vz === 0) return 0;
  return Math.atan2(ped.vx, ped.vz);
}
