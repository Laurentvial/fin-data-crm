"""
MTProto Telegram Group Creation Service

Creates Telegram supergroups via Telethon (Client API).
Requires a user account session (not a bot).
"""

import base64
import io
import logging
import os
import time
from dotenv import load_dotenv

load_dotenv()
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from telethon import TelegramClient
from telethon.errors import (
    FileReferenceInvalidError,
    PhotoInvalidError,
    SessionPasswordNeededError,
    UserNotMutualContactError,
    UserPrivacyRestrictedError,
)
from telethon.tl.functions.channels import CreateChannelRequest, EditPhotoRequest, InviteToChannelRequest
from telethon.tl.types import Channel, DocumentAttributeFilename, InputChatUploadedPhoto, InputUser, User
from telethon.utils import get_peer_id

logger = logging.getLogger(__name__)

API_SECRET_KEY = os.environ.get("API_SECRET_KEY", "")
TELEGRAM_API_ID = int(os.environ.get("TELEGRAM_API_ID", "0"))
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
TELEGRAM_SESSION_PATH = os.environ.get("TELEGRAM_SESSION_PATH", "telegram_session")

client: TelegramClient | None = None

# Pending auth: phone -> (client, timestamp). Cleaned up after 10 min.
_auth_pending: dict[str, tuple[TelegramClient, float]] = {}
_AUTH_TIMEOUT_SEC = 600


async def get_client() -> TelegramClient:
    global client
    if client is None:
        if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
            raise RuntimeError("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set")
        c = TelegramClient(
            TELEGRAM_SESSION_PATH,
            TELEGRAM_API_ID,
            TELEGRAM_API_HASH,
        )
        await c.connect()
        if not await c.is_user_authorized():
            await c.disconnect()
            raise RuntimeError(
                "Telegram session not authorized. Connectez-vous dans Paramètres → Connexion Telegram."
            )
        client = c
    return client


def verify_api_key(x_api_key: str | None) -> None:
    if not API_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="API_SECRET_KEY not configured",
        )
    if not x_api_key or x_api_key != API_SECRET_KEY:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key",
        )


async def _cleanup_expired_auth() -> None:
    now = time.time()
    expired = [p for p, (_, ts) in _auth_pending.items() if now - ts > _AUTH_TIMEOUT_SEC]
    for p in expired:
        entry = _auth_pending.pop(p, None)
        if entry:
            try:
                await entry[0].disconnect()
            except Exception:
                pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    global client
    if client:
        await client.disconnect()
        client = None
    for _, (c, _) in list(_auth_pending.items()):
        try:
            await c.disconnect()
        except Exception:
            pass
    _auth_pending.clear()


app = FastAPI(title="Telegram Group Service", lifespan=lifespan)


@app.get("/auth/status")
async def auth_status(x_api_key: str | None = Header(None)):
    verify_api_key(x_api_key)
    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        return {"authorized": False, "error": "TELEGRAM_API_ID/TELEGRAM_API_HASH non configurés"}
    try:
        tg = await get_client()
        me = await tg.get_me()
        return {
            "authorized": True,
            "user": {
                "first_name": me.first_name or "",
                "username": me.username or "",
                "phone": me.phone or "",
            },
        }
    except RuntimeError:
        return {"authorized": False}


@app.post("/auth/request-code")
async def auth_request_code(request: Request, x_api_key: str | None = Header(None)):
    verify_api_key(x_api_key)
    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        raise HTTPException(status_code=503, detail="TELEGRAM_API_ID/TELEGRAM_API_HASH non configurés")
    body = await request.json()
    phone = (body.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="phone requis")
    await _cleanup_expired_auth()
    if phone in _auth_pending:
        old_c, _ = _auth_pending.pop(phone)
        try:
            await old_c.disconnect()
        except Exception:
            pass
    auth_client = TelegramClient(
        TELEGRAM_SESSION_PATH,
        TELEGRAM_API_ID,
        TELEGRAM_API_HASH,
    )
    await auth_client.connect()
    if await auth_client.is_user_authorized():
        me = await auth_client.get_me()
        await auth_client.disconnect()
        return {
            "authorized": True,
            "user": {
                "first_name": me.first_name or "",
                "username": me.username or "",
                "phone": me.phone or "",
            },
        }
    try:
        await auth_client.send_code_request(phone)
        _auth_pending[phone] = (auth_client, time.time())
        return {"success": True, "message": "Code envoyé sur Telegram"}
    except Exception as e:
        await auth_client.disconnect()
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/confirm")
async def auth_confirm(request: Request, x_api_key: str | None = Header(None)):
    verify_api_key(x_api_key)
    body = await request.json()
    phone = (body.get("phone") or "").strip()
    code = (body.get("code") or "").strip()
    password = (body.get("password") or "").strip() or None
    if not phone or not code:
        raise HTTPException(status_code=400, detail="phone et code requis")
    await _cleanup_expired_auth()
    if phone not in _auth_pending:
        raise HTTPException(status_code=400, detail="Demandez d'abord un code (request-code)")
    auth_client, _ = _auth_pending.pop(phone)
    try:
        await auth_client.sign_in(phone, code, password=password)
        if not await auth_client.is_user_authorized():
            _auth_pending[phone] = (auth_client, time.time())
            raise HTTPException(status_code=400, detail="Code invalide ou expiré")
        me = await auth_client.get_me()
        await auth_client.disconnect()
        global client
        if client:
            await client.disconnect()
            client = None
        return {
            "success": True,
            "user": {
                "first_name": me.first_name or "",
                "username": me.username or "",
                "phone": me.phone or "",
            },
        }
    except SessionPasswordNeededError:
        _auth_pending[phone] = (auth_client, time.time())
        raise HTTPException(status_code=400, detail="password_required")
    except Exception as e:
        err_msg = str(e).lower()
        if "password" in err_msg or "2fa" in err_msg or "two" in err_msg:
            _auth_pending[phone] = (auth_client, time.time())
            raise HTTPException(status_code=400, detail="password_required")
        try:
            await auth_client.disconnect()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=str(e))


