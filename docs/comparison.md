# 類似ツールとの比較と使い分け

調査日: 2026-08-28。各ツールの記述は公開ドキュメントに基づきます。

## 一覧

| ツール | 形態 | 対象 | 本ツールとの関係 |
| --- | --- | --- | --- |
| textlint-rule-preset-ai-writing | OSS (textlint-ja 公式) | AI っぽい記述パターン (構造中心) | 最も近い。併用可 |
| textlint-rule-preset-ja-technical-writing | OSS (textlint-ja 公式) | 技術文書の一般規範 (文長・二重否定など) | 補完関係。併用推奨 |
| prh | OSS | 表記ゆれの辞書置換 | 補完関係。併用推奨 |
| RedPen | OSS | 文書構造の lint (多言語) | 対象が異なる |
| Shodo | 商用 (API / CLI あり) | LLM による文脈校正・誤字脱字 | 対象が異なる |
| 文賢 | 商用 (Web) | 推敲・言い換え支援 | 対象が異なる |
| AI チェッカー各種 (User Local 等) | 商用 / 無料 | 「AI が書いたか」の判定 | 目的が異なる |

## textlint-rule-preset-ai-writing との違い

textlint-ja 公式の preset-ai-writing (2025-06 登場) は、太字プリフィックス付きリスト・
絵文字リスト・コロン止め・冗長な強調・誇張語の 5 ルールで、「表現を縛るのではなく
構造を縛る」方針を取ります。誇張語の検出 (`革命的`、`ゲームチェンジャー` 等) は本ツールと
一部重なります。

本ツールが別に持つものは次のとおりです。

- 語彙辞書の広さ。比喩 (`羅針盤` `心臓部` `穴` `DNA`)、空虚な抽象 (`本質` `シナジー` `昇華`)、
  構文の型 (`単なる X ではなく Y`)、翻訳調、締めの型など約 130 ルール
- 各ルールの why (なぜ避けるか) と ask (代わりに何を書くか)。検出を「情報の欠落」として
  扱い、書き直しの指針まで辞書が持ちます
- 誤検出対策の負例 (deny_examples) と negative コーパスの CI 強制。単独では正当な語
  (心臓・穴・昇華・確信) を共起条件で絞ります
- UI マイクロコピーの規範 (ux-microcopy プリセット) と人力チェックリスト (manual ルール)
- Claude Code プラグイン一式。スキル 3 種、生成コマンド (compose)、Slack 依頼文、
  PR・コミット文面の規律、書き込み直後の自動フックを含みます

本ツール v0.2.0 で、preset-ai-writing の観点のうち正規表現で成立するもの
(太字プリフィックス箇条書き・絵文字箇条書き・行末コロン述語) は独自実装で取り込みました
(該当ルールの refs に明記。textlint および textlint-ja のプリセット群は MIT ライセンスです)。

preset-ai-writing が引き続き優位なものは次のとおりです。

- 形態素解析 (コロン止め判定で名詞終止を正確に許可します。本ツールは語尾の近似です)
- textlint MCP サーバー経由の連携実績

文長・二重否定・ら抜きなどの一般規範は形態素解析が前提のものが多く、複製せず
ja-technical-writing との併用でカバーする方針を取ります。

構造検出は preset-ai-writing、語彙と書き直しは本ツール、と役割が分かれるため、
textlint 上で両方を有効にする構成が成立します。

## 推奨する併用構成 (.textlintrc.json)

```json
{
  "rules": {
    "preset-ja-technical-writing": true,
    "preset-ai-writing": true,
    "ux-writing-dead-cliche": { "preset": "paper" },
    "prh": { "rulePaths": ["prh.yml"] }
  }
}
```

- 一般規範 (文長・二重否定・ら抜き) は ja-technical-writing
- 構造の AI 癖 (リスト書式・コロン止め) は ai-writing
- 語彙のクリシェと書き直しの問いは本ツール
- プロジェクト固有の表記ゆれは prh

## 商用ツールとの使い分け

Shodo・文賢は LLM による文脈込みの校正で、誤字脱字や言い換えの提案に強い製品です。
本ツールは決定論的な辞書で、同じ入力に必ず同じ結果を返します。CI でのゲート、
チーム内での基準の共有、AI エージェントへの自動フィードバックには決定論が要るため、
役割が異なります。両方使う場合、機械ゲートを本ツールが担い、最終稿の推敲を商用ツールが担います。

AI チェッカー (AI が書いたかを判定するツール) は目的が異なります。本ツールは
「誰が書いたか」を判定せず、「この表現に情報が欠けている」ことだけを指摘します。
人間が書いたクリシェも同様に検出されます。

## 参照

- https://github.com/textlint-ja/textlint-rule-preset-ai-writing
- https://github.com/textlint-ja/textlint-rule-preset-ja-technical-writing
- https://github.com/prh/prh
- https://shodo.ink/ (開発者向け API: https://developer.shodo.ink/)
- https://redpen.cc/
