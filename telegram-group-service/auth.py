"""
One-time Telegram login by QR code.

No SMS and no in-app login code. On the phone already logged into the
account: Settings, Devices, Link desktop device, then scan the QR.
"""

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError

load_dotenv()
load_dotenv("env")

TELEGRAM_API_ID = int(os.environ.get("TELEGRAM_API_ID", "0"))
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
TELEGRAM_SESSION_PATH = os.environ.get("TELEGRAM_SESSION_PATH", "telegram_session").strip()
QR_PNG = Path(__file__).resolve().parent / "telegram-login-qr.png"


def show_qr(url: str) -> None:
    try:
        import qrcode
    except ImportError:
        print("Installez le générateur : python -m pip install qrcode")
        print(url)
        return

    qr = qrcode.QRCode(border=1)
    qr.add_data(url)
    qr.make(fit=True)
    qr.print_ascii(invert=True)
    try:
        img = qr.make_image(fill_color="black", back_color="white")
        img.save(QR_PNG)
        print(f"Image : {QR_PNG}")
        if os.name == "nt":
            os.startfile(QR_PNG)  # noqa: S606
    except Exception as e:
        print(f"QR en image indisponible ({e}). Utilisez le QR affiché ci-dessus.")


async def main():
    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        print("TELEGRAM_API_ID et TELEGRAM_API_HASH manquent dans .env")
        return

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

    print("Sur le téléphone : Paramètres → Appareils → Connecter un appareil, puis scannez ce QR.")
    qr_login = await client.qr_login()
    show_qr(qr_login.url)

    while True:
        try:
            await qr_login.wait(timeout=30)
            break
        except SessionPasswordNeededError:
            password = input("Mot de passe cloud Telegram : ")
            await client.sign_in(password=password)
            break
        except asyncio.TimeoutError:
            print("QR expiré. Nouveau QR, scannez celui-ci.")
            await qr_login.recreate()
            show_qr(qr_login.url)
        except Exception as e:
            name = type(e).__name__
            if "Expired" in name or "Token" in name:
                print("QR expiré. Nouveau QR, scannez celui-ci.")
                await qr_login.recreate()
                show_qr(qr_login.url)
                continue
            print(f"Connexion QR refusée : {e}")
            await client.disconnect()
            return

    me = await client.get_me()
    print(f"Connecté : {me.first_name} (@{me.username or 'sans pseudo'})")
    print(f"Fichier de session : {TELEGRAM_SESSION_PATH}.session")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
