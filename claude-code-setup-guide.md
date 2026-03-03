# Claude Code 开发环境自动配置指南

> 本指南供 Claude Code 实例自动执行，以配置最优开发环境。所有命令和代码均为英文，说明文字为中文。

---

## 第一步：安装 dmux

dmux 是一个基于 tmux + git worktree 的 TUI 工具，用于管理多个并行 AI agent 工作区。

**前置依赖：**

- tmux 3.0+
- Node.js 18+
- Git 2.20+
- 至少一个支持的 agent CLI（如 Claude Code）

**安装：**

```bash
npm install -g dmux
```

**验证安装：**

```bash
dmux --version
```

**基本用法：** 在项目目录下运行 `dmux` 即可启动。按 `n` 创建新工作区，按 `m` 合并，按 `x` 关闭。完整文档见 [dmux.ai](https://dmux.ai)。

---

## 第二步：配置 Claude Code 全局权限设置

将以下内容写入（或合并到）`~/.claude/settings.json`：

```json
{
  "permissions": {
    "defaultMode": "plan",
    "allow": [
      "Bash", "Read", "Write", "Edit", "Glob", "Grep",
      "Task", "TaskOutput", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet",
      "SendMessage", "TeamCreate", "TeamDelete",
      "WebFetch", "WebSearch", "NotebookEdit",
      "EnterPlanMode", "ExitPlanMode", "Skill", "ToolSearch", "TaskStop",
      "*plugin*", "mcp*"
    ],
    "deny": []
  },
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": 1
  }
}
```

**操作说明：**

- 如果文件不存在，直接创建并写入上述内容。
- 如果文件已存在，将上述键值合并进去，保留已有的其他配置项不变。特别注意 `allow` 数组应合并去重，而非覆盖。

---

## 第三步：远程控制（默认关闭）

远程控制允许外部进程与 Claude Code 会话通信。**默认不启用**，仅在需要多会话协作或外部工具集成时手动开启。

如需启用，在 Claude Code 中运行：

```
/config
```

找到 **"Enable Remote Control for all sessions"** 选项，将其设置为 `true`。

---

## 第四步：安装 claude-mem 插件

依次执行以下命令：

```
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

**说明：** claude-mem 提供跨会话的持久记忆能力，使 Claude Code 能够在不同对话间保留上下文信息。

---

## 第五步：安装 superpowers 插件

依次执行以下命令：

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

**说明：** superpowers 扩展了 Claude Code 的工具集，提供更强大的操作能力。

---

## 第六步：安装 planning-with-files 插件

依次执行以下命令：

```
/plugin marketplace add OthmanAdi/planning-with-files
/plugin install planning-with-files@planning-with-files
```

**说明：** planning-with-files 增强了计划模式下的文件操作和规划能力。

---

## 第七步：安装 claude-code-helper 插件

依次执行以下命令：

```
/plugin marketplace add wangty6/claude-code-helper
/plugin marketplace install wangty6/claude-code-helper
```

**说明：** claude-code-helper 提供 StatusLine 监控等辅助功能。

---

## 第八步：配置 StatusLine（可选，需手动配置）

StatusLine 功能无法通过插件自动安装，需要手动添加配置。将以下内容合并到 `~/.claude/settings.json`：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/plugins/cache/claude-code-helper/claude-code-helper/1.0.0/scripts/statusline-monitor.mjs"
  }
}
```

**操作说明：**

- 将 `statusLine` 键值合并到已有的 `~/.claude/settings.json` 中，保留其他配置项不变。

---

## 第九步：验证配置

执行以下检查，确认所有配置已正确生效：

1. **验证全局设置：**

   ```bash
   cat ~/.claude/settings.json
   ```

   确认输出中包含 `"defaultMode": "plan"`、完整的 `allow` 列表以及 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 环境变量。

2. **验证插件安装：**

   ```
   /plugin
   ```

   切换到 **"Installed"** 标签页，确认以下四个插件均已安装：
   - claude-mem
   - superpowers
   - planning-with-files
   - claude-code-helper

3. **验证 StatusLine（如已配置）：**

   确认 `~/.claude/settings.json` 中包含 `statusLine` 配置项。

4. **验证计划模式：**

   启动一个新的 Claude Code 会话，确认默认进入 plan 模式。

---

## 使用方法

在全新的 Claude Code 会话中，粘贴或引用本指南，Claude Code 将按顺序自动执行每一步配置。
