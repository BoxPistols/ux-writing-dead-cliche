# 導入方法とユースケース別の使い方

## 導入方法

### Claude Code プラグインとして (推奨)

スキル・コマンド・フック・エージェントの全部が入る導入方法。

```
/plugin marketplace add BoxPistols/ux-writing-dead-cliche
/plugin install dead-cliche
```

チームで揃える場合は、プロジェクトの `.claude/settings.json` に書いてコミットする。

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

### CLI として (エディタ・AI ツールを問わない)

```
npx github:BoxPistols/ux-writing-dead-cliche check draft.md
cat draft.txt | npx github:BoxPistols/ux-writing-dead-cliche check --preset business
```

リポジトリを clone して `npm install` すれば `node src/cli.mjs check` でも動く。

### textlint ルールとして (既存の textlint 資産と併用)

```
npm install github:BoxPistols/ux-writing-dead-cliche textlint
```

`.textlintrc.json`:

```json
{
  "rules": {
    "ux-writing-dead-cliche": { "preset": "paper" }
  }
}
```

prh や preset-ja-technical-writing と同じ設定ファイルに並べて書ける。

### CI として (GitHub Actions)

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx github:BoxPistols/ux-writing-dead-cliche check docs/*.md README.md
```

error 級の検出があると exit 1 になり、ジョブが落ちる。

### プロジェクトごとの設定

対象リポジトリの直下に `.deadclicherc.json` を置くと、既定プリセットと除外パスを固定できる。

```json
{
  "preset": "business",
  "ignore": ["docs/archive/", "CHANGELOG.md"]
}
```

## ユースケース別の使い方

### 技術記事・ブログの推敲

書き終えた原稿に `/dead-cliche:check 記事.md` を実行する。検出表 (file:line / ルール /
該当表現 / 直し方) が返り、`--fix` を付けると意味を保った書き直しまで行う。
プラグインを入れていれば、Claude が Markdown を書いた直後にフックが自動でチェックし、
クリシェが混入した時点で書き直しが走る。手動での実行は不要になる。

### 論文・設計文書・提案書

paper プリセットを使う。修辞疑問 (`〜ではないでしょうか`) と呼びかけ (`〜していきましょう`)
も error になる。長い原稿は dead-cliche-editor エージェントに渡すと、原稿全文を
メイン会話に持ち込まずに推敲結果と変更表だけが返る。

### UI 文言のレビュー

`ux-writing-review` スキルが反応する場面 (文言を書いた・変えた・レビューを頼んだ) で、
機械チェック (`--preset ux-microcopy`) と人力チェックリスト (句点の原則、ボタンの
動作名詞、確認ダイアログ、エラーの 3 要素) を通した指摘が must / should の 2 段階で返る。
CLI 単体でも `check src/components/*.tsx --preset ux-microcopy` で助詞のゆれ
(が失敗しました) や責める表現 (不正な値) を拾える。

### PR・コミット・レビューコメント

`plain-communication` スキルが PR 作成・コミット・レビュー投稿時に常時効く。
AI 署名と絵文字は入らず、課題と取るべきアクションを明確にした端的な文面になる。
Claude Code 本体の署名も止める場合は `settings.json` に次を足す。

```json
{ "attribution": { "commit": "", "pr": "", "sessionUrl": false } }
```

### Slack のレビュー依頼

`/dead-cliche:review-request` で、現在のブランチの PR からプレーンテキストの依頼文を
作る。URL はフルパス、5 行以内、装飾なし。`/dead-cliche:review-request 1234 明日中に`
のように PR 番号や期限を渡せる。

### 文章の新規生成

`/dead-cliche:compose テーマ` で、導入・説明・結論の 3 段落の文章を生成する。
生成物は出力前にチェッカーを通し、0 件になるまで書き直される。既存のプロンプト集の
文章生成プロンプトを使う場合も、出力をこのゲートに通せば文体が揃う。

### 辞書を育てる

誤検出を見つけたら `corpus/negative/` に 1 行追加して再現させてから、パターンを直して
PR を出す。新しいクリシェは該当カテゴリの `rules/*.yml` に 1 エントリ追加する。
どちらも `npm test` が回帰を検出する。
