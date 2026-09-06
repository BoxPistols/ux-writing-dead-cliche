#!/usr/bin/env node
// GitHub Action の本体。PRの差分に含まれる文書だけを検査し、結果を annotation と
// ジョブサマリで返す。判定は CLI (src/cli.mjs) をそのまま呼ぶ。プリセット解決や
// .deadclicherc.json の扱いを二重に実装しないため。
//
// 入力は環境変数で受ける (composite action から渡す)。
//   DC_PRESET      プリセット名。空ならrcか既定 (paper)
//   DC_FAIL_ON     error | warn | info | none  (既定 warn)
//   DC_PATHS       差分ではなく固定のパスを検査する場合のグロブ (カンマ区切り)
//   DC_EXTENSIONS  対象拡張子 (カンマ区切り。既定 .md,.mdx,.markdown,.txt)
//   DC_CHANGED_ONLY  'false' で差分に絞らず DC_PATHS 全体を検査する
//   DC_BASE_SHA    差分の基準。空ならイベントペイロードから取る

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ACTION_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WORKSPACE = process.env.GITHUB_WORKSPACE || process.cwd();
const SEVERITY_ORDER = { info: 0, warn: 1, error: 2 };

const input = (name, fallback = '') => (process.env[name] ?? '').trim() || fallback;
const extensions = input('DC_EXTENSIONS', '.md,.mdx,.markdown,.txt')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function git(args) {
  // core.quotePath が既定のままだと、日本語のファイル名が \346\227\245 の形で返り、
  // そのまま存在しないパスとして落ちる (検査対象から黙って消える)
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: WORKSPACE,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// 差分の基準コミット。pull_request では base.sha、push では before を使う。
function baseSha() {
  const explicit = input('DC_BASE_SHA');
  if (explicit) return explicit;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return null;
  try {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    return event?.pull_request?.base?.sha || (event?.before !== '0'.repeat(40) ? event?.before : null) || null;
  } catch {
    return null;
  }
}

// 浅いクローンでは基準コミットが手元に無い。取れなければ差分を諦めて全体検査に落とす。
function ensureSha(sha) {
  try {
    git(['cat-file', '-e', `${sha}^{commit}`]);
    return true;
  } catch {}
  for (const args of [['fetch', '--no-tags', '--depth=1', 'origin', sha], ['fetch', '--no-tags', '--unshallow', 'origin']]) {
    try {
      git(args);
      git(['cat-file', '-e', `${sha}^{commit}`]);
      return true;
    } catch {}
  }
  return false;
}

// 依存を増やさないための最小限のグロブ。docs/**/*.md のような指定を想定する。
function globToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?'; // **/ はディレクトリ0段以上
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(path.relative(WORKSPACE, full));
  }
  return out;
}

function targetFiles() {
  const patterns = input('DC_PATHS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const changedOnly = input('DC_CHANGED_ONLY', 'true') !== 'false';
  const byExtension = (f) => extensions.includes(path.extname(f));

  let files = null;
  if (changedOnly) {
    const base = baseSha();
    if (base && ensureSha(base)) {
      try {
        // 浅いクローンでは共通の祖先が無く 3点比較が落ちる。2点比較まで下げる
        files = git(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]).split('\n');
      } catch {
        try {
          files = git(['diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD']).split('\n');
        } catch {}
      }
    }
    if (files === null) {
      console.log('dead-cliche: 差分の基準コミットが取れないため、対象パス全体を検査します (checkout の fetch-depth: 0 で差分に絞れます)');
      files = walk(WORKSPACE);
    }
  } else {
    files = walk(WORKSPACE);
  }

  const regexps = patterns.map(globToRegExp);
  return files
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => (regexps.length > 0 ? regexps.some((re) => re.test(f)) : byExtension(f)))
    .filter((f) => fs.existsSync(path.join(WORKSPACE, f)) && fs.statSync(path.join(WORKSPACE, f)).isFile());
}

// annotation のメッセージは改行と % をエスケープする (ワークフローコマンドの仕様)
const escape = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

function run() {
  const files = targetFiles();
  if (files.length === 0) {
    console.log('dead-cliche: 検査対象の文書が差分にありませんでした');
    return 0;
  }
  const preset = input('DC_PRESET');
  const args = [path.join(ACTION_ROOT, 'src', 'cli.mjs'), 'check', '--format', 'json'];
  if (preset) args.push('--preset', preset);
  const res = spawnSync(process.execPath, [...args, ...files], { cwd: WORKSPACE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.stdout.trim() === '') {
    console.error(`dead-cliche: 検査に失敗しました\n${res.stderr}`);
    return 1;
  }
  const report = JSON.parse(res.stdout);

  const failOn = input('DC_FAIL_ON', 'warn');
  // 綴りを誤った値 (warning など) を「落とさない」と解釈すると、検出があっても緑になる
  if (failOn !== 'none' && !Object.hasOwn(SEVERITY_ORDER, failOn)) {
    console.error(`dead-cliche: fail-on の値が不正です: ${failOn} (error | warn | info | none)`);
    return 2;
  }
  const threshold = failOn === 'none' ? undefined : SEVERITY_ORDER[failOn];
  let failing = 0;
  const rows = [];
  for (const { file, violations } of report.results) {
    for (const v of violations) {
      const level = v.severity === 'error' ? 'error' : v.severity === 'warn' ? 'warning' : 'notice';
      const title = `dead-cliche ${v.ruleId}`;
      const message = `「${v.matched}」 ${v.why} → ${v.ask}`;
      console.log(`::${level} file=${file},line=${v.line},col=${v.col},title=${escape(title)}::${escape(message)}`);
      if (threshold !== undefined && SEVERITY_ORDER[v.severity] >= threshold) failing++;
      rows.push(`| ${file}:${v.line} | ${v.severity} | ${v.ruleId} | ${v.matched.replace(/\|/g, '\\|')} | ${v.ask.replace(/\|/g, '\\|')} |`);
    }
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const head =
      rows.length === 0
        ? `## dead-cliche\n\n検査した${files.length}件の文書に、既知のクリシェはありませんでした。\n`
        : `## dead-cliche\n\n${files.length}件の文書に${rows.length}件の検出があります (error ${report.counts.error} / warn ${report.counts.warn} / info ${report.counts.info})。\n\n` +
          `| 箇所 | 重大度 | ルール | 該当表現 | 直し方 |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`;
    fs.appendFileSync(summaryPath, head);
  }

  console.log(`dead-cliche: ${files.length}件の文書を検査し、${rows.length}件を検出しました`);
  if (failing > 0) {
    console.log(`dead-cliche: ${failOn} 以上が ${failing} 件あるため失敗にします (fail-on で変更できます)`);
    return 1;
  }
  return 0;
}

process.exit(run());
