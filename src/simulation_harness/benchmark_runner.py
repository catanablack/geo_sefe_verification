"""Benchmark execution: runs the full pipeline against a set of scenarios and
aggregates accuracy / real-time performance metrics.
"""
from __future__ import annotations

from typing import List

from src.simulation_harness.metrics import BenchmarkReport, ScenarioResult
from src.simulation_harness.scenario_generator import Scenario
from src.trajectory_arbitration.fallback_generator import FallbackTrajectoryArbitrator
from src.verification_engine.interfaces import OccupancyForecaster, SafetyVerifier


class BenchmarkRunner:
    """Executes the integrated pipeline (verifier + forecaster + arbitrator)
    against a list of `Scenario`s and produces a `BenchmarkReport`.
    """

    def __init__(
        self,
        verifier: SafetyVerifier,
        forecaster: OccupancyForecaster,
        arbitrator: FallbackTrajectoryArbitrator,
    ) -> None:
        self.verifier = verifier
        self.forecaster = forecaster
        self.arbitrator = arbitrator

    def run(self, scenarios: List[Scenario]) -> BenchmarkReport:
        """TODO(phase-1/2):
        For each scenario:
          1. Forecast dynamic agents from `scenario.occupancy_sequence`.
          2. Verify `scenario.candidate_trajectory` via `self.verifier`.
          3. If unsafe, invoke `self.arbitrator.propose_alternatives`.
          4. Record latency, verdict correctness (vs. `ground_truth_agents`),
             and arbitration success into a `ScenarioResult`.
        Aggregate all `ScenarioResult`s into a `BenchmarkReport`.
        """
        results: List[ScenarioResult] = []
        raise NotImplementedError
