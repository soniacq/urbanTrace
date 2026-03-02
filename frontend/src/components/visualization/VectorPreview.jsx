// frontend/src/components/VectorPreview.jsx
import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { geoMercator, geoPath } from 'd3-geo';

const VectorPreview = ({ filename }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 }); 

  useEffect(() => {
    // Fetch simplified version for the node
    axios.get(`http://localhost:8000/dataset/${filename}?simplify=true`)
      .then(res => {
        setData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [filename]);

  // Handle Wheel Zoom (Inside the node)
  const handleWheel = (e) => {
    // These are critical to stop the browser from scrolling the page
    // and to stop React Flow from catching the event (double safety)
    e.stopPropagation();
    e.preventDefault();

    const scaleAmount = -e.deltaY * 0.005;
    const newScale = Math.max(0.5, Math.min(10, transform.k * (1 + scaleAmount)));
    
    setTransform(prev => ({
      ...prev,
      k: newScale
    }));
  };

  // Handle Pan (MouseDown/Move)
  const handleMouseDown = (e) => {
    e.stopPropagation(); 
    const startX = e.clientX;
    const startY = e.clientY;
    const startTransform = { ...transform };

    const onMouseMove = (moveEvent) => {
      setTransform({
        ...startTransform,
        x: startTransform.x + (moveEvent.clientX - startX),
        y: startTransform.y + (moveEvent.clientY - startY)
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  if (loading) return <div style={{ padding: '20px', fontSize: '0.7rem', color: '#999' }}>Loading Geometry...</div>;
  if (!data) return null;

  const width = 200;
  const height = 120;
  
  const projection = geoMercator().fitSize([width, height], data);
  const pathGenerator = geoPath().projection(projection);

  return (
    <div 
      // 🟢 CHANGE HERE: Added "nowheel"
      className="nodrag nowheel" 
      style={{ 
        width: '100%', 
        height: '120px', 
        backgroundColor: '#f8fafc', 
        overflow: 'hidden',
        cursor: 'crosshair', // Changed cursor to indicate interaction
        position: 'relative'
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          <path 
            d={pathGenerator(data)} 
            fill="#3b82f6" 
            fillOpacity="0.2" 
            stroke="#2563eb" 
            strokeWidth="1"
            vectorEffect="non-scaling-stroke" // Keeps stroke width constant while zooming
          />
        </g>
      </svg>
      
      <div style={{ position: 'absolute', bottom: 2, right: 4, fontSize: '9px', color: '#94a3b8', pointerEvents: 'none', background: 'rgba(255,255,255,0.7)', padding: '0 2px', borderRadius: '2px' }}>
        Scroll to Zoom
      </div>
    </div>
  );
};

export default VectorPreview;