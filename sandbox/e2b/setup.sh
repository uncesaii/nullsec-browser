#!/bin/bash
# NullSec CTF sandbox toolchain (Kali)
# See THIRD_PARTY_NOTICES.md for licenses.
set -u
LOG=/tmp/setup.log
: > "$LOG"

echo "[*] apt update"
apt-get update -y >>"$LOG" 2>&1 || true

install_group() {
  local label="$1"; shift
  echo "[*] install group: $label"
  if apt-get install -y --no-install-recommends "$@" >>"$LOG" 2>&1; then
    return 0
  fi
  echo "[!] batch failed for '$label', retrying per-package"
  for p in "$@"; do
    dpkg -s "$p" >/dev/null 2>&1 && continue
    apt-get install -y --no-install-recommends "$p" >>"$LOG" 2>&1 || echo "SKIP $p"
  done
}

CORE="ca-certificates gnupg curl wget git xz-utils unzip zip jq tree less vim nano file \
ncurses-base ncurses-term terminfo \
perl sudo locales tzdata build-essential gcc g++ make cmake pkg-config binutils \
python3 python3-venv python3-pip python3-dev python-is-python3 libffi-dev libssl-dev \
libxml2-dev libxslt1-dev zlib1g-dev libglib2.0-dev ruby-full ruby-dev \
net-tools iproute2 iputils-ping dnsutils whois traceroute netcat-traditional socat \
proxychains4 tcpdump ripgrep tmux screen rsync openssh-client"

SECURITY="nmap nikto whatweb wafw00f sqlmap wapiti wpscan subfinder dnsrecon dnsenum \
ffuf arjun gobuster dirsearch wfuzz amass smbclient smbmap nbtscan python3-impacket \
enum4linux hping3 arp-scan hashid libimage-exiftool-perl cewl testssl.sh gospider \
nuclei hydra binwalk foremost pandoc poppler-utils seclists wordlists"

REV_PWN="gdb gdb-multiarch ltrace strace upx-ucl qemu-user qemu-user-static patchelf \
radare2 rizin binutils-multiarch nasm clang lld libc6-dbg python3-capstone \
python3-pwntools libseccomp-dev gcc-multilib"

FORENSICS="sleuthkit tshark steghide testdisk photorec foremost imagemagick ffmpeg sox \
zbar-tools qrencode john hashcat unrar-free p7zip-full moreutils"

install_group "core" $CORE
install_group "security" $SECURITY
install_group "rev-pwn" $REV_PWN
install_group "forensics" $FORENSICS

echo "[*] pip packages"
pip_install() {
  pip3 install --break-system-packages --no-cache-dir "$@" >>"$LOG" 2>&1 && return 0
  for p in "$@"; do
    pip3 install --break-system-packages --no-cache-dir "$p" >>"$LOG" 2>&1 || echo "SKIP pip $p"
  done
}
pip_install pwntools pycryptodome sympy gmpy2 z3-solver capstone requests aiohttp \
  jinja2 ropgadget pyelftools unicorn keystone-engine pyjwt scapy dnspython \
  beautifulsoup4 lxml
pip_install angr volatility3

echo "[*] gem tools"
gem install --no-document one_gadget seccomp-tools zsteg >>"$LOG" 2>&1 || echo "SKIP gem tools"

echo "[*] git tools"
if [ ! -d /opt/RsaCtfTool ]; then
  git clone --depth 1 https://github.com/RsaCtfTool/RsaCtfTool.git /opt/RsaCtfTool >>"$LOG" 2>&1 || true
fi
if [ -d /opt/RsaCtfTool ]; then
  pip3 install --break-system-packages --no-cache-dir -r /opt/RsaCtfTool/requirements.txt >>"$LOG" 2>&1 || true
  printf '#!/bin/bash\nexec python3 /opt/RsaCtfTool/RsaCtfTool.py "$@"\n' > /usr/local/bin/rsactftool
  chmod +x /usr/local/bin/rsactftool
fi
if [ ! -d /opt/jwt_tool ]; then
  git clone --depth 1 https://github.com/ticarpi/jwt_tool.git /opt/jwt_tool >>"$LOG" 2>&1 || true
fi
[ -f /opt/jwt_tool/jwt_tool.py ] && printf '#!/bin/bash\nexec python3 /opt/jwt_tool/jwt_tool.py "$@"\n' > /usr/local/bin/jwt-tool && chmod +x /usr/local/bin/jwt-tool
if [ ! -d /opt/GitTools ]; then
  git clone --depth 1 https://github.com/internetwache/GitTools.git /opt/GitTools >>"$LOG" 2>&1 || true
fi
[ -f /opt/GitTools/Dumper/gitdumper.sh ] && ln -sf /opt/GitTools/Dumper/gitdumper.sh /usr/local/bin/gitdumper
[ -f /opt/GitTools/Extractor/extractor.sh ] && ln -sf /opt/GitTools/Extractor/extractor.sh /usr/local/bin/gitextractor
if [ ! -d /opt/pwndbg ]; then
  git clone --depth 1 https://github.com/pwndbg/pwndbg /opt/pwndbg >>"$LOG" 2>&1 || true
fi
[ -d /opt/pwndbg ] && (cd /opt/pwndbg && ./setup.sh >>"$LOG" 2>&1 || true)

command -v testssl >/dev/null 2>&1 && ln -sf "$(command -v testssl)" /usr/local/bin/testssl.sh || true

# E2B defaults to the uid-1000 "user" account when present; removing it makes
# the sandbox run as root so tool execution is unimpeded.
userdel -r user >>"$LOG" 2>&1 || true
rm -rf /home/user 2>/dev/null || true

echo "[*] cleanup"
apt-get clean >>"$LOG" 2>&1 || true
rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /root/.cache 2>/dev/null || true

echo "[*] versions"
for t in nmap nikto sqlmap ffuf nuclei gobuster rizin radare2 gdb patchelf tshark binwalk foremost steghide; do
  command -v "$t" >/dev/null 2>&1 && echo "OK $t" || echo "MISSING $t"
done
python3 - <<'PY' || true
mods = ["pwn","Crypto","z3","sympy","gmpy2","angr","volatility3","capstone","ELFFile"]
for m in mods:
    try:
        __import__(m)
        print("OK py:" + m)
    except Exception:
        print("MISSING py:" + m)
PY
echo "[*] done"
