import React, { useState, useCallback, useMemo } from 'react';
import { 
  ReactFlow, Background, Controls, useReactFlow, ReactFlowProvider, 
  addEdge, applyNodeChanges, applyEdgeChanges 
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Link, Unlink } from 'lucide-react';

// 1. Import components
import DatasetNode from './nodes/DatasetNode'; 
import OperationNode from './nodes/OperationNode';
import IntegrationNode from './nodes/IntegrationNode'; // <--- NEW Import
import DatasetDetailsModal from '../catalog/DatasetDetailsModal'; 
import ResultMapNode from './nodes/ResultMapNode'; // Add this at the top

const CanvasInner = () => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [viewingDataset, setViewingDataset] = useState(null);
  
  // GLOBAL VIEWPORT SYNC: Linked camera states for comparative analysis
  const [isMapSyncEnabled, setIsMapSyncEnabled] = useState(false);
  const [globalViewState, setGlobalViewState] = useState({
    longitude: -73.98,
    latitude: 40.75,
    zoom: 11,
    pitch: 0,
    bearing: 0
  });

  const { screenToFlowPosition, getNode, getNodes, getEdges } = useReactFlow();

  // 2. Register the custom node types
  const nodeTypes = useMemo(() => ({
    datasetNode: DatasetNode,
    operationNode: OperationNode,
    integrationNode: IntegrationNode, // <--- NEW Registration
    resultMapNode: ResultMapNode //
  }), []);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  
  // CONNECTION-DRIVEN STATE: Clear node data when edges are deleted
  const onEdgesChange = useCallback((changes) => {
    // Handle edge removals BEFORE applying changes (so we can still access the edge data)
    const removals = changes.filter(change => change.type === 'remove');
    
    if (removals.length > 0) {
      setEdges((currentEdges) => {
        // Find edge data BEFORE they're removed
        const edgesToRemove = removals
          .map(r => currentEdges.find(e => e.id === r.id))
          .filter(Boolean);
        
        if (edgesToRemove.length > 0) {
          // Clear connected data from target nodes
          setNodes((nds) => {
            return nds.map(node => {
              const removedEdgesForNode = edgesToRemove.filter(e => e.target === node.id);
              
              if (removedEdgesForNode.length === 0) return node;
              
              let updatedData = { ...node.data };
              
              removedEdgesForNode.forEach(edge => {
                if (edge.targetHandle === 'zones') {
                  // Zone connection removed - clear zone data
                  updatedData.connectedZoneFilename = null;
                  updatedData.connectedZoneMetadata = null;
                } else {
                  // Source dataset connection removed - remove from connectedDatasets
                  const sourceNodeId = edge.source;
                  if (updatedData.connectedDatasets) {
                    updatedData.connectedDatasets = updatedData.connectedDatasets.filter(
                      d => d.nodeId !== sourceNodeId
                    );
                    // Update legacy single-dataset field if array is empty
                    if (updatedData.connectedDatasets.length === 0) {
                      updatedData.connectedDatasetFilename = null;
                      updatedData.connectedDatasetMetadata = null;
                    }
                  }
                }
              });
              
              return { ...node, data: updatedData };
            });
          });
        }
        
        // Now apply the edge changes (remove the edges)
        return applyEdgeChanges(changes, currentEdges);
      });
    } else {
      // No removals - just apply changes normally
      setEdges((eds) => applyEdgeChanges(changes, eds));
    }
  }, [setEdges, setNodes]);

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
          // GLOBAL VIEWPORT SYNC: Pass sync props to ResultMapNode
          isMapSyncEnabled,
          globalViewState,
          onGlobalViewStateChange: setGlobalViewState
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
  }, [setEdges, setNodes, isMapSyncEnabled, globalViewState, setGlobalViewState]); // Ensure setNodes is in the dependency array

  // GLOBAL VIEWPORT SYNC: Update existing ResultMapNodes and DatasetNodes when sync state changes
  useMemo(() => {
    setNodes(nds => nds.map(node => {
      if (node.type === 'resultMapNode' || node.type === 'datasetNode') {
        return {
          ...node,
          data: {
            ...node.data,
            isMapSyncEnabled,
            globalViewState,
            onGlobalViewStateChange: setGlobalViewState
          }
        };
      }
      return node;
    }));
  }, [isMapSyncEnabled, globalViewState]);


  // 4. Update onConnect to pass data between nodes
  const onConnect = useCallback((params) => {
    // Get current nodes state OUTSIDE of setNodes callback for early validation
    const currentNodes = getNodes();
    const sourceNode = currentNodes.find(n => n.id === params.source);
    const targetNode = currentNodes.find(n => n.id === params.target);

    // Early return if not a valid connection to IntegrationNode
    if (targetNode?.type !== 'integrationNode' || !sourceNode?.data?.filename) {
      return;
    }

    const handleId = params.targetHandle;

    // SINGLE ZONE RESTRICTION: Check BEFORE calling setNodes
    if (handleId === 'zones' && targetNode.data.connectedZoneFilename) {
      alert('Only one zoning dataset can be connected at a time. Please disconnect the current zone dataset first.');
      return; // Exit early - don't call setNodes or setEdges
    }

    // Now handle the valid connection
    if (handleId === 'zones') {
      // Zone connection - add edge and update node data
      setEdges((eds) => addEdge(params, eds));
      setNodes((nds) => nds.map(node => {
        if (node.id === params.target) {
          return {
            ...node,
            data: {
              ...node.data,
              connectedZoneFilename: sourceNode.data.filename,
              connectedZoneMetadata: sourceNode.data.metadata
            }
          };
        }
        return node;
      }));
    } else {
      // Source dataset connection - MULTIVARIATE SUPPORT
      const existingDatasets = targetNode.data.connectedDatasets || [];
      
      // Check if this dataset is already connected
      const alreadyConnected = existingDatasets.some(d => d.nodeId === sourceNode.id);
      if (alreadyConnected) {
        return; // Don't add duplicate
      }

      // Add the edge
      setEdges((eds) => addEdge(params, eds));
      
      // CONTEXTUAL STATE INHERITANCE:
      // Pass upstream node's selected column to pre-populate Variable Card
      const inheritedColumn = sourceNode.data.selectedColumn || '';
      
      const newDataset = {
        id: `var_${Date.now()}`,
        nodeId: sourceNode.id,
        filename: sourceNode.data.filename,
        metadata: sourceNode.data.metadata,
        inheritedColumn: inheritedColumn
      };
      
      setNodes((nds) => nds.map(node => {
        if (node.id === params.target) {
          return {
            ...node,
            data: {
              ...node.data,
              // Keep legacy single-dataset fields for backward compatibility
              connectedDatasetFilename: sourceNode.data.filename,
              connectedDatasetMetadata: sourceNode.data.metadata,
              // NEW: Array of all connected datasets for multivariate
              connectedDatasets: [...existingDatasets, newDataset]
            }
          };
        }
        return node;
      }));
    }
  }, [setNodes, setEdges, getNodes]);

  const handleShowInfo = useCallback((nodeData) => {
    setViewingDataset(nodeData); 
  }, []);

  // CONTEXTUAL STATE INHERITANCE:
  // Factory to create column-select callback for each DatasetNode
  // Also propagates changes to any connected downstream IntegrationNodes
  const createColumnSelectHandler = useCallback((nodeId) => {
    return (selectedColumn) => {
      // Get current edges to find downstream connections
      const currentEdges = getEdges();
      const downstreamEdges = currentEdges.filter(e => e.source === nodeId);
      
      setNodes((nds) => {
        return nds.map((node) => {
          // Update the source DatasetNode
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                selectedColumn: selectedColumn
              }
            };
          }
          
          // Propagate to downstream IntegrationNodes
          const edgeToThis = downstreamEdges.find(e => e.target === node.id);
          if (edgeToThis && node.type === 'integrationNode' && node.data.connectedDatasets) {
            const updatedDatasets = node.data.connectedDatasets.map(d => {
              if (d.nodeId === nodeId) {
                return { ...d, inheritedColumn: selectedColumn };
              }
              return d;
            });
            return {
              ...node,
              data: {
                ...node.data,
                connectedDatasets: updatedDatasets
              }
            };
          }
          
          return node;
        });
      });
    };
  }, [setNodes, getEdges]);

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
      const nodeId = `node_${Date.now()}`;
      let newNodeData = { ...dataItem };

      // 5. Inject specific handlers based on the node type
      if (newNodeType === 'operationNode') {
          newNodeData.color = dataItem.opType === 'buffer' ? '#ec4899' : '#8b5cf6';
      } else if (newNodeType === 'integrationNode') {
          // Inject the callback so the node can talk back to the canvas when the API finishes
          newNodeData.onIntegrationComplete = handleIntegrationComplete;
      } else {
          // DatasetNode: inject column select callback for state inheritance
          // Also include sync props for viewport linking
          newNodeData.onShowInfo = handleShowInfo;
          newNodeData.onColumnSelect = createColumnSelectHandler(nodeId);
          newNodeData.isMapSyncEnabled = isMapSyncEnabled;
          newNodeData.globalViewState = globalViewState;
          newNodeData.onGlobalViewStateChange = setGlobalViewState;
      }

      const newNode = {
        id: nodeId,
        type: newNodeType, 
        position,
        data: newNodeData,
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, handleShowInfo, handleIntegrationComplete, createColumnSelectHandler]
  );

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#f8fafc', position: 'relative' }}>
      {/* GLOBAL VIEWPORT SYNC: Toggle button */}
      <button
        onClick={() => setIsMapSyncEnabled(!isMapSyncEnabled)}
        title={isMapSyncEnabled ? 'Maps Linked - Click to unlink' : 'Link all map viewports'}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 12px',
          backgroundColor: isMapSyncEnabled ? '#3b82f6' : '#fff',
          color: isMapSyncEnabled ? '#fff' : '#64748b',
          border: `1px solid ${isMapSyncEnabled ? '#3b82f6' : '#cbd5e1'}`,
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'all 0.2s'
        }}
      >
        {isMapSyncEnabled ? <Link size={14} /> : <Unlink size={14} />}
        {isMapSyncEnabled ? 'Maps Linked' : 'Link Maps'}
      </button>

      <div style={{ width: '100%', height: '100%' }} onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          edgesReconnectable={false}
          fitView
        >
          <Background variant="dots" gap={20} size={1} color="#cbd5e1" />
          <Controls />
        </ReactFlow>
      </div>

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