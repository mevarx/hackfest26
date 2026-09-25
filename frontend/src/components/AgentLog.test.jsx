import { act, fireEvent, render, screen, within } from '@testing-library/react'
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

  it('renders a three-way source badge for local, simulated, and live', () => {
    const { rerender } = render(<AgentLog events={EVENTS} source="local" />)

    expect(screen.getByText('Local')).toBeInTheDocument()
    expect(screen.getByText('In-browser event adapter')).toBeInTheDocument()

    rerender(<AgentLog events={EVENTS} source="simulated" />)

    expect(screen.getByText('Simulated')).toBeInTheDocument()
    expect(screen.queryByText('Local')).not.toBeInTheDocument()
  })

  it('labels every line with the source of that event', () => {
    const log = renderLog({
      source: 'simulated',
      events: [
        { ...EVENTS[0], source: 'live' },
        { ...EVENTS[1], source: 'simulated' },
        { ...EVENTS[2], source: 'local' },
      ],
    })
    const entries = within(log).getAllByRole('listitem')

    expect(entries.map((entry) => within(entry).getByText(/^(LIVE|SIM|LOCAL)$/).textContent)).toEqual([
      'LIVE',
      'SIM',
      'LOCAL',
    ])

    for (const [label, source] of [
      ['Event source live', 'live'],
      ['Event source simulated', 'simulated'],
      ['Event source local', 'local'],
    ]) {
      const badge = within(log).getByLabelText(label)

      expect(badge).toHaveAttribute('role', 'img')
      expect(badge.className).toContain(
        source === 'live' ? 'teal' : source === 'simulated' ? 'amber' : 'red',
      )
    }
  })

  it('falls back to the stream source when an event carries none', () => {
    const log = renderLog({ source: 'local' })

    expect(within(log).getAllByText('LOCAL')).toHaveLength(EVENTS.length)
  })

  it('shows the connection indicator and a reconnect affordance', () => {
    const onReconnect = vi.fn()
    const { rerender } = render(
      <AgentLog
        events={EVENTS}
        source="live"
        status="connecting"
        lastEventId={12}
        reconnectAttempts={2}
        onReconnect={onReconnect}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Connecting')
    expect(screen.getByText('last_event_id=12 · 2 reconnect attempts')).toBeInTheDocument()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    })

    expect(onReconnect).toHaveBeenCalledOnce()

    rerender(
      <AgentLog events={EVENTS} source="live" status="error" />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Stream error')
    expect(screen.getByText('3 valid events')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reconnect' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('last_event_id=12 · 2 reconnect attempts')).not.toBeInTheDocument()
  })
})
