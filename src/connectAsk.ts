/* "Connect my Gmail" (Muse: "You can connect a Connector by asking Muse"): the words of a request to connect one app on
   the connection page, or null. Connecting itself stays a deliberate tap on that page. Pure, so it is tested alone. */
export function connectAsk(text: string): string | null {
  const m = text.trim().match(/^(?:please\s+)?(?:connect|link|hook up|set up)\s+(?:my|our|the)?\s*([\p{L}\p{N} .&'-]{2,24}?)(?:\s+(?:account|app|calendar|inbox))?\s*[.!?]?$/iu)
    ?? text.trim().match(/^(?:请)?(?:帮我)?(?:连接|接入|绑定)(?:我的|我们的)?\s*([\p{L}\p{N} .&'-]{1,24}?)(?:账号|账户)?[。！？]?$/u);
  const app = m?.[1].trim();
  // only an app on the connection page: "set up the food handler cards" is work for Odelia, not a connection
  return app && KNOWN_APP.test(app) ? app : null;
}
const KNOWN_APP = /gmail|outlook|google|calendar|qq|163|yahoo|e-?mail|slack|lark|feishu|wecom|dingtalk|teams|zapier|n8n|webhook|wechat|telegram|drive|dropbox|square|toast|quickbooks|xero|business profile|clover|shopify|飞书|企业微信|钉钉|微信|邮箱|日历/i;
