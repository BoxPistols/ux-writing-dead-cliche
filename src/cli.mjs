#!/usr/bin/env node
// dead-cliche CLI。
//   dead-cliche check [files...] [--preset name] [--format pretty|json] [--min-severity warn]
//   dead-cliche list [--preset name] [--manual]
//   dead-cliche explain <rule-id>
//   dead-cliche claude-hook   (Claude Code の PostToolUse フックから stdin JSON で呼ばれる)

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadAllRules, loadPreset, rulesForPreset, findRc } from './load-rules.mjs';
import { check, maskMarkdownCode, hasErrors } from './engine.mjs';

const MD_EXT = new Set(['.md', '.mdx', '.markdown']);
const TEXT_EXT = new Set([...MD_EXT, '.txt']);

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (['preset', 'format', 'min-severity', 'rules-dir'].includes(key)) {
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
    const rules = getRules({ preset, rulesDir: args.flags['rules-dir'] });
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
    console.log('検出なし');
  } else {
    console.log(`\n${total} 件 (error ${errors} 件)`);
  }
  process.exit(errors > 0 ? 1 : 0);
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

// Claude Code PostToolUse フック。失敗しても編集を妨げない (常に握りつぶして exit 0)。
function cmdClaudeHook() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  try {
    const filePath = input?.tool_input?.file_path;
    if (!filePath || !TEXT_EXT.has(path.extname(filePath))) process.exit(0);
    const rc = findRc(path.dirname(filePath));
    if (rc?.ignore) {
      const rel = path.relative(rc._dir, filePath);
      if (rc.ignore.some((pat) => rel.startsWith(pat) || rel.includes(`/${pat}`))) process.exit(0);
    }
    const rules = getRules({ preset: rc?.preset ?? 'paper' });
    const text = fs.readFileSync(filePath, 'utf8');
    const violations = checkText(text, filePath, rules);
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

const args = parseArgs(process.argv.slice(2));
const cmd = args._.shift();
switch (cmd) {
  case 'check':
    cmdCheck(args);
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
    console.log('使い方: dead-cliche <check|list|explain|claude-hook> [options]');
    console.log('  check [files...] [--preset paper|business|chat|ux-microcopy] [--format json] [--min-severity warn]');
    console.log('  list [--preset name] [--manual]');
    console.log('  explain <rule-id>');
    process.exit(cmd ? 2 : 0);
}
