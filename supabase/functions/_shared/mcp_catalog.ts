// The apps a restaurant or food business can connect in one click, each through the app's own remote MCP server.
// Shared by the integrations function (which connects them) and Settings (which lists them): plain data, no imports.
//
// Every address was checked against the app's own documentation and probed on 2026-10-17: each answers an MCP
// initialize with 401 and a WWW-Authenticate header naming its sign-in metadata, whose sign-in server supports PKCE
// with S256. How each one lets Placetta register itself decides what it needs:
//   dynamic registration (RFC 7591) or client metadata documents: one click, nothing to set up
//     Notion, Airtable, Linear, Square, Stripe, Zapier, Dropbox
//   only clients registered with the app beforehand: Placetta's own client id and secret for that app, kept in the
//   function secrets as MCP_<CLIENT>_CLIENT_ID and MCP_<CLIENT>_CLIENT_SECRET, and bound to the app's issuer
//     Google Drive and Gmail (MCP_GOOGLE_..., a Google Cloud web client marked for an AI agent), Slack (MCP_SLACK_...),
//     Asana (MCP_ASANA_...), HubSpot (MCP_HUBSPOT_..., an MCP connector made in HubSpot), Box (MCP_BOX_...)
// Shopify was left out: its hosted MCP servers are for shoppers (a store's catalog and cart), not the owner's own data.
//
// Sources:
//   Notion     https://developers.notion.com/guides/mcp/build-mcp-client        https://mcp.notion.com/mcp
//   Airtable   https://airtable.com/developers/agents/mcp/getting-started        https://mcp.airtable.com/mcp
//   Google     https://developers.google.com/workspace/guides/configure-mcp-servers
//                drive https://drivemcp.googleapis.com/mcp/v1, gmail https://gmailmcp.googleapis.com/mcp/v1
//   Slack      https://docs.slack.dev/ai/slack-mcp-server/                       https://mcp.slack.com/mcp
//   Linear     https://linear.app/docs/mcp                                       https://mcp.linear.app/mcp
//   Asana      https://developers.asana.com/docs/using-asanas-mcp-server         https://mcp.asana.com/v2/mcp
//   HubSpot    https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server
//                                                                                https://mcp.hubspot.com
//   Square     https://developer.squareup.com/docs/mcp                           https://mcp.squareup.com/mcp
//   Gusto      https://docs.gusto.com/app-integrations/docs/mcp                  https://mcp.api.gusto.com
//   Stripe     https://docs.stripe.com/mcp                                       https://mcp.stripe.com
//   Zapier     https://docs.zapier.com/mcp/get-started/connect/other             https://mcp.zapier.com/api/v1/connect
//   Box        https://developer.box.com/guides/box-mcp/remote/                  https://mcp.box.com
//   Dropbox    https://help.dropbox.com/integrations/connect-dropbox-mcp-server  https://mcp.dropbox.com/mcp

export type L10n = { en: string; zh: string };

export type CatalogEntry = {
  id: string;
  name: string;
  /** The name in Chinese, when the app has one people use. */
  zh?: string;
  url: string;
  /** What Odelia uses it for, in plain words. */
  use: L10n;
  /** Which group it shows under in Settings. */
  group: "docs" | "team" | "tasks" | "money";
  /** The app only takes clients registered with it beforehand: the env group (MCP_<CLIENT>_CLIENT_ID) and the issuer
   *  that client is registered with. */
  client?: string;
  issuer?: string;
  /** Fewer scopes than the app's metadata lists, where the app lists far more than Odelia needs. */
  scope?: string;
  /** Extra sign-in parameters the app needs (Google: offline access for a refresh token). */
  extra?: Record<string, string>;
  /** The app also gives out tokens a person can paste instead of signing in. */
  token?: L10n;
};

const GOOGLE = { client: "google", issuer: "https://accounts.google.com", extra: { access_type: "offline", prompt: "consent" } };

