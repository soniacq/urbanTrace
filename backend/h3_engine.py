# backend/h3_engine.py
# backend/h3_engine.py
import h3
import json
from shapely.geometry import shape, Point, Polygon, MultiPolygon

def feature_to_h3(feature, resolution=9):
    """
    Converts a single GeoJSON feature into a list of H3 hexagon IDs.
    """
    geom = shape(feature['geometry'])
    print(f"Processing feature with geometry type: {geom.geom_type}")
    h3_indices = set()

    # Note: GeoJSON is (Longitude, Latitude). H3 expects (Latitude, Longitude).
    if isinstance(geom, Point):
        print(f"Converting Point: {geom.x}, {geom.y} to H3 at resolution {resolution}")
        h3_id = h3.latlng_to_cell(geom.y, geom.x, resolution)
        h3_indices.add(h3_id)

    elif isinstance(geom, Polygon):
        print(f"Converting Polygon with {len(geom.exterior.coords)} exterior points and {len(geom.interiors)} holes to H3 at resolution {resolution}")
        outer = [(y, x) for x, y in geom.exterior.coords]
        holes = [[(y, x) for x, y in interior.coords] for interior in geom.interiors]
        # h3 v4 uses h3.LatLngPoly instead of h3.Polygon
        h3_poly = h3.LatLngPoly(outer, *holes)
        cells = h3.h3shape_to_cells(h3_poly, resolution)
        h3_indices.update(cells)

    elif isinstance(geom, MultiPolygon):
        print(f"Converting MultiPolygon with {len(geom.geoms)} parts to H3 at resolution {resolution}")
        for poly in geom.geoms:
            outer = [(y, x) for x, y in poly.exterior.coords]
            holes = [[(y, x) for x, y in interior.coords] for interior in poly.interiors]
            # h3 v4 uses h3.LatLngPoly instead of h3.Polygon
            h3_poly = h3.LatLngPoly(outer, *holes)
            cells = h3.h3shape_to_cells(h3_poly, resolution)
            h3_indices.update(cells)

    print(f"Generated {len(h3_indices)} H3 hexagons for this feature.")
    return list(h3_indices)

def rasterize_geojson_to_h3(filepath, resolution=9):
    """
    Reads a GeoJSON file and converts all features into an H3 frequency map.
    Returns: { "892a100d31fffff": {"count": 1, "data": {...}}, ... }
    """
    with open(filepath, 'r') as f:
        data = json.load(f)
        
    hex_map = {}
    
    for feature in data.get('features', []):
        try:
            # Get H3 IDs for this specific geometry
            cells = feature_to_h3(feature, resolution)
            
            # We can grab attributes to pass along
            props = feature.get('properties', {})
            
            for cell in cells:
                if cell not in hex_map:
                    hex_map[cell] = {"count": 0, "sample_props": props}
                
                hex_map[cell]["count"] += 1
                
        except Exception as e:
            print(f"Skipping feature due to error: {e}")
            continue
            
    return hex_map