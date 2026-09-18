"""
Chatbot API Endpoints for SATRA AI Assistant.
Provides domain-specific query resolution and real-time database-grounded insights.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db.session import get_db
from backend.services.chat_service import generate_chat_response

router = APIRouter()


class ChatHistoryItem(BaseModel):
    role: str = Field(..., description="Role: 'user' or 'assistant'")
    content: str = Field(..., description="Message text content")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="User question or query for the AI Assistant")
    history: Optional[List[ChatHistoryItem]] = Field(default=None, description="Optional conversational history context")
    language: Optional[str] = Field(default="auto", description="Response language: 'auto', 'en', 'ta', 'tanglish', 'hi'")


class ChatResponse(BaseModel):
    response: str = Field(..., description="AI generated domain-expert answer")
    sources: Optional[List[Any]] = Field(default=[], description="Domain references or system data sources queried")
    data_used: Optional[Dict[str, bool]] = Field(
        default_factory=lambda: {"rag": False, "live_data": False},
        description="Data provenance flags indicating whether RAG documents or live database telemetry was utilized",
    )
    timestamp: Optional[str] = Field(default=None, description="Response generation timestamp in ISO-8601 UTC")
    language: Optional[str] = Field(default="en", description="Resolved response language ('en', 'ta', 'tanglish', 'hi')")


@router.post(
    "",
    response_model=ChatResponse,
    summary="Query SATRA Domain AI Assistant",
    description="Ask questions regarding NASA FIRMS, VIIRS/MODIS sensors, FRP, ML ensemble classification, and live telemetry data.",
)
@router.post(
    "/",
    response_model=ChatResponse,
    include_in_schema=False,
)
def chat_endpoint(
    payload: ChatRequest,
    db: Session = Depends(get_db),
) -> ChatResponse:
    """
    Evaluates the user query against the domain knowledge base and live database metrics.
    """
    clean_message = payload.message.strip()
    if not clean_message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content cannot be empty or whitespace.",
        )

    history_dicts = None
    if payload.history:
        history_dicts = [{"role": h.role, "content": h.content} for h in payload.history]

    result = generate_chat_response(
        message=clean_message,
        db=db,
        history=history_dicts,
        language=payload.language or "auto",
    )

    return ChatResponse(
        response=result["response"],
        sources=result.get("sources"),
        data_used=result.get("data_used", {"rag": False, "live_data": False}),
        timestamp=result["timestamp"],
        language=result.get("language", "en"),
    )
