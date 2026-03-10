import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Network, Play, Link2, AlertCircle, MapPin, ChevronDown, ChevronUp, Settings } from 'lucide-react';

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
  const isMultivariate = connectedDatasets.length > 1;

  // Legacy single-variable state (for backward compatibility)
  const [allocation, setAllocation] = useState("ProportionalAreaWeighted");
  const [aggregation, setAggregation] = useState("SumAggregation");
  const [targetColumn, setTargetColumn] = useState("");
  const [resolution, setResolution] = useState(8);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Initialize variable configs when datasets connect
  useEffect(() => {
    const newConfigs = { ...variableConfigs };
    let configsChanged = false;
    
    connectedDatasets.forEach(dataset => {
      if (!newConfigs[dataset.id]) {
        // CONTEXTUAL STATE INHERITANCE:
        // Pre-populate targetColumn from upstream node's selection
        const inheritedColumn = dataset.inheritedColumn || '';
        
        newConfigs[dataset.id] = {
          id: dataset.id,
          nodeId: dataset.nodeId,
          filename: dataset.filename,
          metadata: dataset.metadata,
          targetColumn: inheritedColumn,  // Smart default from upstream
          allocation: GEOMETRY_TO_ALLOCATION[dataset.metadata?.geometricType] || 'ProportionalAreaWeighted',
          aggregation: 'SumAggregation',
          zoningMapping: 'AreaWeightedZoning',
          zoningAggregation: 'SumZoning'
        };
        configsChanged = true;
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

  // Extract geometry type from connected dataset metadata (legacy)
  const geometryType = useMemo(() => {
    return data.connectedDatasetMetadata?.geometricType || null;
  }, [data.connectedDatasetMetadata]);

  // Extract numeric columns from connected dataset metadata (legacy)
  const numericColumns = useMemo(() => {
    const meta = data.connectedDatasetMetadata;
    if (!meta?.columns) return [];
    return meta.columns.filter(c => 
      ['Integer', 'Float', 'http://schema.org/Integer', 'http://schema.org/Float'].includes(c.structural_type) 
      || (c.mean !== undefined)
    ).map(c => c.name);
  }, [data.connectedDatasetMetadata]);

  // Auto-select first numeric column when dataset changes (legacy)
  useEffect(() => {
    if (numericColumns.length > 0 && !numericColumns.includes(targetColumn)) {
      setTargetColumn(numericColumns[0]);
    }
  }, [numericColumns, targetColumn]);

  // Geometry-Based Auto-Allocation (legacy)
  useEffect(() => {
    if (geometryType && GEOMETRY_TO_ALLOCATION[geometryType]) {
      setAllocation(GEOMETRY_TO_ALLOCATION[geometryType]);
    }
  }, [geometryType]);

  // Zoning state
  const [zoningEnabled, setZoningEnabled] = useState(false);
  const [zoningExpanded, setZoningExpanded] = useState(false);
  const [zoningMapping, setZoningMapping] = useState("AreaWeightedZoning");
  const [zoningAggregation, setZoningAggregation] = useState("SumZoning");
  const [outputMode, setOutputMode] = useState("grid"); // "grid" | "zones" | "both"

  // Reverse-Sync - Zone Aggregator auto-sets Grid Aggregator (legacy)
  // When user selects their final output math, we backfill the grid step
  // ==========================================================================
  useEffect(() => {
    if (zoningEnabled && ZONE_TO_GRID_AGGREGATION[zoningAggregation]) {
      setAggregation(ZONE_TO_GRID_AGGREGATION[zoningAggregation]);
    }
  }, [zoningEnabled, zoningAggregation]);

  const handleRun = useCallback(async (e) => {
    e.stopPropagation();
    
    // ========================================================================
    // MULTIVARIATE MODE: Use parallel pipeline
    // ========================================================================
    if (isMultivariate) {
      const configsArray = Object.values(variableConfigs);
      
      // Validate all variables have target columns
      const missingTargets = configsArray.filter(v => !v.targetColumn);
      if (missingTargets.length > 0) {
        alert(`Please select target columns for: ${missingTargets.map(v => v.filename).join(', ')}`);
        return;
      }

      if (zoningEnabled && !data.connectedZoneFilename) {
        alert("Please connect a zone dataset to use zoning, or disable zoning.");
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
            output_mode: outputMode
          })
        });

        if (!response.ok) {
          const err = await response.json();
          // Handle FastAPI validation errors (detail can be array or string)
          const detail = Array.isArray(err.detail) 
            ? err.detail.map(e => e.msg || e.message || JSON.stringify(e)).join('; ')
            : (err.detail || 'Multivariate integration failed');
          throw new Error(detail);
        }

        const resultData = await response.json();
        resultData.isMultivariate = true;
        resultData.isZoned = zoningEnabled;
        resultData.outputMode = outputMode;

        // DATA LINEAGE: Capture configuration snapshot for provenance tracking
        resultData.provenance = {
          timestamp: new Date().toISOString(),
          isMultivariate: true,
          resolution: parseInt(resolution),
          zoningEnabled: zoningEnabled,
          targetZones: zoningEnabled ? data.connectedZoneFilename : null,
          outputMode: outputMode,
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
      } catch (error) {
        console.error("Multivariate Pipeline Error:", error);
        alert(`Error: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // ========================================================================
    // SINGLE-VARIABLE MODE (legacy)
    // ========================================================================
    if (!data.connectedDatasetFilename) {
      alert("Please connect a dataset node to the Integration Engine first.");
      return;
    }

    // If zoning is enabled but no zone dataset is connected
    if (zoningEnabled && !data.connectedZoneFilename) {
      alert("Please connect a zone dataset to use zoning, or disable zoning.");
      return;
    }

    setIsLoading(true);
    try {
      let response;
      let resultData;

      if (zoningEnabled && data.connectedZoneFilename) {
        // Call the zoned integration endpoint
        response = await fetch('http://localhost:8000/api/integrate_zoned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataset_path: data.connectedDatasetFilename,
            target_column: targetColumn,
            allocation_operator: allocation,
            grid_aggregation_operator: aggregation,
            zoning_mapping_operator: zoningMapping,
            zoning_aggregation_operator: zoningAggregation,
            zones_path: data.connectedZoneFilename,
            resolution: parseInt(resolution),
            output_mode: outputMode
          })
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || 'Zoned integration failed');
        }

        resultData = await response.json();
        resultData.outputMode = outputMode;
        resultData.isZoned = true;

      } else {
        // Call the standard grid integration endpoint
        response = await fetch('http://localhost:8000/api/integrate', {
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

        resultData = await response.json();
        resultData.isZoned = false;
      }

      // DATA LINEAGE: Capture configuration snapshot for provenance tracking
      resultData.provenance = {
        timestamp: new Date().toISOString(),
        isMultivariate: false,
        resolution: parseInt(resolution),
        zoningEnabled: zoningEnabled,
        targetZones: zoningEnabled ? data.connectedZoneFilename : null,
        outputMode: zoningEnabled ? outputMode : 'grid',
        variables: [{
          dataset: data.connectedDatasetFilename,
          targetColumn: targetColumn,
          allocation: allocation,
          aggregation: aggregation,
          zoningMapping: zoningEnabled ? zoningMapping : null,
          zoningAggregation: zoningEnabled ? zoningAggregation : null
        }]
      };

      if (data.onIntegrationComplete) {
        data.onIntegrationComplete(id, resultData);
      }

    } catch (error) {
      console.error("Pipeline Error:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [
    id,
    isMultivariate,
    variableConfigs,
    data.connectedDatasetFilename,
    data.connectedZoneFilename,
    data.onIntegrationComplete,
    targetColumn,
    allocation,
    aggregation,
    resolution,
    zoningEnabled,
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
          top: '70%', 
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
        
        {/* MULTIVARIATE MODE: Show Variable Cards */}
        {isMultivariate ? (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '4px'
            }}>
              <span style={{ fontSize: '10px', color: '#6366f1', fontWeight: '600' }}>
                📊 {connectedDatasets.length} Variables
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
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
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
              H3 Resolution (shared)
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
          /* SINGLE-VARIABLE MODE (legacy) */
          <>
            {/* Source dataset status with geometry indicator */}
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
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {data.connectedDatasetFilename ? `Source: ${data.connectedDatasetFilename}` : 'Connect source dataset...'}
                </span>
                {geometryType && (
                  <span style={{ 
                    backgroundColor: '#dbeafe', 
                    color: '#1d4ed8', 
                    padding: '1px 4px', 
                    borderRadius: '3px',
                    fontSize: '9px',
                    fontWeight: '600'
                  }}>
                    {geometryType}
                  </span>
                )}
            </div>

            <label style={labelStyle}>
              Target Column
              <select 
                value={targetColumn} 
                onChange={e => setTargetColumn(e.target.value)}
                className="nodrag"
                style={{...inputStyle, cursor: 'pointer'}}
                disabled={numericColumns.length === 0}
              >
                {numericColumns.length === 0 ? (
                  <option value="">Connect dataset first...</option>
                ) : (
                  numericColumns.map(col => <option key={col} value={col}>{col}</option>)
                )}
              </select>
            </label>

            {/* Grid settings - show inline when no zoning, hide behind Advanced when zoning */}
            {!zoningEnabled && (
              <>
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
          </>
        )}

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
        )}
        {/* END: Single vs Multi variable mode branching */}

        {/* Zoning Section - Shared between both modes */}
        <div style={{
          marginTop: '4px',
          borderTop: '1px solid #e2e8f0',
          paddingTop: '8px'
        }}>
          {/* Zoning Toggle Header */}
          <div 
            onClick={(e) => { e.stopPropagation(); setZoningExpanded(!zoningExpanded); }}
            className="nodrag"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '4px 0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                checked={zoningEnabled}
                onChange={(e) => { 
                  e.stopPropagation(); 
                  setZoningEnabled(e.target.checked);
                  if (e.target.checked) setZoningExpanded(true);
                }}
                className="nodrag"
                style={{ margin: 0, cursor: 'pointer' }}
              />
              <MapPin size={12} color={zoningEnabled ? '#10b981' : '#9ca3af'} />
              <span style={{ fontSize: '10px', fontWeight: '600', color: zoningEnabled ? '#047857' : '#64748b' }}>
                Aggregate to Zones (Z)
              </span>
            </div>
            {zoningEnabled && (zoningExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
          </div>

          {/* Zoning Controls - Only zone dataset & output mode when multivariate (per-variable ops are in cards) */}
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
                backgroundColor: data.connectedZoneFilename ? '#ecfdf5' : '#fef3c7',
                color: data.connectedZoneFilename ? '#047857' : '#92400e',
                border: `1px dashed ${data.connectedZoneFilename ? '#6ee7b7' : '#fcd34d'}`
              }}>
                <MapPin size={10} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {data.connectedZoneFilename ? `Zones: ${data.connectedZoneFilename}` : 'Connect zone dataset to left handle...'}
                </span>
              </div>

              {/* Single-variable mode: show zone mapping/aggregation controls */}
              {!isMultivariate && (
                <>
                  <label style={{...labelStyle, color: '#047857'}}>
                    Zone Mapping (Z_map)
                    <select 
                      value={zoningMapping} 
                      onChange={e => setZoningMapping(e.target.value)}
                      className="nodrag" 
                      style={{...inputStyle, cursor: 'pointer', borderColor: '#6ee7b7'}}
                    >
                      {ZONING_MAPPING_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                  </label>

                  <label style={{...labelStyle, color: '#047857'}}>
                    Zone Aggregation (A₂)
                    <select 
                      value={zoningAggregation} 
                      onChange={e => setZoningAggregation(e.target.value)}
                      className="nodrag" 
                      style={{...inputStyle, cursor: 'pointer', borderColor: '#6ee7b7'}}
                    >
                      {ZONING_AGGREGATION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                  </label>
                </>
              )}

              {/* Multivariate mode: hint about per-variable settings */}
              {isMultivariate && (
                <div style={{ fontSize: '9px', color: '#047857', marginBottom: '8px', fontStyle: 'italic' }}>
                  ✓ Per-variable math configured in cards above
                </div>
              )}

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

              {/* Advanced Settings - Single-variable mode only */}
              {!isMultivariate && (
                <>
                  <div 
                    onClick={(e) => { e.stopPropagation(); setShowAdvanced(!showAdvanced); }}
                    className="nodrag"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginTop: '8px',
                      paddingTop: '8px',
                      borderTop: '1px dashed #6ee7b7',
                      cursor: 'pointer',
                      color: '#6b7280',
                      fontSize: '9px'
                    }}
                  >
                    <Settings size={10} />
                    <span>Advanced (Grid Step)</span>
                    {showAdvanced ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </div>

                  {showAdvanced && (
                    <div style={{ marginTop: '6px', padding: '6px', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '6px' }}>
                        ⚡ Auto-set from geometry & zone aggregator
                      </div>
                      <label style={{...labelStyle, fontSize: '9px', color: '#64748b'}}>
                        Allocation (R)
                        <select 
                          value={allocation} 
                          onChange={e => setAllocation(e.target.value)}
                          className="nodrag" 
                          style={{...inputStyle, cursor: 'pointer', fontSize: '10px', height: '22px'}}
                        >
                          {ALLOCATION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                        </select>
                      </label>
                      <label style={{...labelStyle, fontSize: '9px', color: '#64748b'}}>
                        Grid Aggregation (A₁)
                        <select 
                          value={aggregation} 
                          onChange={e => setAggregation(e.target.value)}
                          className="nodrag" 
                          style={{...inputStyle, cursor: 'pointer', fontSize: '10px', height: '22px'}}
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

        {/* Execute Button - works for both modes */}
        <button 
          onClick={handleRun}
          disabled={
            isLoading || 
            (isMultivariate 
              ? Object.values(variableConfigs).some(v => !v.targetColumn) 
              : (!data.connectedDatasetFilename || !targetColumn)
            ) || 
            (zoningEnabled && !data.connectedZoneFilename)
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
              isLoading || 
              (isMultivariate 
                ? Object.values(variableConfigs).some(v => !v.targetColumn) 
                : (!data.connectedDatasetFilename || !targetColumn)
              ) || 
              (zoningEnabled && !data.connectedZoneFilename)
            ) ? '#cbd5e1' : (isMultivariate ? '#6366f1' : '#2563eb'),
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: '600',
            cursor: (
              isLoading || 
              (isMultivariate 
                ? Object.values(variableConfigs).some(v => !v.targetColumn) 
                : (!data.connectedDatasetFilename || !targetColumn)
              ) || 
              (zoningEnabled && !data.connectedZoneFilename)
            ) ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          <Play size={12} fill="currentColor" />
          {isLoading ? "Processing..." : (isMultivariate ? "Execute Multivariate Pipeline" : "Execute Pipeline")}
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