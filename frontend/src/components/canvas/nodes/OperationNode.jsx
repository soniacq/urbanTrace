import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, useReactFlow, NodeResizeControl } from '@xyflow/react';
import { Settings, Play, Loader2, AlertCircle, Download, SlidersHorizontal } from 'lucide-react';
import axios from 'axios';
import H3PreviewDeckGL from '../../visualization/H3PreviewDeckGL';

const OperationNode = memo(({ id, data }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [error, setError] = useState(null);
  
  const [resolution, setResolution] = useState(9);
  // 👇 1. New state to toggle the settings panel
  const [showSettings, setShowSettings] = useState(false); 
  
  const { getEdges, getNodes } = useReactFlow();

  // 👇 This forces Deck.GL to recalculate its viewport immediately after mounting
  useEffect(() => {
    if (resultData && !isRunning) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50); // A tiny 50ms delay lets the DOM finish rendering first
      return () => clearTimeout(timer);
    }
  }, [resultData, isRunning]);

  const handleRun = async () => {
    setError(null);
    setIsRunning(true);
    setResultData(null);
    // Optional: Auto-close settings when they hit run
    setShowSettings(false); 

    try {
      const edges = getEdges();
      const nodes = getNodes();
      
      const inputEdges = edges.filter(e => e.target === id);
      if (inputEdges.length === 0) {
        throw new Error("Please connect at least one dataset to the input handle first.");
      }

      const datasetIds = inputEdges.map(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        return sourceNode?.data?.id;
      }).filter(Boolean);

      if (datasetIds.length === 0) {
        throw new Error("Invalid input nodes connected.");
      }

      const operationType = data.opType || "intersect"; 

      const response = await axios.post('http://localhost:8000/run-operation', {
        operationType: operationType,
        datasetIds: datasetIds,
        resolution: resolution 
      });

      setResultData(response.data.data);

    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "An error occurred");
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownload = () => {
    if (!resultData) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(resultData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    const fileName = `${data.label.replace(/\s+/g, '_')}_res${resolution}.json`;
    downloadAnchorNode.setAttribute("download", fileName);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const colorHex = data.color || '#ec4899';
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      minWidth: '240px',  // 👈 ADD THIS
      minHeight: '240px', // 👈 ADD THIS
      borderRadius: '8px',
      backgroundColor: '#fff',
      border: `1px solid ${isRunning ? '#3b82f6' : colorHex}`,
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
          <Settings size={14} /> {data.label}
        </div>
        
        {/* 👇 2. Group the toggle button and RUN button together */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            title="Adjust Resolution"
            style={{ 
              background: showSettings ? 'rgba(255,255,255,0.8)' : '#fff', 
              color: colorHex, 
              border: 'none', 
              borderRadius: '4px', 
              padding: '4px 6px', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center',
              transition: 'background 0.2s'
            }}
          >
            <SlidersHorizontal size={12} />
          </button>

          <button 
            onClick={handleRun}
            disabled={isRunning}
            style={{ 
              background: '#fff', color: colorHex, border: 'none', borderRadius: '4px', 
              padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '10px', fontWeight: 'bold'
            }}
          >
            {isRunning ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} fill={colorHex} />}
            {isRunning ? 'RUNNING...' : 'RUN'}
          </button>
        </div>
      </div>

      {/* 👇 3. Conditionally render the settings panel based on the toggle state */}
      {showSettings && (
        <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#475569', marginBottom: '4px', fontWeight: 'bold' }}>
            <span>H3 Resolution: {resolution}</span>
            <span>{resolution <= 7 ? 'Coarse' : resolution >= 10 ? 'Fine' : 'Medium'}</span>
          </div>
          <input 
            type="range" 
            min="6" 
            max="11" 
            value={resolution} 
            onChange={(e) => setResolution(parseInt(e.target.value))}
            style={{ width: '100%', cursor: 'pointer', accentColor: colorHex }}
          />
        </div>
      )}

      {/* Preview Area (Unchanged) */}
      {/* 👇 4. Change Preview Area to Flex-Grow instead of fixed height */}
      <div style={{ 
        flexGrow: 1, 
        height: '100%',       // 👈 ADD THIS
        minHeight: '160px', 
        backgroundColor: '#f8fafc',
        position: 'relative',
        borderRadius: showSettings ? '0 0 8px 8px' : '0 0 8px 8px'
      }}>
        {isRunning && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(248, 250, 252, 0.8)', color: '#334155', zIndex: 10 }}>
            <span style={{ fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}><Loader2 size={14} className="animate-spin"/> Processing H3...</span>
          </div>
        )}

        {error && (
          <div style={{ position: 'absolute', inset: 0, padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ef4444', textAlign: 'center', backgroundColor: '#fee2e2' }}>
            <AlertCircle size={20} style={{ marginBottom: '4px' }}/>
            <span style={{ fontSize: '10px', fontWeight: 'bold' }}>{error}</span>
          </div>
        )}

        {resultData && !error && !isRunning && (
          // 👇 Wrap the map and button in an absolutely positioned container
          <div style={{ position: 'absolute', inset: 0, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            <H3PreviewDeckGL hexData={resultData} color={hexToRgb(colorHex)} />
            
            {/* Download Button */}
            <button
              onClick={handleDownload}
              title="Download Map Data"
              style={{
                position: 'absolute', top: '8px', right: '8px', zIndex: 10, backgroundColor: '#fff',
                color: '#334155', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <Download size={14} />
            </button>
          </div>
        )}

        {!resultData && !error && !isRunning && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
            <p style={{ fontSize: '11px', margin: 0, marginTop: '44px'}}>No Data Processed</p>
            <p style={{ fontSize: '9px', marginTop: '24px' }}>Connect input and click RUN</p>
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

export default OperationNode;