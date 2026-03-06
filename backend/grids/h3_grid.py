import geopandas as gpd
import h3
from shapely.geometry import Polygon
from abc import ABC, abstractmethod

# ==========================================
# BASE CLASS (The Contract for S)
# ==========================================

class SpatialGrid(ABC):
    """
    Abstract base class representing the common spatial support space (S).
    """
    @abstractmethod
    def generate_grid(self, bounds: tuple, resolution: int) -> gpd.GeoDataFrame:
        """
        Generates the target grid covering the spatial bounding box.
        """
        pass

# ==========================================
# CONCRETE IMPLEMENTATION (H3 Grid)
# ==========================================

import geopandas as gpd
import h3
from shapely.geometry import Polygon
from abc import ABC, abstractmethod

class SpatialGrid(ABC):
    @abstractmethod
    def generate_grid(self, bounds: tuple, resolution: int) -> gpd.GeoDataFrame:
        pass

class H3GridSystem(SpatialGrid):
    def generate_grid(self, bounds: tuple, resolution: int) -> gpd.GeoDataFrame:
        minx, miny, maxx, maxy = bounds
        
        # h3 v4: use LatLngPoly with (lat, lng) ordering
        outer = [(miny, minx), (miny, maxx), (maxy, maxx), (maxy, minx), (miny, minx)]
        h3_poly = h3.LatLngPoly(outer)
        hex_ids = list(h3.h3shape_to_cells(h3_poly, resolution))
        
        # h3 v4: cell_to_boundary returns (lat, lng) tuples — swap to (lng, lat) for Shapely
        polygons = []
        for hex_id in hex_ids:
            boundary = h3.cell_to_boundary(hex_id)  # returns [(lat, lng), ...]
            polygons.append(Polygon([(lng, lat) for lat, lng in boundary]))
            
        grid_gdf = gpd.GeoDataFrame({
            'cell_id': hex_ids,
            'geometry': polygons
        }, crs="EPSG:4326")
        
        grid_gdf['area'] = grid_gdf.to_crs("EPSG:3857").geometry.area
        
        return grid_gdf

# class H3GridSystem(SpatialGrid):
#     """
#     Generates a uniform hexagonal grid using Uber's H3 spatial index.
#     """
#     def generate_grid(self, bounds: tuple, resolution: int) -> gpd.GeoDataFrame:
#         minx, miny, maxx, maxy = bounds
        
#         # Standard GeoJSON coordinates are [longitude, latitude]
#         geo_json = {
#             "type": "Polygon",
#             "coordinates": [[[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy], [minx, miny]]]
#         }
        
#         # Polyfill the bounding box with hexagon IDs.
#         # h3.polygon_to_cells is the standard for H3 v4 API.
#         try:
#             hex_ids = list(h3.polygon_to_cells(geo_json, resolution))
#         except AttributeError:
#             # Fallback for older H3 v3 environments
#             hex_ids = list(h3.polyfill(geo_json, resolution, geo_json_conformant=True))
        
#         # Convert the discrete hex IDs back to Shapely Polygons for spatial math
#         polygons = []
#         for hex_id in hex_ids:
#             try:
#                 # geo_json=True ensures the output vertices are [lng, lat]
#                 boundary = h3.cell_to_boundary(hex_id, geo_json=True)
#             except AttributeError:
#                 # Fallback for older H3 v3 environments
#                 boundary = h3.h3_to_geo_boundary(hex_id, geo_json=True)
            
#             polygons.append(Polygon(boundary))
            
#         # Create the GeoDataFrame
#         grid_gdf = gpd.GeoDataFrame({
#             'cell_id': hex_ids,
#             'geometry': polygons
#         }, crs="EPSG:4326")
        
#         # Pre-calculate area (in square meters) by temporarily projecting to Web Mercator.
#         # This 'area' column is strictly required by the DensityAggregation operator.
#         grid_gdf['area'] = grid_gdf.to_crs("EPSG:3857").geometry.area
        
#         return grid_gdf