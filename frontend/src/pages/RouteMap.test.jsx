import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRouteMock = vi.fn()

vi.mock('../api.js', () => ({
  getRoute: (...args) => getRouteMock(...args),
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
  render(<RouteMap {...properties} />)

  return screen.getByRole('heading', { name: 'Route map' }).closest('section')
}

/** Render, then resolve the panel's first route request with `route`. */
async function renderMapWithRoute(route) {
  getRouteMock.mockResolvedValue(route)
  const section = renderMap()

  fireEvent.click(screen.getByRole('button', { name: 'Build route' }))

  return section
}

function labelledCard(label) {
  const card = screen.getByText(label).closest('div')

  if (card === null) {
    throw new Error(`Summary card ${label} is missing`)
  }

  return card
}

/**
 * The panel header. The route's source tag is the only one on screen, so scoping
 * to the header keeps it distinguishable from the `source: 'simulated'` row the
 * paid bridge block happens to print from the same fixture.
 */
function panelHeader() {
  const section = screen.getByRole('heading', { name: 'Route map' }).closest('section')
  const header = section === null ? null : section.firstElementChild

  if (!(header instanceof HTMLElement)) {
    throw new Error('Route map header is missing')
  }

  return header
}

describe('RouteMap', () => {
  beforeEach(() => {
    getRouteMock.mockReset()
  })

  it('renders every leg in order with its hours and ends at the target role', async () => {
    await renderMapWithRoute(ROUTE)

    const stations = await screen.findByRole('list', {
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

  it('summarises the total hours, weeks and weekly capacity with labels', async () => {
    await renderMapWithRoute(ROUTE)
    await screen.findByText(/Route sequence:/)

    expect(within(labelledCard('Total hours')).getByText('110')).toBeInTheDocument()
    expect(within(labelledCard('Weeks at 10h per week')).getByText('11')).toBeInTheDocument()
    expect(
      within(labelledCard('Route from')).getByText('Manual testing'),
    ).toBeInTheDocument()
    expect(
      within(labelledCard('Route to')).getByText('qa-analyst'),
    ).toBeInTheDocument()
  })

  it('exposes a text alternative that describes the station sequence in order', async () => {
    await renderMapWithRoute(ROUTE)

    const summary = await screen.findByText(/Route sequence:/)

    expect(summary).toHaveTextContent(
      'Route sequence: Manual testing (0 hours), then Regression testing (30 hours), then Test automation (80 hours), then qa-analyst (target role).',
    )
  })

  it('renders the paid bridge defensively when the server returns no bridge', async () => {
    await renderMapWithRoute({ ...ROUTE, paid_bridge: null })

    expect(await screen.findByText('Paid bridge')).toBeInTheDocument()
    expect(
      screen.getByText(
        'No paid bridge attached to this route. The server returned no bridge block.',
      ),
    ).toBeInTheDocument()
  })

  it('renders every paid bridge key the fixture happens to send', async () => {
    await renderMapWithRoute({
      ...ROUTE,
      paid_bridge: { role: 'sdet', openings: 12, wait_weeks: null },
    })

    const bridge = (await screen.findByText('Paid bridge')).closest('div')

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

  it('labels the route source from the response and switches it for a live route', async () => {
    const { unmount } = render(<RouteMap />)

    expect(within(panelHeader()).getByText('source pending')).toBeInTheDocument()

    getRouteMock.mockResolvedValue(ROUTE)
    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))
    expect(await within(panelHeader()).findByText('simulated')).toBeInTheDocument()
    unmount()

    getRouteMock.mockResolvedValue({ ...ROUTE, source: 'live' })
    render(<RouteMap />)
    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))

    expect(await within(panelHeader()).findByText('live')).toBeInTheDocument()
    expect(within(panelHeader()).queryByText('simulated')).not.toBeInTheDocument()
  })

  it('keeps the live and simulated distinction visible while loading', async () => {
    let settle = () => {}
    getRouteMock.mockReturnValue(
      new Promise((resolve) => {
        settle = () => resolve(ROUTE)
      }),
    )
    const section = renderMap({ baseUrl: '' })

    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))

    expect(await screen.findByText('Mapping the least-hours path…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mapping route…' })).toBeDisabled()
    expect(screen.getByRole('heading', { name: 'Route map' }).closest('section')).toHaveAttribute(
      'aria-busy',
      'true',
    )

    settle()
    await waitFor(() => expect(section).toHaveAttribute('aria-busy', 'false'))
  })

  it('renders an empty state with a call to action before any route is requested', () => {
    renderMap()

    expect(screen.getByText('No route yet')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Build a route to see the skill-by-skill metro line, the hours on each hop and the paid bridge at the end.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Build route' })).toBeEnabled()
  })

  it('surfaces a server error message and stays retryable', async () => {
    getRouteMock.mockRejectedValue(
      new Error("unknown target_role; valid options: qa-analyst, sdet"),
    )
    renderMap()

    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))

    const alert = await screen.findByRole('alert')

    expect(alert).toHaveTextContent(
      'unknown target_role; valid options: qa-analyst, sdet',
    )
    expect(
      screen.getByRole('button', { name: 'Build route' }),
    ).toBeEnabled()
  })

  it('re-fetches with the new values when the form is changed and submitted', async () => {
    getRouteMock.mockResolvedValue(ROUTE)
    renderMap()

    fireEvent.change(screen.getByRole('combobox', { name: 'From skill' }), {
      target: { value: 'Regression testing' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Target role' }), {
      target: { value: 'sdet' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Hours per week' }), {
      target: { value: '15' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))

    await waitFor(() => expect(getRouteMock).toHaveBeenCalledTimes(1))
    expect(getRouteMock).toHaveBeenCalledWith(
      { fromSkill: 'Regression testing', targetRole: 'sdet', hoursPerWeek: 15 },
      { baseUrl: '', signal: expect.any(AbortSignal) },
    )
  })

  it('aborts the previous request so a slow first submit cannot overwrite a fast second', async () => {
    const signals = []
    let resolveFirst
    getRouteMock.mockImplementation((_query, options) => {
      signals.push(options.signal)

      if (signals.length === 1) {
        return new Promise((resolve) => {
          resolveFirst = () => resolve(ROUTE)
        })
      }

      return Promise.resolve({ ...ROUTE, target_role: 'sdet' })
    })
    renderMap()

    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))
    await waitFor(() => expect(getRouteMock).toHaveBeenCalledTimes(1))
    expect(signals[0].aborted).toBe(false)

    resolveFirst()
    await waitFor(() => expect(signals[0].aborted).toBe(false))

    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))

    await waitFor(() => expect(getRouteMock).toHaveBeenCalledTimes(2))
    expect(
      await screen.findByText(
        'Route sequence: Manual testing (0 hours), then Regression testing (30 hours), then Test automation (80 hours), then sdet (target role).',
      ),
    ).toBeInTheDocument()
  })

  it('cancels the in-flight request on unmount', async () => {
    let observedSignal
    getRouteMock.mockImplementation((_query, options) => {
      observedSignal = options.signal

      return new Promise(() => {})
    })
    const { unmount } = render(<RouteMap />)

    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))
    await waitFor(() => expect(observedSignal).toBeDefined())

    unmount()

    expect(observedSignal.aborted).toBe(true)
  })

  it('refuses to submit when the weekly hours fall outside the API bounds', () => {
    renderMap()

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Hours per week' }), {
      target: { value: '' },
    })

    expect(screen.getByRole('button', { name: 'Build route' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))

    expect(getRouteMock).not.toHaveBeenCalled()
  })

  it('does not request anything until the form is submitted', async () => {
    getRouteMock.mockResolvedValue(ROUTE)
    renderMap()

    expect(getRouteMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Build route' }))

    await waitFor(() => expect(getRouteMock).toHaveBeenCalledTimes(1))

    expect(
      await screen.findByRole('list', {
        name: 'Route stations from Manual testing to qa-analyst',
      }),
    ).toBeInTheDocument()
    expect(within(panelHeader()).getByText('simulated')).toBeInTheDocument()
  })

  it('renders a rejected request as an alert and stays retryable', async () => {
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
    renderMap()

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
