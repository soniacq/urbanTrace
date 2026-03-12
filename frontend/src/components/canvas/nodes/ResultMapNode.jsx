import React, { memo, useMemo, useEffect, useState } from 'react';
import { Handle, Position, NodeResizeControl } from '@xyflow/react';
import { Map as MapIcon, Download, Hexagon, MapPin, Info, ChevronDown, ChevronUp, Crosshair } from 'lucide-react';
import H3PreviewDeckGL from '../../visualization/H3PreviewDeckGL'; 

const ResultMapNode = memo(({ id, data }) => {
  // DATA LINEAGE: Track lineage panel visibility
  const [lineageExpanded, setLineageExpanded] = useState(false);
  const provenance = data?.spatialData?.provenance;
  
  // CROSS-CANVAS CONNECTION: Highlight when topology row is hovered or focused
  const highlightedLogTs = data?.highlightedLogTs;
  const focusedLogTs = data?.focusedLogTs;
  const isHighlighted = (highlightedLogTs && provenance?.timestamp === highlightedLogTs) ||
                        (focusedLogTs && provenance?.timestamp === focusedLogTs);
  const isFocused = focusedLogTs && provenance?.timestamp === focusedLogTs;
  
  // GLOBAL VIEWPORT SYNC: Extract sync props from data
  const isMapSyncEnabled = data?.isMapSyncEnabled || false;
  const globalViewState = data?.globalViewState;
  const onGlobalViewStateChange = data?.onGlobalViewStateChange;
  
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
      minWidth: '240px',
      minHeight: '240px',
      borderRadius: '8px',
      backgroundColor: '#fff', 
      border: isHighlighted ? `2px solid #0d9488` : `1px solid ${colorHex}`,
      boxShadow: isHighlighted 
        ? '0 0 20px rgba(13, 148, 136, 0.5), 0 0 40px rgba(13, 148, 136, 0.25)'
        : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      transition: 'box-shadow 0.2s ease, border 0.2s ease',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <NodeResizeControl 
        minWidth={240} 
        minHeight={220}
        style={{ background: 'transparent', border: 'none' }}
      >
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
          {isZoned && (
            <div style={{ fontSize: '9px', backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
              {outputMode}
            </div>
          )}
          {/* CROSS-CANVAS CONNECTION: Trace Lineage toggle */}
          {provenance && data?.onTraceLineage && (
            <button
              onClick={() => data.onTraceLineage(isFocused ? null : provenance.timestamp)}
              className="nodrag"
              style={{
                background: isFocused ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                border: 'none', borderRadius: '4px', padding: '2px 4px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', transition: 'background 0.15s ease',
              }}
              title={isFocused ? 'Release lineage trace' : 'Trace lineage in topology panel'}
            >
              <Crosshair size={12} style={{ color: isFocused ? colorHex : 'inherit' }} />
            </button>
          )}
          {/* DATA LINEAGE: Info toggle button */}
          {provenance && (
            <button
              onClick={() => setLineageExpanded(!lineageExpanded)}
              className="nodrag"
              style={{
                background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '4px',
                padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px'
              }}
              title="View data lineage"
            >
              <Info size={12} />
              {lineageExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          )}
        </div>
      </div>

      {/* Preview Area — IDENTICAL to original. Never changes size. */}
      <div style={{ 
        flexGrow: 1, 
        height: '100%',
        minHeight: '160px', 
        backgroundColor: '#f8fafc',
        position: 'relative',
        borderRadius: '0 0 8px 8px'
      }}>
        {(resultMapData || zoneGeoJson) && (
          <div style={{ position: 'absolute', inset: 0, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            <H3PreviewDeckGL 
              hexData={showHex ? resultMapData : null} 
              geojsonData={showZones ? zoneGeoJson : null}
              color={rgbColor}
              showHex={showHex}
              showZones={showZones}
              isMapSyncEnabled={isMapSyncEnabled}
              globalViewState={globalViewState}
              onGlobalViewStateChange={onGlobalViewStateChange}
            />
          </div>
        )}

        {/* DATA LINEAGE: Panel as absolute overlay ON TOP of the map.
            Positioned inside the map container so it never affects the
            map container's dimensions — DeckGL never sees a resize. */}
        {provenance && lineageExpanded && (
          <div
            className="nodrag"
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0,
              zIndex: 10,
              backgroundColor: 'rgba(248, 250, 252, 0.97)',
              backdropFilter: 'blur(4px)',
              borderBottom: '1px solid #e2e8f0',
              padding: '10px',
              fontSize: '10px',
              color: '#334155',
              maxHeight: '70%',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
          >
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
                  backgroundColor: '#fff', padding: '6px', borderRadius: '6px',
                  border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '4px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '10px' }}>{v.targetColumn}</span>
                    <span style={{ fontSize: '8px', color: '#64748b', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.dataset}>
                      {v.dataset?.replace(/^.*[\/]/, '')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                    <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '2px 4px', borderRadius: '3px', fontSize: '8px', border: '1px solid #e2e8f0' }} title={`Allocation: ${v.allocation}`}>
                      {v.allocation?.replace('Proportional', 'Prop.').replace('Weighted', 'Wt.')}
                    </span>
                    <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '2px 4px', borderRadius: '3px', fontSize: '8px', border: '1px solid #e2e8f0' }} title={`Grid Aggregation: ${v.aggregation}`}>
                      {v.aggregation?.replace('Aggregation', 'Agg')}
                    </span>
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