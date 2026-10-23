// Inspections, from the monitor's side (src/inspections/booking.ts holds the bookings in the workspace):
//   a booking the team must make by phone or email becomes a team task with the call script, once;
//   a booked inspection's reminders (deadlineUpdates, 7, 3 and 1 days before and on the day) carry the prep;
//   the day after a booked inspection with no result, the owner is asked how it went, once.
type Bi = { en: string; zh: string };
export type Booking = { id: string; store: string; inspection: string; name: Bi; agency: Bi; method: string; status: string; slot?: string; script?: string; deadline?: string; result?: unknown };
export type InspectionWork = {
  tasks: { workspace_id: string; title: string; detail: Record<string, unknown>; dedupe: string }[];
  updates: { workspace_id: string; kind: "deadline"; title: Bi; body?: Bi; dedupe: string }[];
};

/** The prep line every inspection reminder carries. */
export const PREP: Bi = {
  en: "Before it: ask Odelia for a mock inspection. She walks the inspector's own checklist with you one item at a time (a photo where it helps) and turns each gap into a fix.",
  zh: "检查前：让 Odelia 带您做一次模拟检查。她会按检查员的清单逐项和您核对（必要时拍照），并把每个问题变成待办整改。",
};

export function inspectionWork(ws: string, state: unknown, today: string): InspectionWork {
  const out: InspectionWork = { tasks: [], updates: [] };
  const bookings = (((state ?? {}) as { bookings?: unknown }).bookings ?? []) as Booking[];
  for (const b of Array.isArray(bookings) ? bookings : []) {
    if (!b || typeof b.id !== "string") continue;
    if (b.status === "with_team") {
      out.tasks.push({ workspace_id: ws, dedupe: `book:${ws}:${b.id}:${b.slot ?? ""}`.slice(0, 300),
        title: `Book the ${b.name?.en ?? "inspection"} with ${b.agency?.en ?? "the agency"} (${b.method}), preferred ${b.slot ?? "the first opening"}. Record the confirmed time with Odelia (inspection_booking confirm).`,
        detail: { booking: b.id, method: b.method, script: b.script ?? null } });
    }
    const date = /^\d{4}-\d{2}-\d{2}/.exec(b.slot ?? "")?.[0];
    if (b.status === "booked" && date && date < today && !b.result) {
      out.updates.push({ workspace_id: ws, kind: "deadline", dedupe: `insp-result:${b.id}:${date}`,
        title: { en: `How did the ${b.name.en} go?`, zh: `${b.name.zh}结果如何？` },
        body: { en: "Tell Odelia: passed, failed (send a photo of the correction notice) or a re-inspection booked. Failed items become fixes, and she books the re-inspection.", zh: "请告诉 Odelia：通过、未通过（请拍下整改通知）或已约复检。未通过的项目会变成整改待办，她会预约复检。" } });
    }
  }
  return out;
}
