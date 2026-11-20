import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  Check,
  ExternalLink,
  Plug,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-preact";
import browser from "webextension-polyfill";
import type { FlagPattern, Settings, Workspace } from "../lib/types";
import {
  Badge,
  Banner,
  Button,
  Field,
  IconButton,
  Logo,
  PageHeader,
  Section,
  Toast,
} from "../ui/components";
import {
  loadSettings,
  loadWorkspace,
  saveSettings,
  openSidebar,
} from "../lib/storage";
import { deleteChallenge, listChallenges } from "../lib/db";
import { compileFlagPatterns } from "../lib/flag";
import {
  defaultProvider,
  getProvider,
  providerRegistry,
} from "../lib/providers";
import { pingBridge, sendMessage } from "../lib/messaging";

interface ToastState {
  message: string;
  tone?: "default" | "danger";
}

function Options() {
  const [settings, setSettings] = useState<Settings>();
  const [workspace, setWorkspace] = useState<Workspace>();
  const [bridgeOnline, setBridgeOnline] = useState<boolean | undefined>();
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastState>();
  const [saving, setSaving] = useState(false);

  function notify(message: string, tone: ToastState["tone"] = "default") {
    setToast({ message, tone });
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadSettings(), loadWorkspace(), pingBridge()]).then(
      ([loadedSettings, loadedWorkspace, bridge]) => {
        if (cancelled) return;
        setSettings(loadedSettings);
        setWorkspace(loadedWorkspace);
        setBridgeOnline(bridge.ok);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!settings) {
    return (
      <div class="ns-page">
        <p class="ns-muted">Loading settings…</p>
      </div>
    );
  }

  const provider = getProvider(settings.providerId) ?? defaultProvider();
  const model = settings.modelByProvider[provider.id] ?? provider.defaultModel ?? "";

  function update(patch: Partial<Settings>) {
    setSettings((current) => (current ? { ...current, ...patch } : current));
  }

  function updatePattern(index: number, patch: Partial<FlagPattern>) {
    if (!settings) return;
    update({
      flagPatterns: settings.flagPatterns.map((pattern, itemIndex) =>
        itemIndex === index ? { ...pattern, ...patch } : pattern,
      ),
    });
  }

  function addPattern() {
    if (!settings) return;
    update({
      flagPatterns: [
        ...settings.flagPatterns,
        { name: "custom", pattern: "", enabled: true },
      ],
    });
  }

  function removePattern(index: number) {
    if (!settings) return;
    update({
      flagPatterns: settings.flagPatterns.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  async function save() {
    if (!settings) return;
    const compiled = compileFlagPatterns(settings.flagPatterns);
    if (compiled.errors.length > 0) {
      setError(compiled.errors.join("; "));
      notify("Fix invalid flag patterns before saving.", "danger");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await saveSettings(settings);
      notify("Settings saved.");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Save failed", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function clearHistory() {
    if (!workspace) return;
    if (!window.confirm("Clear request history for this workspace?")) return;
    const response = await sendMessage({ type: "nullsec:clear-requests" });
    if (!response.ok) {
      notify(response.error ?? "Could not clear history.", "danger");
      return;
    }
    notify("Request history cleared.");
  }

  async function deleteAllChallenges() {
    if (!workspace) return;
    if (!window.confirm("Delete every challenge and note in this workspace?")) return;
    const challenges = await listChallenges(workspace.id);
    for (const challenge of challenges) {
      await deleteChallenge(challenge.id);
    }
    notify("All challenges deleted.");
  }

  return (
    <div class="ns-app">
      <header class="ns-header">
        <div class="ns-brand">
          <Logo />
          <span class="ns-brand-name">NullSec settings</span>
          <Badge>{browser.runtime.getManifest().version}</Badge>
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
            title="Settings"
            subtitle="Provider, agent, flag detection, bridge, and local data."
          />
          {error ? <Banner title="Configuration error" tone="danger">{error}</Banner> : null}
          <Section title="AI provider">
            <div class="ns-grid-2">
              <Field label="Default provider" htmlFor="settings-provider">
                <select
                  id="settings-provider"
                  class="ns-select"
                  value={provider.id}
                  onChange={(event) => update({ providerId: event.currentTarget.value })}
                >
                  {providerRegistry.providers.map((item) => (
                    <option value={item.id}>{item.name}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Model"
                htmlFor="settings-model"
                hint="Provider-specific model ID. Empty uses the provider default."
              >
                <input
                  id="settings-model"
                  class="ns-input"
                  value={model}
                  placeholder={provider.defaultModel ?? "model-id"}
                  onInput={(event) =>
                    update({
                      modelByProvider: {
                        ...settings.modelByProvider,
                        [provider.id]: event.currentTarget.value,
                      },
                    })
                  }
                />
              </Field>
            </div>
            <p class="ns-hint">
              API keys are entered in the sidebar and kept in session storage only. They
              are never saved to extension storage, IndexedDB, logs, or reports.
            </p>
            <div class="ns-row">
              <a
                class="ns-button"
                href={provider.docsUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} /> Provider docs
              </a>
              <Badge>{provider.protocol}</Badge>
              <Badge>{provider.supportsTools ? "tools" : "no tools"}</Badge>
              <Badge>{provider.supportsStreaming ? "streaming" : "non-streaming"}</Badge>
            </div>
            <Field label="Agent step limit" htmlFor="settings-steps">
              <input
                id="settings-steps"
                class="ns-input"
                type="number"
                min={1}
                max={20}
                value={settings.maxAgentSteps}
                onInput={(event) =>
                  update({
                    maxAgentSteps: Math.max(
                      1,
                      Math.min(20, Number(event.currentTarget.value) || 8),
                    ),
                  })
                }
              />
            </Field>
          </Section>
          <Section title="Agent control">
            <label class="ns-row">
              <input
                type="checkbox"
                checked={settings.enableActiveTools}
                disabled={workspace?.mode === "personal"}
                onChange={(event) =>
                  update({
                    enableActiveTools: event.currentTarget.checked,
                    enableSensitiveTools: event.currentTarget.checked
                      ? settings.enableSensitiveTools
                      : false,
                  })
                }
              />
              <span>
                Enable active tools: tabs, navigation, DOM, forms, and HTTP requests
              </span>
            </label>
            <label class="ns-row">
              <input
                type="checkbox"
                checked={settings.enableSensitiveTools}
                disabled={
                  !settings.enableActiveTools || workspace?.mode === "personal"
                }
                onChange={(event) =>
                  update({ enableSensitiveTools: event.currentTarget.checked })
                }
              />
              <span>
                Enable cookies, localStorage/sessionStorage, and page JavaScript (page JS
                can bypass scope)
              </span>
            </label>
            <label class="ns-row">
              <input
                type="checkbox"
                checked={settings.autoApproveActiveTools}
                disabled={
                  !settings.enableActiveTools || workspace?.mode === "personal"
                }
                onChange={(event) =>
                  update({ autoApproveActiveTools: event.currentTarget.checked })
                }
              />
              <span>Auto-approve active tool calls without per-action prompts</span>
            </label>
            <p class="ns-hint">
              Active tools are disabled in Personal workspaces. Targets must match the
              workspace scope. Page JavaScript runs in the content-script world and can
              leave scope, so it requires the sensitive-data toggle.
            </p>
          </Section>
          <Section title="Reports and redaction">
            <label class="ns-row">
              <input
                type="checkbox"
                checked={settings.redactionEnabled}
                onChange={(event) =>
                  update({ redactionEnabled: event.currentTarget.checked })
                }
              />
              <span>Redact known secrets in reports, page-context, and tool output by default</span>
            </label>
            <p class="ns-hint">
              Redaction is a safety net. Review every export; do not rely on pattern
              matching alone.
            </p>
          </Section>
          <Section
            title="Flag patterns"
            action={
              <Button size="sm" onClick={addPattern}>
                <Plus size={14} /> Add pattern
              </Button>
            }
          >
            <div class="ns-table-wrap">
              <table class="ns-table">
                <thead>
                  <tr>
                    <th>On</th>
                    <th>Name</th>
                    <th>Regex</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {settings.flagPatterns.map((pattern, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          type="checkbox"
                          checked={pattern.enabled}
                          onChange={(event) =>
                            updatePattern(index, {
                              enabled: event.currentTarget.checked,
                            })
                          }
                          aria-label={`Enable ${pattern.name}`}
                        />
                      </td>
                      <td>
                        <input
                          class="ns-input"
                          value={pattern.name}
                          onInput={(event) =>
                            updatePattern(index, {
                              name: event.currentTarget.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          class="ns-input ns-mono"
                          value={pattern.pattern}
                          onInput={(event) =>
                            updatePattern(index, {
                              pattern: event.currentTarget.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <IconButton
                          label="Remove pattern"
                          onClick={() => removePattern(index)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="ns-hint">
              Patterns are JavaScript regular expressions and are capped at 500
              characters. Invalid enabled patterns block saving.
            </p>
          </Section>
          <Section title="Native bridge">
            <div class="ns-row">
              <span
                class="ns-status-dot"
                data-ok={bridgeOnline === true ? "true" : undefined}
                data-error={bridgeOnline === false ? "true" : undefined}
              />
              <strong>{bridgeOnline ? "Connected" : "Not available"}</strong>
              <Button
                size="sm"
                onClick={() =>
                  void pingBridge().then((response) => {
                    setBridgeOnline(response.ok);
                    notify(
                      response.ok
                        ? "Native bridge responded."
                        : response.error ?? "Native bridge unavailable.",
                      response.ok ? "default" : "danger",
                    );
                  })
                }
              >
                <RefreshCw size={14} /> Check
              </Button>
            </div>
            <p class="ns-hint">
              The bridge is a separate, user-installed helper that manages workspace
              profiles, per-profile CA trust, and OS-keychain secrets. The browser works
              without it; profile and CA features stay disabled.
            </p>
            <div class="ns-row">
              <Button onClick={() => void openSidebar()}>
                <Plug size={14} /> Bridge status in sidebar
              </Button>
            </div>
          </Section>
          <Section title="Updates">
            <Field
              label="Update manifest URL"
              htmlFor="settings-update-url"
              hint="HTTPS URL for the signed update manifest. Leave empty until releases exist."
            >
              <input
                id="settings-update-url"
                class="ns-input ns-mono"
                value={settings.updateUrl ?? ""}
                placeholder="https://github.com/<org>/nullsec/releases/latest/download/update.json"
                onInput={(event) => update({ updateUrl: event.currentTarget.value })}
              />
            </Field>
            <p class="ns-hint">
              Automatic browser updates remain disabled in the NullSec source tree until
              the signed release pipeline is configured.
            </p>
          </Section>
          <Section title="Local data">
            <p class="ns-hint">
              Workspace: {workspace?.name ?? "unknown"}. Data stays in this profile.
            </p>
            <div class="ns-row">
              <Button variant="danger" onClick={() => void clearHistory()}>
                Clear request history
              </Button>
              <Button variant="danger" onClick={() => void deleteAllChallenges()}>
                Delete all challenges
              </Button>
            </div>
          </Section>
          <Section title="About">
            <div class="ns-row">
              <Badge tone="solid">NullSec {browser.runtime.getManifest().version}</Badge>
              <Badge>MPL-2.0</Badge>
              <Badge>Mullvad Browser 16.0.2 base</Badge>
            </div>
            <p class="ns-hint">
              NullSec is an independent browser project. It is not affiliated with or
              endorsed by Mullvad, Mozilla, or any provider listed here.
            </p>
            <div class="ns-row">
              <Shield size={15} />
              <span class="ns-hint">
                Authorized testing only. Active tools enforce workspace scope.
              </span>
            </div>
            <div class="ns-row">
              <Button
                size="sm"
                onClick={() =>
                  void browser.tabs.create({
                    url: browser.runtime.getURL("privacy.html"),
                  })
                }
              >
                Privacy and data handling
              </Button>
            </div>
          </Section>
          <div class="ns-row">
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? <RefreshCw size={14} /> : <Check size={14} />} Save settings
            </Button>
          </div>
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

render(<Options />, document.getElementById("root")!);