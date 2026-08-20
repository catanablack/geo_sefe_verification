"""Top-level forecaster implementing the `OccupancyForecaster` protocol.

Wires `graph_builder.AgentGraphBuilder` and `gnn_model.GNNForecastModel`
together into the interface consumed by the verification engine and API layer.
"""
from __future__ import annotations

from typing import List

from src.common.config import ForecastConfig
from src.common.types import DynamicAgentForecast, VoxelGrid
from src.predictive_occupancy.graph_builder import AgentGraphBuilder
from src.predictive_occupancy.gnn_model import GNNForecastModel


class GNNOccupancyForecaster:
    """Implements `verification_engine.interfaces.OccupancyForecaster`."""

    def __init__(
        self,
        graph_builder: AgentGraphBuilder,
        model: GNNForecastModel,
        config: ForecastConfig = ForecastConfig(),
    ) -> None:
        self.graph_builder = graph_builder
        self.model = model
        self.config = config

    def forecast(
        self, occupancy_history: List[VoxelGrid], horizon_s: float | None = None
    ) -> List[DynamicAgentForecast]:
        """Predict near-future positions for all dynamic agents.

        TODO(phase-2):
          1. `agent_graph = self.graph_builder.build(occupancy_history)`
          2. Run `self.model(agent_graph.node_features, agent_graph.edge_index)`
          3. Convert raw model output into `DynamicAgentForecast` objects,
             one per agent, spanning `horizon_s` (defaults to
             `self.config.horizon_s`).
        """
        raise NotImplementedError
