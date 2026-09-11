import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGO_DETAILS")
client = AsyncIOMotorClient(MONGO_URI)

db = client.stock_db  