import { createContext, useContext } from "react";
import type { MemoryBook } from "./model";
import type { Request, Step } from "./agent";
import type { Bf, Lang, T } from "./i18n";
import type { Bi, Store, UpdateItem, Workspace } from "./model";
import type { HqRow } from "./hq";
import type { AgencyLogin, Billing, Filing, Integration, IntegrationKind, Plan } from "./cloud/api";

export type View = "overview" | "work" | "updates" | "stores" | "apps" | "docs" | "deadlines" | "audit" | "context" | "find" | "settings" | "queue" | "hq";
export type Tab = "progress" | "check" | "form" | "fees" | "receipt";

/** What a signed-in account adds: billing, integrations, saved logins, the filing queue and data controls. */
export type CloudCtx = {
  email: string;
  /** Placetta staff signed in with two-step: sees the filing queue. */
  staff: boolean;
  /** On the staff list but not yet signed in with two-step. */
  staffEmail: boolean;
  /** Two-step sign-in is on for this account. */
  twoStep: boolean;
  /** owner: approves, pays, connects, invites. member: day-to-day work. */
  role: "owner" | "member";
  owner: boolean;
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
  checkout(plan: "entry" | "starter" | "growth" | "locations", o?: { markets?: number; extra_locations?: number; tier?: "essentials" | "pro"; guarantee?: boolean }): Promise<void>;
  portal(): Promise<void>;
  buyPack(): Promise<void>;
  connect(kind: IntegrationKind): Promise<void>;
  disconnect(kind: IntegrationKind): Promise<void>;
  /** Link a team chat by its webhook link; true once the test message went through. */
  connectHook(kind: import("./cloud/api").HookKind, url: string, secret?: string): Promise<boolean>;
  /** The bot's event address (and Slack's app manifest) to set up before connecting it. */
  botSetup(kind: import("./cloud/api").BotKind): Promise<{ events_url: string; manifest?: string } | null>;
  /** Connect the business's own Slack or Lark bot; true once its credentials work. */
  connectBot(kind: import("./cloud/api").BotKind, creds: Record<string, string>): Promise<boolean>;
  /** Which sign-in connections are open on this server. */
  availability(): Promise<import("./cloud/api").Availability>;
  saveLogin(l: { id?: string; agency: string; url?: string; username: string; password?: string; note?: string }): Promise<void>;
  removeLogin(id: string): Promise<void>;
  feedUrl(rotate?: boolean): Promise<string>;
  markPaid(filingId: string): Promise<void>;
  resumeFiling(filingId: string): Promise<void>;
  uploadSigned(filingId: string, appId: string, file: File): Promise<void>;
  cancelFiling(filingId: string): Promise<void>;
  /** Stop a filing that's on its way, before anything reaches the agency; it comes back to you to approve again. */
  stopFiling(filingId: string): Promise<void>;
  /** A stored file (a screenshot of an agency page, the form as sent) as a URL this page can show. */
  fileUrl(path: string): Promise<string | null>;
  exportData(): void;
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
  deep: boolean;
  setDeep(v: boolean): void;
  voiceOn: boolean;
  setVoiceOn(v: boolean): void;
  stop(): void;
  applyKey(key: string, model: string, remember: boolean): void;
  dropKey(): void;
  uploading: { app: string; item: string } | null;
  go(v: View): void;
  ask(text: string, voice?: boolean): void;
  /** What you gave Odelia while she was busy: she takes them in order. */
  queued: { id: string; text: string }[];
  unqueue(id: string): void;
  run(req: Request, shown: string | null): void;
  openApp(id: string, tab?: Tab, edit?: boolean): void;
  openApproval(id: string): void;
  approve(id: string, sig?: Signed): void | Promise<void>;
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
export type Signed = { png?: Uint8Array; name: string; title?: string; kind: "typed" | "drawn" };
