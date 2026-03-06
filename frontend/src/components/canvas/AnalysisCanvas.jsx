import React, { useState, useCallback, useMemo } from 'react';
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

const CanvasInner = () => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [viewingDataset, setViewingDataset] = useState(null);

  const { screenToFlowPosition, getNode } = useReactFlow();

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

      if (targetNode?.type === 'integrationNode' && sourceNode?.data?.filename) {
        return nds.map(node => {
          if (node.id === params.target) {
            return {
              ...node,
              data: {
                ...node.data,
                connectedDatasetFilename: sourceNode.data.filename
              }
            };
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
      }

      const newNode = {
        id: `node_${Date.now()}`,
        type: newNodeType, 
        position,
        data: newNodeData,
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, handleShowInfo, handleIntegrationComplete]
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