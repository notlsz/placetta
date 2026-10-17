import { B, type Bi } from "../bi";

/* What each official form is, said the way a person explains it to an owner: one line, English and Chinese, keyed by
   the form's id in the library. Shown on the instant plan a new workspace starts with (src/plan/preview.ts), where the
   person reads each permit before anything is filled or filed. Covers every form the preview can list for a food
   business in New York, California, Texas, Arizona, Boston, Atlanta and the metros added on 2026-10-17 (Oakland,
   Sacramento, Seattle, Portland, Las Vegas, Plano, Chicago, Philadelphia, DC, Arlington, Fairfax County, Edison,
   Jersey City, Miami, Denver, Minneapolis, Columbus), and the federal step. Forms without a line
   here fall back to the library's "how" line. Applied in src/forms/registry.ts. */

export const PLAIN: Record<string, Bi> = {
  /* federal */
  "irs-ss4": B("Your business's federal tax number. Free from the IRS, and almost every other application asks for it first.", "企业的联邦税号。IRS 免费发放，之后几乎每一份申请都会先问到它。"),

  /* New York State and New York City */
  "ny-dos-1336": B("Forms your New York LLC. Skip it if the company already exists.", "在纽约州成立您的 LLC。公司已成立的可跳过。"),
  "ny-dos-pub": B("New York makes a new LLC announce itself in two newspapers for six weeks, then file proof. Many owners miss this one.", "纽约州要求新成立的 LLC 在两份报纸上连续公告六周，再提交证明。很多店主会漏掉这一步。"),
  "ny-dtf-17": B("Lets you charge sales tax. Apply at least 20 days before your first sale and hang the certificate in the shop.", "让您可以收取销售税。首笔销售前至少 20 天申请，证书要挂在店里。"),
  "ny-dol-100": B("Registers you as an employer with the state once you have staff on payroll.", "有员工发薪后，向州政府登记为雇主。"),
  "ny-wcb": B("Insurance every New York employer must carry for staff: workers' comp, disability and paid family leave. Bought from an insurer, not filed.", "纽约州每位雇主都必须为员工购买的保险：工伤、残疾和带薪家庭假。向保险公司购买，不用申报。"),
  "nyc-fse": B("The permit that lets you serve food or drinks in New York City. The Health Department inspects, then grades you.", "在纽约市供应餐饮必须的许可证。卫生局先检查，之后给出字母评级。"),
  "nyc-fpc": B("A food safety course and exam for a supervisor. Someone with this certificate has to be on site whenever you are open.", "一名主管需要完成的食品安全课程和考试。营业时间内必须有持证人在店。"),
  "nyc-sign": B("Permission from the Buildings Department before your storefront sign goes up.", "安装门头招牌前，需要建筑局的许可。"),
  "nyc-co": B("A check that the space is legally allowed to be a shop or restaurant. If not, the landlord or you need to change it first.", "核对这个场所是否合法允许开店或餐厅。不允许的话，得先由房东或您办理变更。"),
  "nyc-crt": B("A city tax on rent, only for Manhattan spaces south of 96th Street above a rent threshold.", "纽约市的租金税，只针对曼哈顿 96 街以南、租金超过门槛的场所。"),

  /* California */
  "ca-llc-1": B("Forms your California LLC. Skip it if the company already exists.", "在加州成立您的 LLC。公司已成立的可跳过。"),
  "ca-llc-5": B("Registers a company formed elsewhere so it can do business in California.", "为在外州或境外成立的公司办理在加州经营的登记。"),
  "ca-ftb-3522": B("Every California LLC pays the state $800 a year, even before it makes money.", "每家加州 LLC 每年都要向州政府缴 800 美元，哪怕还没赚钱。"),
  "ca-cdtfa": B("Lets you charge sales tax in California. Free, usually issued the same day, one per store.", "让您可以在加州收取销售税。免费，通常当天发放，每家店一张。"),
  "ca-edd-de1": B("Registers you as an employer with the state once you pay staff.", "开始给员工发薪后，向州政府登记为雇主。"),
  "ca-sb54": B("If you sell packaged goods under your own brand in California, you register with the packaging recycling program.", "如果在加州以自有品牌销售包装商品，需向包装回收计划登记。"),
  "ca-prop65": B("Not a filing: California warning labels for certain chemicals, for businesses with 10 or more staff.", "不是申报：加州对特定化学物质的警示标签要求，适用于 10 名及以上员工的企业。"),

  /* Los Angeles */
  "la-btrc": B("The City of Los Angeles business tax account. Register within 30 days of opening.", "洛杉矶市的营业税账户。开业后 30 天内登记。"),
  "lac-plan-check": B("The county reviews your kitchen plans before you build. Get this approved before signing a contractor.", "县政府在施工前审查厨房图纸。签承包商之前先拿到批准。"),
  "lac-health-permit": B("The health permit that lets a food place open in LA County. Issued after plan approval and an inspection.", "洛杉矶县餐饮场所开业必须的卫生许可证。图纸获批并通过检查后发放。"),
  "la-ladbs": B("The city's permission for your build-out and for using the space as a shop or restaurant.", "市政府对装修施工以及把场所用作店铺或餐厅的许可。"),

  /* San José and Santa Clara County */
  "sj-business-tax": B("San José's business tax account. Register within 90 days of starting.", "圣何塞市的营业税账户。开业后 90 天内登记。"),
  "scc-plan-check": B("The county reviews your kitchen plans before you build. The city won't start its own review until these are stamped.", "县政府在施工前审查厨房图纸。拿到县里盖章前，市政府不会开始自己的审查。"),
  "sj-building-ti": B("The city's permit for your build-out. Plans are reviewed before construction starts.", "市政府的装修施工许可。开工前先审图。"),
  "sj-fire-systems": B("A fire department permit for sprinklers or a kitchen hood system, when your plans call for one.", "图纸涉及喷淋或厨房排烟灭火系统时，需要消防局的许可。"),
  "sj-building-final": B("The last inspection on the building permit. Book it once everything else has passed.", "建筑许可的最后一次验收。其他检查都通过后预约。"),
  "scc-health-permit": B("The health permit that lets you open. Issued around the final inspection, then renewed every year.", "让您开业的卫生许可证。在竣工检查前后发放，之后每年续期。"),
  "sj-sign": B("Permission for your storefront sign, from the planning department.", "门头招牌需要规划处的许可。"),

  /* San Francisco */
  "sf-business-registration": B("San Francisco's business registration. Every business in the city has one, renewed each year.", "旧金山的商业登记。市内每家企业都要办，每年续期。"),
  "sf-formula-retail": B("Only for chains with 11 or more other locations: a declaration the city uses to decide if a hearing is needed.", "只针对另有 11 家及以上门店的连锁品牌：市政府据此决定是否需要听证。"),
  "sf-dph-plan-check": B("The health department reviews your kitchen plans with the building permit.", "公共卫生局随建筑许可一起审查厨房图纸。"),
  "sf-dbi-building": B("The city's permit for your build-out, routed to planning, fire and health at once.", "市政府的装修施工许可，会同时送规划、消防和卫生部门审查。"),
  "sf-dph-health-permit": B("The health permit that lets you open. Apply at least six weeks before opening day.", "让您开业的卫生许可证。至少在开业前六周申请。"),
  "sf-sign": B("Permission for your sign or awning, online only.", "招牌或雨篷的许可，仅在线办理。"),
  "sf-fire-assembly": B("A fire permit for dining rooms large enough to count as a place of assembly.", "用餐区人数达到集会场所标准时需要的消防许可。"),

  /* Irvine and Orange County */
  "irv-license": B("Irvine's business license, which is really a city tax. Check first that the address allows your use.", "尔湾市的营业执照，本质是市政税。先确认该地址允许您的经营用途。"),
  "oc-plan-check": B("The county reviews your kitchen plans before you build. Usually about 20 working days.", "县政府在施工前审查厨房图纸，通常约 20 个工作日。"),
  "oc-health-permit": B("The health permit every food place in Orange County needs to open.", "橙县每家餐饮场所开业都需要的卫生许可证。"),

  /* San Diego */
  "sdg-business-tax": B("San Diego's business tax certificate. Register within 15 days of starting to avoid late fees.", "圣地亚哥市的营业税证书。开业 15 天内登记，以免滞纳金。"),
  "sdg-co": B("Confirms the space may be used as a shop or restaurant, after the build-out passes inspection.", "装修验收通过后，确认该场所可用作店铺或餐厅。"),
  "sdc-plan-check": B("The county reviews your kitchen plans before the building permit is issued.", "县政府在签发建筑许可前审查厨房图纸。"),
  "sdc-health-permit": B("The health permit every food place in San Diego County needs.", "圣地亚哥县每家餐饮场所都需要的卫生许可证。"),

  /* Texas */
  "tx-205": B("Forms your Texas LLC. Skip it if the company already exists.", "在德州成立您的 LLC。公司已成立的可跳过。"),
  "tx-304": B("Registers a company formed elsewhere so it can do business in Texas.", "为在外州或境外成立的公司办理在德州经营的登记。"),
  "tx-503": B("Registers the name on your sign when it differs from the company's legal name.", "店名与公司法定名称不同时，登记这个经营名称。"),
  "tx-ap201": B("Lets you charge sales tax in Texas. Free, one per store, takes 2 to 3 weeks to arrive.", "让您可以在德州收取销售税。免费，每家店一张，约 2 至 3 周寄到。"),
  "tx-franchise": B("Texas's yearly business report, due every May 15 even when no tax is owed.", "德州的年度企业申报，每年 5 月 15 日前提交，即使无需缴税。"),
  "tx-twc": B("Registers you as an employer with the state once you pay staff. Instant online.", "开始给员工发薪后，向州政府登记为雇主，在线即时完成。"),
  "tx-food-manager": B("At least one manager passes a food safety exam. A certified manager has to be on site whenever you are open.", "至少一名经理通过食品安全考试。营业时间内必须有持证经理在店。"),
  "tx-food-handler": B("A short food safety course for every staff member who handles food, within 30 days of starting.", "每位接触食品的员工在入职 30 天内完成的食品安全短课。"),

  /* Houston */
  "hou-co": B("Confirms the space may legally be used as your kind of business. Needed for a new tenant or a new use.", "确认该场所可以合法用于您这类经营。新租户或新用途都需要。"),
  "hou-sign": B("Permission from the city before your storefront sign goes up.", "安装门头招牌前需要市政府的许可。"),
  "hou-plan-review": B("The health department reviews your kitchen plans before you build or remodel.", "卫生局在新建或改建前审查厨房图纸。"),
  "hou-food-dealer": B("The permit that lets a food place open in Houston. Issued after plan review and an inspection.", "休斯顿餐饮场所开业必须的许可证。图纸审查和检查通过后发放。"),

  /* Dallas */
  "dal-co": B("Confirms the space may legally be used as your kind of business. Needed for a new tenant or a new use.", "确认该场所可以合法用于您这类经营。新租户或新用途都需要。"),
  "dal-building": B("The city's permit for your build-out, with the plans reviewed first.", "市政府的装修施工许可，先审图。"),
  "dal-plan-review": B("The health side reviews and stamps your kitchen plans before you build.", "卫生部门在施工前审查并盖章厨房图纸。"),
  "dal-food-permit": B("The permit that lets a food place open in Dallas. Bring your sales tax permit and book the inspection.", "达拉斯餐饮场所开业必须的许可证。带上销售税许可证并预约检查。"),
  "dal-sign": B("Permission for your storefront sign, filed by a registered sign contractor.", "门头招牌的许可，由注册招牌承包商申请。"),
  "dal-fire-hood": B("A fire department permit for the fire suppression system over your cooking line.", "厨房灶台上方灭火系统需要的消防局许可。"),

  /* Austin */
  "aus-co": B("Confirms the space may legally be used as your kind of business, after construction or a change of use.", "施工完成或用途变更后，确认该场所可以合法用于您这类经营。"),
  "aus-building": B("The city's permit for your build-out, with plans reviewed first.", "市政府的装修施工许可，先审图。"),
  "aus-food-plan-review": B("The health side reviews your kitchen plans before you build or remodel.", "卫生部门在新建或改建前审查厨房图纸。"),
  "aus-food-preopening": B("The inspection you have to pass before the food permit is issued.", "拿到食品许可证前必须通过的检查。"),
  "aus-food-permit": B("The permit that lets a food place open in Austin, issued once the inspection passes.", "奥斯汀餐饮场所开业必须的许可证，检查通过后发放。"),
  "aus-sign": B("Permission for any outdoor sign before it goes up.", "任何户外招牌安装前都需要的许可。"),

  /* San Antonio */
  "sat-co": B("Confirms the space may legally be used as your kind of business when it changes from what was there before.", "场所用途与之前不同时，确认它可以合法用于您这类经营。"),
  "sat-food": B("The license that lets a food place open in San Antonio, bought once the space checks out.", "圣安东尼奥餐饮场所开业必须的执照，场所审核通过后购买。"),

  /* Fort Worth */
  "ftw-co": B("Every building in use in Fort Worth needs one. Issued after the final inspections pass.", "沃斯堡所有使用中的建筑都需要。全部最终检查通过后签发。"),
  "ftw-plan-review": B("The health side reviews your kitchen plans before you build or remodel.", "卫生部门在新建或改建前审查厨房图纸。"),
  "ftw-food-permit": B("The permit that lets a food place open in Fort Worth, after the occupancy certificate and an inspection.", "沃斯堡餐饮场所开业必须的许可证，取得占用证并通过检查后发放。"),

  /* Arizona, Phoenix and Maricopa County */
  "az-llc": B("Forms your Arizona LLC. Skip it if the company already exists.", "在亚利桑那州成立您的 LLC。公司已成立的可跳过。"),
  "az-tpt": B("Arizona's version of a sales tax license, one per store. The same application registers you as an employer.", "亚利桑那州的销售税执照，每家店一张。同一份申请也完成雇主登记。"),
  "phx-co": B("The city's permit for your build-out, which ends in the certificate that lets you occupy the space.", "市政府的装修施工许可，完工后生成允许您使用该场所的占用证。"),
  "mc-plan-review": B("The county reviews your kitchen plans before you build. Apply 6 to 8 weeks ahead.", "县政府在施工前审查厨房图纸。建议提前 6 至 8 周申请。"),
  "mc-food-permit": B("The permit that lets a food place open in Maricopa County, after the final inspection.", "马里科帕县餐饮场所开业必须的许可证，最终检查后发放。"),

  /* Massachusetts and Boston */
  "ma-sos": B("Forms your Massachusetts LLC. Skip it if the company already exists.", "在马萨诸塞州成立您的 LLC。公司已成立的可跳过。"),
  "ma-tax": B("Lets you charge sales tax in Massachusetts and registers you to withhold tax from wages.", "让您可以在马萨诸塞州收取销售税，并登记工资预扣税。"),
  "ma-food-manager": B("At least one manager passes a food safety exam. Boston wants the certificate with your permit application.", "至少一名经理通过食品安全考试。波士顿在许可申请时要看这份证书。"),
  "ma-allergen": B("A short food allergy course for the person in charge. Someone with it has to be on site whenever you are open.", "现场负责人要上的食物过敏原短课。营业时间内必须有持证人在店。"),
  "bos-cert": B("Registers the name on your sign with the City Clerk when it differs from the company's legal name. Done in person, often while you wait.", "店名与公司法定名称不同时，向市书记官处登记这个经营名称。现场办理，常可当场取证。"),
  "bos-plan-review": B("The city's health inspectors review your kitchen plans in person before you build.", "市卫生检查员在施工前当面审查厨房图纸。"),
  "bos-cv": B("Boston's license to sell food made to order. A new address goes to a public hearing, so start early.", "波士顿销售现做食品的执照。新地址需要开公开听证会，要尽早开始。"),
  "bos-food-permit": B("The permit that lets a food place open in Boston. Issued after the victualler license and the opening inspection, renewed every year.", "波士顿餐饮场所开业必须的许可证。取得普通餐饮执照并通过开业检查后发放，每年续期。"),

  /* Georgia, Atlanta and Fulton County */
  "ga-sos": B("Forms your Georgia LLC. Skip it if the company already exists.", "在佐治亚州成立您的 LLC。公司已成立的可跳过。"),
  "ga-tax": B("Lets you charge sales tax in Georgia and registers you to withhold tax from wages. The number usually comes by email within minutes.", "让您可以在佐治亚州收取销售税，并登记工资预扣税。税号通常几分钟内通过电子邮件发出。"),
  "ga-food-manager": B("One manager passes a food safety exam. A new place has 60 days from its permit to have one.", "一名经理通过食品安全考试。新场所自取得许可证起有 60 天时间配备。"),
  "atl-license": B("Atlanta's business license, which is really a yearly tax. The city checks the zoning as part of it.", "亚特兰大的营业执照，本质是每年缴纳的营业税。市政府会在办理时一并核查分区。"),
  "fulton-plan-review": B("The county health department reviews your kitchen plans before you build. In DeKalb County it's DeKalb's.", "县卫生部门在施工前审查厨房图纸。位于迪卡尔布县的由该县办理。"),
  "fulton-food-permit": B("The permit that lets a food place open, issued after the county's pre-opening inspection. In DeKalb County it's DeKalb's.", "餐饮场所开业必须的许可证，通过县政府开业前检查后发放。位于迪卡尔布县的由该县签发。"),

  /* California, statewide */
  "ca-food-manager": B("Someone at the place passes a food safety manager exam. A new place has 60 days to have one.", "店里须有一人通过食品安全经理考试。新开的店有 60 天时间配备。"),

  /* Oakland and Alameda County */
  "oak-zoning": B("Oakland checks that your business is allowed at the address. You need it before the business tax certificate.", "奥克兰核查该地址是否允许您的经营。办理营业税证书之前必须先拿到。"),
  "oak-business-tax": B("Oakland's business tax account. Pay within 30 days of opening and renew by March 1 each year.", "奥克兰的营业税账户。开业后 30 天内缴费，每年 3 月 1 日前续期。"),
  "ac-plan-check": B("The county reviews your kitchen plans before you build. The first answer usually comes within 20 working days.", "县政府在施工前审查厨房图纸，通常 20 个工作日内首次答复。"),
  "ac-health-permit": B("The health permit that lets a food place open in Oakland, issued after the final inspection and the fee.", "奥克兰餐饮场所开业必须的卫生许可证，终检通过并缴费后发放。"),

  /* Sacramento */
  "sac-bot": B("Sacramento's yearly business tax, which stands in for a business license. The city checks the zoning before mailing it.", "萨克拉门托的年度营业税，代替营业执照。市政府核实分区后寄出证书。"),
  "sacc-plan-review": B("The county reviews your kitchen plans before you build. The fee depends on the size of the space.", "县政府在施工前审查厨房图纸，费用按场所面积计算。"),
  "sacc-health-permit": B("The health permit that lets a food place open in Sacramento County. Apply and pay before opening.", "萨克拉门托县餐饮场所开业必须的卫生许可证，须在开业前申请并缴费。"),

  /* Washington, Seattle and King County */
  "wa-bls": B("Washington's one application for the state license and taxes. It also sets you up as an employer.", "华盛顿州的统一申请，办理州执照和税务登记，同时完成雇主登记。"),
  "wa-food-worker": B("A short food safety test every food worker in Washington passes. $10 a card.", "华盛顿州每位食品从业人员都要通过的食品安全短测，每张卡 10 美元。"),
  "sea-business-license": B("Seattle's business license, online once you have the state's UBI number. $73 in the first year.", "西雅图的营业执照，取得州 UBI 号码后在线办理，首年 73 美元。"),
  "kc-plan-review": B("The county health department reviews your kitchen plans before you build. It can take 8 to 10 weeks right now.", "县卫生部门在施工前审查厨房图纸，目前可能需要 8 至 10 周。"),
  "sea-food": B("The permit that lets a food place open in Seattle and King County, after the plan review and the opening inspection.", "西雅图和金县餐饮场所开业必须的许可证，图纸审查和开业检查通过后发放。"),

  /* Nevada, Las Vegas and Clark County */
  "nv-tax": B("Lets you charge sales tax in Nevada. $15 a store, usually issued within a day online.", "让您可以在内华达州收取销售税。每家店 15 美元，在线通常一天内发放。"),
  "nv-esd": B("Registers you as an employer with the state once you have staff on payroll.", "有员工发薪后，向州政府登记为雇主。"),
  "lv-license": B("The City of Las Vegas business license, for an address inside city limits. Get the state license and tax registration first.", "拉斯维加斯市的营业执照，适用于市界内的地址。须先办好州执照和税务登记。"),
  "cc-business-license": B("The Clark County business license, for an address in unincorporated Clark County rather than a city. Apply within 30 days of opening.", "克拉克县营业执照，适用于克拉克县非建制区（而非城市内）的地址。须在开业后 30 天内申请。"),
  "snhd-food-handler": B("A food safety card everyone working in a Las Vegas area food place holds. The first test is in person.", "拉斯维加斯地区餐饮场所每位员工都要持有的食品安全卡，首次须现场考试。"),
  "snhd-plan-review": B("The Health District reviews your kitchen plans before you build.", "卫生区在施工前审查厨房图纸。"),
  "lv-food": B("The health permit that lets a food place open in the Las Vegas area, after the final inspection.", "拉斯维加斯地区餐饮场所开业必须的卫生许可证，最终检查通过后发放。"),

  /* Illinois and Chicago */
  "il-tax": B("Lets you charge sales tax in Illinois. Register before your first sale; online takes a day or two.", "让您可以在伊利诺伊州收取销售税。首笔销售前登记，在线一两天即可。"),
  "il-ides": B("Registers you as an employer with the state, within 30 days of starting.", "开业后 30 天内向州政府登记为雇主。"),
  "chi-sanitation": B("Chicago's own food safety certificate. Someone holding it has to be on site whenever you are open.", "芝加哥自己的食品安全证书。营业时间内必须有持证人在店。"),
  "chi-plan-review": B("The city's health inspectors review your kitchen plans as part of the building permit.", "市卫生检查员在建筑许可中一并审查厨房图纸。"),
  "chi-license": B("Chicago's license for any place that serves or sells food. Issued after a health inspection, renewed every 2 years.", "芝加哥供应或销售食品场所的执照。卫生检查通过后发放，每 2 年续期。"),

  /* Pennsylvania and Philadelphia */
  "pa-tax": B("Lets you charge sales tax in Pennsylvania and registers you as an employer, in one online application.", "一份在线申请即可在宾夕法尼亚州收取销售税并登记为雇主。"),
  "phl-tax-account": B("Philadelphia's city tax account. Every other city license asks for this number.", "费城的市税务账户。其他市执照都会要这个号码。"),
  "phl-cal": B("Philadelphia's free license to do business. Get it before any other city license.", "费城免费的经营许可证。办其他市执照之前先拿到它。"),
  "phl-food-safety": B("Philadelphia's food safety certificate. Someone holding it has to be there at all times. $30.", "费城的食品安全证书。营业时必须始终有持证人在场，费用 30 美元。"),
  "phl-plan-review": B("The health department reviews your kitchen plans after zoning and before you build.", "卫生部门在分区获批后、施工前审查厨房图纸。"),
  "phl-food-license": B("The license that lets you prepare or serve food in Philadelphia. $299, or $415 with 30 or more seats.", "在费城制作或供应食品必须的执照。299 美元，30 个座位及以上为 415 美元。"),

  /* Washington, DC */
  "dc-otr": B("Registers you for DC taxes. The business license checks this first, so file it early.", "办理华盛顿特区的税务登记。营业执照会先核查这一项，要尽早办。"),
  "dc-does": B("Registers you as an employer in DC once you have staff.", "有员工后，在华盛顿特区登记为雇主。"),
  "dc-co": B("Confirms the space may be used for your business. Needed for a new tenant even when the use stays the same.", "确认该场所可用于您的经营。新租户即使用途不变也需要。"),
  "dc-plan-review": B("DC Health reviews your kitchen plans with the building permit.", "华盛顿特区卫生局随建筑许可审查厨房图纸。"),
  "dc-food-manager": B("DC Health's card for your certified food manager. One has to be on duty whenever you are open.", "华盛顿特区卫生局为持证食品经理发的证卡。营业期间必须有一人在岗。"),
  "dc-food": B("DC's business license for a food place. Apply after the inspection passes. $99 for 2 years.", "华盛顿特区餐饮场所的营业执照，检查通过后申请，2 年 99 美元。"),

  /* Virginia, Arlington and Fairfax County */
  "va-tax": B("Lets you charge sales tax in Virginia and withhold tax from wages.", "让您可以在弗吉尼亚州收取销售税并预扣工资税。"),
  "va-vec": B("Registers you as an employer with the state once you have staff.", "有员工后，向州政府登记为雇主。"),
  "va-food-manager": B("At least one manager passes a food safety exam. The county checks before you open.", "至少一名经理通过食品安全考试，县政府在开业前核查。"),
  "arl-bpol": B("Arlington County's business license, which is really a yearly tax. Due March 1 each year.", "阿灵顿县的营业执照，本质是年度营业税，每年 3 月 1 日前缴纳。"),
  "arl-plan-review": B("The county reviews your kitchen plans before you build. $40.", "县政府在施工前审查厨房图纸，费用 40 美元。"),
  "arl-food-license": B("The license that lets a food place open in Arlington, renewed every year.", "阿灵顿餐饮场所开业必须的执照，每年续期。"),
  "ffx-bpol": B("Fairfax County's business license, which is really a yearly tax. File within 75 days of opening.", "费尔法克斯县的营业执照，本质是年度营业税。开业后 75 天内申报。"),
  "ffx-nonrup": B("Fairfax County's approval to use the space for your business. You can't move in without it.", "费尔法克斯县允许将场所用于您经营的批准，没有它不能入驻。"),
  "ffx-plan-review": B("The county health department reviews your kitchen plans before you build.", "县卫生部门在施工前审查厨房图纸。"),
  "ffx-food-permit": B("The permit that lets a food place open in Fairfax County, mailed about a week after the inspection.", "费尔法克斯县餐饮场所开业必须的许可证，检查后约一周寄出。"),

  /* New Jersey, Edison and Jersey City */
  "nj-reg": B("Registers you for New Jersey taxes and as an employer. File at least 15 business days before opening.", "办理新泽西州税务与雇主登记。至少在开业前 15 个工作日提交。"),
  "edi-plan-review": B("Edison's health department reviews your plans for the food place. $100.", "爱迪生镇卫生部门审查餐饮场所图纸，费用 100 美元。"),
  "edi-food-license": B("The license that lets a food place open in Edison, renewed every year.", "爱迪生镇餐饮场所开业必须的执照，每年续期。"),
  "jc-co": B("Confirms the space may legally be used for your business in Jersey City.", "确认该场所在泽西市可合法用于您的经营。"),
  "jc-food-license": B("The license that lets a food place open in Jersey City. New ones are in person, by appointment.", "泽西市餐饮场所开业必须的执照，新办须预约现场办理。"),

  /* Florida, Miami and Miami-Dade County */
  "fl-dor": B("Lets you charge sales tax in Florida and registers you as an employer, in one application.", "一份申请即可在佛罗里达州收取销售税并登记为雇主。"),
  "fl-food-manager": B("Food managers pass a food safety exam within 30 days of starting the job.", "食品经理在入职 30 天内通过食品安全考试。"),
  "fl-dbpr-plan": B("Florida reviews your kitchen plans, free, with the license application.", "佛罗里达州随执照申请免费审查厨房图纸。"),
  "fl-dbpr": B("Florida's license that lets a restaurant open, issued at the opening inspection.", "佛罗里达州允许餐厅开业的执照，开业检查时发放。"),
  "mia-cu": B("Miami's approval to use the space for your business, after construction and inspections.", "迈阿密允许将场所用于您经营的批准，在施工和检查完成后办理。"),
  "mia-btr": B("Miami's business tax receipt, after the CU. You need the county's receipt too.", "迈阿密的营业税收据，须先取得使用证。县里的收据也要办。"),
  "mdc-btr": B("Miami-Dade County's business tax receipt, on top of the city's.", "迈阿密戴德县的营业税收据，与市收据都要办。"),

  /* Colorado and Denver */
  "co-tax": B("Lets you charge sales tax in Colorado and withhold tax from wages.", "让您可以在科罗拉多州收取销售税并预扣工资税。"),
  "den-tax": B("Denver collects its own sales tax, so you register with the city too. Free.", "丹佛自行征收销售税，所以还要向市政府登记，免费。"),
  "den-zoning": B("Denver's zoning approval for your use. The food license won't issue without it.", "丹佛对您经营用途的分区批准。没有它食品执照不会发放。"),
  "den-plan-review": B("Denver's health department reviews a food place before it opens.", "丹佛卫生部门在餐饮场所开业前进行审查。"),
  "den-food-license": B("The license that lets a food place open in Denver, after the city's inspections.", "丹佛餐饮场所开业必须的执照，市政府检查通过后发放。"),

  /* Minnesota and Minneapolis */
  "mn-tax": B("Lets you charge sales tax in Minnesota. Register before your first sale.", "让您可以在明尼苏达州收取销售税。首笔销售前登记。"),
  "mn-ui": B("Registers you as an employer with the state after your first payroll.", "首次发薪后，向州政府登记为雇主。"),
  "mn-cfpm": B("Minnesota's food manager certificate. A new place has 60 days to have one.", "明尼苏达州的食品经理证书。新开的店有 60 天时间配备。"),
  "mpls-plan-review": B("The city reviews your plans and visits before any work starts.", "开工前市政府审查图纸并到现场查看。"),
  "mpls-food-license": B("The license that lets a restaurant open in Minneapolis. Apply at least four weeks ahead.", "明尼阿波利斯餐厅开业必须的执照，至少提前四周申请。"),

  /* Ohio and Columbus */
  "oh-vendor": B("Lets you charge sales tax in Ohio. In Columbus it comes from the Franklin County Auditor. $50.", "让您可以在俄亥俄州收取销售税。在哥伦布由富兰克林县审计官办理，费用 50 美元。"),
  "oh-ui": B("Registers you as an employer with the state once you have staff.", "有员工后，向州政府登记为雇主。"),
  "oh-pic": B("A food safety certificate for the person in charge. Someone with it is needed on every shift.", "现场负责人的食品安全证书。每个班次都需要有持证人。"),
  "cmh-plan-review": B("The city health department reviews your kitchen plans, within 30 days of a complete, paid application.", "市卫生部门审查厨房图纸，收到完整申请并付款后 30 天内完成。"),
  "cmh-food-license": B("The license that lets a food place open in Columbus, after the final inspection. Renew by March 1.", "哥伦布餐饮场所开业必须的执照，最终检查通过后发放，3 月 1 日前续期。"),

  /* Oregon, Portland and Multnomah County */
  "or-payroll": B("Registers you as an employer with Oregon before the first paycheck. Oregon has no sales tax.", "首次发薪前向俄勒冈州登记为雇主。俄勒冈州没有销售税。"),
  "pdx-tax": B("Portland's business tax account, which also covers the county and Metro business taxes.", "波特兰的营业税账户，同时涵盖县和大都会区的营业税。"),
  "mult-plan-review": B("The county reviews your restaurant plans before you build, answering within 15 business days.", "县政府在施工前审查餐厅图纸，15 个工作日内答复。"),
  "mult-food-license": B("The license that lets a restaurant open in Portland, after the pre-opening inspection.", "波特兰餐厅开业必须的执照，开业前检查通过后发放。"),

  /* Plano */
  "pla-co": B("Plano's approval to occupy the space. You can't open, stock or move staff in without it.", "普莱诺允许使用该场所的批准。没有它不能开业、进货或让员工入驻。"),
  "pla-plan-review": B("The city reviews your kitchen plans before you build. $475 for a new place.", "市政府在施工前审查厨房图纸，新场所 475 美元。"),
  "pla-food-permit": B("The permit that lets a food place open in Plano. You can't open before the occupancy certificate either.", "普莱诺餐饮场所开业必须的许可证。取得占用证之前也不能开业。"),
};
