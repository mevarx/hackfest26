import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRouteMock = vi.fn()

vi.mock('../api.js', () => ({
  getRoute: (query) => getRouteMock(query),
}))

const { default: RouteMap } = await import('./RouteMap.jsx')

const ROUTE = {
  legs: [
    { skill: 'Manual testing', hours: 0 },
    { skill: 'Regression testing', hours: 30 },
    { skill: 'Test automation', hours: 80 },
  ],
  total_hours: 110,
  paid_bridge: {
    role: 'qa-analyst',
    target_skill: 'QA analytics',
    source: 'simulated',
    basis: 'local_fixture',
    note: 'Illustrative bridge built from the bundled SAP skills fixture.',
  },
  source: 'simulated',
  from_skill: 'Manual testing',
  target_role: 'qa-analyst',
  hours_per_week: 10,
  weeks: 11,
}

function renderMap(properties = {}) {
  render(
    <RouteMap
      route={null}
      source={undefined}
      error=""
      onFetch={undefined}
      onFromSkillChange={undefined}
      onTargetRoleChange={undefined}
      onHoursPerWeekChange={undefined}
      {...properties}
    />,
  )

  return screen.getByRole('heading', { name: 'Route map' }).closest('section')
}

function labelledCard(label) {
  const card = screen.getByText(label).closest('div')

  if (card === null) {
    throw new Error(`Summary card ${label} is missing`)
  }

  return card
}

