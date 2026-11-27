// NullSec E2B bridge
// Local HTTP/JSON service that drives E2B sandboxes (Kali template) for the
// NullSec sidebar. Binds to 127.0.0.1 only. Sessions are backed by tmux so the
// agent can drive interactive tools (nc, gdb, python REPL) persisting across steps.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Sandbox } from "e2b";

try {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), ".env");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
} catch (e) {
  console.error("env load failed", e);
}

process.on("uncaughtException", (e) => console.error("uncaughtException", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));

const PORT = Number(process.env.NULLSEC_BRIDGE_PORT || 8787);
const TEMPLATE = process.env.NULLSEC_SANDBOX_TEMPLATE || "nullsec-kali";
const API_KEY = process.env.E2B_API_KEY;
const USER = process.env.NULLSEC_SANDBOX_USER || "root";
const DEFAULT_TIMEOUT_MS = Number(process.env.NULLSEC_SANDBOX_TIMEOUT_MS || 3_600_000);

if (!API_KEY) {
  console.error("E2B_API_KEY is required");
  process.exit(1);
}

/** @type {Map<string, {sbx: any, timeoutMs: number}>} */
const boxes = new Map();

async function getBox(name) {
  const entry = boxes.get(name);
  if (entry) {
    try {
      const info = await entry.sbx.getInfo();
      if (info && info.state === "running") {
        return entry.sbx;
      }
      if (info && info.state === "paused") {
        await entry.sbx.connect();
        return entry.sbx;
      }
    } catch {}
    try {
      await entry.sbx.kill();
    } catch {}
    boxes.delete(name);
  }
  const sbx = await Sandbox.create(TEMPLATE, { apiKey: API_KEY, timeoutMs: DEFAULT_TIMEOUT_MS });
  boxes.set(name, { sbx, timeoutMs: DEFAULT_TIMEOUT_MS });
  return sbx;
}

const sh = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

async function run(sbx, cmd, opts = {}) {
  const started = Date.now();
  try {
    try {
      await sbx.setTimeout(DEFAULT_TIMEOUT_MS);
    } catch {}
    const r = await sbx.commands.run(cmd, {
      user: USER,
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs,
      envs: { TERM: "xterm", DEBIAN_FRONTEND: "noninteractive", ...(opts.envs || {}) },
    });
    return {
      ok: true,
      exitCode: r.exitCode,
      stdout: r.stdout || "",
      stderr: r.stderr || "",
      durationMs: Date.now() - started,
    };
  } catch (e) {
    const res = e?.result;
    return {
      ok: false,
      error: String(e?.message || e),
      exitCode: res?.exitCode ?? null,
      stdout: res?.stdout || "",
      stderr: res?.stderr || "",
      durationMs: Date.now() - started,
    };
  }
}

