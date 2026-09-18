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

## Retrieval-Augmented Generation (RAG) Architecture

**Retrieval-Augmented Generation (RAG)** in SATRA is an intelligent knowledge-retrieval pipeline that grounds the SATRA AI Assistant in verified technical documentation and live telemetry data, preventing AI hallucinations.

### Core Components of SATRA RAG:
1. **Document Ingestion & Semantic Chunking**: Technical specification documents covering sensors, physics, machine learning models, GIS, and alerts are chunked with metadata preservation.
2. **Dense Vector Embeddings**: Document chunks are projected into a normalized vector space using dense semantic embeddings.
3. **FAISS Vector Index**: Fast similarity search using FAISS retrieves the top-k most relevant document chunks based on cosine similarity.
4. **Multilingual Query Normalization**: User queries in English, Tamil, Tanglish, or Hindi are mapped to normalized domain concepts for vector search.
5. **Grounded Response Generation**: The assistant synthesizes verified answers using strictly the retrieved context and live database observations, citing exact source documents and sections.

