// ローカル編集フォーム。辞書への書き込みはコード実行に近い権限なので、
// 「誰が書けるか」と「何を書けるか」の両方を固定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import yaml from 'js-yaml';
import { createUiServer, ruleFromForm, readCustomRules } from '../src/ui.mjs';
import { loadCustomRules } from '../src/load-rules.mjs';
import { check } from '../src/engine.mjs';

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-cliche-ui-'));
  return path.join(dir, '.deadcliche', 'custom-rules.yml');
}

const validForm = (over = {}) => ({
  surface: '鋭意対応中',
  why: '進捗が書かれない。いつ何が終わるのかが伝わらない',
  ask: '今どこまで進み、いつ終わるのかを書く',
  bad: '本件は鋭意対応中です',
  good: '本日中に原因を特定し、明日修正版を出します。',
  severity: 'error',
  ...over,
});

// サーバーを立て、合言葉付きのURLと後始末を返す
async function withServer(file, fn) {
  const { server, token, listen } = createUiServer({ file, port: 0 });
  await listen(0);
  const { port } = server.address();
  try {
    await fn({ token, port, origin: `http://127.0.0.1:${port}` });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = (origin, pathname, body, headers = {}) =>
  fetch(`${origin}${pathname}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body).toString(),
  });

test('入力の検証: 空の項目と重複を弾く', () => {
  assert.ok(ruleFromForm(validForm({ surface: '' })).problems.some((p) => p.includes('表現')));
  assert.ok(ruleFromForm(validForm({ why: '' })).problems.some((p) => p.includes('なぜ')));
  assert.ok(ruleFromForm(validForm({ bad: '' })).problems.some((p) => p.includes('悪い例')));
  const existing = [{ id: 'custom/rule-1', surface: ['鋭意対応中'] }];
  assert.ok(ruleFromForm(validForm(), existing).problems.some((p) => p.includes('すでに登録')));
});

test('入力の検証: 例が噛み合わないときは警告として返す', () => {
  const { rule, problems, warnings } = ruleFromForm(validForm({ bad: 'この文に該当語はありません' }));
  assert.deepEqual(problems, []);
  assert.ok(warnings.some((w) => w.includes('悪い例が検出されません')), warnings.join(' / '));
  assert.equal(rule.id, 'custom/rule-1');
});

test('idは機械が振る (custom/ で始まらないとエンジンが読まない)', () => {
  const existing = [{ id: 'custom/rule-1' }, { id: 'custom/rule-2' }];
  assert.equal(ruleFromForm(validForm(), existing).rule.id, 'custom/rule-3');
});

test('合言葉が無い要求は通らない', async () => {
  const file = tempFile();
  await withServer(file, async ({ origin, token }) => {
    assert.equal((await fetch(`${origin}/`)).status, 403);
    assert.equal((await fetch(`${origin}/?token=wrong`)).status, 403);
    assert.equal((await post(origin, '/add', validForm())).status, 403);
    assert.equal((await fetch(`${origin}/?token=${token}`)).status, 200);
  });
});

// fetch は Host を差し替えられない (禁止ヘッダ) ので、生のhttpで送る
function rawGet(port, pathname, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, headers }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

test('別名のHostと別サイトのOriginは拒む', async () => {
  const file = tempFile();
  await withServer(file, async ({ origin, token, port }) => {
    // DNSリバインディング: 別名で解決させて同じアドレスに届いた要求
    assert.equal(await rawGet(port, `/?token=${token}`, { host: `attacker.test:${port}` }), 403);
    assert.equal(await rawGet(port, `/?token=${token}`, { host: `127.0.0.1:${port}` }), 200);
    const cross = await post(origin, '/add', { ...validForm(), token }, { origin: 'https://evil.example.com' });
    assert.equal(cross.status, 403);
    assert.equal(readCustomRules(file).length, 0, '拒んだ要求で書き込まれている');
  });
});

test('追加した表現がエンジンの読める辞書になる', async () => {
  const file = tempFile();
  await withServer(file, async ({ origin, token }) => {
    const res = await post(origin, '/add', { ...validForm(), token });
    assert.equal(res.status, 303);
  });
  const written = yaml.load(fs.readFileSync(file, 'utf8'));
  assert.equal(written.length, 1);
  assert.equal(written[0].id, 'custom/rule-1');
  // rcから読む経路 (CLI・フックと同じ) で読めて、実際に検出できること
  const rules = loadCustomRules({ customRules: [file], _dir: '/' }, { warn: () => {} });
  assert.equal(rules.length, 1);
  assert.equal(check('本件は鋭意対応中です。', rules).length, 1);
});

test('patternは受け取らない (リテラルだけを辞書に入れる)', async () => {
  const file = tempFile();
  await withServer(file, async ({ origin, token }) => {
    await post(origin, '/add', { ...validForm(), token, pattern: '(a+)+b', id: 'custom/injected' });
  });
  const written = yaml.load(fs.readFileSync(file, 'utf8'));
  assert.equal(written[0].pattern, undefined, 'patternが辞書に入っている');
  assert.equal(written[0].id, 'custom/rule-1', 'idを入力から取っている');
});

test('削除は確認を挟む。存在しないidは404', async () => {
  const file = tempFile();
  await withServer(file, async ({ origin, token }) => {
    await post(origin, '/add', { ...validForm(), token });
    assert.equal((await post(origin, '/delete', { token, id: 'custom/nope' })).status, 404);
    // 確認なしの削除は消さず、確認画面を返す
    const confirm = await post(origin, '/delete', { token, id: 'custom/rule-1' });
    assert.equal(confirm.status, 200);
    assert.match(await confirm.text(), /削除の確認/);
    assert.equal(readCustomRules(file).length, 1, '確認前に消えている');
    assert.equal((await post(origin, '/delete', { token, id: 'custom/rule-1', confirm: 'yes' })).status, 303);
  });
  assert.deepEqual(readCustomRules(file), []);
});

test('壊れた辞書ファイルでサーバーを落とさない', async () => {
  const file = tempFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '- id: [壊れた\n  surface\n');
  await withServer(file, async ({ origin, token, port }) => {
    assert.equal((await fetch(`${origin}/?token=${token}`)).status, 500);
    // 落ちていないこと (次の要求が届く)
    assert.equal(await rawGet(port, '/?token=wrong', { host: `127.0.0.1:${port}` }), 403);
  });
});

test('多バイト文字の合言葉でも落ちない', async () => {
  const file = tempFile();
  await withServer(file, async ({ origin, port }) => {
    assert.equal((await fetch(`${origin}/?token=${encodeURIComponent('あ'.repeat(48))}`)).status, 403);
    assert.equal(await rawGet(port, '/?token=x', { host: `127.0.0.1:${port}` }), 403);
  });
});

test('壊れたOriginでも落ちない', async () => {
  const file = tempFile();
  await withServer(file, async ({ origin, token }) => {
    const res = await post(origin, '/add', { ...validForm(), token }, { origin: 'null' });
    assert.equal(res.status, 403);
  });
});

test('知らない経路と操作は受け付けない', async () => {
  const file = tempFile();
  await withServer(file, async ({ origin, token }) => {
    assert.equal((await post(origin, '/other', { token })).status, 404);
    assert.equal((await fetch(`${origin}/?token=${token}`, { method: 'DELETE' })).status, 405);
  });
});
