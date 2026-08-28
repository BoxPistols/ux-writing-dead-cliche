#!/usr/bin/env node
// golden コーパスから実施前・実施後の比較表 (Markdown) を生成する。
// after に検出が残っていれば exit 1。表示とテストを同じデータから出すための道具。
//   node tools/render-comparison.mjs > docs/before-after.md
import fs from 'node:fs';
import { loadAllRules } from '../src/load-rules.mjs';
import { check } from '../src/engine.mjs';

const rules = loadAllRules();
const pairs = fs
  .readFileSync(new URL('../corpus/golden/rewrite.jsonl', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

const lines = [];
lines.push('# 実施前・実施後の比較');
lines.push('');
lines.push('この表は `corpus/golden/rewrite.jsonl` から `tools/render-comparison.mjs` が生成します。手で編集しないでください。');
lines.push('実施前の列はチェッカーの検出対象になるためコード書式で示します。実施後の列は地の文のままで、');
lines.push('全ルールに対して検出 0 件であることを CI が保証しています。');
lines.push('');
lines.push('| 実施前 | 検出されるルール | 実施後 |');
lines.push('| --- | --- | --- |');

let failed = false;
for (const { id, before, after } of pairs) {
  const beforeHits = check(before, rules);
  const afterHits = check(after, rules);
  if (beforeHits.length === 0 || afterHits.length > 0) {
    console.error(`${id}: before=${beforeHits.length} after=${afterHits.length} (期待: before>=1, after=0)`);
    failed = true;
  }
  const ids = [...new Set(beforeHits.map((v) => v.ruleId))].join('<br>');
  lines.push(`| \`${before}\` | ${ids} | ${after} |`);
}
if (failed) process.exit(1);
console.log(lines.join('\n'));
