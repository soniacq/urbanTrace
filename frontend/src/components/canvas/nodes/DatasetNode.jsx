// frontend/src/components/DatasetNode.jsx
import React, { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Database, Layers, Palette, Info } from 'lucide-react'; // Added Info icon
import VectorPreviewDeckGL from '../../visualization/VectorPreviewDeckGL'; // Up 2 levels

const DatasetNode = memo(({ data }) => {
  const meta = data.metadata || {};
  const columns = meta.columns || [];
  const name = meta.name || data.name || 'Untitled';
  const filename = data.filename || name + '.geojson';
  
  // GLOBAL VIEWPORT SYNC: Extract sync props from data
  const isMapSyncEnabled = data.isMapSyncEnabled || false;
  const globalViewState = data.globalViewState;
  const onGlobalViewStateChange = data.onGlobalViewStateChange;
  
  // Initialize from data if available (for state persistence)
  const [selectedCol, setSelectedCol] = useState(data.selectedColumn || "");
  
  // Notify parent when column selection changes
  const handleColumnChange = (col) => {
    setSelectedCol(col);
    if (data.onColumnSelect) {
      data.onColumnSelect(col);
    }
  };

  const numericColumns = columns.filter(c => 
    ['Integer', 'Float', 'http://schema.org/Integer', 'http://schema.org/Float'].includes(c.structural_type) 
    || (c.mean !== undefined)
  );

  return (
    <div style={{
      width: '220px',
      backgroundColor: '#fff',
      borderRadius: '8px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      fontSize: '12px',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* 1. Header */}
      <div style={{
        backgroundColor: '#eff6ff', 
        padding: '8px 12px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between', // Pushes items to edges
        gap: '8px'
      }}>
        {/* Left: Icon + Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <Database size={13} color="#2563eb" />
          <span style={{ 
            fontWeight: '600', 
            color: '#1e3a8a', 
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis' 
          }}>
            {name}
          </span>
        </div>

        {/* Right: Info Button */}
        <button 
          className="nodrag" // Crucial: Prevents dragging when clicking button
          onClick={(e) => {
             e.stopPropagation(); // Prevents selecting the node
             // We check if the parent passed a handler function
             if (data.onShowInfo) {
                 data.onShowInfo(data); 
             } else {
                 alert("Metadata:\n" + JSON.stringify(meta, null, 2)); // Fallback
             }
          }}
          title="See Dataset Details"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
            borderRadius: '4px',
            transition: 'background 0.2s, color 0.2s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#dbeafe'; e.currentTarget.style.color = '#2563eb'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
        >
          <Info size={14} />
        </button>
      </div>

      {/* 2. Map Preview */}
      <VectorPreviewDeckGL 
        filename={filename} 
        selectedColumn={selectedCol}
        isMapSyncEnabled={isMapSyncEnabled}
        globalViewState={globalViewState}
        onGlobalViewStateChange={onGlobalViewStateChange}
      />

      {/* 3. Controls Section */}
      <div style={{ padding: '10px 12px', backgroundColor: '#fff', borderTop: '1px solid #f1f5f9' }}>
        
        {/* Selector */}
        <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '11px', fontWeight: '500', whiteSpace: 'nowrap' }}>
               <Palette size={11} /> Color by
            </label>
            <select 
                value={selectedCol} 
                onChange={(e) => handleColumnChange(e.target.value)}
                className="nodrag" 
                style={{
                    flexGrow: 1, 
                    width: '0',  
                    padding: '2px 4px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1', 
                    backgroundColor: '#fff',
                    color: '#334155', 
                    outline: 'none',
                    cursor: 'pointer',
                    height: '24px'
                }}
            >
                <option value="" style={{ color: '#64748b' }}>Default (Blue)</option>
                {numericColumns.map(col => (
                    <option key={col.name} value={col.name} style={{ color: '#0f172a' }}>
                        {col.name}
                    </option>
                ))}
            </select>
        </div>

        {/* Info Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '10px', paddingTop: '4px', borderTop: '1px dashed #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Layers size={10} /> {meta.geometricType || 'Unknown'}
          </div>
          <div>
            {meta.nb_rows?.toLocaleString() || 0} rows
          </div>
        </div>
      </div>

      {/* Connector */}
      <Handle type="source" position={Position.Right} style={{ background: '#2563eb', width: '8px', height: '8px', right: '-4px', border: '2px solid white' }} />
    </div>
  );
});

export default DatasetNode;