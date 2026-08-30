# リリース運用マニュアル

このリポジトリの配布物と、その出し方をまとめます。手順を間違えるとCIが赤のまま
リリースが出るため、順序に意味があります。

## 実行する場所

リリースはターミナル(ターミナル.appやiTerm)から実行します。Claude Codeからは
実行しません。

npmのpublishは2要素認証を通す必要があり、このアカウントに登録しているのは
セキュリティキーだけです。認証アプリ(TOTP)は登録していないため、6桁コードを
`--otp=`で渡す方法は使えません。セキュリティキーの認証はブラウザで行い、npmは
その完了を端末の入力待ちで待ちます。ttyの無い環境から実行すると、npmは認証用の
URLを表示した直後に`EOTP`で終了します。

Claude CodeのBashツールにはttyがありません。プロンプトに`!`を付けて実行しても
同じ経路を通るため、結果は変わりません。誤って実行した場合は段階0で止まり、
版は上がりません。

```
cd /Users/ai/dev/writing/ux-writing-dead-cliche
npm run release patch
```

## 配布物とバージョンの持ち方

| 配布先 | 実体 | バージョンの出どころ |
| --- | --- | --- |
| npm | textlint-rule-ux-writing-dead-cliche | package.json |
| Claude Codeプラグイン | このリポジトリ (marketplace経由) | .claude-plugin/plugin.json |
| GitHub Releases | dead-cliche-review.zip (claude.aiスキル) | タグ名 |
| GitHub Pages | docs/配下 | 生成物に埋め込まれるpackage.jsonの値 |

