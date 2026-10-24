// The mailboxes Placetta can sign in to with an authorization code (授权码) or app password, and where their SMTP and
// IMAP servers are. Browser-safe: Settings shows the list and the hints; the integrations function
// (supabase/functions/integrations/mailbox.ts) signs in with it. Nothing secret here.

export type L10n = { en: string; zh: string };

export const MAILBOX_PROVIDERS = ["qq", "163", "126", "sina", "aliyun", "yahoo", "exmail", "qiye163", "qiye_aliyun", "custom"] as const;
export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];
export const isMailboxProvider = (v: unknown): v is MailboxProvider => typeof v === "string" && (MAILBOX_PROVIDERS as readonly string[]).includes(v);

export type Host = { host: string; port: number };
export type Preset = {
  name: L10n;
  smtp: Host;
  imap: Host;
  /** Address domains that pick this provider on their own. */
  domains: string[];
  /** Company mail on the business's own domain. */
  company?: boolean;
  /** The provider's own page on turning on IMAP/SMTP and making the code. */
  help: string;
  /** What to do when the login is refused. */
  hint: L10n;
};

// Hosts and ports from each provider's help pages (checked 2026-10-24): Aliyun Qiye help.aliyun.com/document_detail/36576,
// Tencent Exmail open.work.weixin.qq.com/help2/pc/19886, Yahoo help.yahoo.com/kb/SLN4075; QQ, NetEase and Sina as their
// client-setup pages and every major mail client list them.
export const PRESETS: Record<Exclude<MailboxProvider, "custom">, Preset> = {
  qq: {
    name: { en: "QQ Mail", zh: "QQ 邮箱" },
    smtp: { host: "smtp.qq.com", port: 465 }, imap: { host: "imap.qq.com", port: 993 },
    domains: ["qq.com", "vip.qq.com", "foxmail.com"],
    help: "https://service.mail.qq.com/",
    hint: {
      en: "QQ Mail needs IMAP/SMTP turned on and its authorization code, not your QQ password: QQ Mail, Settings, Account, POP3/IMAP/SMTP service, Generate authorization code.",
      zh: "QQ邮箱需要开启 IMAP/SMTP 服务并使用授权码，不是 QQ 登录密码：QQ邮箱 → 设置 → 账号 → POP3/IMAP/SMTP 服务 → 生成授权码。",
    },
  },
  "163": {
    name: { en: "NetEase 163 Mail", zh: "网易 163 邮箱" },
    smtp: { host: "smtp.163.com", port: 465 }, imap: { host: "imap.163.com", port: 993 },
    domains: ["163.com"],
    help: "https://help.mail.163.com/",
    hint: {
      en: "163 Mail needs IMAP/SMTP turned on and its client authorization code, not your login password: 163 Mail, Settings, POP3/SMTP/IMAP, turn on IMAP/SMTP, then add an authorization code.",
      zh: "163 邮箱需要开启 IMAP/SMTP 服务并使用客户端授权码，不是登录密码：163 邮箱 → 设置 → POP3/SMTP/IMAP → 开启 IMAP/SMTP 服务 → 新增授权密码。",
    },
  },
  "126": {
    name: { en: "NetEase 126 Mail", zh: "网易 126 邮箱" },
    smtp: { host: "smtp.126.com", port: 465 }, imap: { host: "imap.126.com", port: 993 },
    domains: ["126.com"],
    help: "https://help.mail.163.com/",
    hint: {
      en: "126 Mail needs IMAP/SMTP turned on and its client authorization code, not your login password: 126 Mail, Settings, POP3/SMTP/IMAP, turn on IMAP/SMTP, then add an authorization code.",
      zh: "126 邮箱需要开启 IMAP/SMTP 服务并使用客户端授权码，不是登录密码：126 邮箱 → 设置 → POP3/SMTP/IMAP → 开启 IMAP/SMTP 服务 → 新增授权密码。",
    },
  },
  sina: {
    name: { en: "Sina Mail", zh: "新浪邮箱" },
    smtp: { host: "smtp.sina.com", port: 465 }, imap: { host: "imap.sina.com", port: 993 },
    domains: ["sina.com", "sina.cn", "vip.sina.com"],
    help: "https://mail.sina.com.cn/",
    hint: {
      en: "Sina Mail needs IMAP/SMTP turned on and its authorization code: Sina Mail, Settings, Client POP/IMAP/SMTP, turn on the service and its authorization code.",
      zh: "新浪邮箱需要开启 IMAP/SMTP 服务并使用授权码：新浪邮箱 → 设置 → 客户端 POP/IMAP/SMTP → 开启服务并开启授权码。",
    },
  },
  aliyun: {
    name: { en: "Aliyun Mail", zh: "阿里邮箱" },
    smtp: { host: "smtp.aliyun.com", port: 465 }, imap: { host: "imap.aliyun.com", port: 993 },
    domains: ["aliyun.com"],
    help: "https://mail.aliyun.com/",
    hint: {
      en: "Aliyun Mail needs IMAP/SMTP turned on in its settings, then your mailbox password or its third-party client password.",
      zh: "阿里邮箱需要在设置中开启 IMAP/SMTP 服务，然后使用邮箱密码或第三方客户端安全密码。",
    },
  },
  yahoo: {
    name: { en: "Yahoo Mail", zh: "Yahoo 邮箱" },
    smtp: { host: "smtp.mail.yahoo.com", port: 465 }, imap: { host: "imap.mail.yahoo.com", port: 993 },
    domains: ["yahoo.com", "ymail.com", "rocketmail.com", "yahoo.co.uk", "yahoo.ca", "yahoo.com.au", "yahoo.co.jp", "yahoo.com.hk", "yahoo.com.tw"],
    help: "https://help.yahoo.com/kb/SLN15241.html",
    hint: {
      en: "Yahoo needs an app password, not your Yahoo password: Yahoo, Account info, Account security, Generate app password.",
      zh: "Yahoo 需要使用应用专用密码，不是 Yahoo 登录密码：Yahoo → 账户信息 → 账户安全 → 生成应用密码。",
    },
  },
  exmail: {
    name: { en: "Tencent Exmail (WeCom mail)", zh: "腾讯企业邮箱（企业微信邮箱）" },
    smtp: { host: "smtp.exmail.qq.com", port: 465 }, imap: { host: "imap.exmail.qq.com", port: 993 },
    domains: [], company: true,
    help: "https://open.work.weixin.qq.com/help2/pc/19886",
    hint: {
      en: "Use your full company address. With secure login on, the password won't work: make a client authorization code in the web mailbox, Settings, Mailbox binding.",
      zh: "请使用完整的企业邮箱地址。开启安全登录后，密码无法使用：请在网页版邮箱 → 设置 → 邮箱绑定 中生成客户端专用密码。",
    },
  },
  qiye163: {
    name: { en: "NetEase Qiye Mail", zh: "网易企业邮箱" },
    smtp: { host: "smtp.qiye.163.com", port: 465 }, imap: { host: "imap.qiye.163.com", port: 993 },
    domains: [], company: true,
    help: "https://qiye.163.com/help/",
    hint: {
      en: "Use your full company address and its client authorization code if your administrator turned one on: web mailbox, Settings, Client settings.",
      zh: "请使用完整的企业邮箱地址；如管理员开启了客户端授权码，请使用授权码：网页版邮箱 → 设置 → 客户端设置。",
    },
  },
  qiye_aliyun: {
    name: { en: "Aliyun Qiye Mail", zh: "阿里企业邮箱" },
    smtp: { host: "smtp.qiye.aliyun.com", port: 465 }, imap: { host: "imap.qiye.aliyun.com", port: 993 },
    domains: [], company: true,
    help: "https://help.aliyun.com/document_detail/36576.html",
    hint: {
      en: "Use your full company address and its third-party client security password, not the mailbox password.",
      zh: "请使用完整的企业邮箱地址和第三方客户端安全密码，不是邮箱登录密码。",
    },
  },
};

