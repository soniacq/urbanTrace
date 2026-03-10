import pandas as pd
import geopandas as gpd
from typing import Optional, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

# Import the base classes so the engine knows the contract types
from grids.h3_grid import SpatialGrid
from operators.allocation.base import AllocationOperator
from operators.aggregation.base import AggregationOperator
from operators.zoning.base import ZoningMappingOperator, ZoningAggregationOperator


@dataclass
class VariableTrackConfig:
    """Configuration for a single variable's processing track."""
    source_gdf: gpd.GeoDataFrame
    target_column: str
    output_name: str  # Column name in final merged output
    allocator: AllocationOperator
    grid_aggregator: AggregationOperator
    zoning_mapper: Optional[ZoningMappingOperator] = None
    zoning_aggregator: Optional[ZoningAggregationOperator] = None

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
    
    def run_grid_with_zone_values(
        self, 
        source_gdf: gpd.GeoDataFrame, 
        target_column: str, 
        resolution: int,
        zones_gdf: gpd.GeoDataFrame
    ) -> gpd.GeoDataFrame:
        """
        Runs the full zoned integration, then paints zone values back to grid cells.
        
        Pipeline: D^(k) → R → A_1 → x_j → Z_map → A_2 → y_ℓ → paint back to cells
        
        Each H3 cell receives the aggregated value of the zone it belongs to.
        For cells overlapping multiple zones, uses weighted average based on gamma.
        
        Returns:
            GeoDataFrame of grid cells with zone-aggregated values
        """
        # 0. Ensure required ID columns exist
        if 'source_id' not in source_gdf.columns:
            source_gdf = source_gdf.copy()
            source_gdf['source_id'] = source_gdf.index.astype(str)
            
        if 'zone_id' not in zones_gdf.columns:
            zones_gdf = zones_gdf.copy()
            zones_gdf['zone_id'] = zones_gdf.index.astype(str)

        # 1. Validate geometry constraints
        self.allocator.validate_geometry(source_gdf)
        
        # 2. Generate common grid support S
        bounds = tuple(source_gdf.total_bounds)
        grid_gdf = self.grid_system.generate_grid(bounds, resolution)
        
        # 3. Allocation: R maps source geometries to grid cells
        weights_df = self.allocator.calculate_weights(source_gdf, grid_gdf)
        
        # 4. Bind source attribute values to allocation weights
        weights_df = weights_df.merge(
            source_gdf[['source_id', target_column]], 
            on='source_id', 
            how='inner'
        ).rename(columns={target_column: 'source_value'})
        
        # 5. Grid aggregation A_1
        grid_values_df = self.grid_aggregator.aggregate(weights_df, grid_gdf)
        
        # 6. Zoning mapping: Z_map assigns grid cells to reporting zones
        zoning_weights_df = self.zoning_mapper.map_to_zones(grid_gdf, zones_gdf)
        
        # 7. Zoning aggregation A_2: get zone-level values
        zone_values_df = self.zoning_aggregator.aggregate(
            zoning_weights_df, 
            grid_values_df, 
            zones_gdf
        )
        
        # 8. PAINT BACK: Assign zone values to cells
        # Join zone values onto the zoning weights (cell_id, zone_id, gamma)
        cell_zone_values = zoning_weights_df.merge(
            zone_values_df,
            on='zone_id',
            how='inner'
        )
        
        # For cells in multiple zones, compute weighted average of zone values
        # Weighted by gamma (the cell-to-zone mapping weight)
        cell_zone_values['weighted_zone_val'] = cell_zone_values['gamma'] * cell_zone_values['zone_value']
        
        cell_aggregated = cell_zone_values.groupby('cell_id').agg(
            sum_weighted_val=('weighted_zone_val', 'sum'),
            sum_gamma=('gamma', 'sum')
        ).reset_index()
        
        cell_aggregated['zone_aggregated_value'] = cell_aggregated['sum_weighted_val'] / cell_aggregated['sum_gamma']
        cell_aggregated['zone_aggregated_value'] = cell_aggregated['zone_aggregated_value'].fillna(0)
        
        # 9. Build final output: grid cells with zone-aggregated values
        final_grid_gdf = grid_gdf[['cell_id', 'geometry', 'area']].merge(
            cell_aggregated[['cell_id', 'zone_aggregated_value']],
            on='cell_id',
            how='inner'
        )
        
        return final_grid_gdf
    
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


