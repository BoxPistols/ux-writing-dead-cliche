# 導入方法とユースケース別の使い方

## 導入方法

インストールせずに試す場合のブラウザ版アプリ:
https://boxpistols.github.io/ux-writing-dead-cliche/ (辞書の検索と、AIチャットに貼る指示文のコピー)

### Claude Codeプラグインとして (推奨)

スキル・コマンド・フック・エージェントの全部が入る導入方法です。

```
/plugin marketplace add BoxPistols/ux-writing-dead-cliche
/plugin install dead-cliche
```

チームで揃える場合は、プロジェクトの `.claude/settings.json` に書いてコミットします。

```json
{
  "extraKnownMarketplaces": {
    "ux-writing-dead-cliche": {
      "source": { "source": "github", "repo": "BoxPistols/ux-writing-dead-cliche" }
    }
  },
  "enabledPlugins": { "dead-cliche@ux-writing-dead-cliche": true }
}
```

### CLIとして (エディタ・AIツールを問わない)

```
npx textlint-rule-ux-writing-dead-cliche check draft.md
cat draft.txt | npx textlint-rule-ux-writing-dead-cliche check --preset business
```

リポジトリをcloneして `npm install` すれば `node src/cli.mjs check` でも動きます。
頻用するなら `npm link` (clone内で1回) すると、どのディレクトリでも `dead-cliche` の
短いコマンド名で呼べます。

```
dead-cliche check 文書.md --preset business
dead-cliche fix 文書.md --write
dead-cliche version
```

### textlintルールとして (既存のtextlint資産と併用)

```
npm i -D textlint-rule-ux-writing-dead-cliche textlint
```

`.textlintrc.json`:

```json
{
  "rules": {
    "ux-writing-dead-cliche": { "preset": "paper" }
  }
}
```

prhやpreset-ja-technical-writingと同じ設定ファイルに並べて書けます。

### CIとして (GitHub Actions)

PRの差分だけを検査するActionがあります。導入は1ステップです。

```yaml
name: dead-cliche
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # 差分の基準コミットを取るために要る
      - uses: BoxPistols/ux-writing-dead-cliche@v0.14.3
        with:
          fail-on: warn # error | warn | info | none
```

タグは公開済みのバージョンを指定します (`v1`系の移動タグは1.0以降に用意します)。
検出はファイルの該当行にannotationとして出て、ジョブサマリに一覧表が残ります。

| 入力 | 既定 | 意味 |
| --- | --- | --- |
| `preset` | (空) | プリセット名。空なら対象リポジトリの`.deadclicherc.json`、無ければpaper |
| `fail-on` | `warn` | ジョブを落とす下限。`none`にすると報告だけ |
| `paths` | (空) | 対象を絞るグロブ (カンマ区切り。例: `docs/**/*.md,README.md`) |
| `extensions` | `.md,.mdx,.markdown,.txt` | グロブを書かないときの対象拡張子 |
| `changed-only` | `true` | `false`で差分ではなくリポジトリ全体を検査する |
| `base-sha` | (空) | 差分の基準コミット。空ならイベントペイロードから取る |

`.deadclicherc.json`の`ignore`と、本文中のコメント指示 (`<!-- dead-cliche-disable -->`)
はActionでもそのまま効きます。

