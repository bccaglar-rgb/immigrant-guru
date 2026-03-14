import test from "node:test";
import assert from "node:assert/strict";
import { denormalizeSymbolForExchange, normalizePerpSymbol, normalizeSpotSymbol } from "./symbols.ts";

test("normalize spot symbols", () => {
  assert.equal(normalizeSpotSymbol("BTCUSDT"), "BTC/USDT");
  assert.equal(normalizeSpotSymbol("eth_usdt"), "ETH/USDT");
});

test("normalize perp symbols", () => {
  assert.equal(normalizePerpSymbol("BTC-USDT-SWAP"), "BTC/USDT:USDT");
  assert.equal(normalizePerpSymbol("ethusdt"), "ETH/USDT:USDT");
});

test("denormalize by exchange", () => {
  assert.equal(denormalizeSymbolForExchange("BTC/USDT", "gate"), "BTC_USDT");
  assert.equal(denormalizeSymbolForExchange("BTC/USDT:USDT", "okx"), "BTC-USDT-SWAP");
  assert.equal(denormalizeSymbolForExchange("BTC/USDT", "binance"), "BTCUSDT");
});
