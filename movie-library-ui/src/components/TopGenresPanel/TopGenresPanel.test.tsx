import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TopGenresPanel } from './TopGenresPanel'
import type { StatsResponse } from '../../types'

const baseStats: StatsResponse = {
  total: 100,
  avg_rating: 7.0,
  genre_count: 5,
  min_year: 2000,
  max_year: 2023,
  by_year: [],
  top_genres: [
    { name: 'Drama', count: 50 },
    { name: 'Action', count: 30 },
    { name: 'Comedy', count: 20 },
    { name: 'Thriller', count: 10 },
    { name: 'Horror', count: 5 },
  ],
}

/** Returns the inner bar divs (height: 100%, explicit width set). */
function getBarDivs(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('div')).filter(
    el => el.style.height === '100%' && el.style.width !== ''
  )
}

describe('TopGenresPanel', () => {
  // ── Rendering ─────────────────────────────────────────────────────────────
  it('renders the "Top 5 genres" heading', () => {
    render(<TopGenresPanel stats={baseStats} />)
    expect(screen.getByText('Top 5 genres')).toBeInTheDocument()
  })

  it('renders one row for each entry in top_genres', () => {
    render(<TopGenresPanel stats={baseStats} />)
    expect(screen.getByText('Drama')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
    expect(screen.getByText('Comedy')).toBeInTheDocument()
    expect(screen.getByText('Thriller')).toBeInTheDocument()
    expect(screen.getByText('Horror')).toBeInTheDocument()
  })

  it('displays the genre count in each row', () => {
    render(<TopGenresPanel stats={baseStats} />)
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('displays 1-based rank numbers', () => {
    render(<TopGenresPanel stats={baseStats} />)
    expect(screen.getAllByText('1')[0]).toBeInTheDocument()
    expect(screen.getAllByText('2')[0]).toBeInTheDocument()
    expect(screen.getAllByText('5')[0]).toBeInTheDocument()
  })

  // ── Bar widths ────────────────────────────────────────────────────────────
  it('gives the top genre a bar width of 100%', () => {
    const { container } = render(<TopGenresPanel stats={baseStats} />)
    const bars = getBarDivs(container)
    expect(bars[0]?.style.width).toBe('100%')
  })

  it('gives subsequent bars proportional widths', () => {
    const { container } = render(<TopGenresPanel stats={baseStats} />)
    const bars = getBarDivs(container)
    // Action: 30/50 = 60%
    expect(bars[1]?.style.width).toBe('60%')
    // Comedy: 20/50 = 40%
    expect(bars[2]?.style.width).toBe('40%')
  })

  it('handles a single genre (bar width is 100%)', () => {
    const { container } = render(
      <TopGenresPanel stats={{ ...baseStats, top_genres: [{ name: 'Drama', count: 10 }] }} />
    )
    const bars = getBarDivs(container)
    expect(bars[0]?.style.width).toBe('100%')
  })

  // ── Accent colouring ──────────────────────────────────────────────────────
  it('renders the first bar with var(--accent) background', () => {
    const { container } = render(<TopGenresPanel stats={baseStats} />)
    const bars = getBarDivs(container)
    expect(bars[0]?.style.background).toBe('var(--accent)')
  })

  it('renders subsequent bars with rgba variants (not var(--accent))', () => {
    const { container } = render(<TopGenresPanel stats={baseStats} />)
    const bars = getBarDivs(container)
    expect(bars[1]?.style.background).not.toBe('var(--accent)')
    expect(bars[1]?.style.background).toContain('rgba')
  })

  // ── Edge cases ────────────────────────────────────────────────────────────
  it('renders no genre rows when top_genres is empty', () => {
    render(<TopGenresPanel stats={{ ...baseStats, top_genres: [] }} />)
    expect(screen.queryByText('Drama')).not.toBeInTheDocument()
  })

  it('does not throw when all genre counts are zero', () => {
    expect(() =>
      render(
        <TopGenresPanel
          stats={{ ...baseStats, top_genres: [{ name: 'Drama', count: 0 }] }}
        />
      )
    ).not.toThrow()
  })
})
