// dead-cliche ui — プロジェクト辞書 (.deadcliche/custom-rules.yml) をYAMLを書かずに
// 編集するためのローカルフォーム。
//
// 脅威モデルは docs/custom-rules-and-autofix.md のとおり。辞書への書き込みは
// コード実行に近い権限なので、この経路には次を必須にする。
//
//   - 127.0.0.1 にだけ束ねる (外から届かない)
//   - Hostヘッダを検査する (DNSリバインディングで別名から入られない)
//   - 起動時に作る合言葉 (token) を、ページの取得と保存の両方で要求する
//   - Originヘッダがあるとき、自分の生成元と一致しなければ拒む (別サイトのフォーム投稿)
//   - 受け取るのは surface (リテラル) だけ。pattern は一切受け取らない
//   - 書き込むのはカスタム辞書ファイルだけ。rules/ (共有辞書) には書かない
//
// 保存はjs-yamlのdumpを通す。フォーム入力を文字列連結でYAML化しない (構造破壊を防ぐ)。

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import { check } from './engine.mjs';

const MAX_FIELD = 400; // 1項目の上限。辞書に長文を入れさせない
const SEVERITIES = new Set(['error', 'warn', 'info']);

export function readCustomRules(file) {
  if (!fs.existsSync(file)) return [];
  const entries = yaml.load(fs.readFileSync(file, 'utf8')) ?? [];
  return Array.isArray(entries) ? entries : [];
}

export function writeCustomRules(file, rules) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const header = '# dead-cliche のプロジェクト辞書。dead-cliche ui で編集できます。\n' +
    '# surface (リテラル) だけを持ちます。正規表現はレビューを通る経路 (PR) で足してください。\n';
  fs.writeFileSync(file, header + yaml.dump(rules, { lineWidth: 100, noRefs: true }));
}

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
const lines = (value) =>
  trimmed(value)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

// フォームの入力を1エントリに変換する。ここが信頼境界なので、通す形を狭く固定する。
export function ruleFromForm(form, existing = []) {
  const problems = [];
  const surface = trimmed(form.surface);
  if (!surface) problems.push('検出したい表現が空です');
  if (surface.length > MAX_FIELD) problems.push(`検出したい表現が長すぎます (${MAX_FIELD}文字まで)`);

  const why = trimmed(form.why);
  const ask = trimmed(form.ask);
  if (!why) problems.push('なぜ避けるかが空です');
  if (!ask) problems.push('代わりに何を書くかが空です');
  for (const [label, value] of [['なぜ避けるか', why], ['代わりに何を書くか', ask]]) {
    if (value.length > MAX_FIELD) problems.push(`${label}が長すぎます (${MAX_FIELD}文字まで)`);
  }

  const severity = SEVERITIES.has(form.severity) ? form.severity : 'error';
  const bad = lines(form.bad);
  const good = lines(form.good);
  const deny = lines(form.deny);
  if (bad.length === 0) problems.push('悪い例がありません');
  if (good.length === 0) problems.push('良い例がありません');

  const id = nextId(existing);
  const rule = {
    id,
    severity,
    surface: [surface],
    why,
    ask,
    examples: { bad, good },
  };
  if (deny.length > 0) rule.deny_examples = deny;

  // 追加する前に、この規則が自分の例をどう判定するかを見せる
  const warnings = [];
  if (surface) {
    for (const b of bad) if (check(b, [rule]).length === 0) warnings.push(`悪い例が検出されません: ${b}`);
    for (const g of good) if (check(g, [rule]).length > 0) warnings.push(`良い例を誤検出します: ${g}`);
    for (const d of deny) if (check(d, [rule]).length > 0) warnings.push(`検出しない例を誤検出します: ${d}`);
  }
  if (existing.some((r) => (r.surface ?? []).includes(surface))) {
    problems.push(`同じ表現がすでに登録されています: ${surface}`);
  }
  return { rule, problems, warnings };
}

