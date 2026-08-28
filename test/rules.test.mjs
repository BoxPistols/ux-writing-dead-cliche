// 辞書の書式と、各ルールの正例・負例を検証する。
// 方針: 誤検出はルールの死。deny_examples を持つルールは負例が通ることを必ず確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAllRules } from '../src/load-rules.mjs';
import { check, compileRule } from '../src/engine.mjs';

const rules = loadAllRules();
const SEVERITIES = new Set(['error', 'warn', 'info']);

test('ルール数が辞書として成立している', () => {
  assert.ok(rules.length >= 40, `ルールが少なすぎる: ${rules.length}`);
});

test('id は一意で、カテゴリ (ファイル名) と一致する', () => {
  const seen = new Set();
  for (const r of rules) {
    assert.ok(!seen.has(r.id), `id 重複: ${r.id}`);
    seen.add(r.id);
    assert.match(r.id, /^[a-z-]+\/[a-z0-9-]+$/, `id 書式違反: ${r.id}`);
    assert.equal(r.id.split('/')[0], r.category, `id とファイル名の不一致: ${r.id} (${r.category}.yml)`);
  }
});

for (const r of rules) {
  test(`書式: ${r.id}`, () => {
    assert.ok(SEVERITIES.has(r.severity), `severity 不正: ${r.severity}`);
    assert.ok(r.why?.length > 0, 'why がない');
    assert.ok(r.ask?.length > 0, 'ask がない');
    assert.ok(r.examples?.bad?.length >= 1, '悪い例がない');
    assert.ok(r.examples?.good?.length >= 1, '良い例がない');
    if (r.manual) {
      assert.ok(!r.pattern && !r.surface, 'manual ルールに pattern/surface がある');
    } else {
      assert.ok(r.pattern || r.surface, 'pattern も surface もない');
      compileRule(r); // 正規表現としてコンパイルできること
    }
  });

  if (!r.manual) {
    test(`正例が検出される: ${r.id}`, () => {
      for (const bad of r.examples.bad) {
        const hits = check(bad, [r]);
        assert.ok(hits.some((v) => v.ruleId === r.id), `検出されない悪い例: ${bad}`);
      }
    });

    test(`良い例が誤検出されない: ${r.id}`, () => {
      for (const good of r.examples.good) {
        const hits = check(good, [r]);
        assert.equal(hits.length, 0, `良い例が検出された: ${good} → ${hits.map((v) => v.matched)}`);
      }
    });

    test(`負例が誤検出されない: ${r.id}`, () => {
      for (const deny of r.deny_examples ?? []) {
        const hits = check(deny, [r]);
        assert.equal(hits.length, 0, `負例が検出された: ${deny} → ${hits.map((v) => v.matched)}`);
      }
    });
  }
}
