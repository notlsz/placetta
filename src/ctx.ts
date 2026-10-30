import { createContext, useContext } from "react";
import type { MemoryBook } from "./model";
import type { Request, Step } from "./agent";
import type { PlanInterval } from "./pricing";
import type { Bf, Lang, T } from "./i18n";
import type { Bi, Store, UpdateItem, Workspace } from "./model";
import type { HqRow } from "./hq";
import type { AgencyLogin, Billing, Filing, Integration, IntegrationKind, Plan } from "./cloud/api";

/** The four places (Home, Permits, Stores, Odelia), Settings, and the pages reached from them: Find licenses (a button
 *  on Permits), the staff filing queue and Headquarters. Permits and Odelia carry their tabs in the address (route.ts). */
export type View = "overview" | "permits" | "stores" | "odelia" | "find" | "settings" | "queue" | "hq" | "partner";
export type PermitsTab = "todo" | "filed" | "review" | "documents" | "deadlines";
export type OdeliaTab = "chat" | "work" | "ideas" | "playbooks" | "updates";
export type Tab = "progress" | "check" | "form" | "fees" | "receipt" | "comments";

/** What a signed-in account adds: billing, integrations, saved logins, the filing queue and data controls. */
export type CloudCtx = {
  email: string;
  /** Placetta staff signed in with two-step: sees the filing queue. */
  staff: boolean;
  /** On the staff list but not yet signed in with two-step. */
  staffEmail: boolean;
  /** Two-step sign-in is on for this account. */
  twoStep: boolean;
  /** owner: approves, pays, connects. admin: people, sign-in and SCIM. member: day-to-day work. viewer: reads only. */
  role: "owner" | "admin" | "member" | "viewer";
  owner: boolean;
  /** Owners and admins: manage people, roles, sign-in, SCIM and the audit export. */
  admin: boolean;
  /** Viewers: read the workspace, change nothing. */
  viewer: boolean;
  wsId: string;
  plan: Plan;
  billing: Billing | null;
  filings: Filing[];
  integrations: Integration[];
  logins: AgencyLogin[];
  workspaces: { id: string; name: string }[];
  /** Franchisees that shared their stores with this email: shows the Headquarters view. */
  hq: HqRow[];
  /** Updated Terms not yet accepted: everything stays readable, but nothing new can be approved. */
  termsHold: boolean;
  openPlans(reason?: "start" | "file"): void;
  portal(): Promise<void>;
  /** The simple model's store plan for every store, billed yearly (the renewal terms agreed to next to the button). */
  startPlan(stores: number, interval?: PlanInterval): Promise<void>;
  buyPack(): Promise<void>;
  connect(kind: IntegrationKind, extra?: { shop?: string }): Promise<void>;
  /** Dropbox Sign: the business's own API key, checked before it's kept. */
  connectSign(apiKey: string): Promise<boolean>;
  /** A mailbox by its address and authorization code; true once the server signed in to it. */
  connectMailbox(m: import("./cloud/api").MailboxInput): Promise<boolean>;
  disconnect(kind: IntegrationKind): Promise<void>;
  /** Link a team chat by its webhook link; true once the test message went through. */
  connectHook(kind: import("./cloud/api").HookKind, url: string, secret?: string): Promise<boolean>;
  /** When a linked team chat hears: each update as it comes or once a day at an hour, and quiet hours (owners). */
  hookSchedule(kind: import("./cloud/api").HookKind, s: { digest: "each" | "daily"; hour: number; tz: string; quiet: boolean }): Promise<boolean>;
  /** The bot's event address (and Slack's app manifest, or WeChat's Token and EncodingAESKey) to set up before connecting it. */
  botSetup(kind: import("./cloud/api").BotKind): Promise<import("./cloud/api").BotSetup | null>;
  /** Connect the business's own Slack or Lark bot, or WeChat Official Account; true once its credentials work. */
  connectBot(kind: import("./cloud/api").BotKind, creds: Record<string, string>): Promise<boolean>;
  /** Connect Toast: the locations that added Placetta in Toast with this workspace's code; true once found. */
  connectToast(): Promise<boolean>;
  /** Which sign-in connections are open on this server. */
  availability(): Promise<import("./cloud/api").Availability>;
  saveLogin(l: { id?: string; agency: string; url?: string; username: string; password?: string; note?: string }): Promise<void>;
  removeLogin(id: string): Promise<void>;
  feedUrl(rotate?: boolean): Promise<string>;
  markPaid(filingId: string): Promise<void>;
  /** resubmit: send again a filing the same as one already sent (the person tapped "Send it again"). */
  resumeFiling(filingId: string, resubmit?: boolean, confirmation?: string): Promise<void>;
  /** The agency's confirmation number for a filing the business sent itself. */
  addConfirmation(filingId: string, confirmation: string): Promise<void>;
  /** "Show Odelia how": file it once yourself in the live browser while Odelia records the steps (teach mode). */
  teachFiling(filingId: string): Promise<void>;
  /** How a "prove you're human" check on this filing's agency site is handled, remembered for that site. */
  captchaChoice(filingId: string, choice: "me" | "team" | "route" | "ask"): Promise<void>;
  uploadSigned(filingId: string, appId: string, file: File): Promise<void>;
  /** "Mail me the page": Placetta mails a form that needs ink to this address (file function, action kit); kitUndo
   *  cancels it in its undo window. */
  kitFiling(filingId: string, address: import("./cloud/api").KitAddress): Promise<void>;
  kitUndo(filingId: string): Promise<void>;
  cancelFiling(filingId: string): Promise<void>;
  /** Stop a filing that's on its way, before anything reaches the agency; it comes back to you to approve again. */
  stopFiling(filingId: string): Promise<void>;
  /** Undo a filing during its undo window (it's held, nothing has left); it comes back to you to approve again. */
  undoFiling(filingId: string): Promise<void>;
  /** End a filing's undo window early: it goes now. */
  sendFilingNow(filingId: string): Promise<void>;
  /** Ask a person on the Placetta team (src/AskPerson.tsx); true once the team has it. */
  askPerson(question: string, context: Record<string, unknown>): Promise<boolean>;
  /** A stored file (a screenshot of an agency page, the form as sent) as a URL this page can show. */
  fileUrl(path: string): Promise<string | null>;
  exportData(): void;
  /** Stop a Hands-off ask Odelia is holding for its undo window (owners and admins). */
  undoAsk(id: string): Promise<void>;
  switchTo(id: string): void;
  newWorkspace(): void;
  signOut(everywhere?: boolean): void;
  reopen(): void;
};

