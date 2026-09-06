// 提案Issueの本文 → 辞書エントリの変換。
// フォーム (ISSUE_TEMPLATE/propose-rule.yml) の見出しに依存するので、
// 見出しを変えたらここが落ちる。
import test from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { proposalToRule, renderRuleYaml } from '../tools/proposal-to-rule.mjs';

const body = (over = {}) =>
  [
    '### 検出したい表現',
    '',
    over.expression ?? '落とし穴',
    '',
    '### カテゴリ',
    '',
    over.category ?? 'metaphor (比喩)',
    '',
    '### なぜ避けるべきか',
    '',
    over.why ?? '危険があるとだけ書いて、何が起きるのかが分からない',
    '',
    '代わりに書くべきこと: 実際に起きる失敗を書く',
    '',
    '### 悪い例 (実際に見た文)',
    '',
    over.bad ?? 'この設定には落とし穴があります',
    '',
    '### 書き直すとどうなるか',
    '',
    over.good ?? 'この設定は、環境変数が未定義のとき既定値に戻ります。',
    '',
    '### 検出してはいけない正当な用法 (任意)',
    '',
    over.deny ?? '_No response_',
    '',
    '### 確認',
    '',
    '- [x] 社名・製品名・顧客名・非公開 URL を含んでいません',
  ].join('\n');

test('フォームの回答を辞書エントリに移す', () => {
  const { rule, problems } = proposalToRule(body(), 42);
  assert.deepEqual(problems, []);
  assert.equal(rule.id, 'metaphor/issue-42');
  assert.equal(rule.category, 'metaphor');
  assert.equal(rule.severity, 'warn');
  assert.deepEqual(rule.surface, ['落とし穴']);
  assert.equal(rule.ask, '実際に起きる失敗を書く');
  assert.match(rule.why, /。$/);
  assert.equal(rule.examples.bad.length, 1);
  assert.equal(rule.examples.good.length, 1);
});

test('_No response_ は空として扱う', () => {
  const { rule } = proposalToRule(body(), 42);
  assert.deepEqual(rule.deny_examples, []);
});

test('生成したYAMLが辞書として読める形になっている', () => {
  const { rule } = proposalToRule(body({ deny: '罠にかかった鹿を保護した。' }), 42);
  const parsed = yaml.load(renderRuleYaml(rule));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'metaphor/issue-42');
  assert.deepEqual(parsed[0].deny_examples, ['罠にかかった鹿を保護した。']);
});

test("引用符を含む表現でもYAMLが壊れない", () => {
  const { rule } = proposalToRule(body({ expression: "it's a trap" }), 42);
  const parsed = yaml.load(renderRuleYaml(rule));
  assert.deepEqual(parsed[0].surface, ["it's a trap"]);
});

test('コロンや記号を含む自由記述でもYAMLとして読める', () => {
  const { rule } = proposalToRule(body({ why: '例: 「#1 の指摘」のように書かれると何が起きるか分からない' }), 42);
  const parsed = yaml.load(renderRuleYaml(rule));
  assert.match(parsed[0].why, /^例: /);
  assert.equal(typeof parsed[0].ask, 'string');
});

test('カテゴリを特定できない提案は問題として報告される', () => {
  const { problems } = proposalToRule(body({ category: 'わからない' }), 42);
  assert.ok(problems.some((p) => p.includes('カテゴリ')), problems.join(' / '));
});

test('正規表現の記号を含む表現は弾く', () => {
  const { problems } = proposalToRule(body({ expression: '(まさに|実に)' }), 42);
  assert.ok(problems.some((p) => p.includes('正規表現')), problems.join(' / '));
});

test('悪い例が検出されるかを自分で確かめる', () => {
  const { verify } = proposalToRule(body({ bad: 'この文には該当語がありません' }), 42);
  assert.equal(verify.badDetected.length, 1, '検出されない悪い例が報告されていない');
});
