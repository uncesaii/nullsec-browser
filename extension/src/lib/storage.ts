import browser from "webextension-polyfill";
import type { Settings, Workspace } from "./types";
import { DEFAULT_FLAG_PATTERNS } from "./flag";
import { nowIso, uid } from "./util";
import { defaultProvider } from "./providers";

const WORKSPACE_KEY = "nullsec.workspace";
const SETTINGS_KEY = "nullsec.settings";
const PENDING_KEY = "nullsec.pending";
const PROMPT_KEY = "nullsec.promptOverrides";

export interface PendingPayload {
  kind: "selection" | "note" | "scope" | "flags";
  text: string;
  at: string;
}

export function createDefaultWorkspace(): Workspace {
  const now = nowIso();
  return {
    id: uid("ws"),
    name: "CTF workspace",
    mode: "ctf",
    createdAt: now,
    updatedAt: now,
    scope: [],
    compatibility: {
      relaxFingerprinting: false,
      headers: [],
    },
    rateLimitPerMinute: 60,
  };
}

export function createDefaultSettings(): Settings {
  return {
    providerId: defaultProvider().id,
    modelByProvider: {},
    flagPatterns: DEFAULT_FLAG_PATTERNS,
    redactionEnabled: true,
    maxAgentSteps: 8,
    enableActiveTools: false,
    enableSensitiveTools: false,
    autoApproveActiveTools: false,
  };
}

export async function loadWorkspace(): Promise<Workspace> {
  const stored = await browser.storage.local.get(WORKSPACE_KEY);
  const value = stored[WORKSPACE_KEY];
  if (isWorkspace(value)) return value;
  const workspace = createDefaultWorkspace();
  await saveWorkspace(workspace);
  return workspace;
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  await browser.storage.local.set({
    [WORKSPACE_KEY]: { ...workspace, updatedAt: nowIso() },
  });
}

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const value = stored[SETTINGS_KEY];
  if (isSettings(value)) {
    return {
      ...createDefaultSettings(),
      ...value,
      flagPatterns:
        Array.isArray(value.flagPatterns) && value.flagPatterns.length > 0
          ? value.flagPatterns
          : DEFAULT_FLAG_PATTERNS,
    };
  }
  const settings = createDefaultSettings();
  await saveSettings(settings);
  return settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function setPendingPayload(payload: PendingPayload): Promise<void> {
  await browser.storage.local.set({ [PENDING_KEY]: payload });
}

export async function takePendingPayload(): Promise<PendingPayload | undefined> {
  const stored = await browser.storage.local.get(PENDING_KEY);
  const value = stored[PENDING_KEY];
  if (!isPending(value)) return undefined;
  await browser.storage.local.remove(PENDING_KEY);
  return value;
}

export async function loadPromptOverrides(): Promise<Record<string, string>> {
  const stored = await browser.storage.local.get(PROMPT_KEY);
  const value = stored[PROMPT_KEY];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
}

export async function savePromptOverride(mode: string, prompt: string): Promise<void> {
  const overrides = await loadPromptOverrides();
  overrides[mode] = prompt;
  await browser.storage.local.set({ [PROMPT_KEY]: overrides });
}

export async function resetPromptOverride(mode: string): Promise<void> {
  const overrides = await loadPromptOverrides();
  delete overrides[mode];
  await browser.storage.local.set({ [PROMPT_KEY]: overrides });
}

function isWorkspace(value: unknown): value is Workspace {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    (record.mode === "ctf" || record.mode === "personal") &&
    Array.isArray(record.scope)
  );
}

function isSettings(value: unknown): value is Settings {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPending(value: unknown): value is PendingPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.kind === "selection" ||
      record.kind === "note" ||
      record.kind === "scope" ||
      record.kind === "flags") &&
    typeof record.text === "string" &&
    typeof record.at === "string"
  );
}

export async function getActiveTab(): Promise<browser.Tabs.Tab | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function openSidebar(): Promise<void> {
  try {
    await browser.sidebarAction.open();
  } catch {
    await browser.tabs.create({ url: browser.runtime.getURL("sidebar.html") });
  }
}

export async function openDock(): Promise<void> {
  const url = browser.runtime.getURL("dock.html");
  const existing = await browser.tabs.query({ url });
  if (existing[0]?.id !== undefined) {
    await browser.tabs.update(existing[0].id, { active: true });
    return;
  }
  await browser.tabs.create({ url });
}

export async function downloadText(
  filename: string,
  text: string,
  mime = "text/plain;charset=utf-8",
): Promise<void> {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    await browser.downloads.download({
      url,
      filename,
      saveAs: true,
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}