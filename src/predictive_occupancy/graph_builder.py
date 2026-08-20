"""Constructs interaction graphs from a sequence of VoxelGrids.

Each dynamic agent detected across a short history of occupancy grids
becomes a node; edges encode spatial proximity / potential interaction,
forming the input graph consumed by `gnn_model.GNNForecastModel`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np

from src.common.types import VoxelGrid


@dataclass(frozen=True)
class AgentGraph:
    """Graph representation of detected dynamic agents at one time step."""

    node_features: np.ndarray  # (num_agents, feature_dim): position, velocity, class, ...
    edge_index: np.ndarray  # (2, num_edges): source/target node indices
    agent_ids: List[str]


class AgentGraphBuilder:
    """Extracts dynamic agents from occupancy history and builds an `AgentGraph`."""

    def __init__(self, proximity_threshold_m: float = 15.0) -> None:
        self.proximity_threshold_m = proximity_threshold_m

    def build(self, occupancy_history: List[VoxelGrid]) -> AgentGraph:
        """TODO(phase-2):
        1. Cluster occupied voxels into candidate dynamic-agent detections
           (or consume upstream detection/tracking output if available).
        2. Track agents across `occupancy_history` to derive velocity.
        3. Connect agents within `proximity_threshold_m` as graph edges.
        """
        raise NotImplementedError
