// frontend/src/components/VectorPreviewDeckGL.jsx
import React, { useEffect, useState, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer } from '@deck.gl/layers';
import { WebMercatorViewport } from '@deck.gl/core';
import { scaleLinear } from 'd3-scale'; // Import the scale function
import axios from 'axios';

const VectorPreviewDeckGL = ({ 
  filename, 
  selectedColumn,
  // GLOBAL VIEWPORT SYNC: Props for linked camera
  isMapSyncEnabled = false,
  globalViewState,
  onGlobalViewStateChange
}) => {
  const [data, setData] = useState(null);
  const [localViewState, setLocalViewState] = useState({
    longitude: -74.006, latitude: 40.7128, zoom: 10, pitch: 0, bearing: 0
  });
  const [loading, setLoading] = useState(true);
  
  // GLOBAL VIEWPORT SYNC: Use global or local viewState
  const viewState = isMapSyncEnabled && globalViewState ? globalViewState : localViewState;
  
  // GLOBAL VIEWPORT SYNC: Handler for view state changes
  const handleViewStateChange = ({ viewState: newViewState }) => {
    if (isMapSyncEnabled && onGlobalViewStateChange) {
      onGlobalViewStateChange(newViewState);
    } else {
      setLocalViewState(newViewState);
    }
  };

  // 1. Fetch Data (Same as before)
  useEffect(() => {
    setLoading(true);
    axios.get(`http://localhost:8000/dataset/${filename}?simplify=true`)
      .then(res => {
        setData(res.data);
        if (res.data) {
          const bounds = getGeoJSONBounds(res.data);
          if (bounds) {
            const viewport = new WebMercatorViewport({ width: 200, height: 120 });
            const { longitude, latitude, zoom } = viewport.fitBounds(
              [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
              { padding: 10 }
            );
            setLocalViewState({ longitude, latitude, zoom, pitch: 0, bearing: 0 });
          }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Preview load error", err);
        setLoading(false);
      });
  }, [filename]);

  // 2. Create the Color Scale Logic
  const colorScale = useMemo(() => {
    if (!data || !selectedColumn) return null;

    // Extract all values for the selected column
    const features = data.features || [];
    const values = features.map(f => f.properties[selectedColumn]).filter(v => v !== null && v !== undefined);
    
    // Simple Numeric Check
    const isNumeric = values.length > 0 && typeof values[0] === 'number';

    if (isNumeric) {
      const min = Math.min(...values);
      const max = Math.max(...values);

      // Create a linear scale: Low (Yellow) -> High (Red)
      // We return a function that takes a value and returns an RGB array
      const scale = scaleLinear()
        .domain([min, max])
        .range([[255, 255, 204], [189, 0, 38]]); // Light Yellow to Dark Red
      
      return (val) => {
        if (val === null || val === undefined) return [200, 200, 200]; // Grey for null
        return scale(val);
      };
    } 
    
    // Fallback for non-numeric (Categorical): Just return a default color
    return () => [59, 130, 246]; 

  }, [data, selectedColumn]);

  // 3. Define the Layer
  const layer = useMemo(() => {
    if (!data) return null;

    return new GeoJsonLayer({
      id: 'preview-layer',
      data: data,
      pickable: true, 
      stroked: true,
      filled: true,
      lineWidthMinPixels: 1,
      pointRadiusMinPixels: 2,
      pointRadiusUnits: 'pixels', 
      
      // DYNAMIC COLORING LOGIC
      getFillColor: d => {
        if (selectedColumn && colorScale) {
          return [...colorScale(d.properties[selectedColumn]), 180]; // Add opacity
        }
        return [59, 130, 246, 120]; // Default Blue
      },
      
      getLineColor: [255, 255, 255, 100], // White borders look better with heatmaps
      getPointRadius: 3,
      updateTriggers: {
        getFillColor: [selectedColumn] // Important: Re-render when column changes
      }
    });
  }, [data, selectedColumn, colorScale]);

  if (loading) return <div style={{ width: '100%', height: '120px', background: '#f8fafc' }} />;

  return (
    <div className="nodrag nowheel" style={{ width: '100%', height: '120px', position: 'relative', background: '#f1f5f9' }}>
      <DeckGL
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        controller={{ scrollZoom: true, dragPan: true, dragRotate: false, doubleClickZoom: true }}
        layers={[layer]}
        getTooltip={({object}) => object && selectedColumn ? `${selectedColumn}: ${object.properties[selectedColumn]}` : null}
      />
    </div>
  );
};

// ... (Keep getGeoJSONBounds helper exactly the same) ...
function getGeoJSONBounds(geojson) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  
    const traverse = (coords) => {
      if (typeof coords[0] === 'number') {
        const [lng, lat] = coords;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      } else {
        coords.forEach(traverse);
      }
    };
  
    const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
    
    features.forEach(f => {
      if (!f.geometry) return;
      const geom = f.geometry;
      if (geom.type === 'Point') traverse([geom.coordinates]);
      else if (geom.type === 'LineString' || geom.type === 'MultiPoint') traverse(geom.coordinates);
      else if (geom.type === 'Polygon' || geom.type === 'MultiLineString') traverse(geom.coordinates);
      else if (geom.type === 'MultiPolygon') traverse(geom.coordinates);
    });
  
    if (minLng === Infinity) return null;
    return { minLng, minLat, maxLng, maxLat };
  }

export default VectorPreviewDeckGL;