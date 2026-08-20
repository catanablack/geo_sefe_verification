/** Ad-hoc diagnostic: reproduce the seed=1000/2000/3000/4000 run and dump
 * car-1/car-4 state right as their persistent overlap begins (~t=49s). */
import { createSeededRandom, generateCityLayout } from "../src/city/cityLayout";
import { createVehicleFleet, stepFleet, DEFAULT_VEHICLE_CONFIG } from "../src/sim/simulation";
import { createPedestrians, stepPedestrians, DEFAULT_PEDESTRIAN_WALK_CONFIG } from "../src/sim/pedestrians";

const DELTA_S = 1 / 30;
const layout = generateCityLayout({ rows: 4, cols: 4, seed: 1000 });
const network = layout.network;
const roadWidth = layout.roadWidth;

let vehicles = createVehicleFleet(network, 5, DEFAULT_VEHICLE_CONFIG, createSeededRandom(2000));
let pedestrians = createPedestrians(layout.pedestrianWaypoints, 14, DEFAULT_PEDESTRIAN_WALK_CONFIG, createSeededRandom(3000));
const simRand = createSeededRandom(4000);

let poses = vehicles.map(() => ({ x: 0, z: 0, headingRad: 0 }));

const steps = Math.round(55 / DELTA_S);
for (let step = 0; step < steps; step++) {
  const t = step * DELTA_S;
  pedestrians = stepPedestrians(pedestrians, layout.pedestrianWaypoints, DEFAULT_PEDESTRIAN_WALK_CONFIG, DELTA_S, simRand, poses);
  const result = stepFleet(network, vehicles, pedestrians, DEFAULT_VEHICLE_CONFIG, roadWidth, DELTA_S, simRand);
  vehicles = result.vehicles;
  poses = result.poses;

  if (t >= 47 && t <= 51) {
    const i1 = vehicles.findIndex((v) => v.id === "car-1");
    const i4 = vehicles.findIndex((v) => v.id === "car-4");
    const v1 = vehicles[i1];
    const v4 = vehicles[i4];
    const d = Math.hypot(poses[i1].x - poses[i4].x, poses[i1].z - poses[i4].z);
    console.log(
      `t=${t.toFixed(2)} d=${d.toFixed(2)} | car1 edge=${v1.fromNodeId}->${v1.toNodeId} dist=${v1.distanceOnEdgeM.toFixed(
        2
      )} pending=${v1.pendingToNodeId} speed=${v1.speedMps.toFixed(2)} pose=(${poses[i1].x.toFixed(2)},${poses[i1].z.toFixed(
        2
      )},h=${poses[i1].headingRad.toFixed(2)}) | car4 edge=${v4.fromNodeId}->${v4.toNodeId} dist=${v4.distanceOnEdgeM.toFixed(
        2
      )} pending=${v4.pendingToNodeId} speed=${v4.speedMps.toFixed(2)} pose=(${poses[i4].x.toFixed(2)},${poses[i4].z.toFixed(
        2
      )},h=${poses[i4].headingRad.toFixed(2)})`
    );
  }
}
