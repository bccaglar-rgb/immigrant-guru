import test from "node:test";
import assert from "node:assert/strict";
import { isEntryMissed, isEntryTouched, minutesBetween, resolveFirstHit, resolveFirstHitFromRange } from "../server/src/services/tradeIdeaLogic.ts";

test("entry touch is true when price enters range directly", () => {
  assert.equal(isEntryTouched(null, 100, 99, 101), true);
});

test("entry touch is true when price crosses entire range in one tick", () => {
  assert.equal(isEntryTouched(98, 102, 99, 101), true);
  assert.equal(isEntryTouched(102, 98, 99, 101), true);
});

test("LONG entry missed is true when price runs away above entry range", () => {
  assert.equal(isEntryMissed("LONG", 101.5, 103, 99, 101), true);
});

test("SHORT entry missed is true when price runs away below entry range", () => {
  assert.equal(isEntryMissed("SHORT", 98.5, 96.8, 99, 101), true);
});

test("LONG hit logic uses first touched TP before farther TP", () => {
  const hit = resolveFirstHit("LONG", [105, 110], [95, 90], 104.5, 105.2);
  assert.ok(hit);
  assert.equal(hit?.type, "TP");
  assert.equal(hit?.index, 1);
  assert.equal(hit?.price, 105);
});

test("SHORT hit logic uses first touched TP before farther TP", () => {
  const hit = resolveFirstHit("SHORT", [88.19, 87.83], [88.98, 89.25], 88.4, 88.15);
  assert.ok(hit);
  assert.equal(hit?.type, "TP");
  assert.equal(hit?.index, 1);
  assert.equal(hit?.price, 88.19);
});

test("SHORT hit logic marks fail when stop is hit first", () => {
  const hit = resolveFirstHit("SHORT", [88.19, 87.83], [88.98, 89.25], 88.7, 89.05);
  assert.ok(hit);
  assert.equal(hit?.type, "SL");
  assert.equal(hit?.index, 1);
  assert.equal(hit?.price, 88.98);
});

test("range hit logic resolves LONG TP from candle high/low", () => {
  const hit = resolveFirstHitFromRange("LONG", [105, 110], [95, 90], 104.2, 103.8, 105.4, 105.1);
  assert.ok(hit);
  assert.equal(hit?.type, "TP");
  assert.equal(hit?.index, 1);
  assert.equal(hit?.price, 105);
});

test("range hit logic resolves SHORT SL from candle high/low", () => {
  const hit = resolveFirstHitFromRange("SHORT", [88.19, 87.83], [88.98, 89.25], 88.6, 88.5, 89.04, 89.0);
  assert.ok(hit);
  assert.equal(hit?.type, "SL");
  assert.equal(hit?.index, 1);
  assert.equal(hit?.price, 88.98);
});

test("minutesBetween returns positive minute duration", () => {
  assert.equal(minutesBetween("2026-02-25T10:00:00.000Z", "2026-02-25T10:02:30.000Z"), 2.5);
});
