#!/usr/bin/env node
// claude.ai (Desktop / iPhoneアプリのチャット) にアップロードできるスキルzipを生成します。
//   npm run build:claude-ai-skill → dist/dead-cliche-review.zip
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PACKAGE_ROOT } from '../src/load-rules.mjs';

const out = path.join(PACKAGE_ROOT, 'dist', 'dead-cliche-review');
fs.rmSync(path.join(PACKAGE_ROOT, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'rules'), { recursive: true });
fs.copyFileSync(path.join(PACKAGE_ROOT, 'tools', 'claude-ai-skill-template.md'), path.join(out, 'SKILL.md'));
for (const f of fs.readdirSync(path.join(PACKAGE_ROOT, 'rules'))) {
  fs.copyFileSync(path.join(PACKAGE_ROOT, 'rules', f), path.join(out, 'rules', f));
}
execSync('zip -qr ../dead-cliche-review.zip .', { cwd: out });
console.log('dist/dead-cliche-review.zipを生成しました');