export const CUSTOM_HINT: L10n = {
  en: "Check the address, the app password and the SMTP and IMAP hosts with whoever runs your company's mail. Placetta connects on SSL ports (SMTP 465, IMAP 993).",
  zh: "请向公司邮箱管理员核对邮箱地址、客户端密码以及 SMTP 和 IMAP 服务器。快哉使用 SSL 端口连接（SMTP 465，IMAP 993）。",
};

export const providerName = (p: MailboxProvider): L10n => (p === "custom" ? { en: "Company mailbox", zh: "企业邮箱" } : PRESETS[p].name);
export const hintOf = (p: MailboxProvider): L10n => (p === "custom" ? CUSTOM_HINT : PRESETS[p].hint);

/** The provider an address belongs to on its own (qq.com is QQ Mail), or null for a company domain. */
export function providerFor(address: string): Exclude<MailboxProvider, "custom"> | null {
  const domain = address.split("@").pop()?.toLowerCase() ?? "";
  for (const [k, v] of Object.entries(PRESETS)) if (v.domains.includes(domain)) return k as Exclude<MailboxProvider, "custom">;
  return null;
}

/** A host the business typed: a plain DNS name, never an address on Placetta's own network or a bare IP. */
export function hostOk(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) return false;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|supabase\.co|supabase\.in)$/.test(h)) return false;
  return true;
}

/** The SMTP and IMAP hosts for a mailbox: the preset's, or the ones typed for "custom". Ports are SSL only. */
export function serversFor(p: MailboxProvider, typed?: { smtp_host?: unknown; imap_host?: unknown; smtp_port?: unknown; imap_port?: unknown }): { smtp: Host; imap: Host } | null {
  if (p !== "custom") return { smtp: PRESETS[p].smtp, imap: PRESETS[p].imap };
  const sh = String(typed?.smtp_host ?? "").trim().toLowerCase(), ih = String(typed?.imap_host ?? "").trim().toLowerCase();
  const sp = Number(typed?.smtp_port ?? 465), ip = Number(typed?.imap_port ?? 993);
  if (!hostOk(sh) || !hostOk(ih)) return null;
  // implicit TLS only: 465 for SMTP, 993 for IMAP (Supabase refuses 25 and 587, and a plain connection would carry the code in the clear)
  if (sp !== 465 || ip !== 993) return null;
  return { smtp: { host: sh, port: sp }, imap: { host: ih, port: ip } };
}

