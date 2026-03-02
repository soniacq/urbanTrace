// frontend/src/components/DatasetSidebar.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw, Map, Search, X } from 'lucide-react'; // Added X here
import DatasetCard from '../catalog/DatasetCard'; 

const DatasetSidebar = () => {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchDatasets = () => {
    setLoading(true);
    axios.get('http://localhost:8000/datasets')
      .then(res => {
        setDatasets(res.data.datasets);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching datasets", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

  const handleDragStart = (event, dataset) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(dataset));
    event.dataTransfer.effectAllowed = 'move';
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  const filteredDatasets = datasets.filter(ds => {
    const name = ds.metadata?.name || ds.name || "";
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f9fafb' }}>
      
      {/* 1. Fixed Header Section */}
      <div style={{ 
        padding: '20px', 
        borderBottom: '1px solid #e5e7eb', 
        backgroundColor: '#fff',
        flexShrink: 0 
      }}>
        {/* Title Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Map size={24} color="#2563eb" /> UrbanTrace
          </h2>
          <button 
            onClick={fetchDatasets} 
            title="Refresh Library"
            style={{ 
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
              borderRadius: '4px', color: '#6b7280', display: 'flex', alignItems: 'center',
              justifyContent: 'center', transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
        </div>

        {/* Search Input Row */}
        <div style={{ position: 'relative', width: '100%' }}>
          
          {/* Search Icon (Left) */}
          <Search 
            size={16} 
            color="#9ca3af" 
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} 
          />
          
          <input 
            type="text" 
            placeholder="Search datasets..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 30px 8px 34px', // Right padding increased to 30px to make room for X
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              fontSize: '0.875rem',
              outline: 'none',
              backgroundColor: '#f9fafb',
              color: '#70757d',        // Your custom color
              boxSizing: 'border-box'  // Prevents overflow
            }}
            onFocus={(e) => e.target.style.borderColor = '#2563eb'}
            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
          />

          {/* Clear Button (Right) - Only shows when there is text */}
          {searchTerm && (
            <button 
              onClick={clearSearch}
              title="Clear search"
              style={{ 
                position: 'absolute', 
                right: '8px', 
                top: '50%', 
                transform: 'translateY(-50%)',
                background: 'none', 
                border: 'none', 
                cursor: 'pointer', 
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                color: '#6b7280'
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Scrollable List Section */}
      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '15px' }}>
        {loading && <p style={{ fontSize: '0.8rem', color: '#666', textAlign: 'center' }}>Loading datasets...</p>}
        
        {!loading && filteredDatasets.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '20px', fontSize: '0.9rem' }}>
            {searchTerm ? 'No matching datasets' : 'No datasets found'}
          </div>
        )}

        {filteredDatasets.map(ds => (
          <DatasetCard 
            key={ds.id || ds.filename} 
            dataset={ds} 
            onDragStart={handleDragStart} 
          />
        ))}
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default DatasetSidebar;