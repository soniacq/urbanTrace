from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import geopandas as gpd
import json
import os
import csv
import io
import re
import asyncio
import urllib.request
import urllib.error
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

# Load .env automatically (supports backend/.env and repo-root/.env)
if load_dotenv:
    _backend_dir = Path(__file__).resolve().parent
    _env_candidates = [_backend_dir / ".env", _backend_dir.parent / ".env"]
    for _env_path in _env_candidates:
        if _env_path.exists():
            load_dotenv(dotenv_path=_env_path, override=False)
            break

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


class CopilotTargetZoning(BaseModel):
    dataset_name: str
    geometry_type: Optional[str] = None


class CopilotSourceVariable(BaseModel):
    dataset_name: str
    column_name: str
    original_geometry: Optional[str] = None


class CopilotRecommendRequest(BaseModel):
    target_zoning: CopilotTargetZoning
    source_variables: List[CopilotSourceVariable]


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


# ==========================================
# 8. INTEGRATION COPILOT ENDPOINT
# ==========================================

COPILOT_SYSTEM_PROMPT = """
You are an expert Spatial Data Scientist and GIS Architect. Your task is to select the
optimal Zoning Mapping and Zoning Aggregation operators from the provided lists.

Step 1: Analyze the Context & Metadata
Review dataset_name and column_metadata.name together. If the column name is generic
(e.g., value, count, total, metric), you MUST rely on dataset_name to determine the meaning.
Then review num_distinct_values, distribution (mean, coverage), and sample_data.

Step 2: Classify the Data Type
- Extensive (Count/Total): high num_distinct_values, larger means, values scale with area
- Intensive (Rate/Density): decimals/floats, keywords like rate/avg/median/density
- Categorical/Ordinal (Index): low num_distinct_values (often 1-10), integer classes, index-like labels

Step 3: Geospatial Reasoning & Operator Selection
You are provided target_geometry and valid arrays: available_mapping_operators and available_aggregation_operators.
- If target is Point/MultiPoint, area-weighted mapping is invalid. Choose point-safe mapping.
- Extensive -> aggregation should preserve totals (typically Sum)
- Intensive -> aggregation should avoid absurd accumulation (typically WeightedMean/Mean/Density)
- Categorical/Ordinal -> use discrete grouping (typically Majority)

Return ONLY a valid JSON array with one object per source variable, each containing:
dataset_name, column_name, classification, zoningMapping, zoningAggregation, reasoning.
Never invent operators not present in provided arrays.
""".strip()


def _normalize_dataset_stem(dataset_name: str) -> str:
    base = os.path.basename(dataset_name or "")
    if base.endswith(".geojson"):
        return base[:-8]
    return base


def _metadata_path_for_dataset(dataset_name: str) -> str:
    stem = _normalize_dataset_stem(dataset_name)
    return os.path.join(DATA_DIR, "metadata", f"{stem}_metadata.json")


def _extract_sample_values(sample_csv: Optional[str], target_column: str, max_rows: int = 20) -> List[Any]:
    if not sample_csv:
        return []

    try:
        reader = csv.DictReader(io.StringIO(sample_csv))
        values: List[Any] = []
        for row in reader:
            if len(values) >= max_rows:
                break
            raw = row.get(target_column)
            if raw is None or raw == "":
                continue

            token = str(raw).strip()
            if re.fullmatch(r"-?\d+", token):
                values.append(int(token))
            elif re.fullmatch(r"-?\d*\.\d+", token):
                values.append(float(token))
            else:
                values.append(token)
        return values
    except Exception:
        return []


def _classify_variable(dataset_name: str, column_name: str, column_meta: Dict[str, Any], sample_data: List[Any]) -> str:
    label = f"{dataset_name} {column_name}".lower()
    distinct = column_meta.get("num_distinct_values")
    structural = str(column_meta.get("structural_type", "")).lower()

    numeric_samples = [v for v in sample_data if isinstance(v, (int, float))]
    has_decimal = any(isinstance(v, float) and not float(v).is_integer() for v in numeric_samples)

    if any(k in label for k in ["index", "rank", "score", "class", "category", "vulnerability"]):
        return "Ordinal Index"
    if distinct is not None and isinstance(distinct, (int, float)) and distinct <= 10 and "integer" in structural:
        return "Ordinal Index"
    if has_decimal or any(k in label for k in ["rate", "ratio", "density", "avg", "average", "mean", "median", "%", "percent"]):
        return "Intensive"
    if any(k in label for k in ["count", "total", "population", "incidents", "arrests", "collisions", "units", "volume"]):
        return "Extensive"
    return "Extensive"


