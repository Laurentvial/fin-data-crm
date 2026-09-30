"""
One-time Telegram authentication script.

Run this to log in with your Telegram user account (phone + code).
The session file will be reused by the main service.
"""

import asyncio
import os

from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.errors import FloodWaitError, SessionPasswordNeededError
from telethon.tl.functions.auth import ResendCodeRequest

load_dotenv()
load_dotenv("env")

TELEGRAM_API_ID = int(os.environ.get("TELEGRAM_API_ID", "0"))
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
TELEGRAM_SESSION_PATH = os.environ.get("TELEGRAM_SESSION_PATH", "telegram_session").strip()


def describe(sent) -> str:
    delivery = type(sent.type).__name__
    nxt = type(sent.next_type).__name__ if getattr(sent, "next_type", None) else "aucun"
    timeout = getattr(sent, "timeout", None)
    return f"{delivery} (prochain moyen: {nxt}, attente avant renvoi: {timeout}s)"


async def main():
    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        print("Set TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables.")
        print("Get them from https://my.telegram.org/app")
        return

    phone = input("Numéro avec indicatif (ex. +972...): ").strip()
    client = TelegramClient(
        TELEGRAM_SESSION_PATH,
        TELEGRAM_API_ID,
        TELEGRAM_API_HASH,
    )
    await client.connect()
    if await client.is_user_authorized():
        me = await client.get_me()
        print(f"Déjà connecté : {me.first_name} (@{me.username or 'sans pseudo'})")
        await client.disconnect()
        return

    try:
        sent = await client.send_code_request(phone)
    except FloodWaitError as e:
        print(f"Telegram bloque les nouveaux codes pendant {e.seconds} secondes.")
        await client.disconnect()
        return
    except Exception as e:
        print(f"Échec de la demande de code: {e}")
        await client.disconnect()
        return

    print(f"Telegram a choisi: {describe(sent)}")
    if type(sent.type).__name__ == "SentCodeTypeApp" and getattr(sent, "next_type", None) is None:
        print(
            "Pas de SMS pour ce numéro. Le code part uniquement vers un appareil "
            "où +ce compte Telegram est déjà ouvert (conversation « Telegram »)."
        )
    elif type(sent.type).__name__ == "SentCodeTypeApp":
        try:
            sent = await client(ResendCodeRequest(phone, sent.phone_code_hash))
            print(f"Renvoi: {describe(sent)}")
        except Exception as e:
            print(f"Renvoi SMS refusé: {e}")

    code = input("Code reçu (rien d'autre): ").strip()
    try:
        await client.sign_in(phone, code)
    except SessionPasswordNeededError:
        password = input("Mot de passe cloud Telegram: ")
        await client.sign_in(password=password)
    except Exception as e:
        print(f"Connexion refusée: {e}")
        await client.disconnect()
        return

    me = await client.get_me()
    print(f"Connecté : {me.first_name} (@{me.username or 'sans pseudo'})")
    print(f"Fichier de session: {TELEGRAM_SESSION_PATH}.session")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
