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
    ImageProcessFailedError,
    PeerFloodError,
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
    EditTitleRequest,
    InviteToChannelRequest,
)
from telethon.tl.functions.messages import (
    AddChatUserRequest,
    EditChatAdminRequest,
    EditChatPhotoRequest,
    EditChatTitleRequest,
    MigrateChatRequest,
)
from telethon.tl.types import (
    Channel,
    Chat,
    ChatAdminRights,
    DocumentAttributeFilename,
    InputUser,
    User,
)
from telethon.utils import get_input_channel, get_peer_id

# Shown when Telegram blocks the MTProto user from creating channels/supergroups.
_TELEGRAM_ACCOUNT_CANNOT_CREATE_GROUPS_FR = (
    "Telegram a restreint le compte utilisé par le serveur : il ne peut plus créer de groupes ou de supergroupes "
    "(souvent après un signalement pour spam). "
    "Il s’agit du numéro configuré pour la création automatique (session sur le serveur), pas forcément du compte "
    "avec lequel vous utilisez Telegram sur votre téléphone. "
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


def _env_int(name: str, default: int) -> int:
    try:
        raw = os.environ.get(name, "").strip()
        return int(raw) if raw else default
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        raw = os.environ.get(name, "").strip()
        return float(raw) if raw else default
    except ValueError:
        return default


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
                "id": me.id,
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
                "id": me.id,
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
                "id": me.id,
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


def _flood_wait_seconds(e: FloodWaitError) -> int:
    w = getattr(e, "seconds", None)
    if w is None:
        w = getattr(e, "value", 0) or 0
    return int(w)


def _is_already_participant_err(e: BaseException) -> bool:
    """Telegram may surface 'already in group' as dedicated errors or generic RPC text."""
    if isinstance(e, (UserAlreadyParticipantError, UserAlreadyInvitedError)):
        return True
    s = str(e).upper()
    return "USER_ALREADY_PARTICIPANT" in s or "USER_ALREADY_INVITED" in s


async def _resolve_group_for_link(tg: TelegramClient, eid: int) -> Channel | Chat:
    """
    Resolve a group for existing_chat_id: supergroup (Channel megagroup) or classic small group (Chat).

    Telegram often creates new groups as classic chats first; both are supported for linking.

    Accepts full peer id (-100… for supergroups, or negative id for classic chat) or positive channel_id
    (without -100) for supergroups.
    """
    # Positive IDs are ambiguous: the same number can be resolved as a legacy basic Chat or as a
    # megagroup internal channel id. Try -100… megagroup peer first so supergroups are not mistaken
    # for basic chats (AddChatUserRequest would then fail on megagroups).
    #
    # Negative IDs without the -100 prefix (e.g. -2345678901 from a bot export) are treated as
    # PeerChat → GetChatsRequest; for a supergroup that fails with "Invalid object ID for a chat".
    # Retry as megagroup peer -(10**12 + abs(id)) (full -100… form).
    candidates: list[int] = []
    if eid > 0:
        alt = -(10**12 + eid)
        if alt != eid:
            candidates.append(alt)
        candidates.append(eid)
    else:
        candidates.append(eid)
        inner = -eid
        if inner < 10**12:
            alt_mg = -(10**12 + inner)
            if alt_mg != eid:
                candidates.append(alt_mg)
    last_err: BaseException | None = None
    for cand in candidates:
        try:
            ent = await tg.get_entity(cand)
        except Exception as e:
            last_err = e
            logger.debug("get_entity(%s) failed: %s", cand, e)
            continue
        if isinstance(ent, User):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Cet identifiant correspond à un compte utilisateur Telegram, pas à un groupe. "
                    "Utilisez l'ID du groupe (supergroupe : -100… ; petit groupe : souvent un entier négatif sans -100)."
                ),
            )
        if isinstance(ent, Chat):
            logger.info(
                "Linked existing classic chat id=%s peer_id=%s (Telegram may upgrade it to -100… later)",
                ent.id,
                get_peer_id(ent),
            )
            return ent
        if isinstance(ent, Channel):
            if getattr(ent, "broadcast", False) and not getattr(ent, "megagroup", False):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Il s'agit d'une chaîne de diffusion, pas d'un groupe. "
                        "Liez un groupe (ou supergroupe), pas une chaîne."
                    ),
                )
            if not getattr(ent, "megagroup", False):
                raise HTTPException(
                    status_code=400,
                    detail="Le CRM attend un supergroupe (mégagroupe) ou un groupe classique, pas ce type de canal.",
                )
            logger.info(
                "Linked existing megagroup resolved from id candidate %s → peer_id %s",
                cand,
                get_peer_id(ent),
            )
            return ent
        raise HTTPException(
            status_code=400,
            detail=f"Type de conversation non pris en charge : {type(ent).__name__}.",
        )
    detail_extra = f" Détail : {last_err!s}" if last_err else ""
    raise HTTPException(
        status_code=400,
        detail=(
            "Impossible d'accéder à ce groupe avec la session Telegram du serveur. "
            "Vérifiez l'ID et ajoutez le compte de la session serveur comme administrateur du groupe. "
            f"{detail_extra}"
        ),
    )


async def _apply_group_display_name(
    tg: TelegramClient,
    group_entity: Channel | Chat,
    is_classic_chat: bool,
    input_channel,
    display_title: str,
) -> None:
    """Set Telegram group title (megagroup / basic chat). Skips empty or placeholder titles."""
    t = (display_title or "").strip()
    if not t or t == "—":
        return
    if len(t) > 255:
        t = t[:255]
    try:
        if is_classic_chat:
            await tg(EditChatTitleRequest(group_entity.id, t))
        else:
            await tg(EditTitleRequest(channel=input_channel, title=t))
        logger.info("Group display title set (%d chars)", len(t))
    except Exception as e:
        logger.warning("Could not set group title: %s", e)


