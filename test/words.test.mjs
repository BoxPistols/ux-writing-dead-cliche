import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseWords, wordRules } from '../src/words.mjs';
import { check } from '../src/engine.mjs';

const CLI = path.resolve('src/cli.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-words-'));
const wordsFile = path.join(dir, 'words.txt');
fs.writeFileSync(wordsFile, '# コメント\n版 → バージョン (除外: 日本語版 版画)\n架空語\n');

function hook(input) {
  return spawnSync(process.execPath, [CLI, 'claude-hook'], {
    input: JSON.stringify(input),
    env: { ...process.env, DEAD_CLICHE_WORDS: wordsFile },
    encoding: 'utf8',
  });
}

test('一覧の書式: 言い換えと除外とコメントを読む', () => {
  assert.deepEqual(parseWords('版 → バージョン (除外: 日本語版 版画)\n# x\n\n架空語 # 理由\n'), [
    { word: '版', instead: 'バージョン', except: ['日本語版', '版画'] },
    { word: '架空語', instead: '', except: [] },
  ]);
});

test('除外語の中の語だけを外す (語の前後どちらにあっても)', () => {
  const rules = wordRules(parseWords('版 → バージョン (除外: 日本語版 版画)'));
  const hits = check('新しい版。Wikipedia日本語版。版画展。', rules).map((v) => v.index);
  assert.deepEqual(hits, [3]);
});

test('PreToolUse: コミットの本文に一覧の語があれば止める', () => {
  const r = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m "新しい版にする"' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /「版」/);
  const ok = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m "バージョンを上げる"' } });
  assert.equal(ok.status, 0);
  const other = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'grep 版 README.md' } });
  assert.equal(other.status, 0);
});

test('PreToolUse: --body-file の中身も調べる', () => {
  const body = path.join(dir, 'body.md');
  fs.writeFileSync(body, '架空語を使った本文');
  const r = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: `gh pr create --body-file ${body}` } });
  assert.equal(r.status, 2);
});

test('Stop: 返答に一覧の語があれば書き直しを求め、2回目は止めない', () => {
  const r = hook({ hook_event_name: 'Stop', last_assistant_message: '新しい版です。`版` はコードなので数えない' });
  assert.equal(JSON.parse(r.stdout).decision, 'block');
  const again = hook({ hook_event_name: 'Stop', stop_hook_active: true, last_assistant_message: '新しい版です' });
  assert.equal(again.stdout, '');
});

test('Stop: 会話の記録から、今回の返答だけを読む', () => {
  const tr = path.join(dir, 'tr.jsonl');
  fs.writeFileSync(tr, [
    { type: 'assistant', message: { content: [{ type: 'text', text: '前の返答の版' }] } },
    { type: 'user', message: { content: '次の質問' } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: '版' }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'バージョンを上げました' }] } },
  ].map((e) => JSON.stringify(e)).join('\n'));
  assert.equal(hook({ hook_event_name: 'Stop', transcript_path: tr }).stdout, '');
});

test('PostToolUse: 書いた文書の一覧の語を止める', () => {
  const md = path.join(dir, 'a.md');
  fs.writeFileSync(md, '架空語の説明。\n');
  const r = hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', session_id: String(Date.now()), tool_input: { file_path: md } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /words\/2/);
});

test('一覧のファイルそのものは検査しない', () => {
  const r = hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', session_id: String(Date.now()), tool_input: { file_path: wordsFile } });
  assert.equal(r.status, 0);
});
