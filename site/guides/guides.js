/* Filters the guides hub as you type. */
(() => {
  const q = document.getElementById("q"), count = document.getElementById("count");
  if (!q) return;
  const items = [...document.querySelectorAll("[data-f]")];
  const zh = document.documentElement.lang.startsWith("zh");
  const run = () => {
    const v = q.value.trim().toLowerCase(); let n = 0;
    for (const el of items) { const on = !v || el.dataset.f.includes(v); el.hidden = !on; if (on) n++; }
    document.querySelectorAll(".country").forEach(c => { c.hidden = !c.querySelector(".city:not([hidden])"); });
    count.textContent = v ? (zh ? "找到 " + n + " 项" : n + (n === 1 ? " match" : " matches")) : "";
  };
  q.addEventListener("input", run);
})();
