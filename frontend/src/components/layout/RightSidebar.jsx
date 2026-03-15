// frontend/src/components/RightSidebar.jsx
import React from 'react';
import OperationsSidebar from '../toolbox/OperationsSidebar'; // Re-using the component we made

const RightSidebar = () => {
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

      {/* BOTTOM HALF: History / Logs (Placeholder) */}
      <div style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column', backgroundColor: '#f9fafb' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: '#f1f5f9' }}>
            <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: '#475569', textTransform: 'uppercase' }}>
                Activity Log
            </h3>
        </div>
        <div style={{ padding: '20px', color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
           Waiting for actions...
           <br/>
           (Analysis History will appear here)
        </div>
      </div>

    </div>
  );
};

export default RightSidebar;
