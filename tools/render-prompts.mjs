#!/usr/bin/env node
// 辞書から、どの AI チャットにも貼れる指示文 (プロンプト) を生成します。
// GitHub に依存しない配布形。出力は docs/prompts/ に置き、CI で同期を検証します。
//   npm run docs:prompts
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
  'ux-microcopy': 'UI 文言',
};

// ルールの代表表記。surface はそのまま、pattern は悪い例から実際の一致文字列を取る。
function repr(rule) {
  if (rule.surface?.length) return rule.surface;
  const hits = check(rule.examples.bad[0], [rule]);
  return hits.length ? [hits[0].matched] : [];
}

function ruleLine(rule) {
  const r = repr(rule);
  if (!r.length) return null;
  return `- ${r.map((s) => '`' + s + '`').join(' ')} → ${rule.ask}`;
}

function principles() {
  return [
    '- 語尾は敬体 (です・ます) を既定にする。常体で統一された学術論文だけ例外',
    '- 事実ベースで書く。誇張の形容ではなく数値・観測・仕様を書く',
    '- 比喩で情報を省かない。比喩が隠している「誰が・何を・どうする」を書く',
    '- 段落中の太字散布、絵文字見出し、感嘆符の連打をしない',
    '- 見出し名で参照する。章番号やセクション番号でページ内参照しない',
    '- AI が書いたことを示す署名・定型文を一切入れない',
  ].join('\n');
}

function fullGuard() {
  const cats = ['metaphor', 'overstatement', 'empty-abstraction', 'syntax-pattern', 'translationese', 'closing', 'formatting'];
  const lines = [];
  lines.push('# 日本語ライティング規律 (dead-cliche)');
  lines.push('');
  lines.push(`このテキストを AI チャットのシステムプロンプト・カスタム指示・プロジェクト設定に貼ると、AI 特有の日本語クリシェを避けた文章になります。辞書 v${version} から自動生成されています。`);
  lines.push('');
  lines.push('## 原則');
  lines.push('');
  lines.push(principles());
  lines.push('');
  lines.push('## 使ってはいけない表現と、代わりに書くこと');
  lines.push('');
  for (const cat of cats) {
    lines.push(`### ${CATEGORY_LABEL[cat]}`);
    lines.push('');
    for (const rule of all.filter((r) => r.category === cat && !r.manual)) {
      const l = ruleLine(rule);
      if (l) lines.push(l);
    }
    const manuals = all.filter((r) => r.category === cat && r.manual);
    for (const m of manuals) lines.push(`- (構成) ${m.ask}`);
    lines.push('');
  }
  lines.push('## 書き直すときの制約');
  lines.push('');
  lines.push('- 固有名詞・数値・否定は元の文と一致させる。事実を追加・削除しない');
  lines.push('- 表現を消すだけで終えない。その表現が省いていた情報を補って書く');
  return lines.join('\n') + '\n';
}

function compactGuard() {
  const lines = [];
  lines.push('# 日本語クリシェ禁止 (短縮版)');
  lines.push('');
  lines.push('文字数制限のあるカスタム指示欄向けの短縮版です。次の日本語表現を使わず、誇張や比喩が省いている事実 (誰が・何を・どれだけ) を代わりに書いてください。語尾は敬体。太字散布・絵文字見出し・AI 署名は禁止。');
  lines.push('');
  const cats = ['metaphor', 'overstatement', 'empty-abstraction', 'syntax-pattern', 'translationese', 'closing'];
  for (const cat of cats) {
    const reprs = all
      .filter((r) => r.category === cat && !r.manual)
      .flatMap((r) => repr(r).slice(0, 1));
    lines.push(`${CATEGORY_LABEL[cat]}: ${reprs.map((s) => '`' + s + '`').join(' ')}`);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

function uxGuard() {
  const rules = rulesForPreset(loadPreset('ux-microcopy'), all);
  const lines = [];
  lines.push('# UI 文言規律 (dead-cliche)');
  lines.push('');
  lines.push(`画面テキスト (ボタン・エラー・プレースホルダー・空状態) を書く AI への指示文です。辞書 v${version} から自動生成されています。`);
  lines.push('');
  lines.push('## 使ってはいけない形');
  lines.push('');
  for (const rule of rules.filter((r) => !r.manual)) {
    const l = ruleLine(rule);
    if (l) lines.push(l);
  }
  lines.push('');
  lines.push('## 判断の規律');
  lines.push('');
  for (const m of rules.filter((r) => r.manual)) lines.push(`- ${m.ask}`);
  return lines.join('\n') + '\n';
}

const outDir = path.join(PACKAGE_ROOT, 'docs', 'prompts');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'writing-guard.md'), fullGuard());
fs.writeFileSync(path.join(outDir, 'writing-guard-compact.md'), compactGuard());
fs.writeFileSync(path.join(outDir, 'ux-writing-guard.md'), uxGuard());
for (const f of ['writing-guard.md', 'writing-guard-compact.md', 'ux-writing-guard.md']) {
  const size = fs.statSync(path.join(outDir, f)).size;
  console.log(`${f}: ${size} bytes`);
}
