// frontend/src/config/operations.js
import { 
    Layers, 
    Scissors, // <--- CHANGED from 'scissors' to 'Scissors'
    Combine, 
    Map, 
    Filter, 
    Calculator 
  } from 'lucide-react';
  
  export const OPERATION_CATEGORIES = [
    {
      id: 'geo',
      title: 'Geospatial Tools',
      color: '#ec4899', // Pink
      items: [
        { type: 'buffer', label: 'Buffer', icon: Layers, desc: 'Create zones around features' },
        { type: 'intersect', label: 'Intersection', icon: Scissors, desc: 'Keep overlapping areas' }, // Update usage here too
        { type: 'union', label: 'Union / Merge', icon: Combine, desc: 'Combine two datasets' },
      ]
    },
    {
      id: 'attr',
      title: 'Attribute Tools',
      color: '#8b5cf6', // Violet
      items: [
        { type: 'filter', label: 'Filter', icon: Filter, desc: 'Select rows by condition' },
        { type: 'join', label: 'Table Join', icon: Map, desc: 'Merge by common column' },
        { type: 'calculate', label: 'Calculate Field', icon: Calculator, desc: 'Add new column formula' },
      ]
    }
  ];