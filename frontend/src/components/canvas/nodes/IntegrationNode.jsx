import React, { useState, memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Network, Play, Link2, AlertCircle } from 'lucide-react';

const ALLOCATION_OPS = [
  "BinaryContainment",
  "BinaryCentroidContainment",
  "ProportionalAreaWeighted",
  "ProportionalLengthWeighted",
  "NearestAssignment",
  "GaussianKernel"
];

const AGGREGATION_OPS = [
  "SumAggregation",
  "MeanAggregation",
  "WeightedMeanAggregation",
  "DensityAggregation"
];

const IntegrationNode = memo(({ id, data }) => {
  const [allocation, setAllocation] = useState("BinaryCentroidContainment");
  const [aggregation, setAggregation] = useState("SumAggregation");
  const [targetColumn, setTargetColumn] = useState("count");
  const [resolution, setResolution] = useState(8);
  const [isLoading, setIsLoading] = useState(false);

  const handleRun = async (e) => {
    e.stopPropagation();
    if (!data.connectedDatasetFilename) {
      alert("Please connect a dataset node to the Integration Engine first.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/integrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_path: data.connectedDatasetFilename, 
          target_column: targetColumn,
          allocation_operator: allocation,
          aggregation_operator: aggregation,
          resolution: parseInt(resolution)
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Integration failed');
      }

      const resultData = await response.json();
      
      if (data.onIntegrationComplete) {
        data.onIntegrationComplete(id, resultData);
    }

    } catch (error) {
      console.error("Pipeline Error:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Shared input styling to keep things consistent
  const inputStyle = {
    width: '100%',
    padding: '4px 6px',
    fontSize: '11px',
    borderRadius: '4px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#fff',
    color: '#334155',
    outline: 'none',
    boxSizing: 'border-box',
    marginTop: '4px',
    height: '24px'
  };

  const labelStyle = {
    display: 'block',
    color: '#64748b',
    fontSize: '10px',
    fontWeight: '600',
    marginBottom: '8px'
  };

  return (
    <div style={{
      width: '240px',
      backgroundColor: '#fff',
      borderRadius: '8px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      fontSize: '12px',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Input Handle */}
      <Handle 
        type="target" 
        position={Position.Left} 
        style={{ background: '#3b82f6', width: '8px', height: '8px', left: '-4px', border: '2px solid white' }} 
      />

      {/* 1. Header */}
      <div style={{
        backgroundColor: '#f0f9ff', 
        padding: '8px 12px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <Network size={14} color="#0284c7" />
        <span style={{ fontWeight: '600', color: '#0369a1' }}>
          Spatial Integration
        </span>
      </div>

      {/* 2. Controls Section */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        
        {/* Status indicator */}
        <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            fontSize: '10px', 
            padding: '6px', 
            borderRadius: '4px',
            backgroundColor: data.connectedDatasetFilename ? '#f0fdf4' : '#fffbeb',
            color: data.connectedDatasetFilename ? '#15803d' : '#b45309',
            border: `1px solid ${data.connectedDatasetFilename ? '#bbf7d0' : '#fde68a'}`
        }}>
            {data.connectedDatasetFilename ? <Link2 size={12} /> : <AlertCircle size={12} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {data.connectedDatasetFilename || 'Waiting for dataset connection...'}
            </span>
        </div>

        <label style={labelStyle}>
          Target Column
          <input 
            type="text" 
            value={targetColumn} 
            onChange={e => setTargetColumn(e.target.value)}
            className="nodrag"
            style={inputStyle}
            placeholder="e.g. population"
          />
        </label>

        <label style={labelStyle}>
          Allocation (R)
          <select 
            value={allocation} 
            onChange={e => setAllocation(e.target.value)}
            className="nodrag" 
            style={{...inputStyle, cursor: 'pointer'}}
          >
            {ALLOCATION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        </label>

        <label style={labelStyle}>
          Aggregation (A₁)
          <select 
            value={aggregation} 
            onChange={e => setAggregation(e.target.value)}
            className="nodrag" 
            style={{...inputStyle, cursor: 'pointer'}}
          >
            {AGGREGATION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        </label>

        <label style={labelStyle}>
          H3 Resolution
          <input 
            type="number" 
            min="1" max="15"
            value={resolution} 
            onChange={e => setResolution(e.target.value)}
            className="nodrag"
            style={inputStyle}
          />
        </label>

        <button 
          onClick={handleRun}
          disabled={isLoading || !data.connectedDatasetFilename}
          className="nodrag"
          style={{
            marginTop: '8px',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            backgroundColor: (isLoading || !data.connectedDatasetFilename) ? '#cbd5e1' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: '600',
            cursor: (isLoading || !data.connectedDatasetFilename) ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          <Play size={12} fill="currentColor" />
          {isLoading ? "Processing..." : "Execute Pipeline"}
        </button>
      </div>

      {/* Output Handle */}
      <Handle 
        type="source" 
        position={Position.Right} 
        style={{ background: '#3b82f6', width: '8px', height: '8px', right: '-4px', border: '2px solid white' }} 
      />
    </div>
  );
});

export default IntegrationNode;