import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  ExternalLink,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-preact";
import browser from "webextension-polyfill";
import type { Workspace } from "../lib/types";
import {
  Badge,
  Banner,
  Button,
  Logo,
  PageHeader,
  Section,
  Toast,
} from "../ui/components";
import { loadWorkspace, openSidebar } from "../lib/storage";
import { clearRequests } from "../lib/db";

interface ToastState {
  message: string;
  tone?: "default" | "danger";
}

function Privacy() {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [toast, setToast] = useState<ToastState>();

  useEffect(() => {
    void loadWorkspace().then(setWorkspace);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function clearHistory() {
    if (!workspace) return;
    if (!window.confirm("Clear all captured request metadata for this workspace?")) return;
    await clearRequests(workspace.id);
    setToast({ message: "Request history cleared." });
  }

  return (
    <div class="ns-app">
      <header class="ns-header">
        <div class="ns-brand">
          <Logo />
          <span class="ns-brand-name">NullSec privacy</span>
          <Badge>local-first</Badge>
        </div>
        <div class="ns-header-actions">
          <Button size="sm" onClick={() => void openSidebar()}>
            Open sidebar
          </Button>
        </div>
      </header>
      <main class="ns-content">
        <div class="ns-page" style="max-width: 820px; margin: 0 auto; width: 100%">
          <PageHeader
            title="Privacy and data handling"
            subtitle={`NullSec ${browser.runtime.getManifest().version} · this page is part of the extension, not a remote site`}
          />
          <Banner title="No NullSec servers">
            NullSec does not operate an account service, telemetry endpoint, or prompt
            proxy. The browser and extension work locally. The only network destination
            you choose for AI is the provider you configure.
          </Banner>
          <Section title="What is stored">
            <ul class="ns-prose">
              <li>
                Workspace name, mode, authorized scope, compatibility settings, and rate
                limit in <span class="ns-mono">browser.storage.local</span>.
              </li>
              <li>
                Challenges, notes, timeline events, flag candidates, and draft reports in
                the local IndexedDB database.
              </li>
              <li>
                Request metadata and headers captured by the dock, capped at 5,000 records
                per workspace. Request and response <strong>bodies</strong> from normal
                browser traffic are not captured.
              </li>
              <li>
                Provider API keys only in this sidebar's <span class="ns-mono">sessionStorage</span>.
                They are cleared when the session ends and are never written to extension
                storage, IndexedDB, logs, or reports.
              </li>
            </ul>
          </Section>
          <Section title="Firefox data-collection disclosure">
            <p class="ns-prose">
              The extension manifest declares <span class="ns-mono">authenticationInfo</span>,{" "}
              <span class="ns-mono">browsingActivity</span>, and{" "}
              <span class="ns-mono">websiteContent</span> as optional data permissions
              because a provider test or AI request can transmit your provider API key, the
              page context you explicitly capture, and request metadata to the provider you
              selected. Firefox asks for consent before the first provider test. NullSec does
              not receive that data. No notes or request history is transmitted to NullSec.
            </p>
          </Section>
          <Section title="Request capture">
            <p class="ns-prose">
              NullSec observes http(s) and WebSocket requests through the extension
              <span class="ns-mono"> webRequest</span> permission so the request dock can
              show history. Captured headers can contain cookies or authorization tokens;
              exports redact known secret patterns by default, but storage is not encrypted.
              Use a dedicated CTF profile and clear history after sensitive work.
            </p>
            <p class="ns-hint">
              AI provider hosts and extension pages are excluded from request capture.
              Cookies are not read through the cookies API for AI context.
            </p>
          </Section>
          <Section title="AI and page context">
            <p class="ns-prose">
              NullSec is bring-your-own-key. When AI calls are enabled, prompts, captured
              page context, and read-only tool results are sent only to the provider you
              select, under that provider's terms. Firefox asks for optional data consent
              before the first provider test or prompt. NullSec does not proxy, mirror, or
              retain those prompts on a server. Page context is captured only after you
              press capture, analyze, or ask the assistant to use its page tool; forms
              exclude field values. Cookies and storage are read only through the opt-in
              sensitive tools described below.
            </p>
            <p class="ns-hint">
              By default the assistant can call read-only tools: page context, flag scan,
              request metadata, and local decoding. Request headers, cookies, and bodies are
              not included in request-history tool results. In a CTF workspace you can opt
              into active tools: tab control, navigation, DOM reads and writes, HTTP
              requests, cookies, localStorage/sessionStorage, and page JavaScript. Active
              tools are limited to in-scope hosts, except page JavaScript, which can bypass
              scope and is therefore opt-in behind a separate sensitive-data toggle. Active
              calls ask for confirmation unless auto-approve is enabled.
            </p>
            <p class="ns-hint">
              The DevTools panel uses the same settings and consent. When enabled, its
              assistant can evaluate expressions in the inspected page, read HAR entries
              and headers, and read cookies or storage for the inspected URL. HAR headers
              can contain session tokens; redaction is applied when enabled, but review
              what you send to the provider.
            </p>
          </Section>
          <Section title="Permissions">
            <div class="ns-table-wrap">
              <table class="ns-table">
                <thead>
                  <tr>
                    <th>Permission</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="ns-mono">&lt;all_urls&gt;</td>
                    <td>Read the active tab for scans/context, and operate in-scope tabs when active tools are enabled.</td>
                  </tr>
                  <tr>
                    <td class="ns-mono">webRequest, webRequestBlocking</td>
                    <td>Request dock history and future per-workspace header rules.</td>
                  </tr>
                  <tr>
                    <td class="ns-mono">cookies</td>
                    <td>Read or set in-scope cookies only when cookie tools are enabled and confirmed.</td>
                  </tr>
                  <tr>
                    <td class="ns-mono">storage, unlimitedStorage</td>
                    <td>Local settings, workspace data, and IndexedDB quota.</td>
                  </tr>
                  <tr>
                    <td class="ns-mono">tabs</td>
                    <td>Identify, activate, navigate, and close in-scope tabs when active tools are enabled.</td>
                  </tr>
                  <tr>
                    <td class="ns-mono">downloads</td>
                    <td>Export reports and request records you explicitly save.</td>
                  </tr>
                  <tr>
                    <td class="ns-mono">menus</td>
                    <td>Selection and page context-menu actions.</td>
                  </tr>
                  <tr>
                    <td class="ns-mono">nativeMessaging</td>
                    <td>Optional native bridge for profiles, CA trust, and keychain secrets.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Native bridge">
            <p class="ns-prose">
              The bridge is a separate helper you install. It is not bundled and is
              optional. It manages browser profiles, imports a per-profile proxy CA, and
              stores secrets in the OS keychain. The bridge does not receive AI keys or
              challenge notes.
            </p>
            <Badge>not installed in this build</Badge>
          </Section>
          <Section title="Retention and deletion">
            <p class="ns-prose">
              Request history is capped at 5,000 records per workspace. You can clear
              history and delete challenges from Settings. Removing the extension or the
              browser profile deletes extension storage and IndexedDB. Exported files are
              outside NullSec's control.
            </p>
            <div class="ns-row">
              <Button variant="danger" onClick={() => void clearHistory()} disabled={!workspace}>
                <Trash2 size={14} /> Clear request history
              </Button>
              <Button onClick={() => void browser.runtime.openOptionsPage()}>
                <Shield size={14} /> Open settings
              </Button>
            </div>
          </Section>
          <Section title="Security reporting">
            <p class="ns-prose">
              Do not include API keys, cookies, or unauthorized target data in a report.
              Use the repository security policy once the public repository and release
              channel are configured.
            </p>
            <div class="ns-row">
              <a
                class="ns-button"
                href="https://github.com/<org>/nullsec/security/policy"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} /> Security policy placeholder
              </a>
              <Button size="sm" onClick={() => void openSidebar()}>
                <RefreshCw size={14} /> Back to sidebar
              </Button>
            </div>
          </Section>
        </div>
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

render(<Privacy />, document.getElementById("root")!);