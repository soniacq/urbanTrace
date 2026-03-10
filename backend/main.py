from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import geopandas as gpd
import json
import os

# --- Imports for Formal Integration Engine ---
from integration_engine import IntegrationPipeline, ZonedIntegrationPipeline, MultivariateIntegrationPipeline, VariableTrackConfig
from grids.h3_grid import H3GridSystem

from operators.allocation.binary import BinaryContainment, BinaryCentroidContainment, NearestAssignment
from operators.allocation.proportional import ProportionalAreaWeighted, ProportionalLengthWeighted
from operators.allocation.kernel import GaussianKernel

from operators.aggregation.aggregators import (
    SumAggregation, MeanAggregation, WeightedMeanAggregation, DensityAggregation,
    MajorityAggregation, MaxAggregation, MinAggregation, LengthWeightedAggregation
)

from operators.zoning.mapping import CentroidZoning, AreaWeightedZoning
from operators.zoning.aggregators import (
    SumZoning, WeightedMeanZoning, DensityZoning,
    MajorityZoning, MaxZoning, MinZoning, LengthWeightedZoning
)

# --- Imports for Map Algebra Engine ---
from h3_engine import rasterize_geojson_to_h3 

# ==========================================
# 1. APP SETUP & CONSTANTS
# ==========================================

app = FastAPI(title="UrbanTrace Spatial API")

# Allow the React frontend to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "*"], # Vite's default port + fallback
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory pointing to the data folder
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# Operator Registries for Formal Integration
ALLOCATION_REGISTRY = {
    "BinaryContainment": BinaryContainment,
    "BinaryCentroidContainment": BinaryCentroidContainment,
    "ProportionalAreaWeighted": ProportionalAreaWeighted,
    "ProportionalLengthWeighted": ProportionalLengthWeighted,
    "NearestAssignment": NearestAssignment,
    "GaussianKernel": GaussianKernel
}

AGGREGATION_REGISTRY = {
    # Mathematical operators (continuous/additive data)
    "SumAggregation": SumAggregation,
    "MeanAggregation": MeanAggregation,
    "WeightedMeanAggregation": WeightedMeanAggregation,
    "DensityAggregation": DensityAggregation,
    # Discrete selection operators (categorical/index data)
    "MajorityAggregation": MajorityAggregation,
    "MaxAggregation": MaxAggregation,
    "MinAggregation": MinAggregation,
    # Line network operators (street/transit geometries)
    "LengthWeightedAggregation": LengthWeightedAggregation
}

# Zoning Operator Registries
ZONING_MAPPING_REGISTRY = {
    "CentroidZoning": CentroidZoning,
    "AreaWeightedZoning": AreaWeightedZoning
}

ZONING_AGGREGATION_REGISTRY = {
    # Mathematical operators (for continuous/additive data)
    "SumZoning": SumZoning,
    "WeightedMeanZoning": WeightedMeanZoning,
    "DensityZoning": DensityZoning,
    # Discrete selection operators (for categorical/index data)
    "MajorityZoning": MajorityZoning,
    "MaxZoning": MaxZoning,
    "MinZoning": MinZoning,
    # Line network operators (for street/transit geometries)
    "LengthWeightedZoning": LengthWeightedZoning
}

# Geometry constraints for valid operator selection
GEOMETRY_CONSTRAINTS = {
    "Point": ["BinaryContainment", "BinaryCentroidContainment", "NearestAssignment", "GaussianKernel"],
    "MultiPoint": ["BinaryContainment", "BinaryCentroidContainment", "NearestAssignment", "GaussianKernel"],
    "LineString": ["ProportionalLengthWeighted", "GaussianKernel"],
    "MultiLineString": ["ProportionalLengthWeighted", "GaussianKernel"],
    "Polygon": ["ProportionalAreaWeighted", "BinaryCentroidContainment"],
    "MultiPolygon": ["ProportionalAreaWeighted", "BinaryCentroidContainment"]
}

# ==========================================
# 2. PYDANTIC REQUEST MODELS
# ==========================================

class IntegrationRequest(BaseModel):
    """Payload for the formal mathematical spatial integration (I = A_1 ∘ R)."""
    dataset_path: str        
    target_column: str       
    allocation_operator: str 
    aggregation_operator: str 
    resolution: int          

