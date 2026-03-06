import pandas as pd
import geopandas as gpd
from typing import Optional

# Import the base classes so the engine knows the contract types
from grids.h3_grid import SpatialGrid
from operators.allocation.base import AllocationOperator
from operators.aggregation.base import AggregationOperator
from operators.zoning.base import ZoningMappingOperator, ZoningAggregationOperator

class IntegrationPipeline:
    """
    The orchestration class that executes the formal spatial strategy.
    It maps heterogeneous datasets onto a common grid support.
    """
    def __init__(self, grid_system: SpatialGrid, allocator: AllocationOperator, aggregator: AggregationOperator):
        # Dependency Injection of S, R, and A_1
        self.grid_system = grid_system
        self.allocator = allocator
        self.aggregator = aggregator

    def run(self, source_gdf: gpd.GeoDataFrame, target_column: str, resolution: int) -> gpd.GeoDataFrame:
        """
        Executes the full pipeline and returns the final standardized grid dataset.
        """
        # 0. Safety Failsafe: Ensure a 'source_id' column exists for relational mapping
        if 'source_id' not in source_gdf.columns:
            source_gdf = source_gdf.copy()
            source_gdf['source_id'] = source_gdf.index.astype(str)

        # 1. Enforce Geometry Constraints (\mathcal{R}^{(k)})
        # This will raise an error if a user tries an invalid operation (e.g., Length on Polygons)
        self.allocator.validate_geometry(source_gdf)
        
        # 2. Generate the spatial grid support (S)
        bounds = tuple(source_gdf.total_bounds)
        grid_gdf = self.grid_system.generate_grid(bounds, resolution)
        
        # 3. Calculate spatial assignment weights (R)
        # Returns dataframe with columns: ['source_id', 'cell_id', 'weight']
        weights_df = self.allocator.calculate_weights(source_gdf, grid_gdf)
        
        # 4. Bind Source Attributes to Weights
        # We merge the actual dataset values onto the weights table using the source_id
        weights_df = weights_df.merge(
            source_gdf[['source_id', target_column]], 
            on='source_id', 
            how='inner'
        ).rename(columns={target_column: 'source_value'})
        
        # 5. Execute Mathematical Aggregation (A_1)
        # Returns dataframe with columns: ['cell_id', 'aggregated_value']
        final_values = self.aggregator.aggregate(weights_df, grid_gdf)
        
        # 6. Build the Final Output
        # Re-attach the aggregated values back to the grid geometries for map rendering
        final_grid_gdf = grid_gdf[['cell_id', 'geometry', 'area']].merge(
            final_values, 
            on='cell_id', 
            how='inner'
        )
        
        return final_grid_gdf


class ZonedIntegrationPipeline:
    """
    Extended pipeline that implements the full strategy composition:
    I = A_2 ∘ Z_map ∘ A_1 ∘ R
    
    Transforms heterogeneous datasets through:
    D^(k) → R → x_j (grid values) → Z → y_ℓ (zone values)
    """
    
    def __init__(
        self, 
        grid_system: SpatialGrid, 
        allocator: AllocationOperator, 
        grid_aggregator: AggregationOperator,
        zoning_mapper: ZoningMappingOperator,
        zoning_aggregator: ZoningAggregationOperator
    ):
        # S: Common spatial support (H3 grid)
        self.grid_system = grid_system
        # R: Allocation operator
        self.allocator = allocator
        # A_1: Cell-level aggregation
        self.grid_aggregator = grid_aggregator
        # Z_map: Zoning mapping operator  
        self.zoning_mapper = zoning_mapper
        # A_2: Zone-level aggregation
        self.zoning_aggregator = zoning_aggregator

    def run(
        self, 
        source_gdf: gpd.GeoDataFrame, 
        target_column: str, 
        resolution: int,
        zones_gdf: gpd.GeoDataFrame
    ) -> gpd.GeoDataFrame:
        """
        Executes the complete integration pipeline with zoning.
        
        Args:
            source_gdf: Input dataset with geometries and attributes
            target_column: Column name of the attribute to integrate
            resolution: H3 resolution for the common grid
            zones_gdf: Reporting zones to aggregate results into
            
        Returns:
            GeoDataFrame of zones with aggregated values
        """
        # 0. Ensure required ID columns exist
        if 'source_id' not in source_gdf.columns:
            source_gdf = source_gdf.copy()
            source_gdf['source_id'] = source_gdf.index.astype(str)
            
        if 'zone_id' not in zones_gdf.columns:
            zones_gdf = zones_gdf.copy()
            zones_gdf['zone_id'] = zones_gdf.index.astype(str)

        # 1. Validate geometry constraints for R^(k)
        self.allocator.validate_geometry(source_gdf)
        
        # 2. Generate common grid support S
        bounds = tuple(source_gdf.total_bounds)
        grid_gdf = self.grid_system.generate_grid(bounds, resolution)
        
        # 3. Allocation: R maps source geometries to grid cells
        # Returns: [source_id, cell_id, weight]
        weights_df = self.allocator.calculate_weights(source_gdf, grid_gdf)
        
        # 4. Bind source attribute values to allocation weights
        weights_df = weights_df.merge(
            source_gdf[['source_id', target_column]], 
            on='source_id', 
            how='inner'
        ).rename(columns={target_column: 'source_value'})
        
        # 5. Grid aggregation A_1: aggregate allocated values per cell
        # Returns: [cell_id, aggregated_value] or [cell_id, allocated_val]
        grid_values_df = self.grid_aggregator.aggregate(weights_df, grid_gdf)
        
        # 6. Zoning mapping: Z_map assigns grid cells to reporting zones
        # Returns: [cell_id, zone_id, gamma]
        zoning_weights_df = self.zoning_mapper.map_to_zones(grid_gdf, zones_gdf)
        
        # 7. Zoning aggregation A_2: aggregate cell values to zone level
        # Returns: [zone_id, zone_value]
        zone_values_df = self.zoning_aggregator.aggregate(
            zoning_weights_df, 
            grid_values_df, 
            zones_gdf
        )
        
        # 8. Build final output: attach values to zone geometries
        final_zones_gdf = zones_gdf[['zone_id', 'geometry']].merge(
            zone_values_df,
            on='zone_id',
            how='inner'
        )
        
        return final_zones_gdf
    
    def run_grid_only(
        self, 
        source_gdf: gpd.GeoDataFrame, 
        target_column: str, 
        resolution: int
    ) -> gpd.GeoDataFrame:
        """
        Runs only the grid-level integration (R → A_1) without zoning.
        Useful for visualization at the grid level.
        
        Returns:
            GeoDataFrame of grid cells with aggregated values
        """
        if 'source_id' not in source_gdf.columns:
            source_gdf = source_gdf.copy()
            source_gdf['source_id'] = source_gdf.index.astype(str)

        self.allocator.validate_geometry(source_gdf)
        
        bounds = tuple(source_gdf.total_bounds)
        grid_gdf = self.grid_system.generate_grid(bounds, resolution)
        
        weights_df = self.allocator.calculate_weights(source_gdf, grid_gdf)
        
        weights_df = weights_df.merge(
            source_gdf[['source_id', target_column]], 
            on='source_id', 
            how='inner'
        ).rename(columns={target_column: 'source_value'})
        
        grid_values_df = self.grid_aggregator.aggregate(weights_df, grid_gdf)
        
        final_grid_gdf = grid_gdf[['cell_id', 'geometry', 'area']].merge(
            grid_values_df, 
            on='cell_id', 
            how='inner'
        )
        
        return final_grid_gdf