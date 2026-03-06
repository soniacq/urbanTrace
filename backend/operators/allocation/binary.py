import pandas as pd
import geopandas as gpd
from .base import AllocationOperator

class BinaryContainment(AllocationOperator):
    @property
    def supported_geometries(self): return ['Point', 'MultiPoint']
    
    def calculate_weights(self, source_gdf, grid_gdf):
        # Spatial join: which points intersect which grid cells
        joined = gpd.sjoin(source_gdf, grid_gdf, how='inner', predicate='intersects')
        joined['weight'] = 1.0
        return joined[['source_id', 'cell_id', 'weight']]

class BinaryCentroidContainment(AllocationOperator):
    @property
    def supported_geometries(self): return ['Point', 'MultiPoint', 'Polygon', 'MultiPolygon']
    
    def calculate_weights(self, source_gdf, grid_gdf):
        # Temporarily replace geometry with centroids
        centroids = source_gdf.copy()
        centroids.geometry = centroids.geometry.centroid
        
        joined = gpd.sjoin(centroids, grid_gdf, how='inner', predicate='within')
        joined['weight'] = 1.0
        return joined[['source_id', 'cell_id', 'weight']]

class NearestAssignment(AllocationOperator):
    @property
    def supported_geometries(self): return ['Point', 'MultiPoint']
    
    def calculate_weights(self, source_gdf, grid_gdf):
        # sjoin_nearest finds the single closest grid cell geometry for each point
        joined = gpd.sjoin_nearest(source_gdf, grid_gdf, how='inner')
        joined['weight'] = 1.0
        return joined[['source_id', 'cell_id', 'weight']]