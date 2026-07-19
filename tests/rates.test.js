import test from "node:test";
import assert from "node:assert/strict";

import {
  DAILY_FALLBACK_INTERVAL_MS,
  RateService,
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

test("usa a média exata entre compra e venda da fonte intradiária", async () => {
  const calls = [];
  const service = new RateService({
    fetchImpl: async url => {
      calls.push(url);
      return response({
        CLPBRL: {
          code: "CLP",
          codein: "BRL",
          bid: "0.0054",
          ask: "0.0056",
          timestamp: "1784421000"
        }
      });
    }
  });

  const quote = await service.fetchBestAvailableRate();

  assert.equal(quote.rate, 0.0055);
  assert.equal(quote.sourceKind, "realtime");
  assert.equal(quote.sourceName, "AwesomeAPI");
  assert.equal(quote.sourceUpdatedAt, 1_784_421_000);
  assert.equal(calls.length, 1);
});

test("usa a referência diária quando a fonte intradiária falha", async () => {
  const calls = [];
  const service = new RateService({
    fetchImpl: async url => {
      calls.push(url);
      if (url.includes("awesomeapi")) return response({}, { ok: false, status: 429 });
      return response({
        result: "success",
        base_code: "CLP",
        rates: { BRL: 0.005507 },
        time_last_update_unix: 1_784_419_351
      });
    }
  });

  const quote = await service.fetchBestAvailableRate();

  assert.equal(quote.rate, 0.005507);
  assert.equal(quote.sourceKind, "daily");
  assert.equal(quote.sourceName, "ExchangeRate-API");
  assert.equal(calls.length, 2);
});

test("não repete a contingência diária dentro do intervalo automático", async () => {
  let now = DAILY_FALLBACK_INTERVAL_MS + 1;
  let dailyCalls = 0;
  const service = new RateService({
    now: () => now,
    fetchImpl: async url => {
      if (url.includes("awesomeapi")) return response({}, { ok: false, status: 503 });
      dailyCalls += 1;
      return response({
        result: "success",
        base_code: "CLP",
        rates: { BRL: 0.0055 },
        time_last_update_unix: 1_784_419_351
      });
    }
  });

  await service.fetchBestAvailableRate();
  now += 60_000;

  await assert.rejects(() => service.fetchBestAvailableRate(), /Falha na consulta/);
  assert.equal(dailyCalls, 1);

  now += DAILY_FALLBACK_INTERVAL_MS;
  await service.fetchBestAvailableRate();
  assert.equal(dailyCalls, 2);
});
