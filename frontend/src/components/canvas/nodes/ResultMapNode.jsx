import React, { memo, useMemo, useEffect, useState } from 'react';
import { Handle, Position, NodeResizeControl } from '@xyflow/react';
import { Map as MapIcon, Download, Hexagon, MapPin, Info, ChevronDown, ChevronUp } from 'lucide-react';
import H3PreviewDeckGL from '../../visualization/H3PreviewDeckGL'; 

const ResultMapNode = memo(({ id, data }) => {
  // DATA LINEAGE: Track lineage panel visibility
  const [lineageExpanded, setLineageExpanded] = useState(false);
  const provenance = data?.spatialData?.provenance;
  
  // Check if this is a zoned result
  const isZoned = data?.spatialData?.isZoned;
  const outputMode = data?.spatialData?.outputMode || 'grid';
  
  // Grab the dictionary of hexagons (for grid output)
  const resultMapData = data?.spatialData?.data;
  
  // Grab the GeoJSON zones (for zoned output)
  const zoneGeoJson = data?.spatialData?.geojson;
  
  // Determine what to show
  const showHex = !isZoned || outputMode === 'grid' || outputMode === 'both';
  const showZones = isZoned && (outputMode === 'zones' || outputMode === 'both');
  
  // 🕵️ DEBUGGING BLOCK: Inspect every single key before it touches DeckGL
//   useEffect(() => {
//     if (resultMapData) {
//       console.log("Total keys in resultMapData:", Object.keys(resultMapData).length);
      
//       Object.keys(resultMapData).forEach(key => {
//         // An H3 index should strictly be a 15-character hex string (0-9, a-f)
//         const isValidH3 = /^[a-fA-F0-9]{10,16}$/.test(key);
        
//         if (!isValidH3) {
//           console.error(`🚨 CULPRIT FOUND! Invalid H3 string being passed to DeckGL: "${key}"`);
//           console.error("Value attached to this key:", resultMapData[key]);
//         }
//       });
//     }
//   }, [resultMapData]);

  // Different colors for grid vs zones
  const colorHex = showZones && !showHex ? '#10b981' : (resultMapData?.color || '#10b981'); 
  
  const rgbColor = useMemo(() => {
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    return [r, g, b];
  }, [colorHex]);

  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Determine node title
  const nodeTitle = useMemo(() => {
    if (isZoned) {
      if (outputMode === 'both') return 'H3 + Zones Result';
      if (outputMode === 'zones') return 'Zoned Result';
    }
    return data.name || 'H3 Integration Result';
  }, [isZoned, outputMode, data.name]);

  // Determine header icon
  const HeaderIcon = showZones && !showHex ? MapPin : Hexagon;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      minWidth: '240px',  // 👈 ADD THIS
      minHeight: '240px', // 👈 ADD THIS
      borderRadius: '8px',
      backgroundColor: '#fff', border: `1px solid ${colorHex}`,
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* 👇 3. Add the Resize Control Component */}
      <NodeResizeControl 
        minWidth={240} 
        minHeight={220}
        style={{ background: 'transparent', border: 'none' }}
      >
        {/* A subtle little icon in the bottom right corner so users know it's draggable */}
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 4, bottom: 4, cursor: 'nwse-resize' }}>
          <polyline points="21 15 21 21 15 21"></polyline>
          <line x1="21" y1="21" x2="15" y2="15"></line>
        </svg>
      </NodeResizeControl>
      {/* Header */}
      <div style={{ backgroundColor: colorHex, color: '#fff', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '7px 7px 0 0' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold' }}>
           <HeaderIcon size={14} /> {nodeTitle}
         </div>
         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
           {/* Output mode badge */}
           {isZoned && (
             <div style={{
               fontSize: '9px',
               backgroundColor: 'rgba(255,255,255,0.2)',
               padding: '2px 6px',
               borderRadius: '4px',
               textTransform: 'uppercase'
             }}>
               {outputMode}
             </div>
           )}
           {/* DATA LINEAGE: Info toggle button */}
           {provenance && (
             <button
               onClick={() => setLineageExpanded(!lineageExpanded)}
               className="nodrag"
               style={{
                 background: 'rgba(255,255,255,0.2)',
                 border: 'none',
                 borderRadius: '4px',
                 padding: '2px 4px',
                 cursor: 'pointer',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '2px'
               }}
               title="View data lineage"
             >
               <Info size={12} />
               {lineageExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
             </button>
           )}
         </div>
       </div>

       {/* DATA LINEAGE: Compact Pipeline Badge Panel */}
        {provenance && lineageExpanded && (
          <div className="nodrag" style={{
            backgroundColor: '#f8fafc',
            padding: '10px',
            fontSize: '10px',
            color: '#334155',
            borderBottom: '1px solid #e2e8f0',
            maxHeight: '180px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {/* Header & Meta */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
              <span style={{ fontWeight: '600', color: '#0f172a' }}>📊 Data Lineage</span>
              <span style={{ fontSize: '8px', color: '#64748b' }}>
                {new Date(provenance.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Global Settings Badges */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              <span style={{ backgroundColor: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '600' }}>
                H3 Res {provenance.resolution}
              </span>
              {provenance.zoningEnabled && provenance.targetZones && (
                <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '600' }}>
                  Zones: {provenance.targetZones.replace(/^.*[\/]/, '')}
                </span>
              )}
            </div>

            {/* Variables Sequence */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {provenance.variables?.map((v, i) => (
                <div key={i} style={{
                  backgroundColor: '#fff',
                  padding: '6px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  {/* Var Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '10px' }}>
                      {v.targetColumn}
                    </span>
                    <span style={{ fontSize: '8px', color: '#64748b', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.dataset}>
                      {v.dataset?.replace(/^.*[\/]/, '')}
                    </span>
                  </div>

                  {/* Pipeline Operator Badges (with smart string truncation) */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                    {/* Grid Operators (Blue-ish) */}
                    <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '2px 4px', borderRadius: '3px', fontSize: '8px', border: '1px solid #e2e8f0' }} title={`Allocation: ${v.allocation}`}>
                      {v.allocation?.replace('Proportional', 'Prop.').replace('Weighted', 'Wt.')}
                    </span>
                    <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '2px 4px', borderRadius: '3px', fontSize: '8px', border: '1px solid #e2e8f0' }} title={`Grid Aggregation: ${v.aggregation}`}>
                      {v.aggregation?.replace('Aggregation', 'Agg')}
                    </span>

                    {/* Zone Operators (Green-ish) - Only show if zoning is active */}
                    {v.zoningMapping && (
                      <span style={{ backgroundColor: '#f0fdf4', color: '#15803d', padding: '2px 4px', borderRadius: '3px', fontSize: '8px', border: '1px solid #bbf7d0' }} title={`Zone Mapping: ${v.zoningMapping}`}>
                        {v.zoningMapping?.replace('Zoning', 'Map')}
                      </span>
                    )}
                    {v.zoningAggregation && (
                      <span style={{ backgroundColor: '#f0fdf4', color: '#15803d', padding: '2px 4px', borderRadius: '3px', fontSize: '8px', border: '1px solid #bbf7d0' }} title={`Zone Aggregation: ${v.zoningAggregation}`}>
                        {v.zoningAggregation?.replace('Zoning', 'Agg')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Preview Area */}
      <div style={{ 
        flexGrow: 1, 
        height: '100%',
        minHeight: '160px', 
        backgroundColor: '#f8fafc',
        position: 'relative',
        borderRadius: '0 0 8px 8px'
      }}>
        {(resultMapData || zoneGeoJson) && (
          // 👇 Wrap the map and button in an absolutely positioned container
          <div style={{ position: 'absolute', inset: 0, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            <H3PreviewDeckGL 
              hexData={showHex ? resultMapData : null} 
              geojsonData={showZones ? zoneGeoJson : null}
              color={rgbColor}
              showHex={showHex}
              showZones={showZones}
            />
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Left} style={{ width: '10px', height: '10px', background: '#fff', border: `2px solid ${colorHex}`, left: '-6px' }} />
      <Handle type="source" position={Position.Right} style={{ width: '10px', height: '10px', background: colorHex, border: '2px solid #fff', right: '-6px' }} />
      
      <style>{`
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
});

export default ResultMapNode;