// frontend/src/components/sidebar/OperationsSidebar.jsx
import React from 'react';
import { OPERATION_CATEGORIES } from '../../config/operations'; 
import { GripVertical } from 'lucide-react';

const OperationsSidebar = () => {
  
  const onDragStart = (event, opType, opLabel) => {
    // 1. Route the tool to the correct custom React Flow node component
    let reactFlowType = 'operationNode'; // Default for generic tools
    
    if (opType === 'integrate') {
      reactFlowType = 'integrationNode'; // Trigger our custom Integration Engine UI
    }

    // 2. Set the payload
    const nodeData = {
        type: reactFlowType, 
        label: opLabel,
        opType: opType 
    };
    
    event.dataTransfer.setData('application/reactflow', JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div style={{ padding: '10px', height: '100%', overflowY: 'auto' }}>
      <div style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', marginBottom: '10px', textTransform: 'uppercase' }}>
        Toolbox
      </div>

      {OPERATION_CATEGORIES.map(category => (
        <div key={category.id} style={{ marginBottom: '20px' }}>
          {/* Category Header */}
          <div style={{ 
              fontSize: '11px', 
              fontWeight: '700', 
              color: category.color, 
              marginBottom: '8px', 
              paddingLeft: '4px',
              borderLeft: `2px solid ${category.color}` 
          }}>
            {category.title}
          </div>

          {/* Draggable Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {category.items.map(item => {
              const Icon = item.icon;
              return (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(event) => onDragStart(event, item.type, item.label)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    cursor: 'grab',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = category.color;
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{ color: category.color }}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#334155' }}>{item.label}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{item.desc}</div>
                  </div>
                  <GripVertical size={14} color="#cbd5e1" style={{ marginLeft: 'auto' }} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default OperationsSidebar;