#!/usr/bin/env node
// --ai の判定の正しさを測る。辞書自身が持つ例と、negativeコーパスを正解データに使う。
//
//   TYPESAFE_API_KEY=... node tools/measure-manual-ai.mjs
//   TYPESAFE_API_KEY=... node tools/measure-manual-ai.mjs --json
//
// 見つけるべきもの: manualルールの examples.bad
// 見つけてはいけないもの: manualルールの examples.good と corpus/negative/legitimate-usage.jsonl
//
// 数値の読み方は docs/manual-rules-ai.md にある。しきい値を変えるときは、この
// スクリプトを回して検出数と誤検出数の両方を見てから決める。片方だけでは決められない。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllRules } from '../src/load-rules.mjs';
import { buildQuestions, toViolations } from '../src/manual-judge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9];

const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) {
  console.error('TYPESAFE_API_KEY が要ります');
  process.exit(2);
}

const rules = loadAllRules().filter((r) => r.manual);
const questions = buildQuestions(rules);

const samples = [];
for (const rule of rules) {
  for (const text of rule.examples?.bad ?? []) samples.push({ text, kind: 'bad', rule });
  for (const text of rule.examples?.good ?? []) samples.push({ text, kind: 'good', rule });
}
for (const line of fs
  .readFileSync(path.join(ROOT, 'corpus/negative/legitimate-usage.jsonl'), 'utf8')
  .trim()
  .split('\n')) {
  samples.push({ text: JSON.parse(line).text, kind: 'negative', rule: null });
}

const records = [];
let tokens = 0;
const started = Date.now();
for (const sample of samples) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: { 検査する文章: sample.text }, model: 'jev-latest', questions }),
  });
  if (!res.ok) {
    console.error(`APIが ${res.status} を返しました`);
    process.exit(1);
  }
  const json = await res.json();
  tokens += json.usage?.input_tokens ?? 0;
  records.push({ ...sample, answers: json.answers });
}

const summary = THRESHOLDS.map((threshold) => {
  let hit = 0;
  let falsePositive = 0;
  for (const rec of records) {
    const violations = toViolations(rec.answers, rules, threshold);
    if (rec.kind === 'bad') {
      if (violations.some((v) => v.ruleId === rec.rule.id)) hit++;
      // 悪い例に別ルールが反応するのは、文そのものが複数の問題を含むことがあるので数えない
    } else {
      falsePositive += violations.length;
    }
  }
  return { threshold, hit, of: records.filter((r) => r.kind === 'bad').length, falsePositive };
});

const elapsed = Math.round((Date.now() - started) / 1000);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ summary, tokens, elapsed, samples: records.length }, null, 1));
} else {
  console.log(`ルール${rules.length}件 / 検査した文${records.length}件（うち悪い例 ${summary[0].of}件）`);
  console.log('\nしきい値  検出      誤検出');
  for (const s of summary) {
    console.log(`${String(s.threshold).padEnd(10)}${String(`${s.hit}/${s.of}`).padEnd(10)}${s.falsePositive}`);
  }
  console.log(
    `\n入力${tokens.toLocaleString()}トークン  ${elapsed}秒  約$${((tokens / 1e6) * 0.042).toFixed(4)}`,
  );
}
