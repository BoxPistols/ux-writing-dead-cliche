// textlint ルールラッパー。既存の textlint 資産 (prh 等) と併用できる。
//   .textlintrc: { "rules": { "ux-writing-dead-cliche": { "preset": "paper", "minSeverity": "warn" } } }
//   minSeverity: info | warn | error (既定 info)。textlint は severity を持たないため、報告する下限で制御する。
import { loadAllRules, loadPreset, rulesForPreset } from './load-rules.mjs';
import { check, maskMarkdownCode } from './engine.mjs';

export default function deadClicheRule(context, options = {}) {
  const { Syntax, RuleError, report, getSource, locator, fixer } = context;
  const presetName = options.preset ?? 'paper';
  const rules = rulesForPreset(loadPreset(presetName), loadAllRules());
  const minSeverity = options.minSeverity ?? 'info';
  const maskCode = options.maskCode ?? true; // CLI と同様に、コードフェンスとインラインコードを検査対象から外す
  return {
    [Syntax.Document](node) {
      const source = getSource(node);
      const text = maskCode ? maskMarkdownCode(source) : source;
      const byId = new Map(rules.map((r) => [r.id, r]));
      for (const v of check(text, rules, { minSeverity })) {
        // textlint は診断の重大度を per-report で持てないため、メッセージ先頭に severity を明示する
        const message = `[${v.severity}] ${v.ruleId}: 「${v.matched}」 ${v.why} → ${v.ask}`;
        const opts = locator
          ? { padding: locator.range([v.index, v.index + v.length]) }
          : { index: v.index };
        const rule = byId.get(v.ruleId);
        if (rule?.fix !== undefined && fixer) {
          // 決定論的に置換できるルールは textlint --fix でも直せるようにする
          const original = source.slice(v.index, v.index + v.length);
          const single = rule.pattern ? new RegExp(rule.pattern, (rule.flags ?? 'mu').replace('g', '')) : null;
          const replacement = single ? original.replace(single, rule.fix) : rule.fix;
          opts.fix = fixer.replaceTextRange([v.index, v.index + v.length], replacement);
        }
        report(node, new RuleError(message, opts));
      }
    },
  };
}
