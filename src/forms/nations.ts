// The other nations' pass of 2026-10-27 (docs/COVERAGE.md): Mexico first (the federal, state and municipal steps of the
// ten cities a brand opens in first), then Saudi Arabia, the EU's import registration (EORI) and the cities the earlier
// passes left short. Same rules as src/forms/verify.ts: a proof is a sentence of under 25 words copied from the
// government's own page or its official legislation site (in the page's language, with an English gloss), the URL that
// was fetched and the day; each was matched on the page as fetched with scripts/eval/proof-read.py before it was written
// here. An entry whose official page couldn't be read has no proof (UNVERIFIED): its plan row abstains and names the
// office, and NATIONS_BLOCKED says what blocked it. No fee, deadline or URL is stated that a page didn't state.
//
// NATIONS_FIXES add a proof to an entry already in the registry (src/forms/audit.ts applies them after the verification
// pass); NATIONS_FORMS are the steps that were missing.
import type { Fix } from "./audit";
import type { OfficialForm, Segment } from "./registry";
import { E, type EuEntry } from "./europe";
import { VERIFY_BLOCKED } from "./verify";

export const READ_NAT = "2026-10-27";
type T = readonly [string, string];
const PREMISES: Segment[] = ["restaurant", "retail", "warehouse"];
const STORES: Segment[] = ["restaurant", "retail"];
/** A proof read in this pass: the entry, the page read, the sentence as written, its English gloss when the page isn't in English, why. */
const P = (id: string, read: string, quote: string, en: string | undefined, why: string, extra: Partial<Fix> = {}): Fix =>
  ({ id, info: read, proof: { read, quote, checked: READ_NAT, ...(en ? { en } : {}) }, why, ...extra });
const V = (o: EuEntry): OfficialForm => { const f = E(o); if (f.proof) f.proof.checked = READ_NAT; return f; };

/* ------------------------------------------------------------------ Mexico: the federal laws (diputados.gob.mx) and SAT */
const DIP = (f: string) => `https://www.diputados.gob.mx/LeyesBiblio/pdf/${f}`;
const LIFNVT = DIP("LIFNVT.pdf"), LIE = DIP("LIE.pdf"), LCEC = DIP("LCEC_120419.pdf");
const SAT_EFIRMA = "https://www.sat.gob.mx/gobmx/Paginas/ficha_105_cff.html";
const SE_SIEM = "https://ventanillaunica.economia.gob.mx/procedure/564/step/753?l=en";
/* the states' payroll tax */
const CMX_ISN = "https://innovacion.finanzas.cdmx.gob.mx/siscon/archivos/manuales/MANUAL_DE_USUARIO_NOMINAS_VER1_1.pdf";
const NL_HACIENDA = "https://www.hcnl.gob.mx/trabajo_legislativo/leyes/leyes/ley_de_hacienda_del_estado_de_nuevo_leon/";
const JAL_CFE = "https://congresoweb.congresojal.gob.mx/bibliotecavirtual/legislacion/C%C3%B3digos/Documentos_PDF-C%C3%B3digos/C%C3%B3digo%20Fiscal%20del%20Estado%20de%20Jalisco-140526.pdf";
const QRO_ISN = "https://asistenciasf.queretaro.gob.mx/sites/default/files/impuestos/pdf/1.1%20FUNDAMENTO%20LEGAL%20ISN.pdf";
/* Nuevo León's laws on the state congress's site (Monterrey and San Pedro Garza García) */
const NL_PC = "https://www.hcnl.gob.mx/trabajo_legislativo/leyes/leyes/ley_de_proteccion_civil_para_el_estado_de_nuevo_leon/";
const NL_ALCOHOL = "https://www.hcnl.gob.mx/trabajo_legislativo/leyes/leyes/ley_estatal_de_prevencion_y_combate_al_abuso_del_alcohol/";
const NL_URBANO = "https://www.hcnl.gob.mx/trabajo_legislativo/leyes/leyes/ley_de_asentamientos_humanos_ordenamiento_territorial_y_desarrollo_urbano_para_el_estado_de_nuevo_le/";
/* Jalisco (Guadalajara and Zapopan), Querétaro, Tijuana */
const JAL_ALCOHOL = "https://transparencia.info.jalisco.gob.mx/sites/default/files//ley-para-regular-la-venta-y-el-consumo-de-bebidas-alcoholicas-del-estado-de-jalisco-25-oct-2013.pdf";
const ZAP_LIC = "https://www.zapopan.gob.mx/wp-content/uploads/2020/12/Direccion_de_Padron_y_Licencias.pdf";
const QRO_OPEN = "https://tramites.municipiodequeretaro.gob.mx/cedulas/TP-280110-001Tr%C3%ADptico%20Apertura%20de%20Negocios%20(REV20)%20(2)%20(3).pdf";
const QRO_SIGN = "https://municipiodequeretaro.gob.mx/municipio/repositorios/desarrollo-urbano/LA_REQUISITOS.pdf";
const TIJ_SARE = "https://sedeti.tijuana.gob.mx/sare";