class MultivariateIntegrationPipeline:
    """
    Parallel processing pipeline for multivariate spatial analysis.
    
    Supports multiple variables with independent mathematical rules,
    merged into a unified grid and/or zone output.
    
    Architecture:
    - Step 1: Parallel Source → Grid tracks (each variable uses its own R + A_1)
    - Step 1.5: Merge on cell_id → Unified Grid
    - Step 2: Parallel Grid → Zone tracks (each variable uses its own Z_map + A_2)
    - Step 3: Merge on zone_id → Unified Zones
    """
    
    def __init__(self, grid_system: SpatialGrid):
        self.grid_system = grid_system
    
    def _process_grid_track(
        self,
        track: VariableTrackConfig,
        grid_gdf: gpd.GeoDataFrame
    ) -> pd.DataFrame:
        """
        Process a single variable track through Source → Grid.
        Returns DataFrame with [cell_id, {output_name}]
        """
        source_gdf = track.source_gdf.copy()
        
        # Ensure source_id exists
        if 'source_id' not in source_gdf.columns:
            source_gdf['source_id'] = source_gdf.index.astype(str)
        
        # Validate geometry
        track.allocator.validate_geometry(source_gdf)
        
        # Calculate allocation weights
        weights_df = track.allocator.calculate_weights(source_gdf, grid_gdf)
        
        # Bind source values
        weights_df = weights_df.merge(
            source_gdf[['source_id', track.target_column]],
            on='source_id',
            how='inner'
        ).rename(columns={track.target_column: 'source_value'})
        
        # Aggregate to grid cells
        grid_values_df = track.grid_aggregator.aggregate(weights_df, grid_gdf)
        
        # Standardize output column name
        value_col = 'aggregated_value' if 'aggregated_value' in grid_values_df.columns else 'allocated_val'
        result = grid_values_df[['cell_id', value_col]].copy()
        result = result.rename(columns={value_col: track.output_name})
        
        return result
    
    def _process_zone_track(
        self,
        track: VariableTrackConfig,
        grid_values_df: pd.DataFrame,
        zoning_weights_df: pd.DataFrame,
        zones_gdf: gpd.GeoDataFrame
    ) -> pd.DataFrame:
        """
        Process a single variable track through Grid → Zone.
        Returns DataFrame with [zone_id, {output_name}]
        """
        # Prepare grid values with expected column name
        prepared_grid = grid_values_df[['cell_id', track.output_name]].copy()
        prepared_grid = prepared_grid.rename(columns={track.output_name: 'aggregated_value'})
        
        # Run zoning aggregation
        zone_values_df = track.zoning_aggregator.aggregate(
            zoning_weights_df,
            prepared_grid,
            zones_gdf
        )
        
        # Rename output column
        zone_values_df = zone_values_df.rename(columns={'zone_value': track.output_name})
        
        return zone_values_df
    
    def run(
        self,
        tracks: List[VariableTrackConfig],
        resolution: int,
        zones_gdf: Optional[gpd.GeoDataFrame] = None,
        output_mode: str = "grid",  # "grid" | "zones" | "both"
        max_workers: int = 4
    ) -> Dict[str, Any]:
        """
        Execute the multivariate pipeline with parallel processing.
        
        Args:
            tracks: List of variable track configurations
            resolution: H3 grid resolution
            zones_gdf: Optional reporting zones for zoning output
            output_mode: "grid", "zones", or "both"
            max_workers: Number of parallel threads
            
        Returns:
            Dict with 'grid' and/or 'zones' GeoDataFrames based on output_mode
        """
        if not tracks:
            raise ValueError("At least one variable track is required")
        
        # Compute combined bounds from all source datasets
        all_bounds = []
        for track in tracks:
            all_bounds.append(track.source_gdf.total_bounds)
        
        # Union of all bounds
        combined_bounds = (
            min(b[0] for b in all_bounds),  # minx
            min(b[1] for b in all_bounds),  # miny
            max(b[2] for b in all_bounds),  # maxx
            max(b[3] for b in all_bounds)   # maxy
        )
        
        # Generate unified grid
        grid_gdf = self.grid_system.generate_grid(combined_bounds, resolution)
        
        # =====================================================================
        # STEP 1: Parallel Grid Generation (Source → Grid)
        # =====================================================================
        grid_results = {}
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_track = {
                executor.submit(self._process_grid_track, track, grid_gdf): track
                for track in tracks
            }
            
            for future in as_completed(future_to_track):
                track = future_to_track[future]
                try:
                    result_df = future.result()
                    grid_results[track.output_name] = result_df
                except Exception as e:
                    raise RuntimeError(f"Error processing track '{track.output_name}': {e}")
        
        # =====================================================================
        # STEP 1.5: First Merge (Unified Grid)
        # Keep only cells that have data from at least one variable
        # =====================================================================
        
        # First, merge all variable results together
        all_var_dfs = list(grid_results.values())
        merged_vars = all_var_dfs[0]
        
        for var_df in all_var_dfs[1:]:
            merged_vars = merged_vars.merge(var_df, on='cell_id', how='outer')
        
        # Now join with grid_gdf to get geometries (inner join to only keep data cells)
        unified_grid = grid_gdf[['cell_id', 'geometry', 'area']].merge(
            merged_vars, on='cell_id', how='inner'
        )
        
        # Fill NaN values with 0 for cells that exist in one dataset but not another
        for var_name in grid_results.keys():
            if var_name in unified_grid.columns:
                unified_grid[var_name] = unified_grid[var_name].fillna(0)
        
        # Convert to GeoDataFrame
        unified_grid = gpd.GeoDataFrame(unified_grid, geometry='geometry')
        
        result = {}
        
        if output_mode in ("grid", "both"):
            result['grid'] = unified_grid
        
        # =====================================================================
        # STEP 2 & 3: Zone Processing (if needed)
        # =====================================================================
        if output_mode in ("zones", "both") and zones_gdf is not None:
            # Ensure zone_id exists
            zones_gdf = zones_gdf.copy()
            if 'zone_id' not in zones_gdf.columns:
                zones_gdf['zone_id'] = zones_gdf.index.astype(str)
            
            # Filter tracks that have zoning configuration
            zoned_tracks = [t for t in tracks if t.zoning_mapper and t.zoning_aggregator]
            
            if not zoned_tracks:
                raise ValueError("No tracks have zoning configuration for zone output")
            
            # Use the first track's zoning mapper to compute cell-to-zone weights
            # (All tracks share the same grid-to-zone mapping weights)
            zoning_weights_df = zoned_tracks[0].zoning_mapper.map_to_zones(unified_grid, zones_gdf)
            
            # Extract grid values from unified_grid for each variable
            unified_grid_values = {}
            for track in zoned_tracks:
                var_grid = unified_grid[['cell_id', track.output_name]].copy()
                unified_grid_values[track.output_name] = var_grid
            
            # Parallel Zone Aggregation
            zone_results = {}
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_track = {
                    executor.submit(
                        self._process_zone_track,
                        track,
                        unified_grid_values[track.output_name],
                        zoning_weights_df,
                        zones_gdf
                    ): track
                    for track in zoned_tracks
                }
                
                for future in as_completed(future_to_track):
                    track = future_to_track[future]
                    try:
                        result_df = future.result()
                        zone_results[track.output_name] = result_df
                    except Exception as e:
                        raise RuntimeError(f"Error zoning track '{track.output_name}': {e}")
            
            # Final Zone Merge - use left join to keep all zones
            unified_zones = zones_gdf[['zone_id', 'geometry']].copy()
            
            for var_name, var_df in zone_results.items():
                unified_zones = unified_zones.merge(var_df, on='zone_id', how='left')
            
            # Fill NaN with 0 for zones with no intersecting cells
            for var_name in zone_results.keys():
                if var_name in unified_zones.columns:
                    unified_zones[var_name] = unified_zones[var_name].fillna(0)
            
            # Convert to GeoDataFrame
            unified_zones = gpd.GeoDataFrame(unified_zones, geometry='geometry')
            
            result['zones'] = unified_zones
        
        return result