async def _elevate_migrated_basic_group(tg: TelegramClient, ent: Channel | Chat) -> Channel | Chat:
    """
    A legacy basic group (Chat) that was upgraded to a supergroup still appears as Chat with
    migrated_to set. Chat-only RPCs (EditChatPhoto, etc.) and some peers then fail on the server.
    Resolve the megagroup Channel and use it for the rest of the flow.
    """
    if not isinstance(ent, Chat):
        return ent
    migrated = getattr(ent, "migrated_to", None)
    if migrated is None or migrated is False:
        return ent
    try:
        ch = await tg.get_entity(migrated)
    except Exception as e:
        logger.warning("Chat %s has migrated_to but supergroup could not be loaded: %s", ent.id, e)
        return ent
    if isinstance(ch, Channel) and getattr(ch, "megagroup", False):
        logger.info(
            "Basic group %s was upgraded; using supergroup peer_id=%s",
            ent.id,
            get_peer_id(ch),
        )
        return ch
    return ent


async def _upgrade_basic_group_to_supergroup_if_requested(
    tg: TelegramClient,
    ent: Channel | Chat,
    *,
    upgrade_requested: bool,
) -> Channel | Chat:
    """
    If upgrade_requested and the entity is a classic Chat, ask Telegram to migrate it to a supergroup.
    Returns a Channel entity when migration succeeds, otherwise returns the original entity.
    """
    if not upgrade_requested:
        return ent
    if not isinstance(ent, Chat):
        return ent
    migrated = getattr(ent, "migrated_to", None)
    if migrated is not None and migrated is not False:
        return await _elevate_migrated_basic_group(tg, ent)
    try:
        mig_res = await tg(MigrateChatRequest(ent.id))
    except Exception as e:
        # Common causes: not admin / Telegram restrictions.
        logger.warning("Could not migrate basic chat %s to supergroup: %s", ent.id, e)
        return ent
    # After migration, refresh from Telegram: the old `ent` object is stale and will not have
    # `migrated_to` set locally, so elevation would otherwise be a no-op.
    try:
        chats = getattr(mig_res, "chats", None)
        if isinstance(chats, list):
            for ch in chats:
                if isinstance(ch, Channel) and getattr(ch, "megagroup", False):
                    return ch
    except Exception as e:
        logger.debug("Could not extract migrated channel from MigrateChatRequest response: %s", e)

    try:
        refreshed = await tg.get_entity(get_peer_id(ent))
    except Exception as e:
        logger.debug("Could not refresh chat entity after migration: %s", e)
        return ent
    return await _elevate_migrated_basic_group(tg, refreshed)


async def _promote_invited_user_to_admin(
    tg: TelegramClient,
    input_channel,
    input_user: InputUser,
    telegram_id: int,
    username: str | None,
    admin_promote_failed: list[dict],
    max_flood_wait_sec: int,
    delay_before_sec: float,
) -> None:
    rights = _invited_member_admin_rights()
    await asyncio.sleep(delay_before_sec)
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
        wait_sec = _flood_wait_seconds(e)
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


async def _invite_single_to_channel(
    tg: TelegramClient,
    input_channel,
    input_user: InputUser,
    telegram_id: int,
    username: str | None,
    invited: list[int],
    failed: list[dict],
    max_flood_wait_sec: int,
    pause_after: float,
) -> None:
    """
    One user per InviteToChannel (fallback when batch fails).

    Telegram often surfaces invite rate limits as PeerFloodError ('Too many requests') rather than
    FloodWaitError; retry with backoff (same env as classic groups: TELEGRAM_PEER_FLOOD_RETRY_SEC).
    """
    peer_flood_pause = max(25.0, _env_float("TELEGRAM_PEER_FLOOD_RETRY_SEC", 75.0))
    max_peer_flood_attempts = max(1, min(12, _env_int("TELEGRAM_PEER_FLOOD_INVITE_ATTEMPTS", 4)))

    for attempt in range(max_peer_flood_attempts):
        if attempt > 0:
            logger.info(
                "Megagroup invite rate limit (PeerFlood/backoff), sleeping %.0fs (attempt %s/%s, id=%s)",
                peer_flood_pause,
                attempt + 1,
                max_peer_flood_attempts,
                telegram_id,
            )
            await asyncio.sleep(peer_flood_pause)
        try:
            await tg(InviteToChannelRequest(channel=input_channel, users=[input_user]))
            invited.append(telegram_id)
            break
        except (UserAlreadyParticipantError, UserAlreadyInvitedError):
            invited.append(telegram_id)
            break
        except PeerFloodError:
            if attempt >= max_peer_flood_attempts - 1:
                failed.append(
                    {
                        "telegram_id": telegram_id,
                        "telegram_username": username,
                        "reason": (
                            "PeerFloodError: trop d’invitations en peu de temps. "
                            "Réessayez plus tard ou augmentez TELEGRAM_PEER_FLOOD_RETRY_SEC / "
                            "TELEGRAM_DELAY_BETWEEN_SINGLE_INVITES_SEC."
                        ),
                    }
                )
            continue
        except FloodWaitError as e:
            ws = _flood_wait_seconds(e)
            if ws <= max_flood_wait_sec:
                logger.info("FloodWait %ds for single channel invite, retrying...", ws)
                await asyncio.sleep(ws)
                try:
                    await tg(InviteToChannelRequest(channel=input_channel, users=[input_user]))
                    invited.append(telegram_id)
                except (UserAlreadyParticipantError, UserAlreadyInvitedError):
                    invited.append(telegram_id)
                except Exception as ex:
                    if _is_already_participant_err(ex):
                        invited.append(telegram_id)
                    else:
                        failed.append(
                            {
                                "telegram_id": telegram_id,
                                "telegram_username": username,
                                "reason": str(ex),
                            }
                        )
            else:
                failed.append(
                    {
                        "telegram_id": telegram_id,
                        "telegram_username": username,
                        "reason": f"FloodWaitError:{ws}s",
                    }
                )
            break
        except (UserNotMutualContactError, UserPrivacyRestrictedError) as e:
            failed.append(
                {"telegram_id": telegram_id, "telegram_username": username, "reason": type(e).__name__}
            )
            break
        except Exception as e:
            if _is_already_participant_err(e):
                invited.append(telegram_id)
            else:
                failed.append({"telegram_id": telegram_id, "telegram_username": username, "reason": str(e)})
            break

    await asyncio.sleep(pause_after)


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
        wait_sec = _flood_wait_seconds(e)
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


