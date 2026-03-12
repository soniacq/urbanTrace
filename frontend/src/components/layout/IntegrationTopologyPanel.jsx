// frontend/src/components/layout/IntegrationTopologyPanel.jsx
import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/* ─────────────────────────────────────────────
   CONSTANTS & HELPERS
───────────────────────────────────────────── */
const STRIP_SUFFIX = (s = '') =>
  s.replace('.geojson', '').replace('Zoning', '').replace('Aggregation', '');

const SHORT_LABEL = (s = '') => {
  const clean = STRIP_SUFFIX(s);
  const words = clean.match(/[A-Z][a-z]+/g) || [clean];
  return words.map(w => w.slice(0, 3).toUpperCase()).join('·');
};

const formatDuration = (ms) => {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

// Smooth bezier path between two DOM rects relative to SVG container
const makePath = (fromRect, toRect, svgRect) => {
  if (!fromRect || !toRect || !svgRect) return '';
  const x1 = fromRect.right - svgRect.left;
  const y1 = fromRect.top + fromRect.height / 2 - svgRect.top;
  const x2 = toRect.left - svgRect.left;
  const y2 = toRect.top + toRect.height / 2 - svgRect.top;
  const cx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
};

/* ─────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────── */

// Glyph: encodes operator count + category via shape
// shape: 'triangle' for Spatial Mapping, 'circle' for Aggregation
const Glyph = ({ count, shape = 'circle', micro = false }) => {
  const isTriangle = shape === 'triangle';
  
  if (count === 0) {
    const size = 6;
    if (isTriangle) {
      // Empty triangle using CSS borders
      return (
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: `${size / 2}px solid transparent`,
            borderRight: `${size / 2}px solid transparent`,
            borderBottom: `${size}px solid #c4e8e0`,
          }}
        />
      );
    }
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#c4e8e0',
        }}
      />
    );
  }

  const size = micro ? 7 : Math.min(7 + count * 5, 22);
  
  if (isTriangle) {
    // Solid triangle using CSS borders
    return (
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: `${size / 2}px solid transparent`,
          borderRight: `${size / 2}px solid transparent`,
          borderBottom: `${size}px solid #0d9488`,
          filter: count > 1 ? `drop-shadow(0 0 ${count * 2}px rgba(13,148,136,0.35))` : 'none',
          transition: 'all 0.3s ease',
          flexShrink: 0,
        }}
      />
    );
  }
  
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#0d9488',
        boxShadow: count > 1 ? `0 0 ${count * 4}px rgba(13,148,136,0.35)` : 'none',
        transition: 'all 0.3s ease',
        flexShrink: 0,
      }}
    />
  );
};

