#!/usr/bin/env node
// プラグインmanifestの検証。
// 審査パイプラインは `claude plugin validate . --strict` を走らせる。同じものをCIで
// 通したいが、claude CLIはCIランナーに無く、認証を要する場合もある。そこでCLIが
// あればそれを使い、無ければ同じ判定基準を自前で当てる。
//
//   node tools/validate-plugin.mjs
//
// 判定基準は 2026-08-30 時点の validate --strict の実測に合わせている。
// marketplace の description が無いと警告が出て、--strict では失敗する。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const errors = [];

function readJson(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    errors.push(`${rel} がありません`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`${rel} がJSONとして読めません: ${e.message}`);
    return null;
  }
}

function requireString(obj, key, where) {
  const v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  if (typeof v !== 'string' || v.trim() === '') errors.push(`${where}: ${key} がありません`);
  return v;
}

const marketplace = readJson('.claude-plugin/marketplace.json');
const plugin = readJson('.claude-plugin/plugin.json');
const pkg = readJson('package.json');

if (marketplace) {
  const where = '.claude-plugin/marketplace.json';
  requireString(marketplace, 'name', where);
  // validate --strict が警告にする項目。審査で落ちる前にここで止める
  requireString(marketplace, 'description', where);
  requireString(marketplace, 'owner.name', where);
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    errors.push(`${where}: plugins が空`);
  } else {
    for (const [i, p] of marketplace.plugins.entries()) {
      requireString(p, 'name', `${where}: plugins[${i}]`);
      requireString(p, 'source', `${where}: plugins[${i}]`);
      requireString(p, 'description', `${where}: plugins[${i}]`);
    }
  }
}

if (plugin) {
  const where = '.claude-plugin/plugin.json';
  requireString(plugin, 'name', where);
  requireString(plugin, 'description', where);
  requireString(plugin, 'version', where);
  // 末尾まで見る。1.2.3junk や 1.2.3.4 を通すと、claude CLI の無い環境で素通りする
  const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  if (plugin.version && !SEMVER.test(plugin.version)) {
    errors.push(`${where}: version がsemverではありません: ${plugin.version}`);
  }
}

// bump漏れはリリース後に発覚すると差し替えられない。ここで揃っていることを見る
if (plugin && pkg && plugin.version !== pkg.version) {
  errors.push(`version の不一致: package.json ${pkg.version} / plugin.json ${plugin.version}`);
}

if (marketplace && plugin) {
  const listed = marketplace.plugins?.some((p) => p.name === plugin.name);
  if (!listed) errors.push(`marketplace.json に plugin.json の name (${plugin.name}) が載っていません`);
}

// claude CLI があるときは本物の validate も通す。判定基準のずれをここで検出する
let ranCli = false;
try {
  execFileSync('claude', ['plugin', 'validate', '.', '--strict'], { cwd: ROOT, stdio: 'pipe' });
  ranCli = true;
} catch (e) {
  if (e.code === 'ENOENT') {
    // CLIが無い環境 (CIランナー) では自前検証だけで判定する
  } else {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim();
    errors.push(`claude plugin validate . --strict が失敗しました:\n${out}`);
    ranCli = true;
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`✘ ${e}`);
  process.exit(1);
}
console.log(`✔ プラグインmanifestの検証を通過しました${ranCli ? ' (claude plugin validate --strict を含む)' : ' (claude CLI が無いため自前検証のみ)'}`);
