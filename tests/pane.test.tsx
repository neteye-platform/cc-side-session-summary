import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'cc-side-summary',
  component: 'Pane',
  requestId: 'cc-side-summary',
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
