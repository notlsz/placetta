// Mexico: what a brand files to open and run a store in Mexico City, Monterrey, Guadalajara and Cancún, read from the
// governments' own pages on 2026-10-21 (sat.gob.mx and gob.mx for SAT and COFEPRIS, the Congress of Mexico City's
// published Ley de Establecimientos Mercantiles, the Municipio de Monterrey's own procedures). Same rules as
// src/forms/europe.ts: a Spanish sentence of under 25 words with its English translation, the URL and the day; no quote,
// no claim (the row abstains and names the office). Mexico City's own portals (cdmx.gob.mx, sedeco.cdmx.gob.mx) refused
// every automated read, so its steps are quoted from the law they apply. IMSS's pages refused every read too, so the
// employer registration abstains and names IMSS.
import type { OfficialForm, Segment } from "./registry";
import { E } from "./europe";

type T = readonly [string, string];
const PREMISES: Segment[] = ["restaurant", "retail", "warehouse"];
const SAT = "https://www.sat.gob.mx/gobmx/Paginas/Ficha_43_cff.html";
const COFEPRIS = "https://www.gob.mx/cms/uploads/attachment/file/348567/Instructivo_Aviso_Funcionamiento.pdf";
const LEM = "https://www.congresocdmx.gob.mx/media/documentos/674707c7d7b1fd7d269dc81619514990e9551158.pdf";
const MTY_EDIF = "https://www.monterrey.gob.mx/pdf/new/Procedimientos/Sedue/P_SDU_DEC_16_Licencia_del_Uso_de_Edificacion.pdf";
const CDMX_SYS: T = ["Mexico City alcaldía, through SEDECO's SIAPEM system", "墨西哥城所在区政府（经经济发展局 SIAPEM 系统）"];

