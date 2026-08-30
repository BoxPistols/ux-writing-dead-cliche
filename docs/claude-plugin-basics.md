# Claudeのスキルとプラグインの基本

このリポジトリはClaude Codeのプラグインとして配布されています。その前提になるスキルとプラグインの仕組みをまとめます。dead-cliche固有の話は最後の節だけで、それ以外は他のプラグインにもそのまま当てはまります。

調査日: 2026-08-30。記述はClaude Codeの公開ドキュメントと、手元のv4系CLIでの実測に基づきます。

## 用語

| 語 | 実体 | 呼び出し |
| --- | --- | --- |
| スキル (Skill) | `SKILL.md` 1ファイルとその補助ファイル | Claudeが文脈から自動で読む。手動でも呼べる |
| コマンド | `commands/` 配下のMarkdown | ユーザーが `/名前` で叩く |
| プラグイン | スキル・コマンド・エージェント・フック・MCPをまとめた配布単位 | インストールして使う |
| マーケットプレース | プラグインの一覧を持つgitリポジトリ | `/plugin marketplace add` で登録 |

スキルとコマンドの違いは呼び出し方です。スキルはfrontmatterの `description` に書いた条件にClaudeが自分で反応します。コマンドは人が明示的に叩きます。同じプラグインが両方を持てます。

## スキルの置き場所は3系統ある

| 置き場所 | スキル名 | 向いている用途 |
| --- | --- | --- |
| `.claude/skills/` (標準構成) | `/hello` | 個人の作業、プロジェクト固有の調整、実験 |
| プラグイン | `/plugin-name:hello` | 他人と共有する、版を切る、複数プロジェクトで使い回す |
| skillsディレクトリ | `名前@skills-dir` | 手元で育てている途中のプラグイン |

プラグインのスキルは必ず名前空間が付きます。別々のプラグインが同じスキル名を持っても衝突しないためです。名前空間の接頭辞は `plugin.json` の `name` を変えると変わります。

標準構成で作って動くようになってから、共有する段になってプラグインへ移すのが素直な順序です。

### skillsディレクトリで育てる

`--plugin-dir` を毎回渡さずに済ませる方法です。

```sh
claude plugin init my-tool
```

`~/.claude/skills/my-tool/` に `.claude-plugin/plugin.json` と `SKILL.md` の雛形ができます。次のセッションから `my-tool@skills-dir` として自動で読み込まれ、マーケットプレースの登録もインストールも要りません。

## SKILL.mdの書き方

frontmatterと本文だけです。

```markdown
---
name: ux-writing-review
description: UIの日本語テキストをレビューする。ボタンラベル、エラーメッセージ、表記ゆれを対象にする。Triggers: UIテキスト, 文言, ラベル, エラーメッセージ, 表記ゆれ.
---

本文。Claudeがこのスキルを読んだときに従う手順を書く。
```

`description` は、そのスキルを使うかどうかをClaudeが判断する唯一の材料です。何をするかだけでなく、いつ使うかを書きます。発火語を `Triggers:` として列挙しておくと、判断が安定します。

`disable-model-invocation: true` を付けると自動発火しなくなり、手動でしか呼べなくなります。

引数は `$ARGUMENTS` で受け取れます。

## プラグインのディレクトリ構成

| 場所 | 中身 |
| --- | --- |
| `.claude-plugin/plugin.json` | マニフェスト。名前、説明、版 |
| `skills/<名前>/SKILL.md` | スキル |
| `commands/*.md` | コマンド。新規はskills側を使う |
| `agents/` | サブエージェントの定義 |
| `hooks/hooks.json` | イベントハンドラ |
| `.mcp.json` | MCPサーバー |
| `.lsp.json` | 言語サーバー |
| `monitors/monitors.json` | バックグラウンド監視 |
| `bin/` | 有効な間だけPATHに載る実行ファイル |
| `settings.json` | 有効化時に適用される既定設定 |

間違えやすいのは `.claude-plugin/` の中身です。ここに入るのは `plugin.json` だけで、`skills/` や `commands/` はプラグインのルート直下に置きます。中に入れると読み込まれません。

スキルが1つだけなら、`skills/` を作らずルート直下に `SKILL.md` を置く形も使えます。2つ目が増える見込みがあるなら最初から `skills/` にします。

