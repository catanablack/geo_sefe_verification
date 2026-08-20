"""Planner-agnostic interface contract for the verification/arbitration engines.

Any AV planning stack integrates with this platform *solely* through these
Protocols. No planner-specific logic should ever appear inside
`verification_engine` or `trajectory_arbitration` — this preserves the
vendor-independence goal described in PROJECT_PLAN.md (Overview, section 3).
"""
from __future__ import annotations

from typing import List, Optional, Protocol

from src.common.types import DynamicAgentForecast, SafetyVerdict, Trajectory, VoxelGrid


class SafetyVerifier(Protocol):
    """Core contract implemented by the geometric collision-safety verification engine."""

    def verify(
        self,
        trajectory: Trajectory,
        current_occupancy: VoxelGrid,
        forecasted_agents: List[DynamicAgentForecast],
        min_margin_m: float,
    ) -> SafetyVerdict:
        """Certify whether `trajectory` keeps at least `min_margin_m` clearance
        from `current_occupancy` and `forecasted_agents` over its full time
        horizon. Must return within the platform's real-time latency budget
        (see common.config.SafetyConfig.max_verification_latency_ms).
        """
        ...


class TrajectoryArbitrator(Protocol):
    """Contract implemented by the constraint-aware trajectory arbitration module."""

    def propose_alternatives(
        self,
        rejected_trajectory: Trajectory,
        verdict: SafetyVerdict,
        current_occupancy: VoxelGrid,
        forecasted_agents: List[DynamicAgentForecast],
        max_candidates: int = 5,
    ) -> List[Trajectory]:
        """Generate up to `max_candidates` feasible replacement trajectories that
        balance safety margin, passenger comfort, and energy efficiency.
        """
        ...


class OccupancyForecaster(Protocol):
    """Contract implemented by the predictive occupancy forecasting module."""

    def forecast(
        self,
        occupancy_history: List[VoxelGrid],
        horizon_s: float,
    ) -> List[DynamicAgentForecast]:
        """Predict near-future positions of dynamic agents given a short
        history of occupancy grids."""
        ...
