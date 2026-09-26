import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSessionMock = vi.fn()
const scoreWorkSampleMock = vi.fn()

vi.mock('../api.js', () => ({
  getSession: (id) => getSessionMock(id),
  scoreWorkSample: (payload) => scoreWorkSampleMock(payload),
}))

const { default: WorkerApp, KAVYA_TRANSCRIPT } = await import('./WorkerApp.jsx')

class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const PASSPORT = {
  passport_id: 'passport-session-1',
  owner: 'Kavya',
  skills: [
    { name: 'Manual testing', confidence: 0.91, verified: true },
    { name: 'Test automation', confidence: 0.42, verified: false },
  ],
  credentials: ['Manual testing'],
  source: 'simulated',
}

const SESSION_WITH_PASSPORT = {
  session_id: 'session-1',
  input_type: 'text',
  content: KAVYA_TRANSCRIPT,
  persona: 'Kavya',
  status: 'running',
  source: 'simulated',
  state: {},
  passport: PASSPORT,
  route: null,
  matches: [],
  audit_result: null,
  version: 3,
  created_at: '2026-09-26T09:00:00Z',
  updated_at: '2026-09-26T09:00:04Z',
  skills_source: 'simulated',
  events: [],
}

const SESSION_WITHOUT_PASSPORT = {
  ...SESSION_WITH_PASSPORT,
  passport: null,
  version: 0,
}

const EVENTS = [
  {
    agent: 'ORCHESTRATOR',
    status: 'running',
    message: 'Session opened for Kavya · 7 agents queued',
    source: 'simulated',
  },
]

function renderApp(properties = {}) {
  render(
    <WorkerApp sessionId={null} onSessionStart={vi.fn()} {...properties} />,
  )
}

