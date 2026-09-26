import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GhostTwinPanel, { AUDIT_TIMEOUT_MS } from './GhostTwinPanel.jsx'

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

const FAIR_RESULT_AFTER_EDIT = {
  actual_score: 86,
  twins: [
    {
      variant: 'age_counterfactual',
      attribute: 'age',
      original_value: 47,
      counterfactual_value: 30,
      score: 86,
      delta: 0,
    },
    {
      variant: 'city_counterfactual',
      attribute: 'city',
      original_value: 'Bengaluru',
      counterfactual_value: 'Chennai',
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

const LEGACY_RESULT_AFTER_EDIT = {
  actual_score: 86,
  twins: [
    {
      variant: 'age_counterfactual',
      attribute: 'age',
      original_value: 47,
      counterfactual_value: 30,
      score: 98,
      delta: 12,
    },
    {
      variant: 'city_counterfactual',
      attribute: 'city',
      original_value: 'Bengaluru',
      counterfactual_value: 'Chennai',
      score: 86,
      delta: 0,
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

  it('posts Kavya fair-mode data to the configured backend, overriding no threshold', async () => {
    fetchMock.mockResolvedValue(successfulResponse(FAIR_RESULT))
    render(<GhostTwinPanel baseUrl="https://reroute.example" />)

    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, options] = fetchMock.mock.calls[0]
    const payload = JSON.parse(options.body)

    // The panel must follow the configured backend, not a hardcoded localhost.
    expect(url).toBe('https://reroute.example/audit/ghost-twin')
    expect(options).toEqual({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: expect.any(String),
      signal: expect.any(AbortSignal),
    })
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

  it('discards an in-flight audit response when the panel unmounts', async () => {
    let resolveRequest = (_value) => {}
    const pendingRequest = new Promise((resolve) => {
      resolveRequest = resolve
    })
    fetchMock.mockReturnValue(pendingRequest)

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = render(<GhostTwinPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    unmount()

    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveRequest(successfulResponse(FAIR_RESULT))
    })

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
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
      'body -> candidate_profile -> career_gap: Field required',
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
      'could not reach the backend',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The audit could not be completed. Try the request again.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'malformed JSON',
    )
  })

  it('times out a stalled request without waiting for a real delay', async () => {
    vi.useFakeTimers()
    // Mirror real `fetch`: a request that never settles is rejected when its
    // abort signal fires, rather than hanging forever.
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              const abortError = new Error('The operation was aborted.')
              abortError.name = 'AbortError'
              reject(abortError)
            },
            { once: true },
          )
        }),
    )

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

  it('cancels the in-flight request on unmount instead of leaking it', async () => {
    let observedSignal
    fetchMock.mockImplementation((_url, options) => {
      observedSignal = options.signal

      return new Promise(() => {})
    })

    const { unmount } = render(<GhostTwinPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))

    await waitFor(() => expect(observedSignal).toBeDefined())
    expect(observedSignal.aborted).toBe(false)

    unmount()

    // The old implementation raced a hand-rolled abort promise and left the real
    // request running to completion.
    expect(observedSignal.aborted).toBe(true)
  })

  it('labels every editable attribute control with a real form element', () => {
    render(<GhostTwinPanel />)

    const careerGap = screen.getByLabelText('Career gap')
    const gender = screen.getByLabelText('Gender')
    const age = screen.getByLabelText('Age')
    const collegeTier = screen.getByLabelText('College tier')
    const city = screen.getByLabelText('City')
    const skillScore = screen.getByLabelText('Skill score')

    expect(careerGap.tagName).toBe('INPUT')
    expect(careerGap).toHaveAttribute('type', 'text')
    expect(gender.tagName).toBe('SELECT')
    expect(age.tagName).toBe('INPUT')
    expect(age).toHaveAttribute('type', 'number')
    expect(collegeTier.tagName).toBe('SELECT')
    expect(city.tagName).toBe('SELECT')
    expect(skillScore.tagName).toBe('INPUT')
    expect(skillScore).toHaveAttribute('type', 'number')

    expect(screen.getByRole('textbox', { name: 'Career gap' })).toBe(careerGap)
    expect(screen.getByRole('combobox', { name: 'Gender' })).toBe(gender)
    expect(screen.getByRole('combobox', { name: 'College tier' })).toBe(collegeTier)
    expect(screen.getByRole('combobox', { name: 'City' })).toBe(city)
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toBe(age)
    expect(screen.getByRole('spinbutton', { name: 'Skill score' })).toBe(
      skillScore,
    )

    expect(within(gender).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual([
      'female',
      'male',
      'non_binary',
      'other',
      'not_disclosed',
    ])
    expect(
      within(collegeTier).getAllByRole('option').map((o) => o.getAttribute('value')),
    ).toEqual(['tier_1', 'tier_2', 'tier_3'])
    expect(within(city).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual([
      'Chennai',
      'Bengaluru',
      'Hyderabad',
      'Pune',
    ])
  })

  it('seeds the editor with the Kavya profile and gates the re-run button', () => {
    render(<GhostTwinPanel />)

    expect(screen.getByLabelText('Career gap')).toHaveValue('18 months')
    expect(screen.getByLabelText('Gender')).toHaveValue('female')
    expect(screen.getByLabelText('Age')).toHaveValue(29)
    expect(screen.getByLabelText('College tier')).toHaveValue('tier_3')
    expect(screen.getByLabelText('City')).toHaveValue('Chennai')
    expect(screen.getByLabelText('Skill score')).toHaveValue(86)
    expect(
      screen.getByRole('button', { name: 'Re-run audit' }),
    ).toBeDisabled()
    expect(screen.getByTestId('edit-summary')).toHaveTextContent('No edits yet')

    fireEvent.change(screen.getByLabelText('City'), {
      target: { value: 'Bengaluru' },
    })

    expect(
      screen.getByRole('button', { name: 'Re-run audit' }),
    ).not.toBeDisabled()
    expect(screen.getByTestId('edit-summary')).toHaveTextContent('City')
  })

  it('sends the edited profile instead of the seeded one', async () => {
    fetchMock.mockResolvedValue(successfulResponse(FAIR_RESULT))
    render(<GhostTwinPanel />)

    fireEvent.change(screen.getByLabelText('Gender'), {
      target: { value: 'male' },
    })
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '47' } })
    fireEvent.change(screen.getByLabelText('College tier'), {
      target: { value: 'tier_1' },
    })
    fireEvent.change(screen.getByLabelText('Skill score'), {
      target: { value: '70' },
    })
    fireEvent.change(screen.getByLabelText('Career gap'), {
      target: { value: '6 months' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Re-run audit' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(payload).toEqual({
      role_id: 'quality-analyst',
      candidate_profile: {
        career_gap: '6 months',
        gender: 'male',
        age: 47,
        college_tier: 'tier_1',
        city: 'Chennai',
        skill_score: 70,
      },
      simulate_legacy_ats: false,
    })
  })

  it('re-runs with the current values and repaints the table from the new response', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulResponse(FAIR_RESULT))
      .mockResolvedValueOnce(successfulResponse(LEGACY_RESULT))

    render(<GhostTwinPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    await screen.findByText('PASS')
    expect(screen.getByTestId('edit-summary')).toHaveTextContent('No edits yet')

    fireEvent.change(screen.getByLabelText('City'), {
      target: { value: 'Bengaluru' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Re-run audit' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const secondPayload = JSON.parse(fetchMock.mock.calls[1][1].body)

    expect(secondPayload.candidate_profile.city).toBe('Bengaluru')
    expect(secondPayload.simulate_legacy_ats).toBe(false)

    await screen.findByText('FLAGGED')

    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    const firstRowCells = within(rows[1]).getAllByRole('cell')

    expect(firstRowCells[0]).toHaveTextContent('86')
    expect(firstRowCells[1]).toHaveTextContent('74')
    expect(firstRowCells[2]).toHaveTextContent('-12')
    expect(screen.queryByText('PASS')).not.toBeInTheDocument()
  })

  it('moves the legacy-mode result after an edit', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulResponse(LEGACY_RESULT))
      .mockResolvedValueOnce(successfulResponse(LEGACY_RESULT_AFTER_EDIT))

    render(<GhostTwinPanel />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Simulate Legacy ATS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))

    await screen.findByText('FLAGGED')

    const beforeRows = within(screen.getByRole('table')).getAllByRole('row')
    const beforeCells = within(beforeRows[1]).getAllByRole('cell')

    expect(beforeCells[1]).toHaveTextContent('74')
    expect(beforeCells[2]).toHaveTextContent('-12')

    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '47' } })
    fireEvent.click(screen.getByRole('button', { name: 'Re-run audit' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const payload = JSON.parse(fetchMock.mock.calls[1][1].body)

    expect(payload.simulate_legacy_ats).toBe(true)
    expect(payload.candidate_profile.age).toBe(47)

    await screen.findByText('98')

    const afterRows = within(screen.getByRole('table')).getAllByRole('row')
    const afterCells = within(afterRows[1]).getAllByRole('cell')

    expect(afterRows[1]).toHaveTextContent('edited')
    expect(afterCells[0]).toHaveTextContent('86')
    expect(afterCells[1]).toHaveTextContent('98')
    expect(afterCells[2]).toHaveTextContent('+12')
    expect(afterCells[1]).not.toHaveTextContent('74')
  })

  it('keeps the fair-mode result flat after an edit', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulResponse(FAIR_RESULT))
      .mockResolvedValueOnce(successfulResponse(FAIR_RESULT_AFTER_EDIT))

    render(<GhostTwinPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    await screen.findByText('PASS')

    const beforeRows = within(screen.getByRole('table')).getAllByRole('row')
    const beforeFirst = within(beforeRows[1]).getAllByRole('cell')
    const beforeSecond = within(beforeRows[2]).getAllByRole('cell')

    expect(beforeFirst[1]).toHaveTextContent('86')
    expect(beforeFirst[2]).toHaveTextContent('0')
    expect(beforeSecond[1]).toHaveTextContent('86')
    expect(beforeSecond[2]).toHaveTextContent('0')

    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '47' } })
    fireEvent.change(screen.getByLabelText('City'), {
      target: { value: 'Bengaluru' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Re-run audit' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const payload = JSON.parse(fetchMock.mock.calls[1][1].body)

    expect(payload.candidate_profile).toEqual({
      career_gap: '18 months',
      gender: 'female',
      age: 47,
      college_tier: 'tier_3',
      city: 'Bengaluru',
      skill_score: 86,
    })

    await screen.findByText('47 → 30')

    const afterRows = within(screen.getByRole('table')).getAllByRole('row')
    const afterFirst = within(afterRows[1]).getAllByRole('cell')
    const afterSecond = within(afterRows[2]).getAllByRole('cell')

    expect(afterFirst[0]).toHaveTextContent('86')
    expect(afterFirst[1]).toHaveTextContent('86')
    expect(afterFirst[2]).toHaveTextContent('0')
    expect(afterSecond[0]).toHaveTextContent('86')
    expect(afterSecond[1]).toHaveTextContent('86')
    expect(afterSecond[2]).toHaveTextContent('0')
    expect(screen.getByText('Fairness guardrail passed')).toBeInTheDocument()
    expect(screen.getByText('Source=local')).toBeInTheDocument()
  })

  it('keeps the results table caption and the scroll region tabbable', async () => {
    fetchMock.mockResolvedValue(successfulResponse(FAIR_RESULT))
    render(<GhostTwinPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    await screen.findByText('PASS')

    const region = screen.getByRole('region', {
      name: 'Scrollable Ghost Twin results table',
    })

    expect(region).toHaveAttribute('tabindex', '0')
    expect(
      screen.getByText('Ghost Twin counterfactual scores for Kavya'),
    ).toBeInTheDocument()
  })

  it('resets the audit result but keeps the edited profile on toggle change', async () => {
    fetchMock.mockResolvedValue(successfulResponse(FAIR_RESULT))
    render(<GhostTwinPanel />)

    fireEvent.change(screen.getByLabelText('Gender'), {
      target: { value: 'male' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run Audit' }))
    await screen.findByText('PASS')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Simulate Legacy ATS' }))

    expect(screen.getByText('Ready to audit')).toBeInTheDocument()
    expect(screen.getByText('Simulated legacy ATS')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Gender')).toHaveValue('male')
  })
})
