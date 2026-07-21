import test from "node:test";
import assert from "node:assert/strict";

import {
  WEATHER_ENDPOINT,
  fetchCurrentWeather,
  formatTemperature,
  getDayPeriodIcon
} from "../js/weather.js";

test("consulta a temperatura atual em Celsius", async () => {
  let requestedUrl;
  const weather = await fetchCurrentWeather({
    latitude: -33.4489,
    longitude: -70.6693
  }, {
    fetchImpl: async url => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({ current: { temperature_2m: 12.6, is_day: 1 } })
      };
    }
  });

  assert.deepEqual(weather, { temperature: 12.6, isDay: true });
  assert.equal(requestedUrl.origin + requestedUrl.pathname, WEATHER_ENDPOINT);
  assert.equal(requestedUrl.searchParams.get("current"), "temperature_2m,is_day");
  assert.equal(requestedUrl.searchParams.get("temperature_unit"), "celsius");
});

test("formata a temperatura sem casas decimais", () => {
  assert.equal(formatTemperature(12.6), "13°C");
  assert.equal(formatTemperature(-2.4), "-2°C");
  assert.equal(formatTemperature(undefined), "--°C");
});

test("alterna o ícone conforme dia e noite", () => {
  assert.equal(getDayPeriodIcon(true), "☼");
  assert.equal(getDayPeriodIcon(false), "☾");
});

test("rejeita coordenadas e respostas inválidas", async () => {
  await assert.rejects(
    fetchCurrentWeather({ latitude: 100, longitude: 0 }),
    /Coordenadas inválidas/
  );

  await assert.rejects(
    fetchCurrentWeather(
      { latitude: 0, longitude: 0 },
      { fetchImpl: async () => ({ ok: true, json: async () => ({ current: {} }) }) }
    ),
    /Temperatura atual indisponível/
  );
});
