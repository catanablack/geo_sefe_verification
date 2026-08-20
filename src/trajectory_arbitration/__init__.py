"""Constraint-Aware Trajectory Arbitration Module (Phase 2).

Activates when a proposed trajectory fails verification, generating
alternative feasible trajectories through multi-objective optimization that
balances safety margin, passenger comfort, and energy efficiency.
"""
from src.trajectory_arbitration.fallback_generator import FallbackTrajectoryArbitrator

__all__ = ["FallbackTrajectoryArbitrator"]