export const MCP_CATALOG: CatalogEntry[] = [
  { id: "notion", name: "Notion", url: "https://mcp.notion.com/mcp", group: "docs",
    use: { en: "Reads your SOPs, opening checklists and permit notes; adds pages you approve", zh: "读取您的标准流程、开业清单和许可笔记；添加您批准的页面" } },
  { id: "gdrive", name: "Google Drive", zh: "Google 云端硬盘", url: "https://drivemcp.googleapis.com/mcp/v1", group: "docs", ...GOOGLE,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    use: { en: "Finds leases, floor plans and certificates in your Drive", zh: "在您的云端硬盘中查找租约、平面图和证书" } },
  { id: "dropbox", name: "Dropbox", url: "https://mcp.dropbox.com/mcp", group: "docs",
    use: { en: "Finds leases, plans and certificates in Dropbox", zh: "在 Dropbox 中查找租约、图纸和证书" } },
  { id: "box", name: "Box", url: "https://mcp.box.com", group: "docs", client: "box", issuer: "https://api.box.com",
    use: { en: "Finds leases, certificates and plans stored in Box", zh: "查找存放在 Box 中的租约、证书和图纸" } },
  { id: "airtable", name: "Airtable", url: "https://mcp.airtable.com/mcp", group: "docs",
    token: { en: "Or paste a personal access token from Airtable", zh: "也可粘贴 Airtable 的个人访问令牌" },
    use: { en: "Reads store trackers and license logs; updates records you approve", zh: "读取门店进度表和证照记录；更新您批准的记录" } },
  { id: "gmail", name: "Gmail", url: "https://gmailmcp.googleapis.com/mcp/v1", group: "team", ...GOOGLE,
    scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
    use: { en: "Searches agency mail and drafts replies you send yourself", zh: "搜索机构来信，起草由您自己发送的回复" } },
  { id: "slack", name: "Slack", url: "https://mcp.slack.com/mcp", group: "team", client: "slack", issuer: "https://mcp.slack.com",
    use: { en: "Finds what your team said about inspections and deliveries; posts updates you approve", zh: "查找团队关于检查和送货的讨论；发布您批准的通知" } },
  { id: "hubspot", name: "HubSpot", url: "https://mcp.hubspot.com", group: "team", client: "hubspot", issuer: "https://mcp.hubspot.com",
    use: { en: "Looks up landlords, contractors and vendors in your contacts", zh: "在您的联系人中查找房东、承包商和供应商" } },
  { id: "linear", name: "Linear", url: "https://mcp.linear.app/mcp", group: "tasks",
    token: { en: "Or paste a Linear API key", zh: "也可粘贴 Linear API 密钥" },
    use: { en: "Tracks opening tasks and inspection follow-ups as issues", zh: "把开业任务和检查跟进记为事项" } },
  { id: "asana", name: "Asana", url: "https://mcp.asana.com/v2/mcp", group: "tasks", client: "asana", issuer: "https://app.asana.com",
    use: { en: "Turns permits and inspections into tasks with due dates", zh: "把许可和检查变成带截止日期的任务" } },
  { id: "zapier", name: "Zapier", url: "https://mcp.zapier.com/api/v1/connect", group: "tasks",
    token: { en: "Or paste the connection token from Zapier's Connect tab", zh: "也可粘贴 Zapier 连接页上的令牌" },
    use: { en: "Reaches the other apps you set up in Zapier, like your scheduling or inventory tools", zh: "通过 Zapier 连接您设置的其他应用，例如排班或库存工具" } },
  // Gusto (added 2026-10-22): https://docs.gusto.com/app-integrations/docs/mcp. Probed that day: tools/list answers 401
  // with resource_metadata; its sign-in server registers clients (registration_endpoint, client_secret_basic or _post) and
  // takes PKCE S256. Only the two read scopes Odelia needs are asked for: the employer's legal name, EIN and locations
  // (get_company), and the team (list_employees) for headcount-based rules. Gusto's own tools that run payroll or file
  // anything aren't reachable with these scopes, and every write still goes through the approval gate.
  { id: "gusto", name: "Gusto", url: "https://mcp.api.gusto.com", group: "money", scope: "companies:read employees:read",
    use: { en: "Reads your company's EIN, locations and headcount for employer filings; needs a Gusto admin", zh: "读取公司的 EIN、门店和员工人数，用于雇主申报；需要 Gusto 管理员" } },
  { id: "square", name: "Square", url: "https://mcp.squareup.com/mcp", group: "money",
    use: { en: "Looks up locations, catalog, orders and team details", zh: "查询门店、商品目录、订单和团队信息" } },
  { id: "stripe", name: "Stripe", url: "https://mcp.stripe.com", group: "money",
    token: { en: "Or paste a restricted key from Stripe", zh: "也可粘贴 Stripe 的受限密钥" },
    use: { en: "Checks invoices, payouts and payments", zh: "查看发票、打款和收款" } },
];

export const catalogEntry = (id: unknown): CatalogEntry | undefined => (typeof id === "string" ? MCP_CATALOG.find((e) => e.id === id) : undefined);
