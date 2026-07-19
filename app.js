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
  saveSession
} from "./js/session-store.js";
import {
  AUTOMATIC_REQUEST_DEBOUNCE_MS,
  RATE_REFRESH_INTERVAL_MS,
  RateService,
  formatRateDate
} from "./js/rates.js";

const $ = id => document.getElementById(id);

const elements = {
  amount: $("amount"),
  result: $("result"),
  swapButton: $("swapButton"),
  refreshButton: $("refreshButton"),
  status: $("status"),
  rateText: $("rateText"),
  heroRateText: $("heroRateText"),
  manualRate: $("manualRate"),
  saveRateButton: $("saveRateButton"),
  amountLabel: $("amountLabel"),
  resultLabel: $("resultLabel"),
  inputSymbol: $("inputSymbol"),
  inputCode: $("inputCode"),
  conversionForm: $("conversionForm"),
  itemLabel: $("itemLabel"),
  addItemButton: $("addItemButton"),
  entryCount: $("entryCount"),
  clearSummaryButton: $("clearSummaryButton"),
  emptyState: $("emptyState"),
  summaryContent: $("summaryContent"),
  itemsList: $("itemsList"),
  totalBrl: $("totalBrl"),
  totalClp: $("totalClp"),
  peopleCount: $("peopleCount"),
  decreasePeopleButton: $("decreasePeopleButton"),
  increasePeopleButton: $("increasePeopleButton"),
  perPersonBrl: $("perPersonBrl"),
  perPersonClp: $("perPersonClp"),
  splitNote: $("splitNote"),
  closeAccountButton: $("closeAccountButton"),
  mobileSummaryButton: $("mobileSummaryButton"),
  mobileItemCount: $("mobileItemCount"),
  mobileTotalBrl: $("mobileTotalBrl"),
  summaryCard: $("summaryCard"),
  receiptDialog: $("receiptDialog"),
  receiptSubtitle: $("receiptSubtitle"),
  receiptTotalBrl: $("receiptTotalBrl"),
  receiptTotalClp: $("receiptTotalClp"),
  receiptPeople: $("receiptPeople"),
  receiptPerPersonBrl: $("receiptPerPersonBrl"),
  receiptPerPersonClp: $("receiptPerPersonClp"),
  receiptSplitNote: $("receiptSplitNote"),
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
  realtime: "AwesomeAPI",
  daily: "ExchangeRate-API",
  manual: "Cotação manual",
  cached: "Cache local",
  default: "Referência inicial"
});

const rateService = new RateService();
const savedRate = readStoredNumber("clpToBrl");
const savedRateKind = readStoredText("rateSourceKind");

const state = {
  direction: DIRECTIONS.CLP_TO_BRL,
  clpToBrl: savedRate > 0 ? savedRate : 0.00555,
  rateKind: RATE_SOURCE_NAMES[savedRateKind] ? savedRateKind : savedRate > 0 ? "cached" : "default",
  rateSourceName: RATE_SOURCE_NAMES[savedRateKind] ?? (savedRate > 0 ? RATE_SOURCE_NAMES.cached : RATE_SOURCE_NAMES.default),
  rateSourceUpdatedAt: readStoredNumber("rateSourceUpdatedAt") || null,
  isUpdatingRate: false,
  lastAutomaticRateAttempt: 0,
  decimalPointTyped: false,
  toastTimer: null,
  confirmationResolver: null
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
    showToast("Não foi possível salvar no aparelho. A conta continua aberta nesta tela.");
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

  elements.addItemButton.disabled = !conversion;
  elements.rateText.textContent = `1 CLP = ${formatRate(state.clpToBrl)}`;
  elements.heroRateText.textContent = `1 CLP · ${formatRate(state.clpToBrl)}`;

  if (document.activeElement !== elements.manualRate) {
    elements.manualRate.value = state.clpToBrl.toFixed(7);
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
      `1 CLP = ${formatRate(item.rateClpToBrl)} · ${item.rateSource}`
    ));
    row.append(main);

    const removeButton = createTextElement("button", "remove-item", "×");
    removeButton.type = "button";
    removeButton.dataset.itemId = item.id;
    removeButton.setAttribute("aria-label", `Remover ${item.label || `item ${index + 1}`}`);
    row.append(removeButton);
    fragment.append(row);
  });

  elements.itemsList.replaceChildren(fragment);
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
  const perPersonBrl = splitSummary.brlSplit.higherUnits;
  const perPersonClp = splitSummary.clpSplit.higherUnits;

  elements.entryCount.textContent = String(totals.itemCount);
  elements.clearSummaryButton.disabled = !hasItems;
  elements.emptyState.hidden = hasItems;
  elements.summaryContent.hidden = !hasItems;
  elements.peopleCount.value = String(splitSummary.people);
  elements.decreasePeopleButton.disabled = splitSummary.people <= 1;
  elements.increasePeopleButton.disabled = splitSummary.people >= 99;

  elements.totalBrl.textContent = formatBrlFromCents(totals.brlCents);
  elements.totalClp.textContent = `${formatClpFromPesos(totals.clpPesos)} CLP`;
  elements.perPersonBrl.textContent = formatBrlFromCents(perPersonBrl);
  elements.perPersonClp.textContent = `${formatClpFromPesos(perPersonClp)} CLP`;
  elements.splitNote.textContent = buildSplitNote(splitSummary);

  elements.mobileSummaryButton.hidden = !hasItems;
  elements.mobileItemCount.textContent = `${totals.itemCount} ${pluralize(totals.itemCount, "item", "itens")}`;
  elements.mobileTotalBrl.textContent = formatBrlFromCents(totals.brlCents);
  document.body.classList.toggle("has-summary", hasItems);

  renderItems();
}

