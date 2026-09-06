import test from 'node:test';
import assert from 'node:assert/strict';
import { check, maskMarkdownCode, applyFixes } from '../src/engine.mjs';
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

test('コメント指示: 指定ルールを範囲で止める', () => {
  const md = [
    '<!-- dead-cliche-disable metaphor/otoshiana -->',
    '> 除外する語は落とし穴です。',
    '<!-- dead-cliche-enable -->',
    'ここにも落とし穴があります。',
  ].join('\n');
  const hits = check(md, all);
  assert.equal(hits.length, 1, `止めた範囲が検出された: ${hits.map((v) => `${v.line}:${v.ruleId}`)}`);
  assert.equal(hits[0].line, 4);
});

test('コメント指示: ID を書かなければ範囲内のすべてを止める', () => {
  const md = '<!-- dead-cliche-disable -->\nこの文書はチームの羅針盤です。\n落とし穴です。';
  assert.equal(check(md, all).length, 0);
});

test('コメント指示: disable-next-line は次の1行だけ止める', () => {
  const md = '<!-- dead-cliche-disable-next-line -->\n落とし穴です。\n落とし穴です。';
  const hits = check(md, all);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3);
});

test('コメント指示: 別ルールの enable では閉じない', () => {
  const md = [
    '<!-- dead-cliche-disable metaphor/otoshiana -->',
    '<!-- dead-cliche-enable metaphor/compass -->',
    '落とし穴です。',
  ].join('\n');
  assert.equal(check(md, all).length, 0);
});

test('コメント指示: 止めた範囲は fix の対象からも外れる', () => {
  const rules = all.filter((r) => r.fix !== undefined);
  const target = rules.find((r) => r.examples.bad.some((b) => applyFixes(b, [r]).applied.length > 0));
  assert.ok(target, 'fix を持つルールが辞書にない');
  const bad = target.examples.bad.find((b) => applyFixes(b, [target]).applied.length > 0);
  const md = `<!-- dead-cliche-disable ${target.id} -->\n${bad}`;
  assert.equal(applyFixes(md, [target]).applied.length, 0);
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

test('textlint ラッパーもコードフェンスを検査しない', () => {
  const text = '本文です。\n```\nこの文書はチームの羅針盤です。\n```\n';
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
  textlintRule(context, { preset: 'paper' }).Document({ type: 'Document' });
  assert.equal(reports.length, 0);
});

test('textlint ラッパーのメッセージに severity が含まれる', () => {
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
  textlintRule(context, { preset: 'paper' }).Document({ type: 'Document' });
  assert.match(reports[0].message, /^\[error\]/);
});

test('感嘆符ルールのかぎかっこ除外は行を跨がない', () => {
  const rules = loadAllRules().filter((r) => r.id === 'formatting/double-exclamation');
  const unclosedQuoteOnPreviousLine = '彼は「と言いかけて黙った。\nすごい機能です！！';
  assert.equal(check(unclosedQuoteOnPreviousLine, rules).length, 1, '前の行の閉じていない「で無効化された');
  assert.equal(check('タイトルは「絶対合格!!」だ。', rules).length, 0, '同一行のかぎかっこ内は除外されるべき');
});

test('インラインコードのマスクは空白ではなく、太字対の内側を壊さない', () => {
  const md = '**グローバルの `~/.claude/CLAUDE.md` を読む**\n';
  const masked = maskMarkdownCode(md);
  assert.equal(masked.length, md.length);
  const rules = loadAllRules().filter((r) => r.id === 'formatting/broken-emphasis');
  assert.equal(check(masked, rules).length, 0, 'マスク後の正しい太字が誤検出された');
  assert.equal(check(maskMarkdownCode('** 壊れた**太字です。\n'), rules).length, 1, '本物の崩れが検出されない');
});
