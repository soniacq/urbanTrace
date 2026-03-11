import React, { useState, useEffect, useCallback, memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Network, Play, AlertCircle, MapPin, ChevronDown, ChevronUp, Settings } from 'lucide-react';

const ALLOCATION_OPS = [
  "BinaryContainment",
  "BinaryCentroidContainment",
  "ProportionalAreaWeighted",
  "ProportionalLengthWeighted",
  "NearestAssignment",
  "GaussianKernel"
];

const AGGREGATION_OPS = [
  // Mathematical operators (continuous/additive data)
  "SumAggregation",
  "MeanAggregation",
  "WeightedMeanAggregation",
  "DensityAggregation",
  // Discrete selection operators (categorical/index data)
  "MajorityAggregation",
  "MaxAggregation",
  "MinAggregation",
  // Line network operators (street/transit geometries)
  "LengthWeightedAggregation"
];

const ZONING_MAPPING_OPS = [
  "CentroidZoning",
  "AreaWeightedZoning"
];

const ZONING_AGGREGATION_OPS = [
  // Mathematical operators (continuous/additive data)
  "SumZoning",
  "WeightedMeanZoning",
  "DensityZoning",
  // Discrete selection operators (categorical/index data)
  "MajorityZoning",
  "MaxZoning",
  "MinZoning",
  // Line network operators (street/transit geometries)
  "LengthWeightedZoning"
];

// =============================================================================
// MATH-SAFE MAPPINGS
// =============================================================================

// Geometry → Allocation mapping (auto-allocation)
const GEOMETRY_TO_ALLOCATION = {
  "Polygon": "ProportionalAreaWeighted",
  "MultiPolygon": "ProportionalAreaWeighted",
  "LineString": "ProportionalLengthWeighted",
  "MultiLineString": "ProportionalLengthWeighted",
  "Point": "NearestAssignment",
  "MultiPoint": "NearestAssignment"
};

// Zone Aggregator → Grid Aggregator mapping (reverse-sync)
const ZONE_TO_GRID_AGGREGATION = {
  "SumZoning": "SumAggregation",
  "WeightedMeanZoning": "WeightedMeanAggregation",
  "DensityZoning": "DensityAggregation",
  "MajorityZoning": "MajorityAggregation",
  "MaxZoning": "MaxAggregation",
  "MinZoning": "MinAggregation",
  "LengthWeightedZoning": "LengthWeightedAggregation"
};