function renderReceipt() {
  const totals = calculateTotals(session.items);
  const splitSummary = getSplitSummary(totals);

  elements.receiptSubtitle.textContent = `${totals.itemCount} ${pluralize(totals.itemCount, "item registrado", "itens registrados")}`;
  elements.receiptTotalBrl.textContent = formatBrlFromCents(totals.brlCents);
  elements.receiptTotalClp.textContent = `${formatClpFromPesos(totals.clpPesos)} CLP`;
  elements.receiptPeople.textContent = String(splitSummary.people);
  elements.receiptPerPersonBrl.textContent = formatBrlFromCents(splitSummary.brlSplit.higherUnits);
  elements.receiptPerPersonClp.textContent = `${formatClpFromPesos(splitSummary.clpSplit.higherUnits)} CLP`;
  elements.receiptSplitNote.textContent = buildSplitNote(splitSummary);
}

function renderAll() {
  renderConversion();
  renderSummary();
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function settleConfirmation(accepted) {
  const resolve = state.confirmationResolver;
  state.confirmationResolver = null;

  if (elements.confirmDialog.open) {
    elements.confirmDialog.close();
  } else {
    elements.confirmDialog.removeAttribute("open");
  }

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

    if (typeof elements.confirmDialog.showModal === "function") {
      elements.confirmDialog.showModal();
    } else {
      elements.confirmDialog.setAttribute("open", "");
    }

    window.setTimeout(() => elements.cancelConfirmButton.focus(), 0);
  });
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

    session.items.push(item);
    session.status = "open";
    persistSession();

    elements.amount.value = "";
    elements.itemLabel.value = "";
    renderAll();
    showToast("Item adicionado ao resumo.");
    elements.amount.focus();
  } catch {
    showToast("Esse valor é muito alto ou inválido para adicionar.");
  }
}

function removeItem(itemId) {
  const previousLength = session.items.length;
  session.items = session.items.filter(item => item.id !== itemId);
  if (session.items.length === previousLength) return;

  session.status = "open";
  persistSession();
  renderSummary();
  showToast("Item removido do resumo.");
}

function updatePeopleCount(value) {
  const people = normalizePeopleCount(value);
  if (people === session.peopleCount) {
    elements.peopleCount.value = String(people);
    return;
  }

  session.peopleCount = people;
  session.status = "open";
  persistSession();
  renderSummary();
}

function resetAccount() {
  try {
    clearSession();
  } catch {
    // A conta ainda pode ser reiniciada em memória se o storage estiver bloqueado.
  }
  session = createSession();
  persistSession();
  elements.amount.value = "";
  elements.itemLabel.value = "";
  renderAll();
}

function buildShareText() {
  const totals = calculateTotals(session.items);
  const splitSummary = getSplitSummary(totals);
  const lines = [
    "Conta Chile · Resumo da viagem",
    "",
    ...session.items.map((item, index) => (
      `${index + 1}. ${item.label || `Item ${index + 1}`} — ${formatClpFromPesos(item.clpPesos)} CLP · ${formatBrlFromCents(item.brlCents)}`
    )),
    "",
    `Total: ${formatClpFromPesos(totals.clpPesos)} CLP · ${formatBrlFromCents(totals.brlCents)}`,
    `Pessoas: ${splitSummary.people}`,
    `Por pessoa: ${formatClpFromPesos(splitSummary.clpSplit.higherUnits)} CLP · ${formatBrlFromCents(splitSummary.brlSplit.higherUnits)}`,
    buildSplitNote(splitSummary),
    "",
    "Valores de referência. Taxas da instituição podem variar."
  ];

  return lines.join("\n");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Cópia indisponível");
}

