#!/usr/bin/env node
// Web アプリ (docs/index.html) 用のデータを辞書から生成します。
//   npm run docs:webdata
import fs from 'node:fs';
import path from 'node:path';
import { loadAllRules, PACKAGE_ROOT } from '../src/load-rules.mjs';
import { check } from '../src/engine.mjs';

const all = loadAllRules();
const version = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;

const CATEGORY_LABEL = {
  metaphor: '比喩',
  overstatement: '誇張・断定',
  'empty-abstraction': '空虚な抽象',
  'syntax-pattern': '構文の型',
  translationese: '翻訳調',
  closing: '締めの型',
  formatting: '書式',
  'ux-microcopy': 'UI 文言',
};

function repr(rule) {
  if (rule.surface?.length) return rule.surface;
  const hits = check(rule.examples.bad[0], [rule]);
  return hits.length ? [hits[0].matched] : [];
}

const promptsDir = path.join(PACKAGE_ROOT, 'docs', 'prompts');
const guards = [
  { id: 'writing-guard', title: '日本語ライティング規律 (フル版)', desc: 'システムプロンプト・プロジェクト設定に貼る全文。文章全般向け' },
  { id: 'writing-guard-compact', title: '日本語クリシェ禁止 (短縮版)', desc: '文字数制限のあるカスタム指示欄向け' },
  { id: 'ux-writing-guard', title: 'UI 文言規律', desc: '画面テキスト (ボタン・エラー・空状態) を書かせる AI 向け' },
].map((g) => ({ ...g, body: fs.readFileSync(path.join(promptsDir, `${g.id}.md`), 'utf8') }));

const rules = all.map((r) => ({
  id: r.id,
  cat: r.category,
  catLabel: CATEGORY_LABEL[r.category],
  reprs: repr(r),
  severity: r.severity,
  manual: !!r.manual,
  fixable: r.fix !== undefined,
  why: r.why,
  ask: r.ask,
  bad: r.examples.bad[0],
  good: r.examples.good[0],
}));

const data = { version, generated: true, guards, categories: CATEGORY_LABEL, rules };
fs.writeFileSync(path.join(PACKAGE_ROOT, 'docs', 'app-data.json'), JSON.stringify(data, null, 1) + '\n');
console.log(`docs/app-data.json: ${rules.length} rules, ${guards.length} guards`);
