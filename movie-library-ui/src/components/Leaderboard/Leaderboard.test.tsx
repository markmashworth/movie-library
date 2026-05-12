import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Leaderboard } from './Leaderboard'
import type { Movie } from '../../types'

function makeMovies(n: number): Movie[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    title: `Movie ${i + 1}`,
    year: 2000 + i,
    rating: parseFloat((9.0 - i * 0.1).toFixed(1)),
    genres: ['Drama'],
  }))
}

const defaultProps = { title: 'Top-rated movies', subtitle: 'Sorted by rating' }

describe('Leaderboard', () => {
  // ── Loading state ─────────────────────────────────────────────────────────
  it('renders a "Loading…" message when loading=true', () => {
    render(<Leaderboard movies={[]} loading={true} {...defaultProps} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('does not render movie rows when loading=true', () => {
    render(<Leaderboard movies={makeMovies(3)} loading={true} {...defaultProps} />)
    expect(screen.queryByText('Movie 1')).not.toBeInTheDocument()
  })

  // ── Error state ───────────────────────────────────────────────────────────
  it('renders an error message when error=true', () => {
    render(<Leaderboard movies={[]} error={true} {...defaultProps} />)
    expect(screen.getByText(/Could not load movies/i)).toBeInTheDocument()
  })

  it('does not render movie rows when error=true', () => {
    render(<Leaderboard movies={makeMovies(3)} error={true} {...defaultProps} />)
    expect(screen.queryByText('Movie 1')).not.toBeInTheDocument()
  })

  // ── Empty state ───────────────────────────────────────────────────────────
  it('renders "No movies match your filters." when movies is empty', () => {
    render(<Leaderboard movies={[]} {...defaultProps} />)
    expect(screen.getByText(/No movies match your filters/)).toBeInTheDocument()
  })

  // ── Header ────────────────────────────────────────────────────────────────
  it('displays the title prop', () => {
    render(<Leaderboard movies={[]} title="My Custom Title" subtitle="sub" />)
    expect(screen.getByText('My Custom Title')).toBeInTheDocument()
  })

  it('displays the subtitle prop', () => {
    render(<Leaderboard movies={[]} title="Title" subtitle="My Custom Subtitle" />)
    expect(screen.getByText('My Custom Subtitle')).toBeInTheDocument()
  })

  it('shows "1–5 of 10" count in the header for 10 movies', () => {
    render(<Leaderboard movies={makeMovies(10)} {...defaultProps} />)
    expect(screen.getByText('1–5')).toBeInTheDocument()
    expect(screen.getByText(/of\s+10/)).toBeInTheDocument()
  })

  // ── Initial render ────────────────────────────────────────────────────────
  it('shows at most 5 rows initially when more than 5 movies are provided', () => {
    render(<Leaderboard movies={makeMovies(10)} {...defaultProps} />)
    expect(screen.getAllByText('Movie 1')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Movie 5')[0]).toBeInTheDocument()
    expect(screen.queryAllByText('Movie 6')).toHaveLength(0)
  })

  it('renders all rows when 5 or fewer movies are provided', () => {
    render(<Leaderboard movies={makeMovies(3)} {...defaultProps} />)
    expect(screen.getAllByText('Movie 1')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Movie 2')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Movie 3')[0]).toBeInTheDocument()
  })

  it('renders rank numbers starting at 1', () => {
    render(<Leaderboard movies={makeMovies(5)} {...defaultProps} />)
    expect(screen.getByText('01')).toBeInTheDocument()
  })

  it('renders rank numbers sequentially', () => {
    render(<Leaderboard movies={makeMovies(5)} {...defaultProps} />)
    expect(screen.getByText('01')).toBeInTheDocument()
    expect(screen.getByText('02')).toBeInTheDocument()
    expect(screen.getByText('05')).toBeInTheDocument()
  })

  it('renders top-3 ranks with accent colour and rank 4+ with muted colour', () => {
    const { container } = render(<Leaderboard movies={makeMovies(5)} {...defaultProps} />)
    // Rank numbers are large divs; find them by padded text
    const rankEls = ['01', '02', '03', '04', '05'].map(
      t => Array.from(container.querySelectorAll<HTMLElement>('div')).find(el => el.textContent === t)!
    )
    expect(rankEls[0]?.style.color).toBe('var(--accent)')
    expect(rankEls[2]?.style.color).toBe('var(--accent)')
    expect(rankEls[3]?.style.color).toBe('var(--text-3)')
  })

  // ── Pagination ────────────────────────────────────────────────────────────
  it('"Show next 5 →" is enabled when more movies exist', () => {
    render(<Leaderboard movies={makeMovies(10)} {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Show next 5/ })).not.toBeDisabled()
  })

  it('"Show next 5 →" is disabled when all movies are shown', () => {
    render(<Leaderboard movies={makeMovies(3)} {...defaultProps} />)
    expect(screen.getByRole('button', { name: /Show next 5/ })).toBeDisabled()
  })

  it('clicking "Show next 5 →" reveals 5 more rows', () => {
    render(<Leaderboard movies={makeMovies(10)} {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Show next 5/ }))
    expect(screen.getAllByText('Movie 6')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Movie 10')[0]).toBeInTheDocument()
  })

  it('"Show next 5 →" stops at the last movie without overflow', () => {
    render(<Leaderboard movies={makeMovies(7)} {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Show next 5/ }))
    // Should show all 7, not crash trying to show 10
    expect(screen.getAllByText('Movie 7')[0]).toBeInTheDocument()
    expect(screen.queryAllByText('Movie 8')).toHaveLength(0)
  })

  // ── Reset ─────────────────────────────────────────────────────────────────
  it('"↺ Reset" is not visible initially', () => {
    render(<Leaderboard movies={makeMovies(10)} {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /Reset/ })).not.toBeInTheDocument()
  })

  it('"↺ Reset" appears after "Show next 5" is clicked', () => {
    render(<Leaderboard movies={makeMovies(10)} {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Show next 5/ }))
    expect(screen.getByRole('button', { name: /Reset/ })).toBeInTheDocument()
  })

  it('clicking "↺ Reset" collapses the list back to 5', () => {
    render(<Leaderboard movies={makeMovies(10)} {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Show next 5/ }))
    expect(screen.getAllByText('Movie 6')[0]).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }))
    expect(screen.queryAllByText('Movie 6')).toHaveLength(0)
    expect(screen.getAllByText('Movie 5')[0]).toBeInTheDocument()
  })

  // ── Row content ───────────────────────────────────────────────────────────
  it('displays each visible movie title', () => {
    render(<Leaderboard movies={makeMovies(5)} {...defaultProps} />)
    for (let i = 1; i <= 5; i++) {
      expect(screen.getAllByText(`Movie ${i}`)[0]).toBeInTheDocument()
    }
  })

  it('displays year and genres for each visible row', () => {
    render(<Leaderboard movies={makeMovies(3)} {...defaultProps} />)
    expect(screen.getByText(/2000 · Drama/)).toBeInTheDocument()
  })

  it('displays ratings formatted to 1 decimal place', () => {
    render(<Leaderboard movies={makeMovies(3)} {...defaultProps} />)
    expect(screen.getByText('9.0')).toBeInTheDocument()
    expect(screen.getByText('8.9')).toBeInTheDocument()
  })
})
