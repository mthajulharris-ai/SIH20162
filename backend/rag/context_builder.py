"""Context builder for SATRA AI Assistant.

Assembles well-demarcated sections for Project Knowledge (RAG), Live SATRA Data,
and the User Question with clear attribution.
"""

from typing import List, Optional
from .retriever import RetrievedChunk


class RAGContextBuilder:
    """Constructs prompt context with distinct separation between documentation and live database telemetry."""

    SYSTEM_PROMPT = (
        "You are the SATRA AI Assistant, a domain-specific aerospace copilot for "
        "satellite-based industrial fire detection, thermal anomaly analysis, and telemetry risk assessment.\n"
        "Guidelines:\n"
        "1. Strictly answer from the provided [PROJECT KNOWLEDGE] and [LIVE SATRA DATA].\n"
        "2. Do not fabricate detection IDs, fire counts, coordinates, or sensor readings.\n"
        "3. When explaining reasons or classifications for a detection, synthesize empirical parameters "
        "(FRP, brightness, delta T, industrial proximity) with the ML model methodology.\n"
        "4. If information is missing from the provided context, state clearly:\n"
        "   - For live data: 'I couldn\\'t find matching live data in the SATRA system.'\n"
        "   - For knowledge: 'I don\\'t have enough information in the SATRA knowledge base to answer that accurately.'\n"
    )

    @classmethod
    def build(
        cls,
        query: str,
        retrieved_chunks: Optional[List[RetrievedChunk]] = None,
        live_data_text: Optional[str] = None,
    ) -> str:
        parts = [cls.SYSTEM_PROMPT]

        # Section 1: RAG Documents
        if retrieved_chunks:
            rag_body = []
            for item in retrieved_chunks:
                header = f"--- Source: {item.chunk.document_name} | Section: {item.chunk.section} ---"
                rag_body.append(f"{header}\n{item.chunk.text}")
            parts.append("\n[PROJECT KNOWLEDGE]\n" + "\n\n".join(rag_body))

        # Section 2: Live Operational Database Data
        if live_data_text:
            parts.append("\n[LIVE SATRA DATA]\n" + live_data_text.strip())

        # Section 3: User Query
        parts.append(f"\n[USER QUESTION]\n{query}")

        return "\n".join(parts)
