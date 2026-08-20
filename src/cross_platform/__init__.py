"""Cross-Platform Generalization Layer (Phase 3).

Abstracts the framework so it applies not only to passenger robotaxis but
also to autonomous trucking and last-mile delivery platforms, broadening the
endeavor's relevance across the U.S. autonomous mobility sector.
"""
from src.cross_platform.vehicle_profiles import VEHICLE_PROFILES, VehicleProfile

__all__ = ["VEHICLE_PROFILES", "VehicleProfile"]
