# 類似ツールとの比較と使い分け

調査日: 2026-08-28。各ツールの記述は公開ドキュメントに基づきます。

## 一覧

| ツール | 形態 | 対象 | 本ツールとの関係 |
| --- | --- | --- | --- |
| textlint-rule-preset-ai-writing | OSS (textlint-ja公式) | AIっぽい記述パターン (構造中心) | 最も近い。併用可 |
| textlint-rule-preset-ai-words-ja | OSS (p1ass) | AI以後に増えた単語 (語彙中心) | 検出単位が異なる。併用推奨 |
| textlint-rule-preset-ja-technical-writing | OSS (textlint-ja公式) | 技術文書の一般規範 (文長・二重否定など) | 補完関係。併用推奨 |
| prh | OSS | 表記ゆれの辞書置換 | 補完関係。併用推奨 |
| RedPen | OSS | 文書構造のlint (多言語) | 対象が異なる |
| Shodo | 商用 (API / CLIあり) | LLMによる文脈校正・誤字脱字 | 対象が異なる |
| 文賢 | 商用 (Web) | 推敲・言い換え支援 | 対象が異なる |
| AIチェッカー各種 (User Local等) | 商用 / 無料 | 「AIが書いたか」の判定 | 目的が異なる |

## textlint-rule-preset-ai-writingとの違い

textlint-ja公式のpreset-ai-writing (2025-06登場) は、太字プリフィックス付きリスト・
絵文字リスト・コロン止め・冗長な強調・誇張語の5ルールで、「表現を縛るのではなく
構造を縛る」方針を取ります。誇張語の検出 (`革命的`、`ゲームチェンジャー` 等) は本ツールと
一部重なります。

本ツールが別に持つものは次のとおりです。

- 語彙辞書の広さ。比喩 (`羅針盤` `心臓部` `穴` `DNA`)、空虚な抽象 (`本質` `シナジー` `昇華`)、
  構文の型 (`単なる X ではなく Y`)、翻訳調、締めの型など約130ルール
- 各ルールのwhy (なぜ避けるか) とask (代わりに何を書くか)。検出を「情報の欠落」として
  扱い、書き直しの指針まで辞書が持ちます
- 誤検出対策の負例 (deny_examples) とnegativeコーパスのCI強制。単独では正当な語
  (心臓・穴・昇華・確信) を共起条件で絞ります
- UIマイクロコピーの規範 (ux-microcopyプリセット) と人力チェックリスト (manualルール)
- Claude Codeプラグイン一式。スキル3種、生成コマンド (compose)、Slack依頼文、
  PR・コミット文面の規律、書き込み直後の自動フックを含みます

本ツールv0.2.0で、preset-ai-writingの観点のうち正規表現で成立するもの
(太字プリフィックス箇条書き・絵文字箇条書き・行末コロン述語) は独自実装で取り込みました
(該当ルールのrefsに明記。textlintおよびtextlint-jaのプリセット群はMITライセンスです)。

preset-ai-writingが引き続き優位なものは次のとおりです。

- 形態素解析 (コロン止め判定で名詞終止を正確に許可します。本ツールは語尾の近似です)
- textlint MCPサーバー経由の連携実績

文長・二重否定・ら抜きなどの一般規範は形態素解析が前提のものが多く、複製せず
ja-technical-writingとの併用でカバーする方針を取ります。

構造検出はpreset-ai-writing、語彙と書き直しは本ツール、と役割が分かれるため、
textlint上で両方を有効にする構成が成立します。

## textlint-rule-preset-ai-words-jaとの違い (調査日: 2026-09-16)

比較したのはp1ass/textlint-rule-preset-ai-words-jaのv1.2.0 (commit 4de09b3) です。以下の
件数はこの版で測っています。ルールは2つあり、性質が違います。

- `no-ai-words`: AIが書いた日本語に増えた単語そのものを検出します。辞書は49語で、
  「Qiitaの7万記事を生成AIの前後で比べ、出現率が上がった語」を根拠にしています。kuromojiの
  形態素解析を使うため、基本形で登録した語は活用形もまとめて検出します
- `no-short-topic-comma`: 短い主題のあとの読点を検出する構文のルールです。語彙は見ません。
  指摘が多くなりやすいため、既定では無効です

主軸の`no-ai-words`と本ツールでは、検出の単位が違います。向こうは語 (`効く` `経路` `穴` `土台`
`核心` `線引き` `定石`)、本ツールは型と文脈 (共起条件つきの比喩・誇張・翻訳調・締めの型) です。
相互にかけた結果もほぼ排他でした。

