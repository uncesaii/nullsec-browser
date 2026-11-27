import { Sandbox } from "e2b";

const apiKey = process.env.E2B_API_KEY;
const sbx = await Sandbox.create("nullsec-kali", { apiKey, timeoutMs: 300_000 });
console.log("sandbox:", sbx.sandboxId);

const cmds = [
  "export TERM=xterm; python3 -c \"import pwn; print('pwntools ok')\"",
  "python3 -c \"import Crypto; print('pycryptodome', Crypto.__version__)\"",
  "python3 -c \"import z3; print('z3', z3.get_version_string())\"",
  "python3 -c \"import sympy, gmpy2; print('sympy', sympy.__version__, 'gmpy2 ok')\"",
  "python3 -c \"import capstone; print('capstone', capstone.__version__)\"",
  "python3 -c \"from elftools.elf.elffile import ELFFile; print('pyelftools ok')\"",
  "python3 -c \"import angr; print('angr', angr.__version__)\"",
  "python3 -c \"import volatility3; print('volatility3 ok')\"",
  "python3 -c \"import ropgadget; print('ropgadget ok')\"",
  "which testssl; command -v testssl.sh || echo 'testssl.sh missing symlink'",
  "pip3 list 2>/dev/null | grep -iE 'pwntools|pycryptodome|angr|volatility|z3|sympy|gmpy2|capstone|unicorn|ropgadget|pyelftools' ",
];

for (const cmd of cmds) {
  try {
    const r = await sbx.commands.run(cmd, { user: "root" });
    console.log(`\n$ ${cmd}\nexit=${r.exitCode}\n${(r.stdout || "").trim()}${(r.stderr || "").trim() ? "\n[stderr] " + r.stderr.trim() : ""}`);
  } catch (e) {
    console.log(`\n$ ${cmd}\nTHREW: ${String(e.message).slice(0, 200)}`);
    if (e.result) console.log("stdout:", (e.result.stdout || "").trim(), "\nstderr:", (e.result.stderr || "").trim());
  }
}

await sbx.kill();
console.log("\n[killed]");
