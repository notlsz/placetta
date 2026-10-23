## How the US checklist was built

From SBA's federal license table (https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits, which now lands on https://www.sba.gov/counseling/launch-your-business/#licenses-permits: agriculture imports with USDA, alcohol with TTB, fish and wildlife with FWS, radio with the FCC, transportation with DOT) and USAGov's small business pages (https://www.usa.gov/small-business, including its import license guide; the "america.gov" the founder named is retired). Then each state's own .gov page for formation, out-of-state registration, sales tax, employer accounts and workers' compensation, and each county's and city's own .gov pages. Secondary sources (law firms, blogs, aggregators) were used only to find leads; none is cited, and an entry whose official page couldn't be read is UNVERIFIED (an internal `lead` field may keep the secondary link for staff; it is never shown).

## Still missing

What the audit looked for and the registry still doesn't hold, by country and level. Each is a gap to research, not a claim.

### United States

- Federal: FCC equipment authorization for importers of electronics (out of scope for food and retail stores, listed for completeness); USDA FSIS import inspection for meat, poultry and egg products; state new-hire reporting. BOI: current, see `fincen-boir` (FinCEN's final rule, effective August 14, 2026, keeps U.S.-formed companies exempt).
- State: workers' compensation for Hawaii and Utah (Arizona's was added in the verification pass, `az-workers-comp`; capitol.hawaii.gov answered 403 and Utah's code page built in script; Washington's runs through the business license, already in `wa-bls`); California's Proposition 65 row stays unverified (OEHHA's pages build in script); out-of-state company registration for Illinois is unverified (ilsos.gov and ilga.gov refused every read; the other eleven states were added in the finishing pass, with Nevada's and Ohio's fees not confirmed on an official page); cottage food; weights and measures device registration (county sealers in California); tobacco retailer licences (California's CDTFA page moved, and the new one wasn't found); Ohio's formation fee (its site was down for maintenance); Illinois's LLC filing fee (no official page could be read, so no fee is claimed).
- County: fictitious business name filings outside Los Angeles and Santa Clara counties (Orange, San Diego, Alameda, San Mateo, Sacramento, San Francisco), and those two counties' own entries are unverified (both sites answered 403); New York's county-level DBA for sole proprietors.
- City: alarm permits for Houston and Dallas (Los Angeles is in, `la-alarm-permit`); San Francisco's Shared Spaces outdoor seating (New York's `nyc-outdoor-dining` and Chicago's `chi-sidewalk-cafe` are in; SF's pages returned navigation only); grease interceptor and FOG permits beyond New York City (a kind fact); tobacco retail licences beyond New York City (`nyc-tobacco-dealer`); food handler cards for cities that run their own. Tobacco and alarm have no intake question yet, so their entries are listed in the library (reference) and not added to plans.
- Music licensing (ASCAP, BMI, SESAC): private licences under federal copyright law, not government filings; not in the registry.

### Mexico

- INFONAVIT and the four state payroll taxes are unverified; Monterrey's civil protection sign-off and alcohol consent are unverified; state alcohol licences are missing. (IMSS, and Guadalajara's and Cancún's licence and land use, were verified in the finishing pass.)

### Canada

- Quebec: the QST registration with Revenu Québec and the CNESST employer registration are unverified (both sites answered 403 on every read); Montreal's occupancy and sign permits are in. Ontario's Employer Health Tax; Toronto's zoning approval (its building permit, `ca-tor-building`, and Vancouver Coastal Health's food premises permit, `ca-van-food-permit`, were added in the verification pass); Vancouver's business licence is unverified (vancouver.ca answered 403; the BC liquor licence was verified in the verification pass); Ontario's food handler training rule is unverified (ontario.ca/laws builds in script); Toronto Public Health's food premises inspection.

### Europe (top six)

- Germany: Frankfurt's building and change-of-use permit (frankfurt.de answered 403, the Hessen portal is closed to robots, and the building authority's own site was offline); Italy: company formation before a notary. Munich, Hamburg, Madrid, Barcelona and Ireland were verified in the finishing pass.

### South America, Southeast Asia and Africa

- One national company step and one tax step per country; the verification pass verified Brazil's (CNPJ through Redesim, and ANVISA), Argentina's CUIT, Peru's RUC, Nigeria's CAC registration and Kenya's KRA PIN, while Chile, Colombia, Thailand, Vietnam, Indonesia, the Philippines, South Africa and Morocco stay unverified (their pages carry menus only, build in script or answered 403); city licences only for Kuala Lumpur and Nairobi. Missing: municipal licences (São Paulo, Santiago, Bogotá, Buenos Aires, Lima, Bangkok, Ho Chi Minh City, Jakarta, Manila, Lagos, Johannesburg, Casablanca), food premises permits (Singapore's SFA licence is unverified; the others are missing), social security employer registrations, and liquor licences.

### China, the Gulf and the rest of Europe

- China: Hangzhou, Chengdu, Chongqing, Tianjin and Xi'an have every national step verified (the State Council's gov.cn) but the city opening portal is unverified, because each city's gov.cn site refused the connection or answered 412.
- Saudi Arabia (Riyadh, Jeddah, Dammam) and Qatar (Doha): company, tax, employer, food, building and municipal licence steps remain unverified; Balady, the Ministry of Commerce, the SFDA, business.sa and Qatar's ministries refused every read.
- Switzerland, Austria, the Nordics, Poland, Belgium, Portugal, the UAE and Türkiye were verified in the finishing pass; see docs/COVERAGE.md.
