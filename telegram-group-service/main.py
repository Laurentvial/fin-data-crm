"""
MTProto Telegram Group Creation Service

Creates Telegram supergroups via Telethon (Client API).
Requires a user account session (not a bot).
"""

import asyncio
import base64
import gc
import logging
import os
import tempfile
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.cors import CORSMiddleware
from telethon import TelegramClient
from telethon.errors import (
    FileReferenceInvalidError,
    FloodWaitError,
    PhotoInvalidError,
    SessionPasswordNeededError,
    UserAlreadyInvitedError,
    UserAlreadyParticipantError,
    UserNotMutualContactError,
    UserPrivacyRestrictedError,
)
from telethon.tl.functions.channels import (
    CreateChannelRequest,
    EditAdminRequest,
    EditPhotoRequest,
    InviteToChannelRequest,
)
from telethon.tl.types import (
    Channel,
    ChatAdminRights,
    DocumentAttributeFilename,
    InputChatUploadedPhoto,
    InputUser,
    User,
)
from telethon.utils import get_peer_id

# Shown when Telegram blocks the MTProto user from creating channels/supergroups.
_TELEGRAM_ACCOUNT_CANNOT_CREATE_GROUPS_FR = (
    "Telegram a restreint le compte utilisé par le serveur : il ne peut plus créer de groupes ou de supergroupes "
    "(souvent après un signalement pour spam). "
    "Que faire : (1) Paramètres de l’application (admin) → Session Telegram / création de groupes : reconnectez un autre numéro "
    "Telegram qui n’a pas cette limitation ; "
    "(2) Créez le groupe à la main avec un autre compte, puis à la création du compte bancaire cochez « Lier un groupe Telegram existant » "
    "et saisissez l’ID du groupe (ex. -100…) ; "
    "(3) Contacter le support Telegram depuis l’app si la restriction vous semble incorrecte."
)


def _is_telegram_create_channel_blocked(exc: BaseException) -> bool:
    s = str(exc).lower()
    if "spamreport" in s or "spam reported" in s:
        return True
    if "can't create channels" in s or "cannot create channels" in s:
        return True
    if "can't create chats" in s or "cannot create chats" in s:
        return True
    if "you can't create" in s and ("channel" in s or "chat" in s):
        return True
    return False

logger = logging.getLogger(__name__)

API_SECRET_KEY = os.environ.get("API_SECRET_KEY", "")
TELEGRAM_API_ID = int(os.environ.get("TELEGRAM_API_ID", "0"))
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
TELEGRAM_SESSION_PATH = os.environ.get("TELEGRAM_SESSION_PATH", "telegram_session")

client: TelegramClient | None = None


def _temp_dir() -> str:
    """Prefer persistent disk (e.g. Render /opt/data) so large uploads are not RAM-backed."""
    root = os.environ.get("TELEGRAM_TEMP_DIR", "").strip()
    if root and os.path.isdir(root):
        return root
    session_parent = Path(TELEGRAM_SESSION_PATH).resolve().parent
    return str(session_parent / "tmp")


def _max_kbis_decoded_bytes() -> int:
    try:
        n = int(os.environ.get("TELEGRAM_MAX_KBIS_DECODED_BYTES", "8388608"))
        return max(512_000, min(n, 40_000_000))
    except ValueError:
        return 8_388_608


def _max_logo_decoded_bytes() -> int:
    try:
        n = int(os.environ.get("TELEGRAM_MAX_LOGO_DECODED_BYTES", "2097152"))
        return max(50_000, min(n, 15_000_000))
    except ValueError:
        return 2_097_152


