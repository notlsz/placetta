import { createContext, useContext } from "react";
import type { Request, Step } from "./agent";
import type { Bf, Lang, T } from "./i18n";
import type { Workspace } from "./model";

export type View = "overview" | "apps" | "docs" | "deadlines" | "audit" | "context" | "find" | "settings";
export type Tab = "check" | "form" | "fees" | "receipt";

/** What every page and panel can read and do. */
export type Ctx = {
  lang: Lang; t: T; b: Bf;
  ws: Workspace;
  busy: boolean;
  live: Step | null;
  mode: "claude" | "api" | "demo";
  apiName: string;
  deep: boolean;
  setDeep(v: boolean): void;
  stop(): void;
  applyKey(key: string, model: string, remember: boolean): void;
  dropKey(): void;
  uploading: { app: string; item: string } | null;
  go(v: View): void;
  ask(text: string, voice?: boolean): void;
  run(req: Request, shown: string | null): void;
  openApp(id: string, tab?: Tab, edit?: boolean): void;
  openApproval(id: string): void;
  approve(id: string): void;
  upload(app: string, item: string, files?: File[]): void;
  download(docId: string): void;
  downloadApp(appId: string): void;
  exportAudit(): void;
  editFields(app: string, values: Record<string, string>): void;
  editFact(id: string, value: string): void;
};

export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("no app context"); return c; };