async def _invite_bot_to_basic_chat(
    tg: TelegramClient,
    chat_id: int,
    bot_username: str,
    max_flood_wait_sec: int,
) -> tuple[bool, str | None]:
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
        await tg(AddChatUserRequest(chat_id, input_bot, 0))

    try:
        await _do_invite()
        return True, None
    except (UserAlreadyParticipantError, UserAlreadyInvitedError):
        return True, None
    except FloodWaitError as e:
        wait_sec = _flood_wait_seconds(e)
        if wait_sec <= max_flood_wait_sec:
            logger.info("FloodWait %ds for sync bot add (classic chat), retrying...", wait_sec)
            await asyncio.sleep(wait_sec)
            try:
                await _do_invite()
                return True, None
            except (UserAlreadyParticipantError, UserAlreadyInvitedError):
                return True, None
            except Exception as retry_err:
                logger.warning("Sync bot add (classic chat) failed after FloodWait retry: %s", retry_err)
                return False, str(retry_err)
        logger.warning("Sync bot add (classic chat) FloodWait too long: %ss", wait_sec)
        return False, f"FloodWaitError:{wait_sec}s"
    except Exception as e:
        logger.warning("Could not add sync bot @%s to classic chat: %s", uname, e)
        return False, str(e)


async def _invite_single_to_basic_chat(
    tg: TelegramClient,
    chat_id: int,
    input_user: InputUser,
    telegram_id: int,
    username: str | None,
    invited: list[int],
    failed: list[dict],
    max_flood_wait_sec: int,
    pause_after: float,
) -> None:
    """AddChatUserRequest is heavily rate-limited; PeerFloodError = 'Too many requests' with no seconds hint."""
    peer_flood_pause = max(25.0, _env_float("TELEGRAM_PEER_FLOOD_RETRY_SEC", 75.0))
    max_attempts = max(1, min(12, _env_int("TELEGRAM_PEER_FLOOD_INVITE_ATTEMPTS", 4)))

    for attempt in range(max_attempts):
        if attempt > 0:
            logger.info(
                "Classic chat invite rate limit, sleeping %.0fs (attempt %s/%s)",
                peer_flood_pause,
                attempt + 1,
                max_attempts,
            )
            await asyncio.sleep(peer_flood_pause)
        try:
            await tg(AddChatUserRequest(chat_id, input_user, 0))
            invited.append(telegram_id)
            break
        except (UserAlreadyParticipantError, UserAlreadyInvitedError):
            invited.append(telegram_id)
            break
        except PeerFloodError:
            if attempt >= max_attempts - 1:
                failed.append(
                    {
                        "telegram_id": telegram_id,
                        "telegram_username": username,
                        "reason": "PeerFloodError: Too many requests (espacer les invitations : TELEGRAM_DELAY_CLASSIC_CHAT_INVITE_SEC, TELEGRAM_DELAY_BEFORE_EACH_CLASSIC_INVITE_SEC, TELEGRAM_PEER_FLOOD_RETRY_SEC).",
                    }
                )
            continue
        except FloodWaitError as e:
            ws = _flood_wait_seconds(e)
            if ws <= max_flood_wait_sec:
                logger.info("FloodWait %ds for classic chat invite, retrying...", ws)
                await asyncio.sleep(ws)
                try:
                    await tg(AddChatUserRequest(chat_id, input_user, 0))
                    invited.append(telegram_id)
                except (UserAlreadyParticipantError, UserAlreadyInvitedError):
                    invited.append(telegram_id)
                except Exception as ex:
                    if _is_already_participant_err(ex):
                        invited.append(telegram_id)
                    else:
                        failed.append(
                            {
                                "telegram_id": telegram_id,
                                "telegram_username": username,
                                "reason": str(ex),
                            }
                        )
            else:
                failed.append(
                    {
                        "telegram_id": telegram_id,
                        "telegram_username": username,
                        "reason": f"FloodWaitError:{ws}s",
                    }
                )
            break
        except (UserNotMutualContactError, UserPrivacyRestrictedError) as e:
            failed.append(
                {"telegram_id": telegram_id, "telegram_username": username, "reason": type(e).__name__}
            )
            break
        except Exception as e:
            if _is_already_participant_err(e):
                invited.append(telegram_id)
            else:
                failed.append({"telegram_id": telegram_id, "telegram_username": username, "reason": str(e)})
            break

    await asyncio.sleep(pause_after)


