import React, { useState, useCallback, useMemo } from 'react';
import { ReactFlow, Background, Controls, useReactFlow, ReactFlowProvider, addEdge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// 1. Import existing components
import DatasetNode from './nodes/DatasetNode'; 
import OperationNode from './nodes/OperationNode';
import DatasetDetailsModal from '../catalog/DatasetDetailsModal'; // <---  Existing modal

const CanvasInner = () => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  
  // 2. State to manage the Modal
  // If this is null, modal is closed. If it has data, modal is open.
  const [viewingDataset, setViewingDataset] = useState(null);

  const { screenToFlowPosition } = useReactFlow();

  const nodeTypes = useMemo(() => ({
    datasetNode: DatasetNode,
    operationNode: OperationNode // <--- Add this line
  }), []);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), []);

  // 3. The Handler passed down to the Node
  const handleShowInfo = useCallback((nodeData) => {
    // We set the state, which triggers the modal to open
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
      
    //   const dataset = JSON.parse(dataString);
      const dataItem = JSON.parse(dataString); // Could be Dataset OR Operation
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      let newNodeType = 'datasetNode';
      let newNodeData = { ...dataItem };

      if (dataItem.type === 'operationNode') {
          newNodeType = 'operationNode';
          // We can add default settings here if needed
          newNodeData = { 
              ...dataItem, 
              // Assign color based on category logic if you want, or let sidebar pass it
              color: dataItem.opType === 'buffer' ? '#ec4899' : '#8b5cf6' 
          };
      } else {
          // It's a dataset
          newNodeData.onShowInfo = handleShowInfo;
      }

      const newNode = {
        id: `node_${Date.now()}`,
        type: newNodeType, // <--- Dynamic type
        position,
        data: newNodeData,
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, handleShowInfo]
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

      {/* 5. Render your EXISTING Modal */}
      {viewingDataset && (
        <DatasetDetailsModal
          open={!!viewingDataset} // Assumes your modal takes an 'open' prop
          dataset={viewingDataset} // Pass the data
          onClose={() => setViewingDataset(null)} // Close handler
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