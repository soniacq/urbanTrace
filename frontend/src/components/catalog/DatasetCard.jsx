// frontend/src/components/DatasetCard.jsx
import React, { useState } from 'react';
import { Layers, Database, ChevronDown, ChevronUp, Eye, Info } from 'lucide-react';
import DatasetDetailsModal from './DatasetDetailsModal';

const DatasetCard = ({ dataset, onDragStart }) => {
  const [expanded, setExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
  const displayName = dataset.metadata?.name || dataset.name || "Untitled Dataset";
  const columns = dataset.metadata?.columns || [];
  const rowCount = dataset.metadata?.nb_rows || 0;
  const geoType = dataset.metadata?.geometricType || 'Unknown Geometry';

  const toggleExpand = (e) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const openModal = (e) => {
    e.stopPropagation();
    setShowModal(true);
  };

  return (
    <>
      <div 
        draggable
        onDragStart={(e) => onDragStart(e, dataset)}
        style={{
          padding: '12px',
          marginBottom: '12px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          cursor: 'grab',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          userSelect: 'none',
          position: 'relative',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'}
      >
        {/* Header: Flex container with Truncation Logic */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          
          {/* Left Side: Icon + Name (Flexible width) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, marginRight: '8px' }}>
            <Database size={16} color="#2563eb" style={{ flexShrink: 0 }} />
            
            {/* Truncation happens here */}
            <span 
              title={displayName} // Show full name on hover
              style={{ 
                fontWeight: '600', 
                fontSize: '0.9rem', 
                color: '#1f2937',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'block'
              }}
            >
              {displayName}
            </span>
          </div>
          
          {/* Right Side: See Button (Fixed width) */}
          <button 
            onClick={openModal}
            style={{
              flexShrink: 0, // Prevents button from being squashed
              background: '#eff6ff', border: 'none', borderRadius: '4px',
              padding: '4px 8px', cursor: 'pointer', color: '#2563eb',
              fontSize: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px'
            }}
          >
            <Info size={12} /> Info
          </button>
        </div>

        {/* Metadata Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Layers size={12} /> {geoType}
          </div>
          <div>{rowCount.toLocaleString()} rows</div>
        </div>

        {/* Columns Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {(expanded ? columns : columns.slice(0, 5)).map((col) => (
            <span 
              key={col.name}
              style={{
                fontSize: '0.7rem', padding: '2px 6px',
                backgroundColor: '#f3f4f6', borderRadius: '4px',
                color: '#374151', border: '1px solid #e5e7eb',
                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}
            >
              {col.name}
            </span>
          ))}
          {columns.length > 5 && (
            <button
              onClick={toggleExpand}
              style={{
                fontSize: '0.7rem', padding: '2px 8px', backgroundColor: '#fff',
                borderRadius: '4px', color: '#2563eb', border: '1px solid #2563eb',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px'
              }}
            >
              {expanded ? <><ChevronUp size={10} /></> : <><ChevronDown size={10} /> +{columns.length - 5}</>}
            </button>
          )}
        </div>
      </div>

      {showModal && (
        <DatasetDetailsModal 
          dataset={dataset} 
          onClose={() => setShowModal(false)} 
        />
      )}
    </>
  );
};

export default DatasetCard;