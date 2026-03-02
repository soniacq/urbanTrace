// frontend/src/components/DatasetDetailsModal.jsx
import React from 'react';
import { X, Layers, Hash, Type, Calendar, AlertCircle, FileText } from 'lucide-react';

// Helper to parse CSV lines while respecting quotes (for geometry strings)
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

const DatasetDetailsModal = ({ dataset, onClose }) => {
  if (!dataset) return null;

  const meta = dataset.metadata || {};
  const columns = meta.columns || [];
  
  // Parse Sample Data
  const sampleRows = meta.sample ? meta.sample.trim().split('\n') : [];
  const sampleHeaders = sampleRows.length > 0 ? parseCSVLine(sampleRows[0]) : [];
  const sampleBody = sampleRows.slice(1).map(row => parseCSVLine(row));

  // --- Aggregating Data Types for Chips ---
  const typeColors = {
    'Integer': '#3b82f6', // Blue
    'Float': '#06b6d4',   // Cyan
    'Text': '#10b981',    // Green
    'DateTime': '#8b5cf6',// Purple
    'Geometry': '#f59e0b' // Orange
  };

  const getSimpleType = (url) => {
    if (!url) return 'Text';
    if (url.includes('Integer')) return 'Integer';
    if (url.includes('Float')) return 'Float';
    if (url.includes('DateTime')) return 'DateTime';
    if (url.includes('Text')) return 'Text';
    return 'Text';
  };

  // unique types present in this dataset
  const presentTypes = [...new Set(columns.map(c => 
    c.name === 'geometry' || c.name === 'the_geom' ? 'Geometry' : getSimpleType(c.structural_type)
  ))];

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 1000, backdropFilter: 'blur(2px)'
    }}>
      <div style={{
        backgroundColor: 'white', width: '900px', maxHeight: '90vh',
        borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#111827' }}>{meta.name || dataset.name}</h2>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{dataset.filename}</span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <X size={24} color="#6b7280" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div style={{ padding: '24px', overflowY: 'auto' }}>
          
          {/* Top Section: Statistics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
            
            {/* 1. General Info */}
            <div style={cardStyle}>
              <h4 style={headerStyle}><FileText size={16} /> General</h4>
              <div style={rowStyle}>
                <span>Rows:</span> <strong>{meta.nb_rows?.toLocaleString() || '-'}</strong>
              </div>
              <div style={rowStyle}>
                <span>Size:</span> <strong>{dataset.size || 'Unknown'}</strong>
              </div>
              <div style={rowStyle}>
                <span>Geometry:</span> 
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Layers size={14} /> {meta.geometricType || 'None'}
                </span>
              </div>
            </div>

            {/* 2. Data Types */}
            <div style={cardStyle}>
              <h4 style={headerStyle}><Type size={16} /> Data Types</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {presentTypes.map(type => (
                  <span key={type} style={{
                    backgroundColor: typeColors[type] || '#9ca3af',
                    color: 'white', padding: '4px 8px', borderRadius: '12px',
                    fontSize: '0.75rem', fontWeight: '600'
                  }}>
                    {type}
                  </span>
                ))}
              </div>
            </div>

            {/* 3. Data Quality (Aggregated) */}
            <div style={cardStyle}>
              <h4 style={headerStyle}><AlertCircle size={16} /> Quality Overview</h4>
              <div style={rowStyle}>
                <span>Columns:</span> <strong>{columns.length}</strong>
              </div>
              <div style={rowStyle}>
                <span>Missing Values:</span> 
                <strong>
                   {columns.reduce((acc, col) => acc + (col.missing_values_ratio * meta.nb_rows || 0), 0).toFixed(0)} (Est.)
                </strong>
              </div>
            </div>
          </div>

          {/* Middle: Column Details Table */}
          <h3 style={{ fontSize: '1.1rem', marginBottom: '10px', color: '#374151' }}>Column Analysis</h3>
          <div style={{ overflowX: 'auto', marginBottom: '30px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <tr>
                  <th style={thStyle}>Column Name</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Distinct Values</th>
                  <th style={thStyle}>Missing Count</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}><b>{col.name}</b></td>
                    <td style={tdStyle}>{getSimpleType(col.structural_type)}</td>
                    <td style={tdStyle}>{col.num_distinct_values || '-'}</td>
                    <td style={{ ...tdStyle, color: col.missing_values_ratio > 0 ? '#ef4444' : '#10b981' }}>
                      {(col.missing_values_ratio * meta.nb_rows).toFixed(0) || '0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom: Sample Data Table */}
          <h3 style={{ fontSize: '1.1rem', marginBottom: '10px', color: '#374151' }}>Sample Data</h3>
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
              <thead style={{ backgroundColor: '#f3f4f6' }}>
                <tr>
                  {sampleHeaders.map((h, i) => <th key={i} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sampleBody.slice(0, 5).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ ...tdStyle, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
};

// Internal Styles
const cardStyle = { backgroundColor: '#f9fafb', padding: '15px', borderRadius: '8px', border: '1px solid #e5e7eb' };
const headerStyle = { margin: '0 0 10px 0', fontSize: '0.9rem', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '6px' };
const rowStyle = { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px', color: '#374151' };
const thStyle = { padding: '10px 15px', textAlign: 'left', fontWeight: '600', color: '#4b5563' };
const tdStyle = { padding: '8px 15px', color: '#1f2937' };

export default DatasetDetailsModal;