const NL_PC_Q = "tienen la obligación de contar permanentemente con un programa especifico de Protección Civil, Plan de Contingencias,";
const NL_PC_EN = "are obliged to keep at all times a specific civil protection programme, a contingency plan,";
const NL_ANUENCIA_Q = "Resolución administrativa, expedida por la autoridad municipal correspondiente, mediante la cual se manifiesta la opinión favorable para el otorgamiento de las licencias";
const NL_ANUENCIA_EN = "An administrative resolution, issued by the municipal authority, giving its favourable opinion for the licences to be granted";
const NL_SIGN_Q = "Expedir las licencias para la instalación de anuncios, sujetándose a la normatividad establecida;";
const NL_SIGN_EN = "To issue the licences to install signs, under the rules in force (a power of the municipalities, article 11)";
const TIJ_Q = "Dictamen de uso de suelo Certificado de medidas de Seguridad Registro de Solidos Urbanos Licencia de Operación";
const TIJ_EN = "Land use opinion, safety measures certificate, solid waste registration, operating licence";
const NL_PC_HOW: T = ["Every establishment keeps a civil protection programme and contingency plan, authorised and supervised by the state's civil protection office or the city's unit, as the state's Civil Protection Law requires.", "依《新莱昂州民防法》，每个场所须常设民防计划和应急预案，并经州民防局或市民防部门批准和监督。"];
const NL_SIGN_HOW: T = ["A sign on the premises needs the city's sign licence; under Nuevo León's urban development law the municipalities issue it.", "场所招牌须取得市政府的招牌许可；依新莱昂州城市发展法，由各市政府签发。"];
const NL_ANUENCIA_HOW: T = ["A restaurant or shop that sells alcohol first gets the city's consent (anuencia municipal), then the state's alcohol licence.", "销售酒类的餐厅或商店须先取得市政府许可（anuencia municipal），再申请州酒类许可。"];

