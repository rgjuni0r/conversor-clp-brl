export const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const SANTIAGO_COORDINATES = Object.freeze({
  latitude: -33.4489,
  longitude: -70.6693
});
export const WEATHER_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function normalizeCoordinate(value, minimum, maximum) {
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < minimum || coordinate > maximum) {
    throw new RangeError("Coordenadas inválidas para consultar a temperatura.");
  }
  return coordinate;
}

export async function fetchCurrentWeather(
  { latitude, longitude } = SANTIAGO_COORDINATES,
  { fetchImpl = globalThis.fetch, signal } = {}
) {
  const normalizedLatitude = normalizeCoordinate(latitude, -90, 90);
  const normalizedLongitude = normalizeCoordinate(longitude, -180, 180);

  if (typeof fetchImpl !== "function") throw new TypeError("Fetch indisponível.");

  const url = new URL(WEATHER_ENDPOINT);
  url.searchParams.set("latitude", String(normalizedLatitude));
  url.searchParams.set("longitude", String(normalizedLongitude));
  url.searchParams.set("current", "temperature_2m,is_day");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("timezone", "auto");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal
  });

  if (!response?.ok) {
    throw new Error(`Falha ao consultar a temperatura (${response?.status ?? "sem resposta"}).`);
  }

  const payload = await response.json();
  const temperature = Number(payload?.current?.temperature_2m);
  if (!Number.isFinite(temperature)) throw new Error("Temperatura atual indisponível.");

  return {
    temperature,
    isDay: Number(payload?.current?.is_day) === 1
  };
}

export function formatTemperature(temperature) {
  const value = Number(temperature);
  if (!Number.isFinite(value)) return "--°C";
  return `${Math.round(value)}°C`;
}

export function getDayPeriodIcon(isDay) {
  return isDay ? "☼" : "☾";
}
