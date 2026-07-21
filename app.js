import {
  DIRECTIONS,
  convertAmount,
  formatAmountInput,
  formatBrl,
  formatBrlFromCents,
  formatClpFromPesos,
  formatRate,
  parseAmount,
  splitUnits
} from "./js/money.js";
import {
  calculateTotals,
  clearSession,
  createItem,
  createSession,
  loadSession,
  normalizePeopleCount,
  saveSession,
  updateItem
} from "./js/session-store.js";
import {
  getCurrentCoordinates,
  reverseGeocodeCoordinates
} from "./js/location.js";
import {
  AUTOMATIC_REQUEST_DEBOUNCE_MS,
  RATE_REFRESH_INTERVAL_MS,
  RateService,
  formatRateDate
} from "./js/rates.js";
import {
  createSnowGlobeFrame,
  ShakeDetector
} from "./js/snow-motion.js";
import {
  fetchCurrentWeather,
  formatTemperature,
  getDayPeriodIcon,
  SANTIAGO_COORDINATES,
  WEATHER_REFRESH_INTERVAL_MS
} from "./js/weather.js";

const $ = id => document.getElementById(id);

const elements = {
  amount: $("amount"),
  result: $("result"),
  swapButton: $("swapButton"),
  refreshButton: $("refreshButton"),
  status: $("status"),
  rateText: $("rateText"),
  heroRateText: $("heroRateText"),
  weatherChip: $("weatherChip"),
  weatherIcon: document.querySelector("#weatherChip .weather-icon"),
  weatherPlace: $("weatherPlace"),
  weatherTemperature: $("weatherTemperature"),
  manualRate: $("manualRate"),
  saveRateButton: $("saveRateButton"),
  amountLabel: $("amountLabel"),
  resultLabel: $("resultLabel"),
  inputSymbol: $("inputSymbol"),
  inputCode: $("inputCode"),
  conversionForm: $("conversionForm"),
  tripContext: $("tripContext"),
  locateButton: $("locateButton"),
  tripPlace: $("tripPlace"),
  tripPlaceStatus: $("tripPlaceStatus"),
  itemLabel: $("itemLabel"),
  addItemButton: $("addItemButton"),
  entryCount: $("entryCount"),
  summaryToggle: $("summaryToggle"),
  summaryPanel: $("summaryPanel"),
  clearSummaryButton: $("clearSummaryButton"),
  emptyState: $("emptyState"),
  summaryContent: $("summaryContent"),
  summaryPlace: $("summaryPlace"),
  summaryPlaceName: $("summaryPlaceName"),
  editTripPlaceButton: $("editTripPlaceButton"),
  itemsList: $("itemsList"),
  totalBrl: $("totalBrl"),
  totalClp: $("totalClp"),
  peopleCount: $("peopleCount"),
  decreasePeopleButton: $("decreasePeopleButton"),
  increasePeopleButton: $("increasePeopleButton"),
  perPersonLabel: $("perPersonLabel"),
  perPersonBrl: $("perPersonBrl"),
  perPersonClp: $("perPersonClp"),
  splitNote: $("splitNote"),
  closeAccountButton: $("closeAccountButton"),
  mobileSummaryButton: $("mobileSummaryButton"),
  mobileItemCount: $("mobileItemCount"),
  mobileTotalBrl: $("mobileTotalBrl"),
  mobileTotalClp: $("mobileTotalClp"),
  summaryCard: $("summaryCard"),
  editItemDialog: $("editItemDialog"),
  editItemForm: $("editItemForm"),
  editItemLabel: $("editItemLabel"),
  editItemAmount: $("editItemAmount"),
  editItemAmountLabel: $("editItemAmountLabel"),
  editItemInputSymbol: $("editItemInputSymbol"),
  editItemInputCode: $("editItemInputCode"),
  editItemResultLabel: $("editItemResultLabel"),
  editItemResult: $("editItemResult"),
  editItemRate: $("editItemRate"),
  closeEditItemButton: $("closeEditItemButton"),
  cancelEditItemButton: $("cancelEditItemButton"),
  saveEditItemButton: $("saveEditItemButton"),
  receiptDialog: $("receiptDialog"),
  receiptSubtitle: $("receiptSubtitle"),
  receiptPlace: $("receiptPlace"),
  receiptPlaceName: $("receiptPlaceName"),
  receiptTotalBrl: $("receiptTotalBrl"),
  receiptTotalClp: $("receiptTotalClp"),
  receiptPeople: $("receiptPeople"),
  receiptPerPersonLabel: $("receiptPerPersonLabel"),
  receiptPerPersonBrl: $("receiptPerPersonBrl"),
  receiptPerPersonClp: $("receiptPerPersonClp"),
  receiptSplitNote: $("receiptSplitNote"),
  receiptFeedback: $("receiptFeedback"),
  shareReceiptButton: $("shareReceiptButton"),
  editAccountButton: $("editAccountButton"),
  newAccountButton: $("newAccountButton"),
  confirmDialog: $("confirmDialog"),
  confirmTitle: $("confirmTitle"),
  confirmMessage: $("confirmMessage"),
  cancelConfirmButton: $("cancelConfirmButton"),
  acceptConfirmButton: $("acceptConfirmButton"),
  toast: $("toast")
};

const DIRECTION_UI = Object.freeze({
  [DIRECTIONS.CLP_TO_BRL]: {
    amountLabel: "Valor em pesos chilenos",
    resultLabel: "Resultado em reais",
    inputSymbol: "$",
    inputCode: "CLP",
    placeholder: "8.500"
  },
  [DIRECTIONS.BRL_TO_CLP]: {
    amountLabel: "Valor em reais",
    resultLabel: "Resultado em pesos chilenos",
    inputSymbol: "R$",
    inputCode: "BRL",
    placeholder: "100,00"
  }
});

const RATE_SOURCE_NAMES = Object.freeze({
  realtime: "Referência de mercado",
  daily: "Currency API",
  manual: "Cotação manual",
  cached: "Cache local",
  default: "Referência inicial"
});
const RATE_STORAGE_KEY = "clpBrlRateV2";
const MOTION_PERMISSION_STORAGE_KEY = "clpBrlMotionPermissionV1";

const rateService = new RateService();
const mobileSummaryAccordion = window.matchMedia("(max-width: 820px)");
const mobileMotionPointer = window.matchMedia("(any-pointer: coarse) and (max-width: 1024px)");
const reducedMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const SHAKE_THRESHOLD = 8.2;
const SHAKE_HITS_REQUIRED = 4;
const SHAKE_HIT_WINDOW_MS = 1_700;
const shakeDetector = new ShakeDetector({
  threshold: SHAKE_THRESHOLD,
  hitsRequired: SHAKE_HITS_REQUIRED,
  hitWindowMs: SHAKE_HIT_WINDOW_MS,
  minHitIntervalMs: 100,
  rearmThreshold: 6,
  gravityDeltaScale: 2.4
});
const SNOW_GLOBE_DURATION_MS = 7_000;
const SNOW_GLOBE_STIR_IDLE_MS = 520;
const SNOW_GLOBE_STIR_FRAME_INTERVAL_MS = 48;
const snowMotionState = {
  isListening: false,
  permissionStatus: "unknown",
  permissionGestureArmed: false,
  permissionRequest: null,
  permissionRemembered: readStoredText(MOTION_PERMISSION_STORAGE_KEY) === "granted",
  effectTimer: null,
  stirTimer: null,
  lastStirFrameAt: -Infinity
};
const storedRate = readStoredRateSnapshot();