const IntegrationNode = memo(({ id, data }) => {
  // ==========================================================================
  // MULTIVARIATE STATE - Variable Cards
  // ==========================================================================
  const [variableConfigs, setVariableConfigs] = useState({});
  const [expandedCards, setExpandedCards] = useState({});
  const [advancedExpanded, setAdvancedExpanded] = useState({}); // Track advanced section per card
  
  // Check if we're in multivariate mode (multiple datasets connected)
  const connectedDatasets = data.connectedDatasets || [];
  const hasDatasets = connectedDatasets.length > 0;

  // Shared state
  const [resolution, setResolution] = useState(8);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize variable configs when datasets connect
  useEffect(() => {
    const newConfigs = { ...variableConfigs };
    let configsChanged = false;
    
    connectedDatasets.forEach(dataset => {
      const meta = dataset.metadata;
      // Get available numeric columns for auto-selection
      const numericCols = meta?.columns?.filter(c => 
        ['Integer', 'Float', 'http://schema.org/Integer', 'http://schema.org/Float'].includes(c.structural_type) 
        || (c.mean !== undefined)
      ).map(c => c.name) || [];
      
      if (!newConfigs[dataset.id]) {
        // CONTEXTUAL STATE INHERITANCE:
        // Pre-populate targetColumn from upstream node's selection
        // If no selection was made, auto-select first numeric column
        const inheritedColumn = dataset.inheritedColumn || '';
        const autoSelectedColumn = inheritedColumn || (numericCols.length > 0 ? numericCols[0] : '');
        
        newConfigs[dataset.id] = {
          id: dataset.id,
          nodeId: dataset.nodeId,
          filename: dataset.filename,
          metadata: dataset.metadata,
          targetColumn: autoSelectedColumn,  // Smart default from upstream or auto-select
          allocation: GEOMETRY_TO_ALLOCATION[dataset.metadata?.geometricType] || 'ProportionalAreaWeighted',
          aggregation: 'SumAggregation',
          zoningMapping: 'AreaWeightedZoning',
          zoningAggregation: 'SumZoning'
        };
        configsChanged = true;
      } else {
        // LIVE SYNC: Update targetColumn if upstream selection changed
        const currentConfig = newConfigs[dataset.id];
        const inheritedColumn = dataset.inheritedColumn || '';
        
        // Only update if upstream selected a column AND it's different from current
        if (inheritedColumn && inheritedColumn !== currentConfig.targetColumn) {
          newConfigs[dataset.id] = {
            ...currentConfig,
            targetColumn: inheritedColumn
          };
          configsChanged = true;
        }
      }
    });
    
    // Remove configs for disconnected datasets
    Object.keys(newConfigs).forEach(id => {
      if (!connectedDatasets.find(d => d.id === id)) {
        delete newConfigs[id];
        configsChanged = true;
      }
    });
    
    if (configsChanged) {
      setVariableConfigs(newConfigs);
    }
  }, [connectedDatasets]);

  // Update a specific variable's config
  const updateVariableConfig = useCallback((varId, updates) => {
    setVariableConfigs(prev => ({
      ...prev,
      [varId]: { ...prev[varId], ...updates }
    }));
  }, []);

  // Remove a variable
  const removeVariable = useCallback((varId) => {
    setVariableConfigs(prev => {
      const next = { ...prev };
      delete next[varId];
      return next;
    });
  }, []);

  // Toggle card expansion
  const toggleCardExpand = useCallback((varId) => {
    setExpandedCards(prev => ({
      ...prev,
      [varId]: !prev[varId]
    }));
  }, []);

  // Toggle advanced grid settings per card
  const toggleAdvancedExpand = useCallback((varId) => {
    setAdvancedExpanded(prev => ({
      ...prev,
      [varId]: !prev[varId]
    }));
  }, []);

  // CONNECTION-DRIVEN STATE: Zoning is enabled when a zone dataset is connected
  // No checkbox needed - the wire IS the toggle
  const zoningEnabled = !!data.connectedZoneFilename;
  const [zoningExpanded, setZoningExpanded] = useState(false);
  const [zoningMapping, setZoningMapping] = useState("AreaWeightedZoning");
  const [zoningAggregation, setZoningAggregation] = useState("SumZoning");
  const [outputMode, setOutputMode] = useState("zones"); // "grid" | "zones" | "both"

  // Reset zoning settings to defaults when zone disconnected
  // Keep collapsed by default for progressive disclosure (user expands if needed)
  useEffect(() => {
    if (!zoningEnabled) {
      // CONNECTION REMOVED: Reset zoning settings to defaults
      setZoningExpanded(false);
      setZoningMapping("AreaWeightedZoning");
      setZoningAggregation("SumZoning");
      setOutputMode("zones");
    }
  }, [zoningEnabled]);

  const handleRun = useCallback(async (e) => {
    e.stopPropagation();
    
    // UNIFIED VARIABLE CARDS: Always use multivariate pipeline (even for 1 variable)
    const configsArray = Object.values(variableConfigs);
    
    if (configsArray.length === 0) {
      alert("Please connect at least one dataset to the Integration Engine.");
      return;
    }
    
    // Validate all variables have target columns
    const missingTargets = configsArray.filter(v => !v.targetColumn);
    if (missingTargets.length > 0) {
      alert(`Please select target columns for: ${missingTargets.map(v => v.filename).join(', ')}`);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/integrate_multivariate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variables: configsArray.map(v => ({
            dataset_path: v.filename,
            target_column: v.targetColumn,
            allocation_operator: v.allocation,
            grid_aggregation_operator: v.aggregation,
            zoning_mapping_operator: v.zoningMapping,
            zoning_aggregation_operator: v.zoningAggregation
          })),
          zones_path: zoningEnabled ? data.connectedZoneFilename : null,
          resolution: parseInt(resolution),
          output_mode: zoningEnabled ? outputMode : 'grid'  // Default to grid when no zoning
        })
      });

      if (!response.ok) {
        const err = await response.json();
        const detail = Array.isArray(err.detail) 
          ? err.detail.map(e => e.msg || e.message || JSON.stringify(e)).join('; ')
          : (err.detail || 'Integration failed');
        throw new Error(detail);
      }

      const resultData = await response.json();
      resultData.isMultivariate = configsArray.length > 1;
      resultData.isZoned = zoningEnabled;
      resultData.outputMode = zoningEnabled ? outputMode : 'grid';

      // DATA LINEAGE: Capture configuration snapshot for provenance tracking
      resultData.provenance = {
        timestamp: new Date().toISOString(),
        isMultivariate: configsArray.length > 1,
        resolution: parseInt(resolution),
        zoningEnabled: zoningEnabled,
        targetZones: zoningEnabled ? data.connectedZoneFilename : null,
        outputMode: zoningEnabled ? outputMode : 'grid',
        variables: configsArray.map(v => ({
          dataset: v.filename,
          targetColumn: v.targetColumn,
          allocation: v.allocation,
          aggregation: v.aggregation,
          zoningMapping: v.zoningMapping,
          zoningAggregation: v.zoningAggregation
        }))
      };

      if (data.onIntegrationComplete) {
        data.onIntegrationComplete(id, resultData);
      }
      
      // COLLAPSE ALL CARDS: Clean up UI after successful execution
      setExpandedCards({});
      setAdvancedExpanded({});
      setZoningExpanded(false);
    } catch (error) {
      console.error("Pipeline Error:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [
    id,
    variableConfigs,
    data.connectedZoneFilename,
    data.onIntegrationComplete,
    resolution,
    zoningMapping,
    zoningAggregation,
    outputMode
  ]);

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
      width: '260px',
      backgroundColor: '#fff',
      borderRadius: '8px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      fontSize: '12px',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Source Dataset Input Handle (Left) */}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="source"
        style={{ background: '#3b82f6', width: '8px', height: '8px', left: '-4px', top: '30%', border: '2px solid white' }} 
      />

      {/* Zone Dataset Input Handle (Left, below source) */}
      <Handle 
        type="target" 
        position={Position.Left}
        id="zones"
        style={{ 
          background: zoningEnabled ? '#10b981' : '#9ca3af', 
          width: '8px', 
          height: '8px', 
          left: '-4px', 
          top: 'auto',
          bottom: '15%',
          border: '2px solid white',
          transition: 'background-color 0.2s'
        }} 
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
        
        {/* UNIFIED VARIABLE CARDS: Same UI for 1 or N datasets */}
        {hasDatasets ? (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '4px'
            }}>
              <span style={{ fontSize: '10px', color: '#6366f1', fontWeight: '600' }}>
                📊 {connectedDatasets.length} Variable{connectedDatasets.length > 1 ? 's' : ''}
              </span>
            </div>
            
            {/* Variable Cards */}
            {connectedDatasets.map((dataset, idx) => {
              const config = variableConfigs[dataset.id] || {};
              const isExpanded = expandedCards[dataset.id];
              const meta = dataset.metadata;
              const geoType = meta?.geometricType || 'Polygon';
              const cols = meta?.columns?.filter(c => 
                ['Integer', 'Float', 'http://schema.org/Integer', 'http://schema.org/Float'].includes(c.structural_type) 
                || (c.mean !== undefined)
              ).map(c => c.name) || [];
              
              return (
                <div 
                  key={dataset.id}
                  style={{
                    border: '1px solid #c7d2fe',
                    borderRadius: '6px',
                    backgroundColor: '#f5f3ff',
                    padding: '8px',
                    fontSize: '10px'
                  }}
                >
                  {/* Card Header */}
                  <div 
                    onClick={() => toggleCardExpand(dataset.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      marginBottom: isExpanded ? '8px' : 0
                    }}
                    className="nodrag"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ 
                        backgroundColor: '#6366f1', 
                        color: '#fff', 
                        width: '16px', 
                        height: '16px', 
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: '600'
                      }}>
                        {idx + 1}
                      </span>
                      <span style={{ fontWeight: '600', color: '#4338ca', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {dataset.filename}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ 
                        backgroundColor: '#dbeafe', 
                        color: '#1d4ed8', 
                        padding: '1px 4px', 
                        borderRadius: '3px',
                        fontSize: '8px'
                      }}>
                        {geoType}
                      </span>
                      <span title={isExpanded ? 'Collapse' : 'Configure'}>
                        {isExpanded ? <ChevronUp size={12} color="#6366f1" /> : <ChevronDown size={12} color="#6366f1" />}
                      </span>
                    </div>
                  </div>
                  
                  {/* Expanded Controls - Outcome-Driven Progressive Disclosure */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {/* Primary: Target Column (always visible) */}
                      <label style={{...labelStyle, marginBottom: '4px', fontSize: '9px'}}>
                        Target Column
                        <select 
                          value={config.targetColumn || ''}
                          onChange={e => updateVariableConfig(dataset.id, { targetColumn: e.target.value })}
                          className="nodrag"
                          style={{...inputStyle, cursor: 'pointer', fontSize: '10px', height: '22px'}}
                        >
                          <option value="">Select...</option>
                          {cols.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                      </label>
                      
                      {/* Primary Outcome Settings (when zoning enabled) */}
                      {zoningEnabled && (
                        <>
                          <label style={{...labelStyle, marginBottom: '4px', fontSize: '9px', color: '#047857'}}>
                            Boundary Math (Z_map)
                            <select 
                              value={config.zoningMapping || 'AreaWeightedZoning'}
                              onChange={e => updateVariableConfig(dataset.id, { zoningMapping: e.target.value })}
                              className="nodrag"
                              style={{...inputStyle, cursor: 'pointer', fontSize: '10px', height: '22px', borderColor: '#6ee7b7'}}
                            >
                              {ZONING_MAPPING_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                            </select>
                          </label>
                          
                          <label style={{...labelStyle, marginBottom: '4px', fontSize: '9px', color: '#047857'}}>
                            Final Math (A₂)
                            <select 
                              value={config.zoningAggregation || 'SumZoning'}
                              onChange={e => {
                                // Reverse-sync: auto-set grid aggregation based on zone aggregation
                                const newZoneAgg = e.target.value;
                                const gridAgg = ZONE_TO_GRID_AGGREGATION[newZoneAgg] || 'SumAggregation';
                                updateVariableConfig(dataset.id, { 
                                  zoningAggregation: newZoneAgg,
                                  aggregation: gridAgg  // Auto-sync grid aggregation
                                });
                              }}
                              className="nodrag"
                              style={{...inputStyle, cursor: 'pointer', fontSize: '10px', height: '22px', borderColor: '#6ee7b7'}}
                            >
                              {ZONING_AGGREGATION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                            </select>
                          </label>
                        </>
                      )}
                      
                      {/* Grid-only mode: show allocation & aggregation directly */}
                      {!zoningEnabled && (
                        <>
                          <label style={{...labelStyle, marginBottom: '4px', fontSize: '9px'}}>
                            Allocation
                            <select 
                              value={config.allocation || 'ProportionalAreaWeighted'}
                              onChange={e => updateVariableConfig(dataset.id, { allocation: e.target.value })}
                              className="nodrag"
                              style={{...inputStyle, cursor: 'pointer', fontSize: '10px', height: '22px'}}
                            >
                              {ALLOCATION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                            </select>
                          </label>
                          
                          <label style={{...labelStyle, marginBottom: '4px', fontSize: '9px'}}>
                            Aggregation
                            <select 
                              value={config.aggregation || 'SumAggregation'}
                              onChange={e => updateVariableConfig(dataset.id, { aggregation: e.target.value })}
                              className="nodrag"
                              style={{...inputStyle, cursor: 'pointer', fontSize: '10px', height: '22px'}}
                            >
                              {AGGREGATION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                            </select>
                          </label>
                        </>
                      )}
                      
                      {/* Advanced Grid Configuration (Progressive Disclosure) */}
                      {zoningEnabled && (
                        <>
                          <div 
                            onClick={(e) => { e.stopPropagation(); toggleAdvancedExpand(dataset.id); }}
                            className="nodrag"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              marginTop: '4px',
                              paddingTop: '6px',
                              borderTop: '1px dashed #c7d2fe',
                              cursor: 'pointer',
                              color: '#6b7280',
                              fontSize: '8px'
                            }}
                          >
                            <Settings size={9} />
                            <span>Advanced Grid Config</span>
                            {advancedExpanded[dataset.id] ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                          </div>
                          
                          {advancedExpanded[dataset.id] && (
                            <div style={{ 
                              padding: '6px', 
                              backgroundColor: '#f8fafc', 
                              borderRadius: '4px', 
                              border: '1px solid #e2e8f0',
                              marginTop: '4px'
                            }}>
                              <div style={{ fontSize: '8px', color: '#64748b', marginBottom: '4px' }}>
                                ⚡ Auto-synced from Final Math
                              </div>
                              <label style={{...labelStyle, marginBottom: '4px', fontSize: '8px', color: '#64748b'}}>
                                Grid Allocation
                                <select 
                                  value={config.allocation || 'ProportionalAreaWeighted'}
                                  onChange={e => updateVariableConfig(dataset.id, { allocation: e.target.value })}
                                  className="nodrag"
                                  style={{...inputStyle, cursor: 'pointer', fontSize: '9px', height: '20px'}}
                                >
                                  {ALLOCATION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                                </select>
                              </label>
                              <label style={{...labelStyle, marginBottom: '0', fontSize: '8px', color: '#64748b'}}>
                                Grid Aggregation
                                <select 
                                  value={config.aggregation || 'SumAggregation'}
                                  onChange={e => updateVariableConfig(dataset.id, { aggregation: e.target.value })}
                                  className="nodrag"
                                  style={{...inputStyle, cursor: 'pointer', fontSize: '9px', height: '20px'}}
                                >
                                  {AGGREGATION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                                </select>
                              </label>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Shared Resolution */}
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
          </>
        ) : (
          /* EMPTY STATE: No datasets connected */
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            fontSize: '10px', 
            padding: '12px', 
            borderRadius: '4px',
            backgroundColor: '#fffbeb',
            color: '#b45309',
            border: '1px dashed #fcd34d'
          }}>
            <AlertCircle size={14} />
            <span>Connect dataset(s) to the left handle to begin</span>
          </div>
        )}
        {/* END: Variable Cards */}

        {/* Zoning Section - Shared between both modes */}
        <div style={{
          marginTop: '4px',
          borderTop: '1px solid #e2e8f0',
          paddingTop: '8px'
        }}>
          {/* Zoning Toggle Header - CONNECTION-DRIVEN (no checkbox) */}
          <div 
            onClick={(e) => { e.stopPropagation(); if (zoningEnabled) setZoningExpanded(!zoningExpanded); }}
            className="nodrag"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: zoningEnabled ? 'pointer' : 'default',
              padding: '4px 0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={12} color={zoningEnabled ? '#10b981' : '#9ca3af'} />
              <span style={{ fontSize: '10px', fontWeight: '600', color: zoningEnabled ? '#047857' : '#64748b' }}>
                {zoningEnabled ? 'Zoning Active' : 'Connect zone to enable'}
              </span>
            </div>
            {zoningEnabled && (
              <span title={zoningExpanded ? 'Collapse' : 'Settings'} style={{ color: '#047857' }}>
                {zoningExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </span>
            )}
          </div>

          {/* Zoning Controls - Per-variable ops are configured in cards */}
          {zoningEnabled && zoningExpanded && (
            <div style={{ 
              marginTop: '8px', 
              padding: '8px', 
              backgroundColor: '#f0fdf4', 
              borderRadius: '4px',
              border: '1px solid #bbf7d0'
            }}>
              {/* Zone dataset status */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                fontSize: '10px', 
                padding: '6px', 
                borderRadius: '4px',
                marginBottom: '8px',
                backgroundColor: '#ecfdf5',
                color: '#047857',
                border: '1px dashed #6ee7b7'
              }}>
                <MapPin size={10} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  Zones: {data.connectedZoneFilename}
                </span>
              </div>

              {/* Per-variable zoning settings hint */}
              <div style={{ fontSize: '9px', color: '#047857', marginBottom: '8px', fontStyle: 'italic' }}>
                ✓ Per-variable zone math configured in Variable Cards above
              </div>

              <label style={{...labelStyle, color: '#047857'}}>
                Output Mode
                <select 
                  value={outputMode} 
                  onChange={e => setOutputMode(e.target.value)}
                  className="nodrag" 
                  style={{...inputStyle, cursor: 'pointer', borderColor: '#6ee7b7'}}
                >
                  <option value="grid">H3 Grid Only</option>
                  <option value="zones">Zones Only</option>
                  <option value="both">Both (Grid + Zones)</option>
                </select>
              </label>
            </div>
          )}
        </div>

        {/* Execute Button */}
        <button 
          onClick={handleRun}
          disabled={
            isLoading || 
            !hasDatasets ||
            Object.values(variableConfigs).some(v => !v.targetColumn)
          }
          className="nodrag"
          style={{
            marginTop: '8px',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            backgroundColor: (
              isLoading || !hasDatasets || Object.values(variableConfigs).some(v => !v.targetColumn)
            ) ? '#cbd5e1' : '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: '600',
            cursor: (
              isLoading || !hasDatasets || Object.values(variableConfigs).some(v => !v.targetColumn)
            ) ? 'not-allowed' : 'pointer',
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