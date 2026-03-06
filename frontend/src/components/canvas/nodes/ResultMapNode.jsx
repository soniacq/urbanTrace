import React, { memo, useMemo, useEffect } from 'react';
import { Handle, Position, NodeResizeControl } from '@xyflow/react';
import { Map as MapIcon, Download } from 'lucide-react';
import H3PreviewDeckGL from '../../visualization/H3PreviewDeckGL'; 

const ResultMapNode = memo(({ id, data }) => {
  // Grab the dictionary of hexagons
  const resultMapData = data?.spatialData?.data;
  
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

  const colorHex = resultMapData?.color || '#10b981'; 
  
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
           <MapIcon size={14} /> {data.name || 'Integration Result'}
         </div>
       </div>

      {/* Preview Area (Unchanged) */}
      {/* 👇 4. Change Preview Area to Flex-Grow instead of fixed height */}
      <div style={{ 
        flexGrow: 1, 
        height: '100%',       // 👈 ADD THIS
        minHeight: '160px', 
        backgroundColor: '#f8fafc',
        position: 'relative',
        borderRadius: '0 0 8px 8px'
      }}>
        {resultMapData && (
          // 👇 Wrap the map and button in an absolutely positioned container
          <div style={{ position: 'absolute', inset: 0, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            <H3PreviewDeckGL hexData={resultMapData} color={rgbColor} />
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