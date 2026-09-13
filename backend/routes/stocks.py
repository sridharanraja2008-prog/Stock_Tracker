import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, HTTPException
from datetime import datetime
import yfinance as yf

from database import db
from models import StockIn

router = APIRouter()


@router.post("/add")
async def add_stock(payload: StockIn):
    symbol = payload.symbol.upper().strip()
    if await db.stocks.find_one({"symbol": symbol}):
        raise HTTPException(400, "Already tracking")
    ticker = yf.Ticker(symbol)
    info   = ticker.info
    name   = info.get("longName") or info.get("shortName") or symbol
    hist   = ticker.history(period="10d")
    if hist.empty:
        raise HTTPException(404, "Symbol not found")
    prices = _build_prices(hist)
    await db.stocks.insert_one({
        "symbol":     symbol,
        "name":       name,
        "added":      datetime.utcnow(),
        "prices":     prices,
        "updated_at": datetime.utcnow()
    })
    return {"symbol": symbol, "name": name, "prices": prices}


@router.get("/stocks")
async def get_stocks():
    docs = await db.stocks.find({}, {"_id": 0}).to_list(100)
    return docs


# ── FIXED: Always fetches fresh data from Yahoo Finance ──
@router.get("/stocks/{symbol}")
async def get_stock(symbol: str):
    symbol = symbol.upper()
    doc = await db.stocks.find_one({"symbol": symbol}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")

    # Always fetch fresh 10-day data
    try:
        hist = yf.Ticker(symbol).history(period="10d")
        if not hist.empty:
            prices = _build_prices(hist)
            await db.stocks.update_one(
                {"symbol": symbol},
                {"$set": {"prices": prices, "updated_at": datetime.utcnow()}}
            )
            doc["prices"] = prices
    except Exception as e:
        # If live fetch fails, return stored data
        pass

    return doc


@router.get("/refresh/{symbol}")
async def refresh(symbol: str):
    symbol = symbol.upper()
    hist   = yf.Ticker(symbol).history(period="10d")
    if hist.empty:
        raise HTTPException(404, "No data")
    prices = _build_prices(hist)
    await db.stocks.update_one(
        {"symbol": symbol},
        {"$set": {"prices": prices, "updated_at": datetime.utcnow()}}
    )
    doc = await db.stocks.find_one({"symbol": symbol}, {"_id": 0})
    return doc


@router.delete("/stocks/{symbol}")
async def delete_stock(symbol: str):
    await db.stocks.delete_one({"symbol": symbol.upper()})
    return {"message": "removed"}


# ── Helper ────────────────────────────────────────────
def _build_prices(hist):
    prices = []
    for date, row in hist.iterrows():
        prices.append({
            "date":   str(date.date()),
            "open":   round(float(row["Open"]),  2),
            "high":   round(float(row["High"]),  2),
            "low":    round(float(row["Low"]),   2),
            "close":  round(float(row["Close"]), 2),
            "volume": int(row["Volume"])
        })
    return prices