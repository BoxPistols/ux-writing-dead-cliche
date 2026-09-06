#!/usr/bin/env node
// 提案Issue (ISSUE_TEMPLATE/propose-rule.yml) の本文を、辞書の1エントリに変換する。
//
//   node tools/proposal-to-rule.mjs --number 17 --body-file body.md [--write] [--notes-file notes.md]
//
// --write を付けると rules/<category>.yml に追記する。付けなければ生成した
// エントリを標準出力に出すだけ (手元で形を確かめるため)。
//
// 生成したものはそのまま辞書に入れない。id は仮 (category/issue-<番号>) で、
// パターンの絞り込みと負例は人が足す前提。この道具の役目は、フォームの回答を
// YAMLの形に移して下書きPRの出発点を作ることまで。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { check } from '../src/engine.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// フォームのカテゴリ選択肢 → rules/*.yml のファイル名
const CATEGORIES = {
  metaphor: 'metaphor',
  overstatement: 'overstatement',
  'empty-abstraction': 'empty-abstraction',
  'syntax-pattern': 'syntax-pattern',
  translationese: 'translationese',
  closing: 'closing',
  formatting: 'formatting',
  'ux-microcopy': 'ux-microcopy',
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') args.write = true;
    else if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
  }
  return args;
}

// Issue本文を「### 見出し」で節に割る。
function sections(body) {
  const out = new Map();
  let key = null;
  let buf = [];
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^###\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (key) out.set(key, buf.join('\n').trim());
      key = m[1];
      buf = [];
    } else if (key) {
      buf.push(line);
    }
  }
  if (key) out.set(key, buf.join('\n').trim());
  return out;
}

