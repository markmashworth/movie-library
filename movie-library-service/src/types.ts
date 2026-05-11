export interface Movie {
  id: number;
  title: string;
  year: number;
  rating: number;
  genres: string[];
}

export interface MovieInput {
  title: string;
  year: number;
  rating: number;
  genres: string[];
}

export interface ValidationFieldError {
  field: string;
  message: string;
}

export interface ListMoviesParams {
  q?: string;
  genre?: string | string[];
  min_rating?: number;
  year_min?: number;
  year_max?: number;
  sort?: SortOrder;
  limit?: number;
  offset?: number;
}

export type SortOrder =
  | 'rating_desc'
  | 'rating_asc'
  | 'year_desc'
  | 'year_asc'
  | 'title_asc';

export interface ListMoviesResult {
  data: Movie[];
  total: number;
  limit: number;
  offset: number;
}

export interface GenreStat {
  name: string;
  count: number;
}

export interface YearBucket {
  year: number;
  count: number;
  movies: Array<Pick<Movie, 'id' | 'title' | 'rating' | 'genres'>>;
}

export interface Stats {
  total: number;
  avg_rating: number;
  genre_count: number;
  min_year: number;
  max_year: number;
  top_genres: GenreStat[];
  by_year: YearBucket[];
}
