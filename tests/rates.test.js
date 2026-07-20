import test from "node:test";
import assert from "node:assert/strict";

import {
  RateService,
  normalizeIsoDateTimestamp,
  normalizeUnixTimestamp
} from "../js/rates.js";

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    }
  };
}

test("normaliza timestamps em segundos e milissegundos", () => {
  assert.equal(normalizeUnixTimestamp(1_784_421_000), 1_784_421_000);
  assert.equal(normalizeUnixTimestamp(1_784_421_000_000), 1_784_421_000);
  assert.equal(normalizeUnixTimestamp("inválido"), null);
});

test("normaliza a data diária sem deslocar o dia da referência", () => {
  assert.equal(
    normalizeIsoDateTimestamp("2026-07-19"),
    Math.floor(Date.UTC(2026, 6, 19, 12) / 1000)
  );
  assert.equal(normalizeIsoDateTimestamp("2026-02-30"), null);
  assert.equal(normalizeIsoDateTimestamp("19/07/2026"), null);
});

test("usa a taxa CLP para BRL da fonte diária principal", async () => {
  const calls = [];
  const service = new RateService({
    primaryUrl: "https://primary.test/clp.json",
    fallbackUrl: "https://fallback.test/clp.json",
    fetchImpl: async url => {
      calls.push(url);
      return response({
        date: "2026-07-19",
        clp: { brl: 0.00548754 }
      });
    }
  });

  const quote = await service.fetchBestAvailableRate();

  assert.equal(quote.rate, 0.00548754);
  assert.equal(quote.sourceKind, "daily");
  assert.equal(quote.sourceName, "Currency API");
  assert.equal(quote.sourceUpdatedAt, Math.floor(Date.UTC(2026, 6, 19, 12) / 1000));
  assert.equal(calls[0], "https://primary.test/clp.json");
  assert.equal(calls.length, 1);
});

test("usa o espelho quando a fonte diária principal falha", async () => {
  const calls = [];
  const service = new RateService({
    primaryUrl: "https://primary.test/clp.json",
    fallbackUrl: "https://fallback.test/clp.json",
    fetchImpl: async url => {
      calls.push(url);
      if (url.includes("primary")) return response({}, { ok: false, status: 503 });
      return response({
        date: "2026-07-19",
        clp: { brl: "0.005507" }
      });
    }
  });

  const quote = await service.fetchBestAvailableRate();

  assert.equal(quote.rate, 0.005507);
  assert.equal(quote.sourceKind, "daily");
  assert.equal(quote.sourceName, "Currency API");
  assert.deepEqual(calls, [
    "https://primary.test/clp.json",
    "https://fallback.test/clp.json"
  ]);
  assert.equal(calls.length, 2);
});

test("rejeita respostas inválidas nas duas fontes", async () => {
  const service = new RateService({
    primaryUrl: "primary",
    fallbackUrl: "fallback",
    fetchImpl: async () => response({ date: "inválida", clp: { brl: 0 } })
  });

  await assert.rejects(() => service.fetchBestAvailableRate(), /Cotação diária indisponível/);
});
