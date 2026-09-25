import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GhostTwinPanel, { AUDIT_TIMEOUT_MS, AUDIT_URL } from './GhostTwinPanel.jsx'

const KAVYA_PROFILE = {
  career_gap: '18 months',
  gender: 'female',
  age: 29,
  college_tier: 'tier_3',
  city: 'Chennai',
  skill_score: 86,
}

const FAIR_RESULT = {
  actual_score: 86,
  twins: [
    {
      variant: 'career_gap_counterfactual',
      attribute: 'career_gap',
      original_value: '18 months',
      counterfactual_value: { months: 0 },
      score: 86,
      delta: 0,
    },
    {
      variant: 'gender_counterfactual',
      attribute: 'gender',
      original_value: 'female',
      counterfactual_value: 'male',
      score: 86,
      delta: 0,
    },
  ],
  max_delta: 0,
  result: 'PASS',
  threshold: 5,
  source: 'local',
  engine: 'pure_python',
  status: 'completed',
}

const LEGACY_RESULT = {
  actual_score: 86,
  twins: [
    {
      variant: 'career_gap_counterfactual',
      attribute: 'career_gap',
      original_value: '18 months',
      counterfactual_value: { months: 0 },
      score: 74,
      delta: -12,
    },
    {
      variant: 'gender_counterfactual',
      attribute: 'gender',
      original_value: 'female',
      counterfactual_value: 'male',
      score: 98,
      delta: 12,
    },
  ],
  max_delta: 12,
  result: 'FLAGGED',
  threshold: 5,
  source: 'local',
  engine: 'pure_python',
  status: 'completed',
}

function successfulResponse(result) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(result),
  }
}