class OperationRequest(BaseModel):
    """Payload for fast map algebra (intersect, union, preview)."""
    operationType: str          
    datasetIds: list[str]       
    resolution: int = 9


class ZonedIntegrationRequest(BaseModel):
    """
    Payload for full zoned integration pipeline: I = A_2 ∘ Z_map ∘ A_1 ∘ R
    Transforms source data through grid to reporting zones.
    """
    dataset_path: str              # Source dataset filename
    target_column: str             # Attribute column to integrate
    allocation_operator: str       # R: spatial allocation method
    grid_aggregation_operator: str # A_1: cell-level aggregation
    zoning_mapping_operator: str   # Z_map: cell-to-zone mapping
    zoning_aggregation_operator: str  # A_2: zone-level aggregation
    zones_path: str                # Reporting zones dataset filename
    resolution: int = 9            # H3 grid resolution
    output_mode: str = "zones"     # "grid" | "zones" | "both"


class VariableConfigRequest(BaseModel):
    """Configuration for a single variable in multivariate analysis."""
    dataset_path: str              # Source dataset filename
    target_column: str             # Attribute column to integrate
    output_name: Optional[str] = None  # Column name in merged output (defaults to target_column)
    allocation_operator: str       # R: spatial allocation method
    grid_aggregation_operator: str # A_1: cell-level aggregation
    zoning_mapping_operator: Optional[str] = None   # Z_map: cell-to-zone mapping
    zoning_aggregation_operator: Optional[str] = None  # A_2: zone-level aggregation


class MultivariateIntegrationRequest(BaseModel):
    """
    Payload for multivariate spatial analysis with parallel processing.
    
    Supports multiple datasets with independent mathematical rules,
    merged into unified grid and/or zone output.
    """
    variables: List[VariableConfigRequest]  # List of variable configurations
    zones_path: Optional[str] = None        # Optional reporting zones
    resolution: int = 9                     # H3 grid resolution
    output_mode: str = "grid"               # "grid" | "zones" | "both"


# ==========================================
# 3. DATASET MANAGEMENT ENDPOINTS
# ==========================================

@app.get("/datasets")
async def list_datasets():
    """Lists available datasets and their metadata for the frontend Node Library."""
    geojson_dir = os.path.join(DATA_DIR, "geojson")
    metadata_dir = os.path.join(DATA_DIR, "metadata")
    
    datasets = []
    
    if not os.path.exists(geojson_dir):
        return {"datasets": []}

    for f in os.listdir(geojson_dir):
        if f.endswith(".geojson"):
            base_name = f.replace(".geojson", "")
            meta_path = os.path.join(metadata_dir, f"{base_name}_metadata.json")
            
            dataset_info = {
                "id": base_name,
                "name": base_name.replace("_", " "),
                "filename": f,
                "metadata": None
            }

            if os.path.exists(meta_path):
                with open(meta_path, 'r') as meta_file:
                    dataset_info["metadata"] = json.load(meta_file)
            
            datasets.append(dataset_info)
            
    return {"datasets": datasets}

