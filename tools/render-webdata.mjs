#!/usr/bin/env node
// Webアプリ (docs/index.html) 用のデータを辞書から生成します。
//   npm run docs:webdata
import fs from 'node:fs';
import path from 'node:path';
import { loadAllRules, loadPreset, rulesForPreset, PACKAGE_ROOT } from '../src/load-rules.mjs';
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
  'ux-microcopy': 'UI文言',
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
  { id: 'ux-writing-guard', title: 'UI文言規律', desc: '画面テキスト(ボタン・エラー・空状態)を書かせるAI向け' },
  { id: 'clean-sheet-writing', title: '白紙から書かせる指示文', desc: 'クリーンシートで文章を書かせるとき、テーマの前に貼る' },
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
  pattern: r.pattern,
  surface: r.surface,
  flags: r.flags,
  fix: r.fix,
}));

// プリセットごとの例文。空の画面から1手で検出を見せるために使う。
// 有効な規則の範囲はプリセットごとに違うので、例文も分ける (下で検出0件なら生成を止める)
const SAMPLES = {
  paper: 'この節は本手法の心臓部です。まさに評価設計の本質であり、精度が劇的に向上したと言えるでしょう。',
  business: 'この文書はチームの羅針盤です。まさに開発の心臓部と言える内容を解説していきます。',
  chat: 'この機能は圧倒的に便利で、開発の心臓部と言えるでしょう。',
  'ux-microcopy': 'エラーが発生しました。氏名を入力して下さい。\n\n## 🚀 はじめに',
};

const presetIds = {};
const presetInfo = {};
for (const name of ['paper', 'business', 'chat', 'ux-microcopy']) {
  const preset = loadPreset(name);
  const active = rulesForPreset(preset, all);
  presetIds[name] = active.map((r) => r.id);
  const sample = SAMPLES[name];
  const hits = check(sample, active.filter((r) => !r.manual));
  if (!hits.length) {
    throw new Error(`presets: ${name} の例文が検出0件です。辞書の変更に合わせて例文を直してください`);
  }
  presetInfo[name] = {
    description: preset.description,
    // 手動確認の規則はWebアプリでは実行しないので、画面に出す件数からも除く
    activeCount: active.filter((r) => !r.manual).length,
    sample,
  };
}

const data = {
  version, generated: true, guards, categories: CATEGORY_LABEL, rules,
  presets: presetIds, presetInfo,
};
fs.writeFileSync(path.join(PACKAGE_ROOT, 'docs', 'app-data.json'), JSON.stringify(data, null, 1) + '\n');
// ブラウザ用に本物のエンジンを複製する(単一ソースはsrc/engine.mjs、CIで同期検証)
fs.copyFileSync(path.join(PACKAGE_ROOT, 'src', 'engine.mjs'), path.join(PACKAGE_ROOT, 'docs', 'engine.mjs'));
console.log(`docs/app-data.json: ${rules.length} rules, ${guards.length} guards`);
