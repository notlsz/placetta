import { B, type Bi } from "../bi";

/* What each official form is, said the way a person explains it to an owner: one line, English and Chinese, keyed by
   the form's id in the library. Shown on the instant plan a new workspace starts with (src/plan/preview.ts), where the
   person reads each permit before anything is filled or filed. Covers every form the preview can list for a food
   business in New York, California, Texas and Arizona, and the federal step. Forms without a line here fall back to
   the library's "how" line. Applied in src/forms/registry.ts. */

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
};
