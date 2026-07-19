import test from "node:test";
import assert from "node:assert/strict";

import { DIRECTIONS } from "../js/money.js";
import {
  SESSION_SCHEMA_VERSION,
  SESSION_STORAGE_KEY,
  calculateTotals,
  clearSession,
  createItem,
  createSession,
  loadSession,
  normalizePeopleCount,
  saveSession
} from "../js/session-store.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function validItem(overrides = {}) {
  return createItem({
    label: "Almoço",
    direction: DIRECTIONS.CLP_TO_BRL,
    clpPesos: 8500,
    brlCents: 4675,
    rateClpToBrl: 0.0055,
    rateKind: "realtime",
    rateSource: "AwesomeAPI",
    rateSourceUpdatedAt: "2026-07-19T15:00:00.000Z",
    ...overrides
  });
}

test("cria uma sessão versionada e vazia", () => {
  const session = createSession();

  assert.equal(session.schemaVersion, SESSION_SCHEMA_VERSION);
  assert.match(session.id, /^session_/);
  assert.equal(session.status, "open");
  assert.equal(session.peopleCount, 1);
  assert.deepEqual(session.items, []);
  assert.ok(!Number.isNaN(Date.parse(session.createdAt)));
});

test("cria item com direção, cotação, origem, timestamps e unidades inteiras", () => {
  const item = validItem({ label: `  Táxi\n${"x".repeat(80)}  ` });

  assert.match(item.id, /^item_/);
  assert.equal(item.direction, DIRECTIONS.CLP_TO_BRL);
  assert.equal(item.sourceCurrency, "CLP");
  assert.equal(item.sourceAmount, 8500);
  assert.equal(item.clpPesos, 8500);
  assert.equal(item.brlCents, 4675);
  assert.equal(item.rateClpToBrl, 0.0055);
  assert.equal(item.rateKind, "realtime");
  assert.equal(item.rateSource, "AwesomeAPI");
  assert.equal(item.label.includes("\n"), false);
  assert.ok(item.label.length <= 60);
  assert.ok(!Number.isNaN(Date.parse(item.createdAt)));
  assert.ok(!Number.isNaN(Date.parse(item.updatedAt)));
});

test("preserva rótulos como texto sem produzir marcação", () => {
  const item = validItem({ label: "<strong>Jantar</strong>" });

  assert.equal(typeof item.label, "string");
  assert.equal(item.label, "<strong>Jantar</strong>");
});

test("soma somente itens com unidades monetárias válidas", () => {
  const first = validItem();
  const second = validItem({
    direction: DIRECTIONS.BRL_TO_CLP,
    clpPesos: 18182,
    brlCents: 10000
  });

  assert.deepEqual(calculateTotals([first, second, { clpPesos: "inválido", brlCents: 1 }]), {
    clpPesos: 26682,
    brlCents: 14675,
    itemCount: 2
  });
});

test("normaliza a quantidade de pessoas dentro do limite do app", () => {
  assert.equal(normalizePeopleCount("3"), 3);
  assert.equal(normalizePeopleCount(3.9), 3);
  assert.equal(normalizePeopleCount(0), 1);
  assert.equal(normalizePeopleCount(1000), 99);
  assert.equal(normalizePeopleCount("não numérico"), 1);
});

test("salva e restaura uma sessão no localStorage informado", () => {
  const storage = new MemoryStorage();
  const session = createSession();
  session.peopleCount = 3;
  session.items.push(validItem());

  const saved = saveSession(session, storage);
  const loaded = loadSession(storage);

  assert.equal(saved.peopleCount, 3);
  assert.equal(loaded.id, session.id);
  assert.equal(loaded.peopleCount, 3);
  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.items[0].label, "Almoço");
  assert.equal(loaded.items[0].brlCents, 4675);
});

test("descarta JSON corrompido e retorna uma sessão nova", () => {
  const storage = new MemoryStorage();
  storage.setItem(SESSION_STORAGE_KEY, "{json quebrado");

  const loaded = loadSession(storage);

  assert.equal(loaded.schemaVersion, SESSION_SCHEMA_VERSION);
  assert.deepEqual(loaded.items, []);
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), null);
});

test("remove itens estruturalmente inválidos sem derrubar a sessão", () => {
  const storage = new MemoryStorage();
  const session = createSession();
  session.items = [validItem(), { direction: "INVALID", clpPesos: -1, brlCents: 0 }];
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

  const loaded = loadSession(storage);

  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.items[0].label, "Almoço");
});

test("limpa a sessão persistida", () => {
  const storage = new MemoryStorage();
  saveSession(createSession(), storage);

  assert.equal(clearSession(storage), true);
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), null);
});
