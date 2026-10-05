#!/usr/bin/env bash
# 并行代理 worktree 管理：每个代理一个独立工作区，避免多个代理同时改同一份文件。
#
# 约定：
#   主仓库   N:/jar/show-shelf              （main 分支，保持干净）
#   工作区   N:/jar/worktrees/<名称>         （仓库外，便于统一清理）
#   分支     agent/<名称>                    （基于 main 检出）
#
# 用法（在仓库内任意位置执行）：
#   scripts/worktree.sh add <名称> [基础分支]   # 新建工作区
#   scripts/worktree.sh list                    # 查看所有工作区
#   scripts/worktree.sh remove <名称>           # 删除工作区及其分支
#
# 说明：worktree 路径会写进子工作区的 .git 文件，必须是 Windows 原生形式
# （N:/...）。若直接在本 MSYS 环境调用 git，工作目录可能被解析为 /mnt/n/...
# 并写进该文件，导致 Windows 版 git 无法解析子工作区；因此这里把路径统一
# 归一化后，通过 cmd.exe 调用 git，确保始终使用 Windows 路径语义。
set -euo pipefail

# 把 /mnt/n/... 、/n/... 、N:\... 统一成 N:/...
normalize() {
  local p="${1//\\//}"
  case "$p" in
    /mnt/[a-zA-Z]/*) p="$(printf '%s' "${p:5:1}" | tr 'a-z' 'A-Z'):/${p:7}" ;;
    /[a-zA-Z]/*)     p="$(printf '%s' "${p:1:1}" | tr 'a-z' 'A-Z'):/${p:3}" ;;
    [a-zA-Z]:/*)     p="$(printf '%s' "${p:0:1}" | tr 'a-z' 'A-Z'):/${p:3}" ;;
  esac
  printf '%s' "$p"
}

# git 需要 Windows 形式路径，而 bash 自身的文件测试只认 MSYS 形式，故需反向着转换。
to_msys() {
  local p="$1"
  case "$p" in
    [a-zA-Z]:/*) printf '/mnt/%s/%s' "$(printf '%s' "${p:0:1}" | tr 'A-Z' 'a-z')" "${p:3}" ;;
    *) printf '%s' "$p" ;;
  esac
}

repo_dir="$(normalize "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)")"
pool_dir="$(dirname "$repo_dir")/worktrees"
branch_prefix="agent/"
name="${2:-}"
base="${3:-main}"

case "$repo_dir" in
  [a-zA-Z]:/*) ;;
  *) echo "错误：无法解析仓库路径：$repo_dir" >&2; exit 1 ;;
esac

# 通过 cmd.exe 执行 git，避免 MSYS 路径语义污染 worktree 记录。
run_git() {
  cmd.exe /c git -C "$(printf '%s' "$repo_dir" | tr '/' '\\')" "$@"
}

case "${1:-list}" in
  add)
    [ -n "$name" ] || { echo "用法: $0 add <名称> [基础分支]" >&2; exit 2; }
    [ -e "$(to_msys "$pool_dir/$name")" ] && { echo "错误：$pool_dir/$name 已存在" >&2; exit 1; }
    # 分支已存在时 git 会报错，但仍残留已注册的工作区记录，故先自行拦截。
    if run_git show-ref --verify --quiet "refs/heads/$branch_prefix$name"; then
      echo "错误：分支 $branch_prefix$name 已存在；请先执行 $0 remove $name 或改用其他名称" >&2
      exit 1
    fi
    run_git worktree add -b "$branch_prefix$name" "$pool_dir/$name" "$base"
    # 兜底校验：若 .git 记录成 /mnt/n/... 形式，该工作区在 Windows 版 git 下不可用。
    if ! { read -r gitdir_line < "$(to_msys "$pool_dir/$name/.git")" 2>/dev/null &&
           case "${gitdir_line%$'\r'}" in "gitdir: "[A-Za-z]:/*) true ;; *) false ;; esac; }; then
      echo "错误：$pool_dir/$name/.git 未记录 Windows 路径，worktree 在 Windows 版 git 下不可用" >&2
      echo "请清理：rm -rf $pool_dir/$name 后执行 run_git worktree prune 与 run_git branch -D $branch_prefix$name" >&2
      exit 1
    fi
    echo "已创建工作区：$pool_dir/$name（分支 $branch_prefix$name）"
    ;;
  list)
    run_git worktree list
    ;;
  remove)
    [ -n "$name" ] || { echo "用法: $0 remove <名称>" >&2; exit 2; }
    # 目录可能已被手工删除，此时 worktree remove 会失败，退回 prune 清理注册记录。
    run_git worktree remove --force "$pool_dir/$name" || run_git worktree prune
    run_git branch -D "$branch_prefix$name"
    echo "已删除工作区 $pool_dir/$name 及分支 $branch_prefix$name"
    ;;
  *)
    echo "用法: $0 <add|list|remove> [名称] [基础分支]" >&2
    exit 2
    ;;
esac
