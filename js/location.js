export const REVERSE_GEOCODING_ENDPOINT = "https://api.bigdatacloud.net/data/reverse-geocode-client";

const DEFAULT_POSITION_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 30_000
});

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function appendUnique(parts, value) {
  const normalized = normalizeText(value);
  if (!normalized) return;

  const comparable = normalized.toLocaleLowerCase("pt-BR");
  if (parts.some(part => part.toLocaleLowerCase("pt-BR") === comparable)) return;
  parts.push(normalized);
}

export function buildPlaceName(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";

  const parts = [];
  appendUnique(parts, payload.locality || payload.city || payload.principalSubdivision);
  appendUnique(parts, payload.city);
  appendUnique(parts, payload.countryName);
  return parts.join(", ");
}

export function getCurrentCoordinates(
  geolocation = globalThis.navigator?.geolocation,
  options = DEFAULT_POSITION_OPTIONS
) {
  if (!geolocation || typeof geolocation.getCurrentPosition !== "function") {
    return Promise.reject(new Error("GEOLOCATION_UNAVAILABLE"));
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(position => {
      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);
      const accuracy = Number(position?.coords?.accuracy);

      if (
        !Number.isFinite(latitude)
        || latitude < -90
        || latitude > 90
        || !Number.isFinite(longitude)
        || longitude < -180
        || longitude > 180
      ) {
        reject(new Error("INVALID_COORDINATES"));
        return;
      }

      resolve({
        latitude,
        longitude,
        accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null
      });
    }, reject, options);
  });
}

export async function reverseGeocodeCoordinates(
  { latitude, longitude },
  { fetchImpl = globalThis.fetch, signal } = {}
) {
  const normalizedLatitude = Number(latitude);
  const normalizedLongitude = Number(longitude);

  if (
    !Number.isFinite(normalizedLatitude)
    || normalizedLatitude < -90
    || normalizedLatitude > 90
    || !Number.isFinite(normalizedLongitude)
    || normalizedLongitude < -180
    || normalizedLongitude > 180
  ) {
    throw new RangeError("Coordenadas inválidas.");
  }

  if (typeof fetchImpl !== "function") {
    throw new TypeError("Fetch indisponível.");
  }

  const url = new URL(REVERSE_GEOCODING_ENDPOINT);
  url.searchParams.set("latitude", String(normalizedLatitude));
  url.searchParams.set("longitude", String(normalizedLongitude));
  url.searchParams.set("localityLanguage", "pt");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal
  });

  if (!response?.ok) {
    throw new Error(`Falha ao identificar o lugar (${response?.status ?? "sem resposta"}).`);
  }

  const placeName = buildPlaceName(await response.json());
  if (!placeName) throw new Error("Localidade não encontrada.");
  return placeName;
}
