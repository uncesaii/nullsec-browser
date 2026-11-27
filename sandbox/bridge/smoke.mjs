import { Sandbox } from "e2b";

const apiKey = process.env.E2B_API_KEY;
if (!apiKey) {
  console.error("missing E2B_API_KEY");
  process.exit(1);
}

const sbx = await Sandbox.create("nullsec-kali", {
  apiKey,
  timeoutMs: 600_000,
});
console.log("sandbox:", sbx.sandboxId);

const run = (cmd) => sbx.commands.run(cmd, { user: "root" });

const checks = [
  "uname -a; id; cat /etc/os-release | head -n2",
  "nmap --version | head -n1",
  "for t in nikto sqlmap ffuf nuclei gobuster dnsrecon whatweb wafw00f hydra testssl.sh; do command -v $t >/dev/null && echo OK $t || echo MISS $t; done",
  "for t in rizin radare2 gdb gdb-multiarch patchelf ltrace strace upx qemu-x86_64 nasm; do command -v $t >/dev/null && echo OK $t || echo MISS $t; done",
  "for t in tshark binwalk foremost steghide testdisk john hashcat exiftool; do command -v $t >/dev/null && echo OK $t || echo MISS $t; done",
  "for t in rsactftool jwt-tool gitdumper gitextractor one_gadget seccomp-tools zsteg; do command -v $t >/dev/null && echo OK $t || echo MISS $t; done",
  "python3 -c \"import pwn; print('pwn', pwn.__version__)\"",
  "python3 -c \"import Crypto,z3,sympy,gmpy2,capstone; from elftools.elf.elffile import ELFFile; print('cryptopy ok')\"",
  "python3 -c \"import angr; print('angr', angr.__version__)\" 2>&1 | tail -n1",
  "python3 -c \"import volatility3; print('volatility3 ok')\" 2>&1 | tail -n1",
  "one_gadget --version 2>&1 | head -n1",
  "cat /proc/meminfo | head -n1; nproc; df -h / | tail -n1",
];

for (const cmd of checks) {
  const r = await run(cmd);
  const out = (r.stdout || "").trim();
  const err = (r.stderr || "").trim();
  console.log(`\n$ ${cmd}\nexit=${r.exitCode}\n${out}${err ? "\n[stderr] " + err : ""}`);
}

await sbx.kill();
console.log("\n[killed]");
