from typing import List, Optional

from pydantic import BaseModel


class ExamNewsItem(BaseModel):
    title: str
    url: str
    excerpt: str
    category: Optional[str] = None
    published_at: Optional[str] = None


class ExamNewsResponse(BaseModel):
    source: str = "NEXT IAS"
    items: List[ExamNewsItem]
