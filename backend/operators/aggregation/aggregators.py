import pandas as pd
import geopandas as gpd
from .base import AggregationOperator

class SumAggregation(AggregationOperator):
    def aggregate(self, weights_df, grid_gdf):
        weights_df['allocated_val'] = weights_df['weight'] * weights_df['source_value']
        return weights_df.groupby('cell_id')['allocated_val'].sum().reset_index()

class MeanAggregation(AggregationOperator):
    def aggregate(self, weights_df, grid_gdf):
        return weights_df.groupby('cell_id')['source_value'].mean().reset_index()

class WeightedMeanAggregation(AggregationOperator):
    def aggregate(self, weights_df, grid_gdf):
        weights_df['weighted_val'] = weights_df['weight'] * weights_df['source_value']
        agg = weights_df.groupby('cell_id').agg(
            sum_weighted_val=('weighted_val', 'sum'),
            sum_weights=('weight', 'sum')
        ).reset_index()
        agg['aggregated_value'] = agg['sum_weighted_val'] / agg['sum_weights']
        
        # Clean up NaNs from divide-by-zero if sum_weights is 0
        agg['aggregated_value'] = agg['aggregated_value'].fillna(0)
        return agg[['cell_id', 'aggregated_value']]

class DensityAggregation(AggregationOperator):
    def aggregate(self, weights_df, grid_gdf):
        weights_df['allocated_val'] = weights_df['weight'] * weights_df['source_value']
        summed = weights_df.groupby('cell_id')['allocated_val'].sum().reset_index()
        
        merged = summed.merge(grid_gdf[['cell_id', 'area']], on='cell_id')
        merged['aggregated_value'] = merged['allocated_val'] / merged['area']
        return merged[['cell_id', 'aggregated_value']]


# ==============================================================================
# Discrete Selection Operators (for categorical/index data)
# ==============================================================================

class MajorityAggregation(AggregationOperator):
    """
    Selects the source value with the largest weight contribution to each cell.
    aggregated_value_j = argmax_v Σ_{i: source_value_i=v} weight_{ij}
    
    This is the "spatial mode" - picks the value that dominates the cell.
    Appropriate for categorical data or rigid indices (like HVI) where
    interpolated values are invalid.
    """
    def aggregate(self, weights_df, grid_gdf):
        # Sum weights for each (cell, value) combination
        value_weights = weights_df.groupby(['cell_id', 'source_value'])['weight'].sum().reset_index()
        
        # Select value with maximum weight per cell
        idx = value_weights.groupby('cell_id')['weight'].idxmax()
        result = value_weights.loc[idx, ['cell_id', 'source_value']].reset_index(drop=True)
        result.columns = ['cell_id', 'aggregated_value']
        
        return result


class MaxAggregation(AggregationOperator):
    """
    Selects the maximum source value intersecting each cell.
    aggregated_value_j = max_{i: weight_{ij} > 0} source_value_i
    
    Appropriate for worst-case/upper-bound analysis (e.g., maximum risk,
    peak pollution level within a cell).
    """
    def aggregate(self, weights_df, grid_gdf):
        # Only consider sources that actually contribute to the cell (weight > 0)
        intersecting = weights_df[weights_df['weight'] > 0]
        
        # Get max value per cell
        result = intersecting.groupby('cell_id')['source_value'].max().reset_index()
        result.columns = ['cell_id', 'aggregated_value']
        
        return result


class MinAggregation(AggregationOperator):
    """
    Selects the minimum source value intersecting each cell.
    aggregated_value_j = min_{i: weight_{ij} > 0} source_value_i
    
    Appropriate for best-case/lower-bound analysis (e.g., minimum risk,
    lowest service level within a cell).
    """
    def aggregate(self, weights_df, grid_gdf):
        # Only consider sources that actually contribute to the cell (weight > 0)
        intersecting = weights_df[weights_df['weight'] > 0]
        
        # Get min value per cell
        result = intersecting.groupby('cell_id')['source_value'].min().reset_index()
        result.columns = ['cell_id', 'aggregated_value']
        
        return result


# ==============================================================================
# Line Network Operators (for street/transit geometries)
# ==============================================================================

class LengthWeightedAggregation(AggregationOperator):
    """
    Computes weighted mean based on linear length overlap.
    aggregated_value_j = Σ_i (λ_{ij} · v_i) / Σ_i λ_{ij}
    
    where λ_{ij} is the length weight from ProportionalLengthWeighted allocation.
    This is the aggregation-side counterpart to ProportionalLengthWeighted.
    Appropriate for street networks and transit lines.
    """
    def aggregate(self, weights_df, grid_gdf):
        # Weights from ProportionalLengthWeighted already represent length proportions
        weights_df['weighted_val'] = weights_df['weight'] * weights_df['source_value']
        
        agg = weights_df.groupby('cell_id').agg(
            sum_weighted_val=('weighted_val', 'sum'),
            sum_weights=('weight', 'sum')
        ).reset_index()
        
        agg['aggregated_value'] = agg['sum_weighted_val'] / agg['sum_weights']
        agg['aggregated_value'] = agg['aggregated_value'].fillna(0)
        
        return agg[['cell_id', 'aggregated_value']]