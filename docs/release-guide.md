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

`npm run release` にまとめてあります。手順を手で並べません。

```
npm run release patch                       # patch / minor / major / X.Y.Z
npm run release patch -- --otp=123456       # 認証アプリの6桁コードを渡す
npm run release patch -- --dry-run          # 検証まで走らせ、公開の手前で止める
npm run release -- --resume --otp=123456    # 途中で失敗したリリースを続きから流す
```

スクリプトが踏む段階は次のとおりです。番号は出力の `[n]` に対応します。

| 段階 | 内容 |
| --- | --- |
| 0 | 事前確認 (作業ツリーが綺麗、mainにいる、originに追いついている、ghとnpmにログイン済み、2要素認証を通せる、その版が未公開) |
| 1 | package.jsonと.claude-plugin/plugin.jsonのversionを更新 |
| 2 | 生成物の再生成 (prompts / app-data / engine / before-after) |
| 3 | npm testと自己検査 |
| 4 | 公開範囲の確認 (機密と業務固有語の走査) |
| 5 | コミットとpush |
| 6 | そのコミットのCIがsuccessになるまで待つ |
| 7 | npm publish |
| 8 | スキルzipのビルドとGitHub Release |
| 9 | 手元のプラグイン更新 |

### 2要素認証とTTY

publishは2要素認証を通す必要があり、ブラウザ認証は端末の入力待ちを使います。
ttyの無い環境から実行すると、npmはURLを表示した直後に`EOTP`で終わります。
認証アプリの6桁コードを`--otp=`で渡せば、ttyが無くても通ります。この判定は
段階0で行うので、版を上げる前に止まります。

### 途中で失敗したとき

公開の手前で落ちると、版を上げたコミットだけがmainに残ります。同じコマンドを
もう一度実行すると版がさらに上がるため、`--resume`を使います。package.jsonの
現在の版をそのまま対象にして、済んでいる段階を飛ばします。公開済みならpublishを
飛ばし、Releaseが既にあれば作り直しません。

各段階は外部コマンドの終了コードを見ます。Releaseの作成に失敗した回が過去にあり、
そのときは最後まで成功したように表示されていました。

### 過去の版のReleaseを後から作るとき

`gh release create`は既定でそのReleaseをLatestにします。古い版のReleaseを遡って
作ると、最新版からLatestの表示を奪います。`--latest=false`を付けるか、作ったあとに
`gh release edit vX.Y.Z --latest`で最新版に戻してください。

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
- 2要素認証が有効であること (publish時にブラウザ認証か`--otp`を求められる状態が正常)
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
