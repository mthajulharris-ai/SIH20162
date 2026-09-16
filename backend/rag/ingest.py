"""Knowledge base document ingestion and vector indexing script for SATRA.

Reads documents from backend/rag/documents/, chunks them, generates embeddings,
and builds the persistent FAISS vector index.
"""

import sys
import time
from pathlib import Path
from typing import List

from .config import RAGConfig
from .chunker import DocumentChunker, DocumentChunk
from .embeddings import get_embedding_provider
from .vector_store import FAISSVectorStore


def ingest_knowledge_base(force_rebuild: bool = False):
    """Execute ingestion pipeline for all knowledge base documents."""
    docs_dir = RAGConfig.DOCS_PATH
    if not docs_dir.exists():
        docs_dir.mkdir(parents=True, exist_ok=True)
        print(f"[RAG Ingest] Created documents directory: {docs_dir}")

    doc_files = sorted(list(docs_dir.glob("*.md")) + list(docs_dir.glob("*.txt")))
    if not doc_files:
        print(f"[RAG Ingest] No documents found in {docs_dir}")
        return {
            "documents_processed": 0,
            "chunks_created": 0,
            "embeddings_generated": 0,
            "status": "empty",
        }

    start_time = time.time()
    chunker = DocumentChunker(chunk_size=RAGConfig.CHUNK_SIZE, chunk_overlap=RAGConfig.CHUNK_OVERLAP)

    all_chunks: List[DocumentChunk] = []
    for doc_path in doc_files:
        file_chunks = chunker.chunk_file(doc_path)
        all_chunks.extend(file_chunks)

    num_docs = len(doc_files)
    num_chunks = len(all_chunks)

    if num_chunks == 0:
        print("[RAG Ingest] Warning: No chunks extracted from documents.")
        return {
            "documents_processed": num_docs,
            "chunks_created": 0,
            "embeddings_generated": 0,
            "status": "no_chunks",
        }

    # Generate Embeddings
    print(f"[RAG Ingest] Generating embeddings for {num_chunks} chunks using provider '{RAGConfig.EMBEDDING_PROVIDER}'...")
    texts = [c.text for c in all_chunks]
    embedder = get_embedding_provider()

    if hasattr(embedder, "fit_and_embed"):
        embeddings = embedder.fit_and_embed(texts)
    else:
        embeddings = embedder.embed_texts(texts)

    # Build and persist FAISS index
    vector_store = FAISSVectorStore()
    vector_store.build_or_replace(all_chunks, embeddings)

    elapsed = time.time() - start_time

    print("=" * 60)
    print("SATRA RAG KNOWLEDGE BASE INGESTION REPORT")
    print("=" * 60)
    print(f"Documents processed:    {num_docs}")
    print(f"Chunks created:          {num_chunks}")
    print(f"Embeddings generated:    {len(embeddings)}")
    print(f"Embedding dimension:     {embeddings.shape[1]}")
    print(f"Index storage location:  {RAGConfig.INDEX_FILE}")
    print(f"Execution time:          {elapsed:.2f} seconds")
    print("Vector index updated successfully.")
    print("=" * 60)

    return {
        "documents_processed": num_docs,
        "chunks_created": num_chunks,
        "embeddings_generated": len(embeddings),
        "status": "success",
    }


if __name__ == "__main__":
    force = "--force" in sys.argv
    ingest_knowledge_base(force_rebuild=force)
