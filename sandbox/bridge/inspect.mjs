import { Sandbox } from "e2b";

const apiKey = process.env.E2B_API_KEY;
const sbx = await Sandbox.create("nullsec-kali", { apiKey, timeoutMs: 180_000 });
console.log("sandbox:", sbx.sandboxId);

for (const p of ["/bin/sh", "/bin/bash", "/bin/dash", "/usr/bin/env", "/etc/passwd"]) {
  try {
    const i = await sbx.files.getInfo(p);
    console.log("INFO", p, "type=", i.type, "mode=", i.mode, "size=", i.size);
  } catch (e) {
    console.log("INFO-ERR", p, String(e.message).slice(0, 120));
  }
}
try {
  const pw = await sbx.files.read("/etc/passwd");
  console.log("passwd:\n" + pw);
} catch (e) {
  console.log("passwd err", String(e.message).slice(0, 120));
}

for (const opts of [undefined, { user: "root" }]) {
  try {
    const r = await sbx.commands.run("id; pwd; echo hi", opts);
    console.log("RUN", JSON.stringify(opts), "=>", r.exitCode, JSON.stringify(r.stdout), JSON.stringify(r.stderr));
  } catch (e) {
    console.log("RUN-ERR", JSON.stringify(opts), String(e.message).slice(0, 160));
  }
}

await sbx.kill();