const MEXICO_NEW: OfficialForm[] = [
  V({ id: "mx-efirma", where: "MX", level: "federal", method: "in_person", order: 21, cur: "MXN",
    form: "Solicitud del certificado de e.firma (ficha 105/CFF)", title: ["Advanced electronic signature (e.firma) with the SAT", "向税务局（SAT）申请电子签名（e.firma）"],
    agency: ["Servicio de Administración Tributaria (SAT)", "墨西哥税务局（SAT）"],
    how: ["The company's e.firma certificate is requested at a SAT office by appointment; the legal representative must already hold their own e.firma. Most later filings (the payroll tax, the IMSS) are signed with it.", "公司的 e.firma 证书须预约到 SAT 办事处申请；法定代表人须已持有本人的 e.firma。此后多数申报（州工资税、IMSS 等）都以其签署。"],
    url: SAT_EFIRMA,
    proof: [SAT_EFIRMA, "Es necesario que el representante legal de la persona moral haya tramitado previamente su certificado de e.firma", "The company's legal representative must first have obtained their own e.firma certificate"] }),
  V({ id: "mx-rnie", where: "MX", level: "federal", needs: { foreignEntity: true }, method: "online", order: 22, cur: "MXN",
    form: "Inscripción en el Registro Nacional de Inversiones Extranjeras (RNIE)", title: ["Foreign investment registration (RNIE)", "外国投资登记（RNIE）"],
    agency: ["Secretaría de Economía, Registro Nacional de Inversiones Extranjeras", "墨西哥经济部国家外国投资登记处"],
    how: ["A Mexican company with foreign investors registers in the National Foreign Investment Registry, as the Foreign Investment Law requires, and keeps its entry up to date.", "有外国投资者的墨西哥公司须依《外国投资法》在国家外国投资登记处登记，并及时更新登记信息。"],
    url: "https://www.gob.mx/se",
    proof: [LIE, "Deberán inscribirse en el Registro: I.- Las sociedades mexicanas en las que participen, incluso a través de fideicomiso:", "The following must register: I. Mexican companies in which there participate, including through a trust:"] }),
  V({ id: "mx-siem", where: "MX", level: "federal", method: "online", order: 58, cur: "MXN",
    form: "Registro en el Sistema de Información Empresarial Mexicano (SIEM)", title: ["Business registry entry for each establishment (SIEM)", "每个经营场所的企业信息系统登记（SIEM）"],
    agency: ["Secretaría de Economía, through an authorised business chamber", "墨西哥经济部（经授权的商会办理）"],
    how: ["Every merchant and industrialist registers each establishment in the SIEM, through a chamber the Secretaría de Economía authorises, and updates it every year.", "所有商户和工业企业须经经济部授权的商会，将每个经营场所登记于 SIEM，并每年更新。"],
    url: SE_SIEM, renews: ["Every year.", "每年更新。"],
    proof: [LCEC, "Todos los Comerciantes e Industriales, sin excepción y obligatoriamente, deberán de registrar y actualizar anualmente cada uno de sus establecimientos en el SIEM.", "All merchants and industrialists, without exception, must register and update every year each of their establishments in the SIEM."] }),
  /* the states' payroll tax for the states that had none */
  V({ id: "mx-que-isn", where: "QUE", level: "state", needs: { employees: true }, method: "online", order: 62, cur: "MXN",
    form: "Inscripción al padrón del Impuesto sobre Nóminas", title: ["State payroll tax registration (Querétaro)", "州工资税登记（克雷塔罗州）"],
    agency: ["Secretaría de Finanzas del Estado de Querétaro", "克雷塔罗州财政局"],
    how: ["Employers who pay wages in Querétaro register for the state's payroll tax with its finance office and pay it on the wages paid there.", "在克雷塔罗州支付工资的雇主须向州财政部门登记州工资税，并按在该州支付的工资缴纳。"],
    url: "https://asistenciasf.queretaro.gob.mx",
    proof: [QRO_ISN, "Están obligados al pago de este impuesto, las personas físicas o morales que efectúen los pagos a que se refiere el artículo anterior,", "Individuals or companies making the payments the previous article describes are liable for this tax,"] }),
  V({ id: "mx-bcn-isn", where: "BCN", level: "state", needs: { employees: true }, method: "online", order: 62, cur: "MXN",
    form: "Inscripción al Impuesto sobre Remuneraciones al Trabajo Personal", title: ["State payroll tax registration (Baja California)", "州工资税登记（下加利福尼亚州）"],
    agency: ["Secretaría de Hacienda del Estado de Baja California", "下加利福尼亚州财政局"],
    how: ["Employers with staff in Baja California register for the state's tax on wages (impuesto sobre remuneraciones al trabajo personal) with its finance office.", "在下加利福尼亚州有员工的雇主须向州财政部门登记州工资税（impuesto sobre remuneraciones al trabajo personal）。"],
    url: "https://www.bajacalifornia.gob.mx" }),
  V({ id: "mx-mex-isn", where: "MEX", level: "state", needs: { employees: true }, method: "online", order: 62, cur: "MXN",
    form: "Inscripción al Impuesto sobre Erogaciones por Remuneraciones al Trabajo Personal", title: ["State payroll tax registration (Estado de México)", "州工资税登记（墨西哥州）"],
    agency: ["Secretaría de Finanzas del Gobierno del Estado de México", "墨西哥州财政局"],
    how: ["Employers with staff in the Estado de México register for the state's tax on wages paid (impuesto sobre erogaciones por remuneraciones al trabajo personal).", "在墨西哥州有员工的雇主须登记州工资税（impuesto sobre erogaciones por remuneraciones al trabajo personal）。"],
    url: "https://www.edomex.gob.mx" }),
  /* Nuevo León: Monterrey's sign licence, the state's alcohol licence, and San Pedro Garza García's own steps */
  V({ id: "mx-mty-anuncio", where: "MX-MTY", level: "city", segs: STORES, needs: { signage: true }, method: "in_person", order: 80, cur: "MXN",
    form: "Licencia de anuncios", title: ["Sign licence (licencia de anuncios)", "招牌许可（licencia de anuncios）"], agency: ["Municipio de Monterrey, Secretaría de Desarrollo Urbano Sostenible", "蒙特雷市可持续城市发展局"],
    how: NL_SIGN_HOW, url: "https://www.monterrey.gob.mx", proof: [NL_URBANO, NL_SIGN_Q, NL_SIGN_EN] }),
  V({ id: "mx-nle-alcohol", where: "NLE", level: "state", segs: STORES, needs: { alcohol: true }, method: "in_person", order: 72, cur: "MXN",
    form: "Licencia para la venta o consumo de bebidas alcohólicas", title: ["State alcohol licence (Nuevo León)", "州酒类许可（新莱昂州）"],
    agency: ["Secretaría de Finanzas y Tesorería General del Estado de Nuevo León", "新莱昂州财政与总库局"],
    how: ["The state's treasury issues the licence to sell or serve alcohol once the city's consent (anuencia municipal) is granted and the state's licensing committee has given its opinion.", "取得市政府许可（anuencia municipal）并经州许可委员会出具意见后，由州财政总库签发酒类销售许可。"],
    url: "https://www.nl.gob.mx", proof: [NL_ALCOHOL, "una vez obtenida la anuencia municipal correspondiente y previo dictamen del Comité;", "once the municipal consent is obtained and after the Committee's opinion;"] }),
  V({ id: "mx-spg-edificacion", where: "MX-SPG", level: "city", segs: PREMISES, method: "in_person", order: 50, cur: "MXN",
    form: "Licencia de uso de suelo y de uso de edificación", title: ["Land use and building use licence (San Pedro Garza García)", "土地与建筑用途许可（圣佩德罗加尔萨加西亚）"],
    agency: ["Municipio de San Pedro Garza García, Secretaría de Desarrollo Urbano", "圣佩德罗加尔萨加西亚市城市发展局"],
    how: ["The city authorises the land use and the building's specific use for the business before it opens; Nuevo León's urban development law has the municipality issue these licences.", "开业前须取得市政府对土地用途和建筑具体用途的许可；依新莱昂州城市发展法，由市政府签发。"],
    url: "https://www.sanpedro.gob.mx", proof: [NL_URBANO, "Las autorizaciones serán expedidas por la autoridad Municipal competente, de conformidad con esta Ley", "The authorisations are issued by the competent municipal authority, under this Law"] }),
  V({ id: "mx-spg-pc", where: "MX-SPG", level: "city", segs: PREMISES, method: "in_person", order: 67, cur: "MXN",
    form: "Programa específico de Protección Civil (plan de contingencias)", title: ["Civil protection programme (San Pedro Garza García)", "民防计划（圣佩德罗加尔萨加西亚）"],
    agency: ["Municipio de San Pedro Garza García, Protección Civil", "圣佩德罗加尔萨加西亚市民防局"], how: NL_PC_HOW,
    url: "https://www.sanpedro.gob.mx", proof: [NL_PC, NL_PC_Q, NL_PC_EN] }),
  V({ id: "mx-spg-anuncio", where: "MX-SPG", level: "city", segs: STORES, needs: { signage: true }, method: "in_person", order: 80, cur: "MXN",
    form: "Licencia de anuncios", title: ["Sign licence (San Pedro Garza García)", "招牌许可（圣佩德罗加尔萨加西亚）"], agency: ["Municipio de San Pedro Garza García, Secretaría de Desarrollo Urbano", "圣佩德罗加尔萨加西亚市城市发展局"],
    how: NL_SIGN_HOW, url: "https://www.sanpedro.gob.mx", proof: [NL_URBANO, NL_SIGN_Q, NL_SIGN_EN] }),
  V({ id: "mx-spg-alcohol", where: "MX-SPG", level: "city", segs: STORES, needs: { alcohol: true }, method: "in_person", order: 71, cur: "MXN",
    form: "Anuencia municipal para la venta de bebidas alcohólicas", title: ["City consent to sell alcohol (San Pedro Garza García)", "市政府酒类销售许可（圣佩德罗加尔萨加西亚）"],
    agency: ["Municipio de San Pedro Garza García", "圣佩德罗加尔萨加西亚市政府"], how: NL_ANUENCIA_HOW,
    url: "https://www.sanpedro.gob.mx", proof: [NL_ALCOHOL, NL_ANUENCIA_Q, NL_ANUENCIA_EN] }),
  /* Jalisco: the alcohol licence the cities issue (Guadalajara, Zapopan), and Zapopan's own steps */
  V({ id: "mx-jal-alcohol", where: "JAL", level: "city", segs: STORES, needs: { alcohol: true }, method: "in_person", order: 71, cur: "MXN",
    form: "Licencia municipal para la venta de bebidas alcohólicas", title: ["Municipal alcohol licence (Jalisco)", "市级酒类许可（哈利斯科州）"],
    agency: ["The city's licensing office (ayuntamiento), under Jalisco's alcohol law", "所在市政府许可部门（依哈利斯科州酒类法）"],
    how: ["Under Jalisco's alcohol law the city (ayuntamiento) issues the licence to sell or serve alcohol, and no establishment may start selling without it.", "依哈利斯科州酒类法，由市政府签发酒类销售许可，未取得许可的场所不得开始营业。"],
    url: JAL_ALCOHOL, proof: [JAL_ALCOHOL, "Ningún establecimiento puede iniciar su funcionamiento sin contar con la licencia o el permiso provisional respectivo.", "No establishment may start operating without the licence or the provisional permit."] }),
  V({ id: "mx-zap-licencia", where: "MX-ZAP", level: "city", segs: PREMISES, method: "online", order: 55, cur: "MXN",
    form: "Licencia municipal de giro", title: ["Municipal business licence (Zapopan)", "市级经营许可（萨波潘）"], agency: ["Gobierno de Zapopan, Dirección de Padrón y Licencias", "萨波潘市政府许可登记处"],
    how: ["Shops and restaurants get the city's licence for their activity from the Dirección de Padrón y Licencias.", "门店和餐厅须向市许可登记处取得针对其经营活动的许可。"],
    url: "https://www.zapopan.gob.mx", proof: [ZAP_LIC, "Objetivo del Procedimiento: Dar de alta las licencias municipales.", "Purpose of the procedure: to register municipal licences."] }),
  V({ id: "mx-zap-uso-suelo", where: "MX-ZAP", level: "city", segs: PREMISES, method: "online", order: 50, cur: "MXN",
    form: "Dictamen de uso de suelo", title: ["Land use opinion for the licence (Zapopan)", "经营许可所需的土地用途意见（萨波潘）"], agency: ["Gobierno de Zapopan, Dirección de Ordenamiento del Territorio", "萨波潘市政府国土规划局"],
    how: ["Where the licence needs it, the city first issues a land use opinion for the activity at the address.", "如经营许可需要，市政府会先就该地址的经营活动出具土地用途意见。"],
    url: "https://www.zapopan.gob.mx", proof: [ZAP_LIC, "Canaliza al ciudadano para tramitar el pre dictamen de uso de suelo.", "Sends the applicant to apply for the preliminary land use opinion."] }),
  /* Querétaro */
  V({ id: "mx-qro-licencia", where: "MX-QRO", level: "city", segs: PREMISES, method: "in_person", order: 55, cur: "MXN",
    form: "Licencia Municipal de Funcionamiento", title: ["Municipal operating licence (Querétaro)", "市级经营许可（克雷塔罗）"], agency: ["Municipio de Querétaro, Departamento de Licencias de Funcionamiento", "克雷塔罗市经营许可处"],
    how: ["A new business applies for the city's operating licence with the land use opinion and the activity's feasibility; low and medium risk businesses can do all three in one SARE application.", "新企业须持土地用途意见和经营可行性证明申请市级经营许可；中低风险企业可通过 SARE 一次办理三项。"],
    url: "https://municipiodequeretaro.gob.mx", proof: [QRO_OPEN, "Deberá tramitar su Licencia Municipal de Funcionamiento", "You must apply for your Municipal Operating Licence"] }),
  V({ id: "mx-qro-uso-suelo", where: "MX-QRO", level: "city", segs: PREMISES, method: "in_person", order: 50, cur: "MXN",
    form: "Dictamen de Uso de Suelo y Factibilidad de Giro", title: ["Land use opinion and activity feasibility (Querétaro)", "土地用途意见与经营可行性（克雷塔罗）"], agency: ["Municipio de Querétaro, Desarrollo Urbano", "克雷塔罗市城市发展局"],
    how: ["The land use opinion and the activity feasibility come before the operating licence.", "土地用途意见和经营可行性须在经营许可之前取得。"],
    url: "https://municipiodequeretaro.gob.mx", proof: [QRO_OPEN, "solicitando Dictamen de Uso de Suelo y Factibilidad de Giro", "applying for the Land Use Opinion and Activity Feasibility"] }),
  V({ id: "mx-qro-pc", where: "MX-QRO", level: "city", segs: PREMISES, method: "in_person", order: 67, cur: "MXN",
    form: "No inconveniente de Protección Civil", title: ["Civil protection clearance (Querétaro)", "民防无异议证明（克雷塔罗）"], agency: ["Municipio de Querétaro, Unidad Municipal de Protección Civil", "克雷塔罗市民防处"],
    how: ["The city's civil protection unit issues its clearance (no inconveniente) for the premises as part of the opening.", "市民防处在开业手续中为场所出具无异议证明。"],
    url: "https://municipiodequeretaro.gob.mx", proof: [QRO_OPEN, "No inconveniente de Protección Civil.", "Civil protection clearance."] }),
  V({ id: "mx-qro-anuncio", where: "MX-QRO", level: "city", segs: STORES, needs: { signage: true }, method: "in_person", order: 80, cur: "MXN",
    form: "Licencia de anuncios (Reglamento de Imagen Urbana)", title: ["Sign licence (Querétaro)", "招牌许可（克雷塔罗）"], agency: ["Municipio de Querétaro, Desarrollo Urbano", "克雷塔罗市城市发展局"],
    how: ["A new sign needs the city's sign licence under its urban image rules, applied for before the sign goes up.", "新招牌须依市城市形象规定，在安装前申请招牌许可。"],
    url: "https://municipiodequeretaro.gob.mx", proof: [QRO_SIGN, "Es la primera vez que se solicita la licencia de anuncios.", "It is the first time the sign licence is applied for."] }),
  V({ id: "mx-qro-alcohol", where: "MX-QRO", level: "city", segs: STORES, needs: { alcohol: true }, method: "in_person", order: 71, cur: "MXN",
    form: "Licencia para la Venta de Bebidas Alcohólicas", title: ["Alcohol licence (Querétaro)", "酒类许可（克雷塔罗）"], agency: ["Municipio de Querétaro", "克雷塔罗市政府"],
    how: ["A business that sells or serves alcohol applies for the alcohol licence as well as the operating licence.", "销售酒类的企业除经营许可外，还须申请酒类许可。"],
    url: "https://municipiodequeretaro.gob.mx", proof: [QRO_OPEN, "a tramitar la Licencia para la Venta de Bebidas Alcohólicas.", "to apply for the Licence to Sell Alcoholic Beverages."] }),
  /* Tijuana: the city's fast opening system (SARE) issues the land use opinion, the safety certificate and the licence */
  ...([
    ["mx-tij-licencia", 55, "Licencia de Operación", ["Operating licence (Tijuana)", "经营许可（蒂华纳）"], "licence"],
    ["mx-tij-uso-suelo", 50, "Dictamen de uso de suelo", ["Land use opinion (Tijuana)", "土地用途意见（蒂华纳）"], "use"],
    ["mx-tij-seguridad", 67, "Certificado de medidas de Seguridad", ["Safety measures certificate (Tijuana)", "安全措施证明（蒂华纳）"], "safety"],
  ] as const).map(([id, order, form, title]) => V({ id, where: "MX-TIJ", level: "city", segs: PREMISES, method: "online", order, cur: "MXN", form, title,
    agency: ["Ayuntamiento de Tijuana, Secretaría de Desarrollo Económico (SEDETI)", "蒂华纳市经济发展局（SEDETI）"],
    how: ["Through the city's fast opening system (SARE), a low or medium impact business of up to 100 square metres gets the land use opinion, the safety measures certificate and the operating licence together; larger ones apply to each office.", "通过市快速开业系统（SARE），面积不超过 100 平方米的中低影响企业可一并取得土地用途意见、安全措施证明和经营许可；更大的企业须分别向各部门申请。"],
    url: TIJ_SARE, proof: [TIJ_SARE, TIJ_Q, TIJ_EN] })),
  /* Puebla: the city's pages could not be read */
  V({ id: "mx-pue-licencia", where: "MX-PUE", level: "city", segs: PREMISES, method: "in_person", order: 55, cur: "MXN",
    form: "Licencia de funcionamiento", title: ["Municipal operating licence (Puebla)", "市级经营许可（普埃布拉）"], agency: ["Ayuntamiento de Puebla", "普埃布拉市政府"],
    how: ["Shops and restaurants get the city's operating licence for their activity.", "门店和餐厅须取得市政府针对其经营活动的经营许可。"], url: "https://pueblacapital.gob.mx" }),
  V({ id: "mx-pue-uso-suelo", where: "MX-PUE", level: "city", segs: PREMISES, method: "in_person", order: 50, cur: "MXN",
    form: "Licencia de uso de suelo", title: ["Land use licence (Puebla)", "土地用途许可（普埃布拉）"], agency: ["Ayuntamiento de Puebla, Gerencia del Centro Histórico y Desarrollo Urbano", "普埃布拉市政府城市发展部门"],
    how: ["The city confirms the land use for the activity at the address before the operating licence.", "经营许可之前，市政府须确认该地址经营活动的土地用途。"], url: "https://pueblacapital.gob.mx" }),
  /* Mexico City's sign rules: the city's sites didn't answer */
  V({ id: "mx-cdmx-anuncio", where: "MX-CMX", level: "city", segs: STORES, needs: { signage: true }, method: "online", order: 80, cur: "MXN",
    form: "Licencia o aviso de anuncio denominativo", title: ["Sign licence or notice (Mexico City)", "招牌许可或备案（墨西哥城）"], agency: ["Secretaría de Desarrollo Urbano y Vivienda (SEDUVI)", "墨西哥城城市发展与住房局（SEDUVI）"],
    how: ["A business's own sign (anuncio denominativo) is authorised under the city's outdoor advertising rules.", "企业自身招牌（anuncio denominativo）须依墨西哥城户外广告规定取得许可。"], url: "https://www.seduvi.cdmx.gob.mx" }),
];