| かけた文章 | preset-ai-words-ja | 本ツール (paper) |
| --- | --- | --- |
| 先方のAI生成サンプル (`example/ai-generated-text.md`, 179行) | 30件 | 2件 |
| 本ツールのREADME + DESIGN.md | 20件 | 0件 |

本ツールのREADMEで出た20件は、大半が`検査` (8件) と`効く` (4件) です。どちらも本ツールの
ドメイン語で、誤検出にあたります。語を単独で判定する方式の代償で、`allows`による除外の運用が
前提になります。逆に本ツールが先方のサンプルで2件しか出さないのは、あの文章が語彙はAI的でも
修辞の型を踏んでいないためです。

辞書は統合しません。本ツールは1エントリがwhy (なぜ避けるか) とask (代わりに何を書くか) を
持つ契約です。`羅針盤`には「誰がどの基準で判断するのかが書かれていない」と言えますが、
`検査`や`静かに`には同じことが言えません。頻度統計に由来する語は「AIがよく使う」以上の理由を
持てないため、この辞書の形式に収まりません。

観点として取り込んだものが1つあります。`syntax-pattern/short-topic-comma`です。

<!-- dead-cliche-disable syntax-pattern/short-topic-comma -->

「結論は、まだ出ていません。」のように、主題を数文字示しただけで読点を打つ型です。先方は主題の
長さだけを見ています。この辞書はerrorとwarnがCIとフックを止めるので、それでは広すぎます。
述部も短いこと (12文字以内) を共起条件に足して絞ったうえで、severityはCIとフックを失敗させない
infoにしました。
「本機能は、検索結果を閲覧履歴で並べ替えます。」のような長い述部の読点は検出しません。

<!-- dead-cliche-enable syntax-pattern/short-topic-comma -->

preset-ai-words-jaが優位なものは次のとおりです。

- 形態素解析による活用形の網羅。本ツールは正規表現なので語形を並記する必要があり、
  実際に常体 (`核心である` `そのものである`) の取りこぼしが7ルールありました (修正済み)
- 語彙の出典が頻度統計にあり、辞書を広げる根拠を外部に持てること。`tools/mine-ngrams.mjs`の
  突き合わせ先として使えます

語の頻度はpreset-ai-words-ja、構造はpreset-ai-writing、修辞の型と書き直しの問いは本ツール、と
役割が分かれます。3つをtextlint上で同時に有効にする構成が成立します。

## 推奨する併用構成 (.textlintrc.json)

```json
{
  "rules": {
    "preset-ja-technical-writing": true,
    "preset-ai-writing": true,
    "preset-ai-words-ja": { "no-ai-words": { "allows": ["検査", "効く", "経路"] } },
    "ux-writing-dead-cliche": { "preset": "paper" },
    "prh": { "rulePaths": ["prh.yml"] }
  }
}
```

- 一般規範 (文長・二重否定・ら抜き) はja-technical-writing
- 構造のAI癖 (リスト書式・コロン止め) はai-writing
- AI以後に増えた語はai-words-ja (ドメイン語はallowsで除外する)
- 語彙のクリシェと書き直しの問いは本ツール
- プロジェクト固有の表記ゆれはprh

## 商用ツールとの使い分け

Shodo・文賢はLLMによる文脈込みの校正で、誤字脱字や言い換えの提案に強い製品です。
本ツールは決定論的な辞書で、同じ入力に必ず同じ結果を返します。CIでのゲート、
チーム内での基準の共有、AIエージェントへの自動フィードバックには決定論が要るため、
役割が異なります。両方使う場合、機械ゲートを本ツールが担い、最終稿の推敲を商用ツールが担います。

AIチェッカー (AIが書いたかを判定するツール) は目的が異なります。本ツールは
「誰が書いたか」を判定せず、「この表現に情報が欠けている」ことだけを指摘します。
人間が書いたクリシェも同様に検出されます。

## 参照

- https://github.com/textlint-ja/textlint-rule-preset-ai-writing
- https://github.com/p1ass/textlint-rule-preset-ai-words-ja
- https://github.com/textlint-ja/textlint-rule-preset-ja-technical-writing
- https://github.com/prh/prh
- https://shodo.ink/ (開発者向けAPI: https://developer.shodo.ink/)
- https://redpen.cc/
