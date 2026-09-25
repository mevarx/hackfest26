import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentLog from './AgentLog.jsx'

const EVENTS = [
  {
    agent: 'ORCHESTRATOR',
    status: 'running',
    message: 'Session opened for Kavya',
    timestamp: '00:00',
  },
  {
    agent: 'SKILLS DISCOVERY',
    status: 'done',
    message: '3 skill claims extracted',
    timestamp: '00:04',
  },
  {
    agent: 'LEARNING PATHWAY',
    status: 'waiting_consent',
    message: 'Confirm weekly learning capacity',
    timestamp: '00:08',
  },
]

function renderLog(properties = {}) {
  render(<AgentLog events={EVENTS} {...properties} />)
  return screen.getByRole('log', { name: 'Agent activity' })
}

describe('AgentLog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders timestamped events in arrival order with their content', () => {
    const log = renderLog()
    const entries = within(log).getAllByRole('listitem')

    expect(entries).toHaveLength(3)

    const renderedContent = entries.map((entry, index) => [
      within(entry).getByText(EVENTS[index].timestamp).textContent,
      within(entry).getByText(EVENTS[index].agent).textContent,
      within(entry).getByText(EVENTS[index].message).textContent,
    ])

    expect(renderedContent).toEqual([
      ['00:00', 'ORCHESTRATOR', 'Session opened for Kavya'],
      ['00:04', 'SKILLS DISCOVERY', '3 skill claims extracted'],
      ['00:08', 'LEARNING PATHWAY', 'Confirm weekly learning capacity'],
    ])
  })

  it('accepts PRD events without timestamps and shows assigned arrival time', () => {
    vi.setSystemTime(new Date('2026-09-25T12:34:56.000Z'))
    const log = renderLog({
      events: [
        {
          agent: 'SKILLS DISCOVERY',
          status: 'done',
          message: 'Skill claims extracted',
          data: { claims: 3 },
        },
      ],
    })

    expect(within(log).getByText('12:34:56')).toBeInTheDocument()
    expect(within(log).getByText('Skill claims extracted')).toBeInTheDocument()
  })

  it('announces polite updates and labels every status with text and an icon', () => {
    const log = renderLog()

    expect(log).toHaveAttribute('aria-live', 'polite')

    for (const status of [
      ['Running', '↻'],
      ['Done', '✓'],
      ['Waiting for consent', '◇'],
    ]) {
      const label = screen.getByText(status[0])
      const statusBadge = label.parentElement

      if (!statusBadge) {
        throw new Error('Status badge is missing')
      }

      const icon = within(statusBadge).getByText(status[1])

      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('surfaces unknown statuses and malformed payloads as invalid events', () => {
    const log = renderLog({
      events: [
        {
          agent: 'MARKET INTELLIGENCE',
          status: 'failed',
          message: 'Unexpected status',
        },
        {
          status: 'done',
          message: null,
        },
      ],
    })

    expect(within(log).getAllByRole('listitem')).toHaveLength(2)
    expect(within(log).getByText('Unknown status')).toBeInTheDocument()
    expect(within(log).getByText('Invalid event')).toBeInTheDocument()
    expect(within(log).getByText('Invalid event received')).toBeInTheDocument()
    expect(within(log).queryByText('Running')).not.toBeInTheDocument()
    expect(
      screen.getByText('0 valid events · 2 invalid'),
    ).toBeInTheDocument()
  })

  it('switches the visible source label with adapter metadata', () => {
    const { rerender } = render(
      <AgentLog events={EVENTS} source="simulated" />,
    )

    expect(screen.getByText('Simulated')).toBeInTheDocument()

    rerender(<AgentLog events={EVENTS} source="live" />)

    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.queryByText('Simulated')).not.toBeInTheDocument()
    expect(screen.getByText('Live event adapter')).toBeInTheDocument()
  })
})
