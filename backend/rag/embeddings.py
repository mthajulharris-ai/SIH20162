"""Embedding provider abstraction layer for SATRA RAG pipeline.

Supports configurable local embedding providers (zero external dependencies) as well as
API-based providers (OpenAI, Gemini) configured through environment variables.
"""

import os
from abc import ABC, abstractmethod
from typing import List, Optional
import numpy as np
import joblib

from .config import RAGConfig


class BaseEmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""

    @abstractmethod
    def embed_texts(self, texts: List[str]) -> np.ndarray:
        """Generate normalized float32 embeddings for a list of document strings."""
        pass

    @abstractmethod
    def embed_query(self, text: str) -> np.ndarray:
        """Generate normalized float32 embedding for a single query string."""
        pass

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Return the vector dimensionality."""
        pass


class LocalDenseEmbeddingProvider(BaseEmbeddingProvider):
    """Local, offline, dense semantic projection provider.

    Combines character/word n-gram TF-IDF representations with TruncatedSVD
    (Latent Semantic Analysis) and L2 unit-sphere normalization.
    Completely deterministic, zero cost, and zero external network latency.
    """

    def __init__(self, dimension: Optional[int] = None, model_path: Optional[str] = None):
        self.target_dim = dimension or RAGConfig.LOCAL_EMBEDDING_DIM
        self._dim = self.target_dim
        self.model_path = model_path or str(RAGConfig.LOCAL_MODEL_FILE)
        self.vectorizer = None
        self.svd = None
        self._is_fitted = False
        self._load_if_exists()

    def _load_if_exists(self):
        if self.model_path and os.path.exists(self.model_path):
            try:
                data = joblib.load(self.model_path)
                self.vectorizer = data.get("vectorizer")
                self.svd = data.get("svd")
                self._dim = data.get("dimension", self.target_dim)
                self._is_fitted = True
            except Exception:
                self._is_fitted = False

    def fit_and_embed(self, texts: List[str], target_dim: Optional[int] = None) -> np.ndarray:
        """Fit the semantic projection on the document corpus and return embeddings."""
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.decomposition import TruncatedSVD
        from sklearn.preprocessing import normalize

        if not texts:
            return np.empty((0, self._dim), dtype=np.float32)

        desired_dim = target_dim or self.target_dim
        n_samples = len(texts)
        actual_dim = max(2, min(desired_dim, n_samples - 1 if n_samples > 1 else 1))

        self.vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            sublinear_tf=True,
            max_features=4000,
            token_pattern=r'(?u)\b\w[\w-]+\b'
        )
        tfidf = self.vectorizer.fit_transform(texts)

        self.svd = TruncatedSVD(n_components=actual_dim, random_state=42)
        dense = self.svd.fit_transform(tfidf)
        normalized = normalize(dense, norm='l2', axis=1).astype(np.float32)

        self._dim = actual_dim
        self._is_fitted = True

        # Persist the fitted model
        if self.model_path:
            joblib.dump({
                "vectorizer": self.vectorizer,
                "svd": self.svd,
                "dimension": self._dim,
            }, self.model_path)

        return normalized

    def embed_texts(self, texts: List[str]) -> np.ndarray:
        from sklearn.preprocessing import normalize

        if not self._is_fitted or self.vectorizer is None or self.svd is None:
            return self.fit_and_embed(texts)

        tfidf = self.vectorizer.transform(texts)
        dense = self.svd.transform(tfidf)
        return normalize(dense, norm='l2', axis=1).astype(np.float32)

    def embed_query(self, text: str) -> np.ndarray:
        emb = self.embed_texts([text])
        return emb[0] if len(emb) > 0 else np.zeros((self._dim,), dtype=np.float32)

    @property
    def dimension(self) -> int:
        return self._dim


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    """OpenAI API embedding provider using text-embedding-3-small."""

    def __init__(self, api_key: str, model: str = "text-embedding-3-small"):
        self.api_key = api_key
        self.model = model
        self._dim = 1536

    def embed_texts(self, texts: List[str]) -> np.ndarray:
        import httpx
        headers = {"Authorization": f"Bearer {self.api_key}"}
        payload = {"input": texts, "model": self.model}
        resp = httpx.post("https://api.openai.com/v1/embeddings", json=payload, headers=headers, timeout=20.0)
        resp.raise_for_status()
        data = resp.json()
        embeddings = [item["embedding"] for item in data["data"]]
        arr = np.array(embeddings, dtype=np.float32)
        # L2 normalize
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        return arr / np.maximum(norms, 1e-12)

    def embed_query(self, text: str) -> np.ndarray:
        return self.embed_texts([text])[0]

    @property
    def dimension(self) -> int:
        return self._dim


def get_embedding_provider(provider_name: Optional[str] = None) -> BaseEmbeddingProvider:
    """Factory creating the configured embedding provider."""
    provider = (provider_name or RAGConfig.EMBEDDING_PROVIDER).lower()

    if provider == "openai" and RAGConfig.EMBEDDING_API_KEY:
        return OpenAIEmbeddingProvider(
            api_key=RAGConfig.EMBEDDING_API_KEY,
            model=RAGConfig.EMBEDDING_MODEL
        )

    # Default to robust local dense embedding provider
    return LocalDenseEmbeddingProvider(dimension=RAGConfig.LOCAL_EMBEDDING_DIM)
