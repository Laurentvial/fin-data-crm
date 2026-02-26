# Telegram Group Creation Service

Creates Telegram supergroups via the MTProto Client API (Telethon). Used by the CRM when creating bank accounts so each account gets an associated Telegram group.

## Prerequisites

- Python 3.11+
- A Telegram user account (not a bot)
- API credentials from [my.telegram.org](https://my.telegram.org/app)

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
# Linux/macOS
cp .env.example .env

# Windows (PowerShell)
copy .env.example .env
```

| Variable | Description |
|----------|-------------|
| `TELEGRAM_API_ID` | From my.telegram.org |
| `TELEGRAM_API_HASH` | From my.telegram.org |
| `TELEGRAM_SESSION_PATH` | Path for session file (default: `telegram_session`) |
| `API_SECRET_KEY` | Secret key for CRM API authentication (must match `TELEGRAM_SERVICE_API_KEY` in main app) |

### 3. One-time authentication

**Option A – Depuis l’interface (recommandé)** : Paramètres → Connexion Telegram. Entrez votre numéro, recevez le code sur Telegram, puis confirmez.

**Option B – En ligne de commande** :

```bash
python auth.py
```

You will be prompted for your phone number and the verification code sent by Telegram. The session is saved to `telegram_session.session` (or the path you set). **Do not commit this file to git.**

### 4. Run the service

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## API

### POST /create-group

Creates a Telegram supergroup and optionally invites app users.

**Headers:**
- `X-API-Key`: Your `API_SECRET_KEY`

**Body:**
```json
{
  "title": "Company Name – Account Name",
  "users": [
    { "telegram_id": 123456789, "telegram_username": "optional_username" }
  ]
}
```

- `users` (optional): List of `{ telegram_id, telegram_username? }` to invite. Users must be in the admin's Telegram contacts for the invite to succeed.

**Response:**
```json
{
  "chat_id": -1001234567890,
  "invited": [123456789],
  "failed": [{ "telegram_id": 987654321, "reason": "UserNotMutualContactError" }]
}
```

## Deployment

Deploy as a small Python service (Railway, Render, or a VM). Ensure:

- Network access to Telegram
- `TELEGRAM_SESSION_PATH` points to a persistent volume (session file must persist)
- `API_SECRET_KEY` matches the value configured in the CRM
