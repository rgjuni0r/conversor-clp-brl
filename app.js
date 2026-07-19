
const amountInput = document.getElementById("amount");
const result = document.getElementById("result");
const swapButton = document.getElementById("swapButton");
const refreshButton = document.getElementById("refreshButton");
const statusText = document.getElementById("status");
const rateText = document.getElementById("rateText");
const manualRate = document.getElementById("manualRate");
const saveRateButton = document.getElementById("saveRateButton");
const amountLabel = document.getElementById("amountLabel");
const resultLabel = document.getElementById("resultLabel");
const inputSymbol = document.getElementById("inputSymbol");

const REALTIME_RATE_API_URL = "https://economia.awesomeapi.com.br/json/last/CLP-BRL";
const DAILY_RATE_API_URL = "https://open.er-api.com/v6/latest/CLP";
const RATE_REFRESH_INTERVAL_MS = 60_000;
const AUTOMATIC_REQUEST_DEBOUNCE_MS = 15_000;
const DAILY_FALLBACK_INTERVAL_MS = 60 * 60 * 1000;

let direction = "CLP_TO_BRL";
let clpToBrl = Number(localStorage.getItem("clpToBrl")) || 0.00555;
let isUpdatingRate = false;
let decimalPointTyped = false;
let lastAutomaticRateAttempt = 0;
let lastDailyFallbackAttempt = 0;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const brlRate = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 5,
  maximumFractionDigits: 7
});

