#!/usr/bin/env python
"""CLI helper to build or update SATRA RAG Knowledge Base.

Usage:
    python scripts/build_knowledge_base.py
    python scripts/build_knowledge_base.py --force
"""

import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.rag.ingest import ingest_knowledge_base

if __name__ == "__main__":
    force = "--force" in sys.argv
    result = ingest_knowledge_base(force_rebuild=force)
    sys.exit(0 if result.get("status") == "success" else 1)