const NO_RESPONSE = /^_No response_$/i;
const lines = (s) =>
  (s ?? '')
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter((l) => l && !NO_RESPONSE.test(l));

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function proposalToRule(body, issueNumber) {
  const s = sections(body);
  const problems = [];
  const expression = (s.get('検出したい表現') ?? '').trim();
  if (!expression || NO_RESPONSE.test(expression)) problems.push('検出したい表現が空です');
  if (/[\\^$*+?()[\]{}|]/.test(expression)) problems.push(`表現に正規表現の記号が含まれています: ${expression}`);

  const categoryRaw = (s.get('カテゴリ') ?? '').trim();
  const categoryKey = categoryRaw.split(/[\s(（]/)[0];
  const category = CATEGORIES[categoryKey];
  if (!category) problems.push(`カテゴリを特定できません: ${categoryRaw || '(空)'}`);

  const whyBlock = s.get('なぜ避けるべきか') ?? '';
  const whyLines = lines(whyBlock);
  // フォームの自由記述に「代わりに書くべきこと:」が混ざることがあるので、askとして拾う
  const askLine = whyLines.find((l) => /^代わりに書くべきこと[:：]/.test(l));
  const why = whyLines.filter((l) => l !== askLine)[0] ?? '';
  const ask = askLine ? askLine.replace(/^代わりに書くべきこと[:：]\s*/, '') : '';
  if (!why) problems.push('なぜ避けるべきかが空です');

  const bad = lines(s.get('悪い例 (実際に見た文)') ?? s.get('悪い例') ?? '');
  const good = lines(s.get('書き直すとどうなるか') ?? '');
  const deny = lines(s.get('検出してはいけない正当な用法 (任意)') ?? s.get('検出してはいけない正当な用法') ?? '');
  if (bad.length === 0) problems.push('悪い例がありません');
  if (good.length === 0) problems.push('書き直した例がありません');

  const id = `${category ?? 'metaphor'}/issue-${issueNumber}`;
  const rule = {
    id,
    category: category ?? 'metaphor',
    severity: 'warn', // 提案は一律warnで入れる。errorへの引き上げはレビューで決める
    surface: [expression],
    why: why.endsWith('。') ? why : `${why}。`,
    ask: ask || 'この表現で省かれた情報を具体に書く。',
    examples: { bad, good },
    deny_examples: deny,
    _needsAsk: !ask,
  };

  // 生成した規則が自分の例をどう判定するかを見る。ここが赤なら人手の調整が要る
  const verify = { badDetected: [], goodDetected: [], denyDetected: [] };
  if (expression) {
    const compiled = { ...rule, severity: 'warn' };
    for (const b of bad) if (check(b, [compiled]).length === 0) verify.badDetected.push(b);
    for (const g of good) if (check(g, [compiled]).length > 0) verify.goodDetected.push(g);
    for (const d of deny) if (check(d, [compiled]).length > 0) verify.denyDetected.push(d);
  }
  return { rule, problems, verify };
}

export function renderRuleYaml(rule) {
  const out = [];
  out.push('');
  out.push(`- id: ${rule.id}`);
  out.push(`  severity: ${rule.severity}`);
  out.push('  # 提案Issueからの自動生成。idを内容の分かる名前に変え、必要なら');
  out.push('  # surfaceをpatternに置き換えて正当な用法を除外してください');
  out.push('  surface:');
  for (const s of rule.surface) out.push(`    - ${quote(s)}`);
  // Issueの自由記述には : や # が入る。素で書くとYAMLとして読めなくなるため必ず引用する
  out.push(`  why: ${quote(rule.why)}`);
  out.push(`  ask: ${quote(rule.ask)}`);
  out.push('  examples:');
  out.push('    bad:');
  for (const b of rule.examples.bad) out.push(`      - ${quote(b)}`);
  out.push('    good:');
  for (const g of rule.examples.good) out.push(`      - ${quote(g)}`);
  if (rule.deny_examples.length > 0) {
    out.push('  deny_examples:');
    for (const d of rule.deny_examples) out.push(`    - ${quote(d)}`);
  }
  return out.join('\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const number = args.number ?? process.env.ISSUE_NUMBER;
  const body = args['body-file'] ? fs.readFileSync(args['body-file'], 'utf8') : process.env.ISSUE_BODY ?? '';
  if (!number || !body.trim()) {
    console.error('使い方: node tools/proposal-to-rule.mjs --number <n> --body-file <file> [--write]');
    process.exit(2);
  }
  const { rule, problems, verify } = proposalToRule(body, number);
  const yaml = renderRuleYaml(rule);

  // レビューで見るべき点を、下書きPRの本文にそのまま貼れる形で出す
  const notes = [];
  for (const p of problems) notes.push(`- [ ] ${p}`);
  if (rule._needsAsk) notes.push('- [ ] ask (直し方) が提案に無いため仮の文言です。書き直してください');
  for (const b of verify.badDetected) notes.push(`- [ ] 悪い例が検出されません: ${b}`);
  for (const g of verify.goodDetected) notes.push(`- [ ] 良い例を誤検出します: ${g}`);
  for (const d of verify.denyDetected) notes.push(`- [ ] 負例を誤検出します: ${d}`);
  notes.push('- [ ] id を内容の分かる名前に変える');
  notes.push('- [ ] 正当な用法を deny_examples に足し、必要なら pattern で絞る');
  notes.push('- [ ] `npm test` と `npm run sync` を通す');

  const summary = ['## 確認事項', ...notes].join('\n');
  // 本文にはIssueの文面が入る。シェルに展開させないため、ファイルで受け渡す。
  // 生成に失敗した回も、何が足りないかを残すために先に書く
  if (args['notes-file']) fs.writeFileSync(args['notes-file'], `${summary}\n`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `category=${rule.category}\nrule_id=${rule.id}\n`);
  }
  if (!args['notes-file']) console.error(`\n${summary}`);

  if (args.write) {
    // 形になっていない提案でブランチを作らない。足りない項目はnotes-fileに残る
    if (problems.length > 0) {
      console.error(problems.map((p) => `✘ ${p}`).join('\n'));
      process.exit(1);
    }
    const file = path.join(ROOT, 'rules', `${rule.category}.yml`);
    fs.appendFileSync(file, yaml);
    console.log(`rules/${rule.category}.yml に追記しました`);
  } else {
    process.stdout.write(yaml);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