const MEXICO_FIXES: Fix[] = [
  P("mx-infonavit", LIFNVT, "Proceder a inscribirse e inscribir a sus trabajadores en el Instituto y dar los avisos a que se refiere el Artículo 31", "Register with the Institute and register its workers, and give the notices article 31 requires",
    "Proof added from the INFONAVIT Law, article 29, on the Chamber of Deputies' official legislation site (diputados.gob.mx): portalmx.infonavit.org.mx refused the connection."),
  P("mx-mx-cmx-isn", CMX_ISN, "Si a la fecha no se encuentra registrado en el Padrón del Impuesto Sobre Nóminas, le aparecera la opción de Alta al Padrón.", "If you are not yet registered in the Payroll Tax Register, the option to register appears.",
    "Proof added from the user manual of the Secretaría de Administración y Finanzas's payroll tax system (finanzas.cdmx.gob.mx), where the registration is made."),
  P("mx-nle-isn", NL_HACIENDA, "Es objeto de este impuesto la realización de pagos en efectivo, en servicios o en especie por concepto de remuneraciones al trabajo personal,", "The tax falls on payments in cash, services or kind as pay for personal work,",
    "Proof added from Nuevo León's Ley de Hacienda, article 154, on the state congress's site (hcnl.gob.mx): nl.gob.mx answered 403."),
  P("mx-jal-isn", JAL_CFE, "Las personas físicas o jurídicas que habitualmente cubran las remuneraciones a que se refiere la Ley de Hacienda del Estado, deberán inscribirse,", "Individuals or companies that regularly pay the wages the state's Ley de Hacienda covers must register,",
    "Proof added from Jalisco's Código Fiscal as the state congress publishes it (May 2026 text): hacienda.jalisco.gob.mx returns an empty script shell. The agency now names the Servicio Estatal Tributario the code charges with the register.",
    { agency: { en: "Servicio Estatal Tributario de Jalisco (Secretaría de la Hacienda Pública)", zh: "哈利斯科州税务局（公共财政厅）" } }),
  P("mx-mty-pc", NL_PC, NL_PC_Q, NL_PC_EN, "Proof added from Nuevo León's Civil Protection Law, article 45, on the state congress's site: monterrey.gob.mx names Protección Civil only in menus."),
  P("mx-mty-alcohol", NL_ALCOHOL, NL_ANUENCIA_Q, NL_ANUENCIA_EN, "Proof added from Nuevo León's alcohol law, article 2, on the state congress's site: the anuencia is the city's resolution the state's licence rests on (mx-nle-alcohol)."),
];

