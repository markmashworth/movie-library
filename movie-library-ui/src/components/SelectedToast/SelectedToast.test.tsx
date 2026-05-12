import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SelectedToast } from './SelectedToast'
import type { Movie } from '../../types'

const movie: Movie = {
  id: 3,
  title: 'Pulp Fiction',
  year: 1994,
  rating: 8.9,
  genres: ['Crime', 'Drama'],
}

describe('SelectedToast', () => {
  // ── Null guard ────────────────────────────────────────────────────────────
  it('renders nothing when movie is null', () => {
    const { container } = render(<SelectedToast movie={null} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  // ── Content ───────────────────────────────────────────────────────────────
  it('renders the movie title', () => {
    render(<SelectedToast movie={movie} onClose={vi.fn()} />)
    expect(screen.getAllByText('Pulp Fiction')[0]).toBeInTheDocument()
  })

  it('renders the movie year', () => {
    render(<SelectedToast movie={movie} onClose={vi.fn()} />)
    expect(screen.getAllByText(/1994/)[0]).toBeInTheDocument()
  })

  it('renders genres joined with " / "', () => {
    render(<SelectedToast movie={movie} onClose={vi.fn()} />)
    expect(screen.getByText(/Crime \/ Drama/)).toBeInTheDocument()
  })

  it('renders the rating formatted to 1 decimal place', () => {
    render(<SelectedToast movie={movie} onClose={vi.fn()} />)
    expect(screen.getByText('8.9')).toBeInTheDocument()
  })

  it('renders the "Found in library" label', () => {
    render(<SelectedToast movie={movie} onClose={vi.fn()} />)
    expect(screen.getByText(/Found in library/i)).toBeInTheDocument()
  })

  it('renders the movie title inside the Poster', () => {
    render(<SelectedToast movie={movie} onClose={vi.fn()} />)
    // Poster renders the title text; there will be two instances (Poster + toast heading)
    expect(screen.getAllByText('Pulp Fiction').length).toBeGreaterThanOrEqual(2)
  })

  // ── Close interaction ─────────────────────────────────────────────────────
  describe('× button dismissal', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('calls onClose when the × button is clicked (after slide-out animation)', () => {
      const onClose = vi.fn()
      render(<SelectedToast movie={movie} onClose={onClose} />)
      fireEvent.click(screen.getByRole('button'))
      expect(onClose).not.toHaveBeenCalled() // animation still running
      act(() => vi.advanceTimersByTime(400))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('does NOT call onClose when clicking inside the toast body', () => {
    const onClose = vi.fn()
    render(<SelectedToast movie={movie} onClose={onClose} />)
    fireEvent.click(screen.getAllByText('Pulp Fiction')[0])
    expect(onClose).not.toHaveBeenCalled()
  })
})
