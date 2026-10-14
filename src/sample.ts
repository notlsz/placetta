import { B, SAMPLE, type Application, type Workspace } from "./model";
import { formById } from "./forms/registry";

/* The demo workspace's applications are the real ones a tea shop in San José files, so every agency fact on them
   comes from the official forms library (src/forms/registry.ts and local-us.ts): the form, how long the agency says it
   takes, its fee or how the agency sets it, when it renews, and the agency's own page. Only the shop's own answers
   (name, address, sign size) are the demo's. */
const OFFICIAL: Record<string, string> = {
  ein: "irs-ss4", seller: "ca-cdtfa", edd: "ca-edd-de1", plancheck: "scc-plan-check", pto: "scc-health-permit",
  btc: "sj-business-tax", building: "sj-building-ti", sign: "sj-sign",
};

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

function official(a: Application): Application {
  const id = OFFICIAL[a.id], off = id ? formById(id) : undefined;
  if (!off) return a;
  return {
    ...a,
    official: off.id,
    agency: off.agency,
    form: B(off.form, off.form),
    est: off.takes ?? B("The agency doesn't publish a processing time. Placetta tracks it from the day it's filed.", "机构未公布办理时间。快哉从提交之日起跟踪。"),
    fees: off.fee != null ? [{ label: B("Agency fee", "机构费用"), amount: off.fee }] : [{ label: B("Agency fee", "机构费用"), amount: 0, tbd: true }],
    feeNote: off.feeNote,
    renews: off.renews,
    source: { label: host(off.info), url: off.info },
  };
}

export const SAMPLE_WS: Workspace = { ...SAMPLE, apps: SAMPLE.apps.map(official) };