async def _promote_invited_user_basic_chat(
    tg: TelegramClient,
    chat_id: int,
    input_user: InputUser,
    telegram_id: int,
    username: str | None,
    admin_promote_failed: list[dict],
    max_flood_wait_sec: int,
    delay_before_sec: float,
) -> None:
    """Classic Chat: admin is binary (no channel-style granular rights in this API)."""
    await asyncio.sleep(delay_before_sec)
    try:
        await tg(EditChatAdminRequest(chat_id, input_user, is_admin=True))
    except FloodWaitError as e:
        wait_sec = _flood_wait_seconds(e)
        if wait_sec <= max_flood_wait_sec:
            logger.info("FloodWait %ds for classic chat admin, retrying...", wait_sec)
            await asyncio.sleep(wait_sec)
            try:
                await tg(EditChatAdminRequest(chat_id, input_user, is_admin=True))
            except Exception as retry_err:
                logger.warning(
                    "Could not promote user %s in classic chat after FloodWait retry: %s",
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
        logger.warning("Could not promote user %s in classic chat: %s", telegram_id, e)
        admin_promote_failed.append(
            {"telegram_id": telegram_id, "telegram_username": username, "reason": str(e)}
        )


async def _send_base64_file_to_channel(
    tg: TelegramClient,
    peer: Channel | Chat,
    base64_data: str | None,
    filename_hint: str | None,
    caption: str,
) -> bool:
    """Send one base64-encoded attachment (same decoded size cap as KBIS). Returns True if sent."""
    if not base64_data or not isinstance(base64_data, str):
        return False
    path: str | None = None
    try:
        max_kb = _max_kbis_decoded_bytes()
        if len(base64_data) > max_kb * 2:
            logger.warning(
                "%s: attachment base64 too large (%s chars); skip",
                caption,
                len(base64_data),
            )
            return False
        decoded = base64.b64decode(base64_data)
        del base64_data
        if len(decoded) > max_kb:
            logger.warning(
                "%s: file %s bytes exceeds TELEGRAM_MAX_KBIS_DECODED_BYTES; skip",
                caption,
                len(decoded),
            )
            return False
        if not decoded:
            return False
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
            peer,
            path,
            caption=caption,
            attributes=attrs if attrs else None,
        )
        return True
    except Exception as e:
        logger.warning("Could not send %s: %s", caption, e)
        return False
    finally:
        _unlink_quiet(path)
        gc.collect()


def _normalize_logo_for_telegram_group_photo(src_path: str):
    """
    Telegram often returns IMAGE_PROCESS_FAILED (ImageProcessFailedError) for odd JPEGs
    (progressive, subsampling, metadata). We output a plain 640×640 RGB image.
    """
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = 20_000_000
    target = 640
    with Image.open(src_path) as img:
        im = img
        if im.mode == "P":
            im = im.convert("RGBA")
        if im.mode == "RGBA":
            background = Image.new("RGB", im.size, (255, 255, 255))
            background.paste(im, mask=im.split()[3])
            im = background
        else:
            im = im.convert("RGB")
        flat = Image.new("RGB", im.size)
        flat.paste(im)
        im = flat
        im.thumbnail((target, target), Image.LANCZOS)
        w, h = im.size
        if w != h:
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            im = im.crop((left, top, left + side, top + side))
        if im.size != (target, target):
            im = im.resize((target, target), Image.LANCZOS)
        return im.copy()


def _merge_logo_result_into_response(out: dict, logo_result: dict) -> None:
    """Attach logo_applied / logo_error so the CRM can show real success or failure."""
    st = logo_result.get("status")
    if st == "none":
        return
    if st == "applied":
        out["logo_applied"] = True
        return
    out["logo_applied"] = False
    reason = logo_result.get("reason")
    out["logo_error"] = reason if isinstance(reason, str) and reason.strip() else "Photo du groupe non mise à jour."


