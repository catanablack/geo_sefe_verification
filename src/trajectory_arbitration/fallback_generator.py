"""Top-level arbitrator implementing the `TrajectoryArbitrator` protocol.

Wires `constraints` and `multi_objective_optimizer` together, then re-verifies
each candidate against the `verification_engine` before returning it — an
alternative is only proposed if it is itself certified safe.
"""
from __future__ import annotations

from typing import List

from src.common.config import ArbitrationConfig
from src.common.types import DynamicAgentForecast, SafetyVerdict, Trajectory, VoxelGrid
from src.trajectory_arbitration.multi_objective_optimizer import (
    MultiObjectiveTrajectoryOptimizer,
)
from src.verification_engine.interfaces import SafetyVerifier


class FallbackTrajectoryArbitrator:
    """Implements `verification_engine.interfaces.TrajectoryArbitrator`."""

    def __init__(
        self,
        optimizer: MultiObjectiveTrajectoryOptimizer,
        verifier: SafetyVerifier,
        config: ArbitrationConfig = ArbitrationConfig(),
    ) -> None:
        self.optimizer = optimizer
        self.verifier = verifier
        self.config = config

    def propose_alternatives(
        self,
        rejected_trajectory: Trajectory,
        verdict: SafetyVerdict,
        current_occupancy: VoxelGrid,
        forecasted_agents: List[DynamicAgentForecast],
        max_candidates: int | None = None,
    ) -> List[Trajectory]:
        """TODO(phase-2):
        1. Generate candidates via `self.optimizer.generate_candidates`.
        2. Re-verify each candidate via `self.verifier.verify` — discard any
           that fail.
        3. Return up to `max_candidates` (defaults to
           `self.config.max_candidate_trajectories`) verified-safe
           alternatives, best-first.
        """
        raise NotImplementedError
