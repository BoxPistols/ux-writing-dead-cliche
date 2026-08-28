import test from 'node:test';
import assert from 'node:assert/strict';
import { check, maskMarkdownCode } from '../src/engine.mjs';
import { loadAllRules, loadPreset, rulesForPreset } from '../src/load-rules.mjs';
import textlintRule from '../src/textlint-rule.mjs';

const all = loadAllRules();

test('行・列番号が正しい', () => {
  const text = '一行目です。\nこの文書はチームの羅針盤です。';
  const hits = check(text, all);
  const hit = hits.find((v) => v.ruleId === 'metaphor/compass');
  assert.ok(hit);
  assert.equal(hit.line, 2);
  assert.equal(text.split('\n')[1].indexOf('羅針盤') + 1, hit.col);
});

test('プリセット: include / disable / overrides が効く', () => {
  const chat = rulesForPreset(loadPreset('chat'), all);
  assert.ok(!chat.some((r) => r.category === 'closing'), 'chat に closing が混ざっている');
  assert.ok(!chat.some((r) => r.id === 'overstatement/masani'), 'chat で masani が無効化されていない');
  const paper = rulesForPreset(loadPreset('paper'), all);
  assert.equal(paper.find((r) => r.id === 'closing/mashou')?.severity, 'error', 'paper の override が効いていない');
  const uxm = rulesForPreset(loadPreset('ux-microcopy'), all);
  assert.ok(uxm.every((r) => ['ux-microcopy', 'formatting'].includes(r.category)));
});

test('コードフェンスとインラインコードは検査対象から外れる', () => {
  const md = '本文です。\n```\nこの文書はチームの羅針盤です。\n```\nそして `羅針盤` はコード。';
  const masked = maskMarkdownCode(md);
  assert.equal(check(masked, all).length, 0);
  assert.equal(masked.length, md.length, 'オフセットが保存されていない');
});

test('textlint ラッパーが違反を報告する', () => {
  const text = 'この文書はチームの羅針盤です。';
  const reports = [];
  const context = {
    Syntax: { Document: 'Document' },
    getSource: () => text,
    report: (_node, err) => reports.push(err),
    RuleError: class {
      constructor(message, opts) {
        this.message = message;
        this.opts = opts;
      }
    },
    locator: { range: (r) => r },
  };
  const linter = textlintRule(context, { preset: 'paper' });
  linter.Document({ type: 'Document' });
  assert.ok(reports.length >= 1);
  assert.match(reports[0].message, /metaphor\/compass/);
});