async function shareReceipt() {
  const text = buildShareText();

  if (navigator.share) {
    try {
      await navigator.share({ title: "Conta Chile", text });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  try {
    await copyText(text);
    showToast("Resumo copiado para a área de transferência.");
  } catch {
    showToast("Não foi possível compartilhar neste navegador.");
  }
}

function saveCurrentRate({ rate, sourceKind, sourceName, sourceUpdatedAt }) {
  state.clpToBrl = rate;
  state.rateKind = sourceKind;
  state.rateSourceName = sourceName;
  state.rateSourceUpdatedAt = sourceUpdatedAt;

  writeStoredValue("clpToBrl", rate);
  writeStoredValue("rateUpdatedAt", new Date().toISOString());
  writeStoredValue("rateSourceKind", sourceKind);

  if (sourceUpdatedAt) {
    writeStoredValue("rateSourceUpdatedAt", sourceUpdatedAt);
  } else {
    removeStoredValue("rateSourceUpdatedAt");
  }
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
    const quote = await rateService.fetchBestAvailableRate({ forceDailyFallback: !automatic });
    saveCurrentRate(quote);
    const sourceDate = formatRateDate(quote.sourceUpdatedAt);

    if (quote.sourceKind === "realtime") {
      elements.status.textContent = sourceDate
        ? `Cotação média de mercado · referência de ${sourceDate}.`
        : "Cotação média de mercado atualizada agora.";
    } else {
      elements.status.textContent = sourceDate
        ? `Fonte intradiária indisponível · referência diária de ${sourceDate}.`
        : "Fonte intradiária indisponível · usando a referência diária mais recente.";
    }

    renderConversion();
  } catch {
    const savedDate = formatRateDate(state.rateSourceUpdatedAt);
    elements.status.textContent = savedDate
      ? `Sem nova cotação agora · usando a referência salva de ${savedDate}.`
      : "Sem nova cotação agora · usando a referência disponível no aparelho.";
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
  const rate = Number(elements.manualRate.value);
  if (!Number.isFinite(rate) || rate <= 0) {
    elements.status.textContent = "Digite uma cotação manual válida e maior que zero.";
    return;
  }

  saveCurrentRate({
    rate,
    sourceKind: "manual",
    sourceName: RATE_SOURCE_NAMES.manual,
    sourceUpdatedAt: Math.floor(Date.now() / 1000)
  });
  elements.status.textContent = "Cotação manual salva. A próxima atualização online poderá substituí-la.";
  renderConversion();
  showToast("Cotação manual aplicada.");
});

elements.itemsList.addEventListener("click", event => {
  const button = event.target.closest("button[data-item-id]");
  if (button) removeItem(button.dataset.itemId);
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
  resetAccount();
  showToast("Resumo limpo.");
});

elements.closeAccountButton.addEventListener("click", () => {
  if (!session.items.length) return;
  session.status = "closed";
  persistSession();
  renderReceipt();

  if (typeof elements.receiptDialog.showModal === "function") {
    elements.receiptDialog.showModal();
  } else {
    elements.receiptDialog.setAttribute("open", "");
  }
});

elements.editAccountButton.addEventListener("click", () => {
  session.status = "open";
  persistSession();
  elements.receiptDialog.close();
});

elements.newAccountButton.addEventListener("click", async () => {
  const itemCount = session.items.length;
  const confirmed = await requestConfirmation({
    title: "Começar uma nova conta?",
    message: `A conta atual com ${itemCount} ${pluralize(itemCount, "item", "itens")} será apagada para você começar do zero.`,
    confirmLabel: "Apagar e começar",
    cancelLabel: "Voltar ao recibo"
  });

  if (!confirmed) return;
  resetAccount();
  elements.receiptDialog.close();
  showToast("Nova conta iniciada.");
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

elements.mobileSummaryButton.addEventListener("click", () => {
  elements.summaryCard.scrollIntoView({ behavior: "smooth", block: "start" });
});

window.addEventListener("pageshow", () => updateExchangeRate({ automatic: true }));
window.addEventListener("online", () => updateExchangeRate({ automatic: true }));
window.addEventListener("offline", () => {
  elements.status.textContent = "Você está offline · a última cotação salva e o resumo continuam disponíveis.";
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") updateExchangeRate({ automatic: true });
});

window.setInterval(() => {
  if (document.visibilityState === "visible") updateExchangeRate({ automatic: true });
}, RATE_REFRESH_INTERVAL_MS);

renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}
