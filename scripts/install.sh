#!/bin/sh
# dsh-genui 一键安装脚本（内测成员用）
#
# 用法:
#   ./scripts/install.sh            # 装进默认 web profile
#   ./scripts/install.sh tui        # 装进自定义 profile
#
# 做什么: 检查三个前置（dsh / pnpm / GitHub 登录）→ 用 git URL 方式把插件
# 装进 profile（自动带上全部依赖）→ 提示重启验证。
# 与手装唯一区别是多了前置自检，安装命令本身和 README 一致。

set -eu

PROFILE="${1:-web}"
REPO_URL="git+https://github.com/dsh-external/dsh-genui.git"
GIT_URL="https://github.com/dsh-external/dsh-genui.git"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
RED='\033[31m'; GREEN='\033[32m'; YELLOW='\033[33m'; BOLD='\033[1m'; NC='\033[0m'

fail() { printf "${RED}✗ %s${NC}\n" "$1"; exit 1; }
ok()   { printf "${GREEN}✓ %s${NC}\n" "$1"; }
warn() { printf "${YELLOW}! %s${NC}\n" "$1"; }

echo "${BOLD}== dsh-genui 安装（profile: $PROFILE）==${NC}"

# ── 前置 1: dsh ────────────────────────────────────────────────────────────
if ! command -v dsh >/dev/null 2>&1; then
  fail "未找到 dsh 命令。请先安装 DeepSeek Harness（最新内测版），再跑本脚本。"
fi
ok "dsh: $(dsh --version 2>/dev/null || echo present)"

# ── 前置 2: pnpm 在 PATH ───────────────────────────────────────────────────
if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1 && corepack pnpm --version >/dev/null 2>&1; then
    warn "pnpm 不在 PATH（corepack 可用）。正在执行 corepack enable ..."
    corepack enable || fail "corepack enable 失败，请手动执行: npm i -g pnpm"
  else
    fail "未找到 pnpm。请执行 'npm i -g pnpm'（或 'corepack enable'），然后新开终端再跑本脚本。"
  fi
  command -v pnpm >/dev/null 2>&1 || fail "pnpm 仍不在 PATH——新开一个终端，确认 'pnpm -v' 有输出后重试。"
fi
ok "pnpm: $(pnpm --version)"

# ── 前置 3: GitHub 凭据（私有组织仓库）────────────────────────────────────
if ! GIT_TERMINAL_PROMPT=0 git ls-remote "$GIT_URL" HEAD >/dev/null 2>&1; then
  fail "无法访问私有仓库 $GIT_URL —— 请先 'gh auth login'（或配置 git credential helper / SSH），并确认你有 dsh-external 组织访问权限。"
fi
ok "GitHub 私有仓库可访问"

# ── 已装检测（幂等）────────────────────────────────────────────────────────
PROFILE_PKG="$DSH_HOME/profiles/$PROFILE/package.json"
if [ -f "$PROFILE_PKG" ] && grep -q "dsh-genui" "$PROFILE_PKG" 2>/dev/null; then
  warn "插件已在 profile '$PROFILE' 中。"
  printf "  想重装就手动执行: dsh plugin --profile %s remove @deepseek-ai/dsh-genui，再跑本脚本。\n" "$PROFILE"
  printf "  否则直接: 重启 dsh web + 硬刷新 即可验证。\n"
  exit 0
fi

# ── 安装 ───────────────────────────────────────────────────────────────────
echo "安装中（首次会下载 mermaid/three 等依赖，约 1-2 分钟）..."
dsh plugin --profile "$PROFILE" add "$REPO_URL"

echo
ok "安装完成！"
echo
echo "${BOLD}接下来:${NC}"
echo "  1. 重启 dsh web（退出后重新执行 dsh web）"
echo "  2. 浏览器硬刷新（Cmd+Shift+R）"
echo "  3. 新会话里说: 用 dsh-ui 画个统计看板"
echo