const state = {
  direction: DIRECTIONS.CLP_TO_BRL,
  clpToBrl: storedRate?.rate ?? 0.00555,
  rateKind: storedRate?.sourceKind ?? "default",
  rateSourceName: storedRate?.sourceName ?? RATE_SOURCE_NAMES.default,
  rateSourceUpdatedAt: storedRate?.sourceUpdatedAt ?? null,
  hasVerifiedRate: Boolean(storedRate),
  isUpdatingRate: false,
  lastAutomaticRateAttempt: 0,
  decimalPointTyped: false,
  editDecimalPointTyped: false,
  editingItemId: null,
  isEditingPlace: false,
  isLocating: false,
  placeWasPersisted: true,
  toastTimer: null,
  confirmationResolver: null,
  isMobileSummaryExpanded: false
};

const weatherState = {
  coordinates: SANTIAGO_COORDINATES,
  placeName: "Santiago, Chile",
  isUpdating: false
};

let session = loadSession();

function readStoredText(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readStoredNumber(key) {
  const value = Number(readStoredText(key));
  return Number.isFinite(value) ? value : 0;
}

function readStoredRateSnapshot() {
  const parseSnapshot = value => {
    if (!value || typeof value !== "object") return null;

    const rate = normalizeRatePrecision(value.rate);
    if (!rate) return null;

    const sourceKind = Object.prototype.hasOwnProperty.call(RATE_SOURCE_NAMES, value.sourceKind)
      ? value.sourceKind
      : "cached";
    const sourceUpdatedAt = Number(value.sourceUpdatedAt);

    return {
      rate,
      sourceKind,
      sourceName: RATE_SOURCE_NAMES[sourceKind],
      sourceUpdatedAt: Number.isFinite(sourceUpdatedAt) && sourceUpdatedAt > 0
        ? sourceUpdatedAt
        : null
    };
  };

  try {
    const current = parseSnapshot(JSON.parse(readStoredText(RATE_STORAGE_KEY) ?? "null"));
    if (current) return current;
  } catch {
    // Uma versão inválida é ignorada e a migração abaixo tenta recuperar o formato anterior.
  }

  const legacyRate = readStoredNumber("clpToBrl");
  if (legacyRate <= 0) return null;

  return parseSnapshot({
    rate: legacyRate,
    sourceKind: readStoredText("rateSourceKind"),
    sourceUpdatedAt: readStoredNumber("rateSourceUpdatedAt")
  });
}

function writeStoredValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeStoredValue(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // O app continua operando em memória quando o armazenamento não está disponível.
  }
}

function persistSession() {
  try {
    session = saveSession(session);
    return true;
  } catch {
    return false;
  }
}

function getCurrentConversion() {
  const amount = parseAmount(elements.amount.value, state.direction);
  if (amount <= 0) return null;

  try {
    return { amount, ...convertAmount(amount, state.direction, state.clpToBrl) };
  } catch {
    return null;
  }
}

