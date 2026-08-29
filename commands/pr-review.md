---
description: PRをクリシェ検出付きでレビューし、署名なしの端的なレビューコメントを組み立てる
argument-hint: "[PR番号またはURL] [--postで投稿まで]"
---

plain-communicationスキルの規律でPRをレビューする。

1. 対象PRを特定する。$ARGUMENTSに番号かURLがあればそれ、なければ現在のブランチのPR。
   `gh pr view <番号> --json title,body,files` と `gh pr diff <番号>` で内容を取得する。
2. 差分を3つの観点で確認する。
   - コードの正しさ (通常のレビュー観点)
   - 散文の文章 (PR本文・ドキュメント・コメント):
     変更された .md / .txtを `node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" check <ファイル> --preset business` にかける
   - UI文言 (JSX / HTML / 文言リソースの日本語文字列):
     `--preset ux-microcopy` にかけ、ux-writing-reviewスキルの人力チェックリストも当てる
3. 指摘をmust / shouldの2段階でまとめる。各指摘は「該当箇所 (file:line)」「現状」
   「問題」「提案」の順で2〜4文。過剰な定量エビデンスを並べない。
   検証していないことは書かない。
4. レビューコメント文面の禁止事項: AI署名、絵文字、太字の散布、見出しの乱用。
   相手への敬意をもって端的に書く。
5. 既定では文面をコードブロックで提示して止める。`--post` が指定された場合のみ、
   ユーザーに最終確認してから `gh pr review <番号> --comment --body <文面>` で投稿する。
