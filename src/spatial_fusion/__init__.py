"""Spatial Fusion and Voxelization Layer (Phase 1).

Ingests multi-sensor input (LIDAR, camera, radar) and constructs a real-time
probabilistic 3D occupancy representation (VoxelGrid) of the vehicle's
surroundings, explicitly modeling sensor noise and uncertainty.
"""
from src.spatial_fusion.occupancy_fusion import OccupancyFusionEngine
from src.spatial_fusion.voxel_grid import VoxelGridBuilder

__all__ = ["OccupancyFusionEngine", "VoxelGridBuilder"]
