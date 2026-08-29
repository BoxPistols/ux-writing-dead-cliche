#!/usr/bin/env node
// dead-cliche CLI。
//   dead-cliche check [files...] [--preset name] [--format pretty|json] [--min-severity warn]
//   dead-cliche list [--preset name] [--manual]
//   dead-cliche explain <rule-id>
//   dead-cliche claude-hook   (Claude CodeのPostToolUseフックからstdin JSONで呼ばれる)

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import os from 'node:os';
import crypto from 'node:crypto';
import { loadAllRules, loadPreset, rulesForPreset, findRc, loadCustomRules, applyRcRuleConfig } from './load-rules.mjs';
import { check, maskMarkdownCode, hasErrors, applyFixes } from './engine.mjs';

const MD_EXT = new Set(['.md', '.mdx', '.markdown']);
const TEXT_EXT = new Set([...MD_EXT, '.txt']);

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (['preset', 'format', 'min-severity', 'rules-dir', 'fail-on'].includes(key)) {
        args.flags[key] = argv[++i];
      } else {
        args.flags[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function getRules({ preset, rulesDir }) {
  const all = loadAllRules(rulesDir);
  if (!preset) return all;
  return rulesForPreset(loadPreset(preset), all);
}

function checkText(text, filePath, rules) {
  const masked = filePath && MD_EXT.has(path.extname(filePath)) ? maskMarkdownCode(text) : text;
  return check(masked, rules);
}

function printPretty(file, violations) {
  for (const v of violations) {
    console.log(`${file}:${v.line}:${v.col} ${v.severity} ${v.ruleId} 「${v.matched.replace(/\n/g, '\\n')}」`);
    console.log(`  なぜ: ${v.why}`);
    console.log(`  直す: ${v.ask}`);
  }
}

function cmdCheck(args) {
  const files = args._;
  const results = [];
  let total = 0;
  let errors = 0;

  const run = (text, displayName, filePath) => {
    const rc = filePath ? findRc(path.dirname(path.resolve(filePath))) : findRc(process.cwd());
    if (rc?.ignore && filePath) {
      const rel = path.relative(rc._dir, path.resolve(filePath));
      if (rc.ignore.some((pat) => rel.startsWith(pat) || rel.includes(`/${pat}`))) return;
    }
    const preset = args.flags.preset ?? rc?.preset ?? 'paper';
    const rules = applyRcRuleConfig([...getRules({ preset, rulesDir: args.flags['rules-dir'] }), ...loadCustomRules(rc)], rc);
    let violations = checkText(text, filePath, rules);
    const min = args.flags['min-severity'];
    if (min) {
      const order = { info: 0, warn: 1, error: 2 };
      violations = violations.filter((v) => order[v.severity] >= order[min]);
    }
    total += violations.length;
    errors += violations.filter((v) => v.severity === 'error').length;
    results.push({ file: displayName, violations });
    if ((args.flags.format ?? 'pretty') === 'pretty') printPretty(displayName, violations);
  };

  if (files.length === 0 || (files.length === 1 && files[0] === '-')) {
    const text = fs.readFileSync(0, 'utf8');
    run(text, '(stdin)', null);
  } else {
    for (const f of files) run(fs.readFileSync(f, 'utf8'), f, f);
  }

  if ((args.flags.format ?? 'pretty') === 'json') {
    console.log(JSON.stringify({ results, total, errors }, null, 2));
  } else if (total === 0) {
    console.log('既知のパターンは見つかりませんでした (辞書にある表現の有無だけを見ています)');
  } else {
    console.log(`\n${total} 件 (error ${errors} 件)`);
  }
  // errorとwarnは修正必須 (既定)。--fail-on error で従来挙動、--fail-on info で全件必須にできる
  const order = { info: 0, warn: 1, error: 2 };
  const failOn = order[args.flags['fail-on']] ?? order.warn;
  const failing = results.reduce((n, r) => n + r.violations.filter((v) => order[v.severity] >= failOn).length, 0);
  process.exit(failing > 0 ? 1 : 0);
}

function cmdList(args) {
  const rules = getRules({ preset: args.flags.preset, rulesDir: args.flags['rules-dir'] });
  for (const r of rules) {
    if (args.flags.manual && !r.manual) continue;
    const kind = r.manual ? 'manual' : 'auto';
    console.log(`${r.id}\t${r.severity}\t${kind}\t${r.why}`);
  }
}

function cmdExplain(args) {
  const id = args._[0];
  if (!id) {
    console.error('使い方: dead-cliche explain <rule-id>');
    process.exit(2);
  }
  const rule = loadAllRules(args.flags['rules-dir']).find((r) => r.id === id);
  if (!rule) {
    console.error(`ルールが見つかりません: ${id}`);
    process.exit(2);
  }
  console.log(`id: ${rule.id}`);
  console.log(`severity: ${rule.severity}${rule.manual ? ' (manual: 機械検出なし)' : ''}`);
  console.log(`なぜ: ${rule.why}`);
  console.log(`直す: ${rule.ask}`);
  for (const b of rule.examples.bad) console.log(`  悪い例: ${b}`);
  for (const g of rule.examples.good) console.log(`  良い例: ${g}`);
  for (const d of rule.deny_examples ?? []) console.log(`  検出しない例: ${d}`);
}

// Claude Code PostToolUseフック。失敗しても編集を妨げない (常に握りつぶしてexit 0)。
// Bashコマンド文字列から、書き込まれた可能性のある文書パスを拾う。
// bypass permissionsのセッションはheredocで書くため、Write|Editだけでは素通りする。
function extractPathsFromCommand(command, cwd) {
  const found = new Set();
  const re = new RegExp("[^\\s'\"`;|&()<>]+\\.(?:md|mdx|markdown|txt)\\b", 'g');
  for (const m of String(command).matchAll(re)) {
    const token = m[0];
    if (/^https?:/.test(token)) continue;
    const expanded = token.startsWith('~/') ? path.join(process.env.HOME ?? '', token.slice(2)) : token;
    const abs = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
    try {
      if (!fs.existsSync(abs)) continue;
      const st = fs.statSync(abs);
      // 言及されただけのファイル (sedで読んだ等) を検査しない。直近に書き込まれたものだけを対象にする
      if (st.isFile() && Date.now() - st.mtimeMs < 120_000) found.add(abs);
    } catch {}
  }
  return [...found];
}

// 個人の設定・記憶ファイルは共有目的の文書ではないため、フックの既定では検査しない
// (CLI での明示的な check は従来どおり通る)
const HOOK_SKIP_PREFIXES = [
  path.join(process.env.HOME ?? '', '.claude') + path.sep,
  path.join(process.env.HOME ?? '', '.claude-memory') + path.sep,
];

function hookSkipped(filePath) {
  return HOOK_SKIP_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function hookCheckFile(filePath) {
  if (hookSkipped(filePath)) return [];
  const rc = findRc(path.dirname(filePath));
  if (rc?.ignore) {
    const rel = path.relative(rc._dir, filePath);
    if (rc.ignore.some((pat) => rel.startsWith(pat) || rel.includes(`/${pat}`))) return [];
  }
  const rules = applyRcRuleConfig([...getRules({ preset: rc?.preset ?? 'paper' }), ...loadCustomRules(rc, { warn: () => {} })], rc);
  const text = fs.readFileSync(filePath, 'utf8');
  return checkText(text, filePath, rules).map((v) => ({ ...v, file: path.basename(filePath) }));
}

// プラグインとグローバル設定の両方にフックがある環境で、同じ検査が二重に返るのを防ぐ。
// セッション・対象・内容が同じ直近の発火はスキップする。
function hookDedup(sessionId, files) {
  try {
    const sig = files.map((f) => {
      const st = fs.statSync(f);
      return `${f}:${st.mtimeMs}:${st.size}`;
    }).join('|');
    const key = crypto.createHash('sha1').update(`${sessionId}|${sig}`).digest('hex');
    const marker = path.join(os.tmpdir(), `dead-cliche-hook-${key}`);
    if (fs.existsSync(marker) && Date.now() - fs.statSync(marker).mtimeMs < 10_000) return true;
    fs.writeFileSync(marker, '');
    return false;
  } catch {
    return false;
  }
}

function cmdClaudeHook() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  try {
    if (input?.tool_name === 'Bash' || (!input?.tool_input?.file_path && input?.tool_input?.command)) {
      const files = extractPathsFromCommand(input?.tool_input?.command ?? '', input?.cwd ?? process.cwd());
      if (files.length && hookDedup(input?.session_id ?? '', files)) process.exit(0);
      const all = files.flatMap((f) => {
        try { return hookCheckFile(f); } catch { return []; }
      }).filter((v) => v.severity !== 'info'); // errorとwarnは修正必須、infoは止めない
      if (all.length === 0) process.exit(0);
      const lines = all.slice(0, 15).map((v) => `- ${v.file}:${v.line} [${v.ruleId}] 「${v.matched.replace(/\n/g, '\\n')}」 → ${v.ask}`);
      console.error(
        `dead-cliche: Bash で書かれた文書にクリシェがあります (${all.length} 件)。意味を保ったまま書き直してください。\n` + lines.join('\n')
      );
      process.exit(2);
    }
    const filePath = input?.tool_input?.file_path;
    if (!filePath || !TEXT_EXT.has(path.extname(filePath)) || hookSkipped(path.resolve(filePath))) process.exit(0);
    if (hookDedup(input?.session_id ?? '', [path.resolve(filePath)])) process.exit(0);
    const rc = findRc(path.dirname(filePath));
    if (rc?.ignore) {
      const rel = path.relative(rc._dir, filePath);
      if (rc.ignore.some((pat) => rel.startsWith(pat) || rel.includes(`/${pat}`))) process.exit(0);
    }
    const rules = applyRcRuleConfig([...getRules({ preset: rc?.preset ?? 'paper' }), ...loadCustomRules(rc, { warn: () => {} })], rc);
    const text = fs.readFileSync(filePath, 'utf8');
    const violations = checkText(text, filePath, rules).filter((v) => v.severity !== 'info'); // errorとwarnは修正必須、infoは止めない
    if (violations.length === 0) process.exit(0);
    const lines = violations
      .slice(0, 15)
      .map((v) => `- ${path.basename(filePath)}:${v.line} [${v.ruleId}] 「${v.matched.replace(/\n/g, '\\n')}」 → ${v.ask}`);
    console.error(
      `dead-cliche: クリシェを検出しました (${violations.length} 件)。意味を保ったまま書き直してください。\n` +
        lines.join('\n')
    );
    process.exit(2);
  } catch {
    process.exit(0);
  }
}

// 決定論的修正。既定はdry-runで、--writeを付けたときだけ書き込む。
function cmdFix(args) {
  const files = args._;
  if (files.length === 0) {
    console.error('使い方: dead-cliche fix <files...> [--preset name] [--write]');
    process.exit(2);
  }
  let totalEdits = 0;
  for (const f of files) {
    const rc = findRc(path.dirname(path.resolve(f)));
    const preset = args.flags.preset ?? rc?.preset ?? 'paper';
    const rules = applyRcRuleConfig([...getRules({ preset, rulesDir: args.flags['rules-dir'] }), ...loadCustomRules(rc)], rc);
    const text = fs.readFileSync(f, 'utf8');
    const masked = MD_EXT.has(path.extname(f)) ? maskMarkdownCode(text) : text;
    const { text: fixed, applied } = applyFixes(text, rules, { maskedText: masked });
    totalEdits += applied.length;
    for (const e of applied) {
      console.log(`${f}: ${e.ruleId} 「${e.before}」→「${e.after}」`);
    }
    if (args.flags.write && applied.length > 0) fs.writeFileSync(f, fixed);
  }
  if (totalEdits === 0) {
    console.log('決定論的に修正できる検出はありません (fixを持たないルールは書き直しが必要です)');
  } else {
    console.log(`\n${totalEdits} 件${args.flags.write ? 'を書き込みました' : ' (dry-run。書き込むには --write)'}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._.shift();
if (cmd === 'version' || args.flags.version) {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}
switch (cmd) {
  case 'check':
    cmdCheck(args);
    break;
  case 'fix':
    cmdFix(args);
    break;
  case 'list':
    cmdList(args);
    break;
  case 'explain':
    cmdExplain(args);
    break;
  case 'claude-hook':
    cmdClaudeHook();
    break;
  default:
    console.log('使い方: dead-cliche <check|fix|list|explain|claude-hook> [options]');
    console.log('  check [files...] [--preset name] [--format json] [--min-severity warn] [--fail-on info|warn|error]  (既定: warn以上でexit 1)');
    console.log('  fix <files...> [--preset name] [--write]   決定論的修正 (既定はdry-run)');
    console.log('  list [--preset name] [--manual]');
    console.log('  explain <rule-id>');
    process.exit(cmd ? 2 : 0);
}
