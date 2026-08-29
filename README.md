# ux-writing-dead-cliche

AI が日本語文章に持ち込むクリシェを検出し、平易な文章へ直すための辞書とツールです。

`羅針盤`、`心臓部`、`シナジー`、`〜にほかなりません`、`〜していきましょう`。
これらを語彙の問題ではなく、情報の欠落として扱います。`羅針盤` と書いた文には、
誰がどの判断を何を基準に行うのかが書かれていません。本ツールの辞書は、
検出した表現ごとに「なぜ避けるか (why)」と「代わりに何を書くべきか (ask)」を返します。

## 構成

辞書 (`rules/*.yml`) を単一の情報源とし、3 つの経路から同じルールが効きます。

```
rules/*.yml ─┬─ CLI (npx dead-cliche check)
             ├─ textlint ルール (既存の textlint 資産と併用)
             └─ Claude Code プラグイン (スキル + コマンド + フック)
```

機械で判定できるルールは正規表現で検出し、判定できないルール (体言止めの連打、
太字の散布など) は `manual` として辞書に持ち、レビュー時の人力チェックリストになります。

## インストール

CLI として使う場合:

```
npx github:BoxPistols/ux-writing-dead-cliche check draft.md
npx github:BoxPistols/ux-writing-dead-cliche check draft.md --preset business
cat draft.txt | npx github:BoxPistols/ux-writing-dead-cliche check
```

Claude Code プラグインとして使う場合:

```
/plugin marketplace add BoxPistols/ux-writing-dead-cliche
/plugin install dead-cliche
```

textlint と併用する場合 (パッケージ名は textlint の慣例に従い textlint-rule- 接頭辞):

```
npm install textlint github:BoxPistols/ux-writing-dead-cliche
```

.textlintrc.json:

```json
{
  "rules": {
    "ux-writing-dead-cliche": { "preset": "paper", "minSeverity": "warn" }
  }
}
```

## 環境別の使い方

