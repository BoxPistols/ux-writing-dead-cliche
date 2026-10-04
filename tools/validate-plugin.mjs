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
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// 末尾まで見る。1.2.3junk や 1.2.3.4 を通すと、claude CLI の無い環境で素通りする
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export const isSemver = (v) => typeof v === 'string' && SEMVER.test(v);

// gitで管理しているファイルだけを一時フォルダへ写す。プラグインはgitから取得されるので、
// 手元にしかないファイル(CLAUDE.local.md等)で、validate --strictが落ちるのを避ける。
// 中身は作業ツリーのものを使う。リリース中の版上げはコミット前に検証するため。
// gitの管理下でなければnullを返し、呼び出し側はrootをそのまま検証する
export function copyTrackedFiles(root) {
  let listed;
  try {
    // 「-s」で種別を見る。100644/100755は通常のファイル、120000はシンボリックリンク、160000はサブモジュール
    listed = execFileSync('git', ['ls-files', '-s', '-z'], { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  } catch {
    return null;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-cliche-plugin-'));
  try {
    for (const entry of listed.split('\0').filter(Boolean)) {
      const [meta, rel] = entry.split('\t');
      const mode = meta.split(' ')[0];
      // サブモジュールは中身がこのリポジトリのファイルではないので写さない
      if (mode === '160000') continue;
      const src = path.join(root, rel);
      // 管理下でも作業ツリーで消したファイルは、公開物にも入らないので写さない
      if (!fs.lstatSync(src, { throwIfNoEntry: false })) continue;
      const dest = path.join(dir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      // シンボリックリンクはgitの取得と同じくリンクのまま写す。辿って写すと管理外のリンク先の中身が混ざる
      if (mode === '120000') fs.symlinkSync(fs.readlinkSync(src), dest);
      else fs.copyFileSync(src, dest);
    }
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return dir;
}

export function validatePlugin({ root = ROOT, runCli = true } = {}) {
  const errors = [];

  function readJson(rel) {
    const file = path.join(root, rel);
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
    if (plugin.version && !isSemver(plugin.version)) {
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
  if (runCli) {
    let tracked;
    try {
      tracked = copyTrackedFiles(root);
    } catch (e) {
      // 写しが作れないときは検証できていないので、通さずに止める
      errors.push(`検証用の写しを作れませんでした: ${e.message}`);
      return { errors, ranCli };
    }
    try {
      execFileSync('claude', ['plugin', 'validate', '.', '--strict'], { cwd: tracked ?? root, stdio: 'pipe' });
      ranCli = true;
    } catch (e) {
      if (e.code === 'ENOENT') {
        // CLIが無い環境 (CIランナー) では自前検証だけで判定する
      } else {
        const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim();
        errors.push(`claude plugin validate . --strict が失敗しました:\n${out}`);
        ranCli = true;
      }
    } finally {
      if (tracked) fs.rmSync(tracked, { recursive: true, force: true });
    }
  }

  return { errors, ranCli };
}

function main() {
  const { errors, ranCli } = validatePlugin();
  if (errors.length > 0) {
    for (const e of errors) console.error(`✘ ${e}`);
    process.exit(1);
  }
  console.log(`✔ プラグインmanifestの検証を通過しました${ranCli ? ' (claude plugin validate --strict を含む)' : ' (claude CLI が無いため自前検証のみ)'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
