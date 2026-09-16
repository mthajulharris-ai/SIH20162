"""Hybrid Intent Router for SATRA AI Assistant.

Analyzes user questions to determine whether they require:
- RAG Knowledge Base (definitions, methodology, physics, sensors, architecture)
- Live SATRA Database / API (current detections, counts, active alerts, regional clusters)
- Hybrid (both specific live detection telemetry AND RAG methodology/confidence reasoning)
- Unrelated / Out-of-Scope (safeguard)
"""

import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class QueryIntent:
    intent_type: str  # 'rag', 'live_data', 'hybrid', 'unrelated'
    requires_rag: bool
    requires_live_data: bool
    detection_id: Optional[int] = None
    is_today: bool = False
    is_highest_metric: bool = False
    is_alerts_query: bool = False
    is_pass_query: bool = False


class IntentRouter:
    """Classifies user intent and extracts entity references."""

    UNRELATED_KEYWORDS = [
        "recipe", "cake", "cook", "bake", "poem", "movie", "song", "joke",
        "weather in", "cricket", "football", "world cup", "stock market",
        "bitcoin", "crypto", "capital of", "president of", "prime minister",
        "translate", "write a code", "write an essay", "chocolate"
    ]

    # Live telemetry indicator terms
    LIVE_DATA_TERMS = [
        r'\b(today|today\'s|right now|currently|current|active alerts?|latest pass|latest satellite pass)\b',
        r'\b(how many (industrial fires?|fires?|detections?|alerts?)|highest number of detections?)\b',
        r'\b(which area has the highest|highest frp|highest brightness|latest detection|recent alerts?)\b',
        r'\b(unresolved alerts?|critical alerts?|pending verification)\b',
    ]

    # RAG knowledge terms (concepts, algorithms, physics, architecture)
    RAG_KNOWLEDGE_TERMS = [
        r'\b(what is|what are|explain|how does|definition of|tell me about|why does)\b',
        r'\b(nasa firms|viirs|modis|frp|fire radiative power|thermal anomaly|brightness temperature)\b',
        r'\b(stefan-boltzmann|planck|wien|i-band|m-band|split-window|delta t)\b',
        r'\b(classification taxonomy|persistent thermal source|flare stack|dbscan|epsilon|haversine)\b',
        r'\b(random forest|lightgbm|xgboost|soft-voting|confidence threshold|28 features|f1-score)\b',
        r'\b(system architecture|fastapi|pipeline|leaflets?)\b',
    ]

    def classify(self, query: str) -> QueryIntent:
        q = query.strip()
        q_lower = q.lower()

        # Check for out-of-scope / unrelated queries
        if any(w in q_lower for w in self.UNRELATED_KEYWORDS):
            return QueryIntent(
                intent_type="unrelated",
                requires_rag=False,
                requires_live_data=False,
            )

        # Extract explicit detection ID (e.g., "detection 102", "#102", "detection id 45", "ID: 12")
        detection_id = None
        det_match = re.search(r'\b(?:detection\s*(?:id|#)?\s*|#\s*)(\d+)\b', q_lower)
        if det_match:
            try:
                detection_id = int(det_match.group(1))
            except ValueError:
                detection_id = None

        is_today = bool(re.search(r'\b(today|today\'s|currently|active|latest|recent)\b', q_lower))
        is_highest = bool(re.search(r'\b(highest|maximum|top|peak|hottest|most)\b', q_lower))
        is_alerts = bool(re.search(r'\b(alerts?|unresolved|verified|false positive)\b', q_lower))
        is_pass = bool(re.search(r'\b(satellite pass|latest pass|overpass)\b', q_lower))

        matches_live = any(bool(re.search(p, q_lower)) for p in self.LIVE_DATA_TERMS) or (detection_id is not None) or is_alerts or is_pass
        matches_rag = any(bool(re.search(p, q_lower)) for p in self.RAG_KNOWLEDGE_TERMS)

        # Specific hybrid case: "Why was detection 102 classified as industrial fire?"
        # or "Explain why detection 102 has 82% confidence"
        if detection_id is not None and (matches_rag or "why" in q_lower or "explain" in q_lower or "confidence" in q_lower or "classified" in q_lower):
            return QueryIntent(
                intent_type="hybrid",
                requires_rag=True,
                requires_live_data=True,
                detection_id=detection_id,
                is_today=is_today,
                is_highest_metric=is_highest,
                is_alerts_query=is_alerts,
                is_pass_query=is_pass,
            )

        # General hybrid query: "How does SATRA classify industrial fires?"
        if "classify" in q_lower or "classification" in q_lower or "methodology" in q_lower or "model" in q_lower:
            return QueryIntent(
                intent_type="rag",
                requires_rag=True,
                requires_live_data=False,
                detection_id=detection_id,
                is_today=is_today,
                is_highest_metric=is_highest,
            )

        # Live data specific query
        if matches_live and not matches_rag:
            return QueryIntent(
                intent_type="live_data",
                requires_rag=False,
                requires_live_data=True,
                detection_id=detection_id,
                is_today=is_today,
                is_highest_metric=is_highest,
                is_alerts_query=is_alerts,
                is_pass_query=is_pass,
            )

        # Both matched
        if matches_live and matches_rag:
            return QueryIntent(
                intent_type="hybrid",
                requires_rag=True,
                requires_live_data=True,
                detection_id=detection_id,
                is_today=is_today,
                is_highest_metric=is_highest,
                is_alerts_query=is_alerts,
                is_pass_query=is_pass,
            )

        # Default to RAG knowledge retrieval for domain questions
        return QueryIntent(
            intent_type="rag",
            requires_rag=True,
            requires_live_data=False,
            detection_id=detection_id,
            is_today=is_today,
            is_highest_metric=is_highest,
        )
