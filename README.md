# ux-writing-dead-cliche

AIが日本語文章に持ち込むクリシェを検出し、平易な文章へ直すための辞書とツールです。

`羅針盤`、`心臓部`、`シナジー`、`〜にほかなりません`、`〜していきましょう`。
これらを語彙の問題ではなく、情報の欠落として扱います。`羅針盤` と書いた文には、
誰がどの判断を何を基準に行うのかが書かれていません。本ツールの辞書は、
検出した表現ごとに「なぜ避けるか (why)」と「代わりに何を書くべきか (ask)」を返します。

## 毎日の使い方 (最短)

文章を検査する:

```
npx github:BoxPistols/ux-writing-dead-cliche check 文書.md --preset business
npx github:BoxPistols/ux-writing-dead-cliche fix 文書.md --write   # 表記系を自動修正 (既定はdry-run)
echo "確認したい文章" | npx github:BoxPistols/ux-writing-dead-cliche check
```

プリセットは記事・設計書がpaper、issue・PR・Wikiがbusiness、画面文言がux-microcopyです。
clone済みなら `npm link` で `dead-cliche` の短いコマンド名になります。

PRを書く・レビューする (Claude Codeプラグイン導入後):

```
/dead-cliche:pr-review 123          # PRのレビュー。差分の文章とUI文言も検査。--postで確認後に投稿
/dead-cliche:review-request 123     # Slack用のレビュー依頼文 (プレーンテキスト)
/dead-cliche:check 対象.md --fix    # 下書きの検査と書き直し
```

PR本文・レビューコメント・コミットの文面規律 (AI署名と絵文字の禁止、端的な文体) は、
プラグインを入れるだけでスキルとして常時効きます。ClaudeがMarkdownを書いた瞬間の
自動検査 (フック) も同様です。ブラウザで試すだけなら
https://boxpistols.github.io/ux-writing-dead-cliche/ に貼ってください。

## 構成

辞書 (`rules/*.yml`) を単一の情報源とし、3つの経路から同じルールが効きます。

```
rules/*.yml ─┬─ CLI (npx dead-cliche check)
             ├─ textlint ルール (既存の textlint 資産と併用)
             └─ Claude Code プラグイン (スキル + コマンド + フック)
```

機械で判定できるルールは正規表現で検出し、判定できないルール (体言止めの連打、
太字の散布など) は `manual` として辞書に持ち、レビュー時の人力チェックリストになります。

## インストール

CLIとして使う場合:

```
npx github:BoxPistols/ux-writing-dead-cliche check draft.md
npx github:BoxPistols/ux-writing-dead-cliche check draft.md --preset business
cat draft.txt | npx github:BoxPistols/ux-writing-dead-cliche check
```

Claude Codeプラグインとして使う場合:

```
/plugin marketplace add BoxPistols/ux-writing-dead-cliche
/plugin install dead-cliche
```

textlintと併用する場合 (パッケージ名はtextlintの慣例に従いtextlint-rule- 接頭辞):

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

`npx textlint --fix` にも対応しており、fixを持つルール (表記の置換) は
textlint経由でも自動修正されます。

## 環境別の使い方

