// manifest検証。claude CLI が無い環境 (CIランナー) ではこの自前検証だけが判定になるため、
// 境界値をここで固定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isSemver, validatePlugin } from '../tools/validate-plugin.mjs';

test('semver は末尾まで検証する', () => {
  for (const ok of ['0.15.0', '1.2.3', '1.2.3-rc.1', '1.2.3+build.5']) {
    assert.ok(isSemver(ok), `通るべき: ${ok}`);
  }
  for (const ng of ['1.2.3junk', '1.2.3.4', '01.2.3', '1.2', 'v1.2.3', '']) {
    assert.ok(!isSemver(ng), `弾くべき: ${ng}`);
  }
});

// 一時ディレクトリに壊れたmanifestを置いて、検出される項目を確かめる
function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-cliche-manifest-'));
  fs.mkdirSync(path.join(dir, '.claude-plugin'));
  for (const [rel, value] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(value, null, 2));
  }
  return dir;
}

test('このリポジトリのmanifestは検証を通る', () => {
  const { errors } = validatePlugin({ runCli: false });
  assert.deepEqual(errors, []);
});

test('description の欠落・version の不一致・不正なsemverを検出する', () => {
  const root = fixture({
    '.claude-plugin/marketplace.json': {
      name: 'x',
      owner: { name: 'y' },
      plugins: [{ name: 'p', source: './', description: 'd' }],
    },
    '.claude-plugin/plugin.json': { name: 'p', description: 'd', version: '1.2.3junk' },
    'package.json': { name: 'x', version: '1.2.3' },
  });
  const { errors } = validatePlugin({ root, runCli: false });
  assert.ok(errors.some((e) => e.includes('description がありません')), errors.join(' / '));
  assert.ok(errors.some((e) => e.includes('semver')), errors.join(' / '));
  assert.ok(errors.some((e) => e.includes('version の不一致')), errors.join(' / '));
});

test('marketplace に載っていないプラグイン名を検出する', () => {
  const root = fixture({
    '.claude-plugin/marketplace.json': {
      name: 'x',
      description: 'd',
      owner: { name: 'y' },
      plugins: [{ name: 'other', source: './', description: 'd' }],
    },
    '.claude-plugin/plugin.json': { name: 'p', description: 'd', version: '1.2.3' },
    'package.json': { name: 'x', version: '1.2.3' },
  });
  const { errors } = validatePlugin({ root, runCli: false });
  assert.ok(errors.some((e) => e.includes('載っていません')), errors.join(' / '));
});
