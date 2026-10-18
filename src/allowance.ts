import { B, type Bi } from "./bi";

/* ------------------------------------------------------------------ *
 * What a long task will use of Odelia's allowance, said before it
 * starts (Devin's credits are only counted afterwards). The figures are
 * the per-role averages in docs/AI_COSTS.md (Anthropic prices, the
 * dearer route, so the estimate errs high) and the round cap the server
 * enforces (src/serverRun.ts: 16 rounds a shift, up to 4 shifts on a job,
 * and the per-task ceiling AI_TASK_LIMIT_USD of $1.50). It's a budget,
 * not a meter, and it never stops anything: Stop does.
 * ------------------------------------------------------------------ */

/** docs/AI_COSTS.md, "What a typical first-store job costs" (Anthropic only). */
export const AVG = {
  firstRound: 0.04,      // plan, round 1, writing the prompt cache
  round: 0.0127,         // plan, each later round ($0.14 over 11 rounds)
  research: 0.10,        // about 4 searches and 3 fetched agency pages
  extract: 0.01,         // reading one document
  review: 0.009,         // the independent reviewer, once
  distill: 0.007,        // turning the job into lessons
};
export const ROUNDS = 16, TASK_LIMIT = 1.5;

/** A typical long task (12 rounds, research, a few documents, two reviews), the same job run to the round cap, and the
 *  ceiling no task passes. */
export function estimate(o: { rounds?: number; docs?: number; research?: boolean } = {}): { typical: number; atCap: number; ceiling: number } {
  const rounds = o.rounds ?? 12, docs = o.docs ?? 4;
  const job = (n: number) => AVG.firstRound + (n - 1) * AVG.round + (o.research === false ? 0 : AVG.research) + docs * AVG.extract + 2 * AVG.review + AVG.distill;
  const cents = (n: number) => Math.round(n * 100) / 100;
  return { typical: cents(job(Math.min(rounds, ROUNDS))), atCap: cents(job(ROUNDS)), ceiling: TASK_LIMIT };
}

/** A request that sets Odelia on a long job (mapping, preparing, filing, researching, renewing, getting ready), as
 *  opposed to a question she answers in a round or two. */
export const isLongTask = (text: string, deep = false) => deep
  || /\b(map|prepare|fill|file|research|renew|compare|every (license|permit)|all (the )?(licenses|permits|forms)|get .* ready|inspection|open(ing)? (a|our|the|my) (new )?store)\b|梳理|准备|填写|提交|研究|续办|续期|比较|全部许可|所有许可|做好.*准备|开新店/i.test(text);

/** "This usually uses about $0.35 of your Odelia allowance, at most $1.50." */
export function allowanceLine(text: string, o: { deep?: boolean; ownKey?: boolean } = {}): Bi | null {
  if (!isLongTask(text, o.deep)) return null;
  const e = estimate({ rounds: o.deep ? ROUNDS : 12 }), $ = (n: number) => `$${n.toFixed(2)}`;
  return o.ownKey
    ? B(`A job like this usually uses about ${$(e.typical)} on your API key, about ${$(e.atCap)} if it runs all ${ROUNDS} rounds.`, `这类工作通常消耗您的 API 密钥约 ${$(e.typical)}，用满 ${ROUNDS} 轮约 ${$(e.atCap)}。`)
    : B(`A job like this usually uses about ${$(e.typical)} of your Odelia allowance, about ${$(e.atCap)} if it runs all ${ROUNDS} rounds, and never more than ${$(e.ceiling)}.`, `这类工作通常使用约 ${$(e.typical)} 的 Odelia 额度，用满 ${ROUNDS} 轮约 ${$(e.atCap)}，最多不超过 ${$(e.ceiling)}。`);
}