function renderConversion() {
  const ui = DIRECTION_UI[state.direction];
  const conversion = getCurrentConversion();

  elements.amountLabel.textContent = ui.amountLabel;
  elements.resultLabel.textContent = ui.resultLabel;
  elements.inputSymbol.textContent = ui.inputSymbol;
  elements.inputCode.textContent = ui.inputCode;
  elements.amount.placeholder = ui.placeholder;

  if (state.direction === DIRECTIONS.CLP_TO_BRL) {
    elements.result.textContent = formatBrlFromCents(conversion?.brlCents ?? 0);
  } else {
    elements.result.textContent = formatClpFromPesos(conversion?.clpPesos ?? 0);
  }

  elements.addItemButton.disabled = !conversion || !state.hasVerifiedRate;
  elements.rateText.textContent = `1 CLP = ${formatRate(state.clpToBrl)}`;
  elements.heroRateText.textContent = `1 CLP · ${formatRate(state.clpToBrl)}`;

  if (document.activeElement !== elements.manualRate) {
    elements.manualRate.value = String(state.clpToBrl);
  }
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function renderItems() {
  const fragment = document.createDocumentFragment();

  session.items.forEach((item, index) => {
    const row = document.createElement("li");
    row.className = "summary-item";

    row.append(createTextElement("span", "item-index", String(index + 1).padStart(2, "0")));

    const main = document.createElement("div");
    main.className = "item-main";
    main.append(createTextElement("strong", "", item.label || `Item ${index + 1}`));

    const values = document.createElement("div");
    values.className = "item-values";
    const clpText = `${formatClpFromPesos(item.clpPesos)} CLP`;
    const brlText = formatBrlFromCents(item.brlCents);

    if (item.sourceCurrency === "BRL") {
      values.append(createTextElement("span", "", brlText));
      values.append(createTextElement("i", "", "→"));
      values.append(createTextElement("span", "", clpText));
    } else {
      values.append(createTextElement("span", "", clpText));
      values.append(createTextElement("i", "", "→"));
      values.append(createTextElement("span", "", brlText));
    }

    main.append(values);
    main.append(createTextElement(
      "small",
      "item-rate",
      `1 CLP = ${formatRate(item.rateClpToBrl)}`
    ));
    row.append(main);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const editButton = createTextElement("button", "edit-item", "✎");
    editButton.type = "button";
    editButton.dataset.editItemId = item.id;
    editButton.setAttribute("aria-label", `Editar ${item.label || `item ${index + 1}`}`);

    const removeButton = createTextElement("button", "remove-item", "×");
    removeButton.type = "button";
    removeButton.dataset.removeItemId = item.id;
    removeButton.setAttribute("aria-label", `Remover ${item.label || `item ${index + 1}`}`);
    actions.append(editButton, removeButton);
    row.append(actions);
    fragment.append(row);
  });

  elements.itemsList.replaceChildren(fragment);
}

function renderTripPlace({ syncInput = true } = {}) {
  const placeName = session.placeName || "";
  const hasPlace = Boolean(placeName);
  const shouldShowEditor = !hasPlace || state.isEditingPlace;

  if (syncInput && document.activeElement !== elements.tripPlace) {
    elements.tripPlace.value = placeName;
  }

  elements.tripContext.hidden = !shouldShowEditor;
  elements.tripPlaceStatus.textContent = hasPlace
    ? "Salvo automaticamente nesta conta."
    : "Digite ou toque no alvo para usar sua localização.";
  elements.summaryPlace.hidden = !hasPlace;
  elements.summaryPlaceName.textContent = placeName;
  elements.summaryCard.classList.toggle("has-trip-place", hasPlace);
  elements.receiptPlace.hidden = !hasPlace;
  elements.receiptPlaceName.textContent = placeName;
}

function getLocationErrorMessage(error) {
  if (error?.code === 1) return "Permissão de localização negada. Digite o lugar manualmente.";
  if (error?.code === 2) return "O aparelho não conseguiu determinar sua localização.";
  if (error?.code === 3) return "A localização demorou demais. Tente novamente.";
  if (error?.message === "GEOLOCATION_UNAVAILABLE") {
    return "Localização indisponível neste navegador. Digite o lugar manualmente.";
  }
  if (!navigator.onLine) return "Sem conexão para identificar o lugar. Digite manualmente.";
  return "Não foi possível identificar o lugar agora. Digite manualmente ou tente novamente.";
}

async function locateTripPlace() {
  if (state.isLocating) return;

  state.isLocating = true;
  elements.locateButton.disabled = true;
  elements.locateButton.classList.add("is-locating");
  elements.locateButton.setAttribute("aria-busy", "true");
  elements.tripPlace.disabled = true;
  elements.tripPlaceStatus.textContent = "Obtendo sua localização…";

  let shouldFocusManualField = false;

  try {
    const coordinates = await getCurrentCoordinates();
    elements.tripPlaceStatus.textContent = "Identificando o nome do lugar…";
    const placeName = await reverseGeocodeCoordinates(coordinates);

    weatherState.coordinates = coordinates;
    weatherState.placeName = placeName || "Local atual";
    void updateWeather();

    session.placeName = placeName;
    const wasPersisted = persistSession();
    state.placeWasPersisted = wasPersisted;
    state.isEditingPlace = false;
    renderTripPlace();
    showToast(wasPersisted
      ? `Localização adicionada: ${session.placeName}.`
      : "Localização adicionada apenas nesta tela.");
  } catch (error) {
    state.isEditingPlace = true;
    renderTripPlace({ syncInput: false });
    elements.tripPlaceStatus.textContent = getLocationErrorMessage(error);
    shouldFocusManualField = true;
  } finally {
    state.isLocating = false;
    elements.locateButton.disabled = false;
    elements.locateButton.classList.remove("is-locating");
    elements.locateButton.setAttribute("aria-busy", "false");
    elements.tripPlace.disabled = false;

    if (shouldFocusManualField) {
      window.setTimeout(() => elements.tripPlace.focus(), 0);
    }
  }
}

async function updateWeather() {
  if (weatherState.isUpdating || !navigator.onLine) return;

  weatherState.isUpdating = true;
  elements.weatherChip.classList.add("is-loading");

  try {
    const weather = await fetchCurrentWeather(weatherState.coordinates);
    elements.weatherPlace.textContent = weatherState.placeName;
    elements.weatherTemperature.textContent = formatTemperature(weather.temperature);
    elements.weatherIcon.textContent = getDayPeriodIcon(weather.isDay);
    elements.weatherChip.classList.toggle("is-day", weather.isDay);
    elements.weatherChip.classList.toggle("is-night", !weather.isDay);
    elements.weatherChip.title = `Temperatura atual em ${weatherState.placeName}`;
    elements.weatherChip.classList.remove("is-unavailable");
  } catch {
    elements.weatherChip.classList.add("is-unavailable");
    elements.weatherChip.title = "Temperatura indisponível no momento";
  } finally {
    weatherState.isUpdating = false;
    elements.weatherChip.classList.remove("is-loading");
  }
}

function getSplitSummary(totals = calculateTotals(session.items)) {
  const people = normalizePeopleCount(session.peopleCount);
  const brlSplit = splitUnits(totals.brlCents, people);
  const clpSplit = splitUnits(totals.clpPesos, people);

  return { people, brlSplit, clpSplit };
}

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

function buildOneCurrencySplitNote(split, people, formatter) {
  if (split.extraPeople === 0) return "";

  const basePeople = people - split.extraPeople;
  const higherPart = `${split.extraPeople} ${pluralize(split.extraPeople, "pessoa paga", "pessoas pagam")} ${formatter(split.higherUnits)}`;
  const basePart = basePeople > 0
    ? ` e ${basePeople} ${pluralize(basePeople, "paga", "pagam")} ${formatter(split.baseUnits)}`
    : "";

  return `${higherPart}${basePart}`;
}

function buildSplitNote(splitSummary) {
  const brlNote = buildOneCurrencySplitNote(splitSummary.brlSplit, splitSummary.people, formatBrlFromCents);
  const clpNote = buildOneCurrencySplitNote(
    splitSummary.clpSplit,
    splitSummary.people,
    value => `${formatClpFromPesos(value)} CLP`
  );

  if (!brlNote && !clpNote) return "Divisão exata, sem diferença de arredondamento.";

  return `Ajuste do arredondamento: ${[brlNote, clpNote].filter(Boolean).join(". Em pesos: ")}.`;
}

function renderSummary() {
  const totals = calculateTotals(session.items);
  const hasItems = totals.itemCount > 0;
  const splitSummary = getSplitSummary(totals);
  const hasRoundingAdjustment = splitSummary.brlSplit.extraPeople > 0
    || splitSummary.clpSplit.extraPeople > 0;

  elements.entryCount.textContent = String(totals.itemCount);
  elements.clearSummaryButton.disabled = !hasItems;
  elements.emptyState.hidden = hasItems;
  elements.summaryContent.hidden = !hasItems;
  elements.peopleCount.value = String(splitSummary.people);
  elements.decreasePeopleButton.disabled = splitSummary.people <= 1;
  elements.increasePeopleButton.disabled = splitSummary.people >= 99;

  elements.totalBrl.textContent = formatBrlFromCents(totals.brlCents);
  elements.totalClp.textContent = `${formatClpFromPesos(totals.clpPesos)} CLP`;
  elements.perPersonLabel.textContent = hasRoundingAdjustment ? "Parcela-base" : "Por pessoa";
  elements.perPersonBrl.textContent = formatBrlFromCents(splitSummary.brlSplit.baseUnits);
  elements.perPersonClp.textContent = `${formatClpFromPesos(splitSummary.clpSplit.baseUnits)} CLP`;
  elements.splitNote.textContent = buildSplitNote(splitSummary);

  elements.mobileSummaryButton.hidden = !hasItems;
  elements.mobileItemCount.textContent = `${totals.itemCount} ${pluralize(totals.itemCount, "item", "itens")}`;
  elements.mobileTotalBrl.textContent = formatBrlFromCents(totals.brlCents);
  const mobileClpValue = formatClpFromPesos(totals.clpPesos).replace("$", "").trim();
  elements.mobileTotalClp.textContent = `$ ${mobileClpValue} CLP`;
  document.body.classList.toggle("has-summary", hasItems);

  renderItems();
}

function renderReceipt() {
  const totals = calculateTotals(session.items);
  const splitSummary = getSplitSummary(totals);
  const hasRoundingAdjustment = splitSummary.brlSplit.extraPeople > 0
    || splitSummary.clpSplit.extraPeople > 0;

  elements.receiptSubtitle.textContent = `${totals.itemCount} ${pluralize(totals.itemCount, "item registrado", "itens registrados")}`;
  elements.receiptTotalBrl.textContent = formatBrlFromCents(totals.brlCents);
  elements.receiptTotalClp.textContent = `${formatClpFromPesos(totals.clpPesos)} CLP`;
  elements.receiptPeople.textContent = String(splitSummary.people);
  elements.receiptPerPersonLabel.textContent = hasRoundingAdjustment ? "Parcela-base" : "Por pessoa";
  elements.receiptPerPersonBrl.textContent = formatBrlFromCents(splitSummary.brlSplit.baseUnits);
  elements.receiptPerPersonClp.textContent = `${formatClpFromPesos(splitSummary.clpSplit.baseUnits)} CLP`;
  elements.receiptSplitNote.textContent = buildSplitNote(splitSummary);
  elements.receiptFeedback.textContent = "";
  renderTripPlace();
}

function renderAll() {
  renderConversion();
  renderTripPlace();
  renderSummary();
}

function syncSummaryAccordion() {
  const isMobile = mobileSummaryAccordion.matches;
  const isExpanded = !isMobile || state.isMobileSummaryExpanded;

  if (!isExpanded && elements.summaryPanel.contains(document.activeElement)) {
    elements.summaryToggle.focus();
  }

  elements.summaryToggle.disabled = !isMobile;
  elements.summaryToggle.setAttribute("aria-expanded", String(isExpanded));
  elements.summaryPanel.hidden = !isExpanded;
  elements.summaryCard.classList.toggle("is-collapsed", isMobile && !isExpanded);

  if (isMobile) {
    elements.summaryToggle.setAttribute(
      "aria-label",
      isExpanded ? "Recolher resumo da conta" : "Expandir resumo da conta"
    );
  } else {
    elements.summaryToggle.removeAttribute("aria-label");
  }
}

function setMobileSummaryExpanded(isExpanded) {
  state.isMobileSummaryExpanded = Boolean(isExpanded);
  syncSummaryAccordion();
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function isMotionMobileDevice() {
  return mobileSummaryAccordion.matches
    || mobileMotionPointer.matches;
}

function canRunMotionSnow() {
  return isMotionMobileDevice()
    && !reducedMotionPreference.matches
    && document.visibilityState === "visible";
}

function clearSnowGlobeStir() {
  window.clearTimeout(snowMotionState.stirTimer);
  snowMotionState.stirTimer = null;
  snowMotionState.lastStirFrameAt = -Infinity;
  document.body.classList.remove("snow-globe-stirring");
}

function stirSnowGlobe(motionSample, timestamp) {
  if (!canRunMotionSnow()) return;

  const frame = createSnowGlobeFrame({
    magnitude: motionSample.magnitude,
    vector: shakeDetector.getMotionVector()
  });
  if (!frame.active) return;

  window.clearTimeout(snowMotionState.stirTimer);
  snowMotionState.stirTimer = window.setTimeout(clearSnowGlobeStir, SNOW_GLOBE_STIR_IDLE_MS);

  if (timestamp - snowMotionState.lastStirFrameAt < SNOW_GLOBE_STIR_FRAME_INTERVAL_MS) return;
  snowMotionState.lastStirFrameAt = timestamp;

  const rootStyle = document.body.style;
  rootStyle.setProperty("--snow-stir-layer-start", `${frame.layerStart.toFixed(2)}vw`);
  rootStyle.setProperty("--snow-stir-layer-end", `${frame.layerEnd.toFixed(2)}vw`);
  rootStyle.setProperty("--snow-extra-drift", `${frame.extraDrift.toFixed(2)}px`);
  rootStyle.setProperty("--snow-stir-intensity", frame.intensity.toFixed(3));
  rootStyle.setProperty("--snow-stir-duration", `${frame.durationMs}ms`);
  rootStyle.setProperty(
    "--snow-stir-speed-scale",
    Math.max(.3, .72 - frame.intensity * .42).toFixed(3)
  );
  document.body.classList.add("snow-globe-stirring");
}

function stopSnowGlobeEffect() {
  window.clearTimeout(snowMotionState.effectTimer);
  snowMotionState.effectTimer = null;
  clearSnowGlobeStir();
  document.body.classList.remove("snow-globe-active");
}

function triggerSnowGlobeEffect() {
  if (!canRunMotionSnow()) return;

  window.clearTimeout(snowMotionState.effectTimer);
  document.body.classList.remove("snow-globe-active");
  void document.body.offsetWidth;
  document.body.classList.add("snow-globe-active");

  snowMotionState.effectTimer = window.setTimeout(() => {
    document.body.classList.remove("snow-globe-active");
    snowMotionState.effectTimer = null;
  }, SNOW_GLOBE_DURATION_MS);
}

function hasUsableMotionData(event) {
  return [event?.acceleration, event?.accelerationIncludingGravity].some(vector =>
    [vector?.x, vector?.y, vector?.z].some(value =>
      value != null && Number.isFinite(Number(value))
    )
  );
}

function rememberMotionPermission() {
  snowMotionState.permissionRemembered = true;
  writeStoredValue(MOTION_PERMISSION_STORAGE_KEY, "granted");
}

function forgetRememberedMotionPermission() {
  snowMotionState.permissionRemembered = false;
  removeStoredValue(MOTION_PERMISSION_STORAGE_KEY);
}

function confirmMotionPermissionFromEvent(event) {
  if (
    snowMotionState.permissionStatus === "granted"
    || !hasUsableMotionData(event)
  ) {
    return;
  }

  snowMotionState.permissionStatus = "granted";
  rememberMotionPermission();
  disarmMotionPermissionGesture();
}

function handleDeviceMotion(event) {
  confirmMotionPermissionFromEvent(event);

  const timestamp = performance.now();
  const motionSample = shakeDetector.analyze(event, timestamp);
  stirSnowGlobe(motionSample, timestamp);
  if (!motionSample.registered) return;

  if (motionSample.triggered) triggerSnowGlobeEffect();
}

function startMotionListener() {
  if (
    snowMotionState.isListening
    || !canRunMotionSnow()
  ) {
    return;
  }

  shakeDetector.reset();
  window.addEventListener("devicemotion", handleDeviceMotion, { passive: true });
  snowMotionState.isListening = true;
}

function stopMotionListener() {
  if (!snowMotionState.isListening) return;

  window.removeEventListener("devicemotion", handleDeviceMotion);
  shakeDetector.reset();
  snowMotionState.isListening = false;
}

function disarmMotionPermissionGesture() {
  if (!snowMotionState.permissionGestureArmed) return;

  document.removeEventListener("click", requestMotionPermissionFromGesture, true);
  snowMotionState.permissionGestureArmed = false;
}

function handleMotionPermissionFailure({ fromGesture }) {
  if (snowMotionState.permissionStatus === "granted") return true;

  if (fromGesture) {
    snowMotionState.permissionStatus = "denied";
  } else {
    snowMotionState.permissionStatus = "unknown";
    forgetRememberedMotionPermission();
  }

  return false;
}

function requestMotionPermission({ fromGesture = false } = {}) {
  if (snowMotionState.permissionRequest) return snowMotionState.permissionRequest;

  const MotionEvent = window.DeviceMotionEvent;
  if (typeof MotionEvent?.requestPermission !== "function") {
    return Promise.resolve(false);
  }

  snowMotionState.permissionStatus = fromGesture ? "requesting" : "checking";
  const wasRemembered = snowMotionState.permissionRemembered;
  let browserRequest;

  try {
    // Precisa acontecer diretamente dentro do clique quando o navegador ainda está em "prompt".
    browserRequest = MotionEvent.requestPermission();
  } catch {
    handleMotionPermissionFailure({ fromGesture });
    if (!fromGesture) armMotionPermissionGesture();
    return Promise.resolve(false);
  }

  const pendingRequest = Promise.resolve(browserRequest)
    .then(permission => {
      if (permission !== "granted") {
        if (snowMotionState.permissionStatus === "granted") return true;

        snowMotionState.permissionStatus = fromGesture ? "denied" : "unknown";
        forgetRememberedMotionPermission();
        return false;
      }

      snowMotionState.permissionStatus = "granted";
      rememberMotionPermission();
      disarmMotionPermissionGesture();
      startMotionListener();

      if (fromGesture && !wasRemembered) {
        showToast("Globo de neve ativado — agora agite o celular.");
      }

      return true;
    })
    .catch(() => handleMotionPermissionFailure({ fromGesture }))
    .finally(() => {
      if (snowMotionState.permissionRequest === pendingRequest) {
        snowMotionState.permissionRequest = null;
      }

      if (snowMotionState.permissionStatus === "unknown") {
        armMotionPermissionGesture();
      }
    });

  snowMotionState.permissionRequest = pendingRequest;
  return pendingRequest;
}

function requestMotionPermissionFromGesture(event) {
  if (
    !event.isTrusted
    || (
      event.target instanceof Element
      && event.target.closest("a[href], [data-skip-motion-permission]")
    )
  ) {
    return;
  }

  disarmMotionPermissionGesture();
  if (!canRunMotionSnow()) return;

  void requestMotionPermission({ fromGesture: true });
}

function armMotionPermissionGesture() {
  if (
    snowMotionState.permissionGestureArmed
    || snowMotionState.permissionStatus !== "unknown"
    || snowMotionState.permissionRequest
    || !canRunMotionSnow()
  ) {
    return;
  }

  document.addEventListener("click", requestMotionPermissionFromGesture, {
    capture: true
  });
  snowMotionState.permissionGestureArmed = true;
}

function syncMotionSnow() {
  const canUseMotion = canRunMotionSnow()
    && typeof window.DeviceMotionEvent !== "undefined";

  if (!canUseMotion) {
    disarmMotionPermissionGesture();
    stopMotionListener();
    stopSnowGlobeEffect();
    return;
  }

  const MotionEvent = window.DeviceMotionEvent;
  if (typeof MotionEvent.requestPermission === "function") {
    if (snowMotionState.permissionStatus === "granted") {
      startMotionListener();
    } else if (
      snowMotionState.permissionStatus === "unknown"
      && snowMotionState.permissionRemembered
    ) {
      // O listener é anexado antes da checagem: o WebKit o retoma sem novo prompt
      // quando a autorização da origem ainda está válida.
      startMotionListener();
      void requestMotionPermission();
    } else if (snowMotionState.permissionStatus === "unknown") {
      armMotionPermissionGesture();
    }
    return;
  }

  snowMotionState.permissionStatus = "granted";
  startMotionListener();
}

function showReceiptFeedback(message) {
  elements.receiptFeedback.textContent = "";
  window.setTimeout(() => {
    elements.receiptFeedback.textContent = message;
  }, 0);
}

function normalizeRatePrecision(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const normalizedRate = Number(rate.toFixed(10));
  return normalizedRate > 0 ? normalizedRate : null;
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
    return;
  }

  dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
    return;
  }

  dialog.removeAttribute("open");
}

