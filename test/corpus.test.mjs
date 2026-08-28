// コーパス検証。
// negative: 正当な日本語が「全ルール」に対して 1 件も検出されないこと。
// golden: before は検出があり、after は全ルールに対して 0 件であること。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadAllRules } from '../src/load-rules.mjs';
import { check } from '../src/engine.mjs';

const rules = loadAllRules();
const readJsonl = (p) => fs.readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('negative コーパス: 正当な用例は 1 件も検出されない', () => {
  for (const { text, why } of readJsonl(new URL('../corpus/negative/legitimate-usage.jsonl', import.meta.url).pathname)) {
    const hits = check(text, rules);
    assert.equal(hits.length, 0, `誤検出: 「${text}」(${why}) → ${hits.map((v) => `${v.ruleId}:${v.matched}`)}`);
  }
});

test('golden コーパス: before は検出され、after は検出されない', () => {
  for (const { id, before, after } of readJsonl(new URL('../corpus/golden/rewrite.jsonl', import.meta.url).pathname)) {
    const beforeHits = check(before, rules);
    assert.ok(beforeHits.length >= 1, `${id}: before が検出されない: ${before}`);
    const afterHits = check(after, rules);
    assert.equal(afterHits.length, 0, `${id}: after に検出が残っている → ${afterHits.map((v) => `${v.ruleId}:${v.matched}`)}`);
  }
});
