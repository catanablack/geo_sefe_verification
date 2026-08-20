"""Geometric safety certifier — the top-level entry point of the verification engine.

Combines swept-volume analysis and signed distance fields to implement the
`SafetyVerifier` protocol (see interfaces.py). This is the object the `api`
layer and `simulation_harness` call directly.
"""
from __future__ import annotations

import time
from typing import List

import numpy as np

from src.common.config import SafetyConfig
from src.common.types import DynamicAgentForecast, SafetyVerdict, Trajectory, VoxelGrid
from src.verification_engine.signed_distance_field import SignedDistanceField
from src.verification_engine.swept_volume import SweptVolumeAnalyzer


class GeometricSafetyCertifier:
    """Implements `SafetyVerifier`: certifies trajectory safety via swept-volume + SDF."""

    def __init__(
        self,
        swept_volume_analyzer: SweptVolumeAnalyzer,
        config: SafetyConfig = SafetyConfig(),
    ) -> None:
        self.swept_volume_analyzer = swept_volume_analyzer
        self.config = config

    def verify(
        self,
        trajectory: Trajectory,
        current_occupancy: VoxelGrid,
        forecasted_agents: List[DynamicAgentForecast],
        min_margin_m: float | None = None,
    ) -> SafetyVerdict:
        """Certify `trajectory` against static occupancy and dynamic-agent forecasts.

        TODO(phase-1):
          1. Build/reuse a SignedDistanceField from `current_occupancy`
             (and, in Phase 2, from rasterized `forecasted_agents` footprints
             per forecast timestep).
          2. Sample points along the swept volume of `trajectory`.
          3. Query the SDF(s) to find the minimum clearance over the full
             trajectory horizon.
          4. Compare against `min_margin_m` (falls back to
             `self.config.min_safety_margin_m`) to produce a SafetyVerdict.
        """
        start = time.monotonic()
        margin_threshold = min_margin_m if min_margin_m is not None else self.config.min_safety_margin_m
        raise NotImplementedError
