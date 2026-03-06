import React, { useMemo, useState, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { Layers } from 'lucide-react'; 

const H3PreviewDeckGL = ({ hexData, color = [236, 72, 153] }) => {  
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

  const { data, maxCount } = useMemo(() => {
    if (!hexData) {
      console.log("Warning: No hexData provided to H3PreviewDeckGL. DeckGL will render an empty map.");
      return { data: [], maxCount: 1 };
    }
    let max = 1;
    const parsedData = Object.entries(hexData).map(([hexId, info]) => {
      if (info.count > max) max = info.count; 
      return {
        hex: hexId,
        count: info.count,
        sources: info.sources || [],
        props: info.sample_props || {}
      };
    });
    
    return { data: parsedData, maxCount: max };
  }, [hexData]);

  const layers = [
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
  ];

  return (
      <div ref={containerRef} className="nodrag nowheel" style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>       {/* 👇 4. Wrap DeckGL so it physically cannot render while dimensions are 0x0 */}
       {isReady && (
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState }) => setViewState(viewState)}
          controller={true}
          layers={layers}
          getTooltip={({ object }) => {
            if (!object) return null;
            return {
              html: `
                <div style="font-family: sans-serif;">
                  <div style="font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid #475569; padding-bottom: 4px;">
                    Hex ID: ${object.hex.slice(0, 8)}...
                  </div>
                  <div><strong>Overlaps:</strong> ${object.count}</div>
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
                maxWidth: '220px',
                border: '1px solid #334155'
              }
            };
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