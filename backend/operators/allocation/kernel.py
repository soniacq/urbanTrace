import pandas as pd
import geopandas as gpd
import numpy as np
from .base import AllocationOperator

class GaussianKernel(AllocationOperator):
    def __init__(self, bandwidth=1000):
        # Bandwidth acts as the standard deviation (\sigma) in meters
        self.bandwidth = bandwidth

    @property
    def supported_geometries(self): return ['Point', 'MultiPoint', 'LineString', 'MultiLineString']
    
    def calculate_weights(self, source_gdf, grid_gdf):
        # Note: In a production environment with massive grids, you would use an 
        # r-tree spatial index to buffer and filter cells before doing this math 
        # to avoid a Cartesian product. 
        
        grid_centroids = grid_gdf.copy()
        grid_centroids.geometry = grid_centroids.geometry.centroid

        weights_list = []
        for idx, source_row in source_gdf.iterrows():
            # Calculate distance from this source geometry to all grid centroids
            distances = grid_centroids.geometry.distance(source_row.geometry)
            
            # Apply Gaussian decay: w = exp(-d^2 / (2 * sigma^2))
            decay = np.exp(-(distances**2) / (2 * self.bandwidth**2))
            
            # Filter out near-zero weights to save memory
            valid_cells = grid_centroids[decay > 0.01].copy()
            valid_weights = decay[decay > 0.01]
            
            df = pd.DataFrame({
                'source_id': source_row['source_id'],
                'cell_id': valid_cells['cell_id'],
                'weight': valid_weights
            })
            weights_list.append(df)
            
        return pd.concat(weights_list, ignore_index=True)