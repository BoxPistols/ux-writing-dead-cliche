// 検出エンジン。辞書 (rules/*.yml) を単一の情報源とし、
// CLI・textlint・Claudeプラグインのすべてがここを通る。

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function compileRule(rule) {
  if (rule.manual) return [];
  const flags = 'g' + (rule.flags ?? 'mu');
  const regexps = [];
  if (rule.pattern) regexps.push(new RegExp(rule.pattern, flags));
  if (rule.surface) for (const s of rule.surface) regexps.push(new RegExp(escapeRegExp(s), flags));
  if (regexps.length === 0) throw new Error(`rule ${rule.id}: patternもsurfaceもない`);
  return regexps;
}

function lineCol(text, index) {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, col: index - last };
}

// Markdownのコードフェンスとインラインコードを、オフセットを保ったまま空白化する。
// コード例に含まれる語を誤検出しないための前処理。
export function maskMarkdownCode(text) {
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]+`/g, (m) => '\u220E'.repeat(m.length)); // 非空白: 空白依存ルール(崩れ太字等)と干渉させない
}

const SEVERITY_ORDER = { info: 0, warn: 1, error: 2 };

// fixテンプレート ($1等) を、検出時のマッチ結果から展開する。
// 部分文字列への再マッチは先読みの文脈を失うため、必ず検出時のmatchを使う。
function expandFix(template, m) {
  return template.replace(/\$(\d+)/g, (_, d) => m[Number(d)] ?? '');
}

export function check(text, rules, { minSeverity = 'info' } = {}) {
  const min = SEVERITY_ORDER[minSeverity] ?? 0;
  const found = [];
  for (const rule of rules) {
    if ((SEVERITY_ORDER[rule.severity] ?? 0) < min) continue;
    for (const re of compileRule(rule)) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0] === '') {
          re.lastIndex++;
          continue;
        }
        const violation = {
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          matched: m[0],
          index: m.index,
          length: m[0].length,
          ...lineCol(text, m.index),
          why: rule.why,
          ask: rule.ask,
        };
        if (rule.fix !== undefined) violation.fix = expandFix(rule.fix, m);
        found.push(violation);
      }
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

// fixフィールドを持つルールの決定論的置換を適用する。
// maskedText (コード除外済み) で位置を決め、置換は原文に対して行う。
export function applyFixes(text, rules, { maskedText = text } = {}) {
  const edits = [];
  for (const rule of rules) {
    if (rule.manual || rule.fix === undefined) continue;
    for (const re of compileRule(rule)) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(maskedText)) !== null) {
        if (m[0] === '') {
          re.lastIndex++;
          continue;
        }
        const original = text.slice(m.index, m.index + m[0].length);
        const replacement = expandFix(rule.fix, m);
        edits.push({ ruleId: rule.id, index: m.index, length: m[0].length, before: original, after: replacement });
      }
    }
  }
  edits.sort((a, b) => b.index - a.index);
  let out = text;
  const applied = [];
  let lastStart = Infinity;
  for (const e of edits) {
    if (e.index + e.length > lastStart) continue; // 重複範囲は先勝ち
    out = out.slice(0, e.index) + e.after + out.slice(e.index + e.length);
    lastStart = e.index;
    applied.push(e);
  }
  return { text: out, applied: applied.reverse() };
}

export function hasErrors(violations) {
  return violations.some((v) => v.severity === 'error');
}
