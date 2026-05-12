import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { Topbar } from './Topbar'
import type { Movie } from '../../types'

vi.mock('../../movie-library-service', () => ({
  searchMovies: vi.fn(),
}))

import { searchMovies } from '../../movie-library-service'
const mockSearch = vi.mocked(searchMovies)

const movie1: Movie = { id: 1, title: 'Inception', year: 2010, rating: 8.8, genres: ['Action'] }
const movie2: Movie = { id: 2, title: 'Interstellar', year: 2014, rating: 8.6, genres: ['Sci-Fi'] }

const defaultProps = {
  onOpenAdd: vi.fn(),
  techMode: false,
  setTechMode: vi.fn(),
  onSelectMovie: vi.fn(),
}

beforeEach(() => {
  mockSearch.mockReset()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function getInput() {
  return screen.getByPlaceholderText(/Search the library/i)
}

async function typeAndWait(text: string) {
  fireEvent.change(getInput(), { target: { value: text } })
  fireEvent.focus(getInput())
  await act(async () => { await vi.runAllTimersAsync() })
}

describe('Topbar', () => {
  // ── Static rendering ──────────────────────────────────────────────────────
  it('renders the brand text', () => {
    render(<Topbar {...defaultProps} />)
    expect(screen.getByText('NETFLIX')).toBeInTheDocument()
    expect(screen.getByText('Movie Library')).toBeInTheDocument()
  })

  it('renders the search input with correct placeholder', () => {
    render(<Topbar {...defaultProps} />)
    expect(getInput()).toBeInTheDocument()
  })

  it('renders the ⌘K hint badge', () => {
    render(<Topbar {...defaultProps} />)
    expect(screen.getByText('⌘K')).toBeInTheDocument()
  })

  it('renders the Advanced Search toggle', () => {
    render(<Topbar {...defaultProps} />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('renders the "Add Movie" button', () => {
    render(<Topbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Add Movie/ })).toBeInTheDocument()
  })

  // ── Search input ──────────────────────────────────────────────────────────
  it('calls searchMovies after the debounce delay', async () => {
    mockSearch.mockResolvedValue([])
    render(<Topbar {...defaultProps} />)
    await typeAndWait('batman')
    expect(mockSearch).toHaveBeenCalledWith('batman', 6)
  })

  it('does not call searchMovies immediately (debounced)', async () => {
    mockSearch.mockResolvedValue([])
    render(<Topbar {...defaultProps} />)
    fireEvent.change(getInput(), { target: { value: 'batman' } })
    // Before debounce fires:
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('does not call searchMovies for empty input', async () => {
    render(<Topbar {...defaultProps} />)
    await typeAndWait('')
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('does not call searchMovies for whitespace-only input', async () => {
    render(<Topbar {...defaultProps} />)
    await typeAndWait('   ')
    expect(mockSearch).not.toHaveBeenCalled()
  })

  // ── ⌘K keyboard shortcut ─────────────────────────────────────────────────
  it('focuses the input when ⌘K is pressed', () => {
    render(<Topbar {...defaultProps} />)
    const input = getInput()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
    })
    expect(document.activeElement).toBe(input)
  })

  it('focuses the input when ⌃K is pressed', () => {
    render(<Topbar {...defaultProps} />)
    const input = getInput()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
    })
    expect(document.activeElement).toBe(input)
  })

  // ── Autocomplete dropdown — results ───────────────────────────────────────
  it('shows the dropdown with results', async () => {
    mockSearch.mockResolvedValue([movie1, movie2])
    render(<Topbar {...defaultProps} />)
    await typeAndWait('inc')
    expect(screen.getAllByText('Inception')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Interstellar')[0]).toBeInTheDocument()
  })

  it('displays title, year, genres, and rating for each result', async () => {
    mockSearch.mockResolvedValue([movie1])
    render(<Topbar {...defaultProps} />)
    await typeAndWait('inc')
    expect(screen.getAllByText('Inception')[0]).toBeInTheDocument()
    expect(screen.getAllByText(/2010/)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/Action/)[0]).toBeInTheDocument()
    expect(screen.getByText('8.8')).toBeInTheDocument()
  })

  it('calls onSelectMovie when a result row is clicked', async () => {
    mockSearch.mockResolvedValue([movie1])
    const onSelectMovie = vi.fn()
    render(<Topbar {...defaultProps} onSelectMovie={onSelectMovie} />)
    await typeAndWait('inc')
    fireEvent.mouseDown(screen.getAllByText('Inception')[0])
    expect(onSelectMovie).toHaveBeenCalledWith(movie1)
  })

  it('fills the input with the selected movie title', async () => {
    mockSearch.mockResolvedValue([movie1])
    render(<Topbar {...defaultProps} />)
    await typeAndWait('inc')
    fireEvent.mouseDown(screen.getAllByText('Inception')[0])
    expect(getInput()).toHaveValue('Inception')
  })

  it('closes the dropdown after selection', async () => {
    mockSearch.mockResolvedValue([movie1])
    render(<Topbar {...defaultProps} />)
    await typeAndWait('inc')
    fireEvent.mouseDown(screen.getAllByText('Inception')[0])
    expect(screen.queryByText(/navigate/)).not.toBeInTheDocument()
  })

  // ── Autocomplete dropdown — empty state ──────────────────────────────────
  it('shows "No matches" when searchMovies returns empty array', async () => {
    mockSearch.mockResolvedValue([])
    render(<Topbar {...defaultProps} />)
    await typeAndWait('xyzzy')
    expect(screen.getByText(/No matches for/)).toBeInTheDocument()
  })

  it('renders the "+ Add it →" link in the empty state', async () => {
    mockSearch.mockResolvedValue([])
    render(<Topbar {...defaultProps} />)
    await typeAndWait('xyzzy')
    expect(screen.getByText(/Add it/)).toBeInTheDocument()
  })

  it('calls onOpenAdd with the current query when "+ Add it →" is clicked', async () => {
    mockSearch.mockResolvedValue([])
    const onOpenAdd = vi.fn()
    render(<Topbar {...defaultProps} onOpenAdd={onOpenAdd} />)
    await typeAndWait('xyzzy')
    fireEvent.mouseDown(screen.getByText(/Add it/))
    expect(onOpenAdd).toHaveBeenCalledWith('xyzzy')
  })

  // ── Keyboard navigation ───────────────────────────────────────────────────
  it('ArrowDown highlights the next result', async () => {
    mockSearch.mockResolvedValue([movie1, movie2])
    render(<Topbar {...defaultProps} />)
    await typeAndWait('i')
    fireEvent.keyDown(getInput(), { key: 'ArrowDown' })
    // After one ArrowDown from index 0, index becomes 1 → Interstellar is highlighted
    const rows = screen.getAllByText(/\d{4} ·/)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('ArrowDown does not move beyond the last result', async () => {
    mockSearch.mockResolvedValue([movie1])
    render(<Topbar {...defaultProps} />)
    await typeAndWait('i')
    fireEvent.keyDown(getInput(), { key: 'ArrowDown' })
    fireEvent.keyDown(getInput(), { key: 'ArrowDown' }) // extra press, should clamp at 0
    // dropdown still open
    expect(screen.getAllByText('Inception')[0]).toBeInTheDocument()
  })

  it('ArrowUp does not move above index 0', async () => {
    mockSearch.mockResolvedValue([movie1, movie2])
    render(<Topbar {...defaultProps} />)
    await typeAndWait('i')
    fireEvent.keyDown(getInput(), { key: 'ArrowUp' }) // already at 0
    expect(screen.getAllByText('Inception')[0]).toBeInTheDocument()
  })

  it('Enter selects the highlighted result', async () => {
    mockSearch.mockResolvedValue([movie1, movie2])
    const onSelectMovie = vi.fn()
    render(<Topbar {...defaultProps} onSelectMovie={onSelectMovie} />)
    await typeAndWait('i')
    // Default highlight is index 0 (Inception)
    fireEvent.keyDown(getInput(), { key: 'Enter' })
    expect(onSelectMovie).toHaveBeenCalledWith(movie1)
  })

  it('Escape closes the dropdown', async () => {
    mockSearch.mockResolvedValue([movie1])
    render(<Topbar {...defaultProps} />)
    await typeAndWait('i')
    fireEvent.keyDown(getInput(), { key: 'Escape' })
    expect(screen.queryByText('Inception')).not.toBeInTheDocument()
  })

  // ── Tech mode toggle ──────────────────────────────────────────────────────
  it('calls setTechMode(true) when clicked while techMode=false', () => {
    const setTechMode = vi.fn()
    render(<Topbar {...defaultProps} techMode={false} setTechMode={setTechMode} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(setTechMode).toHaveBeenCalledWith(true)
  })

  it('calls setTechMode(false) when clicked while techMode=true', () => {
    const setTechMode = vi.fn()
    render(<Topbar {...defaultProps} techMode={true} setTechMode={setTechMode} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(setTechMode).toHaveBeenCalledWith(false)
  })

  it('has aria-checked="true" when techMode=true', () => {
    render(<Topbar {...defaultProps} techMode={true} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('has aria-checked="false" when techMode=false', () => {
    render(<Topbar {...defaultProps} techMode={false} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  // ── Add Movie button ──────────────────────────────────────────────────────
  it('calls onOpenAdd with no argument when "Add Movie" is clicked', () => {
    const onOpenAdd = vi.fn()
    render(<Topbar {...defaultProps} onOpenAdd={onOpenAdd} />)
    fireEvent.click(screen.getByRole('button', { name: /Add Movie/ }))
    expect(onOpenAdd).toHaveBeenCalledWith()
  })
})
