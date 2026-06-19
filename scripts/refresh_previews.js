#!/usr/bin/env node
// Fetches TMDB Discover preview images for every source in database.js and
// writes collections/preview_posters.js. Run from the repo root with
// TMDB_API_KEY set in env. GitHub Actions runs this daily automatically.

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.TMDB_API_KEY;
if (!API_KEY) { console.error('TMDB_API_KEY env var is required'); process.exit(1); }

const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'collections', 'database.js'), 'utf8');
const dbMatch = dbSrc.match(/window\.NUVIO_DATABASE\s*=\s*(\[[\s\S]*?\]);\s*$/m);
if (!dbMatch) { console.error('Could not parse database.js'); process.exit(1); }
const database = JSON.parse(dbMatch[1]);

// camelCase filter key → TMDB API param name for movie discover
const MOVIE_FILTER_MAP = {
  year:                  'primary_release_year',
  withGenres:            'with_genres',
  withoutGenres:         'without_genres',
  voteCountGte:          'vote_count.gte',
  voteCountLte:          'vote_count.lte',
  voteAverageGte:        'vote_average.gte',
  voteAverageLte:        'vote_average.lte',
  withOriginalLanguage:  'with_original_language',
  withCast:              'with_cast',
  withCrew:              'with_crew',
  withPeople:            'with_people',
  withCompanies:         'with_companies',
  withKeywords:          'with_keywords',
  withoutKeywords:       'without_keywords',
  releaseDateGte:        'primary_release_date.gte',
  releaseDateLte:        'primary_release_date.lte',
  withReleaseType:       'with_release_type',
  withRuntimeGte:        'with_runtime.gte',
  withRuntimeLte:        'with_runtime.lte',
};

// TV discover uses different date/year param names
const TV_FILTER_MAP = {
  ...MOVIE_FILTER_MAP,
  year:           'first_air_date_year',
  releaseDateGte: 'first_air_date.gte',
  releaseDateLte: 'first_air_date.lte',
  withNetworks:   'with_networks',
};

async function fetchPosters(source, tileShape) {
  if (source.tmdbSourceType !== 'DISCOVER') return null;

  const isTV = (source.mediaType || '').toUpperCase() === 'TV_SHOW';
  const endpoint = isTV
    ? 'https://api.themoviedb.org/3/discover/tv'
    : 'https://api.themoviedb.org/3/discover/movie';
  const filterMap = isTV ? TV_FILTER_MAP : MOVIE_FILTER_MAP;

  const params = new URLSearchParams({
    api_key: API_KEY,
    page: '1',
    include_adult: 'false',
  });

  if (source.sortBy) params.set('sort_by', source.sortBy);

  for (const [key, val] of Object.entries(source.filters || {})) {
    const tmdbKey = filterMap[key];
    if (tmdbKey && val !== null && val !== undefined && val !== '') {
      params.set(tmdbKey, String(val));
    }
  }

  try {
    const res = await fetch(`${endpoint}?${params}`);
    if (!res.ok) {
      console.warn(`  TMDB ${res.status}: ${source.title}`);
      return null;
    }
    const data = await res.json();
    const results = (data.results || []).slice(0, 12);
    const isLandscape = (tileShape || '').toUpperCase() === 'LANDSCAPE';
    const paths = results
      .map(r => isLandscape ? r.backdrop_path : r.poster_path)
      .filter(Boolean);
    return paths.length ? paths : null;
  } catch (err) {
    console.warn(`  Error: ${source.title} — ${err.message}`);
    return null;
  }
}

async function main() {
  const output = {};
  let total = 0, fetched = 0, skipped = 0;

  for (const collection of database) {
    for (const folder of (collection.folders || [])) {
      for (const source of (folder.sources || [])) {
        if (source.tmdbSourceType !== 'DISCOVER') { skipped++; continue; }
        total++;
        const key = `${folder.id}::${source.title}`;
        if (output[key]) continue; // Deduplicate identical queries

        process.stdout.write(`[${total}] ${source.title}... `);
        const paths = await fetchPosters(source, folder.tileShape);

        if (paths) {
          output[key] = paths;
          console.log(`${paths.length} images`);
          fetched++;
        } else {
          console.log('no results');
        }

        // ~25 req/s — well inside TMDB's 40/10s limit
        await new Promise(r => setTimeout(r, 40));
      }
    }
  }

  output._generatedAt = new Date().toISOString();

  const outPath = path.join(__dirname, '..', 'collections', 'preview_posters.js');
  const js = `window.PREVIEW_POSTERS = ${JSON.stringify(output)};\n`;
  fs.writeFileSync(outPath, js, 'utf8');

  const kb = Math.round(js.length / 1024);
  console.log(`\nDone — ${fetched}/${total} Discover sources fetched, ${skipped} non-Discover skipped`);
  console.log(`Output: ${outPath} (${kb} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
