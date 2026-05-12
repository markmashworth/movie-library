import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatsStrip } from './StatsStrip'
import type { StatsResponse } from '../../types'

const stats: StatsResponse = {
  total: 1500,
  avg_rating: 7.253,
  genre_count: 20,
  min_year: 1980,
  max_year: 2024,
  top_genres: [
    { name: 'Drama', count: 400 },
    { name: 'Action', count: 300 },
  ],
  by_year: [],
}

describe('StatsStrip', () => {
  // ── Total movies tile ────────────────────────────────────────────────────
  it('displays the total movie count formatted with toLocaleString()', () => {
    render(<StatsStrip stats={stats} />)
    // 1500 → "1,500" in en-US locale
    expect(screen.getByText(stats.total.toLocaleString())).toBeInTheDocument()
  })

  it('labels the tile "Total movies"', () => {
    render(<StatsStrip stats={stats} />)
    expect(screen.getByText('Total movies')).toBeInTheDocument()
  })

  // ── Average rating tile ──────────────────────────────────────────────────
  it('displays avg_rating formatted to exactly 2 decimal places', () => {
    render(<StatsStrip stats={stats} />)
    expect(screen.getByText('7.25')).toBeInTheDocument()
  })

  it('shows the subtitle "across all titles"', () => {
    render(<StatsStrip stats={stats} />)
    expect(screen.getByText('across all titles')).toBeInTheDocument()
  })

  // ── Top genre tile ───────────────────────────────────────────────────────
  it('displays the name of the first top_genre as the tile value', () => {
    render(<StatsStrip stats={stats} />)
    // "Drama" appears as the large tile value (there may be other instances)
    const dramaEls = screen.getAllByText('Drama')
    expect(dramaEls.length).toBeGreaterThan(0)
  })

  it('shows the genre count and percentage as the tile subtitle', () => {
    render(<StatsStrip stats={stats} />)
    // 400 titles, 400/1500 = 26.666... → 27%
    expect(screen.getByText(/400 titles/)).toBeInTheDocument()
    expect(screen.getByText(/27%/)).toBeInTheDocument()
  })

  it('displays "—" as the value when top_genres is empty', () => {
    render(<StatsStrip stats={{ ...stats, top_genres: [] }} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows no genre subtitle when top_genres is empty', () => {
    render(<StatsStrip stats={{ ...stats, top_genres: [] }} />)
    expect(screen.queryByText(/titles ·/)).not.toBeInTheDocument()
  })

  // ── Genres tracked tile ──────────────────────────────────────────────────
  it('displays genre_count as a string', () => {
    render(<StatsStrip stats={stats} />)
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('shows the subtitle "unique"', () => {
    render(<StatsStrip stats={stats} />)
    expect(screen.getByText('unique')).toBeInTheDocument()
  })

  // ── Year span tile ───────────────────────────────────────────────────────
  it('displays the span as "<n>y"', () => {
    render(<StatsStrip stats={stats} />)
    // 2024 - 1980 = 44
    expect(screen.getByText('44y')).toBeInTheDocument()
  })

  it('shows the subtitle "<min_year> → <max_year>"', () => {
    render(<StatsStrip stats={stats} />)
    expect(screen.getByText('1980 → 2024')).toBeInTheDocument()
  })

  it('displays "0y" when min_year equals max_year', () => {
    render(<StatsStrip stats={{ ...stats, min_year: 2020, max_year: 2020 }} />)
    expect(screen.getByText('0y')).toBeInTheDocument()
  })

  // ── Layout ───────────────────────────────────────────────────────────────
  it('renders exactly five stat tile labels', () => {
    render(<StatsStrip stats={stats} />)
    const labels = ['Total movies', 'Average rating', 'Top genre', 'Genres tracked', 'Year span']
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
