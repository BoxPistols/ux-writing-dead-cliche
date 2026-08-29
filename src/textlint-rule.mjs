// textlintルールラッパー。既存のtextlint資産 (prh等) と併用できる。
//   .textlintrc: { "rules": { "ux-writing-dead-cliche": { "preset": "paper", "minSeverity": "warn" } } }
//   minSeverity: info | warn | error (既定info)。textlintはseverityを持たないため、報告する下限で制御する。
import { loadAllRules, loadPreset, rulesForPreset } from './load-rules.mjs';
import { check, maskMarkdownCode } from './engine.mjs';

export default function deadClicheRule(context, options = {}) {
  const { Syntax, RuleError, report, getSource, locator, fixer } = context;
  const presetName = options.preset ?? 'paper';
  const rules = rulesForPreset(loadPreset(presetName), loadAllRules());
  const minSeverity = options.minSeverity ?? 'info';
  const maskCode = options.maskCode ?? true; // CLIと同様に、コードフェンスとインラインコードを検査対象から外す
  return {
    [Syntax.Document](node) {
      const source = getSource(node);
      const text = maskCode ? maskMarkdownCode(source) : source;
      for (const v of check(text, rules, { minSeverity })) {
        // textlintは診断の重大度をper-reportで持てないため、メッセージ先頭にseverityを明示する
        const message = `[${v.severity}] ${v.ruleId}: 「${v.matched}」 ${v.why} → ${v.ask}`;
        const opts = locator
          ? { padding: locator.range([v.index, v.index + v.length]) }
          : { index: v.index };
        if (v.fix !== undefined && fixer) {
          // 決定論的に置換できるルールはtextlint --fixでも直せるようにする (置換値は検出時に展開済み)
          opts.fix = fixer.replaceTextRange([v.index, v.index + v.length], v.fix);
        }
        report(node, new RuleError(message, opts));
      }
    },
  };
}