describe('RouteMap', () => {
  beforeEach(() => {
    getRouteMock.mockReset()
  })

  it('renders every leg in order with its hours and ends at the target role', () => {
    renderMap({ route: ROUTE })

    const stations = screen.getByRole('list', {
      name: 'Route stations from Manual testing to qa-analyst',
    })
    const items = within(stations).getAllByRole('listitem')

    expect(items).toHaveLength(4)
    expect(items.map((item) => item.textContent)).toEqual([
      'Manual testing0 hours on this hop',
      'Regression testing30 hours on this hop',
      'Test automation80 hours on this hop',
      'qa-analystTarget role',
    ])
  })

  it('summarises the total hours, weeks and weekly capacity with labels', () => {
    renderMap({ route: ROUTE })

    expect(within(labelledCard('Total hours')).getByText('110')).toBeInTheDocument()
    expect(within(labelledCard('Weeks at 10h per week')).getByText('11')).toBeInTheDocument()
    expect(
      within(labelledCard('Route from')).getByText('Manual testing'),
    ).toBeInTheDocument()
    expect(
      within(labelledCard('Route to')).getByText('qa-analyst'),
    ).toBeInTheDocument()
  })

  it('exposes a text alternative that describes the station sequence in order', () => {
    renderMap({ route: ROUTE })

    const summary = screen.getByText(/Route sequence:/)

    expect(summary).toHaveTextContent(
      'Route sequence: Manual testing (0 hours), then Regression testing (30 hours), then Test automation (80 hours), then qa-analyst (target role).',
    )
  })

  it('renders the paid bridge defensively when the server returns no bridge', () => {
    renderMap({ route: { ...ROUTE, paid_bridge: null } })

    expect(screen.getByText('Paid bridge')).toBeInTheDocument()
    expect(
      screen.getByText(
        'No paid bridge attached to this route. The server returned no bridge block.',
      ),
    ).toBeInTheDocument()
  })

  it('renders every paid bridge key the fixture happens to send', () => {
    renderMap({
      route: {
        ...ROUTE,
        paid_bridge: { role: 'sdet', openings: 12, wait_weeks: null },
      },
    })

    const bridge = screen.getByText('Paid bridge').closest('div')

    if (bridge === null) {
      throw new Error('Paid bridge block is missing')
    }

    expect(within(bridge).getByText('role')).toBeInTheDocument()
    expect(within(bridge).getByText('sdet')).toBeInTheDocument()
    expect(within(bridge).getByText('openings')).toBeInTheDocument()
    expect(within(bridge).getByText('12')).toBeInTheDocument()
    expect(within(bridge).getByText('wait weeks')).toBeInTheDocument()
    expect(within(bridge).getByText('Not supplied')).toBeInTheDocument()
  })

  it('shows a simulated source badge and switches it for a live route', () => {
    const { rerender } = render(
      <RouteMap
        route={ROUTE}
        source="simulated"
        error=""
        onFetch={vi.fn()}
        onFromSkillChange={vi.fn()}
        onTargetRoleChange={vi.fn()}
        onHoursPerWeekChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Simulated route')).toBeInTheDocument()

    rerender(
      <RouteMap
        route={ROUTE}
        source="live"
        error=""
        onFetch={vi.fn()}
        onFromSkillChange={vi.fn()}
        onTargetRoleChange={vi.fn()}
        onHoursPerWeekChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Live route')).toBeInTheDocument()
    expect(screen.queryByText('Simulated route')).not.toBeInTheDocument()
  })

  it('keeps the live and simulated distinction visible while loading', () => {
    renderMap({ isLoading: true, source: 'live' })

    expect(screen.getByText('Live route')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mapping route…' })).toBeDisabled()
    expect(
      screen.getByText('Mapping the least-hours path…'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Route map' }).closest('section'),
    ).toHaveAttribute('aria-busy', 'true')
  })

  it('renders an empty state with a call to action when no route is returned', () => {
    renderMap({ onFetch: vi.fn() })

    expect(screen.getByText('No route yet')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Build a route to see the skill-by-skill metro line, the hours on each hop and the paid bridge at the end.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Build route' })).toBeEnabled()
  })

  it('renders the error message the server returned', () => {
    renderMap({
      onFetch: vi.fn(),
      error:
        "unknown from_skill 'Excel macros'; valid options: Manual testing, QA analytics",
    })

    const alert = screen.getByRole('alert')

    expect(alert).toHaveTextContent(
      "unknown from_skill 'Excel macros'; valid options: Manual testing, QA analytics",
    )
    expect(
      screen.getByRole('button', { name: 'Build route' }),
    ).toBeEnabled()
  })

  it('re-fetches with the new values when the form is changed and submitted', () => {
    const onFetch = vi.fn()
    const onFromSkillChange = vi.fn()
    const onTargetRoleChange = vi.fn()
    const onHoursPerWeekChange = vi.fn()
    renderMap({ onFetch, onFromSkillChange, onTargetRoleChange, onHoursPerWeekChange })

    fireEvent.change(screen.getByRole('combobox', { name: 'From skill' }), {
      target: { value: 'Regression testing' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Target role' }), {
      target: { value: 'sdet' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Hours per week' }), {
      target: { value: '15' },
    })

    expect(onFromSkillChange).toHaveBeenCalledWith('Regression testing')
    expect(onTargetRoleChange).toHaveBeenCalledWith('sdet')
    expect(onHoursPerWeekChange).toHaveBeenCalledWith(15)

    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))

    expect(onFetch).toHaveBeenCalledTimes(1)
    expect(onFetch).toHaveBeenCalledWith({
      fromSkill: 'Regression testing',
      targetRole: 'sdet',
      hoursPerWeek: 15,
    })
  })

  it('fetches on demand with getRoute when no onFetch handler is supplied', async () => {
    getRouteMock.mockResolvedValue(ROUTE)
    renderMap()

    expect(getRouteMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))

    expect(getRouteMock).toHaveBeenCalledWith({
      fromSkill: 'Manual testing',
      targetRole: 'qa-analyst',
      hoursPerWeek: 10,
    })

    expect(
      await screen.findByRole('list', {
        name: 'Route stations from Manual testing to qa-analyst',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Simulated route')).toBeInTheDocument()
  })

  it('renders the ApiError message from the internal fetch and stays retryable', async () => {
    getRouteMock.mockRejectedValue(
      new Error('unknown target_role; valid options: qa-analyst, sdet'),
    )
    renderMap()

    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'unknown target_role; valid options: qa-analyst, sdet',
      ),
    )
    expect(screen.getByRole('button', { name: 'Build route' })).toBeEnabled()
    expect(screen.getByText('No route yet')).toBeInTheDocument()
  })

  it('offers the target roles the backend accepts and labels the hours input', () => {
    renderMap({ onFetch: vi.fn() })

    const roleSelect = screen.getByRole('combobox', { name: 'Target role' })
    const options = within(roleSelect)
      .getAllByRole('option')
      .map((option) => option.textContent)

    expect(options).toEqual([
      'qa-analyst',
      'quality-analyst',
      'qa-automation-engineer',
      'sdet',
      'data-quality-analyst',
      'test-manager',
      'business-analyst',
    ])
    expect(
      screen.getByRole('spinbutton', { name: 'Hours per week' }),
    ).toHaveValue(10)
  })
})
