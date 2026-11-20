import browser from "webextension-polyfill";
import type {
  Challenge,
  CookieSummary,
  RepeaterRequest,
  RepeaterResponse,
  RequestRecord,
  ScopedTab,
  Settings,
  StorageSnapshot,
  Workspace,
} from "./types";

export type BackgroundMessage =
  | { type: "nullsec:ping" }
  | { type: "nullsec:get-state" }
  | { type: "nullsec:repeater"; request: RepeaterRequest }
  | { type: "nullsec:scan-flags"; patterns?: { name: string; pattern: string }[] }
  | { type: "nullsec:page-context" }
  | { type: "nullsec:open-dock" }
  | { type: "nullsec:clear-requests" }
  | { type: "nullsec:bridge-ping" }
  | { type: "nullsec:tabs" }
  | {
      type: "nullsec:tab";
      action: "open" | "activate" | "close" | "navigate" | "reload";
      tabId?: number;
      url?: string;
    }
  | {
      type: "nullsec:cookies";
      action: "get" | "set" | "delete";
      url?: string;
      cookie?: {
        name?: string;
        value?: string;
        path?: string;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: string;
        expirationDate?: number;
      };
    }
  | {
      type: "nullsec:storage";
      action: "get" | "set" | "delete" | "clear";
      area?: "local" | "session";
      key?: string;
      value?: string;
    }
  | {
      type: "nullsec:dom";
      action:
        | "query"
        | "click"
        | "fill"
        | "submit"
        | "set-attribute"
        | "run-js"
        | "performance"
        | "console";
      args?: Record<string, unknown>;
    };

export type { CookieSummary, ScopedTab, StorageSnapshot };

export interface BackgroundState {
  workspace: Workspace;
  settings: Settings;
  challenges: Challenge[];
  requests: RequestRecord[];
}

export interface MessageResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function sendMessage<T = unknown>(
  message: BackgroundMessage,
): Promise<MessageResponse<T>> {
  try {
    const response = (await browser.runtime.sendMessage(message)) as
      | MessageResponse<T>
      | undefined;
    return response ?? { ok: false, error: "No response from background" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Message failed",
    };
  }
}

export async function sendRepeater(
  request: RepeaterRequest,
): Promise<MessageResponse<RepeaterResponse>> {
  return sendMessage<RepeaterResponse>({ type: "nullsec:repeater", request });
}

export async function pingBridge(): Promise<MessageResponse<{ version: string }>> {
  return sendMessage<{ version: string }>({ type: "nullsec:bridge-ping" });
}