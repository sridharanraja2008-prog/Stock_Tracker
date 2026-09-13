import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, HTTPException
from datetime import datetime
import yfinance as yf

from database import db
from models import StockIn

router = APIRouter()


def _fetch_live(symbol: str):
    ticker = yf.Ticker(symbol)
    hist   = ticker.history(period="10d", interval="1d")
    if hist.empty:
        return None, None

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

    live = {}
    try:
        fi = ticker.fast_info
        price      = float(fi.last_price)      if fi.last_price      else None
        prev_close = float(fi.previous_close)  if fi.previous_close  else None
        live = {
            "price":      round(price, 2)      if price      else None,
            "prev_close": round(prev_close, 2) if prev_close else None,
            "open":       round(float(fi.open), 2)      if fi.open      else None,
            "high":       round(float(fi.day_high), 2)  if fi.day_high  else None,
            "low":        round(float(fi.day_low), 2)   if fi.day_low   else None,
            "volume":     int(fi.last_volume)            if fi.last_volume else None,
            "currency":   fi.currency                    if fi.currency    else "USD",
        }
        if price and prev_close:
            live["change"]     = round(price - prev_close, 2)
            live["change_pct"] = round((live["change"] / prev_close) * 100, 2)
    except Exception:
        live = {}

    return prices, live


@router.post("/add")
async def add_stock(payload: StockIn):
    symbol = payload.symbol.upper().strip()
    if await db.stocks.find_one({"symbol": symbol}):
        raise HTTPException(400, "Already tracking")
    ticker = yf.Ticker(symbol)
    info   = ticker.info
    name   = info.get("longName") or info.get("shortName") or symbol
    prices, live = _fetch_live(symbol)
    if prices is None:
        raise HTTPException(404, "Symbol not found")
    doc = {
        "symbol":     symbol,
        "name":       name,
        "added":      datetime.utcnow(),
        "prices":     prices,
        "live":       live,
        "updated_at": datetime.utcnow().isoformat()
    }
    await db.stocks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/stocks")
async def get_stocks():
    docs = await db.stocks.find({}, {"_id": 0}).to_list(100)
    return docs


@router.get("/stocks/{symbol}")
async def get_stock(symbol: str):
    symbol = symbol.upper()
    doc = await db.stocks.find_one({"symbol": symbol}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    prices, live = _fetch_live(symbol)
    if prices:
        await db.stocks.update_one(
            {"symbol": symbol},
            {"$set": {
                "prices":     prices,
                "live":       live,
                "updated_at": datetime.utcnow().isoformat()
            }}
        )
        doc["prices"]     = prices
        doc["live"]       = live
        doc["updated_at"] = datetime.utcnow().isoformat()
    return doc


@router.get("/refresh/{symbol}")
async def refresh(symbol: str):
    symbol = symbol.upper()
    doc = await db.stocks.find_one({"symbol": symbol}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    prices, live = _fetch_live(symbol)
    if not prices:
        raise HTTPException(404, "No data from Yahoo Finance")
    await db.stocks.update_one(
        {"symbol": symbol},
        {"$set": {
            "prices":     prices,
            "live":       live,
            "updated_at": datetime.utcnow().isoformat()
        }}
    )
    doc["prices"]     = prices
    doc["live"]       = live
    doc["updated_at"] = datetime.utcnow().isoformat()
    return doc


@router.delete("/stocks/{symbol}")
async def delete_stock(symbol: str):
    await db.stocks.delete_one({"symbol": symbol.upper()})
    return {"message": "removed"}