---
description: このリポジトリをリリースする (バージョン更新・検証・npm公開・Release作成まで)
argument-hint: "<patch|minor|major|X.Y.Z> [--dry-run] [--skip-npm]"
---

ux-writing-dead-cliche のリリースを実行する。手順の実体は `tools/release.mjs` にあり、
順序と検証はスクリプトが強制する。あなたの仕事は、変更内容の要約とリリースノートの用意、
そして失敗時の判断である。

1. まず変更内容を確認する: `git log --oneline $(git describe --tags --abbrev=0)..HEAD`
2. バージョンの種別を決める。$ARGUMENTS に指定があればそれに従う。指定がなければ
   変更内容から判断して提案し、ユーザーの確認を取る。
   - patch: 誤検出の修正、文言の修正、実装の不具合修正
   - minor: ルールの追加、コマンドやオプションの追加、UIの機能追加
   - major: 既定の挙動が変わる変更 (終了コードの意味、JSON出力の形、プリセット構成)
3. リリースノートを1〜3文で書く。何が変わり、利用者が何をすればよいかを書く。
   AI署名と絵文字は入れない。`RELEASE_NOTES` 環境変数で渡す。
4. 実行する:
   `RELEASE_NOTES="..." node tools/release.mjs <種別>`
   確認だけなら `--dry-run` を付ける (公開せず検証のみ。バージョンと生成物の変更は残るので、
   確認後に `git checkout -- package.json .claude-plugin/plugin.json docs/` で戻す)。
5. スクリプトが中止した場合は、原因を報告して指示を仰ぐ。勝手に検証を回避しない。
   よくある中止理由: 未コミットの変更、mainブランチでない、origin/mainに遅れている、
   テストや自己検査の失敗、CIの失敗、公開物への機密・業務固有語の混入。
6. 完了後、npmとPagesの反映を確認して結果を報告する。

注意: npm publishは2要素認証のためブラウザが開く。ユーザーの操作が要ることを事前に伝える。
