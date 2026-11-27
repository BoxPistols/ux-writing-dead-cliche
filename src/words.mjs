// 個人の「使わない語」の一覧 (~/.dead-cliche-words.txt) を読み、検出ルールにする。
// 1行1語。正規表現もYAMLも書かずに足せることを優先する。書式:
//   語
//   語 → 言い換え
//   語 → 言い換え (除外: 日本語版 英語版)
//   # から後はコメント
// 一覧はClaude Codeのフックでだけ使う。check・CI・リリースの自己検査に混ぜると、
// 公開辞書の判定が端末ごとに変わってしまうため。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function wordsFilePath(env = process.env) {
  const v = env.DEAD_CLICHE_WORDS;
  if (v === '' || v === 'off') return null;
  return v ? path.resolve(v) : path.join(os.homedir(), '.dead-cliche-words.txt');
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseWords(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    let except = [];
    const ex = line.match(/[（(]\s*除外\s*[:：]\s*([^)）]*)[)）]\s*$/);
    if (ex) {
      except = ex[1].split(/[\s、,]+/).filter(Boolean);
      line = line.slice(0, ex.index).trim();
    }
    const [word, instead] = line.split(/\s*(?:→|->)\s*/);
    if (!word) continue;
    out.push({ word, instead: instead || '', except });
  }
  return out;
}

// 除外語の中に現れた語だけを外す。除外語の中での語の位置に合わせ、
// 前側は後読み、後ろ側はその中の先読みで確かめる
function patternFor({ word, except }) {
  const guards = [];
  for (const e of except) {
    let at = e.indexOf(word);
    while (at !== -1) {
      const pre = escapeRegExp(e.slice(0, at));
      const post = escapeRegExp(e.slice(at + word.length));
      guards.push(`(?<!${pre}(?=${escapeRegExp(word)}${post}))`);
      at = e.indexOf(word, at + 1);
    }
  }
  return guards.join('') + escapeRegExp(word);
}

export function wordRules(entries) {
  return entries.map((w, i) => ({
    id: `words/${i + 1}`,
    category: 'words',
    severity: 'error',
    pattern: patternFor(w),
    why: '使わないと決めた語。',
    ask: w.instead ? `「${w.instead}」などに言い換える。` : '別の語に言い換える。',
  }));
}

export function loadWordRules(env = process.env) {
  const file = wordsFilePath(env);
  if (!file) return [];
  try {
    return wordRules(parseWords(fs.readFileSync(file, 'utf8')));
  } catch {
    return [];
  }
}