function settleConfirmation(accepted) {
  const resolve = state.confirmationResolver;
  state.confirmationResolver = null;

  closeDialog(elements.confirmDialog);

  resolve?.(accepted);
}

function requestConfirmation({ title, message, confirmLabel, cancelLabel }) {
  if (state.confirmationResolver) settleConfirmation(false);

  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.acceptConfirmButton.textContent = confirmLabel;
  elements.cancelConfirmButton.textContent = cancelLabel;

  return new Promise(resolve => {
    state.confirmationResolver = resolve;

    openDialog(elements.confirmDialog);

    window.setTimeout(() => elements.cancelConfirmButton.focus(), 0);
  });
}

function getEditingItem() {
  return session.items.find(item => item.id === state.editingItemId) ?? null;
}

function formatItemSourceInput(item) {
  if (item.direction === DIRECTIONS.CLP_TO_BRL) {
    return formatAmountInput(String(item.clpPesos), item.direction);
  }

  const reais = Math.floor(item.brlCents / 100);
  const centavos = String(item.brlCents % 100).padStart(2, "0");
  return formatAmountInput(`${reais},${centavos}`, item.direction);
}

function getEditedConversion() {
  const item = getEditingItem();
  if (!item) return null;

  const amount = parseAmount(elements.editItemAmount.value, item.direction);
  if (amount <= 0) return null;

  try {
    return convertAmount(amount, item.direction, item.rateClpToBrl);
  } catch {
    return null;
  }
}