// idは機械が振る。custom/ で始まらないエントリはエンジンが読まないため
function nextId(existing) {
  const used = new Set(existing.map((r) => r.id));
  for (let n = 1; ; n++) {
    const id = `custom/rule-${n}`;
    if (!used.has(id)) return id;
  }
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page({ file, token, rules, message, error, warnings = [], form = {} }) {
  const rows = rules
    .map(
      (r) => `<tr>
      <td><code>${escapeHtml(r.id)}</code></td>
      <td>${(r.surface ?? []).map((s) => `<b>${escapeHtml(s)}</b>`).join('、')}</td>
      <td>${escapeHtml(r.severity ?? 'error')}</td>
      <td>${escapeHtml(r.why ?? '')}<br><span class="soft">→ ${escapeHtml(r.ask ?? '')}</span></td>
      <td><form method="post" action="/delete" onsubmit="return confirm('${escapeHtml(r.id)} を削除します。よろしいですか')">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <input type="hidden" name="id" value="${escapeHtml(r.id)}">
        <button class="ghost">削除</button>
      </form></td>
    </tr>`
    )
    .join('\n');

  const notices = [
    error ? `<p class="notice error">${escapeHtml(error)}</p>` : '',
    message ? `<p class="notice ok">${escapeHtml(message)}</p>` : '',
    warnings.length
      ? `<div class="notice warn"><b>登録しましたが、確認してください</b><ul>${warnings
          .map((w) => `<li>${escapeHtml(w)}</li>`)
          .join('')}</ul></div>`
      : '',
  ].join('');

  const value = (name) => escapeHtml(form[name] ?? '');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>dead-cliche ui — プロジェクト辞書の編集</title>
<style>
:root {
  --paper: #F6F6F3; --card: #FFFFFF; --ink: #22262A; --ink-soft: #545C63;
  --line: #DDDBD3; --indigo: #2A4B7C; --shu: #B8432C; --amber: #8A6A1F; --green: #2E6E4E;
  --mono-bg: #EFEEE8; --focus: #2A4B7C;
  --font-ui: "IBM Plex Sans JP", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", monospace;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #15181B; --card: #1D2125; --ink: #E7E6E1; --ink-soft: #A2A9AF;
    --line: #333A40; --indigo: #8FB0DE; --shu: #E07A5F; --amber: #D3B265; --green: #7FBD9A;
    --mono-bg: #121517; --focus: #8FB0DE;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font-family: var(--font-ui); font-size: 14.5px; line-height: 1.75;
}
header { border-bottom: 1px solid var(--line); padding: 24px; }
h1 { font-size: 22px; margin: 0 0 4px; }
h1 .brand { font-family: var(--font-mono); color: var(--indigo); }
h2 { font-size: 16px; margin: 0 0 12px; }
main { max-width: 1000px; margin: 0 auto; padding: 24px 24px 64px; display: grid; gap: 28px; }
.soft { color: var(--ink-soft); font-size: 13px; }
code, .path { font-family: var(--font-mono); background: var(--mono-bg); padding: 1px 5px; border-radius: 3px; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 5px; padding: 20px; }
label { display: block; font-weight: 700; font-size: 13px; margin-bottom: 4px; }
input[type=text], textarea, select {
  width: 100%; font: inherit; font-size: 14px; color: inherit;
  background: var(--paper); border: 1px solid var(--line); border-radius: 4px; padding: 7px 9px;
}
textarea { min-height: 62px; resize: vertical; }
.field { margin-bottom: 14px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 720px) { .two { grid-template-columns: 1fr; } }
button {
  font: inherit; font-size: 14px; cursor: pointer; border-radius: 4px;
  border: 1px solid var(--indigo); background: var(--indigo); color: #fff; padding: 7px 18px;
}
button.ghost { background: transparent; color: var(--shu); border-color: var(--line); padding: 3px 10px; font-size: 13px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 13.5px; }
th { font-size: 12.5px; color: var(--ink-soft); }
.notice { border-radius: 4px; padding: 10px 14px; margin: 0 0 14px; border: 1px solid var(--line); }
.notice.ok { color: var(--green); border-color: var(--green); }
.notice.error { color: var(--shu); border-color: var(--shu); }
.notice.warn { color: var(--amber); border-color: var(--amber); }
.notice ul { margin: 6px 0 0; padding-left: 20px; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
</style>
</head>
<body>
<header>
  <h1><span class="brand">dead-cliche ui</span> — プロジェクト辞書の編集</h1>
  <p class="soft">保存先: <span class="path">${escapeHtml(file)}</span>　このページは 127.0.0.1 からだけ開けます。共有辞書 (rules/) には書き込みません。</p>
</header>
<main>
  <section>
    <h2>表現を追加する</h2>
    ${notices}
    <form method="post" action="/add">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <div class="field">
        <label for="surface">検出したい表現</label>
        <input type="text" id="surface" name="surface" value="${value('surface')}" required
               placeholder="表現そのものを書く (正規表現は使えません)">
        <p class="soft">入力はそのままの文字列として扱います。正規表現が要る場合はPRで追加してください。</p>
      </div>
      <div class="two">
        <div class="field">
          <label for="why">なぜ避けるか</label>
          <textarea id="why" name="why" required>${value('why')}</textarea>
        </div>
        <div class="field">
          <label for="ask">代わりに何を書くか</label>
          <textarea id="ask" name="ask" required>${value('ask')}</textarea>
        </div>
      </div>
      <div class="two">
        <div class="field">
          <label for="bad">悪い例 (1行に1つ)</label>
          <textarea id="bad" name="bad" required>${value('bad')}</textarea>
        </div>
        <div class="field">
          <label for="good">良い例 (1行に1つ)</label>
          <textarea id="good" name="good" required>${value('good')}</textarea>
        </div>
      </div>
      <div class="two">
        <div class="field">
          <label for="deny">検出してはいけない例 (任意、1行に1つ)</label>
          <textarea id="deny" name="deny">${value('deny')}</textarea>
        </div>
        <div class="field">
          <label for="severity">重大度</label>
          <select id="severity" name="severity">
            <option value="error">error (修正必須)</option>
            <option value="warn">warn (修正必須。CI・フックが止める)</option>
            <option value="info">info (表示のみ)</option>
          </select>
        </div>
      </div>
      <button type="submit">辞書に追加する</button>
    </form>
  </section>

  <section>
    <h2>登録済み (${rules.length}件)</h2>
    ${
      rules.length === 0
        ? '<p class="soft">まだ登録がありません。</p>'
        : `<table><thead><tr><th>id</th><th>表現</th><th>重大度</th><th>理由と直し方</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    }
  </section>
</main>
</body>
</html>`;
}

function parseForm(body) {
  const params = new URLSearchParams(body);
  return Object.fromEntries(params.entries());
}

// 合言葉の比較は長さを揃えてから定数時間で行う
function tokenMatches(expected, given) {
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

export function createUiServer({ file, token = crypto.randomBytes(24).toString('hex'), port = 7777 } = {}) {
  // 実際に束ねたポートで判定する (0を渡して空きポートを取る場合があるため)
  const allowedHost = (host) => {
    const bound = server.address()?.port ?? port;
    return new Set([`127.0.0.1:${bound}`, `localhost:${bound}`, `[::1]:${bound}`]).has(host);
  };

  const server = http.createServer((req, res) => {
    const send = (status, html) => {
      res.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        // このページは何も外部に出さない。埋め込みも読み込みも禁じる
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      });
      res.end(html);
    };
    const deny = (status, text) => send(status, `<!doctype html><meta charset="utf-8"><p>${escapeHtml(text)}</p>`);

    // 別名で到達した要求は受けない (DNSリバインディング対策)
    if (!allowedHost(req.headers.host ?? '')) return deny(403, 'このアドレスからは操作できません');
    const origin = req.headers.origin;
    if (origin && !allowedHost(new URL(origin).host)) return deny(403, '別のサイトからの操作は受け付けません');

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET') {
      if (!tokenMatches(token, url.searchParams.get('token') ?? '')) {
        return deny(403, '合言葉が違います。起動時に表示されたURLを開いてください');
      }
      const rules = readCustomRules(file);
      const state = { file, token, rules };
      const kind = url.searchParams.get('done');
      if (kind === 'added') state.message = '辞書に追加しました。';
      if (kind === 'deleted') state.message = '辞書から削除しました。';
      const warn = url.searchParams.getAll('warn');
      if (warn.length) state.warnings = warn;
      return send(200, page(state));
    }

    if (req.method !== 'POST') return deny(405, '対応していない操作です');

    let body = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        tooLarge = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooLarge) return deny(413, '入力が大きすぎます');
      const form = parseForm(body);
      if (!tokenMatches(token, form.token ?? '')) return deny(403, '合言葉が違います');

      const rules = readCustomRules(file);
      if (url.pathname === '/delete') {
        const next = rules.filter((r) => r.id !== form.id);
        if (next.length === rules.length) return deny(404, '指定されたidがありません');
        writeCustomRules(file, next);
        res.writeHead(303, { location: `/?token=${token}&done=deleted` });
        return res.end();
      }
      if (url.pathname !== '/add') return deny(404, 'そのページはありません');

      const { rule, problems, warnings } = ruleFromForm(form, rules);
      if (problems.length > 0) {
        return send(400, page({ file, token, rules, error: problems.join(' / '), form }));
      }
      writeCustomRules(file, [...rules, rule]);
      const query = warnings.map((w) => `&warn=${encodeURIComponent(w)}`).join('');
      res.writeHead(303, { location: `/?token=${token}&done=added${query}` });
      res.end();
    });
  });

  return { server, token, listen: (p = port) => new Promise((resolve) => server.listen(p, '127.0.0.1', resolve)) };
}