package.jsonと.claude-plugin/plugin.jsonのversionは必ず同じ値にします。
生成物 (docs/prompts/*.md、docs/app-data.json) にもこの値が埋め込まれるため、
bumpしたら必ず再生成が要ります。

## リリース手順

`npm run release`にまとめてあります。手順を手で並べません。

```
npm run release patch                       # patch / minor / major / X.Y.Z
npm run release patch -- --dry-run          # 検証まで走らせ、公開の手前で止める
npm run release -- --resume                 # 途中で失敗したリリースを続きから流す
npm run release patch -- --skip-npm         # npmへの公開だけ飛ばす
npm run release patch -- --otp=123456       # 認証アプリを登録しているアカウント向け
```

`npm run`はハイフンで始まる引数を自分の設定として解釈するため、`--`の区切りが要ります。

スクリプトが踏む段階は次のとおりです。番号は出力の`[n]`に対応します。

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

段階6はHEADのshaで実行を絞ります。最新の実行を1件だけ見る作りだと、pushの実行が
登録される前は前のコミットの完了済みsuccessを読み、別のコミットの結果で公開まで
進みます。

各段階は外部コマンドの終了コードを見ます。Releaseの作成に失敗した回が過去にあり、
そのときは最後まで成功したように表示されていました。

## 実行前のチェック

- ターミナルから実行していること (Claude Code経由ではない)
- mainにいて、作業ツリーが綺麗で、originに追いついていること
- `npm whoami`が意図したアカウントであること
- 出したい変更がすべてコミット済みであること

段階0がすべて確認しますが、落ちてから直すより先に整えるほうが速く済みます。

## リリースの実行中にしてはいけないこと

実行が終わるまで、別のセッションやターミナルからpushしないでください。段階8の
`gh release create`はリモートの先端にタグを作るため、実行中に別のコミットが
入ると、そのタグが意図しないコミットを指します。

別のセッションから状態を確認する場合は、読み取りだけにとどめます。実行中かどうかは
`pgrep -fl release.mjs`で分かります。

## よくある失敗と対処

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| `npm error code EOTP`が出て止まる | ttyの無い環境から実行した | ターミナルから実行し直す |
| 段階0で2要素認証の警告が出る | 同上。版を上げる前に止めている | ターミナルから実行し直す |
| 未コミットの変更があると言われる | 作業ツリーが汚れている | コミットするか元に戻す |
| originに追いついていないと言われる | リモートに先の変更がある | `git pull`してから再実行 |
| CIが赤で止まる | テストか生成物の同期が壊れている | 直してから再実行。版は上がっていない |
| 版を上げたコミットだけが残った | 段階7以降で落ちた | `npm run release -- --resume` |
| 同じ版がすでに公開されていると言われる | 公開まで済んでいる回を再実行した | `--resume`を付けて続きから流す |
| 公開したのにタグとReleaseが無い | 段階8が黙って失敗していた (修正済み) | `--resume`で作り直す |

`--resume`はpackage.jsonの現在の版をそのまま対象にし、済んでいる段階を飛ばします。
公開済みならpublishを飛ばし、Releaseが既にあれば作り直しません。版を上げ直さないため、
同じコマンドを繰り返しても版が進みません。

## 過去の版のReleaseを後から作るとき

`gh release create`は既定でそのReleaseをLatestにします。古い版のReleaseを遡って
作ると、最新版からLatestの表示を奪います。`--latest=false`を付けるか、作ったあとに
`gh release edit vX.Y.Z --latest`で最新版に戻してください。

## スクリプトを使わずに出す場合

スクリプトが壊れているときのために、素の手順を残します。順序は上の段階表と同じです。

```
# 1. バージョンを上げる (2ファイルとも同じ値に)
#    package.json と .claude-plugin/plugin.json の "version"

# 2. 生成物を作り直す (これを忘れるとCIが赤になる)
npm run docs:prompts
npm run docs:webdata
npm run docs:comparison

# 3. 検証 (すべて通ること)
npm test
node src/cli.mjs check README.md CONTRIBUTING.md DESIGN.md docs/*.md

# 4. コミットとpush
git add -A && git commit -m "vX.Y.Z" && git push

# 5. CIの結果を確認 (対象のコミットがsuccessであること)
gh run list --workflow ci.yml --limit 5 --json headSha,status,conclusion

# 6. npmに公開
npm publish --access public

# 7. Releaseとスキルzip
npm run build:claude-ai-skill
gh release create vX.Y.Z dist/dead-cliche-review.zip --title "vX.Y.Z" --notes "変更の要点"

# 8. 自分の環境のプラグインを更新
claude plugin update dead-cliche@ux-writing-dead-cliche
```

## npmの公開範囲

`package.json`の`files`に列挙したものだけが公開されます (src / rules / presets /
schema / README.md / LICENSE)。docs・test・corpus・toolsは配布物に含めません。
公開前の中身は`npm pack --dry-run`で確認できます。

`.npmignore`は置きません。`files`の許可リスト方式のほうが、追加したファイルが
意図せず公開される事故を防げます。

`package.json`の`bin`と`repository.url`は、npmが公開時に正規化する形で持ちます。
正規化の警告が並ぶと、実害のある警告が埋もれます。

## 公開前のセキュリティ確認

npmは一度公開すると同じバージョンを差し替えられません (unpublishも72時間の制限や
依存への影響があります)。公開前に次を確認します。

- `npm pack --dry-run`の一覧に、鍵・トークン・顧客情報・社内固有の記述が無いこと
- rules/とpresets/に社名・製品名・非公開URLが混じっていないこと
  (CONTRIBUTINGの受け入れ拒否条件と同じ基準)
- `npm whoami`が意図したアカウントであること
- 2要素認証が有効であること (publish時にブラウザ認証を求められる状態が正常)
- 依存が最小であること。現在の実行時依存はjs-yamlのみで、追加は慎重に判断する

トークンをCIに置いて自動公開する構成は採っていません。公開の頻度が低く、
長命のnpmトークンをリポジトリのSecretに置くリスクのほうが大きいためです。
同じ理由で、2要素認証をバイパスするトークンを手元の`.npmrc`にも置きません。
publishのたびにターミナルへ移る手間と引き換えに、公開権限を持つ資格情報を
ディスクに残さない状態を保ちます。

## バージョンの上げ方

- パッチ: 誤検出の修正、文言の修正、実装の不具合修正
- マイナー: ルールの追加、コマンドやオプションの追加、UIの機能追加
- メジャー: 既定の挙動が変わる変更 (プリセットの構成変更、終了コードの意味の変更など)
