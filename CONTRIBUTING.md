# 貢献の手引き

貢献の単位は「辞書の1エントリ」です。プロンプトの文言ではなくYAMLを直します。

## ルールを追加する

1. 該当カテゴリの `rules/*.yml` に1エントリ追加します。書式は `schema/rule.schema.json` です。
2. 必須フィールドは `id` (カテゴリ名/ルール名)、`severity`、`why`、`ask`、`examples.bad`、`examples.good` です。
3. 正当な用法と衝突しうる語 (医学・化学・法律などの定訳を持つ語) は、共起条件で
   パターンを絞り、`deny_examples` に検出してはいけない例を入れます。
4. `npm test` を通します。悪い例が検出されること、良い例と負例が検出されないことが
   自動で確認されます。
5. 機械判定できないルールは `manual: true` で登録します。patternとsurfaceは書きません。
6. `examples.good` の語尾は敬体 (です・ます) で書きます。良い例は書き直しの手本を兼ねるためです。

## 提案フォームから来たものを取り込む

Issueテンプレート「禁止ワード・クリシェの提案」で来た提案は、フォームの回答を
そのまま辞書エントリの形に移せます。

```
node tools/proposal-to-rule.mjs --number 17 --body-file 本文.md          # 生成物を見る
node tools/proposal-to-rule.mjs --number 17 --body-file 本文.md --write  # rules/ に追記する
```

維持者が提案Issueに`rule-proposal`ラベルを付け直すか、Actions画面から
「提案Issueから下書きPRを作る」を流すと、同じ変換を行った下書きPRができます。
下書きはそのまま入れません。idを内容の分かる名前に変え、正当な用法を
`deny_examples`に足し、必要なら`surface`を`pattern`に置き換えて絞ります。

## severityの基準

- error: その表現がほぼ常に不適切なもの (文脈で正当化される余地が小さい)
- warn: 文脈次第のもの。errorと同様に修正必須 (CI・フックが止める)。組版方針が分かれるものはrcのdisable/overridesで外す前提
- info: 注意喚起。表示はされるが、CI・フックは止めない

## コーパスを追加する

- `corpus/negative/` : 検出されてはいけない正当な日本語です。誤検出の報告はまずここに
  1行追加して再現させてから、パターンを直します。
- `corpus/golden/` : beforeとafterの対です。afterは全ルールで0件になる必要があります。
  変更したら `npm run docs:comparison` で比較表を再生成してください。

## 受け付けないもの

- 社名・製品名・顧客名・非公開URLを含むルールやコーパス
- 特定個人の文体を狙い撃ちするルール
- 負例のない広いパターン (誤検出率を上げるため)

## プリセットの変更

既定の判定を変えたい場合は、ルールのseverityを変えるのではなく、まず
`presets/*.yml` のoverrides / disableで吸収できないかを検討してください。流儀が
分かれる規範 (副詞の漢字・ひらがな等) はルール化せず、docs/design.mdの
未解決課題に記録します。