/* ------------------------------------------------------------------ Saudi Arabia */
const MISA_LAW = (f: string) => `https://misa.gov.sa/app/uploads/${f}`;
const SA_CR = MISA_LAW("2025/07/Commercial-Register-Law.pdf"), SA_INV = MISA_LAW("2024/08/Investment-Law.pdf"), SA_CO = MISA_LAW("2025/07/Companies-Law.pdf"), SA_GOSI = MISA_LAW("2025/07/Social-Insurance-Law.pdf");
const SA_VAT = "https://zatca.gov.sa/en/RulesRegulations/Taxes/Documents/Implmenting%20Regulations%20of%20the%20VAT%20Law_EN.pdf";
const SA_LIC = "https://momah.gov.sa/en/e-services/issuing-commercial-license";
const SA_BUILD = "https://momah.gov.sa/en/e-services/issuance-building-license";
const SA_HEALTH = "https://momah.gov.sa/en/e-services/issuance-health-certificate";
const SA_SFDA = "https://sfda.gov.sa/sites/default/files/2025-02/GuideObtainingLicenseOperateFoodFeedManufacturersWarehouses.pdf";
const BOE = "the Bureau of Experts' official translation, published by the Ministry of Investment (misa.gov.sa)";

const SAUDI_NEW: OfficialForm[] = [
  V({ id: "sa-company", where: "SA", level: "federal", needs: { newEntity: true }, method: "online", order: 8, cur: "SAR",
    form: "Articles of association and incorporation (Companies Law)", title: ["Company incorporation under the Companies Law", "依《公司法》设立公司"],
    agency: ["Ministry of Commerce (Saudi Business Center)", "沙特商务部（沙特商业中心）"],
    how: ["The company signs its articles of association and is incorporated by registration in the Commercial Register, through the Saudi Business Center; a foreign investor registers with the Ministry of Investment first.", "公司签署章程，并通过沙特商业中心在商业登记处登记后成立；外国投资者须先向投资部登记。"],
    url: "https://business.sa", proof: [SA_CO, "A company shall acquire a legal personality upon registration with the Commercial Register."] }),
  V({ id: "sa-building", where: "SA", level: "city", segs: PREMISES, needs: { buildout: true }, method: "online", order: 50, cur: "SAR",
    form: "Building permit (Balady)", title: ["Building permit for the works (Balady)", "施工建筑许可（Balady）"],
    agency: ["The municipality, through the Ministry of Municipalities and Housing's Balady platform", "所在市政府（经市政与住房部 Balady 平台）"],
    how: ["Construction or renovation work starts only with the municipality's building permit, applied for on Balady with plans approved by an accredited engineering office; the commercial licence asks for a copy of it.", "施工或装修须先取得市政府的建筑许可，经认证工程事务所批准图纸后在 Balady 申请；申请商业许可时须提交其副本。"],
    url: SA_BUILD, proof: [SA_BUILD, "enables beneficiaries to commence construction work in compliance with applicable regulations, after fulfilling the requirements"] }),
  V({ id: "sa-health-certificate", where: "SA", level: "city", segs: STORES, needs: { food: true }, method: "online", order: 74, cur: "SAR",
    form: "Health certificate for food workers (Balady)", title: ["Health certificates for food workers (Balady)", "食品从业人员健康证（Balady）"],
    agency: ["The municipality, through the Ministry of Municipalities and Housing's Balady platform", "所在市政府（经市政与住房部 Balady 平台）"],
    how: ["Each worker in a restaurant or food shop gets a municipal health certificate on Balady after a medical examination.", "餐厅或食品店的每名员工须经体检后在 Balady 取得市政健康证。"],
    url: SA_HEALTH, proof: [SA_HEALTH, "enables the issuance of health certificates for workers in food and public health establishments, such as restaurants,"] }),
];

