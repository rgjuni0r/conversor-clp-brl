import test from "node:test";
import assert from "node:assert/strict";

import {
  DIRECTIONS,
  convertAmount,
  formatAmountInput,
  formatBrl,
  formatBrlFromCents,
  formatClp,
  formatClpFromPesos,
  formatRate,
  parseAmount,
  splitUnits
} from "../js/money.js";

const normalizeSpaces = value => value.replace(/[\u00a0\u202f]/g, " ");

test("formata valores monetários e cotação nas localidades corretas", () => {
  assert.equal(normalizeSpaces(formatBrl(1234.56)), "R$ 1.234,56");
  assert.equal(formatClp(8500), "$8.500");
  assert.equal(normalizeSpaces(formatBrlFromCents(4675)), "R$ 46,75");
  assert.equal(formatClpFromPesos(18182), "$18.182");
  assert.equal(normalizeSpaces(formatRate(0.005507)), "R$ 0,005507");
});

test("aplica máscaras de CLP e BRL durante a digitação", () => {
  assert.equal(formatAmountInput("CLP 008500", DIRECTIONS.CLP_TO_BRL), "8.500");
  assert.equal(formatAmountInput("1234,56", DIRECTIONS.BRL_TO_CLP), "1.234,56");
  assert.equal(formatAmountInput("10.50", DIRECTIONS.BRL_TO_CLP, { allowDecimalPoint: true }), "10,50");
  assert.equal(formatAmountInput(",5", DIRECTIONS.BRL_TO_CLP), "0,5");
  assert.equal(formatAmountInput("", DIRECTIONS.CLP_TO_BRL), "");
});

test("interpreta entradas já mascaradas", () => {
  assert.equal(parseAmount("8.500", DIRECTIONS.CLP_TO_BRL), 8500);
  assert.equal(parseAmount("R$ 1.234,56", DIRECTIONS.BRL_TO_CLP), 1234.56);
  assert.equal(parseAmount("", DIRECTIONS.BRL_TO_CLP), 0);
});

test("converte CLP para BRL usando unidades monetárias inteiras", () => {
  assert.deepEqual(convertAmount(8500, DIRECTIONS.CLP_TO_BRL, 0.0055), {
    clpPesos: 8500,
    brlCents: 4675,
    sourceCurrency: "CLP",
    sourceAmount: 8500
  });
});

test("converte BRL para CLP usando unidades monetárias inteiras", () => {
  assert.deepEqual(convertAmount(100, DIRECTIONS.BRL_TO_CLP, 0.0055), {
    clpPesos: 18182,
    brlCents: 10000,
    sourceCurrency: "BRL",
    sourceAmount: 100
  });
});

test("rejeita cotação, valor e direção inválidos", () => {
  assert.throws(() => convertAmount(100, DIRECTIONS.CLP_TO_BRL, 0), /Cotação/);
  assert.throws(() => convertAmount(-1, DIRECTIONS.CLP_TO_BRL, 0.0055), /negativo/);
  assert.throws(() => formatAmountInput("100", "INVALID"), /Direção/);
});

test("divide unidades exatamente e informa quem absorve o resíduo", () => {
  assert.deepEqual(splitUnits(10000, 3), {
    baseUnits: 3333,
    higherUnits: 3334,
    extraPeople: 1
  });

  assert.deepEqual(splitUnits(8500, 4), {
    baseUnits: 2125,
    higherUnits: 2125,
    extraPeople: 0
  });

  assert.throws(() => splitUnits(100, 0), /maior que zero/);
});
