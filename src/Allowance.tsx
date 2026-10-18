import { useApp } from "./ctx";
import { B } from "./bi";
import { allowanceLine } from "./allowance";
import { I } from "./ui";

/** Before a long job runs (src/allowance.ts): what it usually uses of the allowance, and the Stop that's always there.
 *  Shown only while a real model works (the sample's answers are scripted and use nothing), and it never waits. */
export function AllowanceNote({ asked }: { asked: string }) {
  const { b, mode, deep, busy, stop } = useApp();
  if (!busy || (mode !== "server" && mode !== "api")) return null;
  const line = allowanceLine(asked, { deep, ownKey: mode === "api" });
  if (!line) return null;
  return (
    <p className="allow-note" role="note">
      <I.spark /><span>{b(line)}</span>
      <button type="button" className="lnk" onClick={stop}><I.stopSq />{b(B("Stop", "停止"))}</button>
    </p>
  );
}