/** What every page and panel can read and do. */
export type Ctx = {
  lang: Lang; t: T; b: Bf;
  setLang(l: Lang): void;
  ws: Workspace;
  busy: boolean;
  live: Step | null;
  mode: "claude" | "api" | "server" | "demo";
  apiName: string;
  /** The API models a developer may pick with their own key: only in a local development build (src/localAgent.ts). */
  apiModels: { id: string; label: string }[];
  deep: boolean;
  setDeep(v: boolean): void;
  voiceOn: boolean;
  setVoiceOn(v: boolean): void;
  stop(): void;
  applyKey(key: string, model: string, remember: boolean): void;
  dropKey(): void;
  uploading: { app: string; item: string } | null;
  /** Open a page, and one of its tabs (Permits: todo, filed, documents, deadlines; Odelia: chat, work, playbooks, updates). */
  go(v: View, sub?: string): void;
  /** The tab open on the current page, from its address. */
  sub?: string;
  ask(text: string, voice?: boolean): void;
  /** What you gave Odelia while she was busy: she takes them in order. */
  queued: { id: string; text: string }[];
  unqueue(id: string): void;
  run(req: Request, shown: string | null): void;
  openApp(id: string, tab?: Tab, edit?: boolean): void;
  /** Open an application's filled form, at one version (src/forms/versions.ts). */
  openForm(app: string, version?: number): void;
  /** The filled PDF of an application's form: one version, or (none kept yet) filled with its answers now. null when
   *  Placetta doesn't fill this form itself. */
  filledPdf(app: string, version?: number): Promise<Uint8Array | null>;
  openApproval(id: string): void;
  /** Watch how a job was done: its replay, moment by moment (src/Watch.tsx). */
  openReplay(jobId: string): void;
  /** Stop a job, and every store's part of it when it's split across stores (their runs on the server too). */
  stopJob(jobId: string): void;
  /** risk: the rejection risk the owner saw on the card, and their "send it anyway" on a High (src/risk.ts), kept with the filing */
  approve(id: string, sig?: Signed, risk?: import("./risk").RiskFlags): void | Promise<void>;
  /** Several filings that passed every check, approved together from one tap. */
  approveAll(ids: string[]): void;
  upload(app: string, item: string, files?: File[]): void;
  download(docId: string): void;
  downloadApp(appId: string): void;
  exportAudit(): void;
  editFields(app: string, values: Record<string, string>): void;
  editFact(id: string, value: string): void;
  updateStore(id: string, f: (s: Store) => Store, log?: { action: Bi; object: Bi; detail?: Bi }): void;
  /** This person's memory (Settings, Memory), and a way to change it. */
  memory: MemoryBook | null;
  /** Whose memory it is: the signed-in person's id, or the sample's one person (src/recall.ts). */
  me: string;
  setMemory(f: (b: MemoryBook) => MemoryBook): void;
  /** Change the workspace directly (Settings: skills). */
  editWs(f: (w: Workspace) => Workspace): void;
  say(text: string): void;
  openLegal(id: string): void;
  cloud: CloudCtx | null;
  /** The Updates inbox: newest first. */
  updates: UpdateItem[];
  readUpdates(): void;
};

export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("no app context"); return c; };

/** A signature drawn or typed in the approval card. Belongs to one filing; never kept for another form. */
/** A signature for one approval: drawn in the card, or the one the owner adopted once (adopted: its id, so each
 *  placement is recorded against it). */
export type Signed = { png?: Uint8Array; name: string; title?: string; kind: "typed" | "drawn"; adopted?: string };
