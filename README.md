# ux-writing-dead-cliche

AI が日本語文章に持ち込むクリシェを検出し、平易な文章へ直すための辞書とツール。

`羅針盤`、`心臓部`、`シナジー`、`〜にほかなりません`、`〜していきましょう`。
これらを語彙の問題ではなく、情報の欠落として扱う。`羅針盤` と書いた文には、
誰がどの判断を何を基準に行うのかが書かれていない。本ツールの辞書は、
検出した表現ごとに「なぜ避けるか (why)」と「代わりに何を書くべきか (ask)」を返す。

## 構成

辞書 (`rules/*.yml`) を単一の情報源とし、3 つの経路から同じルールが効く。

```
rules/*.yml ─┬─ CLI (npx dead-cliche check)
             ├─ textlint ルール (既存の textlint 資産と併用)
             └─ Claude Code プラグイン (スキル + コマンド + フック)
```

機械で判定できるルールは正規表現で検出し、判定できないルール (体言止めの連打、
太字の散布など) は `manual` として辞書に持ち、レビュー時の人力チェックリストになる。

## インストール

CLI として使う場合:

```
npx github:BoxPistols/ux-writing-dead-cliche check draft.md
npx github:BoxPistols/ux-writing-dead-cliche check draft.md --preset business
cat draft.txt | npx github:BoxPistols/ux-writing-dead-cliche check
```

Claude Code プラグインとして使う場合:

```
/plugin marketplace add BoxPistols/ux-writing-dead-cliche
/plugin install dead-cliche
```

textlint と併用する場合 (パッケージ名は textlint の慣例に従い textlint-rule- 接頭辞):

```
npm install textlint github:BoxPistols/ux-writing-dead-cliche
```

.textlintrc.json:

```json
{
  "rules": {
    "ux-writing-dead-cliche": { "preset": "paper", "minSeverity": "warn" }
  }
}
```

## Claude Code プラグインの内容

| 種類 | 名前 | 役割 |
| --- | --- | --- |
| スキル | dead-cliche-writing | クリシェ検出と平易な書き直しの手順 |
| スキル | ux-writing-review | UI テキストのレビュー (公開ガイドの共通原則ベース) |
| スキル | plain-communication | PR・コミット・Slack 文面の規律 (AI 署名と絵文字の禁止を含む) |
| コマンド | /dead-cliche:check | ファイルまたは差分のチェックと修正 |
| コマンド | /dead-cliche:review-request | Slack 用レビュー依頼文の生成 (プレーンテキスト) |
| コマンド | /dead-cliche:compose | 導入・説明・結論の 3 段落での文章生成 (チェッカー通過を保証) |
| エージェント | dead-cliche-editor | 長文原稿の隔離推敲 |
| フック | PostToolUse | Markdown を書いた直後に自動チェックし、検出時は書き直しを要求 |

## プリセット

| プリセット | 想定する文書 | 特徴 |
| --- | --- | --- |
| paper | 論文・技術文書・設計書 | 全カテゴリ有効。修辞疑問と呼びかけも error |
| business | ビジネス文書・PR・レビュー | 慣用の強調は許容 |
| chat | チャット | 呼びかけ・感嘆は許容。比喩と空虚な抽象のみ検出 |
| ux-microcopy | UI テキスト | 画面文言の規範のみ |

プロジェクト直下の `.deadclicherc.json` で既定プリセットと除外パスを指定できる。

```json
{
  "preset": "business",
  "ignore": ["docs/archive/"]
}
```

## ルールの書式

1 ルール 1 エントリ。why と ask を必須にしているのは、置換候補だけの辞書では
別のクリシェに置き換わるだけで終わるためである。

```yaml
- id: metaphor/compass
  severity: error
  pattern: '(?<!船の)(?<!航海の)羅針盤'
  why: 「指針」の比喩として頻出するが、誰がどの判断に使うのかが書かれない。
  ask: 誰が、どの判断を、何を基準に決めるのかを書く。
  examples:
    bad:
      - 'この文書はチームの羅針盤です。'
    good:
      - '実装方針で迷ったときは、この文書の判断基準の節に従う。'
  deny_examples:
    - '博物館で古い船の羅針盤を見た。'
```

## 検出の設計方針

誤検出はルールの死である。誤検出率が上がった時点で誰も使わなくなるため、
次をテストで強制している。

- すべてのルールに悪い例と良い例を必須とし、悪い例が検出されること、良い例が
  検出されないことを CI で確認する
- 正当な用法と衝突しうるルール (心臓部、穴、昇華、確信など) は共起条件で絞り、
  `deny_examples` (検出してはいけない例) の通過を必須にする
- 正当な日本語だけを集めた negative コーパスが、全ルールに対して 0 件で通ること
- 書き直し例の golden コーパスは、before が検出され after が 0 件で通ること

Markdown のコードフェンスとインラインコードは検査対象から除外される。

実施前・実施後の比較は docs/before-after.md にある。golden コーパスから自動生成され、
実施後の文が全ルールで検出 0 件であることを CI が保証する。表示とテストが同じデータから出る。

## PR・コミット文面について

plain-communication スキルは、AI 生成の署名 (Generated with Claude Code、
Co-Authored-By: Claude 等) と絵文字を、コミットログ・PR 本文・レビューコメントの
すべてで禁止する。あわせて Claude Code の `settings.json` に
`"includeCoAuthoredBy": false` を設定すると、ツール側の自動署名も止まる。

## 貢献

ルールの追加・修正は 1 エントリ単位の PR で受け付ける。CONTRIBUTING.md を参照。
社名・製品名・非公開 URL・顧客名を含むルールやコーパスは受け付けない。

## ライセンス

MIT
