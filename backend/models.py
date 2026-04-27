from pydantic import BaseModel

class StockIn(BaseModel):
    symbol: str