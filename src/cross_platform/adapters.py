"""Adapters that inject a `VehicleProfile` into engine components at construction time.

Keeps `verification_engine` / `trajectory_arbitration` core logic vehicle-agnostic
while allowing each deployment (robotaxi fleet, trucking fleet, delivery fleet)
to supply its own footprint/kinematics/margins.
"""
from __future__ import annotations

from src.cross_platform.vehicle_profiles import VehicleProfile
from src.trajectory_arbitration.fallback_generator import FallbackTrajectoryArbitrator
from src.trajectory_arbitration.multi_objective_optimizer import MultiObjectiveTrajectoryOptimizer
from src.verification_engine.safety_certifier import GeometricSafetyCertifier
from src.verification_engine.swept_volume import SweptVolumeAnalyzer


def build_certifier_for_profile(profile: VehicleProfile) -> GeometricSafetyCertifier:
    """Construct a `GeometricSafetyCertifier` configured for `profile`."""
    swept_volume_analyzer = SweptVolumeAnalyzer(vehicle_footprint_xy=profile.footprint_xy)
    return GeometricSafetyCertifier(swept_volume_analyzer=swept_volume_analyzer)


def build_arbitrator_for_profile(
    profile: VehicleProfile, verifier: GeometricSafetyCertifier
) -> FallbackTrajectoryArbitrator:
    """Construct a `FallbackTrajectoryArbitrator` configured for `profile`."""
    optimizer = MultiObjectiveTrajectoryOptimizer()
    return FallbackTrajectoryArbitrator(optimizer=optimizer, verifier=verifier)
