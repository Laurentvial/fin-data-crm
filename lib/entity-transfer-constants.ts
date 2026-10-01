export const ENTITY_KIND = "bigboss-entity-export" as const;
export const ENTITY_FORMAT_VERSION = 1 as const;
export const ENTITY_EXPORT_LIMIT = 50;

export const ENTITY_ENTITIES = ["companies", "bank_accounts"] as const;
export type EntityTransferEntity = (typeof ENTITY_ENTITIES)[number];
