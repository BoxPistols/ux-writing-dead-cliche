---
description: 文章のクリシェを検出して書き直す。引数がなければ git diff の変更ファイルを対象にする
argument-hint: "[files...] [--fix] [--preset paper|business|chat|ux-microcopy]"
---

dead-cliche-writing スキルの手順で文章をチェックする。

1. 対象: $ARGUMENTS にファイルがあればそれ。なければ `git diff --name-only HEAD` の .md / .txt / 文言リソース。
2. `node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" check <対象> --preset <指定または paper>` を実行する。
3. 検出結果を表で報告する: file:line / ルール id / 該当表現 / 直し方 (ask)。
4. `--fix` が指定された場合のみ書き換える。差分だけ示し、各変更に理由を 1 行添える。
5. 書き換えた場合は再チェックし、0 件になったことを確認して終える。
