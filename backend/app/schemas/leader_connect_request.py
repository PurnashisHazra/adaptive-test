from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

LeaderConnectStatus = Literal["pending", "reviewed"]


class LeaderConnectRequestOut(BaseModel):
    id: str
    company_clicked: str
    main_topic: str
    company_interested_in: str
    mobile: str
    cv_filename: Optional[str] = None
    student_username: Optional[str] = None
    status: LeaderConnectStatus
    created_at: datetime


class LeaderConnectRequestAdminItem(BaseModel):
    id: str
    company_clicked: str
    main_topic: str
    company_interested_in: str
    mobile: str
    cv_filename: Optional[str] = None
    cv_download_url: Optional[str] = None
    student_username: Optional[str] = None
    status: LeaderConnectStatus
    created_at: datetime
