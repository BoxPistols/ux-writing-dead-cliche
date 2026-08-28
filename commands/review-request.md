---
description: 現在の PR の Slack 用レビュー依頼文をプレーンテキストで作る
argument-hint: "[PR番号または URL] [期限や補足]"
---

plain-communication スキルの規律で、Slack に貼るレビュー依頼文を作る。

1. 対象 PR を特定する。$ARGUMENTS に番号か URL があればそれ、なければ現在のブランチの PR:
   `gh pr view --json url,title,body,additions,deletions,changedFiles`
2. 以下の構成でプレーンテキストを組み立てる:
   - 依頼の一文 (誰に見てほしいかが引数にあれば含める)
   - PR の内容 1〜2 文 (何を変えたか、なぜか)
   - 特に見てほしい点があれば 1 文
   - PR の URL (フルパスをそのまま貼る。リンク記法に隠さない)
   - 期限・温度感 ($ARGUMENTS にあれば)
3. 禁止: 絵文字、`*強調*`、見出し、句読点位置での改行、長文。全体で 5 行以内。
4. 出力はコピー用のコードブロックで返す。Slack への自動投稿はしない。
