/**
 * In-memory persistence layer for the genre catalog.
 *
 * Data structures:
 *   genres   — string[]    : always-sorted source of truth; returned directly
 *                            by findAll() so callers pay no copy cost on reads.
 *   genreSet — Set<string> : mirror for O(1) membership checks.
 *
 * Operation complexities:
 *   findAll() — O(1) : return the sorted array reference
 *   has()     — O(1) : Set.has()
 *   insert()  — O(log n) binary search + O(n) splice to maintain sorted order
 *               (n = number of genres; expected to stay small in practice)
 */

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

class GenreRepository {
  /** Always-sorted array — the source of truth returned to callers. */
  private readonly genres: string[] = [];

  /** Mirror set for O(1) membership checks. */
  private readonly genreSet = new Set<string>();

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * Returns the sorted genre list as a readonly view. O(1) — no copy.
   */
  findAll(): readonly string[] {
    return this.genres;
  }

  /**
   * Returns true when the genre already exists in the catalog.
   * O(1) via Set.
   */
  has(genre: string): boolean {
    return this.genreSet.has(genre);
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Inserts a genre at its correct alphabetical position.
   * Assumes the caller has already checked for duplicates via has().
   * O(log n) binary search + O(n) splice.
   */
  insert(genre: string): void {
    const idx = this.sortedInsertIndex(genre);
    this.genres.splice(idx, 0, genre);
    this.genreSet.add(genre);
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Returns the index at which `value` should be inserted to keep the genres
   * array in ascending locale-aware order. Runs in O(log n).
   */
  private sortedInsertIndex(value: string): number {
    let lo = 0;
    let hi = this.genres.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.genres[mid]!.localeCompare(value) < 0) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }
}

// ---------------------------------------------------------------------------
// Default genres — seeded from scripts/movies.csv
// ---------------------------------------------------------------------------

const DEFAULT_GENRES = [
  'Action',
  'Animation',
  'Comedy',
  'Documentary',
  'Drama',
  'Fantasy',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
  'War',
  'Western',
];

// Singleton — one shared instance for the lifetime of the process.
export const genreRepository = new GenreRepository();

for (const genre of DEFAULT_GENRES) {
  genreRepository.insert(genre);
}
