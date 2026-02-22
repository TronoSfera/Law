from pydantic import BaseModel
from typing import Any, List, Literal

Op = Literal["=", "!=", ">", "<", ">=", "<=", "~"]
Dir = Literal["asc", "desc"]

class FilterClause(BaseModel):
    field: str
    op: Op
    value: Any

class SortClause(BaseModel):
    field: str
    dir: Dir

class Page(BaseModel):
    limit: int = 50
    offset: int = 0

class UniversalQuery(BaseModel):
    filters: List[FilterClause] = []
    sort: List[SortClause] = []
    page: Page = Page()