function renderItemEditor() {
  const item = getEditingItem();
  if (!item) return;

  const ui = DIRECTION_UI[item.direction];
  const conversion = getEditedConversion();
  elements.editItemAmountLabel.textContent = ui.amountLabel;
  elements.editItemInputSymbol.textContent = ui.inputSymbol;
  elements.editItemInputCode.textContent = ui.inputCode;
  elements.editItemResultLabel.textContent = ui.resultLabel;
  elements.editItemResult.textContent = item.direction === DIRECTIONS.CLP_TO_BRL
    ? formatBrlFromCents(conversion?.brlCents ?? 0)
    : formatClpFromPesos(conversion?.clpPesos ?? 0);
  elements.editItemRate.textContent = `Cotação preservada · 1 CLP = ${formatRate(item.rateClpToBrl)}`;
  elements.saveEditItemButton.disabled = !conversion;
}

function openItemEditor(itemId) {
  const item = session.items.find(candidate => candidate.id === itemId);
  if (!item) return;

  state.editingItemId = item.id;
  state.editDecimalPointTyped = false;
  elements.editItemLabel.value = item.label;
  elements.editItemAmount.value = formatItemSourceInput(item);
  renderItemEditor();
  openDialog(elements.editItemDialog);

  window.setTimeout(() => {
    const initialField = item.label ? elements.editItemLabel : elements.editItemAmount;
    initialField.focus();
    initialField.select();
  }, 0);
}

