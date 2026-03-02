# backend/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import geopandas as gpd
import json

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