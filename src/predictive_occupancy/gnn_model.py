"""Graph neural network model for dynamic-agent trajectory forecasting.

A message-passing GNN over the `AgentGraph` produced by `graph_builder`,
predicting each agent's future positions over the configured forecast
horizon (see common.config.ForecastConfig).
"""
from __future__ import annotations

try:
    import torch
    import torch.nn as nn
except ImportError:  # pragma: no cover - torch is an optional/deferred dependency for this sketch
    torch = None  # type: ignore
    nn = object  # type: ignore


class GNNForecastModel(nn.Module):  # type: ignore[misc]
    """Message-passing GNN predicting future agent positions.

    TODO(phase-2):
      - Encode `AgentGraph.node_features` with a per-node MLP encoder.
      - Apply K rounds of message passing over `edge_index` (e.g. GAT/GraphSAGE
        layers via torch_geometric) to model agent-agent interaction.
      - Decode a sequence of future (x, y, heading) predictions per agent over
        the forecast horizon, with an auxiliary confidence/uncertainty head.
    """

    def __init__(self, node_feature_dim: int, hidden_dim: int = 128, forecast_steps: int = 30) -> None:
        super().__init__()
        self.node_feature_dim = node_feature_dim
        self.hidden_dim = hidden_dim
        self.forecast_steps = forecast_steps
        # TODO(phase-2): define encoder / message-passing / decoder layers.

    def forward(self, node_features, edge_index):  # noqa: ANN001 - torch tensors
        raise NotImplementedError
