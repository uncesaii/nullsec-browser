const BASE = process.env.BRIDGE || "http://127.0.0.1:8787";
const post = async (path, body) => {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return r.json();
};

console.log("health:", await (await fetch(BASE + "/health")).json());

console.log("\ncreate:", await post("/sbx/create", { name: "itest" }));
console.log("\nexec:", await post("/exec", { name: "itest", cmd: "id; uname -sr; nmap --version | head -n1", timeoutMs: 60000 }));

console.log("\nfile write:", await post("/file/write", { name: "itest", path: "/root/hello.txt", data: "hello nullsec\nline2\n" }));
console.log("file read:", await post("/file/read", { name: "itest", path: "/root/hello.txt" }));

console.log("\nsession start:", await post("/session/start", { name: "itest", session: "sh", cmd: "/bin/bash -l" }));
console.log("session send:", await post("/session/send", { name: "itest", session: "sh", text: "echo INTERACTIVE_OK; python3 -c 'import pwn; print(\"pwn in session\")'" }));
await new Promise((r) => setTimeout(r, 1500));
console.log("session capture:", await post("/session/capture", { name: "itest", session: "sh", history: 200 }));

console.log("\nsession list:", await post("/session/list", { name: "itest" }));
console.log("kill:", await post("/sbx/kill", { name: "itest" }));
