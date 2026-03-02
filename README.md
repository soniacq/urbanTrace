# UrbanTrace 🏙️

> A node-based ETL tool for urban planning and geospatial analysis.

UrbanTrace lets you visually construct data pipelines on an infinite canvas — blending GeoJSON datasets with spatial operations like Merges.

![Status](https://img.shields.io/badge/status-in_progress-yellow)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI%20%2B%20Deck.GL-blue)

---

## ✨ Features

### 🗂️ Data Library (Left Sidebar)
- Fetches and lists GeoJSON files from the backend
- Real-time search and filtering by dataset name
- Drag & drop onto the canvas to instantiate nodes

### 🖼️ Analysis Canvas (Center)
- Infinite workspace powered by **React Flow** (pan, zoom, multi-select)
- **Dataset Nodes** — source files with a Details modal for metadata inspection
- **Operation Nodes** — spatial tools (Buffer, Intersection, Join)
- **Deck.GL Mini-Maps** — choropleth previews with data-driven styling and tooltips, rendered inside each node

### 🔧 Operations Toolbox (Right Sidebar)
- Tools grouped by domain (Geospatial vs. Attribute)
- Draggable onto the canvas
- Config-driven — easy to extend with new modules

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, React Flow, Lucide React, Axios |
| Visualization | Deck.GL (WebGL vector rendering) |
| Backend | Python, FastAPI |
| Data Format | GeoJSON |

---

## 📁 Project Structure
```text
urbanTrace/
├── backend/
│   └── main.py
├── data/
│   ├── geojson/          # GeoJSON datasets (not tracked in git)
│   └── metadata/         # Dataset metadata JSONs
└── frontend/
    ├── src/
    │   ├── components/   # Canvas, nodes, sidebars, visualization
    │   ├── config/       # Tool definitions
    │   └── App.jsx
    └── vite.config.js
```

---

## 🛠️ Setup

### Prerequisites
- Node.js v16+
- Python 3.9+

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:5173**

---

## 🗺️ Roadmap

### Phase 1 — Visualization ✅
- [x] Drag & drop datasets
- [x] Node-based canvas
- [x] Deck.GL geometry previews inside nodes
- [x] Attribute-based choropleth styling

### Phase 2 — Transformation Engine 🚧
- [ ] Rasterize vector data into grids/numpy arrays
- [ ] Enable Operation Node execution via backend
- [ ] Raster result preview inside nodes
- [ ] Map algebra (Layer A + Layer B)

### Phase 3 — Advanced Features
- [ ] H3 Hexagon grid support
- [ ] Export results as GeoJSON or GeoTIFF
- [ ] Save/load node graph projects

---

## 📦 Data

NYC datasets included cover: population, poverty rate, unemployment, air pollution, housing units, pedestrian & bicycle counts, vehicle collisions, HVI, and more.

> Large GeoJSON files are not tracked in this repository. Download them separately and place in `data/geojson/`.

---

*Last updated: March 2026*