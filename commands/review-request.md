---
description: 現在のPRのSlack用レビュー依頼文をプレーンテキストで作る
argument-hint: "[PR番号またはURL] [期限や補足]"
---

plain-communicationスキルの規律で、Slackに貼るレビュー依頼文を作る。

1. 対象PRを特定する。$ARGUMENTSに番号かURLがあればそれ、なければ現在のブランチのPR:
   `gh pr view --json url,title,body,additions,deletions,changedFiles`
2. 以下の構成でプレーンテキストを組み立てる:
   - 依頼の一文 (誰に見てほしいかが引数にあれば含める)
   - PRの内容1〜2文 (何を変えたか、なぜか)
   - 特に見てほしい点があれば1文
   - PRのURL (フルパスをそのまま貼る。リンク記法に隠さない)
   - 期限・温度感 ($ARGUMENTSにあれば)
3. 禁止: 絵文字、`*強調*`、見出し、句読点位置での改行、長文。全体で5行以内。
4. 出力はコピー用のコードブロックで返す。Slackへの自動投稿はしない。
