"""Per-vehicle-class configuration profiles.

Each `VehicleProfile` parameterizes the footprint, kinematic limits, and
safety-margin requirements used by `verification_engine` and
`trajectory_arbitration` for a given `VehicleClass`.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from src.common.types import VehicleClass
from src.trajectory_arbitration.constraints import KinematicLimits


@dataclass(frozen=True)
class VehicleProfile:
    vehicle_class: VehicleClass
    footprint_xy: np.ndarray  # (N, 2) polygon vertices, local frame
    kinematic_limits: KinematicLimits
    min_safety_margin_m: float


def _rect_footprint(length_m: float, width_m: float) -> np.ndarray:
    hl, hw = length_m / 2, width_m / 2
    return np.array([[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]])


VEHICLE_PROFILES: dict[VehicleClass, VehicleProfile] = {
    VehicleClass.ROBOTAXI: VehicleProfile(
        vehicle_class=VehicleClass.ROBOTAXI,
        footprint_xy=_rect_footprint(length_m=4.8, width_m=1.9),
        kinematic_limits=KinematicLimits(
            max_speed_mps=25.0, max_accel_mps2=3.0, max_decel_mps2=6.0, max_yaw_rate_rps=0.6
        ),
        min_safety_margin_m=0.5,
    ),
    VehicleClass.TRUCKING: VehicleProfile(
        vehicle_class=VehicleClass.TRUCKING,
        footprint_xy=_rect_footprint(length_m=16.5, width_m=2.6),
        kinematic_limits=KinematicLimits(
            max_speed_mps=29.0, max_accel_mps2=1.2, max_decel_mps2=3.5, max_yaw_rate_rps=0.2
        ),
        min_safety_margin_m=1.5,
    ),
    VehicleClass.LAST_MILE_DELIVERY: VehicleProfile(
        vehicle_class=VehicleClass.LAST_MILE_DELIVERY,
        footprint_xy=_rect_footprint(length_m=2.2, width_m=1.0),
        kinematic_limits=KinematicLimits(
            max_speed_mps=8.0, max_accel_mps2=1.5, max_decel_mps2=3.0, max_yaw_rate_rps=1.0
        ),
        min_safety_margin_m=0.3,
    ),
}
