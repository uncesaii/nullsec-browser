import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import browser from "webextension-polyfill";
import {
  Code,
  Copy,
  Download,
  History,
  RefreshCw,
  Send,
  Square,
  Trash2,
  Zap,
} from "lucide-preact";
import type {
  RequestRecord,
  RepeaterResponse,
  Workspace,
} from "../lib/types";
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  Field,
  IconButton,
  Logo,
  Section,
  Tabs,
  Toast,
} from "../ui/components";
import {
  copyText,
  downloadText,
  loadWorkspace,
} from "../lib/storage";
import { listRequests } from "../lib/db";
import { detectEncoding, identifyHash } from "../lib/decoders";
import { sendMessage, sendRepeater } from "../lib/messaging";
import {
  formatBytes,
  formatDuration,
  formatTime,
  truncate,
} from "../lib/util";

type DockTab = "history" | "repeater" | "fuzzer" | "decoder";

interface ToastState {
  message: string;
  tone?: "default" | "danger";
}

interface RepeaterSeed {
  method: string;
  url: string;
  headers?: Record<string, string>;
}

const TABS = [
  { id: "history", label: "History", icon: <History size={15} /> },
  { id: "repeater", label: "Repeater", icon: <Send size={15} /> },
  { id: "fuzzer", label: "Fuzzer", icon: <Zap size={15} /> },
  { id: "decoder", label: "Decoder", icon: <Code size={15} /> },
];