## 手元での試し方

```sh
claude --plugin-dir ./my-plugin        # インストールせずに読み込む
claude --plugin-dir ./my-plugin.zip    # zipでもよい
/reload-plugins                        # 変更を再読み込みする。再起動は要らない
```

`--plugin-dir` で読んだプラグインは、同名のインストール済みプラグインより優先されます。入れ直さずに変更を試せます。

CIの成果物のようにURLで置いてあるzipは `--plugin-url` で読み込めます。そのセッション限りです。

検証はCLIが持っています。

```sh
claude plugin validate ./my-plugin
claude plugin validate ./my-plugin --strict   # 警告もエラー扱いにする
```

## 配布の3経路と審査

| 経路 | 審査 | 公開までの時間 | 導入方法 |
| --- | --- | --- | --- |
| 自前マーケットプレース | なし | pushした時点 | `/plugin marketplace add owner/repo` |
| `claude-community` | あり | 申請、審査、夜間同期 | `/plugin install 名前@claude-community` |
| `claude-plugins-official` | Anthropicのキュレーション | 応募経路なし | 既定で登録済み |

自前マーケットプレースは、リポジトリのルートに `.claude-plugin/marketplace.json` を置いたgitリポジトリです。審査を通さずに公開でき、公開したまま直せます。

`claude-community` への申請はフォーム経由です。個人アカウントはConsole側 (platform.claude.com/plugins/submit)、Team・Enterprise組織のディレクトリ管理権限がある人はclaude.ai側を使います。審査は `claude plugin validate` と自動の安全スクリーニングで、`anthropics/claude-plugins-community` への直接のPRは自動で閉じられます。

承認後はコミュニティカタログで特定のcommit SHAにpinされ、pushするとCIがpinを自動で上げます。更新のたびの再審査はありません。カタログの反映は夜間同期なので、承認から実際に入れられるまで遅れがあります。

`claude-plugins-official` には応募の仕組みがなく、Anthropicの裁量で選ばれます。申請フォームから公式側に載ることはありません。

## Claude Codeのスキルと、claude.aiのスキルは別物

同じ「スキル」でも配布経路が独立しています。

| | Claude Codeのプラグイン | claude.aiのスキル |
| --- | --- | --- |
| 使う場所 | ターミナル、IDE | Desktopアプリ、iPhoneアプリの通常チャット |
| 配布 | マーケットプレース経由 | zipを設定画面からアップロード |
| 更新 | `/plugin` で更新 | zipを上げ直す |

片方を入れても、もう片方には反映されません。両方で使いたいなら両方に配る必要があります。

## `/skills` の鍵アイコン

プラグイン由来のスキルは `/skills` の一覧で鍵が付き、`locked by plugin` と表示されます。個別にオン・オフできないという意味で、異常ではありません。

プラグインは「この組み合わせで1セット」という単位で配られるため、中の1つだけを外す操作は用意されていません。無効にするなら `/plugin` からプラグインごと切ります。`~/.claude/skills/` に自分で置いたスキルにはチェックが付き、こちらは個別に切り替えられます。

## dead-clicheの場合

このリポジトリが実際に何をどこに置いているかです。

| 種類 | 中身 |
| --- | --- |
| スキル | `dead-cliche-writing` / `plain-communication` / `ux-writing-review` / `release-ops` |
| コマンド | `check` / `compose` / `pr-review` / `review-request` / `release` |
| マニフェスト | `.claude-plugin/plugin.json` |
| マーケットプレース | `.claude-plugin/marketplace.json` |

導入は次の1行です。

```sh
/plugin marketplace add BoxPistols/ux-writing-dead-cliche
```

配布物とバージョンの持ち方は [リリース手順](release-guide.md) に、既存プロダクトへの入れ方は [導入マニュアル](adoption-guide.md) にあります。

コミュニティディレクトリへ出す計画は本体リポジトリのissue #10とその子issueで追っています。

## 参照

- プラグインの作り方 https://code.claude.com/docs/en/plugins
- スキル https://code.claude.com/docs/en/skills
- マーケットプレース https://code.claude.com/docs/en/plugin-marketplaces
- コミュニティカタログ https://github.com/anthropics/claude-plugins-community
- 公式ディレクトリ https://github.com/anthropics/claude-plugins-official