async def _apply_group_logo_from_base64(
    tg: TelegramClient,
    group_entity: Channel | Chat,
    is_classic_chat: bool,
    logo_base64: str | None,
    logo_content_type: str | None,
) -> dict:
    """
    Returns a dict with status: none | applied | skipped | failed.
    Previously failures were only logged; the API still returned 200, so the CRM showed a false success.
    """
    chat_internal_id = group_entity.id if is_classic_chat else None
    if not (
        logo_base64
        and logo_content_type
        and isinstance(logo_base64, str)
        and isinstance(logo_content_type, str)
    ):
        logger.info(
            "No logo in request (logo_base64=%s, logo_content_type=%s)",
            bool(logo_base64),
            bool(logo_content_type),
        )
        return {"status": "none"}

    b64 = logo_base64.strip()
    ct = logo_content_type.strip()
    if not b64:
        return {"status": "skipped", "reason": "Logo vide."}

    logger.info("Received logo: %d bytes base64, type=%s", len(b64), ct)
    raw_path: str | None = None
    jpeg_path: str | None = None
    png_path: str | None = None
    try:
        max_logo = _max_logo_decoded_bytes()
        if len(b64) > max_logo * 2:
            return {
                "status": "skipped",
                "reason": (
                    "Image trop volumineuse (base64). Réduisez le fichier ou augmentez "
                    "TELEGRAM_MAX_LOGO_DECODED_BYTES sur le service Telegram."
                ),
            }

        try:
            decoded_logo = base64.b64decode(b64, validate=False)
        except Exception as e:
            return {"status": "failed", "reason": f"Base64 invalide : {e!s}"}

        if len(decoded_logo) > max_logo:
            return {
                "status": "skipped",
                "reason": (
                    f"Image décodée trop grande ({len(decoded_logo)} o, max {max_logo}). "
                    "Réduisez le logo ou augmentez TELEGRAM_MAX_LOGO_DECODED_BYTES."
                ),
            }
        if not decoded_logo:
            return {"status": "skipped", "reason": "Logo décodé vide."}

        raw_path = _write_temp_file(decoded_logo, suffix=".src")
        del decoded_logo

        async def _set_photo_from_file(path: str, file_name: str) -> None:
            await asyncio.sleep(0.75)
            uploaded_file = await tg.upload_file(path, file_name=file_name)
            if is_classic_chat:
                await tg(EditChatPhotoRequest(chat_internal_id, uploaded_file))
            else:
                channel_arg = get_input_channel(await tg.get_input_entity(group_entity))
                await tg(EditPhotoRequest(channel=channel_arg, photo=uploaded_file))

        async def _upload_normalized_jpeg_then_png() -> None:
            assert jpeg_path and png_path
            try:
                await _set_photo_from_file(jpeg_path, "logo.jpg")
            except ImageProcessFailedError as e:
                logger.warning("Telegram IMAGE_PROCESS_FAILED on JPEG, retrying as PNG: %s", e)
                await _set_photo_from_file(png_path, "logo.png")

        try:
            im = _normalize_logo_for_telegram_group_photo(raw_path)
            fd_j, jpeg_path = tempfile.mkstemp(suffix=".jpg", dir=_temp_dir())
            os.close(fd_j)
            fd_p, png_path = tempfile.mkstemp(suffix=".png", dir=_temp_dir())
            os.close(fd_p)
            im.save(
                jpeg_path,
                format="JPEG",
                quality=87,
                optimize=False,
                progressive=False,
                subsampling=0,
            )
            im.save(png_path, format="PNG", compress_level=6)
        except Exception as conv_err:
            logger.debug("PIL normalize/save failed, trying raw upload: %s", conv_err)
            _unlink_quiet(jpeg_path)
            _unlink_quiet(png_path)
            jpeg_path = None
            png_path = None
            try:
                if raw_path:
                    ext = (
                        "jpg"
                        if "jpeg" in ct.lower() or "jpg" in ct.lower()
                        else "png"
                    )
                    file_name = f"logo.{ext}"
                    await _set_photo_from_file(raw_path, file_name)
                    logger.info("Group profile photo set (raw from disk)")
                    return {"status": "applied"}
            except ImageProcessFailedError as e:
                logger.warning("Could not set group photo (raw, image process): %s", e)
                return {
                    "status": "failed",
                    "reason": (
                        "Telegram n'a pas accepté le fichier image brut. "
                        "Ré-enregistrez le logo en JPG ou PNG simple (évitez WebP/SVG côté banque si possible)."
                    ),
                }
            except (PhotoInvalidError, FileReferenceInvalidError) as e:
                logger.warning("Could not set group photo (raw): %s", e)
                return {"status": "failed", "reason": str(e)}
            except Exception as e:
                logger.warning("Could not set group photo (raw): %s", e)
                return {"status": "failed", "reason": str(e)}
            return {
                "status": "failed",
                "reason": f"Conversion image impossible : {conv_err!s}",
            }

        _unlink_quiet(raw_path)
        raw_path = None
        try:
            await _upload_normalized_jpeg_then_png()
            logger.info("Group profile photo set (normalized upload)")
            return {"status": "applied"}
        except ImageProcessFailedError as e:
            logger.warning("Could not set group photo (Telegram rejected JPEG and PNG): %s", e)
            return {
                "status": "failed",
                "reason": (
                    "Telegram n'a pas pu traiter l'image (IMAGE_PROCESS_FAILED). "
                    "Essayez une autre image (JPG/PNG carré, évitez les fichiers très compressés ou exotiques)."
                ),
            }
        except (PhotoInvalidError, FileReferenceInvalidError) as e:
            logger.warning("Could not set group photo: %s", e)
            return {"status": "failed", "reason": str(e)}
        except Exception as e:
            logger.warning("Could not set group photo: %s", e)
            return {"status": "failed", "reason": str(e)}
    finally:
        _unlink_quiet(raw_path)
        _unlink_quiet(jpeg_path)
        _unlink_quiet(png_path)
        gc.collect()


