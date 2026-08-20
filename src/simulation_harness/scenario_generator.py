"""Scenario generation: procedural and generative synthetic driving scenarios.

A `Scenario` bundles a sequence of VoxelGrids (or a generator thereof), a
seed/candidate Trajectory, and ground-truth dynamic agent tracks, used to
exercise the full pipeline in `benchmark_runner.BenchmarkRunner`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

from src.common.types import DynamicAgentForecast, Trajectory, VoxelGrid


@dataclass(frozen=True)
class Scenario:
    """A single benchmark/simulation scenario."""

    scenario_id: str
    occupancy_sequence: List[VoxelGrid]
    candidate_trajectory: Trajectory
    ground_truth_agents: List[DynamicAgentForecast]
    is_edge_case: bool = False


class ScenarioGenerator:
    """Produces `Scenario` instances from public benchmark datasets, procedural
    generation, and generative (learned) methods."""

    def from_public_dataset(self, dataset_path: str) -> List[Scenario]:
        """Load scenarios from an established public AV perception/planning
        benchmark dataset (Phase 1 baseline validation).

        TODO(phase-1): implement dataset-specific loaders (e.g. nuScenes,
        Waymo Open Dataset, Argoverse) behind a common adapter.
        """
        raise NotImplementedError

    def generate_procedural(self, num_scenarios: int, seed: int = 0) -> List[Scenario]:
        """Procedurally generate scenarios by parametrically varying road
        geometry, agent counts/behaviors, and weather/sensor-noise conditions."""
        raise NotImplementedError

    def generate_edge_cases(self, num_scenarios: int, seed: int = 0) -> List[Scenario]:
        """Generate rare, safety-critical edge cases (e.g. via generative
        models / adversarial scenario search) for stress-testing the
        verification engine and arbitration module (Phase 2 scale validation).
        """
        raise NotImplementedError
