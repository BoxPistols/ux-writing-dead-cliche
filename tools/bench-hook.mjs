#!/usr/bin/env node
// フックとCLIの所要時間を測る。docs/performance.md の表はこの出力から書いている。
// シェルや time コマンドを挟むとその起動時間が乗るので、Node.jsから直接起動して測る。
//   node tools/bench-hook.mjs [対象ファイル] [回数]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'src', 'cli.mjs');
const target = path.resolve(process.argv[2] ?? path.join(root, 'README.md'));
const n = Number(process.argv[3] ?? 10);

function measure(label, args, input) {
  const times = [];
  for (let i = 0; i < n; i++) {
    const start = process.hrtime.bigint();
    spawnSync(process.execPath, args, { input: typeof input === 'function' ? input(i) : input });
    times.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  times.sort((a, b) => a - b);
  console.log(`${label}: 中央値 ${times[n >> 1].toFixed(0)}ms / 最大 ${times[n - 1].toFixed(0)}ms`);
}

console.log(`対象: ${path.relative(process.cwd(), target)} / ${n}回`);
measure('Node.jsの起動だけ', ['-e', '0'], '');
measure('check (ファイル全体)', [cli, 'check', target], '');
// セッションIDを毎回変え、重複防止に止められずに検査まで進ませる
measure('claude-hook (Markdown)', [cli, 'claude-hook'], (i) =>
  JSON.stringify({ session_id: `bench-${process.pid}-${i}`, tool_input: { file_path: target } }));
measure('claude-hook (Markdown以外)', [cli, 'claude-hook'],
  JSON.stringify({ session_id: 'bench', tool_input: { file_path: path.join(root, 'package.json') } }));