@app.get("/dataset/{filename}")
async def get_geojson(filename: str, simplify: bool = False):
    print(f"Requesting dataset: {filename} (simplify={simplify})")
    """Serves raw or simplified GeoJSON data to the frontend."""
    geojson_dir = os.path.join(DATA_DIR, "geojson")
    path = os.path.join(geojson_dir, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    
    gdf = gpd.read_file(path)
    
    if gdf.crs and gdf.crs != "EPSG:4326":
        gdf = gdf.to_crs("EPSG:4326")
    
    if simplify:
        # Simplify geometry to reduce payload size for UI previews
        gdf['geometry'] = gdf['geometry'].simplify(tolerance=0.001, preserve_topology=True)
        
    return gdf.__geo_interface__


# ==========================================
# 4. MAP ALGEBRA ENDPOINT (Fast Rasterization)
# ==========================================

@app.post("/run-operation")
async def run_operation(request: OperationRequest):
    """Performs quick H3 map algebra (preview, intersect, union) across multiple datasets."""
    if not request.datasetIds:
        raise HTTPException(status_code=400, detail="No datasets provided")

    all_hex_maps = []

    try:
        for dataset_id in request.datasetIds:
            filepath = os.path.join(DATA_DIR, "geojson", f"{dataset_id}.geojson")
            if not os.path.exists(filepath):
                raise HTTPException(status_code=404, detail=f"Dataset not found at {filepath}")
            
            print(f"Rasterizing {dataset_id}...")
            hex_data = rasterize_geojson_to_h3(filepath, request.resolution)
            all_hex_maps.append({"id": dataset_id, "data": hex_data})

        final_hex_data = {}

        if request.operationType == "preview" or len(all_hex_maps) == 1:
            final_hex_data = all_hex_maps[0]["data"]

        elif request.operationType == "intersect":
            sets_of_keys = [set(hm["data"].keys()) for hm in all_hex_maps]
            intersected_keys = set.intersection(*sets_of_keys)

            for key in intersected_keys:
                total_count = sum(hm["data"][key]["count"] for hm in all_hex_maps)
                final_hex_data[key] = {
                    "count": total_count,
                    "sources": [hm["id"] for hm in all_hex_maps],
                    "sample_props": all_hex_maps[0]["data"][key].get("sample_props", {})
                }

        elif request.operationType in ["merge", "union"]:
            sets_of_keys = [set(hm["data"].keys()) for hm in all_hex_maps]
            union_keys = set.union(*sets_of_keys)

            for key in union_keys:
                count = 0
                sources = []
                props = {}
                
                for hm in all_hex_maps:
                    if key in hm["data"]:
                        count += hm["data"][key]["count"]
                        sources.append(hm["id"])
                        if not props: 
                            props = hm["data"][key].get("sample_props", {})

                final_hex_data[key] = {
                    "count": count,
                    "sources": sources,
                    "sample_props": props
                }
        else:
             raise HTTPException(status_code=400, detail=f"Unknown operation: {request.operationType}")

        return {
            "status": "success",
            "operation": request.operationType,
            "resolution": request.resolution,
            "hex_count": len(final_hex_data),
            "data": final_hex_data
        }

    except Exception as e:
        print(f"Error during operation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 5. FORMAL INTEGRATION ENDPOINT (I = A_1 ∘ R)
# ==========================================

from pathlib import Path

@app.post("/api/integrate_test")
async def integrate_datasets(request: IntegrationRequest):
    """
    DEBUG VERSION:
    Converts IntegrationRequest into OperationRequest
    and calls the /run-operation logic to test frontend compatibility.
    """

    try:
        # Extract dataset id from dataset_path
        # Example: "NYC_pedestrian_counts.geojson" -> "NYC_pedestrian_counts"
        dataset_id = Path(request.dataset_path).stem

        # Build equivalent request for /run-operation
        operation_request = OperationRequest(
            operationType="preview",
            datasetIds=[dataset_id],
            resolution=request.resolution
        )

        # Directly reuse the same logic
        return await run_operation(operation_request)

    except Exception as e:
        print(f"Error in /api/integrate debug: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/api/integrate")
async def integrate_datasets(request: IntegrationRequest):
    """Executes the formal spatial integration pipeline using explicit Operators."""
    try:
        if request.allocation_operator not in ALLOCATION_REGISTRY:
            raise HTTPException(status_code=400, detail=f"Unknown allocation operator: {request.allocation_operator}")
        if request.aggregation_operator not in AGGREGATION_REGISTRY:
            raise HTTPException(status_code=400, detail=f"Unknown aggregation operator: {request.aggregation_operator}")

        AllocatorClass = ALLOCATION_REGISTRY[request.allocation_operator]
        AggregatorClass = AGGREGATION_REGISTRY[request.aggregation_operator]
        
        allocator = AllocatorClass()
        aggregator = AggregatorClass()
        grid = H3GridSystem()

        # Build path to the requested dataset
        dataset_full_path = os.path.join(DATA_DIR, "geojson", request.dataset_path)
        
        try:
            source_gdf = gpd.read_file(dataset_full_path)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Could not load dataset at {dataset_full_path}: {str(e)}")

        pipeline = IntegrationPipeline(grid, allocator, aggregator)
        
        result_gdf = pipeline.run(
            source_gdf=source_gdf,
            target_column=request.target_column,
            resolution=request.resolution
        )

        # --- NEW CODE STARTS HERE ---
        # --- NEW CODE: Add 'the_geom' so H3PreviewDeckGL knows where to center the camera ---
        result_gdf['the_geom'] = result_gdf.geometry.centroid.apply(lambda p: f"POINT ({p.x} {p.y})")
        
        # 1. Drop the heavy geometry column to speed things up
        df_no_geom = result_gdf.drop(columns=['geometry'])
        
        final_hex_data = {}
        
        # 2. Iterate through the rows and build the exact dictionary the frontend expects
        for _, row in df_no_geom.iterrows():
            row_dict = row.to_dict()
            
            # Extract the cell_id to use as the dictionary key
            cell_id = row_dict.pop('cell_id', None)
            if not cell_id:
                continue
                
            # Find the primary calculated value (e.g., 'allocated_val') to act as 'count' for DeckGL
            primary_value = 1
            for key, val in row_dict.items():
                if key != 'area' and isinstance(val, (int, float)):
                    primary_value = val
                    break
            
            # Format exactly like /run-operation
            final_hex_data[cell_id] = {
                "count": primary_value,
                "sample_props": row_dict
            }

        return {
            "status": "success",
            "operation": "integration",
            "resolution": request.resolution,
            "hex_count": len(final_hex_data),
            "data": final_hex_data
        }

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Integration failed: {str(e)}")

    #     return json.loads(result_gdf.to_json())

    # except ValueError as ve:
    #     raise HTTPException(status_code=400, detail=str(ve))
    # except Exception as e:
    #     raise HTTPException(status_code=500, detail=f"Integration failed: {str(e)}")


# ==========================================
# 6. ZONED INTEGRATION ENDPOINT (I = A_2 ∘ Z_map ∘ A_1 ∘ R)
# ==========================================

@app.post("/api/integrate_zoned")
async def integrate_to_zones(request: ZonedIntegrationRequest):
    """
    Executes the full zoned integration pipeline.
    Transforms source data through a common H3 grid to reporting zones.
    
    Pipeline: D^(k) → R → x_j (grid) → Z → y_ℓ (zones)
    """
    try:
        # Validate operator selections
        if request.allocation_operator not in ALLOCATION_REGISTRY:
            raise HTTPException(status_code=400, detail=f"Unknown allocation operator: {request.allocation_operator}")
        if request.grid_aggregation_operator not in AGGREGATION_REGISTRY:
            raise HTTPException(status_code=400, detail=f"Unknown grid aggregation operator: {request.grid_aggregation_operator}")
        if request.zoning_mapping_operator not in ZONING_MAPPING_REGISTRY:
            raise HTTPException(status_code=400, detail=f"Unknown zoning mapping operator: {request.zoning_mapping_operator}")
        if request.zoning_aggregation_operator not in ZONING_AGGREGATION_REGISTRY:
            raise HTTPException(status_code=400, detail=f"Unknown zoning aggregation operator: {request.zoning_aggregation_operator}")

        # Instantiate operators via dependency injection
        allocator = ALLOCATION_REGISTRY[request.allocation_operator]()
        grid_aggregator = AGGREGATION_REGISTRY[request.grid_aggregation_operator]()
        zoning_mapper = ZONING_MAPPING_REGISTRY[request.zoning_mapping_operator]()
        zoning_aggregator = ZONING_AGGREGATION_REGISTRY[request.zoning_aggregation_operator]()
        grid = H3GridSystem()

        # Load source dataset
        source_path = os.path.join(DATA_DIR, "geojson", request.dataset_path)
        try:
            source_gdf = gpd.read_file(source_path)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Could not load source dataset: {str(e)}")

        # Load zones dataset  
        zones_path = os.path.join(DATA_DIR, "geojson", request.zones_path)
        try:
            zones_gdf = gpd.read_file(zones_path)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Could not load zones dataset: {str(e)}")

        # Validate allocation operator against geometry type
        geom_types = source_gdf.geometry.geom_type.unique()
        for geom_type in geom_types:
            if geom_type in GEOMETRY_CONSTRAINTS:
                allowed = GEOMETRY_CONSTRAINTS[geom_type]
                if request.allocation_operator not in allowed:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Operator '{request.allocation_operator}' not valid for {geom_type}. Allowed: {allowed}"
                    )

        # Build and execute the zoned integration pipeline
        pipeline = ZonedIntegrationPipeline(
            grid_system=grid,
            allocator=allocator,
            grid_aggregator=grid_aggregator,
            zoning_mapper=zoning_mapper,
            zoning_aggregator=zoning_aggregator
        )
        
        # Determine output mode
        output_mode = getattr(request, 'output_mode', 'zones')
        
        response = {
            "status": "success",
            "operation": "zoned_integration",
            "resolution": request.resolution,
        }
        
        # Generate grid data if needed (for "grid" or "both" modes)
        if output_mode in ["grid", "both"]:
            # Use run_grid_with_zone_values to paint zone-aggregated values back to cells
            # This ensures cells within a zone all show the same aggregated value
            grid_result_gdf = pipeline.run_grid_with_zone_values(
                source_gdf=source_gdf,
                target_column=request.target_column,
                resolution=request.resolution,
                zones_gdf=zones_gdf
            )
            
            # Convert grid GeoDataFrame to H3 hex dictionary format
            df_no_geom = grid_result_gdf.drop(columns=['geometry'])
            final_hex_data = {}
            
            for _, row in df_no_geom.iterrows():
                row_dict = row.to_dict()
                cell_id = row_dict.pop('cell_id', None)
                if not cell_id:
                    continue
                    
                # Use the zone_aggregated_value as the primary value
                primary_value = row_dict.get('zone_aggregated_value', 1)
                
                final_hex_data[cell_id] = {
                    "count": primary_value,
                    "sample_props": row_dict
                }
            
            response["data"] = final_hex_data
            response["hex_count"] = len(final_hex_data)
        
        # Generate zone data if needed (for "zones" or "both" modes)
        if output_mode in ["zones", "both"]:
            zone_result_gdf = pipeline.run(
                source_gdf=source_gdf,
                target_column=request.target_column,
                resolution=request.resolution,
                zones_gdf=zones_gdf
            )
            response["geojson"] = json.loads(zone_result_gdf.to_json())
            response["zone_count"] = len(zone_result_gdf)
        
        return response

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Zoned integration failed: {str(e)}")


# ==========================================
# 7. MULTIVARIATE INTEGRATION ENDPOINT (Parallel Tracks + Dual-Merge)
# ==========================================

@app.post("/api/integrate_multivariate")
async def integrate_multivariate(request: MultivariateIntegrationRequest):
    """
    Executes multivariate spatial analysis with parallel processing.
    
    Each variable is processed through its own mathematical pipeline,
    then merged into a unified grid and/or zone output.
    
    Architecture:
    - Step 1: Parallel Source → Grid (each variable uses its own R + A_1)
    - Step 1.5: Merge on cell_id → Unified Grid
    - Step 2: Parallel Grid → Zone (each variable uses its own Z_map + A_2)
    - Step 3: Merge on zone_id → Unified Zones
    """
    try:
        if not request.variables:
            raise HTTPException(status_code=400, detail="At least one variable is required")
        
        # Build track configurations
        tracks = []
        
        for var in request.variables:
            # Validate operators
            if var.allocation_operator not in ALLOCATION_REGISTRY:
                raise HTTPException(status_code=400, detail=f"Unknown allocation operator: {var.allocation_operator}")
            if var.grid_aggregation_operator not in AGGREGATION_REGISTRY:
                raise HTTPException(status_code=400, detail=f"Unknown grid aggregation operator: {var.grid_aggregation_operator}")
            
            # Load source dataset
            source_path = os.path.join(DATA_DIR, "geojson", var.dataset_path)
            try:
                source_gdf = gpd.read_file(source_path)
            except Exception as e:
                raise HTTPException(status_code=404, detail=f"Could not load {var.dataset_path}: {str(e)}")
            
            # Validate allocation operator against geometry
            geom_types = source_gdf.geometry.geom_type.unique()
            for geom_type in geom_types:
                if geom_type in GEOMETRY_CONSTRAINTS:
                    allowed = GEOMETRY_CONSTRAINTS[geom_type]
                    if var.allocation_operator not in allowed:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Operator '{var.allocation_operator}' not valid for {geom_type} in {var.dataset_path}"
                        )
            
            # Build operators
            allocator = ALLOCATION_REGISTRY[var.allocation_operator]()
            grid_aggregator = AGGREGATION_REGISTRY[var.grid_aggregation_operator]()
            
            # Optional zoning operators
            zoning_mapper = None
            zoning_aggregator = None
            
            if var.zoning_mapping_operator and var.zoning_aggregation_operator:
                if var.zoning_mapping_operator not in ZONING_MAPPING_REGISTRY:
                    raise HTTPException(status_code=400, detail=f"Unknown zoning mapping operator: {var.zoning_mapping_operator}")
                if var.zoning_aggregation_operator not in ZONING_AGGREGATION_REGISTRY:
                    raise HTTPException(status_code=400, detail=f"Unknown zoning aggregation operator: {var.zoning_aggregation_operator}")
                
                zoning_mapper = ZONING_MAPPING_REGISTRY[var.zoning_mapping_operator]()
                zoning_aggregator = ZONING_AGGREGATION_REGISTRY[var.zoning_aggregation_operator]()
            
            # Create track config (default output_name to target_column)
            track = VariableTrackConfig(
                source_gdf=source_gdf,
                target_column=var.target_column,
                output_name=var.output_name or var.target_column,
                allocator=allocator,
                grid_aggregator=grid_aggregator,
                zoning_mapper=zoning_mapper,
                zoning_aggregator=zoning_aggregator
            )
            tracks.append(track)
        
        # Load zones if provided
        zones_gdf = None
        if request.zones_path:
            zones_path = os.path.join(DATA_DIR, "geojson", request.zones_path)
            try:
                zones_gdf = gpd.read_file(zones_path)
            except Exception as e:
                raise HTTPException(status_code=404, detail=f"Could not load zones: {str(e)}")
        
        # Execute multivariate pipeline
        grid = H3GridSystem()
        pipeline = MultivariateIntegrationPipeline(grid_system=grid)
        
        result = pipeline.run(
            tracks=tracks,
            resolution=request.resolution,
            zones_gdf=zones_gdf,
            output_mode=request.output_mode
        )
        
        # Build response
        response = {
            "status": "success",
            "operation": "multivariate_integration",
            "resolution": request.resolution,
            "variables": [v.output_name or v.target_column for v in request.variables]
        }
        
        # Convert grid output
        if 'grid' in result:
            grid_gdf = result['grid']
            df_no_geom = grid_gdf.drop(columns=['geometry'])
            final_hex_data = {}
            
            # Get variable names for this request
            var_names = [(v.output_name or v.target_column) for v in request.variables]
            
            for _, row in df_no_geom.iterrows():
                row_dict = row.to_dict()
                cell_id = row_dict.pop('cell_id', None)
                if not cell_id:
                    continue
                
                # Get all variable values
                var_values = {name: row_dict.get(name, 0) for name in var_names}
                
                # Use sum of variable values for visualization intensity
                total_value = sum(var_values.values())
                
                final_hex_data[cell_id] = {
                    "count": total_value,
                    "variables": var_values,
                    "sample_props": row_dict
                }
            
            response["data"] = final_hex_data
            response["hex_count"] = len(final_hex_data)
        
        # Convert zones output
        if 'zones' in result:
            zones_gdf = result['zones']
            response["geojson"] = json.loads(zones_gdf.to_json())
            response["zone_count"] = len(zones_gdf)
        
        return response
        
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multivariate integration failed: {str(e)}")


@app.get("/api/operators")
async def get_available_operators():
    """
    Returns all available operators and geometry constraints for the frontend.
    Enables dynamic operator selection UI.
    """
    return {
        "allocation": list(ALLOCATION_REGISTRY.keys()),
        "grid_aggregation": list(AGGREGATION_REGISTRY.keys()),
        "zoning_mapping": list(ZONING_MAPPING_REGISTRY.keys()),
        "zoning_aggregation": list(ZONING_AGGREGATION_REGISTRY.keys()),
        "geometry_constraints": GEOMETRY_CONSTRAINTS
    }