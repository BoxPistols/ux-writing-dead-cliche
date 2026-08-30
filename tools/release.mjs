#!/usr/bin/env node
// リリース手順を1コマンドにまとめる。順序と検証を強制し、失敗したらその場で止める。
//   node tools/release.mjs <patch|minor|major|X.Y.Z> [--dry-run] [--skip-npm] [--resume] [--otp=123456]
// 手順の意図と各段階の理由は docs/release-guide.md にある。
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { PACKAGE_ROOT } from '../src/load-rules.mjs';

const args = process.argv.slice(2);
const bump = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const skipNpm = args.includes('--skip-npm');
// 途中で失敗したリリースを、版を上げ直さずに続きから流す
const resume = args.includes('--resume');
// 認証アプリの6桁コード。TTYが無い環境 (Claude Code等) ではこれが無いとpublishできない
const otp = (args.find((a) => a.startsWith('--otp=')) || '').slice('--otp='.length) || process.env.NPM_OTP || '';

if (!bump && !resume) {
  console.error('使い方: node tools/release.mjs <patch|minor|major|X.Y.Z> [--dry-run] [--skip-npm] [--resume] [--otp=123456]');
  process.exit(2);
}

const run = (cmd, opts = {}) => execSync(cmd, { cwd: PACKAGE_ROOT, stdio: 'pipe', encoding: 'utf8', ...opts });
const step = (n, label) => console.log(`\n[${n}] ${label}`);
const fail = (msg) => { console.error(`\n中止: ${msg}`); process.exit(1); };
const warn = (msg) => console.warn(`  注意: ${msg}`);
// 対話を伴う外部コマンドは、終了コードを見ないと失敗が黙って通り過ぎる
const runInherit = (cmd, cmdArgs) => spawnSync(cmd, cmdArgs, { cwd: PACKAGE_ROOT, stdio: 'inherit' });

const PKG = 'textlint-rule-ux-writing-dead-cliche';
const isPublished = (v) => {
  try { return run(`npm view ${PKG}@${v} version`).trim() === v; } catch { return false; }
};

const pkgPath = path.join(PACKAGE_ROOT, 'package.json');
const pluginPath = path.join(PACKAGE_ROOT, '.claude-plugin', 'plugin.json');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');

const pkg = readJson(pkgPath);
const current = pkg.version;
function nextVersion(v, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [maj, min, pat] = v.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  fail(`バージョンの指定が不正です: ${kind}`);
}
const version = !bump && resume ? current : nextVersion(current, bump);

step(0, `事前確認 (${current}${version === current ? '' : ` → ${version}`}${dryRun ? '、dry-run' : ''}${resume ? '、resume' : ''})`);
const status = run('git status --porcelain').trim();
if (status) fail(`未コミットの変更があります。先に整理してください:\n${status}`);
const branch = run('git rev-parse --abbrev-ref HEAD').trim();
if (branch !== 'main') fail(`mainブランチで実行してください (現在: ${branch})`);
run('git fetch -q origin');
const behind = run('git rev-list --count HEAD..origin/main').trim();
if (behind !== '0') fail(`origin/mainに追いついていません (${behind}コミット遅れ)。git pullしてください`);

// 版を上げてpushしてから最後の1歩で落ちると、公開されていない版がmainに残る。
// 後段で必要になる認証は、何も変更していないこの時点で確かめる。
if (!dryRun) {
  try { run('gh auth status'); } catch { fail('ghにログインしていません。gh auth login を実行してください'); }
}
const alreadyPublished = dryRun ? false : isPublished(version);
if (!dryRun && !resume && alreadyPublished) fail(`${version} はすでにnpmに公開されています。続きから流すなら --resume を付けてください`);
const willPublish = !dryRun && !skipNpm && !alreadyPublished;
if (!dryRun && !skipNpm) {
  let npmUser;
  try { npmUser = run('npm whoami').trim(); } catch { fail('npmにログインしていません。npm login を実行してください'); }
  // 2要素認証はTTYか--otpのどちらかが要る。公開しない回にまで要求しない
  if (willPublish && !otp && !process.stdin.isTTY) {
    fail([
      'npmの2要素認証を通せません。publishにはTTYか--otpのどちらかが要ります。',
      `  認証アプリがあるなら: npm run release ${bump || '--'} -- --otp=123456`,
      '  無いなら、Claude Codeを経由しない端末から実行してください。',
    ].join('\n'));
  }
  console.log(`  npm: ${npmUser} / ${willPublish ? `2要素認証: ${otp ? '--otp' : 'TTYで対話'}` : `${version} は公開済み`}`);
}

step(1, 'バージョンを更新する');
for (const p of [pkgPath, pluginPath]) {
  const d = readJson(p);
  d.version = version;
  writeJson(p, d);
}
const pluginVersion = readJson(pluginPath).version;
if (pluginVersion !== version) fail(`plugin.jsonの版が一致しません (${pluginVersion})`);
console.log(`  package.json と plugin.json を ${version} にしました`);

step(2, '生成物を作り直す');
run('node tools/render-prompts.mjs');
run('node tools/render-webdata.mjs');
fs.writeFileSync(path.join(PACKAGE_ROOT, 'docs', 'before-after.md'), run('node tools/render-comparison.mjs'));
console.log('  prompts / app-data / engine / before-after を再生成しました');

