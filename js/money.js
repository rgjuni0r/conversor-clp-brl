export const DIRECTIONS = Object.freeze({
  CLP_TO_BRL: "CLP_TO_BRL",
  BRL_TO_CLP: "BRL_TO_CLP"
});

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const clpFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const rateFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 5,
  maximumFractionDigits: 10
});

function assertDirection(direction) {
  if (direction !== DIRECTIONS.CLP_TO_BRL && direction !== DIRECTIONS.BRL_TO_CLP) {
    throw new RangeError(`Direção de conversão inválida: ${String(direction)}`);
  }
}

function assertFiniteNumber(value, name) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new TypeError(`${name} deve ser um número finito.`);
  }

  return numericValue;
}

function assertSafeInteger(value, name) {
  const numericValue = Number(value);

  if (!Number.isSafeInteger(numericValue)) {
    throw new RangeError(`${name} deve ser um número inteiro seguro.`);
  }

  return numericValue;
}

function toDecimalFraction(value, name) {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) throw new TypeError(`${name} deve ser um número decimal não negativo.`);

  const fractionDigits = match[2] ?? "";
  const exponent = Number(match[3] ?? 0);
  const digits = `${match[1]}${fractionDigits}`.replace(/^0+(?=\d)/, "");
  let numerator = BigInt(digits);
  const scale = fractionDigits.length - exponent;

  if (scale <= 0) {
    numerator *= 10n ** BigInt(-scale);
    return { numerator, denominator: 1n };
  }

  return { numerator, denominator: 10n ** BigInt(scale) };
}

function roundFractionToSafeInteger(numerator, denominator, name) {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError(`${name} está fora do intervalo monetário suportado.`);
  }

  const roundedValue = (numerator * 2n + denominator) / (denominator * 2n);

  if (roundedValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${name} está fora do intervalo monetário suportado.`);
  }

  return Number(roundedValue);
}

function toNonNegativeSafeInteger(value, name) {
  const { numerator, denominator } = toDecimalFraction(value, name);
  return roundFractionToSafeInteger(numerator, denominator, name);
}

function groupThousands(value) {
  const normalized = value.replace(/^0+(?=\d)/, "") || "0";
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatClpInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? groupThousands(digits) : "";
}

function formatBrlInput(value, allowDecimalPoint) {
  const clean = String(value ?? "").replace(/[^\d.,]/g, "");
  const lastComma = clean.lastIndexOf(",");
  const lastPoint = clean.lastIndexOf(".");
  const pointFractionLength = lastPoint === -1 ? 0 : clean.length - lastPoint - 1;
  let decimalIndex = lastComma;

  // Com os dois separadores, o último representa os centavos. Um ponto isolado
  // também é decimal quando acabou de ser digitado ou possui até duas casas,
  // permitindo colar valores como 10.50 sem confundir 1.000 com R$ 1,00.
  if (
    lastPoint > lastComma
    && (lastComma !== -1 || allowDecimalPoint || pointFractionLength <= 2)
  ) {
    decimalIndex = lastPoint;
  }

  const hasDecimal = decimalIndex !== -1;
  const integerDigits = (hasDecimal ? clean.slice(0, decimalIndex) : clean).replace(/\D/g, "");
  const decimalDigits = hasDecimal
    ? clean.slice(decimalIndex + 1).replace(/\D/g, "").slice(0, 2)
    : "";

  if (!integerDigits && !hasDecimal) return "";

  const integerPart = groupThousands(integerDigits || "0");
  return hasDecimal ? `${integerPart},${decimalDigits}` : integerPart;
}

export function formatBrl(value) {
  return brlFormatter.format(assertFiniteNumber(value, "Valor em BRL"));
}

export function formatClp(value) {
  return clpFormatter.format(assertFiniteNumber(value, "Valor em CLP"));
}

export function formatBrlFromCents(cents) {
  return formatBrl(assertSafeInteger(cents, "Centavos") / 100);
}

export function formatClpFromPesos(pesos) {
  return formatClp(assertSafeInteger(pesos, "Pesos"));
}

export function formatRate(rate) {
  return rateFormatter.format(assertFiniteNumber(rate, "Cotação"));
}

export function formatAmountInput(value, direction, { allowDecimalPoint = false } = {}) {
  assertDirection(direction);

  return direction === DIRECTIONS.CLP_TO_BRL
    ? formatClpInput(value)
    : formatBrlInput(value, Boolean(allowDecimalPoint));
}

export function parseAmount(value, direction) {
  assertDirection(direction);
  if (value === null || value === undefined || value === "") return 0;

  const textValue = String(value);
  const normalized = direction === DIRECTIONS.CLP_TO_BRL
    ? textValue.replace(/\D/g, "")
    : textValue.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const amount = Number(normalized);

  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

export function convertAmount(amount, direction, rate) {
  assertDirection(direction);

  const numericAmount = assertFiniteNumber(amount, "Valor");
  const numericRate = assertFiniteNumber(rate, "Cotação");

  if (numericAmount < 0) {
    throw new RangeError("Valor não pode ser negativo.");
  }

  if (numericRate <= 0) {
    throw new RangeError("Cotação deve ser maior que zero.");
  }

  if (direction === DIRECTIONS.CLP_TO_BRL) {
    const clpPesos = toNonNegativeSafeInteger(numericAmount, "Valor em CLP");
    const rateFraction = toDecimalFraction(numericRate, "Cotação");
    const brlCents = roundFractionToSafeInteger(
      BigInt(clpPesos) * rateFraction.numerator * 100n,
      rateFraction.denominator,
      "Valor em BRL"
    );

    return {
      clpPesos,
      brlCents,
      sourceCurrency: "CLP",
      sourceAmount: clpPesos
    };
  }

  const amountFraction = toDecimalFraction(numericAmount, "Valor em BRL");
  const brlCents = roundFractionToSafeInteger(
    amountFraction.numerator * 100n,
    amountFraction.denominator,
    "Valor em BRL"
  );
  const sourceAmount = brlCents / 100;
  const rateFraction = toDecimalFraction(numericRate, "Cotação");
  const clpPesos = roundFractionToSafeInteger(
    BigInt(brlCents) * rateFraction.denominator,
    100n * rateFraction.numerator,
    "Valor em CLP"
  );

  return {
    clpPesos,
    brlCents,
    sourceCurrency: "BRL",
    sourceAmount
  };
}

export function splitUnits(totalUnits, people) {
  const normalizedTotal = assertSafeInteger(totalUnits, "Total");
  const normalizedPeople = assertSafeInteger(people, "Quantidade de pessoas");

  if (normalizedTotal < 0) {
    throw new RangeError("Total não pode ser negativo.");
  }

  if (normalizedPeople < 1) {
    throw new RangeError("Quantidade de pessoas deve ser maior que zero.");
  }

  const baseUnits = Math.floor(normalizedTotal / normalizedPeople);
  const extraPeople = normalizedTotal % normalizedPeople;

  return {
    baseUnits,
    higherUnits: extraPeople > 0 ? baseUnits + 1 : baseUnits,
    extraPeople
  };
}
