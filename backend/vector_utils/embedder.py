"""
Embedding Service for HearSight

Generates embeddings for user questions using local models or API.
"""

import logging
from typing import List
import os
import requests

logger = logging.getLogger(__name__)


class LocalEmbeddingService:
    """Generate embeddings using local sentence-transformers model"""

    def __init__(self, model_name: str = "BAAI/bge-large-zh-v1.5"):
        """
        Initialize local embedding service

        Args:
            model_name: Model name for sentence-transformers
        """
        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(model_name)
            self.model_name = model_name
            logger.info(f"Loaded local embedding model: {model_name}")
        except ImportError:
            raise ImportError(
                "sentence-transformers not installed. "
                "Install with: pip install sentence-transformers"
            )

    def embed(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        return self.embed_batch([text])[0]

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        embeddings = self.model.encode(texts, normalize_embeddings=True)
        logger.info(f"Generated {len(embeddings)} embeddings using {self.model_name}")
        return embeddings.tolist()


class EmbeddingService:
    """Generate embeddings for questions using OpenAI-compatible API"""

    def __init__(
        self,
        api_url: str,
        api_key: str,
        model: str = "BAAI/bge-large-zh-v1.5"
    ):
        """
        Initialize embedding service

        Args:
            api_url: Base URL for embedding API (from OpenAI config)
            api_key: API key (from OpenAI config)
            model: Embedding model name
        """
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key
        self.model = model

    def embed(self, text: str) -> List[float]:
        """
        Generate embedding for a single text

        Args:
            text: Input text

        Returns:
            Embedding vector

        Raises:
            Exception: If embedding generation fails
        """
        return self.embed_batch([text])[0]

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts

        Args:
            texts: List of input texts

        Returns:
            List of embedding vectors

        Raises:
            Exception: If embedding generation fails
        """
        endpoint = f"{self.api_url}/embeddings"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "input": texts
        }

        try:
            response = requests.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()

            result = response.json()
            embeddings = [item['embedding'] for item in result['data']]

            logger.info(f"Generated {len(embeddings)} embeddings")
            return embeddings

        except Exception as e:
            logger.error(f"Embedding generation failed: {e}", exc_info=True)
            raise


def create_embedding_service(
    api_url: str,
    api_key: str,
    model: str = "BAAI/bge-large-zh-v1.5"
) -> EmbeddingService:
    """
    Factory function to create embedding service

    Args:
        api_url: API base URL
        api_key: API key
        model: Embedding model name

    Returns:
        EmbeddingService instance
    """
    return EmbeddingService(
        api_url=api_url,
        api_key=api_key,
        model=model
    )
