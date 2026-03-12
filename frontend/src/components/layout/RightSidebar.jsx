// frontend/src/components/RightSidebar.jsx
import React from 'react';
import OperationsSidebar from '../toolbox/OperationsSidebar'; // Re-using the component we made
import IntegrationTopologyPanel from './IntegrationTopologyPanel';

const RightSidebar = ({ activityLogs = [], onHoverLog, focusedLogTs }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fff' }}>
      
      {/* TOP HALF: Operations / Tools */}
      <div style={{ flex: '1 1 50%', borderBottom: '1px solid #e5e7eb', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: '#475569', textTransform: 'uppercase' }}>
                Toolbox
            </h3>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
           {/* We use the component we built earlier, but just the list part */}
           <OperationsSidebar /> 
        </div>
      </div>

      {/* BOTTOM HALF: Activity Log */}
      <div style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column', backgroundColor: '#f9fafb', overflow: 'hidden' }}>
        <div style={{ 
          padding: '12px 16px', 
          borderBottom: '1px solid #e5e7eb', 
          background: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
            <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: '#475569', textTransform: 'uppercase' }}>
                Integration Topology
            </h3>
            {activityLogs.length > 0 && (
              <span style={{
                backgroundColor: '#e0e7ff',
                color: '#4338ca',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                {activityLogs.length}
              </span>
            )}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <IntegrationTopologyPanel logs={activityLogs} onHoverLog={onHoverLog} focusedLogTs={focusedLogTs} />
        </div>
      </div>

    </div>
  );
};

export default RightSidebar;