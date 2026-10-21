// The steps the strict accuracy set (scripts/eval/strict: the top 15 cities and top 15 states for Chinese brands) found
// missing from the library, read from the agencies' own pages on 2026-10-21: the building permit a build-out needs in
// Irvine, Chicago, Atlanta, Washington DC, Jersey City and Arlington, Miami's certificate of occupancy or completion after
// construction, DC's LLC formation, Nevada's state business license (every business, on top of any local license) and
// Maricopa County's certified food protection manager. Each entry's proof is the sentence on its source page that states
// the requirement; atlantaga.gov refuses automated requests, so Atlanta's was read word for word through WebFetch.
import { B } from "../bi";
import type { OfficialForm } from "./registry";

const R = "restaurant" as const, T = "retail" as const, S = "seller" as const, W = "warehouse" as const;
const READ = "2026-10-21";
type Proof = { quote: string; read: string; checked: string };
const P = (quote: string, read: string): Proof => ({ quote, read, checked: READ });
const f = (o: Omit<OfficialForm, "checked" | "fields"> & { proof: Proof }): OfficialForm => ({ ...o, checked: "page", fields: [] });

const IRV_TI = "https://cityofirvine.gov/node/69516";
const CHI_EPP = "https://chicago.gov/city/en/sites/guide-to-building-permits/home/instructions/EPP/INTWK-alteration.html";
const ATL_BLDG = "https://atlantaga.gov/home/showdocument?id=19215";
const DC_CO = "https://dob.dc.gov/sites/default/files/dc/sites/dob/Certificate%20of%20Occupancy--A%20Quick%20Guide.pdf";
const DC_LLC = "https://dlcp.dc.gov/node/1616716";
const JC_BIZ = "https://www.jerseycitynj.gov/cityhall/HousingAndDevelopment/businesses";
const ARL_FOOD = "https://arlingtonva.us/Government/Programs/Health/Environmental-Health/Food-Establishment-Plans-Construction";
const MIA_GUIDE = "https://www.miami.gov/Business/New-Business-Guide";
const NV_SBL = "https://dpbh.nv.gov/uploadedFiles/dpbhnvgov/content/Reg/Radiation-Machines/Docs/Informational_Notice_Secretary_of_State_Business_License_8-17-23ADA.pdf";
const MC_CFPM = "https://www.maricopa.gov/DocumentCenter/View/5475/Chapter-7---Food-Employees-Certified-Food-Protection-Managers-PDF";

