/* The website's one React island: the Beam (border-beam) riding the edge of the "Get my plan" sheet when it opens from
   the hero. The landing page is plain HTML, so this is bundled on its own (npm run beam -> site/beam.js) and only loaded
   the first time someone clicks Get my plan. The existing sheet node is moved inside the beam, never re-rendered, so
   the form's own script keeps working on the same elements. */
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { BorderBeam } from "border-beam";

declare global { interface Window { placettaBeam?: (on: boolean) => void } }

const modal = document.getElementById("modal"), sheet = document.getElementById("sheet");
if (modal && sheet) {
  const host = document.createElement("div");
  host.className = "beam-host";
  modal.insertBefore(host, sheet);
  const root = createRoot(host);
  const slot = (el: HTMLDivElement | null) => { if (el && sheet.parentElement !== el) el.appendChild(sheet); };
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const radius = () => (matchMedia("(max-width:640px)").matches ? 20 : 18);

  window.placettaBeam = (on: boolean) => {
    root.render(
      <BorderBeam size="md" colorVariant="ocean" theme="light" staticColors strength={0.7} duration={3.2}
        borderRadius={radius()} active={on && !still.matches} className={"beam-ride" + (on ? "" : " beam-off")}
        style={{ "--beam-stroke-opacity": 9, "--beam-inner-opacity": 2.4, "--beam-bloom-opacity": 4 } as CSSProperties}>
        <div className="beam-slot" ref={slot} />
      </BorderBeam>,
    );
  };
  window.placettaBeam(false);
}
