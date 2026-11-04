# ux-writing-dead-cliche

AIが書いた日本語の定型句 (クリシェ) を辞書で検出し、「なぜ避けるか」と「代わりに何を書くか」を返すツールです。
同じ辞書がCLI・textlintルール・Claude Codeプラグイン・GitHub Actionで動きます。

**ブラウザで試す: https://boxpistols.github.io/ux-writing-dead-cliche/** (インストール不要。全ルールの検索と、AIチャットに貼る指示文のコピー)

[![npm](https://img.shields.io/npm/v/textlint-rule-ux-writing-dead-cliche)](https://www.npmjs.com/package/textlint-rule-ux-writing-dead-cliche)
[![CI](https://github.com/BoxPistols/ux-writing-dead-cliche/actions/workflows/ci.yml/badge.svg)](https://github.com/BoxPistols/ux-writing-dead-cliche/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/BoxPistols/ux-writing-dead-cliche)](LICENSE)
[![Pages](https://img.shields.io/website?url=https%3A%2F%2Fboxpistols.github.io%2Fux-writing-dead-cliche%2F&label=Pages)](https://boxpistols.github.io/ux-writing-dead-cliche/)

### 実行例

書き直す前の文 (`before.md`) を検査すると、検出した表現ごとに理由と書き直しの方向を返し、終了コード1で止まります。

```
$ cat before.md
この文書はチームの羅針盤です。まさに開発の心臓部と言える内容を解説していきます。

$ npx textlint-rule-ux-writing-dead-cliche check before.md --preset business
before.md:1:10 error metaphor/compass 「羅針盤」
  なぜ: 「指針」の比喩として頻出するが、誰がどの判断に使うのかが書かれない。
  直す: 誰が、どの判断を、何を基準に決めるのかを書く。
before.md:1:16 info overstatement/masani 「まさに」
  なぜ: 強調の常套句。削っても意味が変わらないことが多い。
  直す: 削って読み直す。強調が要るなら根拠を足す。
before.md:1:21 error metaphor/heart 「の心臓部」
  なぜ: 中心的だと言うだけで、なぜ中心なのかが書かれない。
  直す: それが止まったとき、何が動かなくなるのかを書く。
before.md:1:32 warn syntax-pattern/opener 「解説していきます」
  なぜ: Web記事の定型の予告。予告より内容を先に出す方が読み手に残る。
  直す: 「〜を扱います」と言い切るか、最初の情報をすぐ書く。

4 件 (error 2 件)
$ echo $?
1
```

指摘に沿って書き直した文 (`after.md`) は通ります。

```
$ cat after.md
この文書は、実装方針に迷ったときの判断基準を定めます。対象は認証と決済の2モジュールです。

$ npx textlint-rule-ux-writing-dead-cliche check after.md --preset business
既知のパターンは見つかりませんでした (辞書にある表現の有無だけを見ています)
$ echo $?
0
```

ほかの書き直し例はdocs/before-after.mdにあります。

### 見どころ

- 辞書1つを4つの経路で使う: ルールは `rules/*.yml` だけに書き、CLI (`src/cli.mjs`)、textlintルール (`src/textlint-rule.mjs`)、Claude Codeプラグイン (`.claude-plugin/`、`hooks/hooks.json`、`skills/`)、GitHub Action (`action.yml`) が同じエンジン (`src/engine.mjs`) を通ります。
- 誤検出をテストで抑える: 全ルールに悪い例と良い例を必須とし、正当な日本語だけのコーパス (`corpus/negative/`) が0件で通ることをCIで確認します (`test/rules.test.mjs`、`test/corpus.test.mjs`)。
- AIエージェントの書いた直後に止める: Claude CodeがMarkdownを書くとフックが検査し、検出があれば書き直しを求めます。gitで追跡しているファイルは変更した行だけを見ます (`hooks/hooks.json`、`src/cli.mjs` の `claude-hook`)。

### クイックスタート

```
npx textlint-rule-ux-writing-dead-cliche check 文書.md
```

Claude Codeでは `/plugin marketplace add BoxPistols/ux-writing-dead-cliche` のあと `/plugin install dead-cliche` で入ります。

### このツールが判定しないこと

このツールが判定するのは、辞書にある表現が使われているかどうかだけです。文章が読みやすいか、
主張が通っているか、内容が正しいかは判定できません。検出ゼロは「既知のパターンが無い」以上の
意味を持ちません。書式の均しを目的化すると、かえって文章の改善から遠ざかります。

`羅針盤`、`心臓部`、`シナジー`、`〜にほかなりません`、`〜していきましょう`。
これらを語彙の問題ではなく、情報の欠落として扱います。`羅針盤` と書いた文には、
誰がどの判断を何を基準に行うのかが書かれていません。本ツールの辞書は、
検出した表現ごとに「なぜ避けるか (why)」と「代わりに何を書くべきか (ask)」を返します。

## 毎日の使い方 (最短)

文章を検査する:

```
npx textlint-rule-ux-writing-dead-cliche check 文書.md --preset business
npx textlint-rule-ux-writing-dead-cliche fix 文書.md --write   # 表記系を自動修正 (既定はdry-run)
echo "確認したい文章" | npx textlint-rule-ux-writing-dead-cliche check
```

プリセットは記事・設計書がpaper、issue・PR・Wikiがbusiness、画面文言がux-microcopyです。
errorとwarnは修正必須です (CIとフックが止めます)。infoは注意喚起で止めません。
`--fail-on error` でerrorのみ、`--strict` (= `--fail-on info`) で全件を必須にできます。

CIなど機械的に判定する場合は、表示文言ではなく終了コードか `--format json` を見てください。
JSONの形 (`results` / `total` / `errors` / `counts.{error,warn,info}`) は互換を保ちます。
表示文言は予告なく変わります。
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
`--ai` を付けたときだけ、この11件を型付き判定のAPIで見ることもできます (既定はオフ)。
詳細と実測値は [manualルールを型付き判定で見る](docs/manual-rules-ai.md) にあります。

## インストール

CLIの実行例は冒頭の「毎日の使い方」を参照してください。

Claude Codeプラグインとして使う場合:

```
/plugin marketplace add BoxPistols/ux-writing-dead-cliche
/plugin install dead-cliche
```

textlintと併用する場合:

```
npm i -D textlint textlint-rule-ux-writing-dead-cliche
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
| コマンド | /dead-cliche:sync | 辞書を変更したあとの生成物の再生成、テスト、自己検査 |
| コマンド | /dead-cliche:gaps | 辞書の取りこぼしを数え、広げる候補を出す |
| コマンド | /dead-cliche:release | バージョン更新から公開までの実行と検証 |
| エージェント | dead-cliche-editor | 長文原稿の隔離推敲 |
| フック | PostToolUse | Markdownを書いた直後に自動チェックし、検出時は書き直しを要求 |

フックが検査するのは、gitで追跡しているファイルでは`HEAD`から変更した行だけです。既存の行の違反では止めません。追跡していないファイルと新規ファイルは全体を検査します。ファイル全体を検査したいときは`DEAD_CLICHE_HOOK_ALL=1`を設定します。

## GitHub Actionsで使う

PRの差分に含まれる文書だけを検査し、該当行にannotationを出します。

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: BoxPistols/ux-writing-dead-cliche@main
  with:
    fail-on: warn # error | warn | info | none
```

入力の一覧は`docs/usage.md`にあります。Actionは次のリリースからタグでも指定できます
(v0.14.3以前のタグには`action.yml`が入っていません)。

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

引用のように書き換えられない箇所は、コメント指示で範囲を外せます。書式はtextlintに
寄せてあります。ルールIDを書けばそのルールだけ、書かなければ範囲内のすべてを止めます。

```markdown
<!-- dead-cliche-disable metaphor/otoshiana -->
> 除外する語は落とし穴です。
<!-- dead-cliche-enable -->
```

1行だけなら `<!-- dead-cliche-disable-next-line -->` を直前の行に置きます。
`dead-cliche-enable` を書かない `dead-cliche-disable` は、ファイルの末尾まで効きます。

## ルールの書式

1ルール1エントリのYAMLです。書式と例はCONTRIBUTING.mdにあります。

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

## 書き直しは扱いません

このリポジトリは辞書による検出に徹し、LLMを呼びません。`--ai` は例外に見えますが、
呼ぶのは文章を生成しないモデル (TypeSafe AIのJev) で、返るのは確率と選択肢だけです。
既定はオフで、付けなければ依存もネットワークも増えません。判定するのは辞書の
`manual` ルール11件だけで、正規表現による検出の本体には手を入れていません。
CLI・textlintルール・Claude Codeプラグイン・
npmパッケージがその範囲です。書き直しはClaude Codeのスキル、またはGUIアプリ側が担います。

ブラウザ内でAPIキーを預かって書き直すページを一時期置いていましたが、責務の分離のため2026-08-30に
やめました。運用して分かったことは [LLMに書き直させるときの設計](docs/llm-rewriting.md) に残しています。
書き直しを実装する場合は先に読んでください。

## 禁止ワードをフォームから追加する

YAMLを編集しない人向けに、2つのフォームがあります。

チーム固有の禁止ワードは、ローカルのフォームでプロジェクト辞書 (`.deadcliche/custom-rules.yml`) に足せます。

```bash
dead-cliche ui   # http://127.0.0.1:7777/?token=... が開く
```

127.0.0.1にだけ束ね、合言葉を要求し、受け取るのは表現そのもの (リテラル) だけです。
共有辞書 (`rules/`) には書き込みません。

OSS辞書への提案は、[提案フォーム](https://boxpistols.github.io/ux-writing-dead-cliche/proposal-form.html)
から送れます。静的ページで、入力はどこにも自動送信されません。入力済みのIssueフォームが開き、
レビューを経て辞書に入ります。同じフォームで `.deadcliche/custom-rules.yml` 用のYAMLも生成できます。

作ったプロジェクト辞書は `.deadclicherc.json` から読み込みます。

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

## リリース運用

配布物 (npm・プラグイン・Releases・Pages) の出し方と、公開前のセキュリティ確認は
docs/release-guide.mdにまとめています。バージョンをbumpしたら生成物の再生成が必要です
(忘れるとCIが落ちます。npm testでも検出されます)。

## 貢献

ルールの追加・修正は1エントリ単位のPRで受け付けます。CONTRIBUTING.mdを
参照してください。社名・製品名・非公開URL・顧客名を含むルールやコーパスは
受け付けません。

## ライセンス

MIT
