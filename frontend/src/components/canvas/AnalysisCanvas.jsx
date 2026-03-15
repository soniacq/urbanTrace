import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  ReactFlow, Background, Controls, useReactFlow, ReactFlowProvider, 
  addEdge, applyNodeChanges, applyEdgeChanges 
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// 1. Import components
import DatasetNode from './nodes/DatasetNode'; 
import OperationNode from './nodes/OperationNode';
import IntegrationNode from './nodes/IntegrationNode'; // <--- NEW Import
import DatasetDetailsModal from '../catalog/DatasetDetailsModal'; 
import ResultMapNode from './nodes/ResultMapNode'; // Add this at the top
import FloatingCopilotInput from '../copilot/FloatingCopilotInput';

const CanvasInner = () => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [viewingDataset, setViewingDataset] = useState(null);
  const [availableDatasets, setAvailableDatasets] = useState([]);

  const { screenToFlowPosition, getNode } = useReactFlow();

  const normalizeDatasetId = useCallback((value) => {
    if (typeof value !== 'string') return '';
    let normalized = value.trim();
    if (normalized.endsWith('.geojson')) {
      normalized = normalized.slice(0, -8);
    }
    if (normalized.endsWith('_metadata')) {
      normalized = normalized.slice(0, -9);
    }
    return normalized;
  }, []);

  const isNumericColumn = useCallback((column) => {
    if (!column || typeof column !== 'object') return false;
    return (
      ['Integer', 'Float', 'http://schema.org/Integer', 'http://schema.org/Float'].includes(column.structural_type)
      || column.mean !== undefined
    );
  }, []);

  const fetchAvailableDatasets = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/datasets');
      if (!response.ok) {
        throw new Error(`Failed to fetch datasets: HTTP ${response.status}`);
      }
      const payload = await response.json();
      const datasets = Array.isArray(payload?.datasets) ? payload.datasets : [];
      setAvailableDatasets(datasets);
      return datasets;
    } catch (error) {
      console.error('Failed to load datasets for copilot validation:', error);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchAvailableDatasets();
  }, [fetchAvailableDatasets]);

  const findDatasetById = useCallback((datasetId, datasets = availableDatasets) => {
    const normalizedTarget = normalizeDatasetId(datasetId);
    if (!normalizedTarget) return null;

    return (
      datasets.find((dataset) => {
        const candidates = [
          dataset?.id,
          dataset?.filename,
          dataset?.metadata?.name,
          dataset?.name,
        ]
          .map(normalizeDatasetId)
          .filter(Boolean);
        return candidates.includes(normalizedTarget);
      }) || null
    );
  }, [availableDatasets, normalizeDatasetId]);

  const resolveValidColorByForDataset = useCallback((dataset, requestedColorBy) => {
    if (typeof requestedColorBy !== 'string') return '';
    const normalizedRequested = requestedColorBy.trim();
    if (!normalizedRequested) return '';

    const columns = Array.isArray(dataset?.metadata?.columns) ? dataset.metadata.columns : [];
    const numericColumns = columns.filter(isNumericColumn);
    const match = numericColumns.find((column) => {
      const columnName = typeof column?.name === 'string' ? column.name : '';
      return columnName.toLowerCase() === normalizedRequested.toLowerCase();
    });
    return match?.name || '';
  }, [isNumericColumn]);

  // 2. Register the custom node types
  const nodeTypes = useMemo(() => ({
    datasetNode: DatasetNode,
    operationNode: OperationNode,
    integrationNode: IntegrationNode, // <--- NEW Registration
    resultMapNode: ResultMapNode //
  }), []);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  // 3. The Handler for when the Integration API finishes
  const handleIntegrationComplete = useCallback((sourceNodeId, integrationData) => {
    // 1. Generate unique IDs OUTSIDE the state setters. 
    // Using randomUUID prevents identical millisecond collisions.
    const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID().slice(0, 8) 
      : Date.now(); 
      
    const resultNodeId = `result_${uniqueId}`;
    const newEdgeId = `e-${sourceNodeId}-${resultNodeId}`;

    // 2. Safely update nodes
    setNodes((nds) => {
      const sourceNode = nds.find(n => n.id === sourceNodeId);
      if (!sourceNode) return nds;

      const resultNode = {
        id: resultNodeId,
        type: 'resultMapNode', 
        position: { x: sourceNode.position.x + 350, y: sourceNode.position.y },
        data: {
          name: 'H3 Integration Result',
          isResult: true, 
          spatialData: integrationData, 
        }
      };

      return [...nds, resultNode];
    });

    // 3. Safely update edges as a completely separate operation
    setEdges((eds) => {
      // Bulletproof check: If this edge ID already exists, don't add it again
      if (eds.some(e => e.id === newEdgeId)) return eds;

      return [
        ...eds,
        { 
          id: newEdgeId, 
          source: sourceNodeId, 
          target: resultNodeId, 
          animated: true, 
          style: { stroke: '#3b82f6', strokeWidth: 2 } 
        }
      ];
    });
  }, [setEdges, setNodes]); // Ensure setNodes is in the dependency array


  // 4. Update onConnect to pass data between nodes
  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge(params, eds));

    // When a connection is made, pass the dataset filename into the Integration Node
    setNodes((nds) => {
      const sourceNode = nds.find(n => n.id === params.source);
      const targetNode = nds.find(n => n.id === params.target);

      // Handle connections to IntegrationNode
      if (targetNode?.type === 'integrationNode' && sourceNode?.data?.filename) {
        return nds.map(node => {
          if (node.id === params.target) {
            // Determine which handle was connected to
            const handleId = params.targetHandle;
            
            if (handleId === 'zones') {
              // Zone dataset connection
              return {
                ...node,
                data: {
                  ...node.data,
                  connectedZoneFilename: sourceNode.data.filename
                }
              };
            } else {
              // Source dataset connection (default "source" handle)
              return {
                ...node,
                data: {
                  ...node.data,
                  connectedDatasetFilename: sourceNode.data.filename
                }
              };
            }
          }
          return node;
        });
      }
      return nds;
    });
  }, [setNodes, setEdges]);

  const handleShowInfo = useCallback((nodeData) => {
    setViewingDataset(nodeData); 
  }, []);

  const handleDatasetColorByChange = useCallback((nodeId, colorBy) => {
    if (!nodeId) return;
    setNodes((nds) =>
      nds.map((node) => {
        if (!node || node.id !== nodeId || node.type !== 'datasetNode') {
          return node;
        }
        const nodeData = (node.data && typeof node.data === 'object') ? node.data : {};
        return {
          ...node,
          data: {
            ...nodeData,
            colorBy: typeof colorBy === 'string' ? colorBy : '',
          },
        };
      })
    );
  }, []);

  const addDatasetNodeById = useCallback(async (datasetId, colorBy) => {
    const normalizedId = normalizeDatasetId(datasetId);
    if (!normalizedId) {
      console.warn(`[Copilot] add_dataset_node ignored: invalid dataset_id='${datasetId}'`);
      return;
    }

    let dataset = findDatasetById(normalizedId);
    if (!dataset) {
      const refreshedDatasets = await fetchAvailableDatasets();
      dataset = findDatasetById(normalizedId, refreshedDatasets);
    }

    if (!dataset) {
      console.warn(`[Copilot] add_dataset_node ignored: unknown dataset_id='${datasetId}'`);
      return;
    }

    const resolvedColorBy = resolveValidColorByForDataset(dataset, colorBy);
    if (typeof colorBy === 'string' && colorBy.trim() && !resolvedColorBy) {
      console.warn(
        `[Copilot] add_dataset_node ignored invalid colorBy='${colorBy}' for dataset_id='${datasetId}'`
      );
    }

    setNodes((nds) => {
      const existingIndex = nds.findIndex((node) => {
        if (!node || node.type !== 'datasetNode') return false;
        const nodeData = (node.data && typeof node.data === 'object') ? node.data : {};
        const existingId = normalizeDatasetId(
          nodeData.id || nodeData.filename || nodeData.metadata?.name || nodeData.name
        );
        return existingId === normalizedId;
      });
      if (existingIndex >= 0) {
        if (!resolvedColorBy) return nds;
        return nds.map((node, idx) => {
          if (idx !== existingIndex) return node;
          const nodeData = (node.data && typeof node.data === 'object') ? node.data : {};
          return {
            ...node,
            data: {
              ...nodeData,
              colorBy: resolvedColorBy,
              onColorByChange: handleDatasetColorByChange,
            },
          };
        });
      }

      const datasetNodeCount = nds.filter((node) => node?.type === 'datasetNode').length;
      const newNode = {
        id: `node_dataset_${normalizedId}_${Date.now()}`,
        type: 'datasetNode',
        position: {
          x: 120 + (datasetNodeCount % 3) * 280,
          y: 100 + Math.floor(datasetNodeCount / 3) * 240,
        },
        data: {
          ...dataset,
          onShowInfo: handleShowInfo,
          onColorByChange: handleDatasetColorByChange,
          ...(resolvedColorBy ? { colorBy: resolvedColorBy } : {}),
        },
      };

      return nds.concat(newNode);
    });
  }, [
    fetchAvailableDatasets,
    findDatasetById,
    handleDatasetColorByChange,
    handleShowInfo,
    normalizeDatasetId,
    resolveValidColorByForDataset,
  ]);

  const handleCopilotActions = useCallback(async (actions) => {
    if (!Array.isArray(actions) || actions.length === 0) {
      return;
    }

    for (const action of actions) {
      if (!action || typeof action !== 'object') continue;
      if (action.type === 'add_dataset_node') {
        await addDatasetNodeById(action.datasetId, action.colorBy);
      }
    }
  }, [addDatasetNodeById]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const dataString = event.dataTransfer.getData('application/reactflow');
      if (!dataString) return;
      
      const dataItem = JSON.parse(dataString); 
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      // Determine type dynamically based on what was dragged from the sidebar
      const newNodeType = dataItem.type || 'datasetNode';
      let newNodeData = { ...dataItem };

      // 5. Inject specific handlers based on the node type
      if (newNodeType === 'operationNode') {
          newNodeData.color = dataItem.opType === 'buffer' ? '#ec4899' : '#8b5cf6';
      } else if (newNodeType === 'integrationNode') {
          // Inject the callback so the node can talk back to the canvas when the API finishes
          newNodeData.onIntegrationComplete = handleIntegrationComplete;
      } else {
          newNodeData.onShowInfo = handleShowInfo;
          newNodeData.onColorByChange = handleDatasetColorByChange;
      }

      const newNode = {
        id: `node_${Date.now()}`,
        type: newNodeType, 
        position,
        data: newNodeData,
      };

      console.log('Adding new node:', newNode);

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, handleShowInfo, handleIntegrationComplete, handleDatasetColorByChange]
  );

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#f8fafc', position: 'relative' }}>
      <div style={{ width: '100%', height: '100%' }} onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background variant="dots" gap={20} size={1} color="#cbd5e1" />
          <Controls />
        </ReactFlow>
      </div>

      <FloatingCopilotInput nodes={nodes} edges={edges} onCopilotActions={handleCopilotActions} />

      {viewingDataset && (
        <DatasetDetailsModal
          open={!!viewingDataset}
          dataset={viewingDataset}
          onClose={() => setViewingDataset(null)} 
        />
      )}
    </div>
  );
};

const AnalysisCanvas = () => (
  <ReactFlowProvider>
    <CanvasInner />
  </ReactFlowProvider>
);

export default AnalysisCanvas;
