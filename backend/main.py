# backend/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import geopandas as gpd
import json
from pydantic import BaseModel
from h3_engine import rasterize_geojson_to_h3 # Import our new engine

app = FastAPI(title="UrbanTrace API")

# Allow the React frontend to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # Vite's default port
    allow_methods=["*"],
    allow_headers=["*"],
)

# Move up one level to find the data folder in the root
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


# Endpoint to list available datasets with metadata
@app.get("/datasets")
async def list_datasets():
    geojson_dir = os.path.join(DATA_DIR, "geojson")
    metadata_dir = os.path.join(DATA_DIR, "metadata")
    
    datasets = []
    
    if not os.path.exists(geojson_dir):
        return {"datasets": []}

    for f in os.listdir(geojson_dir):
        if f.endswith(".geojson"):
            base_name = f.replace(".geojson", "")
            meta_path = os.path.join(metadata_dir, f"{base_name}_metadata.json")
            
            # Default basic info
            dataset_info = {
                "id": base_name,
                "name": base_name.replace("_", " "),
                "filename": f,
                "metadata": None
            }

            # Load rich metadata if it exists
            if os.path.exists(meta_path):
                with open(meta_path, 'r') as meta_file:
                    dataset_info["metadata"] = json.load(meta_file)
            
            datasets.append(dataset_info)
            
    return {"datasets": datasets}

# Endpoint to serve GeoJSON data for a given dataset
@app.get("/dataset/{filename}")
async def get_geojson(filename: str, simplify: bool = False):
    geojson_dir = os.path.join(DATA_DIR, "geojson")
    path = os.path.join(geojson_dir, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    
    gdf = gpd.read_file(path)
    
    # Ensure WGS84
    if gdf.crs and gdf.crs != "EPSG:4326":
        gdf = gdf.to_crs("EPSG:4326")
    
    # If requested for the node preview, simplify the geometry to reduce size
    if simplify:
        # Tolerance of 0.001 degrees is roughly 100 meters
        # Adjust based on your needs. For visuals, this is plenty.
        gdf['geometry'] = gdf['geometry'].simplify(tolerance=0.001, preserve_topology=True)
        
    return gdf.__geo_interface__

# 1. Update the Request Model to accept multiple datasets
class OperationRequest(BaseModel):
    operationType: str          # e.g., "preview", "intersect", "merge"
    datasetIds: list[str]       # <--- Now a LIST of strings
    resolution: int = 9

@app.post("/run-operation")
async def run_operation(request: OperationRequest):
    if not request.datasetIds:
        raise HTTPException(status_code=400, detail="No datasets provided")

    base_dir = os.path.dirname(os.path.abspath(__file__))
    all_hex_maps = []

    try:
        # 2. Rasterize ALL provided datasets
        for dataset_id in request.datasetIds:
            filepath = os.path.join(base_dir, "..", "data", "geojson", f"{dataset_id}.geojson")
            if not os.path.exists(filepath):
                raise HTTPException(status_code=404, detail=f"Dataset not found at {filepath}")
            
            print(f"Rasterizing {dataset_id}...")
            hex_data = rasterize_geojson_to_h3(filepath, request.resolution)
            all_hex_maps.append({"id": dataset_id, "data": hex_data})

        # 3. Perform MAP ALGEBRA
        final_hex_data = {}

        # CASE A: Preview (Just return the first dataset)
        if request.operationType == "preview" or len(all_hex_maps) == 1:
            final_hex_data = all_hex_maps[0]["data"]

        # CASE B: Intersect (Only keep hexagons that exist in ALL datasets)
        elif request.operationType == "intersect":
            # Get sets of hexagon IDs for each dataset
            sets_of_keys = [set(hm["data"].keys()) for hm in all_hex_maps]
            # Find the intersection (the overlapping H3 cells)
            intersected_keys = set.intersection(*sets_of_keys)

            for key in intersected_keys:
                total_count = sum(hm["data"][key]["count"] for hm in all_hex_maps)
                
                final_hex_data[key] = {
                    "count": total_count,
                    "sources": [hm["id"] for hm in all_hex_maps],
                    # Grab properties from the first dataset for now
                    "sample_props": all_hex_maps[0]["data"][key].get("sample_props", {})
                }

        # CASE C: Merge/Union (Keep ALL hexagons, add values where they overlap)
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
                        if not props:  # Just grab the first available properties
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
    

# # This is the main endpoint for running spatial operations. For our MVP (Minimum Viable Product), we'll just implement a "preview" operation that converts the dataset into H3 hexagons.
# # 1. Define the incoming request body from React
# class OperationRequest(BaseModel):
#     operationType: str         # e.g., "buffer", "preview", "intersect"
#     datasetId: str             # e.g., "NYC_subway_stations" (filename without .geojson)
#     resolution: int = 9        # Default H3 resolution

# # 2. Add the Endpoint
# @app.post("/run-operation")
# async def run_operation(request: OperationRequest):
#     # Find the target file
#     # Safely construct the path relative to main.py
#     base_dir = os.path.dirname(os.path.abspath(__file__))
#     filepath = os.path.join(base_dir, "..", "data", "geojson", f"{request.datasetId}.geojson")
    
#     # ... rest of your code ...
#     if not os.path.exists(filepath):
#         raise HTTPException(status_code=404, detail=f"Dataset not found at {filepath}")
    
#     # if not os.path.exists(filepath):
#     #     raise HTTPException(status_code=404, detail="Dataset not found")
        
#     try:
#         # For our MVP, we just "preview" by converting the target dataset to H3
#         hex_data = rasterize_geojson_to_h3(filepath, request.resolution)
        
#         return {
#             "status": "success",
#             "operation": request.operationType,
#             "resolution": request.resolution,
#             "hex_count": len(hex_data),
#             "data": hex_data # The dictionary of { "h3_id": { count, props } }
#         }
        
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))