step(3, 'テストと自己検査');
try {
  run('npm test');
  console.log('  npm test: 通過');
} catch (e) {
  fail(`テストが失敗しました:\n${(e.stdout || '') + (e.stderr || '')}`);
}
const docs = fs.readdirSync(path.join(PACKAGE_ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`);
const check = spawnSync('node', ['src/cli.mjs', 'check', 'README.md', 'CONTRIBUTING.md', 'DESIGN.md', ...docs], { cwd: PACKAGE_ROOT, encoding: 'utf8' });
if (check.status !== 0) fail(`自分の文書が自分の検査に落ちました:\n${check.stdout}`);
console.log('  自己検査: 通過');

step(4, '公開範囲の確認');
const packed = run('npm pack --dry-run 2>&1');
const files = packed.split('\n').filter((l) => /npm notice \d+(\.\d+)?[kMG]?B /.test(l));
console.log(`  公開されるファイル: ${files.length}件`);
const risky = files.filter((l) => /\.env|secret|token|credential|\.pem|\.key/i.test(l));
if (risky.length) fail(`公開物に機密の疑いがあるファイルが含まれています:\n${risky.join('\n')}`);
const leaked = spawnSync('grep', ['-rlniE', 'KDDI|sdpf|daas|kiro', 'rules', 'presets', 'src', 'schema'], { cwd: PACKAGE_ROOT, encoding: 'utf8' });
if (leaked.stdout.trim()) fail(`配布物に業務固有の語が含まれています:\n${leaked.stdout}`);
console.log('  機密・業務固有語の混入: なし');

if (dryRun) {
  console.log('\ndry-runのため、ここで終了します。バージョンと生成物の変更は残っています。');
  console.log('元に戻すには: git checkout -- package.json .claude-plugin/plugin.json docs/');
  process.exit(0);
}

step(5, 'コミットとpush');
run('git add -A');
if (run('git status --porcelain').trim()) {
  run(`git commit -q -m "v${version}"`);
  console.log(`  v${version} をコミットしました`);
} else {
  console.log('  コミットする変更はありません');
}
if (run('git rev-list --count origin/main..HEAD').trim() !== '0') {
  run('git push -q');
  console.log('  pushしました');
} else {
  console.log('  pushする差分はありません');
}

step(6, 'CIの結果を待つ');
// --limit 1 で最新を取ると、pushの実行が登録される前は前のコミットの完了済み実行を読み、
// 別のコミットのsuccessでpublishまで進んでしまう。対象のコミットで絞る。
const headSha = run('git rev-parse HEAD').trim();
let ciOk = false;
for (let i = 0; i < 30; i++) {
  const out = run('gh run list --workflow ci.yml --limit 20 --json status,conclusion,headSha').trim();
  const row = JSON.parse(out).find((r) => r.headSha === headSha);
  if (row?.status === 'completed') {
    if (row.conclusion !== 'success') fail(`CIが ${row.conclusion} で終わりました (${headSha.slice(0, 7)})。修正してから再実行してください`);
    ciOk = true;
    break;
  }
  execSync('sleep 10');
}
if (!ciOk) fail(`CIが5分以内に完了しませんでした (${headSha.slice(0, 7)})。手動で確認してください`);
console.log(`  CI: success (${headSha.slice(0, 7)})`);

if (!skipNpm) {
  // 飛ばす回に認証の案内を出さない
  const upAlready = isPublished(version);
  step(7, `npmに公開する${upAlready ? '' : ` (${otp ? '--otpで認証' : '2要素認証のためブラウザが開きます'})`}`);
  if (upAlready) {
    console.log(`  ${version} は公開済みです。飛ばします`);
  } else {
    const publishArgs = ['publish', '--access', 'public'];
    if (otp) publishArgs.push(`--otp=${otp}`);
    const pub = runInherit('npm', publishArgs);
    if (pub.status !== 0) {
      fail([
        `npm publishが失敗しました (終了コード ${pub.status})。`,
        '  EOTPなら、認証アプリの6桁コードを --otp= で渡すか、TTYのある端末で実行してください。',
        `  版はコミット済みなので、続きは: npm run release -- --resume --otp=123456`,
      ].join('\n'));
    }
    if (!isPublished(version)) fail(`npmの公開が確認できません (レジストリ上は ${run(`npm view ${PKG} version`).trim()})`);
    console.log(`  npm: ${version} を公開しました`);
  }
}

step(8, 'Releaseとスキルzip');
run('node tools/build-claude-ai-skill.mjs');
const zipPath = path.join(PACKAGE_ROOT, 'dist', 'dead-cliche-review.zip');
if (!fs.existsSync(zipPath)) fail('dist/dead-cliche-review.zip が作られていません');
const exists = spawnSync('gh', ['release', 'view', `v${version}`, '--json', 'tagName'], { cwd: PACKAGE_ROOT, encoding: 'utf8' });
if (exists.status === 0) {
  console.log(`  v${version} のReleaseは作成済みです。飛ばします`);
} else {
  const notes = process.env.RELEASE_NOTES || `v${version} の変更点は git log を参照してください。`;
  const rel = runInherit('gh', ['release', 'create', `v${version}`, 'dist/dead-cliche-review.zip', '--title', `v${version}`, '--notes', notes]);
  if (rel.status !== 0) fail(`gh release createが失敗しました (終了コード ${rel.status})。npmには公開済みなので、続きは --resume で流せます`);
  console.log(`  Release v${version} を作成しました`);
}

step(9, 'プラグインの更新');
const plug = spawnSync('claude', ['plugin', 'update', 'dead-cliche@ux-writing-dead-cliche'], { stdio: 'inherit' });
if (plug.status !== 0) warn(`プラグインの更新に失敗しました (終了コード ${plug.status})。手元の反映だけの問題なので、あとで claude plugin update を実行してください`);

console.log(`\nv${version} のリリースが完了しました。`);
console.log('確認: https://www.npmjs.com/package/textlint-rule-ux-writing-dead-cliche');
console.log('      https://boxpistols.github.io/ux-writing-dead-cliche/');
