import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAllRules } from '../src/load-rules.mjs';
import {
  DEFAULT_THRESHOLD,
  buildQuestions,
  judgeManualRules,
  toViolations,
} from '../src/manual-judge.mjs';

// この検査は、通ったからといって判定が正しいことを意味しない。
// 判定の正しさは辞書自身の例とcorpus/negativeで測る (docs/manual-rules-ai.md に実測値)。
// ここで固定するのは、組み立てと解釈が壊れていないこと。
// 静かに壊れる形が2つある。manualルールを1件も拾わないまま「指摘0件」で通ることと、
// UI向けのルールを本文に当てて誤検出を出すこと。両方を落とす。

const manualRules = loadAllRules().filter((r) => r.manual);
const uiRule = manualRules.find((r) => r.id.startsWith('ux-microcopy/'));
const proseRule = manualRules.find((r) => !r.id.startsWith('ux-microcopy/'));
const qid = (id) => id.replace(/[^a-z]/g, '_');

test('辞書にmanualルールが存在する (0件なら以降の検査が無意味になる)', () => {
  assert.ok(manualRules.length >= 10, `manualルールが ${manualRules.length} 件しかない`);
  assert.ok(uiRule && proseRule);
});

test('質問は種別の判定とルールごとのnoulで組む', () => {
  const questions = buildQuestions(manualRules);
  assert.equal(questions.kind.type, 'choice');
  assert.deepEqual(Object.keys(questions.kind.criteria), ['ui', 'prose', 'other']);
  assert.equal(Object.keys(questions).length, manualRules.length + 1);
  for (const rule of manualRules) {
    const q = questions[qid(rule.id)];
    assert.equal(q.type, 'noul', `${rule.id} の質問が無い`);
    assert.equal(q.instructions.観点, rule.why);
    assert.equal(q.instructions.直し方, rule.ask);
  }
});

test('質問には辞書の例をそのまま渡す (例を外すと誤検出が増えることを実測で確認している)', () => {
  const questions = buildQuestions([uiRule]);
  assert.deepEqual(questions[qid(uiRule.id)].instructions.当てはまる例, uiRule.examples.bad);
  assert.deepEqual(questions[qid(uiRule.id)].instructions.当てはまらない例, uiRule.examples.good);
});

const answersFor = (kind, scores) => ({
  kind: { type: 'choice', choice: kind, confidence: 0.9, probabilities: {} },
  ...Object.fromEntries(
    Object.entries(scores).map(([id, noul]) => [qid(id), { type: 'noul', noul }]),
  ),
});

test('しきい値以上のものだけを指摘にする', () => {
  const answers = answersFor('ui', { [uiRule.id]: DEFAULT_THRESHOLD });
  assert.equal(toViolations(answers, [uiRule], DEFAULT_THRESHOLD).length, 1);

  const below = answersFor('ui', { [uiRule.id]: DEFAULT_THRESHOLD - 0.01 });
  assert.equal(toViolations(below, [uiRule], DEFAULT_THRESHOLD).length, 0);
});

test('UI向けのルールは、UIの文言と判定されたときだけ当てる', () => {
  const scores = { [uiRule.id]: 0.99 };
  assert.equal(toViolations(answersFor('ui', scores), [uiRule], 0.9).length, 1);
  assert.equal(toViolations(answersFor('prose', scores), [uiRule], 0.9).length, 0);
  assert.equal(toViolations(answersFor('other', scores), [uiRule], 0.9).length, 0);
});

test('UI以外のルールは種別で絞らない', () => {
  const scores = { [proseRule.id]: 0.99 };
  for (const kind of ['ui', 'prose', 'other']) {
    assert.equal(toViolations(answersFor(kind, scores), [proseRule], 0.9).length, 1);
  }
});

test('指摘の形は既存の検出と揃える', () => {
  const [v] = toViolations(answersFor('ui', { [uiRule.id]: 0.94 }), [uiRule], 0.9);
  assert.equal(v.ruleId, uiRule.id);
  assert.equal(v.severity, uiRule.severity);
  assert.equal(v.why, uiRule.why);
  assert.equal(v.matched, '94%');
  assert.equal(v.source, 'ai');
  assert.equal(typeof v.line, 'number');
});

test('キーが無ければ判定せずに知らせる', async () => {
  await assert.rejects(
    () => judgeManualRules('文', manualRules, { apiKey: '' }),
    /TYPESAFE_API_KEY/,
  );
});

test('APIが失敗したら投げる (呼び出し側が既存の検出を残せるように)', async () => {
  const endpoint = 'http://127.0.0.1:1/systemone';
  await assert.rejects(() =>
    judgeManualRules('文', manualRules, { apiKey: 'dummy', endpoint }),
  );
});
