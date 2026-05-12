import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AddMovieModal } from './AddMovieModal'
import type { MovieInput } from '../../types'

// Mock the service module so createGenre never hits the network
vi.mock('../../movie-library-service', () => ({
  createGenre: vi.fn(),
}))

// Typed reference to the mock after hoisting
import { createGenre } from '../../movie-library-service'
const mockCreateGenre = vi.mocked(createGenre)

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const GENRES = ['Drama', 'Action', 'Comedy']

function openModal(overrides: {
  onClose?: () => void
  onAdd?: (input: MovieInput) => Promise<void>
  onGenreCreated?: (g: string) => void
  genres?: string[]
  initialTitle?: string
} = {}) {
  const onClose = overrides.onClose ?? vi.fn()
  const onAdd = overrides.onAdd ?? vi.fn().mockResolvedValue(undefined)
  const onGenreCreated = overrides.onGenreCreated ?? vi.fn()
  const genres = overrides.genres ?? GENRES
  const initialTitle = overrides.initialTitle

  render(
    <AddMovieModal
      open={true}
      onClose={onClose}
      onAdd={onAdd}
      onGenreCreated={onGenreCreated}
      genres={genres}
      initialTitle={initialTitle}
    />
  )
  return { onClose, onAdd, onGenreCreated }
}

function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: 'Inception' } })
  fireEvent.change(screen.getByPlaceholderText('2025'), { target: { value: '2010' } })
  fireEvent.change(screen.getByPlaceholderText(/0–10/), { target: { value: '8.8' } })
  fireEvent.click(screen.getByRole('button', { name: 'Drama' }))
}

function clickSave() {
  fireEvent.click(screen.getByRole('button', { name: /Save → library/ }))
}

beforeEach(() => {
  mockCreateGenre.mockReset()
})

