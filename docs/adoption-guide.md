# 既存プロダクトへの導入マニュアル

このツールを自分のプロダクト・リポジトリで使い始めるための手順書です。
機能ごとの詳しい説明は [usage.md](usage.md)、textlint 資産との併用は
[comparison.md](comparison.md) を参照してください。

## 0. 導入の全体像

導入は 3 段階に分かれます。すべてやる必要はなく、段階 1 だけでも機能します。

| 段階 | 対象 | 作業 | 効く範囲 |
| --- | --- | --- | --- |
| 1 | 自分だけ | プラグインを 1 回入れる | この PC の全リポジトリ |
| 2 | リポジトリ | 設定ファイル 2 つをコミット | チーム全員・クラウドセッション |
| 3 | CI | ワークフローに 1 行 | マージ前のゲート |

## 1. 自分の環境に入れる (1 回だけ)

```
/plugin marketplace add BoxPistols/ux-writing-dead-cliche
/plugin install dead-cliche
```

これで Claude Code のすべてのセッション (ターミナル・Desktop アプリの Code モード) で、
どのディレクトリでも次が使えます。

- `/dead-cliche:check <files>` — 検出と修正 (`--fix` で書き直しまで)
- `/dead-cliche:pr-review <PR番号>` — PR のレビュー (`--post` で確認のうえ投稿)
- `/dead-cliche:review-request <PR番号>` — Slack 用レビュー依頼文
- `/dead-cliche:compose <テーマ>` — 3 段落の文章生成
- 自動フック — Claude が Markdown を書いた直後に検査し、クリシェがあれば書き直し

PR・コミット・レビューの文面規律 (AI 署名と絵文字の禁止、端的な文体) は
スキルとして常時効きます。Claude Code 本体の署名も止める場合は、
`~/.claude/settings.json` に次を足します。

```json
{ "attribution": { "commit": "", "pr": "", "sessionUrl": false } }
```

## 2. リポジトリに恒久導入する

対象リポジトリの直下に 2 ファイルをコミットします。

`.deadclicherc.json` — 既定プリセットと除外パス:

```json
{
  "preset": "business",
  "ignore": ["CHANGELOG.md", "docs/archive/"]
}
```

`.claude/settings.json` — チームとクラウドセッションへのプラグイン配布:

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

これで、チームメンバーの Claude Code と、iPhone から使う claude.ai/code の
クラウドセッションにも同じプラグインが読み込まれます。

プロダクト固有の禁止ワード (旧名称・社内で禁止された言い回しなど) は
[提案フォーム](https://boxpistols.github.io/ux-writing-dead-cliche/proposal-form.html)の
「自分のプロジェクト用」で YAML を作り、`.deadcliche/custom-rules.yml` に置いて
`.deadclicherc.json` の `customRules` から参照します。文字列一致なので安全に動きます。

## 3. CI をゲートにする

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npx github:BoxPistols/ux-writing-dead-cliche check README.md docs/*.md
```

error 級の検出で exit 1 になります。CLI はグロブを展開しないため、
ファイル指定はシェルに展開させてください。

## 場面別の手順

### PR を書く・レビューする

書く側は何もしなくても文面規律が効きます。レビューする側は
`/dead-cliche:pr-review 123` で、コード観点に加えて差分中の散文と UI 文言が
検査され、署名なしのレビュー文面が組み上がります。

### 既存の PR・issue 本文を改善する

```
gh pr view 123 --json body -q .body | npx github:BoxPistols/ux-writing-dead-cliche check --preset business
gh issue view 45 --json body -q .body | npx github:BoxPistols/ux-writing-dead-cliche check --preset business
```

書き直しまで任せる場合は、セッションで対象を指定してください
(例:「PR 123 の本文をチェックして直して」)。更新は `gh pr edit` で行われます。

### Wiki を改善する

Wiki は本体と別の git リポジトリです。Web 上で最初の 1 ページを作るまでは
clone できない点に注意してください。

```
git clone git@github.com:OWNER/REPO.wiki.git
cd REPO.wiki
npx github:BoxPistols/ux-writing-dead-cliche check *.md --preset business
npx github:BoxPistols/ux-writing-dead-cliche fix *.md --write
```

`fix` は表記系 (補助動詞の漢字・助詞のゆれ・冗長形など) だけを機械修正します。
既定は dry-run で、`--write` を付けたときだけ書き込みます。機械修正できない検出は
Claude セッションでの書き直しか、長文なら dead-cliche-editor エージェントに任せます。

### 既存ドキュメントの一括改善

1. `check docs/*.md` で現状を把握する (検出数と種類)
2. `fix docs/*.md --write` で機械修正分を先に片付け、1 コミットにする
3. 残りをファイル単位で書き直す。フックが効いているので、Claude が編集するたびに
   再検査される
4. 仕上げに `.deadclicherc.json` と CI を入れて、再発を止める

### UI 文言 (アプリの画面テキスト)

```
npx github:BoxPistols/ux-writing-dead-cliche check src/components/*.tsx --preset ux-microcopy
```

助詞のゆれ (`が失敗しました`)、責める表現 (`不正な値`)、補助動詞の漢字などが
検出されます。句点の原則やボタンの語彙など機械化できない観点は、セッションで
「UI 文言をレビューして」と言えば ux-writing-review スキルが人力チェックリストを当てます。

## プリセットの選び方

| 書いているもの | プリセット |
| --- | --- |
| 設計書・論文・提案書 | paper |
| PR 本文・issue・Wiki・社内文書 | business |
| チャット・カジュアルな文章 | chat |
| 画面の文言 | ux-microcopy |

## つまずきやすい点

- npx の `github:` 指定は毎回取得が走るため遅めです。頻用するリポジトリでは
  `npm i -D github:BoxPistols/ux-writing-dead-cliche` で固定してください
- 標準入力経由ではコードフェンスのマスクと `.deadclicherc.json` が効きません。
  ファイルがあるならパスで渡してください
- フックの検査は差分ではなくファイル全体に対して走ります。過去の文書を 1 行だけ
  直したときに古い検出で止まる場合は、そのパスを `ignore` に入れるか、先に
  一括改善を済ませてください
- textlint と併用する場合の設定キーはスコープ付きの `@textlint-ja/preset-ai-writing`
  です。解決できないキーが 1 つでもあると textlint は設定全体を捨てます
