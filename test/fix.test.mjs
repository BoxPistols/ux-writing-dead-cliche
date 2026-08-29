// 決定論的修正 (fix) とカスタム辞書の検証。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAllRules, loadCustomRules, validateCustomPattern } from '../src/load-rules.mjs';
import { check, applyFixes, maskMarkdownCode } from '../src/engine.mjs';

const rules = loadAllRules();
const fixable = rules.filter((r) => r.fix !== undefined);

test('fix を持つルールが存在する', () => {
  assert.ok(fixable.length >= 6, `fixable: ${fixable.length}`);
});

for (const r of fixable) {
  test(`fix の往復: ${r.id}`, () => {
    for (const bad of r.examples.bad) {
      const { text: fixed, applied } = applyFixes(bad, [r]);
      assert.ok(applied.length >= 1, `fix が適用されない: ${bad}`);
      assert.notEqual(fixed, bad, '本文が変わっていない');
      assert.equal(check(fixed, [r]).length, 0, `fix 後も検出が残る: ${fixed}`);
    }
  });
}

test('fix はコードフェンス内に触れない', () => {
  const md = '入力して下さい。\n```\n入力して下さい。\n```\n';
  const { text: fixed } = applyFixes(md, fixable, { maskedText: maskMarkdownCode(md) });
  assert.match(fixed, /^入力してください。/);
  assert.match(fixed, /```\n入力して下さい。\n```/, 'コードフェンス内が書き換えられた');
});

test('カスタム辞書: surface は常に読み込まれ、検出される', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'));
  fs.writeFileSync(path.join(dir, 'custom.yml'), `
- id: custom/internal-codename
  surface: ['ProjectPhoenix']
  why: 社外秘のコードネーム。
  ask: 正式名称に置き換える。
`);
  const rc = { _dir: dir, customRules: ['custom.yml'] };
  const custom = loadCustomRules(rc, { warn: () => {} });
  assert.equal(custom.length, 1);
  assert.equal(custom[0].severity, 'error');
  assert.equal(check('発表資料に ProjectPhoenix と書かないでください。', custom).length, 1);
});

test('カスタム辞書: pattern は trustCustomPatterns なしでは無効', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'));
  fs.writeFileSync(path.join(dir, 'custom.yml'), `
- id: custom/pat
  pattern: '危険な.{1,5}表現'
`);
  const warns = [];
  const noTrust = loadCustomRules({ _dir: dir, customRules: ['custom.yml'] }, { warn: (m) => warns.push(m) });
  assert.equal(noTrust.length, 0, 'pattern だけのルールは落ちるべき');
  assert.ok(warns.some((w) => w.includes('trustCustomPatterns')));
  const trusted = loadCustomRules({ _dir: dir, customRules: ['custom.yml'], trustCustomPatterns: true }, { warn: () => {} });
  assert.equal(trusted.length, 1);
});

test('カスタム辞書: 危険・不正なパターンは trust があっても拒否される', () => {
  assert.equal(validateCustomPattern('(a+)+b').ok, false, '量指定子の入れ子');
  assert.equal(validateCustomPattern('x'.repeat(201)).ok, false, '長すぎる');
  assert.equal(validateCustomPattern('(未閉鎖').ok, false, 'コンパイル不能');
  assert.equal(validateCustomPattern('普通の(表現|言い回し)').ok, true);
});

test('カスタム辞書: id が custom/ で始まらないものは拒否される', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-'));
  fs.writeFileSync(path.join(dir, 'custom.yml'), `
- id: metaphor/injected
  surface: ['乗っ取り']
`);
  const out = loadCustomRules({ _dir: dir, customRules: ['custom.yml'] }, { warn: () => {} });
  assert.equal(out.length, 0);
});

test('rc の disable と overrides がルール列に適用される', async () => {
  const { applyRcRuleConfig } = await import('../src/load-rules.mjs');
  const base = rules.filter((r) => ['formatting/jp-en-space', 'metaphor/compass'].includes(r.id));
  const out = applyRcRuleConfig(base, {
    disable: ['formatting/jp-en-space'],
    overrides: { 'metaphor/compass': 'info' },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'metaphor/compass');
  assert.equal(out[0].severity, 'info');
  assert.equal(applyRcRuleConfig(base, null).length, 2);
});
