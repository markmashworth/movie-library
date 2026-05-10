import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_PATH = join(__dirname, 'data', 'movies.csv');
const MOVIES_API_URL = process.env.MOVIE_API_URL ?? 'http://localhost:8080/api/v1/movies';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((cell) => cell.trim() !== ''));
}

function recordsFromCsv(text) {
  const [headers, ...rows] = parseCsv(text);

  if (!headers) {
    return [];
  }

  return rows.map((row) => Object.fromEntries(
    headers.map((header, index) => [header, row[index] ?? '']),
  ));
}

function isBlank(value) {
  return value === undefined || value === null || value.trim() === '';
}

function movieIdentity(movie) {
  return [
    movie.title.trim().toLowerCase().replace(/\s+/g, ' '),
    movie.year,
    movie.rating,
  ].join('|');
}

function movieFromRecord(record, rowNumber) {
  const errors = [];

  if (isBlank(record.title)) {
    errors.push('title is required');
  }

  if (isBlank(record.year)) {
    errors.push('year is required');
  }

  if (isBlank(record.rating)) {
    errors.push('rating is required');
  }

  if (isBlank(record.genre)) {
    errors.push('genre is required');
  }

  const year = Number(record.year);
  const rating = Number(record.rating);

  if (!Number.isInteger(year)) {
    errors.push('year must be an integer');
  }

  if (!Number.isFinite(rating)) {
    errors.push('rating must be a number');
  }

  if (errors.length > 0) {
    return {
      ok: false,
      message: `Row ${rowNumber}: ${errors.join(', ')}`,
    };
  }

  return {
    ok: true,
    movie: {
      title: record.title.trim(),
      year,
      rating,
      genres: [record.genre.trim()],
    },
  };
}

function aggregateMovies(records) {
  const moviesByIdentity = new Map();
  const skippedRows = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const result = movieFromRecord(record, rowNumber);

    if (!result.ok) {
      skippedRows.push(result.message);
      return;
    }

    const key = movieIdentity(result.movie);
    const existing = moviesByIdentity.get(key);

    if (existing) {
      existing.genres = [...new Set([...existing.genres, ...result.movie.genres])].sort();
      return;
    }

    moviesByIdentity.set(key, result.movie);
  });

  return {
    movies: [...moviesByIdentity.values()].sort((a, b) => a.title.localeCompare(b.title)),
    skippedRows,
  };
}

async function postMovie(movie) {
  const response = await fetch(MOVIES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(movie),
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  return { response, body };
}

async function seedMovie(movie) {
  const { response, body } = await postMovie(movie);

  if (response.status === 201) {
    return { status: 'created' };
  }

  if (response.status === 409) {
    return { status: 'skipped', reason: 'already exists' };
  }

  return {
    status: 'failed',
    reason: body?.message ?? `${response.status} ${response.statusText}`,
  };
}

async function main() {
  const csv = await readFile(INPUT_PATH, 'utf8');
  const records = recordsFromCsv(csv);
  const { movies, skippedRows } = aggregateMovies(records);
  const summary = {
    created: 0,
    skipped: 0,
    failed: 0,
  };

  console.log(`Seeding ${movies.length} movies from ${INPUT_PATH}`);
  console.log(`Target API: ${MOVIES_API_URL}`);

  for (const warning of skippedRows) {
    console.warn(`Warning: skipped ${warning}`);
  }

  for (const movie of movies) {
    try {
      const result = await seedMovie(movie);

      if (result.status === 'created') {
        summary.created += 1;
        console.log(`Created: ${movie.title} (${movie.year})`);
      } else if (result.status === 'skipped') {
        summary.skipped += 1;
        console.log(`Skipped: ${movie.title} (${movie.year}) - ${result.reason}`);
      } else {
        summary.failed += 1;
        console.error(`Failed: ${movie.title} (${movie.year}) - ${result.reason}`);
        console.error(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      summary.failed += 1;
      console.error(`Failed: ${movie.title} (${movie.year}) - ${error.message}`);
    }
  }

  console.log(
    `Seed complete: ${summary.created} created, ${summary.skipped} skipped, ` +
      `${summary.failed} failed, ${skippedRows.length} invalid CSV rows.`,
  );

  if (summary.failed > 0 || skippedRows.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