function groupThousands(value) {
  const normalized = value.replace(/^0+(?=\d)/, "") || "0";
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatClpInput(value) {
  const digits = value.replace(/\D/g, "");
  return digits ? groupThousands(digits) : "";
}

function formatBrlInput(value, { allowDecimalPoint = false } = {}) {
  const clean = value.replace(/[^\d.,]/g, "");
  let decimalIndex = clean.lastIndexOf(",");

  // Um ponto digitado pelo usuário também é aceito como vírgula decimal.
  // Os pontos que a própria máscara adiciona continuam sendo milhares.
  if (decimalIndex === -1 && allowDecimalPoint) {
    decimalIndex = clean.lastIndexOf(".");
  }

  const hasDecimal = decimalIndex !== -1;
  const integerDigits = (hasDecimal ? clean.slice(0, decimalIndex) : clean).replace(/\D/g, "");
  const decimalDigits = hasDecimal ? clean.slice(decimalIndex + 1).replace(/\D/g, "").slice(0, 2) : "";

  if (!integerDigits && !hasDecimal) return "";

  const integerPart = groupThousands(integerDigits || "0");
  return hasDecimal ? `${integerPart},${decimalDigits}` : integerPart;
}

function formatAmountInput(value, options) {
  return direction === "CLP_TO_BRL" ? formatClpInput(value) : formatBrlInput(value, options);
}

function parseAmount(value) {
  if (!value) return 0;

  const normalized = direction === "CLP_TO_BRL"
    ? value.replace(/\D/g, "")
    : value.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function updateUI() {
  const amount = parseAmount(amountInput.value);
  if (direction === "CLP_TO_BRL") {
    result.textContent = brl.format(amount * clpToBrl);
    amountLabel.textContent = "Valor em pesos chilenos";
    resultLabel.textContent = "Resultado em reais";
    inputSymbol.textContent = "$";
  } else {
    result.textContent = clp.format(amount / clpToBrl);
    amountLabel.textContent = "Valor em reais";
    resultLabel.textContent = "Resultado em pesos chilenos";
    inputSymbol.textContent = "R$";
  }
  rateText.textContent = `1 CLP = ${brlRate.format(clpToBrl)}`;
  manualRate.value = clpToBrl.toFixed(7);
}

function formatRateDate(unixTimestamp) {
  if (!unixTimestamp) return null;

  const date = new Date(Number(unixTimestamp) * 1000);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Falha na consulta (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUnixTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
}

async function fetchRealtimeRate() {
  const data = await fetchJson(REALTIME_RATE_API_URL);
  const quote = data?.CLPBRL ?? Object.values(data ?? {}).find(item => item?.code === "CLP" && item?.codein === "BRL");
  const bid = Number(quote?.bid);
  const ask = Number(quote?.ask);

  if (!Number.isFinite(bid) || bid <= 0 || !Number.isFinite(ask) || ask <= 0) {
    throw new Error("Cotação intradiária indisponível");
  }

  return {
    rate: (bid + ask) / 2,
    sourceUpdatedAt: normalizeUnixTimestamp(quote.timestamp),
    sourceKind: "realtime"
  };
}

async function fetchDailyRate() {
  const data = await fetchJson(DAILY_RATE_API_URL);
  const rate = Number(data?.rates?.BRL);

  if (data?.result !== "success" || data?.base_code !== "CLP" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("Cotação diária indisponível");
  }

  return {
    rate,
    sourceUpdatedAt: normalizeUnixTimestamp(data.time_last_update_unix),
    sourceKind: "daily"
  };
}

async function fetchBestAvailableRate({ forceDailyFallback = false } = {}) {
  try {
    return await fetchRealtimeRate();
  } catch (realtimeError) {
    const canTryDaily = forceDailyFallback || Date.now() - lastDailyFallbackAttempt >= DAILY_FALLBACK_INTERVAL_MS;
    if (!canTryDaily) throw realtimeError;

    lastDailyFallbackAttempt = Date.now();
    return await fetchDailyRate();
  }
}

async function updateExchangeRate({ automatic = false } = {}) {
  if (isUpdatingRate) return;
  if (automatic && Date.now() - lastAutomaticRateAttempt < AUTOMATIC_REQUEST_DEBOUNCE_MS) return;

  if (automatic) lastAutomaticRateAttempt = Date.now();
  isUpdatingRate = true;
  refreshButton.disabled = true;
  refreshButton.textContent = "Buscando...";
  statusText.textContent = automatic
    ? "Atualizando a cotação automaticamente..."
    : "Buscando cotação online...";

  try {
    const quote = await fetchBestAvailableRate({ forceDailyFallback: !automatic });
    const sourceUpdatedAt = formatRateDate(quote.sourceUpdatedAt);
    clpToBrl = quote.rate;
    localStorage.setItem("clpToBrl", String(quote.rate));
    localStorage.setItem("rateUpdatedAt", new Date().toISOString());
    localStorage.setItem("rateSourceKind", quote.sourceKind);
    if (quote.sourceUpdatedAt) {
      localStorage.setItem("rateSourceUpdatedAt", String(quote.sourceUpdatedAt));
    }

    if (quote.sourceKind === "realtime") {
      statusText.textContent = sourceUpdatedAt
        ? `Cotação média de mercado atualizada. Referência: ${sourceUpdatedAt}.`
        : "Cotação média de mercado atualizada agora.";
    } else {
      statusText.textContent = sourceUpdatedAt
        ? `Fonte intradiária indisponível. Usando a referência diária de ${sourceUpdatedAt}.`
        : "Fonte intradiária indisponível. Usando a referência diária mais recente.";
    }
    updateUI();
  } catch (error) {
    const savedSourceDate = formatRateDate(localStorage.getItem("rateSourceUpdatedAt"));
    statusText.textContent = savedSourceDate
      ? `Sem nova cotação agora. Usando a última referência salva, de ${savedSourceDate}.`
      : "Não foi possível atualizar agora. A cotação salva continua funcionando.";
  } finally {
    isUpdatingRate = false;
    refreshButton.disabled = false;
    refreshButton.textContent = "Atualizar";
  }
}

amountInput.addEventListener("input", () => {
  const allowDecimalPoint = decimalPointTyped;
  decimalPointTyped = false;
  amountInput.value = formatAmountInput(amountInput.value, { allowDecimalPoint });
  updateUI();
});
amountInput.addEventListener("beforeinput", event => {
  decimalPointTyped = direction === "BRL_TO_CLP" && event.data === ".";
});
amountInput.addEventListener("blur", () => {
  amountInput.value = formatAmountInput(amountInput.value);
  updateUI();
});

swapButton.addEventListener("click", () => {
  direction = direction === "CLP_TO_BRL" ? "BRL_TO_CLP" : "CLP_TO_BRL";
  amountInput.value = "";
  updateUI();
  amountInput.focus();
});

saveRateButton.addEventListener("click", () => {
  const newRate = Number(manualRate.value);
  if (!newRate || newRate <= 0) {
    statusText.textContent = "Digite uma cotação válida.";
    return;
  }
  clpToBrl = newRate;
  localStorage.setItem("clpToBrl", String(clpToBrl));
  localStorage.setItem("rateUpdatedAt", new Date().toISOString());
  localStorage.removeItem("rateSourceUpdatedAt");
  localStorage.removeItem("rateSourceKind");
  statusText.textContent = "Cotação manual salva no aparelho.";
  updateUI();
});

refreshButton.addEventListener("click", () => updateExchangeRate());

updateUI();

window.addEventListener("pageshow", () => updateExchangeRate({ automatic: true }));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    updateExchangeRate({ automatic: true });
  }
});
setInterval(() => {
  if (document.visibilityState === "visible") {
    updateExchangeRate({ automatic: true });
  }
}, RATE_REFRESH_INTERVAL_MS);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}
