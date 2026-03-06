import pandas as pd
import geopandas as gpd
from .base import ZoningAggregationOperator


class SumZoning(ZoningAggregationOperator):
    """
    Sums weighted cell values into zones.
    y_ℓ = Σ_j γ_{jℓ} · x_j
    
    Appropriate for additive quantities (counts, totals, population).
    """
    
    def aggregate(self, zoning_weights_df: pd.DataFrame, grid_values_df: pd.DataFrame, zones_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
        # Merge cell values with zoning weights
        merged = zoning_weights_df.merge(grid_values_df, on='cell_id', how='inner')
        
        # Determine the value column name (handles both 'aggregated_value' and 'allocated_val')
        value_col = None
        for col in ['aggregated_value', 'allocated_val']:
            if col in merged.columns:
                value_col = col
                break
        
        if value_col is None:
            raise ValueError("Grid values must contain 'aggregated_value' or 'allocated_val' column")
        
        # Compute weighted contribution: gamma * cell_value
        merged['zone_contribution'] = merged['gamma'] * merged[value_col]
        
        # Sum contributions per zone
        result = merged.groupby('zone_id')['zone_contribution'].sum().reset_index()
        result.columns = ['zone_id', 'zone_value']
        
        return result


class WeightedMeanZoning(ZoningAggregationOperator):
    """
    Computes weighted mean of cell values within each zone.
    y_ℓ = Σ_j (γ_{jℓ} · x_j) / Σ_j γ_{jℓ}
    
    Appropriate for intensive properties (averages, rates, densities).
    """
    
    def aggregate(self, zoning_weights_df: pd.DataFrame, grid_values_df: pd.DataFrame, zones_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
        # Merge cell values with zoning weights
        merged = zoning_weights_df.merge(grid_values_df, on='cell_id', how='inner')
        
        # Determine the value column name
        value_col = None
        for col in ['aggregated_value', 'allocated_val']:
            if col in merged.columns:
                value_col = col
                break
        
        if value_col is None:
            raise ValueError("Grid values must contain 'aggregated_value' or 'allocated_val' column")
        
        # Compute weighted values
        merged['weighted_val'] = merged['gamma'] * merged[value_col]
        
        # Aggregate: sum of weighted values / sum of weights
        agg = merged.groupby('zone_id').agg(
            sum_weighted_val=('weighted_val', 'sum'),
            sum_gamma=('gamma', 'sum')
        ).reset_index()
        
        # Compute weighted mean
        agg['zone_value'] = agg['sum_weighted_val'] / agg['sum_gamma']
        
        # Handle division by zero
        agg['zone_value'] = agg['zone_value'].fillna(0)
        
        return agg[['zone_id', 'zone_value']]


class DensityZoning(ZoningAggregationOperator):
    """
    Computes density by dividing summed cell values by zone area.
    y_ℓ = Σ_j (γ_{jℓ} · x_j) / Area(z_ℓ)
    
    Appropriate for computing population density, event density per zone.
    """
    
    def aggregate(self, zoning_weights_df: pd.DataFrame, grid_values_df: pd.DataFrame, zones_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
        # Ensure zones have area calculated
        if 'zone_area' not in zones_gdf.columns:
            zones_gdf = zones_gdf.copy()
            zones_gdf['zone_area'] = zones_gdf.to_crs("EPSG:3857").geometry.area
        
        # Merge cell values with zoning weights
        merged = zoning_weights_df.merge(grid_values_df, on='cell_id', how='inner')
        
        # Determine the value column name
        value_col = None
        for col in ['aggregated_value', 'allocated_val']:
            if col in merged.columns:
                value_col = col
                break
        
        if value_col is None:
            raise ValueError("Grid values must contain 'aggregated_value' or 'allocated_val' column")
        
        # Compute weighted contribution
        merged['zone_contribution'] = merged['gamma'] * merged[value_col]
        
        # Sum contributions per zone
        summed = merged.groupby('zone_id')['zone_contribution'].sum().reset_index()
        summed.columns = ['zone_id', 'total_value']
        
        # Merge with zone areas
        result = summed.merge(zones_gdf[['zone_id', 'zone_area']], on='zone_id', how='left')
        
        # Compute density
        result['zone_value'] = result['total_value'] / result['zone_area']
        result['zone_value'] = result['zone_value'].fillna(0)
        
        return result[['zone_id', 'zone_value']]
