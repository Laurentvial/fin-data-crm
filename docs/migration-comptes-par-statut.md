# Migration comptes par statut entre instances BigBoss

Ce guide décrit comment copier des **comptes bancaires** (filtrés par statut), leurs **sociétés** et les données associées (IBAN, cartes, fichiers, emails/téléphones société) d’une instance BigBoss (source) vers une autre (cible).

**Périmètre** : fiches société/compte et catalogues liés. **Non inclus** : transactions, clients facturation, factures.

Une **instance** = une URL de déploiement + sa base Neon (pas d’entité « projet » dans l’application).

## Prérequis (instance cible)

- Migrations SQL à jour (même schéma que la source).
- Au moins un **statut de compte** en base (sinon l’import des comptes renvoie une erreur 409).
- Variable `ENCRYPTION_KEY` propre à la cible : les mots de passe des **emails société** sont exportés en clair dans le JSON puis re-chiffrés à l’import sur la cible.

Compte utilisateur avec droit d’**édition** (pas lecteur seul) sur source et cible.

---

## Étape 1 — Catalogues (source puis cible)

Dans **Paramètres**, section import/export des catalogues, exporter depuis la **source** puis importer sur la **cible** dans l’ordre ci-dessous. Chaque import **ignore** les UUID déjà présents (relançable).

| Ordre | Entité Paramètres | Table | Pourquoi |
|------:|-------------------|-------|----------|
| 1 | **Statuts de comptes** | `account_statuses` | Conserve les UUID de statut référencés par les comptes exportés. |
| 2 | **Clients** (types de compte) | `account_types` | Si les comptes ont un type client ou vous voulez les mêmes libellés. |
| 3 | **Banques** | `banks` | Si les comptes référencent une banque (`bank_id`). |
| 4 | **Sources** | `sources` | Si les sociétés ont un `source_id`. |
| 5 | **Fournisseurs** | (catalogue fournisseurs) | Si utilisé sur les sociétés. |
| 6 | **Modèles de facture** | `invoice_templates` | Si les sociétés ont un `invoice_template_id`. |

Sans l’étape 1 (statuts), les comptes importés peuvent retomber sur le statut **par défaut** de la cible au lieu du statut d’origine.

API (admin connecté) : `GET /api/admin/catalog-export?entity=statuses|clients|banks|sources|fournisseurs|templates` puis `POST /api/admin/catalog-import` avec le JSON.

---

## Étape 2 — Export des comptes (source)

### Interface

1. Ouvrir **Comptes**.
2. Appliquer le filtre **Statut** souhaité (seuls les comptes **affichés** après filtres sont exportés).
3. Cliquer **Exporter** → fichier `bigboss-bank_accounts-YYYY-MM-DD.json` (suffixe statut si un seul statut est filtré).

Limite : **50 comptes** par fichier JSON (`ENTITY_EXPORT_LIMIT`). Si plus de comptes sont affichés, **Exporter** télécharge **plusieurs fichiers** (`-part-1-sur-3`, etc.) dans le même ordre que la liste à l’écran (tri et filtres actuels). Le 1er lot = les 50 premiers visibles, le 2e = les 50 suivants, etc.

### API

`POST /api/entity-export` (session authentifiée, rôle éditeur).

Corps possible :

```json
{
  "entity": "bank_accounts",
  "ids": ["uuid-compte-1", "uuid-compte-2"]
}
```

Ou résolution côté serveur par statut (sans lister les UUID) :

```json
{
  "entity": "bank_accounts",
  "filters": {
    "account_status_ids": ["uuid-statut"]
  }
}
```

Si `ids` et `filters.account_status_ids` sont fournis, les UUID explicites dans `ids` sont utilisés en priorité ; les filtres ne s’appliquent que lorsque `ids` est absent ou vide.

Réponse : JSON `kind: "bigboss-entity-export"`, `entity: "bank_accounts"`, `items` (comptes), `companies` (sociétés liées).

---

## Étape 3 — Import (cible)

### Interface

1. Ouvrir **Comptes** sur la cible.
2. **Importer** le ou les fichiers JSON exportés (sélection multiple possible : `part-1-sur-3`, `part-2-sur-3`, etc.).

L’application importe d’abord les sociétés (`companies[]`) par lots de 5, puis les comptes (`items`) par lots de 5. Les UUID **déjà présents** sur la cible sont **ignorés** (réimport sans doublon ni erreur).

### API

`POST /api/entity-import` avec le même format JSON (ou lots découpés comme l’UI). Voir le script `scripts/entity-transfer-cli.mjs`.

---

## Comportement à l’import (référence)

| Situation | Résultat |
|-----------|----------|
| Société ou compte avec UUID déjà existant | **Ignoré** (pas de mise à jour) |
| UUID de statut absent sur la cible | Statut **par défaut** de la cible |
| Banque, type client, source, modèle facture UUID absent | Champ mis à **null** |
| `telegram_chat_id` déjà utilisé sur la cible | **Vidé** sur le compte importé |
| Société absente au moment de l’import du compte | Compte **ignoré** (importer les sociétés avant les comptes) |
| Aucun statut en base sur la cible | Erreur **409** |

## Vérification

- Comptes visibles avec le statut attendu (ou défaut si catalogues incomplets).
- Fichiers société/compte (KBIS, RIB, etc.) présents.
- Connexion aux boîtes email société si applicable (mot de passe re-chiffré avec la clé de la cible).

## Script CLI

Pour automatiser export/import sans l’UI (cookie de session après connexion navigateur) :

```bash
node scripts/entity-transfer-cli.mjs export --base-url https://source.example --cookie "..." --status-id <uuid>
node scripts/entity-transfer-cli.mjs import --base-url https://cible.example --cookie "..." --file export.json
```

Voir les commentaires en tête de `scripts/entity-transfer-cli.mjs`.

## Fichiers techniques

- Logique export/import : `lib/entity-transfer.ts`
- Constantes (limite 50, format JSON) : `lib/entity-transfer-constants.ts`
- Routes : `app/api/entity-export/route.ts`, `app/api/entity-import/route.ts`
- Catalogues : `lib/catalog-transfer.ts`, `app/api/admin/catalog-export/route.ts`
