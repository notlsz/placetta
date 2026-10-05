# Launch checklist

Everything below is a setting or a secret only you can add. The database, security rules and server functions are already live in the Supabase project **Placetta** (`esquxzcfsylffuijvzec`). Until the secrets are set, the agent, voice and checkout answer "not configured" instead of failing silently.

## 1. Put the app online

- Upload `placetta-app.zip` (the production build) to Vercel or Netlify, or connect this repo and set:
  - `VITE_SUPABASE_URL=https://esquxzcfsylffuijvzec.supabase.co`
  - `VITE_SUPABASE_KEY=sb_publishable_Ub54H3S-bU8WDuY7toMtzg_S1ieEO_p` (publishable, safe in the browser)
  - Build command `npm run build`, output folder `dist`.
- Point a domain at it, for example `app.placetta.com`.

## 2. Sign-in (Supabase dashboard, Authentication)

- **URL Configuration**: Site URL = your app URL. Add the same URL to Redirect URLs.
- **SMTP**: add your own email sender (Resend, Postmark or SES). The built-in sender is limited to a few emails an hour.
- **Email template, Magic Link**: add `Your code: {{ .Token }}` so people can type the code instead of clicking the link.

## 3. Your team

Everyone who works the filing queue needs a staff row. In the SQL editor:

```sql
insert into public.staff_emails (email) values ('you@placetta.com');
```

They sign in with that email and see **Filing queue** in the menu.

## 4. Secrets (Supabase dashboard, Edge Functions, Secrets)

| Secret | What it is |
| --- | --- |
| `ANTHROPIC_API_KEY` | Runs the agent. Turn on web search for the org in the Anthropic Console. |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | The voice. Free tier F0 covers 500,000 characters a month. |
| `STRIPE_SECRET_KEY` | Stripe secret key (start with test mode). |
| `STRIPE_PRICE_ENTRY` | One-time price, $299. Quantity is the number of markets. |
| `STRIPE_PRICE_STARTER` | Recurring yearly price, $9,000 ($750 a month billed annually). |
| `STRIPE_PRICE_GROWTH` | Recurring yearly price, $24,000 ($2,000 a month billed annually). |
| `STRIPE_PRICE_EXTRA_LOCATION` | Optional. Recurring yearly price, $1,200 ($100 a month). Must be yearly, like the plans. |
| `STRIPE_WEBHOOK_SECRET` | From the webhook below. |
| `APP_ORIGINS` | Your app URL, comma separated if more than one. Checkout and OAuth only return there. |
| `OAUTH_STATE_SECRET` | Any long random string. |
| `AGENT_DAILY_CALLS`, `TTS_DAILY_CHARS` | Optional caps per workspace a day. Defaults 400 and 20,000. |
| `AGENT_MODEL`, `AGENT_MODEL_DEEP` | Optional. Defaults `claude-sonnet-5-5` and `claude-opus-5-5`. |

Or from a terminal: `supabase secrets set --project-ref esquxzcfsylffuijvzec NAME=value`.

## 5. Stripe

- Products: Entry ($299 one-time), Starter, Growth, and Extra location, priced as above.
- The $299 entry credit toward the first year: create a promotion code. Checkout already accepts codes.
- Webhook endpoint: `https://esquxzcfsylffuijvzec.supabase.co/functions/v1/stripe-webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Customer portal: turn it on in Stripe so people can change cards and download invoices.
- Scale ($5,000+) is sold by email; give that workspace access with `update billing set comped = true where workspace_id = '...'`.

## 6. Integrations (only the ones you want live)

Every provider uses one redirect URI: `https://esquxzcfsylffuijvzec.supabase.co/functions/v1/oauth-callback`

| Provider | Secrets | Note |
| --- | --- | --- |
| Google (Gmail, Calendar, Drive) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Gmail read and Drive read are restricted scopes: Google verification plus a CASA security assessment before the public can connect. Calendar only needs standard verification. Up to 100 test users work before that. |
| Microsoft (Outlook Mail, Calendar) | `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT=common` | Register in Entra ID; publisher verification recommended. |
| Dropbox | `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | Enable `files.metadata.read` and `files.content.read`. |
| QuickBooks | `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_ENV=production` | Intuit app review before production keys. |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | Incoming webhook only. |

The calendar feed (ICS) needs nothing. Square and Toast show as "Request" and email you until a partner integration exists.

## 7. Before the first paying customer

- A lawyer reviews Terms, Privacy, Filing Authorization and the AI disclosure (`legal/`), and the rules for permit expediters in each city you file in (NYC Buildings, for example, requires a registered filing representative).
- Run one full filing in Stripe test mode: sign up, buy the entry plan, ask the agent, approve a filing, work it in the queue, send a payment link, mark submitted, upload the receipt.
- Switch Stripe to live keys and prices.
- Do not add SOC 2 or similar badges until you have the report.

## How a filing flows

1. The customer asks the agent. It researches the agency's own pages, fills the application and asks for approval.
2. The customer approves. A filing request lands in the team's queue with the exact fields and files.
3. The team checks it against the agency's current requirements, submits it on the agency site and records the confirmation number.
4. If there's a government fee, the team sends the agency's payment link. The customer pays the agency directly.
5. The team uploads the receipt or approval. It appears in the customer's documents and audit trail.

Nothing is filed, paid or sent without the customer's approval, and every step is written to an append-only audit trail.