function closeItemEditor() {
  state.editingItemId = null;
  state.editDecimalPointTyped = false;
  closeDialog(elements.editItemDialog);
}

function saveEditedItem() {
  const item = getEditingItem();
  const conversion = getEditedConversion();
  if (!item || !conversion) {
    elements.editItemAmount.focus();
    return;
  }

  try {
    const updatedItem = updateItem(item, {
      label: elements.editItemLabel.value,
      clpPesos: conversion.clpPesos,
      brlCents: conversion.brlCents
    });
    const nextItems = session.items.map(candidate => (
      candidate.id === item.id ? updatedItem : candidate
    ));
    calculateTotals(nextItems);

    session.items = nextItems;
    session.status = "open";
    const wasPersisted = persistSession();
    closeItemEditor();
    renderSummary();
    showToast(wasPersisted
      ? "Item atualizado."
      : "Item atualizado apenas nesta tela; não foi possível salvar a alteração.");

    const editedButton = [...elements.itemsList.querySelectorAll("button[data-edit-item-id]")]
      .find(button => button.dataset.editItemId === item.id);
    editedButton?.focus();
  } catch {
    elements.editItemRate.textContent = "Esse valor é muito alto ou inválido para salvar.";
    elements.editItemAmount.focus();
  }
}

async function confirmItemRemoval(itemId) {
  const item = session.items.find(candidate => candidate.id === itemId);
  if (!item) return;

  const itemName = item.label || "este item";
  const confirmed = await requestConfirmation({
    title: "Remover este item?",
    message: `${itemName} será removido do resumo. Esta ação não pode ser desfeita.`,
    confirmLabel: "Sim, remover",
    cancelLabel: "Manter item"
  });

  if (confirmed) removeItem(item.id);
}

function addCurrentConversion() {
  const conversion = getCurrentConversion();
  if (!conversion) {
    elements.amount.focus();
    return;
  }

  try {
    const item = createItem({
      label: elements.itemLabel.value,
      direction: state.direction,
      clpPesos: conversion.clpPesos,
      brlCents: conversion.brlCents,
      rateClpToBrl: state.clpToBrl,
      rateKind: state.rateKind,
      rateSource: state.rateSourceName,
      rateSourceUpdatedAt: state.rateSourceUpdatedAt
    });

    calculateTotals([...session.items, item]);
    session.items.push(item);
    session.status = "open";
    const wasPersisted = persistSession();

    elements.amount.value = "";
    elements.itemLabel.value = "";
    renderAll();
    showToast(wasPersisted
      ? "Item adicionado ao resumo."
      : "Item adicionado apenas nesta tela; não foi possível salvá-lo no aparelho.");
    elements.amount.focus();
  } catch {
    showToast("Esse valor é muito alto ou inválido para adicionar.");
  }
}

function removeItem(itemId) {
  const removedIndex = session.items.findIndex(item => item.id === itemId);
  if (removedIndex === -1) return;

  const previousLength = session.items.length;
  session.items = session.items.filter(item => item.id !== itemId);
  if (session.items.length === previousLength) return;

  session.status = "open";
  const wasPersisted = persistSession();
  renderSummary();
  showToast(wasPersisted
    ? "Item removido do resumo."
    : "Item removido apenas desta tela; não foi possível salvar a alteração.");

  const remainingButtons = elements.itemsList.querySelectorAll("button[data-remove-item-id]");
  const nextButton = remainingButtons[Math.min(removedIndex, remainingButtons.length - 1)];
  if (nextButton) nextButton.focus();
  else elements.amount.focus();
}

function updatePeopleCount(value) {
  const people = normalizePeopleCount(value);
  if (people === session.peopleCount) {
    elements.peopleCount.value = String(people);
    return;
  }

  session.peopleCount = people;
  session.status = "open";
  const wasPersisted = persistSession();
  renderSummary();
  if (!wasPersisted) showToast("A divisão mudou apenas nesta tela; não foi possível salvá-la.");
}

function resetAccount({ preservePlace = false } = {}) {
  const placeName = preservePlace ? session.placeName : "";

  try {
    clearSession();
  } catch {
    // A conta ainda pode ser reiniciada em memória se o storage estiver bloqueado.
  }
  session = createSession();
  session.placeName = placeName;
  const wasPersisted = persistSession();
  elements.amount.value = "";
  elements.itemLabel.value = "";
  renderAll();
  return wasPersisted;
}

function buildShareText() {
  const totals = calculateTotals(session.items);
  const splitSummary = getSplitSummary(totals);
  const hasRoundingAdjustment = splitSummary.brlSplit.extraPeople > 0
    || splitSummary.clpSplit.extraPeople > 0;
  const splitLabel = hasRoundingAdjustment ? "Parcela-base" : "Por pessoa";
  const lines = [
    "CLP ⬌ BRL · Resumo da viagem",
    ...(session.placeName ? [`Lugar: ${session.placeName}`] : []),
    "",
    ...session.items.map((item, index) => (
      `${index + 1}. ${item.label || `Item ${index + 1}`} — ${formatClpFromPesos(item.clpPesos)} CLP · ${formatBrlFromCents(item.brlCents)}`
    )),
    "",
    `Total: ${formatClpFromPesos(totals.clpPesos)} CLP · ${formatBrlFromCents(totals.brlCents)}`,
    `Pessoas: ${splitSummary.people}`,
    `${splitLabel}: ${formatClpFromPesos(splitSummary.clpSplit.baseUnits)} CLP · ${formatBrlFromCents(splitSummary.brlSplit.baseUnits)}`,
    buildSplitNote(splitSummary),
    "",
    "Valores de referência. Taxas da instituição podem variar."
  ];

  return lines.join("\n");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // O fallback abaixo cobre permissões negadas ou indisponibilidade temporária.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  const copyContainer = elements.receiptDialog.open
    ? elements.receiptDialog.querySelector(".receipt-sheet")
    : document.body;
  copyContainer.append(textarea);

  let copied = false;
  try {
    textarea.select();
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }

  if (!copied) throw new Error("Cópia indisponível");
}

