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