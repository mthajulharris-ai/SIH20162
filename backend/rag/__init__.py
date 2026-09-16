"""SATRA RAG (Retrieval-Augmented Generation) Pipeline.

Provides document ingestion, chunking, vector embeddings, FAISS similarity search,
hybrid question routing, and grounded response generation for the SATRA AI Assistant.
"""

from .config import RAGConfig
from .chunker import DocumentChunker, DocumentChunk
from .embeddings import get_embedding_provider, BaseEmbeddingProvider
from .vector_store import FAISSVectorStore
from .retriever import RAGRetriever
from .router import IntentRouter, QueryIntent
from .context_builder import RAGContextBuilder
from .generator import GroundedResponseGenerator

__all__ = [
    "RAGConfig",
    "DocumentChunker",
    "DocumentChunk",
    "get_embedding_provider",
    "BaseEmbeddingProvider",
    "FAISSVectorStore",
    "RAGRetriever",
    "IntentRouter",
    "QueryIntent",
    "RAGContextBuilder",
    "GroundedResponseGenerator",
]
