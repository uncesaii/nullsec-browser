export type WorkspaceMode = "ctf" | "personal";

export type ScopeKind = "host" | "url" | "cidr";

export interface ScopeRule {
  id: string;
  kind: ScopeKind;
  value: string;
  note?: string;
  createdAt: string;
}

export interface HeaderRule {
  name: string;
  value: string;
}

export interface ProxyConfig {
  type: "http" | "socks5";
  host: string;
  port: number;
  username?: string;
  remoteDns?: boolean;
}

export interface WorkspaceCompatibility {
  relaxFingerprinting: boolean;
  customUserAgent?: string;
  headers: HeaderRule[];
}

export interface Workspace {
  id: string;
  name: string;
  mode: WorkspaceMode;
  createdAt: string;
  updatedAt: string;
  scope: ScopeRule[];
  proxy?: ProxyConfig;
  compatibility: WorkspaceCompatibility;
  rateLimitPerMinute: number;
}

export type ChallengeStatus = "open" | "solved" | "abandoned";

export type TimelineKind =
  | "created"
  | "note"
  | "navigation"
  | "request"
  | "tool"
  | "flag"
  | "ai"
  | "report"
  | "manual";

export interface TimelineEvent {
  id: string;
  at: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
  evidenceId?: string;
}

export type FlagStatus = "candidate" | "confirmed" | "rejected";

export interface FlagCandidate {
  id: string;
  value: string;
  patternName: string;
  sourceUrl?: string;
  context?: string;
  status: FlagStatus;
  at: string;
}

export interface Challenge {
  id: string;
  workspaceId: string;
  name: string;
  category: string;
  status: ChallengeStatus;
  notes: string;
  timeline: TimelineEvent[];
  flags: FlagCandidate[];
  createdAt: string;
  updatedAt: string;
}

export type RequestSource = "web" | "repeater" | "fuzzer" | "import";

export interface RequestRecord {
  id: string;
  workspaceId: string;
  time: string;
  method: string;
  url: string;
  status?: number;
  type?: string;
  tabId?: number;
  source: RequestSource;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  bodySize?: number;
  durationMs?: number;
  error?: string;
}

export interface FlagPattern {
  name: string;
  pattern: string;
  enabled: boolean;
}

export interface Settings {
  providerId: string;
  modelByProvider: Record<string, string>;
  flagPatterns: FlagPattern[];
  redactionEnabled: boolean;
  maxAgentSteps: number;
  enableActiveTools: boolean;
  enableSensitiveTools: boolean;
  autoApproveActiveTools: boolean;
  updateUrl?: string;
  lastUpdateCheck?: string;
}

export type ProviderProtocol = "openai-chat" | "anthropic-messages";

export type AuthType = "bearer" | "x-api-key" | "x-goog-api-key" | "query-key";

export interface ProviderAuth {
  type: AuthType;
  header?: string;
  scheme?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  chatPath: string;
  modelsPath?: string;
  auth: ProviderAuth;
  defaultModel?: string;
  supportsTools: boolean;
  supportsStreaming: boolean;
  docsUrl: string;
  extraHeaders?: Record<string, string>;
  notes?: string;
}

export interface ProviderRegistry {
  version: number;
  defaultProvider: string;
  providers: ProviderConfig[];
}

export interface RepeaterRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  credentials?: "omit" | "include";
}

export interface RepeaterResponse {
  ok: boolean;
  status?: number;
  statusText?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  bodyTruncated?: boolean;
  durationMs?: number;
  error?: string;
}

export interface FlagMatch {
  value: string;
  patternName: string;
  index: number;
  context: string;
}

export interface RedactionFinding {
  kind: string;
  count: number;
}

export interface RedactionResult {
  text: string;
  findings: RedactionFinding[];
}

export interface ScopedTab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  active: boolean;
}

export interface CookieSummary {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  expirationDate?: number;
}

export interface StorageEntry {
  key: string;
  value: string;
}

export interface StorageSnapshot {
  url: string;
  origin: string;
  local: StorageEntry[];
  session: StorageEntry[];
  errors?: string[];
}

export interface ReportDraft {
  challengeId: string;
  generatedAt: string;
  markdown: string;
  redactionFindings: RedactionFinding[];
}