const handlers = {
  async "/health"() {
    return {
      ok: true,
      template: TEMPLATE,
      user: USER,
      sandboxes: [...boxes.keys()],
    };
  },

  async "/sbx/create"(b) {
    const name = b.name || "default";
    const sbx = await getBox(name);
    let info = null;
    try {
      info = await sbx.getInfo();
    } catch {}
    return { ok: true, name, sandboxId: sbx.sandboxId, info };
  },

  async "/sbx/kill"(b) {
    const entry = boxes.get(b.name || "default");
    if (!entry) return { ok: false, error: "unknown sandbox" };
    await entry.sbx.kill();
    boxes.delete(b.name || "default");
    return { ok: true };
  },

  async "/sbx/extend"(b) {
    const sbx = await getBox(b.name || "default");
    await sbx.setTimeout(b.timeoutMs || DEFAULT_TIMEOUT_MS);
    return { ok: true };
  },

  async "/exec"(b) {
    const sbx = await getBox(b.name || "default");
    if (b.background) {
      const handle = await sbx.commands.run(b.cmd, {
        user: USER,
        background: true,
        cwd: b.cwd,
      });
      return { ok: true, pid: handle.pid };
    }
    return run(sbx, b.cmd, {
      cwd: b.cwd,
      timeoutMs: b.timeoutMs,
    });
  },

  async "/proc/list"(b) {
    const sbx = await getBox(b.name || "default");
    try {
      const list = await sbx.commands.list();
      return { ok: true, processes: list };
    } catch (e) {
      return { ok: false, error: String(e.message) };
    }
  },

  async "/proc/kill"(b) {
    const sbx = await getBox(b.name || "default");
    try {
      await sbx.commands.kill(b.pid);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message) };
    }
  },

  async "/session/start"(b) {
    const sbx = await getBox(b.name || "default");
    const session = b.session || "main";
    const cwd = b.cwd ? `-c ${sh(b.cwd)}` : "";
    const cmd = b.cmd || "/bin/bash -l";
    const r = await run(
      sbx,
      `tmux kill-session -t ${sh(session)} 2>/dev/null; tmux new-session -d -s ${sh(session)} ${cwd} ${sh(cmd)}; sleep 0.3; tmux ls 2>&1`
    );
    return { ...r, session };
  },

  async "/session/send"(b) {
    const sbx = await getBox(b.name || "default");
    const session = b.session || "main";
    const steps = [];
    if (b.text != null) {
      const b64 = Buffer.from(String(b.text), "utf8").toString("base64");
      steps.push(`printf %s ${sh(b64)} | base64 -d > /tmp/ns_in`);
      steps.push(`tmux load-buffer -b ns /tmp/ns_in`);
      steps.push(`tmux paste-buffer -t ${sh(session)} -b ns`);
    }
    for (const k of b.keys || []) steps.push(`tmux send-keys -t ${sh(session)} ${sh(k)}`);
    if (b.enter !== false) steps.push(`tmux send-keys -t ${sh(session)} Enter`);
    const r = await run(sbx, steps.join("; "));
    return { ...r, session };
  },

  async "/session/capture"(b) {
    const sbx = await getBox(b.name || "default");
    const session = b.session || "main";
    const hist = Number(b.history || 4000);
    const r = await run(
      sbx,
      `tmux capture-pane -pt ${sh(session)} -S -${hist} 2>&1; echo '---panetail---'; tmux capture-pane -pt ${sh(session)} 2>&1`
    );
    return { ...r, session };
  },

  async "/session/list"(b) {
    const sbx = await getBox(b.name || "default");
    const r = await run(sbx, `tmux ls 2>&1 || echo 'no sessions'`);
    return r;
  },

  async "/session/kill"(b) {
    const sbx = await getBox(b.name || "default");
    const session = b.session || "main";
    const r = await run(sbx, `tmux kill-session -t ${sh(session)} 2>&1 || true`);
    return r;
  },

  async "/file/read"(b) {
    const sbx = await getBox(b.name || "default");
    try {
      const content = await sbx.files.read(b.path, { format: "text" });
      const offset = Number(b.offset || 0);
      const length = Number(b.length || 0);
      const slice = length > 0 ? content.slice(offset, offset + length) : content.slice(offset);
      return { ok: true, path: b.path, size: content.length, content: slice };
    } catch (e) {
      return { ok: false, error: String(e.message) };
    }
  },

  async "/file/write"(b) {
    const sbx = await getBox(b.name || "default");
    try {
      await sbx.files.write(b.path, String(b.data ?? ""));
      return { ok: true, path: b.path };
    } catch (e) {
      return { ok: false, error: String(e.message) };
    }
  },

  async "/file/upload"(b) {
    const sbx = await getBox(b.name || "default");
    try {
      const bytes = Buffer.from(String(b.base64 || ""), "base64");
      await sbx.files.write(b.path, new Blob([bytes]));
      return { ok: true, path: b.path, size: bytes.length };
    } catch (e) {
      return { ok: false, error: String(e.message) };
    }
  },

  async "/file/download"(b) {
    const sbx = await getBox(b.name || "default");
    try {
      const bytes = await sbx.files.read(b.path, { format: "bytes" });
      return { ok: true, path: b.path, base64: Buffer.from(bytes).toString("base64") };
    } catch (e) {
      return { ok: false, error: String(e.message) };
    }
  },

  async "/file/list"(b) {
    const sbx = await getBox(b.name || "default");
    try {
      const entries = await sbx.files.list(b.path || "/root");
      return { ok: true, entries };
    } catch (e) {
      return { ok: false, error: String(e.message) };
    }
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const send = (code, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(code, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type,x-nullsec-token",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end(body);
  };
  if (req.method === "OPTIONS") return send(204, {});
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return send(200, await handlers["/health"]());
    }
    if (req.method !== "POST") return send(405, { ok: false, error: "POST only" });
    const handler = handlers[url.pathname];
    if (!handler) return send(404, { ok: false, error: `no route ${url.pathname}` });
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : {};
    const result = await handler(body);
    return send(200, result);
  } catch (e) {
    return send(500, { ok: false, error: String(e?.message || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`nullsec-e2b-bridge listening on http://127.0.0.1:${PORT} template=${TEMPLATE}`);
});