async function shareReceipt() {
  const text = buildShareText();

  if (navigator.share) {
    try {
      await navigator.share({ title: "CLP ⬌ BRL", text });
      showReceiptFeedback("Resumo compartilhado.");
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  try {
    await copyText(text);
    showReceiptFeedback("Resumo copiado para a área de transferência.");
  } catch {
    showReceiptFeedback("Não foi possível compartilhar neste navegador.");
  }
}

function saveCurrentRate({ rate, sourceKind, sourceName, sourceUpdatedAt }) {
  const normalizedRate = normalizeRatePrecision(rate);
  if (!normalizedRate) throw new RangeError("Cotação fora da precisão suportada.");

  state.clpToBrl = normalizedRate;
  state.rateKind = sourceKind;
  state.rateSourceName = sourceName;
  state.rateSourceUpdatedAt = sourceUpdatedAt;
  state.hasVerifiedRate = true;

  const wasPersisted = writeStoredValue(RATE_STORAGE_KEY, JSON.stringify({
    rate: normalizedRate,
    sourceKind,
    sourceUpdatedAt
  }));

  if (wasPersisted) {
    removeStoredValue("clpToBrl");
    removeStoredValue("rateUpdatedAt");
    removeStoredValue("rateSourceKind");
    removeStoredValue("rateSourceUpdatedAt");
  }

  return wasPersisted;
}

async function updateExchangeRate({ automatic = false } = {}) {
  if (state.isUpdatingRate) return;
  if (automatic && Date.now() - state.lastAutomaticRateAttempt < AUTOMATIC_REQUEST_DEBOUNCE_MS) return;

  if (automatic) state.lastAutomaticRateAttempt = Date.now();
  state.isUpdatingRate = true;
  elements.refreshButton.disabled = true;
  elements.refreshButton.querySelector("span:last-child").textContent = "Buscando";
  elements.status.textContent = automatic
    ? "Atualizando a cotação em segundo plano…"
    : "Buscando a cotação mais recente…";

  try {
    const quote = await rateService.fetchBestAvailableRate();
    const wasPersisted = saveCurrentRate(quote);
    const sourceDate = formatRateDate(quote.sourceUpdatedAt, {
      includeTime: quote.sourceKind !== "daily"
    });

    elements.status.textContent = sourceDate
      ? `Referência cambial de ${sourceDate} · atualizada automaticamente.`
      : "Referência cambial atualizada automaticamente.";
    if (!wasPersisted) {
      elements.status.textContent += " Não foi possível salvá-la para uso offline.";
    }

    renderConversion();
  } catch {
    const savedDate = formatRateDate(state.rateSourceUpdatedAt, {
      includeTime: state.rateKind !== "daily"
    });
    if (state.hasVerifiedRate) {
      elements.status.textContent = savedDate
        ? `Sem nova cotação agora · usando a referência salva de ${savedDate}.`
        : "Sem nova cotação agora · usando a última referência validada nesta tela.";
    } else {
      elements.status.textContent = "Não foi possível validar a cotação. O valor exibido é apenas uma estimativa inicial; atualize ou ajuste a taxa manualmente para adicionar itens.";
    }
    renderConversion();
  } finally {
    state.isUpdatingRate = false;
    elements.refreshButton.disabled = false;
    elements.refreshButton.querySelector("span:last-child").textContent = "Atualizar";
  }
}

elements.amount.addEventListener("beforeinput", event => {
  state.decimalPointTyped = state.direction === DIRECTIONS.BRL_TO_CLP && event.data === ".";
});

elements.amount.addEventListener("input", () => {
  const allowDecimalPoint = state.decimalPointTyped;
  state.decimalPointTyped = false;
  elements.amount.value = formatAmountInput(elements.amount.value, state.direction, { allowDecimalPoint });
  renderConversion();
});

elements.amount.addEventListener("blur", () => {
  elements.amount.value = formatAmountInput(elements.amount.value, state.direction);
  renderConversion();
});

elements.locateButton.addEventListener("click", () => {
  void locateTripPlace();
});

elements.tripPlace.addEventListener("input", () => {
  session.placeName = elements.tripPlace.value;
  const wasPersisted = persistSession();
  state.placeWasPersisted = wasPersisted;
  renderTripPlace({ syncInput: false });

  if (!wasPersisted) {
    elements.tripPlaceStatus.textContent = "Salvo apenas nesta tela.";
  }
});

elements.tripPlace.addEventListener("focus", () => {
  state.isEditingPlace = true;
});

elements.tripPlace.addEventListener("blur", () => {
  state.isEditingPlace = false;
  renderTripPlace();
  if (!state.placeWasPersisted) showToast("O lugar ficou salvo apenas nesta tela.");
});
elements.tripPlace.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  elements.tripPlace.blur();
});

elements.editTripPlaceButton.addEventListener("click", () => {
  state.isEditingPlace = true;
  renderTripPlace();
  elements.tripContext.scrollIntoView({
    behavior: reducedMotionPreference.matches ? "auto" : "smooth",
    block: "center"
  });
  window.setTimeout(() => {
    elements.tripPlace.focus({ preventScroll: true });
    elements.tripPlace.select();
  }, reducedMotionPreference.matches ? 0 : 220);
});

elements.swapButton.addEventListener("click", () => {
  state.direction = state.direction === DIRECTIONS.CLP_TO_BRL
    ? DIRECTIONS.BRL_TO_CLP
    : DIRECTIONS.CLP_TO_BRL;
  elements.amount.value = "";
  renderConversion();
  elements.amount.focus();
});

elements.conversionForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!elements.addItemButton.disabled) addCurrentConversion();
});

elements.refreshButton.addEventListener("click", () => updateExchangeRate());

elements.saveRateButton.addEventListener("click", () => {
  const rate = normalizeRatePrecision(elements.manualRate.value);
  if (!rate) {
    elements.status.textContent = "Digite uma cotação manual válida e maior que zero.";
    return;
  }

  const wasPersisted = saveCurrentRate({
    rate,
    sourceKind: "manual",
    sourceName: RATE_SOURCE_NAMES.manual,
    sourceUpdatedAt: Math.floor(Date.now() / 1000)
  });
  elements.status.textContent = "Cotação manual salva. A próxima atualização online poderá substituí-la.";
  renderConversion();
  showToast(wasPersisted
    ? "Cotação manual aplicada."
    : "Cotação aplicada apenas nesta tela; não foi possível salvá-la no aparelho.");
});

elements.itemsList.addEventListener("click", event => {
  const editButton = event.target.closest("button[data-edit-item-id]");
  if (editButton) {
    openItemEditor(editButton.dataset.editItemId);
    return;
  }

  const removeButton = event.target.closest("button[data-remove-item-id]");
  if (removeButton) void confirmItemRemoval(removeButton.dataset.removeItemId);
});

elements.editItemAmount.addEventListener("beforeinput", event => {
  const item = getEditingItem();
  state.editDecimalPointTyped = item?.direction === DIRECTIONS.BRL_TO_CLP
    && event.data === ".";
});

elements.editItemAmount.addEventListener("input", () => {
  const item = getEditingItem();
  if (!item) return;

  const allowDecimalPoint = state.editDecimalPointTyped;
  state.editDecimalPointTyped = false;
  elements.editItemAmount.value = formatAmountInput(
    elements.editItemAmount.value,
    item.direction,
    { allowDecimalPoint }
  );
  renderItemEditor();
});

elements.editItemAmount.addEventListener("blur", () => {
  const item = getEditingItem();
  if (!item) return;

  elements.editItemAmount.value = formatAmountInput(elements.editItemAmount.value, item.direction);
  renderItemEditor();
});

elements.editItemForm.addEventListener("submit", event => {
  event.preventDefault();
  saveEditedItem();
});

