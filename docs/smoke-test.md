# 動作テストマニュアル (別リポジトリで10分)

導入したツールが実際に動くことを、別のリポジトリで確認する手順です。
期待値はすべて実測済みの値です。導入自体の手順はadoption-guide.mdにあります。

## 前提

Claude Codeプラグインを導入済みであること (未導入なら2コマンド)。

```
/plugin marketplace add BoxPistols/ux-writing-dead-cliche
/plugin install dead-cliche
```

導入済みの場合も、テスト前に最新化と新しいセッションの開始をしてください。
プラグインは古いバージョンのままキャッシュされていることがあります。

```
claude plugin update dead-cliche@ux-writing-dead-cliche
```

## テスト1: 検出 (CLI)

対象リポジトリで、次の内容のファイルをtest-dc.mdとして保存します。

```
# 新機能の紹介

この機能はまさに業界のゲームチェンジャーです。開発チームの技術力は我々のDNAであり、圧倒的なスピードで実装しました。
設定は画面から入力して下さい。保存が失敗しました、というエラーが出る場合は再試行することができます。
今後の展開に期待が高まります。ぜひお試しください！！
```

```
npx github:BoxPistols/ux-writing-dead-cliche check test-dc.md --preset business
```

期待値: 7件 (error 3件) でexit 1。`ゲームチェンジャー` `我々のDNA` `圧倒的`
`することができます` `期待が高まり` `ぜひお試しください` `！！` が並びます。
(paperプリセットだとさらに増えます。0件になった場合はファイルの保存し忘れか、
`.deadclicherc.json` のignoreに当たっています)

## テスト2: 決定論的な自動修正

```
npx github:BoxPistols/ux-writing-dead-cliche fix test-dc.md
```

期待値: dry-runで2件が提示されます (`することができます`→`できます`、`！！`→`！`)。
`--write` を付けると書き込まれ、再実行すると「決定論的に修正できる検出はありません」
になります。残り5件が機械置換できない (書き直しが必要な) クリシェです。

## テスト3: プロジェクト固有の禁止ワード

```
mkdir -p .deadcliche
cat > .deadclicherc.json <<'JSON'
{ "preset": "business", "customRules": [".deadcliche/custom-rules.yml"] }
JSON
cat > .deadcliche/custom-rules.yml <<'YML'
- id: custom/old-product-name
  surface: ['旧プロダクトX']
  why: 改名済みの旧名称。
  ask: 正式名称に置き換える。
YML
printf '旧プロダクトXの設定画面を開きます。\n' > test-custom.md
npx github:BoxPistols/ux-writing-dead-cliche check test-custom.md
```

期待値: `custom/old-product-name 「旧プロダクトX」` がerrorで1件。

## テスト4: フック (Claudeが書いた瞬間の自動検出)

対象リポジトリで新しいClaude Codeセッションを開き、次を依頼します。

```
memo.md に「この機能は業界のゲームチェンジャーです。」と書いて
```

期待される挙動: 書き込み直後にフックが検出を返し、Claudeが指摘を受けて
自分で書き直します。最終的なmemo.mdにクリシェが残っていなければ成功です。
書き直しが走らない場合は、セッションがプラグイン更新より前に開始されています。
セッションを開き直してください。

## テスト5: コマンド

同じセッションで次を確認します。

- `/dead-cliche:check test-dc.md` — テスト1と同じ検出が表で返る
- `/dead-cliche:pr-review <PR番号>` — PRがある場合。must / shouldの指摘と、
  署名・絵文字なしのレビュー文面が組み上がり、投稿前に停止する
- `/dead-cliche:review-request <PR番号>` — Slack用のプレーンテキストが返る

## 片付け

```
rm -f test-dc.md test-custom.md memo.md
```

`.deadclicherc.json` と `.deadcliche/` は、恒久導入するなら残してコミットします。

## うまくいかないときの一覧

| 症状 | 原因と対処 |
| --- | --- |
| コマンドが出ない | プラグイン導入前のセッション。新しいセッションを開く |
| 検出が古い (最近の語が出ない) | `claude plugin update dead-cliche@ux-writing-dead-cliche` |
| npxが遅い | 毎回GitHubから取得するため。頻用なら `npm i -D github:BoxPistols/ux-writing-dead-cliche` |
| 0件になる | `.deadclicherc.json` のignore、またはコードフェンス内に書いている |
| フックが過去の文書で止まる | 検査はファイル全体に走る。先に一括改善するかignoreに入れる |