def _parse_users(body: dict) -> list[tuple[int, str | None]]:
    """Parse telegram_ids and optional usernames from request body."""
    users: list[tuple[int, str | None]] = []
    raw_ids = body.get("telegram_ids")
    raw_users = body.get("users")  # [{ telegram_id, telegram_username? }]
    if isinstance(raw_users, list):
        for u in raw_users:
            if isinstance(u, dict):
                tid = u.get("telegram_id")
                if tid is not None:
                    try:
                        users.append((int(tid), u.get("telegram_username") or None))
                    except (TypeError, ValueError):
                        pass
    if isinstance(raw_ids, list):
        usernames = body.get("telegram_usernames") or {}
        for tid in raw_ids:
            try:
                uid = int(tid)
                uname = usernames.get(uid) or usernames.get(str(uid)) if isinstance(usernames, dict) else None
                if (uid, uname) not in users:
                    users.append((uid, uname))
            except (TypeError, ValueError):
                pass
    return users


@app.post("/create-group")
async def create_group(request: Request, x_api_key: str | None = Header(None)):
    verify_api_key(x_api_key)
    body = await request.json()
    title = body.get("title")
    if not title or not isinstance(title, str):
        raise HTTPException(status_code=400, detail="title is required")
    title = str(title).strip()
    if not title:
        raise HTTPException(status_code=400, detail="title cannot be empty")

    users_to_invite = _parse_users(body)

    try:
        tg = await get_client()
        me = await tg.get_me()
        my_id = me.id if me else None
        if my_id is not None:
            users_to_invite = [(tid, uname) for tid, uname in users_to_invite if tid != my_id]

        result = await tg(CreateChannelRequest(
            title=title,
            about="",
            megagroup=True,
        ))
        chat_id = None
        channel = None
        for chat in result.chats:
            if isinstance(chat, Channel):
                chat_id = get_peer_id(chat)
                channel = chat
                break
        if chat_id is None or channel is None:
            raise HTTPException(
                status_code=500,
                detail="Could not extract chat_id from Telegram response",
            )

        invited: list[int] = []
        failed: list[dict] = []

        for telegram_id, username in users_to_invite:
            try:
                if username and str(username).strip().startswith("@"):
                    username = str(username).strip()[1:]
                user_entity = None
                try:
                    user_entity = await tg.get_entity(telegram_id)
                except Exception:
                    pass
                if user_entity is None and username:
                    try:
                        user_entity = await tg.get_entity(username)
                    except Exception:
                        pass
                if user_entity is None:
                    failed.append({"telegram_id": telegram_id, "telegram_username": username, "reason": "user_not_found"})
                    continue
                if not isinstance(user_entity, User):
                    failed.append({"telegram_id": telegram_id, "telegram_username": username, "reason": "invalid_entity"})
                    continue
                input_user = InputUser(user_entity.id, user_entity.access_hash)
                input_channel = await tg.get_input_entity(channel)
                await tg(InviteToChannelRequest(channel=input_channel, users=[input_user]))
                invited.append(telegram_id)
            except (UserNotMutualContactError, UserPrivacyRestrictedError) as e:
                failed.append({"telegram_id": telegram_id, "telegram_username": username, "reason": type(e).__name__})
            except Exception as e:
                failed.append({"telegram_id": telegram_id, "telegram_username": username, "reason": str(e)})

        logo_base64 = body.get("logo_base64")
        logo_content_type = body.get("logo_content_type")
        if logo_base64 and logo_content_type and isinstance(logo_base64, str) and isinstance(logo_content_type, str):
            try:
                decoded = base64.b64decode(logo_base64)
                if decoded:
                    input_channel = await tg.get_input_entity(channel)
                    uploaded_file = await tg.upload_file(io.BytesIO(decoded))
                    photo = InputChatUploadedPhoto(file=uploaded_file)
                    await tg(EditPhotoRequest(channel=input_channel, photo=photo))
            except (PhotoInvalidError, FileReferenceInvalidError) as e:
                logger.warning("Could not set group photo: %s", e)
            except Exception as e:
                logger.warning("Could not set group photo: %s", e)

        welcome_message = body.get("welcome_message")
        if welcome_message and isinstance(welcome_message, str) and welcome_message.strip():
            try:
                await tg.send_message(channel, welcome_message.strip())
            except Exception as e:
                logger.warning("Could not send welcome message: %s", e)

        kbis_base64 = body.get("kbis_base64")
        if kbis_base64 and isinstance(kbis_base64, str):
            try:
                decoded = base64.b64decode(kbis_base64)
                if decoded:
                    attrs = []
                    kbis_filename = body.get("kbis_filename")
                    if kbis_filename and isinstance(kbis_filename, str) and kbis_filename.strip():
                        attrs.append(DocumentAttributeFilename(kbis_filename.strip()))
                    await tg.send_file(
                        channel,
                        io.BytesIO(decoded),
                        caption="KBIS",
                        attributes=attrs if attrs else None,
                    )
            except Exception as e:
                logger.warning("Could not send KBIS file: %s", e)

        return {"chat_id": chat_id, "invited": invited, "failed": failed}
    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Impossible de créer le groupe Telegram: {e!s}",
        )
