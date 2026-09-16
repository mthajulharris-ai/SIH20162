# System Architecture & API Endpoints

## Software Stack
- **Backend Framework**: FastAPI (Python 3.14) running on Uvicorn ASGI server.
- **Database**: SQLite / PostgreSQL with SQLAlchemy ORM and Alembic migrations.
- **Machine Learning Core**: Scikit-Learn, LightGBM, XGBoost, NumPy, SciPy, FAISS.
- **Frontend Client**: Vite + React, Vanilla CSS design system, Leaflet maps, Lucide icons.
- **Vector Search Engine**: FAISS (`faiss-cpu`) local index with normalized vector cosine similarity.

## Primary REST API Endpoints

### 1. Telemetry & Detections
- `GET /api/v1/detections`: List recent satellite thermal detections with filtering by date, class, minimum FRP, and bounding box.
- `GET /api/v1/detections/{id}`: Detailed telemetry record for a specific detection ID including coordinates, FRP, brightness, and model feature vector.
- `POST /api/v1/detections/upload`: Ingest new satellite telemetry CSV/JSON file and trigger pipeline inference.

### 2. Incident Alerts
- `GET /api/v1/alerts`: Query active alerts filtered by severity level (`CRITICAL`, `HIGH`, etc.) and verification status.
- `PATCH /api/v1/alerts/{id}/status`: Update verification status (`VERIFIED_INDUSTRIAL`, `FALSE_POSITIVE`, `RESOLVED`).

### 3. Analytics & FIRMS
- `GET /api/v1/analytics/summary`: Aggregated system metrics: total active fires, industrial fire count, persistent source count, and 7-day trend series.
- `GET /api/v1/firms/status`: NASA FIRMS collector status, latest pass timestamp, and sensor health.

### 4. AI Copilot Chat
- `POST /api/chat` (and `POST /api/v1/chat`): Domain AI Assistant endpoint executing hybrid intent routing, FAISS vector retrieval, live database synthesis, and citation generation.