const SAUDI_FIXES: Fix[] = [
  P("sa-cr", SA_CR, "Every merchant must register in the Commercial Register.", undefined, `Proof added from the Commercial Register Law, article 5, in ${BOE}: mc.gov.sa refused the connection.`),
  P("sa-misa", SA_INV, "A foreign investor shall register with the Ministry prior to engaging in any investment,", undefined,
    `Proof added from the Investment Law, article 7, in ${BOE}. The new law replaced the investment licence with a registration, so the entry is retitled.`,
    { title: { en: "Foreign investment registration with the Ministry of Investment (MISA)", zh: "向沙特投资部（MISA）办理外商投资登记" } }),
  P("sa-zatca", SA_VAT, "the Person must apply to the Authority to register within thirty (30) days of the end of that month", undefined,
    "Proof added from the VAT Implementing Regulations on ZATCA's own site (zatca.gov.sa): its service pages carry no sentence stating the registration."),
  P("sa-gosi", SA_GOSI, "An employer shall pay the full amount of contributions due from him and from the contributor within the time limit specified in the Regulations,", undefined,
    `Proof added from the Social Insurance Law, article 9, in ${BOE}: gosi.gov.sa returns an empty script shell.`),
  P("sa-balady", SA_LIC, "allows users to commence commercial activities by issuing a Commercial License, along with a Safety Permit issued by the General Directorate of Civil Defense", undefined,
    "Proof added from the Ministry of Municipalities and Housing's own page for the Balady service (momah.gov.sa): balady.gov.sa refused the connection."),
  P("sa-civil-defense", SA_LIC, "along with a Safety Permit issued by the General Directorate of Civil Defense for all commercial activities", undefined,
    "Proof added from the Ministry of Municipalities and Housing's Balady page: the Civil Defense safety permit is issued with the commercial licence (998.gov.sa wasn't readable)."),
  P("sa-sfda", SA_SFDA, "Applications for obtaining a license are submitted through the unified electronic system", undefined,
    "Proof added from SFDA's own guide to licensing food manufacturers and warehouses (sfda.gov.sa, 2025)."),
];

