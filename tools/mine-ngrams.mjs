#!/usr/bin/env node
// コーパス対照による候補採掘。
// AI生成文と人間の文章でn-gram頻度を比べ、AI側に過剰出現する表現を辞書の
// 追記候補として出す。
//
//   node tools/mine-ngrams.mjs --ai corpus/ai --human corpus/human [options]
//
//   --n 3-8            見るn-gramの長さ (既定 3-8)
//   --min-count 5      AI側の最低出現回数 (既定 5)
//   --min-ratio 3      AI側/人間側の出現率の比の下限 (既定 3)
//   --top 50           出力する件数 (既定 50)
//   --format md|tsv    出力形式 (既定 md)
//   --max-length 20    これより長い一致は重複文とみなして落とす (既定 20)
//   --include-known    辞書が既に検出する候補も出す (既定は隠す)
//
// 出力はそのまま辞書に入れない。採否は docs/research-notes.md の基準
// (人間の熟練した書き手が使うか) で人が判断する。この道具は候補を並べるまで。
// LLMは候補の why / ask / 例文の下書きにだけ使う。検出には使わない。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { check, maskMarkdownCode } from '../src/engine.mjs';
import { loadAllRules } from '../src/load-rules.mjs';

const TEXT_EXT = new Set(['.txt', '.md', '.mdx', '.markdown', '.jsonl']);

// 区切り記号・空白・英数字。ここを跨ぐn-gramは語のまとまりにならないため切る。
const SEGMENT_SPLIT = /[\s　。、！？!?,.:;・…「」『』（）()［］\[\]【】〈〉《》"'`|/\\+*=~^#$%&@<>{}\-—–ー]|[0-9A-Za-z]+/u;

function parseArgs(argv) {
  const args = { ai: [], human: [] };
  let key = null;
  for (const a of argv) {
    if (a.startsWith('--')) {
      key = a.slice(2);
      if (key === 'include-known') {
        args.includeKnown = true;
        key = null;
      }
      continue;
    }
    if (key === 'ai' || key === 'human') args[key].push(a);
    else if (key) args[key] = a;
  }
  return args;
}

function collectFiles(inputs) {
  const files = [];
  const walk = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    else if (TEXT_EXT.has(path.extname(p))) files.push(p);
  };
  for (const input of inputs) walk(input);
  return files;
}

// Markdownはコードを外して読む (コード例の語を候補にしない)。
// JSONL (corpus/*.jsonl と同じ形) は text フィールドだけを読む。
function readCorpus(inputs) {
  const parts = [];
  for (const file of collectFiles(inputs)) {
    const raw = fs.readFileSync(file, 'utf8');
    const ext = path.extname(file);
    if (ext === '.jsonl') {
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const value = JSON.parse(line)?.text;
          if (typeof value === 'string') parts.push(value);
        } catch {}
      }
    } else {
      parts.push(ext === '.txt' ? raw : maskMarkdownCode(raw));
    }
  }
  return parts.join('\n');
}

export function countNgrams(text, { min = 3, max = 8 } = {}) {
  const counts = new Map();
  let total = 0;
  for (const segment of text.split(SEGMENT_SPLIT)) {
    const s = segment.trim();
    if (s.length < min) continue;
    for (let n = min; n <= max; n++) {
      for (let i = 0; i + n <= s.length; i++) {
        const gram = s.slice(i, i + n);
        counts.set(gram, (counts.get(gram) ?? 0) + 1);
        total++;
      }
    }
  }
  return { counts, total };
}

// 同じ回数で重なり合うn-gramを1つにつなぐ。「体験を根本から」と「験を根本から変」は
// 同じ言い回しを窓をずらして数えただけなので、元の長さまで戻して1件にする。
// つなぐのは、続きの候補が1つしかなく、その候補の手前も1つしかないときだけ。
// 分岐がある箇所でつなぐと、コーパスに無い文字列を作ってしまう。
function mergeOverlaps(rows) {
  let current = rows;
  for (let pass = 0; pass < 64; pass++) {
    const byHead = new Map(); // 先頭 n-1 文字が一致する候補 (= 続きになりうる)
    const byTail = new Map(); // 末尾 n-1 文字が一致する候補 (= 手前になりうる)
    for (const r of current) {
      const head = `${r.aiCount}|${r.gram.slice(0, -1)}`;
      const tail = `${r.aiCount}|${r.gram.slice(1)}`;
      if (!byHead.has(head)) byHead.set(head, []);
      if (!byTail.has(tail)) byTail.set(tail, []);
      byHead.get(head).push(r);
      byTail.get(tail).push(r);
    }
    const merged = [];
    const used = new Set();
    for (const r of current) {
      if (used.has(r)) continue;
      const next = byHead.get(`${r.aiCount}|${r.gram.slice(1)}`) ?? [];
      if (next.length !== 1 || next[0] === r || used.has(next[0])) continue;
      const prev = byTail.get(`${r.aiCount}|${next[0].gram.slice(0, -1)}`) ?? [];
      if (prev.length !== 1 || prev[0] !== r) continue;
      used.add(r);
      used.add(next[0]);
      merged.push({ ...r, gram: r.gram + next[0].gram.slice(-1) });
    }
    if (merged.length === 0) break;
    current = [...current.filter((r) => !used.has(r)), ...merged];
  }
  return current;
}

