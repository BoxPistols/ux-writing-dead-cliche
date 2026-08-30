---
name: release-ops
description: "ux-writing-dead-clicheのリリースと配布物の運用。バージョンを上げる、npmに公開する、Releaseを作る、生成物を再生成する、CIが生成物の同期で落ちたときに使う。Triggers: リリース, バージョンを上げる, npm publish, 公開, 配布, タグを打つ, CIが赤, 生成物の同期."
---

# リリースと配布物の運用

配布物は4つあり、バージョンの出どころが分かれている。

| 配布先 | 実体 | バージョン |
| --- | --- | --- |
| npm | textlint-rule-ux-writing-dead-cliche | package.json |
| Claude Codeプラグイン | このリポジトリ (marketplace) | .claude-plugin/plugin.json |
| GitHub Releases | dead-cliche-review.zip | タグ名 |
| GitHub Pages | docs/ | 生成物に埋め込まれたpackage.jsonの値 |

## 原則

- package.json と .claude-plugin/plugin.json のversionは常に同じ値にする
- versionを変えたら生成物 (docs/prompts/*.md、docs/app-data.json) を必ず再生成する。
  忘れるとCIが落ちる。`npm test` でも検出される
- リリースは `node tools/release.mjs <patch|minor|major>` で実行する。手順を手で
  並べ直さない。スクリプトが事前確認・再生成・検証・公開範囲の走査・CI待ち・
  公開確認まで順に行い、失敗したらその場で止まる
- 検証を回避しない。スクリプトが中止したら原因を報告し、判断を仰ぐ

## CIが生成物の同期で落ちたとき

```
npm run docs:prompts && npm run docs:webdata && npm run docs:comparison
npm test
git add -A && git commit -m "生成物を再生成する" && git push
```

## 公開前に守ること

- `npm pack --dry-run` の一覧に、鍵・トークン・顧客情報・社内固有の記述が無いこと
  (release.mjsが機密パターンと業務固有語を走査するが、目視も行う)
- 公開範囲は package.json の `files` の許可リストで決まる。`.npmignore` は使わない
- npmは同じバージョンを差し替えられない。公開前の確認をやり直しの効かないものとして扱う
- 終了コードの意味と `--format json` の形は互換を保つ。変える場合はメジャー扱いにし、
  READMEの出力契約も同時に更新する

詳細は docs/release-guide.md にある。