/* ─────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────── */
const IntegrationTopologyPanel = ({ logs = [], onHoverLog, focusedLogTs }) => {
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [paths, setPaths] = useState([]);
  
  // Hover traceability state
  const [hoveredDataset, setHoveredDataset] = useState(null);
  const [hoveredLogTs, setHoveredLogTs] = useState(null);

  // CROSS-CANVAS CONNECTION: Notify parent when row is hovered
  useEffect(() => {
    onHoverLog?.(hoveredLogTs);
  }, [hoveredLogTs, onHoverLog]);

  // CROSS-CANVAS CONNECTION: Combined highlight (internal hover OR external focus from canvas)
  const activeLogTs = hoveredLogTs || focusedLogTs;

  // Refs for measuring
  const svgRef = useRef(null);
  const leftNodeRefs = useRef({});   // keyed by dataset name
  const rightRowRefs = useRef({});   // keyed by `${logTimestamp}` or `${logTimestamp}-${dsName}`

  const toggleRow = useCallback((ts) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(ts) ? next.delete(ts) : next.add(ts);
      return next;
    });
  }, []);

  /* Derive datasets + operators (grouped by category) + maxDuration from ALL logs */
  const { datasets, spatialOps, aggregationOps, maxDuration } = useMemo(() => {
    const dsCounts = {};
    const spatialSet = new Set();
    const aggSet = new Set();
    let maxMs = 0;

    logs.forEach(log => {
      if (log.durationMs > maxMs) maxMs = log.durationMs;
      (log.variables || []).forEach(v => {
        const name = (v.dataset || 'Unknown').replace('.geojson', '');
        dsCounts[name] = (dsCounts[name] || 0) + 1;
        // Categorize operators by type
        if (v.zoningMapping) spatialSet.add(v.zoningMapping);
        if (v.zoningAggregation) aggSet.add(v.zoningAggregation);
      });
    });

    const BASE_PX = 32;   // height for a dataset used once
    const PER_USE_PX = 20; // additional px per extra usage
    const dsArr = Object.entries(dsCounts).map(([name, count]) => ({
      name,
      count,
      heightPx: BASE_PX + (count - 1) * PER_USE_PX,
    }));

    return {
      datasets: dsArr,
      spatialOps: Array.from(spatialSet),
      aggregationOps: Array.from(aggSet),
      maxDuration: maxMs || 1,
    };
  }, [logs]);

  /* Compute highlight relationships for hover traceability */
  const { datasetsInHoveredLog, logsUsingHoveredDataset } = useMemo(() => {
    // When hovering a log row, find all datasets used in that log
    const datasetsInLog = new Set();
    if (hoveredLogTs) {
      const log = logs.find(l => l.timestamp === hoveredLogTs);
      if (log) {
        (log.variables || []).forEach(v => {
          const name = (v.dataset || '').replace('.geojson', '');
          if (name) datasetsInLog.add(name);
        });
      }
    }
    
    // When hovering a dataset, find all logs that use it
    const logsUsing = new Set();
    if (hoveredDataset) {
      logs.forEach(log => {
        (log.variables || []).forEach(v => {
          const name = (v.dataset || '').replace('.geojson', '');
          if (name === hoveredDataset) {
            logsUsing.add(log.timestamp);
          }
        });
      });
    }
    
    return {
      datasetsInHoveredLog: datasetsInLog,
      logsUsingHoveredDataset: logsUsing,
    };
  }, [logs, hoveredLogTs, hoveredDataset]);

  /* Recompute SVG paths after every render (layout may have shifted) */
  const recomputePaths = useCallback(() => {
    if (!svgRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const newPaths = [];

    logs.forEach(log => {
      const ts = log.timestamp;
      const isExpanded = expandedRows.has(ts);

      (log.variables || []).forEach(v => {
        const dsName = (v.dataset || '').replace('.geojson', '');
        const leftEl = leftNodeRefs.current[dsName];
        const rightKey = isExpanded ? `${ts}-${dsName}` : ts;
        const rightEl = rightRowRefs.current[rightKey];

        if (leftEl && rightEl) {
          newPaths.push({
            key: `${ts}|${dsName}|${isExpanded}`,
            ts,
            dsName,
            d: makePath(leftEl.getBoundingClientRect(), rightEl.getBoundingClientRect(), svgRect),
          });
        }
      });
    });

    setPaths(newPaths);
  }, [logs, expandedRows]);

  useLayoutEffect(() => {
    recomputePaths();
  }, [recomputePaths]);

  // Also recompute on window resize
  useEffect(() => {
    window.addEventListener('resize', recomputePaths);
    return () => window.removeEventListener('resize', recomputePaths);
  }, [recomputePaths]);

  /* ── EMPTY STATE ── */
  if (logs.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyDot} />
        <span style={styles.emptyText}>Awaiting analysis runs…</span>
      </div>
    );
  }

  /* ── MAIN RENDER ── */
  return (
    <div style={styles.root}>

      {/* ── COLUMN A: Source Nodes ── */}
      <div style={styles.leftCol}>
        <div style={styles.colLabel}>SOURCES</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {datasets.map(ds => {
            // Determine if this dataset should be highlighted
            const isHoverActive = hoveredDataset || hoveredLogTs;
            const isHighlighted = hoveredDataset === ds.name || datasetsInHoveredLog.has(ds.name);
            const dimmed = isHoverActive && !isHighlighted;
            
            return (
              <div
                key={ds.name}
                ref={el => { leftNodeRefs.current[ds.name] = el; }}
                style={{
                  ...styles.sourceNode,
                  height: ds.heightPx,
                  opacity: dimmed ? 0.25 : 1,
                  transform: isHighlighted ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: isHighlighted
                    ? '0 2px 8px rgba(13,148,136,0.25)'
                    : '0 1px 3px rgba(13,148,136,0.08)',
                }}
                onMouseEnter={() => setHoveredDataset(ds.name)}
                onMouseLeave={() => setHoveredDataset(null)}
              >
                <span style={styles.sourceLabel} title={ds.name}>
                  {ds.name.replace('NYC_', '')}
                </span>
                <span style={styles.sourceCount}>{ds.count}×</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── COLUMN B: SVG Flow Lines ── */}
      <div style={styles.svgCol}>
        <svg
          ref={svgRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {paths.map(p => {
            // Use stored ts and dsName for hover traceability
            const isHoverActive = hoveredDataset || activeLogTs;
            const isHighlighted = 
              (hoveredDataset && p.dsName === hoveredDataset) ||
              (activeLogTs && p.ts === activeLogTs);
            const dimmed = isHoverActive && !isHighlighted;
            
            return (
              <path
                key={p.key}
                d={p.d}
                fill="none"
                stroke="#0d9488"
                strokeWidth={isHighlighted ? 2 : 1.2}
                strokeOpacity={dimmed ? 0.08 : isHighlighted ? 0.7 : 0.35}
                filter={isHighlighted ? 'url(#glow)' : 'none'}
                style={{ transition: 'stroke-opacity 0.2s ease, stroke-width 0.2s ease' }}
              />
            );
          })}
        </svg>
      </div>

      {/* ── COLUMN C: Strategy Bubble Matrix ── */}
      <div style={styles.rightCol}>

        {/* Minimalist Legend - anchored at top */}
        <div style={styles.legendRow}>
          <span style={styles.legendItem}>
            <span style={styles.legendTriangle} />
            <span>Spatial</span>
          </span>
          <span style={styles.legendDivider}>|</span>
          <span style={styles.legendItem}>
            <span style={styles.legendCircle} />
            <span>Agg</span>
          </span>
        </div>

        {/* Header row */}
        <div style={styles.matrixHeader}>
          <div style={styles.headerRun}>PERF</div>
          <div style={styles.headerOps}>
            {/* Spatial operators (squares) */}
            {spatialOps.map(op => (
              <div key={op} style={styles.headerCell} title={op}>
                {SHORT_LABEL(op)}
              </div>
            ))}
            {/* Aggregation operators (circles) */}
            {aggregationOps.map(op => (
              <div key={op} style={styles.headerCell} title={op}>
                {SHORT_LABEL(op)}
              </div>
            ))}
          </div>
        </div>

        {/* Log rows */}
        <div style={styles.matrixBody}>
          {logs.map((log, idx) => {
            const ts = log.timestamp;
            const isExpanded = expandedRows.has(ts);
            
            // Hover traceability for this row (supports both internal hover and external focus from canvas)
            const isHoverActive = hoveredDataset || activeLogTs;
            const isHighlighted = activeLogTs === ts || logsUsingHoveredDataset.has(ts);
            const dimmed = isHoverActive && !isHighlighted;

            // Macro: count per operator across all vars in this log (by category)
            const spatialCounts = {};
            const aggCounts = {};
            spatialOps.forEach(op => (spatialCounts[op] = 0));
            aggregationOps.forEach(op => (aggCounts[op] = 0));
            (log.variables || []).forEach(v => {
              if (v.zoningMapping && spatialCounts.hasOwnProperty(v.zoningMapping)) {
                spatialCounts[v.zoningMapping]++;
              }
              if (v.zoningAggregation && aggCounts.hasOwnProperty(v.zoningAggregation)) {
                aggCounts[v.zoningAggregation]++;
              }
            });

            return (
              <div key={ts + idx} style={styles.logGroup}>

                {/* ── MACRO ROW ── */}
                <div
                  ref={el => {
                    if (!isExpanded) rightRowRefs.current[ts] = el;
                    else delete rightRowRefs.current[ts];
                  }}
                  style={{
                    ...styles.macroRow,
                    background: isExpanded ? '#d4f0e8' : '#ffffff',
                    borderColor: isExpanded ? '#0d948855' : '#b2ddd5',
                    opacity: dimmed ? 0.25 : 1,
                    transform: isHighlighted ? 'scale(1.01)' : 'scale(1)',
                    boxShadow: isHighlighted ? '0 2px 8px rgba(13,148,136,0.2)' : 'none',
                  }}
                  onClick={() => toggleRow(ts)}
                  onMouseEnter={() => setHoveredLogTs(ts)}
                  onMouseLeave={() => setHoveredLogTs(null)}
                >
                  {/* Spark-bar: visualizes relative execution time */}
                  <div style={styles.runLabel}>
                    <div style={styles.sparkBarContainer}>
                      {/* Fill bar - proportional to max duration */}
                      <div
                        style={{
                          ...styles.sparkBarFill,
                          width: `${Math.max(8, (log.durationMs / maxDuration) * 100)}%`,
                        }}
                      />
                      {/* Overlay: chevron + meta text */}
                      <div style={styles.sparkBarOverlay}>
                        <span style={styles.sparkChevron}>
                          {isExpanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                        </span>
                        <span style={styles.sparkMeta}>
                          {formatDuration(log.durationMs)} · {log.variables?.length || 0}v · r{log.resolution}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Glyphs: Spatial (triangles) then Aggregation (circles) */}
                  <div style={styles.bubbleRow}>
                    {spatialOps.map(op => (
                      <div key={op} style={styles.bubbleCell}>
                        <Glyph count={spatialCounts[op] || 0} shape="triangle" />
                      </div>
                    ))}
                    {aggregationOps.map(op => (
                      <div key={op} style={styles.bubbleCell}>
                        <Glyph count={aggCounts[op] || 0} shape="circle" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── MICRO ROWS (expanded) ── */}
                {isExpanded && (
                  <div style={styles.microGroup}>
                    {(log.variables || []).map((v, vIdx) => {
                      const dsName = (v.dataset || '').replace('.geojson', '');
                      const rowKey = `${ts}-${dsName}`;
                      return (
                        <div
                          key={vIdx}
                          ref={el => { rightRowRefs.current[rowKey] = el; }}
                          style={styles.microRow}
                        >
                          <div style={styles.microLabel} title={dsName}>
                            <span style={styles.microDot} />
                            {dsName.replace('NYC_', '')}
                          </div>
                          <div style={styles.bubbleRow}>
                            {/* Spatial operators (triangles) */}
                            {spatialOps.map(op => {
                              const used = v.zoningMapping === op;
                              return (
                                <div key={op} style={styles.bubbleCell}>
                                  <Glyph count={used ? 1 : 0} shape="triangle" micro />
                                </div>
                              );
                            })}
                            {/* Aggregation operators (circles) */}
                            {aggregationOps.map(op => {
                              const used = v.zoningAggregation === op;
                              return (
                                <div key={op} style={styles.bubbleCell}>
                                  <Glyph count={used ? 1 : 0} shape="circle" micro />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

/* ─────────────────────────────────────────────
   STYLES
───────────────────────────────────────────── */
const styles = {
  root: {
    display: 'flex',
    flexDirection: 'row',
    width: '100%',
    minHeight: '100%',
    background: '#f0faf7',
    fontFamily: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
    color: '#2d4a45',
    padding: '12px 8px',
    gap: 0,
    boxSizing: 'border-box',
    overflowX: 'auto',
    overflowY: 'auto',
  },

  /* ── Left Column ── */
  leftCol: {
    display: 'flex',
    flexDirection: 'column',
    width: 80,
    minWidth: 70,
    flexShrink: 0,
    gap: 6,
  },
  colLabel: {
    fontSize: 8,
    letterSpacing: '0.15em',
    color: '#7fb5a8',
    fontWeight: 700,
    marginBottom: 2,
    paddingLeft: 2,
  },
  sourceNode: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '4px 6px',
    background: '#d4f0e8',
    border: '1px solid #a8ddd0',
    borderLeft: '3px solid #0d9488',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
    boxSizing: 'border-box',
    flexShrink: 0,
    boxShadow: '0 1px 3px rgba(13,148,136,0.08)',
  },
  sourceLabel: {
    fontSize: 8,
    color: '#134e4a',
    fontWeight: 600,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sourceCount: {
    fontSize: 7,
    color: '#5eada0',
    marginTop: 1,
  },

  /* ── SVG Column ── */
  svgCol: {
    position: 'relative',
    width: 32,
    minWidth: 32,
    flexShrink: 0,
    alignSelf: 'stretch',
  },

  /* ── Right Column ── */
  rightCol: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 120,
    gap: 4,
  },
  matrixHeader: {
    display: 'flex',
    alignItems: 'center',
    paddingBottom: 4,
    borderBottom: '1px solid #b2ddd5',
    marginBottom: 4,
  },
  headerRun: {
    fontSize: 7,
    letterSpacing: '0.15em',
    color: '#7fb5a8',
    fontWeight: 700,
    width: 72,
    flexShrink: 0,
  },
  headerOps: {
    display: 'flex',
    flex: 1,
    justifyContent: 'space-around',
  },
  headerCell: {
    fontSize: 7,
    letterSpacing: '0.08em',
    color: '#0d9488',
    fontWeight: 700,
    width: 36,
    textAlign: 'center',
    cursor: 'default',
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginBottom: 6,
    fontSize: 7,
    color: '#7fb5a8',
    fontWeight: 500,
    letterSpacing: '0.04em',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
  legendTriangle: {
    width: 0,
    height: 0,
    borderLeft: '3px solid transparent',
    borderRight: '3px solid transparent',
    borderBottom: '6px solid #0d9488',
  },
  legendCircle: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#0d9488',
  },
  legendDivider: {
    color: '#b2ddd5',
    fontWeight: 300,
  },
  matrixBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    overflowY: 'auto',
    flex: 1,
  },
  logGroup: {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 4,
    overflow: 'visible',
  },
  macroRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 6px',
    cursor: 'pointer',
    border: '1px solid',
    borderRadius: 4,
    transition: 'background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
  },
  runLabel: {
    display: 'flex',
    flexDirection: 'column',
    width: 72,
    flexShrink: 0,
  },
  sparkBarContainer: {
    position: 'relative',
    width: '100%',
    height: 18,
    borderRadius: 3,
    overflow: 'hidden',
    background: '#e6f7f2',
  },
  sparkBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    background: 'linear-gradient(90deg, #0d9488 0%, #5eada0 100%)',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  sparkBarOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 3,
    gap: 3,
  },
  sparkChevron: {
    display: 'flex',
    alignItems: 'center',
    color: '#ffffff',
    filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.3))',
  },
  sparkMeta: {
    fontSize: 8,
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '0.02em',
    textShadow: '0 0 2px rgba(0,0,0,0.4)',
    whiteSpace: 'nowrap',
  },
  bubbleRow: {
    display: 'flex',
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bubbleCell: {
    width: 36,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  microGroup: {
    display: 'flex',
    flexDirection: 'column',
    background: '#e6f7f2',
    borderLeft: '2px solid #0d948855',
    borderRight: '1px solid #b2ddd5',
    borderBottom: '1px solid #b2ddd5',
    borderRadius: '0 0 4px 4px',
    padding: '3px 6px',
    gap: 2,
  },
  microRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '3px 0',
    borderBottom: '1px solid #b2ddd530',
  },
  microLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    width: 72,
    flexShrink: 0,
    fontSize: 8,
    color: '#5eada0',
    letterSpacing: '0.03em',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  microDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: '#0d9488',
    opacity: 0.6,
    flexShrink: 0,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 12,
    background: '#f0faf7',
  },
  emptyDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#a8ddd0',
    animation: 'pulse 2s infinite',
  },
  emptyText: {
    fontSize: 10,
    color: '#7fb5a8',
    letterSpacing: '0.12em',
    fontFamily: "'JetBrains Mono', monospace",
  },
};

export default IntegrationTopologyPanel;
