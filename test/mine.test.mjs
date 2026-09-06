// コーパス対照による候補採掘。
// 判定に使う道具ではないが、候補の並びが壊れると採掘そのものが無意味になるため、
// 「重なりを1件にまとめる」「区切りを跨がない」「既知の候補を隠す」を固定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mine, countNgrams } from '../tools/mine-ngrams.mjs';
import { loadAllRules } from '../src/load-rules.mjs';

const aiText = [
  'この機能は体験を根本から変える鍵となります。',
  '検索の改善は成長の鍵となります。',
  '運用の自動化が定着の鍵となります。',
  '設計の見直しが品質改善の鍵となります。',
  'チームの合意形成が推進の鍵となります。',
  'データの整備が分析の鍵となります。',
].join('\n');

const humanText = [
  '会議は木曜日の十時から始まります。',
  '資料は前日までに配ります。',
  '進捗は表に記録します。',
  '検索の応答は平均で二百ミリ秒でした。',
  '運用の手順書は三月に更新しました。',
  '設計の変更点は付録にまとめました。',
].join('\n');

test('AI側に過剰出現する言い回しが候補に出る', () => {
  const rows = mine(aiText, humanText, { minCount: 4, minRatio: 2 });
  assert.ok(rows.some((r) => r.gram.includes('鍵となります')), rows.map((r) => r.gram).join(' / '));
});

test('窓をずらしただけの重なりは1件にまとまる', () => {
  const rows = mine(aiText, humanText, { minCount: 4, minRatio: 2 });
  // 「鍵となりま」「となります」のような断片が並ばないこと
  const fragments = rows.filter((r) => '鍵となります'.includes(r.gram) && r.gram !== '鍵となります');
  assert.equal(fragments.length, 0, `断片が残っている: ${fragments.map((r) => r.gram).join(' / ')}`);
});

test('句読点をまたぐ n-gram は数えない', () => {
  const { counts } = countNgrams('あいうえ。かきくけ', { min: 3, max: 8 });
  assert.ok(!([...counts.keys()].some((g) => g.includes('。'))), '区切りを含む候補がある');
  assert.ok(!counts.has('うえかき'), '区切りを跨いだ候補がある');
});

test('辞書が既に検出する候補は既定で隠れる', () => {
  const rules = loadAllRules();
  const cliche = Array.from({ length: 6 }, (_, i) => `施策${i}はチームの羅針盤となります。`).join('\n');
  const hidden = mine(cliche, humanText, { minCount: 4, minRatio: 2, rules });
  assert.ok(!hidden.some((r) => r.gram.includes('羅針盤')), '既知の表現が候補に混ざっている');
  const shown = mine(cliche, humanText, { minCount: 4, minRatio: 2, rules, includeKnown: true });
  assert.ok(shown.some((r) => r.gram.includes('羅針盤')), '--include-known で既知が出ない');
});

test('人間側にも同じだけ出る表現は候補にならない', () => {
  const common = Array.from({ length: 6 }, () => '進捗は表に記録します。').join('\n');
  const rows = mine(common, common, { minCount: 4, minRatio: 2 });
  assert.equal(rows.length, 0, rows.map((r) => r.gram).join(' / '));
});
