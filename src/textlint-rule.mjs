// textlint ルールラッパー。既存の textlint 資産 (prh 等) と併用できる。
//   .textlintrc: { "rules": { "ux-writing-dead-cliche": { "preset": "paper" } } }
import { loadAllRules, loadPreset, rulesForPreset } from './load-rules.mjs';
import { check } from './engine.mjs';

export default function deadClicheRule(context, options = {}) {
  const { Syntax, RuleError, report, getSource, locator } = context;
  const presetName = options.preset ?? 'paper';
  const rules = rulesForPreset(loadPreset(presetName), loadAllRules());
  return {
    [Syntax.Document](node) {
      const text = getSource(node);
      for (const v of check(text, rules)) {
        const message = `${v.ruleId}: 「${v.matched}」 ${v.why} → ${v.ask}`;
        const opts = locator
          ? { padding: locator.range([v.index, v.index + v.length]) }
          : { index: v.index };
        report(node, new RuleError(message, opts));
      }
    },
  };
}
