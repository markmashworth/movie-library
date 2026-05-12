import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ByYearPanel } from './ByYearPanel'
import type { StatsResponse } from '../../types'

const stats: StatsResponse = {
  total: 5,
  avg_rating: 7.5,
  genre_count: 3,
  min_year: 2021,
  max_year: 2023,
  top_genres: [],
  by_year: [
    {
      year: 2023,
      count: 3,
      movies: [
        { id: 1, title: 'Alpha', rating: 8.5, genres: ['Drama'] },
        { id: 2, title: 'Beta', rating: 7.2, genres: ['Action'] },
        { id: 3, title: 'Gamma', rating: 9.0, genres: ['Comedy'] },
      ],
    },
    {
      year: 2022,
      count: 1,
      movies: [{ id: 4, title: 'Delta', rating: 6.5, genres: ['Thriller'] }],
    },
    {
      year: 2021,
      count: 1,
      movies: [{ id: 5, title: 'Epsilon', rating: 7.8, genres: ['Drama'] }],
    },
  ],
}

/** Helper: find the clickable row div for a given year. */
function clickYear(year: number): void {
  fireEvent.click(screen.getByText(String(year)))
}

describe('ByYearPanel', () => {
  // ── Rendering ─────────────────────────────────────────────────────────────
  it('renders the "Movies by year" heading', () => {
    render(<ByYearPanel stats={stats} />)
    expect(screen.getByText('Movies by year')).toBeInTheDocument()
  })

  it('displays the total number of years in the header', () => {
    render(<ByYearPanel stats={stats} />)
    expect(screen.getByText('3 years')).toBeInTheDocument()
  })

  it('displays each year label', () => {
    render(<ByYearPanel stats={stats} />)
    expect(screen.getByText('2023')).toBeInTheDocument()
    expect(screen.getByText('2022')).toBeInTheDocument()
    expect(screen.getByText('2021')).toBeInTheDocument()
  })

  it("displays each year's movie count", () => {
    render(<ByYearPanel stats={stats} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  // ── Bar widths ────────────────────────────────────────────────────────────
  it('gives the year with the highest count a bar width of 100%', () => {
    const { container } = render(<ByYearPanel stats={stats} />)
    // maxCount is 3 (year 2023). Its bar div has height: 100% and width: 100%
    const barDivs = Array.from(container.querySelectorAll<HTMLElement>('div')).filter(
      el => el.style.height === '100%' && el.style.width !== ''
    )
    expect(barDivs.some(el => el.style.width === '100%')).toBe(true)
  })

  it('gives other years proportional bar widths', () => {
    const { container } = render(<ByYearPanel stats={stats} />)
    // year 2022 has count 1, max is 3 → ~33.333...%
    const barDivs = Array.from(container.querySelectorAll<HTMLElement>('div')).filter(
      el => el.style.height === '100%' && el.style.width !== ''
    )
    expect(barDivs.some(el => el.style.width.includes('33.'))).toBe(true)
  })

  it('does not throw when all counts are zero', () => {
    const zeroStats: StatsResponse = {
      ...stats,
      by_year: [{ year: 2023, count: 0, movies: [] }],
    }
    expect(() => render(<ByYearPanel stats={zeroStats} />)).not.toThrow()
  })

  // ── Expand / collapse ─────────────────────────────────────────────────────
  it('shows no movie titles by default (all collapsed)', () => {
    render(<ByYearPanel stats={stats} />)
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Delta')).not.toBeInTheDocument()
  })

  it('expands a bucket and shows its movies when clicked', () => {
    render(<ByYearPanel stats={stats} />)
    clickYear(2023)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })

  it('collapses an expanded bucket when clicked again', () => {
    render(<ByYearPanel stats={stats} />)
    clickYear(2023)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    clickYear(2023)
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
  })

  it('collapses the previous bucket when a new one is expanded', () => {
    render(<ByYearPanel stats={stats} />)
    clickYear(2023)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    clickYear(2022)
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Delta')).toBeInTheDocument()
  })

  it('rotates the chevron to 90deg when the bucket is expanded', () => {
    const { container } = render(<ByYearPanel stats={stats} />)
    // chevrons are the ▶ spans
    const chevrons = Array.from(container.querySelectorAll<HTMLElement>('span')).filter(
      el => el.textContent === '▶'
    )
    clickYear(2023)
    // First chevron (2023) should now have rotate(90deg) transform
    expect(chevrons[0]?.style.transform).toBe('rotate(90deg)')
  })

  it('rotates the chevron back when the bucket is collapsed', () => {
    const { container } = render(<ByYearPanel stats={stats} />)
    const chevrons = Array.from(container.querySelectorAll<HTMLElement>('span')).filter(
      el => el.textContent === '▶'
    )
    clickYear(2023)
    clickYear(2023)
    expect(chevrons[0]?.style.transform).toMatch(/rotate\(0(deg)?\)/)
  })

  // ── Movie list content ────────────────────────────────────────────────────
  it('renders each movie title inside the expanded bucket', () => {
    render(<ByYearPanel stats={stats} />)
    clickYear(2022)
    expect(screen.getByText('Delta')).toBeInTheDocument()
  })

  it('renders ratings formatted to 1 decimal place', () => {
    render(<ByYearPanel stats={stats} />)
    clickYear(2023)
    expect(screen.getByText('★ 8.5')).toBeInTheDocument()
    expect(screen.getByText('★ 9.0')).toBeInTheDocument()
  })

  // ── Edge cases ────────────────────────────────────────────────────────────
  it('renders an empty container when by_year is empty', () => {
    render(<ByYearPanel stats={{ ...stats, by_year: [] }} />)
    expect(screen.queryByText('2023')).not.toBeInTheDocument()
    expect(screen.getByText('0 years')).toBeInTheDocument()
  })

  it('handles a bucket with zero movies gracefully when expanded', () => {
    const emptyBucket: StatsResponse = {
      ...stats,
      by_year: [{ year: 2023, count: 0, movies: [] }],
    }
    render(<ByYearPanel stats={emptyBucket} />)
    expect(() => clickYear(2023)).not.toThrow()
  })
})