export const TOP_CITIES: OfficialForm[] = [
  f({ id: "irv-building", form: "Commercial tenant improvement permit (IrvineReady!)", title: B("Building permit for the tenant improvement", "租户装修建筑许可证"),
    agency: B("City of Irvine, Building Permits and Inspections", "尔湾市建筑许可与检查部门"), level: "city", where: "IRV", segments: [R, T, W], needs: { buildout: true }, method: "portal", order: 52,
    how: B("The plans and the permit application go in electronically through the city's IrvineReady! portal; the city inspects the work.", "图纸和许可申请通过市政府的 IrvineReady! 门户在线提交，由市政府检查施工。"),
    url: IRV_TI, info: IRV_TI, fee: null,
    proof: P("you will need to submit your permit application and plans electronically through the IrvineReady!", IRV_TI),
    plain: B("Irvine's permit to build out the space, with inspections.", "尔湾市的场所装修许可，含检查。") }),
  f({ id: "chi-building", form: "Building permit (Express Permit Program or standard plan review)", title: B("Building permit for the interior alteration", "室内改建建筑许可证"),
    agency: B("Chicago Department of Buildings", "芝加哥建筑局"), level: "city", where: "CHI", segments: [R, T, W], needs: { buildout: true }, method: "portal", order: 52,
    how: B("Nonstructural interior alterations up to 2,000 square feet can use the Express Permit Program.", "2,000 平方英尺以内的非结构性室内改建可走快速许可程序。"),
    url: CHI_EPP, info: CHI_EPP, fee: null,
    proof: P("The Express Permit Program offers a streamlined way to obtain a permit for nonstructural interior alterations", CHI_EPP),
    plain: B("Chicago's permit for the build-out, from the Department of Buildings.", "芝加哥建筑局的装修许可。") }),
  f({ id: "atl-building", form: "Building permit (Office of Buildings)", title: B("Building permit for the build-out", "装修建筑许可证"),
    agency: B("City of Atlanta, Office of Buildings", "亚特兰大市建筑办公室"), level: "city", where: "ATL", segments: [R, T, W], needs: { buildout: true }, method: "portal", order: 52,
    how: B("The Office of Buildings issues the permits construction and alteration need under the Atlanta Municipal Code, and inspects the work.", "建筑办公室依《亚特兰大市法典》签发施工和改建所需的许可，并检查施工。"),
    url: ATL_BLDG, info: ATL_BLDG, fee: null,
    proof: P("These building permits are needed for any construction, alteration, repair, equipment, use and occupancy", ATL_BLDG),
    plain: B("Atlanta's permit to build out the space.", "亚特兰大市的场所装修许可。") }),
  f({ id: "dc-building", form: "Building permit (DOB)", title: B("Building permit", "建筑许可证"),
    agency: B("DC Department of Buildings", "华盛顿特区建筑局"), level: "city", where: "DC", segments: [R, T, W], needs: { buildout: true }, method: "portal", order: 52,
    how: B("A change of use takes building permits and final inspections before the new Certificate of Occupancy.", "改变用途须先取得建筑许可并通过最终检查，再办理新的占用证。"),
    url: DC_CO, info: DC_CO, fee: null,
    proof: P("Building permits and final inspections are required.", DC_CO),
    plain: B("DC's permit for the build-out, ahead of the Certificate of Occupancy.", "华盛顿特区的装修许可，先于占用证办理。") }),
  f({ id: "dc-formation", form: "Articles of Organization (Form DLC-1)", title: B("LLC formation (Articles of Organization)", "LLC 设立（组织章程）"),
    agency: B("DC Department of Licensing and Consumer Protection, Corporations Division", "华盛顿特区许可与消费者保护局公司处"), level: "city", where: "DC", segments: [R, T, S, W], needs: { newEntity: true }, method: "online", order: 12,
    how: B("Form DLC-1 goes to the Superintendent of Corporations online, by mail or at the counter.", "DLC-1 表在线、邮寄或现场提交给公司监理。"),
    url: DC_LLC, info: DC_LLC, fee: null,
    proof: P("To register domestic limited liability company in the District, customer shall deliver articles of organization form DLC-1 to the Superintendent for filing", DC_LLC),
    plain: B("Forms the company in the District.", "在华盛顿特区设立公司。") }),
  f({ id: "jc-construction", form: "Construction permit (Uniform Construction Code)", title: B("Construction permit for the build-out", "装修施工许可证"),
    agency: B("City of Jersey City", "泽西市"), level: "city", where: "JC", segments: [R, T, W], needs: { buildout: true }, method: "portal", order: 52,
    how: B("Construction applications and their inspections come before the Certificate of Occupancy.", "施工申请及其检查须在占用证之前完成。"),
    url: JC_BIZ, info: JC_BIZ, fee: null,
    proof: P("you will need to apply for the appropriate construction applications and pass inspections before applying for a Certificate of Occupancy.", JC_BIZ),
    plain: B("Jersey City's permit for the construction, before the Certificate of Occupancy.", "泽西市的施工许可，先于占用证。") }),
  f({ id: "arl-building", form: "Commercial building permit (Permit Arlington)", title: B("Commercial building permit", "商业建筑许可证"),
    agency: B("Arlington County Permit Office", "阿灵顿县许可办公室"), level: "county", where: "ARL", segments: [R, T, W], needs: { buildout: true }, method: "portal", order: 52,
    how: B("A new establishment or an alteration goes through the county's Permit Office with its commercial building permit submission.", "新开业或改建须通过县许可办公室提交商业建筑许可申请。"),
    url: ARL_FOOD, info: ARL_FOOD, fee: null,
    proof: P("visit the Arlington County Permit Office’s website with information on Commercial Building Permit Submission Requirements", ARL_FOOD),
    plain: B("Arlington County's permit for the build-out.", "阿灵顿县的装修许可。") }),
  f({ id: "mia-co", form: "Certificate of Occupancy (CO) or Certificate of Completion (CC)", title: B("Certificate of Occupancy or Completion after the build-out", "装修后的占用证或竣工证"),
    agency: B("City of Miami Building Department", "迈阿密市建筑局"), level: "city", where: "MIA", segments: [R, T, W], needs: { buildout: true }, method: "portal", order: 66,
    how: B("A new building, or one that has undergone construction, shows its CO or CC to get the Certificate of Use.", "新建或经过施工的建筑须出示占用证或竣工证，才能办理使用证。"),
    url: MIA_GUIDE, info: MIA_GUIDE, fee: null,
    proof: P("you will need to show either a Certificate of Occupancy (CO) or a Certificate of Completion (CC)", MIA_GUIDE),
    plain: B("The building department's sign-off on the construction, which the Certificate of Use asks for.", "建筑部门对施工的验收，使用证申请需要它。") }),
  f({ id: "nv-sbl", form: "State Business License (SilverFlume)", title: B("Nevada state business license", "内华达州营业执照"),
    agency: B("Nevada Secretary of State", "内华达州州务卿"), level: "state", where: "NV", segments: [R, T, S, W], method: "online", order: 18,
    how: B("Every business that conducts business in Nevada holds the Secretary of State's business license (or a certificate of exemption), on top of any city or county license.", "在内华达州经营的每家企业都须持有州务卿签发的营业执照（或豁免证明），另加所需的市或县执照。"),
    url: "https://www.nvsilverflume.gov/", info: NV_SBL, fee: null,
    proof: P("A person shall not conduct business in the State unless and until the person obtains a state business license", NV_SBL),
    plain: B("Nevada's own business license, required before any city or county one.", "内华达州自己的营业执照，先于市或县执照。") }),
  f({ id: "mc-cfpm", form: "Certified Food Protection Manager (Maricopa County Environmental Health Code, Chapter VII)", title: B("Certified food protection manager", "注册食品保护经理"),
    agency: B("Maricopa County Environmental Services", "马里科帕县环境服务局"), level: "county", where: "MARI", segments: [R, T], needs: { food: true }, method: "online", order: 40,
    how: B("Each food establishment keeps at least one certified food protection manager on staff, and replaces one who leaves within 90 days.", "每家食品经营场所至少须有一名注册食品保护经理在职，离职须在 90 天内补任。"),
    url: MC_CFPM, info: MC_CFPM, fee: null,
    proof: P("Each food establishment shall have at least one (1) Certified Food Protection Manager on staff.", MC_CFPM),
    plain: B("A manager with a food protection certificate, required in every Maricopa County food place.", "马里科帕县每家餐饮场所都须有持食品保护证书的经理。") }),
];
