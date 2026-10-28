// node scripts/stripe-outcome-prices.mjs [--create]
// Outcome pricing (the founder's decision of 2026-10-28, docs/PRICING.md): the Stripe prices it charges from.
// By default it only prints what the founder creates in Stripe (live), and never calls Stripe. With --create and a
// test-mode key (STRIPE_SECRET_KEY=sk_test_...) it looks each price up by lookup key and creates the missing ones in
// test mode. It refuses any other key: live prices are created by the founder, by hand.
const PRICES = [
  { env: "STRIPE_PRICE_LICENSE_ON_APPROVAL", lookup: "placetta_license_on_approval", name: "Placetta license, charged on the agency's decision", cents: 14900, isNew: true },
  { env: "STRIPE_PRICE_LICENSE_COMPLEX", lookup: "placetta_license_complex", name: "Placetta complex license, filed", cents: 99900, isNew: false },
];
const usd = (c) => "$" + (c / 100).toFixed(2);

console.log("Outcome pricing: the Stripe prices it charges from (USD, one time, standard pricing).\n");
for (const p of PRICES) console.log(`${p.isNew ? "CREATE" : "REUSE "}  ${p.lookup.padEnd(30)} ${usd(p.cents).padStart(8)}  "${p.name}"  (env ${p.env}, optional)`);
console.log(`
In Stripe (live), the founder:
  1. Creates the product "Placetta license, charged on the agency's decision" with a one-time USD price of $149.00
     and the lookup key placetta_license_on_approval.
  2. Keeps the existing $999.00 complex license price (placetta_license_complex) as it is.
  3. Archives the old $299.00 price (placetta_license) once no Checkout for it is open. The code never charges it again.
Staff's Billing health (Team view, Check now) then shows both as OK. No new webhook event is needed: the charges are
invoices (invoice.paid, invoice.payment_failed) and the card is saved by checkout.session.completed in setup mode.`);

if (process.argv.includes("--create")) {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) { console.error("\n--create runs only with a test-mode key (sk_test_). Live prices are created by the founder."); process.exit(1); }
  const call = async (method, path, params) => {
    const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2025-03-31.basil", ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, body: params ? new URLSearchParams(params) : undefined });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message ?? `Stripe ${r.status}`);
    return d;
  };
  for (const p of PRICES) {
    const found = await call("GET", `prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(p.lookup)}`);
    const have = found?.data?.[0];
    if (have) { console.log(`test mode: ${p.lookup} exists (${have.id}, ${usd(have.unit_amount)})${have.unit_amount === p.cents ? "" : "  WRONG AMOUNT"}`); continue; }
    const made = await call("POST", "prices", { currency: "usd", unit_amount: String(p.cents), lookup_key: p.lookup, "product_data[name]": p.name }, undefined);
    console.log(`test mode: created ${p.lookup} ${made.id}`);
  }
}