function Dock() {
  const [tab, setTab] = useState<DockTab>("history");
  const [workspace, setWorkspace] = useState<Workspace>();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("");
  const [seed, setSeed] = useState<RepeaterSeed>();
  const [toast, setToast] = useState<ToastState>();
  const [loading, setLoading] = useState(true);

  function notify(message: string, tone: ToastState["tone"] = "default") {
    setToast({ message, tone });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await sendMessage<{
        workspace: Workspace;
        requests: RequestRecord[];
      }>({ type: "nullsec:get-state" });
      if (cancelled) return;
      if (response.ok && response.data) {
        setWorkspace(response.data.workspace);
        setRequests(response.data.requests);
      } else {
        const fallback = await loadWorkspace();
        const fallbackRequests = await listRequests(fallback.id);
        if (cancelled) return;
        setWorkspace(fallback);
        setRequests(fallbackRequests);
      }
      setLoading(false);
    })().catch((error: unknown) => {
      if (!cancelled) {
        setLoading(false);
        notify(error instanceof Error ? error.message : "Failed to load requests", "danger");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const listener = (message: unknown) => {
      if (typeof message !== "object" || message === null) return;
      if ((message as { type?: unknown }).type !== "nullsec:request") return;
      const request = (message as { request?: RequestRecord }).request;
      if (!request) return;
      setRequests((current) => [request, ...current].slice(0, 500));
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return requests;
    return requests.filter((request) =>
      `${request.method} ${request.url} ${request.status ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [filter, requests]);

  const selected = requests.find((request) => request.id === selectedId);

  function openInRepeater(request: RequestRecord) {
    setSeed({
      method: request.method,
      url: request.url,
      headers: request.requestHeaders,
    });
    setTab("repeater");
  }

  async function clearHistory() {
    if (!window.confirm("Clear the request history for this workspace?")) return;
    const response = await sendMessage({ type: "nullsec:clear-requests" });
    if (!response.ok) {
      notify(response.error ?? "Could not clear history.", "danger");
      return;
    }
    setRequests([]);
    setSelectedId("");
    notify("Request history cleared.");
  }

  return (
    <div class="ns-dock">
      <header class="ns-header">
        <div class="ns-brand">
          <Logo />
          <span class="ns-brand-name">Request dock</span>
          <Badge tone="solid">{workspace?.mode ?? "ctf"}</Badge>
        </div>
        <div class="ns-header-actions">
          <Button size="sm" onClick={() => void clearHistory()} disabled={requests.length === 0}>
            <Trash2 size={14} /> Clear
          </Button>
        </div>
      </header>
      <Tabs
        items={TABS}
        active={tab}
        onChange={(id) => setTab(id as DockTab)}
        label="Request dock sections"
      />
      <main class="ns-content">
        {tab === "history" ? (
          <HistoryPanel
            requests={filtered}
            total={requests.length}
            filter={filter}
            setFilter={setFilter}
            selected={selected}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRepeater={openInRepeater}
            loading={loading}
            notify={notify}
          />
        ) : tab === "repeater" ? (
          <RepeaterPanel seed={seed} notify={notify} />
        ) : tab === "fuzzer" ? (
          <FuzzerPanel seed={seed} notify={notify} />
        ) : (
          <DecoderPanel notify={notify} />
        )}
      </main>
      {toast ? (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onClose={() => setToast(undefined)}
        />
      ) : null}
    </div>
  );
}

function HistoryPanel({
  requests,
  total,
  filter,
  setFilter,
  selected,
  selectedId,
  onSelect,
  onRepeater,
  loading,
  notify,
}: {
  requests: RequestRecord[];
  total: number;
  filter: string;
  setFilter: (value: string) => void;
  selected: RequestRecord | undefined;
  selectedId: string;
  onSelect: (id: string) => void;
  onRepeater: (request: RequestRecord) => void;
  loading: boolean;
  notify: (message: string, tone?: ToastState["tone"]) => void;
}) {
  if (loading) {
    return <div class="ns-dock-page ns-muted">Loading request history…</div>;
  }
  return (
    <div class="ns-dock-page">
      <div class="ns-row">
        <input
          class="ns-input ns-grow"
          value={filter}
          placeholder="Filter by method, host, path, or status"
          onInput={(event) => setFilter(event.currentTarget.value)}
        />
        <Badge>
          {requests.length}/{total}
        </Badge>
      </div>
      {total === 0 ? (
        <EmptyState icon={<History size={22} />} title="No requests captured">
          Requests from http(s) tabs appear here. AI provider traffic and extension
          pages are excluded.
        </EmptyState>
      ) : (
        <div class="ns-split">
          <div class="ns-table-wrap" style="max-height: calc(100vh - 190px)">
            <table class="ns-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Status</th>
                  <th>URL</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr
                    class="ns-request-row"
                    data-selected={request.id === selectedId}
                    onClick={() => onSelect(request.id)}
                    key={request.id}
                  >
                    <td class="ns-mono">{request.method}</td>
                    <td class={request.error ? "ns-danger" : "ns-mono"}>
                      {request.error ?? request.status ?? "—"}
                    </td>
                    <td class="ns-truncate" style="max-width: 360px" title={request.url}>
                      {request.url}
                    </td>
                    <td class="ns-muted">{formatTime(request.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="ns-stack">
            {selected ? (
              <>
                <Section title="Request">
                  <div class="ns-row">
                    <Badge tone="solid">{selected.method}</Badge>
                    <Badge>{selected.status ?? selected.error ?? "pending"}</Badge>
                    <Badge>{formatDuration(selected.durationMs)}</Badge>
                    <Badge>{formatBytes(selected.bodySize)}</Badge>
                  </div>
                  <p class="ns-mono ns-break">{selected.url}</p>
                  <div class="ns-row">
                    <Button size="sm" onClick={() => onRepeater(selected)}>
                      <Send size={14} /> Send to repeater
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        void copyText(selected.url).then(() => notify("URL copied."))
                      }
                    >
                      <Copy size={14} /> Copy URL
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        void downloadText(
                          "nullsec-request.json",
                          JSON.stringify(selected, null, 2),
                          "application/json",
                        )
                      }
                    >
                      <Download size={14} /> Export
                    </Button>
                  </div>
                  <p class="ns-hint">
                    Request and response bodies are not captured from browser traffic.
                    Use the repeater for full response bodies.
                  </p>
                </Section>
                <Section title="Request headers">
                  <HeaderTable headers={selected.requestHeaders} />
                </Section>
                <Section title="Response headers">
                  <HeaderTable headers={selected.responseHeaders} />
                </Section>
              </>
            ) : (
              <EmptyState icon={<Send size={22} />} title="Select a request">
                Inspect headers or send the request to the repeater.
              </EmptyState>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderTable({ headers }: { headers?: Record<string, string> }) {
  if (!headers || Object.keys(headers).length === 0) {
    return <p class="ns-hint">No headers recorded.</p>;
  }
  return (
    <div class="ns-table-wrap">
      <table class="ns-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(headers).map(([name, value]) => (
            <tr key={name}>
              <td class="ns-mono">{name}</td>
              <td class="ns-mono ns-break">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function headersToText(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
}

function parseHeaderText(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const name = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!name || /[\r\n]/.test(name) || /[\r\n]/.test(value)) continue;
    headers[name] = value;
  }
  return headers;
}

function RepeaterPanel({
  seed,
  notify,
}: {
  seed: RepeaterSeed | undefined;
  notify: (message: string, tone?: ToastState["tone"]) => void;
}) {
  const [method, setMethod] = useState(seed?.method ?? "GET");
  const [url, setUrl] = useState(seed?.url ?? "");
  const [headers, setHeaders] = useState(headersToText(seed?.headers));
  const [body, setBody] = useState("");
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<RepeaterResponse>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!seed) return;
    setMethod(seed.method);
    setUrl(seed.url);
    setHeaders(headersToText(seed.headers));
    setBody("");
    setResponse(undefined);
    setError("");
  }, [seed]);

  async function send() {
    if (!url.trim()) {
      setError("Enter a request URL.");
      return;
    }
    setSending(true);
    setError("");
    const result = await sendRepeater({
      method: method.trim() || "GET",
      url: url.trim(),
      headers: parseHeaderText(headers),
      body: body || undefined,
      credentials: includeCredentials ? "include" : "omit",
    });
    setSending(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Request failed.");
      return;
    }
    setResponse(result.data);
    if (result.data.error) setError(result.data.error);
    else notify(`Response ${result.data.status ?? ""} received.`);
  }

  return (
    <div class="ns-dock-page">
      <Banner title="Scope-guarded active request">
        The repeater sends only to hosts in the active workspace scope. Out-of-scope
        requests are blocked by the background worker, not just the UI.
      </Banner>
      <div class="ns-grid-2">
        <Field label="Method" htmlFor="repeater-method">
          <input
            id="repeater-method"
            class="ns-input ns-mono"
            value={method}
            onInput={(event) => setMethod(event.currentTarget.value.toUpperCase())}
            list="http-methods"
          />
          <datalist id="http-methods">
            {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(
              (item) => (
                <option value={item} />
              ),
            )}
          </datalist>
        </Field>
        <Field label="Credentials" htmlFor="repeater-credentials">
          <label class="ns-row" style="min-height: 30px">
            <input
              id="repeater-credentials"
              type="checkbox"
              checked={includeCredentials}
              onChange={(event) => setIncludeCredentials(event.currentTarget.checked)}
            />
            <span>Include browser cookies for the target</span>
          </label>
        </Field>
      </div>
      <Field label="URL" htmlFor="repeater-url">
        <input
          id="repeater-url"
          class="ns-input ns-mono"
          value={url}
          placeholder="https://target.example/path"
          onInput={(event) => setUrl(event.currentTarget.value)}
        />
      </Field>
      <div class="ns-split">
        <Field label="Headers" htmlFor="repeater-headers" hint="One Name: value per line.">
          <textarea
            id="repeater-headers"
            class="ns-textarea"
            rows={7}
            value={headers}
            placeholder={"Accept: application/json\nContent-Type: application/json"}
            onInput={(event) => setHeaders(event.currentTarget.value)}
          />
        </Field>
        <Field label="Body" htmlFor="repeater-body">
          <textarea
            id="repeater-body"
            class="ns-textarea"
            rows={7}
            value={body}
            placeholder="Request body"
            onInput={(event) => setBody(event.currentTarget.value)}
          />
        </Field>
      </div>
      <div class="ns-row">
        <Button variant="primary" onClick={() => void send()} disabled={sending}>
          <Send size={14} /> {sending ? "Sending…" : "Send request"}
        </Button>
        <Button
          onClick={() => {
            setResponse(undefined);
            setError("");
          }}
        >
          <RefreshCw size={14} /> Clear response
        </Button>
      </div>
      {error ? <p class="ns-danger">{error}</p> : null}
      {response ? (
        <Section
          title="Response"
          action={
            <div class="ns-row">
              <Badge tone={response.ok ? "solid" : "danger"}>
                {response.status ?? "error"} {response.statusText ?? ""}
              </Badge>
              <Badge>{formatDuration(response.durationMs)}</Badge>
              <Button
                size="sm"
                onClick={() =>
                  void copyText(response.body ?? "").then(() =>
                    notify("Response body copied."),
                  )
                }
              >
                <Copy size={14} /> Copy body
              </Button>
            </div>
          }
        >
          <p class="ns-mono ns-break">{response.url ?? url}</p>
          {response.bodyTruncated ? (
            <p class="ns-hint">Body truncated at 1 MB.</p>
          ) : null}
          <pre class="ns-code">{truncate(response.body ?? "", 100_000)}</pre>
          <details>
            <summary class="ns-hint">Response headers</summary>
            <HeaderTable headers={response.headers} />
          </details>
        </Section>
      ) : null}
    </div>
  );
}

interface FuzzResult {
  payload: string;
  status?: number;
  length?: number;
  durationMs?: number;
  error?: string;
}

function FuzzerPanel({
  seed,
  notify,
}: {
  seed: RepeaterSeed | undefined;
  notify: (message: string, tone?: ToastState["tone"]) => void;
}) {
  const [template, setTemplate] = useState(seed?.url ?? "https://target.example/FUZZ");
  const [payloads, setPayloads] = useState("admin\nlogin\napi\nbackup");
  const [delayMs, setDelayMs] = useState(500);
  const [encode, setEncode] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<FuzzResult[]>([]);
  const runningRef = useRef(false);

  useEffect(() => {
    if (seed?.url) setTemplate(seed.url);
  }, [seed]);

  async function start() {
    if (!template.includes("FUZZ")) {
      notify("The URL template must contain FUZZ.", "danger");
      return;
    }
    const list = payloads
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (list.length === 0) {
      notify("Add at least one payload.", "danger");
      return;
    }
    if (
      !window.confirm(
        `Send ${list.length} scope-guarded requests with ${delayMs} ms between them?`,
      )
    ) {
      return;
    }
    runningRef.current = true;
    setRunning(true);
    setResults([]);
    for (const payload of list) {
      if (!runningRef.current) break;
      const encoded = encode ? encodeURIComponent(payload) : payload;
      const url = template.split("FUZZ").join(encoded);
      const response = await sendRepeater({ method: "GET", url });
      const data = response.data;
      setResults((current) => [
        ...current,
        {
          payload,
          status: data?.status,
          length: data?.body?.length,
          durationMs: data?.durationMs,
          error: response.error ?? data?.error,
        },
      ]);
      await new Promise((resolve) => setTimeout(resolve, Math.max(250, delayMs)));
    }
    runningRef.current = false;
    setRunning(false);
    notify("Fuzz run finished.");
  }

  function stop() {
    runningRef.current = false;
    setRunning(false);
    notify("Stopping after the current request.");
  }

  return (
    <div class="ns-dock-page">
      <Banner title="Rate-limited URL fuzzing">
        Requests are sequential, scope-guarded by the background worker, and capped at
        50 payloads per run. Keep the delay high enough for the target.
      </Banner>
      <Field label="URL template" htmlFor="fuzz-url" hint="Use FUZZ as the injection point.">
        <input
          id="fuzz-url"
          class="ns-input ns-mono"
          value={template}
          onInput={(event) => setTemplate(event.currentTarget.value)}
        />
      </Field>
      <div class="ns-split">
        <Field label="Payloads" htmlFor="fuzz-payloads" hint="One per line, max 50.">
          <textarea
            id="fuzz-payloads"
            class="ns-textarea"
            rows={8}
            value={payloads}
            onInput={(event) => setPayloads(event.currentTarget.value)}
          />
        </Field>
        <div class="ns-stack">
          <Field label="Delay (ms)" htmlFor="fuzz-delay">
            <input
              id="fuzz-delay"
              class="ns-input"
              type="number"
              min={250}
              max={10000}
              step={50}
              value={delayMs}
              onInput={(event) => setDelayMs(Number(event.currentTarget.value))}
            />
          </Field>
          <label class="ns-row">
            <input
              type="checkbox"
              checked={encode}
              onChange={(event) => setEncode(event.currentTarget.checked)}
            />
            <span>URL-encode payloads</span>
          </label>
          <div class="ns-row">
            <Button variant="primary" onClick={() => void start()} disabled={running}>
              <Zap size={14} /> Start
            </Button>
            <Button onClick={stop} disabled={!running}>
              <Square size={14} /> Stop
            </Button>
          </div>
        </div>
      </div>
      {results.length > 0 ? (
        <Section title="Results" action={<Badge>{results.length}</Badge>}>
          <div class="ns-table-wrap">
            <table class="ns-table">
              <thead>
                <tr>
                  <th>Payload</th>
                  <th>Status</th>
                  <th>Length</th>
                  <th>Duration</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, index) => (
                  <tr key={`${result.payload}-${index}`}>
                    <td class="ns-mono">{result.payload}</td>
                    <td class="ns-mono">{result.status ?? "—"}</td>
                    <td>{result.length ?? "—"}</td>
                    <td>{formatDuration(result.durationMs)}</td>
                    <td class="ns-danger">{result.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function DecoderPanel({
  notify,
}: {
  notify: (message: string, tone?: ToastState["tone"]) => void;
}) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<ReturnType<typeof detectEncoding>>([]);
  const [hashes, setHashes] = useState<string[]>([]);

  function decode() {
    if (!input.trim()) {
      notify("Enter a value to decode.", "danger");
      return;
    }
    setResults(detectEncoding(input));
    setHashes(identifyHash(input));
  }

  return (
    <div class="ns-dock-page">
      <Banner title="Local toolbox">
        Decoding runs entirely in this page. Nothing is sent to a provider.
      </Banner>
      <Field label="Input" htmlFor="decoder-input">
        <textarea
          id="decoder-input"
          class="ns-textarea"
          rows={7}
          value={input}
          placeholder="Paste base64, hex, URL-encoded text, HTML entities, or a JWT"
          onInput={(event) => setInput(event.currentTarget.value)}
        />
      </Field>
      <div class="ns-row">
        <Button variant="primary" onClick={decode}>
          <Code size={14} /> Detect and decode
        </Button>
        <Button
          onClick={() => {
            setInput("");
            setResults([]);
            setHashes([]);
          }}
        >
          Clear
        </Button>
      </div>
      {hashes.length > 0 ? (
        <Section title="Hash identification">
          <div class="ns-row">
            {hashes.map((hash) => (
              <Badge key={hash}>{hash}</Badge>
            ))}
          </div>
        </Section>
      ) : null}
      {results.length > 0 ? (
        <Section title="Results">
          <div class="ns-stack">
            {results.map((result, index) => (
              <div class="ns-section" key={`${result.kind}-${index}`}>
                <div class="ns-row">
                  <Badge tone="solid">{result.kind}</Badge>
                  <span class="ns-hint">
                    confidence {(result.confidence * 100).toFixed(0)}%
                  </span>
                  <span class="ns-grow" />
                  <IconButton
                    label="Copy decoded value"
                    onClick={() =>
                      void copyText(result.decoded).then(() =>
                        notify("Decoded value copied."),
                      )
                    }
                  >
                    <Copy size={15} />
                  </IconButton>
                </div>
                <pre class="ns-result">{truncate(result.decoded, 20_000)}</pre>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

render(<Dock />, document.getElementById("root")!);