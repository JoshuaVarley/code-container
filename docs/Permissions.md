# Harness Permissions

This document contains instructions for configuring each coding harness to run with full permissions inside Docker containers.

Configuration storage location: `~/.code-container/configs`

## OpenCode

Settings file location: `.opencode/opencode.json`

Add the following properties:
```json
{
  "permission": "allow"
}
```

## OpenAI Codex

Config file location: `.codex/config.toml`

Add the following lines:
```toml
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

## Claude Code

Settings file location: `.claude/settings.json`

Add the following properties:
```json
{
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

`defaultMode: "bypassPermissions"` skips every permission prompt — covers all current tools and any tools added in future Claude Code releases, so it doesn't drift the way an explicit `allow` list does.

Note: Claude Code refuses to run with bypass-permissions as UID 0 unless `IS_SANDBOX=1` is set in the environment. The base `Dockerfile` already sets this, so the setting works out of the box inside `container`. If you're applying this config outside a container as root, you must set `IS_SANDBOX=1` yourself.

## Gemini CLI

Gemini uses a "policy engine" to determine tool usage approvals. To bypass permissions, perform the following:

1. Navigte to the configuration storage location if not already:
    ```bash
    cd ~/.code-container/configs
    ```

2. Create the policies directory if it doesn't already exist:
    ```bash
    mkdir -p .gemini/policies
    ```

3. Create a rule file at `.gemini/policies/rules.toml` with the following contents:
    ```toml
    [[rule]]
    toolName = ["run_shell_command", "write_file", "replace"]
    decision = "allow"
    priority = 777
    ```
