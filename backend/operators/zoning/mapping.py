import pandas as pd
import geopandas as gpd
from .base import ZoningMappingOperator


class CentroidZoning(ZoningMappingOperator):
    """
    Assigns each grid cell to the zone containing its centroid.
    Uses binary assignment: γ_{jℓ} ∈ {0, 1}.
    """
    
    def map_to_zones(self, grid_gdf: gpd.GeoDataFrame, zones_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
        # Ensure zones have a zone_id column
        if 'zone_id' not in zones_gdf.columns:
            zones_gdf = zones_gdf.copy()
            zones_gdf['zone_id'] = zones_gdf.index.astype(str)
        
        # Create centroid geometries for spatial join
        centroids_gdf = grid_gdf[['cell_id', 'geometry']].copy()
        centroids_gdf['geometry'] = centroids_gdf.geometry.centroid
        
        # Spatial join: which zone contains each cell's centroid?
        joined = gpd.sjoin(
            centroids_gdf, 
            zones_gdf[['zone_id', 'geometry']], 
            how='inner', 
            predicate='within'
        )
        
        # Binary weight: cell is fully assigned to one zone
        joined['gamma'] = 1.0
        
        return joined[['cell_id', 'zone_id', 'gamma']].reset_index(drop=True)


class AreaWeightedZoning(ZoningMappingOperator):
    """
    Assigns grid cells to zones proportionally based on area overlap.
    γ_{jℓ} = Area(c_j ∩ z_ℓ) / Area(c_j)
    
    This preserves mass when redistributing cell values to zones.
    """
    
    def map_to_zones(self, grid_gdf: gpd.GeoDataFrame, zones_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
        # Ensure zones have a zone_id column
        if 'zone_id' not in zones_gdf.columns:
            zones_gdf = zones_gdf.copy()
            zones_gdf['zone_id'] = zones_gdf.index.astype(str)
        
        # Pre-calculate original cell areas if not present
        if 'area' not in grid_gdf.columns:
            grid_gdf = grid_gdf.copy()
            grid_gdf['area'] = grid_gdf.to_crs("EPSG:3857").geometry.area
        
        # Compute geometric intersection between cells and zones
        intersection = gpd.overlay(
            grid_gdf[['cell_id', 'geometry', 'area']], 
            zones_gdf[['zone_id', 'geometry']], 
            how='intersection'
        )
        
        # Calculate intersection area in projected CRS for accuracy
        intersection['intersection_area'] = intersection.to_crs("EPSG:3857").geometry.area
        
        # Gamma = intersection area / original cell area
        intersection['gamma'] = intersection['intersection_area'] / intersection['area']
        
        # Filter out negligible overlaps (floating point artifacts)
        intersection = intersection[intersection['gamma'] > 1e-6]
        
        return intersection[['cell_id', 'zone_id', 'gamma']].reset_index(drop=True)
