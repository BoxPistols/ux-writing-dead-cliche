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

// ファイルの場所から上へ .deadclicherc.json を探す。
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
