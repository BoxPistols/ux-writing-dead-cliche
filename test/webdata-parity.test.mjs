// 配布物 (docs/app-data.json) が、辞書から直接読んだ場合と同じ判定を返すことを固定する。
// 辞書を単一の情報源にしていても、生成時に落ちた属性があると経路ごとに結果が変わる。
// 実際に、プリセットの severity 上書きが JSON に載っておらず、ブラウザ経路だけ
// paper と business の判定が同一になっていた。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadAllRules, loadPreset, rulesForPreset } from '../src/load-rules.mjs';
import { check, rulesForPresetData } from '../src/engine.mjs';

const all = loadAllRules();
const data = JSON.parse(fs.readFileSync('docs/app-data.json', 'utf8'));
const PRESETS = ['paper', 'business', 'chat', 'ux-microcopy'];

function fromYaml(name) {
  return rulesForPreset(loadPreset(name), all).filter((r) => !r.manual);
}
// 検証するのは出荷している関数そのもの。ここでマージを書き直すと、
// テストは通るのに利用者の経路がずれる (テストが自分の実装を検証してしまう)
function fromJson(name) {
  return rulesForPresetData(data, name);
}

// 全ルールの悪い例を検体にする。上書きの対象になる規則も必ず含まれる
const samples = all.flatMap((r) => r.examples?.bad ?? []);

test('app-data.json は辞書と同じ ID 集合を持つ', () => {
  for (const name of PRESETS) {
    assert.deepEqual(
      fromJson(name).map((r) => r.id).sort(),
      fromYaml(name).map((r) => r.id).sort(),
      `${name} のルール集合が一致しません`,
    );
  }
});

test('app-data.json は辞書と同じ検出と severity を返す', () => {
  for (const name of PRESETS) {
    const yamlRules = fromYaml(name);
    const jsonRules = fromJson(name);
    for (const text of samples) {
      const y = check(text, yamlRules).map((v) => `${v.ruleId}:${v.severity}`);
      const j = check(text, jsonRules).map((v) => `${v.ruleId}:${v.severity}`);
      assert.deepEqual(j, y, `${name} で「${text}」の判定が経路によって違います`);
    }
  }
});

test('プリセットの severity 上書きが生成物に載っている', () => {
  // 上書きを持つプリセットが1つも無いと、上のテストは差が無いまま通ってしまう
  const withOverrides = PRESETS.filter((n) => Object.keys(data.presetInfo[n]?.severity ?? {}).length);
  assert.ok(withOverrides.length > 0, 'severity を上書きするプリセットが生成物に1つもありません');
  for (const name of withOverrides) {
    for (const [id, sev] of Object.entries(data.presetInfo[name].severity)) {
      assert.equal(loadPreset(name).overrides?.[id], sev, `${name} の ${id} の上書きが辞書と一致しません`);
      // ID を引くだけの素朴な経路では上書きが効かない。だから解決を engine に置いている
      const naive = data.rules.find((r) => r.id === id);
      assert.notEqual(naive.severity, sev, `${id} は上書きと素の severity が同じで、経路の差を検証できません`);
      assert.equal(rulesForPresetData(data, name).find((r) => r.id === id).severity, sev);
    }
  }
});

test('検出結果は経路によらず category を持つ', () => {
  const rules = fromJson('paper');
  const hit = check(all.find((r) => r.id === 'metaphor/compass').examples.bad[0], rules);
  assert.ok(hit.length > 0, '検体が検出されていません');
  for (const v of hit) {
    assert.ok(v.category, `${v.ruleId} の category が undefined です (JSON側のキー名の不一致)`);
  }
});
