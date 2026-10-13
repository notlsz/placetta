import { createContext, useContext } from "react";
import type { MemoryBook } from "./model";
import type { Request, Step } from "./agent";
import type { Bf, Lang, T } from "./i18n";
import type { Bi, Store, UpdateItem, Workspace } from "./model";
import type { HqRow } from "./hq";
import type { AgencyLogin, Billing, Filing, Integration, IntegrationKind, Plan } from "./cloud/api";

export type View = "overview" | "updates" | "stores" | "apps" | "docs" | "deadlines" | "audit" | "context" | "find" | "settings" | "queue" | "hq";
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
  openPlans(reason?: "start" | "file"): void;
  checkout(plan: "entry" | "starter" | "growth" | "locations", o?: { markets?: number; extra_locations?: number }): Promise<void>;
  portal(): Promise<void>;
  buyPack(): Promise<void>;
  connect(kind: IntegrationKind): Promise<void>;
  disconnect(kind: IntegrationKind): Promise<void>;
  saveLogin(l: { id?: string; agency: string; url?: string; username: string; password?: string; note?: string }): Promise<void>;
  removeLogin(id: string): Promise<void>;
  feedUrl(rotate?: boolean): Promise<string>;
  markPaid(filingId: string): Promise<void>;
  resumeFiling(filingId: string): Promise<void>;
  uploadSigned(filingId: string, appId: string, file: File): Promise<void>;
  cancelFiling(filingId: string): Promise<void>;
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
  run(req: Request, shown: string | null): void;
  openApp(id: string, tab?: Tab, edit?: boolean): void;
  openApproval(id: string): void;
  approve(id: string, sig?: Signed): void;
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
