import { DIRECTIONS } from "./money.js";

export const SESSION_SCHEMA_VERSION = 1;
export const SESSION_STORAGE_KEY = "clpBrlSessionV1";

const MAX_LABEL_LENGTH = 60;
const MAX_PEOPLE_COUNT = 99;
const VALID_STATUSES = new Set(["open", "closed"]);
const VALID_RATE_KINDS = new Set(["realtime", "daily", "manual", "cached", "default"]);

const RATE_SOURCE_LABELS = Object.freeze({
  realtime: "AwesomeAPI",
  daily: "ExchangeRate-API",
  manual: "Cotação manual",
  cached: "Cache local",
  default: "Referência inicial"
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function makeId(prefix) {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return `${prefix}_${globalThis.crypto.randomUUID()}`;
    }
  } catch {
    // O fallback mantém o app funcional em navegadores sem Web Crypto disponível.
  }

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value, prefix) {
  if (typeof value !== "string") return makeId(prefix);

  const normalized = value.trim();
  return normalized && normalized.length <= 128 ? normalized : makeId(prefix);
}

function normalizeLabel(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL_LENGTH);
}

function normalizeDirection(value) {
  return value === DIRECTIONS.CLP_TO_BRL || value === DIRECTIONS.BRL_TO_CLP
    ? value
    : null;
}

function normalizeRateKind(value) {
  const normalized = String(value ?? "default").toLowerCase();
  return VALID_RATE_KINDS.has(normalized) ? normalized : "default";
}

function normalizeTimestamp(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;

  let milliseconds;
  if (typeof value === "number" || /^\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const numericTimestamp = Number(value);
    milliseconds = numericTimestamp < 1_000_000_000_000
      ? numericTimestamp * 1000
      : numericTimestamp;
  } else {
    milliseconds = Date.parse(String(value));
  }

  if (!Number.isFinite(milliseconds)) return fallback;

  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeRateSource(value, rateKind) {
  const source = normalizeLabel(value);
  return source || RATE_SOURCE_LABELS[rateKind];
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function normalizeStorage(storage) {
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      return null;
    }
  }

  if (storage === null) return null;

  if (
    typeof storage.getItem !== "function"
    || typeof storage.setItem !== "function"
    || typeof storage.removeItem !== "function"
  ) {
    throw new TypeError("Storage deve implementar getItem, setItem e removeItem.");
  }

  return storage;
}

function buildItem(payload, { preserveMetadata = false } = {}) {
  if (!isRecord(payload)) return null;

  const direction = normalizeDirection(payload.direction);
  const clpPesos = Number(payload.clpPesos);
  const brlCents = Number(payload.brlCents);
  const rateClpToBrl = Number(payload.rateClpToBrl ?? payload.rate);

  if (
    !direction
    || !isNonNegativeSafeInteger(clpPesos)
    || !isNonNegativeSafeInteger(brlCents)
    || !Number.isFinite(rateClpToBrl)
    || rateClpToBrl <= 0
  ) {
    return null;
  }

  const rateKind = normalizeRateKind(payload.rateKind ?? payload.rateSourceKind);
  const timestamp = nowIso();
  const createdAt = preserveMetadata
    ? normalizeTimestamp(payload.createdAt, timestamp)
    : timestamp;
  const updatedAt = preserveMetadata
    ? normalizeTimestamp(payload.updatedAt, createdAt)
    : timestamp;
  const sourceCurrency = direction === DIRECTIONS.CLP_TO_BRL ? "CLP" : "BRL";
  const sourceAmount = sourceCurrency === "CLP" ? clpPesos : brlCents / 100;

  return {
    id: preserveMetadata ? normalizeId(payload.id, "item") : makeId("item"),
    label: normalizeLabel(payload.label),
    direction,
    sourceCurrency,
    sourceAmount,
    clpPesos,
    brlCents,
    rateClpToBrl,
    rateKind,
    rateSource: normalizeRateSource(payload.rateSource, rateKind),
    rateSourceUpdatedAt: normalizeTimestamp(payload.rateSourceUpdatedAt),
    createdAt,
    updatedAt
  };
}

function sanitizeSession(value) {
  if (!isRecord(value) || value.schemaVersion !== SESSION_SCHEMA_VERSION) return null;

  const timestamp = nowIso();
  const createdAt = normalizeTimestamp(value.createdAt, timestamp);
  const items = Array.isArray(value.items)
    ? value.items.map(item => buildItem(item, { preserveMetadata: true })).filter(Boolean)
    : [];

  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: normalizeId(value.id, "session"),
    status: VALID_STATUSES.has(value.status) ? value.status : "open",
    createdAt,
    updatedAt: normalizeTimestamp(value.updatedAt, createdAt),
    peopleCount: normalizePeopleCount(value.peopleCount),
    items
  };
}

function discardCorruptedValue(storage) {
  try {
    storage?.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Uma falha no storage não deve impedir a criação de uma sessão em memória.
  }
}

export function createSession() {
  const timestamp = nowIso();

  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: makeId("session"),
    status: "open",
    createdAt: timestamp,
    updatedAt: timestamp,
    peopleCount: 1,
    items: []
  };
}

export function loadSession(storage) {
  let resolvedStorage;

  try {
    resolvedStorage = normalizeStorage(storage);
    if (!resolvedStorage) return createSession();

    const serialized = resolvedStorage.getItem(SESSION_STORAGE_KEY);
    if (serialized === null) return createSession();

    const session = sanitizeSession(JSON.parse(serialized));
    if (session) return session;

    discardCorruptedValue(resolvedStorage);
    return createSession();
  } catch {
    discardCorruptedValue(resolvedStorage);
    return createSession();
  }
}

export function saveSession(session, storage) {
  const normalizedSession = sanitizeSession(session);

  if (!normalizedSession) {
    throw new TypeError(`Sessão deve usar o schema ${SESSION_SCHEMA_VERSION}.`);
  }

  normalizedSession.updatedAt = nowIso();
  const resolvedStorage = normalizeStorage(storage);

  if (resolvedStorage) {
    resolvedStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalizedSession));
  }

  return normalizedSession;
}

export function createItem(payload) {
  const item = buildItem(payload);

  if (!item) {
    throw new TypeError("Item deve conter direção, taxa positiva e unidades monetárias inteiras válidas.");
  }

  return item;
}

export function calculateTotals(items) {
  if (!Array.isArray(items)) {
    throw new TypeError("Itens devem ser informados em uma lista.");
  }

  let clpPesos = 0;
  let brlCents = 0;
  let itemCount = 0;

  for (const item of items) {
    if (
      !isRecord(item)
      || !isNonNegativeSafeInteger(item.clpPesos)
      || !isNonNegativeSafeInteger(item.brlCents)
    ) {
      continue;
    }

    clpPesos += item.clpPesos;
    brlCents += item.brlCents;

    if (!Number.isSafeInteger(clpPesos) || !Number.isSafeInteger(brlCents)) {
      throw new RangeError("O total ultrapassa o intervalo monetário suportado.");
    }

    itemCount += 1;
  }

  return { clpPesos, brlCents, itemCount };
}

export function normalizePeopleCount(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;

  return Math.min(MAX_PEOPLE_COUNT, Math.max(1, Math.trunc(numericValue)));
}

export function clearSession(storage) {
  const resolvedStorage = normalizeStorage(storage);
  if (!resolvedStorage) return false;

  resolvedStorage.removeItem(SESSION_STORAGE_KEY);
  return true;
}
