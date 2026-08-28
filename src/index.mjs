// パッケージのエントリポイント。
// default export は textlint ルール (textlint はパッケージ main を読む)。
// エンジンとローダーは名前付き export で提供する。
export { check, maskMarkdownCode, hasErrors, compileRule } from './engine.mjs';
export { loadAllRules, loadPreset, rulesForPreset, findRc, PACKAGE_ROOT } from './load-rules.mjs';
export { default } from './textlint-rule.mjs';
