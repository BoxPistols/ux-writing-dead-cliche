# リリース運用マニュアル

このリポジトリの配布物と、その出し方をまとめます。手順を間違えるとCIが赤のまま
リリースが出るため、順序に意味があります。

## 配布物とバージョンの持ち方

| 配布先 | 実体 | バージョンの出どころ |
| --- | --- | --- |
| npm | textlint-rule-ux-writing-dead-cliche | package.json |
| Claude Codeプラグイン | このリポジトリ (marketplace経由) | .claude-plugin/plugin.json |
| GitHub Releases | dead-cliche-review.zip (claude.aiスキル) | タグ名 |
| GitHub Pages | docs/ 配下 | 生成物に埋め込まれるpackage.jsonの値 |

package.jsonと .claude-plugin/plugin.jsonのversionは必ず同じ値にします。
生成物 (docs/prompts/*.md、docs/app-data.json) にもこの値が埋め込まれるため、
bumpしたら必ず再生成が要ります。

## リリース手順

```
# 1. バージョンを上げる (2ファイルとも同じ値に)
#    package.json と .claude-plugin/plugin.json の "version"

# 2. 生成物を作り直す (これを忘れるとCIが赤になる)
npm run docs:prompts
npm run docs:webdata
npm run docs:comparison

# 3. 検証 (すべて通ること)
npm test                                   # 生成物の同期も含めて検証する
npx dead-cliche check README.md docs/*.md  # 自分の文書が自分の検査を通ること

# 4. コミットとpush
git add -A && git commit -m "vX.Y.Z: 変更の要点" && git push

# 5. CIの結果を確認 (successを見てから次へ)
gh run list --workflow ci.yml --limit 1

# 6. npmに公開 (2要素認証のためブラウザが開きます)
npm publish --access public

# 7. Releaseとスキルzip
npm run build:claude-ai-skill
gh release create vX.Y.Z dist/dead-cliche-review.zip --title "vX.Y.Z" --notes "変更の要点"

# 8. 自分の環境のプラグインを更新
claude plugin update dead-cliche@ux-writing-dead-cliche
```

## npmの公開範囲

`package.json` の `files` に列挙したものだけが公開されます (src / rules / presets /
schema / README.md / LICENSE)。docs・test・corpus・toolsは配布物に含めません。
公開前の中身は `npm pack --dry-run` で確認できます。

`.npmignore` は置きません。`files` の許可リスト方式のほうが、追加したファイルが
意図せず公開される事故を防げます。

## 公開前のセキュリティ確認

npmは一度公開すると同じバージョンを差し替えられません (unpublishも72時間の制限や
依存への影響があります)。公開前に次を確認します。

- `npm pack --dry-run` の一覧に、鍵・トークン・顧客情報・社内固有の記述が無いこと
- rules/ とpresets/ に社名・製品名・非公開URLが混じっていないこと
  (CONTRIBUTINGの受け入れ拒否条件と同じ基準)
- `npm whoami` が意図したアカウントであること
- 2要素認証が有効であること (publish時にブラウザ認証を求められる状態が正常)
- 依存が最小であること。現在の実行時依存はjs-yamlのみで、追加は慎重に判断する

トークンをCIに置いて自動公開する構成は採っていません。公開の頻度が低く、
長命のnpmトークンをリポジトリのSecretに置くリスクのほうが大きいためです。

## バージョンの上げ方

- パッチ: 誤検出の修正、文言の修正、実装の不具合修正
- マイナー: ルールの追加、コマンドやオプションの追加、UIの機能追加
- メジャー: 既定の挙動が変わる変更 (プリセットの構成変更、終了コードの意味の変更など)

終了コードの意味 (error/warnで1) と `--format json` の形は互換を保ちます。
これらを変える場合はメジャーとして扱い、READMEの出力契約も同時に更新します。

## リリース後の確認

```
npm view textlint-rule-ux-writing-dead-cliche version
npx textlint-rule-ux-writing-dead-cliche check <適当な文書>   # レジストリ経由で動くこと
```

Pagesはpushから1分前後で反映されます。ブラウザのキャッシュが残るため、
確認時はクエリを付けて開きます (例: `?v=0140`)。
