"""RAG configuration settings for SATRA."""

import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent
DOCUMENTS_DIR = BASE_DIR / "documents"
VECTOR_DATA_DIR = BASE_DIR / "vector_data"

# Ensure directories exist
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
VECTOR_DATA_DIR.mkdir(parents=True, exist_ok=True)


class RAGConfig:
    """Configuration parameters for SATRA RAG subsystem."""

    # Embedding Settings
    EMBEDDING_PROVIDER: str = os.getenv("EMBEDDING_PROVIDER", "local").lower()
    EMBEDDING_API_KEY: str = os.getenv("EMBEDDING_API_KEY", os.getenv("OPENAI_API_KEY", ""))
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    LOCAL_EMBEDDING_DIM: int = int(os.getenv("LOCAL_EMBEDDING_DIM", "128"))

    # Vector Search & Retrieval Settings
    TOP_K: int = int(os.getenv("RAG_TOP_K", "4"))
    SIMILARITY_THRESHOLD: float = float(os.getenv("RAG_SIMILARITY_THRESHOLD", "0.20"))

    # File Paths
    DOCS_PATH: Path = DOCUMENTS_DIR
    VECTOR_STORE_PATH: Path = VECTOR_DATA_DIR
    INDEX_FILE: Path = VECTOR_DATA_DIR / "faiss.index"
    METADATA_FILE: Path = VECTOR_DATA_DIR / "chunks_metadata.json"
    LOCAL_MODEL_FILE: Path = VECTOR_DATA_DIR / "local_embedder.joblib"

    # LLM Settings
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "local").lower()
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # Chunking Settings
    CHUNK_SIZE: int = int(os.getenv("RAG_CHUNK_SIZE", "500"))
    CHUNK_OVERLAP: int = int(os.getenv("RAG_CHUNK_OVERLAP", "75"))
