from abc import ABC, abstractmethod
import pandas as pd
import geopandas as gpd


class ZoningMappingOperator(ABC):
    """
    Abstract base class for zoning mapping operators.
    Maps grid cells to reporting zones via weights γ_{jℓ}.
    """
    
    @abstractmethod
    def map_to_zones(self, grid_gdf: gpd.GeoDataFrame, zones_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
        """
        Maps grid cells to zones.
        
        Args:
            grid_gdf: GeoDataFrame with columns ['cell_id', 'geometry', ...]
            zones_gdf: GeoDataFrame with columns ['zone_id', 'geometry', ...]
            
        Returns:
            DataFrame with columns ['cell_id', 'zone_id', 'gamma']
            where gamma is the contribution weight of cell to zone.
        """
        pass


class ZoningAggregationOperator(ABC):
    """
    Abstract base class for zoning aggregation operators (A_2).
    Aggregates grid-cell values to zone-level indicators.
    """
    
    @abstractmethod
    def aggregate(self, zoning_weights_df: pd.DataFrame, grid_values_df: pd.DataFrame, zones_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
        """
        Aggregates cell-level values to zones.
        
        Args:
            zoning_weights_df: DataFrame with columns ['cell_id', 'zone_id', 'gamma']
            grid_values_df: DataFrame with columns ['cell_id', 'aggregated_value'] (output from A_1)
            zones_gdf: GeoDataFrame with zone geometries and metadata
            
        Returns:
            DataFrame with columns ['zone_id', 'zone_value']
        """
        pass
