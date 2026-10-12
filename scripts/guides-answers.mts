/* Questions people ask before opening, each answered from the official forms library. The short answers restate the
   library's own facts (src/forms/registry.ts, world.ts); the page lists the forms with their official links. */
export type Answer = {
  slug: string;
  q: { en: string; zh: string };
  a: { en: string; zh: string };
  forms: string[];                         // official form ids, in filing order
  plan?: { place: string; seg: "restaurant" | "retail" | "seller" | "warehouse" }[];   // related city guides
  cost?: { place: string; seg: "restaurant" | "retail" | "seller" | "warehouse" };     // add up that guide's fixed fees
};

export const ANSWERS: Answer[] = [
  {
    slug: "get-an-ein-without-an-ssn",
    q: { en: "How do I get an EIN without an SSN or ITIN?", zh: "没有 SSN 或 ITIN 怎么申请 EIN？" },
    a: { en: "File Form SS-4 by fax or mail, or call the IRS international line; applying online needs an SSN or ITIN. On line 7b, a responsible party with neither writes \"Foreign\". By fax it takes about 4 business days, by mail about 4 to 5 weeks. The IRS charges nothing; sites that charge for an EIN are resellers.",
         zh: "通过传真或邮寄提交 SS-4 表，或致电 IRS 国际专线；在线申请需要 SSN 或 ITIN。负责人两者都没有时，第 7b 行填写 \"Foreign\"。传真约 4 个工作日，邮寄约 4 至 5 周。IRS 不收费，收费办理 EIN 的网站都是中介。" },
    forms: ["irs-ss4"], plan: [{ place: "new-york-city", seg: "restaurant" }, { place: "los-angeles", seg: "seller" }],
  },
  {
    slug: "how-long-does-an-ein-take",
    q: { en: "How long does it take to get an EIN?", zh: "申请 EIN 需要多长时间？" },
    a: { en: "With an SSN or ITIN, online, it's issued right away. Without one: about 4 business days by fax, about 4 to 5 weeks by mail, and on the call if you phone the IRS international line.",
         zh: "有 SSN 或 ITIN 的在线申请可即时取得。没有的话：传真约 4 个工作日，邮寄约 4 至 5 周，致电 IRS 国际专线则当场发号。" },
    forms: ["irs-ss4"],
  },
  {
    slug: "form-5472-foreign-owned-llc",
    q: { en: "Does a foreign-owned single-member LLC have to file Form 5472?", zh: "外资单一成员 LLC 需要申报 5472 表吗？" },
    a: { en: "Yes, every year, attached to a pro forma Form 1120 by the tax return due date. It can't be filed electronically for a disregarded entity, and the penalty for not filing starts at $25,000.",
         zh: "需要，每年随形式 1120 表在报税截止日前申报。视为非独立实体的不能电子申报，未申报罚款起点为 25,000 美元。" },
    forms: ["irs-5472", "irs-ss4"],
  },
  {
    slug: "do-i-need-to-file-a-boir",
    q: { en: "Do I still need to file a beneficial ownership report (BOIR)?", zh: "现在还需要申报受益所有人信息（BOIR）吗？" },
    a: { en: "Only if the company was formed outside the US and registered to do business in a US state. Since March 2025, US-formed companies are exempt. It's free, filed online, and due 30 days after the state registration takes effect.",
         zh: "只有在美国以外成立、并在美国某州注册经营的公司需要。自 2025 年 3 月起，在美国成立的公司豁免。在线免费申报，州注册生效后 30 天内提交。" },
    forms: ["fincen-boir"],
  },
  {
    slug: "become-an-importer-of-record",
    q: { en: "How do I become an importer of record in the US?", zh: "如何成为美国的进口商（Importer of Record）？" },
    a: { en: "Get an EIN, create your importer identity with CBP Form 5106 (usually through your customs broker), buy a customs bond (CBP Form 301) from a CBP-approved surety, and open an ACE portal account to see your entries, duties and bond.",
         zh: "先取得 EIN，再用 CBP 5106 表创建进口商身份（通常经由报关行），向 CBP 认可的担保公司购买海关保证金（CBP 301 表），并开通 ACE 门户账户查看报关、关税和保证金。" },
    forms: ["irs-ss4", "cbp-5106", "cbp-301", "cbp-ace"], plan: [{ place: "new-york-city", seg: "seller" }, { place: "los-angeles", seg: "warehouse" }, { place: "houston", seg: "seller" }],
  },
  {
    slug: "fda-food-facility-registration",
    q: { en: "Does my business need FDA food facility registration?", zh: "我的企业需要 FDA 食品设施注册吗？" },
    a: { en: "Yes if it makes, packs or holds food for US consumption, including facilities abroad. Restaurants and retail food stores are exempt. It's free, filed online, and renewed between October 1 and December 31 of every even-numbered year.",
         zh: "生产、包装或储存供美国消费食品的设施（包括境外设施）需要注册；餐厅和零售食品店豁免。在线免费办理，每逢偶数年 10 月 1 日至 12 月 31 日续期。" },
    forms: ["fda-ffr"], plan: [{ place: "los-angeles", seg: "warehouse" }],
  },
  {
    slug: "register-cosmetics-with-the-fda",
    q: { en: "Do I need to register cosmetics with the FDA?", zh: "化妆品需要在 FDA 注册吗？" },
    a: { en: "Under MoCRA, the facility that makes or processes the cosmetics registers it (Form FDA 5066, every two years), and the brand on the label lists each product (Form FDA 5067, updated every year). Both are free and filed in Cosmetics Direct.",
         zh: "根据 MoCRA，生产或加工化妆品的设施需注册（FDA 5066 表，每两年一次），标签上的品牌方需为每个产品列名（FDA 5067 表，每年更新）。均在 Cosmetics Direct 免费办理。" },
    forms: ["fda-5066", "fda-5067"],
  },
  {
    slug: "certificate-of-conformity-for-imports",
    q: { en: "Do imported consumer products need a certificate of conformity?", zh: "进口消费品需要合格证书吗？" },
    a: { en: "Yes, for products covered by CPSC rules. The importer issues the certificate itself; there is no government form. Under the eFiling rule, the certificate data is filed with CBP at entry.",
         zh: "受 CPSC 规则管辖的产品需要。证书由进口商自行出具，没有政府表格；按电子申报规则，在入境报关时向 CBP 申报证书数据。" },
    forms: ["cpsc-cert", "cbp-5106"],
  },
  {
    slug: "nyc-restaurant-permit-cost",
    q: { en: "How much do permits cost to open a restaurant in New York City?", zh: "在纽约市开餐厅，许可证要花多少钱？" },
    a: { en: "", zh: "" }, forms: [], cost: { place: "new-york-city", seg: "restaurant" },
  },
  {
    slug: "los-angeles-restaurant-permit-cost",
    q: { en: "How much do permits cost to open a restaurant in Los Angeles?", zh: "在洛杉矶开餐厅，许可证要花多少钱？" },
    a: { en: "", zh: "" }, forms: [], cost: { place: "los-angeles", seg: "restaurant" },
  },
  {
    slug: "houston-restaurant-permit-cost",
    q: { en: "How much do permits cost to open a restaurant in Houston?", zh: "在休斯顿开餐厅，许可证要花多少钱？" },
    a: { en: "", zh: "" }, forms: [], cost: { place: "houston", seg: "restaurant" },
  },
  {
    slug: "nyc-food-protection-certificate",
    q: { en: "Who needs a Food Protection Certificate in New York City?", zh: "在纽约市，谁需要食品保护证书？" },
    a: { en: "Every food service establishment: a certified supervisor must be on site whenever you're open. The course is free online; the exam is taken in person.",
         zh: "每家餐饮场所都需要：营业期间必须有持证主管在场。课程可在线免费学习，考试须现场参加。" },
    forms: ["nyc-fpc", "nyc-fse"], plan: [{ place: "new-york-city", seg: "restaurant" }],
  },
  {
    slug: "california-sellers-permit",
    q: { en: "Do I need a seller's permit in California?", zh: "在加州需要销售许可证吗？" },
    a: { en: "Yes, before your first sale, with one permit for each location. Registration is online and free, though CDTFA may ask for a security deposit.",
         zh: "需要，须在首次销售前办理，每个门店一张。在线免费登记，但 CDTFA 可能要求缴纳保证金。" },
    forms: ["ca-cdtfa"], plan: [{ place: "los-angeles", seg: "retail" }, { place: "san-francisco", seg: "restaurant" }],
  },
  {
    slug: "new-york-certificate-of-authority",
    q: { en: "When do I need a sales tax Certificate of Authority in New York?", zh: "在纽约什么时候需要销售税授权证书？" },
    a: { en: "Apply through New York Business Express at least 20 days before your first sale. It's free, usually takes about two weeks, and the certificate is displayed at each location.",
         zh: "须在首次销售前至少 20 天通过 New York Business Express 申请。免费，通常约两周，证书须在每个门店展示。" },
    forms: ["ny-dtf-17"], plan: [{ place: "new-york-city", seg: "retail" }],
  },
  {
    slug: "uk-vat-for-foreign-companies",
    q: { en: "Does a foreign company need to register for VAT in the UK?", zh: "外国公司需要在英国登记增值税吗？" },
    a: { en: "Yes, from its first UK sale: a business not established in the UK has no threshold. UK-established businesses register once taxable turnover passes £90,000 in 12 months.",
         zh: "需要，自首笔英国销售起即须登记：未在英国设立的企业没有起征门槛。在英国设立的企业在 12 个月应税营业额超过 9 万英镑时登记。" },
    forms: ["gb-vat"], plan: [{ place: "london", seg: "seller" }],
  },
  {
    slug: "uk-food-business-registration",
    q: { en: "How do I register a food business in the UK?", zh: "在英国如何登记食品企业？" },
    a: { en: "Register with your local council at least 28 days before opening. It's free; the council inspects and gives a food hygiene rating.",
         zh: "开业前至少 28 天向当地市政厅登记。免费，市政厅会检查并给出食品卫生评级。" },
    forms: ["gb-food"], plan: [{ place: "london", seg: "restaurant" }],
  },
  {
    slug: "dubai-trade-licence",
    q: { en: "How do I get a trade licence in Dubai?", zh: "如何在迪拜办理营业执照？" },
    a: { en: "For a mainland business, reserve the trade name, get initial approval, then issue the licence online through Invest in Dubai. Free zone companies license through their own free zone authority instead. It renews every year.",
         zh: "本土（mainland）企业先预留商号、取得初步批准，再通过 Invest in Dubai 在线签发执照。自贸区公司改由各自贸区管理局发照。执照每年续期。" },
    forms: ["ae-dxb-licence", "ae-tax"], plan: [{ place: "dubai", seg: "restaurant" }, { place: "dubai", seg: "seller" }],
  },
  {
    slug: "saudi-arabia-misa-license",
    q: { en: "Does a foreign company need a MISA license in Saudi Arabia?", zh: "外国公司在沙特需要 MISA 投资许可吗？" },
    a: { en: "Yes. A foreign-owned business gets the investment license from the Ministry of Investment before its commercial registration, and renews it with the commercial registration.",
         zh: "需要。外资企业须在商业登记前向沙特投资部取得投资许可证，并随商业登记一并续期。" },
    forms: ["sa-misa", "sa-cr"], plan: [{ place: "riyadh", seg: "restaurant" }],
  },
  {
    slug: "open-a-company-in-china-as-a-foreigner",
    q: { en: "How does a foreign company open a business in China?", zh: "外国公司如何在中国开办企业？" },
    a: { en: "Register with the local Administration for Market Regulation on the city's one-stop portal, which also sets up tax, social insurance and the company seal. The foreign investment information report goes through the same registration, and the foreign shareholder's documents need notarization and legalization or an apostille.",
         zh: "在所在城市的一网通办平台向当地市场监督管理局登记，同时办理税务、社保和公章。外商投资信息报告随登记一并报送，境外股东的主体文件需公证认证或办理海牙认证。" },
    forms: ["cn-business-license", "cn-tax"], plan: [{ place: "shanghai", seg: "restaurant" }, { place: "shenzhen", seg: "retail" }],
  },
  {
    slug: "china-food-business-license",
    q: { en: "Do I need a food business license in China?", zh: "在中国卖食品需要食品经营许可证吗？" },
    a: { en: "Yes to make or serve food: apply online after the business license, with the floor plan, equipment list and food safety manager. Selling only prepackaged food needs a filing instead. The license is valid for 5 years.",
         zh: "制作或供应食品需要：取得营业执照后在线申请，提交平面布局图、设备清单和食品安全管理人员信息。仅销售预包装食品的办理备案即可。许可证有效期 5 年。" },
    forms: ["cn-food-license", "cn-business-license"], plan: [{ place: "shanghai", seg: "restaurant" }, { place: "beijing", seg: "restaurant" }],
  },
  {
    slug: "california-llc-800-tax-first-year",
    q: { en: "Does a new California LLC have to pay the $800 tax in its first year?", zh: "加州新成立的 LLC 第一年要交 800 美元的税吗？" },
    a: { en: "Yes. Every LLC whose articles are accepted in California, or that does business there, owes the $800 annual tax from its first taxable year, which starts when the Secretary of State files the articles. Pay it with Form FTB 3522 by the 15th day of the 4th month of that year, then every year after. An LLC formed in another state that registers or starts business in California after that date pays right away.",
         zh: "需要。凡在加州获准设立或在加州经营的 LLC，从第一个纳税年度起就须缴纳 800 美元年度税，纳税年度自州务卿受理组织章程时开始。用 FTB 3522 表在该年度第 4 个月 15 日前缴纳，此后每年缴纳。在外州成立、过了该日期才在加州登记或开始经营的 LLC，须立即缴纳。" },
    forms: ["ca-ftb-3522", "ca-llc-1", "ca-llc-5"], plan: [{ place: "los-angeles", seg: "restaurant" }, { place: "san-francisco", seg: "restaurant" }],
  },
  {
    slug: "texas-franchise-tax-no-tax-due",
    q: { en: "Does a Texas LLC have to file a franchise tax report if it owes no tax?", zh: "德州 LLC 无需缴税时，还要提交特许经营税报告吗？" },
    a: { en: "Yes. Franchise tax applies to every taxable entity formed in Texas or doing business there, and reports are due May 15 each year. Since the 2024 report year there is no No Tax Due Report: an entity with annualized total revenue at or below the no tax due threshold ($2,650,000 for 2026 and 2027 reports) owes nothing but still files a Public Information Report or an Ownership Information Report.",
         zh: "需要。特许经营税适用于在德州成立或在德州经营的所有应税实体，报告每年 5 月 15 日前提交。自 2024 报告年度起已取消无应纳税报告（No Tax Due Report）：年化总收入不超过免税门槛（2026 和 2027 年度报告为 265 万美元）的实体无需缴税，但仍须提交公开信息报告或所有权信息报告。" },
    forms: ["tx-franchise"], plan: [{ place: "houston", seg: "restaurant" }, { place: "dallas", seg: "restaurant" }, { place: "san-antonio", seg: "restaurant" }],
  },
  {
    slug: "texas-sales-tax-permit",
    q: { en: "Do I need a sales tax permit in Texas?", zh: "在德州需要销售税许可证吗？" },
    a: { en: "Yes if you are engaged in business in Texas and sell, lease or rent taxable goods or provide taxable services. Apply online before your first sale, with one permit for each location. It's free, though the Comptroller may require a security; the permit arrives in about 2 to 3 weeks and doesn't expire.",
         zh: "如果您在德州经营，并销售、出租或租赁应税商品，或提供应税服务，就需要。须在首次销售前在线申请，每个门店一张。免费，但审计长办公室可能要求提供担保；约 2 至 3 周收到许可证，永久有效。" },
    forms: ["tx-ap201"], plan: [{ place: "houston", seg: "retail" }, { place: "san-antonio", seg: "retail" }],
  },
  {
    slug: "nyc-food-service-establishment-permit",
    q: { en: "How do I get a restaurant permit in New York City?", zh: "在纽约市如何办理餐厅许可证？" },
    a: { en: "Apply for the Health Department's Food Service Establishment Permit online, or in person by appointment; new applications aren't accepted by mail. It costs $280, you need a Food Protection Certificate holder or a course registration when you apply, and you may open 22 days after applying, even before the pre-permit inspection. It renews every year.",
         zh: "向卫生局在线申请餐饮服务场所许可证，或预约后现场办理；新申请不接受邮寄。费用 280 美元，申请时须有食品保护证书持有人或课程报名证明，提交申请 22 天后即可开业，即使尚未进行发证前检查。许可证每年续期。" },
    forms: ["nyc-fse", "nyc-fpc", "nyc-co"], plan: [{ place: "new-york-city", seg: "restaurant" }],
  },
  {
    slug: "how-much-does-a-customs-bond-cost",
    q: { en: "How much does a US customs bond cost?", zh: "美国海关保证金要花多少钱？" },
    a: { en: "CBP charges nothing for the bond itself (CBP Form 301); you pay a premium to a CBP-approved surety, usually arranged by your customs broker. A continuous bond covers a year of entries with at least $50,000 of coverage and renews yearly. CBP takes at least 5 business days to review it.",
         zh: "CBP 对保证金本身（CBP 301 表）不收费；您向 CBP 认可的担保公司支付保费，通常由报关行代办。连续保证金覆盖一年内的全部报关，额度至少 50,000 美元，每年续保。CBP 审核至少需要 5 个工作日。" },
    forms: ["cbp-301", "cbp-5106", "cbp-ace"], plan: [{ place: "new-york-city", seg: "seller" }, { place: "los-angeles", seg: "warehouse" }],
  },
];