async def _invite_and_promote_users_in_group(
    tg: TelegramClient,
    group_entity: Channel | Chat,
    is_classic_chat: bool,
    input_channel,
    users_to_invite: list[tuple[int, str | None]],
    *,
    promote_admins: bool,
    run_sync_bot: bool,
) -> dict:
    invited: list[int] = []
    failed: list[dict] = []
    admin_promote_failed: list[dict] = []
    max_flood_wait_sec = max(30, _env_int("TELEGRAM_MAX_FLOOD_WAIT_RETRY_SEC", 600))
    invite_batch_size = max(1, min(50, _env_int("TELEGRAM_INVITE_BATCH_SIZE", 5)))
    delay_after_invite_batch = max(1.0, _env_float("TELEGRAM_DELAY_AFTER_INVITE_BATCH_SEC", 5.0))
    delay_between_resolve = max(0.2, _env_float("TELEGRAM_DELAY_BETWEEN_RESOLVE_SEC", 0.9))
    delay_before_invite_batch = max(0.5, _env_float("TELEGRAM_DELAY_BEFORE_INVITE_BATCH_SEC", 2.0))
    delay_single_invite = max(3.0, _env_float("TELEGRAM_DELAY_BETWEEN_SINGLE_INVITES_SEC", 8.0))
    delay_before_each_classic = max(3.0, _env_float("TELEGRAM_DELAY_BEFORE_EACH_CLASSIC_INVITE_SEC", 10.0))
    pause_after_classic_invite = max(
        delay_single_invite,
        _env_float("TELEGRAM_DELAY_CLASSIC_CHAT_INVITE_SEC", 14.0),
    )
    delay_before_promote = max(0.5, _env_float("TELEGRAM_DELAY_BEFORE_ADMIN_PROMOTE_SEC", 3.0))
    delay_after_promote = max(0.5, _env_float("TELEGRAM_DELAY_AFTER_ADMIN_PROMOTE_SEC", 6.0))

    sync_bot_invited: bool | None = None
    sync_bot_skipped = False
    sync_bot_error: str | None = None
    sync_bot_uname = os.environ.get("TELEGRAM_GROUP_SYNC_BOT_USERNAME", "SYNC_RO_BOT").strip()
    if sync_bot_uname and run_sync_bot and not _env_truthy("TELEGRAM_SKIP_SYNC_BOT"):
        await asyncio.sleep(0.3)
        if is_classic_chat:
            sync_bot_invited, sync_bot_error = await _invite_bot_to_basic_chat(
                tg,
                group_entity.id,
                sync_bot_uname,
                max_flood_wait_sec,
            )
        else:
            sync_bot_invited, sync_bot_error = await _invite_bot_to_channel_by_username(
                tg,
                input_channel,
                sync_bot_uname,
                max_flood_wait_sec,
            )
    else:
        sync_bot_skipped = True

    resolved: list[tuple[int, str | None, InputUser]] = []
    for telegram_id, username in users_to_invite:
        un = username
        if un and str(un).strip().startswith("@"):
            un = str(un).strip()[1:]
        user_entity = None
        try:
            user_entity = await tg.get_entity(telegram_id)
        except Exception:
            pass
        if user_entity is None and un:
            try:
                user_entity = await tg.get_entity(un)
            except Exception:
                pass
        if user_entity is None:
            failed.append({"telegram_id": telegram_id, "telegram_username": username, "reason": "user_not_found"})
            await asyncio.sleep(delay_between_resolve)
            continue
        if not isinstance(user_entity, User):
            failed.append({"telegram_id": telegram_id, "telegram_username": un, "reason": "invalid_entity"})
            await asyncio.sleep(delay_between_resolve)
            continue
        resolved.append((telegram_id, un, InputUser(user_entity.id, user_entity.access_hash)))
        await asyncio.sleep(delay_between_resolve)

    if is_classic_chat:
        cid = group_entity.id
        for telegram_id, uname, input_user in resolved:
            await asyncio.sleep(delay_before_each_classic)
            await _invite_single_to_basic_chat(
                tg,
                cid,
                input_user,
                telegram_id,
                uname,
                invited,
                failed,
                max_flood_wait_sec,
                pause_after_classic_invite,
            )
            if promote_admins and telegram_id in invited:
                await _promote_invited_user_basic_chat(
                    tg,
                    cid,
                    input_user,
                    telegram_id,
                    uname,
                    admin_promote_failed,
                    max_flood_wait_sec,
                    delay_before_promote,
                )
                await asyncio.sleep(delay_after_promote)
    else:
        for i in range(0, len(resolved), invite_batch_size):
            batch = resolved[i : i + invite_batch_size]
            await asyncio.sleep(delay_before_invite_batch)
            users_inputs: list[InputUser] = [t[2] for t in batch]
            batch_ok = False
            try:
                await tg(InviteToChannelRequest(channel=input_channel, users=users_inputs))
                for tid, _, _ in batch:
                    invited.append(tid)
                batch_ok = True
            except (UserAlreadyParticipantError, UserAlreadyInvitedError):
                for tid, _, _ in batch:
                    invited.append(tid)
                batch_ok = True
            except FloodWaitError as e:
                ws = _flood_wait_seconds(e)
                if ws <= max_flood_wait_sec:
                    logger.info("FloodWait %ds for invite batch, retrying...", ws)
                    await asyncio.sleep(ws)
                    try:
                        await tg(InviteToChannelRequest(channel=input_channel, users=users_inputs))
                        for tid, _, _ in batch:
                            invited.append(tid)
                        batch_ok = True
                    except Exception as retry_err:
                        if _is_already_participant_err(retry_err):
                            for tid, _, _ in batch:
                                invited.append(tid)
                            batch_ok = True
                        else:
                            logger.warning("Invite batch retry failed: %s", retry_err)
                else:
                    logger.warning("Invite batch FloodWait %ds (> max retry %ds)", ws, max_flood_wait_sec)
            except PeerFloodError:
                pf = max(25.0, _env_float("TELEGRAM_PEER_FLOOD_RETRY_SEC", 75.0))
                logger.info(
                    "Invite batch PeerFlood (too many requests), sleeping %.0fs then one retry",
                    pf,
                )
                await asyncio.sleep(pf)
                try:
                    await tg(InviteToChannelRequest(channel=input_channel, users=users_inputs))
                    for tid, _, _ in batch:
                        invited.append(tid)
                    batch_ok = True
                except Exception as retry_err:
                    if _is_already_participant_err(retry_err):
                        for tid, _, _ in batch:
                            invited.append(tid)
                        batch_ok = True
                    else:
                        logger.info(
                            "Invite batch still rate-limited after backoff (%s), using per-user invites",
                            retry_err,
                        )
            except Exception as e:
                if _is_already_participant_err(e):
                    for tid, _, _ in batch:
                        invited.append(tid)
                    batch_ok = True
                else:
                    logger.info("Invite batch failed (%s), using per-user invites", e)

            if not batch_ok:
                for telegram_id, uname, input_user in batch:
                    await _invite_single_to_channel(
                        tg,
                        input_channel,
                        input_user,
                        telegram_id,
                        uname,
                        invited,
                        failed,
                        max_flood_wait_sec,
                        delay_single_invite,
                    )

            await asyncio.sleep(delay_after_invite_batch)

            if promote_admins:
                for telegram_id, uname, input_user in batch:
                    if telegram_id not in invited:
                        continue
                    await _promote_invited_user_to_admin(
                        tg,
                        input_channel,
                        input_user,
                        telegram_id,
                        uname,
                        admin_promote_failed,
                        max_flood_wait_sec,
                        delay_before_promote,
                    )
                    await asyncio.sleep(delay_after_promote)

    return {
        "invited": invited,
        "failed": failed,
        "admin_promote_failed": admin_promote_failed,
        "sync_bot_invited": sync_bot_invited,
        "sync_bot_skipped": sync_bot_skipped,
        "sync_bot_error": sync_bot_error,
    }


