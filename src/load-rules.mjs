import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function loadAllRules(rulesDir = path.join(PACKAGE_ROOT, 'rules')) {
  const rules = [];
  const files = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.yml')).sort();
  for (const file of files) {
    const category = path.basename(file, '.yml');
    const entries = yaml.load(fs.readFileSync(path.join(rulesDir, file), 'utf8')) ?? [];
    for (const entry of entries) rules.push({ category, ...entry });
  }
  return rules;
}

export function loadPreset(name, presetsDir = path.join(PACKAGE_ROOT, 'presets')) {
  const file = path.join(presetsDir, `${name}.yml`);
  if (!fs.existsSync(file)) {
    const available = fs.readdirSync(presetsDir).map((f) => path.basename(f, '.yml')).join(', ');
    throw new Error(`preset "${name}" がありません。利用可能: ${available}`);
  }
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

export function rulesForPreset(preset, allRules = loadAllRules()) {
  const include = new Set(preset.include ?? []);
  const disable = new Set(preset.disable ?? []);
  const overrides = preset.overrides ?? {};
  return allRules
    .filter((r) => include.has(r.category))
    .filter((r) => !disable.has(r.id))
    .map((r) => (overrides[r.id] ? { ...r, severity: overrides[r.id] } : r));
}

// カスタムパターンの安全性検査。
// 静的検査でReDoSを完全には排除できないため、これは最後の砦ではなく入口の門。
// 信頼境界は「レビューを通ったか」に置く (docs/custom-rules-and-autofix.md)。
export function validateCustomPattern(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) return { ok: false, reason: 'パターンが空' };
  if (pattern.length > 200) return { ok: false, reason: '200文字を超えている' };
  // (a+)+ / (a*)* / (a+)* 型の量指定子の入れ子を拒否する
  if (/\([^)]*[+*][^)]*\)\s*[+*]/.test(pattern)) return { ok: false, reason: '量指定子の入れ子 (ReDoSの恐れ)' };
  try {
    new RegExp(pattern, 'gmu');
  } catch (e) {
    return { ok: false, reason: `正規表現としてコンパイルできない: ${e.message}` };
  }
  return { ok: true };
}

// .deadclicherc.jsonのcustomRulesからプロジェクト固有辞書を読む。
// surface (リテラル) は常に許可。patternはtrustCustomPatterns: trueのときだけ、
// 安全性検査を通ったものを許可する。
export function loadCustomRules(rc, { warn = (msg) => console.error(msg) } = {}) {
  if (!rc?.customRules?.length) return [];
  const rules = [];
  for (const rel of rc.customRules) {
    const file = path.resolve(rc._dir, rel);
    if (!fs.existsSync(file)) {
      warn(`dead-cliche: カスタム辞書が見つかりません: ${rel}`);
      continue;
    }
    const entries = yaml.load(fs.readFileSync(file, 'utf8')) ?? [];
    for (const entry of entries) {
      const rule = {
        category: 'custom',
        severity: 'error',
        why: '禁止ワードとして登録された表現。',
        ask: '登録時の理由に従って置き換える。',
        ...entry,
      };
      if (!rule.id || !rule.id.startsWith('custom/')) {
        warn(`dead-cliche: カスタムルールのidはcustom/ で始めてください: ${rule.id ?? '(idなし)'}`);
        continue;
      }
      if (rule.pattern) {
        if (!rc.trustCustomPatterns) {
          warn(`dead-cliche: ${rule.id} のpatternは無視しました (trustCustomPatternsが無効)。surfaceを使ってください`);
          delete rule.pattern;
        } else {
          const v = validateCustomPattern(rule.pattern);
          if (!v.ok) {
            warn(`dead-cliche: ${rule.id} のpatternを拒否しました: ${v.reason}`);
            delete rule.pattern;
          }
        }
      }
      if (!rule.pattern && !(rule.surface?.length > 0)) continue;
      rules.push(rule);
    }
  }
  return rules;
}

// ファイルの場所から上へ .deadclicherc.jsonを探す。
export function findRc(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const rc = path.join(dir, '.deadclicherc.json');
    if (fs.existsSync(rc)) {
      try {
        return { ...JSON.parse(fs.readFileSync(rc, 'utf8')), _dir: dir };
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
