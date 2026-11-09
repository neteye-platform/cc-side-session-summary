import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, Git, Model, PaneState, Status, Step, Usage, View } from '../types'

const PANE = 'cc-side-session-summary'
const TOOL = 'mcp__cc-side-session-summary__set_status'

const status = atom(
  { plugin: 'cc-side-session-summary', key: 'status' } as const,
  { goal: '', summary: '', current: '', detail: '', steps: [] } as Status,
  { shape: 'status-3' },
)
const activity = atom(
  { plugin: 'cc-side-session-summary', key: 'activity' } as const,
  { prompt: '', lastTool: '', isBusy: false } as Activity,
  { shape: 'activity-1' },
)

const INSTRUCTION = `A side pane shows the user a live session summary. Keep it current by calling ${TOOL} (a) after the user's request is clear, (b) whenever a step finishes or the plan changes, and (c) at the end of your turn. Pass: "goal" (one line: the purpose of this worktree/session, the overall objective; set it once the aim is clear and keep it stable unless the aim changes), "summary" (at most 2 short lines about the LAST thing completed and its outcome, not a running history; the steps list already carries the history), "current" (one short line: what you are doing right now, or "Idle - waiting for you" when finished), "detail" (2-4 short lines expanding on the current work: the approach, the file or problem in hand, what comes next; empty when idle), and "steps" (a short list of {text, status} with status done|doing|todo, at most 8 items). Call it alongside your other work; do not mention it to the user.`

const git = atom(
  { plugin: 'cc-side-session-summary', key: 'git' } as const,
  { branch: '', files: [], worktree: '', isLinked: false } as Git,
  { shape: 'git-2' },
)

async function refreshGit($: EngineInterface) {
  try {
    const b = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 })
    if (b.exitCode !== 0) return await update($, git, () => ({ branch: '', files: [], worktree: '', isLinked: false }))
    const st = await $.process.run(['git', 'status', '--porcelain', '--untracked-files=all'], { timeoutMs: 5000 })
    const w = await $.process.run(
      ['git', 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'],
      { timeoutMs: 5000 },
    )
    const [top = '', gitDir = '', common = ''] = w.stdout.split('\n')
    const files = st.stdout.split('\n').filter(Boolean)
    await update($, git, () => ({
      branch: b.stdout.trim(),
      files,
      worktree: top.trim(),
      isLinked: gitDir.trim() !== '' && gitDir.trim() !== common.trim(),
    }))
  } catch {
    await update($, git, () => ({ branch: '', files: [], worktree: '', isLinked: false }))
  }
}

