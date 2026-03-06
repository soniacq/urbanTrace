import pandas as pd
import geopandas as gpd
from .base import AllocationOperator

class ProportionalAreaWeighted(AllocationOperator):
    @property
    def supported_geometries(self): return ['Polygon', 'MultiPolygon']
    
    def calculate_weights(self, source_gdf, grid_gdf):
        # Pre-calculate original area to preserve mass
        source_gdf['orig_area'] = source_gdf.geometry.area
        
        # Intersect polygons with the grid
        intersection = gpd.overlay(source_gdf, grid_gdf, how='intersection')
        
        # Calculate weight: intersection area / original area
        intersection['weight'] = intersection.geometry.area / intersection['orig_area']
        
        return intersection[['source_id', 'cell_id', 'weight']]

class ProportionalLengthWeighted(AllocationOperator):
    @property
    def supported_geometries(self): return ['LineString', 'MultiLineString']
    
    def calculate_weights(self, source_gdf, grid_gdf):
        # Pre-calculate original length
        source_gdf['orig_length'] = source_gdf.geometry.length
        
        # Intersect lines with the grid
        intersection = gpd.overlay(source_gdf, grid_gdf, how='intersection')
        
        # Calculate weight: intersected segment length / original line length
        intersection['weight'] = intersection.geometry.length / intersection['orig_length']
        
        return intersection[['source_id', 'cell_id', 'weight']]