"""Comprehensive tests for SATRA RAG pipeline.

Tests chunking, vector embeddings, FAISS vector store, retrieval,
intent routing, context builder, and grounded generation.
"""

import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app

from backend.rag.config import RAGConfig
from backend.rag.chunker import DocumentChunker, DocumentChunk
from backend.rag.embeddings import LocalDenseEmbeddingProvider, get_embedding_provider
from backend.rag.vector_store import FAISSVectorStore
from backend.rag.retriever import RAGRetriever
from backend.rag.router import IntentRouter
from backend.rag.context_builder import RAGContextBuilder
from backend.rag.generator import GroundedResponseGenerator

client = TestClient(app)


def test_chunker_extracts_metadata(tmp_path):
    """Verify document chunker preserves document name, section, and page metadata."""
    sample_doc = tmp_path / "01_test_doc.md"
    sample_doc.write_text(
        "# Test Header\n\n"
        "## First Section\nThis is the content of the first section with technical details.\n\n"
        "## Second Section\nThis is content for the second section discussing satellites.",
        encoding="utf-8"
    )

    chunker = DocumentChunker(chunk_size=100, chunk_overlap=10)
    chunks = chunker.chunk_file(sample_doc)

    assert len(chunks) >= 2
    assert chunks[0].document_name == "Test Doc"
    assert chunks[0].section in ["First Section", "Overview"]
    assert chunks[0].document_type == "MD"
    assert chunks[0].page_number >= 1
    assert "First Section" in chunks[0].text or "Second Section" in chunks[1].text


def test_local_dense_embeddings(tmp_path):
    """Verify local dense embeddings are normalized float32 vectors."""
    model_file = str(tmp_path / "test_emb.joblib")
    embedder = LocalDenseEmbeddingProvider(dimension=16, model_path=model_file)
    texts = [
        "NASA FIRMS VIIRS satellite thermal detection",
        "Industrial fire flare stack temperature differential",
        "Forest wildfire spatial DBSCAN clustering"
    ]
    embeddings = embedder.fit_and_embed(texts)
    assert embeddings.shape[0] == 3
    assert embeddings.dtype == "float32"

    # Verify L2 normalization (norm approximately 1.0)
    import numpy as np
    norms = np.linalg.norm(embeddings, axis=1)
    for n in norms:
        assert pytest.approx(n, 0.01) == 1.0

    # Query embedding
    q_emb = embedder.embed_query("satellite detection")
    assert q_emb.shape[0] == embeddings.shape[1]


def test_faiss_vector_store(tmp_path):
    """Verify FAISS vector store indexing, saving, loading, and searching."""
    idx_path = tmp_path / "test.index"
    meta_path = tmp_path / "test_meta.json"
    model_file = str(tmp_path / "test_store_emb.joblib")

    chunks = [
        DocumentChunk("chk_1", "NASA FIRMS telemetry VIIRS 375m", "Sensors", "MD", "FIRMS", "sensors.md"),
        DocumentChunk("chk_2", "Refinery flare stack persistent source", "Methodology", "MD", "Flares", "methodology.md"),
    ]

    embedder = LocalDenseEmbeddingProvider(dimension=8, model_path=model_file)
    embeddings = embedder.fit_and_embed([c.text for c in chunks])

    store = FAISSVectorStore(index_path=idx_path, metadata_path=meta_path)
    store.build_or_replace(chunks, embeddings)

    assert store.count() == 2
    assert idx_path.exists()
    assert meta_path.exists()

    # Search
    q_vec = embedder.embed_query("VIIRS satellite")
    results = store.search(q_vec, top_k=1)
    assert len(results) == 1
    assert results[0][0].chunk_id == "chk_1"


def test_intent_router():
    """Verify intent router classifies RAG, Live Data, Hybrid, and Unrelated queries."""
    router = IntentRouter()

    # 1. Pure RAG query
    rag_intent = router.classify("What is NASA FIRMS?")
    assert rag_intent.intent_type in ["rag", "hybrid"]
    assert rag_intent.requires_rag is True

    # 2. Pure Live Data query
    live_intent = router.classify("How many industrial fires were detected today?")
    assert live_intent.requires_live_data is True

    # 3. Hybrid query
    hybrid_intent = router.classify("Why was detection #102 classified as an industrial fire?")
    assert hybrid_intent.intent_type == "hybrid"
    assert hybrid_intent.requires_rag is True
    assert hybrid_intent.requires_live_data is True
    assert hybrid_intent.detection_id == 102

    # 4. Out of scope guardrail
    unrelated_intent = router.classify("Can you bake a chocolate cake?")
    assert unrelated_intent.intent_type == "unrelated"
    assert unrelated_intent.requires_rag is False
    assert unrelated_intent.requires_live_data is False


def test_chat_endpoint_data_used_provenance():
    """Verify POST /api/chat returns structured sources and data_used flags."""
    # Knowledge question -> data_used.rag is True
    resp_rag = client.post("/api/chat", json={"message": "What is Fire Radiative Power?"})
    assert resp_rag.status_code == 200
    data_rag = resp_rag.json()
    assert "data_used" in data_rag
    assert data_rag["data_used"]["rag"] is True
    assert isinstance(data_rag["sources"], list)
    if data_rag["sources"]:
        first_src = data_rag["sources"][0]
        assert "document" in first_src

    # Live data question -> data_used.live_data is True
    resp_live = client.post("/api/chat", json={"message": "Show unresolved alerts today"})
    assert resp_live.status_code == 200
    data_live = resp_live.json()
    assert "data_used" in data_live
    assert data_live["data_used"]["live_data"] is True


def test_chat_endpoint_hybrid_provenance():
    """Verify hybrid query (specific detection) returns both rag and live_data flags."""
    from tests.conftest import TestSessionLocal
    from backend.models.detection import Detection

    db = TestSessionLocal()
    det = Detection(
        id=888,
        latitude=22.3039,
        longitude=70.8022,
        brightness=390.0,
        frp=55.0,
        acq_date="2026-09-16",
        acq_time="1400",
        source="VIIRS_NOAA20_NRT",
        predicted_class="Industrial Fire",
        prediction_confidence=0.88,
        is_persistent=False,
        alert_level="CRITICAL",
    )
    db.add(det)
    db.commit()
    db.close()

    resp = client.post("/api/chat", json={"message": "Why was detection #888 classified as Industrial Fire?"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["data_used"]["rag"] is True
    assert data["data_used"]["live_data"] is True
    assert any("Detection #888" in str(s) for s in data["sources"])
