import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HRConsole from './HRConsole.jsx'
import { getDisplacementRadar, rewriteEmployerFilter } from '../api.js'

vi.mock('../api.js', () => ({
  getDisplacementRadar: vi.fn(),
  rewriteEmployerFilter: vi.fn(),
}))

const RADAR_DISCLAIMER =
  'Illustrative displacement and demand figures bundled with the demo, not observed job-board data.'

const REWRITE_DISCLAIMER =
  'Illustrative employer job posts bundled with the demo, not observed hiring data.'

const RADAR_ROW = {
  role: 'qa-analyst',
  city: 'Chennai',
  exposure: 'low',
  demand: 'growing',
  source: 'simulated',
  disclaimer: RADAR_DISCLAIMER,
}

const REWRITE_ROW = {
  job_post_id: 'post-chennai-qa-analyst-118',
  role: 'qa-analyst',
  city: 'Chennai',
  filter_text_before:
    'Looking for a QA analyst. Must be a graduate from a tier-1 college, aged 22-28, and only consider candidates with no career break so far. Female candidates preferred for the floor walk.',
  filter_text_after:
    'Looking for a QA analyst with documented regression, defect triage and API testing evidence. A career break is fine as long as the evidence is current. Every applicant is scored on the same criteria.',
  restrictive_phrase: 'aged 22-28',
  removed_criteria: [
    'must be a graduate from a tier-1 college',
    'aged 22-28',
    'only consider candidates with no career break so far',
    'Female candidates preferred for the floor walk',
  ],
  hidden_talent_count: 12,
  rewrite_reason:
    'Age, college tier and gender wording removed; evidence replaced pedigree.',
  source: 'simulated',
  disclaimer: REWRITE_DISCLAIMER,
}

const LIVE_PATTERN = /\blive\b/i

function deferred() {
  let settle = (_value) => {}
  const promise = new Promise((resolve) => {
    settle = (value) => resolve(value)
  })

  return { promise, resolve: settle }
}

const radarMock = vi.mocked(getDisplacementRadar)
const rewriteMock = vi.mocked(rewriteEmployerFilter)

