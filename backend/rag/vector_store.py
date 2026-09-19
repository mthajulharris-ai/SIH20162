"""Vector Store implementation using FAISS for SATRA RAG.

Provides indexed vector storage, cosine similarity search (IndexFlatIP),
persistence, and chunk metadata association.
"""

import json
from pathlib import Path
from typing import List, Tuple, Optional
import numpy as np
try:
    import faiss
except ImportError:
    faiss = None


from .config import RAGConfig
from .chunker import DocumentChunk



class FAISSVectorStore:
    """FAISS-powered local vector database."""

    def __init__(self, index_path: Optional[Path] = None, metadata_path: Optional[Path] = None):
        self.index_path = index_path or RAGConfig.INDEX_FILE
        self.metadata_path = metadata_path or RAGConfig.METADATA_FILE
        self.index: Optional[faiss.Index] = None
        self.chunks: List[DocumentChunk] = []
        self._load()

    def _load(self):
        """Load FAISS index and metadata from disk if present."""
        if faiss is not None and self.index_path.exists() and self.metadata_path.exists():
            try:
                self.index = faiss.read_index(str(self.index_path))

                with open(self.metadata_path, 'r', encoding='utf-8') as f:
                    raw_data = json.load(f)
                    self.chunks = [DocumentChunk(**item) for item in raw_data]
            except Exception as e:
                print(f"[RAG VectorStore] Warning: Failed to load existing index: {e}")
                self.index = None
                self.chunks = []

    def build_or_replace(self, chunks: List[DocumentChunk], embeddings: np.ndarray):
        """Construct a new FAISS index from normalized embeddings and chunks."""
        if len(chunks) != len(embeddings):
            raise ValueError("Chunks and embeddings must have matching lengths.")

        if len(chunks) == 0:
            return

        dim = embeddings.shape[1]
        # IndexFlatIP calculates inner product; for unit-normalized vectors this equals cosine similarity.
        self.index = faiss.IndexFlatIP(dim)
        self.index.add(embeddings.astype(np.float32))
        self.chunks = list(chunks)
        self.save()

    def save(self):
        """Persist index and metadata to disk."""
        if self.index is None:
            return

        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self.index, str(self.index_path))

        with open(self.metadata_path, 'w', encoding='utf-8') as f:
            json.dump([c.to_dict() for c in self.chunks], f, indent=2)

    def search(self, query_vector: np.ndarray, top_k: int = 4, min_score: float = 0.0) -> List[Tuple[DocumentChunk, float]]:
        """Search top-k most similar chunks using cosine similarity."""
        if self.index is None or len(self.chunks) == 0:
            return []

        if query_vector.ndim == 1:
            query_vector = query_vector.reshape(1, -1)

        query_vector = query_vector.astype(np.float32)
        k = min(top_k, len(self.chunks))
        scores, indices = self.index.search(query_vector, k)

        results: List[Tuple[DocumentChunk, float]] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.chunks):
                continue
            sim = float(score)
            if sim >= min_score:
                results.append((self.chunks[idx], sim))

        return results

    def count(self) -> int:
        return len(self.chunks)
