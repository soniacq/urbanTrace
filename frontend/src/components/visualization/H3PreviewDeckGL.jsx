import React, { useMemo, useState, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { GeoJsonLayer } from '@deck.gl/layers';
import { Layers } from 'lucide-react'; 

const H3PreviewDeckGL = ({ hexData, geojsonData, color = [236, 72, 153], showHex = true, showZones = false }) => {  
  // 👇 1. Add a ref to track the container and a state for readiness
    const containerRef = useRef(null);
    const [isReady, setIsReady] = useState(false);
    
    const [is3D, setIs3D] = useState(false);
    const [viewState, setViewState] = useState({
      longitude: -74.0,
      latitude: 40.7,
      zoom: 10,
      pitch: 0, 
      bearing: 0
    });
  
    // 👇 2. THE SHIELD: Wait until React Flow gives this container actual dimensions (> 0)
    useEffect(() => {
      if (!containerRef.current) return;
      const observer = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          setIsReady(true);
        }
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, []);

  const handleToggleMode = () => {
    const nextIs3D = !is3D;
    setIs3D(nextIs3D);
    
    setViewState(prev => ({
      ...prev,
      pitch: nextIs3D ? 45 : 0,  
      bearing: nextIs3D ? prev.bearing : 0 
    }));
  };

  const { data, maxCount, variableNames } = useMemo(() => {
    if (!hexData) {
      console.log("Warning: No hexData provided to H3PreviewDeckGL. DeckGL will render an empty map.");
      return { data: [], maxCount: 1, variableNames: [] };
    }
    let max = 1;
    let varNames = new Set();
    
    const parsedData = Object.entries(hexData).map(([hexId, info]) => {
      if (info.count > max) max = info.count;
      
      // Track variable names from multivariate data
      if (info.variables) {
        Object.keys(info.variables).forEach(name => varNames.add(name));
      }
      
      return {
        hex: hexId,
        count: info.count,
        variables: info.variables || {},
        sources: info.sources || [],
        props: info.sample_props || {}
      };
    });
    
    return { data: parsedData, maxCount: max, variableNames: [...varNames] };
  }, [hexData]);

  // Process GeoJSON zone data (handles both single-variable zone_value and multivariate columns)
  const { zoneFeatures, maxZoneValue, zoneVariableNames } = useMemo(() => {
    if (!geojsonData?.features) {
      return { zoneFeatures: null, maxZoneValue: 1, zoneVariableNames: [] };
    }
    
    let max = 1;
    let varNames = new Set();
    
    // Detect variable names (any numeric property that isn't zone_id or geometry-related)
    const excludeProps = ['zone_id', 'geometry', 'OBJECTID', 'Shape_Area', 'Shape_Leng'];
    
    geojsonData.features.forEach(f => {
      const props = f.properties || {};
      
      // Sum all numeric variable values for intensity
      let totalVal = 0;
      Object.entries(props).forEach(([key, val]) => {
        if (!excludeProps.includes(key) && typeof val === 'number' && !isNaN(val)) {
          varNames.add(key);
          totalVal += val;
        }
      });
      
      // Track max for color intensity
      if (props.zone_value !== undefined) {
        if (props.zone_value > max) max = props.zone_value;
      } else if (totalVal > max) {
        max = totalVal;
      }
    });
    
    return { zoneFeatures: geojsonData, maxZoneValue: max, zoneVariableNames: [...varNames] };
  }, [geojsonData]);

  const layers = useMemo(() => {
    const result = [];

    // H3 Hexagon Layer (if showing hex data)
    if (showHex && data.length > 0) {
      result.push(
        new H3HexagonLayer({
          id: 'h3-hexagon-layer',
          data,
          pickable: true,
          wireframe: false,
          filled: true,
          extruded: is3D, 
          elevationScale: 20,
          getHexagon: d => d.hex,
          getFillColor: d => {
            const intensity = maxCount > 1 ? (d.count / maxCount) : 1;
            const alpha = is3D ? 200 : Math.floor(80 + (175 * intensity));
            return [color[0], color[1], color[2], alpha];
          },
          getElevation: d => d.count
        })
      );
    }

    // GeoJSON Zone Layer (if showing zones)
    if (showZones && zoneFeatures) {
      // Preprocess to compute total value per zone for multivariate
      const excludeProps = ['zone_id', 'geometry', 'OBJECTID', 'Shape_Area', 'Shape_Leng'];
      
      result.push(
        new GeoJsonLayer({
          id: 'zone-layer',
          data: zoneFeatures,
          pickable: true,
          stroked: true,
          filled: true,
          extruded: is3D,
          wireframe: is3D,
          lineWidthMinPixels: 1,
          getFillColor: f => {
            const props = f.properties || {};
            // Sum all variable values for intensity
            let totalVal = props.zone_value || 0;
            if (!props.zone_value) {
              Object.entries(props).forEach(([key, val]) => {
                if (!excludeProps.includes(key) && typeof val === 'number' && !isNaN(val)) {
                  totalVal += val;
                }
              });
            }
            const intensity = maxZoneValue > 0 ? (totalVal / maxZoneValue) : 0;
            // Use a different color scheme for zones (green)
            const alpha = is3D ? 180 : Math.floor(60 + (140 * intensity));
            return [16, 185, 129, alpha]; // Emerald green
          },
          getLineColor: [15, 118, 110, 200], // Teal border
          getLineWidth: 2,
          getElevation: f => {
            const props = f.properties || {};
            let totalVal = props.zone_value || 0;
            if (!props.zone_value) {
              Object.entries(props).forEach(([key, val]) => {
                if (!excludeProps.includes(key) && typeof val === 'number' && !isNaN(val)) {
                  totalVal += val;
                }
              });
            }
            return totalVal * 10;
          },
          elevationScale: is3D ? 50 : 0
        })
      );
    }

    return result;
  }, [data, maxCount, zoneFeatures, maxZoneValue, showHex, showZones, is3D, color]);

  // Auto-fit to zone bounds if showing zones
  useEffect(() => {
    if (showZones && zoneFeatures?.features?.length > 0) {
      // Calculate centroid of first feature as initial view
      const firstFeature = zoneFeatures.features[0];
      const coords = firstFeature.geometry?.coordinates;
      if (coords && coords[0] && coords[0][0]) {
        // Handle polygon coordinates
        const flatCoords = coords[0].flat ? coords[0] : coords[0][0];
        if (flatCoords && flatCoords.length >= 2) {
          const lng = flatCoords[0];
          const lat = flatCoords[1];
          if (typeof lng === 'number' && typeof lat === 'number') {
            setViewState(prev => ({
              ...prev,
              longitude: lng,
              latitude: lat,
              zoom: 10
            }));
          }
        }
      }
    }
  }, [zoneFeatures, showZones]);

  return (
      <div ref={containerRef} className="nodrag nowheel" style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>       {/* 👇 4. Wrap DeckGL so it physically cannot render while dimensions are 0x0 */}
       {isReady && (
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState }) => setViewState(viewState)}
          controller={true}
          layers={layers}
          getTooltip={({ object, layer }) => {
            if (!object) return null;
            
            // Handle H3 hexagon tooltip
            if (layer?.id === 'h3-hexagon-layer') {
              // Build variable values display for multivariate
              let variablesHtml = '';
              if (object.variables && Object.keys(object.variables).length > 0) {
                variablesHtml = Object.entries(object.variables)
                  .map(([name, val]) => `<div><strong>${name}:</strong> ${typeof val === 'number' ? val.toFixed(2) : val}</div>`)
                  .join('');
              } else {
                variablesHtml = `<div><strong>Value:</strong> ${object.count}</div>`;
              }
              
              return {
                html: `
                  <div style="font-family: sans-serif;">
                    <div style="font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid #475569; padding-bottom: 4px;">
                      Hex ID: ${object.hex.slice(0, 8)}...
                    </div>
                    ${variablesHtml}
                    ${object.sources?.length ? `<div style="margin-top: 4px;"><strong>Sources:</strong> ${object.sources.join(', ')}</div>` : ''}
                  </div>
                `,
                style: {
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  fontSize: '11px',
                  padding: '8px',
                  borderRadius: '6px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                  maxWidth: '250px',
                  border: '1px solid #334155'
                }
              };
            }
            
            // Handle Zone polygon tooltip
            if (layer?.id === 'zone-layer' && object.properties) {
              const props = object.properties;
              const excludeProps = ['zone_id', 'geometry', 'OBJECTID', 'Shape_Area', 'Shape_Leng'];
              
              // Build variables display for multivariate zones
              let variablesHtml = '';
              if (props.zone_value !== undefined) {
                variablesHtml = `<div><strong>Value:</strong> ${props.zone_value?.toFixed(2) || 'N/A'}</div>`;
              } else {
                // Show all numeric variables
                const varEntries = Object.entries(props)
                  .filter(([key, val]) => !excludeProps.includes(key) && typeof val === 'number' && !isNaN(val));
                
                if (varEntries.length > 0) {
                  variablesHtml = varEntries
                    .map(([name, val]) => `<div><strong>${name}:</strong> ${val.toFixed(2)}</div>`)
                    .join('');
                } else {
                  variablesHtml = '<div>No values</div>';
                }
              }
              
              return {
                html: `
                  <div style="font-family: sans-serif;">
                    <div style="font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid #475569; padding-bottom: 4px;">
                      Zone: ${props.zone_id || 'Unknown'}
                    </div>
                    ${variablesHtml}
                  </div>
                `,
                style: {
                  backgroundColor: '#064e3b',
                  color: '#f8fafc',
                  fontSize: '11px',
                  padding: '8px',
                  borderRadius: '6px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                  maxWidth: '250px',
                  border: '1px solid #10b981'
                }
              };
            }
            
            return null;
          }}
        />
       )}
      
      {/* 👇 NEW: Minimized 2D Density Legend */}
      {!is3D && maxCount > 1 && (
        <div style={{
          position: 'absolute', bottom: '8px', left: '8px', zIndex: 10,
          backgroundColor: 'rgba(255, 255, 255, 0.9)', 
          padding: '1px 2px', // 👈 Tighter padding
          borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          fontSize: '8px',    // 👈 Smaller font size
          color: '#334155', display: 'flex', flexDirection: 'column', gap: '2px',
          border: '0.2px solid #cbd5e1'
        }}>
          <div style={{ fontWeight: 'bold' }}>Density</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>1</span>
            <div style={{
              width: '40px',  // 👈 Narrower bar
              height: '6px',  // 👈 Thinner bar
              borderRadius: '3px',
              background: `linear-gradient(to right, rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.3), rgba(${color[0]}, ${color[1]}, ${color[2]}, 1))`
            }} />
            <span>{maxCount}</span>
          </div>
        </div>
      )}

      <button
        onClick={handleToggleMode}
        title={is3D ? "Switch to 2D Density Map" : "Switch to 3D Extruded Map"}
        style={{
          position: 'absolute', bottom: '8px', right: '8px', zIndex: 10,
          backgroundColor: '#fff', color: '#334155', border: '1px solid #cbd5e1',
          borderRadius: '4px', padding: '4px 8px', cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center',
          gap: '6px', fontSize: '11px', fontWeight: 'bold'
        }}
      >
        <Layers size={14} />
        {is3D ? '3D' : '2D'}
      </button>
    </div>
  );
};

export default H3PreviewDeckGL;