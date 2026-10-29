/* land9 (Oct 29): sections that left the home page for /more.html. An old link to one of them (/#agencies) lands there */
(() => { const h = location.hash.slice(1), MOVED = ["studies", "csFold", "numbers", "calcFold", "plans", "prMore", "tiers", "franchise", "trust", "security", "cost", "industries", "together", "agencies", "cn", "experts"];
  if (MOVED.includes(h) && !document.getElementById(h)) location.replace("/more.html#" + h); })();
(() => {
/* ============ PROOF: the switchboard for every claim about customers, backers, experts and results ============
   Each flag stays false until the claim behind it is substantiated in writing and that evidence is kept on file.
   Anything that names a real person or brand (a quote, a name, a photo, a logo, a case study) also needs written
   permission from that person or brand to use their name, quote and logo, kept on file with the evidence.
   A quote from a friend, a relative, an investor or the founder's own company must also say so next to the quote.
   While a flag is false the page shows the safe version: no names, no logos, no numbers we cannot prove.
   The wording each flag unlocks is in CLAIMS, right after T. */
const PROOF = {
  customerNames: true,  // hero brand marquee, named case studies, "Customers" in the nav. Evidence: signed customer list, and each brand's written OK to use its name and logo
  testimonials: true,   // customer quotes with names, photos and logos. Evidence: each person's signed release (quote, name, photo, employer logo), proof they are a real customer, any connection disclosed in `mc`
  backersLogos: true,   // company logos and named employers in the hero line and on the backers wall. Evidence: each investor's written OK to name their employer, and each company's permission for its logo
  expertLogos: true,    // company logos beside our advisors' former employers. Evidence: each advisor's CV or written confirmation, and each company's permission for its logo
  stats31000: true,     // "31,000+ businesses since 2016", "3+ a day", "7+ a day" and the busiest-markets map legend. Evidence: records counting each business served, by date and market
  freightVolume: true,  // "3,000+ containers a year" on the freight map. Evidence: shipping records for the last 12 months
  chagee: true,         // Jackie's (Ferrari) quote and "5 months saved". Evidence: CHAGEE's written permission, and the filing and approval dates that show the 5 months
  stanford: true,       // Stefan's quote, "9 filings" and "approved in 4 months". Evidence: his signed release and the approval records
  wakimasu: true,       // Wakimasu named as a case study with its logo. Evidence: Wakimasu's written permission and the engagement on file
  monthsSooner: true    // "Open months sooner" and "Brands open sooner". Evidence: before and after timelines from real openings, enough to show it is typical
};
// counted from the agency list on this page (AGG), so the number is true by construction
function agCount(){ try { return AGG.reduce((a, g) => a + g[1].length, 0); } catch(e){ return 0; } }
function agRegions(){ try { return AGG.length; } catch(e){ return 0; } }

/* ============ copy ============ */
const T = {
en:{
 "nav.how":"How it works", "nav.faq":"FAQ","nav.login":"Log in","nav.app":"Open app",
 "q.goT":"Your plan is ready to build.","q.goP":"Confirm {c} and Placetta maps every license, permit and registration for {m}, with fees and timelines, in a few minutes.","q.go":"Build my plan","q.goN":"Free. Nothing is filed or paid without your approval.",
 "cta.plan":"Get my plan",
 "tm.cta":"Put Odelia to work on your stores","tm.m5":"The business tax certificate renews in 30 days. The renewal is drafted.","tm.m4":"The county asked for a revised floor plan. I let the construction manager know.","tm.m3":"Filed with Santa Clara County. The receipt is saved to your drive.","tm.m2":"The health permit packet for San José is ready. Approve it and I'll hand it to our team to file.","tm.m1":"Your week ahead: 3 filings due across 2 stores. Each one is ready for review.","tm.d5":"Fri","tm.d4":"Thu","tm.d3":"Wed","tm.d2":"Tue","tm.d1":"Mon","tm.wks":"Sample week","tm.wk":"A week with Odelia","tm.v8":"Files anything you have not approved","tm.k8":"Never","tm.v7":"Approvals, signatures, agency fees and ID checks","tm.k7":"Asks you for","tm.v6":"Every license each store needs, in order, filed on time and renewed before it lapses","tm.k6":"Owns","tm.v5":"Gmail, Outlook, Slack, Google Calendar, Google Drive","tm.k5":"Works in","tm.v4":"English and Chinese","tm.k4":"Languages","tm.v3":"Always on, every time zone","tm.k3":"Hours","tm.v2":"You","tm.k2":"Reports to","tm.v1":"Permits and licenses manager","tm.k1":"Role","tm.jdt":"Odelia","tm.jd":"Role card","tm.now":"Working now: San José health permit packet","tm.r4":"Odelia","tm.r4s":"Permits and licenses","tm.r3s":"Build-out and inspections","tm.r3":"Construction manager","tm.r2s":"Sites and leases","tm.r2":"Real estate lead","tm.r1s":"Head of US expansion","tm.a1":"Y","tm.a2":"R","tm.a3":"C","tm.r1":"You","tm.sample":"Sample team","tm.team":"US expansion team","tm.sub":"Add Odelia, Placetta's AI agent, to your expansion team like any other hire. She owns permits and licenses for every store, works in the tools your team already uses, and comes to you only for what needs a person.","tm.c1h":"She joins your team","tm.c1p":"Add Odelia like any other hire. She has a seat on your expansion team and a status you can see.","tm.on":"Online","tm.t1":"Odelia joined your team","tm.t1s":"US expansion, permits and licenses","tm.c2h":"She knows her job","tm.c2p":"One role, owned end to end: every license, filed on time and renewed before it lapses.","tm.v3s":"Always on","tm.gcal":"Google Calendar","tm.gdrive":"Google Drive","tm.t2":"Never files without your approval","tm.t2s":"You sign, pay agency fees and pass ID checks","tm.c3h":"She reports in","tm.c3p":"Updates arrive where your team already talks: Slack, email and your calendar.","tm.you":"Approved. Go ahead.","tm.t3":"Renewal drafted","tm.t3s":"Business tax certificate, 30 days before it lapses","tm.h":"Your newest teammate.","hero.badge":"Licenses and permits in 92 cities worldwide",
 "brands.l":"Built for",
 "hero.sample":"See a sample plan","hero.try":"Put Odelia to work","hero.demo":"Book a demo","how.try":"Try it on your store","aria.proof":"At a glance","pf.s3":"US states covered, plus 170+ countries", "foot.disc2":"Placetta is not affiliated with any government agency. Product screens and example plans use sample data. Customer results describe their own openings; your timeline depends on your city, your build-out and each agency.", "price.m.note":"Illustrative calculation, not a quote or a promise. Your rent, timeline and agency fees will differ.", "xp.note":"Our advisors previously worked at these organizations. The organizations are not affiliated with Placetta and do not endorse it.", "bk.note":"Investors invested personally. Their former and current employers are not affiliated with Placetta and do not endorse it.", "pf.appr":"filings sent without your approval", "pf.fm":"official forms, each checked word for word against the agency\u2019s own page. Last read {d}", "pf.lang":"languages for every plan and dashboard: English and Chinese", "pf.ag":"government agencies we handle, across {r} regions","ag.h":"Watch Odelia work.","ag.p":"She reads your documents, checks each agency's own site, fills the forms and drafts the letters. Every value shows the words it came from, and nothing is filed until you approve.","aria.ag":"Sample agent run","ag.tag":"Sample run","ag.l1":"Read your lease and LLC filing","ag.l2":"Checked Santa Clara County and City of San José requirements","ag.l2s":"Sources: sccgov.org, sanjoseca.gov","ag.l3":"Found 8 requirements, in order, with estimated fees","ag.l4":"Filled the health permit plan check from your lease","ag.l4q":"Tenant: Qinghuan Tea House LLC","ag.l5":"Drafted the landlord consent letter","ag.l5s":"landlord-consent.docx, saved to Documents","ag.l6":"Waiting for your approval before anything is filed",
 "app.proj":"Projected opening", "app.date":"Mar 2027", "app.est":"Estimate, not a guarantee", "app.risk":"Risk check: review state rules on foreign-owned leases before you sign.", "app.week":"Week", "app.done":"approved",
 "st.q":"Queued", "st.r":"In review", "st.d":"Approved", "st.b":"Blocked",
 "cost.h":"Permits set your opening date.", "cost.big":"3 to 6 mo", "cost.bigs":"The typical permit phase for a new restaurant. One late approval holds up every step that depends on it.",
 "src":"Source",
 "months":"Month",
 "leg.r":"Month of rent, no revenue", "leg.p":"Planned opening", "leg.o":"Opened", "leg.m":"Typical range",
 "itl.f1":"Plan-check packet",
 "map.all":"Full map",
 "tea.tab1":"Tea",
 "map.fr":"Freight", "map.fs":"ways we help move goods into a new market: sea, air, rail and road", "map.subfr":"Beyond permits, we help customers get their goods into each new market, by sea, air, rail and road.",
 "foot.slogan":"Open anywhere. We handle the paperwork.",
 "fl.desc":"Map of the sea, air, rail and road routes our customers' containers travel between Asia, the Americas, Europe, the Middle East, Africa and Australia, including the Arctic route", "fl.msea":"By sea", "fl.mair":"By air", "fl.mrail":"By rail", "fl.mroad":"By road",
 "mon.k1":"changes tracked", "mon.catch":"Odelia caught this for you", "mon.new":"New", "mon.imp.time":"Deadline impact", "mon.imp.cost":"Cost impact", "mon.imp.risk":"Risk to your stores", "mon.done":"Odelia already", "mon.dn1":"Read the source", "mon.dn2":"Matched it to your markets", "mon.dn3":"Added it to your deadlines", "mon.dn4":"Wrote your next step", "mon.catchd":"Flagged when it was published, {n} before the deadline", "mon.catche":"Flagged when it was published, with the next step ready", "mon.mo":"{n} months", "mon.mo1":"1 month", "mon.k2":"need action now", "mon.k3":"days to your next deadline",
 "bel.ex":"Example plan", "case.c5":"Changes the map", "case.c6":"Decides the site",
 "aria.app":"Sample plan",
 "tea.tabs":"Tea houses", "tea.sub":"Five examples", "tea.mk":"Steps", "tea.btn":"Plan my US opening", "tea.src":"", "tea.c1":"Sets the opening date", "tea.c2":"Takes longest", "tea.c3":"Biggest risk", "tea.c4":"Every shipment",
 "app.loc":"Tianxin Village, Wuyi Mountains → first US store in San José, CA",
 "st.note":"$149 a store a month, billed yearly, for tracking, renewals and Odelia. New licenses $149, charged when approved. Turned down because of a mistake on our side, you pay nothing. Your plan preview is free.",
 "q.fine":"Free, ready in minutes. Later: $149 a store a month for tracking, renewals and Odelia, and new licenses $149, charged when approved; nothing if one is turned down because of a mistake on our side.",
 "mon.price":"Included in every monthly plan",
 "price.risk":"Not ready? Your plan preview is free: every license a store needs, with agency fees and timelines.", "price.an.l":"A store waiting on permits", "price.an.v":"$15,000<small class=\"pmper\">a month</small>", "price.an.s":"in rent, with no sales. The example store in \"The cost of waiting\".", "price.an.l2":"Placetta for one location, billed yearly", "price.an.v2":"$5,127", "price.an.s2":"One month of waiting costs more than two restaurant openings, each with a year of Placetta.", "price.m.h":"The math on waiting", "price.m.sub":"One month of waiting costs more than a restaurant opening and a full year with Odelia.", "price.m.bad":"Without Odelia", "price.m.good":"With Odelia", "price.m.s1":"Rent with no sales, for every month a permit runs late. The example store waited 8 months.", "price.m.s2":"A restaurant opening, 9 licenses at $149 and 2 plan reviews at $999 ($3,339), plus its first year on the store plan ($1,788).", "price.m.s3":"Each new license charged when it's approved, filed and tracked to approval", "price.ex.l":"A permit expediter, per restaurant", "price.ex.v":"$2,000 to $7,500", "price.ex.s":"Typical permit expediter fee per restaurant opening, before agency fees. <a href=\"https://permitplace.com/permit-expediter-cost-guide/\" target=\"_blank\" rel=\"noopener\">Source: PermitPlace</a>", "price.ex.l2":"Placetta, a typical restaurant opening", "price.ex.v2":"$3,339", "price.ex.s2":"9 licenses at $149 and 2 building plan reviews at $999, each filed and tracked to approval. From Placetta's own plan for a restaurant in San José. Agency fees at cost.", "price.f1q":"Is the plan preview free?", "price.f1a":"Yes. Every license a store needs, with agency fees and timelines, costs nothing. You pay when you start the store plan or approve a filing.", "price.f2q":"Who pays government fees?", "price.f2a":"You pay each agency directly, through the payment link we send. Estimated fees are in your plan upfront.", "price.f3q":"What if a filing is rejected?", "price.f3a":"Odelia reads the agency's reason, corrects the application with you and resubmits it, and our team steps in when the agency needs a person. Nothing is filed without your approval.", "price.fine":"The store plan includes Odelia, with a monthly allowance per store. Government fees go straight to each agency at cost, and attorneys and customs brokers bill you directly.", "price.hq":"10 or more stores on the plan? Every new license is included. <a href=\"mailto:support@placetta.com?subject=Odelia%20for%20franchisors\" data-track=\"price_scale\">Book a demo</a>", "price.entry":"<b>Not ready for a plan?</b> Your plan preview is free: every license for any market, ready in minutes.",
 "bel.ya":"Approval", "bel.yf":"Filing", "bel.yr":"Rule", "bel.sa":"Granted by the agency", "bel.sf":"Odelia prepares and files it", "bel.sr":"Odelia checks you meet it", "bel.cases":"Example plans", "bel.crit2":"Sets the payout cycle", "bel.tag":"Case study", "bel.tabs":"Markets", "bel.crit":"Sets the launch date", "bel.src":"Source: ", "bel.srcs":"Sources: ", "bel.btn":"Plan my next markets",
 "q.doneT":"Your plan is ready.", "q.doneP":"Your {m} plan is generated instantly and sent to {c}.", "q.n1":"Your plan is built instantly from your answers for {m}.", "q.n2":"It lists every requirement, in order, with timelines and fees.",
 "mon.allm":"All markets", "mon.sample":"See a sample alert", "mon.none2":"No deadlines in this market in the next 6 months.", "mon.al.to":"To: your team", "mon.al.subj":"Action needed: {t}", "mon.al.note":"Sample alert built from a real, sourced rule change.", "mon.body3":"Every rule change in your markets, with what it means for your stores and what to do next.", "mon.app":"Placetta Monitor",
 "mbar.t":"$149 a store a month, new licenses $149 when approved, plan preview free",
 "cta.free":"Get your free plan",
 "mon.l.aff2":"Affects", "mon.due":"Deadline in {n} days", "mon.due1":"Deadline in 1 day", "mon.duet":"Deadline today", "mon.dayn":"days left", "mon.day1":"day left",
 "ts.tabs":"Stories",
 "add.btn":"New plan", "add.c1":"Company", "add.c2":"Target market", "add.c3":"Target opening", "add.c4":"Status", "add.h":"Tell us where you're opening.<br>Get your plan in minutes.", "add.mapping":"Mapping…", "add.ready":"Plan ready", "add.r1c":"Lantern Noodle Bar", "add.r1m":"Houston, TX", "add.r1d":"Jun 2027", "add.r2c":"Copperleaf Coffee", "add.r2m":"Seattle, WA", "add.r2d":"Sep 2027", "add.r3c":"Golden Ox Hot Pot", "add.r3m":"Flushing, NY", "add.r3d":"Jan 2027", "add.r4c":"Jade Bun Bakery", "add.r4m":"Irvine, CA", "add.r4d":"Opened Aug 2026", "add.s1":"Filing", "add.s2":"In review", "add.s3":"Approved", "add.s4":"Open", "add.tab":"Plans", "cmp.1h":"Consultants", "cmp.1n":"Weeks", "cmp.2n":"Months", "cmp.3n":"Minutes", "cmp.1p":"A report, weeks later, billed by the hour.", "cmp.2h":"Doing it yourself", "cmp.2p":"Months of calls, forms and rejected applications.", "cmp.3p":"A plan in minutes, filing handled, one dashboard. The plan preview is free.", "cmp.h":"Why not a law firm or consultant?", "cn.btn":"Get my plan", "cn.t":"Lease risk flagged for both teams","cn.ts":"Odelia, before the lease is signed","cn.lm1":"Shenzhen","cn.lm2":"New York","fr.r1m":"You","fr.r1r":"Head of franchising","fr.r1l":"All 7 locations","fr.r1s":"Admin","fr.r2m":"Franchisee, Flushing NY","fr.r2r":"Franchise owner","fr.r2l":"3 locations","fr.r2s":"All current","fr.r3m":"Franchisee, Irvine CA","fr.r3r":"Franchise owner","fr.r3l":"1 location","fr.r3s":"Renews in 21 days","fr.r4m":"Franchisee, Houston TX","fr.r4r":"Franchise owner","fr.r4l":"2 locations","fr.r4s":"2 certificates due","fr.r5m":"Franchisee, San José CA","fr.r5r":"Franchise owner","fr.r5l":"1 opening","fr.r5s":"9 of 12 permits","cn.h":"Headquarters in Shenzhen. Permits in New York.", "cn.p":"Your team in Shanghai or Shenzhen decides; your team in New York signs the lease. Rules change from state to state, and some states limit leases and property ownership for foreign-owned companies. Both teams see the same dashboard, in Chinese or English, with those risks flagged before anyone signs.", "cn.q":"Su Shi, Song dynasty poet", "cn.s":"Wherever the heart is at ease, that is home.", "cn.sub":"Free plan preview. New licenses $149, charged when approved", "dash.a":"Shenzhen HQ", "dash.at":"9:00 PM", "dash.b":"New York team", "dash.bt":"9:00 AM", "dash.risk":"Risk flag: review state rules on foreign-owned leases before signing", "diff.1b":"Minutes", "diff.1s":"From target market to a full plan", "diff.after":"after", "diff.before":"before", "diff.2b":"6 → 1", "diff.2s":"Offices you chase, down to one team that handles them all", "diff.h":"The difference Placetta makes", "diff.team":"Your team", "diff.with":"with", "itl.a1":"Health permit packet for Santa Clara County is ready. Submit it?", "itl.a2":"Submitted. I'll book the inspection when the county opens a slot.", "itl.b1":"The sign permit needs your landlord's authorization. Send the request to them?", "itl.b2":"Got it. Landlord requests go to you first, at every location.", "itl.f2":"Landlord letter", "itl.h":"Odelia asks before every filing, and remembers your answer", "itl.m2":"1-page doc", "itl.saved":"Saved to your playbook", "itl.u1":"Yes, submit it 👍", "itl.u2":"No, send landlord requests to me first. I'll forward them.", "qr":"QR", "trust.1":"Partner attorneys in 170+ countries", "trust.2":"Local permit expediters", "trust.1s":"Need a lawyer? We brief one and handle the rest. You just sign.", "trust.2s":"In-person filings, pick-ups and inspections, handled in the city where you open.", "trust.ap":"Your approval, every time", "trust.3s":"Nothing is filed until you approve it, and every value shows the source it came from.", "trust.3":"English and Chinese", "trust.h":"Built for trust", "wt.l":"Work together", "wt.qr":"WeChat QR code goes here before launch", "wt.r":"from day one", "you.init":"HP",
 
 "xp.h":"Our experts previously worked at:", "xp.all":"Show all", "xp.less":"Show fewer", "cs.plan":"See the plan", "cs.planx":"Hide the plan", "agy.n":"{n} agencies", "agy.all":"See all {n} agencies in {r}", "agy.less":"Show fewer", "agy.h":"Where we work, and every agency we handle", "agy.tf":"We file", "agy.tp":"With partners", "agy.tm":"We monitor", "agy.kf":"Placetta's agents prepare and submit it", "agy.kp":"Agents prepare it, a licensed broker, lawyer or lab files it", "agy.km":"Agents track the rules and flag every change", "agy.note":"Placetta is not affiliated with or endorsed by any government agency.", "xp.ppl":"Placetta advisors", "fr.h":"One agreement. Every location covered.","fr.sub":"Make Odelia the required compliance system in your franchise agreement. Each franchisee pays for its own stores, and headquarters sees every store's status, live.","fr.k1":"Required across your system","fr.p1":"Written into the franchise agreement, so every new and existing franchisee runs on the same standard.","fr.k2":"Franchisees pay per location","fr.p2":"$149 a month for each store. Headquarters pays nothing extra to see them all.","fr.k3":"Odelia does the work","fr.p3":"She tracks every date, fills the forms and files them. People step in only for exceptions.","fr.hq":"Brand headquarters","fr.sample":"Sample stores","fr.o1":"Franchisee: 3 stores","fr.o2":"Franchisee: 1 store","fr.o3":"Franchisee: 2 stores","fr.o4":"Opening","fr.s1":"All current","fr.s2":"Health permit renews in 21 days","fr.s3":"2 staff certificates due","fr.s4":"9 of 12 permits approved", "fr.btn":"Add franchisee", "fr.c1":"Location", "fr.c2":"Franchisee", "fr.c3":"Stores", "fr.c4":"Status", "fr.f1":"Golden Ox Group", "fr.f2":"Jade Bun LLC", "fr.f3":"Lantern Foods", "fr.s2b":"Renewal in 21 days", "fr.s3b":"2 certificates due", "fr.new":"New franchisee", "fr.h3":"Just add Odelia<br>to your franchise agreement", "fr.btn2":"Add member", "fr.m1":"Member", "fr.m2":"Role", "fr.m3":"Locations", "fr.role":"Compliance manager", "fr.locs":"All 7 locations", "fr.join":"Joining…", "fr.watch":"On duty", "in.sample":"sample", "pt.h":"Odelia works in the portals you dread.", "pt.sub":"City permit sites, county health portals, state tax accounts, customs systems. She signs in once with your OK, then does the clicking.", "pt.s1":"Signs in with your approval", "pt.s1s":"One tap from you. Your password never leaves your vault.", "pt.s2":"Fills every field from your documents", "pt.s2s":"Lease, LLC filing and floor plan, each value linked to where it came from.", "pt.s3":"Submits, saves the receipt, follows up", "pt.s3s":"Nothing is submitted until you say so.", "pt.url":"City permit portal", "pt.form":"Food facility plan check application", "pt.sign":"Odelia signed in with your approval", "pt.f1":"Business name", "pt.f2":"Site address", "pt.f3":"Seats", "pt.f4":"Floor plan", "pt.submit":"Submit application", "pt.t":"Submitted. Receipt saved.", "pt.ts":"I'll follow up with the county on Thursday.", "pt.note":"Sample run with sample data.", "pt.s4":"Remembers your answer", "pt.s4s":"Tell her once that landlord letters go to you first, and she does it that way at every store.", "jb.h":"Give Odelia a job.", "jb.sub":"Start with one role. Add more as you open more stores.", "jb.1":"New store permits", "jb.1p":"Maps every permit for each opening, files them in order, and chases the agencies.", "jb.1c":"San José, 9 of 12 approved", "jb.2":"Renewals", "jb.2p":"Renews every license before it lapses, at every store.", "jb.2c":"Health permit due in 21 days", "jb.3":"Customs and imports", "jb.3p":"Importer filings, bonds and prior notices for every shipment.", "jb.3c":"Shipment 14 cleared", "jb.4":"Hiring paperwork", "jb.4p":"Payroll accounts, labor posters and staff certificates.", "jb.4c":"2 food handler cards due", "jb.5":"Rule monitor", "jb.5p":"Watches every market and tells you what to do next.", "jb.5c":"13 changes tracked", "jb.6":"Your own job", "jb.6p":"Show Odelia once how you handle something. She does it that way at every store.", "jb.6c":"Saved to your playbook", "in.gm":"Game studios", "in.gmp":"Entity and payroll registration, sales tax on digital goods, ESRB age ratings, children's privacy and in-game purchase rules.", "in.tkp":"Entity registration, payroll and sales tax for SaaS, privacy notices, office permits.", "in.mfp":"Air and stormwater permits, building and zoning approvals, workplace safety records.", "in.btp":"FDA facility registration, product listings, label review, sales tax.", "in.hcp":"FDA establishment registration, device listings, state licenses, lab certificates.", "in.avp":"Dealer licenses and bonds, charger permits, battery shipping registration.", "in.tk":"Technology", "in.mf":"Manufacturing", "in.bt":"Beauty and personal care", "in.hc":"Healthcare and life sciences", "in.av":"Automotive and EV", "fr.cap":"$149 per store a month, paid by each franchisee. Headquarters sees every store for free.", "fr.h2":"One agreement.<br>Every location covered.", "fr.sub2":"Written into your franchise agreement. Franchisees pay $149 per store a month, and headquarters sees every store, live.", "fr.n1":"per location a month. Each franchisee pays for its own stores.", "fr.n2":"for headquarters to see every store, live", "fr.n3":"standard, written into your franchise agreement", "fr.t1":"Irvine renewal drafted", "fr.t1s":"Health permit, sent to the franchisee to approve", "fr.tot":"locations", "fr.l1":"current", "fr.l2":"due soon", "fr.l3":"opening", "fr.a1":"Next renewal Mar 2027", "fr.a2":"Odelia drafted the renewal", "fr.a3":"Odelia reminded the franchisee","in.h":"Built for every brand entering the US.","in.sub":"Whether you open a store, an office or a factory, Odelia knows the filings your industry needs, city by city and shipment by shipment.","in.r":"Food and beverage","in.rp":"Health permits, food handler certificates, hood and pest service proof, inspections.","in.s":"Retail","in.sp":"Business licenses, sign and occupancy permits, sales tax registration, renewals.","in.f":"Home and furniture","in.fp":"Importer registration, customs bond, product safety certificates, flammability and state furniture licenses.","in.c":"Consumer goods","in.cp":"Importer and FDA registrations, product certificates, packaging and label rules.","in.w":"Logistics and warehousing","in.wp":"Fire and storage permits, hazardous materials plans, freight and customs filings.","hero.h1":"Meet Odelia,<br><em>the compliance agent for brands entering the&nbsp;US.</em>", "hero.sub":"Odelia maps every permit and registration your US launch needs, files each one with your approval in the order agencies require, and keeps them current, in English or Chinese.",
 "fqr.t":"Prefer WeChat? Scan to add Placetta.", "wt.qr":"Scan to open Placetta on your phone",
 "q.wc":"Prefer WeChat? Scan to add Placetta.",
 "mon.cnt2":"{n} tracked", "mon.dl6":"Next 6 months", "mon.d1":"1 day", "mon.dn":"{n} days",
 "final.h":"<span class=\"l1\">Stop paying rent on an empty store.</span><span class=\"l2\">Hire Odelia.</span>",
 "map.any":"Choose a market", "map.anyus":"Choose a state", "map.q":"Search countries and regions", "map.qus":"Search states", "map.none":"No match. Try another name.",
 "mon.i.high":"High", "mon.i.med":"Medium", "mon.i.low":"Watch", "mon.l.means":"What it means for you", "mon.l.next":"What to do next", "mon.plan":"Get a plan for {m}", "mon.dl":"Upcoming deadlines", "mon.alert":"Get alerts for my markets", "mon.live":"Live feed, every change linked to its source", "mon.all":"See all {n} changes",
 "app.t1":"Plan", "app.t2":"Filings", "app.t3":"Documents", "app.t4":"Renewals",
 "mon.f.all":"All", "mon.f.pol":"Politics and trade", "mon.f.reg":"Regulation", "mon.f.lab":"Labor", "mon.f.ind":"Industry", "mon.lv.high":"High impact", "mon.lv.med":"Medium impact", "mon.lv.low":"Watch", "mon.today":"Today", "mon.note":"Summaries for information only, not legal advice. Each item links to its source.",
 "app.reqs":"Requirements", "app.toast":"{p} approved", "app.toastS":"{a}, just now",
 "hw.wals":"San José, CA",
 "foot.disc":"Placetta is not a law firm and does not provide legal advice. Where a step requires a licensed attorney or customs broker, you engage one directly.",
 "bp.n":"N", "bp.bar":"TEA BAR, SERVICE COUNTER", "bp.prep":"PREP, 3-COMP SINK", "bp.seat":"SEATING, OCC. LOAD 34", "bp.rr":"RR, ADA", "bp.entry":"ENTRY, EXIT", "bp.title":"A-101  TENANT IMPROVEMENT  QINGHUAN TEA HOUSE",
 "demo.brand":"Qinghuan Tea House",
 "itl.m1":"14-page PDF",
 "q.siteph":"brand.com",
 "aria.map":"Map", "aria.restart":"Restart", "aria.pause":"Pause", "aria.play":"Play", "aria.brands":"Industries", "aria.lang":"Language", "aria.nav":"Primary", "menu.open":"Menu", "menu.close":"Close menu", "menu.aria":"Site menu", "aria.close":"Close", "aria.back":"Back",
 "price.h":"One plan per store.", "cmp.h":"Three ways to open a store.", "cmp.sub":"Every opening needs the same licenses. What changes is who finds them, who files them and who remembers to renew them.", "cmp.a":"Doing it yourself", "cmp.a.1":"Weeks on agency websites to work out what you need", "cmp.a.2":"One agency at a time, in whatever order you find them", "cmp.a.3":"Renewal dates kept in a spreadsheet, if anywhere", "cmp.a.4":"English only, and the rules change without notice", "cmp.b":"A permit expediter", "cmp.b.1":"Quoted per job, often per filing", "cmp.b.2":"Usually one city, so every new market means a new firm", "cmp.b.3":"The work often ends on opening day", "cmp.b.4":"Updates by phone and email", "cmp.c":"Placetta", "cmp.c.1":"Every license mapped in minutes, each one linked to the agency's own page", "cmp.c.2":"Federal to city, in the order agencies require, for every location", "cmp.c.3":"Renewals, inspections and rule changes tracked for as long as you're open", "cmp.c.4":"English or Chinese, and nothing is filed until you approve it",
 "brand":"Placetta",
 "cost.s1b":"3 to 6 months", "cost.s1s":"The typical permit phase for a new restaurant", "cost.s2b":"8 months instead of 2", "cost.s2s":"One Sacramento restaurant's wait, at an estimated cost of $1M", "cost.s3s":"New state and local laws passed every year", "cost.s3src":"Source: Gusto", "cost.cap":"in rent paid before your first sale, waiting on {m} months of permits",
 "calc.l":"Your monthly rent", "calc.r":"Rent paid with zero revenue", "calc.mo":"months", "calc.n":"Rent alone, before payroll, build-out and lost sales.",
 "how.h":"Mapped by Odelia. Filed by Odelia.",
 "lm.plan":"Plan", "lm.wallet":"Renewal calendar",
 "st.label":"Where are you opening?", "st.ph":"Where are you opening? e.g. Los Angeles", "st.btn":"Get my plan",
 "q.step":"Step {n} of 4", "q.0t":"Where are you opening?", "q.0s":"A city and state, or a country. Four quick questions, about a minute.", "q.0ph":"e.g. Los Angeles, CA", "q.1t":"What are you opening?", "q.1a":"Industry", "q.1b":"Headquarters", "q.1ph":"Which country?", "q.2t":"When, and how many?", "q.2a":"Target opening", "q.2b":"Locations in the next 12 months", "q.3t":"Where should we send your plan?", "q.prev":"Your {m} plan will cover", "q.prevn":"The final list depends on your address and build-out.", "q.email":"Email", "q.wechat":"WeChat", "q.emailph":"name@company.com", "q.wechatph":"Your WeChat ID", "q.plang":"Plan language", "q.opt":"Add company details (optional)", "q.company":"Company", "q.site":"Website", "q.next":"Continue", "q.send":"Send me my plan", "q.errEmail":"Enter an email like name@company.com.", "q.errWechat":"Enter your WeChat ID (at least 5 characters).", "q.leaveT":"Leave before you get your plan?", "q.leaveP":"Your answers are saved on this device. You're {n} away from your plan.", "q.one":"one step", "q.many":"{n} steps", "q.keep":"Keep going", "q.leave":"Leave", "q.n3":"Walk through it with us if you'd like. No obligation.", "q.sample":"See a sample plan while you wait",
 "resume":"Finish your {m} plan",
 "mbar.r":"Finish your plan, step {n} of 4", "mbar.b":"Get my plan", "mbar.rb":"Continue",
 "map.h":"Where we work", "map.sub":"From São Paulo to Nairobi to Kuala Lumpur, one team files the paperwork. Pick a market to see what opening there takes.", "map.us":"United States", "map.world":"Worldwide", "map.s1":"US states covered", "map.s2":"countries covered", "map.desc":"Map of markets where Placetta handles compliance", "map.pick":"Choose a market", "map.prompt":"Pick a state or country to start a plan there.", "map.go":"Get your free plan for {m}", "map.t1":"Deepest coverage", "map.t2":"Full coverage", "map.t3":"Growing coverage", "map.t4":"Covered",
 "faq.h":"Questions", "faq.talk":"Talk to a person on our team, in English or Chinese.",
 "foot.pricing":"Pricing", "foot.guides":"License guides", "foot.privacy":"Privacy policy", "foot.terms":"Terms & conditions", "foot.wechat":"WeChat", "foot.made":"Designed in USA", "foot.official":"An official website of Placetta",
 "done.btn":"Back to the page",
 "nav.cases":"Examples",
 "st.phs":"City or state",
 "cost.sub":"One permit running late moves the whole opening, and the rules keep changing while you wait.",
 "how.sub":"Odelia, Placetta's AI agent, finds every license, permit and registration your business needs and prepares each application. You approve, and it's filed, tracked and renewed.",
 "app.sample":"Sample plan",
 "f1.h":"Every license, mapped", "f1.p":"Federal to city, in the order they run, with timelines and estimated agency fees.", "f1.t":"Plan ready", "f1.ts":"8 requirements, in order, with estimated fees",
 "cat.entity":"Entity formation", "cat.license":"Business licenses and tax", "cat.health":"Health permits", "cat.fire":"Fire and building permits", "cat.sign":"Sign permits", "cat.liquor":"Liquor licenses", "cat.zoning":"Zoning and occupancy", "cat.renew":"Renewals and regulatory changes",
 "f2.h":"You approve. Odelia files.", "f2.p":"Nothing is filed until you say so. Odelia submits each approved application, and our team steps in when an agency needs a person.", "f2.from":"Odelia, Placetta agent", "f2.m":"The health permit packet for Santa Clara County is ready for your review.", "f2.ok":"Approve", "f2.ch":"Request changes", "f2.t":"Filed by Odelia", "f2.ts":"Santa Clara County, just now",
 "f3.h":"Kept current after you open", "f3.p":"Renewal dates, inspections and rule changes, tracked for every location.", "f3.r1":"Health permit", "f3.r1d":"Due in 30 days", "f3.r2":"Business tax certificate", "f3.r2d":"Renews Jan 2027", "f3.r3":"Fire inspection", "f3.r3d":"Due Jun 2027", "f3.r4":"New city rule on menu labels", "f3.r4d":"Action needed", "f3.t":"Health permit renewal filed", "f3.ts":"Santa Clara County DEH, just now",
 "feat.note":"Product screens show sample data.",
 "mon.h2":"Rules change after you open.<br>We tell you what to do.",
 "proof.h":"See the plan before you sign the lease.", "wak.crit":"Sets the opening date", "bk.h":"Backed by operators who built at", "bk.more":"Show all {n}", "bk.less":"Show fewer", "bk.hero":"Backed by operators from top AI, tech and finance companies", "sec.h":"Security", "sec.link":"Read our privacy policy", "sec.1":"Agency logins encrypted in a vault", "sec.2":"Every use of a login is logged", "sec.3":"A full audit trail of every action", "sec.4":"Nothing filed, paid or sent without your approval", "sec.5":"Payments run through Stripe, and we never see full card numbers", "sec.6":"We never sell your content or use it to train AI models", "proof.sub":"Example plans for businesses like yours, built from official sources. Each one cites the agencies and laws behind it.",
 "price.promise":"Every license, permit and certificate a store can't open or sell without, mapped, filed with your approval and tracked for renewal.", "price.sub":"$149 a store a month on the store plan, billed yearly. Each new license $149 when it's approved, or $999 for a liquor license, building plan review or an import permit. If one is turned down because of a mistake on our side, you pay nothing. Each franchisee pays for its own stores.",
 "faq.sub":"Something else? Email <a href=\"mailto:support@placetta.com\">support@placetta.com</a>."
},
zh:{
 "nav.how":"运作方式", "nav.faq":"常见问题","nav.login":"登录","nav.app":"进入应用",
 "q.goT":"可以开始生成您的计划了。","q.goP":"确认 {c} 后，快哉会在几分钟内梳理{m}所需的全部执照、许可和登记，并附上费用和时间。","q.go":"生成我的计划","q.goN":"免费。未经您批准，不会提交或支付任何费用。",
 "cta.plan":"获取我的计划",
 "tm.cta":"让 Odelia 为您的门店工作","tm.m5":"营业税证书 30 天后到期，续期申请已起草。","tm.m4":"县政府要求提供修改后的平面图，我已通知工程经理。","tm.m3":"已向圣克拉拉县提交，回执已保存到您的云端硬盘。","tm.m2":"圣何塞卫生许可申请材料已准备好。您确认后，我会交给团队提交。","tm.m1":"本周安排：2 家门店共有 3 项申请到期，均已准备好供您审阅。","tm.d5":"周五","tm.d4":"周四","tm.d3":"周三","tm.d2":"周二","tm.d1":"周一","tm.wks":"示例一周","tm.wk":"与 Odelia 共事的一周","tm.v8":"提交任何未经您确认的申请","tm.k8":"绝不","tm.v7":"确认、签名、政府费用和身份核验","tm.k7":"需要您提供","tm.v6":"每家门店所需的每一项证照，按顺序按时提交，到期前完成续期","tm.k6":"负责","tm.v5":"Gmail、Outlook、Slack、Google 日历、Google 云端硬盘","tm.k5":"工作工具","tm.v4":"中文和英文","tm.k4":"语言","tm.v3":"全天候，覆盖所有时区","tm.k3":"工作时间","tm.v2":"您","tm.k2":"汇报对象","tm.v1":"许可与证照经理","tm.k1":"岗位","tm.jdt":"Odelia","tm.jd":"岗位卡","tm.now":"正在处理：圣何塞卫生许可申请材料","tm.r4":"Odelia","tm.r4s":"许可与证照","tm.r3s":"装修与验收","tm.r3":"工程经理","tm.r2s":"选址与租约","tm.r2":"选址负责人","tm.r1s":"美国拓展负责人","tm.a1":"您","tm.a2":"址","tm.a3":"工","tm.r1":"您","tm.sample":"示例团队","tm.team":"美国拓展团队","tm.sub":"像招聘新同事一样，把快哉的 AI 智能代理 Odelia 加入您的拓展团队。她负责每家门店的许可与证照，在团队现有的工具里工作，只有需要真人处理的事才会找您。","tm.c1h":"她加入您的团队","tm.c1p":"像招聘新同事一样加入 Odelia。她在您的拓展团队中有自己的位置，工作状态一目了然。","tm.on":"在线","tm.t1":"Odelia 已加入您的团队","tm.t1s":"美国拓展，许可与证照","tm.c2h":"她清楚自己的职责","tm.c2p":"一个岗位，从头负责到底：每一项证照按时提交，到期前完成续期。","tm.v3s":"全天候","tm.gcal":"Google 日历","tm.gdrive":"Google 云端硬盘","tm.t2":"未经您确认，绝不提交","tm.t2s":"签名、政府费用和身份核验由您完成","tm.c3h":"她主动向您汇报","tm.c3p":"进展直接发到团队已在用的地方：Slack、邮件和日历。","tm.you":"确认，提交吧。","tm.t3":"续期申请已起草","tm.t3s":"营业税证书，到期前 30 天","tm.h":"您团队的新成员。","hero.badge":"执照与许可，覆盖全球 92 座城市",
 "brands.l":"适用于",
 "hero.sample":"查看示例计划","hero.try":"让 Odelia 开始工作","hero.demo":"预约演示","how.try":"用您的门店试一试","aria.proof":"概览","pf.s3":"个美国州全覆盖，另有 170 多个国家和地区", "foot.disc2":"快哉与任何政府机构均无关联。产品界面与示例计划使用示例数据。客户成果描述的是其各自门店的开业经历；您的时间线取决于所在城市、装修工程和各机构的审批。", "price.m.note":"示意计算，并非报价或承诺。您的房租、时间和政府规费会有所不同。", "xp.note":"我们的顾问曾任职于上述机构。这些机构与快哉无关联，也不为快哉背书。", "bk.note":"投资人均以个人身份投资。其曾任职或现任职的公司与快哉无关联，也不为快哉背书。", "pf.appr":"份未经您批准而提交的申请", "pf.fm":"张官方表格，每张都逐字核对过政府机构官网原文。最近读取于 {d}", "pf.lang":"种语言：每份计划和看板都有中文和英文", "pf.ag":"个政府机构由我们办理，覆盖 {r} 个地区","ag.h":"看 Odelia 如何工作。","ag.p":"她读取您的文件，查询各政府机构的官方网站，填写表格并起草信函。每一项数据都标明出处原文，未经您确认不会提交任何申请。","aria.ag":"智能代理运行示例","ag.tag":"运行示例","ag.l1":"已读取您的租约和 LLC 注册文件","ag.l2":"已核对圣克拉拉县和圣何塞市的要求","ag.l2s":"来源：sccgov.org、sanjoseca.gov","ag.l3":"找到 8 项要求，已排序并附预估费用","ag.l4":"已根据租约填写卫生许可图纸审查申请","ag.l4q":"租户：Qinghuan Tea House LLC","ag.l5":"已起草房东同意函","ag.l5s":"landlord-consent.docx，已保存到文件","ag.l6":"等待您的确认，确认前不会提交任何申请",
 "app.proj":"预计开业", "app.date":"2027年3月", "app.est":"预估时间，非承诺", "app.risk":"风险检查：签约前请复核该州对外资企业租赁的规定。", "app.week":"第", "app.done":"已批准",
 "st.q":"排队中", "st.r":"审核中", "st.d":"已批准", "st.b":"受阻",
 "cost.h":"开业日期，由许可决定。", "cost.big":"3 至 6 个月", "cost.bigs":"新餐厅常见的许可审批周期。一项审批晚了，依赖它的每一步都得跟着等。",
 "src":"来源",
 "months":"月份",
 "leg.r":"付房租、无收入的月份", "leg.p":"原计划开业", "leg.o":"开业", "leg.m":"常见区间",
 "itl.f1":"图纸审查材料",
 "map.all":"查看全图",
 "tea.tab1":"茶企",
 "map.fr":"跨境货运", "map.fs":"种运输方式：海运、空运、铁路和公路，协助把货物运进新市场", "map.subfr":"除了办理许可，我们还协助客户把货物运进每个新市场，海陆空铁皆可。",
 "foot.slogan":"开到哪里，手续都交给快哉。",
 "fl.desc":"客户货柜经海运、空运、铁路和公路往返于亚洲、美洲、欧洲、中东、非洲和澳洲之间的路线地图，包括北极航线", "fl.msea":"海运", "fl.mair":"空运", "fl.mrail":"铁路", "fl.mroad":"公路",
 "mon.k1":"项变化正在跟踪", "mon.catch":"Odelia 为您发现了这项变化", "mon.new":"新", "mon.imp.time":"时间影响", "mon.imp.cost":"成本影响", "mon.imp.risk":"门店风险", "mon.done":"Odelia 已经", "mon.dn1":"读完原始来源", "mon.dn2":"匹配到您的市场", "mon.dn3":"加入了截止日期", "mon.dn4":"写好了下一步", "mon.catchd":"发布当天即已标记，距截止日还有{n}", "mon.catche":"发布当天即已标记，下一步已准备好", "mon.mo":"{n}个月", "mon.mo1":"1个月", "mon.k2":"项需要立即处理", "mon.k3":"天后到达下一个截止日",
 "bel.ex":"示例方案", "case.c5":"改变选址", "case.c6":"决定选址",
 "aria.app":"示例开店计划",
 "tea.tabs":"茶企", "tea.sub":"五个示例", "tea.mk":"环节", "tea.btn":"规划我的美国开店", "tea.src":"", "tea.c1":"决定开业时间", "tea.c2":"耗时最长", "tea.c3":"风险最大", "tea.c4":"每次发货",
 "app.loc":"武夷山天心村 → 加州圣何塞首家美国门店",
 "st.note":"门店方案每家门店每月 149 美元，按年计费，含跟踪、续期与 Odelia。新执照每项 149 美元，获批时收取；如因我们的失误被退回，您无需付费。计划预览免费。",
 "q.fine":"免费，几分钟即可生成。之后：门店方案每家门店每月 149 美元，含跟踪、续期与 Odelia；新执照每项 149 美元，获批时收取；如因我们的失误被退回，您无需付费。",
 "mon.price":"所有月度方案均包含",
 "price.risk":"还没准备好？计划预览免费：门店所需的每一项执照，附机构规费与时间。", "price.an.l":"一家等待许可的门店", "price.an.v":"15,000 美元<small class=\"pmper\">每月</small>", "price.an.s":"房租照付，却没有营业收入（即“等待的代价”中的示例门店）。", "price.an.l2":"快哉单店套餐，按年计费", "price.an.v2":"5,127 美元", "price.an.s2":"多等一个月的损失，超过两家餐厅开业再各加一年快哉的费用。", "price.m.h":"等待的账单", "price.m.sub":"多等一个月的房租，就超过一家餐厅开业加上一整年 Odelia 的费用。", "price.m.bad":"没有 Odelia", "price.m.good":"有 Odelia", "price.m.s1":"许可每晚一个月，就多付一个月没有营业收入的房租。示例门店等了 8 个月。", "price.m.s2":"一家餐厅开业：9 项执照每项 149 美元，2 项图纸审查每项 999 美元（3,339 美元），加上首年门店方案（1,788 美元）。", "price.m.s3":"每项新执照在获批时收费，提交并跟踪至获批", "price.ex.l":"许可代办公司，每家餐厅", "price.ex.v":"2,000 至 7,500 美元", "price.ex.s":"许可代办公司的常见收费，每家餐厅一次开店，不含政府规费。<a href=\"https://permitplace.com/permit-expediter-cost-guide/\" target=\"_blank\" rel=\"noopener\">来源：PermitPlace</a>", "price.ex.l2":"快哉，一次典型的餐厅开业", "price.ex.v2":"3,339 美元", "price.ex.s2":"9 项执照每项 149 美元，2 项建筑图纸审查每项 999 美元，逐项提交并跟踪至获批。依据快哉为圣何塞一家餐厅制定的计划。机构规费按实际金额。", "price.f1q":"计划预览免费吗？", "price.f1a":"免费。门店所需的每一项执照，附机构规费与时间，不收任何费用。开通门店方案或批准申报时才付费。", "price.f2q":"政府规费由谁支付？", "price.f2a":"由您通过我们发送的付款链接直接支付给各机构。预估费用会提前列在计划中。", "price.f3q":"申请被退回怎么办？", "price.f3a":"Odelia 会读取机构给出的原因，与您一起修正后重新提交；如机构需要专人处理，由我们的团队接手。未经您批准，不会提交任何申请。", "price.fine":"门店方案包含 Odelia，每家门店每月有额度。政府规费按实际金额直接支付给各机构，律师和报关行直接向您收费。", "price.hq":"方案内有 10 家及以上门店？每项新执照全部包含。<a href=\"mailto:support@placetta.com?subject=Odelia%20for%20franchisors\" data-track=\"price_scale\">预约演示</a>", "price.entry":"<b>还没准备好订阅？</b>计划预览免费：任一市场的全部执照，几分钟即可生成。",
 "bel.ya":"审批", "bel.yf":"备案", "bel.yr":"合规", "bel.sa":"由机构批准", "bel.sf":"Odelia 准备并提交", "bel.sr":"Odelia 核对是否达标", "bel.cases":"示例方案", "bel.crit2":"决定付款周期", "bel.tag":"客户案例", "bel.tabs":"市场", "bel.crit":"决定上线时间", "bel.src":"来源：", "bel.srcs":"来源：", "bel.btn":"规划我的下一个市场",
 "q.doneT":"您的计划已生成。", "q.doneP":"您的{m}开店计划即时生成，并发送至 {c}。", "q.n1":"根据您对{m}的回答，即时生成您的计划。", "q.n2":"计划列出每一项要求、办理顺序、时间和费用。",
 "mon.allm":"全部市场", "mon.sample":"查看提醒示例", "mon.none2":"该市场未来 6 个月没有截止日期。", "mon.al.to":"收件人：您的团队", "mon.al.subj":"需要处理：{t}", "mon.al.note":"示例提醒，内容来自真实且附来源的规则变化。", "mon.body3":"您所在市场的每项规则变化，附上对门店的影响和下一步建议。", "mon.app":"快哉监测",
 "mbar.t":"每家门店每月 149 美元，新执照获批时 149 美元，计划预览免费",
 "cta.free":"获取免费开店计划",
 "mon.l.aff2":"涉及", "mon.due":"距截止还有 {n} 天", "mon.due1":"距截止还有 1 天", "mon.duet":"今天截止", "mon.dayn":"天后截止", "mon.day1":"天后截止",
 "ts.tabs":"故事",
 "add.btn":"新建计划", "add.c1":"公司", "add.c2":"目标市场", "add.c3":"目标开业", "add.c4":"状态", "add.h":"告诉我们您在哪里开店，<br>几分钟拿到计划。", "add.mapping":"生成中…", "add.ready":"计划已就绪", "add.r1c":"灯笼面馆", "add.r1m":"得州休斯顿", "add.r1d":"2027年6月", "add.r2c":"铜叶咖啡", "add.r2m":"华盛顿州西雅图", "add.r2d":"2027年9月", "add.r3c":"金牛火锅", "add.r3m":"纽约法拉盛", "add.r3d":"2027年1月", "add.r4c":"玉包烘焙", "add.r4m":"加州尔湾", "add.r4d":"2026年8月已开业", "add.s1":"申报中", "add.s2":"审核中", "add.s3":"已批准", "add.s4":"已开业", "add.tab":"开店计划", "cmp.1h":"咨询顾问", "cmp.1n":"几周", "cmp.2n":"几个月", "cmp.3n":"几分钟", "cmp.1p":"几周后交一份报告，按小时计费。", "cmp.2h":"自己办理", "cmp.2p":"数月的电话、表格和被退回的申请。", "cmp.3p":"几分钟出计划，代办申报，一个看板。计划预览免费。", "cmp.h":"为什么不找律所或顾问？", "cn.btn":"获取我的计划", "cn.t":"双方团队均已收到租约风险提示","cn.ts":"Odelia，签约之前","cn.lm1":"深圳","cn.lm2":"纽约","fr.r1m":"您","fr.r1r":"加盟发展负责人","fr.r1l":"全部 7 家门店","fr.r1s":"管理员","fr.r2m":"加盟商，纽约法拉盛","fr.r2r":"加盟店主","fr.r2l":"3 家门店","fr.r2s":"全部有效","fr.r3m":"加盟商，加州尔湾","fr.r3r":"加盟店主","fr.r3l":"1 家门店","fr.r3s":"21 天后续期","fr.r4m":"加盟商，德州休斯顿","fr.r4r":"加盟店主","fr.r4l":"2 家门店","fr.r4s":"2 份证书到期","fr.r5m":"加盟商，加州圣何塞","fr.r5r":"加盟店主","fr.r5l":"1 家筹备中","fr.r5s":"已获批 9/12","cn.h":"总部在深圳，<br>许可在纽约。", "cn.p":"上海或深圳的团队拍板，纽约的团队签租约。各州规则各不相同，部分州还限制外资企业租赁和持有房产。两地团队看到的是同一个看板，中英文随时切换，这些风险在签约之前就会标出。", "cn.q":"苏轼《定风波》", "cn.s":"此心安处是吾乡", "cn.sub":"计划预览免费。新执照每项 149 美元，获批时收取", "dash.a":"深圳总部", "dash.at":"晚上 9:00", "dash.b":"纽约团队", "dash.bt":"上午 9:00", "dash.risk":"风险提示：签约前请复核该州对外资企业租赁的规定", "diff.1b":"几分钟", "diff.1s":"从目标市场到完整开店计划", "diff.after":"之后", "diff.before":"之前", "diff.2b":"6 → 1", "diff.2s":"原本要跑的 6 个部门，变成一个团队全部搞定", "diff.h":"快哉带来的改变", "diff.team":"您的团队", "diff.with":"携手", "itl.a1":"圣克拉拉县卫生许可材料已准备好，现在提交吗？", "itl.a2":"已提交。县里一开放检查时段，我就为您预约。", "itl.b1":"招牌许可需要房东授权。要我直接发请求给房东吗？", "itl.b2":"明白。以后所有门店的房东请求都先发给您。", "itl.f2":"房东授权书", "itl.h":"Odelia 每次申报前都先问您，并记住您的回答", "itl.m2":"1 页文档", "itl.saved":"已记入您的偏好", "itl.u1":"好的，提交吧 👍", "itl.u2":"不用，房东相关的先发给我，我来转。", "qr":"二维码", "trust.1":"170 多个国家的合作律师", "trust.2":"本地许可代办", "trust.1s":"需要律师？我们安排对接，全程代办。您只需签字。", "trust.2s":"现场递交、取件和检查，由开店所在城市的代办团队完成。", "trust.ap":"每一步都由您批准", "trust.3s":"未经您批准，任何申报都不会提交；每个数值都标明出处。", "trust.3":"中文和英文", "trust.h":"值得信赖", "wt.l":"随时协作", "wt.qr":"上线前在此放置微信二维码", "wt.r":"从第一天起", "you.init":"松",
 
 "xp.h":"我们的专家曾任职于：", "xp.all":"显示全部", "xp.less":"收起", "cs.plan":"查看计划", "cs.planx":"收起计划", "agy.n":"{n} 个机构", "agy.all":"查看{r}全部 {n} 个机构", "agy.less":"收起", "agy.h":"我们覆盖的市场，以及经手的每一个机构", "agy.tf":"代为申报", "agy.tp":"联合伙伴", "agy.tm":"持续监测", "agy.kf":"由快哉智能代理准备并提交", "agy.kp":"由智能代理准备，持牌报关行、律师或实验室提交", "agy.km":"智能代理持续跟踪规则，并提示每一项变化", "agy.note":"快哉与任何政府机构均无隶属关系，也未获其背书。", "xp.ppl":"快哉顾问", "fr.h":"一份协议，覆盖每家门店。","fr.sub":"在加盟协议中将 Odelia 设为统一的合规系统。每位加盟商为自己的门店付费，总部实时查看每家门店的状态。","fr.k1":"全体系统一要求","fr.p1":"写入加盟协议，让每一位新老加盟商都执行同一标准。","fr.k2":"加盟商按门店付费","fr.p2":"每家门店每月 149 美元。总部查看全部门店无需额外付费。","fr.k3":"Odelia 完成具体工作","fr.p3":"她跟踪每一个日期，填写表格并提交申请。只有例外事项才需要专人介入。","fr.hq":"品牌总部","fr.sample":"示例门店","fr.o1":"加盟商：3 家门店","fr.o2":"加盟商：1 家门店","fr.o3":"加盟商：2 家门店","fr.o4":"筹备开业","fr.s1":"全部有效","fr.s2":"卫生许可 21 天后续期","fr.s3":"2 份员工证书到期","fr.s4":"12 项许可已获批 9 项", "fr.btn":"添加加盟商", "fr.c1":"门店位置", "fr.c2":"加盟商", "fr.c3":"门店数", "fr.c4":"状态", "fr.f1":"金牛餐饮集团", "fr.f2":"玉包有限公司", "fr.f3":"灯笼食品", "fr.s2b":"21 天后续期", "fr.s3b":"2 份证书到期", "fr.new":"新加盟商", "fr.h3":"把 Odelia<br>写进您的加盟协议", "fr.btn2":"添加成员", "fr.m1":"成员", "fr.m2":"职责", "fr.m3":"门店", "fr.role":"合规经理", "fr.locs":"全部 7 家门店", "fr.join":"加入中…", "fr.watch":"在岗", "in.sample":"示例", "pt.h":"那些让人头疼的政府网站，交给 Odelia。", "pt.sub":"市政许可网站、县卫生局系统、州税务账户、海关系统。经您同意登录一次，之后的点击和填写都由她完成。", "pt.s1":"经您批准后登录", "pt.s1s":"您只需点一下。密码始终保存在您的密码库中。", "pt.s2":"根据您的文件填好每一栏", "pt.s2s":"租约、公司登记和平面图，每个数值都标明出处。", "pt.s3":"提交、保存回执、持续跟进", "pt.s3s":"未经您同意，不会提交任何申请。", "pt.url":"市政许可网站", "pt.form":"餐饮设施图纸审查申请", "pt.sign":"Odelia 已经您批准登录", "pt.f1":"商户名称", "pt.f2":"门店地址", "pt.f3":"座位数", "pt.f4":"平面图", "pt.submit":"提交申请", "pt.t":"已提交，回执已保存。", "pt.ts":"我会在周四向县里跟进。", "pt.note":"示例流程，数据为示例。", "pt.s4":"记住您的回答", "pt.s4s":"告诉她一次房东信函先发给您，她会在每家门店都照此执行。", "jb.h":"给 Odelia 分配工作。", "jb.sub":"先从一个岗位开始，开的店越多，加的岗位越多。", "jb.1":"新店许可", "jb.1p":"为每家新店梳理全部许可，按顺序申报，并跟进各部门。", "jb.1c":"圣何塞：12 项已批 9 项", "jb.2":"续期", "jb.2p":"在每家门店的执照到期前完成续期。", "jb.2c":"卫生许可 21 天后到期", "jb.3":"海关与进口", "jb.3p":"每批货物的进口申报、保证金和预先通报。", "jb.3c":"第 14 批货物已清关", "jb.4":"招聘文书", "jb.4p":"工资税账户、劳动法公示和员工证书。", "jb.4c":"2 张食品从业证到期", "jb.5":"规则监测", "jb.5p":"关注每个市场，告诉您下一步该做什么。", "jb.5c":"跟踪 13 项变化", "jb.6":"您自定义的岗位", "jb.6p":"给 Odelia 演示一次您的做法，她会在每家门店都照此执行。", "jb.6c":"已记入您的工作手册", "in.gm":"游戏", "in.gmp":"公司与工资税登记、数字商品销售税、ESRB 年龄分级、儿童隐私与游戏内购规则。", "in.tkp":"公司登记、工资税与 SaaS 销售税、隐私声明、办公室许可。", "in.mfp":"空气与雨水排放许可、建筑与分区审批、职业安全记录。", "in.btp":"FDA 设施注册、产品备案、标签审核、销售税。", "in.hcp":"FDA 企业注册、器械列名、州执照、实验室证书。", "in.avp":"经销商执照与保证金、充电桩许可、电池运输登记。", "in.tk":"科技", "in.mf":"制造业", "in.bt":"美妆个护", "in.hc":"医疗与生命科学", "in.av":"汽车与新能源", "fr.cap":"每家门店每月 149 美元，由加盟商支付。总部免费查看全部门店。", "fr.h2":"一份协议，<br>覆盖每家门店。", "fr.sub2":"写入您的加盟协议。加盟商每家门店每月 149 美元，总部实时查看每家门店。", "fr.n1":"每家门店每月。每位加盟商为自己的门店付费。", "fr.n2":"总部实时查看全部门店，无需付费", "fr.n3":"套统一标准，写入您的加盟协议", "fr.t1":"已起草尔湾门店续期申请", "fr.t1s":"卫生许可，已发给加盟商审批", "fr.tot":"个门店", "fr.l1":"有效", "fr.l2":"即将到期", "fr.l3":"筹备中", "fr.a1":"下次续期 2027年3月", "fr.a2":"Odelia 已起草续期申请", "fr.a3":"Odelia 已提醒加盟商","in.h":"为每一个进入美国的品牌而建。","in.sub":"无论您开门店、办公室还是工厂，Odelia 都清楚您所在行业需要的每一项申报，逐个城市，逐批货物。","in.r":"餐饮","in.rp":"卫生许可、食品从业证书、排烟罩与虫害服务凭证、检查。","in.s":"零售","in.sp":"营业执照、招牌与使用许可、销售税登记、续期。","in.f":"家居家具","in.fp":"进口商登记、海关保证金、产品安全证书、阻燃要求和各州家具执照。","in.c":"消费品","in.cp":"进口商与 FDA 登记、产品证书、包装与标签规定。","in.w":"物流仓储","in.wp":"消防与仓储许可、危险品计划、货运与海关申报。","hero.h1":"认识 Odelia，<br><em>品牌进入美国的合规<br>智能代理。</em>", "hero.sub":"Odelia 梳理您在美国开业所需的每一项许可与登记，按各机构要求的顺序、经您确认后逐项申报，并持续更新。中英文均可。",
 "fqr.t":"更习惯用微信？扫码添加快哉。", "wt.qr":"扫码在手机上打开快哉",
 "q.wc":"更习惯用微信？扫码添加快哉。",
 "mon.cnt2":"共 {n} 条", "mon.dl6":"未来 6 个月", "mon.d1":"1 天", "mon.dn":"{n} 天",
 "final.h":"<span class=\"l1\">别再为空店付房租。</span><span class=\"l2\">让 Odelia 加入您的团队。</span>",
 "map.any":"选择市场", "map.anyus":"选择州", "map.q":"搜索国家和地区", "map.qus":"搜索州", "map.none":"没有匹配项，请换个名称试试。",
 "mon.live":"实时更新，每条变化均附来源", "mon.all":"查看全部 {n} 条变化", "mon.i.high":"较大", "mon.i.med":"中等", "mon.i.low":"关注", "mon.l.means":"对您意味着什么", "mon.l.next":"下一步该做什么", "mon.plan":"获取{m}开店计划", "mon.dl":"即将到来的截止日期", "mon.alert":"订阅我的市场提醒",
 "app.t1":"开店计划", "app.t2":"申报", "app.t3":"文件", "app.t4":"续期",
 "mon.f.all":"全部", "mon.f.pol":"政治与贸易", "mon.f.reg":"监管", "mon.f.lab":"用工", "mon.f.ind":"行业", "mon.lv.high":"影响较大", "mon.lv.med":"影响中等", "mon.lv.low":"持续关注", "mon.today":"今天", "mon.note":"摘要仅供参考，不构成法律意见。每条动态均附来源链接。",
 "app.reqs":"全部要求", "app.toast":"{p}已批准", "app.toastS":"{a}，刚刚",
 "hw.wals":"加州圣何塞",
 "foot.disc":"快哉不是律师事务所，不提供法律意见。如某一步骤需要持牌律师或报关行，由您直接聘请。",
 "bp.n":"北", "bp.bar":"茶饮吧台与服务台", "bp.prep":"备餐区 三格水槽", "bp.seat":"座位区 容纳 34 人", "bp.rr":"无障碍卫生间", "bp.entry":"出入口", "bp.title":"101 号图纸 室内装修 清欢茶舍",
 "demo.brand":"清欢茶舍",
 "itl.m1":"14 页文件",
 "q.siteph":"品牌官网网址",
 "aria.map":"地图", "aria.restart":"重播", "aria.pause":"暂停", "aria.play":"播放", "aria.brands":"适用行业", "aria.lang":"语言", "aria.nav":"主导航", "menu.open":"菜单", "menu.close":"关闭菜单", "menu.aria":"网站菜单", "aria.close":"关闭", "aria.back":"返回",
 "price.h":"每家门店，一个方案。", "cmp.h":"开一家店，三种方式。", "cmp.sub":"每次开店需要的执照都一样。不同的是：由谁来梳理、由谁来提交、由谁记得续期。", "cmp.a":"自己办理", "cmp.a.1":"花几周时间在各机构网站上摸索需要办什么", "cmp.a.2":"一个机构一个机构地办，顺序全凭摸索", "cmp.a.3":"续期日期记在表格里，甚至没人记", "cmp.a.4":"只有英文，规则变了也没人提醒", "cmp.b":"许可代办", "cmp.b.1":"按单报价，常常按每项申报收费", "cmp.b.2":"通常只做一个城市，每进一个新市场就要换一家", "cmp.b.3":"服务往往在开业当天结束", "cmp.b.4":"靠电话和邮件沟通进度", "cmp.c":"快哉", "cmp.c.1":"几分钟梳理出每一项执照，每项都附机构官方页面", "cmp.c.2":"从联邦到城市，按机构要求的顺序，覆盖每一家门店", "cmp.c.3":"开业之后持续跟踪续期、检查和规则变化", "cmp.c.4":"中英文均可，未经您批准不会提交任何申请",
 "brand":"快哉",
 "cost.s1b":"3 至 6 个月", "cost.s1s":"新餐厅常见的许可审批周期", "cost.s2b":"8 个月，而非 2 个月", "cost.s2s":"萨克拉门托一家餐厅的等待，预估损失约 100 万美元", "cost.s3s":"美国每年新通过的州和地方法律", "cost.s3src":"来源：Gusto", "cost.cap":"开业前白付的房租：许可审批拖了 {m} 个月",
 "calc.l":"您的月租金", "calc.r":"无收入期间支付的房租", "calc.mo":"个月", "calc.n":"仅计房租，不含人工、装修和销售损失。",
 "how.h":"由 Odelia 梳理，由 Odelia 申报。",
 "lm.plan":"开店计划", "lm.wallet":"续期日历",
 "st.label":"您要在哪里开店？", "st.ph":"您要在哪里开店？例如：洛杉矶", "st.btn":"获取计划",
 "q.step":"第 {n} 步，共 4 步", "q.0t":"您要在哪里开店？", "q.0s":"城市和州，或国家。共 4 个简单问题，约一分钟。", "q.0ph":"例如：加州洛杉矶", "q.1t":"您要开什么店？", "q.1a":"行业", "q.1b":"总部所在地", "q.1ph":"哪个国家？", "q.2t":"什么时候开？开几家？", "q.2a":"目标开业时间", "q.2b":"未来 12 个月门店数", "q.3t":"计划发到哪里？", "q.prev":"您的{m}开店计划将包括", "q.prevn":"最终清单取决于具体地址和装修情况。", "q.email":"邮箱", "q.wechat":"微信", "q.emailph":"name@company.com", "q.wechatph":"您的微信号", "q.plang":"计划语言", "q.opt":"补充公司信息（选填）", "q.company":"公司名称", "q.site":"网站", "q.next":"继续", "q.send":"把计划发给我", "q.errEmail":"请输入有效邮箱，例如 name@company.com。", "q.errWechat":"请输入微信号（至少 5 个字符）。", "q.leaveT":"还没拿到计划，确定要离开吗？", "q.leaveP":"您的回答已保存在本设备上。距离拿到计划只差 {n}。", "q.one":"1 步", "q.many":"{n} 步", "q.keep":"继续填写", "q.leave":"离开", "q.n3":"如有需要，我们可以和您一起逐项讲解，不附带任何义务。", "q.sample":"等待期间，先看看示例计划",
 "resume":"完成您的{m}开店计划",
 "mbar.r":"完成您的计划（第 {n}/4 步）", "mbar.b":"获取计划", "mbar.rb":"继续",
 "map.h":"业务覆盖", "map.sub":"从圣保罗到内罗毕，再到吉隆坡，同一支团队为您办妥所有手续。选择一个市场，看看在当地开业需要哪些手续。", "map.us":"美国", "map.world":"全球", "map.s1":"个美国州", "map.s2":"个国家和地区", "map.desc":"快哉提供合规服务的市场地图", "map.pick":"选择市场", "map.prompt":"点击任意州或国家，开始规划在当地开店。", "map.go":"获取{m}免费开店计划", "map.t1":"覆盖最深", "map.t2":"全面覆盖", "map.t3":"覆盖扩展中", "map.t4":"已覆盖",
 "faq.h":"常见问题", "faq.talk":"直接与我们团队的人沟通，中英文均可。",
 "foot.pricing":"价格", "foot.guides":"执照指南", "foot.privacy":"隐私政策", "foot.terms":"服务条款", "foot.made":"美国设计", "foot.official":"快哉官方网站", "foot.wechat":"微信",
 "done.btn":"返回页面",
 "nav.cases":"示例方案",
 "st.phs":"城市或州",
 "cost.sub":"一张许可晚了，整个开业都得推迟；而在您等待的时候，规则还在变。",
 "how.sub":"快哉的智能代理 Odelia 找出您的业务所需的每一项执照、许可和登记，并准备每一份申请。您确认后，即完成提交、跟踪和续期。",
 "app.sample":"示例计划",
 "f1.h":"每一项执照，一一列清", "f1.p":"从联邦到市级，按办理顺序列出，附时间表和预估的政府规费。", "f1.t":"开店计划已就绪", "f1.ts":"8 项要求，按顺序排列，附预估费用",
 "cat.entity":"公司设立与注册", "cat.license":"营业执照与税务登记", "cat.health":"卫生许可", "cat.fire":"消防与建筑许可", "cat.sign":"招牌许可", "cat.liquor":"酒类执照", "cat.zoning":"区划与使用许可", "cat.renew":"续期与监管变化",
 "f2.h":"您确认，Odelia 申报。", "f2.p":"未经您确认，不会提交任何申请。Odelia 提交每一份已确认的申请，需要真人办理时由我们的团队接手。", "f2.from":"Odelia，快哉智能代理", "f2.m":"圣克拉拉县卫生许可申请材料已准备好，请您审阅。", "f2.ok":"确认提交", "f2.ch":"需要修改", "f2.t":"已由 Odelia 提交", "f2.ts":"圣克拉拉县，刚刚",
 "f3.h":"开业之后，持续合规", "f3.p":"所有门店的续期日期、检查和规则变化，全部跟踪。", "f3.r1":"卫生许可", "f3.r1d":"30 天后到期", "f3.r2":"营业税证书", "f3.r2d":"2027年1月续期", "f3.r3":"消防年检", "f3.r3d":"2027年6月到期", "f3.r4":"市里新规：菜单标签", "f3.r4d":"需要处理", "f3.t":"卫生许可续期已提交", "f3.ts":"圣克拉拉县环境卫生局，刚刚",
 "feat.note":"产品界面中的数据均为示例。",
 "mon.h2":"开店之后，规则仍在变化。<br>我们告诉您该怎么做。",
 "proof.h":"签租约之前，先看清开店计划。", "wak.crit":"决定开业时间", "bk.h":"我们的投资人曾任职于", "bk.more":"查看全部 {n} 家", "bk.less":"收起", "bk.hero":"投资人来自顶尖的人工智能、科技与金融公司", "sec.h":"数据安全", "sec.link":"阅读隐私政策", "sec.1":"政府网站登录信息加密存放于保险库", "sec.2":"每次使用登录信息都有记录", "sec.3":"每一步操作都有完整审计记录", "sec.4":"未经您批准，不提交、不付款、不发送", "sec.5":"付款由 Stripe 处理，我们看不到完整卡号", "sec.6":"我们绝不出售您的内容，也不用它训练 AI 模型", "proof.sub":"为与您类似的企业制作的示例方案，均依据官方资料整理，并注明所依据的机构与法规。",
 "price.promise":"门店开业和营业离不开的每一项执照、许可和证书：逐项梳理，经您批准后提交，并跟踪续期。", "price.sub":"门店方案每家门店每月 149 美元，按年计费。每项新执照获批时收取 149 美元，酒类执照、建筑图纸审查或进口许可每项 999 美元。如因我们的失误被退回，您无需付费。每位加盟商为自己的门店付费。",
 "faq.sub":"还有其他问题？请发邮件至 <a href=\"mailto:support@placetta.com\">support@placetta.com</a>。"
}};
/* named proof strip */
Object.assign(T.en, {"np.aria":"Customer results","np.1n":"5 months","np.1s":"saved in approval time","np.2n":"3 filings","np.2s":"handled end to end for a store GM","np.3l":"Wakimasu Wagyu","np.3n":"10 requirements","np.3s":"mapped from Japan to a New York dining room"});
Object.assign(T.zh, {"hero.subm":"快哉的 AI 代理 Odelia 办好开店所需的每一项执照。您只需确认。"});
Object.assign(T.zh, {"np.aria":"客户成果","np.1n":"5 个月","np.1s":"节省的审批时间","np.2n":"3 项申报","np.2s":"为门店总经理全程代办","np.3l":"Wakimasu 和牛","np.3n":"10 项要求","np.3s":"从日本工厂到纽约餐厅，逐项梳理"});
/* hero and before and after, from the Oct 17 redesign */
Object.assign(T.en, {"dv.h1":"Enterprise security","dv.h2":"with fine-grained controls","dv.tc":"Trust Center","dv.b1":"SOC 2","dv.b1s":"Type I in progress","dv.b2":"ISO 27001","dv.b2s":"In progress","dv.b3":"SCIM","dv.b3s":"Rolling out","dv.b4s":"In progress","dv.b5s":"In progress","dv.b6s":"In progress","dv.l1":"Your filings and documents are always yours","dv.l2":"Nothing filed or paid without your approval","dv.l3":"Comprehensive audit logs","dv.l4":"Agency logins kept in an encrypted vault","dv.l5":"Two-step sign-in for your whole team","dv.l6":"Encrypted in transit and at rest"});
Object.assign(T.zh, {"dv.h1":"企业级安全","dv.h2":"精细的权限控制","dv.tc":"信任中心","dv.b1":"SOC 2","dv.b1s":"Type I 审计进行中","dv.b2":"ISO 27001","dv.b2s":"进行中","dv.b3":"SCIM","dv.b3s":"即将上线","dv.b4s":"进行中","dv.b5s":"进行中","dv.b6s":"进行中","dv.l1":"您的申报和文件始终归您所有","dv.l2":"未经您批准，不申报、不付款","dv.l3":"完整的审计日志","dv.l4":"机构登录信息存放在加密保险库中","dv.l5":"全团队两步验证登录","dv.l6":"传输和存储全程加密"});
Object.assign(T.en, {"price.det":"See details","price.detsub":"The math on waiting, how Placetta compares, and the rent calculator.","price.moresub":"Renewals outside the plan, and the free plan preview.","foot.about":"About"});
Object.assign(T.zh, {"price.det":"查看详情","price.detsub":"等待的成本、与其他方式的对比，以及租金计算器。","price.moresub":"方案外的续期，以及免费的计划预览。","foot.about":"关于我们"});
Object.assign(T.en, {"diff.src": "Sources: <a href=\"https://permitplace.com/permit-expediter-cost-guide/\" target=\"_blank\" rel=\"noopener\">PermitPlace</a> (expediter, restaurant permits), BLS median pay for <a href=\"https://www.bls.gov/oes/current/oes111021.htm\" target=\"_blank\" rel=\"noopener\">operations managers</a> (May 2023), and <a href=\"https://www.bls.gov/ooh/legal/lawyers.htm\" target=\"_blank\" rel=\"noopener\">lawyers</a>, <a href=\"https://www.bls.gov/ooh/business-and-financial/compliance-officers.htm\" target=\"_blank\" rel=\"noopener\">compliance officers</a>, <a href=\"https://www.bls.gov/ooh/office-and-administrative-support/bookkeeping-accounting-and-auditing-clerks.htm\" target=\"_blank\" rel=\"noopener\">bookkeepers</a>, <a href=\"https://www.bls.gov/ooh/media-and-communication/interpreters-and-translators.htm\" target=\"_blank\" rel=\"noopener\">translators</a> and <a href=\"https://www.bls.gov/ooh/office-and-administrative-support/secretaries-and-administrative-assistants.htm\" target=\"_blank\" rel=\"noopener\">administrative assistants</a> (May 2025)", "diff.h": "Seven people on the clock, and still no permit", "diff.before": "Before", "diff.after": "After", "diff.2b": "7 → 1", "diff.2s": "Seven hires to pay and chase, down to one employee and Odelia", "diff.3b": "$500,000+", "diff.3s": "A year in salaries for six of them, before the expediter's fee", "diff.1b": "About 1 minute", "diff.1s": "From one line to a full plan", "diff.team": "One employee", "diff.with": "with", "hero.h1": "Your store is built.<br><em>Your permits aren't.</em>", "hero.note": "Four quick questions, about a minute. Nothing is filed or paid without your approval."});
Object.assign(T.zh, {"diff.src": "来源：<a href=\"https://permitplace.com/permit-expediter-cost-guide/\" target=\"_blank\" rel=\"noopener\">PermitPlace</a>（代办费，餐厅许可）、美国劳工统计局<a href=\"https://www.bls.gov/oes/current/oes111021.htm\" target=\"_blank\" rel=\"noopener\">运营经理</a>（2023 年 5 月），以及<a href=\"https://www.bls.gov/ooh/legal/lawyers.htm\" target=\"_blank\" rel=\"noopener\">律师</a>、<a href=\"https://www.bls.gov/ooh/business-and-financial/compliance-officers.htm\" target=\"_blank\" rel=\"noopener\">合规专员</a>、<a href=\"https://www.bls.gov/ooh/office-and-administrative-support/bookkeeping-accounting-and-auditing-clerks.htm\" target=\"_blank\" rel=\"noopener\">会计</a>、<a href=\"https://www.bls.gov/ooh/media-and-communication/interpreters-and-translators.htm\" target=\"_blank\" rel=\"noopener\">翻译</a>与<a href=\"https://www.bls.gov/ooh/office-and-administrative-support/secretaries-and-administrative-assistants.htm\" target=\"_blank\" rel=\"noopener\">行政助理</a>（2025 年 5 月）薪酬中位数", "diff.h": "请了七个人，执照还是没下来", "diff.before": "之前", "diff.after": "之后", "diff.2b": "7 → 1", "diff.2s": "要雇、要催的 7 个人，变成一名员工加 Odelia", "diff.3b": "50 万美元以上", "diff.3s": "其中六个人一年的薪酬，还不算许可代办费", "diff.1b": "约 1 分钟", "diff.1s": "从一句话到完整的开店计划", "diff.team": "一名员工", "diff.with": "携手", "hero.h1": "店装好了，<br><em>执照还没下来。</em>", "hero.note": "4 个简单问题，约一分钟。未经您批准，不提交、不付款。"});
/* Oct 18 section pass: new strings for the sections changed that day */
// the store plan month to month (founder, 2026-10-23): the pricing card's Yearly and Monthly choice
Object.assign(T.en, {"price.int": "Billing", "price.yr": "Yearly", "price.mo": "Monthly", "price.mv": "$179", "price.mps": "Billed monthly, cancel anytime", "c96.c2y": "Billed yearly, plus $149 a license when approved", "c96.c2m": "$179 a store a month", "c96.c2ms": "Billed monthly, cancel anytime, plus $149 a license when approved"});
Object.assign(T.zh, {"price.int": "计费方式", "price.yr": "按年", "price.mo": "按月", "price.mv": "179 美元", "price.mps": "按月计费，可随时取消", "c96.c2y": "按年计费，另加每项执照获批时 149 美元", "c96.c2m": "每家门店每月 179 美元", "c96.c2ms": "按月计费，可随时取消，另加每项执照获批时 149 美元"});
Object.assign(T.en, {"map.ccnt": "{m}: {n} city and county permits and filings in our form library, plus the state's {s} and {f} federal.", "map.ccnt0": "{m}: its city and county forms are researched when you start a plan there.", "map.cnt": "{m}: {n} permits and filings in our form library, {s} state and {l} city and county, plus {f} federal.", "map.cnt0": "{m}: {f} federal filings in our form library. Its state and city forms are researched when you start a plan.", "map.tipn": "{n} state and local forms", "final.h": "<span class=\"l1\">Stop paying rent on an empty store.</span><span class=\"l2\">Hire Odelia.</span>", "wt.h": "Answer from the app your team already uses", "ch.aria": "Channels", "ch.wechat": "WeChat", "ch.slack": "Slack", "ch.lark": "Lark / 飞书", "ch.wa": "WhatsApp", "ch.im": "iMessage", "ch.mail": "Email", "ch.tel": "Phone", "ch.note": "Text Odelia on WhatsApp or iMessage, email her, call her, or add her to your team's Slack or Lark. Our team is on WeChat.", "ch.add": "Add us on WeChat", "ch.qr": "Scan with WeChat to add Placetta", "price.x": "Less than an expediter, for every store you open.", "price.xsub": "A permit expediter charges $2,000 to $7,500 to open one restaurant, before agency fees, in one city. On Placetta a typical restaurant opening is $3,339, each license charged when it's approved, and nothing for one turned down because of a mistake on our side.", "price.src": "Source: <a href=\"https://permitplace.com/permit-expediter-cost-guide/\" target=\"_blank\" rel=\"noopener\">PermitPlace, permit expediter costs</a>", "price.lu": "per store a month", "price.inc": "Included", "price.i1": "Every license and renewal date tracked, with alerts", "price.i2": "Renewals Odelia files on her own, included", "price.i3": "Staff certificates and vendor proof for every store", "price.i4": "Rule-change alerts for your markets", "price.i5": "Your document vault, and Odelia for your whole team", "price.i6": "English and Chinese, for your whole team", "price.more": "More plans", "price.moresub": "Renewals outside the plan, and the free plan preview.", "fr.hqv": "Headquarters sees each store's status, never its documents.", "sec.trust": "Visit our Trust Center", "sec.soc": "In preparation. We have no SOC 2 report yet, and our Trust Center shows where each control stands.", "sec.det": "Details →", "mon.st": "Store affected", "mon.usd": "At stake", "mon.save": "You could save", "mon.smp": "Sample", "pt.f5": "Hours of operation", "pt.who": "Your answer, in WeChat", "pt.tr": "Translated from your answer in Chinese", "pt.rc": "Application received", "pt.rc1": "Confirmation no.", "pt.rc2": "Form", "pt.rc3": "Submitted", "pt.rc3v": "Oct 18, 2026, 10:42 AM", "pt.rcs": "Sample receipt, saved to your documents", "hw.more": "3 more, through the certificate of occupancy", "hw.mo": "January 2027", "ts.h": "Don't just take our word for it.", "in.h": "Every kind of store has its own permits.", "in.pm": "Permits", "app.ask": "Opening a tea house in San José. What do I need?"});
Object.assign(T.zh, {"map.ccnt": "{m}：我们的表格库中有市县级许可与申报 {n} 项，另有州级 {s} 项和联邦 {f} 项。", "map.ccnt0": "{m}：在您开始计划时，我们会逐项调研当地市县的表格。", "map.cnt": "{m}：我们的表格库中有 {n} 项许可与申报，州级 {s} 项，市县级 {l} 项，另有联邦 {f} 项。", "map.cnt0": "{m}：表格库中有联邦 {f} 项。该州和城市的表格会在您开始计划时逐项调研。", "map.tipn": "州和地方表格 {n} 项", "final.h": "<span class=\"l1\">别再为空店付房租。</span><span class=\"l2\">让 Odelia 加入您的团队。</span>", "wt.h": "在团队常用的应用里直接回复", "ch.aria": "沟通渠道", "ch.wechat": "微信", "ch.slack": "Slack", "ch.lark": "飞书", "ch.wa": "WhatsApp", "ch.im": "iMessage", "ch.mail": "邮件", "ch.tel": "电话", "ch.note": "在 WhatsApp 或 iMessage 上给 Odelia 发消息、发邮件、打电话，或把她加入团队的 Slack 或飞书。我们的团队在微信上。", "ch.add": "添加我们的微信", "ch.qr": "用微信扫码添加快哉", "price.x": "每开一家店，都比代办公司更省。", "price.xsub": "许可代办公司办一家餐厅开业收费 2,000 至 7,500 美元，不含政府规费，且只做一个城市。在快哉，一次典型的餐厅开业为 3,339 美元，每项执照在获批时收费，因我们的失误被退回的不收费。", "price.src": "来源：<a href=\"https://permitplace.com/permit-expediter-cost-guide/\" target=\"_blank\" rel=\"noopener\">PermitPlace，许可代办费用</a>", "price.lu": "每家门店每月", "price.inc": "包含", "price.i1": "跟踪每一项执照与续期日期，并提醒", "price.i2": "Odelia 自行提交的续期，全部包含", "price.i3": "每家门店的员工证书与供应商凭证", "price.i4": "您所在市场的规则变化提醒", "price.i5": "文件库，以及全团队可用的 Odelia", "price.i6": "中英文双语，全团队可用", "price.more": "更多方案", "price.moresub": "方案外的续期，以及免费的计划预览。", "fr.hqv": "总部能看到每家门店的进度，但看不到门店的文件。", "sec.trust": "查看信任中心", "sec.soc": "准备中。我们目前还没有 SOC 2 报告，信任中心列出了每项控制的进展。", "sec.det": "详情 →", "mon.st": "受影响门店", "mon.usd": "涉及金额", "mon.save": "可节省", "mon.smp": "示例", "pt.f5": "营业时间", "pt.who": "您在微信里的回答", "pt.tr": "根据您的中文回答译成英文", "pt.rc": "申请已受理", "pt.rc1": "受理编号", "pt.rc2": "表格", "pt.rc3": "提交时间", "pt.rc3v": "2026年10月18日 上午10:42", "pt.rcs": "示例回执，已存入您的文件", "hw.more": "还有 3 项，直到使用许可证", "hw.mo": "2027年1月", "ts.h": "别只听我们说。", "in.h": "每一种店，都有自己的一套许可。", "in.pm": "许可", "app.ask": "我要在圣何塞开一家茶饮店，需要办哪些手续？"});
/* land95 (Oct 21): the trust and security sections, and the folds and tabs that shorten the page */
Object.assign(T.en, {"sc.ip": "In place", "sc.in": "Placetta holds no security certification yet. Each control here is marked as it stands today.", "sc.rp": "Report a security issue", "sc.ct": "Security contact", "sc.p1": "Encrypted in transit with TLS 1.2 or newer, and at rest", "sc.p2": "Saved agency logins kept in Supabase Vault, readable only by our server", "sc.p3": "Two-step sign-in for your team, and required for our staff before they open customer records", "sc.p4": "Card payments handled by Stripe; we never see full card numbers", "sc.p5": "Placetta doesn't use your content to train AI models, and doesn't sell it", "sc.p6": "Every sign-in recorded in the audit trail", "sc.p7": "SOC 2 Type I audit", "sc.p8": "Written confirmation from each AI provider that it keeps none of what we send", "sc.sh": "Where your data goes", "sc.s1": "Database, files and sign-in, in its US East region", "sc.s2": "Hosts placetta.com and the app", "sc.s3": "Plan payments", "sc.s4": "Sign-in links, reminders and filing updates by email", "sc.s5": "Claude AI models", "sc.s6": "Runs portal filing, in Oregon", "sc.sa": "All subprocessors, and the AI models used only when needed", "trust.in": "Licensed people step in wherever the law requires them."});
Object.assign(T.zh, {"sc.ip": "已上线", "sc.in": "快哉目前尚未取得任何安全认证。以下每项控制都按目前的实际进展标注。", "sc.rp": "报告安全问题", "sc.ct": "安全联系邮箱", "sc.p1": "传输中使用 TLS 1.2 或更高版本加密，存储时同样加密", "sc.p2": "保存的政府网站登录信息存放在 Supabase Vault 中，只有我们的服务器可以读取", "sc.p3": "您的团队可开启两步验证登录；我们的员工必须通过两步验证才能查看客户记录", "sc.p4": "银行卡付款由 Stripe 处理，我们看不到完整卡号", "sc.p5": "快哉不会用您的内容训练 AI 模型，也不会出售您的内容", "sc.p6": "每次登录都记入审计记录", "sc.p7": "SOC 2 Type I 审计", "sc.p8": "各 AI 服务商书面确认不保留我们发送的任何内容", "sc.sh": "您的数据交给谁处理", "sc.s1": "数据库、文件存储和登录，位于其美国东部区域", "sc.s2": "托管 placetta.com 和应用", "sc.s3": "套餐付款", "sc.s4": "通过邮件发送登录链接、提醒和申报进展", "sc.s5": "Claude AI 模型", "sc.s6": "运行政府网站申报，位于俄勒冈州", "sc.sa": "全部数据处理方，以及仅在需要时使用的 AI 模型", "trust.in": "凡是法律要求持牌专业人士办理的环节，都由他们负责。"});
Object.assign(T.en, {"sc.h1": "Enterprise security", "sc.h2": "with every step on the record", "sc.b1": "SOC 2 Type I", "sc.b1s": "In progress", "sc.b2": "SAML 2.0 SSO", "sc.b2s": "Rolling out", "sc.b3": "SCIM 2.0", "sc.b3s": "Rolling out", "sc.l1": "Owner, admin, member and viewer roles, enforced by the database", "sc.l2": "SAML 2.0 single sign-on, plus Google Workspace, Microsoft Entra ID and OpenID Connect sign-in", "sc.l3": "Single sign-on required for everyone at your verified email domain", "sc.l4": "SCIM 2.0 provisioning for users and groups", "sc.r1": "An append-only audit trail, exportable as CSV", "sc.r2": "Each portal filing runs in its own new browser session, with its temporary files deleted after", "sc.r3": "Nothing filed or paid without your approval", "sc.r4": "Every requirement linked to its official source", "sc.note": "Roles, single sign-on, SCIM and the audit trail are rolling out now. Our Trust Center shows where each control stands."});
Object.assign(T.zh, {"sc.h1": "企业级安全", "sc.h2": "每一步都有据可查", "sc.b1": "SOC 2 Type I", "sc.b1s": "进行中", "sc.b2": "SAML 2.0 单点登录", "sc.b2s": "陆续上线", "sc.b3": "SCIM 2.0", "sc.b3s": "陆续上线", "sc.l1": "所有者、管理员、成员和查看者四种角色，由数据库强制执行", "sc.l2": "SAML 2.0 单点登录，并支持 Google Workspace、Microsoft Entra ID 和 OpenID Connect 登录", "sc.l3": "可要求您已验证邮箱域名下的所有人使用单点登录", "sc.l4": "通过 SCIM 2.0 开通和停用用户与用户组", "sc.r1": "只增不改的审计记录，可导出为 CSV", "sc.r2": "每次在政府网站上的申报都在全新的浏览器会话中进行，临时文件随后删除", "sc.r3": "未经您批准，不提交、不付款", "sc.r4": "每项要求都附官方来源链接", "sc.note": "角色、单点登录、SCIM 和审计记录正在陆续上线。信任中心列出每项控制的进展。"});
Object.assign(T.en, {"h95.aria": "What Odelia does", "h95.t1": "Maps and files", "h95.t2": "Joins your team", "h95.t3": "Works in portals", "h95.t4": "Asks first"});
Object.assign(T.zh, {"h95.aria": "Odelia 的工作", "h95.t1": "梳理与申报", "h95.t2": "加入您的团队", "h95.t3": "在政府网站上办理", "h95.t4": "先问再办"});
Object.assign(T.en, {"hero.subm": "Odelia, our AI agent, gets every license you need to open. You approve.", "p95.aria": "Why it pays", "p95.t2": "Three ways to open", "f95.all": "Show all {n} questions", "f95.less": "Show fewer", "m95.more": "Show deadlines and all markets", "m95.less": "Hide deadlines and markets", "in95.all": "Show all {n} industries", "in95.less": "Show fewer"});
Object.assign(T.zh, {"p95.aria": "为什么划算", "p95.t2": "三种开店方式", "f95.all": "显示全部 {n} 个问题", "f95.less": "收起", "m95.more": "查看截止日期和全部市场", "m95.less": "收起截止日期和市场", "in95.all": "显示全部 {n} 个行业", "in95.less": "收起"});
/* land96 (Oct 23): the comparison table above the price cards, and the folds that shorten the page */
Object.assign(T.en, {"c96.h": "Three ways to open a store. <em>Only one gets you open sooner.</em>", "c96.sub": "Every opening needs the same licenses. What changes is your team's time, the cost, who files them and who keeps them current.", "c96.cap": "Doing it yourself, a permit expediter and Placetta, compared", "c96.a": "Do it yourself", "c96.b": "A permit expediter", "c96.c": "Placetta", "c96.r1": "Your team's time", "c96.r2": "Cost", "c96.r3": "Who files", "c96.r4": "After opening", "c96.a1": "40 to 120 hours", "c96.est": "Estimate", "c96.b1": "Calls and emails", "c96.c1": "About 1 hour of approvals", "c96.a2": "Your time, plus fines", "c96.b2": "$2,000 to $7,500", "c96.b2s": "Usually one city", "c96.c2": "$149 a store a month", "c96.c2s": "plus $149 a license when approved", "c96.a3": "You do", "c96.b3": "The expediter", "c96.c3": "Odelia files it for you", "c96.a4": "Renewals are on you", "c96.b4": "Ends on opening day", "c96.c4": "Renewals and inspections handled for as long as you're open", "c96.xs": "For one restaurant opening, before agency fees, usually one city", "c96.typl": "A typical restaurant opening in San José", "c96.typv": "11 licenses, Placetta $3,339", "c96.typs": "9 at $149 and 2 at $999, from Placetta's own plan for a restaurant there. Agency fees at cost.", "c96.yr": "Placetta, this year", "c96.cs": "Stores", "c96.cl": "New licenses this year", "c96.outs0": "1 store × $149 × 12 months, plus 9 licenses at $149 and 2 at $999", "c96.vs": "For each opening, before agency fees, usually in one city", "c96.src": "Expediter range: <a href=\"https://permitplace.com/permit-expediter-cost-guide/\" target=\"_blank\" rel=\"noopener\">PermitPlace</a>, for a restaurant opening, before agency fees. Hours are Placetta's estimates, not measured. A liquor license, building plan review or import permit is $999. A month counts as 4.33 weeks.", "wt96.sub": "WhatsApp, iMessage, email, a phone call, Slack or Lark with Odelia, and WeChat with our team.", "ag96.sub": "50 US states, 170+ countries and every agency Placetta files with, on one map.", "price.detsub": "The math on waiting."});
Object.assign(T.zh, {"c96.h": "开一家店，三种方式。<em>只有一种让您更早开业。</em>", "c96.sub": "每次开店需要的执照都一样。不同的是团队花的时间、费用、由谁提交，以及由谁持续跟进。", "c96.cap": "自己办理、许可代办公司与快哉的对比", "c96.a": "自己办理", "c96.b": "许可代办公司", "c96.c": "快哉", "c96.r1": "团队花的时间", "c96.r2": "费用", "c96.r3": "由谁提交", "c96.r4": "开业之后", "c96.a1": "40 至 120 小时", "c96.est": "估算", "c96.b1": "电话和邮件往来", "c96.c1": "约 1 小时，用于审批", "c96.a2": "您的时间，外加罚款", "c96.b2": "2,000 至 7,500 美元", "c96.b2s": "通常只做一个城市", "c96.c2": "每家门店每月 149 美元", "c96.c2s": "另加每项执照获批时 149 美元", "c96.a3": "您自己", "c96.b3": "代办公司", "c96.c3": "Odelia 替您提交", "c96.a4": "续期全靠自己", "c96.b4": "开业当天就结束", "c96.c4": "只要门店在营业，续期和检查都替您处理", "c96.xs": "一家餐厅开业，不含政府规费，通常只做一个城市", "c96.typl": "圣何塞一家餐厅的典型开业", "c96.typv": "11 项执照，快哉 3,339 美元", "c96.typs": "9 项每项 149 美元，2 项每项 999 美元，依据快哉为当地一家餐厅制定的计划。机构规费按实际金额。", "c96.yr": "快哉，今年", "c96.cs": "门店数", "c96.cl": "今年新办执照数", "c96.outs0": "1 家门店 × 149 美元 × 12 个月，另加 9 项执照每项 149 美元、2 项每项 999 美元", "c96.vs": "每次开店，不含政府规费，通常只做一个城市", "c96.src": "代办费用区间：<a href=\"https://permitplace.com/permit-expediter-cost-guide/\" target=\"_blank\" rel=\"noopener\">PermitPlace</a>，一家餐厅开业，不含政府规费。小时数为快哉的估算，并非实测。酒类执照、建筑图纸审查或进口许可每项 999 美元。每月按 4.33 周计算。", "wt96.sub": "通过 WhatsApp、iMessage、邮件、电话、Slack 或飞书联系 Odelia，通过微信联系我们的团队。", "ag96.sub": "美国 50 个州、170 多个国家和地区，以及快哉经手的每一个机构，尽在一张地图上。", "price.detsub": "等待的成本。"});
/* v95 (Oct 23): the comparison is attorney, expediter, Placetta; every figure cited in c96.src */
Object.assign(T.en, {"c96.sub": "Every opening needs the same licenses. What changes is the cost, who files them and who keeps them current.", "c96.cap": "An attorney, a permit expediter and Placetta, compared", "c96.a": "With an attorney", "c96.a2": "$378 an hour", "c96.a2s": "Average for business formation and compliance work", "c96.a3": "The attorney's office, billed by the hour", "c96.a4": "Each renewal billed again", "c96.r5": "How long", "c96.w": "The agencies set the clock, whoever files.", "c96.ws": "A building permit took 68 days in Los Angeles and 89 in New York City.", "c96.src": "Attorney rate: <a href=\"https://www.clio.com/resources/legal-trends/compare-lawyer-rates/\" target=\"_blank\" rel=\"noopener\">Clio Legal Trends</a>, average lawyer rate for business formation and compliance, 2025. Expediter range: <a href=\"https://permitplace.com/permit-expediter-cost-guide/\" target=\"_blank\" rel=\"noopener\">PermitPlace</a>, for a restaurant opening, before agency fees. Building permit days: <a href=\"https://subnational.doingbusiness.org/content/dam/doingBusiness/country/u/united-states/USA.pdf\" target=\"_blank\" rel=\"noopener\">World Bank, Doing Business 2020</a>. A liquor license, building plan review or import permit is $999. A month counts as 4.33 weeks.", "bk.more": "See all {n}", "cn.sum": "Your team in China and your team in the US see the same plan, in Chinese or English.", "price.more": "More plans", "price.moresub": "A chain of 10 stores, renewals outside the plan, and the free plan preview."});
Object.assign(T.zh, {"c96.sub": "每次开店需要的执照都一样。不同的是费用、由谁提交，以及由谁持续跟进。", "c96.cap": "律师、许可代办公司与快哉的对比", "c96.a": "请律师", "c96.a2": "每小时 378 美元", "c96.a2s": "企业设立与合规业务的平均费率", "c96.a3": "律师事务所，按小时计费", "c96.a4": "每次续期另行计费", "c96.r5": "需要多久", "c96.w": "无论由谁提交，时间都由政府机构决定。", "c96.ws": "办理一项建筑许可，洛杉矶用时 68 天，纽约市 89 天。", "c96.src": "律师费率：<a href=\"https://www.clio.com/resources/legal-trends/compare-lawyer-rates/\" target=\"_blank\" rel=\"noopener\">Clio《法律趋势报告》</a>，2025 年企业设立与合规业务的律师平均费率。代办费用区间：<a href=\"https://permitplace.com/permit-expediter-cost-guide/\" target=\"_blank\" rel=\"noopener\">PermitPlace</a>，一家餐厅开业，不含政府规费。建筑许可天数：<a href=\"https://subnational.doingbusiness.org/content/dam/doingBusiness/country/u/united-states/USA.pdf\" target=\"_blank\" rel=\"noopener\">世界银行《营商环境报告 2020》</a>。酒类执照、建筑图纸审查或进口许可每项 999 美元。每月按 4.33 周计算。", "cn.sum": "中国团队和美国团队看到同一份计划，中英文均可。", "price.more": "更多方案", "price.moresub": "10 家门店的连锁示例、方案外的续期，以及免费的计划预览。"});
/* land96: lines built from the city a visitor typed; T["en"] keeps them out of the crawler copy */
Object.assign(T.en, {"c96.fair": "<b>Expediter:</b> opening only, one city. <b>Placetta:</b> opening plus a full year kept current, any city.", "c96.vh": "What opening sooner is worth to you", "c96.vrl": "Monthly rent", "c96.vrph": "12,000", "c96.vsl": "Weekly sales once open <i>Optional</i>", "c96.vsph": "15,000", "c96.vwl": "If you open", "c96.vwr": "sooner", "c96.vnote": "Weeks sooner is your own assumption, not a Placetta promise. Placetta has no customer averages to quote yet.", "c96.vemp": "Type your rent to see what every week sooner is worth to you.", "c96.vr": "Rent you stop paying on an empty store", "c96.vs": "Sales you start earning sooner", "c96.vp": "Placetta, opening plus a year", "c96.vrs0": "Rent ÷ 4.33 weeks a month × weeks sooner", "c96.vss0": "Weekly sales × weeks sooner, if you add them", "c96.vpv0": "−$5,127", "c96.vchg": "Change stores or licenses", "c96.chex": "A chain of 10 stores, for example", "c96.chxl": "Permit expediters", "c96.chx0": "$20,000 to $75,000", "c96.chxs0": "10 openings × $2,000 to $7,500. Openings only, usually one city each.", "c96.chpl": "Placetta", "c96.chp0": "$17,880", "c96.chps0": "10 stores × $149 × 12 months, every new license included. Openings plus a year kept current, any city.", "c96.chsl": "You keep", "c96.chs0": "$2,120 to $57,120", "c96.chss": "Against the expediter range, before agency fees, which you pay either way.", "c96.chmine": "Use my number of stores", "c96.w1": "1 week", "c96.w2": "2 weeks", "c96.w3": "3 weeks", "c96.w4": "4 weeks", "c96.w5": "5 weeks", "c96.w6": "6 weeks", "c96.w7": "7 weeks", "c96.w8": "8 weeks"});
Object.assign(T.zh, {"c96.fair": "<b>代办公司：</b>只管开业，通常一个城市。<b>快哉：</b>开业加一整年持续跟进，任何城市。", "c96.vh": "提前开业，对您值多少", "c96.vrl": "月租金", "c96.vrph": "12,000", "c96.vsl": "开业后每周销售额 <i>选填</i>", "c96.vsph": "15,000", "c96.vwl": "如果提前", "c96.vwr": "开业", "c96.vnote": "提前几周由您自己假设，并非快哉的承诺。快哉目前还没有可引用的客户平均数据。", "c96.vemp": "输入您的租金，看看每提前一周对您值多少。", "c96.vr": "空店少付的房租", "c96.vs": "提前赚到的销售额", "c96.vp": "快哉，开业加一年", "c96.vrs0": "月租金 ÷ 每月 4.33 周 × 提前周数", "c96.vss0": "每周销售额 × 提前周数（如您填写）", "c96.vpv0": "−5,127 美元", "c96.vchg": "修改门店数或执照数", "c96.chex": "以 10 家门店的连锁品牌为例", "c96.chxl": "许可代办公司", "c96.chx0": "20,000 至 75,000 美元", "c96.chxs0": "10 次开店 × 2,000 至 7,500 美元。只管开业，通常每次一个城市。", "c96.chpl": "快哉", "c96.chp0": "17,880 美元", "c96.chps0": "10 家门店 × 149 美元 × 12 个月，所有新执照全部包含。开业加一整年持续跟进，任何城市。", "c96.chsl": "您省下", "c96.chs0": "2,120 至 57,120 美元", "c96.chss": "与代办费用区间相比，不含政府规费（两种方式都要支付）。", "c96.chmine": "用我的门店数计算", "c96.w1": "1 周", "c96.w2": "2 周", "c96.w3": "3 周", "c96.w4": "4 周", "c96.w5": "5 周", "c96.w6": "6 周", "c96.w7": "7 周", "c96.w8": "8 周"});
Object.assign(T["en"], {"c96.vlede": "Every week sooner is worth", "c96.vto": "to you", "c96.vpay": "Pays for itself in {d} days", "c96.vpay1": "Pays for itself in 1 day", "c96.vrs": "{rent} ÷ 4.33 × {w}", "c96.vss": "{sales} × {w}", "c96.xst": " × {s} stores", "c96.vnet": "Net, if you open {w} sooner", "c96.chh": "Opening {n} stores", "c96.chxs": "{n} openings × $2,000 to $7,500. Openings only, usually one city each.", "c96.chps10": "{n} stores × $149 × 12 months, every new license included. Openings plus a year kept current, any city.", "c96.chps": "{n} openings with their licenses, plus a year kept current, any city.", "c96.chup": "Up to", "c96.chupss": "Less than the expediter's high end, before agency fees.", "c96.chmore": "More than an expediter's high end", "c96.chmoress": "For openings plus a year kept current at every store. An expediter stops on opening day."});
Object.assign(T["zh"], {"c96.vlede": "每提前一周开业，对您值", "c96.vto": "", "c96.vpay": "{d} 天就回本", "c96.vpay1": "1 天就回本", "c96.vrs": "{rent} ÷ 4.33 × {w}", "c96.vss": "{sales} × {w}", "c96.xst": " × {s} 家门店", "c96.vnet": "提前 {w}开业的净收益", "c96.chh": "开 {n} 家门店", "c96.chxs": "{n} 次开店 × 2,000 至 7,500 美元。只管开业，通常每次一个城市。", "c96.chps10": "{n} 家门店 × 149 美元 × 12 个月，所有新执照全部包含。开业加一整年持续跟进，任何城市。", "c96.chps": "{n} 次开店及所需执照，加一整年持续跟进，任何城市。", "c96.chup": "最多省下", "c96.chupss": "低于代办费用区间上限，不含政府规费。", "c96.chmore": "高于代办费用区间上限", "c96.chmoress": "包含每家门店开业及一整年持续跟进；代办公司在开业当天就结束。"});
Object.assign(T["en"], {"c96.you": "For your store in {city}", "c96.youv": "{n} licenses, Placetta {usd}", "c96.yous": "{a} at $149 and {b} at $999, from Placetta's own plan for a restaurant in {city}. Agency fees at cost.", "c96.none": "Your free plan preview counts every license and prices each one", "c96.nones": "Placetta's plan for {city} is mapped when you start, and each license shows its price before you approve it.", "c96.outs": "{s} × $149 × 12 months, plus {l} licenses from $149", "c96.outc": "{s} stores × $149 × 12 months. With 10 or more stores, new licenses are included.", "c96.outx": "{s} × $149 × 12 months, plus {a} licenses at $149 and {b} at $999", "c96.st1": "1 store", "c96.stn": "{n} stores", "c96.from": "From {usd}"});
Object.assign(T["zh"], {"c96.you": "您在 {city} 的门店", "c96.youv": "{n} 项执照，快哉 {usd}", "c96.yous": "{a} 项每项 149 美元，{b} 项每项 999 美元，依据快哉为 {city} 一家餐厅制定的计划。机构规费按实际金额。", "c96.none": "免费计划预览会列出每一项执照并逐项报价", "c96.nones": "开始后，快哉会为 {city} 梳理完整计划，每项执照在您批准前显示价格。", "c96.outs": "{s} × 149 美元 × 12 个月，另加 {l} 项执照，每项 149 美元起", "c96.outc": "{s} 家门店 × 149 美元 × 12 个月。门店达 10 家及以上，新执照全部包含。", "c96.outx": "{s} × 149 美元 × 12 个月，另加 {a} 项执照每项 149 美元、{b} 项每项 999 美元", "c96.st1": "1 家门店", "c96.stn": "{n} 家门店", "c96.from": "{usd}起"});
Object.assign(T.en, {"h95.t5": "Tracks rule changes"});
Object.assign(T.zh, {"h95.t5": "追踪规则变化"});
Object.assign(T.en, {"g95.all": "Show all {n}", "g95.less": "Show fewer", "ag95.all": "Show all {n} regions", "calc95.open": "Try it with your rent", "calc95.less": "Hide the calculator"});
Object.assign(T.zh, {"g95.all": "显示全部 {n} 项", "g95.less": "收起", "ag95.all": "显示全部 {n} 个地区", "calc95.open": "用您的租金算一算", "calc95.less": "收起计算器"});
/* ===== THE PAYOFF LINE (Oct 23). The founder's one line, and every place it shows: the desktop and phone subs under the
   headline, the pricing headline and the final call to action. To swap the line, change these eight strings and nothing
   else; the crawler copy (npm run seo) picks them up from here. */
Object.assign(T.en, {"hero.sub": "Placetta's AI agent, Odelia, gets every federal, state and city license you need to open in a new market, so you start making money sooner.", "hero.subm": "Odelia gets every license you need, so you start making money sooner.", "c96.h": "Start making money sooner. <em>For less than an expediter.</em>", "final.h": "<span class=\"l1\">Start making money sooner.</span><span class=\"l2\">Hire Odelia.</span>"});
Object.assign(T.zh, {"hero.sub": "快哉的 AI 助手 Odelia 为您办好进入新市场所需的每一项联邦、州和城市执照，让您更快开始赚钱。", "hero.subm": "Odelia 办好您需要的每一项执照，让您更快开始赚钱。", "c96.h": "更快开始赚钱。<em>花得比找代办公司还少。</em>", "final.h": "<span class=\"l1\">更快开始赚钱。</span><span class=\"l2\">让 Odelia 加入您的团队。</span>"});
/* land97 (Oct 24): the sample workspace from the hero, the folds, the trust strip, and the store plan month to month in every price line */
Object.assign(T.en, {"hero.see": "See it working, no signup", "cs97.h": "Case studies and example plans", "cs97.sub": "What we mapped for real openings, and five tea houses' plans, step by step.", "xp96.h": "Our experts previously worked at", "xp96.sub": "Advisors who worked at the U.S. FDA, U.S. Customs, Harvard, MIT and more.", "calc97.h": "Your numbers: a typical opening, and what sooner is worth", "calc97.sub": "A typical restaurant opening, priced line by line, and a calculator for your rent.", "m97.aria": "More about Placetta",
  "tr97.tc": "Trust Center: security, AI, subprocessors and your rights", "tr97.encs": "Encrypted in transit and at rest. Your filings and documents are always yours.", "tr97.acc": "Two-step sign-in and audit logs", "tr97.accs": "For your whole team, with every action on the record.", "tr97.soc": "Your data, your rights", "tr97.socs": "What we keep, who processes it, and how to export or delete it, on our Trust Center.",
  "tr97.legal": "Placetta is not a law firm and is not affiliated with any government agency. <a href=\"/trust\">Trust Center</a>, <a href=\"privacy.html\" data-legal=\"privacy.html\">Privacy</a>, <a href=\"terms.html\" data-legal=\"terms.html\">Terms</a>.",
  "st.note": "$149 a store a month billed yearly, or $179 month to month, cancel anytime. New licenses $149, charged when approved. Turned down because of a mistake on our side, you pay nothing. Your plan preview is free.",
  "price.sub": "$149 a store a month on the store plan, billed yearly, or $179 month to month. Each new license $149 when it's approved, or $999 for a liquor license, building plan review or an import permit. If one is turned down because of a mistake on our side, you pay nothing. Each franchisee pays for its own stores."});
Object.assign(T.zh, {"hero.see": "免注册，看看实际效果", "cs97.h": "客户案例与示例方案", "cs97.sub": "我们为真实开店梳理的计划，以及五家茶企的示例方案，逐步呈现。", "xp96.h": "我们的专家曾任职于", "xp96.sub": "顾问曾任职于美国食品药品监督管理局、美国海关、哈佛、麻省理工等机构。", "calc97.h": "算一算：典型开店费用，以及早开业值多少", "calc97.sub": "一家典型餐厅开业的逐项价格，以及按您房租计算的工具。", "m97.aria": "更多关于快哉",
  "tr97.tc": "信任中心：安全、AI、数据处理方与您的权利", "tr97.encs": "传输和存储全程加密。您的申报和文件始终归您所有。", "tr97.acc": "两步验证登录与审计日志", "tr97.accs": "适用于全团队，每一步操作都有记录。", "tr97.soc": "您的数据，您的权利", "tr97.socs": "我们保存什么、由谁处理、如何导出或删除，都写在信任中心。",
  "tr97.legal": "快哉不是律师事务所，也不隶属于任何政府机构。<a href=\"/trust\">信任中心</a>、<a href=\"privacy.html\" data-legal=\"privacy.html\">隐私政策</a>、<a href=\"terms.html\" data-legal=\"terms.html\">服务条款</a>。",
  "st.note": "门店方案每家门店每月 149 美元（按年计费），或按月 179 美元，可随时取消。新执照每项 149 美元，获批时收取；如因我们的失误被退回，您无需付费。计划预览免费。",
  "price.sub": "门店方案每家门店每月 149 美元，按年计费，或按月 179 美元。每项新执照获批时收取 149 美元，酒类执照、建筑图纸审查或进口许可每项 999 美元。如因我们的失误被退回，您无需付费。每位加盟商为自己的门店付费。"});

/* c98 (Oct 27): the comparison's rows are questions, a status row, Placetta's own line on how long, and the price
   with its number set large (renderPrice writes it as HTML) */
Object.assign(T.en, {"c98.q1": "What does it cost?", "c98.q2": "Who files?", "c98.q3": "What happens after opening?", "c98.q4": "How do you see where it stands?", "c98.q5": "How long does it take?", "c96.c2": "<em>$149</em> a store a month", "c96.c2m": "<em>$179</em> a store a month", "c96.c4": "Renewals and inspections handled, so you can focus on scaling.", "c98.sa": "Ask the office", "c98.sb": "Ask the expediter", "c98.su": "Every license, live in your dashboard", "c98.l": "Filed once you approve", "c98.ls": "Odelia follows up until the agency decides."});
Object.assign(T.zh, {"c98.q1": "费用多少？", "c98.q2": "谁来提交？", "c98.q3": "开业之后呢？", "c98.q4": "进度怎么查？", "c98.q5": "要多久？", "c96.c2": "每家门店每月<em>149 美元</em>", "c96.c2m": "每家门店每月<em>179 美元</em>", "c96.c4": "续期和检查都替您办好，您只管专心扩张。", "c98.sa": "去问律师事务所", "c98.sb": "去问代办公司", "c98.su": "每项执照的进度，在看板上实时可见", "c98.l": "您一批准就提交", "c98.ls": "Odelia 持续跟进，直到机构作出决定。"});
/* c99 (Oct 27): the comparison reads like a pricing table: one short line a cell, the rest on a muted line under it */
Object.assign(T.en, {"c99.a3": "The attorney's office", "c99.a3s": "Billed by the hour", "c99.c4": "Renewals and inspections handled", "c99.c4s": "So you can focus on scaling."});
Object.assign(T.zh, {"c99.a3": "律师事务所", "c99.a3s": "按小时计费", "c99.c4": "续期和检查都替您办好", "c99.c4s": "您只管专心扩张。"});

Object.assign(T.en, {"vs.1": "Mapped 8 licenses and permits", "vs.2": "Prepared the health permit packet", "vs.3": "Waiting for your approval", "vs.3d": "You approved it", "vs.4": "Filed with Santa Clara County DEH", "vs.okd": "Approved"});
Object.assign(T.zh, {"vs.1": "梳理出 8 项执照和许可", "vs.2": "备好卫生许可申请材料", "vs.3": "等待您批准", "vs.3d": "您已批准", "vs.4": "已提交至圣克拉拉县环境卫生局", "vs.okd": "已批准"});
/* land98: the hero's live count and the pay-and-safety band under the price table */
Object.assign(T.en, {"hc.empty": "You know about a few of your licenses. Type your city to see the full count.", "hc.hit": "A restaurant in {city} needs <b>{n} licenses and permits</b>. Your free plan lists every one, with agencies, fees and timelines.",
  "pb.h": "What you pay", "pb.p1": "$149 a store a month", "pb.p1s": "Billed yearly, or $179 month to month, cancel anytime.", "pb.p2": "$149 a license, charged when it's approved", "pb.p2s": "$999 for a liquor license, building plan review or an import permit. Turned down because of a mistake on our side, you pay nothing.", "pb.p3": "No credits, no usage meter", "pb.p3s": "Agency fees are paid at cost, by you, directly to each agency.",
  "pb.sh": "Never without you", "pb.s1": "Odelia never signs, attests, pays or submits without your approval", "pb.s1s": "You see each application first. Nothing is filed until you say so.", "pb.s2": "Odelia always says she's an AI agent", "pb.s2s": "Every time she calls an agency for you.", "pb.s3": "Every action on the record", "pb.s3s": "An append-only audit trail you can export as CSV.",
  "tr97.accs": "For your whole team, with every action on the record, exportable as CSV."});
Object.assign(T.zh, {"hc.empty": "您知道的执照只是其中几项。输入城市，看看一共要办多少。", "hc.hit": "在 {city} 开一家餐厅，需要办理 <b>{n} 项执照和许可</b>。免费计划逐项列出，附办理机构、规费和时间。",
  "pb.h": "您要付的费用", "pb.p1": "每家门店每月 149 美元", "pb.p1s": "按年计费，或按月 179 美元，可随时取消。", "pb.p2": "每项执照 149 美元，获批时才收取", "pb.p2s": "酒类执照、建筑图纸审查或进口许可每项 999 美元。如因我们的失误被退回，您无需付费。", "pb.p3": "没有点数，不按用量计费", "pb.p3s": "政府规费按实际金额，由您直接支付给各机构。",
  "pb.sh": "每一步都经过您", "pb.s1": "未经您批准，Odelia 绝不签署、声明、付款或提交", "pb.s1s": "每份申请先给您过目，您确认后才提交。", "pb.s2": "Odelia 始终表明自己是 AI 助手", "pb.s2s": "她每次替您致电机构时都会说明。", "pb.s3": "每个操作都有记录", "pb.s3s": "只增不改的审计记录，可导出为 CSV。",
  "tr97.accs": "适用于整个团队，每个操作都有记录，可导出为 CSV。"});
/* land9 (Oct 29): the home page keeps the hero, proof, how it works, price, FAQ and the last call; the rest is on /more.html, one quiet row of links away */
Object.assign(T.en, {"more.title": "More about Placetta: case studies, coverage and plans", "more.h": "More about Placetta", "more.sub": "Case studies, the numbers, where we work and the people behind Odelia.", "lk.aria": "More about Placetta", "lk.studies": "Case studies", "lk.numbers": "Your numbers", "lk.plans": "More plans", "lk.trust": "Trust and security", "lk.cost": "Permits and your opening date", "lk.industries": "Permits by industry", "lk.apps": "Apps Odelia works in", "lk.where": "Where we work", "lk.cn": "Teams in China and the US", "lk.experts": "Our experts", "trl.tc": "Trust Center", "trl.vault": "Logins in an encrypted vault"});
Object.assign(T.zh, {"more.title": "快哉：客户案例、覆盖范围与方案", "more.h": "更多关于快哉", "more.sub": "客户案例、费用测算、服务范围，以及 Odelia 背后的团队。", "lk.aria": "更多关于快哉", "lk.studies": "客户案例", "lk.numbers": "费用测算", "lk.plans": "更多方案", "lk.trust": "信任与安全", "lk.cost": "许可与开业日期", "lk.industries": "各行业许可", "lk.apps": "Odelia 支持的应用", "lk.where": "服务范围", "lk.cn": "中美两地团队", "lk.experts": "我们的专家", "trl.tc": "信任中心", "trl.vault": "登录信息加密保管"});
/* copy each PROOF flag unlocks; while a flag is false, T above holds the safe wording */

/* furniture variant: placetta.com/furniture or ?for=furniture */
const VARIANT = (/^\/furniture\/?$/.test(location.pathname) || /[?&]for=furniture\b/.test(location.search)) ? "furniture" : "";
if (VARIANT === "furniture") {
  document.documentElement.classList.add("ind-furniture");
  document.title = "Placetta for furniture brands";
  addEventListener("load", () => { const b = document.querySelector('.inb[data-k="10"]'); if (b) b.click(); scrollTo(0, 0); });
  const fuT = () => {
  Object.assign(T["en"], {"hero.h1":"Your showroom is built.<br><em>Your licenses aren't.</em>", "hero.sub":"Every month without them is rent on an empty showroom. Odelia handles the furniture licenses, safety rules and import filings for every showroom, warehouse and new market, in English or Chinese.", "brands.l":"Built for brands like", "st.ph":"Where are you opening? e.g. a showroom in Los Angeles",
    "fu.h":"What a furniture brand files to sell in a new market.", "fu.sub":"From the first container to the hundredth showroom, every filing comes from the agency's own rules. Odelia maps them for your markets, files with your approval and renews them before they lapse.", "fu.c1":"Importing into the US", "fu.c1a":"Lacey Act declaration", "fu.c1as":"A plant and plant product declaration (PPQ Form 505) for wood products, filed by the importer.", "fu.c1b":"Formaldehyde rules for composite wood", "fu.c1bs":"TSCA import certification, and a TSCA Title VI compliance label on finished goods with the fabricator's name and production date.", "fu.c1c":"Tip-over standard", "fu.c1cs":"Dressers, chests and armoires must pass three stability tests, ship with an anti-tip device and carry a certificate of compliance (16 CFR part 1261).", "fu.c2":"Selling in each state", "fu.c2a":"California furniture license", "fu.c2as":"A state license before you operate as a retailer, importer, wholesaler or manufacturer of upholstered furniture.", "fu.c2b":"Sales tax and business registration", "fu.c2bs":"Registration in each state where you open, sell or store inventory, with returns and renewals on a calendar.", "fu.c3":"Showrooms and warehouses", "fu.c3a":"Every showroom", "fu.c3as":"Business license, certificate of occupancy and sign permits, in the order the city issues them.", "fu.c3b":"Every warehouse", "fu.c3bs":"Fire and storage permits, and the inspections that keep them current.", "fu.c4":"Expanding overseas", "fu.c4a":"EU Deforestation Regulation", "fu.c4as":"Due diligence for wood products placed on the EU market, applying to large companies from 30 December 2026.", "fu.c4b":"EU General Product Safety Regulation", "fu.c4bs":"Products from outside the EU need a responsible economic operator in the EU.", "fu.note":"Agencies change their rules. Odelia re-reads each official source before she files."});
  Object.assign(T["zh"], {"hero.h1":"展厅已经建好，<br><em>执照还没有。</em>", "hero.sub":"没有执照的每个月，都是在为空展厅付租金。Odelia 为您的每个展厅、仓库和新市场办理家具执照、安全规定和进口申报，中英文均可。", "brands.l":"适用于这些品牌", "st.ph":"您在哪里开店？例如洛杉矶的展厅",
    "fu.h":"家具品牌进入新市场需要申报什么。", "fu.sub":"从第一个货柜到第一百个展厅，每项申报都依据主管机构自己的规定。Odelia 为您的市场逐项梳理，经您批准后提交，并在到期前续办。", "fu.c1":"进口到美国", "fu.c1a":"《雷斯法案》申报", "fu.c1as":"木制品须由进口商提交植物及植物产品申报（PPQ 505 表）。", "fu.c1b":"复合木材甲醛规定", "fu.c1bs":"TSCA 进口证明；含复合木材的成品须贴 TSCA Title VI 合规标签，注明制造商名称和生产年月。", "fu.c1c":"防倾倒标准", "fu.c1cs":"斗柜、五斗柜和衣柜须通过三项稳定性测试，随附防倾倒装置，并出具合规证书（16 CFR 第 1261 部分）。", "fu.c2":"在各州销售", "fu.c2a":"加州家具执照", "fu.c2as":"在加州以软体家具零售商、进口商、批发商或制造商身份经营前，须取得州执照。", "fu.c2b":"销售税与营业登记", "fu.c2bs":"在开店、销售或存放库存的每个州完成登记，报税和续期按日历进行。", "fu.c3":"展厅与仓库", "fu.c3a":"每个展厅", "fu.c3as":"营业执照、使用许可证和招牌许可，按城市的审批顺序办理。", "fu.c3b":"每个仓库", "fu.c3bs":"消防和仓储许可，以及保持有效所需的检查。", "fu.c4":"拓展海外", "fu.c4a":"欧盟《零毁林法规》", "fu.c4as":"在欧盟市场投放木制品须开展尽职调查，大型企业自 2026 年 12 月 30 日起适用。", "fu.c4b":"欧盟《通用产品安全法规》", "fu.c4bs":"欧盟以外的产品须在欧盟境内指定负责的经济经营者。", "fu.note":"主管机构会修改规定。Odelia 每次提交前都会重新核对官方来源。"});
  };
  fuT();
  addEventListener("DOMContentLoaded", () => { fuT(); if (typeof applyAll === "function") applyAll(); if (typeof renderStrip === "function") renderStrip(); });
}

const CLAIMS = {
 stats31000: {
  en:{"pf.s1":"businesses served worldwide since 2016", "pf.n2":"3+ per day", "pf.s2":"new US businesses served, on average", "pf.s2b":"new US businesses served each day, on average", "price.proof":"31,000+ businesses served worldwide since 2016", "diff.c1":"Customers since 2016", "diff.c2":"Return customers", "map.n3":"3+ per day", "map.s3":"new US businesses served, on average, since 2016", "map.n3w":"7+ per day", "map.s3w":"new businesses served worldwide, on average, since 2016", "map.t1":"Most brand openings", "map.t2":"Active market", "map.t3":"Growing market", "map.sub":"From São Paulo to Nairobi to Kuala Lumpur, one team files the paperwork. The darker the market, the more brands we open there."},
  zh:{"pf.s1":"自 2016 年起服务过的全球企业", "pf.n2":"每天 3 家以上", "pf.s2":"平均每天服务的美国新企业", "pf.s2b":"平均每天服务的美国新企业", "price.proof":"自 2016 年起已服务全球 31,000+ 家企业", "diff.c1":"2016 年以来服务的客户", "diff.c2":"回头客户比例", "map.n3":"每天 3 家以上", "map.s3":"2016 年以来，平均每天新服务的美国企业", "map.n3w":"每天 7 家以上", "map.s3w":"2016 年以来，平均每天在全球新服务的企业", "map.t1":"开店最多", "map.t2":"活跃市场", "map.t3":"增长市场", "map.sub":"从圣保罗到内罗毕，再到吉隆坡，同一支团队为您办妥所有手续。颜色越深，我们在当地帮助开店的品牌越多。"}},
 freightVolume: {
  en:{"map.fs":"containers of customer goods we help bring into new markets every year"},
  zh:{"map.fs":"个货柜：每年我们协助客户运入新市场的货物"}},
 monthsSooner: {
  en:{"proof.h":"Brands open sooner with Placetta."},
  zh:{"proof.h":"品牌借助快哉，更早开业。"}},
 backersLogos: {
  en:{"bk.h":"Backed by operators from", "bk.hero":"Backed by operators from OpenAI, Anthropic, SpaceX and 21 more"},
  zh:{"bk.h":"我们的投资人来自", "bk.hero":"投资人来自 OpenAI、Anthropic、SpaceX 等 24 家公司"}},
 customerNames: {
  en:{"brands.l":"Built for brands like", "nav.cases":"Customers", "bel.cases":"Case studies", "aria.brands":"Brands", "tea.tabs":"Example plans", "tea.sub":"Five tea houses", "proof.sub":"Operators in their own words, and the plans we map for brands like theirs.", "inv.l":"The brands we serve are backed by"},
  zh:{"brands.l":"适用于这些品牌", "nav.cases":"客户案例", "bel.cases":"客户案例", "aria.brands":"合作品牌", "tea.tabs":"示例方案", "tea.sub":"五家茶企", "proof.sub":"听听加盟商怎么说，再看看我们为同类品牌梳理的开店计划。", "inv.l":"我们服务的品牌获得以下机构投资"}},
 testimonials: {
  en:{"ts.tabs":"Customer stories"},
  zh:{"ts.tabs":"客户故事"}},
 chagee: {
  en:{"pf.n4":"5 months", "pf.s4":"saved in approval time for Ferrari", "price.q":"“Placetta got our approvals through 5 months sooner than we planned.”", "price.qr":"Owner, Ferrari dealer. 5 months saved"},
  zh:{"pf.n4":"5 个月", "pf.s4":"为法拉利节省的审批时间", "price.q":"“快哉让我们的审批比计划提前 5 个月完成。”", "price.qr":"法拉利经销商店主，节省 5 个月"}},
 stanford: {
  en:{"pf.n5":"4 months", "pf.s5":"to approve all 9 of Stefan's permits and filings"},
  zh:{"pf.n5":"4 个月", "pf.s5":"Stefan 的 9 项许可与申报全部获批"}}
};
for (const f in CLAIMS) if (PROOF[f]) for (const l of ["en", "zh"]) Object.assign(T[l], CLAIMS[f][l]);


/* ============ data ============ */
const PLAN = [
 {n:["Foreign LLC registration","外州有限责任公司登记"],a:["CA Secretary of State","加州州务卿"],l:"state",s:0,d:1.6,w:[1,2]},
 {n:["Seller's permit","销售许可证"],a:["CDTFA","加州税费管理局"],l:"state",s:.5,d:3,w:[2,3]},
 {n:["Business tax certificate","营业税证书"],a:["City of San José","圣何塞市"],l:"city",s:1,d:4.4,w:[2,4]},
 {n:["Health permit plan check","卫生许可图纸审查"],a:["Santa Clara County DEH","圣克拉拉县环境卫生局"],l:"county",s:2,d:8.2,w:[3,9]},
 {n:["Tenant improvement permit","室内装修建筑许可"],a:["San José Building Division","圣何塞建筑部门"],l:"city",s:2,d:10.6,w:[3,11]},
 {n:["Fire clearance","消防审批"],a:["San José Fire Department","圣何塞消防局"],l:"city",s:6,d:12.2,w:[6,12]},
 {n:["Sign permit","招牌许可"],a:["City of San José","圣何塞市"],l:"city",s:9,d:13.6,w:[10,12]},
 {n:["Certificate of occupancy","使用许可证"],a:["After final inspection","最终验收后签发"],l:"city",s:13.6,d:16,w:[13,16],blk:true}
];
const STORIES = [
 {k:["Sacramento restaurant","萨克拉门托餐厅"],big:["8 mo","8 个月"],sub:["planned: 2 months","原计划：2 个月"],
  q:["Expected to open in 2 months. It waited 8, spent $100,000 on permits, and estimates the delay cost about $1M in revenue.","原计划 2 个月开业，实际等了 8 个月，许可花费 10 万美元，延误估计造成约 100 万美元营收损失。"],
  src:["San Francisco Chronicle","《旧金山纪事报》"],mo:[8,8],cells:i=> i===1?"r p": i<8?"r": i===8?"o":"",leg:["r","p","o"]},
 {k:["Chinese tea chain, first US store","中国茶饮品牌，美国首店"],big:["7 mo","7 个月"],sub:["to open the first US store","美国首店开业耗时"],
  q:["A Chinese tea chain needed 7 months to open its first store in the US.","一家中国茶饮品牌在美国开出第一家门店，用了 7 个月。"],
  src:["Reuters via Malay Mail","路透社（经《马来邮报》转载）"],mo:[7,7],cells:i=> i<7?"r": i===7?"o":"",leg:["r","o"]},
 {k:["Typical new restaurant","典型的新餐厅"],big:["3 to 6 mo","3 至 6 个月"],sub:["permit phase alone","仅许可审批阶段"],
  q:["The permit phase alone typically takes 3 to 6 months, before a single customer walks in.","仅许可审批阶段通常就需要 3 到 6 个月，期间没有一位顾客上门。"],
  src:["DoorDash Merchants","DoorDash 商家平台"],mo:[3,6],cells:i=> i<3?"r": i<6?"m":"",leg:["r","m"]}
];
const TIERS = [
  {l:["Store plan","门店方案"],v:["$149","149 美元"],u:["/store a month","/门店/月"],ps:["Billed yearly","按年计费"],cta:["Get my plan","获取我的计划"],tag:["Most popular for chains","连锁品牌首选"],hl:1,n:["For every store, open or opening, kept current.","适用于每家门店，已开业或筹备中，始终合规。"],f:[["Every license and renewal date tracked, with alerts","跟踪每一项执照与续期日期，并提醒"],["Renewals Odelia files on her own, included","Odelia 自行提交的续期，全部包含"],["Your document vault, and Odelia for your whole team","文件库，以及全团队可用的 Odelia"],["10 or more stores: every new license included too","10 家及以上门店：每项新执照也全部包含"]]},
  {l:["New licenses","新执照"],v:["$149","149 美元"],u:["/license, when approved","/项，获批时"],ps:["$999 for a liquor license, building plan review or an import permit.","酒类执照、建筑图纸审查或进口许可每项 999 美元。"],cta:["Get my plan","获取我的计划"],n:["Charged when the license is approved. If it's turned down because of a mistake on our side, you pay nothing.","执照获批时收取。如因我们的失误被退回，您无需付费。"],f:[["Mapped, filled by Odelia and filed with your approval","逐项梳理，由 Odelia 填写，经您批准后提交"],["Tracked to approval, in English or Chinese","跟踪至获批，中英文均可"],["Government fees passed through at cost","政府规费按实际金额代付"]]},
  {l:["Renewals outside the plan","方案外续期"],v:["$99","99 美元"],u:["/renewal","/次"],ps:["Only when the store plan doesn't include it","仅在门店方案不包含时收取"],cta:["Get my plan","获取我的计划"],n:["A renewal that needs our team, or for a store without the plan.","需要团队处理的续期，或未开通方案门店的续期。"],f:[["Started 60 days before it's due","到期前 60 天开始办理"],["Charged only after your one-tap approval","经您一键批准后才收费"]]},
  {l:["Plan preview","计划预览"],v:["Free","免费"],u:["",""],ps:["No card needed","无需绑卡"],cta:["Get my free plan","获取免费计划"],n:["Every license a store needs, in order, with agency fees and timelines.","门店所需的每一项执照，按顺序排列，附机构规费与时间。"],f:[["Ready in about a minute","约一分钟即可生成"],["Every agency linked to its own page","每个机构都链接到其官方页面"]]},
];
const FAQ = [
 [["How much does it cost?", "费用是多少？"],["$149 a store a month on the store plan, billed yearly, or $179 month to month, cancel anytime: tracking, renewal monitoring, alerts, your document vault, Odelia, and the renewals she files on her own. Each new license is $149, or $999 for a liquor license, building plan review or an import permit, charged when the license is approved. If it's turned down because of a mistake on our side, you pay nothing. Turned down for another reason, such as zoning or information it was given, it's charged too. A renewal the plan doesn't include is $99. With 10 or more stores on the plan, every new license is included. Your plan preview is free. Government fees are paid at cost, by you directly to each agency. <a href=\"/pricing\" data-sec=\"pricing\">See pricing</a>", "门店方案每家门店每月 149 美元，按年计费，或按月 179 美元，可随时取消：跟踪、续期监控、提醒、文件库、Odelia，以及她自行提交的续期。每项新执照 149 美元，酒类执照、建筑图纸审查或进口许可每项 999 美元，在执照获批时收取。如因我们的失误被退回，您无需付费；因分区规定或所提供的信息等其他原因被退回，同样收费。方案不包含的续期每次 99 美元。方案内有 10 家及以上门店时，每项新执照全部包含。计划预览免费。政府规费按实际金额，由您直接支付给各机构。<a href=\"/pricing\" data-sec=\"pricing\">查看价格</a>"]],
 [["Who pays, headquarters or the franchisee?","由总部付费还是加盟商付费？"],["Usually each franchisee pays for its own locations, and headquarters makes Odelia the required compliance system in the franchise agreement. A brand can also pay for every store itself.","通常由每位加盟商为自己的门店付费，总部在加盟协议中将 Odelia 设为统一要求的合规系统。品牌也可以为所有门店统一付费。"]],
 [["What's in the free plan preview?", "免费的计划预览包含什么？"],["Every license, permit and registration your store needs, from federal to city, in the order they run, with timelines and estimated agency fees. It's ready in minutes and costs nothing.", "您的门店所需的每一项执照、许可和登记，从联邦到市级，按办理顺序排列，附时间表和预估规费。几分钟即可生成，不收任何费用。"]],
 [["What happens after my store opens?","门店开业之后呢？"],["We keep it compliant. Renewal dates, inspections and rule changes are tracked for every location, and the policy monitor tells you what each change means for your stores and what to do next.","我们持续为您保持合规。每家门店的续期日期、检查和规则变化都会被跟踪，政策监测会告诉您每项变化对门店意味着什么、下一步该做什么。"]],
 [["Who files the applications?","申请由谁提交？"],["Odelia, Placetta's AI agent, prepares each application from your documents. You review and approve it, then Odelia files it and follows up until the agency decides. When an agency needs a person, in person or on the phone, our team steps in.","快哉的智能代理 Odelia 根据您的资料准备每一份申请。您审阅并确认后，由 Odelia 提交，并持续跟进直至机构作出决定。如机构需要专人到场或电话沟通，由我们的团队接手。"]],
 [["What if a filing is rejected?","申请被退回怎么办？"],["Odelia reads the agency's reason, corrects the application with you and resubmits it, and our team steps in when the agency needs a person. Nothing is filed without your approval.","Odelia 会读取机构给出的原因，与您一起修正后重新提交；如机构需要专人处理，由我们的团队接手。未经您批准，不会提交任何申请。"]],
 [["Can I get a refund?", "可以退款吗？"],["Fees are non-refundable, except where the law requires a refund or under a guarantee bought before October 2026, as our <a href=\"terms.html\" data-legal=\"terms.html\">terms</a> say. You can turn auto-renew off at any time in Settings, Billing; the plan ends with your current billing period and you keep the service until then. Questions about a charge: email <a href=\"mailto:support@placetta.com\">support@placetta.com</a>.", "除法律要求退款，或 2026 年 10 月前购买的保障所涵盖的情形外，费用不予退还，详见我们的<a href=\"terms.html\" data-legal=\"terms.html\">服务条款</a>。您可以随时在“设置 → 账单”中关闭自动续费，方案在当前计费周期结束时终止，在此之前服务照常。对某笔费用有疑问，请发邮件至 <a href=\"mailto:support@placetta.com\">support@placetta.com</a>。"]],
 [["Is this legal advice?","这是法律意见吗？"],["No. Placetta is software and a managed service. Where a step requires a licensed attorney, we introduce an independent attorney you engage directly. Placetta takes no referral fee.","不是。快哉是软件和托管服务。如某一步骤需要持牌律师，我们会为您介绍独立执业的律师，由您直接聘请。快哉不收取介绍费。"]],
 [["Which markets do you cover?","覆盖哪些市场？"],["All 50 US states and 170+ countries. Tell us your target city and we'll map every license, permit and registration it requires.","美国全部 50 个州，以及全球 170 多个国家和地区。告诉我们您的目标城市，我们会列出当地所需的全部执照、许可和登记。"]],
 [["How fast can you open my location?", "多快能让我的门店开业？"],["It depends on the jurisdiction and your build-out. Your free plan preview includes a projected timeline before you commit. Timelines are estimates, not a promise.", "取决于所在辖区和装修工程。您的免费计划预览会在您决定前给出预计时间表。时间均为预估，并非承诺。"]],
 [["Can my team in China work in Chinese?","我在中国的团队可以用中文协作吗？"],["Yes. Your plan, dashboard and updates are in English and Chinese, so your team in Shanghai or Shenzhen sees the same plan as your team in New York. We also flag US-specific risks early, like state limits on foreign-owned leases.","可以。您的计划、看板和每次更新都支持中英文，上海或深圳的团队与纽约团队看到的是同一份计划。我们还会尽早提示美国特有的风险，例如部分州对外资企业租赁的限制。"]]
];
const CHECK = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.6" stroke="#0F1B33" stroke-width="1.2"/><path d="M6.3 9.1l1.9 1.9 3.6-4" stroke="#0F1B33" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ============ state + i18n ============ */
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
let lang = "en";
const ONZH = /^\/zh(\.html)?\/?$/.test(location.pathname);
try { const q = new URLSearchParams(location.search).get("lang"), s = localStorage.getItem("placetta-lang"); if (ONZH) lang = "zh"; else if (q === "en" || q === "zh") { lang = q; localStorage.setItem("placetta-lang", q); } else if (s === "en" || s === "zh") lang = s; else if ((navigator.language||"").toLowerCase().startsWith("zh")) lang = "zh"; }
catch(e){ if ((navigator.language||"").toLowerCase().startsWith("zh")) lang = "zh"; }
// /more.html: the sections that left the home page (land9), with the same header, footer and lead sheet. One script
// serves both pages, so a section's observer is handed nothing on the page that doesn't show it: that's a no-op here
const IntersectionObserver = class extends window.IntersectionObserver { observe(el){ if (el) super.observe(el); } };
const PG_MORE = !!document.querySelector(".pgm");
const L = () => lang === "zh" ? 1 : 0;
const t = k => (T[lang][k] ?? T.en[k] ?? k);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

window.dataLayer = window.dataLayer || [];
function track(event, data){ window.dataLayer.push(Object.assign({event, lang, ts: Date.now()}, data || {})); }

function applyStatic(){
  if (PG_MORE) document.title = t("more.title");
  else document.title = lang === "zh" ? "快哉：进入新市场所需的执照、许可和登记" : "Placetta: licenses, permits and registrations to open in a new market";
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  applyPh();
  document.querySelectorAll("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  document.querySelectorAll(".lgt [data-lang]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  document.getElementById("lCur").textContent = lang === "zh" ? "中文" : "EN";
  document.querySelectorAll("a[data-legal]").forEach(a => { a.href = a.dataset.legal + "?lang=" + lang; });
}
const phS = matchMedia("(max-width:639px)");
function applyPh(){ document.querySelectorAll("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPhS && phS.matches ? el.dataset.i18nPhS : el.dataset.i18nPh); }); }
phS.addEventListener("change", applyPh);
/* land9 (Oct 29): h is each logo's height for one optical size (equal ink at height ~ 1/sqrt(width/height)), shown in one
   grey; Blackstone's mark without its box (blackstone-word.png, its own knocked-out letters) */
const INV = [
  {k:"berkshire", n:["Berkshire Hathaway","伯克希尔·哈撒韦"], h:22}, {k:"hongshan", n:["HongShan","红杉中国"], h:40}, {k:"a16z", n:["Andreessen Horowitz","安德森·霍洛维茨"], h:32}, {k:"openai", n:["OpenAI","OpenAI"], h:34},
  {k:"nvidia", n:["NVIDIA","英伟达"], h:27}, {k:"foundersfund", n:["Founders Fund","创始人基金"], h:44},
  {k:"greylock", n:["Greylock","格雷洛克"], h:34}, {k:"yc", n:["Y Combinator","Y Combinator 创业加速器"], h:32}, {k:"softbank", n:["SoftBank","软银"], h:27},
  {k:"sequoia", n:["Sequoia","红杉资本"], h:22}, {k:"hillhouse", n:["Hillhouse Investment","高瓴投资"], h:34}, {k:"idg", n:["IDG Capital","IDG资本"], h:27}, {k:"azureworld", n:["AzureWorld","湛蓝领域"], h:36}, {k:"blackstone", f:"blackstone-word", n:["Blackstone","黑石"], h:27}, {k:"apollo", n:["Apollo","阿波罗"], h:26}
];
/* the investor marquee: loading="lazy" on its off-screen copies left gaps, so the whole row stays eager, and is only
   written once the section is within 600px of the screen (one IntersectionObserver, then it disconnects) */
let invNear = false;
if ("IntersectionObserver" in window) (() => { const sec = document.getElementById("backers"); if (!sec) { invNear = true; return; }
  const io2 = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io2.disconnect(); invNear = true; renderInv(); } }, {rootMargin: "600px 0px"}); io2.observe(sec); })();
else invNear = true;
function renderInv(){ if (!invNear || !document.getElementById("invR")) return; const i = L(), one = (hide) => INV.map(v => `<img src="logos/investors/${v.f || v.k}.png" alt="${hide ? "" : esc(v.n[i])}"${hide ? ' aria-hidden="true"' : ""} style="--h:${v.h}px" loading="eager" decoding="sync" draggable="false">`).join("");
  document.getElementById("invR").innerHTML = `<div class="ivt">${one(false)}${one(true)}</div>`; }
/* Book a demo: the one place for the booking link (founder, Oct 24). Set BOOK_URL.en to the Cal.com or Calendly event,
   and BOOK_URL.zh to the event with a Chinese-speaking host (the Chinese-language slot; left empty, Chinese visitors get
   the English link). Until a link is set, every "Book a demo" (a[data-book]) opens an email to the team, as before. */
const BOOK_URL = { en: "", zh: "" };
const BOOK_MAIL = { en: "mailto:support@placetta.com?subject=Placetta%20demo", zh: "mailto:support@placetta.com?subject=%E5%BF%AB%E5%93%89%E6%BC%94%E7%A4%BA%EF%BC%88%E4%B8%AD%E6%96%87%EF%BC%89" };
function applyBook(){ const u = BOOK_URL[lang] || BOOK_URL.en || BOOK_MAIL[lang] || BOOK_MAIL.en, web = /^https:\/\//.test(u);
  document.querySelectorAll("a[data-book]").forEach(a => { a.href = u; if (web) { a.target = "_blank"; a.rel = "noopener"; } else { a.removeAttribute("target"); a.removeAttribute("rel"); } }); }
function applyAll(){ applyStatic(); applyBook(); if (typeof renderBk === "function") renderBk(); if (typeof renderOld === "function") renderOld(); renderApp(); renderCost(); renderPrice(); renderProof(); renderFaq(); renderTs(); if (typeof renderMon === "function") renderMon(); if (typeof renderBel === "function") renderBel(false); if (typeof renderStrip === "function") renderStrip(); if (typeof renderFlows === "function") renderFlows(); if (typeof renderInv === "function") renderInv(); }
function setLang(l){ if (l === lang) return; if (ONZH && l === "en") { try { localStorage.setItem("placetta-lang", "en"); } catch(e){} location.href = "/" + location.search + location.hash; return; } lang = l; try { localStorage.setItem("placetta-lang", l); } catch(e){} track("language_switch", {to: l}); applyAll(); if (typeof renderMap === "function") renderMap(); if (!document.getElementById("modal").hidden) renderStep(); if (typeof updateResume === "function") updateResume(); }
document.querySelectorAll("[data-lang]").forEach(b => b.addEventListener("click", () => { setLang(b.dataset.lang); document.getElementById("lMenu").hidden = true; document.getElementById("lBtn").setAttribute("aria-expanded","false"); }));
document.getElementById("lBtn")?.addEventListener("click", e => { const m = document.getElementById("lMenu"); m.hidden = !m.hidden; e.currentTarget.setAttribute("aria-expanded", String(!m.hidden)); });

/* ============ video-style sample plan ============ */
const DUR = 18; let vt = RM ? DUR : -1.8, vPlaying = false, vVisible = false, vLast = 0;
/* vMode: "wait" (empty, until it scrolls into view), "intro" (types the city and maps the licenses, a few seconds),
   "scroll" (each license checks itself off as the visitor scrolls past, vt eased toward vTarget), "time" (the play
   button: runs on its own clock, as before), "still" (reduced motion: the finished plan, nothing moves) */
let vMode = RM ? "still" : "wait", vTarget = 0;
/* the intro runs on negative time: the line types itself (-INTRO to -INTRO+TYPE), then the rows land one by one with their dates */
const INTRO = 1.8, TYPE = .8, vSeen = {v: false}, VSPD = 1.8;
const W0 = Date.UTC(2026, 10, 16); // week 1 of the sample plan starts Mon Nov 16, 2026, so week 16 ends in Mar 2027
function wkDates(w){ const a = new Date(W0 + (w[0] - 1) * 6048e5), b = new Date(W0 + (w[1] * 7 - 1) * 864e5), zh = lang === "zh";
  if (zh) return `${a.getUTCMonth() + 1}月${a.getUTCDate()}日至${b.getUTCMonth() !== a.getUTCMonth() ? (b.getUTCMonth() + 1) + "月" : ""}${b.getUTCDate()}日`;
  const m = d => d.toLocaleString("en-US", {month: "short", timeZone: "UTC"});
  return `${m(a)} ${a.getUTCDate()} to ${b.getUTCMonth() !== a.getUTCMonth() ? m(b) + " " : ""}${b.getUTCDate()}`; }
function status(r, tt){ if (tt >= r.d) return "d"; if (r.blk) return "b"; return tt >= r.s ? "r" : "q"; }
let vFloat = "";
function renderApp(){
  if (!document.getElementById("appRows")) return;   // the sample plan is on the home page
  const i = L();
  document.getElementById("appRows").innerHTML = PLAN.map((r,k) => `<div class="arow" id="ar${k}"><span class="ast" id="as${k}"></span><div style="min-width:0"><div class="n">${r.n[i]}</div><div class="a">${r.a[i]}<span class="adt">${wkDates(r.w)}</span></div></div><span class="aw">${i ? "第" + r.w[0] + "至" + r.w[1] + "周" : "W" + r.w[0] + " to " + r.w[1]}</span><span class="asx" id="ap${k}"></span></div>`).join("");
  vFloat = "";
  document.getElementById("gantt").innerHTML = PLAN.map((r,k) => `<div class="gl"><i id="gb${k}" style="left:${(r.w[0]-1)/16*100}%;width:${(r.w[1]-r.w[0]+1)/16*100}%"></i></div>`).join("") + `<div class="gaxis">${[1,5,9,13].map(n => `<span>${i ? "第" + n + "周" : "W" + n}</span>`).join("")}</div><span class="today" id="today"></span>`;
  const vs = `<p class="vsh"><span class="orb"></span><b>Odelia</b><em>${t("app.sample")}</em></p><ol>${[1, 2, 3, 4].map(n => `<li data-n="${n}"><i></i><span>${t("vs." + n)}</span></li>`).join("")}</ol><div class="vpk"><span class="vpf"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg></span><span class="vpt"><b>${t("itl.f1")}</b><small>${t("itl.m1")}</small></span><span class="vok"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg><span>${t("f2.ok")}</span></span></div>`;
  ["vSteps", "vStepsM"].forEach(id => { const el = document.getElementById(id); if (el) { el.innerHTML = vs; el.dataset.k = ""; } });
  paintApp(); renderHow();
}
/* land98: Odelia's steps on the sample plan, from the sample's own rows. Mapped once the rows land; the health permit
   packet (row 4, filed in week 3) waits for the owner's approval until that row is filed, then ticks to filed. */
function paintSteps(){
  const landed = vt >= 0 || vt + INTRO >= TYPE + .15 + PLAN.length * .09, filed = vt >= PLAN[3].s;
  const st = [landed ? "d" : "q", landed ? "d" : "q", !landed ? "q" : filed ? "d" : "w", filed ? "d" : "q"], k = st.join("") + lang;
  ["vSteps", "vStepsM"].forEach(id => { const el = document.getElementById(id); if (!el || el.dataset.k === k) return; el.dataset.k = k;
    el.querySelectorAll("li").forEach((li, j) => { li.className = st[j]; if (j === 2) li.querySelector("span").textContent = t(st[j] === "d" ? "vs.3d" : "vs.3"); });
    const b = el.querySelector(".vok span"); if (b) b.textContent = t(filed ? "vs.okd" : "f2.ok");
    el.classList.toggle("ok", filed); el.classList.toggle("on", landed); });
}
const GC = {q:"#E2E7EE",r:"#E9C47F",d:"#7399C6",b:"#E8B4AA"};
/* how it works (Oct 18): card 1 shows the sample plan's first rows with their dates and status; card 3 a month of renewals */
function renderHow(){
  const i = L(), pl = document.getElementById("hwPlan"), cal = document.getElementById("hwCal");
  if (pl) pl.innerHTML = PLAN.slice(0, 5).map(r => { const s = status(r, 6); return `<div class="hwr" role="listitem"><span class="nm"><b>${r.n[i]}</b><small>${r.a[i]}</small></span><span class="hwd"><em>${wkDates(r.w)}</em><span class="hws ${s}">${t("st." + s)}</span></span></div>`; }).join("") + `<p class="hwmore">${t("hw.more")}</p>`;
  if (cal){ // January 2027 starts on a Friday; the health permit is due the 14th, the business tax certificate renews the 31st
    const wd = i ? ["日","一","二","三","四","五","六"] : ["S","M","T","W","T","F","S"], mk = {14: "a", 31: "b"};
    cal.innerHTML = `<p class="hwmo">${t("hw.mo")}</p><div class="hwg">${wd.map(d => `<i>${d}</i>`).join("")}${Array.from({length: 5}, () => "<span></span>").join("")}${Array.from({length: 31}, (_, k) => `<span${mk[k + 1] ? ` class="${mk[k + 1]}"` : ""}>${k + 1}</span>`).join("")}</div>`; }
}
function paintApp(){
  if (!document.getElementById("appRows")) return;
  let done = 0;
  const ask = t("app.ask"), it = vt + INTRO, el = document.getElementById("appAsk");
  if (el){ const n = vt >= 0 || vt < -INTRO ? ask.length : Math.min(ask.length, Math.round(ask.length * it / TYPE));
    if (el.textContent.length !== n || el.textContent !== ask.slice(0, n)) el.textContent = ask.slice(0, n);
    el.parentNode.classList.toggle("typing", vt < 0 && it < TYPE + .4); }
  PLAN.forEach((r,k) => { const on = vt >= 0 || vt + INTRO >= TYPE + .15 + k * .09; const row = document.getElementById("ar"+k), g = document.getElementById("gb"+k);
    if (row) row.classList.toggle("pre", !on); if (g) g.classList.toggle("pre", !on); });
  PLAN.forEach((r,k) => { const s = status(r, vt); if (s === "d") done++;
    const p = document.getElementById("ap"+k); if (!p) return; if (p.dataset.s !== s){ p.dataset.s = s; p.className = "asx "+s; p.textContent = t("st."+s); document.getElementById("as"+k).className = "ast "+s; }
    const g = document.getElementById("gb"+k); if (g) g.style.background = GC[s]; });
  document.getElementById("appCount").textContent = lang === "zh" ? `${t("app.done")} ${done}/8` : `${done} of 8 ${t("app.done")}`;
  document.getElementById("appProg").style.width = (done / PLAN.length * 100) + "%";
  let last = -1, cur = -1;
  PLAN.forEach((r,k) => { const s = status(r, vt); const row = document.getElementById("ar"+k); if (row) row.classList.toggle("cur", s === "r");
    if (s === "d" && (last < 0 || r.d >= PLAN[last].d)) last = k; if (s === "r" && cur < 0) cur = k; });
  const key = lang + last + "|" + cur;
  if (key !== vFloat){
    const prev = vFloat; vFloat = key; const i = L();
    const ts = document.getElementById("vToast");
    if (last < 0) ts.hidden = true;
    else { const changed = !prev || prev.split("|")[0] !== key.split("|")[0];
      document.getElementById("vToastT").textContent = t("app.toast").replace("{p}", PLAN[last].n[i]);
      document.getElementById("vToastS").textContent = t("app.toastS").replace("{a}", PLAN[last].a[i]);
      ts.hidden = false; if (changed && !RM){ ts.classList.remove("pop"); void ts.offsetWidth; ts.classList.add("pop"); } }
  }
  const wk = 1 + 15 * Math.max(0, Math.min(vt, DUR)) / DUR; const td = document.getElementById("today");
  if (td){ td.style.left = ((wk - .5) / 16 * 100) + "%"; td.dataset.l = lang === "zh" ? `第 ${Math.floor(wk)} 周` : `${t("app.week")} ${Math.floor(wk)}`; }
  document.getElementById("vBar").style.width = ((Math.min(vt, DUR) + INTRO) / (DUR + INTRO) * 100) + "%";
  paintSteps();
}
function vLoop(ts){
  if (!vVisible) vLast = 0;
  else if (vMode === "intro"){ if (vLast) vt += (ts - vLast) / 1000; vLast = ts; if (vt >= 0){ vt = 0; vMode = "scroll"; setPlay(false); vScrollTarget(); } paintApp(); }
  else if (vMode === "scroll"){ vLast = 0; const d = vTarget - vt; if (Math.abs(d) > .005){ vt += Math.sign(d) * Math.min(Math.abs(d), Math.max(.04, Math.abs(d) * .12)); paintApp(); } }
  else if (vMode === "time" && vPlaying){ if (vLast) { vt += (ts - vLast) / 1000 * (vt < 0 ? 1 : VSPD); if (vt > DUR + 3) vt = -INTRO; } vLast = ts; paintApp(); }
  else vLast = 0;
  requestAnimationFrame(vLoop);
}
/* the scroll moment: the card's centre travelling from 75% to 25% of the screen height runs the plan from week 1 to the
   certificate of occupancy. A passive scroll listener reads it only while the IntersectionObserver below says the card
   is on screen; nothing else on the page moves with the scroll. */
function vScrollTarget(){ const c = document.getElementById("vcard"); if (!c) return; const r = c.getBoundingClientRect(), H = innerHeight;
  vTarget = Math.min(1, Math.max(0, (H * .75 - (r.top + r.height / 2)) / (H * .5))) * DUR; }
addEventListener("scroll", () => { if (vVisible && vMode === "scroll") vScrollTarget(); }, {passive: true});
function setPlay(p){ vPlaying = p; const ic = document.getElementById("vIcon"), b = document.getElementById("vPlay"); if (!ic || !b) return;
  ic.innerHTML = p ? '<rect x="1" y="1" width="3.6" height="12" rx="1"/><rect x="8.4" y="1" width="3.6" height="12" rx="1"/>' : '<path d="M2 1.2v11.6a.8.8 0 0 0 1.2.7l9-5.8a.8.8 0 0 0 0-1.4l-9-5.8A.8.8 0 0 0 2 1.2z"/>';
  b.setAttribute("aria-label", t(p ? "aria.pause" : "aria.play")); }
document.getElementById("vPlay")?.addEventListener("click", () => { if (vMode === "time") setPlay(!vPlaying); else { const run = vMode !== "intro"; vMode = "time"; setPlay(run); } });
document.getElementById("vRestart")?.addEventListener("click", () => { vt = -INTRO; vMode = RM ? "time" : "intro"; setPlay(RM); paintApp(); });

/* ============ cost of waiting: month visual + rent calculator ============ */
let sIdx = 0, rent = 15000;
const money = n => "$" + Math.round(n).toLocaleString("en-US");
const LEGSTYLE = {r:"background:var(--gs)",p:"background:#fff;box-shadow:inset 0 0 0 2px var(--ink)",o:"background:var(--ok)",m:"background:repeating-linear-gradient(135deg,rgba(115,153,198,.6) 0 2px,transparent 2px 4px);outline:1px dashed var(--gs);outline-offset:-1px"};
function renderCost(){
  if (!document.getElementById("wcard")) return;
  const i = L(), s = STORIES[sIdx];
  const cells = Array.from({length:12},(_,m) => `<i class="${s.cells(m)}" style="animation-delay:${m*45}ms"></i>`).join("");
  document.getElementById("wcard").innerHTML = `
    <div class="wtabs" role="tablist">${STORIES.map((x,k) => `<button type="button" role="tab" aria-selected="${k===sIdx}" data-s="${k}">${x.k[i]}</button>`).join("")}</div>
    <div class="whead"><div><div class="wbig">${s.big[i]}</div><div class="wsub">${s.sub[i]}</div></div><p class="wq">${s.q[i]}</p></div>
    <div><div class="wgrid" aria-hidden="true">${cells}</div><div class="waxis">${Array.from({length:12},(_,m)=>`<span>${m+1}</span>`).join("")}</div>
      <div class="wleg">${s.leg.map(x => `<span><i style="${LEGSTYLE[x]}"></i>${t("leg."+x)}</span>`).join("")}<span style="margin-left:auto;color:var(--muted)">${t("months")} →</span></div></div>
    <p class="wsrc">${t("src")}${i ? "：" : ": "}${s.src[i]}</p>`;
  // the rent calculator lives in pricing, under the math on waiting; the months follow the story picked above
  const pc = document.getElementById("pmCalc");
  if (pc) pc.innerHTML = `<label for="rent">${t("calc.l")}</label><output id="rentOut" for="rent"></output>
      <input type="range" id="rent" min="3000" max="80000" step="1000" value="${rent}">
      <div class="wres"><span id="rentLbl"></span><b id="rentRes"></b><small>${t("calc.n")}</small></div>`;
  document.querySelectorAll("[data-s]").forEach(b => b.addEventListener("click", () => setStoryIdx(+b.dataset.s)));
  const rIn = document.getElementById("rent");
  if (rIn) { rIn.addEventListener("input", e => { rent = +e.target.value; paintCalc(); }); rIn.addEventListener("change", () => track("rent_calculator", {rent})); }
  document.querySelectorAll("[data-story]").forEach(b => b.classList.toggle("on", +b.dataset.story === sIdx));
  paintCalc();
}
function paintCalc(){
  if (!document.getElementById("rentOut")) return; // the rent calculator moved into the pricing value calculator (c96v)
  const s = STORIES[sIdx], a = s.mo[0], b = s.mo[1];
  document.getElementById("rentOut").textContent = money(rent);
  document.getElementById("rentLbl").textContent = L() ? `${t("calc.r")}，共 ${a===b?a:a+" 至 "+b} ${t("calc.mo")}` : `${t("calc.r")} for ${a===b?a:a+" to "+b} ${t("calc.mo")}`;
  document.getElementById("rentRes").textContent = a === b ? money(rent*a) : (L() ? `${money(rent*a)} 至 ${money(rent*b)}` : `${money(rent*a)} to ${money(rent*b)}`);
  const big = document.getElementById("costBig"); if (big) { big.textContent = money(rent * b); document.getElementById("costCap").textContent = t("cost.cap").replace("{m}", b); }
}
function setStoryIdx(k){ if (k === sIdx) return; sIdx = k; track("cost_story", {story: STORIES[k].src}); renderCost(); }
document.querySelectorAll("[data-story]").forEach(b => b.addEventListener("click", () => setStoryIdx(+b.dataset.story)));

/* ============ case studies: each company's plan; filings and times from the linked sources ============ */
const CASES_ALL = [];   // filled from /data/more.json on the page that shows it (moreData)
/* PROOF: a case keeps its company's name and logo only while its flag is on (Wakimasu: PROOF.wakimasu, the rest:
   PROOF.customerNames). Otherwise it is shown as an anonymous example plan: same rules and sources, no company named. */
const CASE_ANON = [
 {flag: "wakimasu", tab: ["Wagyu restaurant", "和牛餐厅"], n: ["A wagyu restaurant in New York", "纽约一家和牛餐厅"], lab: ["Wagyu restaurant, New York", "纽约和牛餐厅"],
  t: ["What a wagyu restaurant needs to open in New York.", "一家和牛餐厅在纽约开业，需要满足的每一项要求。"],
  p: ["Example: a restaurant serving Japanese wagyu in New York. The plan lists every approval, filing and rule between the plant in Japan and the dining room, in order, and what each one takes. The liquor licence often takes longest, so it starts first.", "示例：一家在纽约供应日本和牛的餐厅。方案列出从日本工厂到餐厅之间的每一项审批、备案和合规要求，按顺序排列，并说明每一项的要求和耗时。酒类执照通常耗时最长，因此最先启动。"],
  win: ["Example opening plan", "示例开业计划"], rep: [["Wakimasu", "the restaurant", "该餐厅"]]},
 {tab: ["Creator platform", "创作者平台"], n: ["A creator marketing platform", "一家创作者营销平台"], lab: ["Creator marketing platform", "创作者营销平台"],
  t: ["What a creator marketing platform needs to launch in the UK, the EU and Japan.", "一家创作者营销平台进入英国、欧盟和日本，需要满足的每一项要求。"],
  p: ["Example: a platform that connects brands with creators and pays creators for sponsored posts. The plan lists every approval, filing and rule it faces in each market, in order, and what each one takes. Most are rules rather than approvals, so they are built into the platform's campaign briefs and payouts from day one.", "示例：一家连接品牌与创作者、并向创作者支付推广内容费用的平台。方案列出它在每个市场需要的每一项审批、备案和合规要求，按顺序排列，并说明每一项的要求和耗时。其中大多是合规规则而非审批，因此从第一天起就写进平台的活动简报和付款流程。"],
  win: ["Example plan", "示例出海计划"], rep: [["Tor", "the platform", "该平台"]]},
 {tab: ["Warehouses", "仓储企业"], n: ["A fulfillment warehouse operator", "一家仓储履约企业"], lab: ["Fulfillment warehouse operator", "仓储履约企业"],
  t: ["What a warehouse operator needs to open 27 US warehouses.", "一家仓储企业在美国开设 27 座仓库，需要满足的每一项要求。"],
  p: ["Example: an operator of fulfillment warehouses for Chinese sellers on US marketplaces, putting $240 million into 27 sites in six states. The plan lists every approval, filing and rule from the first lease to daily operations, in order, and what each one takes. Fire permits set each opening date, so racking plans go in first.", "示例：一家为在美国电商平台销售的中国卖家提供仓储履约服务的企业，计划投资 2.4 亿美元在六个州开设 27 座仓库。方案列出从签第一份租约到日常运营的每一项审批、备案和合规要求，按顺序排列，并说明每一项的要求和耗时。消防许可决定每座仓库的开业时间，因此货架图纸最先提交。"],
  win: ["Example US plan", "示例美国计划"], rep: [["Yeesy Capital", "the operator", "该企业"], ["Yeesy", "the operator", "该企业"], ["易赛资本", null, "该企业"], ["易赛", null, "该企业"]]},
 {tab: ["Food factory", "食品工厂"], n: ["A bubble tea ingredient maker", "一家奶茶原料生产商"], lab: ["Bubble tea ingredient maker", "奶茶原料生产商"],
  t: ["What a food maker needs to open its first US factory.", "一家食品企业在美国开设首家工厂，需要满足的每一项要求。"],
  p: ["Example: a maker of tapioca pearls and fruit syrups for bubble tea chains, building a $38 million plant in Ontario, California, to supply 1,200 US shops. The plan lists every approval, filing and rule from choosing the site to the first shipment, in order, and what each one takes. Where a China-headquartered company may build decides the rest, so the site comes first.", "示例：一家为奶茶连锁品牌生产珍珠和果酱糖浆的企业，计划投资 3,800 万美元在加州安大略市建厂，供应美国 1,200 家门店。方案列出从选址到首批发货的每一项审批、备案和合规要求，按顺序排列，并说明每一项的要求和耗时。总部位于中国的公司能在哪里建厂决定了其余一切，因此先定厂址。"],
  win: ["Example factory plan", "示例建厂计划"], rep: [["Qiaomu Foods", "the company", "该企业"], ["Qiaomu", "the company", "该企业"], ["乔木食品", null, "该企业"], ["乔木", null, "该企业"]]}
];
function anonCase(c, a){
  const rx = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sub = (str, i) => a.rep.reduce((x, [from, en, zh]) => {
    if (i) return zh == null ? x : x.split(new RegExp("\\s?" + rx(from) + "\\s?")).join(zh);
    if (en == null) return x;
    return x.replace(new RegExp("(^|[.!?]\\s+)?\\b" + rx(from) + "\\b", "g"), (m, pre) => pre !== undefined ? pre + en[0].toUpperCase() + en.slice(1) : en);
  }, str);
  const pair = v => [sub(v[0], 0), sub(v[1], 1)];
  return Object.assign({}, c, {n: a.n, tab: a.tab, ex: 1, t: a.t, p: a.p, win: a.win,
    logo: a.lab.map(x => `<span class="exlab">${x}</span>`),
    st: c.st.map((x, k) => k === 2 && a.st2 ? a.st2 : [x[0], x[1], sub(x[2], 0), sub(x[3], 1)]),
    mk: c.mk.map(m => Object.assign({}, m, {r: m.r.map(r => Object.assign({}, r, {t: pair(r.t), d: pair(r.d)}))}))});
}
const caseOf = (c, k) => { const a = CASE_ANON[k];
  if (!PROOF[a.flag || "customerNames"]) return anonCase(c, a);
  return a.own ? Object.assign({}, c, {p: [c.p[0] + " " + a.own[0], c.p[1] + a.own[1]]}) : c; };
const CASES = [];   // CASES_ALL as shown, filled with it (moreData)
const TEA = [];   // filled from /data/more.json on the page that shows it (moreData); the tea houses are example plans (ex: 1)
const PICO = {"a": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"m8.4 12.3 2.5 2.5 4.7-5\"/></svg>", "f": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M7 3.5h7l4 4V20.5H6V4z\"/><path d=\"M14 3.5V8h4M9.5 12.5h5M9.5 16h5\"/></svg>", "r": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3.5l7 2.6v5.4c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6.1z\"/><path d=\"M9 12h6\"/></svg>"};
const SCHIP = {
  f: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D0574A" stroke-width="1.8"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  a: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3F9A62" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/></svg>',
  r: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3B6FD9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 12.5-8 8a2.12 2.12 0 0 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg>'
};
function caseUI(D, ids, o){
  const st = {c: 0, m: 0}, $ = k => document.getElementById(ids[k]), nm = x => Array.isArray(x) ? x[L()] : x, lead = o.lead;
  function render(anim){
    const i = L(), c = D[st.c]; if (!c) return;   // the plans arrive with /data/more.json
    const m = c.mk[st.m], rows = $("rows");
    const lon = !!(lead && lead.on());
    $("tabs").innerHTML = D.map((x, k) => `<button type="button" role="tab"${lead ? ' class="tstab"' : ""} data-case="${k}" aria-selected="${!lon && k === st.c}" aria-controls="${ids.body}" tabindex="${!lon && k === st.c ? 0 : -1}">${lead ? `<b>${nm(x.tab || x.n)}</b><span>${t(x.ex ? "bel.ex" : "bel.tag")}</span>` : `${x.sym ? `<svg viewBox="${x.vb}" aria-hidden="true"><use href="#${x.sym}"/></svg>` : ""}${nm(x.tab || x.n)}`}</button>`).join("") + (lead ? `<button type="button" role="tab" class="tstab" data-case="-1" aria-selected="${lon}" aria-controls="${lead.panel}" tabindex="${lon ? 0 : -1}">${lead.label()}</button>` : "");
    const logo = $("logo"); logo.innerHTML = Array.isArray(c.logo) ? c.logo[i] : c.logo; logo.setAttribute("role", "img"); logo.setAttribute("aria-label", nm(c.n));
    if (ids.nm) $("nm").textContent = c.nm ? c.nm[i] : "";
    const tag = $("body").querySelector(".beltag"); if (tag) { tag.hidden = !!c.notag && !c.ex; tag.textContent = t(c.ex ? "bel.ex" : "bel.tag"); }
    $("t").textContent = c.t[i];
    $("p").textContent = c.p[i];
    $("st").innerHTML = c.st.map(x => `<div><strong>${x[i]}</strong><span>${x[2 + i]}</span></div>`).join("");
    $("win").textContent = c.win[i];
    $("mtabs").innerHTML = c.mk.map((x, k) => `<button type="button" role="tab" data-bel="${k}" aria-selected="${k === st.m}" aria-controls="${ids.rows}" tabindex="${k === st.m ? 0 : -1}">${x.n[i]}</button>`).join("");
    // Alven's in-the-loop look: each step is a message from Odelia, with a chip for what kind of step it is, joined by connectors
    rows.classList.remove("st2"); rows.classList.add("st3");
    rows.innerHTML = m.r.map((r, k) => `${k ? `<li class="scn" aria-hidden="true"><svg width="16" height="26" viewBox="0 0 16 26"><path d="M8 0v26" stroke="#D3D9E3"/><circle cx="8" cy="13" r="6.5" fill="#fff" stroke="#C7D3E3"/><text x="8" y="16" text-anchor="middle" font-size="8" font-weight="600" fill="#4D73A3">${k + 1}</text></svg></li>` : ""}<li class="sbub y-${r.y}${r.c ? " crit" : ""}"><span class="sorb" aria-hidden="true"></span><div class="sbc"><b>${r.t[i]}</b><p>${r.d[i]}</p><div class="schips"><span class="sfile"><span class="sfi">${SCHIP[r.y]}</span><span><b>${t("bel.y" + r.y)}</b><small>${t("bel.s" + r.y)}</small></span></span>${r.c ? `<span class="scrit">${t(r.c)}</span>` : ""}</div></div></li>`).join("");
    $("src").innerHTML = (c.pre ? t(c.pre) : o.pre ? t(o.pre) : "") + t(m.src.length > 1 ? "bel.srcs" : "bel.src") + m.src.map(x => `<a href="${x[0]}" target="_blank" rel="noopener">${x[1 + i]} ↗</a>`).join(i ? "、" : ", ");
    if (anim === "rows" && !RM){ rows.classList.remove("sw"); void rows.offsetWidth; rows.classList.add("sw"); }
    if (anim === "case" && !RM){ const b = $("body"); b.classList.remove("sw"); void b.offsetWidth; b.classList.add("sw"); }
  }
  const tabs = $("mtabs"), ctabs = $("tabs");
  if (!tabs || !ctabs) return () => {};   // the case studies are on /more.html only (land9)
  const go = k => { if (k === st.m) return; st.m = k; render("rows"); track(o.ev + "_market", {c: st.c, m: k}); };
  const goCase = k => { if (k === st.c) return; st.c = k; st.m = 0; render("case"); track(o.ev + "_view", {c: k}); };
  const keys = (el, attr, cur, n, fn) => el.addEventListener("keydown", e => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault(); fn((cur() + (e.key === "ArrowRight" ? 1 : n() - 1)) % n()); el.querySelector(`[${attr}="${cur()}"]`).focus(); });
  tabs.addEventListener("click", e => { const b = e.target.closest("[data-bel]"); if (b) go(+b.dataset.bel); });
  ctabs.addEventListener("click", e => { const b = e.target.closest("[data-case]"); if (!b) return; const k = +b.dataset.case;
    if (k < 0) { if (!lead.on()) lead.set(true); return; }
    if (lead && lead.on()) { st.c = k; st.m = 0; lead.set(false); track(o.ev + "_view", {c: k}); return; }
    goCase(k); });
  keys(tabs, "data-bel", () => st.m, () => D[st.c].mk.length, go);
  if (lead) ctabs.addEventListener("keydown", e => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault();
    const n = D.length + 1, cur = lead.on() ? -1 : st.c, nx = ((cur + 1 + (e.key === "ArrowRight" ? 1 : n - 1)) % n) - 1;
    ctabs.querySelector(`[data-case="${nx}"]`).click(); ctabs.querySelector(`[data-case="${nx}"]`).focus(); });
  else keys(ctabs, "data-case", () => st.c, () => D.length, goCase);
  return render;
}
// one section: "Tea houses" opens the five tea-house plans, the other tabs are single case studies
let teaOn = false;   // Oct 18: the real case study (Wakimasu) leads; the example tea houses are the last tab
const showTea = () => { const a = document.getElementById("teaCard"), b = document.getElementById("caseCard"); if (a) a.hidden = !teaOn; if (b) b.hidden = teaOn; };
const caseLead = {panel: "teaBody", label: () => `<b>${t("tea.tabs")}</b><span>${t("tea.sub")}</span>`, on: () => teaOn, set: v => { teaOn = v; showTea(); renderCases(v ? undefined : "case"); renderTea(v ? "case" : undefined); }};
const renderCases = caseUI(CASES, {tabs: "caseTabs", body: "caseBody", logo: "caseLogo", t: "caseT", p: "caseP", st: "caseSt", win: "caseWin", mtabs: "belTabs", rows: "belRows", src: "belSrc"}, {ev: "case", lead: caseLead});
const renderTea = caseUI(TEA, {tabs: "teaTabs", body: "teaBody", logo: "teaLogo", nm: "teaNm", t: "teaT", p: "teaP", st: "teaSt", win: "teaWin", mtabs: "teaMk", rows: "teaRows", src: "teaSrc"}, {ev: "tea", pre: "tea.src"});
function renderBel(anim){ showTea(); renderCases(anim); renderTea(anim); }

/* ============ proof band: claims only behind their PROOF flag; otherwise facts true by construction ============ */
function pfDay(d){ if (!d) return ""; const x = new Date(d + "T12:00:00Z"); return L() ? `${x.getUTCMonth() + 1} 月 ${x.getUTCDate()} 日` : x.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); }
function renderProof(){
  const el = document.getElementById("pfRow"); if (!el) return;
  const n = agCount(), items = [
    PROOF.stats31000 && ["31,000+", t("pf.s1")],
    // land98: Ferrari's 5 months and Stefan's 4 months stand on their own quote cards just below, with the person and
    // the organization, so the row does not say them twice
    PROOF.stats31000 && ["3+", t("pf.s2b")],
    n && [String(n), t("pf.ag").replace("{r}", agRegions())],   // counted from the agency list on this page
    ["50", t("pf.s3")],                                           // the US map covers every state
    +el.dataset.forms && [Number(el.dataset.forms).toLocaleString("en-US"), t("pf.fm").replace("{d}", pfDay(el.dataset.read))],   // written by scripts/seo/build.mjs from the proof log
    ["0", t("pf.appr")],                                          // policy: nothing is filed without the customer's approval
    ["2", t("pf.lang")]                                           // the site, plans and dashboard ship in English and Chinese
  ].filter(Boolean).slice(0, 4);
  el.innerHTML = items.map(([b, x]) => `<div role="listitem"><b>${esc(b)}</b><span>${x}</span></div>`).join("");
}

/* ============ pricing, faq ============ */
let PR_INT = "year";
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("#prInt [data-int]"); if (!b || b.dataset.int === PR_INT) return; PR_INT = b.dataset.int; renderPrice(); });
function renderPrice(){ const i = L();
  // Oct 18: the one number up front is the store plan, read from TIERS so it can never drift from the plan cards
  // Oct 23: Yearly (the default, and what shows without JS) or Monthly, $179 a store month to month
  const pv = document.getElementById("prV"), pps = document.getElementById("prPs"), pin = document.getElementById("prInt"), mo = PR_INT === "month";
  if (pv) pv.textContent = mo ? t("price.mv") : TIERS[0].v[i]; if (pps) pps.textContent = mo ? t("price.mps") : TIERS[0].ps[i];
  const cp = document.getElementById("c96P"), cps = document.getElementById("c96Ps");
  if (cp) cp.innerHTML = t(mo ? "c96.c2m" : "c96.c2"); if (cps) cps.textContent = t(mo ? "c96.c2ms" : "c96.c2y");
  if (pin) { pin.hidden = false; pin.querySelectorAll("[data-int]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.int === PR_INT))); }
  const tierHtml = p => `<div class="plan${p.hl ? " pfeat" : ""}"><p class="pl"><span>${p.l[i]}</span>${p.tag ? `<span class="ptag">${p.tag[i]}</span>` : ""}</p><p class="pv">${p.v[i]}<small>${p.u[i]}</small></p><p class="pps">${p.ps[i]}</p><p class="pn">${p.n[i]}</p><ul class="plist">${p.f.map(f => `<li>${CHECK}<p>${f[i]}</p></li>`).join("")}</ul><div class="pcta">${p.mail ? `<a class="btn b-out" href="mailto:support@placetta.com?subject=Odelia%20for%20franchisors" data-track="price_scale">${p.cta[i]}</a>` : `<button type="button" class="btn ${p.hl ? "b-ink" : "b-out"}" data-open="pricing">${p.cta[i]}</button>`}${p.hl ? `<small>${t("price.risk")}</small>` : ""}</div></div>`;
  if (document.getElementById("tiers2")) document.getElementById("tiers2").innerHTML = TIERS.slice(0, 2).map(tierHtml).join("");
  const tg = document.getElementById("tiers"); if (tg) tg.innerHTML = TIERS.slice(2).map(tierHtml).join(""); }
let fOpen = 0;
function renderFaq(){
  if (!document.getElementById("faqList")) return;
  const i = L();
  document.getElementById("faqList").innerHTML = FAQ.map((f,k) => `<div class="fq ${k===fOpen?"on":""}"><button type="button" data-f="${k}" aria-expanded="${k===fOpen}"><span class="fqt">${f[0][i]}</span><svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 1v12M1 7h12"/></svg></button><div class="tg"><div><p>${f[1][i]}</p></div></div></div>`).join("");
  document.querySelectorAll("#faqList [data-f]").forEach(b => b.addEventListener("click", () => { const k = +b.dataset.f; fOpen = fOpen === k ? -1 : k; renderFaq(); }));
}

/* ============ scroll: nav state ============ */
let ticking = false;
function onScroll(){
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const top = document.getElementById("top"), hero = top ? top.getBoundingClientRect() : {bottom: 0};   // /more.html has no hero: the light header
    document.getElementById("hdr").classList.toggle("light", hero.bottom < 70);
  });
}
addEventListener("scroll", onScroll, {passive:true});

/* ============ reveal + in-view behaviour ============ */
/* land98: nothing is hidden on load. A section is only faded in at the moment it comes within a fifth of a screen of
   the viewport's bottom edge: it gets .pre for two frames, then eases in. Without JavaScript or IntersectionObserver,
   with reduced motion, for crawlers and full-page captures, every section simply shows. */
const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return; const el = e.target; io.unobserve(el);
  if (el.getBoundingClientRect().top < innerHeight * .8) return;
  el.classList.add("pre"); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("pre")));
}), {threshold:0, rootMargin:"0px 0px 20% 0px"}) : null;
if (io && !RM) document.querySelectorAll(".rv").forEach(el => { if (el.getBoundingClientRect().top > innerHeight) io.observe(el); });
// the finished plan is the still frame; the first time it scrolls into view (motion allowed) it plays from the typed line
new IntersectionObserver(es => es.forEach(e => { vVisible = e.isIntersecting; if (vVisible && !vSeen.v && e.intersectionRatio >= .3){ vSeen.v = true; if (vMode === "wait"){ vt = -INTRO; vMode = "intro"; paintApp(); } } if (vVisible && vMode === "scroll") vScrollTarget(); }), {threshold: [0, .3]}).observe(document.getElementById("vcard"));

/* ============ sample-plan links ============ */
document.addEventListener("click", e => { if (e.target.closest('a[data-sec="sample"]')) { track("sample_plan_click", {}); vt = -INTRO; vMode = RM ? "time" : "intro"; setPlay(RM); } });

/* ============ plan request: 4 quick steps ============ */
const MARKETS = [["Los Angeles, CA","加州洛杉矶"],["New York, NY","纽约"],["San Francisco Bay Area","旧金山湾区"],["Houston, TX","得州休斯顿"],["Seattle, WA","华盛顿州西雅图"],["Several markets","多个市场"]];
const INDUSTRIES = [["fb","Food and beverage","餐饮"],["retail","Retail","零售"],["health","Health and wellness","健康养生"],["fitness","Fitness","健身"],["other","Other","其他"]];
const HQS = [["cn","China","中国"],["us","United States","美国"],["other","Other","其他"]];
const OPENINGS = [["3m","Within 3 months","3 个月内"],["6m","3 to 6 months","3 至 6 个月"],["12m","6 to 12 months","6 至 12 个月"],["12m+","12+ months","12 个月以上"],["unsure","Not sure yet","还不确定"]];
const LOCS = ["1",["2–5","2 to 5","2 至 5"],["6–20","6 to 20","6 至 20"],"20+"];   // values stay as the lead form sends them
const CHK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4D73A3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const blankQ = () => ({market:"", industry:"", hq:"", hqOther:"", opening:"", locations:"", contact:"", email:"", wechat:"", company:"", website:"", plang:""});
let Q = blankQ(), qStep = 0, submitted = false, source = "unknown", lastFocus = null, leaveShown = false, errShown = false;
const modal = document.getElementById("modal");
const audienceOf = s => s === "cn" ? "chinese_brands" : "general";
const marketLabel = () => { const m = MARKETS.find(x => x[0] === Q.market); return m ? m[L()] : Q.market; };
const pick = (arr, v) => { const x = arr.find(a => a[0] === v); return x ? x[1 + L()] : v; };

try { const d = JSON.parse(localStorage.getItem("placetta-draft") || "null"); if (d && d.Q) { Q = Object.assign(blankQ(), d.Q); qStep = Math.min(3, d.step || 0); } submitted = localStorage.getItem("placetta-sent") === "1"; } catch(e){}
function save(){ try { localStorage.setItem("placetta-draft", JSON.stringify({Q, step: qStep})); } catch(e){} updateResume(); }

const valid = {
  0: () => !!Q.market.trim(),
  1: () => !!Q.industry && !!Q.hq,
  2: () => !!Q.opening && !!Q.locations,
  3: () => contactOk()
};
function contactOk(){
  if (Q.contact === "wechat") return /^[A-Za-z0-9_+\-]{5,30}$/.test(Q.wechat.trim());
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(Q.email.trim());
}
function chips(key, arr){ return `<div class="qchips" role="group">${arr.map(a => { const v = Array.isArray(a) ? a[0] : a; const lab = Array.isArray(a) ? (a.length === 2 ? a[L()] : a[1 + L()]) : a; return `<button type="button" data-k="${key}" data-v="${esc(v)}" aria-pressed="${Q[key] === v}">${lab}</button>`; }).join("")}</div>`; }

function qHTML(){
  const i = L();
  if (qStep === 0) return `<div class="qpane">
      <h3 class="qh" id="qTitle">${t("q.0t")}</h3><p class="qs">${t("q.0s")}</p>
      <div class="qblk"><label class="sr" for="q-market">${t("q.0t")}</label><input class="qin" id="q-market" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="next" placeholder="${t("q.0ph")}" value="${esc(MARKETS.find(x=>x[0]===Q.market) ? "" : Q.market)}"></div>
      <div class="qblk" style="margin-top:12px">${chips("market", MARKETS)}</div>
      <div class="qfoot"><small>${t("st.note")}</small><button type="button" class="btn b-ink" data-next ${valid[0]() ? "" : "disabled"}>${t("q.next")}</button></div></div>`;
  if (qStep === 1) return `<div class="qpane">
      <h3 class="qh" id="qTitle">${t("q.1t")}</h3>
      <div class="qblk"><span class="qlab">${t("q.1a")}</span>${chips("industry", INDUSTRIES)}</div>
      <div class="qblk"><span class="qlab">${t("q.1b")}</span>${chips("hq", HQS)}
        ${Q.hq === "other" ? `<input class="qin" id="q-hqo" style="margin-top:10px" autocomplete="country-name" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="next" placeholder="${t("q.1ph")}" value="${esc(Q.hqOther)}">` : ""}</div>
      <div class="qfoot"><small>${t("st.note")}</small><button type="button" class="btn b-ink" data-next ${valid[1]() ? "" : "disabled"}>${t("q.next")}</button></div></div>`;
  if (qStep === 2) return `<div class="qpane">
      <h3 class="qh" id="qTitle">${t("q.2t")}</h3>
      <div class="qblk"><span class="qlab">${t("q.2a")}</span>${chips("opening", OPENINGS)}</div>
      <div class="qblk"><span class="qlab">${t("q.2b")}</span>${chips("locations", LOCS)}</div>
      <div class="qfoot"><small>${t("st.note")}</small><button type="button" class="btn b-ink" data-next ${valid[2]() ? "" : "disabled"}>${t("q.next")}</button></div></div>`;
  if (qStep === 3){
    if (!Q.contact) Q.contact = (lang === "zh" || Q.hq === "cn") ? "wechat" : "email";
    if (!Q.plang) Q.plang = lang;
    const items = [["State registration and tax accounts","州注册与税务账户"],["City business license","市营业执照"]];
    if (Q.industry === "fb") items.push(["Health permit","卫生许可"],["Liquor license, if you serve alcohol","酒类执照（如供应酒精饮料）"]);
    items.push(["Fire and building permits","消防与建筑许可"],["Sign permit","招牌许可"],["Zoning and certificate of occupancy","区划与使用许可证"]);
    if (Q.hq && Q.hq !== "us") items.push(["Foreign-ownership checks on your lease","外资租赁限制核查"]);
    items.push(["Timeline, order and government fees","时间表、顺序和政府规费"]);
    const isW = Q.contact === "wechat";
    return `<div class="qpane">
      <h3 class="qh" id="qTitle">${t("q.3t")}</h3>
      <div class="qprev"><b>${t("q.prev").replace("{m}", esc(marketLabel()))}</b><ul>${items.map(x => `<li>${CHK}<span>${x[i]}</span></li>`).join("")}</ul><small>${t("q.prevn")}</small></div>
      <div class="qblk">
        <div class="qseg" role="group"><button type="button" data-contact="email" aria-pressed="${!isW}">${t("q.email")}</button><button type="button" data-contact="wechat" aria-pressed="${isW}">${t("q.wechat")}</button></div>
        <label class="sr" for="q-contact">${isW ? t("q.wechat") : t("q.email")}</label>
        <input class="qin" id="q-contact" ${isW ? 'autocomplete="off"' : 'type="email" autocomplete="email" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false"'} enterkeyhint="send" placeholder="${isW ? t("q.wechatph") : t("q.emailph")}" value="${esc(isW ? Q.wechat : Q.email)}">
        <p class="qerr" id="qErr" ${errShown && !contactOk() ? "" : "hidden"}>${isW ? t("q.errWechat") : t("q.errEmail")}</p>
        <div class="qrow2"><span class="qlab">${t("q.plang")}</span><div class="qmini" role="group"><button type="button" data-pl="en" aria-pressed="${Q.plang === "en"}">English</button><button type="button" data-pl="zh" aria-pressed="${Q.plang === "zh"}">中文</button></div></div>
        <details class="qopt" ${Q.company || Q.website ? "open" : ""}><summary>${t("q.opt")}</summary><div class="g2">
          <div><label class="qlab" for="q-company">${t("q.company")}</label><input class="qin" id="q-company" autocomplete="organization" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="next" value="${esc(Q.company)}"></div>
          <div><label class="qlab" for="q-site">${t("q.site")}</label><input class="qin" id="q-site" inputmode="url" autocomplete="url" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${t("q.siteph")}" value="${esc(Q.website)}"></div></div></details>
      </div>
      <div class="qfoot"><small>${t("q.fine")}</small><button type="button" class="btn b-ink" data-send>${t("q.send")}</button></div></div>`;
  }
  const c = Q.contact === "wechat" ? `${t("q.wechat")} ${esc(Q.wechat)}` : esc(Q.email);
  if (Q.contact !== "wechat") return `<div class="qpane qdone">
      <div class="ok"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><path d="M4 12l5 5L20 6"/></svg></div>
      <h3 class="qh" id="qTitle">${t("q.goT")}</h3>
      <p class="qs">${t("q.goP").replace("{m}", "<b>" + esc(marketLabel()) + "</b>").replace("{c}", "<b>" + c + "</b>")}</p>
      <div class="qfoot"><small>${t("q.goN")}</small><a class="btn b-ink" href="/app/" data-track="handoff_app">${t("q.go")}</a></div></div>`;
  return `<div class="qpane qdone">
      <div class="ok"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><path d="M4 12l5 5L20 6"/></svg></div>
      <h3 class="qh" id="qTitle">${t("q.doneT")}</h3>
      <p class="qs">${t("q.doneP").replace("{m}", "<b>" + esc(marketLabel()) + "</b>").replace("{c}", "<b>" + c + "</b>")}</p>
      <ol class="qnext"><li>${t("q.n1").replace("{m}", esc(marketLabel()))}</li><li>${t("q.n2")}</li><li>${t("q.n3")}</li></ol>
      ${WECHAT_QR ? `<div class="qwc"><img src="${WECHAT_QR}" alt="" width="64" height="64"><p>${t("q.wc")}</p></div>` : ""}
      <div class="qfoot"><a class="btn b-soft" href="/sample-plan" data-sec="sample" data-close>${t("q.sample")}</a><button type="button" class="btn b-ink" data-close>${t("done.btn")}</button></div></div>`;
}

function renderStep(){
  const done = qStep > 3;
  document.getElementById("qBody").innerHTML = qHTML();
  document.getElementById("qBar").style.width = (done ? 100 : (qStep / 4) * 100 + 6) + "%";
  document.getElementById("qStep").textContent = done ? "" : t("q.step").replace("{n}", qStep + 1);
  document.getElementById("qBack").disabled = qStep === 0 || done;
  const f = document.querySelector('#qBody input:not([type=hidden])');
  if (qStep === 0 || (qStep === 3)) setTimeout(() => { const el = qStep === 0 ? document.getElementById("q-market") : document.getElementById("q-contact"); if (el && innerWidth >= 640) el.focus(); }, 60);
}
function refreshNext(){ const b = document.querySelector("#qBody [data-next]"); if (b) b.disabled = !valid[qStep](); }
function go(n){
  if (n > qStep) track("form_step_complete", {step: qStep + 1, source});
  qStep = n; errShown = false; save(); renderStep();
  track("form_step_view", {step: Math.min(qStep + 1, 5), source});
}
let autoT = null;
document.getElementById("qBody")?.addEventListener("click", e => {
  const c = e.target.closest("[data-k]");
  if (c){
    const k = c.dataset.k, v = c.dataset.v; Q[k] = v;
    if (k === "market"){ const inp = document.getElementById("q-market"); if (inp) inp.value = ""; }
    c.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === c)));
    save();
    if (k === "hq"){ renderStep(); if (v === "other") { const o = document.getElementById("q-hqo"); if (o) o.focus(); return; } }
    refreshNext();
    clearTimeout(autoT);
    if (valid[qStep]() && !(qStep === 1 && Q.hq === "other")) autoT = setTimeout(() => go(qStep + 1), 280);
    return;
  }
  if (e.target.closest("[data-next]")){ if (valid[qStep]()) go(qStep + 1); return; }
  const ct = e.target.closest("[data-contact]");
  if (ct){ Q.contact = ct.dataset.contact; errShown = false; save(); renderStep(); setTimeout(() => document.getElementById("q-contact").focus(), 30); return; }
  const pl = e.target.closest("[data-pl]");
  if (pl){ Q.plang = pl.dataset.pl; save(); pl.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === pl))); return; }
  if (e.target.closest("[data-send]")){ submit(); return; }
  if (e.target.closest("[data-close]")){ closeForm(true); }
});
document.getElementById("qBody")?.addEventListener("input", e => {
  const id = e.target.id, v = e.target.value;
  if (id === "q-market"){ Q.market = v; document.querySelectorAll('#qBody [data-k="market"]').forEach(b => b.setAttribute("aria-pressed","false")); }
  else if (id === "q-hqo") Q.hqOther = v;
  else if (id === "q-contact"){ if (Q.contact === "wechat") Q.wechat = v; else Q.email = v; if (errShown){ document.getElementById("qErr").hidden = contactOk(); e.target.setAttribute("aria-invalid", String(!contactOk())); } }
  else if (id === "q-company") Q.company = v;
  else if (id === "q-site") Q.website = v;
  save(); refreshNext();
});
document.getElementById("qBody")?.addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
  e.preventDefault();
  if (qStep === 3) submit(); else if (valid[qStep]()) go(qStep + 1);
});
/* ============ plan requests: every submission is saved to the Placetta database ============ */
// LEADS.url and LEADS.key are the project's public API URL and publishable key. That key can only add rows:
// row-level security blocks reading, editing and deleting, so it is safe to ship in the page.
const LEADS = {url: "https://esquxzcfsylffuijvzec.supabase.co", key: "sb_publishable_Ub54H3S-bU8WDuY7toMtzg_S1ieEO_p", table: "plan_requests"};
const OUTBOX = "placetta-outbox";
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
function leadRow(){
  const qs = new URLSearchParams(location.search), utm = {};
  qs.forEach((v, k) => { if (k.startsWith("utm_")) utm[k] = v.slice(0, 200); });
  const wc = Q.contact === "wechat";
  return {client_id: uuid(), source, page_lang: lang, preferred_language: Q.plang || null, market: Q.market || null, industry: Q.industry || null,
    hq: Q.hq === "other" ? (Q.hqOther || "other") : (Q.hq || null), opening: Q.opening || null, locations: Q.locations || null,
    contact_method: Q.contact || null, email: wc ? null : (Q.email || null), wechat: wc ? (Q.wechat || null) : null,
    company: Q.company || null, website: Q.website || null, answers: Object.assign({}, Q), utm,
    page_url: location.href.slice(0, 500), referrer: document.referrer.slice(0, 500) || null, user_agent: navigator.userAgent.slice(0, 300)};
}
function postLead(row){
  if (!LEADS.url || !LEADS.key) return Promise.resolve(false);
  return fetch(`${LEADS.url}/rest/v1/${LEADS.table}`, {method: "POST", keepalive: true,
      headers: {"apikey": LEADS.key, "Content-Type": "application/json", "Prefer": "return=minimal"}, body: JSON.stringify(row)})
    // saved, or already saved by an earlier retry; a 400 means the row itself was refused, so retrying cannot help
    .then(r => r.ok ? "saved" : r.status === 409 ? "dup" : (r.status === 400 || r.status === 422) ? "refused" : false).catch(() => false);
}
function outbox(){ try { return JSON.parse(localStorage.getItem(OUTBOX) || "[]"); } catch(e){ return []; } }
function setOutbox(a){ try { if (a.length) localStorage.setItem(OUTBOX, JSON.stringify(a.slice(-20))); else localStorage.removeItem(OUTBOX); } catch(e){} }
const dropSent = id => setOutbox(outbox().filter(r => r.client_id !== id));
// keep a copy in this browser until the database confirms it, so a dropped connection never loses a request
function sendLead(row){
  setOutbox(outbox().concat(row));
  return postLead(row).then(st => { if (st) dropSent(row.client_id); track(st === "refused" ? "plan_request_refused" : st ? "plan_request_saved" : "plan_request_queued", {source: row.source}); return st; });
}
function flushOutbox(){ outbox().forEach(row => postLead(row).then(ok => { if (ok) dropSent(row.client_id); })); }
flushOutbox(); addEventListener("online", flushOutbox);

function submit(){
  if (!contactOk()){
    errShown = true; const inp = document.getElementById("q-contact"); inp.setAttribute("aria-invalid","true"); document.getElementById("qErr").hidden = false; inp.focus();
    track("form_validation_error", {step: 4, field: Q.contact}); return;
  }
  track("plan_request_submitted", {source, audience: audienceOf(source), preferred_language: Q.plang, contact_method: Q.contact, industry: Q.industry, hq: Q.hq === "other" ? (Q.hqOther || "other") : Q.hq, market: Q.market, opening: Q.opening, locations: Q.locations, has_company: !!Q.company});
  sendLead(leadRow());
  submitted = true;
  sendLead(source);
  if (Q.contact !== "wechat") try { localStorage.setItem("placetta-handoff", JSON.stringify({v: 1, at: Date.now(), email: Q.email.trim(), company: Q.company.trim(), market: marketLabelEn(), industry: Q.industry, opening: Q.opening, plang: Q.plang || lang})); } catch(e){}
  try { localStorage.setItem("placetta-sent", "1"); localStorage.removeItem("placetta-draft"); } catch(e){}
  qStep = 4; renderStep(); updateResume();
}

/* Plan requests are kept in Placetta's database (public.plan_requests: anyone can add one, nobody can read them back
   except the team in Supabase). The publishable key is meant for the browser. */
const SUPA = "https://esquxzcfsylffuijvzec.supabase.co", SUPA_KEY = "sb_publishable_Ub54H3S-bU8WDuY7toMtzg_S1ieEO_p";
const marketLabelEn = () => { const m = MARKETS.find(x => x[0] === Q.market); return m ? m[0] : Q.market.trim(); };
function sendLead(src){
  const p = new URLSearchParams(location.search), utm = {};
  ["utm_source","utm_medium","utm_campaign","utm_term","utm_content"].forEach(k => { if (p.get(k)) utm[k] = p.get(k).slice(0, 200); });
  const w = Q.contact === "wechat";
  const row = {
    client_id: crypto.randomUUID(),
    source: src, page_lang: lang, preferred_language: Q.plang || lang, market: marketLabelEn().slice(0, 300), industry: Q.industry, hq: Q.hq === "other" ? (Q.hqOther || "other").slice(0, 100) : Q.hq,
    opening: Q.opening, locations: Q.locations, contact_method: w ? "wechat" : "email", email: w ? null : Q.email.trim().slice(0, 320), wechat: w ? Q.wechat.trim().slice(0, 100) : null,
    company: Q.company.trim().slice(0, 300) || null, website: Q.website.trim().slice(0, 500) || null, answers: Q, utm,
    page_url: (location.origin + location.pathname).slice(0, 500), referrer: document.referrer.slice(0, 500) || null, user_agent: navigator.userAgent.slice(0, 300),
  };
  fetch(SUPA + "/rest/v1/plan_requests", { method: "POST", keepalive: true, headers: { apikey: SUPA_KEY, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(row) })
    .then(r => track(r.ok ? "plan_request_saved" : "plan_request_save_failed", {status: r.status}))
    .catch(() => track("plan_request_save_failed", {status: 0}));
}

/* the Beam rides the sheet's border when Get my plan is clicked in the hero; its bundle loads once, ahead of time when idle */
let beamP = null;
function beamLoad(){ return beamP || (beamP = new Promise(r => { const sc = document.createElement("script"); sc.src = "/beam.js"; sc.async = true; sc.onload = r; sc.onerror = r; document.head.appendChild(sc); })); }
function beam(on){ if (!on && !beamP) return; beamLoad().then(() => window.placettaBeam && window.placettaBeam(on && !modal.hidden)); }
addEventListener("load", () => setTimeout(() => (window.requestIdleCallback || setTimeout)(beamLoad), 2500));
function openForm(src, preset){
  source = src; lastFocus = document.activeElement; leaveShown = false;
  if (submitted && qStep > 3){ Q = blankQ(); qStep = 0; submitted = false; try { localStorage.removeItem("placetta-sent"); } catch(e){} }
  if (qStep <= 3) submitted = false;
  const resumed = qStep > 0 && !preset;
  if (preset){ Q.market = preset; if (qStep < 1) qStep = 1; save(); }
  document.getElementById("qLeave").hidden = true;
  modal.hidden = false; document.body.style.overflow = "hidden";
  renderStep(); updateMbar();
  beam(src === "hero");
  track("form_open", {source, audience: audienceOf(src), resumed, start_step: qStep + 1});
}
function closeForm(force){
  if (!force && qStep >= 1 && qStep <= 3 && !leaveShown){
    leaveShown = true;
    const left = 4 - qStep;
    document.getElementById("qLeaveT").textContent = t("q.leaveT");
    document.getElementById("qLeaveP").textContent = t("q.leaveP").replace("{n}", left === 1 ? t("q.one") : t("q.many").replace("{n}", left));
    document.getElementById("qKeep").textContent = t("q.keep");
    document.getElementById("qLeaveBtn").textContent = t("q.leave");
    document.getElementById("qLeave").hidden = false; document.getElementById("qKeep").focus();
    track("form_leave_prompt", {step: qStep + 1}); return;
  }
  if (qStep <= 3) track("form_abandon", {step: qStep + 1, source});
  modal.hidden = true; document.body.style.overflow = ""; document.getElementById("qLeave").hidden = true;
  beam(false);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  updateResume(); updateMbar();
}
document.getElementById("qKeep")?.addEventListener("click", () => { document.getElementById("qLeave").hidden = true; track("form_leave_kept", {step: qStep + 1}); renderStep(); });
document.getElementById("qLeaveBtn")?.addEventListener("click", () => closeForm(true));
document.getElementById("qBack")?.addEventListener("click", () => { if (qStep > 0) go(qStep - 1); });
document.getElementById("mClose")?.addEventListener("click", () => closeForm(false));
modal.addEventListener("click", e => { if (e.target === modal) closeForm(false); });
addEventListener("keydown", e => {
  if (modal.hidden) return;
  if (e.key === "Escape") { if (!document.getElementById("qLeave").hidden) { document.getElementById("qKeep").click(); } else closeForm(false); }
  if (e.key === "Tab"){ const f = [...document.getElementById("sheet").querySelectorAll('button:not([disabled]),input,summary,a[href]')].filter(x => x.offsetParent !== null); if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length-1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length-1]) { e.preventDefault(); f[0].focus(); } }
});
document.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openForm(b.dataset.open)));
// plan buttons are re-rendered on every language switch, so they are handled by delegation
["tiers", "tiers2"].filter(id => document.getElementById(id)).forEach(id => document.getElementById(id).addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b) { track("price_plan_click", {plan: b.textContent}); openForm(b.dataset.open); } }));
document.querySelectorAll("form.starter").forEach(f => f.addEventListener("submit", e => {
  e.preventDefault(); const v = f.querySelector("input").value.trim();
  track("starter_submit", {source: f.dataset.src, has_market: !!v});
  if (!v && !Q.market){ openForm(f.dataset.src); return; }
  openForm(f.dataset.src, v || null); f.querySelector("input").value = "";
}));

/* resume chip + sticky mobile bar */
function updateResume(){
  const r = document.getElementById("resume");
  const show = !submitted && qStep >= 1 && qStep <= 3 && !!Q.market && modal.hidden;
  r.hidden = !show;
  if (show) document.getElementById("resumeT").textContent = t("resume").replace("{m}", marketLabel());
  updateMbar();
}
document.getElementById("resume")?.addEventListener("click", () => openForm("resume_chip"));
function updateMbar(){
  const bar = document.getElementById("mbar");
  const top = document.getElementById("top"), ctas = document.querySelector(".ctas");   // /more.html has neither: the bar shows there
  const hero = top ? top.getBoundingClientRect() : {bottom: -1}, fin = ctas ? ctas.getBoundingClientRect() : {top: Infinity};
  const inProg = !submitted && qStep >= 1 && qStep <= 3;
  document.getElementById("mbarT").textContent = inProg ? t("mbar.r").replace("{n}", qStep + 1) : t("mbar.t");
  document.getElementById("mbarB").textContent = inProg ? t("mbar.rb") : t("mbar.b");
  bar.classList.toggle("show", modal.hidden && hero.bottom < 0 && fin.top > innerHeight - 40);
}
addEventListener("scroll", () => requestAnimationFrame(updateMbar), {passive:true});

/* ============ favicon into <head> ============ */
(() => { const f = document.getElementById("favicon"); if (f && f.parentElement !== document.head) { document.querySelectorAll('head link[rel~="icon"]').forEach(l => l.remove()); document.head.appendChild(f); } })();

/* ============ franchise brand strip ============ */
const BRANDS = ["Chatime","Tous les Jours","bb.q Chicken","Paris Baguette","Molly Tea","Chagee","Tiger Sugar","Gong Cha","Happy Lamb Hot Pot","Gyu-Kaku","Luckin Coffee","Mixue","Jollibee","Tim Hortons","Pollo Campero","Bafang Yunji","Naisnow","Zhu Guang Yu Hot Pot","LINLEE","Tastien","Juewei","Kuafu Fried Skewers","Zhengxin Chicken","Auntea Jenny","Guming","Wallace","Cotti Coffee","Zhangliang Malatang","Yang Guofu Malatang","Yang's Braised Chicken Rice","Tantanxiang","Yi Dian Dian","Five Guys","Chili's","Wingstop","McDonald's","Wendy's","Popeyes","Chick-fil-A","Burger King","Jersey Mike's","Pieology","Applebee's","7 Brew Coffee","Subway","Domino's","KFC","Dunkin'","Starbucks","Costa Coffee","Dutch Bros Coffee","Yogurtland","Pizza Hut","Miniso","Hertz","Planet Fitness","The UPS Store","Ligne Roset","Natuzzi","Roche Bobois","BoConcept","Oppein Home","Gautier","Calligaris","Schmidt","KUKA Home","Quanu","QM Qumei","Crunch Fitness","Gold's Gym","Meiyijia","Yonny","7-Eleven","Lawson","FamilyMart"];
// Logo files supplied by the user; brands without a file show their name until one is added.
const LOGOS = {"Hertz": "logos/hertz.png", "Planet Fitness": {src: "logos/planet-fitness.png", big: true}, "The UPS Store": "logos/ups-store.png", "Ligne Roset": {src: "logos/ligne-roset.png", tall: true}, "Natuzzi": {src: "logos/natuzzi.png", mid: true}, "BoConcept": "logos/boconcept.png", "Oppein Home": "logos/oppein.png", "Gautier": "logos/gautier.png", "Calligaris": "logos/calligaris.png", "Schmidt": "logos/schmidt.png", "KUKA Home": {src: "logos/kuka.png", tall: true}, "Quanu": {src: "logos/quanu.png", mq: true}, "QM Qumei": {src: "logos/qumei.png", tall: true}, "Roche Bobois": {src: "logos/roche-bobois.png", big: true}, "Crunch Fitness": {src: "logos/crunch-fitness.png", big: true}, "Gold's Gym": {src: "logos/golds-gym.png", big: true, label: ["Gold's Gym","Gold's Gym"]}, "Starbucks": {src: "logos/starbucks.png", tall: true}, "Chick-fil-A": {src: "logos/chick-fil-a.png", tall: true}, "Costa Coffee": {src: "logos/costa-coffee.png", tall: true}, "Luckin Coffee": "logos/luckin-coffee.png", "Chagee": "logos/chagee.png", "Mixue": "logos/mixue.png", "Auntea Jenny": "logos/auntea-jenny.png", "Guming": "logos/guming.png", "Chili's": "logos/chilis.png", "Wallace": {src: "logos/wallace.png", tall: true}, "Happy Lamb Hot Pot": {src: "logos/happy-lamb.png", tall: true, label: ["Happy Lamb","快乐小羊"]}, "Gyu-Kaku": {src: "logos/gyu-kaku.png", tall: true}, "KFC": {src: "logos/kfc.png", tall: true}, "McDonald's": "logos/mcdonalds.png", "Domino's": "logos/dominos.png", "Paris Baguette": {src: "logos/paris-baguette.png", thin: true}, "Tim Hortons": "logos/tim-hortons.png", "7-Eleven": {src: "logos/7-eleven.png", tall: true}, "Tastien": "logos/tastien.png", "Tous les Jours": {src: "logos/tous-les-jours.png", mid: true}, "bb.q Chicken": "logos/bbq-chicken.png", "Bafang Yunji": {src: "logos/bafang.png", tall: true}, "Zhengxin Chicken": {src: "logos/zhengxin.png", tall: true}, "Juewei": "logos/juewei.png", "Naisnow": {src: "logos/naisnow.png", tall: true}, "Pizza Hut": {src: "logos/pizza-hut.png", tall: true}, "Five Guys": "logos/five-guys.png", "Yi Dian Dian": "logos/yi-dian-dian.png", "Wingstop": "logos/wingstop.png", "Wendy's": {src: "logos/wendys.png", tall: true}, "Popeyes": {src: "logos/popeyes.png", tall: true}, "Burger King": {src: "logos/burger-king.png", tall: true}, "Jersey Mike's": "logos/jersey-mikes.png", "Pieology": {src: "logos/pieology.png", tall: true}, "Applebee's": {src: "logos/applebees.png", tall: true}, "7 Brew Coffee": {src: "logos/7-brew.png", tall: true}, "Subway": {src: "logos/subway.png", mid: true}, "Yogurtland": "logos/yogurtland.png", "Dunkin'": {src: "logos/dunkin.png", mid: true}, "Dutch Bros Coffee": "logos/dutch-bros.png", "Tiger Sugar": {src: "logos/tiger-sugar.png", tall: true}, "Chatime": "logos/chatime.png", "Miniso": {src: "logos/miniso.png", tall: true}, "Gong Cha": {src: "logos/gong-cha.png", tall: true}, "Jollibee": {src: "logos/jollibee.png", tall: true}, "Pollo Campero": "logos/pollo-campero.png", "Molly Tea": "logos/molly-tea.png", "Zhangliang Malatang": "logos/zhangliang.png", "Yang's Braised Chicken Rice": "logos/yang-mingyu.png", "Meiyijia": "logos/meiyijia.png", "Lawson": {src: "logos/lawson.png", mid: true}, "FamilyMart": {src: "logos/familymart.png", mid: true}, "Cotti Coffee": {src: "logos/cotti.png", mid: true}, "Yang Guofu Malatang": "logos/yang-guofu.png", "Kuafu Fried Skewers": "logos/kuafu.png", "LINLEE": "logos/linlee.png", "Zhu Guang Yu Hot Pot": "logos/zhu-guangyu.png", "Yonny": "logos/yonny.png", "Tantanxiang": {src: "logos/tantanxiang.png", tall: true}};
/* backers: operators who invested in Placetta, shown with their company's mark; a missing file falls back to the name */
const BK = [["openai","OpenAI","OpenAI","png"],["anthropic","Anthropic","Anthropic"],["spacex","SpaceX","SpaceX"],["tesla","Tesla","特斯拉"],["amazon","Amazon","亚马逊"],["deepmind","Google DeepMind","Google DeepMind"],["deepseek","DeepSeek","深度求索"],["janestreet","Jane Street","Jane Street"],["apollo","Apollo","阿波罗"],["renaissance","RenTec","文艺复兴科技"],["cursor","Cursor","Cursor"],["nvidia","NVIDIA","英伟达"],["google","Google","谷歌"],["kkr","KKR","KKR"],["tencent","Tencent","腾讯"],["bytedance","ByteDance","字节跳动"],["alibaba","Alibaba","阿里巴巴"],["huawei","Huawei","华为"],["goldmansachs","Goldman Sachs","高盛"],["merrilllynch","Merrill Lynch","美林"],["deutschebank","Deutsche Bank","德意志银行"],["blackstone","Blackstone","黑石"],["binance","Binance","币安"],["coinbase","Coinbase","Coinbase"]];
const BK_WORD = new Set(["goldmansachs","coinbase"]);
const BK_WIDE = {janestreet: 30, apollo: 17, merrilllynch: 30, blackstone: 26, kkr: 19};   // full wordmark files: drawn at their own shape, the name label hidden   // marks that are themselves the wordmark: shown large, the name label hidden
const BK_FILES = new Set(["openai","anthropic","spacex","tesla","amazon","deepmind","deepseek","cursor","nvidia","google","tencent","bytedance","alibaba","huawei","goldmansachs","deutschebank","binance","coinbase","janestreet","apollo","merrilllynch","blackstone","kkr"]);
// the wall starts folded to one row; "Show all" opens it
document.addEventListener("click", e => { const b = e.target.closest("#bkMore"); if (!b) return; const g = document.getElementById("bkG"), open = g.classList.toggle("fold") === false;
  b.setAttribute("aria-expanded", open); b.querySelector("span").textContent = open ? t("bk.less") : t("bk.more").replace("{n}", BK.length); track("backers_toggle", {open}); });
// PROOF.backersLogos off: employers as plain text, no marks, no brand colours, and no company named in the hero
function renderBk(){ const hb = document.getElementById("hBk"), lg = PROOF.backersLogos; if (hb) hb.innerHTML = (lg ? `<span class="hbkm" aria-hidden="true">${BK.filter(b => BK_FILES.has(b[0])).slice(0, 5).map(([k, , , ext]) => `<img src="logos/backers/${k}.${ext || "svg"}" alt="" loading="lazy" decoding="async" draggable="false">`).join("")}</span>` : "") + `<span>${esc(t("bk.hero"))}</span>`;
  const el = document.getElementById("bkG"); if (!el) return; const i = L(); el.classList.toggle("bkt", !lg);
  const mb = document.getElementById("bkMore"); if (mb) mb.querySelector("span").textContent = el.classList.contains("fold") ? t("bk.more").replace("{n}", BK.length) : t("bk.less");
  if (!lg) { el.innerHTML = BK.map(([, en, zh]) => `<li><span>${esc(i ? zh : en)}</span></li>`).join(""); return; }
  el.innerHTML = BK.map(([k, en, zh, ext]) => `<li${BK_FILES.has(k) ? (BK_WIDE[k] ? ' class="wl"' : BK_WORD.has(k) ? ' class="wm"' : "") : ' class="nm"'}>${BK_FILES.has(k) ? `<img src="logos/backers/${k}.${ext || "svg"}" alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false"${BK_WIDE[k] ? ` style="--h:${BK_WIDE[k]}px"` : ""}>` : ""}<span>${esc(i ? zh : en)}</span></li>`).join(""); }
// PROOF.customerNames off: the strip names the industries Odelia is built for, as plain text, and no brand
const STRIP_INDUSTRIES = [["Milk tea shops", "Coffee shops", "Restaurants", "Hot pot", "Bakeries", "Quick service", "Retail stores", "Furniture showrooms", "Fitness clubs", "Beauty and personal care", "Consumer goods", "Importers", "Warehouses", "Food factories", "Technology companies", "Game studios", "Healthcare and life sciences", "Automotive and EV"],
  ["奶茶店", "咖啡店", "餐厅", "火锅店", "烘焙店", "快餐店", "零售门店", "家具展厅", "健身房", "美妆个护", "消费品", "进口商", "仓储物流", "食品工厂", "科技公司", "游戏工作室", "医疗与生命科学", "汽车与新能源"]];
const FURN = ["Ligne Roset","Natuzzi","Roche Bobois","BoConcept","Calligaris","Gautier","Schmidt","KUKA Home","QM Qumei","Oppein Home","Quanu"];
if (VARIANT === "furniture") { const rest = BRANDS.filter(b => !FURN.includes(b)); BRANDS.length = 0; BRANDS.push(...FURN, ...rest); }
function renderStrip(){
  if (!document.getElementById("mqt")) return;   // the hero's strip; /more.html has no hero
  if (!PROOF.customerNames) { const list = STRIP_INDUSTRIES[lang === "zh" ? 1 : 0], el = document.getElementById("mqt");
    el.innerHTML = list.map(x => `<span>${esc(x)}</span>`).join("") + list.map(x => `<span aria-hidden="true">${esc(x)}</span>`).join("");
    el.style.animationDuration = Math.round(list.length * 3) + "s"; return; }
  const item = (b, hide) => {
    const L = LOGOS[b], h = hide ? ' aria-hidden="true"' : "";
    if (!L) return `<span${h}>${esc(b)}</span>`;
    const src = typeof L === "string" ? L : L.src, label = typeof L === "object" && L.label, tall = typeof L === "object" && L.tall, thin = typeof L === "object" && L.thin, mid = typeof L === "object" && L.mid, big = typeof L === "object" && L.big;
    // a mascot-only file gets the brand name beside it so the strip stays readable
    return label
      ? `<span class="lg lgl${tall ? " tall" : ""}${big ? " big" : ""}"${h}><img src="${src}" alt="" decoding="async"><em>${esc(Array.isArray(L.label) ? L.label[lang === "zh" ? 1 : 0] : typeof L.label === "string" ? L.label : b)}</em></span>`
      : `<span class="lg${tall ? " tall" : ""}${thin ? " thin" : ""}${mid ? " mid" : ""}${big ? " big" : ""}${typeof L === "object" && L.mq ? " mq" : ""}"${h}><img src="${src}" alt="${hide ? "" : esc(b)}" decoding="async"></span>`;
  };
  // phones get a shorter loop of logo brands: iOS Safari drops very wide animated layers, which made the strip vanish
  const list = innerWidth < 768 ? BRANDS.filter(b => LOGOS[b]).slice(0, 18) : BRANDS;
  const t = document.getElementById("mqt"); t.innerHTML = list.map(b => item(b, false)).join("") + list.map(b => item(b, true)).join("");
  t.style.animationDuration = Math.round(list.length * 1.25) + "s";
}
renderStrip();
/* Phones: iOS Safari drops a very wide animated layer under a mask, so the strip vanished. There it scrolls the
   container instead (scrolled content is tiled natively, at any width), paused when off screen. */
(() => {
  const mq = document.querySelector(".mq"), t = document.getElementById("mqt");
  if (!mq || !(innerWidth < 768 || matchMedia("(pointer:coarse)").matches)) return;
  mq.classList.add("mqs");
  if (RM) return;
  let x = 0, last = 0, on = true;
  new IntersectionObserver(es => { on = es[0].isIntersecting; }).observe(mq);
  const step = now => {
    const dt = Math.min(64, now - (last || now)); last = now;
    if (on && !document.hidden) {
      const half = t.scrollWidth / 2;
      if (half > 0) { x = (x + dt * 0.04) % half; mq.scrollLeft = x; }
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
})();

/* ============ hero: real footage under a blue tint ============ */
const HMAP = {world: [], states: [], dots: []};   // filled from /data/more.json (moreData)
// /more.html has no hero: the film and its tint are then stand-ins nothing shows, so the code below runs the same way
const hVid = document.getElementById("hVid") || document.createElement("video");
// the film plays everywhere, except for a visitor who asked their device for reduced motion: they keep the still frame
const hRM = matchMedia("(prefers-reduced-motion: reduce)");
const hPlay = () => { if (!hRM.matches) hVid.play().catch(() => {}); };
if (hRM.matches) { hVid.autoplay = false; hVid.removeAttribute("autoplay"); hVid.pause(); }
hRM.addEventListener("change", () => { if (hRM.matches) hVid.pause(); else hPlay(); });
new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) hPlay(); else hVid.pause(); })).observe(document.getElementById("top"));
const hSvg = document.querySelector(".hero>svg") || document.createElementNS("http://www.w3.org/2000/svg", "svg"), hMqS = matchMedia("(max-width:639px)"), hMqM = matchMedia("(max-width:1023px)");
const hFit = () => hSvg.setAttribute("viewBox", hMqS.matches ? "880 0 520 900" : hMqM.matches ? "700 0 812 900" : "0 0 1512 900");
hFit(); hMqS.addEventListener("change", hFit); hMqM.addEventListener("change", hFit);
function startScene(){ hPlay(); }
hVid.muted = true; hVid.defaultMuted = true;
// if the phone refused to autoplay (iOS low-power mode), start the footage on the first touch or scroll
/* the hero film plays on its own on every phone: muted and inline, started as soon as it can play, and again on the first touch where a phone blocks autoplay (Low Power Mode) */
(() => { const kick = () => { const top = document.getElementById("top"); if (!top) return; const r = top.getBoundingClientRect(); if (hVid.paused && r.bottom > 0) hPlay(); }; ["loadedmetadata", "canplay"].forEach(ev => hVid.addEventListener(ev, kick)); ["touchstart", "touchend", "pointerdown", "click", "scroll", "visibilitychange", "pageshow"].forEach(ev => addEventListener(ev, kick, {passive: true})); kick(); })();

const FLOWS = {"lanes": [], "hubs": [], "ports": [], "notes": []};   // filled from /data/more.json on the page that shows it (moreData)
// containers ride each lane on a loop; Pacific lanes leave the right edge and come back on the left, as on any Atlantic-centred map
// vehicles are drawn in plan view facing +x, so they stay upright whichever way they travel
const FLIC = {
  sea: '<path class="hull" d="M-8.4-3H4.4L8.6 0 4.4 3H-8.4Q-9.2 3-9.2 2.2V-2.2Q-9.2-3-8.4-3Z"/><rect class="c1" x="-7.6" y="-2" width="3.4" height="4" rx=".4"/><rect class="c2" x="-3.9" y="-2" width="3.4" height="4" rx=".4"/><rect class="c3" x="-.2" y="-2" width="3.4" height="4" rx=".4"/>',
  air: '<path class="pl" d="M7.6 0C7.6-.9 6.6-1.1 5.6-1.1H2L-1.4-6.6H-3.2L-1.1-1.1H-4.8L-6.4-3.4H-7.6L-6.6 0-7.6 3.4H-6.4L-4.8 1.1H-1.1L-3.2 6.6H-1.4L2 1.1H5.6C6.6 1.1 7.6.9 7.6 0Z"/>',
  rail: '<rect class="cab" x="3.4" y="-2.1" width="5.4" height="4.2" rx="1.7"/><rect class="c1" x="-2.4" y="-2.1" width="5.2" height="4.2" rx=".5"/><rect class="c2" x="-8.2" y="-2.1" width="5.2" height="4.2" rx=".5"/>',
  road: '<rect class="c1" x="-6.6" y="-2.4" width="8.8" height="4.8" rx=".6"/><rect class="cab" x="2.7" y="-2.1" width="3.8" height="4.2" rx="1.4"/>'
};
const FLSP = {sea: [12, 1.6], air: [7, .9], rail: [15, 2], road: [7.5, 1]};
const flLane = (m, d, id) => `<path${id ? ` id="${id}"` : ""} class="fl-${m}" d="${d}"/>` + (m === "rail" ? `<path class="fl-ties" d="${d}"/>` : "");
function renderFlows(){
  const svg = document.getElementById("flsvg"); if (!svg || !HMAP) return;
  const i = L(), desc = svg.querySelector("desc").outerHTML;
  const land = HMAP.world.map(c => `<path d="${c.d}"/>`).join("");
  const lanes = FLOWS.lanes.map((l, k) => flLane(l.m, l.d, "fll" + k)).join("");
  const veh = (l, k, n) => { const [base, step] = FLSP[l.m], dur = l.dur || base + (k % 4) * step, beg = -((k * 2.3 + n * dur / 2) % dur); return `<g class="flv"><g class="ic">${FLIC[l.m]}</g><animateMotion dur="${dur.toFixed(1)}s" begin="${beg.toFixed(1)}s" repeatCount="indefinite" rotate="auto"><mpath href="#fll${k}"/></animateMotion></g>`; };
  const moving = RM ? "" : FLOWS.lanes.map((l, k) => veh(l, k, 0) + (l.m === "sea" || l.m === "rail" ? veh(l, k, 1) : "")).join("");
  const lbl = (p, cls) => p.l ? `<text class="${cls}" x="${p.x + p.l[1]}" y="${p.y + p.l[2]}" text-anchor="${p.l[0]}">${i ? p.zh : p.en}</text>` : "";
  const hubs = FLOWS.hubs.map(h => `<g class="flhub"><circle cx="${h.x}" cy="${h.y}" r="1.9"/>${lbl(h, "")}</g>`).join("");
  const ports = FLOWS.ports.map(p => `<g class="flport"><circle class="rg" cx="${p.x}" cy="${p.y}" r="3.2"/><circle cx="${p.x}" cy="${p.y}" r="2.6"/>${lbl(p, ["sha","sin","rtm","lax","nyc"].includes(p.k) ? "key" : "")}</g>`).join("");
  const notes = (FLOWS.notes || []).map(n => `<text class="flnote" x="${n.x}" y="${n.y}" text-anchor="middle">${i ? n.zh : n.en}</text>`).join("");
  svg.innerHTML = desc + `<g class="flland">${land}</g><g class="fllanes">${lanes}</g>${notes}${hubs}<g id="flveh">${moving}</g>${ports}`;
  if (RM) {
    const out = [];
    FLOWS.lanes.forEach((l, k) => { const el = document.getElementById("fll" + k), n = el.getTotalLength(), p = el.getPointAtLength(n * .45), q = el.getPointAtLength(n * .45 + 1);
      out.push(`<g class="flv" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI).toFixed(0)})"><g class="ic">${FLIC[l.m]}</g></g>`); });
    document.getElementById("flveh").innerHTML = out.join("");
  }
  document.getElementById("flKey").innerHTML = ["sea", "air", "rail", "road"].map(m => `<li><svg viewBox="-24 -7 34 14" aria-hidden="true">${flLane(m, "M-23 0H-11")}<g class="flv">${FLIC[m]}</g></svg><span>${t("fl.m" + m)}</span></li>`).join("");
}

/* ============ where we work: maps ============ */
const MAP = HMAP;
// Tiers from public market data (Oct 2026): Kearney Global Retail Development Index, national franchise association counts
// (Brazil ~3,300 brands, Mexico 1,300+, France 1,927 franchisors, South Africa 727 systems) and Chinese F&B overseas store counts.
// Every market flagged m:1 in the map data is covered (173); the rest stay blank. Covered markets not listed here are tier 4.
const WT = {1:["US","CA","GB","AU","JP","KR","SG","MY","TH","ID","AE","SA","VN","PH","IN","CN","BR","MX","FR","DE","ES","ZA"],
            2:["NL","IT","CH","IE","NZ","QA","KW","TW","HK","IL","SE","NO","DK","BE","AT","CL","CO","PE","DO","CR","PT","PL","TR","MA","EG","KE","NG","KH"],
            3:["RU","CZ","GR","FI","HU","RO","PA","BH","OM","KZ","LU","CI","GH","DZ","TZ","TN","GT","PY","EC","AR","UY","BO","JO","AZ","LK","PK","BD","HR","SK","BG","RS","SI","LT","LV","EE","LA","BN"]};
const ST = {1:["California","New York","Texas","Florida","New Jersey","Illinois","Washington","Massachusetts","Georgia","Nevada"],
            2:["Arizona","Pennsylvania","Virginia","Maryland","North Carolina","Colorado","Michigan","Ohio","Oregon","Minnesota","Hawaii","Utah","Connecticut","Tennessee"]};
const STZH = {"Alabama":"阿拉巴马州","Alaska":"阿拉斯加州","Arizona":"亚利桑那州","Arkansas":"阿肯色州","California":"加利福尼亚州","Colorado":"科罗拉多州","Connecticut":"康涅狄格州","Delaware":"特拉华州","District of Columbia":"华盛顿哥伦比亚特区","Florida":"佛罗里达州","Georgia":"佐治亚州","Hawaii":"夏威夷州","Idaho":"爱达荷州","Illinois":"伊利诺伊州","Indiana":"印第安纳州","Iowa":"艾奥瓦州","Kansas":"堪萨斯州","Kentucky":"肯塔基州","Louisiana":"路易斯安那州","Maine":"缅因州","Maryland":"马里兰州","Massachusetts":"马萨诸塞州","Michigan":"密歇根州","Minnesota":"明尼苏达州","Mississippi":"密西西比州","Missouri":"密苏里州","Montana":"蒙大拿州","Nebraska":"内布拉斯加州","Nevada":"内华达州","New Hampshire":"新罕布什尔州","New Jersey":"新泽西州","New Mexico":"新墨西哥州","New York":"纽约州","North Carolina":"北卡罗来纳州","North Dakota":"北达科他州","Ohio":"俄亥俄州","Oklahoma":"俄克拉何马州","Oregon":"俄勒冈州","Pennsylvania":"宾夕法尼亚州","Rhode Island":"罗得岛州","South Carolina":"南卡罗来纳州","South Dakota":"南达科他州","Tennessee":"田纳西州","Texas":"得克萨斯州","Utah":"犹他州","Vermont":"佛蒙特州","Virginia":"弗吉尼亚州","Washington":"华盛顿州","West Virginia":"西弗吉尼亚州","Wisconsin":"威斯康星州","Wyoming":"怀俄明州"};
const MCOL = ["#DCE0E6","#0E2A52","#1F4C86","#3D6FAE","#6F98CB"];
const tierOf = (list, key, dflt) => list[1].includes(key) ? 1 : list[2].includes(key) ? 2 : (list[3] && list[3].includes(key)) ? 3 : dflt;
let mView = "us", mSel = null;
const mdd = {btn: document.getElementById("mppick"), pop: document.getElementById("mpddp"), q: document.getElementById("mpddq"), list: document.getElementById("mpddl"), opts: [], act: -1, open: false};
const mSvg = document.getElementById("mpsvg"), mTip = document.getElementById("mptip"), mWrap = document.getElementById("mpwrap");
function mItems(){
  if (mView === "us") return MAP.states.map(s => ({key: s.en, en: s.en, zh: STZH[s.en] || s.en, d: s.d, t: tierOf(ST, s.en, 4)}));
  return MAP.world.map(c => ({key: c.id, en: c.en, zh: c.zh, d: c.d, t: c.m ? tierOf(WT, c.id, 4) : 0}))
    .concat(MAP.dots.map(c => ({key: c.id, en: c.en, zh: c.zh, x: c.x, y: c.y, t: c.m ? tierOf(WT, c.id, 4) : 0})));
}
const mName = it => L() ? it.zh : it.en;
// pick a state or country: its landmark stands on the map and its major cities are marked (nothing shows until you pick)
const FOC = {"us": {}, "world": {}, "icons": {}};   // filled from /data/more.json on the page that shows it (moreData)
// selecting a state or country zooms the map to it; its landmark and biggest cities then fade in
const FULLVB = () => mView === "us" ? [0, 0, 975, 610] : [0, 0, 960, 480];
let zAnim = 0;
function bigBox(d){
  const NS = "http://www.w3.org/2000/svg", pr = document.createElementNS(NS, "path"); mSvg.appendChild(pr);
  let best = null, area = -1;
  d.split(/(?=M)/).forEach(sub => { pr.setAttribute("d", sub); const b = pr.getBBox(), a = b.width * b.height; if (a > area){ area = a; best = {x: b.x, y: b.y, w: b.width, h: b.height}; } });
  pr.remove(); return best;
}
function zoomBox(key){
  const full = FULLVB(), items = mSvg._items || [], it = key && items.find(x => x.key === key);
  if (!it) return full;
  const us = mView === "us", f = (FOC[us ? "us" : "world"] || {})[key];
  let x0, y0, x1, y1;
  if (it.d){ const b = bigBox(it.d); x0 = b.x; y0 = b.y; x1 = b.x + b.w; y1 = b.y + b.h; } else { x0 = x1 = it.x; y0 = y1 = it.y; }
  if (f) f.c.concat(f.l || []).forEach(p => { const x = p.length > 3 ? p[2] : p[1], y = p.length > 3 ? p[3] : p[2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  const asp = full[2] / full[3], minW = us ? 300 : 210;
  let w = Math.max((x1 - x0) * 1.55, minW), h = Math.max((y1 - y0) * 1.7, w / asp);
  if (w / h < asp) w = h * asp; else h = w / asp;
  if (w > full[2] * .8) return full;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - h * .06;   // a little headroom for the landmark
  return [cx - w / 2, cy - h / 2, w, h];
}
function setVB(v){
  mSvg.setAttribute("viewBox", v.map(n => +n.toFixed(2)).join(" "));
  const z = FULLVB()[2] / v[2];
  mSvg.querySelectorAll("circle.hit, circle.t0").forEach(c => { const r0 = +(c.dataset.r || (c.dataset.r = c.getAttribute("r"))); c.setAttribute("r", (r0 / Math.max(1, z * .8)).toFixed(2)); });
}
function zoomTo(v, now){
  if (!mSvg) return;
  cancelAnimationFrame(zAnim);
  const full = FULLVB(), zm = v[2] < full[2] - .5;
  mWrap.classList.toggle("zm", zm); document.getElementById("mpzo").hidden = !zm;
  const old = mSvg.querySelector(".mpfoc"); if (old) old.remove();
  const vb = mSvg.viewBox.baseVal, a = [vb.x, vb.y, vb.width, vb.height];
  if (now || RM || Math.abs(a[2] - v[2]) + Math.abs(a[0] - v[0]) + Math.abs(a[1] - v[1]) < .5){ setVB(v); addFocus(); return; }
  const t0 = performance.now(), D = 700, ac = [a[0] + a[2] / 2, a[1] + a[3] / 2], vc = [v[0] + v[2] / 2, v[1] + v[3] / 2];
  const step = tm => {
    const p = Math.min(1, (tm - t0) / D), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const w = a[2] * Math.pow(v[2] / a[2], e), h = w * a[3] / a[2], cx = ac[0] + (vc[0] - ac[0]) * e, cy = ac[1] + (vc[1] - ac[1]) * e;
    setVB([cx - w / 2, cy - h / 2, w, h]);
    if (p < 1) zAnim = requestAnimationFrame(step); else { setVB(v); addFocus(); }
  };
  zAnim = requestAnimationFrame(step);
}
function addFocus(){
  if (!mSvg) return;
  const old = mSvg.querySelector(".mpfoc"); if (old) old.remove();
  const us = mView === "us", f = mSel && (FOC[us ? "us" : "world"] || {})[mSel]; if (!f || mView === "freight") return;
  const vb = mSvg.viewBox.baseVal, rc = mSvg.getBoundingClientRect(), pu = Math.min(rc.width / vb.width, rc.height / vb.height) || 1, i = L();
  // what is actually on screen (the map is letterboxed), less the faded edge
  const vw = rc.width / pu, vh = rc.height / pu, ins = mWrap.classList.contains("zm") ? .07 : .01;
  const V = [vb.x - (vw - vb.width) / 2 + vw * ins, vb.y - (vh - vb.height) / 2 + vh * ins, vb.x + (vw + vb.width) / 2 - vw * ins, vb.y + (vh + vb.height) / 2 - vh * ins];
  const fs = (rc.width < 600 ? 11.5 : 12.5) / pu, r = 3.4 / pu, T = Math.min(Math.max(rc.width * .046, 42), 60) / pu;
  const NS = "http://www.w3.org/2000/svg", g = document.createElementNS(NS, "g"); g.setAttribute("class", "mpfoc"); g.setAttribute("aria-hidden", "true"); mSvg.appendChild(g);
  const boxes = [], tol = 1 / pu, hit = q => boxes.some(b => q[0] + tol < b[2] && q[2] - tol > b[0] && q[1] + tol < b[3] && q[3] - tol > b[1]);
  // cities first (their dots are reserved, so nothing lands on them), then each landmark stands at its site,
  // stepping aside if it would hide a city, and the labels go wherever is free
  const zo = document.getElementById("mpzo");   // keep clear of the "Full map" button
  if (!zo.hidden){ const zb = zo.getBoundingClientRect(), ux = px => vb.x + (px - rc.left - (rc.width - vb.width * pu) / 2) / pu, uy = py => vb.y + (py - rc.top - (rc.height - vb.height * pu) / 2) / pu;
    boxes.push([ux(zb.left - 6), uy(zb.top - 6), ux(zb.right + 6), uy(zb.bottom + 6)]); }
  let ds = [];
  f.c.forEach(([en, zh, x, y], n) => {
    const rr = n ? r : r * 1.25, dot = [x - rr * 1.6, y - rr * 1.6, x + rr * 1.6, y + rr * 1.6];
    if (x < V[0] || x > V[2] || y < V[1] || y > V[3] || (n && hit(dot))) return;
    boxes.push(dot); ds.push({n, nm: i ? zh : en, en, x, y, rr, dot});
  });
  let lms = "";
  (f.l || []).forEach(([key, x, y]) => { const ic = FOC.icons[key], k = Math.min(T / ic.h, T * 1.1 / ic.w), w = ic.w * k, h = ic.h * k, gap = r * 1.5;
    const top = Math.max(y - h - gap, V[1]), at = dx => { const bx = Math.min(Math.max(x + dx, V[0] + w / 2), V[2] - w / 2); return [bx, [bx - w / 2 + w * .04, top + h * .04, bx + w / 2 - w * .04, top + h - gap]]; };
    let [bx, box] = at(0);
    if (hit(box)) { const alt = [.65, -.65, 1.05, -1.05].map(m => at(m * w)).find(([, q]) => !hit(q)); if (alt) [bx, box] = alt;
      else ds = ds.filter(d => { const bad = d.n && d.dot[0] < box[2] && d.dot[2] > box[0] && d.dot[1] < box[3] && d.dot[3] > box[1]; if (bad) boxes.splice(boxes.indexOf(d.dot), 1); return !bad; }); }
    boxes.push(box);
    lms += `<g class="lmi" transform="translate(${(bx - w / 2).toFixed(2)} ${top.toFixed(2)}) scale(${k.toFixed(4)})">${ic.svg}</g>`; });
  g.innerHTML = lms;
  ds.forEach(d => {
    const {n, x, y, rr, dot} = d, other = boxes.filter(b => b !== dot);
    const tx = document.createElementNS(NS, "text"); tx.setAttribute("class", "fct" + (n ? "" : " big")); tx.style.fontSize = fs.toFixed(2) + "px"; tx.textContent = d.nm; g.appendChild(tx);
    const tw = tx.getComputedTextLength() + fs * 1.1, th = fs * 1.75, gp = rr + fs * .35, dx = tw / 2 + rr * .4, dy = gp * .55 + th / 2;
    const cand = [[x, y + gp + th / 2], [x + gp + tw / 2, y], [x - gp - tw / 2, y], [x, y - gp - th / 2], [x + dx, y + dy], [x - dx, y + dy], [x + dx, y - dy], [x - dx, y - dy]];
    const clash = q => other.some(b => q[0] + tol < b[2] && q[2] - tol > b[0] && q[1] + tol < b[3] && q[3] - tol > b[1]) || (q[0] < dot[2] && q[2] > dot[0] && q[1] < dot[3] && q[3] > dot[1]);
    let pick = null;
    for (const [cx0, cy] of cand){
      const cx = Math.min(Math.max(cx0, V[0] + tw / 2), V[2] - tw / 2), q = [cx - tw / 2, cy - th / 2, cx + tw / 2, cy + th / 2];
      if (q[1] < V[1] || q[3] > V[3] || clash(q)) continue;
      pick = [cx, cy, q]; break;
    }
    if (!pick){ if (n){ tx.remove(); boxes.splice(boxes.indexOf(dot), 1); return; } const cx = Math.min(Math.max(x, V[0] + tw / 2), V[2] - tw / 2), cy = y + gp + th / 2; pick = [cx, cy, [cx - tw / 2, cy - th / 2, cx + tw / 2, cy + th / 2]]; }
    boxes.push(pick[2]);
    tx.setAttribute("x", pick[0].toFixed(2)); tx.setAttribute("y", (pick[1] + fs * .36).toFixed(2)); tx.setAttribute("text-anchor", "middle");
    const pl = document.createElementNS(NS, "rect"), q = pick[2]; pl.setAttribute("class", "fcp");
    [["x", q[0]], ["y", q[1]], ["width", q[2] - q[0]], ["height", q[3] - q[1]], ["rx", (q[3] - q[1]) / 2]].forEach(([a, v]) => pl.setAttribute(a, v.toFixed(2)));
    g.insertBefore(pl, tx);
    if (us){ tx.dataset.city = pl.dataset.city = d.en; tx.dataset.nm = pl.dataset.nm = d.nm; }   // a tap shows the city's count
    const c = document.createElementNS(NS, "circle"); c.setAttribute("class", "fcd" + (n ? "" : " big")); c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", rr.toFixed(3));
    g.appendChild(c);
  });
}
let fRs = 0;
addEventListener("resize", () => { clearTimeout(fRs); fRs = setTimeout(() => { if (mSel && mView !== "freight" && !mWrap.hidden) addFocus(); }, 160); });
function renderMap(){
  if (!mSvg) return;   // the map is on /more.html
  // Freight swaps the market map for the routes our customers' goods travel
  const fr = mView === "freight";
  document.getElementById("mpfl").hidden = !fr; mWrap.hidden = fr; document.getElementById("mpfoot").hidden = fr;
  document.querySelectorAll(".mpstats .mpx").forEach(d => { d.hidden = fr; });
  document.getElementById("mpN1").textContent = fr ? (PROOF.freightVolume ? "3,000+" : "4") : "50";
  document.getElementById("mpS1").textContent = t(fr ? "map.fs" : "map.s1");
  
  if (fr) { document.querySelectorAll("[data-mv]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.mv === mView))); mddClose(false); return; }
  const items = mItems(), desc = mSvg.querySelector("desc").outerHTML;
  mSvg.setAttribute("viewBox", mView === "us" ? "0 0 975 610" : "0 0 960 480");
  mSvg.innerHTML = desc + items.map((it, i) => it.d
      ? `<path d="${it.d}" class="t${it.t}${it.t ? " hit" : ""}${mSel === it.key ? " sel" : ""}" data-i="${i}"></path>`
      : `<circle cx="${it.x}" cy="${it.y}" r="${it.t && it.t < 3 ? 4.5 : 3.2}" class="t${it.t}${it.t ? " hit" : ""}${mSel === it.key ? " sel" : ""}" data-i="${i}"></circle>`).join("");
  mSvg._items = items;
  addPulses(items); zoomTo(zoomBox(mSel), true);
  document.querySelectorAll("[data-mv]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.mv === mView)));
  document.getElementById("mpleg").innerHTML = [1,2,3,4].filter(n => items.some(it => it.t === n)).map(n => `<span><i class="t${n}" style="background:${MCOL[n]}"></i>${t("map.t"+n)}</span>`).join("");
  // PROOF.stats31000 on: the per-day counts (31,000+ over 3,927 days since Jan 1, 2016, about 40% in the US). Off: the agencies listed on this page
  if (PROOF.stats31000) { document.getElementById("mpN3").textContent = t(mView === "us" ? "map.n3" : "map.n3w"); document.getElementById("mpS3").textContent = t(mView === "us" ? "map.s3" : "map.s3w"); }
  else { document.getElementById("mpN3").textContent = agCount() || "73"; document.getElementById("mpS3").textContent = t("pf.ag").replace("{r}", agRegions() || 8); }
  mddLabel(); if (mdd.open) mddRender();
  paintSel();
}
function addPulses(items){
  const NS = "http://www.w3.org/2000/svg", g = document.createElementNS(NS, "g"), probe = document.createElementNS(NS, "path");
  g.setAttribute("class", "mppl"); g.setAttribute("aria-hidden", "true"); mSvg.appendChild(probe);
  const pts = [];
  items.forEach((it, i) => {
    if (it.t !== 1) return;
    if (!it.d){ pts.push([it.x, it.y]); return; }
    let best = null, area = -1;   // biggest landmass, so France sits in France and the US in the lower 48
    it.d.split(/(?=M)/).forEach(sub => { probe.setAttribute("d", sub); const b = probe.getBBox(), a = b.width * b.height; if (a > area){ area = a; best = b; } });
    if (!best) return;
    // keep the pulse on land: if the box centre falls outside the shape (Florida, Chile), step to the nearest point inside it
    probe.setAttribute("d", it.d);
    const cx = best.x + best.width / 2, cy = best.y + best.height / 2, inside = (x, y) => { const p = mSvg.createSVGPoint(); p.x = x; p.y = y; return probe.isPointInFill(p); };
    let pt = inside(cx, cy) ? [cx, cy] : null;
    for (let r = 1; !pt && r <= 12; r++) for (let a = 0; a < 16 && !pt; a++) { const x = cx + Math.cos(a * Math.PI / 8) * best.width * r / 24, y = cy + Math.sin(a * Math.PI / 8) * best.height * r / 24; if (inside(x, y)) pt = [x, y]; }
    pts.push(pt || [cx, cy]);
  });
  probe.remove();
  const sc = mView === "us" ? 1.15 : 1;
  g.innerHTML = pts.map(([x, y], k) => `<circle class="rg" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(3.4 * sc).toFixed(1)}" style="--d:${((k * 0.53) % 3.2).toFixed(2)}s"></circle><circle class="dt" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.1 * sc).toFixed(1)}"></circle>`).join("");
  mSvg.appendChild(g);
}
// a covered market lights up every couple of seconds, like a new customer coming in
let mVis = false;
new IntersectionObserver(es => es.forEach(e => { mVis = e.isIntersecting; }), {threshold: .25}).observe(mSvg);
if (!RM) setInterval(() => {
  if (!mVis || document.hidden) return;
  const hits = mSvg.querySelectorAll("path.hit"); if (!hits.length) return;
  const el = hits[Math.floor(Math.random() * hits.length)];
  el.classList.remove("ping"); void el.getBoundingClientRect(); el.classList.add("ping");
  setTimeout(() => el.classList.remove("ping"), 1700);
}, 900);
/* Oct 18: tapping a state shows how many of its permits and filings are in Placetta's form library: the state's own
   forms and the city and county forms of its metros, counted from src/forms (registry.ts, local-us.ts) on 2026-10-18.
   Federal forms (15) apply everywhere. Recount when the library grows. [state forms, city and county forms] */
const MAP_FED = 15;
const MAP_FORMS = {"California": [8, 34], "Texas": [8, 26], "New York": [5, 5], "Florida": [4, 7], "Virginia": [3, 7], "Minnesota": [3, 2],
  "Washington": [2, 3], "Ohio": [2, 3], "Nevada": [2, 5], "Massachusetts": [2, 4], "Illinois": [2, 3], "Arizona": [2, 3],
  "Pennsylvania": [1, 5], "Oregon": [1, 3], "New Jersey": [1, 4], "Georgia": [1, 3], "Colorado": [1, 4], "District of Columbia": [0, 6]};
// the city labels shown when a state is open: city and county forms in the library for that metro (same count, same date)
const MAP_CITY = {"Los Angeles": 6, "San Francisco": 7, "San Diego": 4, "Houston": 5, "San Antonio": 2, "Dallas": 6, "New York": 5, "Miami": 3, "Orlando": 2,
  "Arlington": 3, "Minneapolis": 2, "Seattle": 3, "Columbus": 3, "Las Vegas": 5, "Boston": 4, "Chicago": 3, "Phoenix": 3, "Philadelphia": 5, "Portland": 3,
  "Atlanta": 3, "Denver": 4, "Washington": 6};
function cityCount(en, nm){ const n = MAP_CITY[en], st = (mSvg._items || []).find(x => x.key === mSel), f = st && MAP_FORMS[st.key];
  if (!n) return t("map.ccnt0").replace("{m}", nm);
  return t("map.ccnt").replace("{m}", nm).replace("{n}", `<b>${n}</b>`).replace("{s}", f ? f[0] : 0).replace("{f}", MAP_FED); }
function mapCount(it){ if (!it || mView !== "us") return "";
  const f = MAP_FORMS[it.key], m = mName(it);
  if (!f) return t("map.cnt0").replace("{m}", m).replace("{f}", MAP_FED);
  return t("map.cnt").replace("{m}", m).replace("{n}", `<b>${f[0] + f[1]}</b>`).replace("{s}", f[0]).replace("{l}", f[1]).replace("{f}", MAP_FED); }
function paintSel(){
  if (!mSvg) return;
  const items = mSvg._items || [], it = items.find(x => x.key === mSel), go = document.getElementById("mpgo"), info = document.getElementById("mpinfo");
  const cnt = document.getElementById("mpcnt"), c = mapCount(it); if (cnt){ cnt.innerHTML = c; cnt.hidden = !c; }
  if (!it){ go.hidden = true; info.hidden = false; info.textContent = t("map.prompt"); return; }
  info.hidden = true; go.hidden = false; go.textContent = t("map.go").replace("{m}", mName(it));
}
function selectMarket(key){
  mSel = key;
  mSvg.querySelectorAll(".sel").forEach(e => e.classList.remove("sel"));
  const i = (mSvg._items || []).findIndex(x => x.key === key);
  if (i >= 0){ const el = mSvg.querySelector(`[data-i="${i}"]`); if (el){ el.classList.add("sel"); el.parentNode.appendChild(el); } }
  const pl = mSvg.querySelector(".mppl"); if (pl) mSvg.appendChild(pl);
  mddLabel(); paintSel(); zoomTo(zoomBox(key));
  if (key) track("map_select", {view: mView, market: key});
}
document.getElementById("mpzo")?.addEventListener("click", () => { selectMarket(null); track("map_zoom_out", {view: mView}); });
mSvg?.addEventListener("click", e => { const cy = e.target.closest("[data-city]");
  if (cy){ const cnt = document.getElementById("mpcnt"); cnt.innerHTML = cityCount(cy.dataset.city, cy.dataset.nm); cnt.hidden = false; track("map_city", {city: cy.dataset.city}); return; }
  const el = e.target.closest(".hit"); if (!el) return; selectMarket(mSvg._items[+el.dataset.i].key); });
mSvg?.addEventListener("pointermove", e => {
  const el = e.target.closest(".hit");
  if (!el || e.pointerType === "touch"){ mTip.hidden = true; return; }
  const it = mSvg._items[+el.dataset.i], r = mWrap.getBoundingClientRect();
  const fc = mView === "us" && MAP_FORMS[it.key]; mTip.innerHTML = `<b>${esc(mName(it))}</b><span>${t("map.t" + it.t)}</span>${fc ? `<span>${t("map.tipn").replace("{n}", fc[0] + fc[1])}</span>` : ""}`;
  mTip.style.left = (e.clientX - r.left) + "px"; mTip.style.top = (e.clientY - r.top) + "px"; mTip.hidden = false;
});
mSvg?.addEventListener("pointerleave", () => { mTip.hidden = true; });
// market and state picker: searchable, grouped by coverage tier, keyboard friendly
const DDCHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
function mddOpts(){
  const q = mdd.q.value.trim().toLowerCase(), coll = L() ? "zh-Hans-CN-u-co-pinyin" : "en";
  return (mSvg._items || []).filter(it => it.t && (!q || it.en.toLowerCase().includes(q) || it.zh.includes(q)))
    .sort((a, b) => a.t - b.t || mName(a).localeCompare(mName(b), coll));
}
function mddLabel(){
  if (!mSvg) return;
  const it = (mSvg._items || []).find(x => x.key === mSel), v = document.getElementById("mpddv"), sw = document.getElementById("mpddsw");
  v.textContent = it ? mName(it) : t(mView === "us" ? "map.anyus" : "map.any"); v.classList.toggle("ph", !it);
  sw.hidden = !it; if (it) sw.style.background = MCOL[it.t];
  document.getElementById("mppickL").textContent = t(mView === "us" ? "map.anyus" : "map.any");
}
function mddRender(){
  if (!mSvg) return;
  const opts = mdd.opts = mddOpts(); let html = "", last = 0;
  if (mdd.act >= opts.length) mdd.act = opts.length - 1;
  opts.forEach((it, k) => {
    if (it.t !== last){ last = it.t; html += `<li class="gh" role="presentation"><span>${t("map.t" + it.t)}</span><span>${opts.filter(o => o.t === it.t).length}</span></li>`; }
    const on = mSel === it.key;
    html += `<li class="op${k === mdd.act ? " act" : ""}" role="option" id="mpo${k}" data-k="${k}" aria-selected="${on}"><i style="background:${MCOL[it.t]}"></i><span>${esc(mName(it))}</span>${on ? DDCHECK : ""}</li>`;
  });
  mdd.list.innerHTML = html || `<li class="none">${t("map.none")}</li>`;
  if (mdd.act >= 0) mdd.q.setAttribute("aria-activedescendant", "mpo" + mdd.act); else mdd.q.removeAttribute("aria-activedescendant");
}
function mddMove(k){
  if (!mdd.opts.length) return;
  mdd.act = Math.max(0, Math.min(mdd.opts.length - 1, k));
  mdd.list.querySelectorAll(".op").forEach(li => li.classList.toggle("act", +li.dataset.k === mdd.act));
  const li = document.getElementById("mpo" + mdd.act); if (li){ li.scrollIntoView({block: "nearest"}); mdd.q.setAttribute("aria-activedescendant", li.id); }
}
function mddOpen(){
  mdd.open = true; mdd.pop.hidden = false; mdd.btn.setAttribute("aria-expanded", "true");
  mdd.q.value = ""; mdd.q.placeholder = t(mView === "us" ? "map.qus" : "map.q");
  const r = mdd.btn.getBoundingClientRect(); mdd.pop.classList.toggle("down", r.top < 400 && innerHeight - r.bottom > r.top);
  mdd.opts = mddOpts(); mdd.act = Math.max(0, mdd.opts.findIndex(o => o.key === mSel)); mddRender(); mddMove(mdd.act);
  mdd.q.focus({preventScroll: true}); track("map_picker_open", {view: mView});
}
function mddClose(focus){ if (!mdd.open) return; mdd.open = false; mdd.pop.hidden = true; mdd.btn.setAttribute("aria-expanded", "false"); if (focus) mdd.btn.focus(); }
function mddPick(k){ const it = mdd.opts[k]; if (!it) return; selectMarket(it.key); mddClose(true); }
mdd.btn?.addEventListener("click", () => mdd.open ? mddClose(false) : mddOpen());
mdd.btn?.addEventListener("keydown", e => { if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); mddOpen(); } });
mdd.q?.addEventListener("input", () => { mdd.act = 0; mddRender(); mdd.list.scrollTop = 0; });
mdd.q?.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); mddMove(mdd.act + (e.key === "ArrowDown" ? 1 : -1)); }
  else if (e.key === "Home" || e.key === "End"){ e.preventDefault(); mddMove(e.key === "Home" ? 0 : mdd.opts.length - 1); }
  else if (e.key === "Enter"){ e.preventDefault(); mddPick(mdd.act); }
  else if (e.key === "Escape"){ e.preventDefault(); mddClose(true); }
  else if (e.key === "Tab"){ mddClose(false); }
});
mdd.list?.addEventListener("click", e => { const li = e.target.closest(".op"); if (li) mddPick(+li.dataset.k); });
document.addEventListener("pointerdown", e => { if (mdd.open && !e.target.closest("#mpdd")) mddClose(false); });
document.getElementById("mpgo")?.addEventListener("click", () => { const it = (mSvg._items || []).find(x => x.key === mSel); if (it) openForm("map", mName(it)); });
document.querySelectorAll("[data-mv]").forEach(b => b.addEventListener("click", () => { if (mView === b.dataset.mv) return; mView = b.dataset.mv; mSel = null; mddClose(false); renderMap(); track("map_view", {view: mView}); }));

/* ============ live policy + industry monitor ============ */
// Items are real, dated and sourced. Refresh MON / MON_DL and MON_UPDATED to keep the monitor current.
const MON_UPDATED = "2026-10-02";
const MON = [{"d": "2026-10-08", "r": ["United States", "美国"], "c": "reg", "lv": "med", "mk": "us", "h": ["FDA's new 2026 Food Code asks every restaurant for a written food safety plan and a written employee illness policy", "FDA发布2026版《食品法典》，要求每家餐厅制定书面食品安全管理体系和书面员工疾病政策"], "m": ["Inspectors can ask to see both once your state or county adopts the code. The food safety plan has to be in place within four years of adoption, and each jurisdiction adopts on its own timeline.", "州或县采纳新法典后，检查员可要求查看这两份文件。食品安全管理体系须在采纳后四年内落实，各地采纳时间不同。"], "act": ["Write an employee illness policy for every US store now, and start the food safety plan before your county adopts the code.", "现在就为每家美国门店制定员工疾病政策，并在所在县采纳新法典前着手编写食品安全管理体系。"], "per": [["Health permits", "卫生许可"], ["Health inspections", "卫生检查"]], "s": ["Morrison Foerster", "Morrison Foerster"], "u": "https://www.mofo.com/resources/insights/261008-fda-releases-2026-food-code", "t": ["FDA 2026 Food Code", "FDA 2026版食品法典"], "imp": ["risk", ["Two written documents inspectors can ask to see", "检查员可要求查看的两份书面文件"]]}, {"d": "2026-09-29", "r": ["European Union", "欧盟"], "c": "lab", "lv": "med", "h": ["Greece becomes the fifth EU country to adopt the Pay Transparency Directive", "希腊成为第五个落实《薪酬透明指令》的欧盟成员国"], "m": ["From Nov 1, 2026, employers in Greece must share pay ranges before interviews. France, Spain and Germany have not yet published final laws, so hiring rules for EU openings are still moving.", "自2026年11月1日起，希腊雇主须在面试前告知薪酬范围。法国、西班牙和德国尚未出台最终法律，欧盟开店的招聘规则仍在变化。"], "s": ["Lewis Silkin", "Lewis Silkin"], "u": "https://www.lewissilkin.com/insights/2026/09/29/greece-transposes-the-eu-pay-transparency-directive-what-employers-need-to-know", "mk": "eu", "act": ["Publish pay ranges in Greek job ads and write down your pay structure before you hire for a Greek store.", "为希腊门店招聘前，在招聘广告中公布薪酬范围，并形成书面薪酬体系。"], "per": [["Hiring", "招聘"], ["Employment registration", "用工登记"]], "t": ["Greece pay transparency law", "希腊薪酬透明新规"], "imp": ["time", ["Pay ranges must be shared before interviews from Nov 1, 2026", "2026年11月1日起须在面试前告知薪酬范围"]]}, {"d": "2026-09-28", "r": ["United States and China", "中美"], "c": "pol", "lv": "high", "h": ["US and China cut tariffs on $60 billion of goods and extend their trade truce to Jan 10, 2027", "中美就600亿美元商品下调关税，并将贸易休战延长至2027年1月10日"], "m": ["US duties fall on Chinese small kitchen appliances and tableware, which lowers fit-out costs for new stores. Watch the truce expiry before placing large equipment orders.", "美国下调中国产小家电和餐具关税，新店装修成本随之降低。下大额设备订单前，请关注休战到期时间。"], "s": ["Insurance Journal", "Insurance Journal"], "u": "https://www.insurancejournal.com/news/national/2026/09/28/887019.htm", "mk": "uscn", "act": ["Place equipment and tableware orders from China before Jan 10, 2027, or budget for duties snapping back.", "在2027年1月10日前下单采购中国产设备和餐具，或在预算中预留关税回升的空间。"], "per": [["Import entries", "进口报关"], ["Fit-out budget", "装修预算"]], "t": ["US-China tariff cut and truce", "中美下调关税并延长休战"], "imp": ["cost", ["Lower US duties on Chinese small kitchen appliances and tableware until Jan 10, 2027", "2027年1月10日前，中国产小家电和餐具的美国关税降低"]]}, {"d": "2026-09-15", "r": ["California, US", "美国加州"], "c": "lab", "lv": "med", "h": ["California minimum wage rises to $17.40 an hour on Jan 1, 2027", "加州最低工资将于2027年1月1日上调至每小时17.40美元"], "m": ["Most fast food restaurants stay at $20 an hour under the state's fast food law, so check which rate applies before you budget staffing for a California store.", "根据加州快餐法，大多数快餐店仍执行每小时20美元。为加州门店做人力预算前，请先确认适用哪一标准。"], "s": ["Ogletree", "Ogletree"], "u": "https://ogletree.com/insights-resources/blog-posts/californias-minimum-wage-rate-set-to-rise-to-17-40-in-2027/", "mk": "ca", "act": ["Re-run labor budgets for California stores at $17.40 an hour, or $20 if the fast food law covers you.", "按每小时17.40美元重新测算加州门店人力预算；如适用快餐法，则按20美元测算。"], "per": [["Payroll registration", "工资登记"], ["Labor law postings", "劳动法公示"]], "t": ["California minimum wage to $17.40", "加州最低工资升至17.40美元"], "imp": ["cost", ["$17.40 an hour from Jan 1, 2027, or $20 for most fast food", "2027年1月1日起每小时17.40美元，多数快餐店为20美元"]]}, {"d": "2026-08-26", "r": ["Malaysia", "马来西亚"], "c": "reg", "lv": "med", "h": ["Malaysia will require imported food to follow recognized food safety programs from Mar 1, 2027", "马来西亚将自2027年3月1日起要求进口食品符合认可的食品安全保障体系"], "m": ["Ingredients shipped from your home country will need supplier certificates by then, or customs clearance for your stores can stall.", "届时从总部所在国运来的原料须备齐供应商认证，否则门店清关可能受阻。"], "s": ["Flavorist", "Flavorist"], "u": "https://www.flavorist.com/asia-food-flavor-regulatory-update-key-legal-and-regulatory-developments-august-1-september-15-2026/", "mk": "my", "act": ["Ask ingredient suppliers for recognized food safety certificates now. Checks at the border start Mar 1, 2027.", "现在就向原料供应商索取认可的食品安全证书。边境核查自2027年3月1日开始。"], "per": [["Food import permits", "食品进口许可"], ["Customs clearance", "清关"]], "t": ["Malaysia imported food rules", "马来西亚进口食品新规"], "imp": ["time", ["Supplier certificates needed at the border from Mar 1, 2027", "2027年3月1日起入境须提供供应商认证"]]}, {"d": "2026-08-12", "r": ["European Union", "欧盟"], "c": "reg", "lv": "high", "h": ["New EU packaging rules now apply, banning PFAS above strict limits in food-contact packaging", "欧盟新包装法规正式实施，含超标全氟和多氟烷基物质的食品接触包装禁止上市"], "m": ["Takeaway containers, wrappers and cups for European stores must come from compliant suppliers. Reuse targets and limits on some single-use packaging follow in 2030.", "欧洲门店使用的外卖餐盒、包装纸和杯子须来自合规供应商。重复使用目标和部分一次性包装限制将于2030年实施。"], "s": ["European Commission", "欧盟委员会"], "u": "https://environment.ec.europa.eu/news/new-eu-rules-packaging-enter-application-2026-08-11_en", "mk": "eu", "act": ["Get written PFAS compliance from every packaging supplier before you order for European stores.", "为欧洲门店下单前，向每家包装供应商取得书面的全氟和多氟烷基物质合规证明。"], "per": [["Food contact materials", "食品接触材料"], ["Product compliance", "产品合规"]], "t": ["EU packaging rules now apply", "欧盟包装新规正式实施"]}, {"d": "2026-08-07", "r": ["South Korea", "韩国"], "c": "reg", "lv": "med", "h": ["South Korea proposes four new mandatory allergens: sesame, perilla, almond and cashew", "韩国拟新增四种强制标注过敏原：芝麻、紫苏、杏仁和腰果"], "m": ["Menus, packaging and recipes for Korean stores may need relabeling. GMO labeling for sugars and oils has also been moved up to Dec 31, 2026.", "在韩门店的菜单、包装和配方可能需要重新标注。糖类和油类的转基因标识要求也已提前至2026年12月31日。"], "s": ["Flavorist", "Flavorist"], "u": "https://www.flavorist.com/asia-food-flavor-regulatory-update-key-legal-and-regulatory-developments-august-1-september-15-2026/", "mk": "kr", "act": ["Audit menus and labels for sesame, perilla, almond and cashew before the rule is finalized.", "在新规定稿前，排查菜单和标签中的芝麻、紫苏、杏仁和腰果。"], "per": [["Food labeling", "食品标签"], ["Menu disclosures", "菜单标注"]], "t": ["Korea adds four allergens", "韩国拟新增四种过敏原"], "imp": ["risk", ["Four more allergens to flag on menus and labels", "菜单和标签须新增标注四种过敏原"]]}, {"d": "2026-04", "r": ["Mexico and Brazil", "墨西哥和巴西"], "c": "ind", "lv": "low", "h": ["Mixue opens its first stores in Mexico and Brazil", "蜜雪冰城在墨西哥和巴西开出首店"], "m": ["Chinese tea and dessert chains are moving into Latin America. Each country has its own business permits and health registrations, separate from any US approvals.", "中国茶饮和甜品品牌正在进入拉美。每个国家都有各自的营业许可和卫生登记，与美国的审批相互独立。"], "s": ["Malaysia Sun", "Malaysia Sun"], "u": "https://www.malaysiasun.com/news/279001692/chinese-food-beverage-brands-expand-footprint-in-latin-america", "mk": "latam", "act": ["Start health registrations in Mexico and Brazil early. They run on their own clocks, separate from US approvals.", "尽早启动墨西哥和巴西的卫生登记，它们的流程独立于美国审批。"], "per": [["Business permits", "营业许可"], ["Health registration", "卫生登记"]], "t": ["Mixue opens in Mexico and Brazil", "蜜雪冰城进入墨西哥和巴西"]}, {"d": "2026-02-25", "r": ["United States", "美国"], "c": "ind", "lv": "low", "h": ["Franchising forecast to add more than 12,000 new US units in 2026", "预计2026年美国新增加盟门店超过12,000家"], "m": ["Texas, Florida, Georgia, Arizona and North Carolina lead the forecast, the states where new franchise openings will be most concentrated.", "得州、佛罗里达、佐治亚、亚利桑那和北卡罗来纳位居增长预测前列，新开加盟店将最为集中。"], "s": ["Franchising.com", "Franchising.com"], "u": "https://www.franchising.com/articles/20260225_ifa_forecasts_12000_new_franchised_units_in_2026.html", "mk": "us", "act": ["Book permit expediters early in Texas, Florida and Georgia, where new openings are most concentrated.", "在新店最集中的得州、佛罗里达和佐治亚，尽早预约许可代办。"], "per": [["Building permits", "建筑许可"], ["Health permits", "卫生许可"]], "t": ["12,000 new US franchise units", "美国新增逾1.2万家加盟店"]}, {"d": "2026-01-26", "r": ["Vietnam", "越南"], "c": "reg", "lv": "med", "h": ["Vietnam's new food safety decree replaces self-declaration with authority review", "越南新食品安全法令以主管部门审核取代自我声明"], "m": ["Product declarations now take about 15 working days, and imported ingredients face risk-based inspections. Build both into your opening timeline.", "产品声明现需约15个工作日审核，进口原料还须接受基于风险的检查。请将两者纳入开业时间表。"], "s": ["InCorp Vietnam", "InCorp Vietnam"], "u": "https://vietnam.incorp.asia/vietnam-new-food-safety-regulation/", "mk": "vn", "act": ["Add about 15 working days for product declarations to every Vietnam opening plan.", "在每个越南开店计划中，为产品声明预留约15个工作日。"], "per": [["Product declarations", "产品声明"], ["Import inspection", "进口检验"]], "t": ["Vietnam food safety decree", "越南食品安全新法令"], "imp": ["time", ["About 15 working days per product declaration", "每项产品声明约需15个工作日"]]}, {"d": "2026-01-01", "r": ["Mexico", "墨西哥"], "c": "pol", "lv": "med", "h": ["Mexico raises tariffs to as much as 50% on imports from countries without trade deals, including China", "墨西哥对包括中国在内的无自贸协定国家进口商品加征最高50%的关税"], "m": ["1,463 product categories are affected, including furniture, plastics, glass and aluminum, so sourcing store fixtures from Asia for Mexican locations now costs more.", "涉及1,463类商品，包括家具、塑料、玻璃和铝制品，为墨西哥门店从亚洲采购店内设施的成本随之上升。"], "s": ["Mexico News Daily", "Mexico News Daily"], "u": "https://mexiconewsdaily.com/news/mexico-tariffs-go-into-effect-china/", "mk": "latam", "act": ["Source fixtures for Mexican stores from trade-deal countries, or budget for the higher duty.", "墨西哥门店的店内设施尽量从有自贸协定的国家采购，或在预算中计入更高关税。"], "per": [["Import entries", "进口报关"], ["Fit-out budget", "装修预算"]], "t": ["Mexico tariffs up to 50%", "墨西哥关税最高达50%"], "imp": ["cost", ["Duties up to 50% across 1,463 product categories", "1,463类商品关税最高50%"]]}, {"d": "2025-12-01", "r": ["Texas and Florida, US", "美国得州和佛州"], "c": "pol", "lv": "high", "h": ["Texas and Florida limits on property interests for some foreign buyers stay in force while court challenges continue", "得州和佛州对部分外国买家房产权益的限制在诉讼期间继续有效"], "m": ["The Texas law also covers leases of one year or more. If your company has ties to a designated country, check the rules before you sign a store lease.", "得州的法律同样适用于一年及以上的租约。如您的公司与被列名国家有关联，签订门店租约前请先核查相关规定。"], "s": ["Vinson & Elkins", "Vinson & Elkins"], "u": "https://www.velaw.com/insights/state-level-foreign-land-ownership-bans-survive-for-now-as-circuit-courts-focus-on-procedural-issues/", "mk": "txfl", "act": ["Screen your ownership for ties to designated countries before signing a Texas lease of one year or more.", "在得州签订一年及以上租约前，核查公司股权是否与被列名国家有关联。"], "per": [["Lease review", "租约审查"], ["Entity registration", "主体登记"]], "t": ["Texas and Florida lease limits", "得州佛州外资租约限制"], "imp": ["risk", ["Applies to store leases of one year or more", "适用于一年及以上的门店租约"]]}, {"d": "2025-11-20", "r": ["Indonesia", "印度尼西亚"], "c": "reg", "lv": "high", "mk": "id", "h": ["Indonesia's halal certification becomes mandatory for most food and beverage, including imports, on Oct 17, 2026", "印度尼西亚将于2026年10月17日起对多数食品饮料（含进口）强制实行清真认证"], "m": ["Products sold in Indonesian stores need certification from a body recognized by the national halal agency, or a clear non-halal label.", "在印尼门店销售的产品须取得国家清真认证机构认可的认证，或明确标注非清真。"], "act": ["Get every imported product and ingredient certified, or labeled non-halal.", "让每一项进口产品和原料取得清真认证，或标注为非清真。"], "per": [["Product registration", "产品注册"], ["Labeling", "标签"]], "s": ["Asia Pacific Food Industry", "Asia Pacific Food Industry"], "u": "https://www.apfoodonline.com/industry/indonesias-halal-countdown-what-fb-exporters-must-do-before-17-october-2026/", "t": ["Indonesia halal deadline", "印尼清真认证截止"], "imp": ["risk", ["Products with no halal certificate and no non-halal label come off Indonesian shelves", "既无清真认证也未标注非清真的产品将下架"]]}];
const MON_DL = [{"d": "2026-10-17", "r": ["Indonesia", "印度尼西亚"], "t": ["Halal certification required for most food and beverage, including imports", "多数食品饮料（含进口）须取得清真认证"], "u": "https://www.apfoodonline.com/industry/indonesias-halal-countdown-what-fb-exporters-must-do-before-17-october-2026/", "mk": "id", "s": ["Halal certification required", "清真认证强制实施"]}, {"d": "2026-11-01", "r": ["Greece", "希腊"], "t": ["Pay transparency obligations start", "薪酬透明义务开始执行"], "u": "https://www.lewissilkin.com/insights/2026/09/29/greece-transposes-the-eu-pay-transparency-directive-what-employers-need-to-know", "mk": "eu", "s": ["Pay transparency starts", "薪酬透明义务生效"]}, {"d": "2026-12-31", "r": ["South Korea", "韩国"], "t": ["GMO labeling for sugars and oils", "糖类和油类转基因标识"], "u": "https://www.flavorist.com/asia-food-flavor-regulatory-update-key-legal-and-regulatory-developments-august-1-september-15-2026/", "mk": "kr", "s": ["GMO labels for sugars and oils", "糖类和油类转基因标识"]}, {"d": "2027-01-01", "r": ["California, US", "美国加州"], "t": ["Minimum wage rises to $17.40 an hour", "最低工资上调至每小时17.40美元"], "u": "https://ogletree.com/insights-resources/blog-posts/californias-minimum-wage-rate-set-to-rise-to-17-40-in-2027/", "mk": "ca", "s": ["Minimum wage rises to $17.40", "最低工资升至17.40美元"]}, {"d": "2027-01-10", "r": ["United States and China", "中美"], "t": ["Trade truce expires unless extended", "贸易休战到期（如未延长）"], "u": "https://www.insurancejournal.com/news/national/2026/09/28/887019.htm", "mk": "uscn", "s": ["Trade truce expires", "贸易休战到期"]}, {"d": "2027-03-01", "r": ["Malaysia", "马来西亚"], "t": ["Imported food safety assurance rule takes effect", "进口食品安全保障新规生效"], "u": "https://www.flavorist.com/asia-food-flavor-regulatory-update-key-legal-and-regulatory-developments-august-1-september-15-2026/", "mk": "my", "s": ["Imported food rule takes effect", "进口食品新规生效"]}];
const MON_WL = [{"k": "uscn", "c": "US-China", "n": ["US-China trade", "中美贸易"], "z": "中美"}, {"k": "ca", "c": "California", "n": ["California", "美国加州"], "z": "加州"}, {"k": "txfl", "c": "Texas, Florida", "n": ["Texas and Florida", "得州和佛州"], "z": "得州佛州"}, {"k": "us", "c": "United States", "n": ["United States", "美国"], "z": "美国"}, {"k": "eu", "c": "EU", "n": ["European Union", "欧盟"], "z": "欧盟"}, {"k": "latam", "c": "Mexico, Brazil", "n": ["Mexico and Brazil", "墨西哥和巴西"], "z": "拉美"}, {"k": "id", "c": "Indonesia", "n": ["Indonesia", "印度尼西亚"], "z": "印尼"}, {"k": "my", "c": "Malaysia", "n": ["Malaysia", "马来西亚"], "z": "马来"}, {"k": "vn", "c": "Vietnam", "n": ["Vietnam", "越南"], "z": "越南"}, {"k": "kr", "c": "South Korea", "n": ["South Korea", "韩国"], "z": "韩国"}];
let monSel = -1, monMk = null;
const MON_MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function monDate(iso){ const [y,m,d] = iso.split("-").map(Number); if (L()) return d ? `${y}年${m}月${d}日` : `${y}年${m}月`; return d ? `${MON_MO[m-1]} ${d}, ${y}` : `${MON_MO[m-1]} ${y}`; }
const monDays = iso => { const now = new Date(); now.setHours(0,0,0,0); return Math.round((new Date(iso + "T00:00:00") - now) / 86400000); };
const monWl = k => MON_WL.find(w => w.k === k);
const monCode = k => { const w = monWl(k); return w ? (L() ? w.z : w.c) : k; };
const monPill = lv => ({high: "p-b", med: "p-m", low: "p-q"})[lv];
const monCls = n => n <= 30 ? "soon" : n <= 120 ? "mid" : "";
const monNext = mk => MON_DL.map(x => monDays(x.d)).filter((n, k) => n >= 0 && MON_DL[k].mk === mk).sort((a, b) => a - b)[0];
const monDays_ = n => n === 0 ? t("mon.today") : t(n === 1 ? "mon.d1" : "mon.dn").replace("{n}", n);
// open on the change that needs action soonest: the high-impact item behind the nearest deadline
function monFeatured(){
  const up = MON_DL.map(x => ({x, n: monDays(x.d)})).filter(o => o.n >= 0).sort((a, b) => a.n - b.n);
  for (const o of up){ const k = MON.findIndex(m => m.mk === o.x.mk && m.lv === "high"); if (k >= 0) return k; }
  return 0;
}
const TICK_IC = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const NEXT_IC = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
let monAll = false;
/* Oct 18: each alert names the store it hits and what's at stake. SAMPLE data, shown with a "Sample" tag: the stores are
   the page's own examples (Qinghuan in San José, the franchisees in Irvine and Houston) or sample stores, and the dollar
   figures are illustrations built from the page's own numbers ($15,000 a month rent, 12 staff), not quotes or results.
   Keyed by each change's English short title in MON. */
const MON_STORE = {
 "FDA 2026 Food Code": [["Qinghuan Tea House, San José, CA", "清欢茶舍，加州圣何塞"], "$1,500", ["a failed inspection: re-inspection fee and a day closed", "检查不合格：复检费加停业一天"]],
 "Greece pay transparency law": [["Sample store, Athens", "示例门店，雅典"], "$6,000", ["back pay review for 9 staff", "9 名员工的薪酬追溯核查"]],
 "US-China tariff cut and truce": [["Qinghuan Tea House, San José, CA", "清欢茶舍，加州圣何塞"], "$3,200", ["lower duty on a $32,000 container of tableware that lands before Jan 10", "1 月 10 日前到港的一柜 32,000 美元餐具，关税更低"], "save"],
 "California minimum wage to $17.40": [["Franchisee, Irvine CA", "加盟商，加州尔湾"], "$12,480 a year", ["12 staff, 50 cents more an hour, 2,080 hours each", "12 名员工，每小时多 0.5 美元，每人 2,080 小时"]],
 "Malaysia imported food rules": [["Sample store, Kuala Lumpur", "示例门店，吉隆坡"], "$9,000", ["one container held at the border without supplier certificates", "缺少供应商证书，一柜货物在口岸被扣"]],
 "EU packaging rules now apply": [["Sample store, Paris", "示例门店，巴黎"], "$4,800", ["takeaway cups, wrappers and containers to replace", "需要更换的外带杯、包装纸和餐盒"]],
 "Korea adds four allergens": [["Sample store, Seoul", "示例门店，首尔"], "$2,500", ["menu boards and labels to reprint", "需要重印的菜单和标签"]],
 "Mixue opens in Mexico and Brazil": [["Planned store, Mexico City", "筹备中的门店，墨西哥城"], "$15,000 a month", ["rent while its permits are pending", "许可未下来期间的房租"]],
 "12,000 new US franchise units": [["Franchisee, Houston TX", "加盟商，得州休斯顿"], "$15,000 a month", ["rent on each new unit that opens late", "每家新店延迟开业期间的房租"]],
 "Vietnam food safety decree": [["Sample store, Ho Chi Minh City", "示例门店，胡志明市"], "$7,500", ["3 products off the shelf for about 15 working days each", "3 款产品各下架约 15 个工作日"]],
 "Mexico tariffs up to 50%": [["Planned store, Mexico City", "筹备中的门店，墨西哥城"], "$16,000", ["up to 50% duty on a $32,000 container from China", "从中国运来的 32,000 美元货柜，最高 50% 关税"]],
 "Texas and Florida lease limits": [["Franchisee, Houston TX", "加盟商，得州休斯顿"], "$15,000 a month", ["rent on a lease that may not hold", "可能无效的租约所付的房租"]],
 "Indonesia halal deadline": [["Sample store, Jakarta", "示例门店，雅加达"], "$11,000", ["unlabeled stock pulled from shelves", "未贴标的库存被下架"]]
};
const monSt = x => MON_STORE[x.t[0]];
function monStore(x, i){ const v = monSt(x); if (!v) return "";
  return `<div class="mnst"><div><small>${t("mon.st")}</small><b>${v[0][i]}</b></div><div><small>${t(v[3] ? "mon.save" : "mon.usd")}</small><b class="mnusd${v[3] ? " up" : ""}">${v[1].replace(" a month", i ? "/月" : " a month").replace(" a year", i ? "/年" : " a year")}</b><span>${v[2][i]}</span></div><em class="mnsm">${t("mon.smp")}</em></div>`; }
function renderMon(center){
  if (!document.getElementById("mnCnt")) return;   // the monitor tab is on the home page
  const i = L();
  if (monSel < 0 || monSel >= MON.length){ monSel = monFeatured(); center = true; }
  const keep = x => !monMk || x.mk === monMk;
  if (!keep(MON[monSel])){ const r = {high: 0, med: 1, low: 2}; monSel = MON.map((x, k) => k).filter(k => keep(MON[k])).sort((a, b) => r[MON[a].lv] - r[MON[b].lv] || (MON[a].d < MON[b].d ? 1 : -1))[0]; center = true; }
  document.getElementById("mnLsH").textContent = monMk ? monWl(monMk).n[i] : t("mon.allm");
  document.getElementById("mnCnt").textContent = t("mon.cnt2").replace("{n}", MON.filter(keep).length);
  const items = MON.filter(keep);
  document.getElementById("mnKpi").innerHTML = `<div><strong>${items.length}</strong><span>${t("mon.k1")}</span></div><div><strong class="hi">${items.filter(x => x.lv === "high").length}</strong><span>${t("mon.k2")}</span></div>` +
    `<p class="mnlive"><i aria-hidden="true"></i>${t("mon.live")}</p>`;
  const list = document.getElementById("mnList");
  if (!list.dataset.mb) { list.dataset.mb = 1; list.addEventListener("click", e => { if (!e.target.closest("#mnMore")) return; e.stopPropagation(); monAll = !monAll; renderMon(false); }, true); }
  const rank = {high: 0, med: 1, low: 2};
  const fresh = x => x.d.length === 10 && monDays(x.d) >= -7;
  const order = MON.map((x, k) => k).filter(k => keep(MON[k])).sort((a, b) => (fresh(MON[b]) - fresh(MON[a])) || rank[MON[a].lv] - rank[MON[b].lv] || (MON[a].d < MON[b].d ? 1 : -1));
  const MNTOP = 2, shown = monAll ? order : order.slice(0, MNTOP).concat(order.slice(MNTOP).filter(k => k === monSel));
  list.innerHTML = shown.map(k => [MON[k], k]).map(([x, k]) => `<button type="button" class="mnr${k === monSel ? " on" : ""}" role="option" aria-selected="${k === monSel}" data-ti="${k}"><span class="t">${x.t[i]}</span><span class="pill ${monPill(x.lv)}">${t("mon.i." + x.lv)}</span><span class="m"><b>${monCode(x.mk)}</b>${monDate(x.d)}${monSt(x) ? `<span class="mnusd${monSt(x)[3] ? " up" : ""}">${monSt(x)[1].replace(/ a (month|year)/, "")}</span>` : ""}${fresh(x) ? `<i class="mnnew">${t("mon.new")}</i>` : ""}</span></button>`).join("") + (order.length > MNTOP ? `<button type="button" class="mnmore" id="mnMore" aria-expanded="${monAll}">${monAll ? t("agy.less") : t("mon.all").replace("{n}", order.length)}</button>` : "");
  if (center){ const on = list.querySelector(".on"); if (on){ const top = on.offsetTop - list.offsetTop; if (top < list.scrollTop || top + on.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = Math.max(0, top - 8); } }
  renderMonDetail(MON[monSel]);
  const dls = MON_DL.map(x => ({x, n: monDays(x.d)})).filter(o => o.n >= 0 && keep(o.x)).slice(0, 3);
  document.getElementById("mnDl").innerHTML = dls.length ? "" : `<p class="mnempty">${t("mon.none2")}</p>`;
  if (dls.length) document.getElementById("mnDl").innerHTML = dls.map(({x, n}) =>
    `<button type="button" class="mnd" data-dk="${x.mk}"><span class="n ${monCls(n)}">${n}<small>${t(n === 1 ? "mon.day1" : "mon.dayn")}</small></span><span><span class="t">${x.s[i]}</span><span class="m">${monCode(x.mk)}${i ? "，" : ", "}${monDate(x.d)}</span></span></button>`).join("");
}
function monLead(x, dd){
  if (!dd || x.d.length < 10) return t("mon.catche");
  const n = Math.round((new Date(dd.d) - new Date(x.d)) / 86400000);
  if (n < 45) return t("mon.catche");
  const mo = Math.round(n / 30.4);
  return t("mon.catchd").replace("{n}", mo === 1 ? t("mon.mo1") : t("mon.mo").replace("{n}", mo));
}
function renderMonDetail(x){
  const i = L(), w = monWl(x.mk), dd = MON_DL.find(d => d.mk === x.mk && d.u === x.u && monDays(d.d) >= 0), due = dd ? monDays(dd.d) : undefined;
  const kind = x.imp ? x.imp[0] : "risk";
  document.getElementById("mnDet").innerHTML = `<div class="mndt">
      <p class="mncatch"><span class="orb"></span><b>${t("mon.catch")}</b><span>${monLead(x, dd)}</span></p>
      <div class="mntop2"><div><div class="mnmeta"><span class="pill ${monPill(x.lv)}">${t("mon.lv." + x.lv)}</span><span class="mkn">${w.n[i]}</span><span>${monDate(x.d)}</span></div><p class="mnttl">${x.h[i]}</p></div>${due !== undefined && dd ? `<div class="mncd ${monCls(due)}"><b>${due}</b><span>${t(due === 1 ? "mon.day1" : "mon.dayn")}</span><small>${monDate(dd.d)}</small></div>` : ""}</div>
      <p class="mnrisk k-${kind}"><b>${t("mon.imp." + kind)}</b>${x.imp ? x.imp[1][i] : x.m[i]}</p>${monStore(x, i)}
      <div class="mndo"><span class="ic">${NEXT_IC}</span><div><b>${t("mon.l.next")}</b><p>${x.act[i]}</p></div></div>
      <p class="mndone">${t("mon.done")} ${[t("mon.dn1"), t("mon.dn2"), dd ? t("mon.dn3") : t("mon.dn4")].map(s => `<span class="it">${TICK_IC}${s}</span>`).join("")}</p>
    </div>
    <div class="mnfoot"><a href="${x.u}" target="_blank" rel="noopener">${t("src")}${i ? "：" : ": "}${x.s[i]} ↗</a><button type="button" class="btn b-ink" data-plan="${x.mk}">${t("mon.plan").replace("{m}", w.n[i])}</button></div>`;
}
function renderMkMenu(){
  const i = L(), cnt = k => MON.filter(x => x.mk === k).length;
  document.getElementById("mnMkP").innerHTML = `<button type="button" role="option" data-mk="" aria-selected="${!monMk}">${t("mon.allm")}<em>${MON.length}</em></button>` +
    MON_WL.filter(w => cnt(w.k)).map(w => `<button type="button" role="option" data-mk="${w.k}" aria-selected="${monMk === w.k}">${w.n[i]}<em>${cnt(w.k)}</em></button>`).join("");
}
function closeMk(focus){ const p = document.getElementById("mnMkP"); if (p.hidden) return; p.hidden = true; const b = document.getElementById("mnMkB"); b.setAttribute("aria-expanded", "false"); if (focus) b.focus(); }
document.addEventListener("pointerdown", e => { if (!e.target.closest("#mnMk")) closeMk(false); });
document.getElementById("mnMk")?.addEventListener("keydown", e => {
  if (e.key === "Escape"){ e.preventDefault(); closeMk(true); return; }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const opts = [...document.querySelectorAll("#mnMkP button")]; if (document.getElementById("mnMkP").hidden || !opts.length) return;
  e.preventDefault(); const k = opts.indexOf(document.activeElement); opts[(k + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length].focus();
});
// sample alert: what a customer receives, built from the featured change
let pvLast = null;
const SEAL = '<svg viewBox="0 0 200 200" aria-hidden="true"><use href="#seal"/></svg>';
function openSample(){
  const i = L(), x = MON[monSel], w = monWl(x.mk), due = monNext(x.mk), dd = MON_DL.find(d => d.mk === x.mk && monDays(d.d) >= 0);
  document.getElementById("mnPvB").innerHTML = `<div class="mnml"><div class="fr">${SEAL}<b>${t("mon.app")}</b><span>${t("mon.al.to")}</span></div><p class="sb" id="mnPvT">${t("mon.al.subj").replace("{t}", x.t[i])}</p></div>
    <div class="mnmb">
      <div><p class="lb">${w.n[i]}${i ? "，" : ", "}${t("mon.f." + x.c)}</p><p class="tx" style="color:var(--ink);font-weight:500">${x.h[i]}</p></div>
      ${due !== undefined && dd ? `<div class="mndue"><span>${due === 0 ? t("mon.duet") : t(due === 1 ? "mon.due1" : "mon.due").replace("{n}", due)}</span><small>${monDate(dd.d)}</small></div>` : ""}
      ${monStore(x, i)}
      <div><p class="lb">${t("mon.l.next")}</p><p class="tx" style="color:var(--ink)">${x.act[i]}</p></div>
      <div><p class="lb">${t("mon.l.means")}</p><p class="tx">${x.m[i]}</p></div>
      <div class="ft"><a href="${x.u}" target="_blank" rel="noopener">${t("src")}${i ? "：" : ": "}${x.s[i]} ↗</a><button type="button" class="btn b-ink" data-plan="${x.mk}">${t("mon.plan").replace("{m}", w.n[i])}</button></div>
    </div><p class="mnmnote">${t("mon.al.note")}</p>`;
  pvLast = document.activeElement; const pv = document.getElementById("mnPv"); pv.hidden = false; document.getElementById("mnPvX").focus();
  track("monitor_sample_alert", {item: monSel});
}
function closeSample(){ const pv = document.getElementById("mnPv"); if (pv.hidden) return; pv.hidden = true; if (pvLast) pvLast.focus(); }
document.getElementById("mnPv")?.addEventListener("click", e => {
  e.stopPropagation();
  if (e.target.id === "mnPv" || e.target.closest("#mnPvX")){ closeSample(); return; }
  const plan = e.target.closest("[data-plan]"); if (plan){ closeSample(); const w = monWl(plan.dataset.plan); track("monitor_plan", {market: w.k, from: "sample"}); openForm("monitor", w.n[L()]); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSample(); });
const monNear = () => { if (matchMedia("(max-width:767px)").matches) document.getElementById("mnDet").scrollIntoView({block: "start", behavior: RM ? "auto" : "smooth"}); };
document.getElementById("monitor")?.addEventListener("click", e => {
  const ti = e.target.closest("[data-ti]");
  if (ti){ monSel = +ti.dataset.ti; renderMon(false); monNear(); track("monitor_select", {item: monSel}); return; }
  const mkb = e.target.closest("#mnMkB");
  if (mkb){ const p = document.getElementById("mnMkP"), open = p.hidden; if (open) renderMkMenu(); p.hidden = !open; mkb.setAttribute("aria-expanded", String(open)); if (open) p.querySelector('[aria-selected="true"]').focus(); return; }
  const mko = e.target.closest("[data-mk]");
  if (mko){ monMk = mko.dataset.mk || null; closeMk(true); renderMon(true); track("monitor_market", {market: monMk}); return; }
  if (e.target.closest("#mnSampleB")){ openSample(); return; }
  const dk = e.target.closest("[data-dk]");
  if (dk){ const k = MON.findIndex(x => x.mk === dk.dataset.dk); if (k >= 0){ if (monMk && monMk !== dk.dataset.dk) monMk = null; monSel = k; renderMon(true); monNear(); } track("monitor_deadline", {market: dk.dataset.dk}); return; }
  const plan = e.target.closest("[data-plan]");
  if (plan){ const w = monWl(plan.dataset.plan); track("monitor_plan", {market: w.k}); openForm("monitor", w.n[L()]); return; }
  if (e.target.closest("#trAlert")){ track("monitor_alerts", {}); openForm("monitor_alerts"); }
});

/* ============ testimonials: real customer quotes ============ */
const TS_ALL = [
  {logo: "logos/ink/starbucks.png", lh: 44, alt: ["Starbucks", "星巴克"], n: "Richard", co: ["Starbucks", "星巴克"], ph: "media/people/richard.jpg", big: "media/people/richard-l.jpg", rl: ["General Manager, Starbucks", "星巴克总经理"],
   role: ["General Manager", "总经理"], pain: ["Chasing approvals", "追着审批跑"],
   q: ["Placetta filed all three of our permits from start to finish. My team stayed focused on running the store, not chasing approvals.", "快哉从头到尾办下了我们全部三项许可。我的团队专心经营门店，不用再追着审批跑。"],
   st: ["3 filings", "3 项申报"], sl: ["handled end to end", "全程代办"]},
  {flag: "chagee", logo: "logos/ink/ferrari.png", lh: 40, alt: ["Ferrari", "法拉利"], n: "Jackie", co: ["Ferrari", "法拉利"], ph: "media/people/jackie.jpg", big: "media/people/jackie-l.jpg", rl: ["Owner, Ferrari dealer", "法拉利经销商店主"],
   role: ["Owner", "店主"], pain: ["Months of approval time", "数月的审批时间"],
   q: ["Placetta got our approvals through 5 months sooner than we planned.", "快哉让我们的审批比计划提前 5 个月完成。"],
   st: ["5 months", "5 个月"], sl: ["saved in approval time", "节省的审批时间"]},
  {flag: "stanford", logo: "logos/ink/stanford.svg", lh: 30, alt: ["Stanford University", "斯坦福大学"], n: "Stefan", co: ["Stanford", "斯坦福大学"], ph: "media/people/stefan.jpg", big: "media/people/stefan-l.jpg", rl: ["Stanford University", "斯坦福大学"],
   pain: ["Permits and filings", "许可与申报"],
   q: ["We had 9 permits and filings to get through. Placetta mapped the order, filed every one, and we had all our approvals in 4 months.", "我们有 9 项许可和申报要办。快哉理清了先后顺序，逐项提交，4 个月内我们拿到了全部批准。"],
   st: ["9 filings", "9 项申报"], sl: ["approved in 4 months", "4 个月获批"]},
  {logo: "logos/ink/yale.svg", lh: 34, alt: ["Yale University", "耶鲁大学"], n: "Jean", co: ["Yale", "耶鲁大学"], ph: "media/people/jean.jpg", big: "media/people/jean-l.jpg", rl: ["Yale University", "耶鲁大学"],
   q: ["I expected our approval to take 3 months. Placetta got it done in 4 weeks. They\u2019re the fastest company I\u2019ve worked with.", "我原以为我们的审批要 3 个月，快哉 4 周就办下来了。他们是我合作过速度最快的公司。"],
   st: ["4 weeks", "4 周"], sl: ["instead of the 3 months expected", "原本预计需要 3 个月"]},
];
// PROOF: a quote shows only with PROOF.testimonials on, its own flag on where it has one, and, where the person has a
// connection to Placetta or its founder (needsMc), that connection written in mc: ["...", "..."] and shown under the name
const TS = TS_ALL.filter(v => PROOF.testimonials && (!v.flag || PROOF[v.flag]) && (!v.needsMc || v.mc));
let tsK = 0, tsHold = false, tsVis = true;
document.addEventListener("click", e => { const b = e.target.closest(".tsx"); if (!b) return; const t2 = document.querySelector(`.tstab[data-ts="${b.dataset.ts}"]`); if (t2) { t2.click(); document.getElementById("tsBar").scrollIntoView({behavior: RM ? "auto" : "smooth", block: "center"}); } });
function renderTsStrip(){
  const el = document.getElementById("tsStrip"); if (!el) return; const i = L();
  // Vanta-style: each customer's logo with the result they reported, nothing added
  el.innerHTML = TS.map((v, k) => { const r = null; return `<button type="button" class="tsx" data-ts="${k}"><img src="${v.logo}" alt="${v.alt[i]}" style="height:${Math.round(v.lh * .7)}px" loading="lazy" decoding="async" draggable="false"><b>${r ? r[0][i] : v.st[i]}</b><span>${r ? r[1][i] : v.sl[i]}</span></button>`; }).join("");
}
function tsWho(v, i){ return v.role ? v.rl[i] : v.co[i]; }
function tsOff(){ if (!document.getElementById("tsGrid")) return true;   // the quotes are on the home page
  if (TS.length) return false; ["tsBar", "tsGrid"].forEach(id => { const e = document.getElementById(id); if (e) e.hidden = true; }); return true; }
function renderTsTabs(){
  if (tsOff()) return;
  renderTsStrip();
  const i = L();
  const el = document.getElementById("tsTabs"), had = el.contains(document.activeElement);
  el.innerHTML = TS.map((v, k) => `<button type="button" role="tab" class="tstab" id="tsTab${k}" data-ts="${k}" aria-selected="${k === tsK}" aria-controls="tsGrid" tabindex="${k === tsK ? 0 : -1}"><b>${v.n}</b><span>${tsWho(v, i)}</span><i><b></b></i></button>`).join("");
  document.getElementById("tsGrid").setAttribute("aria-labelledby", "tsTab" + tsK);
  const on = el.children[tsK];
  if (on) { if (had) on.focus({preventScroll: true}); const l = on.offsetLeft - 4, r = on.offsetLeft + on.offsetWidth + 4; if (l < el.scrollLeft) el.scrollLeft = l; else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth; }
}
function renderTs(swap){
  if (tsOff()) return;
  // land97 (Oct 24): every named quote at once, Ramp style, each with its logo, its person and the one number they reported
  // (the tabbed card showed one at a time and ran a screen tall). The tabs stay in the HTML, hidden, for the code above.
  const i = L(), g = document.getElementById("tsGrid");
  renderTsTabs(); g.classList.add("tq97g"); g.removeAttribute("role"); g.removeAttribute("aria-labelledby"); g.removeAttribute("tabindex");
  g.innerHTML = TS.map(x => `<figure class="tq97">
    <span class="tq97lb"><img class="tq97l" src="${x.logo}" alt="${esc(x.alt[i])}" style="--lh:${Math.round(x.lh * .72)}px" loading="lazy" decoding="async" draggable="false"></span>
    <p class="tq97r"><strong>${x.st[i]}</strong><small>${x.sl[i]}</small></p>
    <blockquote>\u201c${x.q[i]}\u201d</blockquote>
    <figcaption><span class="tsav" aria-hidden="true" style="background-image:url('${x.ph}')"></span><span><b>${x.n}</b><small>${x.rl[i]}</small>${x.mc ? `<small class="tsmc">${x.mc[i]}</small>` : ""}</span></figcaption>
  </figure>`).join("");
}
/* testimonial portraits are CSS backgrounds (no image menu, no drag, no open-in-tab); the card blocks the menu and drag too */
["contextmenu", "dragstart", "copy"].forEach(ev => document.getElementById("tsGrid")?.addEventListener(ev, e => { if (e.target.closest(".tsph,.tsp,.tq97 .tsav")) e.preventDefault(); }));
let tsT = null;
(() => { const g = document.getElementById("tsSec"); if (!g || !("IntersectionObserver" in window)) { if (g) g.classList.add("near"); return; }
  const o = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { o.disconnect(); g.classList.add("near"); } }, {rootMargin: "600px 0px"}); o.observe(g); })();
function tsNext(){ clearTimeout(tsT); return; /* land97: the quotes all show at once, nothing rotates */ if (RM || !TS.length) return; tsT = setTimeout(() => { if (document.hidden || !tsVis) { tsNext(); renderTsTabs(); return; } tsK = (tsK + 1) % TS.length; renderTs(true); tsNext(); }, 8000); }
document.getElementById("tsTabs")?.addEventListener("click", e => { const b = e.target.closest("[data-ts]"); if (!b) return; const k = Number(b.dataset.ts); if (k !== tsK) { tsK = k; renderTs(true); track("testimonial_nav", {to: tsK}); } if (!tsHold) tsNext(); });
document.getElementById("tsTabs")?.addEventListener("keydown", e => {
  const n = TS.length, to = {ArrowRight: tsK + 1, ArrowDown: tsK + 1, ArrowLeft: tsK - 1, ArrowUp: tsK - 1, Home: 0, End: n - 1}[e.key];
  if (to === undefined || !n) return; e.preventDefault();
  tsK = (to + n) % n; renderTs(true); track("testimonial_nav", {to: tsK});
});
["tsGrid", "tsTabs"].forEach(id => { const el = document.getElementById(id); if (!el) return;
  el.addEventListener("mouseenter", () => { tsHold = true; clearTimeout(tsT); document.getElementById("tsBar").classList.add("hold"); });
  el.addEventListener("mouseleave", () => { tsHold = false; document.getElementById("tsBar").classList.remove("hold"); renderTsTabs(); tsNext(); }); });
tsNext();

/* ============ WeChat QR: set WECHAT_QR to the image path and it appears in the final call to action and the form ============ */
const WECHAT_QR = "";
if (WECHAT_QR){ document.getElementById("fqrImg").src = WECHAT_QR; document.getElementById("fqr").hidden = false;
  // work together: "Add us on WeChat" shows only with a real code behind it, and opens the code in place (601282ab)
  const wc = document.getElementById("chWc"), add = document.getElementById("chAdd"), box = document.getElementById("chQr");
  if (wc && add && box){ document.getElementById("chQrImg").src = WECHAT_QR; wc.hidden = false;
    add.addEventListener("click", () => { box.hidden = !box.hidden; add.setAttribute("aria-expanded", String(!box.hidden)); track("wechat_qr_open", {open: !box.hidden}); }); } const q = document.getElementById("wtQrImg"); if (q){ q.src = WECHAT_QR; document.getElementById("wtQrT").setAttribute("data-i18n", "fqr.t"); document.getElementById("wtQrT").textContent = t("fqr.t"); } }

/* ============ boot ============ */
/* ============ restored sections (from the earlier site) ============ */
// what each person costs, from the public sources in diff.src
const BEFORE_COST = [["$2,000 to $7,500 a restaurant","每家餐厅 2,000 至 7,500 美元"],["$159,670 a year","年薪 159,670 美元"],["$101,280 a year","年薪 101,280 美元"],["$80,730 a year","年薪 80,730 美元"],["$50,670 a year","年薪 50,670 美元"],["$60,170 a year","年薪 60,170 美元"],["$48,310 a year","年薪 48,310 美元"]];
const BEFORE = [["Permit expediter","许可代办","On hold","电话排队中"],["Lawyer","律师","Billing again","又在计费"],["Operations manager","运营经理","Form sent back","表格被退回"],["Compliance officer","合规专员","Deadline missed","错过截止日期"],["Bookkeeper","会计","Renewal overdue","续期逾期"],["Translator","翻译","Still translating","还在翻译"],["Admin assistant","行政助理","In line at the county","在县政府排队"]];


const DASHROWS = [
 [["Business tax certificate","营业税证书"],"d"],
 [["Health plan check","卫生许可图纸审查"],"r"],
 [["Building permit (TI)","室内装修建筑许可"],"r"],
 [["Certificate of occupancy","使用许可证"],"b"]
];
const DASHPILL = {d:["p-d","Approved","已完成"], r:["p-r","In review","审核中"], b:["p-b","Blocked","等待验收"]};
function renderDash(){
  if (!document.getElementById("dashA")) return;
  // Alven's in-the-loop cards: the plan as a task list, Odelia's note under it, and what she did with it.
  const T2 = (k, j) => (j ? T.zh : T.en)[k];
  const IC = {
    d: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.4l3.1 3.1L12.8 5" fill="none" stroke="#2F6B40" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    r: '<svg class="dspin" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="#E6E8EC" stroke-width="1.6"/><path d="M8 1.8a6.2 6.2 0 0 1 6.2 6.2" fill="none" stroke="#1a1816" stroke-width="1.6" stroke-linecap="round"/></svg>',
    b: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.4v6.2M8 12.6h.01" stroke="#B8483B" stroke-width="1.9" stroke-linecap="round"/></svg>'
  };
  const card = (j, name, time, av, other) =>
    `<div class="bub dtask"><div class="dth"><span class="dav">${av}</span><b>${T2(name, j)}</b><small>${T2(time, j)}</small></div>` +
    DASHROWS.map(([n, st]) => `<div class="dtr">${IC[st]}<span>${n[j]}</span><em class="s-${st}">${DASHPILL[st][1 + j]}</em></div>`).join("") + `</div>` +
    `<svg class="dconn" width="16" height="22" viewBox="0 0 16 22" aria-hidden="true"><path d="M8 0v22" stroke="#D3D9E3"/></svg>` +
    `<div class="bub"><div><span class="orb av"></span><div class="bc"><p>${T2("dash.risk", j)}</p></div></div></div>` +
    `<div class="ichip dchip"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9D9D9C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/></svg><span>${j ? "已同步给" + other : "Shared with " + other}</span></div>`;
  const j = L();   // both teams read the page's language: fully English on the English page, fully Chinese on the Chinese one
  document.getElementById("dashA").innerHTML = card(j, "dash.a", "dash.at", j ? "深" : "SZ", T2("dash.b", j));
  document.getElementById("dashB").innerHTML = card(j, "dash.b", "dash.bt", j ? "纽" : "NY", T2("dash.a", j));
}


// second pass: the before-to-after beat plays once, when the card is half in view
(() => { const d = document.getElementById("diff"); if (!d || RM || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ setTimeout(() => d.classList.add("dgo"), 600); io.disconnect(); } }), {threshold: .5}); io.observe(d.querySelector(".dcard") || d); })();
function renderBefore(){ if (!document.getElementById("before")) return; const i = L(); document.getElementById("before").innerHTML = BEFORE.map((b, k) => `<div class="per" role="listitem"><span class="pain">${b[2 + i]}</span><svg class="sil" viewBox="0 0 30 90" aria-hidden="true"><use href="#sil"/></svg><div class="tag">${b[i]}</div><small class="pcost">${BEFORE_COST[k] ? BEFORE_COST[k][i] : ""}</small></div>`).join(""); }


const isLg = () => innerWidth >= 1024;
const ADDS = [
 {c:["Qinghuan Tea House","青環茶舍"],m:["San José, CA","加州圣何塞"],d:["Mar 2027","2027年3月"]},
 {c:["Lantern Noodle Bar","灯笼面馆"],m:["Houston, TX","得州休斯顿"],d:["Jun 2027","2027年6月"]},
 {c:["Copperleaf Coffee","铜叶咖啡"],m:["Seattle, WA","华盛顿州西雅图"],d:["Sep 2027","2027年9月"]}
];
let aIdx = 0, aTimer = null, aRunning = false;
function renderAddRow(animate){
  const r = ADDS[aIdx], i = L(), row = document.getElementById("newRow"); if (!row) return;
  const fill = () => { document.getElementById("nr1").textContent = r.c[i]; document.getElementById("nr2").textContent = r.m[i]; document.getElementById("nr3").textContent = r.d[i];
    const p = document.getElementById("nr4"); p.className = "pill p-q"; p.textContent = t("add.mapping"); };
  if (!animate){ fill(); if (row.classList.contains("open")) { const p = document.getElementById("nr4"); p.className = "pill p-d"; p.textContent = t("add.ready"); } return; }
  const btn = document.getElementById("addBtn");
  row.classList.remove("open");
  setTimeout(() => { btn.classList.add("press"); setTimeout(() => btn.classList.remove("press"), 200); fill(); row.classList.add("open");
    setTimeout(() => { const p = document.getElementById("nr4"); p.className = "pill p-d"; p.textContent = t("add.ready"); }, 1400); }, 450);
}
function addCycle(){ renderAddRow(true); aTimer = setTimeout(() => { aIdx = (aIdx + 1) % ADDS.length; addCycle(); }, 5200); }
let fDone = false;
function renderFrRow(animate){
  const row = document.getElementById("frNew"), st = document.getElementById("fn4"); if (!row) return;
  if (!animate){ st.textContent = t(row.classList.contains("open") ? "fr.watch" : "fr.join"); return; }
  const btn = document.getElementById("frBtn");
  st.textContent = t("fr.join");
  setTimeout(() => { btn.classList.add("press"); setTimeout(() => btn.classList.remove("press"), 200); row.classList.add("open");
    setTimeout(() => { st.textContent = t("fr.watch"); }, 1400); }, 450);
}
const IND = [];   // filled from /data/more.json on the page that shows it (moreData)
let inK = 0, inLock = 0;
const IN_KEYS = ["r","s","tk","gm","c","mf","bt","hc","av","w","f"];
function renderInd(k){
  if (k !== undefined) inK = k;
  document.querySelectorAll(".inb").forEach(b => { const on = +b.dataset.k === inK; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
  const key = IN_KEYS[inK], ct = document.getElementById("inCapT"); if (!ct) return;
  ct.textContent = t("in." + key); document.getElementById("inCapP").textContent = t("in." + key + "p");
  const pm = document.getElementById("inPm"), rows = IND[inK] && IND[inK].rows, li = L(); // the sector's own permits, by name
  if (pm) pm.innerHTML = rows ? (IND[inK].w ? `<li class="inpmh">${esc(IND[inK].t[li])}${li ? "，" : ", "}${esc(IND[inK].w[li])}</li>` : "") + rows.map(r => `<li>${esc(r[0][li])}</li>`).join("") : "";
  // land96: one row of sector tabs on every screen, the picture right under it
  const pn = document.querySelector(".inpanel"), row = document.querySelector(".inrow"), btn = document.querySelector(`.inb[data-k="${inK}"]`);
  if (pn && row && btn){
    if (pn.parentElement !== row) row.appendChild(pn);
    dispatchEvent(new Event("inresize"));
  }
  if (window.inArt) window.inArt(inK);
}
(function(){
  const sc = document.getElementById("inScroll"); if (!sc) return;
  const lg = () => matchMedia("(min-width:1024px)").matches;
  document.querySelector(".inlist")?.addEventListener("click", e => { const b = e.target.closest(".inb"); if (!b) return; const k = +b.dataset.k;
    if (lg() && !RM && sc.offsetHeight > innerHeight + 40){ inLock = Date.now() + 1200; const top = sc.getBoundingClientRect().top + scrollY, span = sc.offsetHeight - innerHeight; scrollTo({top: top + span * (k + .5) / IND.length, behavior: "smooth"}); }
    renderInd(k); track("industry_select", {k}); });
  addEventListener("scroll", () => { if (!lg() || Date.now() < inLock) return; const r = sc.getBoundingClientRect(), span = sc.offsetHeight - innerHeight; if (r.top > 0 || -r.top > span) return;
    const k = Math.min(IND.length - 1, Math.floor(-r.top / span * IND.length)); if (k !== inK) renderInd(k); }, {passive: true});
})();
function fitTable(){ document.querySelectorAll(".abox").forEach(box => { if (isLg()) { box.style.removeProperty("--ts"); return; } box.style.setProperty("--ts", (box.clientWidth / 600).toFixed(4)); }); }

const CH = [
 {ic:"wechat",t:["WeChat with our team","微信联系我们的团队"]},
 {ic:"slack",t:["Slack with Odelia","在 Slack 与 Odelia 协作"]},
 {ic:"lark",t:["Lark with Odelia","在飞书与 Odelia 协作"]},
 {ic:"wa",t:["WhatsApp with Odelia","WhatsApp 联系 Odelia"]},
 {ic:"im",t:["iMessage with Odelia","iMessage 联系 Odelia"]},
 {ic:"email",t:["email to Odelia","给 Odelia 发邮件"]},
 {ic:"phone",t:["call Odelia any time","随时致电 Odelia"]}
];
const CHIC = {
 wechat:'<span class="ci" style="background:#2AAE67"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M9 4C5 4 2 6.6 2 9.8c0 1.8 1 3.4 2.6 4.5L4 16.5l2.6-1.3c.8.2 1.6.3 2.4.3h.6a5 5 0 0 1-.2-1.4c0-3.2 3-5.6 6.7-5.6h.6C16 5.8 12.8 4 9 4zM22 14.3c0-2.6-2.6-4.6-5.8-4.6s-5.8 2-5.8 4.6 2.6 4.6 5.8 4.6c.6 0 1.3-.1 1.9-.3l2 1-.5-1.8c1.5-.8 2.4-2.1 2.4-3.5z"/></svg></span>',
 email:'<span class="ci" style="background:#fff"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B6FD9" stroke-width="2.2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span>',
 phone:'<span class="ci" style="background:#34B36A"><svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2"/></svg></span>',
 chat:'<span class="ci" style="background:#3B82F6"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M12 4c5 0 9 3.1 9 7s-4 7-9 7c-1 0-2-.1-2.9-.4L4 20l1.4-3.6C4 15 3 13.1 3 11c0-3.9 4-7 9-7z"/></svg></span>',
 dash:'<span class="ci orb"></span>',
 slack:'<span class="ci" style="background:#4A154B"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M6.2 14.6a1.9 1.9 0 1 1-1.9-1.9h1.9zm1 0a1.9 1.9 0 0 1 3.8 0v4.8a1.9 1.9 0 1 1-3.8 0zM9.1 6.2a1.9 1.9 0 1 1 1.9-1.9v1.9zm0 1a1.9 1.9 0 0 1 0 3.8H4.3a1.9 1.9 0 1 1 0-3.8zM17.8 9.1a1.9 1.9 0 1 1 1.9 1.9h-1.9zm-1 0a1.9 1.9 0 0 1-3.8 0V4.3a1.9 1.9 0 1 1 3.8 0zM14.9 17.8a1.9 1.9 0 1 1-1.9 1.9v-1.9zm0-1a1.9 1.9 0 0 1 0-3.8h4.8a1.9 1.9 0 1 1 0 3.8z"/></svg></span>',
 lark:'<span class="ci" style="background:#3370FF"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M8.6 4.5h7.6c1.4 1.4 2.3 3.1 2.8 5-1.8.4-3.3 1.2-4.6 2.3C13.1 9 11.2 6.5 8.6 4.5zM3.5 10.4c3.5-.3 6.8 1 9.5 3.5l1.8 1.7c1.7-2.5 3.9-4 6.8-4.6-1.6 4.8-5.3 8.3-10.4 8.5-3.2.1-5.8-.9-7.7-2.3z"/></svg></span>',
 wa:'<span class="ci" style="background:#25D366"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.9L3.5 20.5l4.2-1.1A8.5 8.5 0 1 0 12 3.5zm-2.7 4.4c.2-.5.5-.5.8-.5h.6c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.6l-.6.7c-.1.1-.2.3 0 .5.6 1 1.6 2 2.7 2.6.2.1.4.1.5 0l.8-.9c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.3.3.6-.2 1.1-1.2 1.8-2.2 1.7-3.4-.3-6.4-3.2-6.8-6.6 0-.5.1-1 .2-1.4z" fill-rule="evenodd"/></svg></span>',
 im:'<span class="ci" style="background:#34C759"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M12 4c5 0 9 3.2 9 7.2s-4 7.2-9 7.2c-.9 0-1.8-.1-2.6-.3L5 20l1.2-3.6C4.2 15.1 3 13.3 3 11.2 3 7.2 7 4 12 4z"/></svg></span>'
};
let rIdx = 0;
function renderRot(){
  const i = L(); if (!document.getElementById("rotl")) return;
  document.getElementById("rotl").innerHTML = CH.map((c,k) => `<div style="top:${k*55.5}px">${CHIC[c.ic]}<span>${c.t[i]}</span></div>`).join("");
  paintRot();
}
function paintRot(){
  if (!document.getElementById("rotl")) return;
  const items = [...document.getElementById("rotl").children];
  items.forEach((e,k) => { const d = Math.abs(k - rIdx); e.className = d === 0 ? "on" : d === 1 ? "n" : ""; });
  document.getElementById("rotl").style.transform = `translateY(${65 - 11 - rIdx*55.5}px)`;
}
if (!RM) setInterval(() => { rIdx = (rIdx + 1) % CH.length; paintRot(); }, 2000);

const XPG = [[["Government and academia", "政府与学术界"], [["U.S. FDA", "美国食品药品监督管理局"], ["Harvard University", "哈佛大学"], ["MIT", "麻省理工学院"], ["University of Pennsylvania", "宾夕法尼亚大学"], ["Princeton University", "普林斯顿大学"], ["Stanford University", "斯坦福大学"]]], [["Customs", "海关"], [["U.S. Customs and Border Protection", "美国海关与边境保护局"], ["Mexico's National Customs Agency (ANAM)", "墨西哥国家海关署（ANAM）"], ["EU Customs Union (DG TAXUD)", "欧盟关税同盟（DG TAXUD）"]]], [["AI and technology", "人工智能与科技"], [["OpenAI", "OpenAI"], ["Google", "谷歌"], ["Amazon", "亚马逊"], ["Huawei", "华为"], ["TikTok", "TikTok"], ["NVIDIA", "英伟达"], ["Tesla", "特斯拉"], ["TSMC", "台积电"]]], [["Trading and finance", "交易与金融"], [["Jane Street", "简街资本"], ["Citadel", "城堡投资"], ["Hudson River Trading", "哈德逊河交易"], ["Optiver", "澳帝华"], ["Renaissance Technologies", "文艺复兴科技"], ["Goldman Sachs", "高盛"], ["J.P. Morgan", "摩根大通"], ["Blackstone", "黑石集团"]]], [["Consumer, health and logistics", "消费、医疗与物流"], [["Walmart", "沃尔玛"], ["Costco", "开市客"], ["Johnson & Johnson", "强生"], ["DHL", "DHL"], ["Maersk", "马士基"]]]];
/* experts tapestry: company names with the advisors' portraits woven in, each portrait pixelated until hovered */
const XPN = 60, xpImgs = [], xpPx = [7, 11, 18, 32, 64];
let xpNear = !("IntersectionObserver" in window), xpQ = [];
if (!xpNear) { const xpEl = document.getElementById("experts"); if (!xpEl) xpNear = true; else { const xio = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { xio.disconnect(); xpNear = true; xpQ.splice(0).forEach(a => xpDraw(...a)); } }, {rootMargin: "1200px 0px"}); xio.observe(xpEl); } }
function xpImg(k){ if (!xpImgs[k]) { const im = new Image(); im.decoding = "async"; im.src = "media/people/advisor-" + (k + 1) + ".jpg"; xpImgs[k] = im; } return xpImgs[k]; }
function xpDraw(cv, k, px){
  if (!xpNear) { xpQ.push([cv, k, px]); return; }
  const im = xpImg(k); if (!im.complete || !im.naturalWidth) { im.addEventListener("load", () => xpDraw(cv, k, cv._px || px), {once: true}); return; }
  const S = cv.width, g = cv.getContext("2d"), t = xpDraw.tmp || (xpDraw.tmp = document.createElement("canvas")), tg = t.getContext("2d");
  cv._px = px;
  if (px >= S) { g.imageSmoothingEnabled = true; g.drawImage(im, 0, 0, S, S); return; }
  t.width = t.height = px; tg.imageSmoothingEnabled = true; tg.drawImage(im, 0, 0, px, px);
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, S, S); g.drawImage(t, 0, 0, px, px, 0, 0, S, S);
}
function xpResolve(el, on){
  const cv = el.firstChild, k = +el.dataset.k; el.classList.toggle("on", on); clearInterval(el._t);
  if (RM) { xpDraw(cv, k, on ? cv.width : xpPx[0]); return; }
  let step = on ? 0 : xpPx.length; const seq = on ? [...xpPx, cv.width] : [...xpPx].reverse();
  let n = 0; el._t = setInterval(() => { xpDraw(cv, k, seq[n]); if (++n >= seq.length) clearInterval(el._t); }, 45);
}
// portrait swaps in the company tapestry: slot -> advisor photo index (photos past the tapestry slots are otherwise unused there)
const XPSWAP = {15: 52};   // Tesla
// PROOF.expertLogos on: a small mark beside the companies we hold a file for; off: names only
// Government and academia, AI and technology: each name with its small square icon (logos/fav). Every other row: names only.
const XPL = {"U.S. FDA": "fda.svg", "Harvard University": "harvard.svg", "MIT": "mit.svg", "University of Pennsylvania": "penn.svg", "Princeton University": "princeton.svg", "Stanford University": "stanford.svg",
  "OpenAI": "openai.png", "Google": "google.svg", "Amazon": "amazon.svg", "Huawei": "huawei.svg", "TikTok": "tiktok.svg", "NVIDIA": "nvidia.svg", "Tesla": "tesla.svg", "TSMC": "tsmc.svg"};
function renderXp(){
  const i = L(), art = document.getElementById("xpArt"); if (!art) return;
  // spread the portraits across the rows in proportion to the names, one after every name or so
  const total = XPG.reduce((a, g) => a + g[1].length, 0); let k = 0, used = 0;
  art.innerHTML = XPG.map((g, r) => {
    const names = g[1], share = r === XPG.length - 1 ? XPN - used : Math.round(XPN * names.length / total); used += share;
    const slots = new Set(Array.from({length: share}, (_, j) => Math.floor((j + .5) * names.length / share)));
    const parts = names.map((x, j) => `<span class="xpn">${PROOF.expertLogos && XPL[x[0]] ? `<img class="xpl xfav" src="logos/fav/${XPL[x[0]]}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ""}${x[i]}</span>` + (slots.has(j) && k < XPN ? `<span class="xpf" data-k="${XPSWAP[k] ?? k}" data-slot="${k++}" aria-hidden="true"><canvas width="128" height="128"></canvas></span>` : j < names.length - 1 ? `<span class="xps" aria-hidden="true">/</span>` : ""));
    return `<div class="xprow"><p class="xpcat">${g[0][i]}</p><p class="xpflow">${parts.join("")}</p></div>`;
  }).join("");
  art.querySelectorAll(".xpf").forEach(el => xpDraw(el.firstChild, +el.dataset.k, 128));
}

/* the wall: a blue whale made of the advisors. A whale silhouette (tail raised, spout rising) is drawn on a grid of
   small square cells; every cell inside it is one advisor's portrait (34 faces, spread so no face sits next to itself),
   lit from above and shaded toward the belly. It breathes and bobs on the navy deep while light ripples across it. */
(function xpWallInit(){
  const cv = document.getElementById("xpWall"); if (!cv) return;
  const g = cv.getContext("2d"), ims = [], tiles = [], mk = document.createElement("canvas"), mg = mk.getContext("2d", {willReadFrequently: true});
  let W = 0, H = 0, dpr = 1, run = false, t0 = performance.now(), loaded = 0, cols = 80, rows = 28, cell = 15, sc = 1, offX = 0, offY = 0;
  // the still whale is drawn once at 4x the cell grid; each frame its rear columns are shifted up and down along a
  // travelling wave and the result is box-filtered down to one pixel per cell
  const SS = 4, st = document.createElement("canvas"), sg = st.getContext("2d"), bt = document.createElement("canvas"), bg = bt.getContext("2d"),
    hf = document.createElement("canvas"), hg = hf.getContext("2d");
  // each portrait is pre-scaled once to the exact device-pixel size of a tile (halving step by step from the 512px
  // original, so it stays crisp), and drawn on whole pixels: no resampling at draw time, so no blur
  let TP = 0;
  const mkTile = k => { const im = ims[k]; if (!im || !TP) return;
    let src = im, w = im.naturalWidth;
    while (w / 2 >= TP) { const h = document.createElement("canvas"); w = Math.round(w / 2); h.width = h.height = w; const hg2 = h.getContext("2d"); hg2.imageSmoothingQuality = "high"; hg2.drawImage(src, 0, 0, w, w); src = h; }
    const c = document.createElement("canvas"); c.width = c.height = TP; const cg = c.getContext("2d"); cg.imageSmoothingQuality = "high"; cg.drawImage(src, 0, 0, TP, TP); tiles[k] = c; };
  // Oct 18: the whale is drawn at once in plain tiles and each face fills in as its photo arrives, so the panel is never empty
  let pend = false;
  const redraw = () => { if (run || pend) return; pend = true; requestAnimationFrame(n => { pend = false; frame(n); }); };
  // phone95: the advisors' photos load when the panel is a screen or so away, not with the first screen
  ((el, fn) => { if (!el || !("IntersectionObserver" in window)) return fn(); const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, {rootMargin: "1200px 0px"}); io.observe(el); })(document.getElementById("experts"), () => { for (let k = 0; k < XPN; k++) { const im = new Image(); im.decoding = "async"; im.onload = () => { ims[k] = im; mkTile(k); loaded++; redraw(); }; im.src = "media/people/advisor-" + (k + 1) + ".jpg"; } });
  const size = () => {
    if (W && cv.clientWidth === W) return;   // its height follows its width only: a phone's toolbar moving changes nothing here
    dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth;
    cell = W < 640 ? 9 : W < 1024 ? 13 : 18; cols = Math.floor(W / cell); rows = Math.round(cols * 0.34); H = rows * cell;
    const tp = Math.round(cell * dpr) - Math.max(1, Math.round(dpr)); if (tp !== TP) { TP = tp; ims.forEach((_, k) => mkTile(k)); }
    cv.style.height = H + "px"; cv.parentElement.style.height = H + "px"; cv.width = W * dpr; cv.height = H * dpr; mk.width = cols; mk.height = rows;
    sc = Math.min(cols / 1000, rows / 372) * .88; offX = (cols - 1000 * sc) / 2; offY = (rows - 372 * sc) / 2 - 20 * sc;   // the whale spans y 20-392 of its 420 design box
    st.width = bt.width = cols * SS; st.height = bt.height = rows * SS; hf.width = cols * 2; hf.height = rows * 2;
    if (BODY) still(); sd = null;
  };
  let BODY = null;
  // the whale, in a 1000 x 420 design space, facing left with its flukes raised
  BODY = new Path2D("M60 262C60 182 170 137 330 132C480 127 600 162 690 222C730 247 760 242 790 202C805 182 812 152 805 127C770 117 735 92 720 62C770 72 815 92 830 112C850 82 890 62 945 57C920 92 880 127 845 142C835 182 815 232 770 272C700 332 560 352 400 350C230 348 100 332 60 262Z");
  const FIN = new Path2D("M300 330C330 350 360 380 405 392C392 366 368 342 340 328Z");
  const MOUTH = new Path2D("M62 272C120 288 190 296 250 292");
  const SPOUT = [[168, 92, 14], [150, 62, 11], [188, 58, 11], [132, 36, 8], [206, 32, 8], [168, 30, 9]];
  // the still whale, in mask colours: red = whale, yellow = eye and mouth line (dark), blue = spout
  function still(){
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, st.width, st.height);
    sg.setTransform(sc * SS, 0, 0, sc * SS, offX * SS, offY * SS);
    sg.fillStyle = "rgb(255,0,0)"; sg.fill(BODY); sg.fill(FIN);
    sg.fillStyle = "rgb(255,255,0)"; sg.beginPath(); sg.arc(150, 240, 11, 0, 7); sg.fill();
    sg.strokeStyle = "rgb(255,255,0)"; sg.lineWidth = 7; sg.lineCap = "round"; sg.stroke(MOUTH);
    sg.fillStyle = "rgb(0,0,255)"; SPOUT.forEach(([x, y, r]) => { sg.beginPath(); sg.arc(x, y, r, 0, 7); sg.fill(); });
  }
  /* the stroke. A whale swims by bending its tail stock up and down. Here the tail curls about the root of the stock:
     each point turns about that root by an angle that grows with its distance from it, so the stock bends in a smooth
     arc and the flukes, furthest out, sweep the widest and trail a beat behind. The beat is a little quicker on the
     power (down) stroke. Front of the body, fin, eye and spout never move. */
  const PX0 = 735, PY0 = 275, R0 = 40, R1 = 250, AMAX = .2, OM = 1.5, LAG = 1.1;
  let sd = null;   // the still whale's pixels, read once per resize
  size(); addEventListener("resize", size);
  const face = (c, r) => ((c * 7 + r * 13) % XPN + XPN) % XPN;
  const PH = ["#2C4A72", "#36557F", "#2F4E78", "#3B5B86"];   // placeholder tiles, in the whale's blues
  function frame(now){
    if (!st.width || !st.height){ W = 0; size(); if (!st.width || !st.height){ if (run && !RM) requestAnimationFrame(frame); return; } }   // laid out at zero width: try again next frame
    const t = RM ? 0 : (now - t0) / 1000;
    const W4 = st.width, H4 = st.height, k = sc * SS, px = (offX + PX0 * sc) * SS, py = (offY + PY0 * sc) * SS;
    if (!sd || sd.width !== W4) sd = sg.getImageData(0, 0, W4, H4);
    const out = bg.createImageData(W4, H4), o = out.data, src = sd.data, x0 = Math.floor((offX + 640 * sc) * SS);
    // everything left of the tail is copied as is
    for (let y = 0; y < H4; y++) o.set(src.subarray(y * W4 * 4, (y * W4 + x0) * 4), y * W4 * 4);
    const ph0 = OM * t, r0 = R0 * k, r1 = R1 * k;
    for (let y = 0; y < H4; y++) for (let x = x0; x < W4; x++) {
      const dx = x + .5 - px, dy = y + .5 - py, d = Math.hypot(dx, dy);
      let sx = x, sy = y;
      if (d > r0) {
        const u = Math.min(1, (d - r0) / (r1 - r0)), e = u * u * (3 - 2 * u), ph = ph0 - LAG * u;
        // only the part behind the root curls; a soft ramp across x keeps the belly joint seamless
        const wx = Math.min(1, Math.max(0, (x - x0) / (40 * k)));
        const a = -AMAX * e * wx * (Math.sin(ph) + .18 * Math.sin(2 * ph)), ca = Math.cos(a), sa = Math.sin(a);
        sx = Math.round(px + dx * ca - dy * sa - .5); sy = Math.round(py + dx * sa + dy * ca - .5);
        if (sx < 0 || sy < 0 || sx >= W4 || sy >= H4) continue;
      }
      const i = (y * W4 + x) * 4, j = (sy * W4 + sx) * 4;
      o[i] = src[j]; o[i + 1] = src[j + 1]; o[i + 2] = src[j + 2]; o[i + 3] = src[j + 3];
    }
    bg.putImageData(out, 0, 0);
    // 4x -> 2x -> 1x: each halving averages a 2x2 block, so edge cells come out partly covered and fade smoothly
    hg.imageSmoothingEnabled = mg.imageSmoothingEnabled = true;
    hg.clearRect(0, 0, hf.width, hf.height); hg.drawImage(bt, 0, 0, hf.width, hf.height);
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, cols, rows); mg.drawImage(hf, 0, 0, cols, rows);
    const m = mg.getImageData(0, 0, cols, rows).data;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#0F1B33"; g.fillRect(0, 0, W, H); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    // water streaming past: specks and thin streaks drift toward the tail at different depths
    for (let i = 0; i < 90; i++) {
      const z = .4 + (i % 5) * .15, px = ((i * 97.3 + t * 42 * z) % (W + 40)) - 20, py = (i * 53.7) % H;
      g.fillStyle = `rgba(164,200,225,${(.05 + z * .07).toFixed(3)})`; g.fillRect(px, py, 2 + z * 10 * (i % 3 === 0), 1.5);
    }
    const ox = (W - cols * cell) / 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const rs = r, p = (r * cols + c) * 4, G = m[p + 1], B = m[p + 2], A = m[p + 3];
      if (A < 24) continue;
      g.globalAlpha = Math.min(1, A / 210);   // edge tiles fade in and out, so the beating tail moves smoothly
      const x = ox + c * cell, y = r * cell;
      if (G > 128) { g.fillStyle = "#0A1426"; g.fillRect(x, y, cell, cell); continue; }       // eye, mouth
      const k = face(c, rs), px = Math.round(x * dpr), py = Math.round(y * dpr);
      if (tiles[k]) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(tiles[k], px, py); g.setTransform(dpr, 0, 0, dpr, 0, 0); }
      else { g.fillStyle = PH[k % 4]; g.fillRect(px / dpr, py / dpr, TP / dpr, TP / dpr); }
      // lit from above, darker toward the belly, with a band of light rippling along the body
      const v = rs / rows, shade = B > 128 ? .03 : Math.min(.32, Math.max(0, (v - .45) * .8)) - .02;   // light touch, so every face stays clear
      g.fillStyle = shade > 0 ? `rgba(11,22,42,${shade.toFixed(3)})` : `rgba(235,244,252,${(-shade).toFixed(3)})`;
      g.fillRect(px / dpr, py / dpr, TP / dpr, TP / dpr);
    }
    g.globalAlpha = 1;
    if (run && !RM) requestAnimationFrame(frame);
  }
  new IntersectionObserver(es => es.forEach(e => { const was = run; run = e.isIntersecting; if (run && !was) requestAnimationFrame(frame); }), {rootMargin: "600px 0px"}).observe(cv);
  frame(performance.now());   // the still whale on first paint
})();

/* industries art: each sector drawn as a mosaic of small tiles on the deep navy, the same way the experts' whale is
   made. Clicking a sector sends the tiles flying from one picture to the next. Shapes live in a 1000 x 420 box:
   red = body, yellow = dark detail, blue = light (steam, smoke, glass). */
addEventListener("resize", () => { const pn = document.querySelector(".inpanel"); if (pn && pn.parentElement.classList.contains("inlist")) renderInd(); });
(function inArtInit(){
  const cv = document.getElementById("inCv"); if (!cv) return;
  const g = cv.getContext("2d"), mk = document.createElement("canvas"), mg = mk.getContext("2d", {willReadFrequently: true});
  let looping = false, kickUntil = 0, W = 0, H = 0, dpr = 1, baseCell = 10, cell = 14, cols = 0, rows = 0, sc = 1, ox = 0, oy = 0, cur = -1, tiles = [], tA = 0, run = false, t0 = performance.now();
  const R = "rgb(255,0,0)", Y = "rgb(255,255,0)", B = "rgb(0,0,255)", J = "rgb(0,255,0)", G = "rgb(255,0,255)", S = "rgb(0,255,255)", D = "rgb(0,0,100)";
  const rr = (x, y, w, h, r, c) => { mg.fillStyle = c; mg.beginPath(); mg.roundRect(x, y, w, h, r); mg.fill(); };
  const ln = (pts, w, c) => { mg.strokeStyle = c; mg.lineWidth = w; mg.lineCap = mg.lineJoin = "round"; mg.beginPath(); pts.forEach(([x, y], i) => i ? mg.lineTo(x, y) : mg.moveTo(x, y)); mg.stroke(); };
  const ci = (x, y, r, c) => { mg.fillStyle = c; mg.beginPath(); mg.arc(x, y, r, 0, 7); mg.fill(); };
  const poly = (pts, c) => { mg.fillStyle = c; mg.beginPath(); pts.forEach(([x, y], i) => i ? mg.lineTo(x, y) : mg.moveTo(x, y)); mg.closePath(); mg.fill(); };
  const wave = (x, y0, y1, a) => { const p = []; for (let y = y1; y >= y0; y -= 8) p.push([x + a * Math.sin(y / 26), y]); return p; };
  const SH = [
    () => { // a noodle bowl with chopsticks and steam
      mg.fillStyle = R; mg.beginPath(); mg.moveTo(270, 205); mg.lineTo(730, 205); mg.bezierCurveTo(725, 330, 610, 372, 500, 372); mg.bezierCurveTo(390, 372, 275, 330, 270, 205); mg.fill();
      rr(255, 190, 490, 26, 13, R); rr(430, 362, 140, 22, 8, R); ln([[300, 214], [700, 214]], 7, Y);
      ln([[600, 196], [830, 70]], 16, R); ln([[630, 198], [860, 96]], 16, R);
      ln(wave(400, 40, 170, 18), 18, B); ln(wave(470, 20, 170, -18), 18, B); ln(wave(540, 50, 170, 18), 18, B); },
    () => { // a shopping bag
      poly([[330, 150], [670, 150], [700, 385], [300, 385]], R); ln([[330, 150], [670, 150]], 8, Y);
      mg.strokeStyle = R; mg.lineWidth = 24; mg.beginPath(); mg.arc(500, 150, 92, Math.PI, 0); mg.stroke();
      ci(420, 190, 9, Y); ci(580, 190, 9, Y); rr(440, 255, 120, 60, 10, B); },
    () => { // the humanoid robot mid-kick, traced from its photo: 128 x 128, run-length coded by row.
      // r = brushed metal, b = highlight, j = black joints and gloves, g = the glowing visor
      const C = {r: S, b: B, j: J, g: G}, N = 128, z = 420 / N, x0 = 290;
      "128.|128.|128.|128.|128.|128.|69.4jr54.|12.j23.b32.r4jr34.4r15.|10.r4j21.b.4r26.8j32.rj2rgr14.|10.6j19.b6rb25.8j32.r2j2rgr13.|10.7j17.j6r4.r5j16.10j30.jgr5g13.|10.8j14.r5j2rb4.r9j12.6jrjr3j26.3j6gb2r11.|11.4j2r2j12.9j6.r8j12.12j25.5j7gjr10.|11.5jr4j3.b3.12j6.2b8j11.9jr3j6.5r12.7j5g3j10.|12.5j2r3jrj2r15j4.3br8j2r9.4j5r3j4.2rb5r11.7j5g3j10.|13.6jr4jr16j3r3b3r7jr6b6.3jr6j2.2r4br3br9.r8j4g3j10.|14.6jr21j3rb5r5j3r8b4.9j4r3b8r7.b2g3j6g4j10.|15.29j8r2br2j3r5b6r9j2rjr2b11r5.r9g6j10.|16.27j10r3brj4r3b3rj3r7j3r2j13rj4.j7gj2.5j10.|17.9j2.17j8r5b10r3b2r3jr3b17r11j6.3j11.|18.7j8.3j2.j4.3j7r7b14r2jr6b15r10j20.|18.7j19.3j6r9b4j4rj3r3j6b16r4jr4j20.|19.5j20.3j6r13b3jrj3rbrjr5b16r9j20.|21.j23.4j4r15bjr8j6b11r2b3r8j20.|46.3j6r15b8jr5b8rbr5br7j21.|46.4j6r15b5jrjr6b6r10b2r3j22.|47.4j5r3br12b3j2r2jr6b3r13br3j22.|47.4j5r17b5rjr6b2r14b2rj23.|48.4j4r17b5r2jr5b2r14b2rj23.|48.5j4rbr2br11b6rjr5b3r11b4rj23.|49.5j6r14b5r2jr5br8b4rb5r22.|50.4j7rbr11b5r2jr2b2rj4b17r20.|51.j2r2j6rj12b5r2jrjrb2r2b3rj2r3j9r20.|52.2j6r3jr11b5r4jr2brb2r3jr4jrb3rb3r20.|52.12j2b3jr5b6r3j6r5j8r3b2j20.|51.2r11j2b3j4rb8r4j5r4j2rb7r3j20.|52.13jr3j14r2j2rb3r3jr3b3rbr2jr2j20.|52.24j7rjrjrb6r4b3r7j20.|53.4jr20j4r4j6r6br2b6j21.|53.4j2r20j4r4j3rb2r3br2b2r6j21.|54.8j3r3jr6j4r2jr6jr2b9r5jr22.|55.6j2r2br8j5r9j2rb7r2jr27.|56.5j2r3br7j5r10jrb3r5j29.|56.4j4r3b8j3r13jr2jrj32.|56.2j7r2br18jr6j35.|57.jrj5r2br17jr2jr3jr35.|57.r2j6rbr16j2.5j37.|58.3j8r11j48.|58.3j6r10jr50.|59.3jr9j56.|59.14j55.|60.5j6r4j53.|61.4j7r3j53.|62.j3r3b4r3j52.|62.2j4rb4r3j52.|63.2jrj7r2j52.|63.4j7r2j52.|63.3j9rj52.|63.2jrj9r52.|64.2j10r52.|64.5rb6r52.|64.6r2b4r52.|64.2j4r3b3r52.|63.rjr7bj2r52.|63.jr8b2j53.|63.2r8b2r53.|64.r8br54.|64.r8br54.|64.r8br54.|64.r8br54.|64.r8br54.|64.2r7b55.|64.2r7b55.|64.3r6b55.|64.5r4b55.|64.7r2b55.|64.7r2b55.|64.7rbr55.|64.9r55.|64.2rj5rb55.|64.r3j4rb55.|64.6j3r55.|63.7j3r55.|63.8jrj55.|63.8jrj55.|63.8jrj55.|63.4j2r4j55.|63.3j5r2j55.|63.3j6rj55.|63.3j7r55.|64.2j5r2j55.|65.7rj55.|64.8rj55.|64.8rj55.|64.8r2j54.|64.8rjr54.|64.10r54.|64.9r55.|65.8r55.|65.8r55.|65.8r55.|65.8r55.|65.8r55.|65.8r55.|65.8r55.|66.7r55.|66.6r56.|67.4rj56.|67.5j56.|67.5j56.|67.4jr56.|67.5j56.|67.5j56.|67.5j56.|67.5j56.|67.5j56.|67.6j55.|67.6j55.|67.6j55.|66.7j55.|66.8j54.|66.7j55.|65.8j55.|65.8j55.|66.5j57.|128.|128.|128.".split("|").forEach((row, gy) => { let gx = 0;
        for (const m of row.matchAll(/(\d*)([.rbjg])/g)) { const n = +(m[1] || 1);
          if (m[2] !== ".") { mg.fillStyle = C[m[2]]; mg.fillRect(x0 + gx * z, gy * z, n * z + .5, z + .5); } gx += n; } }); },
    () => { // game studios: the supplied scene (a rider on a white tiger under a temple roof) as tiles, 118 x 86,
      // run-length coded by row; d = dim, r = mid, b = bright (the tiger and the rider's armour)
      const C = {r: R, b: B, d: D}, N = 118, z = 420 / 86, x0 = 500 - N * z / 2;
      "8d110.|rd.dr5d108.|2r7drd107.|.d3rd.2d2r2d100.d4.|3.2d2rd2.drd105.|5.5d101.3d2rd.|8.2d3.d95.4d.3d.|5.3d101.5d.3d|112.6d|111.4d.2d|d13.d97.5d.|4d10.d88.4d5.5d.|.2d99.6d5.2d2.d|d21.d3.d3.d9.d6.d6.d47.7d.d2.d4.|d18.d5.2d2.2d2.d6.2d.2d2.2d5.2d2.d2.d2.d2.2d5.2d2.2d.2d9.2d2.2d.d3.5d.d.d.d4.|16.d5.d2.2d2.2d2.d2.2d2.2d.2d2.2d2.d2.2d.2d2.d2.rd.2d2.d2.2d2.2d.3d.2d2.d2.2d2.2d7.2d11.|29.2d2.d2.2d2.d2.2d2.d3.d2.2d.2d2.d2.2d.2d2.d3.d2.2d2.2d.6d.2d13.2d9.|17.3d.2d2.2d2.d2.2d2.2d2.d2.2d2.2d2.d2.2d2.d2.d6.d2.2d2.rd.2d2.2d.2d.3d2.2d2.d3.d2.2d.2d9.|18.5d.drd.drd.dr2.rd.drd.2r.drd.dr2.2r.drd.rd.2d.drd.dr2.2r.drd.dr2.rd.dr2.rd2.2d.dr2.2d2.2d8.|2d16.d.drd.drd.drd.2rd.rd.drd.2r2.2r.drd.rd.drd.2d.2r2.rd.drd.2r.drd.2r2.2r.drd.drd.2r.drd.drd.2d8.|2.d18.rd.drd.drd.2r.d2r.2rd.2r.d2r.dr2d2r.drd.dr.drd.2r.drd.2rd.2r.drd.2r.d2r.drd.drd.2r2.rd.d9.|19.2drd.drd.2rd.2r.drd.drd.2r.drd.drd.2r.drd.dr.drd.2r2d2r.2rd.2r.d2r.2rd.2r.d2r.d2r.drd.2rd10.|20.dr2.2rd.2r2d2r.drd.2rd.2r.d2r.2rd.dr.d2r.2r.drd.2r.d2r.2rd.2r2d2r.drd.2r2d2r.d2r.drd.2d11.|20.drd.dr.d2r.d2r.drd.2rd.2r.d2r2drd.2r2.rd.2r.drd.drd.2r.d2r.drd.2r.drd.drd.2rd.2rd.2r2d12.|20.3d.2d.d2r.d2rd2r3dr2.2r2drd.2rd.2r.drd.dr.drd.3r.2r2d2r.drd.drd.2r.d2r.2rd.3d.drd13.|21.2d.2r.d2r.d2r.2rd.2r2drd.drd.drd.2r.drd.dr2d2r.drd.2rd.4d2r.drd.2r2d2r.d2r.drd.2d14.|29.d.3d.10d.drd.drd.4drd.2r2d2r4d.drd.drd.rd.dr6d2r4d.3d.d15.|22.d25.d.d.d8.dr4.r4.d.3d25.d15.|63.r2br51.|53.2d7.d4b51.|53.2r7.r4br50.|54.2r6.d2.d2r50.|55.drd5.2brdr50.|52.r3.dr.d.d5r2d49.|51.2r4.r2b.7r50.|50.2d5.r2bd2.dr.rbr49.|47.d2rd5.d2r2br2.d.r3bd47.|46.3rd7.r4b3rd5br46.|47.r9.2b.5r7b46.|56.5r12b45.|55.2r2.2d2r10bd44.|55.2r4d2r4b2r3b2r44.|54.dr4d.2r2b5r3bd44.|54.6r.dr2b3rd4brd43.|54.5r2.rd2r2brd5bd43.|54.2r.2r2d3r3b2r6b2r41.|54.2r2drd4rb3r2b3r4br33.d2r4.|53.d2r.d2.2rdrbr6br4br32.dr6.|54.2r5.2r4br11br30.2r6.|50.d.d2r5.d2r3br13b38.|43.r5b2r2.r8.d2b2r2b3r8br37.|42.rbr2d2r4.2d5.r2d2br2b3r10b37.|41.rb11.rd4.2r.br2br13b37.|41.bd11.rd.d.2d.3rbr14b27.rd8.|40.2r2.d11.4d2.2rb2r10br3bd26.3d5.r.|38.dr14.5d2.3rbr2br4br7bd27.2r5.2r|6.6d.4d17.drd2r7.d5.5drd.d2rbr2br2br2b2dr4brd26.drd2r3d2r|7.4d2.2d.d16.d4r13.dr3d2r2d5rb2rb5rd6br29.5d2r|7.dr2d3.2d16.5d14.r2d.4rd4r2br7br6bd30.d3r2d|5.d8.3d8.d24.3d2.d2r.2rd.r2br8brbr4b27.d3.r4d|d.d.2d.d.d.d.4d.d.d4.d24.5d.r2d2rd.rb2r4brbrbr2brbrbr11.2d.d.d.d2.d.d.3d4.3d|2.d2.d2.2d8.d6.d28.d3.2r2d.rbr2d2b2r3br10bd21.d6.d.d|3d2.d.3d2.d.2d2.d32.d2.2d.d2r.r.rbr.2r2b2rb6r6br8.d10.d.3d2.d2.d.|d.d.2d.d.d.d2.3d.d.d4.d23.4d.r2d3rdr.rbr.rdr2b3rd4r4b2rd7.2d.d.d.d2.d.d.d.d2.r3d.|d.d.2d.10d.d.d.d2.d22.5d.r2d3rd3rbrd3rb2rb6r4b2r8.2d.d.d.d2.d.d.d.d2.5d|d.d.2d.10d.d.d.d2.d22.5d.3d3rdrbrbrdrdrb7r3b4rd8.2d.d.d4.d.d.d3.6d|d.d.2d.3d.d.4d.d.d4.d22.8d5r.rbrb2d.3b4rdr3b5r8.2d.d.d4.d.d.10d|d.d.2d.d8.d8.d25.d3.d6rdb2rd.r2b3rd2r4br4bd7.2d10.d2.2r.d3.2d|d.d.2d.d.d5.2d.d6.d29.2d9rd.2rb3rd3r5br2br8.d5.d2.d.d4.rd2.2d.|d.d.2d3.d4.d.d8.d29.2d8r.2rd3b5rbr4br2brd7.d4.2d.d2.d9.2d|4.2d3.d15.d30.d6rbr.d3rb5r4brbrd3br7.d12.d6.2d.|d.4d.17d.2d19.d8.2d6r2bd.rd.d5r3b2r3b3r2d5.2d.12d.3d2.d2.|59d7rdr2d9rd2r2b4r5d.23dr|56d2r6dr2d10rd6rb3r28drd|7d.d.46d8r4d2r2d11r3br2d4.25d|d2rd2rd3r3d.2d8.2d24.3d2.3d8r.2drd7r4d9rd13rd2r2d5rd2r|d4rd7r6d4.9d3rd8rd5.d.d4.2d.6r3.d9r3d2rd2r4d.9rd7rdrd3r2dr|12r20d2r2d5rd2rd.4dr6d2r3d4r4d10rd6r6d.3d2rdrd3r2d2rdrdr5d|12r6d7rdr4dr11dr3dr2dr2d2r10dr4d3rd5r2d7r2dr3drdr6dr13dr|r17d5r27drd3r2d9r3drd2rd5r2d2r6d2r17d5r2d3r|12dr7drdr18dr7d.4d2rd9r6dr2d2r12dr12d.d2rd.rb8r|11d2r7dr2dr2d4r21dr2d4rd8r16dr3d3r14d3rd10r|20dr3dr2d3r24d4r2d7r6dr2d2rd4rdr3d3r3d2r11d10rd|20d2r7dr4dr14dr3d4r5d5r7d8r9d5r11d10rd|2d3rd2r5dr2drd3rdr2d2r4d5r14drd5r4d6r8d2rd3r4d2r4d4r10d2rd2rd3rd3r|rdr4dr4drd2r5dr3d2r5d2r19d4r2d8r13d2r10dr9dr2d12rd".split("|").forEach((row, gy) => { let gx = 0;
        for (const m of row.matchAll(/(\d*)([.rbd])/g)) { const n = +(m[1] || 1);
          if (m[2] !== ".") { mg.fillStyle = C[m[2]]; mg.fillRect(x0 + gx * z, gy * z, n * z + .5, z + .5); } gx += n; } }); },
    () => { // an open shipping box, products peeking out, a shipping label
      poly([[420, 160], [455, 52], [775, 52], [740, 160]], R);
      poly([[300, 205], [195, 150], [330, 112], [420, 160]], R);
      poly([[740, 160], [860, 122], [812, 214], [700, 205]], R);
      poly([[300, 205], [420, 160], [740, 160], [620, 205]], Y);
      rr(440, 64, 50, 150, 16, B); rr(452, 40, 26, 30, 6, B);
      rr(512, 96, 100, 110, 10, B); ln([[512, 128], [612, 128]], 7, Y);
      ci(668, 150, 38, B);
      poly([[300, 205], [620, 205], [620, 388], [300, 388]], R);
      poly([[620, 205], [740, 160], [740, 345], [620, 388]], R); ln([[620, 207], [620, 386]], 7, Y);
      rr(336, 280, 160, 80, 8, B); [356, 378, 392, 414, 436, 452, 474].forEach((x, i) => ln([[x, 316], [x, 348]], i % 2 ? 6 : 10, Y));
      ln([[352, 298], [440, 298]], 7, Y); },
    () => { // a factory with a smoking stack
      rr(200, 230, 600, 155, 6, R); poly([[200, 232], [290, 150], [290, 232], [380, 150], [380, 232], [470, 150], [470, 232], [560, 150], [560, 232]], R);
      rr(640, 70, 60, 165, 6, R); [[250, 280], [340, 280], [430, 280], [520, 280]].forEach(([x, y]) => rr(x, y, 52, 40, 6, B)); rr(610, 300, 90, 85, 6, Y);
      ci(690, 45, 26, B); ci(735, 25, 20, B); ci(772, 14, 14, B); },
    () => { // a perfume bottle with an atomizer bulb, a lipstick and a few sparkles
      rr(470, 176, 230, 212, 46, R); rr(552, 140, 66, 42, 8, R); ln([[548, 182], [622, 182]], 7, Y);
      rr(528, 62, 114, 82, 34, R); ln([[540, 102], [630, 102]], 5, Y);
      rr(492, 300, 186, 68, 28, B); ln([[488, 300], [682, 300]], 6, Y); rr(500, 196, 24, 96, 12, B);
      ln([[640, 96], [720, 92], [762, 118]], 9, R); ci(792, 150, 42, R); ln([[792, 190], [800, 236]], 6, R); ci(801, 244, 9, R);
      rr(300, 258, 92, 130, 10, R); ln([[300, 272], [392, 272]], 7, Y); rr(313, 206, 66, 54, 6, R);
      poly([[318, 206], [374, 206], [374, 128], [318, 168]], R); ln([[374, 134], [374, 204]], 5, B);
      [[420, 112, 16], [262, 200, 12], [742, 316, 14], [452, 60, 9]].forEach(([x, y, r]) => { ln([[x - r, y], [x + r, y]], 7, B); ln([[x, y - r], [x, y + r]], 7, B); }); },
    () => { // a double helix
      const a = 92, cy = 228, x0 = 170, x1 = 830, pa = [], pb = [];
      for (let x = x0; x <= x1; x += 6) { pa.push([x, cy + a * Math.sin((x - x0) / 62)]); pb.push([x, cy - a * Math.sin((x - x0) / 62)]); }
      for (let x = x0 + 16; x < x1; x += 44) { const y = a * Math.sin((x - x0) / 62); ln([[x, cy + y], [x, cy - y]], 8, B); }
      ln(pa, 30, R); ln(pb, 30, R); },
    () => { // a sleek electric car, side on: blue body, light glass, graphite tyres on silver rims, glowing light bar
      mg.fillStyle = R; mg.beginPath(); mg.moveTo(140, 300); mg.lineTo(140, 262); mg.bezierCurveTo(142, 244, 170, 236, 210, 232);
      mg.lineTo(300, 224); mg.bezierCurveTo(360, 186, 420, 150, 520, 146); mg.bezierCurveTo(600, 146, 640, 176, 690, 214);
      mg.lineTo(800, 228); mg.bezierCurveTo(846, 236, 866, 252, 868, 276); mg.lineTo(866, 300); mg.closePath(); mg.fill();
      poly([[318, 226], [380, 186], [430, 166], [510, 160], [510, 224]], B); poly([[528, 160], [590, 164], [632, 186], [668, 216], [528, 224]], B);
      ln([[519, 156], [519, 298]], 6, J); ln([[300, 266], [790, 266]], 4, J);
      rr(800, 240, 62, 10, 5, G); rr(142, 250, 30, 9, 4, G);
      [[280, 302], [730, 302]].forEach(([x, y]) => { ci(x, y, 70, Y); ci(x, y, 56, J); ci(x, y, 36, S); ci(x, y, 12, J);
        for (let k = 0; k < 5; k++) { const an = k * Math.PI * 2 / 5; ln([[x + 14 * Math.cos(an), y + 14 * Math.sin(an)], [x + 33 * Math.cos(an), y + 33 * Math.sin(an)]], 5, J); } }); },
    () => { // a container ship
      poly([[150, 300], [860, 300], [820, 378], [195, 378]], R); ln([[160, 318], [850, 318]], 8, Y);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) rr(240 + c * 58, 240 - r * 44, 52, 38, 4, (r + c) % 3 === 1 ? B : R);
      rr(730, 150, 64, 150, 6, R); rr(740, 165, 44, 22, 4, B); ln([[762, 150], [762, 105]], 10, R); },
    () => { // an armchair sofa
      rr(270, 140, 460, 150, 44, R); ln([[500, 160], [500, 270]], 7, Y);
      rr(300, 262, 400, 84, 22, R); ln([[500, 268], [500, 342]], 7, Y); ln([[306, 268], [694, 268]], 7, Y);
      rr(215, 205, 100, 160, 40, R); rr(685, 205, 100, 160, 40, R); ln([[315, 222], [315, 360]], 7, Y); ln([[685, 222], [685, 360]], 7, Y);
      rr(250, 362, 24, 30, 6, R); rr(726, 362, 24, 30, 6, R); }
  ];
  const BB = [];
  function bounds(k){
    if (BB[k]) return BB[k];
    mk.width = 500; mk.height = 210; mg.setTransform(.5, 0, 0, .5, 0, 0); mg.clearRect(0, 0, 1000, 420); SH[k]();
    const d = mg.getImageData(0, 0, 500, 210).data; let x0 = 500, y0 = 210, x1 = 0, y1 = 0;
    for (let y = 0; y < 210; y++) for (let x = 0; x < 500; x++) if (d[(y * 500 + x) * 4 + 3] > 60) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return BB[k] = [x0 * 2, y0 * 2, (x1 - x0 + 1) * 2, (y1 - y0 + 1) * 2];
  }
  // game studios: tiles sampled straight from the photo, each tile its own shade, on a finer grid
  const sceneImg = new Image(); sceneImg.decoding = "async";
  sceneImg.onload = () => { if (cur === 3) { cur = -1; go(3); } };
  ((el, fn) => { if (!el || !("IntersectionObserver" in window)) return fn(); const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, {rootMargin: "1200px 0px"}); io.observe(el); })(document.getElementById("industries"), () => { sceneImg.src = "media/industries/game-studios-bw.jpg"; });
  function sceneCells(){
    // a window on the rider and the tiger, cut to the panel's shape so it fills edge to edge, sharpened so the stripes,
    // armour and face read at tile size, and faded into the navy at the edges instead of ending in a hard rectangle
    const iw = sceneImg.naturalWidth, ih = sceneImg.naturalHeight, ah = Math.round(rows * (W < 640 ? .66 : .8)), SS = 3;
    const sh = Math.min(ih * (W < 640 ? .6 : .8), iw * (W < 640 ? .62 : .8) * ah / cols), sw = sh * cols / ah, sx = Math.max(0, Math.min(iw - sw, iw * .532 - sw / 2)), sy = Math.max(0, Math.min(ih - sh, ih * (W < 640 ? .5 : .54) - sh / 2));
    const X = cols * SS, Y = ah * SS; mk.width = X; mk.height = Y; mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, X, Y); mg.imageSmoothingQuality = "high";
    mg.drawImage(sceneImg, sx, sy, sw, sh, 0, 0, X, Y);
    const d = mg.getImageData(0, 0, X, Y).data, L = new Float32Array(cols * ah);
    for (let r = 0; r < ah; r++) for (let c = 0; c < cols; c++) { let v = 0; for (let y = 0; y < SS; y++) for (let x = 0; x < SS; x++) v += d[((r * SS + y) * X + c * SS + x) * 4]; L[r * cols + c] = v / (SS * SS * 255); }
    const B = new Float32Array(L.length), R = 3;   // a small box blur for the unsharp mask
    for (let r = 0; r < ah; r++) for (let c = 0; c < cols; c++) { let v = 0, n = 0; for (let y = Math.max(0, r - R); y <= Math.min(ah - 1, r + R); y++) for (let x = Math.max(0, c - R); x <= Math.min(cols - 1, c + R); x++) { v += L[y * cols + x]; n++; } B[r * cols + c] = v / n; }
    const px = (x, y) => [Math.round((x - sx) / sw * cols), Math.round((y - sy) / sh * ah)], eyes = [px(iw * .578, ih * .713), px(iw * .619, ih * .725)];
    const fade = (i, n, m) => { const e = Math.min(i, n - 1 - i) / m; return e >= 1 ? 1 : e <= 0 ? 0 : e * e * (3 - 2 * e); };
    const [scx, scy] = px(iw * .55, ih * .55), spot = (c, r) => { const q = Math.hypot((c - scx) / (cols * .62), (r - scy) / (ah * .72)); return q < .62 ? 1 : q > 1 ? .18 : 1 - .82 * ((q - .62) / .38); };   // the rider and tiger stay bright, the courtyard recedes
    const out = [];
    for (let r = 0; r < ah; r++) for (let c = 0; c < cols; c++) {
      const v0 = L[r * cols + c], v = v0 + .5 * (v0 - B[r * cols + c]);   // unsharp: edges and stripes pop
      const w2 = Math.min(1, Math.max(0, (v - .035) / .66)) * fade(c, cols, cols * .07) * fade(r, ah, ah * .1) * spot(c, r);
      if (eyes.some(([ex, ey]) => Math.hypot(c - ex, (r - ey) * 1.6) <= Math.max(1.2, cols / 140))) { out.push({c, r, ty: 7, lum: 1}); continue; }   // the tiger's eyes, the brightest tiles
      if (w2 > .05) out.push({c, r, ty: 7, lum: Math.pow(w2, 1.25)});
    }
    return out;
  }


  // tech: the robot cut out of its photo; each tile keeps the photo's colour, lifted so black joints still show on navy
  const botImg = new Image(); botImg.decoding = "async";
  botImg.onload = () => { if (cur === 2) { cur = -1; go(2); } };
  ((el, fn) => { if (!el || !("IntersectionObserver" in window)) return fn(); const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, {rootMargin: "1200px 0px"}); io.observe(el); })(document.getElementById("industries"), () => { botImg.src = "media/industries/tech-robot-cut.png"; });
  function botCells(){
    // drawn at 3x and read per tile: a tile is a black joint when most of it is dark, so knees, elbows and gloves stay crisp
    const lg = hasSet(2), P = lg ? logoPlan(2) : null, gap = cols < 60 ? 2.5 : 4;   // with brand wordmarks under it, the robot gives up the room they need
    const SS = 3, iw = botImg.naturalWidth, ih = botImg.naturalHeight, ah = lg ? Math.max(rows * .3, Math.min(rows * .77, P.end - P.blockRows - gap - rows * .03)) : rows * .77, f = Math.min(cols * .8 / iw, ah / ih) * SS;
    const w = Math.round(iw * f), h = Math.round(ih * f), X = cols * SS, Y = rows * SS, x0 = Math.round((X - w) / 2), y0 = Math.round(rows * .03 * SS);
    mk.width = X; mk.height = Y; mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, X, Y); mg.imageSmoothingQuality = "high";
    mg.drawImage(botImg, x0, y0, w, h);
    const d = mg.getImageData(0, 0, X, Y).data, out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let n = 0, dark = 0, glow = 0, lum = 0;
      for (let y = 0; y < SS; y++) for (let x = 0; x < SS; x++) {
        const i = ((r * SS + y) * X + c * SS + x) * 4; if (d[i + 3] < 110) continue;
        const R0 = d[i], G0 = d[i + 1], B0 = d[i + 2], l = R0 * .3 + G0 * .59 + B0 * .11; n++;
        if (B0 > R0 + 45 && B0 > 130 && c > cols * .62 && r < rows * .16) glow++; else if (l < 72) dark++; else lum += l;
      }
      if (n < 5) continue;
      let rgb;
      if (glow >= 2) rgb = [70, 205, 255];                         // the visor
      else if (dark > n * .45) rgb = [70, 78, 98];                   // black joints, gloves and feet: the dim end of the ramp
      else { const v = Math.min(1, Math.max(0, (lum / (n - dark) - 80) / 160)); rgb = [Math.round(120 + 128 * v), Math.round(132 + 116 * v), Math.round(156 + 96 * v)]; }   // brushed silver
      out.push({c, r, ty: 8, rgb});
    }
    if (lg) { let lo = 0; out.forEach(t => { if (t.r > lo) lo = t.r; }); out.push(...logoCells(Math.min(lo + gap, P.end - P.blockRows), P)); }
    return out;
  }
  // home and furniture: the brands' own wordmarks laid out under the sofa as fine tiles, the same light blue as the mosaic
  // sectors that carry brand wordmarks as fine tiles under their mosaic: file name and how much of the mark's height to keep
  // (Ligne Roset drops "depuis 1860", too fine for tiles). A sector shows its set once every file has loaded.
  const LOGOSETS = {
    // 2: technology, 7: healthcare, 9: logistics: add [file, 1] pairs once their logo files are in logos/
    10: [["ligne-roset", .79], ["natuzzi", 1], ["boconcept", 1], ["oppein", 1], ["gautier", 1], ["calligaris", 1], ["schmidt", 1]],   // home and furniture
  };
  const SETS = {}; Object.entries(LOGOSETS).forEach(([k, list]) => { SETS[k] = list.map(([n, ch]) => {
    const im = new Image(); im.decoding = "async"; im.ch = ch; im.onload = () => { if (cur === +k && SETS[k].every(x => x.naturalWidth)) { cur = -1; go(+k); } }; im.src = "logos/" + n + ".png"; return im; }); });
  const hasSet = k => !!SETS[k] && SETS[k].every(x => x.naturalWidth);
  function logoPlan(k){   // where the wordmark block goes: sizes, lines, and the caption it has to stay above
    const narrow = cols < 70, sub = Math.max(2, Math.round(cell / (narrow ? 1.75 : 2.1)));
    const H0 = (narrow ? 11 : 21) / (cell / sub);   // the logo's height in fine tiles (about 21px on desktop), balanced by its shape below
    const set = SETS[k], box = set.map(im => { const ar = im.naturalWidth / (im.naturalHeight * im.ch), h = Math.min(H0 * 1.7, Math.max(H0 * .66, H0 * Math.sqrt(4.6 / ar))); return [im, Math.round(h * ar), Math.round(h)]; });
    const gap = Math.round(H0 * (narrow ? 1.1 : 1.6)), n = set.length, per = [], lines = []; for (let m = n; m > 0;) { const q = narrow ? Math.min(m, m === 4 ? 2 : 3) : Math.min(m, Math.ceil(n / Math.ceil(n / 4))); per.push(q); m -= q; } let i = 0; per.forEach(n => { lines.push(box.slice(i, i + n)); i += n; });
    const lh = H0 * 1.25, lg = H0 * (narrow ? .7 : .85), blockH = lines.length * lh + (lines.length - 1) * lg;
    const cap = document.getElementById("inCap"), capRow = cap && cap.offsetHeight ? (cap.getBoundingClientRect().top - cv.getBoundingClientRect().top - (H - rows * cell) / 2) / cell : rows * .8;
    const end = capRow - (narrow ? 1.6 : 2.4);   // the wordmarks always end clear of the sector's caption
    return {narrow, sub, gap, lines, lh, lg, blockRows: blockH / sub, end};
  }
  function logoCells(top, P){
    const {sub, gap, lines, lh, lg} = P, X = cols * sub, Y = rows * sub, SS = 3;
    mk.width = X * SS; mk.height = Y * SS; mg.setTransform(SS, 0, 0, SS, 0, 0); mg.clearRect(0, 0, X, Y); mg.imageSmoothingQuality = "high";
    let y = top * sub;
    lines.forEach(L => { const tw = L.reduce((a, b) => a + b[1], 0) + gap * (L.length - 1); let x = (X - tw) / 2;
      L.forEach(([im, bw, bh]) => { mg.drawImage(im, 0, 0, im.naturalWidth, im.naturalHeight * im.ch, Math.round(x), Math.round(y + (lh - bh) / 2), bw, bh); x += bw + gap; }); y += lh + lg; });
    const d = mg.getImageData(0, 0, X * SS, Y * SS).data, out = [];
    for (let yy = 0; yy < Y; yy++) for (let xx = 0; xx < X; xx++) { let v = 0; for (let q = 0; q < SS; q++) for (let w = 0; w < SS; w++) v += d[((yy * SS + q) * X * SS + xx * SS + w) * 4 + 3];
      if (v > 255 * SS * SS * .42) out.push({c: xx / sub, r: yy / sub, ty: 2, sz: 1 / sub}); }
    return out;
  }
  function cells(k){
    if (k === 2 && botImg.naturalWidth) return botCells();
    if (k === 3) return sceneImg.naturalWidth ? sceneCells() : [];   // the photo loads first; its onload draws it
    const big = k === 2, scene = k === 3;   // the robot and the game scene are traced from photos and need more tiles
    const fu = hasSet(k);   // a sector with its brands: a smaller mosaic, the wordmarks beneath
    const P = fu ? logoPlan(k) : null, sofaTop = rows * (cols < 60 ? .05 : .07), sofaGap = cols < 60 ? 2.5 : 4, room = fu ? Math.max(rows * .16, P.end - P.blockRows - sofaGap - sofaTop) : 0;   // the sofa takes what the logos and caption leave
    const [bx, by, bw, bh] = bounds(k), SS = 3, aw = cols * (scene ? 1 : fu ? .76 : .78), ah = fu ? Math.min(room, rows * (cols < 60 ? .36 : .54)) : rows * (scene ? .8 : big ? .74 : cols < 60 ? .56 : .6), f = Math.min(aw / bw, ah / bh);
    const fx = (cols - bw * f) / 2 - bx * f, fy = (fu ? sofaTop + Math.max(0, (P.end - P.blockRows - sofaGap - sofaTop - ah) * .45) : rows * (scene ? 0 : big ? .04 : cols < 60 ? .1 : .12)) + (ah - bh * f) / 2 - by * f;
    mk.width = cols * SS; mk.height = rows * SS; mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, mk.width, mk.height);
    mg.setTransform(f * SS, 0, 0, f * SS, fx * SS, fy * SS); SH[k]();
    const d = mg.getImageData(0, 0, mk.width, mk.height).data, out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let n = 0, red = 0, yel = 0, blu = 0, joi = 0, glo = 0, sil = 0, dim = 0;
      for (let y = 0; y < SS; y++) for (let x = 0; x < SS; x++) { const i = (((r * SS + y) * cols * SS) + c * SS + x) * 4; if (d[i + 3] > 100) { n++; if (d[i] > 128 && d[i + 1] > 128) yel++; else if (d[i] > 128 && d[i + 2] > 128) glo++; else if (d[i + 1] > 128 && d[i + 2] > 128) sil++; else if (d[i + 2] > 128) blu++; else if (d[i + 1] > 128) joi++; else if (d[i + 2] > 60) dim++; else red++; } }
      if (n >= 5) out.push({c, r, ty: dim > red && dim >= blu ? 6 : glo >= 2 ? 4 : yel > red && yel >= blu ? 1 : sil >= joi && sil >= blu && sil > red ? 5 : joi > red && joi >= blu ? 3 : blu > red ? 2 : 0});
    }
    if (fu) { let lo = 0; out.forEach(t => { if (t.r > lo) lo = t.r; }); out.push(...logoCells(Math.min(lo + sofaGap, P.end - P.blockRows), P)); }   // the wordmarks sit under the sofa, never into the caption
    return out;
  }
  const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  // a change of sector morphs the tiles already on screen into the new picture; nothing restarts from empty
  function go(k, instant){
    if (!cols) return;
    const want = k === 3 ? Math.max(3, Math.round(baseCell * .3)) : k === 2 ? Math.max(4, Math.round(baseCell * .6)) : baseCell;
    if (want !== cell) { const f = cell / want; tiles.forEach(x => { x.c *= f; x.r *= f; x.tc *= f; x.tr *= f; }); cell = want; cols = Math.floor(W / cell); rows = Math.floor(H / cell); }
    const T = cells(k); cur = k; tA = instant ? -1e9 : performance.now();
    T.sort((a, b) => a.c - b.c || a.r - b.r);
    const live = tiles.filter(x => x.out === 0).sort((a, b) => a.tc - b.tc || a.tr - b.tr), next = [];
    T.forEach((d, i) => {
      const src = live.length ? live[Math.floor(i * live.length / T.length)] : null;
      next.push({fc: src ? src.c : d.c + (Math.random() - .5) * 8, fr: src ? src.r : rows + 2 + Math.random() * 6, c: 0, r: 0, tc: d.c, tr: d.r, ty: d.ty, fty: src ? src.ty : d.ty, lum: d.lum, flum: src ? src.lum : d.lum, rgb: d.rgb, frgb: src ? src.rgb : d.rgb, sz: d.sz || 1, j: Math.random(), out: 0, a0: src ? 1 : 0});
    });
    tiles = next; kick();
  }
  // only a real change in the picture's size redraws it (a phone's toolbar sliding in and out on a tap is not one),
  // and then it is redrawn in place, without the opening animation again
  function size(){
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    if (w === W && h === H) return;
    const first = !W;
    dpr = Math.min(2, devicePixelRatio || 1); W = w; H = h;
    baseCell = W < 640 ? 7 : W < 900 ? 8 : 10; cell = cur === 3 ? Math.max(3, Math.round(baseCell * .3)) : cur === 2 ? Math.max(4, Math.round(baseCell * .6)) : baseCell; cols = Math.floor(W / cell); rows = Math.floor(H / cell);
    cv.width = W * dpr; cv.height = H * dpr;
    sc = Math.min(cols / 1000, rows / 420) * .84; ox = (cols - 1000 * sc) / 2; oy = (rows - 420 * sc) / 2 - rows * .06;
    if (cur >= 0 && !PHOTO[cur]) go(cur, !first);
  }
  const COL = [[115, 153, 198], [10, 20, 38], [214, 228, 242], [92, 104, 126], [64, 205, 255], [172, 188, 208], [38, 60, 96]];
  // the palette as a ramp, dim navy blue to body blue to near white: photo-traced sectors (the robot, the tiger) are shaded along it
  const ramp = v => { v = Math.min(1, Math.max(0, v)); const A = [34, 54, 92], M = COL[0], Z = COL[2], [p, q, w] = v < .5 ? [A, M, v * 2] : [M, Z, v * 2 - 1]; return [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w, p[2] + (q[2] - p[2]) * w]; };   // body, dark detail, light, graphite joint, visor glow, brushed metal
  function frame(now){
    if (!W) return;
    const t = RM ? 0 : (now - t0) / 1000, u0 = RM ? 1 : Math.min(1, (now - tA) / 1100);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#0F1B33"; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { const z = .4 + (i % 5) * .15, px = ((i * 97.3 + t * 18 * z) % (W + 40)) - 20, py = (i * 53.7) % H; g.fillStyle = `rgba(164,200,225,${(.04 + z * .05).toFixed(3)})`; g.fillRect(px, py, 2, 2); }
    const gx = (W - cols * cell) / 2, gy = (H - rows * cell) / 2, s = cell - (cell < 5 ? .7 : cell < 7 ? 1 : 1.5);
    for (const x of tiles) {
      const u = ease(Math.min(1, Math.max(0, (u0 * 1.35 - x.j * .35)))) ;
      const c = x.fc + (x.tc - x.fc) * u, r = x.fr + (x.tr - x.fr) * u + (u === 1 && !RM ? Math.sin(t * 1.6 + x.tc * .18) * .12 : 0);
      const a = x.a0 + (1 - x.a0) * u, ty = u > .5 ? x.ty : x.fty;
      if (ty === 8) {   // a robot tile: its photo brightness on the same blue ramp as every other sector, the visor keeps its glow, with a slow sheen
        const q = (u > .5 ? x.rgb : x.frgb) || [170, 186, 206], sh = 10 * Math.max(0, Math.sin(t * 1.3 - x.tc * .07 + x.tr * .03));
        const c3 = q[2] > q[0] + 100 ? COL[4] : ramp((q[0] * .3 + q[1] * .59 + q[2] * .11 - 58) / 190);
        g.globalAlpha = a; g.fillStyle = `rgb(${Math.min(255, c3[0] + sh)},${Math.min(255, c3[1] + sh)},${Math.min(255, c3[2] + sh)})`;
      } else if (ty === 7) {   // a photo tile: its own shade, cool grey from the navy up to near white
        const v = (u > .5 ? x.lum : x.flum) ?? .6, sh = 5 * Math.max(0, Math.sin(t * 1.2 - x.tc * .08)), c3 = ramp(v);
        g.globalAlpha = a; g.fillStyle = `rgb(${Math.round(c3[0] + sh)},${Math.round(c3[1] + sh)},${Math.round(c3[2] + sh)})`;
      } else {
        const base = COL[ty], light = ty === 1 || ty === 4 ? 0 : ty === 3 || ty === 6 ? 8 : (1 - x.tr / rows) * 30 + 22 * Math.max(0, Math.sin(t * 1.2 - x.tc * .12));
        g.globalAlpha = a; g.fillStyle = `rgb(${Math.min(255, base[0] + light)},${Math.min(255, base[1] + light)},${Math.min(255, base[2] + light * .8)})`;
      }
      if (x.sz < 1) { const q = Math.max(1, cell * x.sz - .45); g.fillRect(gx + c * cell, gy + r * cell, q, q); }   // a brand-wordmark tile, on the finer grid
      else if (cell < 5) g.fillRect(gx + c * cell, gy + r * cell, s, s); else { g.beginPath(); g.roundRect(gx + c * cell, gy + r * cell, s, s, Math.min(3, s / 4)); g.fill(); }
    }
    g.globalAlpha = 1;
  }
  function loop(now){ frame(now); if (!RM && (run || now < kickUntil)) requestAnimationFrame(loop); else looping = false; }
  function kick(){ kickUntil = performance.now() + 1800; if (!looping){ looping = true; requestAnimationFrame(loop); } }
  // every sector, tech included, is drawn as a mosaic
  const PHOTO = {};   // every sector is a mosaic; game studios is traced from the supplied scene
  window.inArt = k => {
    Object.entries(PHOTO).forEach(([pk, el]) => el && el.classList.toggle("on", +pk === k));
    if (PHOTO[k]) { cur = k; tiles = []; kick(); return; }
    if (k !== cur) go(k);
  };
  addEventListener("resize", size); addEventListener("inresize", () => { if (cv.clientWidth !== W || cv.clientHeight !== H) size(); }); size(); window.inArt(typeof inK === "number" ? inK : 0);
  new IntersectionObserver(es => es.forEach(e => { run = e.isIntersecting; if (run) kick(); })).observe(cv);
})();

/* the portal run: sign in, type each field, attach the plan, press submit, receipt */
(function ptInit(){
  const win = document.getElementById("ptWin"); if (!win) return;
  const cur = document.getElementById("ptCur"), steps = [...document.querySelectorAll("#ptSteps li")], fs = [...win.querySelectorAll(".ptf")], btn = document.getElementById("ptBtn"), toast = document.getElementById("ptToast");
  let timers = [], on = false;
  const at = (ms, f) => timers.push(setTimeout(f, ms));
  const step = k => steps.forEach((li, i) => li.classList.toggle("on", i === k));
  const aim = el => { if (!el) return; const r = el.getBoundingClientRect(), w = win.getBoundingClientRect(), fld = el.classList.contains("ptf"); cur.style.transform = fld ? `translate(${r.right - w.left - 74}px,${r.top - w.top + r.height - 16}px)` : `translate(${r.left - w.left + Math.min(r.width - 20, 60)}px,${r.top - w.top + r.height / 2}px)`; };   // on a field she points at its right end, clear of the text she types
  function reset(){ timers.forEach(clearTimeout); timers = []; win.className = "ptwin"; fs.forEach(f => { f.classList.remove("on", "done", "ask"); const v = f.querySelector(".ptv"); if (v) v.textContent = ""; }); toast.classList.remove("on"); step(-1); }
  function type(f, t0){ const v = f.querySelector(".ptv"), txt = v ? v.dataset.v : ""; at(t0, () => { fs.forEach(x => x.classList.remove("on")); f.classList.add("on"); aim(f); });
    if (v) for (let i = 1; i <= txt.length; i++) at(t0 + 300 + i * 34, () => { v.textContent = txt.slice(0, i); });
    return t0 + 300 + txt.length * 34 + 250; }
  function run(){
    reset(); if (RM){ win.classList.add("s1"); fs.forEach(f => { const v = f.querySelector(".ptv"); if (v) v.textContent = v.dataset.v; f.classList.add("done", "ask"); }); toast.classList.add("on"); step(3); return; }
    step(0); at(500, () => win.classList.add("s1"));
    let t = 1400; at(t - 200, () => step(1));
    // the hours come from the owner's answer in Chinese: her WeChat reply shows first, then the field fills in English
    fs.forEach(f => { if (f.classList.contains("ptzh")) { const t1 = t; at(t1, () => { fs.forEach(x => x.classList.remove("on")); f.classList.add("ask"); aim(f); }); t += 1200; } t = type(f, t); at(t - 50, () => { f.classList.remove("on"); f.classList.add("done"); }); });
    at(t + 200, () => { step(2); aim(btn); }); at(t + 900, () => { btn.classList.add("press"); setTimeout(() => btn.classList.remove("press"), 180); });
    at(t + 1150, () => win.classList.add("s2")); at(t + 1300, () => toast.classList.add("on")); at(t + 2600, () => step(3)); at(t + 6200, () => { if (on) run(); });
  }
  new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !on){ on = true; run(); } else if (!e.isIntersecting && on){ on = false; reset(); } }), {threshold: .35}).observe(win);
})();

(function bindXp(){
  const art = document.getElementById("xpArt"); if (!art) return;
  const sec = document.getElementById("experts");
  ["contextmenu", "dragstart", "copy"].forEach(ev => sec.addEventListener(ev, e => e.preventDefault()));
})();

const AGG = [[["United States", "美国"], [["CBP", "CBP", "U.S. Customs and Border Protection", "美国海关与边境保护局", "Customs, tariffs, forced-labor checks", "报关、关税、强迫劳动审查", "p"], ["FDA", "FDA", "Food and Drug Administration", "美国食品药品监督管理局", "Food, cosmetics, devices", "食品、化妆品、医疗器械", "f"], ["FCC", "FCC", "Federal Communications Commission", "美国联邦通信委员会", "Radios and electronics", "无线电与电子产品", "p"], ["CPSC", "CPSC", "Consumer Product Safety Commission", "美国消费品安全委员会", "Product certificates and eFiling", "产品合规证书与电子申报", "f"], ["FTC", "FTC", "Federal Trade Commission", "美国联邦贸易委员会", "Advertising, reviews and data", "广告、评价与数据", "m"], ["State and local", "州与地方", "State, county and city offices", "州、县、市政府部门", "Registration, health, building, fire", "公司登记、卫生、建筑、消防", "f"], ["USDA", "USDA", "Department of Agriculture", "美国农业部", "Plants, animals, organic", "动植物产品、有机认证", "f"], ["EPA", "EPA", "Environmental Protection Agency", "美国环境保护署", "Chemicals and pesticides", "化学品与农药", "f"], ["TTB", "TTB", "Alcohol and Tobacco Tax and Trade Bureau", "美国酒类和烟草税务贸易局", "Alcohol permits and labels", "酒类许可与标签", "f"], ["CFIUS", "CFIUS", "Committee on Foreign Investment in the U.S.", "美国外国投资委员会", "Foreign investment review", "外国投资审查", "p"], ["BIS", "BIS", "Bureau of Industry and Security", "美国商务部工业与安全局", "Export controls", "出口管制", "m"], ["OFAC", "OFAC", "Office of Foreign Assets Control", "美国财政部海外资产控制办公室", "Sanctions screening", "制裁筛查", "m"], ["USPTO", "USPTO", "Patent and Trademark Office", "美国专利商标局", "Trademarks", "商标", "p"], ["USCIS", "USCIS", "Citizenship and Immigration Services", "美国公民及移民服务局", "Visas for your team", "员工签证", "p"], ["SEC", "SEC", "Securities and Exchange Commission", "美国证券交易委员会", "Securities offerings", "证券发行", "p"], ["IRS", "IRS", "Internal Revenue Service", "美国国税局", "Employer ID (EIN) and federal tax", "雇主识别号（EIN）与联邦税务", "f"], ["DOL", "DOL", "Department of Labor", "美国劳工部", "Wages, hours and hiring rules", "工资、工时与雇佣规则", "m"], ["OSHA", "OSHA", "Occupational Safety and Health Administration", "职业安全与健康管理局", "Workplace safety", "工作场所安全", "m"], ["FinCEN", "FinCEN", "Financial Crimes Enforcement Network", "金融犯罪执法局", "Beneficial ownership reporting", "受益所有人申报", "m"], ["USTR", "USTR", "Office of the U.S. Trade Representative", "美国贸易代表办公室", "Section 301 tariffs and exclusions", "301 关税与豁免", "m"], ["NHTSA", "NHTSA", "National Highway Traffic Safety Administration", "国家公路交通安全管理局", "Vehicles and vehicle equipment", "汽车与汽车配件", "m"]]], [["Canada", "加拿大"], [["CBSA", "CBSA", "Canada Border Services Agency", "加拿大边境服务局", "Customs and duties", "海关与关税", "p"], ["CFIA", "CFIA", "Canadian Food Inspection Agency", "加拿大食品检验局", "Food licences, plants, animals", "食品许可与动植物", "f"], ["Health Canada", "加拿大卫生部", "Federal health department", "联邦卫生部门", "Cosmetics, health and consumer products", "化妆品、健康产品与消费品", "f"], ["ISED", "ISED", "Innovation, Science and Economic Development Canada", "加拿大创新、科学及经济发展部", "Foreign investment review", "外国投资审查", "p"], ["Competition Bureau", "加拿大竞争局", "Competition Bureau Canada", "加拿大竞争局", "Advertising and labeling", "广告与标签", "m"], ["CRA", "CRA", "Canada Revenue Agency", "加拿大税务局", "Business number, GST/HST, import account", "企业编号、GST/HST、进口账户", "f"], ["IRCC", "IRCC", "Immigration, Refugees and Citizenship Canada", "加拿大移民、难民与公民部", "Work permits for your team", "团队工作许可", "p"], ["CIPO", "CIPO", "Canadian Intellectual Property Office", "加拿大知识产权局", "Trademarks", "商标", "p"], ["ECCC", "ECCC", "Environment and Climate Change Canada", "加拿大环境与气候变化部", "Chemicals and new substances", "化学品与新物质", "m"], ["Transport Canada", "加拿大交通部", "Transport Canada", "加拿大交通部", "Vehicles, tires and child seats", "汽车、轮胎与儿童座椅", "m"], ["GAC", "GAC", "Global Affairs Canada", "加拿大全球事务部", "Import and export permits, sanctions", "进出口许可与制裁", "m"]]], [["Mexico", "墨西哥"], [["ANAM", "ANAM", "National Customs Agency", "墨西哥国家海关署", "Customs", "海关", "p"], ["COFEPRIS", "COFEPRIS", "Federal Commission for Protection against Sanitary Risks", "墨西哥联邦卫生风险保护委员会", "Health, food, cosmetics", "卫生、食品与化妆品", "p"], ["SE", "SE", "Secretariat of Economy", "墨西哥经济部", "Foreign investment, product standards", "外国投资与产品标准", "p"], ["IMPI", "IMPI", "Mexican Institute of Industrial Property", "墨西哥工业产权局", "Trademarks", "商标", "p"], ["PROFECO", "PROFECO", "Federal Consumer Protection Agency", "墨西哥联邦消费者保护署", "Consumer protection and labeling", "消费者保护与标签", "m"], ["SAT", "SAT", "Tax Administration Service", "墨西哥税务局", "Tax ID (RFC) and importer registry", "税号（RFC）与进口商登记", "p"], ["SENASICA", "SENASICA", "National Service for Agri-Food Health, Safety and Quality", "国家农业食品卫生、安全与质量服务局", "Plant and animal imports", "动植物进口", "p"], ["IMSS", "IMSS", "Mexican Social Security Institute", "墨西哥社会保障局", "Employer registration", "雇主登记", "p"], ["SEMARNAT", "SEMARNAT", "Secretariat of Environment and Natural Resources", "环境与自然资源部", "Environmental permits", "环境许可", "m"], ["INM", "INM", "National Migration Institute", "国家移民局", "Visas and work permits", "签证与工作许可", "p"]]], [["Europe", "欧洲"], [["EC", "EC", "European Commission", "欧盟委员会", "AI, digital and competition rules", "人工智能、数字与竞争规则", "m"], ["EMA", "EMA", "European Medicines Agency", "欧洲药品管理局", "Medicines", "药品", "p"], ["EFSA", "EFSA", "European Food Safety Authority", "欧洲食品安全局", "Food safety", "食品安全", "m"], ["ECHA", "ECHA", "European Chemicals Agency", "欧洲化学品管理局", "REACH and chemical registration", "REACH 与化学品注册", "m"], ["EUIPO", "EUIPO", "EU Intellectual Property Office", "欧盟知识产权局", "EU trademarks and designs", "欧盟商标与外观设计", "p"], ["DG TAXUD", "DG TAXUD", "EU customs union (national customs authorities)", "欧盟关税同盟（各国海关）", "Customs, EORI number, duties", "海关、EORI 号码与关税", "p"], ["Notified bodies", "公告机构", "EU notified bodies", "欧盟公告机构", "CE marking for regulated products", "受监管产品的 CE 认证", "p"], ["DPAs", "数据保护机构", "National data protection authorities", "各国数据保护机构", "GDPR", "GDPR", "m"], ["EU AI Office", "欧盟人工智能办公室", "European AI Office", "欧盟人工智能办公室", "AI Act obligations", "《人工智能法案》义务", "m"]]], [["United Kingdom", "英国"], [["Companies House", "英国公司注册处", "Companies House", "英国公司注册处", "Company registration", "公司注册", "f"], ["HMRC", "HMRC", "HM Revenue and Customs", "英国税务海关总署", "Customs, VAT and EORI", "海关、增值税与 EORI", "p"], ["FSA", "FSA", "Food Standards Agency", "英国食品标准局", "Food business registration and safety", "食品经营登记与安全", "p"], ["MHRA", "MHRA", "Medicines and Healthcare products Regulatory Agency", "药品和保健产品监管局", "Medicines and medical devices", "药品与医疗器械", "p"], ["OPSS", "OPSS", "Office for Product Safety and Standards", "产品安全与标准办公室", "Product safety and UKCA marking", "产品安全与 UKCA 标志", "m"], ["ICO", "ICO", "Information Commissioner's Office", "信息专员办公室", "Data protection", "数据保护", "m"], ["UKIPO", "UKIPO", "UK Intellectual Property Office", "英国知识产权局", "Trademarks", "商标", "p"]]], [["China", "中国"], [["SAMR", "市场监管总局", "State Administration for Market Regulation", "国家市场监督管理总局", "Company registration, standards, food business", "企业登记、标准与食品经营", "p"], ["GACC", "海关总署", "General Administration of Customs", "海关总署", "Imports, exporter and food facility registration", "进出口与境外食品企业注册", "p"], ["NMPA", "药监局", "National Medical Products Administration", "国家药品监督管理局", "Drugs, cosmetics, devices", "药品、化妆品与医疗器械", "p"], ["CNIPA", "知识产权局", "China National Intellectual Property Administration", "国家知识产权局", "Trademarks and patents", "商标与专利", "p"], ["MOFCOM", "商务部", "Ministry of Commerce", "商务部", "Foreign investment and trade", "外商投资与贸易", "m"], ["CAC", "网信办", "Cyberspace Administration of China", "国家互联网信息办公室", "Data and cross-border transfers", "数据与跨境传输", "m"]]], [["Japan", "日本"], [["MHLW", "厚生劳动省", "Ministry of Health, Labour and Welfare", "厚生劳动省", "Food imports, drugs, cosmetics", "食品进口、药品与化妆品", "p"], ["Japan Customs", "日本海关", "Japan Customs", "日本海关", "Imports and duties", "进口与关税", "p"], ["METI", "经济产业省", "Ministry of Economy, Trade and Industry", "经济产业省", "Product safety marks and trade", "产品安全标志与贸易", "m"], ["JPO", "JPO", "Japan Patent Office", "日本特许厅", "Trademarks", "商标", "p"], ["PPC", "PPC", "Personal Information Protection Commission", "个人信息保护委员会", "Data protection", "数据保护", "m"]]], [["Singapore", "新加坡"], [["ACRA", "ACRA", "Accounting and Corporate Regulatory Authority", "会计与企业管制局", "Company registration", "公司注册", "p"], ["SFA", "SFA", "Singapore Food Agency", "新加坡食品局", "Food licences and imports", "食品执照与进口", "p"], ["HSA", "HSA", "Health Sciences Authority", "卫生科学局", "Health products and cosmetics", "健康产品与化妆品", "p"], ["Singapore Customs", "新加坡海关", "Singapore Customs", "新加坡海关", "Imports, permits and GST", "进口、许可与消费税", "p"]]]];
let agSel = 0, agAll = false;
const AGTOP_DESK = 3;   // first tile spans two cells, so three fill one row of four; "See all" opens the rest (land95: one row, was two)
const AGTOP = matchMedia("(max-width: 767px)").matches ? 3 : AGTOP_DESK;   // phones: the wide first tile and two more, then "See all"
// each region tab also points the map: the US map for the United States, the world map zoomed to the country otherwise
const AGMAP = ["us", "CA", "MX", "EU", "GB", "CN", "JP", "SG"], EUK = ["FR", "DE", "IT", "ES", "PL", "NL", "BE", "AT", "PT", "SE"];
function agSyncMap(){
  if (!mSvg) return;
  const key = AGMAP[agSel]; if (!key) return;
  if (key === "us") { if (mView !== "us") { mView = "us"; mSel = null; renderMap(); } else selectMarket(null); return; }
  if (mView !== "world") { mView = "world"; mSel = null; renderMap(); }
  if (key !== "EU") { selectMarket(key); return; }
  selectMarket(null);
  const its = (mSvg._items || []).filter(x => EUK.includes(x.key) && x.d); if (!its.length) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; its.forEach(it => { const q = bigBox(it.d); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); });
  const full = FULLVB(), asp = full[2] / full[3]; let w = (x1 - x0) * 1.35, h = (y1 - y0) * 1.35; if (w / h < asp) w = h * asp; else h = w / asp;
  zoomTo([(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h]);
}
const agWide = matchMedia("(min-width:1024px)");
// wide screens: the window sits on the right; narrower: it opens right beneath the selected region
// the legend sits under the region list on wide screens and inside the card otherwise
function placeAg(){ if (!document.getElementById("agTabs")) return; const mapEl = document.getElementById("agMap"), mapHome = agWide.matches ? document.getElementById("agRight") : document.querySelector(".agleft"); if (mapEl && mapEl.parentNode !== mapHome) { mapHome.prepend(mapEl); }   /* land96: the heading sits in the fold's summary, so the map leads its own column */
  const card = document.getElementById("agCard"), home = document.getElementById("agRight"), btn = document.getElementById("agTab" + agSel), key = document.getElementById("agKey");
  const keyHome = agWide.matches ? document.querySelector(".agleft") : card; if (key.parentNode !== keyHome) keyHome.appendChild(key);
  if (agWide.matches || !btn) { if (card.parentNode !== home) home.appendChild(card); } else if (btn.nextElementSibling !== card) btn.after(card); }
function renderAg(swap){
  if (!document.getElementById("agTabs")) return;   // the agencies are on /more.html
  const i = L(), g = AGG[agSel], tabs = document.getElementById("agTabs"), win = document.getElementById("agWin");
  document.getElementById("agRight").appendChild(document.getElementById("agCard"));
  tabs.innerHTML = AGG.map((r, k) => `<button type="button" class="agb" role="tab" id="agTab${k}" aria-selected="${k === agSel}" aria-controls="agWin" tabindex="${k === agSel ? 0 : -1}"><span>${r[0][i]}</span><small>${r[1].length}</small></button>`).join("");
  const cnt = ["f", "p", "m"].map(x => [x, g[1].filter(a => a[6] === x).length]).filter(x => x[1]);
  win.setAttribute("aria-labelledby", "agTab" + agSel);
  win.innerHTML = `<div class="agwh"><p><b>${g[0][i]}</b><span>${t("agy.n").replace("{n}", g[1].length)}</span></p><p class="agws">${cnt.map(([x, n]) => `<em class="agt agt-${x}">${t("agy.t" + x)}<b>${n}</b></em>`).join("")}</p></div>` +
    `<ul class="agi">${(agAll ? g[1] : g[1].slice(0, AGTOP)).map((a, k) => `<li class="agk-${a[6]}" style="--d:${k * 22}ms"><div class="agh"><b>${a[i]}</b><em class="agt agt-${a[6]}">${t("agy.t" + a[6])}</em></div><small>${a[2 + i]}</small><span>${a[4 + i]}</span></li>`).join("")}</ul>` + (g[1].length > AGTOP ? `<button type="button" class="agmore" id="agMore" aria-expanded="${agAll}">${agAll ? t("agy.less") : t("agy.all").replace("{n}", g[1].length).replace("{r}", g[0][i])}</button>` : "");
  placeAg();
  if (swap && !RM) { win.classList.remove("sw"); void win.offsetWidth; win.classList.add("sw"); }
}
document.getElementById("agWin")?.addEventListener("click", e => { if (!e.target.closest("#agMore")) return; agAll = !agAll; renderAg(false); track("agencies_all", {region: agSel, open: agAll}); });
document.getElementById("agTabs")?.addEventListener("click", e => { const b = e.target.closest(".agb"); if (!b) return; const k = +b.id.slice(5); if (k === agSel) return; agSel = k; agAll = false; renderAg(true); agSyncMap(); document.getElementById("agTab" + k).focus({preventScroll: true}); });
document.getElementById("agTabs")?.addEventListener("keydown", e => { const d = {ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1}[e.key]; if (!d || !e.target.closest(".agb")) return; e.preventDefault(); agSel = (agSel + d + AGG.length) % AGG.length; agAll = false; renderAg(true); agSyncMap(); document.getElementById("agTab" + agSel).focus(); });
agWide.addEventListener("change", placeAg);
const cntDone = new WeakSet();
function runCount(el){
  if (cntDone.has(el)) return; cntDone.add(el);
  const to = +el.dataset.to, fmt = n => Math.round(n).toLocaleString("en-US");
  if (RM){ el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = to > 1000 ? 1800 : 1200;
  const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * e); if (k < 1) requestAnimationFrame(step); };
  el.textContent = "0"; requestAnimationFrame(step);
}
const cntIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ runCount(e.target); cntIO.unobserve(e.target); } }), {threshold:.6});
function bindCounters(){ document.querySelectorAll(".ox .cnt").forEach(el => { if (!cntDone.has(el)) cntIO.observe(el); }); }

function renderOld(){ document.querySelectorAll(".ox .cnt").forEach(el => { el.textContent = (+el.dataset.to).toLocaleString("en-US"); }); renderBefore(); renderRot(); renderAddRow(false); renderFrRow(false); renderInd(); renderDash(); renderXp(); renderAg(false); }
if (document.getElementById("itl")) new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) document.getElementById("itl").classList.add("itl-on"); }), {threshold:.25}).observe(document.getElementById("itl"));
new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting && !aRunning && !RM){ aRunning = true; addCycle(); }
  if (!e.isIntersecting && aRunning){ aRunning = false; clearTimeout(aTimer); }
}), {threshold:.3}).observe(document.getElementById("abox") || document.body);
if (RM && document.getElementById("newRow")){ document.getElementById("newRow").classList.add("open"); }
new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting && !fDone){ fDone = true; o.disconnect(); if (RM) { document.getElementById("frNew").classList.add("open"); renderFrRow(false); } else renderFrRow(true); } }), {threshold:.4}).observe(document.getElementById("frBox"));
addEventListener("resize", fitTable);
applyAll(); fitTable(); bindCounters(); setPlay(vPlaying); onScroll(); requestAnimationFrame(vLoop); updateResume(); startScene(); renderMap();
(function signedIn(){
  // Someone already signed in to the app on this site sees "Open app" instead of "Log in".
  try {
    const s = JSON.parse(localStorage.getItem("sb-esquxzcfsylffuijvzec-auth-token") || "null");
    if (!s || !s.refresh_token) return;
    document.querySelectorAll('a[href="/app/"][data-i18n="nav.login"]').forEach(a => { a.dataset.i18n = "nav.app"; a.textContent = t("nav.app"); });
  } catch(e){}
})();
(function featurePlay(){
  document.querySelectorAll(".fcard").forEach(card => {
    const steps = [...card.querySelectorAll("[data-st]")], bar = card.querySelector(".fprog i"), chips = card.querySelectorAll(".fchips li").length;
    if (!steps.length) return;
    const show = n => { steps.forEach((el, k) => el.classList.toggle("on", k < n)); if (bar && chips) bar.style.width = Math.min(100, 100 * Math.min(n, chips) / chips) + "%"; };
    if (bar && !chips) bar.style.width = "37.5%";   // how it works: 3 of the plan's 8 requirements approved
    if (RM) { show(steps.length); return; }
    let k = 0, seen = false, t = 0;
    // how it works and your newest teammate: never a blank panel; everything but the toast and the button press is drawn before it scrolls in
    if (card.closest("#how, #teammate")) { const first = steps.findIndex(el => el.classList.contains("ftoast") || el.dataset.fx); k = first < 0 ? steps.length : first; show(k); }
    const tick = () => {
      if (!seen) { t = setTimeout(tick, 400); return; }
      if (k < steps.length) { k++; show(k); t = setTimeout(tick, Number(steps[Math.min(k, steps.length - 1)].dataset.ms) || 600); }
      // once played, the card stays complete: never blank again
    };
    new IntersectionObserver(es => { seen = es.some(e => e.isIntersecting); }, {threshold: .35}).observe(card);
    tick();
  });
})();
(function agentLog(){
  const items = [...document.querySelectorAll("#agLog li")]; if (!items.length) return;
  if (RM) { items.forEach(li => li.classList.add("on")); return; }
  const START = 3; let k = START, seen = false;
  items.slice(0, START).forEach(li => li.classList.add("on"));
  new IntersectionObserver(es => { seen = es.some(e => e.isIntersecting); }, {threshold: .2}).observe(document.getElementById("agLog"));
  setInterval(() => {
    if (!seen) return;
    if (k < items.length) items[k++].classList.add("on");
    else if (k++ > items.length + 3) { items.slice(START).forEach(li => li.classList.remove("on")); k = START; }
  }, 1100);
})();
/* land96:js (Oct 23): the comparison above the price cards. When a visitor has typed a city (the hero box, or the plan
   request they started), the expediter's range sits next to Placetta's price for a restaurant there, from Placetta's own
   registry plan (npm run landing:cities writes CITY_PRICES). A city we haven't counted gets no number, only the promise
   of the free preview. The calculator is the store plan and $149 licenses (outcome pricing, 2026-10-28). The value calculator (c96v) uses only the
   visitor's own rent, sales and weeks sooner, and the chain math only the PermitPlace range: no averages, no promised dates. */
/* city-prices */
const CITY_PRICES = {"New York City":{"n":7,"c":1,"usd":2042},"Los Angeles":{"n":7,"c":2,"usd":3041},"Houston":{"n":8,"c":2,"usd":3190},"San Francisco":{"n":10,"c":2,"usd":3488},"San Jose":{"n":9,"c":2,"usd":3339},"Chicago":{"n":5,"c":2,"usd":2743},"Seattle":{"n":6,"c":2,"usd":2892},"Boston":{"n":8,"c":2,"usd":3190},"Miami":{"n":8,"c":1,"usd":2191},"Dallas":{"n":9,"c":2,"usd":3339},"Austin":{"n":8,"c":2,"usd":3190},"Washington, DC":{"n":5,"c":2,"usd":2743},"Atlanta":{"n":5,"c":2,"usd":2743},"Philadelphia":{"n":7,"c":2,"usd":3041},"Las Vegas":{"n":6,"c":2,"usd":2892},"Irvine":{"n":7,"c":2,"usd":3041},"Phoenix":{"n":4,"c":2,"usd":2594},"Jersey City":{"n":6,"c":1,"usd":1893},"Cupertino":{"n":7,"c":2,"usd":3041},"Milpitas":{"n":7,"c":2,"usd":3041},"Daly City":{"n":7,"c":2,"usd":3041}};
/* /city-prices */
(function c96(){
  const you = document.getElementById("c96You"); if (!you) return;
  const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  // names people type for the cities CITY_PRICES counts, English and Chinese
  const ALIAS = {"nyc": "New York City", "new york": "New York City", "new york ny": "New York City", "manhattan": "New York City", "brooklyn": "New York City", "queens": "New York City", "flushing": "New York City", "纽约": "New York City", "纽约市": "New York City",
    "la": "Los Angeles", "los angeles ca": "Los Angeles", "洛杉矶": "Los Angeles", "加州洛杉矶": "Los Angeles", "sf": "San Francisco", "san francisco ca": "San Francisco", "旧金山": "San Francisco",
    "san jose": "San Jose", "san jose ca": "San Jose", "圣何塞": "San Jose", "加州圣何塞": "San Jose", "houston tx": "Houston", "休斯顿": "Houston", "得州休斯顿": "Houston",
    "chicago il": "Chicago", "芝加哥": "Chicago", "seattle wa": "Seattle", "西雅图": "Seattle", "华盛顿州西雅图": "Seattle", "boston ma": "Boston", "波士顿": "Boston", "miami fl": "Miami", "迈阿密": "Miami",
    "dallas tx": "Dallas", "达拉斯": "Dallas", "austin tx": "Austin", "奥斯汀": "Austin", "dc": "Washington, DC", "washington dc": "Washington, DC", "washington d c": "Washington, DC", "华盛顿特区": "Washington, DC",
    "atlanta ga": "Atlanta", "亚特兰大": "Atlanta", "philadelphia pa": "Philadelphia", "费城": "Philadelphia", "irvine ca": "Irvine", "尔湾": "Irvine", "phoenix az": "Phoenix", "凤凰城": "Phoenix",
    "jersey city nj": "Jersey City", "泽西市": "Jersey City", "cupertino ca": "Cupertino", "库比蒂诺": "Cupertino", "milpitas ca": "Milpitas", "米尔皮塔斯": "Milpitas", "daly city ca": "Daly City", "戴利城": "Daly City"};
  const BYKEY = {}; Object.keys(CITY_PRICES).forEach(c => { BYKEY[fold(c)] = c; });
  function cityOf(typed){
    const f = fold(typed); if (!f) return null;
    const hit = BYKEY[f] || ALIAS[f] || BYKEY[f.replace(/ (ca|tx|ny|wa|il|ma|fl|ga|pa|az|nj|dc)$/, "")] || ALIAS[f.replace(/ (ca|tx|ny|wa|il|ma|fl|ga|pa|az|nj|dc)$/, "")];
    return hit && CITY_PRICES[hit] ? hit : null;
  }
  const usd = n => lang === "zh" ? Math.round(n).toLocaleString("en-US") + " 美元" : "$" + Math.round(n).toLocaleString("en-US");
  const fill = (k, o) => Object.keys(o).reduce((s, x) => s.split("{" + x + "}").join(o[x]), t(k));
  const hero = document.getElementById("st-hero");
  // what the visitor typed: the hero box while it holds text, otherwise the market of the plan request they started
  const typed = () => { const v = hero && hero.value.trim(); if (v) return v; try { return (typeof Q === "object" && Q.market && Q.market !== "Several markets") ? (typeof marketLabel === "function" ? marketLabel() : Q.market) : ""; } catch(e){ return ""; } };
  let lastCity = "";
  function paintYou(){
    const raw = typed(), c = cityOf(raw), L1 = document.getElementById("c96YouL"), V = document.getElementById("c96YouV"), S = document.getElementById("c96YouS");
    if (!raw){ L1.textContent = t("c96.typl"); V.textContent = t("c96.typv"); S.textContent = t("c96.typs"); you.classList.remove("mine"); return; }
    const shown = esc(raw.slice(0, 40));
    L1.innerHTML = fill("c96.you", {city: shown});
    if (c){ const p = CITY_PRICES[c]; V.textContent = fill("c96.youv", {n: p.n + p.c, usd: usd(p.usd)}); S.innerHTML = fill("c96.yous", {a: p.n, b: p.c, city: shown}); }
    else { V.textContent = t("c96.none"); S.innerHTML = fill("c96.nones", {city: shown}); }
    you.classList.add("mine");
    if (c !== lastCity){ lastCity = c; track("compare_city", {matched: !!c}); }
  }
  const sIn = document.getElementById("cmpS"), lIn = document.getElementById("cmpL"), outS = document.getElementById("cmpOutS");
  const num = (el, lo, hi, d) => { const n = Math.floor(+el.value); return Number.isFinite(n) && el.value !== "" ? Math.min(hi, Math.max(lo, n)) : d; };
  const $ = id => document.getElementById(id);
  const signed = n => (n < 0 ? "−" : "") + usd(Math.abs(n));
  const range = (lo, hi) => lang === "zh" ? Math.round(lo).toLocaleString("en-US") + " 至 " + Math.round(hi).toLocaleString("en-US") + " 美元" : usd(lo) + " to " + usd(hi);
  // the plan the license field was filled from: the visitor's city, or the typical San José restaurant (9 at $149, 2 at $999)
  const TYPICAL = {n: 9, c: 2};
  let mix = TYPICAL, lTouched = false;
  /* Placetta's price for the year: stores on the plan, plus the licenses (each store's counted mix while the field holds it) */
  function price(){
    const s = num(sIn, 1, 999, 1), l = num(lIn, 0, 9999, 0), chain = s >= 10;
    const exact = !lTouched && mix && l === (mix.n + mix.c) * s;
    const lic = chain ? 0 : exact ? s * (mix.n * 149 + mix.c * 999) : l * 149;
    const st = s === 1 ? t("c96.st1") : fill("c96.stn", {n: s});
    const note = chain ? fill("c96.outc", {s}) : exact ? fill("c96.outx", {s: st, a: mix.n * s, b: mix.c * s}) : fill("c96.outs", {s: st, l});
    return {s, total: s * 149 * 12 + lic, from: !chain && !!l && !exact, note};
  }
  /* the value calculator: the visitor's own rent, sales and weeks sooner. Nothing here is a Placetta claim or an average. */
  const vR = $("vRent"), vS = $("vSales"), vW = $("vW");
  const amt = el => { const d = String(el.value).replace(/[^\d]/g, "").slice(0, 9); return d ? +d : 0; };
  const weeks = w => t("c96.w" + w);
  function paintValue(P){
    const s = P.s, rentM = amt(vR), sales = amt(vS), w = Math.min(8, Math.max(1, +vW.value || 2));
    const rentWk = rentM / 4.33 * s, perWeek = rentWk + sales * s;
    const rPart = Math.round(rentWk * w), sPart = sales * s * w, net = rPart + sPart - P.total;
    const many = s > 1 ? fill("c96.xst", {s}) : "";
    $("vRv").textContent = usd(rPart);
    $("vRs").textContent = rentM ? fill("c96.vrs", {rent: usd(rentM), w: weeks(w)}) + many : t("c96.vrs0");
    $("vSv").textContent = usd(sPart);
    $("vSs").textContent = sales ? fill("c96.vss", {sales: usd(sales), w: weeks(w)}) + many : t("c96.vss0");
    $("vPv").textContent = (P.from ? fill("c96.from", {usd: "−" + usd(P.total)}) : "−" + usd(P.total));
    outS.textContent = P.note;
    const lede = $("vLede"), big = $("vBig"), pay = $("vPay"), netRow = $("vNet");
    if (perWeek > 0){
      lede.textContent = t("c96.vlede");
      big.innerHTML = usd(perWeek) + (t("c96.vto") ? "<small>" + t("c96.vto") + "</small>" : "");
      big.hidden = false;
      const d = Math.max(1, Math.ceil(P.total / (perWeek / 7)));
      pay.hidden = !(d <= w * 7);
      if (!pay.hidden) pay.textContent = d === 1 ? t("c96.vpay1") : fill("c96.vpay", {d});
      $("vNl").textContent = fill("c96.vnet", {w: weeks(w)});
      $("vNv").textContent = signed(net);
      netRow.hidden = false;
    } else { lede.textContent = t("c96.vemp"); big.hidden = true; pay.hidden = true; netRow.hidden = true; }
  }
  /* the chain math: the expediter's published range for the same number of openings, against Placetta for those stores */
  function paintChain(P){
    const mine = P.s >= 2, n = mine ? P.s : 10, pz = mine ? P.total : n * 149 * 12;
    const lo = n * 2000, hi = n * 7500;
    $("chH").textContent = mine ? fill("c96.chh", {n}) : t("c96.chex");
    $("chX").textContent = range(lo, hi);
    $("chXs").textContent = fill("c96.chxs", {n});
    $("chP").textContent = mine && P.from ? fill("c96.from", {usd: usd(pz)}) : usd(pz);
    $("chPs").textContent = n >= 10 ? fill("c96.chps10", {n}) : fill("c96.chps", {n});
    const L = $("chSl"), V = $("chS"), S = $("chSs");
    if (lo > pz){ L.textContent = t("c96.chsl"); V.textContent = range(lo - pz, hi - pz); S.textContent = t("c96.chss"); }
    else if (hi > pz){ L.textContent = t("c96.chup"); V.textContent = usd(hi - pz); S.textContent = t("c96.chupss"); }
    else { L.textContent = t("c96.chmore"); V.textContent = usd(pz - hi); S.textContent = t("c96.chmoress"); }
    $("chMine").hidden = mine;
  }
  function paintCalc(){ const P = price(); paintValue(P); paintChain(P); }
  // money fields keep their thousands separators as you type (only while the cursor is at the end, so editing mid-number works)
  [vR, vS].forEach(el => {
    const tidy = force => { const d = String(el.value).replace(/[^\d]/g, "").slice(0, 9), f = d ? (+d).toLocaleString("en-US") : "";
      if (el.value !== f && (force || el.selectionStart === el.value.length)) el.value = f; };
    el.addEventListener("input", () => { tidy(false); paintCalc(); });
    el.addEventListener("blur", () => tidy(true));
    el.addEventListener("change", () => track("value_calc", {rent: amt(vR) > 0, sales: amt(vS) > 0, weeks: +vW.value}));
  });
  vW.addEventListener("change", () => { paintCalc(); track("value_calc", {rent: amt(vR) > 0, sales: amt(vS) > 0, weeks: +vW.value}); });
  // stores and licenses sit behind one button, so three inputs show at a time
  const sl = $("c96sl"), chg = $("vChg");
  const openSl = open => { sl.hidden = !open; chg.setAttribute("aria-expanded", String(open)); };
  chg.addEventListener("click", () => { openSl(sl.hidden); track("fold_stores", {open: !sl.hidden}); });
  $("chMine").addEventListener("click", () => { openSl(true); sIn.focus(); sIn.select(); });
  // a city with a counted plan fills in its own license count, once per store, until the visitor changes the field
  const fillL = () => { if (!lTouched) lIn.value = (mix ? mix.n + mix.c : 11) * num(sIn, 1, 999, 1); };
  lIn.addEventListener("input", () => { lTouched = true; paintCalc(); });
  sIn.addEventListener("input", () => { fillL(); paintCalc(); });
  [sIn, lIn].forEach(el => el.addEventListener("change", () => track("compare_calc", {stores: num(sIn, 1, 999, 1), licenses: num(lIn, 0, 9999, 0)})));
  // land98: the hero answers as the visitor types. A city with a counted plan shows its own count; anything else keeps
  // the prompt. The count is CITY_PRICES (Placetta's registry plan for a restaurant there), the same as the pricing table.
  const hc = document.getElementById("hCity");
  function paintHero(){ if (!hc) return; const raw = hero && hero.value.trim(), c = raw ? cityOf(raw) : null;
    if (c){ const q = CITY_PRICES[c]; hc.innerHTML = fill("hc.hit", {city: esc(raw.slice(0, 40)), n: q.n + q.c}); hc.classList.add("on"); }
    else { hc.textContent = t("hc.empty"); hc.classList.remove("on"); } }
  function paint(){
    paintHero();
    paintYou();
    const c = cityOf(typed());
    if (!lTouched){ const p = c ? CITY_PRICES[c] : null; mix = p || (typed() ? null : TYPICAL); fillL(); }
    paintCalc();
  }
  if (hero) { let tm = 0; hero.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(paint, 250); }); }
  new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) paint(); }).observe(document.getElementById("cmp"));
  const orig = applyAll; applyAll = function(){ orig.apply(this, arguments); paint(); };
  paint();
})();
/* the coverage fold: opening it lets the map and the agency list measure themselves again */
(function(){ const w = document.getElementById("wtFold"); if (w) w.addEventListener("toggle", () => { dispatchEvent(new Event("resize")); track("fold_together", {open: w.open}); }); })();
(function(){ const f = document.getElementById("agFold"); if (f) f.addEventListener("toggle", () => { dispatchEvent(new Event("resize")); track("fold_agencies", {open: f.open}); }); })();
/* land97: every other fold does the same (a canvas, the industries scroll or the calculator measures itself again) */
document.querySelectorAll("details.fold97").forEach(d => { if (d.id === "wtFold" || d.id === "agFold") return; d.addEventListener("toggle", () => { dispatchEvent(new Event("resize")); track("fold_" + d.id, {open: d.open}); }); });
/* /land96:js */
/* land95:js */
/* land95 (Oct 21): tabs and folds that keep every section while shortening the page */
(function land95(){
  /* tabs: a .seg95 tablist shows one of its panels; arrow keys move between tabs. Opening a panel sends a resize, so a
     canvas, map or table inside it measures itself again */
  function pick(list, btn, focus){
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    tabs.forEach(x => { const on = x === btn; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; const p = document.getElementById(x.getAttribute("aria-controls")); if (p) p.hidden = !on; });
    if (focus) btn.focus();
    dispatchEvent(new Event("resize"));
    track("tab_" + list.id, {tab: tabs.indexOf(btn)});
  }
  document.querySelectorAll(".seg95").forEach(list => {
    list.addEventListener("click", e => { const b = e.target.closest('[role="tab"]'); if (b) pick(list, b); });
    list.addEventListener("keydown", e => { const d = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[e.key]; if (!d) return; e.preventDefault();
      const tabs = [...list.querySelectorAll('[role="tab"]')], k = tabs.indexOf(document.activeElement); pick(list, tabs[(k + d + tabs.length) % tabs.length], true); });
  });

  /* folds: a long list shows its first few, and a button opens the rest. The CSS decides where a fold applies
     (some only on phones); the button hides itself where nothing is folded */
  const folds = [];
  function fold(list, o){
    if (!list) return;
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "more95"; btn.setAttribute("aria-expanded", "false");
    if (list.id) btn.setAttribute("aria-controls", list.id);
    list.classList.add("fold95");
    const label = () => { const open = list.classList.contains("open95"), n = list.querySelectorAll(o.items || ":scope > *").length;
      btn.textContent = open ? t(o.less) : t(o.all).replace("{n}", n); btn.hidden = n <= (o.keep || 0); };
    btn.addEventListener("click", () => { const open = list.classList.toggle("open95"); btn.setAttribute("aria-expanded", open); label(); track("fold_" + (list.id || o.name), {open}); if (!open && o.back) o.back.scrollIntoView({block: "nearest"}); });
    if (o.before) list.before(btn); else list.after(btn);
    folds.push(label); label();
  }
  const faq = document.getElementById("faqList");
  fold(faq, {keep: 6, all: "f95.all", less: "f95.less", back: faq});
  const inl = document.querySelector(".inlist");
  // land96: the sectors are one scrolling tab row now, so nothing folds there
  const mns = document.querySelector("#monitor .mnside");
  if (mns) { mns.id = mns.id || "mnSide"; fold(mns, {keep: 0, items: ".mnsc", all: "m95.more", less: "m95.less", before: true}); }
  // phones only (the CSS folds these below 768px or 1024px, and hides the buttons above)
  fold(document.querySelector("#pricing .prlist"), {keep: 3, items: "li", all: "g95.all", less: "g95.less", name: "included"});
  fold(document.getElementById("agTabs"), {keep: 4, items: ".agb", all: "ag95.all", less: "g95.less"});
  const relabel = () => folds.forEach(f => f());
  const orig = applyAll; applyAll = function(){ orig.apply(this, arguments); relabel(); };
})();
/* /land95:js */
/* phone95:js (Oct 21): the phone menu, the nav and price bar that step aside while you read, a testimonial card that
   keeps one height, a visible "more" on the stories tab bar, and the security list folded to four */
(function phone95(){
  const root = document.documentElement, hdr = document.getElementById("hdr"), sheet = document.getElementById("mSheet"), mb = document.getElementById("mnBtn");
  const setMenu = open => { if (!sheet || !mb) return; sheet.hidden = !open; mb.setAttribute("aria-expanded", open); mb.setAttribute("aria-label", t(open ? "menu.close" : "menu.open")); if (open) root.classList.remove("p95hide"); root.classList.toggle("menu-open", open); };
  if (mb) mb.addEventListener("click", () => { setMenu(sheet.hidden); track("menu_toggle", {open: !sheet.hidden}); });
  if (mb) { const orig = applyAll; applyAll = function(){ orig.apply(this, arguments); mb.setAttribute("aria-label", t(sheet.hidden ? "menu.open" : "menu.close")); }; }
  if (sheet) sheet.addEventListener("click", e => { if (e.target.closest("a,[data-open]")) setMenu(false); });
  document.addEventListener("click", e => { if (sheet && !sheet.hidden && !e.target.closest(".hwrap")) setMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && sheet && !sheet.hidden) { setMenu(false); mb.focus(); } });
  /* scrolling down hides the nav and the price bar; scrolling up brings them back */
  const phone = matchMedia("(max-width:1023px)");
  let lastY = scrollY;
  addEventListener("scroll", () => { const y = scrollY, d = y - lastY; if (Math.abs(d) < 8) return; lastY = y;
    const hide = phone.matches && y > 120 && d > 0 && (!sheet || sheet.hidden) && !hdr.contains(document.activeElement);
    root.classList.toggle("p95hide", hide); }, {passive: true});
  /* testimonials: they turn on their own only while the card is on screen, and on phones only when tapped, so the
     page below never jumps while you read */
  const grid = document.getElementById("tsGrid");
  if (grid) new IntersectionObserver(es => { tsVis = es.some(e => e.isIntersecting) && !phone.matches; }, {threshold: .15}).observe(grid);
  /* stories tab bar: an arrow at the end while more names sit past the edge */
  const tabs = document.getElementById("tsTabs"), bar = document.getElementById("tsBar");
  if (tabs && bar) {
    const arr = document.createElement("button"); arr.type = "button"; arr.className = "p95arr"; arr.tabIndex = -1; arr.setAttribute("aria-hidden", "true"); arr.setAttribute("aria-label", lang === "zh" ? "更多" : "More");
    arr.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>';
    bar.appendChild(arr);
    const upd = () => { const end = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 4; tabs.classList.toggle("p95end", end); arr.hidden = end || !phone.matches; };
    arr.addEventListener("click", () => tabs.scrollBy({left: tabs.clientWidth * .7, behavior: "smooth"}));
    tabs.addEventListener("scroll", upd, {passive: true}); addEventListener("resize", upd);
    new MutationObserver(upd).observe(tabs, {childList: true}); upd();
  }
  /* case studies: on phones the tabs drop the "Case study" line each one repeats */
  const ct = document.getElementById("caseTabs");
  if (ct) { const dup = () => ct.querySelectorAll(".tstab span").forEach(x => x.classList.toggle("p95dup", x.textContent === t("bel.tag")));
    new MutationObserver(dup).observe(ct, {childList: true}); dup(); }
  /* security: four controls, then "Show all" */
  const sl = document.querySelector(".sc95lists");
  if (sl) { const btn = document.createElement("button"); btn.type = "button"; btn.className = "more95 p95fb"; btn.setAttribute("aria-expanded", "false");
    sl.id = sl.id || "scList"; btn.setAttribute("aria-controls", sl.id); sl.classList.add("p95f");
    const label = () => { const open = sl.classList.contains("p95o"); btn.textContent = open ? t("g95.less") : t("g95.all").replace("{n}", sl.querySelectorAll("li").length); };
    btn.addEventListener("click", () => { const open = sl.classList.toggle("p95o"); btn.setAttribute("aria-expanded", open); label(); track("fold_security", {open}); });
    sl.after(btn); label(); const orig = applyAll; applyAll = function(){ orig.apply(this, arguments); label(); };
  }
})();
/* /phone95:js */
/* land9 (Oct 29): the case studies, example plans, maps, freight routes and sectors are drawn on /more.html only, from
   /data/more.json, fetched there and nowhere else, so the home page carries none of it */
let moreP = null;
function moreData(){
  return moreP || (moreP = fetch("/data/more.json").then(r => r.json()).then(d => {
    Object.assign(HMAP, d.map); Object.assign(FLOWS, d.flows); Object.assign(FOC, d.foc); IND.push(...d.ind);
    CASES_ALL.push(...d.cases); CASES.push(...d.cases.map(caseOf)); TEA.push(...d.tea.map(c => Object.assign(c, {ex: 1})));
    applyAll(); renderMap(); renderInd();
    const h = location.hash.slice(1), el = h && document.getElementById(h); if (el) el.scrollIntoView({block: "start"});
  }).catch(() => {}));
}
if (PG_MORE) moreData();
track("page_view", {});
})();

/* ============ section links: real paths (/pricing, /faq ...), never a # in the address bar or in a shared link ============ */
const SEC_PATH = {top: "/", how: "/how-it-works", case: "/customers", pricing: "/pricing", faq: "/faq", backers: "/backers", sample: "/sample-plan"};
const PATH_SEC = Object.fromEntries(Object.entries(SEC_PATH).map(([k, v]) => [v, k]));
const secRM = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function goSec(sec, smooth){ const el = document.getElementById(sec); if (!el) return false;
  // a section folded away (land97) opens before the page scrolls to it
  for (let d = el.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
  const hd = document.getElementById(el.getAttribute("aria-labelledby") || ""), own = hd && hd.closest("details.fold97"); if (own) own.open = true;
  if (sec === "top") scrollTo({top: 0, behavior: smooth && !secRM() ? "smooth" : "auto"}); else el.scrollIntoView({behavior: smooth && !secRM() ? "smooth" : "auto", block: "start"}); return true; }
document.addEventListener("click", e => { const a = e.target.closest("a[data-sec]"); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  if (!goSec(a.dataset.sec, true)) return; e.preventDefault(); const path = SEC_PATH[a.dataset.sec]; if (location.pathname !== path) history.pushState({sec: a.dataset.sec}, "", path + location.search); });
addEventListener("popstate", () => { const sec = PATH_SEC[location.pathname.replace(/\/+$/, "") || "/"]; if (sec) goSec(sec, true); });
// an old link with a # still lands in the right place, and the # is dropped from the address bar
(function(){ const h = location.hash.slice(1), sec = SEC_PATH[h] ? h : PATH_SEC[location.pathname.replace(/\/+$/, "") || "/"] || null;
  if (location.hash) history.replaceState(null, "", (sec ? SEC_PATH[sec] : location.pathname) + location.search);
  if (sec && sec !== "top") addEventListener("load", () => setTimeout(() => goSec(sec, false), 60), {once: true}); })();

/* experts: one line per category, "Show all" opens them; phones: each case study's plan folds behind "See the plan" */
(function(){
  const art = document.getElementById("xpArt"), more = document.getElementById("xpMore");
  const S = {en: {"xp.all": "Show all", "xp.less": "Show fewer", "cs.plan": "See the plan", "cs.planx": "Hide the plan"}, zh: {"xp.all": "显示全部", "xp.less": "收起", "cs.plan": "查看计划", "cs.planx": "收起计划"}};
  const t = k => S[document.documentElement.lang === "zh-CN" ? "zh" : "en"][k];
  const label = () => {
    if (more) more.textContent = t(art.classList.contains("open") ? "xp.less" : "xp.all");
    document.querySelectorAll(".csplan").forEach(b => { b.textContent = t(b.parentElement.classList.contains("planopen") ? "cs.planx" : "cs.plan"); });
  };
  if (art && more) {
    const fit = () => { const over = art.children.length > 3 || [...art.querySelectorAll(".xpflow")].some(f => f.scrollHeight > f.clientHeight + 2); more.hidden = !art.classList.contains("open") && !over; };
    more.addEventListener("click", () => { const on = art.classList.toggle("open"); more.setAttribute("aria-expanded", on); label(); fit(); });
    new MutationObserver(fit).observe(art, {childList: true}); addEventListener("resize", fit); setTimeout(fit, 400);
  }
  document.querySelectorAll(".csr").forEach(r => {
    if (!r.querySelector(".belstage")) return;
    const card = r.parentElement, b = document.createElement("button");
    b.type = "button"; b.className = "csplan"; b.setAttribute("aria-expanded", "false");
    b.addEventListener("click", () => { const on = card.classList.toggle("planopen"); b.setAttribute("aria-expanded", on); label(); });
    card.insertBefore(b, r);
  });
  label();
  document.querySelectorAll("[data-lang]").forEach(x => x.addEventListener("click", () => setTimeout(label, 0)));
})();
