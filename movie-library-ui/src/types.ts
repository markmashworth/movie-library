// Shared TypeScript types mirroring the API data model.

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

export interface ListMoviesParams {
  q?: string;
  genre?: string[];
  min_rating?: number;
  year_min?: number;
  year_max?: number;
  sort?: 'rating_desc' | 'rating_asc' | 'year_desc' | 'year_asc' | 'title_asc';
  limit?: number;
  offset?: number;
}

export interface ListMoviesResponse {
  data: Movie[];
  total: number;
  limit: number;
  offset: number;
}

export interface GenreStat {
  name: string;
  count: number;
}

export interface YearBucketMovie {
  id: number;
  title: string;
  rating: number;
  genres: string[];
}

export interface YearBucket {
  year: number;
  count: number;
  movies: YearBucketMovie[];
}

export interface StatsResponse {
  total: number;
  avg_rating: number;
  genre_count: number;
  min_year: number;
  max_year: number;
  top_genres: GenreStat[];
  by_year: YearBucket[];
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  errors?: ValidationError[];
}

// Filters managed in client state (tech mode)
export interface Filters {
  genres: string[];
  minRating: number;
  yearMin: number | null;
  yearMax: number | null;
}