/* ------------------------------------------------------------------ the EU's import registration, and Lyon */
const IE_EORI = "https://www.revenue.ie/en/customs/businesses/electronic-systems/eori-system.aspx";
const NL_EORI = "https://ondernemersplein.overheid.nl/internationaal-ondernemen/douane-en-belastingen/eori-nummer";
const ES_EORI = "https://sede.agenciatributaria.gob.es/Sede/censos-nif-domicilio-fiscal/quien-debe-estar-censado/registro-identificacion-operadores-economicos/solicitantes-eori.html";
const LYON_ERP = "https://www.lyon.fr/demarche/commerces-et-entreprises/rendre-accessible-son-etablissement-recevant-du-public-erp";
const EORI = (id: string, where: string, agency: T, how: T, url: string, quote: string, en?: string) => V({ id, where, level: "federal", segs: ["seller", "warehouse", "retail"], needs: { imports: true }, method: "online", order: 35, cur: "EUR",
  form: "EORI number", title: ["EORI number for importing", "进口所需的 EORI 编号"], agency, how, url, proof: en ? [url, quote, en] : [url, quote] });

const EUROPE_NEW: OfficialForm[] = [
  EORI("ie-eori", "IE", ["Revenue Commissioners (Irish customs), through ROS", "爱尔兰税务局（海关），经 ROS 办理"], ["An importer registers for an EORI number on the Revenue Online Service before its first customs declaration.", "进口商须在首次报关前通过爱尔兰税务在线服务（ROS）登记 EORI 编号。"],
    IE_EORI, "If you are a trader who imports or exports goods into or out of the European Union (EU), you will need an EORI number."),
  EORI("nl-eori", "NL", ["Douane (Dutch customs)", "荷兰海关"], ["An importer that deals with customs applies to Dutch customs for its EORI number, free of charge.", "与海关往来的进口商须免费向荷兰海关申请 EORI 编号。"],
    NL_EORI, "Exporteert of importeert u? En heeft u contact met de Douane? Dan is een EORI-nummer verplicht.", "Do you export or import, and deal with customs? Then an EORI number is compulsory."),
  EORI("es-eori", "ES", ["Agencia Tributaria, Aduanas", "西班牙税务局海关"], ["An importer registers for an EORI number with the Agencia Tributaria before trading outside the EU.", "进口商须在与欧盟以外地区贸易前向西班牙税务局登记 EORI 编号。"],
    ES_EORI, "Infórmate de cómo registrarte para poder realizar operaciones de comercio exterior en España (UE)", "How to register so you can trade with countries outside the EU from Spain"),
  V({ id: "fr-lyon-erp", where: "FR-LYON", level: "city", segs: PREMISES, needs: { buildout: true }, method: "pdf_mail", order: 65, cur: "EUR",
    form: "Demande d'autorisation de construire, d'aménager ou de modifier un ERP", title: ["Works approval for a public venue (autorisation de travaux ERP, Lyon)", "公众场所施工许可（ERP，里昂）"],
    agency: ["Ville de Lyon, Direction de l'Aménagement Urbain", "里昂市政府城市规划部门"],
    how: ["Fitting out a shop or restaurant open to the public needs the city's works approval for the venue (ERP), filed with the city on the national form with the accessibility and fire safety files.", "装修对公众开放的商店或餐厅须取得市政府的公众场所（ERP）施工许可，以全国统一表格连同无障碍和消防安全材料向市政府提交。"],
    url: LYON_ERP, proof: [LYON_ERP, "veuillez déposer une demande d’autorisation de travaux auprès de la Ville de Lyon.", "please file a works approval application with the City of Lyon."] }),
  V({ id: "de-fra-bau", where: "DE-FRA", level: "city", segs: PREMISES, needs: { buildout: true }, method: "online", order: 65, cur: "EUR",
    form: "Bauantrag oder Antrag auf Nutzungsänderung", title: ["Building permit or change of use (Frankfurt)", "建筑许可或用途变更（法兰克福）"],
    agency: ["Stadt Frankfurt am Main, Bauaufsicht", "法兰克福市建筑监管局"],
    how: ["Building works, or using the premises for a restaurant or shop when they were approved for another use, need the city's building authority's approval.", "施工，或将原批准为其他用途的场所改作餐厅或商店，须取得市建筑监管局批准。"], url: "https://frankfurt.de" }),
];

