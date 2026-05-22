---
name: conductor-osascript-fix
description: System Events Apple Events permission error (-1743) when running expo start inside Conductor Mac app
metadata:
  type: project
---

When `pnpm --filter @mix/mobile dev` (i.e. `expo start`) runs inside a Conductor workspace terminal, it fails with:
`osascript -e tell app "System Events" to count processes whose name is "Simulator" exited with non-zero code: 1 (-1743 Not authorized)`

**Why:** The call originates from `ensureSimulatorAppRunning.js` in `@expo/cli`. It fires when `expo start` tries to open or detect the iOS Simulator (triggered by `-i` flag or `i` keypress in Metro's interactive terminal). The Conductor app process lacks macOS TCC Automation permission to send Apple Events to `System Events`.

**How to apply:**
- `conductor.json` run script should use `CI=1 pnpm --filter @mix/mobile dev -- --localhost`
- `CI=1` sets `isInteractive()` to false in `@expo/cli`, disabling Metro's keyboard listener so the simulator path is never triggered
- `--localhost` prevents LAN broadcast (appropriate for agent-driven environment)
- Long-term fix: grant Conductor Automation > System Events permission in System Settings > Privacy & Security > Automation
