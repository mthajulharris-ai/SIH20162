"""Document chunker for SATRA RAG pipeline.

Splits markdown and text documents into coherent, context-rich chunks while
extracting and preserving structural metadata (document name, section, type, source, updated date).
"""

import re
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Optional


@dataclass
class DocumentChunk:
    """Represents a text chunk with rich provenance metadata."""
    chunk_id: str
    text: str
    document_name: str
    document_type: str
    section: str
    source: str
    page_number: Optional[int] = 1
    updated_at: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


class DocumentChunker:
    """Intelligent document parser and chunker for SATRA technical documents."""

    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 75):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def clean_text(self, text: str) -> str:
        """Sanitize raw text for embedding generation."""
        # Normalize carriage returns
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        # Remove consecutive blank lines
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

    def chunk_file(self, file_path: Path) -> List[DocumentChunk]:
        """Extract sections and produce overlapping chunks from a document."""
        if not file_path.exists():
            return []

        doc_name = file_path.stem.replace('_', ' ').title()
        # Clean title (remove leading digits like '01 ')
        doc_name = re.sub(r'^\d+\s+', '', doc_name)
        doc_type = file_path.suffix.lstrip('.').upper() or "MD"
        updated_at = datetime.fromtimestamp(file_path.stat().st_mtime).strftime("%Y-%m-%d")

        raw_content = file_path.read_text(encoding='utf-8')
        cleaned_content = self.clean_text(raw_content)

        # Split document by markdown section headers (# or ##)
        section_pattern = re.compile(r'^(#{1,3}\s+.+)$', re.MULTILINE)
        splits = section_pattern.split(cleaned_content)

        chunks: List[DocumentChunk] = []
        current_section = "Overview"
        chunk_counter = 0

        i = 0
        while i < len(splits):
            part = splits[i].strip()
            if not part:
                i += 1
                continue

            # Check if this part is a header
            if section_pattern.match(part):
                current_section = part.lstrip('#').strip()
                i += 1
                continue

            # This part is body content under current_section
            paragraphs = [p.strip() for p in part.split('\n\n') if p.strip()]
            current_buffer = []
            current_len = 0

            for para in paragraphs:
                para_len = len(para.split())
                if current_len + para_len > self.chunk_size and current_buffer:
                    chunk_text = " ".join(current_buffer)
                    chunk_id = f"{file_path.stem}_chk_{chunk_counter:03d}"
                    chunks.append(DocumentChunk(
                        chunk_id=chunk_id,
                        text=f"[{doc_name} — {current_section}]\n{chunk_text}",
                        document_name=doc_name,
                        document_type=doc_type,
                        section=current_section,
                        source=file_path.name,
                        page_number=max(1, (chunk_counter // 2) + 1),
                        updated_at=updated_at,
                    ))
                    chunk_counter += 1

                    # Keep overlap words
                    overlap_words = chunk_text.split()[-self.chunk_overlap:]
                    current_buffer = [" ".join(overlap_words), para]
                    current_len = len(overlap_words) + para_len
                else:
                    current_buffer.append(para)
                    current_len += para_len

            if current_buffer:
                chunk_text = " ".join(current_buffer)
                chunk_id = f"{file_path.stem}_chk_{chunk_counter:03d}"
                chunks.append(DocumentChunk(
                    chunk_id=chunk_id,
                    text=f"[{doc_name} — {current_section}]\n{chunk_text}",
                    document_name=doc_name,
                    document_type=doc_type,
                    section=current_section,
                    source=file_path.name,
                    page_number=max(1, (chunk_counter // 2) + 1),
                    updated_at=updated_at,
                ))
                chunk_counter += 1

            i += 1

        return chunks