async def _promote_invite_rights_only(
    tg: TelegramClient,
    group_entity: Channel | Chat,
    is_classic_chat: bool,
    input_channel,
    telegram_ids: list[int],
) -> list[dict]:
    """Grant invite-users admin (megagroup) or full admin (classic chat API). Members must already be in the group."""
    failures: list[dict] = []
    max_flood_wait_sec = max(30, _env_int("TELEGRAM_MAX_FLOOD_WAIT_RETRY_SEC", 600))
    delay_before_promote = max(0.5, _env_float("TELEGRAM_DELAY_BEFORE_ADMIN_PROMOTE_SEC", 3.0))
    delay_after_promote = max(0.5, _env_float("TELEGRAM_DELAY_AFTER_ADMIN_PROMOTE_SEC", 6.0))
    for tid in telegram_ids:
        try:
            user_entity = await tg.get_entity(tid)
        except Exception:
            failures.append({"telegram_id": tid, "reason": "user_not_found"})
            continue
        if not isinstance(user_entity, User):
            failures.append({"telegram_id": tid, "reason": "invalid_entity"})
            continue
        input_user = InputUser(user_entity.id, user_entity.access_hash)
        if is_classic_chat:
            await _promote_invited_user_basic_chat(
                tg,
                group_entity.id,
                input_user,
                tid,
                None,
                failures,
                max_flood_wait_sec,
                delay_before_promote,
            )
        else:
            await _promote_invited_user_to_admin(
                tg,
                input_channel,
                input_user,
                tid,
                None,
                failures,
                max_flood_wait_sec,
                delay_before_promote,
            )
        await asyncio.sleep(delay_after_promote)
    return failures


