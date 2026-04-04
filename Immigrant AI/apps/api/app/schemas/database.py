from pydantic import BaseModel


class DatabaseCheckResponse(BaseModel):
    database: str
    status: str