def _pick_mapping_operator(target_geometry: str, available_mapping_ops: List[str]) -> str:
    g = (target_geometry or "").lower()
    if g in ["point", "multipoint"]:
        for candidate in ["CentroidZoning"]:
            if candidate in available_mapping_ops:
                return candidate
        return available_mapping_ops[0]

    for candidate in ["AreaWeightedZoning", "CentroidZoning"]:
        if candidate in available_mapping_ops:
            return candidate
    return available_mapping_ops[0]


def _pick_aggregation_operator(classification: str, available_agg_ops: List[str]) -> str:
    if classification == "Ordinal Index":
        for candidate in ["MajorityZoning", "MaxZoning", "MinZoning"]:
            if candidate in available_agg_ops:
                return candidate
    elif classification == "Intensive":
        for candidate in ["WeightedMeanZoning", "DensityZoning", "MeanZoning"]:
            if candidate in available_agg_ops:
                return candidate
    else:
        for candidate in ["SumZoning", "WeightedMeanZoning"]:
            if candidate in available_agg_ops:
                return candidate

    return available_agg_ops[0]


def _heuristic_recommendations(llm_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    target_geometry = llm_payload.get("zoning_target", {}).get("geometry_type") or "Polygon"
    mapping_ops = llm_payload.get("available_mapping_operators", [])
    agg_ops = llm_payload.get("available_aggregation_operators", [])

    results: List[Dict[str, Any]] = []
    for var in llm_payload.get("source_variables", []):
        dataset_name = var.get("dataset_name")
        column_meta = var.get("column_metadata", {})
        column_name = column_meta.get("name")
        sample_data = var.get("sample_data", [])
        classification = _classify_variable(dataset_name, column_name, column_meta, sample_data)
        zoning_mapping = _pick_mapping_operator(target_geometry, mapping_ops)
        zoning_aggregation = _pick_aggregation_operator(classification, agg_ops)

        reasoning = (
            f"Classified as {classification} using column name, distinct values, and sample distribution. "
            f"Selected {zoning_mapping} for target geometry {target_geometry} and {zoning_aggregation} for mathematically safe zoning aggregation."
        )

        results.append({
            "dataset_name": dataset_name,
            "column_name": column_name,
            "classification": classification,
            "zoningMapping": zoning_mapping,
            "zoningAggregation": zoning_aggregation,
            "reasoning": reasoning,
            "engine": "heuristic"  # <--- ADD THIS
        })

    return results


def _call_portkey_structured(llm_payload: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    print("\n--- STARTING PORTKEY CALL ---") # Breadcrumb 1
    api_key = os.getenv("PORTKEY_API_KEY")
    if not api_key:
        print("❌ ERROR: PORTKEY_API_KEY is missing or empty! Aborting LLM call.") # Breadcrumb 2
        return None
    
    print("✅ API Key found.") # Breadcrumb 3
    # if not api_key:
    #     return None

    base_url = os.getenv("PORTKEY_BASE_URL", "https://ai-gateway.apps.cloud.rt.nyu.edu/v1")
    model = os.getenv("PORTKEY_MODEL", "@vertexai/anthropic.claude-opus-4-6")

    print(f"📡 Sending request to: {base_url} using model: {model}") # Breadcrumb 4

    # schema = {
    #     "name": "copilot_recommendations",
    #     "strict": True,
    #     "schema": {
    #         "type": "array",
    #         "items": {
    #             "type": "object",
    #             "additionalProperties": False,
    #             "required": [
    #                 "dataset_name",
    #                 "column_name",
    #                 "classification",
    #                 "zoningMapping",
    #                 "zoningAggregation",
    #                 "reasoning"
    #             ],
    #             "properties": {
    #                 "dataset_name": {"type": "string"},
    #                 "column_name": {"type": "string"},
    #                 "classification": {"type": "string"},
    #                 "zoningMapping": {"type": "string"},
    #                 "zoningAggregation": {"type": "string"},
    #                 "reasoning": {"type": "string"}
    #             }
    #         }
    #     }
    # }

    body = {
        "model": model,
        "temperature": 0.1,
        "max_tokens": int(os.getenv("PORTKEY_MAX_TOKENS", "1024")),
        "messages": [
            {"role": "system", "content": COPILOT_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(llm_payload)}
        ]
        # ,
        # "response_format": {
        #     "type": "json_schema",
        #     "json_schema": schema
        # }
    }

    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            content = payload["choices"][0]["message"]["content"]

            # --- NEW: Safely strip markdown formatting if Claude wraps the JSON ---
            content = content.strip()
            if content.startswith("```json"):
                content = content.split("```json")[1].split("```")[0].strip()
            elif content.startswith("```"):
                content = content.split("```")[1].split("```")[0].strip()
            # -------------------------------------------------------------------

            parsed = json.loads(content)
            # if isinstance(parsed, list):
            #     return parsed
            # return None
            if isinstance(parsed, list):
                print("✅ LLM Call Successful!")
                # Optional: Inject the engine flag here so you know the LLM worked
                for item in parsed:
                    item["engine"] = "llm"
                return parsed
            return None
    except urllib.error.HTTPError as e:
        # This will catch 400, 401, 403, 500 errors and read the actual message from Portkey
        error_body = e.read().decode("utf-8")
        print(f"\n❌ PORTKEY HTTP ERROR {e.code}:")
        print(error_body, "\n")
        return None
    except Exception as e:
        # This catches timeouts, JSON decoding errors, or network drops
        print(f"\n❌ PORTKEY INTERNAL ERROR: {str(e)}\n")
        return None
    # except (urllib.error.HTTPError, urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError):
    #     return None


@app.post("/api/v1/copilot/recommend-operators")
async def recommend_operators(request: CopilotRecommendRequest):
    """
    Recommends zoning operators (zoningMapping + zoningAggregation) per source variable.
    Grid operators remain frontend deterministic based on geometry.
    """
    if not request.source_variables:
        raise HTTPException(status_code=400, detail="source_variables cannot be empty")

    available_mapping_operators = list(ZONING_MAPPING_REGISTRY.keys())
    available_aggregation_operators = list(ZONING_AGGREGATION_REGISTRY.keys())

    source_payload: List[Dict[str, Any]] = []
    for source_var in request.source_variables:
        metadata_path = _metadata_path_for_dataset(source_var.dataset_name)
        if not os.path.exists(metadata_path):
            raise HTTPException(status_code=404, detail=f"Metadata not found for dataset: {source_var.dataset_name}")

        with open(metadata_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        column_meta = next(
            (c for c in metadata.get("columns", []) if c.get("name") == source_var.column_name),
            None
        )
        if not column_meta:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{source_var.column_name}' not found in metadata for dataset '{source_var.dataset_name}'"
            )

        sample_values = _extract_sample_values(metadata.get("sample"), source_var.column_name, max_rows=20)
        source_payload.append({
            "dataset_name": _normalize_dataset_stem(source_var.dataset_name),
            "original_geometry": source_var.original_geometry or metadata.get("geometricType"),
            "column_metadata": {
                "name": column_meta.get("name"),
                "structural_type": column_meta.get("structural_type"),
                "num_distinct_values": column_meta.get("num_distinct_values"),
                "mean": column_meta.get("mean"),
                "stddev": column_meta.get("stddev"),
                "coverage": column_meta.get("coverage", [])
            },
            "sample_data": sample_values
        })

    llm_payload = {
        "task": "Determine zoning spatial mapping and aggregation operators based on statistical metadata.",
        "zoning_target": {
            "dataset_name": _normalize_dataset_stem(request.target_zoning.dataset_name),
            "geometry_type": request.target_zoning.geometry_type or "Polygon"
        },
        "available_mapping_operators": available_mapping_operators,
        "available_aggregation_operators": available_aggregation_operators,
        "source_variables": source_payload
    }

    used_engine = "llm"
    llm_result = await asyncio.to_thread(_call_portkey_structured, llm_payload)
    if not llm_result:
        llm_result = _heuristic_recommendations(llm_payload)
        used_engine = "heuristic" # Update flag if we fell back

    # Enforce available operators and request alignment
    requested_pairs = {
        (_normalize_dataset_stem(s.dataset_name), s.column_name): s
        for s in request.source_variables
    }
    normalized_response: List[Dict[str, Any]] = []

    for rec in llm_result:
        dataset_name = _normalize_dataset_stem(str(rec.get("dataset_name", "")))
        column_name = str(rec.get("column_name", ""))
        if (dataset_name, column_name) not in requested_pairs:
            continue

        classification = str(rec.get("classification", "Extensive"))
        zoning_mapping = str(rec.get("zoningMapping", ""))
        zoning_aggregation = str(rec.get("zoningAggregation", ""))
        reasoning = str(rec.get("reasoning", ""))

        if zoning_mapping not in available_mapping_operators:
            zoning_mapping = _pick_mapping_operator(
                llm_payload["zoning_target"]["geometry_type"],
                available_mapping_operators
            )
        if zoning_aggregation not in available_aggregation_operators:
            zoning_aggregation = _pick_aggregation_operator(classification, available_aggregation_operators)

        normalized_response.append({
            "dataset_name": dataset_name,
            "column_name": column_name,
            "classification": classification,
            "zoningMapping": zoning_mapping,
            "zoningAggregation": zoning_aggregation,
            "reasoning": reasoning or "Recommended using metadata statistics and geometry-aware zoning constraints.",
            "engine": rec.get("engine", used_engine) # <--- ADD THIS
        })

    if not normalized_response:
        normalized_response = _heuristic_recommendations(llm_payload)

    return normalized_response