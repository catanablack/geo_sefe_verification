import { createSeededRandom, generateCityLayout } from "../src/city/cityLayout";
import { createVehicleFleet, stepFleet, DEFAULT_VEHICLE_CONFIG } from "../src/sim/simulation";
import { createPedestrians, stepPedestrians, DEFAULT_PEDESTRIAN_WALK_CONFIG } from "../src/sim/pedestrians";

const DELTA_S = 1 / 30;
const layout = generateCityLayout({ rows: 4, cols: 4, seed: 1234 });
const network = layout.network;
const roadWidth = layout.roadWidth;

let vehicles = createVehicleFleet(network, 5, DEFAULT_VEHICLE_CONFIG, createSeededRandom(1234));
let pedestrians = createPedestrians(layout.pedestrianWaypoints, 14, DEFAULT_PEDESTRIAN_WALK_CONFIG, createSeededRandom(5678));
const simRand = createSeededRandom(9999);

let poses: ReturnType<typeof stepFleet>["poses"] = [];
let t = 0;
while (t < 110) {
  pedestrians = stepPedestrians(pedestrians, layout.pedestrianWaypoints, DEFAULT_PEDESTRIAN_WALK_CONFIG, DELTA_S, simRand, poses);
  const result = stepFleet(network, vehicles, pedestrians, DEFAULT_VEHICLE_CONFIG, roadWidth, DELTA_S, simRand);
  vehicles = result.vehicles;
  poses = result.poses;
  t += DELTA_S;

  if (t > 54 && t < 60) {
    const i1 = vehicles.findIndex((v) => v.id === "car-1");
    const i3 = vehicles.findIndex((v) => v.id === "car-2");
    const c1 = vehicles[i1];
    const c3 = vehicles[i3];
    const p1 = poses[i1];
    const p3 = poses[i3];
    const dx = p3.x - p1.x;
    const dz = p3.z - p1.z;
    const dist = Math.hypot(dx, dz);
    const v1 = result.verdicts[i1];
    const v3 = result.verdicts[i3];
    console.log(
      `t=${t.toFixed(2)} dist=${dist.toFixed(2)} ` +
        `c1[${c1.fromNodeId}->${c1.toNodeId} pend=${c1.pendingToNodeId} h=${p1.headingRad.toFixed(2)} spd=${c1.speedMps.toFixed(2)} safe=${v1.isSafe} cause=${v1.cause} conf=${v1.conflictId}] ` +
        `c2[${c3.fromNodeId}->${c3.toNodeId} pend=${c3.pendingToNodeId} h=${p3.headingRad.toFixed(2)} spd=${c3.speedMps.toFixed(2)} safe=${v3.isSafe} cause=${v3.cause} conf=${v3.conflictId}]`
    );
  }
}
