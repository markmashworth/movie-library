import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { FilterBar } from './FilterBar'
import type { Filters } from '../../types'

const DEFAULT: Filters = { genres: [], minRating: 0, yearMin: null, yearMax: null }

// Wrapper provides real state so we can observe DOM changes
function Wrapper({
  initialFilters = DEFAULT,
  genres = ['Action', 'Drama', 'Comedy'],
  resultCount = 5,
  totalCount = 100,
}: {
  initialFilters?: Filters
  genres?: string[]
  resultCount?: number
  totalCount?: number
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  return (
    <FilterBar
      filters={filters}
      setFilters={setFilters}
      genres={genres}
      resultCount={resultCount}
      totalCount={totalCount}
    />
  )
}

describe('FilterBar', () => {
  // ── Rendering ────────────────────────────────────────────────────────────
  it('renders the "Advanced Search" label', () => {
    render(<Wrapper />)
    expect(screen.getByText('Advanced Search')).toBeInTheDocument()
  })

  it('renders Genre, Min rating, and Year filter chips', () => {
    render(<Wrapper />)
    expect(screen.getByRole('button', { name: /Genre/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Min rating/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Year/ })).toBeInTheDocument()
  })

  it('does not render "Clear all" when no filters are active', () => {
    render(<Wrapper />)
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  // ── Result count display ─────────────────────────────────────────────────
  it('displays resultCount and totalCount in the matched summary', () => {
    render(<Wrapper resultCount={42} totalCount={200} />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText(/\/\s*200 matched/)).toBeInTheDocument()
  })

  // ── Genre dropdown ───────────────────────────────────────────────────────
  it('opens the genre dropdown when the Genre chip is clicked', () => {
    render(<Wrapper genres={['Action', 'Drama']} />)
    expect(screen.queryByText('Pick any · multi')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Genre/ }))
    expect(screen.getByText('Pick any · multi')).toBeInTheDocument()
  })

  it('closes the genre dropdown when the Genre chip is clicked again', () => {
    render(<Wrapper genres={['Action', 'Drama']} />)
    fireEvent.click(screen.getByRole('button', { name: /Genre/ }))
    expect(screen.getByText('Pick any · multi')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Genre/ }))
    expect(screen.queryByText('Pick any · multi')).not.toBeInTheDocument()
  })

  it('closes the genre dropdown when the backdrop overlay is clicked', () => {
    const { container } = render(<Wrapper genres={['Action']} />)
    fireEvent.click(screen.getByRole('button', { name: /Genre/ }))
    expect(screen.getByText('Pick any · multi')).toBeInTheDocument()
    // The backdrop is the first child of the dropdown fragment — a fixed inset-0 div
    const backdrop = container.querySelector<HTMLElement>('[style*="position: fixed"]')
    if (backdrop) fireEvent.click(backdrop)
    expect(screen.queryByText('Pick any · multi')).not.toBeInTheDocument()
  })

  it('renders a button for each genre in the dropdown', () => {
    render(<Wrapper genres={['Action', 'Drama', 'Comedy']} />)
    fireEvent.click(screen.getByRole('button', { name: /Genre/ }))
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drama' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comedy' })).toBeInTheDocument()
  })

  it('adds a genre to active filters when clicked in the dropdown', () => {
    render(<Wrapper genres={['Action', 'Drama']} />)
    fireEvent.click(screen.getByRole('button', { name: /Genre/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Action' }))
    // "Clear all" appears as soon as any filter is active
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
  })

  it('removes a genre from active filters when its dropdown button is clicked again', () => {
    render(<Wrapper genres={['Action', 'Drama']} />)
    fireEvent.click(screen.getByRole('button', { name: /Genre/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Action' })) // add
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Action' })) // remove
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('shows the genre count badge on the Genre chip when genres are selected', () => {
    render(<Wrapper genres={['Action', 'Drama']} />)
    fireEvent.click(screen.getByRole('button', { name: /Genre/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Action' }))
    expect(screen.getByText('· 1')).toBeInTheDocument()
  })

  // ── Min rating dropdown ──────────────────────────────────────────────────
  it('opens the rating dropdown when the Min rating chip is clicked', () => {
    render(<Wrapper />)
    fireEvent.click(screen.getByRole('button', { name: /Min rating/ }))
    expect(screen.getByText('Minimum rating')).toBeInTheDocument()
  })

  it('updates minRating when the range slider is changed', () => {
    render(<Wrapper />)
    fireEvent.click(screen.getByRole('button', { name: /Min rating/ }))
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '7' } })
    // Rating badge should appear on the chip
    expect(screen.getByText(/· ★ 7\.0/)).toBeInTheDocument()
  })

  it('shows the current rating value to 1 dp in the dropdown header', () => {
    render(<Wrapper initialFilters={{ ...DEFAULT, minRating: 6.5 }} />)
    fireEvent.click(screen.getByRole('button', { name: /Min rating/ }))
    expect(screen.getByText('★ 6.5')).toBeInTheDocument()
  })

  it('shows the rating badge on the chip when minRating > 0', () => {
    render(<Wrapper initialFilters={{ ...DEFAULT, minRating: 5 }} />)
    expect(screen.getByText(/· ★ 5\.0/)).toBeInTheDocument()
  })

  // ── Year range dropdown ──────────────────────────────────────────────────
  it('opens the year dropdown when the Year chip is clicked', () => {
    render(<Wrapper />)
    fireEvent.click(screen.getByRole('button', { name: /^Year/ }))
    expect(screen.getByText('Year range')).toBeInTheDocument()
  })

  it('sets yearMin when the From input changes', () => {
    render(<Wrapper />)
    fireEvent.click(screen.getByRole('button', { name: /^Year/ }))
    fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '2010' } })
    expect(screen.getAllByText(/2010/)[0]).toBeInTheDocument()
  })

  it('sets yearMax when the To input changes', () => {
    render(<Wrapper />)
    fireEvent.click(screen.getByRole('button', { name: /^Year/ }))
    fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: '2020' } })
    expect(screen.getAllByText(/2020/)[0]).toBeInTheDocument()
  })

  it('clears yearMin when the From input is emptied', () => {
    render(<Wrapper initialFilters={{ ...DEFAULT, yearMin: 2010 }} />)
    fireEvent.click(screen.getByRole('button', { name: /^Year/ }))
    fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '' } })
    // Year chip badge should disappear (no active year filter)
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('applies the correct yearMin/yearMax for the "2010s" preset', () => {
    render(<Wrapper />)
    fireEvent.click(screen.getByRole('button', { name: /^Year/ }))
    fireEvent.click(screen.getByRole('button', { name: '2010s' }))
    expect(screen.getAllByText(/2010.*2019|2019.*2010/)[0]).toBeInTheDocument()
  })

  it('shows the year range badge on the chip when yearMin is set', () => {
    render(<Wrapper initialFilters={{ ...DEFAULT, yearMin: 2000, yearMax: 2010 }} />)
    expect(screen.getAllByText(/2000/)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/2010/)[0]).toBeInTheDocument()
  })

  // ── Active filter chips ──────────────────────────────────────────────────
  it('renders a removable chip for each selected genre', () => {
    render(<Wrapper initialFilters={{ ...DEFAULT, genres: ['Action', 'Drama'] }} />)
    // Removable chips have an × suffix; check both genres appear as chips
    expect(screen.getAllByText(/Action/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Drama/).length).toBeGreaterThan(0)
  })

  it('removes a genre when its removable chip × is clicked', () => {
    render(<Wrapper genres={['Action', 'Drama']} />)
    fireEvent.click(screen.getByRole('button', { name: /Genre/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Action' })) // add Action
    // Now find the removable chip button for Action and click it to remove
    // The chip button's accessible name contains 'Action' and '×'
    const chips = screen.getAllByRole('button', { name: /Action/ })
    // The removable chip includes '×' in its accessible name
    const removeChip = chips.find(b => b.textContent?.includes('×'))
    expect(removeChip).toBeDefined()
    fireEvent.click(removeChip!)
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('renders a removable chip for active min-rating filter', () => {
    render(<Wrapper initialFilters={{ ...DEFAULT, minRating: 7 }} />)
    expect(screen.getByText(/★ ≥ 7\.0/)).toBeInTheDocument()
  })

  it('removes the rating chip when its × is clicked', () => {
    render(<Wrapper initialFilters={{ ...DEFAULT, minRating: 7 }} />)
    const ratingChip = screen.getAllByRole('button', { name: /★ ≥/ })[0]!
    fireEvent.click(ratingChip)
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  it('renders a removable chip for the active year range', () => {
    render(<Wrapper initialFilters={{ ...DEFAULT, yearMin: 2000, yearMax: 2010 }} />)
    expect(screen.getAllByText(/2000.*2010|2010.*2000/)[0]).toBeInTheDocument()
  })

  it('removes the year chip when its × is clicked', () => {
    render(<Wrapper initialFilters={{ ...DEFAULT, yearMin: 2000, yearMax: 2010 }} />)
    const chips = screen.getAllByRole('button', { name: /2000/ })
    const removeChip = chips.find(b => b.textContent?.includes('×'))!
    fireEvent.click(removeChip)
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })

  // ── Clear all ────────────────────────────────────────────────────────────
  it('renders "Clear all" when at least one filter is active', () => {
    render(<Wrapper initialFilters={{ ...DEFAULT, minRating: 5 }} />)
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
  })

  it('resets all filters when "Clear all" is clicked', () => {
    render(
      <Wrapper
        genres={['Action']}
        initialFilters={{ genres: ['Action'], minRating: 5, yearMin: 2000, yearMax: 2020 }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
  })
})