const fromBranch = (b: string) =>
  ['', 'HEAD', 'main', 'master'].includes(b)
    ? ''
    : b.replace(/^[a-z]+\//, '').replace(/[-_]+/g, ' ')

const usage = atom(
  { plugin: 'cc-side-session-summary', key: 'usage' } as const,
  { tokens: 0, percent: -1, usd: 0 } as Usage,
  { shape: 'usage-1' },
)
const view = atom(
  { plugin: 'cc-side-session-summary', key: 'view' } as const,
  { isProgressOpen: true } as View,
  { shape: 'view-1' },
)

// Whether the person closed the pane. It lives in `$.state`, so a hot reload
// (which runs `session.start` again) does not open a pane the person closed.
const pane = atom(
  { plugin: 'cc-side-session-summary', key: 'pane' } as const,
  { isClosed: false } as PaneState,
  { shape: 'pane-1' },
)

const model = atom(
  { plugin: 'cc-side-session-summary', key: 'model' } as const,
  { name: '', effort: '' } as Model,
  { shape: 'model-1' },
)

async function refreshUsage($: EngineInterface) {
  try {
    const u = await $.session.usage()
    await update($, usage, () => ({
      tokens: u.context.tokens ?? 0,
      percent: u.context.percent ?? -1,
      usd: u.cost?.usd ?? 0,
    }))
  } catch {
    // usage is best effort: keep the last figures
  }
}

const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

// One palette, fixed because the pane has a fixed dark background: theme colors
// could turn unreadable on it. Meaning: green = done/ok, yellow = active/attention,
// grey = secondary, everything else the same off-white.
const FG = '#e6e6e6'
const GREEN = '#7ee787'
const YELLOW = '#f2cc60'
const GREY = '#9a9a9a'

const COLOR = { done: GREEN, doing: YELLOW, todo: GREY } as const

const MARK = { done: '• ✓', doing: '• ▶', todo: '•  ' } as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'set_status',
      description:
        'Update the user\'s side-pane session summary: progress checklist, 2-line summary of what is done, and the current activity.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'One line: the overall purpose of this worktree/session. Keep stable.' },
          summary: { type: 'string', description: 'At most 2 short lines: the last thing completed and its outcome. Not a running history.' },
          detail: { type: 'string', description: '2-4 short lines expanding on the current work: approach, what is in hand, what is next. Empty when idle.' },
          current: { type: 'string', description: 'One short line: what is being worked on right now.' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                status: { type: 'string', enum: ['done', 'doing', 'todo'] },
              },
              required: ['text', 'status'],
            },
          },
        },
        required: ['summary', 'current', 'steps'],
      },
      isDeferred: false,
    })
    await $.command.register({
      name: 'summary',
      description: 'Open the session summary side pane',
    })
    const p = await read($, pane)
    if (!p.isClosed) void $.ui.open({ id: PANE, title: 'Summary' })
    void refreshGit($)
    void refreshUsage($)

    return next(e)
  })

  // `/summary` toggles the pane. The answer has no `text`: a plugin's command
  // text goes into the transcript and into the model's requests, so the
  // feedback is a toast instead.
  on('command.run', { command: 'summary' }, async $ => {
    const open = (await $.ui.panes()).find(x => x.id === PANE)
    if (open !== undefined && open.isPlaced && open.isShown) {
      await $.ui.close({ id: PANE })
      $.ui.toast('Summary pane closed. Run /summary to open it again.')
    } else {
      await update($, pane, () => ({ isClosed: false }))
      await $.ui.open({ id: PANE, title: 'Summary' })
    }

    return {}
  })

  // Remember a close by the person (close mark, ctrl+x x) or by `/summary`.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'unload') await update($, pane, () => ({ isClosed: true }))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    // A slash command (such as `/summary`) needs no instruction: it does not
    // start a model turn of its own.
    if (e.command) return next(e)
    if (e.text) {
      // Drop the previous turn's leftovers so the pane does not show a stale
      // "Idle - waiting for you" or tool name under "Current (working)".
      await update($, status, s => ({ ...s, current: '' }))
      await update($, activity, a => ({ ...a, prompt: e.text.slice(0, 160), lastTool: '', isBusy: true }))
    }

    return next({ ...e, context: [...(e.context ?? []), INSTRUCTION] })
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const steps: Step[] = Array.isArray(e.steps)
      ? e.steps
          .filter((s: unknown): s is Step => typeof s === 'object' && s !== null)
          .slice(0, 12)
          .map(s => ({
            text: String(s.text ?? '').slice(0, 120),
            status: s.status === 'done' || s.status === 'doing' ? s.status : 'todo',
          }))
      : []
    await update($, status, prev => ({
      goal: typeof e.goal === 'string' && e.goal ? e.goal.slice(0, 200) : prev.goal,
      summary: String(e.summary ?? '').slice(0, 400),
      current: String(e.current ?? '').slice(0, 200),
      detail: String(e.detail ?? '').slice(0, 600),
      steps,
    }))

    return { result: 'ok', text: 'ok' }
  }).catch(() => ({ result: 'ok', text: 'The summary pane could not update; carry on.' }))

  on('tool.call', async ($, e, next) => {
    if (e.tool !== TOOL) {
      await update($, activity, a => ({ ...a, lastTool: e.tool, isBusy: true }))
    }

    const ran = await next(e)
    if (e.tool === 'Bash' || e.tool === 'Edit' || e.tool === 'Write') void refreshGit($)
    void refreshUsage($)

    return ran
  }).catch(($, e, next) => next(e))

  // The `set_status` calls are bookkeeping for the pane: hide their rows in the
  // transcript. The full view (ctrl+o, --verbose) still shows them.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== TOOL || e.props.isExpanded === true || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.props.tool !== TOOL || e.props.isExpanded === true || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  // Observe each main-loop model request for its model and effort, then pass the
  // response stream through untouched.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      void update($, model, () => ({
        name: e.model,
        effort: e.effort === undefined ? '' : String(e.effort),
      })).catch(() => undefined)
    }
    for await (const chunk of next(e)) yield chunk
  })

  on('turn.complete', async ($, e, next) => {
    await update($, activity, a => ({ ...a, isBusy: false }))
    await refreshGit($)
    await refreshUsage($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, status)
    const a = await read($, activity)
    const g = await read($, git)
    const u = await read($, usage)
    const m = await read($, model)
    const v = await read($, view)
    const { Button } = $.ui.resolve(e)
    const remaining = s.steps.filter(x => x.status !== 'done').length
    const isFoldable = s.steps.length > 2
    const counts = {
      staged: g.files.filter(f => f[0] !== ' ' && f[0] !== '?').length,
      unstaged: g.files.filter(f => f[1] !== ' ' && f[0] !== '?').length,
      untracked: g.files.filter(f => f.startsWith('??')).length,
    }
    const now = s.current || (a.lastTool ? `Running ${a.lastTool}` : a.prompt)

    return (
      <Box flexDirection="column" gap={1} backgroundColor="#262626" flexGrow={1} paddingX={1}>
        <Text color={FG}>
          {m.name === '' ? 'model: not used yet' : m.name}
          {m.effort !== '' && <Text color={GREY}>  ·  effort </Text>}
          {m.effort !== '' && <Text color={FG}>{m.effort}</Text>}
        </Text>
        <Text color={FG}>
          <Text color={GREY}>ctx </Text>
          <Text color={FG}>{fmtTokens(u.tokens)}</Text>
          {u.percent >= 0 && (
            <Text color={u.percent >= 80 ? YELLOW : GREEN}>  {u.percent}%</Text>
          )}
          <Text color={GREY}>  ·  </Text>
          <Text color={FG}>${u.usd.toFixed(2)}</Text>
        </Text>
        <Box flexDirection="column">
          <Text bold color={FG}>Worktree</Text>
          {g.worktree === '' ? (
            <Text color={GREY}>Not a git repository.</Text>
          ) : (
            <Text color={FG}>
              <Text color={FG}>{g.worktree.split('/').pop()}</Text>
              <Text color={GREY}>  {g.isLinked ? 'linked worktree' : 'main worktree'}</Text>
            </Text>
          )}
          {g.worktree !== '' && <Text color={GREY}>{g.worktree}</Text>}
          {g.branch !== '' && (
            <Text color={FG}>
              <Text color={FG}>{g.branch}</Text>
              {g.files.length === 0 && <Text color={GREEN}>  clean</Text>}
            </Text>
          )}
          {g.branch !== '' && g.files.length > 0 && (
            <Text color={FG}>
              <Text color={GREEN}>{counts.staged} staged</Text>
              <Text color={GREY}> · </Text>
              <Text color={YELLOW}>{counts.unstaged} unstaged</Text>
              <Text color={GREY}> · </Text>
              <Text color={GREY}>{counts.untracked} untracked</Text>
            </Text>
          )}
        </Box>
        <Box flexDirection="column">
          <Text bold color={FG}>Goal</Text>
          <Text bold color={FG}>{s.goal || fromBranch(g.branch) || 'Not set yet.'}</Text>
          {!s.goal && fromBranch(g.branch) !== '' && <Text color={GREY}>from branch name</Text>}
        </Box>
        <Box flexDirection="column">
          {isFoldable ? (
            <Button
              key="progress-toggle"
              label={`${v.isProgressOpen ? '▼' : '▶'} Progress${v.isProgressOpen ? '' : ` (${remaining} remaining)`}`}
              onPress={() => void update($, view, x => ({ ...x, isProgressOpen: !x.isProgressOpen }))}
            />
          ) : (
            <Text bold color={FG}>Progress</Text>
          )}
          {s.steps.length === 0 && <Text color={GREY}>No plan yet.</Text>}
          {(!isFoldable || v.isProgressOpen) && s.steps.map(step => (
            <Text color={COLOR[step.status]} bold={step.status === 'doing'}>
              {MARK[step.status]} {step.text}{step.status === 'doing' ? '  ← current' : ''}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text bold color={FG}>Current {a.isBusy ? '(working)' : '(idle)'}</Text>
          <Text color={YELLOW} bold>{now || 'Nothing yet.'}</Text>
          {s.detail !== '' && <Text color={FG}>{s.detail}</Text>}
        </Box>
        <Box flexDirection="column">
          <Text bold color={FG}>Last done</Text>
          <Text color={FG}>{s.summary || 'Nothing completed yet.'}</Text>
        </Box>
      </Box>
    )
  })
}
