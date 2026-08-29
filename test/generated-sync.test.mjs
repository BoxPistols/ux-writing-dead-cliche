// 生成物 (prompts / app-data / engine複製 / 比較表) が辞書・バージョンと同期していることを
// ローカルのnpm testで強制する。CIだけに置くとbump時の再生成漏れがpush後に発覚する
// (v0.11.1〜v0.12.1で実際にCIが8連続赤になった)。
// 判定は「レンダラーを再実行しても内容が変わらないこと」。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const TARGETS = [
  'docs/prompts/writing-guard.md',
  'docs/prompts/writing-guard-compact.md',
  'docs/prompts/ux-writing-guard.md',
  'docs/prompts/clean-sheet-writing.md',
  'docs/app-data.json',
  'docs/engine.mjs',
  'docs/before-after.md',
];

test('生成物が辞書とバージョンに同期している', () => {
  const before = Object.fromEntries(TARGETS.map((f) => [f, fs.readFileSync(f, 'utf8')]));
  execSync('node tools/render-prompts.mjs', { stdio: 'pipe' });
  execSync('node tools/render-webdata.mjs', { stdio: 'pipe' });
  execSync('node tools/render-comparison.mjs > docs/before-after.md', { stdio: 'pipe', shell: '/bin/bash' });
  const stale = TARGETS.filter((f) => fs.readFileSync(f, 'utf8') !== before[f]);
  assert.equal(stale.length, 0,
    `生成物が未再生成でした (このテストが再生成済みなので、差分をコミットしてください): ${stale.join(', ')}`);
});