/* ------------------------------------------------------------------ Kuwait and Israel */
const KW_KDIPA = "https://kdipa.gov.kw/investors-service-center/investment-licensing-procedures/";
const TLV_SIGN = "https://www.tel-aviv.gov.il/Business/Advertising/Pages/SignRequest.aspx";
const REST_NEW: OfficialForm[] = [
  V({ id: "il-tlv-sign", where: "IL-TLV", level: "city", segs: STORES, needs: { signage: true }, method: "in_person", order: 80, cur: "ILS",
    form: "בקשה לרישיון שילוט", title: ["Sign licence (Tel Aviv-Yafo)", "招牌许可（特拉维夫-雅法）"], agency: ["Tel Aviv-Yafo Municipality, Signage Department", "特拉维夫-雅法市政府招牌部门"],
    how: ["A business sign needs the city signage committee's licence and the signage fee before it goes up.", "商业招牌须在安装前取得市招牌委员会的许可并缴纳招牌费。"],
    url: TLV_SIGN, proof: [TLV_SIGN, "אין להציב שילוט טרם קבלת רישיון להצבתו.", "No sign may be put up before a licence to put it up is received."] }),
];
const REST_FIXES: Fix[] = [
  P("kw-kdipa", KW_KDIPA, "Submit The Application Request Form on KDIPA’s Investor Service Portal", undefined, "Proof added from KDIPA's own investment licensing procedures page (kdipa.gov.kw)."),
];

export const NATIONS_FORMS: OfficialForm[] = [...MEXICO_NEW, ...SAUDI_NEW, ...EUROPE_NEW, ...REST_NEW];
export const NATIONS_FIXES: Fix[] = [...MEXICO_FIXES, ...SAUDI_FIXES, ...REST_FIXES];

/** What still blocks each entry this pass added or read again and left UNVERIFIED (read 2026-10-27). */
export const NATIONS_BLOCKED: Record<string, string> = {
  "mx-bcn-isn": "Baja California's Ley de Hacienda wasn't found on a readable official page (the judiciary's copy answered 403)",
  "mx-mex-isn": "legislacion.edomex.gob.mx and edomex.gob.mx refused the connection",
  "mx-roo-isn": "the Quintana Roo payroll tax law's links on qroo.gob.mx answered 404 or refused the connection",
  "mx-cdmx-pc": "proteccioncivil.cdmx.gob.mx refused the connection, and the city congress's site (congresocdmx.gob.mx) answered 502",
  "mx-cdmx-anuncio": "seduvi.cdmx.gob.mx and cdmx.gob.mx refused the connection, and congresocdmx.gob.mx answered 502",
  "mx-pue-licencia": "pueblacapital.gob.mx's procedures page names no licence, and its regulations PDF answered 404",
  "mx-pue-uso-suelo": "pueblacapital.gob.mx's procedures page names no land use step, and its regulations PDF answered 404",
  "de-fra-bau": "frankfurt.de refuses automated reads (403, robots) and Hessen's law portal builds in script",
};
/* VERIFY_BLOCKED (src/forms/verify.ts) is the one list scripts/registry-test.ts and docs/COVERAGE.md read: this pass takes
   off the entries it proved and adds its own, without touching the verification pass's file. */
for (const f of NATIONS_FIXES) delete VERIFY_BLOCKED[f.id];
Object.assign(VERIFY_BLOCKED, NATIONS_BLOCKED);
