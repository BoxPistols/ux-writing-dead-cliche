# 実施前・実施後の比較

この表は `corpus/golden/rewrite.jsonl` から `tools/render-comparison.mjs` が生成します。手で編集しないでください。
実施前の列はチェッカーの検出対象になるためコード書式で示します。実施後の列は地の文のままで、
全ルールに対して検出 0 件であることを CI が保証しています。

| 実施前 | 検出されるルール | 実施後 |
| --- | --- | --- |
| `この文書はチームの羅針盤です。まさに開発の心臓部と言える内容を解説していきます。` | metaphor/compass<br>overstatement/masani<br>metaphor/heart<br>syntax-pattern/opener | この文書は、実装方針に迷ったときの判断基準を定めます。対象は認証と決済の 2 モジュールです。 |
| `データは新しい石油であり、活用の可能性は無限に広がっています。まずは小さく始めてみましょう。` | metaphor/blood-oil<br>closing/mugen<br>closing/mashou | データ活用は、まず問い合わせログの分類から着手します。初月の目標は誤分類率の計測です。 |
| `本機能は単なる検索ではなく、体験のパラダイムシフトにほかなりません。` | syntax-pattern/not-just<br>empty-abstraction/paradigm<br>overstatement/nothing-but | 本機能は、検索結果を閲覧履歴で並べ替えます。従来の全文検索とはこの点が異なります。 |
| `極めて重要なのはユーザー理解です。それはUXの本質と言えるでしょう。` | overstatement/kiwamete<br>empty-abstraction/essence<br>translationese/to-ieru | ユーザーの誤操作を週次で観察し、画面ごとの離脱率と合わせて仕様を見直します。 |
| `保存が失敗しました。不正な値が入力されています。` | ux-microcopy/ga-shippai<br>ux-microcopy/fusei | 保存に失敗しました。日付の形式が正しくありません。2026/01/31 の形式で入力してください。 |
| `エンジニア必見の内容です。今後の動向から目が離せません。` | overstatement/must-see<br>closing/me-ga-hanasenai | 対象読者は、初めて CI を構築するエンジニアです。次回は権限設計を扱います。 |
| `両部門の連携が成功の鍵を握っており、シナジーの創出が求められています。` | metaphor/key<br>empty-abstraction/synergy<br>closing/motomerareteiru | 両部門で顧客リストを共用し、重複訪問をなくします。担当の割り当ては月次で見直します。 |
| `この経験を昇華させ、唯一無二のプロダクトへと進化していきましょう。` | empty-abstraction/sublimation<br>overstatement/unique<br>closing/mashou | 障害対応で得た再発防止策 3 件を、次期版の設計要件に加えます。 |
| `入力して下さい。完了後、「保存しました。」と表示されます。` | ux-microcopy/shite-kudasai<br>ux-microcopy/kagikakko-kuten | 入力してください。完了後、「保存しました」と表示されます。 |
| `私たちは、革命的なアプローチで業界に新たな物語を紡いでいきます。` | translationese/watashitachi<br>overstatement/revolutionary<br>empty-abstraction/story | 当社は 2027 年までに、審査工程の自動化率を 8 割にします。 |
| `継続的に改善していくことが重要です。今後の展開に期待が高まります。` | translationese/teiku-juyou<br>closing/kitai | 毎週金曜に計測結果を確認し、悪化した指標を翌週の改善対象にします。次の対象は検索速度です。 |
| `認証基盤は全サービスの屋台骨であり、開発と運用は車の両輪です。` | metaphor/backbone<br>metaphor/two-wheels | 認証基盤が止まると全サービスでログインできなくなります。開発は仕様を、運用は監視基準を持ち、相互レビューは月次で行います。 |
| `このたびの新機能は、単なる検索ではなく、ユーザー体験のパラダイムシフトにほかなりません。まさに我々のDNAである技術力を、圧倒的なスピードで形にしました。この機能が今後の事業の羅針盤となることを確信しています。まずは試してみましょう！！` | syntax-pattern/not-just<br>empty-abstraction/paradigm<br>overstatement/nothing-but<br>overstatement/masani<br>metaphor/dna<br>overstatement/overwhelming<br>metaphor/compass<br>overstatement/conviction<br>closing/mashou<br>formatting/double-exclamation | このたびの新機能は、検索結果を閲覧履歴で並べ替えます。従来の全文検索との違いはこの 1 点です。開発は 3 名で 3 か月かけ、設計判断は ADR として残しました。試用は設定画面の「実験的機能」から有効化できます。 |
