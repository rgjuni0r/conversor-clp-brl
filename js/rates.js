export const PRIMARY_RATE_API_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/clp.min.json";
export const FALLBACK_RATE_API_URL = "https://latest.currency-api.pages.dev/v1/currencies/clp.json";
export const RATE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
export const AUTOMATIC_REQUEST_DEBOUNCE_MS = 15_000;

const REQUEST_TIMEOUT_MS = 10_000;

export function normalizeUnixTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
}

export function formatRateDate(unixTimestamp, { includeTime = true } = {}) {
  if (!unixTimestamp) return null;

  const date = new Date(Number(unixTimestamp) * 1000);
  if (Number.isNaN(date.getTime())) return null;

  const options = { dateStyle: "short" };
  if (includeTime) options.timeStyle = "short";

  return new Intl.DateTimeFormat("pt-BR", options).format(date);
}

export function normalizeIsoDateTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const milliseconds = Date.UTC(year, month - 1, day, 12);
  const date = new Date(milliseconds);

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(milliseconds / 1000);
}

export class RateService {
  constructor({
    fetchImpl = globalThis.fetch?.bind(globalThis),
    primaryUrl = PRIMARY_RATE_API_URL,
    fallbackUrl = FALLBACK_RATE_API_URL
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("Uma implementação de fetch é obrigatória.");
    }

    this.fetchImpl = fetchImpl;
    this.primaryUrl = primaryUrl;
    this.fallbackUrl = fallbackUrl;
  }

  async fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`Falha na consulta (${response.status})`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchDailyRate(url) {
    const data = await this.fetchJson(url);
    const rate = Number(data?.clp?.brl);
    const sourceUpdatedAt = normalizeIsoDateTimestamp(data?.date);

    if (!sourceUpdatedAt || !Number.isFinite(rate) || rate <= 0) {
      throw new Error("Cotação diária indisponível");
    }

    return {
      rate,
      sourceUpdatedAt,
      sourceKind: "daily",
      sourceName: "Currency API"
    };
  }

  async fetchBestAvailableRate() {
    try {
      return await this.fetchDailyRate(this.primaryUrl);
    } catch {
      return this.fetchDailyRate(this.fallbackUrl);
    }
  }
}