def _env_truthy(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def _write_temp_file(data: bytes, suffix: str) -> str:
    Path(_temp_dir()).mkdir(parents=True, exist_ok=True)
    fd, path = tempfile.mkstemp(suffix=suffix, dir=_temp_dir())
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
    except Exception:
        try:
            os.unlink(path)
        except OSError:
            pass
        raise
    return path


def _unlink_quiet(path: str | None) -> None:
    if not path:
        return
    try:
        os.unlink(path)
    except OSError:
        pass

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
                "Telegram session not authorized. Connectez-vous dans Paramètres → Session Telegram (création de groupes)."
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
    try:
        Path(_temp_dir()).mkdir(parents=True, exist_ok=True)
    except OSError as e:
        logger.warning("Could not create temp dir %s: %s", _temp_dir(), e)
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

# Quiet browser OPTIONS preflight when something wrongly targets this port (e.g. another app using :8000).
_cors_raw = os.environ.get("CORS_ALLOW_ORIGINS", "*").strip()
_cors_origins = ["*"] if _cors_raw == "*" else [o.strip() for o in _cors_raw.split(",") if o.strip()]
_cors_wildcard = _cors_origins == ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["*"],
    allow_credentials=not _cors_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_get():
    """Render and proxies expect a 2xx here; avoids 404 on GET /health."""
    return {"status": "ok"}


@app.head("/health")
async def health_head():
    return Response(status_code=200)


@app.get("/")
async def root_get():
    return {"service": "telegram-group-service", "status": "ok"}


@app.head("/")
async def root_head():
    """Many load balancers probe HEAD /; without this they get 404 and may mark the instance bad (502)."""
    return Response(status_code=200)


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


@app.post("/auth/logout")
async def auth_logout(x_api_key: str | None = Header(None)):
    verify_api_key(x_api_key)
    global client
    for _, (pending_client, _) in list(_auth_pending.items()):
        try:
            await pending_client.disconnect()
        except Exception:
            pass
    _auth_pending.clear()
    if client:
        try:
            await client.disconnect()
        except Exception:
            pass
        client = None

    session_base = Path(TELEGRAM_SESSION_PATH)
    parent = session_base.parent
    name = session_base.name
    main_session = parent / f"{name}.session"
    for p in list(parent.glob(f"{name}.session*")):
        try:
            p.unlink()
        except OSError as e:
            logger.warning("Could not remove session file %s: %s", p, e)
    if main_session.exists():
        raise HTTPException(
            status_code=500,
            detail="La session Telegram n'a pas pu être supprimée (fichier verrouillé ou permissions).",
        )
    return {"success": True}


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


def _invited_member_admin_rights() -> ChatAdminRights:
    """Minimal admin preset for members invited at creation: only add colleagues, no other admin powers."""
    return ChatAdminRights(invite_users=True)


async def _promote_invited_user_to_admin(
    tg: TelegramClient,
    input_channel,
    input_user: InputUser,
    telegram_id: int,
    username: str | None,
    admin_promote_failed: list[dict],
    max_flood_wait_sec: int,
) -> None:
    rights = _invited_member_admin_rights()
    await asyncio.sleep(0.4)
    try:
        await tg(
            EditAdminRequest(
                channel=input_channel,
                user_id=input_user,
                admin_rights=rights,
                rank="",
            )
        )
    except FloodWaitError as e:
        wait_sec = getattr(e, "seconds", None)
        if wait_sec is None:
            wait_sec = getattr(e, "value", 0) or 0
        if wait_sec <= max_flood_wait_sec:
            logger.info("FloodWait %ds for admin promotion, retrying...", wait_sec)
            await asyncio.sleep(wait_sec)
            try:
                await tg(
                    EditAdminRequest(
                        channel=input_channel,
                        user_id=input_user,
                        admin_rights=rights,
                        rank="",
                    )
                )
            except Exception as retry_err:
                logger.warning(
                    "Could not promote user %s to channel admin after FloodWait retry: %s",
                    telegram_id,
                    retry_err,
                )
                admin_promote_failed.append(
                    {
                        "telegram_id": telegram_id,
                        "telegram_username": username,
                        "reason": str(retry_err),
                    }
                )
        else:
            admin_promote_failed.append(
                {
                    "telegram_id": telegram_id,
                    "telegram_username": username,
                    "reason": f"FloodWaitError:{wait_sec}s",
                }
            )
            await asyncio.sleep(0.5)
    except Exception as e:
        logger.warning("Could not promote user %s to channel admin: %s", telegram_id, e)
        admin_promote_failed.append(
            {"telegram_id": telegram_id, "telegram_username": username, "reason": str(e)}
        )


async def _invite_bot_to_channel_by_username(
    tg: TelegramClient,
    input_channel,
    bot_username: str,
    max_flood_wait_sec: int,
) -> tuple[bool, str | None]:
    """Invite a bot to the megagroup by username (with or without @). Returns (success, error_detail)."""
    uname = bot_username.strip().lstrip("@")
    if not uname:
        return False, "empty_username"
    try:
        entity = await tg.get_entity(uname)
    except Exception as e:
        logger.warning("Could not resolve sync bot @%s: %s", uname, e)
        return False, str(e)
    if not isinstance(entity, User) or not getattr(entity, "bot", False):
        logger.warning("TELEGRAM_GROUP_SYNC_BOT_USERNAME %s is not a bot", uname)
        return False, "not_a_bot"

    input_bot = InputUser(entity.id, entity.access_hash)

    async def _do_invite() -> None:
        await tg(InviteToChannelRequest(channel=input_channel, users=[input_bot]))

    try:
        await _do_invite()
        return True, None
    except (UserAlreadyParticipantError, UserAlreadyInvitedError):
        return True, None
    except FloodWaitError as e:
        wait_sec = getattr(e, "seconds", None)
        if wait_sec is None:
            wait_sec = getattr(e, "value", 0) or 0
        if wait_sec <= max_flood_wait_sec:
            logger.info("FloodWait %ds for sync bot invite, retrying...", wait_sec)
            await asyncio.sleep(wait_sec)
            try:
                await _do_invite()
                return True, None
            except (UserAlreadyParticipantError, UserAlreadyInvitedError):
                return True, None
            except Exception as retry_err:
                logger.warning("Sync bot invite failed after FloodWait retry: %s", retry_err)
                return False, str(retry_err)
        logger.warning("Sync bot invite FloodWait too long: %ss", wait_sec)
        return False, f"FloodWaitError:{wait_sec}s"
    except Exception as e:
        logger.warning("Could not invite sync bot @%s: %s", uname, e)
        return False, str(e)


async def _send_base64_file_to_channel(
    tg: TelegramClient,
    channel: Channel,
    base64_data: str | None,
    filename_hint: str | None,
    caption: str,
) -> None:
    """Send one base64-encoded attachment (same decoded size cap as KBIS)."""
    if not base64_data or not isinstance(base64_data, str):
        return
    path: str | None = None
    try:
        max_kb = _max_kbis_decoded_bytes()
        if len(base64_data) > max_kb * 2:
            logger.warning(
                "%s: attachment base64 too large (%s chars); skip",
                caption,
                len(base64_data),
            )
            return
        decoded = base64.b64decode(base64_data)
        del base64_data
        if len(decoded) > max_kb:
            logger.warning(
                "%s: file %s bytes exceeds TELEGRAM_MAX_KBIS_DECODED_BYTES; skip",
                caption,
                len(decoded),
            )
            return
        if not decoded:
            return
        suffix = ".pdf"
        if filename_hint and isinstance(filename_hint, str) and filename_hint.strip():
            low = filename_hint.strip().lower()
            if low.endswith(".png"):
                suffix = ".png"
            elif low.endswith((".jpg", ".jpeg")):
                suffix = ".jpg"
            elif low.endswith(".pdf"):
                suffix = ".pdf"
        path = _write_temp_file(decoded, suffix=suffix)
        del decoded
        attrs = []
        if filename_hint and isinstance(filename_hint, str) and filename_hint.strip():
            attrs.append(DocumentAttributeFilename(filename_hint.strip()))
        await tg.send_file(
            channel,
            path,
            caption=caption,
            attributes=attrs if attrs else None,
        )
    except Exception as e:
        logger.warning("Could not send %s: %s", caption, e)
    finally:
        _unlink_quiet(path)
        gc.collect()


@app.post("/create-group")
async def create_group(request: Request, x_api_key: str | None = Header(None)):
    verify_api_key(x_api_key)
    body = await request.json()
    # Pop large fields early so references can be released after spilling to disk (avoids OOM on 512MB hosts).
    logo_base64 = body.pop("logo_base64", None)
    logo_content_type = body.pop("logo_content_type", None)
    kbis_base64 = body.pop("kbis_base64", None)
    body.pop("kbis_content_type", None)
    kbis_filename = body.pop("kbis_filename", None)
    pi_recto_base64 = body.pop("pi_recto_base64", None)
    pi_recto_filename = body.pop("pi_recto_filename", None)
    pi_verso_base64 = body.pop("pi_verso_base64", None)
    pi_verso_filename = body.pop("pi_verso_filename", None)

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

        # Group photo: spill to disk so we do not hold base64 + decoded + JPEG + BytesIO in RAM at once.
        if (
            logo_base64
            and logo_content_type
            and isinstance(logo_base64, str)
            and isinstance(logo_content_type, str)
        ):
            logger.info("Received logo: %d bytes base64, type=%s", len(logo_base64), logo_content_type)
            raw_path: str | None = None
            jpeg_path: str | None = None
            try:
                max_logo = _max_logo_decoded_bytes()
                if len(logo_base64) > max_logo * 2:
                    logger.warning("Logo base64 too large, skipping profile photo (reduce image or raise TELEGRAM_MAX_LOGO_DECODED_BYTES)")
                else:
                    decoded_logo = base64.b64decode(logo_base64)
                    del logo_base64
                    logo_base64 = None
                    if len(decoded_logo) > max_logo:
                        logger.warning(
                            "Logo decoded %s bytes exceeds TELEGRAM_MAX_LOGO_DECODED_BYTES, skipping profile photo",
                            len(decoded_logo),
                        )
                        del decoded_logo
                    elif decoded_logo:
                        raw_path = _write_temp_file(decoded_logo, suffix=".src")
                        del decoded_logo
                        try:
                            from PIL import Image

                            Image.MAX_IMAGE_PIXELS = 20_000_000
                            fd_j, jpeg_path = tempfile.mkstemp(suffix=".jpg", dir=_temp_dir())
                            os.close(fd_j)
                            with Image.open(raw_path) as img:
                                im = img
                                if im.mode in ("RGBA", "P"):
                                    im = im.convert("RGB")
                                elif im.mode != "RGB":
                                    im = im.convert("RGB")
                                im.thumbnail((512, 512), Image.LANCZOS)
                                w, h = im.size
                                if w != h:
                                    crop_size = min(w, h)
                                    left = (w - crop_size) // 2
                                    top = (h - crop_size) // 2
                                    im = im.crop((left, top, left + crop_size, top + crop_size))
                                im = im.resize((512, 512), Image.LANCZOS)
                                im.save(jpeg_path, format="JPEG", quality=92)
                        except Exception as conv_err:
                            logger.debug("PIL/JPEG encode failed, trying raw upload: %s", conv_err)
                            _unlink_quiet(jpeg_path)
                            jpeg_path = None
                            if raw_path:
                                ext = (
                                    "jpg"
                                    if "jpeg" in logo_content_type.lower() or "jpg" in logo_content_type.lower()
                                    else "png"
                                )
                                file_name = f"logo.{ext}"
                                await asyncio.sleep(1)
                                input_channel = await tg.get_input_entity(channel)
                                uploaded_file = await tg.upload_file(raw_path, file_name=file_name)
                                photo = InputChatUploadedPhoto(file=uploaded_file)
                                await tg(EditPhotoRequest(channel=input_channel, photo=photo))
                                logger.info("Group profile photo set (raw from disk)")
                        else:
                            _unlink_quiet(raw_path)
                            raw_path = None
                            await asyncio.sleep(1)
                            input_channel = await tg.get_input_entity(channel)
                            uploaded_file = await tg.upload_file(jpeg_path, file_name="logo.jpg")
                            photo = InputChatUploadedPhoto(file=uploaded_file)
                            await tg(EditPhotoRequest(channel=input_channel, photo=photo))
                            logger.info("Group profile photo set (JPEG from disk)")
            except (PhotoInvalidError, FileReferenceInvalidError) as e:
                logger.warning("Could not set group photo: %s", e)
            except Exception as e:
                logger.warning("Could not set group photo: %s", e)
            finally:
                _unlink_quiet(raw_path)
                _unlink_quiet(jpeg_path)
                gc.collect()
        else:
            logger.info(
                "No logo in request (logo_base64=%s, logo_content_type=%s)",
                bool(logo_base64),
                bool(logo_content_type),
            )

        invited: list[int] = []
        failed: list[dict] = []
        admin_promote_failed: list[dict] = []
        input_channel = await tg.get_input_entity(channel)
        max_flood_wait_sec = 60
        promote_admins = not _env_truthy("TELEGRAM_SKIP_ADMIN_PROMOTE_ON_INVITE")

        sync_bot_invited: bool | None = None
        sync_bot_skipped = False
        sync_bot_error: str | None = None
        sync_bot_uname = os.environ.get("TELEGRAM_GROUP_SYNC_BOT_USERNAME", "SYNC_RO_BOT").strip()
        if sync_bot_uname and not _env_truthy("TELEGRAM_SKIP_SYNC_BOT"):
            await asyncio.sleep(0.3)
            sync_bot_invited, sync_bot_error = await _invite_bot_to_channel_by_username(
                tg,
                input_channel,
                sync_bot_uname,
                max_flood_wait_sec,
            )
        else:
            sync_bot_skipped = True

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
                try:
                    await tg(InviteToChannelRequest(channel=input_channel, users=[input_user]))
                    invited.append(telegram_id)
                    if promote_admins:
                        await _promote_invited_user_to_admin(
                            tg,
                            input_channel,
                            input_user,
                            telegram_id,
                            username,
                            admin_promote_failed,
                            max_flood_wait_sec,
                        )
                except FloodWaitError as e:
                    wait_sec = getattr(e, "seconds", None)
                    if wait_sec is None:
                        wait_sec = getattr(e, "value", 0) or 0
                    if wait_sec <= max_flood_wait_sec:
                        logger.info("FloodWait %ds for invite, retrying...", wait_sec)
                        await asyncio.sleep(wait_sec)
                        await tg(InviteToChannelRequest(channel=input_channel, users=[input_user]))
                        invited.append(telegram_id)
                        if promote_admins:
                            await _promote_invited_user_to_admin(
                                tg,
                                input_channel,
                                input_user,
                                telegram_id,
                                username,
                                admin_promote_failed,
                                max_flood_wait_sec,
                            )
                    else:
                        failed.append({"telegram_id": telegram_id, "telegram_username": username, "reason": f"FloodWaitError:{wait_sec}s"})
                        await asyncio.sleep(0.5)
                await asyncio.sleep(1.5)
            except (UserNotMutualContactError, UserPrivacyRestrictedError) as e:
                failed.append({"telegram_id": telegram_id, "telegram_username": username, "reason": type(e).__name__})
                await asyncio.sleep(0.5)
            except Exception as e:
                failed.append({"telegram_id": telegram_id, "telegram_username": username, "reason": str(e)})
                await asyncio.sleep(0.5)

        welcome_message = body.get("welcome_message")
        if welcome_message and isinstance(welcome_message, str) and welcome_message.strip():
            try:
                await tg.send_message(channel, welcome_message.strip())
            except Exception as e:
                logger.warning("Could not send welcome message: %s", e)

        if (
            kbis_base64
            and isinstance(kbis_base64, str)
            and not _env_truthy("TELEGRAM_DISABLE_KBIS_ON_CREATE")
        ):
            kbis_path: str | None = None
            try:
                max_kb = _max_kbis_decoded_bytes()
                if len(kbis_base64) > max_kb * 2:
                    logger.warning(
                        "KBIS base64 too large (%s chars); skip attach (raise TELEGRAM_MAX_KBIS_DECODED_BYTES or use a smaller file)",
                        len(kbis_base64),
                    )
                else:
                    decoded_kbis = base64.b64decode(kbis_base64)
                    del kbis_base64
                    kbis_base64 = None
                    if len(decoded_kbis) > max_kb:
                        logger.warning(
                            "KBIS file %s bytes exceeds TELEGRAM_MAX_KBIS_DECODED_BYTES; skip attach to avoid OOM",
                            len(decoded_kbis),
                        )
                    elif decoded_kbis:
                        suffix = ".pdf"
                        if kbis_filename and isinstance(kbis_filename, str) and kbis_filename.strip():
                            low = kbis_filename.strip().lower()
                            if low.endswith(".png"):
                                suffix = ".png"
                            elif low.endswith((".jpg", ".jpeg")):
                                suffix = ".jpg"
                            elif low.endswith(".pdf"):
                                suffix = ".pdf"
                        kbis_path = _write_temp_file(decoded_kbis, suffix=suffix)
                        del decoded_kbis
                        attrs = []
                        if kbis_filename and isinstance(kbis_filename, str) and kbis_filename.strip():
                            attrs.append(DocumentAttributeFilename(kbis_filename.strip()))
                        await tg.send_file(
                            channel,
                            kbis_path,
                            caption="KBIS",
                            attributes=attrs if attrs else None,
                        )
            except Exception as e:
                logger.warning("Could not send KBIS file: %s", e)
            finally:
                _unlink_quiet(kbis_path)
                gc.collect()

        await _send_base64_file_to_channel(
            tg,
            channel,
            pi_recto_base64,
            pi_recto_filename,
            "Pièce d'identité recto",
        )
        await _send_base64_file_to_channel(
            tg,
            channel,
            pi_verso_base64,
            pi_verso_filename,
            "Pièce d'identité verso",
        )

        # String keeps full precision (Postgres bigint); JS JSON numbers are only safe up to 2^53-1.
        out: dict = {"chat_id": str(chat_id), "invited": invited, "failed": failed}
        if admin_promote_failed:
            out["admin_promote_failed"] = admin_promote_failed
        if sync_bot_skipped:
            out["sync_bot_skipped"] = True
        elif sync_bot_invited is not None:
            out["sync_bot_invited"] = sync_bot_invited
            if sync_bot_error:
                out["sync_bot_error"] = sync_bot_error
        return out
    except HTTPException:
        raise
    except RuntimeError as e:
        logger.exception("RuntimeError creating Telegram group")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Error creating Telegram group: %s", e)
        if _is_telegram_create_channel_blocked(e):
            raise HTTPException(
                status_code=403,
                detail=_TELEGRAM_ACCOUNT_CANNOT_CREATE_GROUPS_FR,
            )
        raise HTTPException(
            status_code=502,
            detail=f"Impossible de créer le groupe Telegram: {e!s}",
        )
