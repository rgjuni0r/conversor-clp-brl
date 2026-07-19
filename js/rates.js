export const REALTIME_RATE_API_URL = "https://economia.awesomeapi.com.br/json/last/CLP-BRL";
export const DAILY_RATE_API_URL = "https://open.er-api.com/v6/latest/CLP";
export const RATE_REFRESH_INTERVAL_MS = 60_000;
export const AUTOMATIC_REQUEST_DEBOUNCE_MS = 15_000;
export const DAILY_FALLBACK_INTERVAL_MS = 60 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 10_000;

export function normalizeUnixTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
}

export function formatRateDate(unixTimestamp) {
  if (!unixTimestamp) return null;

  const date = new Date(Number(unixTimestamp) * 1000);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

export class RateService {
  constructor({
    fetchImpl = globalThis.fetch?.bind(globalThis),
    now = () => Date.now(),
    realtimeUrl = REALTIME_RATE_API_URL,
    dailyUrl = DAILY_RATE_API_URL
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("Uma implementação de fetch é obrigatória.");
    }

    this.fetchImpl = fetchImpl;
    this.now = now;
    this.realtimeUrl = realtimeUrl;
    this.dailyUrl = dailyUrl;
    this.lastDailyFallbackAttempt = 0;
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

  async fetchRealtimeRate() {
    const data = await this.fetchJson(this.realtimeUrl);
    const quote = data?.CLPBRL ?? Object.values(data ?? {}).find(item => item?.code === "CLP" && item?.codein === "BRL");
    const bid = Number(quote?.bid);
    const ask = Number(quote?.ask);

    if (!Number.isFinite(bid) || bid <= 0 || !Number.isFinite(ask) || ask <= 0) {
      throw new Error("Cotação intradiária indisponível");
    }

    return {
      rate: (bid + ask) / 2,
      sourceUpdatedAt: normalizeUnixTimestamp(quote.timestamp),
      sourceKind: "realtime",
      sourceName: "AwesomeAPI"
    };
  }

  async fetchDailyRate() {
    const data = await this.fetchJson(this.dailyUrl);
    const rate = Number(data?.rates?.BRL);

    if (data?.result !== "success" || data?.base_code !== "CLP" || !Number.isFinite(rate) || rate <= 0) {
      throw new Error("Cotação diária indisponível");
    }

    return {
      rate,
      sourceUpdatedAt: normalizeUnixTimestamp(data.time_last_update_unix),
      sourceKind: "daily",
      sourceName: "ExchangeRate-API"
    };
  }

  async fetchBestAvailableRate({ forceDailyFallback = false } = {}) {
    try {
      return await this.fetchRealtimeRate();
    } catch (realtimeError) {
      const canTryDaily = forceDailyFallback
        || this.now() - this.lastDailyFallbackAttempt >= DAILY_FALLBACK_INTERVAL_MS;

      if (!canTryDaily) throw realtimeError;

      this.lastDailyFallbackAttempt = this.now();
      return await this.fetchDailyRate();
    }
  }
}
