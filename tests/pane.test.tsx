import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'cc-side-session-summary',
  component: 'Pane',
  requestId: 'cc-side-session-summary',
  props: {
    title: 'Summary',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the pane draws its four sections on every surface', async $ => {
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    for (const heading of [/Worktree/, /Goal/, /Progress/, /Last done/]) {
      expect(await ui.find({ type: 'Text', text: heading })).toBeDefined()
    }
    await ui.unmount()
  }
})

test('with nothing stored the pane says so instead of failing', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /No plan yet/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Nothing completed yet/ })).toBeDefined()
  await ui.unmount()
})

const TOOL = 'mcp__cc-side-session-summary__set_status'
const RUN = {
  command: 'summary',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 200 },
} as const

test('/summary closes an open pane and opens a closed one', async ($, on) => {
  let isOpen = false
  const closed: string[] = []
  on('command.register', () => ({ value: { command: 'summary' } }))
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('ui.open', () => {
    isOpen = true

    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    isOpen = false
    closed.push(e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: isOpen
      ? [{ id: 'cc-side-session-summary', title: 'Summary', isShown: true, isFocused: false, isPlaced: true }]
      : [],
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(isOpen).toBe(true)

  const first = await $.command.run(RUN)
  expect(isOpen).toBe(false)
  expect(closed).toEqual(['cc-side-session-summary'])
  expect(first.text).toBeUndefined()

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(isOpen).toBe(false)

  const second = await $.command.run(RUN)
  expect(isOpen).toBe(true)
  expect(second.text).toBeUndefined()
})

test('the set_status row is hidden unless the view is expanded', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine row</Text>
  })
  const props = {
    tool_use_id: 't1',
    input: {},
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
  }

  for (const surface of ['terminal', 'desktop'] as const) {
    const hidden = await $.ui.mount({
      plugin: 'cc-side-session-summary',
      surface,
      component: 'ToolUse',
      requestId: 't1',
      props: { ...props, tool: TOOL, isExpanded: false },
    })
    expect(await hidden.find({ type: 'Text', text: /engine row/ })).toBeUndefined()
    await hidden.unmount()

    const expanded = await $.ui.mount({
      plugin: 'cc-side-session-summary',
      surface,
      component: 'ToolUse',
      requestId: 't1',
      props: { ...props, tool: TOOL, isExpanded: true },
    })
    expect(await expanded.find({ type: 'Text', text: /engine row/ })).toBeDefined()
    await expanded.unmount()

    const other = await $.ui.mount({
      plugin: 'cc-side-session-summary',
      surface,
      component: 'ToolUse',
      requestId: 't2',
      props: { ...props, tool_use_id: 't2', tool: 'Bash', isExpanded: false },
    })
    expect(await other.find({ type: 'Text', text: /engine row/ })).toBeDefined()
    await other.unmount()
  }
})