describe('GhostTwinPanel', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('starts with fair synthetic mode and the legacy ATS toggle unchecked', () => {
    render(<GhostTwinPanel />)

    expect(
      screen.getByRole('checkbox', { name: 'Simulate Legacy ATS' }),
    ).not.toBeChecked()
    expect(screen.getByText('Synthetic fair merit')).toBeInTheDocument()
  })

  it('posts Kavya fair-mode data without overriding the server threshold', async () => {
    fetchMock.mockResolvedValue(successfulResponse(FAIR_RESULT))
    render(<GhostTwinPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, options] = fetchMock.mock.calls[0]
    const payload = JSON.parse(options.body)

    expect(url).toBe(AUDIT_URL)
    expect(options).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(payload).toEqual({
      role_id: 'quality-analyst',
      candidate_profile: KAVYA_PROFILE,
      simulate_legacy_ats: false,
    })
    expect(payload).not.toHaveProperty('threshold')
  })

  it('disables the controls and shows a loading state while auditing', async () => {
    let resolveRequest = (_value) => {}
    const pendingRequest = new Promise((resolve) => {
      resolveRequest = resolve
    })
    fetchMock.mockReturnValue(pendingRequest)
    render(<GhostTwinPanel />)

    const runButton = screen.getByRole('button', { name: 'Run Audit' })
    fireEvent.click(runButton)

    expect(runButton).toBeDisabled()
    expect(runButton).toHaveTextContent('Running audit…')
    expect(
      screen.getByRole('checkbox', { name: 'Simulate Legacy ATS' }),
    ).toBeDisabled()
    expect(screen.getByText('Loading audit…')).toBeInTheDocument()

    resolveRequest(successfulResponse(FAIR_RESULT))

    await waitFor(() => expect(runButton).not.toBeDisabled())
  })

  it('aborts an in-flight request when the panel unmounts', async () => {
    let requestSignal
    fetchMock.mockImplementation((_url, options) => {
      requestSignal = options.signal
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const abortError = new Error('aborted')
          abortError.name = 'AbortError'
          reject(abortError)
        })
      })
    })

    const { unmount } = render(<GhostTwinPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    unmount()

    expect(requestSignal.aborted).toBe(true)
    await act(async () => {})
  })

  it('renders a zero-delta table and a teal PASS result for fair mode', async () => {
    fetchMock.mockResolvedValue(successfulResponse(FAIR_RESULT))
    render(<GhostTwinPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))

    await screen.findByText('PASS')
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    const firstRowCells = within(rows[1]).getAllByRole('cell')
    const secondRowCells = within(rows[2]).getAllByRole('cell')

    expect(
      within(table).getByRole('columnheader', { name: 'Twin Variant' }),
    ).toBeInTheDocument()
    expect(
      within(table).getByRole('columnheader', { name: 'Base Score' }),
    ).toBeInTheDocument()
    expect(
      within(table).getByRole('columnheader', { name: 'Twin Score' }),
    ).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Delta' })).toBeInTheDocument()
    expect(firstRowCells[0]).toHaveTextContent('86')
    expect(firstRowCells[1]).toHaveTextContent('86')
    expect(firstRowCells[2]).toHaveTextContent('0')
    expect(secondRowCells[0]).toHaveTextContent('86')
    expect(secondRowCells[1]).toHaveTextContent('86')
    expect(secondRowCells[2]).toHaveTextContent('0')
    expect(screen.getByText('Fairness guardrail passed')).toBeInTheDocument()
    expect(screen.getByText('Source=local')).toBeInTheDocument()
    expect(screen.getByText('Local source')).toBeInTheDocument()
    expect(screen.getByText('Pure-Python calculation')).toBeInTheDocument()
    expect(screen.getByText('Synthetic fair merit')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Scrollable Ghost Twin results table' }),
    ).toHaveAttribute('tabindex', '0')
  })

  it('sends true in legacy mode and renders its flagged table', async () => {
    fetchMock.mockResolvedValue(successfulResponse(LEGACY_RESULT))
    render(<GhostTwinPanel />)

    const toggle = screen.getByRole('checkbox', {
      name: 'Simulate Legacy ATS',
    })
    fireEvent.click(toggle)

    expect(toggle).toBeChecked()
    expect(screen.getByText('Simulated legacy ATS')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(payload).toEqual({
      role_id: 'quality-analyst',
      candidate_profile: KAVYA_PROFILE,
      simulate_legacy_ats: true,
    })
    expect(payload).not.toHaveProperty('threshold')

    const flaggedBanner = await screen.findByText('FLAGGED')
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    const firstRowCells = within(rows[1]).getAllByRole('cell')
    const secondRowCells = within(rows[2]).getAllByRole('cell')

    expect(firstRowCells[0]).toHaveTextContent('86')
    expect(firstRowCells[1]).toHaveTextContent('74')
    expect(firstRowCells[2]).toHaveTextContent('-12')
    expect(secondRowCells[0]).toHaveTextContent('86')
    expect(secondRowCells[1]).toHaveTextContent('98')
    expect(secondRowCells[2]).toHaveTextContent('+12')
    expect(flaggedBanner.closest('[role="status"]')).toHaveClass('bg-red')
    expect(screen.getByText('Fairness guardrail needs attention')).toBeInTheDocument()
    expect(screen.getByText('Source=local')).toBeInTheDocument()
    expect(screen.queryByText('PASS')).not.toBeInTheDocument()
  })

  it('renders the response source instead of assuming local', async () => {
    fetchMock.mockResolvedValue(
      successfulResponse({ ...FAIR_RESULT, source: 'live' }),
    )
    render(<GhostTwinPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))

    expect(await screen.findByText('Source=live')).toBeInTheDocument()
    expect(screen.getByText('Live source')).toBeInTheDocument()
    expect(screen.queryByText('Source=local')).not.toBeInTheDocument()
  })

  it('parses string and structured FastAPI error details', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: vi.fn().mockResolvedValue({ detail: 'Invalid Kavya profile' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: vi.fn().mockResolvedValue({
          detail: [
            {
              loc: ['body', 'candidate_profile', 'career_gap'],
              msg: 'Field required',
              type: 'missing',
            },
          ],
        }),
      })

    render(<GhostTwinPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid Kavya profile',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'body → candidate_profile → career_gap: Field required',
    )
  })

  it('surfaces network failures and rejects malformed successful JSON', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      })

    render(<GhostTwinPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network request failed',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'malformed JSON',
    )
  })

  it('times out a stalled request without waiting for a real delay', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<GhostTwinPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))

    await act(async () => {
      vi.advanceTimersByTime(AUDIT_TIMEOUT_MS)
    })

    expect(screen.getByRole('alert')).toHaveTextContent('timed out')
    expect(
      screen.getByRole('button', { name: 'Run Audit' }),
    ).not.toBeDisabled()
  })
})
