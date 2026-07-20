import test from "node:test";
import assert from "node:assert/strict";

import {
  REVERSE_GEOCODING_ENDPOINT,
  buildPlaceName,
  getCurrentCoordinates,
  reverseGeocodeCoordinates
} from "../js/location.js";

test("monta um nome de lugar curto sem repetir cidade e localidade", () => {
  assert.equal(buildPlaceName({
    locality: "Santiago",
    city: "Santiago",
    countryName: "Chile"
  }), "Santiago, Chile");

  assert.equal(buildPlaceName({
    locality: "Providencia",
    city: "Santiago",
    countryName: "Chile"
  }), "Providencia, Santiago, Chile");
});

test("obtém e valida as coordenadas fornecidas pelo navegador", async () => {
  const geolocation = {
    getCurrentPosition(success, _error, options) {
      assert.equal(options.enableHighAccuracy, true);
      success({ coords: { latitude: -33.4489, longitude: -70.6693, accuracy: 12 } });
    }
  };

  assert.deepEqual(await getCurrentCoordinates(geolocation), {
    latitude: -33.4489,
    longitude: -70.6693,
    accuracy: 12
  });
});

test("repassa a recusa de permissão do navegador", async () => {
  const permissionError = { code: 1, message: "Permission denied" };
  const geolocation = {
    getCurrentPosition(_success, error) {
      error(permissionError);
    }
  };

  await assert.rejects(getCurrentCoordinates(geolocation), error => error === permissionError);
});

test("consulta a localização atual no endpoint client-side", async () => {
  let requestedUrl;
  const fetchImpl = async url => {
    requestedUrl = url;
    return {
      ok: true,
      async json() {
        return { locality: "Las Condes", city: "Santiago", countryName: "Chile" };
      }
    };
  };

  const placeName = await reverseGeocodeCoordinates({
    latitude: -33.4088,
    longitude: -70.5671
  }, { fetchImpl });

  assert.equal(placeName, "Las Condes, Santiago, Chile");
  assert.equal(requestedUrl.origin + requestedUrl.pathname, REVERSE_GEOCODING_ENDPOINT);
  assert.equal(requestedUrl.searchParams.get("localityLanguage"), "pt");
});

test("rejeita coordenadas inválidas e respostas sem localidade", async () => {
  await assert.rejects(
    reverseGeocodeCoordinates({ latitude: 120, longitude: 0 }),
    /Coordenadas inválidas/
  );

  await assert.rejects(
    reverseGeocodeCoordinates(
      { latitude: 0, longitude: 0 },
      { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }
    ),
    /Localidade não encontrada/
  );
});