// 部分文字列の重複を畳む。長い候補とほぼ同じ回数しか出ない短い候補は、
// 長いほうの一部として数えられているだけなので落とす。
function collapseSubstrings(rows, { tolerance = 0.9 } = {}) {
  const byLength = [...rows].sort((a, b) => b.gram.length - a.gram.length);
  const kept = [];
  for (const row of byLength) {
    const covered = kept.some((k) => k.gram.includes(row.gram) && row.aiCount <= k.aiCount / tolerance);
    if (!covered) kept.push(row);
  }
  return kept;
}

export function mine(aiText, humanText, options = {}) {
  const { min = 3, max = 8, minCount = 5, minRatio = 3, includeKnown = false, rules = [] } = options;
  const ai = countNgrams(aiText, { min, max });
  const human = countNgrams(humanText, { min, max });
  const perMillion = (count, total) => (total === 0 ? 0 : (count / total) * 1e6);
  // 平滑化。人間側0件の候補が無限大で並ぶのを防ぐ (1件相当を足す)
  const smoothing = perMillion(1, human.total || 1);

  const rows = [];
  for (const [gram, aiCount] of ai.counts) {
    if (aiCount < minCount) continue;
    const humanCount = human.counts.get(gram) ?? 0;
    const aiRate = perMillion(aiCount, ai.total);
    const humanRate = perMillion(humanCount, human.total);
    const ratio = aiRate / (humanRate + smoothing);
    if (ratio < minRatio) continue;
    const known = rules.length > 0 && check(gram, rules).length > 0;
    if (known && !includeKnown) continue;
    rows.push({ gram, aiCount, humanCount, aiRate, humanRate, ratio, known });
  }
  const maxLength = options.maxLength ?? 20;
  return collapseSubstrings(mergeOverlaps(rows))
    // 長すぎる一致はコーパス内の重複文であって言い回しではない
    .filter((r) => r.gram.length <= maxLength)
    .sort((a, b) => b.ratio - a.ratio || b.aiCount - a.aiCount);
}

function render(rows, format) {
  if (format === 'tsv') {
    return ['gram\tai\thuman\tratio\tknown', ...rows.map((r) => `${r.gram}\t${r.aiCount}\t${r.humanCount}\t${r.ratio.toFixed(1)}\t${r.known ? 'yes' : ''}`)].join('\n');
  }
  const lines = [
    '# 候補 (コーパス対照)',
    '',
    'AI側に過剰出現した表現です。このままでは辞書に入れません。docs/research-notes.md の',
    '採用の基準 (情報が欠けているか、共起条件で絞れるか、負例で守れるか) で判断してください。',
    '',
    '| 候補 | AI | 人間 | 比 | 既知 |',
    '| --- | ---: | ---: | ---: | --- |',
    ...rows.map((r) => `| ${r.gram} | ${r.aiCount} | ${r.humanCount} | ${r.ratio.toFixed(1)} | ${r.known ? '検出済み' : ''} |`),
  ];
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.ai.length === 0 || args.human.length === 0) {
    console.error('使い方: node tools/mine-ngrams.mjs --ai <path...> --human <path...> [--n 3-8] [--min-count 5] [--min-ratio 3] [--top 50] [--format md|tsv] [--include-known]');
    process.exit(2);
  }
  const [min, max] = (args.n ?? '3-8').split('-').map(Number);
  const rows = mine(readCorpus(args.ai), readCorpus(args.human), {
    min,
    max,
    minCount: Number(args['min-count'] ?? 5),
    minRatio: Number(args['min-ratio'] ?? 3),
    includeKnown: Boolean(args.includeKnown),
    maxLength: Number(args['max-length'] ?? 20),
    rules: loadAllRules(),
  });
  const top = rows.slice(0, Number(args.top ?? 50));
  console.log(render(top, args.format ?? 'md'));
  console.error(`\n候補 ${rows.length} 件のうち上位 ${top.length} 件を出しました`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