describe('WorkerApp', () => {
  beforeEach(() => {
    getSessionMock.mockReset()
    scoreWorkSampleMock.mockReset()
    getSessionMock.mockResolvedValue(SESSION_WITHOUT_PASSPORT)
    scoreWorkSampleMock.mockResolvedValue({
      score: 88,
      credential_issued: true,
      source: 'simulated',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders an idle state with instructions when no session is open', () => {
    renderApp()

    expect(screen.getByText('Idle · no session open')).toBeInTheDocument()
    expect(screen.getByText('No session yet')).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Session transcript' }),
    ).toHaveValue(KAVYA_TRANSCRIPT)
    expect(
      screen.getByRole('button', { name: 'Run pipeline' }),
    ).toBeEnabled()
  })

  it('starts the demo session with the transcript, text input type and Kavya persona', () => {
    const onSessionStart = vi.fn()
    render(<WorkerApp sessionId={null} onSessionStart={onSessionStart} />)

    fireEvent.click(screen.getByRole('button', { name: 'Run pipeline' }))

    expect(onSessionStart).toHaveBeenCalledTimes(1)
    expect(onSessionStart).toHaveBeenCalledWith({
      input_type: 'text',
      content: KAVYA_TRANSCRIPT,
      persona: 'Kavya',
    })
  })

  it('sends the edited transcript instead of the demo default', () => {
    const onSessionStart = vi.fn()
    render(<WorkerApp sessionId={null} onSessionStart={onSessionStart} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Session transcript' }), {
      target: { value: 'I ran manual test case design for a logistics team.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run pipeline' }))

    expect(onSessionStart).toHaveBeenCalledWith({
      input_type: 'text',
      content: 'I ran manual test case design for a logistics team.',
      persona: 'Kavya',
    })
  })

  it('disables the run button and marks the section busy while the start request is in flight', () => {
    const onSessionStart = vi.fn()
    const { rerender } = render(
      <WorkerApp sessionId={null} onSessionStart={onSessionStart} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Run pipeline' }))

    expect(screen.getByRole('button', { name: 'Starting session…' })).toBeDisabled()
    expect(
      screen.getByRole('heading', { name: 'Worker intake & skill passport' })
        .closest('section'),
    ).toHaveAttribute('aria-busy', 'true')

    rerender(
      <WorkerApp sessionId="session-1" onSessionStart={onSessionStart} />,
    )

    expect(
      screen.getByRole('button', { name: 'Run pipeline' }),
    ).toBeEnabled()
  })

  it('disables the run button while the parent reports an open stream', () => {
    renderApp({ isStreaming: true, events: EVENTS })

    expect(screen.getByRole('button', { name: 'Starting session…' })).toBeDisabled()
    expect(screen.getByText('Streaming agent events')).toBeInTheDocument()
  })

  it('polls the session until the passport lands and renders it with its values', async () => {
    vi.useFakeTimers()
    getSessionMock.mockResolvedValue(SESSION_WITHOUT_PASSPORT)
    render(<WorkerApp sessionId="session-1" onSessionStart={vi.fn()} />)

    expect(screen.getByText('Passport pending')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(getSessionMock).toHaveBeenCalledWith('session-1')
    expect(screen.getByText('Passport pending')).toBeInTheDocument()

    getSessionMock.mockResolvedValue(SESSION_WITH_PASSPORT)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    const list = screen.getByRole('list', { name: 'Recovered skills' })
    const [manualTesting, automation] = within(list).getAllByRole('listitem')

    expect(screen.getByText('Kavya')).toBeInTheDocument()
    expect(screen.getByText('passport-session-1')).toBeInTheDocument()
    expect(
      within(manualTesting).getByRole('progressbar', {
        name: 'Manual testing confidence',
      }),
    ).toHaveAttribute('aria-valuenow', '91')
    expect(within(manualTesting).getByText('0.91')).toBeInTheDocument()
    expect(within(automation).getByText('0.42')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('labels verified and unverified claims with text and an icon, never colour alone', async () => {
    getSessionMock.mockResolvedValue(SESSION_WITH_PASSPORT)
    renderApp({ sessionId: 'session-1' })

    const list = await screen.findByRole('list', { name: 'Recovered skills' })
    const [manualTesting, automation] = within(list).getAllByRole('listitem')
    const verifiedBadge = within(manualTesting).getByText('Verified').parentElement
    const unverifiedBadge = within(automation).getByText('Unverified').parentElement

    if (verifiedBadge === null || unverifiedBadge === null) {
      throw new Error('Verification badge is missing')
    }

    expect(within(verifiedBadge).getByText('✓')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(within(unverifiedBadge).getByText('○')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('lists the credentials and shows a simulated source badge for the passport', async () => {
    getSessionMock.mockResolvedValue(SESSION_WITH_PASSPORT)
    renderApp({ sessionId: 'session-1' })

    const credentials = await screen.findByRole('list', {
      name: 'Issued credentials',
    })

    expect(within(credentials).getByText('Manual testing')).toBeInTheDocument()
    expect(screen.getByText('Simulated source')).toBeInTheDocument()
    expect(screen.queryByText('Live source')).not.toBeInTheDocument()
  })

  it('marks the passport as live when the server answers live', async () => {
    getSessionMock.mockResolvedValue({
      ...SESSION_WITH_PASSPORT,
      skills_source: 'live',
      passport: { ...PASSPORT, source: 'live' },
    })
    renderApp({ sessionId: 'session-1' })

    expect(await screen.findByText('Live source')).toBeInTheDocument()
    expect(screen.queryByText('Simulated source')).not.toBeInTheDocument()
  })

  it('keeps the pending passport state while the session has no passport yet', async () => {
    getSessionMock.mockResolvedValue(SESSION_WITHOUT_PASSPORT)
    renderApp({ sessionId: 'session-1', isStreaming: true, events: EVENTS })

    expect(await screen.findByText('Passport pending')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The skills agent is still reading the transcript. The passport lands here as soon as the orchestrator writes it.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Source pending')).toBeInTheDocument()
    expect(
      screen.getByText(
        'A skill is needed before a work sample can be scored. The passport has not landed yet.',
      ),
    ).toBeInTheDocument()
  })

  it('scores the picked work sample and renders the score, credential and source', async () => {
    getSessionMock.mockResolvedValue(SESSION_WITH_PASSPORT)
    renderApp({ sessionId: 'session-1' })

    await screen.findByRole('list', { name: 'Recovered skills' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Skill to prove' }), {
      target: { value: 'Test automation' },
    })
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Evidence submission' }),
      { target: { value: 'A Playwright suite that runs on every pull request.' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Score work sample' }))

    await waitFor(() => expect(scoreWorkSampleMock).toHaveBeenCalledTimes(1))
    expect(scoreWorkSampleMock).toHaveBeenCalledWith({
      skill_id: 'Test automation',
      submission: 'A Playwright suite that runs on every pull request.',
      session_id: 'session-1',
    })

    expect(await screen.findByText('88 out of 100')).toBeInTheDocument()
    expect(
      screen.getByText('Credential issued and recorded on the passport.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Simulated source score')).toBeInTheDocument()
  })

  it('reports a rejected work sample without a credential', async () => {
    scoreWorkSampleMock.mockResolvedValue({
      score: 42,
      credential_issued: false,
      source: 'live',
    })
    getSessionMock.mockResolvedValue(SESSION_WITH_PASSPORT)
    renderApp({ sessionId: 'session-1' })

    await screen.findByRole('list', { name: 'Recovered skills' })

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Evidence submission' }),
      { target: { value: 'Notes from a manual pass only.' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Score work sample' }))

    expect(await screen.findByText('42 out of 100')).toBeInTheDocument()
    expect(
      screen.getByText('No credential issued. The score is below the server threshold.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Live source score')).toBeInTheDocument()
  })

  it('renders the ApiError message when the work sample request fails', async () => {
    scoreWorkSampleMock.mockRejectedValue(
      new ApiError('Session has no skill passport yet', 409),
    )
    getSessionMock.mockResolvedValue(SESSION_WITH_PASSPORT)
    renderApp({ sessionId: 'session-1' })

    await screen.findByRole('list', { name: 'Recovered skills' })

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Evidence submission' }),
      { target: { value: 'Anything at all.' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Score work sample' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Session has no skill passport yet',
    )
  })

  it('renders the ApiError message when the session poll fails', async () => {
    getSessionMock.mockRejectedValue(new ApiError('Session not found', 404))
    renderApp({ sessionId: 'session-gone' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Session not found')
  })

  it('hides the voice control when SpeechRecognition is unsupported without crashing', () => {
    renderApp({ sessionId: 'session-1' })

    expect(
      screen.queryByRole('button', { name: /voice input/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Voice input is unavailable in this browser. Paste or type the transcript instead.',
      ),
    ).toBeInTheDocument()
  })

  it('starts and stops voice input when the browser exposes SpeechRecognition', async () => {
    const recognition = {
      start: vi.fn(),
      stop: vi.fn(),
      continuous: false,
      interimResults: false,
      lang: '',
      onresult: vi.fn(),
      onerror: vi.fn(),
      onend: vi.fn(),
    }

    function RecognitionStub() {
      return recognition
    }

    vi.stubGlobal('SpeechRecognition', RecognitionStub)

    getSessionMock.mockResolvedValue(SESSION_WITH_PASSPORT)
    renderApp({ sessionId: 'session-1' })

    const startButton = screen.getByRole('button', { name: 'Start voice input' })
    fireEvent.click(startButton)

    expect(recognition.start).toHaveBeenCalledTimes(1)
    expect(recognition.lang).toBe('en-IN')
    expect(
      screen.getByRole('button', { name: 'Stop voice input' }),
    ).toHaveAttribute('aria-pressed', 'true')

    const results = [[{ transcript: 'I wrote regression test cases for a bank.' }]]
    recognition.onresult({ results })
    recognition.onend()

    // Speech is appended to the transcript, not substituted for it: the field is
    // pre-filled with the demo transcript and may hold typed edits, and replacing
    // it silently destroyed both.
    const transcriptField = screen.getByRole('textbox', { name: 'Session transcript' })
    await waitFor(() => {
      const value = /** @type {HTMLTextAreaElement} */ (transcriptField).value

      expect(value).toContain('I wrote regression test cases for a bank.')
      expect(value.startsWith('Hi, I am Kavya.')).toBe(true)
    })
    expect(
      screen.getByRole('button', { name: 'Start voice input' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop voice input' }))

    expect(recognition.stop).toHaveBeenCalledTimes(1)
    await screen.findByText('Kavya')
  })
})
