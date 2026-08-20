"""Signed Distance Field (SDF) construction and querying.

Provides fast, differentiable-friendly distance queries from any point in
space to the nearest occupied surface, used by the safety certifier to
compute precise safety margins along a swept volume.
"""
from __future__ import annotations

import numpy as np

from src.common.types import VoxelGrid


class SignedDistanceField:
    """A discretized signed distance field derived from a VoxelGrid.

    Positive values indicate free space (distance to nearest occupied
    surface); negative values indicate the query point is inside occupied
    space (collision).
    """

    def __init__(self, sdf_values: np.ndarray, resolution_m: float, origin: tuple[float, float, float]) -> None:
        self.sdf_values = sdf_values
        self.resolution_m = resolution_m
        self.origin = origin

    @classmethod
    def from_voxel_grid(cls, grid: VoxelGrid, occupancy_threshold: float = 0.5) -> "SignedDistanceField":
        """Build an SDF from a probabilistic VoxelGrid.

        TODO(phase-1): threshold `grid.occupancy` at `occupancy_threshold` to
        obtain a binary occupancy mask, then run a distance transform
        (e.g. Euclidean Distance Transform) to produce `sdf_values`, matching
        the grid's resolution/origin.
        """
        raise NotImplementedError

    def query(self, point_xyz: np.ndarray) -> float:
        """Return the signed distance (meters) from `point_xyz` to the nearest
        occupied surface via trilinear interpolation of `sdf_values`."""
        raise NotImplementedError

    def query_batch(self, points_xyz: np.ndarray) -> np.ndarray:
        """Vectorized version of `query` for an (N, 3) array of points."""
        raise NotImplementedError