export const MEXICO_FORMS: OfficialForm[] = [
  E({ id: "mx-sociedad", where: "MX", level: "federal", needs: { newEntity: true }, method: "in_person", order: 8, cur: "MXN",
    form: "Acta constitutiva protocolizada", title: ["Company incorporation before a Mexican notary (fedatario público)", "在墨西哥公证人（fedatario público）面前设立公司"], agency: ["Notario or corredor público, then the Registro Público de Comercio", "公证人或商业公证员，之后在商业公共登记处登记"],
    how: ["The company (an S.A. de C.V. or S. de R.L. de C.V.) is formed by a deed notarised in Mexico and entered in the commercial public register; the SAT asks for the notarised deed at the RFC registration.", "公司（S.A. de C.V. 或 S. de R.L. de C.V.）须以在墨西哥公证的文书设立，并在商业公共登记处登记；税务局办理 RFC 登记时要求提供经公证的设立文书。"],
    url: "https://www.gob.mx/se",
    specialist: ["A Mexican notary or commercial broker (notario or corredor público) executes the deed; documents signed abroad are apostilled and formalised before one. Placetta prepares them and hands them over.", "设立文书须由墨西哥公证人或商业公证员出具；境外签署的文件须办理海牙认证，并经其正式确认。快哉准备文件并交给对方。"],
    proof: [SAT, "Documento constitutivo protocolizado (copia certificada).", "Notarised deed of incorporation (certified copy)."] }),
  E({ id: "mx-rfc", where: "MX", level: "federal", method: "online", order: 20, cur: "MXN",
    form: "Solicitud de inscripción en el RFC de personas morales (ficha 43/CFF)", title: ["Federal taxpayer registration (RFC) with the SAT", "向税务局（SAT）办理联邦纳税人登记（RFC）"], agency: ["Servicio de Administración Tributaria (SAT)", "墨西哥税务局（SAT）"],
    how: ["A new company's legal representative pre-registers on the SAT portal and finishes at a SAT office within ten days, with the notarised deed and proof of the fiscal address; it gets the RFC and the tax status certificate.", "新公司的法定代表人在 SAT 门户预登记，并须在十天内到 SAT 办事处完成，提交经公证的设立文书和税务地址证明；随后取得 RFC 和税务身份证明。"],
    url: "https://www.sat.gob.mx", foreign: ["A power of attorney granted abroad must be apostilled or legalised, formalised before a Mexican notary and translated by an authorised expert.", "境外出具的授权书须办理海牙认证或领事认证，经墨西哥公证人正式确认，并由授权译员翻译。"],
    proof: [SAT, "Personas morales de nueva creación a través de sus representantes legales", "Newly created companies, through their legal representatives"] }),
  E({ id: "mx-imss", where: "MX", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "MXN",
    form: "Alta patronal (IMSS-02-001)", title: ["Employer registration with the IMSS", "向墨西哥社会保险局（IMSS）办理雇主登记"], agency: ["Instituto Mexicano del Seguro Social (IMSS)", "墨西哥社会保险局（IMSS）"],
    how: ["The company registers as an employer with the IMSS and enrols each worker.", "公司须向 IMSS 登记为雇主，并为每位员工参保。"], url: "https://www.gob.mx/imss" }),
  E({ id: "mx-cofepris", where: "MX", level: "federal", segs: ["restaurant", "retail", "warehouse"], needs: { food: true }, method: "online", order: 74, cur: "MXN",
    form: "COFEPRIS-05-018 Aviso de Funcionamiento", title: ["Health notice of operation (aviso de funcionamiento) for a food establishment", "食品经营场所卫生经营通知（aviso de funcionamiento）"], agency: ["COFEPRIS (or the state health protection authority)", "联邦卫生风险保护委员会（COFEPRIS）或州卫生保护机构"],
    how: ["A new establishment that makes or handles food notifies the health authority on form COFEPRIS-05-018; where a health officer is required, that notice goes in at the same time.", "制作或处理食品的新场所须以 COFEPRIS-05-018 表通知卫生机构；须设卫生负责人的，同时提交负责人通知。"],
    url: "https://www.gob.mx/cofepris",
    proof: [COFEPRIS, "Cuando se trate de la notificación de un establecimiento nuevo o de una nueva sucursal.", "When notifying a new establishment or a new branch."] }),
  /* Mexico City: the Ley de Establecimientos Mercantiles and its online system (SIAPEM) */
  E({ id: "mx-cdmx-vecinal", where: "MX-CMX", level: "city", segs: ["restaurant"], method: "online", order: 55, cur: "MXN",
    form: "Aviso de Funcionamiento para Establecimiento Mercantil de Impacto Vecinal", title: ["Notice of operation for a restaurant (impacto vecinal)", "餐厅经营通知（邻里影响类）"], agency: CDMX_SYS,
    how: ["Restaurants are businesses of neighbourhood impact: the operator files the notice of operation online in SIAPEM, with the land use certificate for the activity.", "餐厅属于邻里影响类场所：经营者须在 SIAPEM 在线提交经营通知，并附该经营活动的土地用途证明。"], url: "https://siapem.sedeco.cdmx.gob.mx",
    proof: [LEM, "presenten por medio del Sistema un Aviso de Funcionamiento para Establecimiento Mercantil de Impacto Vecinal", "file through the System a Notice of Operation for a Commercial Establishment of Neighbourhood Impact"] }),
  E({ id: "mx-cdmx-bajo", where: "MX-CMX", level: "city", segs: ["retail", "warehouse"], method: "online", order: 55, cur: "MXN",
    form: "Aviso para el funcionamiento de establecimientos mercantiles con giro de bajo impacto", title: ["Notice of operation for a low-impact business", "低影响类场所经营通知"], agency: CDMX_SYS,
    how: ["Shops and other low-impact businesses file their notice online in SIAPEM before operating.", "商店及其他低影响类场所须在经营前于 SIAPEM 在线提交通知。"], url: "https://siapem.sedeco.cdmx.gob.mx",
    proof: [LEM, "Para el funcionamiento de los establecimientos a que se refiere este Título, los titulares deberán ingresar el Aviso correspondiente al Sistema", "For the establishments this Title covers to operate, the holders must file the corresponding Notice in the System"] }),
  E({ id: "mx-cdmx-zonificacion", where: "MX-CMX", level: "city", segs: PREMISES, method: "online", order: 50, cur: "MXN",
    form: "Certificado de Zonificación de uso del suelo", title: ["Land use certificate for the activity (uso de suelo)", "经营活动土地用途证明（uso de suelo）"], agency: ["Secretaría de Desarrollo Urbano y Vivienda (SEDUVI)", "墨西哥城城市发展与住房局（SEDUVI）"],
    how: ["The land use certificate for the activity at the address is part of the notice of operation.", "该地址经营活动的土地用途证明是经营通知的一部分。"], url: "https://www.seduvi.cdmx.gob.mx",
    proof: [LEM, "Certificado de Zonificación de uso del suelo para el giro que se pretende operar", "Land use zoning certificate for the activity to be operated"] }),
  E({ id: "mx-cdmx-enseres", where: "MX-CMX", level: "city", segs: ["restaurant"], needs: { terrace: true }, method: "online", order: 73, cur: "MXN",
    form: "Aviso de colocación de enseres en vía pública", title: ["Notice for tables on the street (enseres)", "街道摆放桌椅通知（enseres）"], agency: CDMX_SYS,
    how: ["A place selling prepared food or drinks may put tables on the street after filing the notice in SIAPEM and paying the fee in the city's tax code.", "销售预制食品或饮料的场所，在 SIAPEM 提交通知并按城市税法缴费后，方可在街道摆放桌椅。"], url: "https://siapem.sedeco.cdmx.gob.mx",
    proof: [LEM, "podrán colocar en la vía pública enseres e instalaciones que sean necesarios para la prestación de sus servicios, previo aviso que ingresen al Sistema", "may place on the street the furniture and fittings their service needs, after a notice filed in the System"] }),
  /* Monterrey (Nuevo León) */
  E({ id: "mx-mty-edificacion", where: "MX-MTY", level: "city", segs: PREMISES, method: "in_person", order: 50, cur: "MXN",
    form: "Licencia de Uso de Edificación", title: ["Building use licence (uso de edificación), or the SARE fast track", "建筑用途许可（uso de edificación）或 SARE 快速通道"], agency: ["Municipio de Monterrey, Secretaría de Desarrollo Urbano Sostenible", "蒙特雷市可持续城市发展局"],
    how: ["The city authorises the building's specific use (a shop, a restaurant, a warehouse) before it operates; low-risk businesses can use the fast-opening system (SARE).", "城市须在经营前批准建筑的具体用途（商店、餐厅、仓库）；低风险企业可使用快速开业系统（SARE）。"], url: MTY_EDIF,
    proof: [MTY_EDIF, "solicitar la autorización del municipio para hacer construcciones en diferentes zonas habitacionales y determinar el funcionamiento específico del predio", "apply for the city's authorisation to build in different zones and set the property's specific use"] }),
  E({ id: "mx-mty-pc", where: "MX-MTY", level: "city", segs: PREMISES, method: "in_person", order: 67, cur: "MXN",
    form: "Visto bueno de Protección Civil", title: ["Civil protection sign-off", "民防安全审批"], agency: ["Municipio de Monterrey, Dirección de Protección Civil", "蒙特雷市民防局"],
    how: ["The city's civil protection office reviews the premises' safety measures.", "市民防局审查场所的安全措施。"], url: "https://www.monterrey.gob.mx" }),
  /* Guadalajara and Cancún: the library has no quote of their pages yet, so these rows name the office and its site */
  E({ id: "mx-gdl-licencia", where: "MX-GDL", level: "city", segs: PREMISES, method: "online", order: 55, cur: "MXN",
    form: "Licencia de giro", title: ["Municipal business licence (licencia de giro)", "市级经营许可（licencia de giro）"], agency: ["Gobierno de Guadalajara, Padrón y Licencias", "瓜达拉哈拉市政府许可登记处"],
    how: ["Shops and restaurants get the city's business licence for their activity.", "门店和餐厅须取得市政府针对其经营活动的许可。"], url: "https://guadalajara.gob.mx" }),
  E({ id: "mx-cun-licencia", where: "MX-CUN", level: "city", segs: PREMISES, method: "online", order: 55, cur: "MXN",
    form: "Licencia de funcionamiento", title: ["Municipal operating licence (Benito Juárez, Cancún)", "市级经营许可（贝尼托华雷斯市，坎昆）"], agency: ["Municipio de Benito Juárez (Cancún)", "贝尼托华雷斯市政府（坎昆）"],
    how: ["Shops and restaurants get the municipality's operating licence.", "门店和餐厅须取得市政府的经营许可。"], url: "https://cancun.gob.mx" }),
];
