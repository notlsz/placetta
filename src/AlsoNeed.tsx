// Beyond the permits to open, on Home: what the plan says a business may also need (src/plan/also.ts), in the groups
// the founder set ("You may also need these", "Because you manufacture, your products may also need labels", the store
// and staff, what an agency decides), each line with its numbered source: the agency, its link, the page's own words and
// the day they were read, or that it isn't confirmed yet. Written at sign-up into the first plan (src/plan/start.ts).
import type { AlsoLine, FirstPlan } from "./model";
import { B, type Bi } from "./bi";

const HEAD: Record<AlsoLine["group"], Bi> = {
  also: B("You may also need these", "您可能还需要办理这些"),
  labels: B("Because you sell products, they may also need labels", "因为您销售商品，产品可能还需要这些标签"),
  workplace: B("Your store and staff also need these", "门店和员工还需要做到这些"),
  decides: B("An agency or a rule decides these", "以下事项由机构或规则决定"),
};
const LABELS_WHY: Record<NonNullable<FirstPlan["why"]>, Bi> = {
  manufactures: B("Because you manufacture, your products may also need labels", "因为您自己生产，产品可能还需要这些标签"),
  imports: B("Because you import, your products may also need labels", "因为您进口商品，产品可能还需要这些标签"),
  sells: HEAD.labels,
};
const ORDER: AlsoLine["group"][] = ["also", "labels", "workplace", "decides"];

export function AlsoNeed({ fp, zh }: { fp: FirstPlan; zh: boolean }) {
  const lines = fp.also ?? [];
  if (!lines.length) return null;
  const b = (x: Bi) => (zh ? x.zh : x.en);
  // one number per distinct source, in the order the lines cite them
  const notes: AlsoLine["sources"] = [];
  const num = (s: AlsoLine["sources"][number]) => { let k = notes.findIndex(n => n.url === s.url && n.quote === s.quote); if (k < 0) { notes.push(s); k = notes.length - 1; } return k + 1; };
  const groups = ORDER.map(g => ({ g, rows: lines.filter(l => l.group === g).map(l => ({ l, ns: l.sources.map(num) })) })).filter(x => x.rows.length);
  return (
    <section className="sec hm-also" aria-labelledby="hm-also-h">
      <h2 id="hm-also-h" className="sr">{zh ? "开业许可之外" : "Beyond the permits to open"}</h2>
      {groups.map(({ g, rows }) => (
        <div key={g} className="also-g">
          <h3>{b(g === "labels" ? LABELS_WHY[fp.why ?? "sells"] : HEAD[g])}</h3>
          <ul className="also-list">
            {rows.map(({ l, ns }) => (
              <li key={l.id} className={l.verified ? "" : "unv"}>
                <span>{b(l.line)}</span>
                {ns.map(n => <a key={n} className="also-fn" href={`#also-src-${n}`} aria-label={zh ? `来源 ${n}` : `Source ${n}`}>{n}</a>)}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ol className="also-src" aria-label={zh ? "来源" : "Sources"}>
        {notes.map((s, k) => (
          <li key={k} id={`also-src-${k + 1}`}>
            <span className="also-n">{k + 1}</span>
            <span>
              {b(s.agency)}{zh ? "：" : ": "}<a href={s.url} target="_blank" rel="noreferrer">{s.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")}</a>
              {s.quote ? <>{zh ? "，原文“" : ', "'}{s.quote}{zh ? "”" : '"'}{zh ? `（${s.read} 读取）` : ` (read ${s.read})`}</> : <>{zh ? "。尚未在官方页面上确认，Odelia 会先向该机构核实。" : ". Not confirmed on an official page yet; Odelia checks with them first."}</>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
