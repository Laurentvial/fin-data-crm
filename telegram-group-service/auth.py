"""
One-time Telegram authentication script.

Run this to log in with your Telegram user account (phone + code).
The session file will be reused by the main service.
"""

import asyncio
import os

from dotenv import load_dotenv
from telethon import TelegramClient

load_dotenv()

TELEGRAM_API_ID = int(os.environ.get("TELEGRAM_API_ID", "0"))
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
TELEGRAM_SESSION_PATH = os.environ.get("TELEGRAM_SESSION_PATH", "telegram_session")


async def main():
    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        print("Set TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables.")
        print("Get them from https://my.telegram.org/app")
        return
    client = TelegramClient(
        TELEGRAM_SESSION_PATH,
        TELEGRAM_API_ID,
        TELEGRAM_API_HASH,
    )
    await client.start()
    me = await client.get_me()
    print(f"Logged in as {me.first_name} (@{me.username or 'no username'})")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
