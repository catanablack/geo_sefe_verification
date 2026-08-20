"""Voxel grid construction from fused sensor frames."""
from __future__ import annotations

from typing import Iterable

import numpy as np

from src.common.config import VoxelizationConfig
from src.common.types import VoxelGrid
from src.spatial_fusion.sensor_ingestion import SensorFrame


class VoxelGridBuilder:
    """Builds a probabilistic 3D occupancy grid from one or more `SensorFrame`s.

    This is a direct extension of the voxel/slice-based spatial representation
    pipeline previously deployed in manufacturing environments, adapted here to
    real-time automotive sensor rates.
    """

    def __init__(self, config: VoxelizationConfig = VoxelizationConfig()) -> None:
        self.config = config

    def build(self, frames: Iterable[SensorFrame]) -> VoxelGrid:
        """Fuse `frames` into a single probabilistic `VoxelGrid`.

        TODO(phase-1):
          - Bin points into voxels at `config.resolution_m`.
          - Accumulate per-voxel occupancy probability via log-odds update
            (Bayesian occupancy filter), weighted by `point_confidence`.
          - Derive per-voxel `uncertainty` from sensor noise models and the
            number/spread of contributing observations.
        """
        raise NotImplementedError

    def empty_grid(self, dims: tuple[int, int, int]) -> VoxelGrid:
        """Return a zero-initialized VoxelGrid, useful for tests and simulation seeding."""
        occupancy = np.zeros(dims, dtype=np.float32)
        uncertainty = np.ones(dims, dtype=np.float32)
        return VoxelGrid(
            resolution_m=self.config.resolution_m,
            origin=(0.0, 0.0, 0.0),
            occupancy=occupancy,
            uncertainty=uncertainty,
        )
