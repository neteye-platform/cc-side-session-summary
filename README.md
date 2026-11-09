# Side summary for Claude Code

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that
keeps a **live side pane** next to the conversation, so you can see where the
session stands without scrolling the transcript.

The pane has, from top to bottom:

- **Model row**: the model answering and its reasoning effort, read from each
  model request of the main conversation (subagents are ignored).
- **Stats row**: tokens in the context window, percent used, and what the
  session has cost so far. The percent is green, and turns yellow from 80%.
- **Worktree**: the folder name, whether it is a linked or the main worktree,
  the branch, and a recap of the staged / unstaged / untracked counts.
- **Goal**: one line on the purpose of the session. When none is set it falls
  back to a title made from the branch name.
- **Progress**: a color-coded checklist. Done steps are green, the current step
  is bold yellow, planned steps are grey. With more than two steps the heading
  is a button that folds the list to `(N remaining)`.
- **Current**: a headline and a few lines on what is being worked on right now.
- **Last done**: the last thing completed and its outcome.

The pane scrolls when it is taller than its window.

## How it works

The mod registers a tool, `set_status`, and adds a short instruction to each
prompt asking Claude to call it when your request becomes clear, when a step
finishes or the plan changes, and at the end of a turn. The goal, progress,
current and last-done text come from those calls. The git state and the usage
figures are read by the mod itself, and refresh after tool calls and at the end
of each turn.

The `set_status` calls are bookkeeping for the pane, so the mod hides their rows
in the chat. The full transcript view (ctrl+o) and `--verbose` still show them.
The instruction is not attached to slash commands.

## `/summary`

The pane opens by itself at session start. `/summary` toggles it: it closes the
pane when it is shown, and opens it otherwise. The command writes nothing to the
chat; a short toast confirms the close.

When you close the pane (with `/summary`, the close mark or the close key), it
stays closed for the rest of the session, also after a plugin reload. Run
`/summary` to bring it back.

On a terminal narrower than about 144 columns a pane does not open on its own,
so use the command there.

## Requirements

- Claude Code **v2.1.287 or later** (the version that introduced mods;
  they are on by default). Check with `claude --version`.
- Mods must be allowed to load: not started with `--safe-mode` or `--bare`,
  and not blocked by your organization's managed settings.
- `git` 2.31 or later for the Worktree section.

## Install

The plugin is listed in the `neteye-platform` marketplace, which lives in
[`neteye-platform/ai-agents-tools`](https://github.com/neteye-platform/ai-agents-tools).

From a terminal:

```bash
claude plugin marketplace add neteye-platform/ai-agents-tools
claude plugin install cc-side-session-summary@neteye-platform
```

Or from inside a Claude Code session:

```text
/plugin marketplace add neteye-platform/ai-agents-tools
/plugin install cc-side-session-summary@neteye-platform
```

No download or build step is needed: Claude Code fetches the repository and
loads the TypeScript directly. Start a new session (or run `/reload-plugins`),
then send a prompt.

To check it loaded, run `/plugin` and look for `cc-side-session-summary` under
**Installed**.

## Update

Claude Code caches an installed plugin by version, so updates arrive when the
`version` in `.claude-plugin/plugin.json` is bumped:

```bash
claude plugin marketplace update neteye-platform
claude plugin update cc-side-session-summary@neteye-platform
```

Refreshing the marketplace only updates its listing, so the second command is
what installs the new version. Then start a new session or run
`/reload-plugins`.

## Uninstall

```bash
claude plugin uninstall cc-side-session-summary@neteye-platform
```

You can also turn it off without removing it from the **Installed** tab of
`/plugin`.

## Try it for one session without installing

```bash
git clone https://github.com/neteye-platform/cc-side-session-summary.git
claude --plugin-dir ./cc-side-session-summary
```

The mod hot-reloads when you save a file in that directory.

## Limitations

- The Goal, Progress, Current and Last done sections are written by the model,
  so they are only as current as its updates.
- The instruction is attached to prompts (a `prompt.submit` hook), not to the
  system prompt, because another plugin's `prompt.compose` hook can shadow one.
- Outside a git repository the Worktree section says `Not a git repository`.
- The token and cost figures come from the last model response, so they move
  between turns, not while a long run of tool calls is going on.
- The interface part draws in the terminal, the Desktop app's Code tab and the
  VS Code extension (version 2.1.299 or later, or 2.1.304 for sessions that do
  not fetch feature flags, such as Amazon Bedrock). In `claude -p` and cloud
  sessions the hooks stay active but nothing is drawn.
- Mod events and render-site props can change between Claude Code releases.
  If the pane stops drawing, run `claude plugin validate .` and check the debug
  log.

## License

Dual-licensed under either of [Apache License 2.0](LICENSE-APACHE) or
[MIT](LICENSE-MIT), at your option.

## Credits

Developed by Marco Berlanda, with Claude Code.
