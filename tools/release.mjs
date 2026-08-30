#!/usr/bin/env node
// リリース手順を1コマンドにまとめる。順序と検証を強制し、失敗したらその場で止める。
//   node tools/release.mjs <patch|minor|major|X.Y.Z> [--dry-run] [--skip-npm]
// 手順の意図と各段階の理由は docs/release-guide.md にある。
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { PACKAGE_ROOT } from '../src/load-rules.mjs';

const args = process.argv.slice(2);
const bump = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const skipNpm = args.includes('--skip-npm');

if (!bump) {
  console.error('使い方: node tools/release.mjs <patch|minor|major|X.Y.Z> [--dry-run] [--skip-npm]');
  process.exit(2);
}

const run = (cmd, opts = {}) => execSync(cmd, { cwd: PACKAGE_ROOT, stdio: 'pipe', encoding: 'utf8', ...opts });
const step = (n, label) => console.log(`\n[${n}] ${label}`);
const fail = (msg) => { console.error(`\n中止: ${msg}`); process.exit(1); };

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
const version = nextVersion(current, bump);

step(0, `事前確認 (${current} → ${version}${dryRun ? '、dry-run' : ''})`);
const status = run('git status --porcelain').trim();
if (status) fail(`未コミットの変更があります。先に整理してください:\n${status}`);
const branch = run('git rev-parse --abbrev-ref HEAD').trim();
if (branch !== 'main') fail(`mainブランチで実行してください (現在: ${branch})`);
run('git fetch -q origin');
const behind = run('git rev-list --count HEAD..origin/main').trim();
if (behind !== '0') fail(`origin/mainに追いついていません (${behind}コミット遅れ)。git pullしてください`);

step(1, 'バージョンを更新する');
for (const p of [pkgPath, pluginPath]) {
  const d = readJson(p);
  d.version = version;
  writeJson(p, d);
}
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
run(`git commit -q -m "v${version}"`);
run('git push -q');
console.log(`  v${version} をpushしました`);

step(6, 'CIの結果を待つ');
let ciOk = false;
for (let i = 0; i < 30; i++) {
  const out = run('gh run list --workflow ci.yml --limit 1 --json status,conclusion').trim();
  const [row] = JSON.parse(out);
  if (row?.status === 'completed') {
    if (row.conclusion !== 'success') fail(`CIが ${row.conclusion} で終わりました。修正してから再実行してください`);
    ciOk = true;
    break;
  }
  execSync('sleep 10');
}
if (!ciOk) fail('CIが5分以内に完了しませんでした。手動で確認してください');
console.log('  CI: success');

if (!skipNpm) {
  step(7, 'npmに公開する (2要素認証のためブラウザが開きます)');
  spawnSync('npm', ['publish', '--access', 'public'], { cwd: PACKAGE_ROOT, stdio: 'inherit' });
  const published = run('npm view textlint-rule-ux-writing-dead-cliche version').trim();
  if (published !== version) fail(`npmの公開が確認できません (レジストリ上は ${published})`);
  console.log(`  npm: ${version} を公開しました`);
}

step(8, 'Releaseとスキルzip');
run('node tools/build-claude-ai-skill.mjs');
const notes = process.env.RELEASE_NOTES || `v${version} の変更点は git log を参照してください。`;
spawnSync('gh', ['release', 'create', `v${version}`, 'dist/dead-cliche-review.zip', '--title', `v${version}`, '--notes', notes], { cwd: PACKAGE_ROOT, stdio: 'inherit' });

step(9, 'プラグインの更新');
spawnSync('claude', ['plugin', 'update', 'dead-cliche@ux-writing-dead-cliche'], { stdio: 'inherit' });

console.log(`\nv${version} のリリースが完了しました。`);
console.log('確認: https://www.npmjs.com/package/textlint-rule-ux-writing-dead-cliche');
console.log('      https://boxpistols.github.io/ux-writing-dead-cliche/');