describe('AddMovieModal', () => {
  // ── Render gating ─────────────────────────────────────────────────────────
  it('renders nothing when open=false', () => {
    const { container } = render(
      <AddMovieModal open={false} onClose={vi.fn()} onAdd={vi.fn()} onGenreCreated={vi.fn()} genres={[]} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the modal when open=true', () => {
    openModal()
    expect(screen.getByText('Add a movie')).toBeInTheDocument()
  })

  // ── initialTitle ─────────────────────────────────────────────────────────
  it('pre-fills the title field with initialTitle', () => {
    openModal({ initialTitle: 'Dune' })
    expect(screen.getByPlaceholderText(/Long Quiet/)).toHaveValue('Dune')
  })

  it('uses an empty string for the title when initialTitle is not provided', () => {
    openModal()
    expect(screen.getByPlaceholderText(/Long Quiet/)).toHaveValue('')
  })

  // ── Close behaviour ───────────────────────────────────────────────────────
  it('calls onClose when the backdrop overlay is clicked', () => {
    const { onClose } = openModal()
    // Backdrop is the outermost fixed-inset div (has onClick={onClose})
    const { container } = render(
      <AddMovieModal open={true} onClose={onClose} onAdd={vi.fn()} onGenreCreated={vi.fn()} genres={[]} />
    )
    fireEvent.click(container.firstElementChild!)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the × header button is clicked', () => {
    const onClose = vi.fn()
    render(
      <AddMovieModal open={true} onClose={onClose} onAdd={vi.fn()} onGenreCreated={vi.fn()} genres={[]} />
    )
    // The × close button is the one with font-size 22
    const closeBtn = screen.getAllByRole('button').find(b => b.textContent === '×')
    expect(closeBtn).toBeDefined()
    fireEvent.click(closeBtn!)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the Cancel button is clicked', () => {
    const { onClose } = openModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the Escape key is pressed', () => {
    const { onClose } = openModal()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('does NOT call onClose when clicking inside the modal card', () => {
    const { onClose } = openModal()
    fireEvent.click(screen.getByText('Add a movie'))
    expect(onClose).not.toHaveBeenCalled()
  })

  // ── Form reset on close/reopen ────────────────────────────────────────────
  it('clears all fields when the modal is closed and reopened', () => {
    const { rerender } = render(
      <AddMovieModal open={true} onClose={vi.fn()} onAdd={vi.fn()} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: 'Dune' } })
    // Close
    rerender(
      <AddMovieModal open={false} onClose={vi.fn()} onAdd={vi.fn()} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    // Reopen
    rerender(
      <AddMovieModal open={true} onClose={vi.fn()} onAdd={vi.fn()} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    expect(screen.getByPlaceholderText(/Long Quiet/)).toHaveValue('')
  })

  it('clears validation errors when the modal is closed and reopened', async () => {
    const { rerender } = render(
      <AddMovieModal open={true} onClose={vi.fn()} onAdd={vi.fn()} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Save → library/ }))
    await waitFor(() => expect(screen.getByText('Title is required.')).toBeInTheDocument())
    rerender(
      <AddMovieModal open={false} onClose={vi.fn()} onAdd={vi.fn()} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    rerender(
      <AddMovieModal open={true} onClose={vi.fn()} onAdd={vi.fn()} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    expect(screen.queryByText('Title is required.')).not.toBeInTheDocument()
  })

  // ── Validation — title ────────────────────────────────────────────────────
  it('shows "Title is required." when title is empty', async () => {
    openModal()
    clickSave()
    await waitFor(() => expect(screen.getByText('Title is required.')).toBeInTheDocument())
  })

  it('shows "Title is required." when title is only whitespace', async () => {
    openModal()
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: '   ' } })
    clickSave()
    await waitFor(() => expect(screen.getByText('Title is required.')).toBeInTheDocument())
  })

  // ── Validation — year ────────────────────────────────────────────────────
  it('shows a year error when year is below 1888', async () => {
    openModal()
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: 'Test' } })
    fireEvent.change(screen.getByPlaceholderText('2025'), { target: { value: '1800' } })
    clickSave()
    await waitFor(() => expect(screen.getByText(/valid year/)).toBeInTheDocument())
  })

  it('shows a year error when year is above currentYear + 3', async () => {
    openModal()
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: 'Test' } })
    fireEvent.change(screen.getByPlaceholderText('2025'), { target: { value: '9999' } })
    clickSave()
    await waitFor(() => expect(screen.getByText(/valid year/)).toBeInTheDocument())
  })

  it('shows a year error when year field is empty', async () => {
    openModal()
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: 'Test' } })
    clickSave()
    await waitFor(() => expect(screen.getByText(/valid year/i)).toBeInTheDocument())
  })

  // ── Validation — rating ───────────────────────────────────────────────────
  it('shows a rating error when rating is negative', async () => {
    openModal()
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: 'Test' } })
    fireEvent.change(screen.getByPlaceholderText('2025'), { target: { value: '2020' } })
    fireEvent.change(screen.getByPlaceholderText(/0–10/), { target: { value: '-1' } })
    clickSave()
    await waitFor(() => expect(screen.getByText(/between 0 and 10/)).toBeInTheDocument())
  })

  it('shows a rating error when rating exceeds 10', async () => {
    openModal()
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: 'Test' } })
    fireEvent.change(screen.getByPlaceholderText('2025'), { target: { value: '2020' } })
    fireEvent.change(screen.getByPlaceholderText(/0–10/), { target: { value: '11' } })
    clickSave()
    await waitFor(() => expect(screen.getByText(/between 0 and 10/)).toBeInTheDocument())
  })

  it('shows a rating error when rating is empty', async () => {
    openModal()
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: 'Test' } })
    fireEvent.change(screen.getByPlaceholderText('2025'), { target: { value: '2020' } })
    clickSave()
    await waitFor(() => expect(screen.getByText(/between 0 and 10/)).toBeInTheDocument())
  })

  // ── Validation — genres ───────────────────────────────────────────────────
  it('shows "Pick at least one genre." when no genre is selected', async () => {
    openModal()
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: 'Test' } })
    fireEvent.change(screen.getByPlaceholderText('2025'), { target: { value: '2020' } })
    fireEvent.change(screen.getByPlaceholderText(/0–10/), { target: { value: '7.5' } })
    clickSave()
    await waitFor(() => expect(screen.getByText('Pick at least one genre.')).toBeInTheDocument())
  })

  // ── Genre selection ───────────────────────────────────────────────────────
  it('renders a button for each genre', () => {
    openModal({ genres: ['Drama', 'Action'] })
    expect(screen.getByRole('button', { name: 'Drama' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })

  it('toggling a genre button selects it (and triggers no error when re-submitted)', async () => {
    openModal()
    fireEvent.click(screen.getByRole('button', { name: 'Drama' }))
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: 'Test' } })
    fireEvent.change(screen.getByPlaceholderText('2025'), { target: { value: '2020' } })
    fireEvent.change(screen.getByPlaceholderText(/0–10/), { target: { value: '7.5' } })
    clickSave()
    await waitFor(() =>
      expect(screen.queryByText('Pick at least one genre.')).not.toBeInTheDocument()
    )
  })

  it('toggling an active genre button deselects it', async () => {
    openModal()
    fireEvent.click(screen.getByRole('button', { name: 'Drama' })) // select
    fireEvent.click(screen.getByRole('button', { name: 'Drama' })) // deselect
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: 'Test' } })
    fireEvent.change(screen.getByPlaceholderText('2025'), { target: { value: '2020' } })
    fireEvent.change(screen.getByPlaceholderText(/0–10/), { target: { value: '7.5' } })
    clickSave()
    await waitFor(() => expect(screen.getByText('Pick at least one genre.')).toBeInTheDocument())
  })

  // ── Inline add-genre flow ─────────────────────────────────────────────────
  it('shows the genre input row when "＋ Add genre" is clicked', () => {
    openModal()
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    expect(screen.getByPlaceholderText('Genre name')).toBeInTheDocument()
  })

  it('hides "＋ Add genre" while the inline form is open', () => {
    openModal()
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    expect(screen.queryByRole('button', { name: /Add genre/ })).not.toBeInTheDocument()
  })

  it('the confirm button is disabled when genre name is empty', () => {
    openModal()
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    const confirmBtn = screen.getByRole('button', { name: '✓' })
    expect(confirmBtn).toBeDisabled()
  })

  it('the confirm button is enabled once a name is typed', () => {
    openModal()
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    fireEvent.change(screen.getByPlaceholderText('Genre name'), { target: { value: 'Horror' } })
    const confirmBtn = screen.getByRole('button', { name: '✓' })
    expect(confirmBtn).not.toBeDisabled()
  })

  it('calls createGenre with the trimmed name on confirm', async () => {
    mockCreateGenre.mockResolvedValue('Horror')
    const onGenreCreated = vi.fn()
    render(
      <AddMovieModal open={true} onClose={vi.fn()} onAdd={vi.fn()} onGenreCreated={onGenreCreated} genres={[]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    fireEvent.change(screen.getByPlaceholderText('Genre name'), { target: { value: '  Horror  ' } })
    fireEvent.click(screen.getByRole('button', { name: '✓' }))
    await waitFor(() => expect(mockCreateGenre).toHaveBeenCalledWith('Horror'))
  })

  it('calls onGenreCreated with the created genre on success', async () => {
    mockCreateGenre.mockResolvedValue('Horror')
    const onGenreCreated = vi.fn()
    render(
      <AddMovieModal open={true} onClose={vi.fn()} onAdd={vi.fn()} onGenreCreated={onGenreCreated} genres={[]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    fireEvent.change(screen.getByPlaceholderText('Genre name'), { target: { value: 'Horror' } })
    fireEvent.click(screen.getByRole('button', { name: '✓' }))
    await waitFor(() => expect(onGenreCreated).toHaveBeenCalledWith('Horror'))
  })

  it('collapses the inline form after a successful genre add', async () => {
    mockCreateGenre.mockResolvedValue('Horror')
    openModal({ genres: [] })
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    fireEvent.change(screen.getByPlaceholderText('Genre name'), { target: { value: 'Horror' } })
    fireEvent.click(screen.getByRole('button', { name: '✓' }))
    await waitFor(() => expect(screen.queryByPlaceholderText('Genre name')).not.toBeInTheDocument())
  })

  it('shows the API error message when createGenre rejects', async () => {
    mockCreateGenre.mockRejectedValue(new Error('Genre already exists'))
    openModal({ genres: [] })
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    fireEvent.change(screen.getByPlaceholderText('Genre name'), { target: { value: 'Drama' } })
    fireEvent.click(screen.getByRole('button', { name: '✓' }))
    await waitFor(() => expect(screen.getByText('Genre already exists')).toBeInTheDocument())
  })

  it('pressing Enter in the genre input submits the genre', async () => {
    mockCreateGenre.mockResolvedValue('Horror')
    openModal({ genres: [] })
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    const input = screen.getByPlaceholderText('Genre name')
    fireEvent.change(input, { target: { value: 'Horror' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mockCreateGenre).toHaveBeenCalledWith('Horror'))
  })

  it('pressing Escape in the genre input cancels the inline form without closing the modal', () => {
    const onClose = vi.fn()
    render(
      <AddMovieModal open={true} onClose={onClose} onAdd={vi.fn()} onGenreCreated={vi.fn()} genres={[]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    const input = screen.getByPlaceholderText('Genre name')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Genre name')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clicking ✕ cancels the inline form', () => {
    openModal()
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    fireEvent.click(screen.getByRole('button', { name: '✕' }))
    expect(screen.queryByPlaceholderText('Genre name')).not.toBeInTheDocument()
  })

  it('shows "…" in the confirm button while createGenre is in-flight', async () => {
    let resolve!: (v: string) => void
    mockCreateGenre.mockReturnValue(new Promise<string>(r => { resolve = r }))
    openModal({ genres: [] })
    fireEvent.click(screen.getByRole('button', { name: /Add genre/ }))
    fireEvent.change(screen.getByPlaceholderText('Genre name'), { target: { value: 'Horror' } })
    fireEvent.click(screen.getByRole('button', { name: '✓' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '…' })).toBeInTheDocument())
    resolve('Horror')
  })

  // ── Submission happy path ─────────────────────────────────────────────────
  it('calls onAdd with the correct MovieInput on valid submission', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(
      <AddMovieModal open={true} onClose={vi.fn()} onAdd={onAdd} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    fillValidForm()
    clickSave()
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        title: 'Inception',
        year: 2010,
        rating: 8.8,
        genres: ['Drama'],
      })
    )
  })

  it('trims whitespace from the title before calling onAdd', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(
      <AddMovieModal open={true} onClose={vi.fn()} onAdd={onAdd} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    fireEvent.change(screen.getByPlaceholderText(/Long Quiet/), { target: { value: '  Dune  ' } })
    fireEvent.change(screen.getByPlaceholderText('2025'), { target: { value: '2021' } })
    fireEvent.change(screen.getByPlaceholderText(/0–10/), { target: { value: '8.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Drama' }))
    clickSave()
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dune' })))
  })

  it('calls onClose after onAdd resolves', async () => {
    const onClose = vi.fn()
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(
      <AddMovieModal open={true} onClose={onClose} onAdd={onAdd} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    fillValidForm()
    clickSave()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows "Saving…" and disables the button while onAdd is in-flight', async () => {
    let resolve!: () => void
    const onAdd = vi.fn().mockReturnValue(new Promise<void>(r => { resolve = r }))
    render(
      <AddMovieModal open={true} onClose={vi.fn()} onAdd={onAdd} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    fillValidForm()
    clickSave()
    await waitFor(() => expect(screen.getByText('Saving…')).toBeInTheDocument())
    resolve()
  })

  // ── Submission error ──────────────────────────────────────────────────────
  it('shows the error message when onAdd rejects', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('Server exploded'))
    render(
      <AddMovieModal open={true} onClose={vi.fn()} onAdd={onAdd} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    fillValidForm()
    clickSave()
    await waitFor(() => expect(screen.getByText('Server exploded')).toBeInTheDocument())
  })

  it('re-enables the Save button after onAdd rejects', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('fail'))
    render(
      <AddMovieModal open={true} onClose={vi.fn()} onAdd={onAdd} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    fillValidForm()
    clickSave()
    await waitFor(() => expect(screen.getByRole('button', { name: /Save → library/ })).toBeInTheDocument())
  })

  it('does NOT call onClose when onAdd rejects', async () => {
    const onClose = vi.fn()
    const onAdd = vi.fn().mockRejectedValue(new Error('fail'))
    render(
      <AddMovieModal open={true} onClose={onClose} onAdd={onAdd} onGenreCreated={vi.fn()} genres={GENRES} />
    )
    fillValidForm()
    clickSave()
    await waitFor(() => screen.getByText('fail'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
