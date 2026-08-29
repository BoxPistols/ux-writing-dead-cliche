# 設計ドキュメント

## 目的

AI が日本語文章に持ち込むクリシェ (比喩・誇張・空虚な抽象・構文の型・翻訳調・
締めの型・書式の癖) を検出し、意味を保ったまま平易で事実ベースの文章に直します。
検出だけでなく、「なぜ避けるか」「代わりに何を書くか」を返すことを辞書の責務とします。

## アーキテクチャ

辞書 (rules/*.yml) を単一の情報源にします。理由は 2 つあります。

1. スキル (プロンプト) は読むかどうかがモデルの判断に委ねられ、検出の保証がありません。
   保証は決定論的なチェッカーが持ち、スキルは書き換えの質を担当します。
2. OSS としての貢献の単位を「YAML の 1 エントリ」にします。UX ライターが
   プロンプトエンジニアリングなしに PR を出せて、テストで回帰を検出できます。

経路は 3 つです: CLI (src/cli.mjs)、textlint ルール (src/textlint-rule.mjs)、
Claude Code プラグイン (skills / commands / agents / hooks)。すべて
src/engine.mjs の check() を通ります。

## ルールのカテゴリ

| カテゴリ | 対象 |
| --- | --- |
| metaphor | 羅針盤・心臓部・DNA・架け橋・核・緑 (成功) などの比喩 |
| overstatement | にほかなりません・革命的・確信していますなどの誇張断定 |
| empty-abstraction | 本質・真髄・パラダイムシフト・シナジーなどの空虚な抽象 |
| syntax-pattern | 単なるXではなくY・修辞疑問・対句・行末コロン述語などの構文の型 |
| translationese | することができます・冒頭の私たちはなどの翻訳調 |
| closing | していきましょう・目が離せませんなどの締めの型 |
| formatting | 絵文字見出し・感嘆符連打・太字箇条書き・章番号参照などの書式 |
| ux-microcopy | UI 文言の規範 (助詞のゆれ・責める表現・補助動詞の漢字など) |

## 判定の設計判断

- 誤検出を最小化します。単独では正当な語 (心臓・穴・昇華・確信・道標・核・緑) は
  共起条件で絞り、deny_examples の通過をテストで強制します。誤検出の報告は
  negative コーパスに再現を足してから直します。
- 機械化できない規範は manual: true で辞書に残します。エンジンはスキップし、
  スキル・レビューの人力チェックリストとして機能します。二重管理 (スキル本文への
  ルール直書き) を禁止します。
- Markdown のコードフェンス・インラインコードは検査しません (オフセット保存の
  空白化で実装)。ルールの説明文書が自分自身に検出される問題の解でもあります。
- フック (PostToolUse) は検出時に exit 2 で Claude に書き直しを要求します。
  ツール障害時は exit 0 で握りつぶし、編集を妨げません。
- 書き直しの語尾は敬体 (です・ます) を既定とします。技術ドキュメントの標準に
  合わせるためで、常体で統一された学術論文だけを例外とします。

## 文章生成側 (compose)

検出と対になる生成補助として、導入・説明・結論の 3 段落構成の生成コマンドを持ちます。
既存のプロンプト集 (自治体 DX のプロンプト実例集など) にある同種のプロンプトとの
違いは 2 点です: 装飾の推奨 (キーワードの太字化など) を規律で置き換えたこと、
生成後にチェッカーを通過するまで書き直す品質ゲートを持つことです。外部のプロンプトを
取り込む場合も、このゲートを通せば文体が辞書と揃います。

## 未解決課題

- 副詞の漢字・ひらがな (既に / すでに) は流儀が分かれます (公用文は漢字、JTF は
  ひらがな推奨)。既定ルールにせず、将来スタイル選択式のプリセットで扱います。
- 形態素解析を使っていないため、活用形の網羅は正規表現の記述力に依存します。
  導入するなら Sudachi / kuromoji 系を optional dependency にします。
- 体言止めの連打・三点リスト癖は文書構造の解析が要るため manual に置いています。
  段落単位のヒューリスティックで半自動化できる可能性があります。
- prh.yml 形式へのエクスポート (既存 prh 資産との相互運用)。
- コーパス対照による候補採掘 (AI 生成文と人間の文章で n-gram 頻度を比較し、
  AI 側に過剰出現する表現を辞書の追記候補として抽出する)。

## ロードマップ

計画は roadmap ラベルの [issue](https://github.com/BoxPistols/ux-writing-dead-cliche/issues?q=label%3Aroadmap) で管理します。

- Web 版エディタ (貼り付けて検出・修正) [#1](https://github.com/BoxPistols/ux-writing-dead-cliche/issues/1) /
  スニペット機構 [#2](https://github.com/BoxPistols/ux-writing-dead-cliche/issues/2) /
  PWA 化 [#3](https://github.com/BoxPistols/ux-writing-dead-cliche/issues/3)
- 提案 Issue の自動 PR 化 [#4](https://github.com/BoxPistols/ux-writing-dead-cliche/issues/4) /
  ローカル編集フォーム [#5](https://github.com/BoxPistols/ux-writing-dead-cliche/issues/5)
- 候補採掘 [#6](https://github.com/BoxPistols/ux-writing-dead-cliche/issues/6) /
  GitHub Action [#7](https://github.com/BoxPistols/ux-writing-dead-cliche/issues/7) /
  形態素解析 [#8](https://github.com/BoxPistols/ux-writing-dead-cliche/issues/8)
- 方針: ルール数の拡充よりも、negative コーパスの拡充を優先します