Actionを使わずCLIで回すこともできます。

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx textlint-rule-ux-writing-dead-cliche check docs/*.md README.md
```

warn級以上の検出があるとexit 1になり、ジョブが落ちます (`--fail-on error`で従来の挙動)。

### プロジェクトごとの設定

対象リポジトリの直下に `.deadclicherc.json` を置くと、既定プリセットと除外パスを固定できます。

```json
{
  "preset": "business",
  "ignore": ["docs/archive/", "CHANGELOG.md"]
}
```

### 書き換えられない箇所を外す

引用・他人の文章・辞書の除外仕様の説明のように、検出が出ても直せない箇所があります。
`ignore` (ファイル単位) と `disable` (ルール単位) では粒度が粗いので、コメント指示で
範囲を指定します。書式はtextlintに寄せてあります。

```markdown
<!-- dead-cliche-disable metaphor/otoshiana -->
> 除外する語は落とし穴です。
<!-- dead-cliche-enable -->
```

- ルールIDを空にすると、範囲内のすべてのルールを止めます。IDは空白かカンマで複数書けます。
- `<!-- dead-cliche-disable-next-line metaphor/otoshiana -->` は次の1行だけ止めます。
- `dead-cliche-enable` を書かなければ、そのファイルの末尾まで効きます。
- 指示は `check` と `fix` の両方に効きます。止めた範囲は自動修正の対象からも外れます。
- 引用を一律に対象外にはしていません。自分の下書きを引用で置く使い方があるためです。

## ユースケース別の使い方

### 技術記事・ブログの推敲

書き終えた原稿に `/dead-cliche:check 記事.md` を実行します。検出表 (file:line / ルール /
該当表現 / 直し方) が返り、`--fix` を付けると意味を保った書き直しまで行います。
プラグインを入れていれば、ClaudeがMarkdownを書いた直後にフックが自動でチェックし、
クリシェが混入した時点で書き直しが走ります。手動での実行は不要になります。

### 論文・設計文書・提案書

paperプリセットを使います。修辞疑問 (`〜ではないでしょうか`) と呼びかけ (`〜していきましょう`)
もerrorになります。長い原稿はdead-cliche-editorエージェントに渡すと、原稿全文を
メイン会話に持ち込まずに推敲結果と変更表だけが返ります。

### UI文言のレビュー

`ux-writing-review` スキルが反応する場面 (文言を書いた・変えた・レビューを頼んだ) で、
機械チェック (`--preset ux-microcopy`) と人力チェックリスト (句点の原則、ボタンの
動作名詞、確認ダイアログ、エラーの3要素) を通した指摘がmust / shouldの2段階で返ります。
CLI単体でも `check src/components/*.tsx --preset ux-microcopy` で助詞のゆれ
(が失敗しました) や責める表現 (不正な値) を拾えます。

### PRレビュー

`/dead-cliche:pr-review 1234` でPR全体をレビューします。コードの観点に加えて、
差分中の散文 (.md、PR本文) をbusinessプリセットで、UI文言をux-microcopy
プリセットで検査し、must / shouldの2段階の指摘と、署名・絵文字なしのレビュー
コメント文面を組み立てます。既定では文面の提示で止まり、`--post` を付けたときだけ
確認のうえ `gh pr review` で投稿します。

### PR・コミット・レビューコメント

`plain-communication` スキルがPR作成・コミット・レビュー投稿時に常時効きます。
AI署名と絵文字は入らず、課題と取るべきアクションを明確にした端的な文面になります。
Claude Code本体の署名も止める場合は `settings.json` に次を足します。

```json
{ "attribution": { "commit": "", "pr": "", "sessionUrl": false } }
```

### Slackのレビュー依頼

`/dead-cliche:review-request` で、現在のブランチのPRからプレーンテキストの依頼文を
作ります。URLはフルパス、5行以内、装飾なしです。`/dead-cliche:review-request 1234 明日中に`
のようにPR番号や期限を渡せます。

### 文章の新規生成

`/dead-cliche:compose テーマ` で、導入・説明・結論の3段落の文章を生成します。
生成物は出力前にチェッカーを通し、0件になるまで書き直されます。既存のプロンプト集の
文章生成プロンプトを使う場合も、出力をこのゲートに通せば文体が揃います。

### Claude Desktopアプリで使う

DesktopアプリのCodeモード (Claude Codeセッション) は、このMacのuserスコープの
プラグインをそのまま読み込みます。追加の設定は不要で、`/dead-cliche:check` や
フックが同じように動きます。

Codeモードではない通常のチャットにはプラグインの仕組みがないため、claude.aiの
スキルとして入れます。`npm run build:claude-ai-skill` で生成される
`dist/dead-cliche-review.zip` (辞書130ルールを同梱) をclaude.aiの
設定 → 機能 → スキルからアップロードすると、Desktopのチャットでもクリシェ検出と
レビュー規律が効きます。決定論的なCLIはチャット内では動かないため、厳密な検査は
CIかCodeモードに任せる位置付けです。

### iPhoneアプリでリポジトリをレビューする

3つの経路があります。

1. claude.ai/codeのクラウドセッション。対象リポジトリの `.claude/settings.json` に
   marketplaceとプラグインを書いてコミットしておくと、クラウド環境でも同じ
   プラグインが読み込まれ、iPhoneアプリから `/dead-cliche:pr-review` まで使えます。
   投稿 (`gh pr review`) もクラウド側で実行できます。
2. claude.aiスキル (上記のzip)。iPhoneのチャットにも同期されるため、GitHub
   コネクタでPRを読ませてレビューさせる使い方ができます。投稿は文面をコピーして
   GitHubアプリから行います。
3. リモートコントロール。Macで起動したClaude CodeセッションをiPhoneアプリから
   操作する方式で、ローカルのプラグイン・フック・CLIがすべてそのまま効きます。

### 辞書を育てる

誤検出を見つけたら `corpus/negative/` に1行追加して再現させてから、パターンを直して
PRを出します。新しいクリシェは該当カテゴリの `rules/*.yml` に1エントリ追加します。
どちらも `npm test` が回帰を検出します。
