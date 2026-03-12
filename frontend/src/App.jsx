// frontend/src/App.jsx
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DatasetSidebar from './components/layout/DatasetSidebar';
import AnalysisCanvas from './components/canvas/AnalysisCanvas';
import RightSidebar from './components/layout/RightSidebar';

function App() {
  const [leftOpen, setLeftOpen] = useState(true);
  
  // GLOBAL ACTIVITY LOG: Track all pipeline executions for audit trail
  const [activityLogs, setActivityLogs] = useState([]);
  
  // CROSS-CANVAS CONNECTION: Bidirectional hover/highlight between topology matrix and ResultMapNodes
  const [highlightedLogTs, setHighlightedLogTs] = useState(null);  // Matrix→Canvas (hover)
  const [focusedLogTs, setFocusedLogTs] = useState(null);          // Canvas→Matrix (click "Trace Lineage")
  
  const appendToActivityLog = (logEntry) => {
    // Prepend so newest appears at top
    setActivityLogs(prevLogs => [logEntry, ...prevLogs]);
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      
      {/* --- LEFT SIDEBAR (Collapsible) --- */}
      <aside 
        style={{ 
          width: leftOpen ? '300px' : '0px', 
          backgroundColor: '#f9fafb', 
          borderRight: '1px solid #e5e7eb',
          transition: 'width 0.3s ease', 
          position: 'relative',
          flexShrink: 0,
          zIndex: 20,
          overflow: 'visible' // <--- CRITICAL: Ensures button is visible when width is 0
        }}
      >
        {/* Inner Content Container */}
        <div style={{ 
            width: '300px', // Fixed width prevents content squashing
            height: '100%', 
            overflow: 'hidden', // Hides content when sidebar slides shut
            opacity: leftOpen ? 1 : 0, // Smooth fade out
            pointerEvents: leftOpen ? 'auto' : 'none', // CRITICAL: Disable interactions when collapsed
            transition: 'opacity 0.2s'
        }}>
           <DatasetSidebar />
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setLeftOpen(!leftOpen)}
          title={leftOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          style={{
            position: 'absolute',
            top: '50%',                  // Center vertically
            transform: 'translateY(-50%)', 
            right: '-12px',              // Hang half-off the edge
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 50,
            color: '#64748b',
            padding: 0,                 // <--- FIX: Removes default padding to show icon
            outline: 'none'
          }}
        >
          {leftOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </aside>

      {/* --- MIDDLE: CANVAS --- */}
      <main style={{ flexGrow: 1, position: 'relative', backgroundColor: '#f1f5f9' }}>
        <AnalysisCanvas 
          sidebarCollapsed={!leftOpen} 
          onLogActivity={appendToActivityLog}
          highlightedLogTs={highlightedLogTs}
          focusedLogTs={focusedLogTs}
          onTraceLineage={setFocusedLogTs}
        />
      </main>

      {/* --- RIGHT SIDEBAR (Fixed) --- */}
      <aside style={{ 
          width: '380px', 
          backgroundColor: '#fff', 
          borderLeft: '1px solid #e5e7eb',
          flexShrink: 0,
          zIndex: 10 
      }}>
        <RightSidebar 
          activityLogs={activityLogs} 
          onHoverLog={setHighlightedLogTs}
          focusedLogTs={focusedLogTs}
        />
      </aside>
      
    </div>
  );
}

export default App;