| 使う場所 | 入れるもの | できること |
| --- | --- | --- |
| ターミナルのClaude Code / DesktopアプリのCodeモード | プラグイン (上記2コマンド) | 全機能。チェック、PRレビュー、書き込み直後の自動フック |
| CI (GitHub Actions等) | CLI (`npx github:...`) | error検出で落とすゲート |
| エディタ・既存の校正基盤 | textlintルール | prhや公式プリセットとの併用 |
| Claude Desktopアプリのチャット / iPhoneアプリ | claude.aiスキル ([Releases](https://github.com/BoxPistols/ux-writing-dead-cliche/releases) のdead-cliche-review.zipを設定 → 機能 → スキルへ) | 辞書に基づく検出とレビュー規律。判定はLLMが行う |
| iPhoneからのリポジトリ操作 | claude.ai/codeのクラウドセッション (対象リポジトリの `.claude/settings.json` にプラグイン設定をコミット) | /dead-cliche:pr-reviewでの投稿まで |
| ChatGPT・Gemini・その他あらゆるAIチャット | 貼り付け用の指示文 (docs/prompts/、辞書から自動生成) | クリシェを避けた文章の生成。ツールのインストール不要 |

既存プロダクトへの導入手順はdocs/adoption-guide.mdにまとまっています。

PRレビューでは3つの役割を持ちます。相手の差分に含まれる文章・UI文言の検査
(/dead-cliche:pr-review)、自分が書くレビューコメントの文体規律 (plain-communication)、
PR本文自体の検査です。

## Claude Codeプラグインの内容

| 種類 | 名前 | 役割 |
| --- | --- | --- |
| スキル | dead-cliche-writing | クリシェ検出と平易な書き直しの手順 |
| スキル | ux-writing-review | UIテキストのレビュー (公開ガイドの共通原則ベース) |
| スキル | plain-communication | PR・コミット・Slack文面の規律 (AI署名と絵文字の禁止を含む) |
| コマンド | /dead-cliche:check | ファイルまたは差分のチェックと修正 |
| コマンド | /dead-cliche:review-request | Slack用レビュー依頼文の生成 (プレーンテキスト) |
| コマンド | /dead-cliche:pr-review | PRのレビュー (散文とUI文言の検査、署名なしのコメント文面) |
| コマンド | /dead-cliche:compose | 導入・説明・結論の3段落での文章生成 (チェッカー通過を保証) |
| エージェント | dead-cliche-editor | 長文原稿の隔離推敲 |
| フック | PostToolUse | Markdownを書いた直後に自動チェックし、検出時は書き直しを要求 |

## プリセット

| プリセット | 想定する文書 | 特徴 |
| --- | --- | --- |
| paper | 論文・技術文書・設計書 | クリシェ検出の全カテゴリ有効 (UI文言カテゴリを除く)。修辞疑問と呼びかけもerror |
| business | ビジネス文書・PR・レビュー | 慣用の強調は許容 |
| chat | チャット | 呼びかけ・感嘆・締めの型は許容。比喩・誇張・空虚な抽象・翻訳調を検出 |
| ux-microcopy | UIテキスト | 画面文言の規範のみ |

プロジェクト直下の `.deadclicherc.json` で既定プリセットと除外パスを指定できます。

```json
{
  "preset": "business",
  "ignore": ["docs/archive/"]
}
```

## ルールの書式

1ルール1エントリです。whyとaskを必須にしているのは、置換候補だけの辞書では
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
  検出されないことをCIで確認します
- 正当な用法と衝突しうるルール (心臓部、穴、昇華、確信など) は共起条件で絞り、
  `deny_examples` (検出してはいけない例) の通過を必須にします
- 正当な日本語だけを集めたnegativeコーパスが、全ルールに対して0件で通ります
- 書き直し例のgoldenコーパスは、beforeが検出されafterが0件で通ります

Markdownのコードフェンスとインラインコードは検査対象から除外されます。

実施前・実施後の比較はdocs/before-after.mdにあります。goldenコーパスから
自動生成され、実施後の文が全ルールで検出0件であることをCIが保証します。
表示とテストが同じデータから出る構成です。

## PR・コミット文面について

plain-communicationスキルは、AI生成の署名 (Generated with Claude Code、
Co-Authored-By: Claude等) と絵文字を、コミットログ・PR本文・レビューコメントの
すべてで禁止します。あわせてClaude Codeの `settings.json` に
`"attribution": { "commit": "", "pr": "", "sessionUrl": false }` を設定すると、
ツール側の自動署名も止まります。

## GitHubを使わない環境で使う (貼り付け用の指示文)

ブラウザから使えるアプリがあります: https://boxpistols.github.io/ux-writing-dead-cliche/
指示文と全ルールを検索し、カードのコピーボタンでAIチャットに貼れます。
お気に入りはブラウザに保存されます。インストールは不要です。

元データのMarkdownはdocs/prompts/ にあります。

- [writing-guard.md](docs/prompts/writing-guard.md) — フル版 (約12KB)。システムプロンプト・プロジェクト設定向け
- [writing-guard-compact.md](docs/prompts/writing-guard-compact.md) — 短縮版 (約3KB)。文字数制限のあるカスタム指示欄向け
- [ux-writing-guard.md](docs/prompts/ux-writing-guard.md) — UI文言版。画面テキストを書かせるとき向け

生成物なので手で編集せず、辞書の更新に追随します (`npm run docs:prompts`、CIで同期検証)。

## 禁止ワードをGUIから追加する

YAMLを編集しない人向けに、[提案フォーム](https://boxpistols.github.io/ux-writing-dead-cliche/proposal-form.html)
を用意しています。静的ページで、入力はどこにも自動送信されません。OSS辞書への提案は
入力済みのIssueフォームが開き、レビューを経て辞書に入ります。チーム固有の禁止ワードは
同じフォームで `.deadcliche/custom-rules.yml` 用のYAMLを生成できます。

```json
{
  "preset": "business",
  "customRules": [".deadcliche/custom-rules.yml"]
}
```

カスタム辞書のリテラル (surface) は常に安全に読み込まれます。正規表現は
`"trustCustomPatterns": true` を明示し、安全性検査を通ったものだけが有効になります。
設計と脅威モデルはdocs/custom-rules-and-autofix.mdにあります。

## 自動修正

`dead-cliche fix <files>` は、意味を変えずに機械置換できる検出 (補助動詞の漢字、
助詞のゆれ、冗長形など) を修正します。既定はdry-runで、`--write` を付けたときだけ
書き込みます。textlint経由でも `npx textlint --fix` で同じ置換が効きます。
機械置換できないクリシェは書き直しが必要なため、Claudeのフックと
`/dead-cliche:check --fix` が担当します。

## 貢献

ルールの追加・修正は1エントリ単位のPRで受け付けます。CONTRIBUTING.mdを
参照してください。社名・製品名・非公開URL・顧客名を含むルールやコーパスは
受け付けません。

## ライセンス

MIT
