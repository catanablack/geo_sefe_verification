import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Vector3 } from "three";
import { createSeededRandom, generateCityLayout } from "../city/cityLayout";
import type { RoadNetwork, RoadPoint } from "../city/cityLayout";
import {
  DEFAULT_VEHICLE_CONFIG,
  createVehicleFleet,
  stepFleet,
  type Pose2D,
  type SafetyResult,
  type VehicleState,
} from "../sim/simulation";
import {
  DEFAULT_PEDESTRIAN_WALK_CONFIG,
  createPedestrians,
  pedestrianHeadingRad,
  stepPedestrians,
  type PedestrianState,
  type VehicleObstacle,
} from "../sim/pedestrians";
import { createFleetMetricsState, recordFrame, type FleetMetricsSnapshot } from "../sim/metrics";
import CityBuildings from "./CityBuildings";
import RoadNetworkView from "./RoadNetworkView";
import Trees from "./Trees";
import Streetlights from "./Streetlights";
import Car from "./Car";
import PedestrianAgent from "./PedestrianAgent";
import TrajectoryPreview from "./TrajectoryPreview";
import SafetyAura from "./SafetyAura";
import ConflictHighlight from "./ConflictHighlight";
import SimStatusPanel from "./SimStatusPanel";

const VEHICLE_COUNT = 5;
const PEDESTRIAN_COUNT = 14;
const PEDESTRIAN_COLORS = ["#f59e0b", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#facc15"];

/** Radius (meters, centered on the vehicle) drawn by `SafetyAura` — the
 * vehicle's own half-length plus its configured safety margin, i.e. the
 * total clearance zone (body + buffer) around it that other hazards must
 * stay outside of. A simplified, static-circle visualization of the real
 * (path-sampled, direction-aware) clearance check for perceptibility. */
const SAFETY_AURA_RADIUS_M = DEFAULT_VEHICLE_CONFIG.vehicleLengthM / 2 + DEFAULT_VEHICLE_CONFIG.safetyMarginM;

/** Minimum real-world seconds between dashboard metric-number refreshes.
 * The physics/render loop still steps every animation frame (~60Hz) for
 * smooth vehicle/pedestrian motion, but re-rendering the numeric readouts
 * in `SimStatusPanel` at that same rate makes them flicker/scroll too fast
 * to read, so the displayed snapshot is only swapped out this often. */
const METRICS_DISPLAY_INTERVAL_S = 0.75;

interface RenderState {
  poses: Pose2D[];
  verdicts: SafetyResult[];
  pedestrianPoses: Pose2D[];
  metrics: FleetMetricsSnapshot;
}

type ViewMode = "perspective" | "top";

const PERSPECTIVE_CAMERA_POSITION: [number, number, number] = [70, 65, 70];
const CAMERA_TARGET: [number, number, number] = [0, 0, 0];
// Hoisted to a stable module-level constant (not recreated every render):
// the simulation drives frequent React re-renders of CityScene (once per
// animation frame, via setRenderState), and <Canvas camera={...}> re-applies
// its `camera` prop object whenever that object's REFERENCE changes. An
// inline object literal here would be a brand-new reference every render,
// so the camera's position/fov would be force-reset back to this initial
// value ~60 times a second — fighting (and effectively "locking") any
// OrbitControls-driven rotate/pan/zoom the user just did. A stable
// reference means R3F only applies it once, on mount.
const INITIAL_CAMERA = { position: PERSPECTIVE_CAMERA_POSITION, fov: 45 };

interface CameraRigProps {
  viewMode: ViewMode;
  citySpan: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

/** Smoothly animates the camera between the default 3/4 perspective view and
 * a top-down "global overview" view directly above the city, then stops
 * touching the camera once it arrives so OrbitControls has full, unfought
 * control for free manual orbiting/panning/zooming in either mode. */
function CameraRig({ viewMode, citySpan, controlsRef }: CameraRigProps) {
  const { camera } = useThree();
  const targetPosition = useMemo(() => {
    if (viewMode === "top") {
      const topHeightM = citySpan * 0.9 + 60;
      return new Vector3(0.01, topHeightM, 0.01);
    }
    return new Vector3(...PERSPECTIVE_CAMERA_POSITION);
  }, [viewMode, citySpan]);

  // Only animate the camera while an explicit view-mode transition is in
  // progress. Without this flag, comparing the camera's live position to a
  // fixed target point every frame (regardless of WHY it differs) meant
  // that any manual OrbitControls rotate/pan/zoom — which naturally moves
  // the camera away from that exact point — was immediately detected as
  // "not arrived" and lerped straight back, fighting (and effectively
  // locking) every user drag/zoom/rotate. Now the rig only engages right
  // after `targetPosition` changes (a real perspective<->top switch) and
  // disengages for good once it arrives, leaving OrbitControls with sole,
  // unfought control the rest of the time.
  const isTransitioningRef = useRef(false);

  useEffect(() => {
    isTransitioningRef.current = true;
  }, [targetPosition]);

  useFrame(() => {
    if (!isTransitioningRef.current) return;
    if (camera.position.distanceTo(targetPosition) > 0.25) {
      camera.position.lerp(targetPosition, 0.08);
      const controls = controlsRef.current;
      if (controls) {
        controls.target.lerp(new Vector3(...CAMERA_TARGET), 0.08);
        controls.update();
      }
    } else {
      isTransitioningRef.current = false;
    }
  });

  return null;
}

interface SimulationDriverProps {
  network: RoadNetwork;
  initialFleet: VehicleState[];
  initialPedestrians: PedestrianState[];
  pedestrianWaypoints: RoadPoint[];
  roadWidth: number;
  onUpdate: (state: RenderState) => void;
}

/** Renderless component: ticks the client-side vehicle fleet and pedestrian
 * random-walk simulations each frame and lifts the resulting poses/verdicts
 * up to `CityScene` for rendering. */
function SimulationDriver({
  network,
  initialFleet,
  initialPedestrians,
  pedestrianWaypoints,
  roadWidth,
  onUpdate,
}: SimulationDriverProps) {
  const vehiclesRef = useRef<VehicleState[]>(initialFleet);
  const pedestriansRef = useRef<PedestrianState[]>(initialPedestrians);
  const lastVehiclePosesRef = useRef<VehicleObstacle[]>([]);
  const metricsStateRef = useRef(createFleetMetricsState());
  const displayedMetricsRef = useRef<FleetMetricsSnapshot | null>(null);
  const timeSinceMetricsDisplayS = useRef(0);
  const rand = useMemo(() => createSeededRandom(9999), []);

  useFrame((_, delta) => {
    const clampedDeltaS = Math.min(delta, 0.1); // guard against tab-switch time jumps
    const verificationStartMs = performance.now();

    pedestriansRef.current = stepPedestrians(
      pedestriansRef.current,
      pedestrianWaypoints,
      DEFAULT_PEDESTRIAN_WALK_CONFIG,
      clampedDeltaS,
      rand,
      lastVehiclePosesRef.current
    );
    const result = stepFleet(
      network,
      vehiclesRef.current,
      pedestriansRef.current,
      DEFAULT_VEHICLE_CONFIG,
      roadWidth,
      clampedDeltaS,
      rand
    );
    vehiclesRef.current = result.vehicles;
    lastVehiclePosesRef.current = result.poses;

    const latencyMs = performance.now() - verificationStartMs;
    const metrics = recordFrame(
      metricsStateRef.current,
      result.verdicts,
      result.vehicles.map((v) => v.speedMps),
      clampedDeltaS,
      latencyMs
    );

    // Keep the rolling aggregation accurate every physics frame, but only
    // swap the snapshot handed to the dashboard on a slower cadence (see
    // METRICS_DISPLAY_INTERVAL_S) so the numbers are readable instead of
    // updating 60 times per second.
    timeSinceMetricsDisplayS.current += clampedDeltaS;
    if (displayedMetricsRef.current === null || timeSinceMetricsDisplayS.current >= METRICS_DISPLAY_INTERVAL_S) {
      displayedMetricsRef.current = metrics;
      timeSinceMetricsDisplayS.current = 0;
    }

    const pedestrianPoses = pedestriansRef.current.map((p) => ({ x: p.x, z: p.z, headingRad: pedestrianHeadingRad(p) }));

    onUpdate({ poses: result.poses, verdicts: result.verdicts, pedestrianPoses, metrics: displayedMetricsRef.current });
  });

  return null;
}

/**
 * Minimal PoC scene: a procedurally generated small town with a multi-block
 * street grid (multiple intersections), a fleet of vehicles independently
 * routing themselves through the network in right-hand lanes, a crowd of
 * pedestrians wandering the sidewalks and crossing streets at random, and a
 * client-side safety check per vehicle standing in for the verification/
 * arbitration modules. See src/README.md for how this maps to the full
 * architecture.
 */
export default function CityScene() {
  const layout = useMemo(() => generateCityLayout({ rows: 5, cols: 5, blockSize: 22 }), []);

  const initialFleet = useMemo(
    () => createVehicleFleet(layout.network, VEHICLE_COUNT, DEFAULT_VEHICLE_CONFIG, createSeededRandom(1234)),
    [layout]
  );
  const fleetColors = useMemo(() => initialFleet.map((v) => v.color), [initialFleet]);

  const initialPedestrians = useMemo(
    () =>
      createPedestrians(
        layout.pedestrianWaypoints,
        PEDESTRIAN_COUNT,
        DEFAULT_PEDESTRIAN_WALK_CONFIG,
        createSeededRandom(5678)
      ),
    [layout]
  );
  const pedestrianColors = useMemo(
    () => initialPedestrians.map((_, i) => PEDESTRIAN_COLORS[i % PEDESTRIAN_COLORS.length]),
    [initialPedestrians]
  );

  const [renderState, setRenderState] = useState<RenderState | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("perspective");
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Id -> current pose lookup covering both vehicles (`car-N`) and
  // pedestrians (`ped-N`), used to resolve a `SafetyResult.conflictId` into
  // an actual world position for `ConflictHighlight`. Rebuilt each render
  // from the latest renderState — cheap given the small fleet/crowd sizes.
  const poseById = new Map<string, Pose2D>();
  if (renderState) {
    renderState.poses.forEach((pose, i) => poseById.set(initialFleet[i].id, pose));
    renderState.pedestrianPoses.forEach((pose, i) => poseById.set(initialPedestrians[i].id, pose));
  }

  return (
    <div style={{ display: "flex", height: "100%", width: "100%" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1, display: "flex", gap: 8 }}>
          <button
            onClick={() => setViewMode("perspective")}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid #333",
              background: viewMode === "perspective" ? "#2563eb" : "#1f2937",
              color: "#eee",
              cursor: "pointer",
            }}
          >
            Perspective
          </button>
          <button
            onClick={() => setViewMode("top")}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid #333",
              background: viewMode === "top" ? "#2563eb" : "#1f2937",
              color: "#eee",
              cursor: "pointer",
            }}
          >
            Top View
          </button>
        </div>
        <Canvas camera={INITIAL_CAMERA} shadows gl={{ logarithmicDepthBuffer: true }}>
          <ambientLight intensity={0.55} />
          <directionalLight position={[90, 110, 50]} intensity={1.0} castShadow />
          <fog attach="fog" args={["#cdd7e0", 140, 480]} />

          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[layout.citySpan + 100, layout.citySpan + 100]} />
            <meshStandardMaterial color="#7c9473" />
          </mesh>

          <RoadNetworkView network={layout.network} roadWidth={layout.roadWidth} sidewalkWidth={layout.sidewalkWidth} />
          <CityBuildings buildings={layout.buildings} />
          <Trees positions={layout.trees} />
          <Streetlights positions={layout.streetlights} />

          <SimulationDriver
            network={layout.network}
            initialFleet={initialFleet}
            initialPedestrians={initialPedestrians}
            pedestrianWaypoints={layout.pedestrianWaypoints}
            roadWidth={layout.roadWidth}
            onUpdate={setRenderState}
          />

          {renderState && (
            <>
              {renderState.poses.map((pose, i) => (
                <SafetyAura key={`aura-${initialFleet[i].id}`} x={pose.x} z={pose.z} radiusM={SAFETY_AURA_RADIUS_M} isSafe={renderState.verdicts[i]?.isSafe ?? true} />
              ))}
              {renderState.poses.map((pose, i) => (
                <Car key={initialFleet[i].id} pose={pose} baseColor={fleetColors[i]} isSafe={renderState.verdicts[i]?.isSafe ?? true} />
              ))}
              {renderState.pedestrianPoses.map((pose, i) => (
                <PedestrianAgent key={initialPedestrians[i].id} pose={pose} color={pedestrianColors[i]} />
              ))}
              {renderState.verdicts.map((verdict, i) =>
                verdict.isSafe ? null : (
                  <TrajectoryPreview key={verdict.vehicleId} from={renderState.poses[i]} to={verdict.lookAheadPose} isSafe={false} />
                )
              )}
              {renderState.verdicts.map((verdict, i) => {
                if (verdict.isSafe || !verdict.conflictId) return null;
                const conflictPose = poseById.get(verdict.conflictId);
                if (!conflictPose) return null;
                return <ConflictHighlight key={`conflict-${verdict.vehicleId}`} from={renderState.poses[i]} to={conflictPose} />;
              })}
            </>
          )}

          <CameraRig viewMode={viewMode} citySpan={layout.citySpan} controlsRef={controlsRef} />
          <OrbitControls
            ref={controlsRef}
            target={CAMERA_TARGET}
            enableRotate
            enablePan
            enableZoom
            maxPolarAngle={Math.PI / 2.1}
            minDistance={8}
            maxDistance={500}
          />
        </Canvas>
      </div>
      <div
        style={{
          width: 380,
          borderLeft: "1px solid #1f2937",
          background: "#0b0f14",
          color: "#e5e7eb",
          overflowY: "auto",
        }}
      >
        <SimStatusPanel verdicts={renderState?.verdicts ?? null} colors={fleetColors} metrics={renderState?.metrics ?? null} />
      </div>
    </div>
  );
}