elements.closeEditItemButton.addEventListener("click", closeItemEditor);
elements.cancelEditItemButton.addEventListener("click", closeItemEditor);

elements.editItemDialog.addEventListener("cancel", event => {
  event.preventDefault();
  closeItemEditor();
});

elements.editItemDialog.addEventListener("click", event => {
  if (event.target !== elements.editItemDialog) return;

  const bounds = elements.editItemDialog.getBoundingClientRect();
  const clickedInside = event.clientX >= bounds.left
    && event.clientX <= bounds.right
    && event.clientY >= bounds.top
    && event.clientY <= bounds.bottom;

  if (!clickedInside) closeItemEditor();
});

elements.decreasePeopleButton.addEventListener("click", () => updatePeopleCount(session.peopleCount - 1));
elements.increasePeopleButton.addEventListener("click", () => updatePeopleCount(session.peopleCount + 1));
elements.peopleCount.addEventListener("change", () => updatePeopleCount(elements.peopleCount.value));
elements.peopleCount.addEventListener("blur", () => updatePeopleCount(elements.peopleCount.value));

elements.clearSummaryButton.addEventListener("click", async () => {
  if (!session.items.length) return;

  const itemCount = session.items.length;
  const confirmed = await requestConfirmation({
    title: "Limpar todo o resumo?",
    message: `${itemCount === 1 ? "O item deste resumo será removido" : `Os ${itemCount} itens deste resumo serão removidos`}. Esta ação não pode ser desfeita.`,
    confirmLabel: "Sim, limpar",
    cancelLabel: "Manter conta"
  });

  if (!confirmed) return;
  const keptPlace = Boolean(session.placeName);
  const wasPersisted = resetAccount({ preservePlace: true });
  showToast(wasPersisted
    ? `Resumo limpo.${keptPlace ? " O lugar foi mantido." : ""}`
    : "Resumo limpo apenas nesta tela; não foi possível salvar a alteração.");
  elements.amount.focus();
});

elements.closeAccountButton.addEventListener("click", () => {
  if (!session.items.length) return;
  session.status = "closed";
  const wasPersisted = persistSession();
  renderReceipt();
  openDialog(elements.receiptDialog);
  if (!wasPersisted) {
    showReceiptFeedback("A conta foi fechada apenas nesta tela; não foi possível salvar o estado.");
  }
});

elements.editAccountButton.addEventListener("click", () => {
  session.status = "open";
  const wasPersisted = persistSession();
  closeDialog(elements.receiptDialog);
  if (!wasPersisted) showToast("A conta continua aberta apenas nesta tela.");
  elements.amount.focus();
});

elements.newAccountButton.addEventListener("click", async () => {
  const itemCount = session.items.length;
  const placeMessage = session.placeName ? " e o lugar definido" : "";
  const confirmed = await requestConfirmation({
    title: "Começar uma nova conta?",
    message: `A conta atual, com ${itemCount} ${pluralize(itemCount, "item", "itens")}${placeMessage}, será apagada para você começar do zero.`,
    confirmLabel: "Apagar e começar",
    cancelLabel: "Voltar ao recibo"
  });

  if (!confirmed) return;
  const wasPersisted = resetAccount();
  closeDialog(elements.receiptDialog);
  showToast(wasPersisted
    ? "Nova conta iniciada."
    : "Nova conta iniciada apenas nesta tela; não foi possível salvá-la.");
  elements.amount.focus();
});

elements.receiptDialog.addEventListener("close", () => {
  if (session.status !== "closed") return;

  session.status = "open";
  const wasPersisted = persistSession();
  if (!wasPersisted) showToast("A conta foi reaberta apenas nesta tela.");
});

elements.cancelConfirmButton.addEventListener("click", () => settleConfirmation(false));
elements.acceptConfirmButton.addEventListener("click", () => settleConfirmation(true));

elements.confirmDialog.addEventListener("cancel", event => {
  event.preventDefault();
  settleConfirmation(false);
});

elements.confirmDialog.addEventListener("click", event => {
  if (event.target !== elements.confirmDialog) return;

  const bounds = elements.confirmDialog.getBoundingClientRect();
  const clickedInside = event.clientX >= bounds.left
    && event.clientX <= bounds.right
    && event.clientY >= bounds.top
    && event.clientY <= bounds.bottom;

  if (!clickedInside) settleConfirmation(false);
});

elements.shareReceiptButton.addEventListener("click", shareReceipt);

elements.summaryToggle.addEventListener("click", () => {
  if (!mobileSummaryAccordion.matches) return;
  setMobileSummaryExpanded(!state.isMobileSummaryExpanded);
});

elements.mobileSummaryButton.addEventListener("click", () => {
  setMobileSummaryExpanded(true);
  elements.summaryCard.scrollIntoView({
    behavior: reducedMotionPreference.matches ? "auto" : "smooth",
    block: "start"
  });
  elements.summaryToggle.focus({ preventScroll: true });
});

if (typeof mobileSummaryAccordion.addEventListener === "function") {
  mobileSummaryAccordion.addEventListener("change", syncSummaryAccordion);
  mobileSummaryAccordion.addEventListener("change", syncMotionSnow);
} else {
  mobileSummaryAccordion.addListener(syncSummaryAccordion);
  mobileSummaryAccordion.addListener(syncMotionSnow);
}

if (typeof mobileMotionPointer.addEventListener === "function") {
  mobileMotionPointer.addEventListener("change", syncMotionSnow);
} else {
  mobileMotionPointer.addListener(syncMotionSnow);
}

if (typeof reducedMotionPreference.addEventListener === "function") {
  reducedMotionPreference.addEventListener("change", syncMotionSnow);
} else {
  reducedMotionPreference.addListener(syncMotionSnow);
}

window.addEventListener("pageshow", () => {
  updateExchangeRate({ automatic: true });
  void updateWeather();
  syncMotionSnow();
});
window.addEventListener("pagehide", () => {
  stopMotionListener();
  stopSnowGlobeEffect();
});
window.addEventListener("online", () => {
  updateExchangeRate({ automatic: true });
  void updateWeather();
});
window.addEventListener("offline", () => {
  elements.status.textContent = "Você está offline · a última cotação salva e o resumo continuam disponíveis.";
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    updateExchangeRate({ automatic: true });
    void updateWeather();
  }
  syncMotionSnow();
});

window.setInterval(() => {
  if (document.visibilityState === "visible") updateExchangeRate({ automatic: true });
}, RATE_REFRESH_INTERVAL_MS);

window.setInterval(() => {
  if (document.visibilityState === "visible") void updateWeather();
}, WEATHER_REFRESH_INTERVAL_MS);

syncSummaryAccordion();
renderAll();
void updateWeather();
syncMotionSnow();

if (session.status === "closed" && session.items.length > 0) {
  renderReceipt();
  openDialog(elements.receiptDialog);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Uma falha no modo offline não deve interromper o conversor nem gerar rejeição não tratada.
    });
  }, { once: true });
}
