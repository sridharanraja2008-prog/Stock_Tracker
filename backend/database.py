import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

MONGO_URI = os.getenv("MONGO_URI", os.getenv("MONGO_DETAILS"))

client = AsyncIOMotorClient(MONGO_URI)