@app.post("/sync-group")
async def sync_group(request: Request, x_api_key: str | None = Header(None)):
    """
    Update an existing linked group: title, photo, invites, optional welcome message,
    and/or promote members to invite-users admin (megagroup only gives granular rights).
    """
    verify_api_key(x_api_key)
    body = await request.json()
    logo_base64 = body.pop("logo_base64", None)
    logo_content_type = body.pop("logo_content_type", None)
    attachment_base64 = body.pop("attachment_base64", None)
    attachment_filename = body.pop("attachment_filename", None)
    attachment_caption = body.pop("attachment_caption", None)
    upgrade_to_supergroup = body.pop("upgrade_to_supergroup", False) is True
    chat_raw = body.get("chat_id")
    if chat_raw is None:
        raise HTTPException(status_code=400, detail="chat_id is required")
    try:
        eid = int(str(chat_raw).strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="chat_id invalide (entier, ex. -100…)")

    title_raw = body.get("title")
    title_str = str(title_raw).strip() if title_raw and isinstance(title_raw, str) else ""

    users_to_invite = _parse_users(body)

    promote_invite_raw = body.get("promote_invite_users")
    promote_admins = True if promote_invite_raw is None else bool(promote_invite_raw)

    promote_only_raw = body.get("promote_only_telegram_ids")
    promote_only: list[int] = []
    if isinstance(promote_only_raw, list):
        for x in promote_only_raw:
            try:
                promote_only.append(int(x))
            except (TypeError, ValueError):
                pass

    welcome_message = body.get("welcome_message")

    try:
        tg = await get_client()
        me = await tg.get_me()
        my_id = me.id if me else None
        requested_invite_ids = [tid for tid, _ in users_to_invite]
        requested_promote_only = list(promote_only)
        if my_id is not None:
            users_to_invite = [(tid, un) for tid, un in users_to_invite if tid != my_id]
            promote_only = [x for x in promote_only if x != my_id]

        group_entity = await _resolve_group_for_link(tg, eid)
        group_entity = await _upgrade_basic_group_to_supergroup_if_requested(
            tg,
            group_entity,
            upgrade_requested=upgrade_to_supergroup,
        )
        group_entity = await _elevate_migrated_basic_group(tg, group_entity)
        chat_id = get_peer_id(group_entity)
        try:
            group_entity = await tg.get_entity(chat_id)
        except Exception as refresh_err:
            logger.debug("get_entity refresh after sync link skipped: %s", refresh_err)

        is_classic_chat = isinstance(group_entity, Chat)
        logo_result = await _apply_group_logo_from_base64(
            tg, group_entity, is_classic_chat, logo_base64, logo_content_type
        )

        input_channel = None if is_classic_chat else get_input_channel(
            await tg.get_input_entity(group_entity)
        )

        if title_str:
            await _apply_group_display_name(tg, group_entity, is_classic_chat, input_channel, title_str)

        invite_result = await _invite_and_promote_users_in_group(
            tg,
            group_entity,
            is_classic_chat,
            input_channel,
            users_to_invite,
            promote_admins=promote_admins,
            run_sync_bot=not _env_truthy("TELEGRAM_SKIP_SYNC_BOT_ON_SYNC")
            and not _env_truthy("TELEGRAM_SKIP_SYNC_BOT"),
        )
        invited = invite_result["invited"]
        failed = invite_result["failed"]
        admin_promote_failed = invite_result["admin_promote_failed"]

        promote_only_failed: list[dict] = []
        if promote_only:
            promote_only_failed = await _promote_invite_rights_only(
                tg, group_entity, is_classic_chat, input_channel, promote_only
            )

        if welcome_message and isinstance(welcome_message, str) and welcome_message.strip():
            try:
                await tg.send_message(group_entity, welcome_message.strip())
            except Exception as e:
                logger.warning("Could not send welcome message (sync): %s", e)

        had_attachment = isinstance(attachment_base64, str) and attachment_base64.strip() != ""
        attachment_sent = False
        attachment_error: str | None = None
        if had_attachment:
            cap = (
                attachment_caption.strip()
                if isinstance(attachment_caption, str) and attachment_caption.strip()
                else "Document société"
            )
            fn = attachment_filename if isinstance(attachment_filename, str) else None
            attachment_sent = await _send_base64_file_to_channel(
                tg,
                group_entity,
                attachment_base64.strip(),
                fn,
                cap,
            )
            if not attachment_sent:
                attachment_error = (
                    "Envoi impossible (fichier trop volumineux côté serveur, ou erreur Telegram). "
                    "Vérifiez la taille (limite TELEGRAM_MAX_KBIS_DECODED_BYTES) et le format."
                )

        out: dict = {
            "chat_id": str(chat_id),
            "invited": invited,
            "failed": failed,
        }
        if admin_promote_failed:
            out["admin_promote_failed"] = admin_promote_failed
        if promote_only_failed:
            out["promote_only_failed"] = promote_only_failed
        if is_classic_chat and ((promote_admins and len(users_to_invite) > 0) or len(promote_only) > 0):
            out["classic_chat_admin_note"] = (
                "Les petits groupes classiques Telegram n'offrent pas le droit « inviter seulement » : "
                "la promotion active l'administration complète pour ce type de groupe."
            )
        if invite_result.get("sync_bot_skipped"):
            out["sync_bot_skipped"] = True
        elif invite_result.get("sync_bot_invited") is not None:
            out["sync_bot_invited"] = invite_result["sync_bot_invited"]
            if invite_result.get("sync_bot_error"):
                out["sync_bot_error"] = invite_result["sync_bot_error"]

        invite_notes: list[str] = []
        if my_id is not None:
            if requested_invite_ids and any(tid == my_id for tid in requested_invite_ids):
                invite_notes.append(
                    "Invitation : le compte Telegram utilisé par le serveur (session MTProto) ne peut pas "
                    "s’inviter lui-même. Rejoignez le groupe avec ce profil à la main, ou choisissez un autre "
                    "utilisateur dans la liste."
                )
            if requested_promote_only and any(x == my_id for x in requested_promote_only):
                invite_notes.append(
                    "Promotion ignorée pour le compte Telegram du serveur (session MTProto)."
                )
        if invite_notes:
            out["invite_note"] = " ".join(invite_notes)

        if had_attachment:
            out["attachment_sent"] = attachment_sent
            if not attachment_sent and attachment_error:
                out["attachment_error"] = attachment_error

        _merge_logo_result_into_response(out, logo_result)
        return out
    except HTTPException:
        raise
    except RuntimeError as e:
        logger.exception("RuntimeError syncing Telegram group")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Error syncing Telegram group: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"Impossible de mettre à jour le groupe Telegram: {e!s}",
        )


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

    existing_raw = body.get("existing_chat_id")
    link_existing = existing_raw is not None and str(existing_raw).strip() != ""
    crm_link_only = body.pop("crm_link_only", False) is True
    if crm_link_only and not link_existing:
        raise HTTPException(
            status_code=400,
            detail="crm_link_only requires existing_chat_id",
        )

    title = body.get("title")
    if link_existing:
        title = str(title).strip() if title and isinstance(title, str) else ""
    else:
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

        if link_existing:
            try:
                eid = int(str(existing_raw).strip())
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="existing_chat_id invalide (entier attendu, ex. -100…).",
                )
            group_entity = await _resolve_group_for_link(tg, eid)
        else:
            result = await tg(CreateChannelRequest(
                title=title,
                about="",
                megagroup=True,
            ))
            chat_id = None
            group_entity = None
            for chat in result.chats:
                if isinstance(chat, Channel):
                    chat_id = get_peer_id(chat)
                    group_entity = chat
                    break
            if chat_id is None or group_entity is None:
                raise HTTPException(
                    status_code=500,
                    detail="Could not extract chat_id from Telegram response",
                )

        group_entity = await _elevate_migrated_basic_group(tg, group_entity)
        chat_id = get_peer_id(group_entity)
        try:
            group_entity = await tg.get_entity(chat_id)
        except Exception as refresh_err:
            logger.debug("get_entity refresh after link/create skipped: %s", refresh_err)


        is_classic_chat = isinstance(group_entity, Chat)

        if crm_link_only:
            return {
                "chat_id": str(chat_id),
                "invited": [],
                "failed": [],
                "crm_link_only": True,
            }

        logo_result = await _apply_group_logo_from_base64(
            tg, group_entity, is_classic_chat, logo_base64, logo_content_type
        )

        input_channel = None if is_classic_chat else await tg.get_input_entity(group_entity)

        if link_existing and title:
            await _apply_group_display_name(tg, group_entity, is_classic_chat, input_channel, title)

        promote_admins = not _env_truthy("TELEGRAM_SKIP_ADMIN_PROMOTE_ON_INVITE")
        run_sync_bot = not _env_truthy("TELEGRAM_SKIP_SYNC_BOT")
        invite_result = await _invite_and_promote_users_in_group(
            tg,
            group_entity,
            is_classic_chat,
            input_channel,
            users_to_invite,
            promote_admins=promote_admins,
            run_sync_bot=run_sync_bot,
        )
        invited = invite_result["invited"]
        failed = invite_result["failed"]
        admin_promote_failed = invite_result["admin_promote_failed"]
        sync_bot_invited = invite_result.get("sync_bot_invited")
        sync_bot_skipped = invite_result.get("sync_bot_skipped", False)
        sync_bot_error = invite_result.get("sync_bot_error")


        welcome_message = body.get("welcome_message")
        if welcome_message and isinstance(welcome_message, str) and welcome_message.strip():
            try:
                await tg.send_message(group_entity, welcome_message.strip())
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
                            group_entity,
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
            group_entity,
            pi_recto_base64,
            pi_recto_filename,
            "Pièce d'identité recto",
        )
        await _send_base64_file_to_channel(
            tg,
            group_entity,
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
        _merge_logo_result_into_response(out, logo_result)
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
