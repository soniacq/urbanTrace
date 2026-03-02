import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Settings, Play } from 'lucide-react';

const OperationNode = memo(({ data }) => {
  const label = data.label || 'Operation';
  // We can pass color/icon via data, or default to purple
  const color = data.color || '#ec4899'; 

  return (
    <div style={{
      padding: '0',
      borderRadius: '8px',
      backgroundColor: '#fff',
      border: `1px solid ${color}`,
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      minWidth: '150px',
      fontFamily: 'Inter, sans-serif'
    }}>
      
      {/* 1. Header (Colored) */}
      <div style={{
        backgroundColor: color, // Header matches tool color
        color: '#fff',
        padding: '6px 10px',
        borderTopLeftRadius: '7px',
        borderTopRightRadius: '7px',
        fontSize: '11px',
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        textTransform: 'uppercase'
      }}>
        <Settings size={12} />
        {label}
      </div>

      {/* 2. Body (Controls placeholder) */}
      <div style={{ padding: '10px', fontSize: '12px', color: '#475569' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Status:</span>
            <span style={{ 
                fontSize: '10px', 
                backgroundColor: '#f1f5f9', 
                padding: '2px 6px', 
                borderRadius: '4px',
                border: '1px solid #e2e8f0'
            }}>
                Ready
            </span>
        </div>
      </div>

      {/* 3. Handles */}
      
      {/* Input: "Target" (Left) - Accepts data */}
      <Handle 
        type="target" 
        position={Position.Left} 
        style={{ 
            background: '#fff', 
            border: `2px solid ${color}`, 
            width: '10px', height: '10px', left: '-6px' 
        }} 
      />

      {/* Output: "Source" (Right) - Passes result */}
      <Handle 
        type="source" 
        position={Position.Right} 
        style={{ 
            background: color, 
            width: '10px', height: '10px', right: '-6px', 
            border: '2px solid #fff' 
        }} 
      />
    </div>
  );
});

export default OperationNode;