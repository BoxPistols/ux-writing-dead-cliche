// manualルール (機械検出せず人手に回しているもの) を、型付き判定のAPIで見る。
//
// なぜ別ファイルか: 検出の本体は辞書と正規表現のままにする。このツールは
// オフラインで動き、依存を増やさないことを前提に配っているので、ここは
// --ai を付けたときだけ読み込まれる任意の追加とする。
//
// なぜLLMではないか: TypeSafe AIのJevは文章を生成しない。noul (はい/いいえの確率) と
// choice (選択肢から1つ) だけを返すので、出力の形が保証され、辞書のルールIDと
// そのまま対応付けられる。しきい値もこちら側が持つ。
//
// 送るもの: 検査対象のテキストと、辞書に書かれた観点・直し方・例だけ。
// ファイル名やパスは送らない。
//
// 実測 (2026-09-20, jev-1.13.0): 辞書のmanual 11ルールに対し、辞書自身が持つ
// 悪い例11件・良い例11件と、corpus/negative/legitimate-usage.jsonl の81件で測った。
// しきい値0.9で検出9/11・誤検出0件。2回続けて同じ結果で、判定の揺れは0.05未満だった。
// 種別 (UIの文言か本文か) を先に判定し、UI向けのルールはUIの文言のときだけ見る形に
// したことで、誤検出は8件から0件に減った。

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

/** 既定のしきい値。実測で誤検出0件だった値 */
export const DEFAULT_THRESHOLD = 0.9;

/** UIの文言にだけ当てるルール。本文に当てると誤検出になる */
const UI_PREFIX = "ux-microcopy/";

/** 質問名はAPIのキーになるので、ルールIDから英数字だけを残す */
function questionId(ruleId) {
  return ruleId.replace(/[^a-z]/g, "_");
}

export function buildQuestions(rules) {
  const questions = {
    kind: {
      type: "choice",
      instructions: "この文章の種類",
      criteria: {
        ui: "画面に出る文言。ボタン、ラベル、プレースホルダー、エラー、ダイアログ、空状態",
        prose: "読み物の本文。説明や記事の一節",
        other: "上のどちらでもない",
      },
    },
  };
  for (const rule of rules) {
    questions[questionId(rule.id)] = {
      type: "noul",
      instructions: {
        観点: rule.why,
        直し方: rule.ask,
        当てはまる例: rule.examples?.bad ?? [],
        当てはまらない例: rule.examples?.good ?? [],
        判定: "検査する文章そのものが、この観点の問題を含んでいる",
      },
    };
  }
  return questions;
}

/** 応答を、check() が返すのと同じ形の指摘に変える */
export function toViolations(answers, rules, threshold) {
  const kind = answers.kind?.type === "choice" ? answers.kind.choice : "other";
  const out = [];
  for (const rule of rules) {
    const answer = answers[questionId(rule.id)];
    if (!answer || answer.type !== "noul") continue;
    // UI向けのルールは、UIの文言と判定されたときだけ見る
    if (rule.id.startsWith(UI_PREFIX) && kind !== "ui") continue;
    if (answer.noul < threshold) continue;
    out.push({
      ruleId: rule.id,
      severity: rule.severity === "manual" ? "warn" : rule.severity,
      why: rule.why,
      ask: rule.ask,
      matched: `${Math.round(answer.noul * 100)}%`,
      line: 1,
      col: 1,
      source: "ai",
    });
  }
  return out;
}

export class ManualJudgeError extends Error {}

/**
 * manualルールをAPIで判定する。失敗しても呼び出し側は止めない想定で、
 * ここでは投げるだけにして、握りつぶす判断は呼び出し側に置く。
 */
export async function judgeManualRules(text, rules, options = {}) {
  const apiKey = options.apiKey ?? process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    throw new ManualJudgeError(
      "TYPESAFE_API_KEY が設定されていません。--ai を外すか、キーを設定してください",
    );
  }
  const manual = rules.filter((r) => r.manual);
  if (manual.length === 0) return [];
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  // 1リクエストに全ルールを入れる。質問を増やしても応答時間はほとんど変わらない
  const body = {
    state: { 検査する文章: text },
    model: options.model ?? MODEL,
    questions: buildQuestions(manual),
  };
  const res = await fetch(options.endpoint ?? ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!res.ok) {
    throw new ManualJudgeError(`APIが ${res.status} を返しました`);
  }
  const json = await res.json();
  if (!json?.answers) throw new ManualJudgeError("応答に answers がありません");
  return toViolations(json.answers, manual, threshold);
}