| 使う場所 | 入れるもの | できること |
| --- | --- | --- |
| ターミナルの Claude Code / Desktop アプリの Code モード | プラグイン (上記 2 コマンド) | 全機能。チェック、PR レビュー、書き込み直後の自動フック |
| CI (GitHub Actions 等) | CLI (`npx github:...`) | error 検出で落とすゲート |
| エディタ・既存の校正基盤 | textlint ルール | prh や公式プリセットとの併用 |
| Claude Desktop アプリのチャット / iPhone アプリ | claude.ai スキル ([Releases](https://github.com/BoxPistols/ux-writing-dead-cliche/releases) の dead-cliche-review.zip を設定 → 機能 → スキルへ) | 辞書に基づく検出とレビュー規律。判定は LLM が行う |
| iPhone からのリポジトリ操作 | claude.ai/code のクラウドセッション (対象リポジトリの `.claude/settings.json` にプラグイン設定をコミット) | /dead-cliche:pr-review での投稿まで |
| ChatGPT・Gemini・その他あらゆる AI チャット | 貼り付け用の指示文 (docs/prompts/、辞書から自動生成) | クリシェを避けた文章の生成。ツールのインストール不要 |

既存プロダクトへの導入手順は docs/adoption-guide.md にまとまっています。

PR レビューでは 3 つの役割を持ちます。相手の差分に含まれる文章・UI 文言の検査
(/dead-cliche:pr-review)、自分が書くレビューコメントの文体規律 (plain-communication)、
PR 本文自体の検査です。

## Claude Code プラグインの内容

| 種類 | 名前 | 役割 |
| --- | --- | --- |
| スキル | dead-cliche-writing | クリシェ検出と平易な書き直しの手順 |
| スキル | ux-writing-review | UI テキストのレビュー (公開ガイドの共通原則ベース) |
| スキル | plain-communication | PR・コミット・Slack 文面の規律 (AI 署名と絵文字の禁止を含む) |
| コマンド | /dead-cliche:check | ファイルまたは差分のチェックと修正 |
| コマンド | /dead-cliche:review-request | Slack 用レビュー依頼文の生成 (プレーンテキスト) |
| コマンド | /dead-cliche:pr-review | PR のレビュー (散文と UI 文言の検査、署名なしのコメント文面) |
| コマンド | /dead-cliche:compose | 導入・説明・結論の 3 段落での文章生成 (チェッカー通過を保証) |
| エージェント | dead-cliche-editor | 長文原稿の隔離推敲 |
| フック | PostToolUse | Markdown を書いた直後に自動チェックし、検出時は書き直しを要求 |

## プリセット

| プリセット | 想定する文書 | 特徴 |
| --- | --- | --- |
| paper | 論文・技術文書・設計書 | 全カテゴリ有効。修辞疑問と呼びかけも error |
| business | ビジネス文書・PR・レビュー | 慣用の強調は許容 |
| chat | チャット | 呼びかけ・感嘆は許容。比喩と空虚な抽象のみ検出 |
| ux-microcopy | UI テキスト | 画面文言の規範のみ |

プロジェクト直下の `.deadclicherc.json` で既定プリセットと除外パスを指定できます。

```json
{
  "preset": "business",
  "ignore": ["docs/archive/"]
}
```

## ルールの書式

1 ルール 1 エントリです。why と ask を必須にしているのは、置換候補だけの辞書では
別のクリシェに置き換わるだけで終わるためです。

```yaml
- id: metaphor/compass
  severity: error
  pattern: '(?<!船の)(?<!航海の)羅針盤'
  why: 「指針」の比喩として頻出するが、誰がどの判断に使うのかが書かれない。
  ask: 誰が、どの判断を、何を基準に決めるのかを書く。
  examples:
    bad:
      - 'この文書はチームの羅針盤です。'
    good:
      - '実装方針で迷ったときは、この文書の判断基準の節に従います。'
  deny_examples:
    - '博物館で古い船の羅針盤を見た。'
```

書き直しの語尾は敬体 (です・ます) を既定とします。技術ドキュメントの標準に
合わせるためで、常体で統一された学術論文だけが例外です。

## 検出の設計方針

誤検出はルールの死です。誤検出率が上がった時点で誰も使わなくなるため、
次をテストで強制しています。

- すべてのルールに悪い例と良い例を必須とし、悪い例が検出されること、良い例が
  検出されないことを CI で確認します
- 正当な用法と衝突しうるルール (心臓部、穴、昇華、確信など) は共起条件で絞り、
  `deny_examples` (検出してはいけない例) の通過を必須にします
- 正当な日本語だけを集めた negative コーパスが、全ルールに対して 0 件で通ります
- 書き直し例の golden コーパスは、before が検出され after が 0 件で通ります

Markdown のコードフェンスとインラインコードは検査対象から除外されます。

実施前・実施後の比較は docs/before-after.md にあります。golden コーパスから
自動生成され、実施後の文が全ルールで検出 0 件であることを CI が保証します。
表示とテストが同じデータから出る構成です。

## PR・コミット文面について

plain-communication スキルは、AI 生成の署名 (Generated with Claude Code、
Co-Authored-By: Claude 等) と絵文字を、コミットログ・PR 本文・レビューコメントの
すべてで禁止します。あわせて Claude Code の `settings.json` に
`"attribution": { "commit": "", "pr": "", "sessionUrl": false }` を設定すると、
ツール側の自動署名も止まります。

## GitHub を使わない環境で使う (貼り付け用の指示文)

辞書から自動生成された指示文が docs/prompts/ にあります。どの AI チャットにも
コピーして貼るだけで効き、ツールのインストールは不要です。

- [writing-guard.md](docs/prompts/writing-guard.md) — フル版 (約 12KB)。システムプロンプト・プロジェクト設定向け
- [writing-guard-compact.md](docs/prompts/writing-guard-compact.md) — 短縮版 (約 3KB)。文字数制限のあるカスタム指示欄向け
- [ux-writing-guard.md](docs/prompts/ux-writing-guard.md) — UI 文言版。画面テキストを書かせるとき向け

生成物なので手で編集せず、辞書の更新に追随します (`npm run docs:prompts`、CI で同期検証)。

## 禁止ワードを GUI から追加する

YAML を編集しない人向けに、[提案フォーム](https://boxpistols.github.io/ux-writing-dead-cliche/proposal-form.html)
を用意しています。静的ページで、入力はどこにも自動送信されません。OSS 辞書への提案は
入力済みの Issue フォームが開き、レビューを経て辞書に入ります。チーム固有の禁止ワードは
同じフォームで `.deadcliche/custom-rules.yml` 用の YAML を生成できます。

```json
{
  "preset": "business",
  "customRules": [".deadcliche/custom-rules.yml"]
}
```

カスタム辞書のリテラル (surface) は常に安全に読み込まれます。正規表現は
`"trustCustomPatterns": true` を明示し、安全性検査を通ったものだけが有効になります。
設計と脅威モデルは docs/custom-rules-and-autofix.md にあります。

## 自動修正

`dead-cliche fix <files>` は、意味を変えずに機械置換できる検出 (補助動詞の漢字、
助詞のゆれ、冗長形など) を修正します。既定は dry-run で、`--write` を付けたときだけ
書き込みます。textlint 経由でも `npx textlint --fix` で同じ置換が効きます。
機械置換できないクリシェは書き直しが必要なため、Claude のフックと
`/dead-cliche:check --fix` が担当します。

## 貢献

ルールの追加・修正は 1 エントリ単位の PR で受け付けます。CONTRIBUTING.md を
参照してください。社名・製品名・非公開 URL・顧客名を含むルールやコーパスは
受け付けません。

## ライセンス

MIT
