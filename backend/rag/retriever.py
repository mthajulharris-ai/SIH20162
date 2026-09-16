"""RAG Retriever module for SATRA knowledge base.

Normalizes user queries, creates embeddings, executes top-k similarity search,
and filters results by confidence threshold.
"""

import re
from dataclasses import dataclass
from typing import List, Dict, Any, Optional

from .config import RAGConfig
from .chunker import DocumentChunk
from .embeddings import BaseEmbeddingProvider, get_embedding_provider
from .vector_store import FAISSVectorStore


@dataclass
class RetrievedChunk:
    chunk: DocumentChunk
    score: float

    def to_source_citation(self) -> Dict[str, Any]:
        """Convert chunk metadata to user-facing citation dictionary."""
        return {
            "document": self.chunk.document_name,
            "section": self.chunk.section,
            "page": self.chunk.page_number or 1,
            "source": self.chunk.source,
        }


class RAGRetriever:
    """Orchestrates query normalization, vector embedding, and similarity filtering."""

    def __init__(
        self,
        vector_store: Optional[FAISSVectorStore] = None,
        embedding_provider: Optional[BaseEmbeddingProvider] = None,
        top_k: int = RAGConfig.TOP_K,
        similarity_threshold: float = RAGConfig.SIMILARITY_THRESHOLD,
    ):
        self.vector_store = vector_store or FAISSVectorStore()
        self.embedding_provider = embedding_provider or get_embedding_provider()
        self.top_k = top_k
        self.similarity_threshold = similarity_threshold

    def normalize_query(self, query: str) -> str:
        """Clean and normalize query string for optimal embedding lookup."""
        q = query.strip()
        # Clean extra whitespace
        q = re.sub(r'\s+', ' ', q)
        return q

    def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        threshold: Optional[float] = None
    ) -> List[RetrievedChunk]:
        """Retrieve the top-k most relevant document chunks for a query."""
        clean_q = self.normalize_query(query)
        if not clean_q or self.vector_store.count() == 0:
            return []

        k = top_k if top_k is not None else self.top_k
        min_score = threshold if threshold is not None else self.similarity_threshold

        # Generate query embedding
        query_vector = self.embedding_provider.embed_query(clean_q)

        # Execute vector database search
        raw_results = self.vector_store.search(query_vector, top_k=k, min_score=min_score)

        return [RetrievedChunk(chunk=chunk, score=score) for chunk, score in raw_results]

    def format_context(self, retrieved: List[RetrievedChunk]) -> str:
        """Format retrieved chunks into a clean context block."""
        if not retrieved:
            return "No relevant project documentation found."

        sections = []
        for item in retrieved:
            sections.append(item.chunk.text)

        return "\n\n---\n\n".join(sections)
