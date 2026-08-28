// 検出エンジン。辞書 (rules/*.yml) を単一の情報源とし、
// CLI・textlint・Claude プラグインのすべてがここを通る。

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function compileRule(rule) {
  if (rule.manual) return [];
  const flags = 'g' + (rule.flags ?? 'mu');
  const regexps = [];
  if (rule.pattern) regexps.push(new RegExp(rule.pattern, flags));
  if (rule.surface) for (const s of rule.surface) regexps.push(new RegExp(escapeRegExp(s), flags));
  if (regexps.length === 0) throw new Error(`rule ${rule.id}: pattern も surface もない`);
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

// Markdown のコードフェンスとインラインコードを、オフセットを保ったまま空白化する。
// コード例に含まれる語を誤検出しないための前処理。
export function maskMarkdownCode(text) {
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]+`/g, (m) => ' '.repeat(m.length));
}

const SEVERITY_ORDER = { info: 0, warn: 1, error: 2 };

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
        found.push({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          matched: m[0],
          index: m.index,
          length: m[0].length,
          ...lineCol(text, m.index),
          why: rule.why,
          ask: rule.ask,
        });
      }
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

export function hasErrors(violations) {
  return violations.some((v) => v.severity === 'error');
}