describe('HRConsole', () => {
  beforeEach(() => {
    radarMock.mockReset()
    rewriteMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the default radar row and rewrite on mount', async () => {
    radarMock.mockResolvedValue(RADAR_ROW)
    rewriteMock.mockResolvedValue(REWRITE_ROW)

    render(<HRConsole />)

    await waitFor(() =>
      expect(radarMock).toHaveBeenCalledWith(
        { role: 'qa-analyst', city: 'Chennai' },
        { baseUrl: '', signal: expect.any(AbortSignal) },
      ),
    )
    expect(rewriteMock).toHaveBeenCalledWith(
      'post-chennai-qa-analyst-118',
      { baseUrl: '', signal: expect.any(AbortSignal) },
    )

    expect(await screen.findByTestId('radar-exposure')).toHaveTextContent('low')
    expect(screen.getByTestId('radar-demand')).toHaveTextContent('growing')
    expect(screen.getByTestId('hidden-talent-count')).toHaveTextContent('12')
  })

  it('renders a Simulated badge on every data block and never a Live badge', async () => {
    radarMock.mockResolvedValue(RADAR_ROW)
    rewriteMock.mockResolvedValue(REWRITE_ROW)

    const { container } = render(<HRConsole />)

    await screen.findByTestId('radar-exposure')
    await screen.findByTestId('hidden-talent-count')

    const badges = screen.getAllByText('Simulated')
    expect(badges.length).toBeGreaterThanOrEqual(2)

    expect(screen.getAllByText('source=simulated')).toHaveLength(2)
    expect(container.textContent).not.toMatch(LIVE_PATTERN)
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
  })

  it('shows the backend disclaimer for both blocks', async () => {
    radarMock.mockResolvedValue(RADAR_ROW)
    rewriteMock.mockResolvedValue(REWRITE_ROW)

    render(<HRConsole />)

    expect(await screen.findByText(RADAR_DISCLAIMER)).toBeInTheDocument()
    expect(screen.getByText(REWRITE_DISCLAIMER)).toBeInTheDocument()
    expect(
      screen.getByText('Displacement radar:', { exact: false }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Job post rewrite:', { exact: false }),
    ).toBeInTheDocument()
  })

  it('renders the before and after filter text with the restrictive phrase', async () => {
    radarMock.mockResolvedValue(RADAR_ROW)
    rewriteMock.mockResolvedValue(REWRITE_ROW)

    render(<HRConsole />)

    const before = await screen.findByRole('heading', {
      name: 'Before · would be flagged',
    })
    const after = screen.getByRole('heading', { name: 'After · rewritten post' })

    expect(before).toBeInTheDocument()
    expect(after).toBeInTheDocument()
    expect(before.parentElement).toHaveTextContent(REWRITE_ROW.filter_text_before)
    expect(after.parentElement).toHaveTextContent(REWRITE_ROW.filter_text_after)
    expect(screen.getByTestId('restrictive-phrase')).toHaveTextContent(
      REWRITE_ROW.restrictive_phrase,
    )
    expect(screen.getByText('Restrictive phrase removed')).toBeInTheDocument()
    expect(screen.getByTestId('rewrite-reason')).toHaveTextContent(
      REWRITE_ROW.rewrite_reason,
    )
  })

  it('lists every removed criterion', async () => {
    radarMock.mockResolvedValue(RADAR_ROW)
    rewriteMock.mockResolvedValue(REWRITE_ROW)

    render(<HRConsole />)

    const list = await screen.findByRole('list', {
      name: `Criteria removed (${REWRITE_ROW.removed_criteria.length})`,
    })
    const items = within(list).getAllByRole('listitem')

    expect(items).toHaveLength(REWRITE_ROW.removed_criteria.length)
    REWRITE_ROW.removed_criteria.forEach((criterion) => {
      expect(within(list).getByText(criterion)).toBeInTheDocument()
    })
  })

  it('re-requests the radar for an edited role id', async () => {
    radarMock.mockResolvedValue(RADAR_ROW)
    rewriteMock.mockResolvedValue(REWRITE_ROW)

    render(<HRConsole />)
    await screen.findByTestId('radar-exposure')

    fireEvent.change(screen.getByLabelText('Role id'), {
      target: { value: 'support-operations-lead' },
    })
    fireEvent.change(screen.getByLabelText('City'), {
      target: { value: 'Bengaluru' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check exposure' }))

    await waitFor(() =>
      expect(radarMock).toHaveBeenLastCalledWith(
        { role: 'support-operations-lead', city: 'Bengaluru' },
        { baseUrl: '', signal: expect.any(AbortSignal) },
      ),
    )
  })

  it('surfaces a visible error when the radar 404s', async () => {
    radarMock.mockRejectedValue(
      new Error(
        "no simulated radar entry for role 'ghost-role' in 'Chennai'; expected one of: qa-analyst",
      ),
    )
    rewriteMock.mockResolvedValue(REWRITE_ROW)

    render(<HRConsole />)

    const error = await screen.findByTestId('radar-error')

    expect(error).toHaveAttribute('role', 'alert')
    expect(error).toHaveTextContent('Radar unavailable')
    expect(error).toHaveTextContent('no simulated radar entry')
    expect(screen.queryByTestId('radar-exposure')).not.toBeInTheDocument()
    expect(screen.getByTestId('rewrite-region')).toHaveAttribute('aria-live')
  })

  it('surfaces a visible error when the employer post id is unknown', async () => {
    radarMock.mockResolvedValue(RADAR_ROW)
    rewriteMock.mockRejectedValue(
      new Error('unknown job_post_id; expected one of: post-chennai-qa-analyst-118'),
    )

    render(<HRConsole />)

    const error = await screen.findByTestId('rewrite-error')

    expect(error).toHaveTextContent('Rewrite unavailable')
    expect(error).toHaveTextContent('unknown job_post_id')
    expect(screen.queryByTestId('hidden-talent-count')).not.toBeInTheDocument()
  })

  it('shows a loading state for each block while a request is in flight', async () => {
    const radarPending = deferred()
    const rewritePending = deferred()

    radarMock.mockReturnValue(radarPending.promise)
    rewriteMock.mockReturnValue(rewritePending.promise)

    render(<HRConsole />)

    expect(await screen.findByTestId('radar-loading')).toHaveTextContent(
      'Loading radar…',
    )
    expect(screen.getByTestId('rewrite-loading')).toHaveTextContent(
      'Rewriting the filter…',
    )
    expect(
      screen.getByRole('button', { name: 'Loading radar…' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Rewriting…' }),
    ).toBeDisabled()

    await act(async () => {
      radarPending.resolve(RADAR_ROW)
      rewritePending.resolve(REWRITE_ROW)
    })

    await waitFor(() =>
      expect(screen.queryByTestId('radar-loading')).not.toBeInTheDocument(),
    )
    expect(screen.queryByTestId('rewrite-loading')).not.toBeInTheDocument()
    expect(screen.getByTestId('hidden-talent-count')).toHaveTextContent('12')
  })

  it('falls back to an empty rewrite block when the fixture is empty', async () => {
    radarMock.mockRejectedValue(new Error('radar offline'))
    rewriteMock.mockResolvedValue({
      ...REWRITE_ROW,
      hidden_talent_count: 0,
      removed_criteria: [],
      restrictive_phrase: '',
      filter_text_after: '',
    })

    render(<HRConsole />)

    await screen.findByTestId('hidden-talent-count')
    expect(screen.getByTestId('hidden-talent-count')).toHaveTextContent('0')
    expect(
      screen.getByText('No criteria were removed from this post.'),
    ).toBeInTheDocument()
    expect(screen.getByText('No after text supplied.')).toBeInTheDocument()
    expect(screen.getByTestId('restrictive-phrase')).toHaveTextContent(
      'no phrase reported',
    )
  })

  it('shows an empty state when a block resolves without data', async () => {
    radarMock.mockResolvedValue(undefined)
    rewriteMock.mockResolvedValue(undefined)

    render(<HRConsole />)

    expect(await screen.findByTestId('radar-empty')).toHaveTextContent(
      'No radar row yet',
    )
    expect(screen.getByTestId('rewrite-empty')).toHaveTextContent(
      'No rewrite yet',
    )
    expect(screen.queryByTestId('radar-exposure')).not.toBeInTheDocument()
    expect(screen.queryByTestId('hidden-talent-count')).not.toBeInTheDocument()
    expect(screen.getAllByText('Simulated')).toHaveLength(2)
  })

  it('offers every bundled job post id and labels the disclaimer note', async () => {
    radarMock.mockResolvedValue(RADAR_ROW)
    rewriteMock.mockResolvedValue(REWRITE_ROW)

    render(<HRConsole />)

    const select = screen.getByLabelText('Job post id')
    const options = within(select).getAllByRole('option')

    expect(options.map((option) => option.getAttribute('value'))).toEqual([
      'post-chennai-qa-analyst-118',
      'post-chennai-support-lead-207',
      'post-chennai-data-quality-311',
    ])

    await act(async () => {
      fireEvent.change(select, {
        target: { value: 'post-chennai-data-quality-311' },
      })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite this post' }))

    await waitFor(() =>
      expect(rewriteMock).toHaveBeenLastCalledWith(
        'post-chennai-data-quality-311',
        { baseUrl: '', signal: expect.any(AbortSignal) },
      ),
    )

    expect(
      screen.getByText(/wired to no applicant tracking system/, { exact: false }),
    ).toBeInTheDocument()
  })
})
