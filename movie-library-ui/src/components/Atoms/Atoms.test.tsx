import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Star, Poster } from './Atoms'
import { ghostBtn, primaryBtn, modalInput } from './Atoms.styles'
import type { Movie } from '../../types'

const movie: Movie = { id: 1, title: 'The Matrix', year: 1999, rating: 8.7, genres: ['Action'] }

// ---------------------------------------------------------------------------
// Star
// ---------------------------------------------------------------------------

describe('Star', () => {
  it('renders an SVG element', () => {
    const { container } = render(<Star />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('defaults to size 12 when no size prop is provided', () => {
    const { container } = render(<Star />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('12')
    expect(svg.getAttribute('height')).toBe('12')
  })

  it('uses the provided size for both width and height attributes', () => {
    const { container } = render(<Star size={24} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('24')
    expect(svg.getAttribute('height')).toBe('24')
  })

  it('defaults fill to var(--gold)', () => {
    const { container } = render(<Star />)
    const path = container.querySelector('path')!
    expect(path.getAttribute('fill')).toBe('var(--gold)')
  })

  it('uses the provided fill colour on the path element', () => {
    const { container } = render(<Star fill="#ff0000" />)
    const path = container.querySelector('path')!
    expect(path.getAttribute('fill')).toBe('#ff0000')
  })
})

// ---------------------------------------------------------------------------
// Poster
// ---------------------------------------------------------------------------

describe('Poster', () => {
  it('renders without crashing', () => {
    const { container } = render(<Poster movie={movie} />)
    expect(container.firstElementChild).not.toBeNull()
  })

  it('displays the movie title', () => {
    render(<Poster movie={movie} />)
    expect(screen.getByText('The Matrix')).toBeInTheDocument()
  })

  it('displays the movie year', () => {
    render(<Poster movie={movie} />)
    expect(screen.getByText('1999')).toBeInTheDocument()
  })

  it('defaults dimensions to w=56 h=80', () => {
    const { container } = render(<Poster movie={movie} />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.width).toBe('56px')
    expect(el.style.height).toBe('80px')
  })

  it('applies the provided w and h as inline styles', () => {
    const { container } = render(<Poster movie={movie} w={100} h={140} />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.width).toBe('100px')
    expect(el.style.height).toBe('140px')
  })

  it('uses a deterministic gradient — same palette slot produces identical background', () => {
    // Palettes has 8 entries; id 0 and id 8 both map to slot 0 (n % 8 === 0)
    const m1: Movie = { ...movie, id: 0, title: 'A' }
    const m2: Movie = { ...movie, id: 8, title: 'B' }
    const { container: c1 } = render(<Poster movie={m1} />)
    const { container: c2 } = render(<Poster movie={m2} />)
    const bg1 = (c1.firstElementChild as HTMLElement).style.background
    const bg2 = (c2.firstElementChild as HTMLElement).style.background
    expect(bg1).toBe(bg2)
  })

  it('uses a different gradient for movies at different palette slots', () => {
    const m1: Movie = { ...movie, id: 0, title: 'A' }
    const m2: Movie = { ...movie, id: 1, title: 'B' }
    const { container: c1 } = render(<Poster movie={m1} />)
    const { container: c2 } = render(<Poster movie={m2} />)
    const bg1 = (c1.firstElementChild as HTMLElement).style.background
    const bg2 = (c2.firstElementChild as HTMLElement).style.background
    expect(bg1).not.toBe(bg2)
  })

  it('wraps around the palette correctly when movie.id exceeds palette length', () => {
    // 16 % 8 === 0, so same palette as id=0
    const m1: Movie = { ...movie, id: 0, title: 'A' }
    const m2: Movie = { ...movie, id: 16, title: 'B' }
    const { container: c1 } = render(<Poster movie={m1} />)
    const { container: c2 } = render(<Poster movie={m2} />)
    expect((c1.firstElementChild as HTMLElement).style.background).toBe(
      (c2.firstElementChild as HTMLElement).style.background
    )
  })

  it('applies larger title font size when big=true', () => {
    const { container: smallContainer } = render(<Poster movie={movie} big={false} />)
    const { container: bigContainer } = render(<Poster movie={movie} big={true} />)
    const smallEl = within(smallContainer).getByText('The Matrix') as HTMLElement
    const bigEl = within(bigContainer).getByText('The Matrix') as HTMLElement
    expect(parseFloat(bigEl.style.fontSize)).toBeGreaterThan(parseFloat(smallEl.style.fontSize))
  })
})

// ---------------------------------------------------------------------------
// ghostBtn
// ---------------------------------------------------------------------------

describe('ghostBtn', () => {
  it('is a plain object (not a function)', () => {
    expect(typeof ghostBtn).toBe('object')
  })

  it('has transparent background', () => {
    expect(ghostBtn.background).toBe('transparent')
  })

  it('has a pointer cursor', () => {
    expect(ghostBtn.cursor).toBe('pointer')
  })

  it('has a border referencing var(--border-strong)', () => {
    expect(String(ghostBtn.border)).toContain('var(--border-strong)')
  })
})

// ---------------------------------------------------------------------------
// primaryBtn
// ---------------------------------------------------------------------------

describe('primaryBtn', () => {
  it('is a plain object (not a function)', () => {
    expect(typeof primaryBtn).toBe('object')
  })

  it('uses var(--accent) as the background', () => {
    expect(primaryBtn.background).toBe('var(--accent)')
  })

  it('has fontWeight 600', () => {
    expect(primaryBtn.fontWeight).toBe(600)
  })

  it('has a pointer cursor', () => {
    expect(primaryBtn.cursor).toBe('pointer')
  })

  it('has no border', () => {
    expect(primaryBtn.border).toBe('none')
  })
})

// ---------------------------------------------------------------------------
// modalInput
// ---------------------------------------------------------------------------

describe('modalInput', () => {
  it('is a plain object (not a function)', () => {
    expect(typeof modalInput).toBe('object')
  })

  it('has width 100%', () => {
    expect(modalInput.width).toBe('100%')
  })

  it('has outline: none', () => {
    expect(modalInput.outline).toBe('none')
  })

  it('uses var(--bg-2) as background', () => {
    expect(modalInput.background).toBe('var(--bg-2)')
  })
})
