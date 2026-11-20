import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ExternalLink, List, RefreshCw, Shield, Sparkles } from "lucide-preact";
import browser from "webextension-polyfill";
import type { RequestRecord } from "../lib/types";
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  Logo,
  Section,
  Tabs,
} from "../ui/components";
import { listRequests } from "../lib/db";
import { loadWorkspace, openDock, openSidebar } from "../lib/storage";
import { sendMessage } from "../lib/messaging";
import { formatTime } from "../lib/util";
import { DevtoolsAi } from "./ai";

function DevtoolsPanel() {
  const [url, setUrl] = useState("");
  const [tabId, setTabId] = useState<number>();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("requests");

  useEffect(() => {
    setTabId(browser.devtools.inspectedWindow.tabId);
    void browser.devtools.inspectedWindow
      .eval("location.href")
      .then(([result]) => {
        if (typeof result === "string") setUrl(result);
      })
      .catch(() => {
        setUrl("");
      });
    const onNavigated = (newUrl: string) => setUrl(newUrl);
    browser.devtools.network.onNavigated.addListener(onNavigated);
    return () => {
      browser.devtools.network.onNavigated.removeListener(onNavigated);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const workspace = await loadWorkspace();
      const records = await listRequests(workspace.id, 100);
      if (cancelled) return;
      setRequests(records);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setLoading(true);
    const workspace = await loadWorkspace();
    setRequests(await listRequests(workspace.id, 100));
    try {
      const [result] = await browser.devtools.inspectedWindow.eval("location.href");
      if (typeof result === "string") setUrl(result);
    } catch {
      // The inspected tab may have gone away.
    }
    setLoading(false);
  }

  async function scanFlags() {
    const response = await sendMessage<{ url: string; matches: unknown[] }>({
      type: "nullsec:scan-flags",
    });
    if (!response.ok || !response.data) {
      return;
    }
    await openSidebar();
  }

  const tabRequests = tabId === undefined
    ? requests
    : requests.filter((request) => request.tabId === tabId);

  return (
    <div class="ns-app" style="min-height: 100vh">
      <header class="ns-header">
        <div class="ns-brand">
          <Logo />
          <span class="ns-brand-name">NullSec DevTools</span>
          <Badge>panel</Badge>
        </div>
        <div class="ns-header-actions">
          <Button size="sm" onClick={() => void openSidebar()}>
            <Shield size={14} /> Sidebar
          </Button>
          <Button size="sm" onClick={() => void openDock()}>
            <ExternalLink size={14} /> Dock
          </Button>
        </div>
      </header>
      <main class="ns-content">
        <div class="ns-page">
          <Banner title="Inspected tab">
            <span class="ns-mono ns-break">{url || "Unavailable"}</span>
          </Banner>
          <Tabs
            label="DevTools views"
            active={view}
            onChange={setView}
            items={[
              { id: "requests", label: "Requests", icon: <List size={14} /> },
              { id: "ai", label: "AI", icon: <Sparkles size={14} /> },
            ]}
          />
          {view === "ai" ? (
            <DevtoolsAi tabId={tabId} url={url} />
          ) : (
            <Section
              title={`Recent requests - ${tabRequests.length}`}
              action={
                <div class="ns-row">
                  <Button size="sm" onClick={() => void scanFlags()}>
                    Scan flags
                  </Button>
                  <Button size="sm" onClick={() => void refresh()} disabled={loading}>
                    <RefreshCw size={14} /> Refresh
                  </Button>
                </div>
              }
            >
              {tabRequests.length === 0 ? (
                <EmptyState title={loading ? "Loading..." : "No requests for this tab"}>
                  <p class="ns-hint">
                    Use the request dock for the full workspace history.
                  </p>
                </EmptyState>
              ) : (
                <div class="ns-table-wrap">
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
                      {tabRequests.map((request) => (
                        <tr key={request.id}>
                          <td class="ns-mono">{request.method}</td>
                          <td class="ns-mono">
                            {request.status ?? request.error ?? "-"}
                          </td>
                          <td
                            class="ns-truncate"
                            style="max-width: 360px"
                            title={request.url}
                          >
                            {request.url}
                          </td>
                          <td class="ns-muted">{formatTime(request.time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}
        </div>
      </main>
    </div>
  );
}

render(<DevtoolsPanel />, document.getElementById("root")!);
