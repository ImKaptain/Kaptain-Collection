/**
 * Kaptain's Mega Collection — Nuvio Setup Wizard
 * ----------------------------------------------
 * A guided modal that lets a visitor either:
 *   1) Push their picked collection straight into their Nuvio account
 *      (creating an account if they don't have one), or
 *   2) Take the safe hand-off route — download the file / copy the link —
 *      without sharing any login.
 *
 * Relies on globals from app.js (assembleFilteredDatabase, compileAndDownloadJSON,
 * showToast, window.KaptainExport) and window.NuvioPush from nuvio-push.js.
 */
(function () {
  const DEFAULT_PROFILE_NAME = "Kaptain's Collection";

  // Nuvio stores settings per device type; the user's TV is what we target.
  // Nuvio stores settings per device type. Write to both confirmed buckets so
  // the keys apply whether the user opens Nuvio on their TV or their phone.
  const SETTINGS_PLATFORMS = ['tv', 'mobile'];

  // Starter-guide addon suggestions (numb3rs-based, NO AI addons). Plain scraper
  // manifests with no API key — they resolve through Torbox Instant. Editable in
  // the UI: the user can toggle, remove, or add their own.
  const SUGGESTED_ADDONS = [
    { name: 'Torrentio', url: 'https://torrentio.strem.fun/manifest.json', recommended: true,
      note: 'Works with Torbox Instant, no key needed.' },
    { name: 'Comet', url: 'https://cometfortheweebs.midnightignite.me/manifest.json', recommended: false,
      note: 'Works with Torbox Instant, no key needed.' },
    { name: 'MediaFusion', url: 'https://mediafusion.elfhosted.com/manifest.json', recommended: false,
      note: 'A third scraper for extra coverage. Works with Torbox Instant, no key needed.' },
  ];

  // ---- Scraper addon manifest URL builders ----
  // Torrentio's URL format uses pipe-separated params in the path (not query string).
  // Comet encodes a JSON config object as base64 in its path.
  // Both work without an API key when TorBox is set as a Nuvio Connected Service.

  const COMET_INSTANCES = [
    { value: 'https://cometfortheweebs.midnightignite.me', label: 'Midnightignite (recommended)' },
    { value: 'https://comet.feels.legal', label: 'feels.legal' },
    { value: 'https://cometa.stremx.net', label: 'Cometa' },
  ];
  const RESOLUTION_KEYS = ['r2160p', 'r1440p', 'r1080p', 'r720p', 'r576p', 'r480p', 'r360p', 'r240p', 'unknown'];
  const RESOLUTION_LABELS = { r2160p: '4K', r1440p: '1440p', r1080p: '1080p', r720p: '720p', r576p: '576p', r480p: '480p', r360p: '360p', r240p: '240p', unknown: 'Unknown' };
  const TORRENTIO_QUALITY_MAP = { r2160p: '4k', r1080p: '1080p', r720p: '720p', r480p: '480p', unknown: 'unknown' };
  const SCRAPER_PRESETS = {
    safe:         { sortBy: 'qualitysize', maxResults: 5,  maxSize: 0,  cachedOnly: true,  removeTrash: true,  deduplicateStreams: true,  resolutions: ['r2160p', 'r1080p', 'r720p'] },
    quality:      { sortBy: 'qualitysize', maxResults: 10, maxSize: 0,  cachedOnly: true,  removeTrash: true,  deduplicateStreams: true,  resolutions: ['r2160p', 'r1440p', 'r1080p'] },
    lowBandwidth: { sortBy: 'qualitysize', maxResults: 5,  maxSize: 12, cachedOnly: true,  removeTrash: true,  deduplicateStreams: true,  resolutions: ['r1080p', 'r720p'] },
    maximum:      { sortBy: 'qualitysize', maxResults: 10, maxSize: 0,  cachedOnly: true,  removeTrash: true,  deduplicateStreams: true,  resolutions: ['r2160p', 'r1440p', 'r1080p', 'r720p', 'r576p', 'r480p', 'r360p', 'r240p', 'unknown'] },
    firehose:     { sortBy: 'qualitysize', maxResults: 0,  maxSize: 0,  cachedOnly: true,  removeTrash: false, deduplicateStreams: false, resolutions: ['r2160p', 'r1440p', 'r1080p', 'r720p', 'r576p', 'r480p', 'r360p', 'r240p', 'unknown'] },
    seeders:      { sortBy: 'seeders',     maxResults: 0,  maxSize: 0,  cachedOnly: true,  removeTrash: false, deduplicateStreams: false, resolutions: ['r2160p', 'r1440p', 'r1080p', 'r720p', 'r576p', 'r480p', 'r360p', 'r240p', 'unknown'] },
  };

  const PRESET_DESCRIPTIONS = {
    safe:         'A small, curated selection. Only cached results, trash filtered out, deduped. Best for newcomers who want a clean experience.',
    quality:      'Up to 10 results per tier, focused on 4K and 1080p. Cached only, no cams or screeners. A solid starting point for most setups.',
    lowBandwidth: '1080p and 720p only with a 12 GB file-size cap. Good for metered connections or smaller storage.',
    maximum:      'All resolutions, up to 10 per tier. Cached only, but no filtering beyond trash. More options, more choice.',
    firehose:     'Unlimited results across every resolution, no filtering, no dedup. Nuvio decides what plays. Maximum coverage.',
    seeders:      'Like Firehose, but sorted by seeder count instead of quality. Finds the most popular torrent for each title.',
  };

  // Whole, working answers to "how do I set up streaming", so a first-timer
  // never has to reason about scraper checkboxes, quality presets and a
  // resolution grid before they can get past this step. Each `config` is
  // merged over defaultScraperConfig(), so it only states what it changes.
  const SCRAPER_PRESET_CARDS = [
    {
      id: 'simple',
      icon: '🌱',
      title: 'Keep it simple',
      desc: 'Torrentio only, a short tidy list of results. Nothing to configure, works straight away.',
      config: (() => { const p = SCRAPER_PRESETS.safe; return {
        preset: 'safe', sortBy: p.sortBy, torrentio: true, comet: false, mediafusion: false,
        maxResults: p.maxResults, maxSize: p.maxSize, cachedOnly: p.cachedOnly,
        removeTrash: p.removeTrash, deduplicateStreams: p.deduplicateStreams, resolutions: [...p.resolutions],
      }; })(),
    },
    {
      id: 'recommended',
      icon: '⭐',
      accent: true,
      title: 'Recommended',
      desc: 'Torrentio and Comet together, focused on 4K and 1080p. More to choose from, still filtered.',
      config: (() => { const p = SCRAPER_PRESETS.quality; return {
        preset: 'quality', sortBy: p.sortBy, torrentio: true, comet: true, mediafusion: false,
        maxResults: p.maxResults, maxSize: p.maxSize, cachedOnly: p.cachedOnly,
        removeTrash: p.removeTrash, deduplicateStreams: p.deduplicateStreams, resolutions: [...p.resolutions],
      }; })(),
    },
    {
      id: 'custom',
      icon: '🎛️',
      custom: true,
      title: 'Let me pick',
      desc: 'The full panel — every scraper, quality preset, resolution and filter.',
    },
  ];

  function defaultScraperConfig() {
    const p = SCRAPER_PRESETS.seeders;
    return {
      preset: 'seeders', sortBy: p.sortBy, torrentio: true, comet: false, mediafusion: false,
      cometInstance: COMET_INSTANCES[0].value, customizeOpen: false,
      maxResults: p.maxResults, maxSize: p.maxSize, cachedOnly: p.cachedOnly,
      removeTrash: p.removeTrash, deduplicateStreams: p.deduplicateStreams,
      resolutions: [...p.resolutions],
    };
  }

  function initScraperConfig() {
    if (!state.scraperConfig) state.scraperConfig = defaultScraperConfig();
    return state.scraperConfig;
  }

  function buildCometManifestUrl(instanceUrl, cfg) {
    const base = String(instanceUrl || '').replace(/\/+$/, '');
    const selectedRes = new Set(cfg.resolutions || []);
    const resolutions = {};
    RESOLUTION_KEYS.forEach((k) => { resolutions[k] = selectedRes.has(k); });
    const config = {
      maxResultsPerResolution: Number(cfg.maxResults) || 0,
      maxSize: Number(cfg.maxSize) || 0,
      cachedOnly: !!cfg.cachedOnly,
      sortCachedUncachedTogether: false,
      removeTrash: !!cfg.removeTrash,
      resultFormat: ['all'],
      debridServices: [],
      enableTorrent: false,
      deduplicateStreams: !!cfg.deduplicateStreams,
      scrapeDebridAccountTorrents: true,
      debridStreamProxyPassword: '',
      languages: { required: [], allowed: [], exclude: [], preferred: [] },
      resolutions,
      options: { remove_ranks_under: -10000000000, allow_english_in_languages: false, remove_unknown_languages: false },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(config));
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return `${base}/${btoa(binary)}/manifest.json`;
  }

  function buildTorrentioManifestUrl(cfg) {
    const selected = new Set(cfg.resolutions || []);
    const excluded = [];
    Object.entries(TORRENTIO_QUALITY_MAP).forEach(([key, val]) => {
      if (!selected.has(key)) excluded.push(val);
    });
    if (cfg.removeTrash) {
      ['cam', 'scr', 'threed'].forEach((v) => { if (!excluded.includes(v)) excluded.push(v); });
    }
    const parts = [`sort=${cfg.sortBy || 'qualitysize'}`];
    if (excluded.length) parts.push(`qualityfilter=${excluded.join(',')}`);
    const size = Number(cfg.maxSize) || 0;
    if (size > 0) parts.push(`sizefilter=${size}`);
    parts.push('debridoptions=nodownloadlinks,nocatalog');
    return `https://torrentio.strem.fun/${parts.join('|')}/manifest.json`;
  }

  function applyPresetToForm(presetName) {
    const p = SCRAPER_PRESETS[presetName];
    if (!p) return;
    const cfg = initScraperConfig();
    cfg.preset = presetName; cfg.sortBy = p.sortBy;
    cfg.maxResults = p.maxResults; cfg.maxSize = p.maxSize;
    cfg.cachedOnly = p.cachedOnly; cfg.removeTrash = p.removeTrash;
    cfg.deduplicateStreams = p.deduplicateStreams; cfg.resolutions = [...p.resolutions];
    const maxR = el('wiz-scraper-maxresults'), maxS = el('wiz-scraper-maxsize');
    const cached = el('wiz-scraper-cached'), trash = el('wiz-scraper-trash'), dedupe = el('wiz-scraper-dedupe');
    if (maxR) maxR.value = cfg.maxResults;
    if (maxS) maxS.value = cfg.maxSize;
    if (cached) cached.checked = cfg.cachedOnly;
    if (trash) trash.checked = cfg.removeTrash;
    if (dedupe) dedupe.checked = cfg.deduplicateStreams;
    const selectedSet = new Set(cfg.resolutions);
    document.querySelectorAll('.wiz-scraper-res').forEach((cb) => { cb.checked = selectedSet.has(cb.value); });
  }

  // Metadata addons a collection needs in order to actually render rows. Nuvio
  // usually seeds these on a new profile, but we ensure them so a fresh user
  // never lands on empty rows. installAddons de-dupes, so this is a safe no-op
  // when they're already present.
  const METADATA_ADDONS = [
    { name: 'Cinemeta', url: 'https://v3-cinemeta.strem.io' },
  ];

  // The exact preset I want copied into AIO Metadata's import box. Stored
  // verbatim (not rebuilt via JSON.stringify) so what gets copied matches
  // byte-for-byte, including key order and the timestamp.
  const AIO_PRESET_JSON = `{
  "version": 1,
  "exportedAt": "2026-06-30T02:35:34.372Z",
  "catalogs": [
    {
      "id": "trakt.watchlist.movies",
      "type": "movie",
      "name": "Watchlist",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "displayType": "movie"
    },
    {
      "id": "trakt.watchlist.series",
      "type": "series",
      "name": "Watchlist",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "displayType": "series"
    },
    {
      "id": "trakt.recommendations.movies",
      "type": "movie",
      "name": "Recommendations",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "displayType": "movie"
    },
    {
      "id": "trakt.recommendations.shows",
      "type": "series",
      "name": "Recommendations",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "displayType": "series"
    },
    {
      "id": "trakt.upnext",
      "type": "series",
      "name": "Up Next",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "cacheTTL": 300,
      "displayType": "series"
    },
    {
      "id": "trakt.unwatched",
      "type": "series",
      "name": "Recently Aired",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "cacheTTL": 300,
      "displayType": "series"
    },
    {
      "id": "trakt.calendar",
      "type": "series",
      "name": "Airing Soon",
      "enabled": true,
      "showInHome": true,
      "source": "trakt",
      "cacheTTL": 300
    }
  ]
}`;

  // Applies the user's selected poster/ratings provider to an AIOMetadata config.
  // Called once per generated instance (not just a single "interceptor" instance)
  // since AIOMetadata addons are resolved independently -- whichever instance
  // answers a given meta request needs to carry these fields itself.
  function applyPosterConfig(config, posterService, rpdbTheme, rpdbKey, bttrUrl, topPosterKey) {
    if (!config.apiKeys) config.apiKeys = {};

    config.posterRatingProvider = 'none';
    config.usePosterProxy = false;
    config.enableRatingPostersForLibrary = false;

    if (posterService === 'bttr' && bttrUrl) {
      config.posterRatingProvider = 'custom';
      config.customPosterUrlPattern = bttrUrl;
      config.usePosterProxy = true;
      config.enableRatingPostersForLibrary = true;
    } else if (posterService === 'top' && topPosterKey) {
      config.posterRatingProvider = 'top';
      config.customPosterUrlPattern = 'https://api.top-posters.com/{top_key}/imdb/poster/{imdb_id}.jpg?lang={language_short}';
      config.apiKeys.topPoster = topPosterKey;
      config.usePosterProxy = true;
      config.enableRatingPostersForLibrary = true;
    } else if (posterService === 'rpdb') {
      config.posterRatingProvider = 'rpdb';
      config.apiKeys.rpdb = (rpdbTheme === 'custom') ? rpdbKey : rpdbTheme;
      config.usePosterProxy = true;
      config.enableRatingPostersForLibrary = true;
    }

    return config;
  }

  // ---- AIO Streams `formatter` config. AIO Streams ships 7 real built-in
  // formatter presets (confirmed live via its own config validation, which
  // lists the full id enum on a rejected value) -- submission is just
  // {id: <preset id>}, no template strings to maintain. Preview text below
  // is captured verbatim from real stream results rendered through each
  // preset for the same test movie (Shawshank Redemption, tt0111161), not
  // a hand-guessed mock. ----
  const FORMATTER_OPTIONS = [
    { id: 'tamtaro', label: 'Tamtaro (Stylized Compact)' },
    { id: 'prism', label: 'Prism (Rich & Colorful)' },
    { id: 'gdrive', label: 'GDrive Classic' },
    { id: 'lightgdrive', label: 'Light GDrive (Simplified)' },
    { id: 'minimalisticgdrive', label: 'Minimalist (Ultra Compact)' },
    { id: 'torrentio', label: 'Torrentio Classic (Raw Filename)' },
    { id: 'torbox', label: 'Torbox Style (Labeled Fields)' },
  ];

  const FORMATTER_PREVIEW_EXAMPLES = {
    tamtaro: {
      name: "   4K ‍‍⁽ᵖ²ᵖ⁾‍‍‍‍‍\n  〈Remux〉‍     ",
      description: "✎  The Shawshank R… (1994)\n▣  HEVC  ✦  DV \n♬  DTS-HD MA  ♯  5.1 \n◈  58.3 GB · 54.8 ᴹᵇᵖˢ ⇄ 75❦ \n⛉  Torrentio · FraMeSToR"
    },
    prism: {
      name: "🔥4K UHD",
      description: "🎬 The Shawshank Redemption (1994) \n🎥 BluRay REMUX 📺 DV 🎞️ HEVC \n🎧 DTS-HD MA 🔊 5.1 \n📦 58.3 GB 📊 54.8 Mbps 🌱 75 \n🏷️ FraMeSToR 📡 TorrentGalaxy \n⚠️ P2P 🔍Torrentio "
    },
    gdrive: {
      name: "[P2P] Torrentio 2160p",
      description: "🎥 BluRay REMUX 🎞️ HEVC 🏷️ FraMeSToR \n📺 DV 🎧 DTS-HD MA 🔊 5.1\n📦 58.3 GB (54.8 Mbps)👥 75 🔍 TorrentGalaxy\n📁 The.Shawshank.Redemption.1994.UHD.BluRay.2160p.DTS-HD.MA.5.1.DV.HEVC.HYBRID.REMUX-FraMeSToR.mkv"
    },
    lightgdrive: {
      name: "[P2P] Torrentio 2160p",
      description: "📁 The Shawshank Redemption (1994)\n🎥 BluRay REMUX 🎞️ HEVC 🏷️ FraMeSToR\n📺 DV 🎧 DTS-HD MA 🔊 5.1\n📦 58.3 GB 🔍 TorrentGalaxy"
    },
    minimalisticgdrive: {
      name: "✨ 4K\nBLURAY REMUX",
      description: "🔆 DV  🔊 DTS-HD MA\n📦 58.3 GB "
    },
    torrentio: {
      name: "[P2P] Torrentio 2160p\nDV",
      description: "The.Shawshank.Redemption.1994.UHD.BluRay.2160p.DTS-HD.MA.5.1.DV.HEVC.HYBRID.REMUX-FraMeSToR.mkv\n💾54.33 GiB 👤75 ⚙️TorrentGalaxy"
    },
    torbox: {
      name: "[P2P] Torrentio (2160p)",
      description: "Quality: BluRay REMUX\nName: The.Shawshank.Redemption.1994.UHD.BluRay.2160p.DTS-HD.MA.5.1.DV.HEVC.HYBRID.REMUX-FraMeSToR.mkv\nSize: 58.34 GB | Source: TorrentGalaxy \nLanguages: "
    }
  };

  // Some formatter preview strings (Tamtaro especially) include deliberate
  // leading/trailing padding meant for a wider card layout in Nuvio itself —
  // in our compact preview box it just reads as odd indentation, so trim
  // each line for display without touching the captured example data.
  function trimPreviewLines(text) {
    return String(text || '').split('\n').map((l) => l.trim()).join('\n');
  }

  function refreshFormatterPreview() {
    const nameEl = el('wiz-formatter-preview-name');
    const descEl = el('wiz-formatter-preview-desc');
    if (!nameEl || !descEl) return;
    const example = FORMATTER_PREVIEW_EXAMPLES[state.aioFormatter] || FORMATTER_PREVIEW_EXAMPLES.tamtaro;
    nameEl.textContent = trimPreviewLines(example.name);
    descEl.textContent = trimPreviewLines(example.description);
  }

  // ---- Poster preview URL builders (shared by the live preview and the
  // real submitted config, so they can never drift out of sync) ----
  function buildBttrUrl(imdbId, opts) {
    const o = opts || {};
    let modifiers = '';
    if (o.genre === false && o.rating === false) modifiers += 'n';
    else {
      if (o.genre === false) modifiers += 'r';
      if (o.rating === false) modifiers += 'g';
    }
    if (o.quality) modifiers += 'q';
    if (o.age) modifiers += 'a';
    const format = modifiers ? 'poster-' + modifiers : 'poster';
    let url = `https://btttr.cc/${format}/imdb/poster-default/${imdbId}.jpg`;
    const params = [];
    if (o.lang && o.lang !== 'en') params.push(`lang=${o.lang}`);
    if (o.source && o.source !== 'Average') params.push(`rs=${o.source}`);
    if (params.length) url += '?' + params.join('&');
    return url;
  }

  function buildRpdbUrl(imdbId, theme) {
    return `https://api.ratingposterdb.com/${theme || 't0-free-rpdb'}/imdb/poster-default/${imdbId}.jpg`;
  }

  function buildTopPosterUrl(imdbId, apiKey) {
    return `https://api.top-posters.com/${apiKey}/imdb/poster/${imdbId}.jpg`;
  }

  // ---- Live preview: today's most popular TMDB movie, cached once per day ----
  // Preview-only fallback key so the widget works before a visitor has typed
  // their own TMDB key — never used for the actual submitted AIO Metadata
  // config, which only ever uses the real tmdbKey argument in generateAIOStreamsBuild.
  const PREVIEW_FALLBACK_TMDB_KEY = '97e867f60ed428b711be2eab1e107a9d';
  let previewMovieCache = null; // in-memory copy of whatever's in localStorage
  let posterPreviewGeneration = 0; // guards against out-of-order preload completions

  async function getPreviewMovie(tmdbKey) {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = 'kaptain_preview_movie_' + today;
    if (previewMovieCache && previewMovieCache.date === today) return previewMovieCache.movie;
    try {
      const stored = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (stored) {
        previewMovieCache = { date: today, movie: stored };
        return stored;
      }
    } catch (e) { /* fall through to fetch */ }

    const effectiveKey = tmdbKey || PREVIEW_FALLBACK_TMDB_KEY;
    const popRes = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${encodeURIComponent(effectiveKey)}`);
    if (!popRes.ok) throw new Error('TMDB request failed (check your API key).');
    const popData = await popRes.json();
    const top = popData.results && popData.results[0];
    if (!top) throw new Error('TMDB returned no popular movies.');
    const extRes = await fetch(`https://api.themoviedb.org/3/movie/${top.id}/external_ids?api_key=${encodeURIComponent(effectiveKey)}`);
    const extData = extRes.ok ? await extRes.json() : {};
    const movie = { tmdbId: top.id, imdbId: extData.imdb_id || null, title: top.title };

    try {
      localStorage.setItem(cacheKey, JSON.stringify(movie));
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('kaptain_preview_movie_') && k !== cacheKey) localStorage.removeItem(k);
      });
    } catch (e) { /* non-fatal — just won't persist across reloads */ }
    previewMovieCache = { date: today, movie };
    return movie;
  }

  // Recomputes the preview <img src> from current state — call after any
  // relevant dropdown/toggle changes or once the preview movie is fetched.
  function refreshPosterPreview() {
    const img = el('wiz-poster-preview-img');
    const caption = el('wiz-poster-preview-caption');
    if (!img) return;
    const movie = previewMovieCache && previewMovieCache.movie;
    if (!movie) return; // getPreviewMovie() will call this again once it resolves
    const service = state.aioPosterService || 'rpdb';
    let url = null;
    if (service === 'rpdb' && movie.imdbId) {
      const theme = state.aioRpdbTheme === 'custom' ? (state.aioRpdbKey || 't0-free-rpdb') : (state.aioRpdbTheme || 't0-free-rpdb');
      url = buildRpdbUrl(movie.imdbId, theme);
    } else if (service === 'bttr' && movie.imdbId) {
      const template = buildBttrUrl('{imdb_id}', {
        quality: state.bttrQuality, genre: state.bttrGenre, rating: state.bttrRating,
        age: state.bttrAge, source: state.bttrSource, lang: state.bttrLanguage,
      });
      url = template.replace('{imdb_id}', movie.imdbId);
    } else if (service === 'top' && movie.imdbId && state.aioTopPosterKey) {
      url = buildTopPosterUrl(movie.imdbId, state.aioTopPosterKey);
    }
    if (url) {
      // Preload off-screen and only swap the visible <img> once the new one
      // has actually loaded — otherwise every setting change flashes the
      // poster blank while it re-fetches, which makes it hard to tell what
      // actually changed. A generation counter drops stale loads that finish
      // out of order (e.g. rapid toggling).
      posterPreviewGeneration += 1;
      const myGeneration = posterPreviewGeneration;
      const preload = new Image();
      preload.onload = () => {
        if (myGeneration !== posterPreviewGeneration) return;
        img.src = url;
        img.classList.add('is-loaded');
      };
      preload.onerror = () => {
        if (myGeneration !== posterPreviewGeneration) return;
        img.classList.remove('is-loaded');
      };
      preload.src = url;
      if (caption) caption.textContent = movie.title;
    } else {
      img.classList.remove('is-loaded');
      if (caption) caption.textContent = service === 'top' && !state.aioTopPosterKey
        ? 'Add a Top Posters key to preview'
        : 'Preview unavailable';
    }
  }

  // Kicks off (or re-kicks) the whole preview pipeline: fetch the movie if
  // needed, then render. Safe to call repeatedly — getPreviewMovie() is cache-guarded.
  async function updatePosterPreview() {
    const caption = el('wiz-poster-preview-caption');
    const tmdbKey = state.aioTmdbKey || '';
    try {
      if (caption && !(previewMovieCache && previewMovieCache.movie)) caption.textContent = 'Loading preview...';
      const movie = await getPreviewMovie(tmdbKey);
      if (!movie) return;
      refreshPosterPreview();
    } catch (e) {
      if (caption) caption.textContent = e.message || 'Could not load preview.';
    }
  }

  // Every step here is matched against real screenshots of the page, not
  // guessed. Positions are still my best read of those screenshots though,
  // not pixel-exact: it's a cross-origin iframe, so I can't see its real
  // scroll position or DOM. The tooltip's drag handle is the fallback when a
  // guess is off for someone's screen.
  // refImage.src is a real screenshot of this exact step; .pos is the
  // object-position used to crop/zoom the thumbnail toward the relevant
  // spot. The thumbnail is the actual accuracy fix, not the pointer, since
  // it's a real screenshot rather than a guess at where things are.
  const AIO_TUTORIAL_STEPS = [
    {
      state: 1,
      label: 'Step 1 of 11',
      title: 'Open Catalogs',
      // pos crops to sidebar with Catalogs visible but not yet selected.
      body: `In the left sidebar, scroll down until you see "Catalogs" -- it's the 7th item from the top. Click it. The main area will switch to Catalog Management.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/step1.png', pos: '15% 50%' },
    },
    {
      state: 2,
      label: 'Step 2 of 11',
      title: 'Choose "Start from Scratch"',
      body: `Click "Start from Scratch" on the right -- NOT the "Start with Defaults" option, even though it says Recommended. You need a blank slate for the Trakt preset.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step2.png', pos: '78% 50%' },
    },
    {
      state: 3,
      label: 'Step 3 of 11',
      title: 'Close the Catalog Builder popup',
      body: `A "Build Your Catalog" dialog appears -- click its X to close it. Skip this for now; the next step pastes a ready-made preset instead.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step3.png', pos: '90% 15%' },
    },
    {
      state: 4,
      label: 'Step 4 of 11',
      title: 'Click "Import Setup"',
      body: `In the toolbar at the top of the page, find the row of buttons starting with "Quick Add". The last button on the right is "Import Setup" -- click it.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step4.png', pos: '85% 22%' },
    },
    {
      state: 5,
      label: 'Step 5 of 11',
      title: 'Import the Trakt preset',
      body: `Click "Copy Preset to Clipboard" below, then paste into the "Paste JSON" tab of the Import dialog and click "Import". New catalogs should appear in the list.`,
      actions: ['copy-primary', 'next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step5.png', pos: '70% 72%' },
    },
    {
      state: 6,
      label: 'Step 6 of 11',
      title: 'Open Trakt Integration',
      body: `Your imported catalogs are now visible. Above them, find the row of small service icons. Click the Trakt icon -- it looks like a pink checkmark on a dark background. This opens the Trakt Integration panel.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step6.png', pos: '35% 30%' },
    },
    {
      state: 7,
      label: 'Step 7 of 11',
      title: 'Authorize with Trakt',
      body: `Click "Authorize Trakt" -- this opens a new browser tab to Trakt.tv. Log in and click "Allow". On the success page, click "Copy Token ID" to copy your token. Back here, paste it into the Token ID field and click "Connect Trakt". If the tab doesn't open, check that your browser isn't blocking popups from this site.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Trakt2.png', pos: '50% 45%' },
    },
    {
      state: 8,
      label: 'Step 8 of 11',
      title: 'Confirm connection and close',
      body: `The status should now show "Connected". Once you see that, click the X to close this panel. If it still says "Not connected", click "Authorize Trakt" again.`,
      actions: ['next'],
      // Step8.png should show the Trakt Integration panel in the connected/green state.
      refImage: { src: 'assets/aio-tutorial-refs/Trakt3.png', pos: '90% 35%' },
    },
    {
      state: 9,
      label: 'Step 9 of 11',
      title: 'Save your configuration',
      body: `In the left sidebar, click "Configuration". On the page that appears, click "Save Configuration". This is what generates your unique manifest link.`,
      actions: ['next'],
      refImage: { src: 'assets/aio-tutorial-refs/Step9.png', pos: '80% 75%' },
    },
    {
      state: 10,
      label: 'Step 10 of 11',
      title: 'Set a password',
      body: `A dialog asks for a password and confirmation. Choose something you'll remember -- you'll need this to edit your AIO Metadata setup later. Save it somewhere safe, then click Save.`,
      actions: ['next'],
      // Step10.png should show the Save Configuration password dialog.
      refImage: { src: 'assets/aio-tutorial-refs/password1.png', pos: '50% 50%' },
    },
    {
      state: 11,
      label: 'Step 11 of 11',
      title: 'Copy your Install URL',
      body: `Below the Configuration settings, find "Your UUID" and "Install URL". Copy the Install URL -- that's your manifest link. Also save the UUID somewhere safe; you'll need it to edit this setup later. Then close this window and paste the URL into the "AIO Metadata manifest URL" field in the wizard.`,
      actions: ['done'],
      refImage: { src: 'assets/aio-tutorial-refs/password2.png', pos: '50% 65%' },
    },
  ];

  let aioTutorialIndex = 0;

  // Torbox API keys are UUIDs. We can't ping Torbox from a static page (their
  // API blocks cross-site browser calls), so this is a shape check — it catches
  // typos / partial pastes, and the write itself is verified against Nuvio.
  const TORBOX_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isTorboxKeyShape(k) { return TORBOX_KEY_RE.test(String(k || '').trim()); }

  // Many addon sites hand out a "stremio://" one-click-install link (their
  // "copy install URL" button) rather than a plain fetchable "https://" one -
  // both point at the exact same manifest, "stremio://" is just a URI scheme
  // registered to open the Stremio/Nuvio app directly. Normalize it so a
  // visitor can paste whichever one they copied without knowing the difference.
  function normalizeAddonUrlScheme(url) {
    const trimmed = String(url || '').trim();
    return trimmed.replace(/^stremio:\/\//i, 'https://');
  }

  // Lightweight liveness check for a custom manifest URL before we let it into
  // the push. Many manifest servers don't send CORS headers for browser fetches,
  // so a thrown/opaque error here doesn't prove the addon is dead — only a real
  // non-2xx HTTP response does. ok:false = confirmed bad (hard block). ok:null =
  // couldn't verify (soft warn, same double-tap-to-override UX as the Torbox key).
  async function checkManifestAlive(url) {
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { ok: false, reason: `That manifest URL returned HTTP ${res.status}. Double-check the link.` };
      return { ok: true };
    } catch (e) {
      return { ok: null, reason: `Couldn't verify that manifest link (could just be a CORS-blocked or slow server). Tap "Add Addon" again to add it anyway.` };
    }
  }

  // ----- BINGECAT "FOR YOU" (alternative to Trakt/AIO Metadata) -----
  // Each Bingecat installation is its own addon with a per-user id baked in
  // (e.g. "com.aicat.<uuid>.nuvio.<suffix>") - confirmed against a real,
  // live-fetched manifest.json. Its catalogs are named consistently across
  // installations though, so we can reliably tell them apart by name: skip
  // the two "AI-Assisted Search" catalogs (isSearch:true, not a
  // recommendation list), then match the rest by name.
  const BINGECAT_FOLDER_DEFS = [
    { key: 'ai-recs', id: 'folder-bingecat-ai-recs', title: 'AI Recommendations', hideTitle: false, focusGifEnabled: false,
      matchesName: (n) => n === 'ai recommendations' },
    { key: 'because-watched', id: 'folder-bingecat-because-watched', title: 'Because You Watched', hideTitle: false, focusGifEnabled: false,
      matchesName: (n) => n.indexOf('because you watched') === 0 },
    { key: 'latest', id: 'folder-bingecat-latest', title: 'Latest For You', hideTitle: false, focusGifEnabled: false,
      matchesName: (n) => n.indexOf('latest') === 0 },
    { key: 'list', id: 'folder-bingecat-list', title: 'List For You', hideTitle: true, focusGifEnabled: true,
      matchesName: (n) => n === 'list for you' },
  ];

  function matchBingecatCatalogKey(name) {
    const n = String(name || '').trim().toLowerCase();
    const def = BINGECAT_FOLDER_DEFS.find((d) => d.matchesName(n));
    return def ? def.key : null;
  }

  // Fetches a visitor-pasted Bingecat addon manifest and matches its catalogs
  // against the 4 known "For You" sections. Returns
  // {addonId, foldersByKey, warnings} on success, {error} on failure.
  async function fetchBingecatManifest(url) {
    let manifest;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      manifest = await res.json();
    } catch (e) {
      return { error: "Couldn't read your Bingecat setup. Make sure it's the manifest.json link, not the configure page." };
    }
    const addonId = manifest && manifest.id;
    if (!addonId || !Array.isArray(manifest.catalogs)) {
      return { error: 'That URL did not look like a valid addon manifest.' };
    }
    const foldersByKey = {};
    manifest.catalogs.forEach((c) => {
      if (!c || c.isSearch) return; // Bingecat's built-in search catalogs, not a recommendation list
      const key = matchBingecatCatalogKey(c.name);
      if (!key) return;
      if (!foldersByKey[key]) foldersByKey[key] = {};
      if (c.type === 'movie' && !foldersByKey[key].movieCatalogId) foldersByKey[key].movieCatalogId = c.id;
      if (c.type === 'series' && !foldersByKey[key].seriesCatalogId) foldersByKey[key].seriesCatalogId = c.id;
    });
    if (Object.keys(foldersByKey).length === 0) {
      return { error: "That URL didn't contain any recognizable AI recommendation lists." };
    }
    const warnings = [];
    BINGECAT_FOLDER_DEFS.forEach((def) => {
      const f = foldersByKey[def.key];
      if (!f) return;
      if (!f.movieCatalogId) warnings.push(`"${def.title}" only has a series list (no movies) - it'll still work, series-only.`);
      if (!f.seriesCatalogId) warnings.push(`"${def.title}" only has a movies list (no series) - it'll still work, movies-only.`);
    });
    return { addonId, foldersByKey, warnings };
  }

  // Turns a fetchBingecatManifest() success result into a flat array of
  // Nuvio source objects (movie+series pair per matched key), to be merged
  // into the shared "For You" folder's own sources alongside whatever other
  // providers are also selected. No folder wrapping - the target is always
  // folder-25429024's existing id/artwork, never a synthetic folder.
  function buildBingecatSources(matchResult) {
    const addonId = matchResult.addonId;
    const foldersByKey = matchResult.foldersByKey || {};
    const sources = [];
    BINGECAT_FOLDER_DEFS.forEach((def) => {
      const f = foldersByKey[def.key];
      if (!f) return;
      if (f.movieCatalogId) sources.push({ type: 'movie', genre: '', addonId: addonId, provider: 'addon', catalogId: f.movieCatalogId });
      if (f.seriesCatalogId) sources.push({ type: 'series', genre: '', addonId: addonId, provider: 'addon', catalogId: f.seriesCatalogId });
    });
    return sources;
  }

  // Ids of the old (pre-multi-select) synthetic Bingecat folders, kept only
  // so applyForYouSources can strip any leftovers from a profile that was
  // pushed before this change - Bingecat no longer builds separate folders.
  const BINGECAT_LEGACY_FOLDER_IDS = new Set(BINGECAT_FOLDER_DEFS.map((d) => d.id));

  // Races the known AIO Metadata hosts and returns whichever answers first
  // (falls back to the primary host if all are slow/unreachable). Shared by
  // Native mode's renderForYou (the manual instance picker) and
  // confirmForYouSetup() (the "auto" fallback) below.
  async function checkAioMetadataInstances() {
    const instances = [
      'https://aiometadata.viren070.me/',
      'https://aiometadatafortheweebs.midnightignite.me/',
      'https://aiometadata.elfhosted.com/'
    ];
    try {
      return await Promise.any(instances.map(async (url) => {
        const res = await fetch(url + 'manifest.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Not ok');
        return url;
      }));
    } catch (e) {
      return 'https://aiometadata.viren070.me/';
    }
  }

  // ----- MDBLIST "FOR YOU" (Recommended/Trending/Similar/Rising/Up Next via
  // AIO Metadata, plus optional Syncribullet watch-sync in Native mode) -----
  // Unlike Bingecat, AIO Metadata's manifest always self-reports id
  // "aio-metadata" no matter what's linked to it (confirmed live) - the exact
  // same convention Trakt's placeholder already relies on. That means MDBList
  // needs none of Bingecat's per-user manifest-fetch-and-match machinery:
  // catalog ids are static and known in advance (confirmed against a real
  // MDBList-linked AIO Metadata manifest).
  const MDBLIST_FOR_YOU_SOURCES = [
    { type: 'all',    catalogId: 'mdblist.recommended.recommended' }, // Recommended For You
    { type: 'all',    catalogId: 'mdblist.recommended.trending'    }, // Trending In Your Genres
    { type: 'all',    catalogId: 'mdblist.recommended.similar'     }, // Popular Among Similar Users
    { type: 'all',    catalogId: 'mdblist.recommended.rising'      }, // Rising
    { type: 'series', catalogId: 'mdblist.upnext'                  }, // MDBList Up Next
  ];

  // Trakt's 7 catalog ids, in the same {type, catalogId} shape as
  // MDBLIST_FOR_YOU_SOURCES above (matches database.js's hardcoded default
  // "For You" folder / AIO_PRESET_JSON's 7 Trakt catalog descriptors).
  // Needed because once other providers can be combined alongside Trakt,
  // "just leave the folder's default sources untouched" (the old strategy)
  // no longer works - Trakt's contribution has to be built explicitly too,
  // exactly like Bingecat's and MDBList's.
  const TRAKT_FOR_YOU_SOURCES = [
    { type: 'movie',  catalogId: 'trakt.recommendations.movies' },
    { type: 'series', catalogId: 'trakt.recommendations.shows'  },
    { type: 'series', catalogId: 'trakt.upnext'                 },
    { type: 'series', catalogId: 'trakt.unwatched'              },
    { type: 'series', catalogId: 'trakt.calendar'                },
    { type: 'movie',  catalogId: 'trakt.watchlist.movies'        },
    { type: 'series', catalogId: 'trakt.watchlist.series'        },
  ];

  // AIO Metadata's own catalog-descriptor shape for the same 5 MDBList
  // catalogs (mirrors AIO_PRESET_JSON's per-entry shape for Trakt). Needed
  // because generateAIOStreamsBuild's per-chunk config builder filters a
  // catalog-descriptor array by id before POSTing it — filtering against
  // AIO_PRESET_JSON's Trakt-only array (the bug this fixes) always produced
  // an empty result for MDBList's ids, so the instance was saved with zero
  // catalogs declared even though apiKeys.mdblist was set correctly.
  const MDBLIST_CATALOG_TEMPLATE = [
    { id: 'mdblist.recommended.recommended', type: 'all',    name: 'Recommended For You',        enabled: true, showInHome: true, source: 'mdblist' },
    { id: 'mdblist.recommended.trending',    type: 'all',    name: 'Trending In Your Genres',     enabled: true, showInHome: true, source: 'mdblist' },
    { id: 'mdblist.recommended.similar',     type: 'all',    name: 'Popular Among Similar Users', enabled: true, showInHome: true, source: 'mdblist' },
    { id: 'mdblist.recommended.rising',      type: 'all',    name: 'Rising',                      enabled: true, showInHome: true, source: 'mdblist' },
    { id: 'mdblist.upnext',                  type: 'series', name: 'MDBList Up Next',             enabled: true, showInHome: true, source: 'mdblist' },
  ];

  // Trakt's and MDBList's catalog names (from AIO_PRESET_JSON /
  // MDBLIST_CATALOG_TEMPLATE above) are generic on their own - "Recommendations",
  // "Up Next", "Watchlist" - which reads fine when only one provider is in
  // the folder, but two providers can genuinely produce two rows with near-
  // identical names once combined. Both templates already carry a `source`
  // field, so prefix by that when (and only when) more than one "For You"
  // provider is actually checked - a solo-Trakt visitor's folder still looks
  // exactly like it always has. Bingecat's own catalog names come from its
  // own manifest (not something this config controls) and already read as
  // distinctly Bingecat-branded ("AI Recommendations" etc.), so they're left
  // alone here.
  const FOR_YOU_SOURCE_LABELS = { trakt: 'Trakt', mdblist: 'MDBList' };
  function labelForYouCatalogNames(catalogs) {
    const activeCount = ['trakt', 'bingecat', 'mdblist'].filter(isForYouProviderOn).length;
    if (activeCount < 2) return catalogs;
    return (catalogs || []).map((c) => {
      const label = c && FOR_YOU_SOURCE_LABELS[c.source];
      if (!label || !c.name || c.name.indexOf(label) === 0) return c; // no known source, or already labeled
      return { ...c, name: `${label}: ${c.name}` };
    });
  }

  // Shared swap: builds the UNION of whichever "For You" providers are
  // currently checked into folder-25429024's own sources (folder id/artwork
  // untouched - no separate folders, ever). Idempotent - always strips any
  // leftover folder-bingecat-* ids first (migration safety for profiles
  // pushed before this change, or repeated calls on the same collections
  // reference within one build), and always fully replaces the folder's
  // sources rather than appending, so calling this twice is safe. If nothing
  // is checked (or nothing successfully fetched yet), leaves the folder's
  // current sources untouched - in practice unreachable, since the UI
  // requires at least one provider to be checked before this ever runs.
  function applyForYouSources(collections) {
    (collections || []).forEach((cat) => {
      if (!cat || !Array.isArray(cat.folders)) return;
      cat.folders = cat.folders.filter((f) => !f || !BINGECAT_LEGACY_FOLDER_IDS.has(f.id));
    });
    const discover = (collections || []).find((c) => c && c.id === 'collection-UGED6TEZ');
    if (!discover || !Array.isArray(discover.folders)) return collections;
    const folder = discover.folders.find((f) => f && f.id === 'folder-25429024');
    if (!folder) return collections; // "For You" not selected - nothing to do

    const merged = [];
    if (isForYouProviderOn('trakt')) {
      merged.push(...TRAKT_FOR_YOU_SOURCES.map((s) => ({ type: s.type, genre: '', addonId: 'aio-metadata', provider: 'addon', catalogId: s.catalogId })));
    }
    if (isForYouProviderOn('mdblist')) {
      merged.push(...MDBLIST_FOR_YOU_SOURCES.map((s) => ({ type: s.type, genre: '', addonId: 'aio-metadata', provider: 'addon', catalogId: s.catalogId })));
    }
    if (isForYouProviderOn('bingecat') && state.bingecatSources && state.bingecatSources.length) {
      merged.push(...state.bingecatSources);
    }
    if (!merged.length) return collections;

    folder.sources = merged;
    folder.catalogSources = merged.map((s) => ({ type: s.type, addonId: s.addonId, catalogId: s.catalogId }));
    return collections;
  }

  // Native-mode orchestrator: provisions a single shared AIO Metadata
  // instance when Trakt and/or MDBList are checked (never two separate
  // instances - both self-report the same addon id "aio-metadata" regardless
  // of host/config, so two installed instances sharing that id is an
  // unconfirmed/risky configuration in Native Mode, where the folder's
  // addonId is never rewritten to a real unique id), installs Bingecat's own
  // addon and/or Syncribullet alongside it in one call, merges every checked
  // provider's sources into "For You", and pushes once.
  async function confirmForYouSetup() {
    try {
      state.pushingLabel = 'Setting up "For You"...';
      go('pushing');
      const addonsToInstall = [];

      if (isForYouProviderOn('trakt') || isForYouProviderOn('mdblist')) {
        // If Trakt was authorized this session, its token only means
        // anything on the exact host that minted it - always reuse that
        // host rather than re-detecting "auto" independently here (see the
        // comment at state._traktAuthHost's write site). Only falls back to
        // fresh detection when Trakt isn't in play (MDBList-only) or the
        // visitor never actually clicked "Authorize Trakt".
        const instanceSelect = el('wiz-aio-instance');
        let baseUrl = (isForYouProviderOn('trakt') && state._traktAuthHost)
          || (instanceSelect && instanceSelect.value)
          || 'auto';
        if (baseUrl === 'auto') baseUrl = await checkAioMetadataInstances();

        const aioConfig = JSON.parse(AIO_PRESET_JSON);
        // Union-filter: never branch by a single provider "kind" - trakt.*
        // and mdblist.* id namespaces never collide, so concatenating both
        // descriptor templates and filtering down to whichever ids are
        // actually wanted covers trakt-only, mdblist-only, and combined
        // selections with one code path.
        const wantedIds = [
          ...(isForYouProviderOn('trakt') ? TRAKT_FOR_YOU_SOURCES.map((s) => s.catalogId) : []),
          ...(isForYouProviderOn('mdblist') ? MDBLIST_FOR_YOU_SOURCES.map((s) => s.catalogId) : []),
        ];
        const unionTemplate = [...JSON.parse(AIO_PRESET_JSON).catalogs, ...MDBLIST_CATALOG_TEMPLATE];
        aioConfig.catalogs = labelForYouCatalogNames(unionTemplate.filter((c) => wantedIds.includes(c.id)));
        if (!aioConfig.apiKeys) aioConfig.apiKeys = {};
        aioConfig.hideUnreleasedDigital = true;
        aioConfig.hideUnreleasedShows = true;
        if (isForYouProviderOn('trakt') && state.aioTraktToken) aioConfig.apiKeys.traktTokenId = state.aioTraktToken;
        if (isForYouProviderOn('mdblist') && state.forYouMdblistKey) {
          aioConfig.apiKeys.mdblist = state.forYouMdblistKey;
          aioConfig.mdblistWatchTracking = true;
        }
        if (state.tmdbKey) aioConfig.apiKeys.tmdb = state.tmdbKey;

        const saveRes = await fetch(baseUrl + 'api/config/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: aioConfig, password: 'kaptain-collection-auto' })
        });
        const saveData = await saveRes.json();
        if (!saveData.success || !saveData.installUrl) {
          throw new Error('AIO Metadata did not accept your "For You" configuration. Please try again.');
        }
        state.aioManifestUrl = saveData.installUrl;
        addonsToInstall.push({ name: 'AIO Metadata', url: saveData.installUrl });
      }

      if (isForYouProviderOn('bingecat') && state.bingecatManifestUrl) {
        addonsToInstall.push({ name: 'Bingecat', url: state.bingecatManifestUrl });
      }
      if (isForYouProviderOn('mdblist') && state.syncribulletManifestUrl) {
        addonsToInstall.push({ name: 'Syncribullet', url: state.syncribulletManifestUrl });
      }

      if (addonsToInstall.length) {
        await window.NuvioPush.installAddons(state.token, state.targetProfileId, addonsToInstall);
      }

      const collections = assembleFilteredDatabase(shouldOptimizeExport());
      applyForYouSources(collections);
      ensureCollectionDefaults(collections);
      await window.NuvioPush.pushCollections(state.token, state.targetProfileId, collections);

      if (isForYouProviderOn('trakt')) state.traktApplied = true;
      if (isForYouProviderOn('bingecat')) state.bingecatApplied = true;
      if (isForYouProviderOn('mdblist')) state.mdblistForYouApplied = true;
      goToStreaming();
    } catch (err) {
      state.errorMsg = (err && err.message) || String(err);
      go('error');
    }
  }

  function showMdblistError(msg) {
    const box = el('wiz-mdblist-error');
    if (box) { box.textContent = msg; box.style.display = 'block'; }
  }

  // Shared markup for the MDBList sub-flow. Native mode needs both the
  // MDBList key AND a pasted Syncribullet URL (AIO Metadata alone can't sync
  // watch history for anything outside "For You" itself); AIO mode only
  // needs the key, since its shared AIO-Streams-proxied instance already
  // covers the whole collection.
  function renderMdblistSubFlowHtml(opts) {
    const includeSyncribullet = !!(opts && opts.includeSyncribullet);
    const syncribulletBlock = includeSyncribullet ? `
      <p class="wiz-note" style="margin-top:14px;">Also set up <a href="https://56bca7d190fc-syncribullet.baby-beamup.club/" target="_blank" rel="noopener" class="wiz-link">Syncribullet</a> - a separate site you configure yourself, no login needed here. Paste your MDBList key there too, then copy the resulting addon manifest URL back.</p>
      <label class="wiz-label">Syncribullet Manifest URL
        <input type="text" id="wiz-syncribullet-url" class="wiz-input" placeholder="https://.../manifest.json" value="${escapeAttr(state.syncribulletManifestUrl || '')}" autocomplete="off" spellcheck="false" style="margin-bottom:10px;">
      </label>
      <button type="button" class="wiz-secondary" id="wiz-syncribullet-add"><span>Add Syncribullet</span></button>
      <div id="wiz-syncribullet-status" style="display:none; margin-top:12px; padding:12px; background:rgba(0,0,0,0.2); border-radius:8px;"></div>
    ` : '';
    return `
      <div id="wiz-mdblist-flow">
        <p class="wiz-note">Paste your MDBList API key (from mdblist.com) below to power your "For You" lists with MDBList's recommendations.</p>
        <label class="wiz-label">MDBList API Key
          <input type="text" id="wiz-mdblist-key" class="wiz-input" placeholder="Enter your MDBList API key..." value="${escapeAttr(state.forYouMdblistKey || '')}" autocomplete="off" spellcheck="false" style="margin-bottom:10px;">
        </label>
        ${syncribulletBlock}
        <div class="wiz-error" id="wiz-mdblist-error" style="display:none; margin-top:12px;"></div>
      </div>`;
  }

  // Wires the MDBList key input (shared by both modes) plus, when present,
  // the Syncribullet URL paste + its own soft-verify Add button (mirrors
  // wireBingecatAddButton's checkManifestAlive-based pattern).
  function wireMdblistSubFlow(includeSyncribullet) {
    const keyInput = el('wiz-mdblist-key');
    if (keyInput) keyInput.addEventListener('input', () => { state.forYouMdblistKey = keyInput.value.trim(); });
    if (!includeSyncribullet) return;
    const btn = el('wiz-syncribullet-add');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const urlInput = el('wiz-syncribullet-url');
      const url = normalizeAddonUrlScheme(urlInput && urlInput.value);
      const statusEl = el('wiz-syncribullet-status');
      if (!url) return showMdblistError('Paste your Syncribullet manifest URL first.');
      if (url !== state.syncribulletManifestUrl) state._syncribulletUrlVerified = false;
      state.syncribulletManifestUrl = url;
      btn.disabled = true;
      if (statusEl) { statusEl.style.display = 'block'; statusEl.innerHTML = '<span style="color:#2196f3;">Checking your Syncribullet setup...</span>'; }
      const alive = await checkManifestAlive(url);
      btn.disabled = false;
      if (alive.ok === false) {
        if (statusEl) statusEl.style.display = 'none';
        return showMdblistError(`That URL doesn't look right: ${alive.reason}`);
      }
      if (alive.ok === null && state._lastSyncribulletUrlWarned !== url) {
        state._lastSyncribulletUrlWarned = url;
        if (statusEl) statusEl.style.display = 'none';
        return showMdblistError('Couldn\'t verify that URL. It may still work; tap "Add Syncribullet" again to use it anyway.');
      }
      state._syncribulletUrlVerified = true;
      if (statusEl) { statusEl.style.display = 'block'; statusEl.innerHTML = '<span style="color:#4caf50;">✓ Syncribullet added.</span>'; }
    });
  }

  function showBingecatError(msg) {
    const box = el('wiz-bingecat-error');
    if (box) { box.textContent = msg; box.style.display = 'block'; }
  }

  // Shared checkbox wiring for both renderNativeForYouChoose (Native) and
  // renderAioForYouChoose (AIO) - true multi-select, not mutually exclusive:
  // each box flips its own membership in state.forYouProviders independently.
  function wireForYouProviderToggle(panel) {
    panel.querySelectorAll('[data-foryou-provider]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const key = cb.getAttribute('data-foryou-provider');
        state.forYouProviders[key] = cb.checked;
        render();
      });
    });
  }

  // Fixed walk order for the one-provider-at-a-time "For You" sub-flow,
  // shared by both AIO and Native modes - only the checked ones are visited.
  function forYouProviderOrder() {
    return ['trakt', 'bingecat', 'mdblist'].filter(isForYouProviderOn);
  }

  // AIO mode's "For You" sub-flow is: choose -> [trakt] -> [bingecat] ->
  // [mdblist] -> metadata. Total step count and current position are
  // recomputed live off state.forYouProviders so the "Step X of Y" line
  // stays accurate as checkboxes change.
  function aioForYouStepCount() { return 2 + forYouProviderOrder().length; }
  function aioForYouStepIndex(step) {
    if (step === 'choose') return 1;
    if (step === 'metadata') return aioForYouStepCount();
    const idx = forYouProviderOrder().indexOf(step);
    return idx >= 0 ? idx + 2 : 1;
  }
  function nextAioForYouStep(current) {
    const order = forYouProviderOrder();
    if (current === 'choose') return order.length ? order[0] : 'metadata';
    const idx = order.indexOf(current);
    return (idx >= 0 && idx < order.length - 1) ? order[idx + 1] : 'metadata';
  }
  function prevAioForYouStep(current) {
    const order = forYouProviderOrder();
    if (current === 'metadata') return order.length ? order[order.length - 1] : 'choose';
    const idx = order.indexOf(current);
    return idx > 0 ? order[idx - 1] : 'choose';
  }
  function forYouStepCounterHtml(step) {
    // Without the "For You" folder the sub-flow collapses to the single
    // metadata-keys screen, so a "step N of N" readout is just noise.
    if (!hasForYouFolder()) return '';
    return `<div class="wiz-note" style="margin-bottom:10px; opacity:0.7;">Step ${aioForYouStepIndex(step)} of ${aioForYouStepCount()}</div>`;
  }

  // Native mode's sub-flow adds one more possible stop: an "instance"
  // screen, shown only when Trakt or MDBList is checked (they share one
  // AIO Metadata instance, so it's asked once, not per-provider).
  function nativeForYouNeedsInstanceStep() { return isForYouProviderOn('trakt') || isForYouProviderOn('mdblist'); }
  function nativeForYouStepCount() { return 1 + (nativeForYouNeedsInstanceStep() ? 1 : 0) + forYouProviderOrder().length; }
  function nativeForYouStepIndex(step) {
    if (step === 'choose') return 1;
    if (step === 'instance') return 2;
    const base = 1 + (nativeForYouNeedsInstanceStep() ? 1 : 0);
    const idx = forYouProviderOrder().indexOf(step);
    return idx >= 0 ? base + idx + 1 : 1;
  }
  function nextNativeForYouStep(current) {
    const order = forYouProviderOrder();
    if (current === 'choose') {
      if (nativeForYouNeedsInstanceStep()) return 'instance';
      return order.length ? order[0] : null;
    }
    if (current === 'instance') return order.length ? order[0] : null;
    const idx = order.indexOf(current);
    return (idx >= 0 && idx < order.length - 1) ? order[idx + 1] : null;
  }
  function prevNativeForYouStep(current) {
    const order = forYouProviderOrder();
    if (current === 'instance') return 'choose';
    const idx = order.indexOf(current);
    if (idx > 0) return order[idx - 1];
    if (idx === 0) return nativeForYouNeedsInstanceStep() ? 'instance' : 'choose';
    return 'choose';
  }
  function nativeForYouStepCounterHtml(step) {
    const total = nativeForYouStepCount();
    if (total <= 1) return '';
    return `<div class="wiz-note" style="margin-bottom:10px; opacity:0.7;">Step ${nativeForYouStepIndex(step)} of ${total}</div>`;
  }

  // Shared markup for the "paste your Bingecat URL" sub-flow, used by both
  // Native and AIO's own Bingecat screens. This is an add/verify-only block -
  // "Add Bingecat" just fetches+matches the manifest and caches
  // state.bingecatSources; the actual install+push happens later, from the
  // one shared "Save & Continue"/"Continue" button each caller renders.
  function renderBingecatSubFlowHtml() {
    const match = state.bingecatMatch;
    const foundBlock = match ? `
      <div class="wiz-note" style="margin-top:12px;">
        <strong>Found in your Bingecat setup:</strong>
        <ul style="margin:8px 0 0 18px; padding:0;">
          ${BINGECAT_FOLDER_DEFS.map((def) => {
            const f = match.foldersByKey[def.key];
            if (!f) return `<li style="opacity:0.6;">${escapeHtml(def.title)} - not found</li>`;
            const parts = [];
            if (f.movieCatalogId) parts.push('movies');
            if (f.seriesCatalogId) parts.push('series');
            return `<li>${escapeHtml(def.title)} - ${parts.join(' + ')}</li>`;
          }).join('')}
        </ul>
        ${(match.warnings && match.warnings.length) ? `<div style="margin-top:8px; color:#e0a030;">${match.warnings.map((w) => escapeHtml(w)).join('<br>')}</div>` : ''}
      </div>
    ` : '';
    return `
      <div id="wiz-bingecat-flow">
        <p class="wiz-note">Set up Bingecat first - it's a separate site you configure yourself, no login needed here. Build your AI recommendations there, then copy your personal addon manifest URL (it ends in <code>manifest.json</code>).</p>
        <label class="wiz-label">Bingecat Manifest URL
          <input type="text" id="wiz-bingecat-url" class="wiz-input" placeholder="https://.../manifest.json" value="${escapeAttr(state.bingecatManifestUrl || '')}" autocomplete="off" spellcheck="false" style="margin-bottom:10px;">
        </label>
        <button type="button" class="wiz-secondary" id="wiz-bingecat-add"><span>Add Bingecat</span></button>
        <div class="wiz-error" id="wiz-bingecat-error" style="display:none; margin-top:12px;"></div>
        <div id="wiz-bingecat-status" style="display:none; margin-top:12px; padding:12px; background:rgba(0,0,0,0.2); border-radius:8px;"></div>
        ${foundBlock}
      </div>`;
  }

  function wireBingecatAddButton() {
    const btn = el('wiz-bingecat-add');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const urlInput = el('wiz-bingecat-url');
      const url = normalizeAddonUrlScheme(urlInput && urlInput.value);
      const statusEl = el('wiz-bingecat-status');
      const errEl = el('wiz-bingecat-error');
      if (errEl) errEl.style.display = 'none';
      if (!url) return showBingecatError('Paste your Bingecat manifest URL first.');
      if (url !== state.bingecatManifestUrl) state._bingecatUrlVerified = false;
      state.bingecatManifestUrl = url;
      btn.disabled = true;
      if (statusEl) { statusEl.style.display = 'block'; statusEl.innerHTML = '<span style="color:#2196f3;">Checking your Bingecat setup...</span>'; }
      try {
        if (!state._bingecatUrlVerified) {
          const alive = await checkManifestAlive(url);
          if (alive.ok === false) {
            btn.disabled = false;
            if (statusEl) statusEl.style.display = 'none';
            return showBingecatError(`That URL doesn't look right: ${alive.reason}`);
          }
          if (alive.ok === null && state._lastBingecatUrlWarned !== url) {
            state._lastBingecatUrlWarned = url;
            btn.disabled = false;
            if (statusEl) statusEl.style.display = 'none';
            return showBingecatError('Couldn\'t verify that URL. It may still work; tap "Add Bingecat" again to use it anyway.');
          }
          state._bingecatUrlVerified = true;
        }
        const result = await fetchBingecatManifest(url);
        btn.disabled = false;
        if (result.error) {
          if (statusEl) statusEl.style.display = 'none';
          return showBingecatError(result.error);
        }
        state.bingecatAddonId = result.addonId;
        state.bingecatMatch = result;
        state.bingecatSources = buildBingecatSources(result);
        if (statusEl) statusEl.style.display = 'none';
        render();
      } catch (e) {
        btn.disabled = false;
        if (statusEl) statusEl.style.display = 'none';
        showBingecatError('Something went wrong reading that manifest. Double-check the URL and try again.');
      }
    });
  }

  const state = {
    step: 'choose',     // choose | mode | aio-setup | account | profile | placement | pushing | streaming | for-you | done | error
    flow: 'collection', // collection (import + optional streaming) | starter (streaming only)
    mode: 'create',     // create | signin
    setupMode: 'native',// native | aio
    email: '',
    password: '',
    profileName: DEFAULT_PROFILE_NAME,
    token: null,
    profiles: [],
    selectedProfileId: null,
    createNewProfile: true,
    existingCollections: [],   // current rows on the chosen existing profile
    placementOrder: null,      // final row order (existing + incoming category ids), user-arranged
    placementMode: 'merge',    // 'merge' | 'overwrite' — how to write to an existing profile
    targetProfileId: null,     // profile the streaming setup writes to
    torboxKey: '',
    aioManifestUrl: '',        // manifest URL the visitor pastes back from AIO Metadata
    addonChoices: null,        // [{ name, url, checked }] — built lazily from SUGGESTED_ADDONS
    streamingApplied: false,   // whether the user ran the streaming setup
    torboxApplied: false,      // whether a Torbox key was actually written
    streamWarned: false,       // shown the "scrapers without a key" heads-up yet
    torboxShapeWarned: false,  // shown the "key looks wrong" heads-up yet
    prefill: null,             // settings handed in from the Quick editor (one-shot)
    resultProfileName: '',
    // For the finish summary:
    accountAction: '',         // 'created' | 'signedin'
    collectionRows: 0,         // rows we just added to the profile
    addonsAdded: [],           // names of scraper addons installed this run
    tmdbApplied: false,
    mdblistApplied: false,
    traktApplied: false,
    avatarApplied: false,
    errorMsg: '',
    devices: [],               // ['tv'] | ['mobile'] | ['tv','mobile']
    streamingSubStep: null,    // 'prompt' | 'torbox' | 'addons'
    streamingShowAddons: false,
    scraperConfig: null,       // lazy-initialized scraper settings (preset + overrides)
    tmdbKey: '',
    aioTmdbKey: '',
    aioPosterService: 'rpdb',
    aioRpdbTheme: 't0-free-rpdb',
    aioTraktWarned: false,     // shown the "no Trakt token pasted in" heads-up yet
    _traktAuthHost: null,      // Native mode only: host "1. Authorize Trakt" actually resolved to, reused by confirmForYouSetup so the token's host always matches where it was minted
    aioSortOrder: ['seeders', 'cached', 'resolution', 'size'], // stream sort priority, top wins ties below it
    aioScraperPriority: null,  // null until the user reorders; falls back to aioScraperTypes order
    forYouProviders: { trakt: true, bingecat: false, mdblist: false }, // multi-select: which service(s) power "For You" - all can be checked at once
    aioForYouStep: 'choose', // 'choose' | 'trakt' | 'bingecat' | 'mdblist' | 'metadata' - AIO's one-provider-at-a-time "For You" sub-flow
    nativeForYouStep: 'choose', // 'choose' | 'instance' | 'trakt' | 'bingecat' | 'mdblist' - Native mode's equivalent
    nativeAioInstance: 'auto', // AIO Metadata instance picked on Native's own "instance" screen, read later by the Trakt authorize step
    bingecatManifestUrl: '',   // visitor's own personal Bingecat addon manifest URL
    bingecatAddonId: '',       // manifest.id read back from that URL (per-installation, not fixed)
    bingecatSources: null,     // flat array of source objects, cached after a successful manifest fetch
    bingecatMatch: null,       // {addonId, foldersByKey, warnings} - drives the "here's what we found" summary
    bingecatApplied: false,    // for the Done screen summary
    _bingecatUrlVerified: false,
    _lastBingecatUrlWarned: null,
    forYouMdblistKey: '',      // MDBList API key for the "For You" folder - NOT the same as state.mdblistKey
                               // (that's an unrelated, pre-existing Quick Editor -> native Nuvio settings field)
    syncribulletManifestUrl: '', // Native mode only: visitor-pasted Syncribullet addon URL
    mdblistForYouApplied: false, // Done-screen flag - NOT the same as the pre-existing state.mdblistApplied
    mdblistKeyWarned: false,   // shown the "no MDBList key pasted in" heads-up yet (AIO mode)
    _syncribulletUrlVerified: false,
    _lastSyncribulletUrlWarned: null,
  };

  function el(id) { return document.getElementById(id); }

  function isForYouProviderOn(name) { return !!(state.forYouProviders && state.forYouProviders[name]); }
  function anyForYouProviderOn() { return isForYouProviderOn('trakt') || isForYouProviderOn('bingecat') || isForYouProviderOn('mdblist'); }

  function countSelection() {
    // Re-derive the same numbers shown in the control bar.
    let folders = 0, sources = 0;
    try {
      const compiled = assembleFilteredDatabase();
      compiled.forEach((cat) => {
        (cat.folders || []).forEach((f) => {
          folders += 1;
          sources += (f.sources || []).length;
        });
      });
    } catch (e) { /* ignore */ }
    return { folders, sources };
  }

  function saveInputs() {
    try {
      const fields = ['setupMode', 'email', 'profileName', 'torboxKey', 'tmdbKey', 'aioTraktToken', 'aioRpdbKey', 'aioDebridType', 'aioDebridKey', 'aioScraperTypes'];
      const toSave = {};
      fields.forEach(f => { if (state[f] !== undefined) toSave[f] = state[f]; });
      localStorage.setItem('kaptain_wizard_inputs', JSON.stringify(toSave));
    } catch(e) {}
  }

  // Remembers which profile a given account last pushed to, so re-opening the
  // wizard defaults back to it instead of always offering "create new".
  function getRememberedDevices() {
    try {
      const raw = JSON.parse(localStorage.getItem('kaptain_last_devices') || '[]');
      return Array.isArray(raw) ? raw.filter((d) => d === 'tv' || d === 'mobile') : [];
    } catch (e) { return []; }
  }

  function getRememberedProfileId(email) {
    try {
      const map = JSON.parse(localStorage.getItem('kaptain_last_profile_by_email') || '{}');
      return map[email] != null ? Number(map[email]) : null;
    } catch (e) { return null; }
  }
  function rememberProfileId(email, profileId) {
    try {
      const map = JSON.parse(localStorage.getItem('kaptain_last_profile_by_email') || '{}');
      map[email] = profileId;
      localStorage.setItem('kaptain_last_profile_by_email', JSON.stringify(map));
    } catch (e) {}
  }

  function open(opts) {
    state.flow = (opts && opts.flow === 'starter') ? 'starter'
               : (opts && opts.flow === 'collection-only') ? 'collection-only'
               : 'collection';
    state.errorMsg = '';
    state.torboxKey = '';
    state.aioManifestUrl = '';
    state._aioUrlVerified = false;
    state._lastAioUrlWarned = null;
    state.addonChoices = null;
    state.streamingApplied = false;
    state.torboxApplied = false;
    state.streamWarned = false;
    state.torboxShapeWarned = false;
    state.aioTraktWarned = false;
    state.targetProfileId = null;
    state.accountAction = '';
    state.collectionRows = 0;
    state.addonsAdded = [];
    state.tmdbApplied = false;
    state.mdblistApplied = false;
    state.traktApplied = false;
    state.avatarApplied = false;
    state.devices = getRememberedDevices();
    state.streamingSubStep = null;
    state.streamingShowAddons = false;
    state.scraperConfig = null;
    state.aioSubStep = 'trakt';
    state.aioForYouStep = 'choose';
    state.nativeForYouStep = 'choose';
    state.nativeAioInstance = 'auto';
    state.tmdbKey = '';
    state._devicesAutoSwitch = true;
    state._streamManifestWarnedUrls = null;
    state.forYouProviders = { trakt: true, bingecat: false, mdblist: false };
    state._traktAuthHost = null;
    state.bingecatManifestUrl = '';
    state.bingecatAddonId = '';
    state.bingecatSources = null;
    state.bingecatMatch = null;
    state.bingecatApplied = false;
    state._bingecatUrlVerified = false;
    state._lastBingecatUrlWarned = null;
    state.forYouMdblistKey = '';
    state.syncribulletManifestUrl = '';
    state.mdblistForYouApplied = false;
    state.mdblistKeyWarned = false;
    state._syncribulletUrlVerified = false;
    state._lastSyncribulletUrlWarned = null;
    // Pre-filled settings from the Quick editor → applied in one shot, no
    // interactive streaming step.
    state.prefill = (opts && opts.prefill && typeof opts.prefill === 'object') ? opts.prefill : null;
    if (state.prefill && state.prefill.profileName) state.profileName = String(state.prefill.profileName).trim() || DEFAULT_PROFILE_NAME;
    // Routing: collection-only → straight to account (no device or streaming steps).
    // starter → straight to account (streaming-only, no collection or device question).
    // collection + skipChoose → devices step first (asks TV/Mobile before account).
    // collection → choose step (Send vs Download fork).
    if (state.flow === 'collection-only' || state.flow === 'starter') {
      state.step = 'account';
      state.mode = 'create';
    } else if (opts && opts.skipChoose) {
      state.step = 'devices';
      state.mode = 'create';
    } else {
      state.step = 'choose';
    }
    const overlay = el('wizard-overlay');
    if (overlay) overlay.classList.add('open');
    render();
  }

  function close() {
    const overlay = el('wizard-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function go(step) { state.step = step; render(); }

  // ----- ICONS -----
  const ICON = {
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/><line x1="12" y1="7" x2="12" y2="14"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>',
  };

  // ====================================================================
  // RENDER
  // ====================================================================
  function render() {
    const panel = el('wizard-panel');
    if (!panel) return;

    if (state.step === 'devices') renderDevices(panel);
    else if (state.step === 'choose') renderChoose(panel);
    else if (state.step === 'mode') renderMode(panel);
    else if (state.step === 'aio-setup') renderAioSetup(panel);
    else if (state.step === 'account') renderAccount(panel);
    else if (state.step === 'profile') renderProfile(panel);
    else if (state.step === 'placement') renderPlacement(panel);
    else if (state.step === 'streaming') renderStreaming(panel);
    else if (state.step === 'pushing') renderPushing(panel);
    else if (state.step === 'for-you') renderForYou(panel);
    else if (state.step === 'done') renderDone(panel);
    else if (state.step === 'error') renderError(panel);
    else return;

    // Every screen's header carries the same help button, so wire it here
    // rather than in each of the ~25 render functions.
    wireHelpButton();
  }

  function header(title, subtitle, withBack, progressStep) {
    return `
      <div class="wiz-header">
        ${withBack ? `<button class="wiz-back" id="wiz-back" title="Back" aria-label="Back">${ICON.back}<span class="wiz-back-label">Back</span></button>` : ''}
        <div class="wiz-header-text">
          <h3 class="wiz-title">${title}</h3>
          ${subtitle ? `<p class="wiz-sub">${subtitle}</p>` : ''}
        </div>
        <button class="wiz-help-btn" id="wiz-help" title="What do these words mean?" aria-label="Glossary — what do these words mean?">?</button>
        <button class="wiz-close" id="wiz-close" aria-label="Close">&times;</button>
      </div>
      ${progressStep ? progressBar(progressStep) : ''}
      ${glossaryPanelHtml()}`;
  }

  // A glossary reachable from every screen, not just the ones that happened to
  // wrap a term in a tooltip. Same GLOSSARY map behind both, so a definition
  // never drifts between the two.
  function glossaryPanelHtml() {
    const rows = GLOSSARY_ORDER
      .filter((k) => GLOSSARY[k])
      .map((k) => `<div class="wiz-glossary-row">
        <dt>${escapeHtml(GLOSSARY_TITLES[k] || k)}</dt>
        <dd>${escapeHtml(GLOSSARY[k])}</dd>
      </div>`).join('');
    return `<div class="wiz-glossary-panel" id="wiz-glossary-panel" hidden>
      <dl class="wiz-glossary-list">${rows}</dl>
    </div>`;
  }

  // Wired once per render, alongside every screen's own listeners.
  function wireHelpButton() {
    const btn = el('wiz-help');
    const panel = el('wiz-glossary-panel');
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      const open = !panel.hidden;
      panel.hidden = open;
      btn.classList.toggle('open', !open);
      btn.setAttribute('aria-expanded', String(!open));
    });
  }

  // Inline tooltips for jargon terms (Trakt, Debrid, RPDB, etc.) — a
  // beginner has no other way to learn what these words mean before picking
  // a setup mode. The term itself gets a dotted underline (hover/focus for
  // the definition) instead of a separate "?" badge, so explaining several
  // terms in one sentence doesn't turn into a row of badges.
  const GLOSSARY = {
    trakt: 'Trakt tracks what you watch and builds personalized recommendation lists. Free account at trakt.tv.',
    torbox: 'Torbox is a paid "debrid" service that fetches and streams files instantly instead of torrenting.',
    debrid: 'A debrid service downloads/streams files on fast servers so you never wait on a torrent.',
    rpdb: 'RPDB (Ratings Poster Database) overlays star ratings directly on movie/show posters.',
    aiometadata: 'AIO Metadata is a community service that builds your personalized "For You" catalog from Trakt.',
    aiostreams: 'AIO Streams is a power-user addon that combines several scrapers and a debrid service into one stream source.',
    scraper: 'A scraper addon searches the web for playable stream links for whatever you\'re watching.',
    tmdb: 'TMDB (The Movie Database) is the free catalogue most of these folders pull their posters and details from. A personal key is free and stops you sharing a rate limit with everyone else.',
    mdblist: 'MDBList builds ratings-based and personal lists from your own watch history. Free account at mdblist.com.',
    bingecat: 'Bingecat AI generates recommendation lists for you. You build the list on their site, then paste the link it gives you back here.',
    manifest: 'A manifest URL is the "address" of an addon - a link ending in /manifest.json that tells Nuvio where the addon lives and what it can do.',
    addon: 'An addon is a plug-in that gives Nuvio something extra: more rows on your home screen, or somewhere to actually play a title from.',
    native: 'Native Mode wires Nuvio\'s own built-in streaming setup directly. Fewer moving parts and nothing third-party to maintain.',
    catalog: 'A catalog is one row of titles on your home screen - an addon can serve several of them.',
    syncribullet: 'Syncribullet feeds what you\'ve watched in Nuvio back to MDBList so its recommendations stay current.',
  };
  // Reading order for the help drawer: the words you meet first, first — not
  // alphabetical, which would open on "AIO Metadata".
  const GLOSSARY_ORDER = ['addon', 'catalog', 'manifest', 'scraper', 'debrid', 'torbox',
    'trakt', 'mdblist', 'bingecat', 'tmdb', 'rpdb', 'syncribullet', 'native', 'aiometadata', 'aiostreams'];
  const GLOSSARY_TITLES = {
    addon: 'Addon', catalog: 'Catalog', manifest: 'Manifest URL', scraper: 'Scraper',
    debrid: 'Debrid', torbox: 'Torbox', trakt: 'Trakt', mdblist: 'MDBList',
    bingecat: 'Bingecat AI', tmdb: 'TMDB', rpdb: 'RPDB', syncribullet: 'Syncribullet',
    native: 'Native Mode', aiometadata: 'AIO Metadata', aiostreams: 'AIO Streams',
  };
  // Generic ▲▼ reorderable list — same up/down-arrow pattern used elsewhere
  // in the app (main grid, Preview/Reorder toolbar) rather than introducing
  // drag-and-drop, so this stays consistent with the rest of the tool.
  const SCRAPER_DISPLAY_NAMES = { torrentio: 'Torrentio', comet: 'Comet', mediafusion: 'MediaFusion' };
  const SORT_CRITERIA_DISPLAY_NAMES = { seeders: 'Seeders', cached: 'Cached first', resolution: 'Resolution', size: 'File size' };

  function aioScraperPriorityOrder() {
    const checked = state.aioScraperTypes || ['torrentio'];
    const stored = state.aioScraperPriority || [];
    // Keep any stored order for scrapers that are still checked, then append
    // any newly-checked ones that aren't in the stored order yet.
    const ordered = stored.filter((s) => checked.includes(s));
    checked.forEach((s) => { if (!ordered.includes(s)) ordered.push(s); });
    return ordered;
  }

  function renderReorderList(order, displayNames, idPrefix) {
    return order.map((key, i) => `
      <div class="wiz-reorder-row" data-key="${escapeAttr(key)}">
        <span class="wiz-reorder-label">${escapeHtml(displayNames[key] || key)}</span>
        <div class="reorder-arrows">
          <button type="button" class="reorder-arrow" data-list="${idPrefix}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Move up" aria-label="Move up">▲</button>
          <button type="button" class="reorder-arrow" data-list="${idPrefix}" data-dir="1" ${i === order.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move down">▼</button>
        </div>
      </div>`).join('');
  }

  function glossaryTip(key, label) {
    const text = GLOSSARY[key];
    if (!text) return escapeHtml(label || '');
    return `<span class="wiz-glossary-term" tabindex="0" data-tip="${escapeAttr(text)}">${escapeHtml(label || key)}</span>`;
  }

  // Progress covers the whole journey, not just the account modal's three
  // steps — a visitor deep in AIO's own sub-flow could otherwise only see
  // where they were inside that sub-flow, never how much was left overall.
  // Devices only exists in the collection flow, and profile/placement read as
  // one stop, so the rail is built per-run rather than hardcoded.
  const AIO_SUBSTEPS = ['aio-trakt', 'aio-poster', 'aio-debrid', 'aio-scraper', 'aio-format'];

  function journeySteps() {
    const steps = [];
    if (state.flow === 'collection') steps.push({ key: 'devices', label: 'Devices' });
    steps.push({ key: 'account', label: 'Account' });
    steps.push({ key: 'profile', label: 'Profile' });
    if (state.flow !== 'collection-only') {
      steps.push({ key: 'mode', label: 'Setup' });
      steps.push({ key: 'streaming', label: 'Streaming' });
    }
    return steps;
  }

  // Maps any screen (including the nested AIO/For-You sub-flows) onto the
  // journey stop it belongs to, so the rail never blanks out mid-flow.
  function journeyKeyFor(step) {
    if (step === 'placement') return 'profile';
    if (step === 'for-you' || step === 'aio-setup' || AIO_SUBSTEPS.includes(step)) return 'mode';
    return step;
  }

  function progressIndex(step) {
    const aioIdx = AIO_SUBSTEPS.indexOf(step);
    if (aioIdx >= 0) return aioIdx;
    return journeySteps().findIndex((s) => s.key === journeyKeyFor(step));
  }

  function renderRail(labels, idx, ariaLabel) {
    const segs = labels.map((label, i) => {
      const cls = i < idx ? 'done' : (i === idx ? 'current' : 'todo');
      const current = i === idx ? ' aria-current="step"' : '';
      return `<span class="wiz-prog-step ${cls}"${current}>
        <span class="wiz-prog-bar"></span>
        <span class="wiz-prog-label">${escapeHtml(label)}</span>
      </span>`;
    }).join('');
    return `<div class="wiz-progress" role="group" aria-label="${escapeAttr(ariaLabel)}">${segs}</div>`;
  }

  function progressBar(step) {
    // AIO Setup keeps its own nested rail: it's a sub-flow inside one journey
    // stop, and flattening it into the main rail would misreport how far along
    // the visitor actually is.
    if (AIO_SUBSTEPS.includes(step)) {
      return renderRail(
        ['Trakt/TMDB', 'Posters', 'Debrid', 'Scrapers', 'Format'],
        AIO_SUBSTEPS.indexOf(step),
        'AIO Streams setup progress',
      );
    }
    const steps = journeySteps();
    const idx = steps.findIndex((s) => s.key === journeyKeyFor(step));
    if (idx < 0) return '';
    return renderRail(steps.map((s) => s.label), idx, 'Setup progress');
  }

  function renderChoose(panel) {
    const { folders, sources } = countSelection();
    panel.innerHTML = `
      ${header('Get Your Collection into Nuvio', `Your home screen is ready — ${folders} folders of it, pulling from ${sources} sources.`, false)}
      <div class="wiz-body">
        <button class="wiz-option" id="wiz-pick-push">
          <span class="wiz-option-icon accent">${ICON.rocket}</span>
          <span class="wiz-option-text">
            <span class="wiz-option-title">Send straight to Nuvio</span>
            <span class="wiz-option-desc">Sign in or create a Nuvio account and I'll load your collection in instantly. It'll be there on every device you use.</span>
          </span>
        </button>
        <button class="wiz-option" id="wiz-pick-download">
          <span class="wiz-option-icon">${ICON.download}</span>
          <span class="wiz-option-text">
            <span class="wiz-option-title">Just download the file</span>
            <span class="wiz-option-desc">Prefer not to share a login? Grab the file (or copy the import link) and add it in Nuvio yourself.</span>
          </span>
        </button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-pick-push').addEventListener('click', () => {
      if (countSelection().folders === 0) {
        showToast('Pick at least one folder before sending to Nuvio.', 'error');
        return;
      }
      go('devices');
    });
    el('wiz-pick-download').addEventListener('click', () => {
      close();
      if (typeof compileAndDownloadJSON === 'function') compileAndDownloadJSON();
    });
  }

  // Setup Mode used to put equal weight on three choices with several lines
  // of prose each — scannable in ~10 seconds at best. This splits the two
  // real setup decisions (Native vs AIO Streams) into slim cards (title +
  // one line + a few tag chips), moves all the "why pick this" detail into
  // a collapsed expander below, and demotes the file-download option (not a
  // setup path, just a download) to a plain text link under everything else.
  function renderMode(panel) {
    panel.innerHTML = `
      ${header('Setup Mode', 'Pick how you want your streaming set up — you can always redo this later.', false, 'mode')}
      <div class="wiz-body">
        <button class="wiz-option" id="wiz-pick-native" style="margin-bottom:10px;">
          <span class="wiz-option-icon accent">${ICON.rocket}</span>
          <span class="wiz-option-text">
            <span class="wiz-option-title-row">
              <span class="wiz-option-title">Native Mode</span>
              <span class="wiz-option-pill">Recommended</span>
            </span>
            <span class="wiz-option-desc">Fast, simple, and just works — nothing third-party to configure or keep updated.</span>
            <span class="wiz-option-chips">
              <span class="wiz-option-chip">Fastest</span>
              <span class="wiz-option-chip">Easiest</span>
              <span class="wiz-option-chip">Zero maintenance</span>
            </span>
          </span>
        </button>
        <button class="wiz-option" id="wiz-pick-aio">
          <span class="wiz-option-icon">${ICON.download}</span>
          <span class="wiz-option-text">
            <span class="wiz-option-title">AIO Streams Mode</span>
            <span class="wiz-option-desc">Power-user setup with more scrapers, ratings posters, and full control over how it's all configured.</span>
            <span class="wiz-option-chips">
              <span class="wiz-option-chip">Ratings posters</span>
              <span class="wiz-option-chip">More scrapers</span>
              <span class="wiz-option-chip">Full control</span>
            </span>
          </span>
        </button>

        <button type="button" class="wiz-mode-expander" id="wiz-mode-expander-toggle">
          <span>Which should I pick?</span>
          <span class="wiz-mode-expander-caret" id="wiz-mode-expander-caret">▾</span>
        </button>
        <div class="wiz-mode-expander-body" id="wiz-mode-expander-body" style="display:none;">
          <p><strong>Native Mode</strong> — ${glossaryTip('trakt', 'Trakt')} is natively integrated and ${glossaryTip('torbox', 'Torbox')} is configured for streaming; ${glossaryTip('aiometadata', 'AIO Metadata')} is only used for "For You" lists. Faster, easier, and nothing third-party to maintain or go stale on you. Note: this wizard's Trakt step only powers "For You" — to enable Trakt scrobbling/watch history in Nuvio itself, connect it separately in Nuvio's own Settings → Integrations.</p>
          <p><strong>AIO Streams Mode</strong> — routes ${glossaryTip('debrid', 'Debrid')} services, ${glossaryTip('rpdb', 'RPDB')} (Ratings Posters), and distributed ${glossaryTip('aiometadata', 'AIO Metadata')} instances through a unified ${glossaryTip('aiostreams', 'AIO Streams')} backend. Pick this for ratings-poster integration, additional scrapers beyond Torrentio, broader metadata sources, and more control over how everything is configured.</p>
        </div>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    // "For You" setup only makes sense when that folder is actually in the
    // collection - a visitor who deselected it in the picker shouldn't be
    // asked to wire up a recommendation service they'll never see.
    el('wiz-pick-native').addEventListener('click', () => {
      state.setupMode = 'native';
      if (hasForYouFolder()) go('for-you');
      else goToStreaming();
    });
    // The AIO sub-flow's last stop ("Metadata Keys") isn't really a For You
    // step - AIO Streams hard-requires a TMDB key regardless - so skipping
    // For You jumps to that screen rather than past the whole sub-flow.
    el('wiz-pick-aio').addEventListener('click', () => {
      state.setupMode = 'aio';
      state.aioSubStep = 'trakt';
      state.aioForYouStep = hasForYouFolder() ? 'choose' : 'metadata';
      go('aio-setup');
    });
    el('wiz-mode-expander-toggle').addEventListener('click', () => {
      const body = el('wiz-mode-expander-body');
      const caret = el('wiz-mode-expander-caret');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      caret.classList.toggle('open', !isOpen);
    });
  }

  function renderAioSetup(panel) {
    const sub = state.aioSubStep || 'trakt';
    if (sub === 'poster') return renderAioPoster(panel);
    if (sub === 'debrid') return renderAioDebrid(panel);
    if (sub === 'scraper') return renderAioScraper(panel);
    if (sub === 'format') return renderAioFormat(panel);
    if (sub === 'torbox-offer') return renderAioTorboxOffer(panel);
    return renderAioForYou(panel);
  }

  // AIO Streams' "For You" sub-flow: one screen to choose which service(s),
  // then one screen per checked provider, then a metadata-keys screen -
  // instead of stacking every provider's fields on one long page. See
  // forYouProviderOrder()/nextAioForYouStep()/prevAioForYouStep() above.
  function renderAioForYou(panel) {
    const step = state.aioForYouStep || 'choose';
    if (step === 'trakt') return renderAioForYouTrakt(panel);
    if (step === 'bingecat') return renderAioForYouBingecat(panel);
    if (step === 'mdblist') return renderAioForYouMdblist(panel);
    if (step === 'metadata') return renderAioForYouMetadata(panel);
    return renderAioForYouChoose(panel);
  }

  function renderAioForYouChoose(panel) {
    const traktOn = isForYouProviderOn('trakt');
    const bingecatOn = isForYouProviderOn('bingecat');
    const mdblistOn = isForYouProviderOn('mdblist');
    panel.innerHTML = `
      ${header('AIO Streams Setup', 'This builds the addon that finds and plays your streams: think of it as an advanced version of what Native Mode sets up.', true, 'aio-trakt')}
      <div class="wiz-body">
        <div class="wiz-section">
          <h4 style="margin:0 0 10px 0; font-size:1.05rem;">What personalized recommendations do you want to set up?</h4>
          <p class="wiz-note" style="margin-bottom:10px;">Pick any combination that sounds useful - each one you check feeds the same "For You" folder. Not sure? Trakt alone is a great start, and you can always add more later.</p>
          <div class="wiz-device-options" style="margin-bottom:14px;">
            <label class="wiz-device-check-row${traktOn ? ' checked' : ''}">
              <input type="checkbox" data-foryou-provider="trakt" ${traktOn ? 'checked' : ''}>
              <span class="wiz-device-text">
                <span class="wiz-device-label">${glossaryTip('trakt', 'Trakt')}</span>
                <span class="wiz-device-desc">Tracks what you watch and builds recommendations from it. Free account, no card.</span>
              </span>
            </label>
            <label class="wiz-device-check-row${bingecatOn ? ' checked' : ''}">
              <input type="checkbox" data-foryou-provider="bingecat" ${bingecatOn ? 'checked' : ''}>
              <span class="wiz-device-text">
                <span class="wiz-device-label">${glossaryTip('bingecat', 'Bingecat AI')}</span>
                <span class="wiz-device-desc">AI-generated picks. You build the list on Bingecat's site, then paste the link it gives you back here.</span>
              </span>
            </label>
            <label class="wiz-device-check-row${mdblistOn ? ' checked' : ''}">
              <input type="checkbox" data-foryou-provider="mdblist" ${mdblistOn ? 'checked' : ''}>
              <span class="wiz-device-text">
                <span class="wiz-device-label">${glossaryTip('mdblist', 'MDBList')}</span>
                <span class="wiz-device-desc">Curated and personal lists powered by your MDBList account.</span>
              </span>
            </label>
          </div>
          <p class="wiz-note" style="opacity:0.7;">Picking none is fine too - "For You" just won't show much until you come back and add one.</p>
        </div>
        <button class="wiz-primary" id="wiz-aio-foryou-choose-continue" style="margin-top:16px;"><span>Continue →</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => go('mode'));
    wireForYouProviderToggle(panel);
    el('wiz-aio-foryou-choose-continue').addEventListener('click', () => {
      state.aioForYouStep = nextAioForYouStep('choose');
      render();
    });
  }

  function renderAioForYouTrakt(panel) {
    panel.innerHTML = `
      ${header('Set Up Trakt', 'Authorize Trakt so AIO Metadata can build "For You" from your watch history.', true, 'aio-trakt')}
      <div class="wiz-body">
        <div class="wiz-section">
          ${forYouStepCounterHtml('trakt')}
          <button type="button" class="wiz-primary" id="wiz-aio-trakt-auth" style="margin-bottom:10px;"><span>Authorize Trakt in AIO Metadata</span></button>
          <label class="wiz-label" style="margin-bottom:0;">Trakt Token ID (Paste here after authorizing)
            <input type="text" id="wiz-aio-trakt-token" class="wiz-input" placeholder="e.g. 12345678-abcd-1234..." value="${escapeAttr(state.aioTraktToken || '')}" autocomplete="off">
          </label>
        </div>
        <div class="wiz-error" id="wiz-aio-error" style="display:none; margin-top:15px;"></div>
        <button class="wiz-primary" id="wiz-aio-trakt-continue" style="margin-top:16px;"><span>Continue →</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.aioForYouStep = prevAioForYouStep('trakt'); render(); });
    el('wiz-aio-trakt-auth').addEventListener('click', () => {
      window.open('https://aiometadata.viren070.me/api/auth/trakt/authorize', '_blank');
    });
    el('wiz-aio-trakt-continue').addEventListener('click', () => {
      const errEl = el('wiz-aio-error');
      errEl.style.display = 'none';
      if (!state.aioTraktToken && hasForYouFolder() && !state.aioTraktWarned) {
        state.aioTraktWarned = true;
        errEl.textContent = 'No Trakt Token ID pasted in. "For You" will show up but stay empty without it. Tap "Continue" again to proceed without Trakt, or paste the Token ID first.';
        errEl.style.display = 'block';
        return;
      }
      state.aioForYouStep = nextAioForYouStep('trakt');
      render();
    });
  }

  function renderAioForYouBingecat(panel) {
    panel.innerHTML = `
      ${header('Set Up Bingecat AI', 'Bingecat builds AI-generated picks from your own manifest.', true, 'aio-trakt')}
      <div class="wiz-body">
        <div class="wiz-section">
          ${forYouStepCounterHtml('bingecat')}
          ${renderBingecatSubFlowHtml()}
        </div>
        <button class="wiz-primary" id="wiz-aio-bingecat-continue" style="margin-top:16px;"><span>Continue →</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.aioForYouStep = prevAioForYouStep('bingecat'); render(); });
    wireBingecatAddButton();
    el('wiz-aio-bingecat-continue').addEventListener('click', () => {
      if (!state.bingecatSources || !state.bingecatSources.length) {
        return showBingecatError('Add your Bingecat manifest URL above before continuing, or tap Back and uncheck Bingecat AI.');
      }
      state.aioForYouStep = nextAioForYouStep('bingecat');
      render();
    });
  }

  function renderAioForYouMdblist(panel) {
    panel.innerHTML = `
      ${header('Set Up MDBList', 'MDBList powers "For You" with your curated and personal lists.', true, 'aio-trakt')}
      <div class="wiz-body">
        <div class="wiz-section">
          ${forYouStepCounterHtml('mdblist')}
          ${renderMdblistSubFlowHtml({ includeSyncribullet: false })}
        </div>
        <button class="wiz-primary" id="wiz-aio-mdblist-continue" style="margin-top:16px;"><span>Continue →</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.aioForYouStep = prevAioForYouStep('mdblist'); render(); });
    wireMdblistSubFlow(false);
    el('wiz-aio-mdblist-continue').addEventListener('click', () => {
      if (!state.forYouMdblistKey && hasForYouFolder() && !state.mdblistKeyWarned) {
        state.mdblistKeyWarned = true;
        return showMdblistError('No MDBList API key pasted in. "For You" will show up but stay empty without it. Tap "Continue" again to proceed without MDBList, or paste the key first.');
      }
      state.aioForYouStep = nextAioForYouStep('mdblist');
      render();
    });
  }

  function renderAioForYouMetadata(panel) {
    panel.innerHTML = `
      ${header('Metadata Keys', `Connect ${glossaryTip('tmdb', 'TMDB')} (required) and TVDB (optional) to speed up and improve metadata loading.`, true, 'aio-trakt')}
      <div class="wiz-body">
        <div class="wiz-section">
          ${forYouStepCounterHtml('metadata')}
          <label class="wiz-label" style="margin-bottom:0;">TMDB API Key (Required: AIO Streams hits public-API rate limits fast without your own key)
            <span class="wiz-input-wrap">
              <input type="text" id="wiz-aio-tmdb-key" class="wiz-input" placeholder="Enter TMDB API Key..." value="${escapeAttr(state.aioTmdbKey || '')}" autocomplete="off">
              <button type="button" class="wiz-input-toggle" id="wiz-aio-tmdb-test">Test</button>
            </span>
          </label>
          <label class="wiz-label" style="margin-top:12px; margin-bottom:0;">TVDB API Key (Optional, alternate metadata source)
            <input type="text" id="wiz-aio-tvdb-key" class="wiz-input" placeholder="Enter TVDB API Key..." value="${escapeAttr(state.aioTvdbKey || '')}" autocomplete="off">
          </label>
        </div>
        <div class="wiz-error" id="wiz-aio-error" style="display:none; margin-top:15px;"></div>
        <button class="wiz-primary" id="wiz-aio-metadata-continue" style="margin-top:16px;"><span>Continue →</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    // No "For You" folder means every step before this one was skipped, so
    // Back reaches all the way out to the mode picker.
    el('wiz-back').addEventListener('click', () => {
      if (!hasForYouFolder()) { go('mode'); return; }
      state.aioForYouStep = prevAioForYouStep('metadata');
      render();
    });
    wireKeyTestButton('wiz-aio-tmdb-test', 'wiz-aio-tmdb-key', testTmdbKeyLive);
    el('wiz-aio-metadata-continue').addEventListener('click', () => {
      const errEl = el('wiz-aio-error');
      errEl.style.display = 'none';
      if (!state.aioTmdbKey) {
        errEl.textContent = 'TMDB API Key is required for AIO Streams. Without it, metadata falls back to a shared public key that runs into rate limits fast.';
        errEl.style.display = 'block';
        return;
      }
      state.aioSubStep = 'poster';
      render();
    });
  }

  function renderAioPoster(panel) {
    panel.innerHTML = `
      ${header('AIO Streams Setup', 'Optional: choose a poster provider to show ratings directly on posters.', true, 'aio-poster')}
      <div class="wiz-body">
        <div class="wiz-section">
          <h4 style="margin:0 0 10px 0; font-size:1.05rem;">Ratings & ${glossaryTip('rpdb', 'Poster Provider')}</h4>
          <p class="wiz-note" style="margin-bottom:12px;">A poster provider overlays star ratings directly on your posters, so you can judge something at a glance without opening it. RPDB's free tier is picked by default below - happy to leave it, or just tap Continue if you don't care about this.</p>
          <div class="wiz-label" style="margin-bottom:12px;">Poster Provider</div>
          <div class="wiz-pill-group" style="margin-bottom: 16px; display: flex; gap: 10px;">
            <button type="button" class="wiz-pill ${state.aioPosterService === 'rpdb' ? 'active' : ''}" data-value="rpdb">RPDB</button>
            <button type="button" class="wiz-pill ${state.aioPosterService === 'bttr' ? 'active' : ''}" data-value="bttr">Bttr Posters</button>
            <button type="button" class="wiz-pill ${state.aioPosterService === 'top' ? 'active' : ''}" data-value="top">Top Posters</button>
          </div>
          <input type="hidden" id="wiz-aio-poster-service" value="${escapeAttr(state.aioPosterService || 'none')}">

          <div class="wiz-poster-studio">
            <div class="wiz-poster-studio-visual">
              <div class="wiz-poster-frame">
                <img id="wiz-poster-preview-img" class="wiz-poster-frame-img">
              </div>
              <div class="wiz-poster-caption" id="wiz-poster-preview-caption">Loading preview...</div>
            </div>

            <div class="wiz-poster-studio-settings">
              <div id="wiz-aio-rpdb-options" style="display: ${(state.aioPosterService || 'rpdb') === 'rpdb' ? 'block' : 'none'};">
                <label class="wiz-label" style="margin-bottom:0;">RPDB Theme / API Key (<a href="https://patreon.com/rpdb" target="_blank" style="color:var(--accent);">Support RPDB</a>)
                  <select id="wiz-aio-rpdb-theme" class="wiz-input" style="margin-bottom:12px;">
                    <option value="t0-free-rpdb" ${(state.aioRpdbTheme || 't0-free-rpdb') === 't0-free-rpdb' ? 'selected' : ''}>Free: Dark Bar</option>
                    <option value="t0-free-rpdb-blocks" ${state.aioRpdbTheme === 't0-free-rpdb-blocks' ? 'selected' : ''}>Free: Blocks</option>
                    <option value="t0-free-rpdb-rounded-blocks" ${state.aioRpdbTheme === 't0-free-rpdb-rounded-blocks' ? 'selected' : ''}>Free: Rounded Blocks</option>
                    <option value="custom" ${state.aioRpdbTheme === 'custom' ? 'selected' : ''}>Custom Premium Key...</option>
                  </select>
                </label>
                <label class="wiz-label" id="wiz-aio-rpdb-custom-wrap" style="margin-bottom:0; display: ${state.aioRpdbTheme === 'custom' ? 'block' : 'none'};">Premium API Key
                  <input type="text" id="wiz-aio-rpdb-key" class="wiz-input" placeholder="Enter RPDB API Key..." value="${escapeAttr(state.aioRpdbKey || '')}" autocomplete="off">
                </label>
              </div>

              <div id="wiz-aio-bttr-options" style="display: ${state.aioPosterService === 'bttr' ? 'block' : 'none'};">
                <div class="wiz-opt-row">
                  <div class="wiz-opt-text"><span class="wiz-opt-title">Quality Tags</span><span class="wiz-opt-sub">4K, Dolby Vision, Atmos</span></div>
                  <label class="wiz-pill-toggle"><input type="checkbox" id="wiz-bttr-quality" ${state.bttrQuality ? 'checked' : ''}><span class="wiz-pill-track"></span></label>
                </div>
                <div class="wiz-opt-row">
                  <div class="wiz-opt-text"><span class="wiz-opt-title">Genre</span><span class="wiz-opt-sub">Label at bottom</span></div>
                  <label class="wiz-pill-toggle"><input type="checkbox" id="wiz-bttr-genre" ${state.bttrGenre !== false ? 'checked' : ''}><span class="wiz-pill-track"></span></label>
                </div>
                <div class="wiz-opt-row">
                  <div class="wiz-opt-text"><span class="wiz-opt-title">Rating</span><span class="wiz-opt-sub">Star rating at bottom</span></div>
                  <label class="wiz-pill-toggle"><input type="checkbox" id="wiz-bttr-rating" ${state.bttrRating !== false ? 'checked' : ''}><span class="wiz-pill-track"></span></label>
                </div>
                <div class="wiz-opt-row">
                  <div class="wiz-opt-text"><span class="wiz-opt-title">Source</span></div>
                  <select id="wiz-bttr-source" class="wiz-opt-inline-select">
                    <option value="Average" ${(state.bttrSource || 'Average') === 'Average' ? 'selected' : ''}>Average</option>
                    <option value="TM" ${state.bttrSource === 'TM' ? 'selected' : ''}>TMDB</option>
                    <option value="IM" ${state.bttrSource === 'IM' ? 'selected' : ''}>IMDb</option>
                    <option value="RT" ${state.bttrSource === 'RT' ? 'selected' : ''}>Rotten Tomatoes</option>
                    <option value="TR" ${state.bttrSource === 'TR' ? 'selected' : ''}>Trakt</option>
                  </select>
                </div>
                <div class="wiz-opt-row">
                  <div class="wiz-opt-text"><span class="wiz-opt-title">Age Rating</span><span class="wiz-opt-sub">PG-13, TV-MA, R</span></div>
                  <label class="wiz-pill-toggle"><input type="checkbox" id="wiz-bttr-age" ${state.bttrAge ? 'checked' : ''}><span class="wiz-pill-track"></span></label>
                </div>
                <div class="wiz-opt-row">
                  <div class="wiz-opt-text"><span class="wiz-opt-title">Language</span></div>
                  <select id="wiz-bttr-language" class="wiz-opt-inline-select">
                    <option value="en" ${(state.bttrLanguage || 'en') === 'en' ? 'selected' : ''}>English</option>
                    <option value="es" ${state.bttrLanguage === 'es' ? 'selected' : ''}>Spanish</option>
                    <option value="fr" ${state.bttrLanguage === 'fr' ? 'selected' : ''}>French</option>
                    <option value="de" ${state.bttrLanguage === 'de' ? 'selected' : ''}>German</option>
                    <option value="it" ${state.bttrLanguage === 'it' ? 'selected' : ''}>Italian</option>
                    <option value="pt" ${state.bttrLanguage === 'pt' ? 'selected' : ''}>Portuguese</option>
                    <option value="ru" ${state.bttrLanguage === 'ru' ? 'selected' : ''}>Russian</option>
                  </select>
                </div>
              </div>

              <div id="wiz-aio-top-options" style="display: ${state.aioPosterService === 'top' ? 'block' : 'none'};">
                <label class="wiz-label" style="margin-bottom:0;">Top Posters API Key
                  <input type="text" id="wiz-aio-top-key" class="wiz-input" placeholder="Enter Top Posters Key..." value="${escapeAttr(state.aioTopPosterKey || '')}" autocomplete="off">
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="wiz-btn-row" style="margin-top:16px;">
          <button class="wiz-secondary" id="wiz-aio-poster-back"><span>← Back</span></button>
          <button class="wiz-primary" id="wiz-aio-poster-continue"><span>Continue →</span></button>
        </div>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.aioSubStep = 'trakt'; render(); });
    el('wiz-aio-poster-back').addEventListener('click', () => { state.aioSubStep = 'trakt'; render(); });
    el('wiz-aio-poster-continue').addEventListener('click', () => { state.aioSubStep = 'debrid'; render(); });
    updatePosterPreview();
  }

  function renderAioDebrid(panel) {
    panel.innerHTML = `
      ${header('AIO Streams Setup', 'Pick your debrid service — this is what actually fetches and streams your files.', true, 'aio-debrid')}
      <div class="wiz-body">
        <div class="wiz-section">
          <h4 style="margin:0 0 10px 0; font-size:1.05rem;">${glossaryTip('debrid', 'Debrid')} Service</h4>
          <p class="wiz-note" style="margin-bottom:10px;">Select your Debrid service and provide the API key for high-speed streaming.</p>
          <label class="wiz-label">Debrid Provider
            <select id="wiz-aio-debrid-type" class="wiz-input" style="margin-bottom:12px;">
              <option value="torbox" ${(state.aioDebridType || 'torbox') === 'torbox' ? 'selected' : ''}>Torbox</option>
              <option value="realdebrid" ${state.aioDebridType === 'realdebrid' ? 'selected' : ''}>Real-Debrid</option>
              <option value="alldebrid" ${state.aioDebridType === 'alldebrid' ? 'selected' : ''}>AllDebrid</option>
              <option value="premiumize" ${state.aioDebridType === 'premiumize' ? 'selected' : ''}>Premiumize</option>
            </select>
          </label>
          <label class="wiz-label" style="margin-bottom:0;">Debrid API Key <span class="wiz-hint">(optional)</span>
            <span class="wiz-input-wrap">
              <input type="password" id="wiz-aio-debrid-key" class="wiz-input" placeholder="Enter API Key..." value="${escapeAttr(state.aioDebridKey || '')}" autocomplete="off" spellcheck="false">
              <button type="button" class="wiz-input-toggle" id="wiz-aio-debrid-toggle">Show</button>
            </span>
          </label>
          <div class="wiz-note" style="margin-top:10px;">Don't use a debrid service? Leave this blank — your scrapers will fall back to direct/uncached results instead of cached debrid links.</div>
          <div class="wiz-torbox-promo" id="wiz-aio-torbox-promo" style="margin-top:14px; ${(state.aioDebridType || 'torbox') === 'torbox' ? '' : 'display:none;'}">
            <div class="wiz-torbox-promo-copy">
              <span class="wiz-torbox-promo-title">Don't have Torbox yet?</span>
              <span class="wiz-torbox-promo-text">Sign up with my link for a discount. It helps keep this project running.</span>
            </div>
            <a href="https://torbox.app/subscription?referral=691a76aa-4d6e-40c0-8625-ffe4e4189ae4" target="_blank" rel="noopener" class="wiz-torbox-promo-btn"><span>Get Torbox</span><span class="wiz-torbox-promo-arrow">→</span></a>
            <a href="https://torbox.app/subscription" target="_blank" rel="noopener" class="wiz-torbox-promo-skip">or sign up without a referral code</a>
          </div>
        </div>
        <div class="wiz-error" id="wiz-aio-error" style="display:none; margin-top:15px;"></div>
        <div class="wiz-btn-row" style="margin-top:16px;">
          <button class="wiz-secondary" id="wiz-aio-debrid-back"><span>← Back</span></button>
          <button class="wiz-primary" id="wiz-aio-debrid-continue"><span>Continue →</span></button>
        </div>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.aioSubStep = 'poster'; render(); });
    el('wiz-aio-debrid-back').addEventListener('click', () => { state.aioSubStep = 'poster'; render(); });
    const debridToggle = el('wiz-aio-debrid-toggle');
    if (debridToggle) debridToggle.addEventListener('click', () => {
      const key = el('wiz-aio-debrid-key');
      const show = key.type === 'password';
      key.type = show ? 'text' : 'password';
      debridToggle.textContent = show ? 'Hide' : 'Show';
    });
    el('wiz-aio-debrid-continue').addEventListener('click', () => {
      state.aioSubStep = 'scraper';
      render();
    });
  }

  function renderAioScraper(panel) {
    panel.innerHTML = `
      ${header('AIO Streams Setup', 'Choose one or more scraper engines and how their results are prioritized.', true, 'aio-scraper')}
      <div class="wiz-body">
        <div class="wiz-section">
          <h4 style="margin:0 0 10px 0; font-size:1.05rem;">${glossaryTip('scraper', 'Scraper')} Provider</h4>
          <p class="wiz-note" style="margin-bottom:10px;">Pick at least one - Torrentio alone works great if you're not sure. Running more than one adds redundancy.</p>
          <label class="wiz-addon-row">
            <input type="checkbox" class="wiz-addon-check" id="wiz-aio-scraper-torrentio" data-scraper="torrentio" ${(state.aioScraperTypes || ['torrentio']).includes('torrentio') ? 'checked' : ''}>
            <span class="wiz-addon-text">
              <span class="wiz-addon-name">Torrentio</span>
              <span class="wiz-addon-note">Finds the most streams. Recommended as a baseline.</span>
            </span>
          </label>
          <label class="wiz-addon-row">
            <input type="checkbox" class="wiz-addon-check" id="wiz-aio-scraper-comet" data-scraper="comet" ${(state.aioScraperTypes || ['torrentio']).includes('comet') ? 'checked' : ''}>
            <span class="wiz-addon-text">
              <span class="wiz-addon-name">Comet</span>
              <span class="wiz-addon-note">A second scraper for broader coverage.</span>
            </span>
          </label>
          <label class="wiz-addon-row">
            <input type="checkbox" class="wiz-addon-check" id="wiz-aio-scraper-mediafusion" data-scraper="mediafusion" ${(state.aioScraperTypes || ['torrentio']).includes('mediafusion') ? 'checked' : ''}>
            <span class="wiz-addon-text">
              <span class="wiz-addon-name">MediaFusion</span>
              <span class="wiz-addon-note">A third scraper for extra redundancy.</span>
            </span>
          </label>

          <label class="wiz-label" style="margin-top:16px;">Quality preset
            <select id="wiz-aio-scraper-preset" class="wiz-input">
              <option value="safe" ${(state.aioScraperPreset || 'seeders') === 'safe' ? 'selected' : ''}>Safe Start</option>
              <option value="quality" ${state.aioScraperPreset === 'quality' ? 'selected' : ''}>Best Quality</option>
              <option value="lowBandwidth" ${state.aioScraperPreset === 'lowBandwidth' ? 'selected' : ''}>Low Bandwidth</option>
              <option value="maximum" ${state.aioScraperPreset === 'maximum' ? 'selected' : ''}>Maximum</option>
              <option value="firehose" ${state.aioScraperPreset === 'firehose' ? 'selected' : ''}>Firehose</option>
              <option value="seeders" ${(state.aioScraperPreset || 'seeders') === 'seeders' ? 'selected' : ''}>Sort by Seeders</option>
            </select>
          </label>
          <div class="wiz-note" style="margin-bottom:8px;">${escapeHtml(PRESET_DESCRIPTIONS[state.aioScraperPreset || 'seeders'] || '')}</div>
          <div class="wiz-note" style="margin-bottom:8px;">This controls which results are kept (resolution, count, filters) — the order they're shown in is set by "Sort streams by" below.</div>

          <div class="wiz-label" style="margin-top:16px;">Which scraper's results should come first?</div>
          <div class="wiz-note" style="margin-bottom:8px;">Order matters when scrapers disagree — the one nearer the top wins.</div>
          <div id="wiz-aio-scraper-priority-list">${renderReorderList(aioScraperPriorityOrder(), SCRAPER_DISPLAY_NAMES, 'wiz-aio-scraper-priority')}</div>

          <div class="wiz-label" style="margin-top:16px;">Sort streams by</div>
          <div class="wiz-note" style="margin-bottom:8px;">Top criterion wins first; ties fall through to the next one down.</div>
          <div id="wiz-aio-sort-order-list">${renderReorderList(state.aioSortOrder, SORT_CRITERIA_DISPLAY_NAMES, 'wiz-aio-sort-order')}</div>
        </div>
        <div class="wiz-btn-row" style="margin-top:16px;">
          <button class="wiz-secondary" id="wiz-aio-scraper-back"><span>← Back</span></button>
          <button class="wiz-primary" id="wiz-aio-scraper-continue"><span>Continue →</span></button>
        </div>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.aioSubStep = 'debrid'; render(); });
    el('wiz-aio-scraper-back').addEventListener('click', () => { state.aioSubStep = 'debrid'; render(); });
    el('wiz-aio-scraper-continue').addEventListener('click', () => { state.aioSubStep = 'format'; render(); });

    const aioPresetEl = el('wiz-aio-scraper-preset');
    if (aioPresetEl) aioPresetEl.addEventListener('change', () => {
      state.aioScraperPreset = aioPresetEl.value;
      render();
    });

    // render() rebuilds this whole step, so restore scroll position after —
    // otherwise every reorder click snaps the form back to the top.
    const rerenderKeepingScroll = () => {
      const scroller = panel.closest('.wizard-panel') || panel;
      const top = scroller.scrollTop;
      render();
      const fresh = document.querySelector('.wizard-panel') || panel;
      fresh.scrollTop = top;
    };
    const priorityListEl = el('wiz-aio-scraper-priority-list');
    if (priorityListEl) priorityListEl.querySelectorAll('.reorder-arrow').forEach((btn) => {
      btn.addEventListener('click', () => {
        const order = aioScraperPriorityOrder();
        const key = btn.closest('.wiz-reorder-row').dataset.key;
        const idx = order.indexOf(key);
        moveItem(order, idx, Number(btn.dataset.dir));
        state.aioScraperPriority = order;
        rerenderKeepingScroll();
      });
    });
    const sortListEl = el('wiz-aio-sort-order-list');
    if (sortListEl) sortListEl.querySelectorAll('.reorder-arrow').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.closest('.wiz-reorder-row').dataset.key;
        const idx = state.aioSortOrder.indexOf(key);
        moveItem(state.aioSortOrder, idx, Number(btn.dataset.dir));
        rerenderKeepingScroll();
      });
    });
  }

  function renderAioFormat(panel) {
    panel.innerHTML = `
      ${header('AIO Streams Setup', 'Last step — how metadata is formatted and displayed.', true, 'aio-format')}
      <div class="wiz-body">
        <div class="wiz-section">
          <h4 style="margin:0 0 10px 0; font-size:1.05rem;">Formatting & Language</h4>
          <div class="wiz-formatter-studio">
            <div class="wiz-formatter-preview">
              <div class="wiz-formatter-preview-name" id="wiz-formatter-preview-name">${escapeHtml(trimPreviewLines((FORMATTER_PREVIEW_EXAMPLES[state.aioFormatter] || FORMATTER_PREVIEW_EXAMPLES.tamtaro).name))}</div>
              <div class="wiz-formatter-preview-desc" id="wiz-formatter-preview-desc">${escapeHtml(trimPreviewLines((FORMATTER_PREVIEW_EXAMPLES[state.aioFormatter] || FORMATTER_PREVIEW_EXAMPLES.tamtaro).description))}</div>
            </div>
            <div class="wiz-formatter-studio-settings">
              <label class="wiz-label" style="margin-bottom:0;">Formatter
                <select id="wiz-aio-formatter" class="wiz-input" style="margin-bottom:0;">
                  ${FORMATTER_OPTIONS.map(f => `<option value="${f.id}" ${(state.aioFormatter || 'tamtaro') === f.id ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
                </select>
              </label>
              <label class="wiz-label" style="margin-bottom:0;">Preferred Language
                <select id="wiz-aio-language" class="wiz-input" style="margin-bottom:0;">
                  <option value="en-US" ${(state.aioLanguage || 'en-US') === 'en-US' ? 'selected' : ''}>English</option>
                  <option value="es-ES" ${state.aioLanguage === 'es-ES' ? 'selected' : ''}>Spanish</option>
                  <option value="fr-FR" ${state.aioLanguage === 'fr-FR' ? 'selected' : ''}>French</option>
                  <option value="de-DE" ${state.aioLanguage === 'de-DE' ? 'selected' : ''}>German</option>
                  <option value="it-IT" ${state.aioLanguage === 'it-IT' ? 'selected' : ''}>Italian</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div class="wiz-section">
          <h4 style="margin:0 0 10px 0; font-size:1.05rem;">Editing Access</h4>
          <label class="wiz-label">Config password <span class="wiz-hint">(optional)</span>
            <input type="text" id="wiz-aio-streams-password" class="wiz-input" placeholder="KaptainsCollection" value="${escapeAttr(state.aioStreamsPassword || '')}" autocomplete="off" spellcheck="false">
          </label>
          <div class="wiz-note">Lets you sign back into your AIO Streams config later without your Nuvio login. Leave blank to use the default shown as the placeholder above.</div>
        </div>

        <div class="wiz-error" id="wiz-aio-error" style="display:none; margin-top:15px;"></div>
        <div class="wiz-btn-row" style="margin-top:16px;">
          <button class="wiz-secondary" id="wiz-aio-format-back"><span>← Back</span></button>
          <button class="wiz-primary" id="wiz-aio-generate"><span>Generate AIO Streams Build</span></button>
        </div>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.aioSubStep = 'scraper'; render(); });
    el('wiz-aio-format-back').addEventListener('click', () => { state.aioSubStep = 'scraper'; render(); });

    el('wiz-aio-generate').addEventListener('click', async () => {
      const errEl = el('wiz-aio-error');
      errEl.style.display = 'none';

      // Every field below has already been live-synced into state.* by the
      // delegated overlay input/change listener as the user typed across the
      // previous steps — no need to re-read the DOM here.
      const debridKey = state.aioDebridKey || '';
      const debridType = state.aioDebridType || 'torbox';
      const scraperTypes = state.aioScraperTypes || ['torrentio'];
      const traktToken = state.aioTraktToken || '';
      const tmdbKey = state.aioTmdbKey || '';
      const posterService = state.aioPosterService;
      const rpdbTheme = state.aioRpdbTheme;
      const rpdbKey = state.aioRpdbKey || '';
      const topPosterKey = state.aioTopPosterKey || '';

      let bttrUrl = '';
      if (posterService === 'bttr') {
        bttrUrl = buildBttrUrl('{imdb_id}', {
          quality: state.bttrQuality, genre: state.bttrGenre, rating: state.bttrRating,
          age: state.bttrAge, source: state.bttrSource, lang: state.bttrLanguage,
        });
        state.bttrUrl = bttrUrl;
      }

      if (!tmdbKey) {
        errEl.textContent = 'TMDB API Key is required for AIO Streams.';
        errEl.style.display = 'block';
        state.aioSubStep = 'trakt';
        state.aioForYouStep = 'metadata';
        render();
        return;
      }

      state.pushingLabel = 'Generating AIO Metadata Instances & Building AIO Streams...';
      go('pushing');

      try {
        const build = await generateAIOStreamsBuild(debridType, debridKey, rpdbKey, rpdbTheme, posterService, scraperTypes, traktToken, tmdbKey, bttrUrl, topPosterKey);
        state.aioManifestUrl = build.aioStreamsUrl;
        if (isForYouProviderOn('trakt')) state.traktApplied = true;
        if (isForYouProviderOn('bingecat')) state.bingecatApplied = true;
        if (isForYouProviderOn('mdblist')) state.mdblistForYouApplied = true;
        state.streamingApplied = true; // We set up streaming in AIO Streams natively

        if (build.warningMsg && typeof showToast === 'function') {
          showToast(build.warningMsg, 'info');
        }

        // Push AIO Streams transparently to Stremio via Nuvio! Poster settings are
        // already baked into every AIO Metadata instance, so no separate addon needed.
        const addonsToInstall = [{ name: 'AIO Streams', url: build.aioStreamsUrl }];
        try {
            await window.NuvioPush.installAddons(state.token, state.targetProfileId, addonsToInstall);
        } catch(e) {
            console.error("Failed to push addons", e);
        }

        // Also setup Torbox natively in Nuvio so the UI registers it properly
        if (debridType === 'torbox' && debridKey) {
          try {
            await window.NuvioPush.setupTorbox(state.token, state.targetProfileId, debridKey, SETTINGS_PLATFORMS);
            state.torboxApplied = true;
          } catch (e) {
            console.error("Failed to link Torbox natively:", e);
          }
        }

        // The TMDB key is injected into every AIO Metadata instance above, but
        // any folder that isn't routed through AIO Metadata still resolves
        // natively in Nuvio and needs the key there too.
        if (tmdbKey) {
          try {
            await window.NuvioPush.applyProfileSettings(state.token, state.targetProfileId, SETTINGS_PLATFORMS, { tmdbKey });
            state.tmdbApplied = true;
          } catch (e) {
            console.error("Failed to apply TMDB key to Nuvio profile:", e);
          }
        }

        // Offer native Torbox Instant as a backup path alongside AIO Streams,
        // unless we already just natively linked Torbox above as the chosen
        // debrid provider (no point offering to set up what's already set up).
        if (debridType === 'torbox') {
          afterStreaming();
        } else {
          state.aioSubStep = 'torbox-offer';
          go('aio-setup'); // state.step is currently 'pushing' — hop back so the dispatcher routes here
        }
      } catch (err) {
        state.errorMsg = (err && err.message) || String(err);
        go('error');
      }
    });
  }

  function renderAioTorboxOffer(panel) {
    panel.innerHTML = `
      ${header('One More Thing', '', false)}
      <div class="wiz-body wiz-streaming-prompt">
        <p class="wiz-prompt-heading">Also set up Torbox Instant as a native backup?</p>
        <p class="wiz-note">AIO Streams already handles your streaming. Linking Torbox Instant directly in Nuvio too adds a faster native fallback with its own scrapers (Torrentio, Comet, MediaFusion) if AIO Streams ever has trouble.</p>
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-aio-torbox-skip"><span>No, I'm done</span></button>
          <button class="wiz-primary" id="wiz-aio-torbox-yes"><span>Yes, set it up</span></button>
        </div>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    el('wiz-aio-torbox-skip').addEventListener('click', () => afterStreaming());
    el('wiz-aio-torbox-yes').addEventListener('click', () => {
      // Reuses Native Mode's own Torbox + scraper-addons flow verbatim.
      state.streamingSubStep = 'torbox';
      go('streaming');
    });
  }

  // ---- AIO catalog ID/bucketing helpers ----
  // The Studio publishes a comprehensive catalog template (TMDB discover
  // params / Trakt list metadata for every folder except "For You", which is
  // visitor-specific and personalized below instead) alongside the Native
  // database on every publish. We filter/group from that instead of
  // re-deriving discover params ourselves — this only needs to (a) group
  // matched entries into per-visitor instance buckets and (b) look a native
  // source up in the template by title, since a couple of the Studio's own
  // branches (Film Collections, person-discover catalogs) can resolve to
  // different ID shapes depending on its own Trakt registry — a title lookup
  // sidesteps needing to reproduce that ambiguity client-side.

  function aioCleanSlug(title) {
    if (!title) return '';
    return title.toLowerCase().trim()
      .replace(/[^a-z0-9\s_]/g, '')
      .replace(/[\s_]+/g, '_');
  }

  function aioBuildTemplateIndex(template) {
    const index = new Map();
    (template || []).forEach((entry) => {
      index.set(`${entry.collectionTitle}|||${entry.folderTitle}|||${entry.sourceTitle}`, entry);
    });
    return index;
  }

  function aioTemplateLookup(templateIndex, colTitle, folderTitle, sourceTitle) {
    return templateIndex.get(`${colTitle}|||${folderTitle}|||${sourceTitle}`) || null;
  }

  // Re-adds the constant boilerplate fields the published template strips out
  // to stay small, producing a full AIO Metadata catalog config entry.
  function aioCatalogConfigEntry(templateEntry) {
    // Matches AIO_PRESET_JSON's minimal shape as closely as possible —
    // `metadata` is the one addition, since it's load-bearing (it's what
    // tells AIO Metadata which TMDB discover query or Trakt list to actually
    // run; the "For You" shorthand catalog types don't need it because AIO
    // Metadata already knows how to resolve those internally). NOTE:
    // `genreSelection`/`sort`/`order`/`cacheTTL`/`enableRatingPosters` were
    // dropped as an initial guess at fixing "Unavailable catalog" in Nuvio,
    // but a required `genre` extra turned out to be normal, already-working
    // behavior in Kaptain's own live production catalogs too — so that
    // wasn't the actual bug. Kept simplified since it's harmless, but the
    // real cause is still under investigation.
    return {
      id: templateEntry.id,
      name: templateEntry.name,
      type: templateEntry.type,
      source: templateEntry.source,
      enabled: true,
      showInHome: false,
      displayType: templateEntry.type,
      metadata: templateEntry.metadata
    };
  }

  // Runs up to `limit` calls to fn concurrently instead of firing every item
  // at once — a full-collection visitor can trigger up to ~14 AIO Metadata
  // instance-creation calls against 3 shared community hosts, up from a
  // single call previously; an unthrottled burst risks host rate-limiting.
  async function aioMapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let cursor = 0;
    async function worker() {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await fn(items[i], i);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  async function generateAIOStreamsBuild(debridType, debridKey, rpdbKey, rpdbTheme, posterService, scraperTypes, traktToken, tmdbKey, bttrUrl, topPosterKey) {
    // User-chosen password for both the AIO Metadata and AIO Streams saves below,
    // so they only ever need to remember one credential to self-edit this setup later.
    // Written back to state (even when defaulted) so the Done screen can show
    // exactly what was actually used, not just what the user typed.
    const aioStreamsPassword = (state.aioStreamsPassword || '').trim() || 'KaptainsCollection';
    state.aioStreamsPassword = aioStreamsPassword;

    // 0. Fetch the Studio's published catalog template (everything except
    // "For You"). Missing/unreachable just means every non-"For You" folder
    // falls back to native routing below — not a fatal error.
    let aioTemplate = [];
    try {
      // Cache-busted like every other asset on the page. Without this the browser
      // or CDN can serve a stale copy — and a stale/missing template is silent
      // poison: every lookup below misses, every source drops off AIO routing, and
      // the run ends with one lonely "For You" instance and mangled sorting.
      const templateRes = await fetch('Kaptain_Catalog_Template.json?v=' + (window.KAPTAIN_ASSET_VERSION || Date.now()));
      if (templateRes.ok) aioTemplate = await templateRes.json();

      // Refuse to continue on a template we can't trust. Failing loudly here is far
      // better than silently producing a broken multi-instance setup the visitor
      // then has to install and discover is wrong.
      if (!Array.isArray(aioTemplate) || aioTemplate.length === 0) {
        throw new Error('Could not load the catalog template (HTTP ' + templateRes.status + '). ' +
          'AIO Streams setup needs it to route catalogs across instances. Please refresh and try again.');
      }
      const __withInst = aioTemplate.filter((e) => e && e.instId).length;
      if (__withInst / aioTemplate.length < 0.5) {
        throw new Error('The catalog template looks out of date (' + __withInst + ' of ' + aioTemplate.length +
          ' entries have instance routing). Please hard-refresh the page and try again.');
      }
    } catch (e) {
      console.warn('Could not load AIO catalog template — non-"For You" folders will stay on native routing:', e);
    }
    const templateIndex = aioBuildTemplateIndex(aioTemplate);

    // Read the visitor's selection once and reuse the same reference for both
    // gathering catalogs below and the final repoint pass further down, so
    // both passes are guaranteed to agree on exactly the same sources.
    const collections = window.KaptainExport.assembleFilteredDatabase();

    // Merge whichever "For You" provider(s) are checked into the folder's
    // sources right now, before anything below reads "For You" off
    // `collections` — the catalog-gathering pass, the repoint pass, and the
    // final push all reuse this same reference, so doing the merge here
    // keeps every one of them in agreement about what "For You" actually is.
    applyForYouSources(collections);

    // 1. Gather "For You" (Trakt/MDBList, already addon-shaped) catalogs —
    // this generic filter picks up whichever combination of Trakt/MDBList
    // sources are present with no changes needed, since both ride the same
    // addonId placeholder.
    const allCatalogs = collections.flatMap(c =>
      (c.folders || []).flatMap(f => (f.sources || []).filter(s => s.provider === 'addon' && s.addonId === 'aio-metadata').map(s => s.catalogId))
    );
    const uniqueCatalogs = [...new Set(allCatalogs)];
    // If no catalogs were found at all, fall back to the 4 default Trakt
    // catalogs — but only when Trakt is actually checked. For Bingecat/
    // MDBList-only selections, an empty result here is either expected
    // (Bingecat's sources aren't "aio-metadata"-shaped) or means "For You"
    // wasn't selected at all — provisioning a Trakt instance nobody asked
    // for would be wrong either way.
    if (uniqueCatalogs.length === 0 && isForYouProviderOn('trakt')) {
      uniqueCatalogs.push('trakt.watchlist.movies', 'trakt.watchlist.series', 'trakt.recommendations.movies', 'trakt.recommendations.shows');
    }
    const traktCatalogs = uniqueCatalogs;

    // 2. Gather every other (generic, native) selected source and match it
    // against the published template, grouped by its production-equivalent
    // instance bucket. Sources with no template match (template staleness —
    // e.g. a folder added after the last publish) are left on native routing.
    const genericGroups = new Map(); // instId -> Map<catalogId, templateEntry>
    collections.forEach((c) => {
      (c.folders || []).forEach((f) => {
        (f.sources || []).forEach((s) => {
          if (s.provider === 'addon') return; // "For You" placeholders, handled above
          const entry = aioTemplateLookup(templateIndex, c.title, f.title, s.title);
          if (!entry) {
            console.warn(`[AIO Streams] No catalog template entry for "${c.title} / ${f.title} / ${s.title}" — leaving it on native routing.`);
            return;
          }
          // instId now travels with the entry itself, resolved once at
          // publish time by Studio's single canonical bucket router
          // (aio_instance_router.cjs) — no client-side rule copy to drift.
          const instId = entry.instId || '10';
          if (!genericGroups.has(instId)) genericGroups.set(instId, new Map());
          // Keyed by id+type, not id alone — a movie-type and series-type
          // source can legitimately share the same underlying Trakt list id
          // (e.g. "Top 10 Movies"/"Top 10 Series" for the same streaming
          // service), and Stremio's own catalog addressing is (type, id)
          // together, not id alone. Keying by id alone here silently dropped
          // whichever variant was processed first in a bucket, since it never
          // made it into the catalog list actually sent to AIO Metadata.
          genericGroups.get(instId).set(`${entry.id}::${entry.type}`, entry);
        });
      });
    });

    const RELIABLE_TRAKT_HOST = 'https://aiometadata.viren070.me/';
    const CANDIDATE_HOSTS = [
      'https://aiometadata.viren070.me/',
      'https://aiometadatafortheweebs.midnightignite.me/',
      'https://aiometadata.elfhosted.com/'
    ];

    // Ping each host's base manifest to see which are actually responding
    // right now, so generic chunks only round-robin across hosts that are
    // currently up — mirrors the health-check the standalone "For You connect"
    // flow already uses (`checkAioMetadataInstances()` further up in this file),
    // generalized to return every alive host instead of just the fastest one,
    // since multiple chunks may need spreading across them. A host that's
    // hard-down (not just transiently slow) would otherwise fail every single
    // chunk assigned to it regardless of the per-chunk retry logic below.
    state.pushingLabel = 'Checking AIO Metadata host availability...';
    render();
    const hosts = await (async () => {
      const results = await Promise.all(CANDIDATE_HOSTS.map(async (url) => {
        try {
          const res = await fetch(url + 'manifest.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
          return res.ok ? url : null;
        } catch (e) {
          return null;
        }
      }));
      const alive = results.filter(Boolean);
      return alive.length ? alive : [CANDIDATE_HOSTS[0]];
    })();

    // Each chunk becomes its own separate personal AIO Metadata instance.
    // Trakt catalogs all come from the same account/token, so there's no
    // reason to scatter them the way large TMDB-discover sets get chunked to
    // stay under each instance's catalog ceiling — keep them together in
    // one instance, and always provision that instance on
    // aiometadata.viren070.me: round-robining Trakt catalogs across the other
    // two hosts left most of "For You" unauthenticated, since only this host
    // reliably carries a Trakt token through the auto-provisioning API
    // (confirmed against a real account). Generic (non-Trakt) buckets are
    // chunked by their computed production-equivalent instance id — a
    // semantically meaningful grouping (1-14 depending on what's selected) —
    // but any bucket over MAX_CATALOGS_PER_INSTANCE gets split further below,
    // since a visitor's selected subset size varies run to run and can land
    // combined categories (e.g. Genres + By Decade share one production
    // instance) well past what a single instance can hold.
    //
    // 200 is ElfHosted's documented cap (see the manual host picker further
    // down: "ElfHosted (Reliable, 200 Catalog Limit)" vs. 250 for the two
    // community hosts) — using the stricter number means a chunk this size is
    // safe on any of the 3 hosts, so host assignment never has to reason
    // about which host tolerates which chunk size. Production's own pipeline
    // hit this same wall by hand once (International Cinema was split out of
    // instance 10 specifically because it "grew past the 200-catalog
    // ceiling") — this generalizes that fix so it happens automatically for
    // any oversized bucket instead of needing to be hand-tuned per category.
    const MAX_CATALOGS_PER_INSTANCE = 200;

    const chunks = []; // { kind: 'foryou', catalogIds } | { kind: 'generic', instId, entries }
    const chunkHosts = [];
    if (traktCatalogs.length) {
      // Trakt and MDBList catalogs get gathered by the same generic
      // addonId==="aio-metadata" filter above and can coexist in the same
      // chunk (their id namespaces, "trakt.*" / "mdblist.*", never collide) -
      // one "foryou" kind covers trakt-only, mdblist-only, and combined
      // selections uniformly, filtered against the union template below.
      chunks.push({ kind: 'foryou', catalogIds: traktCatalogs });
      chunkHosts.push(RELIABLE_TRAKT_HOST);
    }
    [...genericGroups.keys()].sort().forEach((instId) => {
      const entries = [...genericGroups.get(instId).values()];
      for (let i = 0; i < entries.length; i += MAX_CATALOGS_PER_INSTANCE) {
        chunks.push({ kind: 'generic', instId, entries: entries.slice(i, i + MAX_CATALOGS_PER_INSTANCE) });
        chunkHosts.push(hosts[chunkHosts.length % hosts.length]);
      }
    });

    // +2 for provisioning AIO Streams itself and the final collection
    // re-push, on top of one step per AIO Metadata instance being created.
    state.pushingTotal = chunks.length + 2;
    state.pushingCurrent = 0;
    state.pushingLabel = `Creating AIO Metadata instances (0 of ${chunks.length})...`;
    render();

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // A chunk's instance-creation call gets a few retries with backoff before
    // it's treated as failed — mirrors nuvio-push.js's applyProfileSettings
    // pattern. Community hosts have never had to absorb concurrent requests
    // from this flow before (previously only one instance was ever created,
    // sequentially), so a transient blip here is expected occasionally.
    const saveAioMetadataConfig = async (host, aioConfig) => {
      let lastErr = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const res = await fetch(host + 'api/config/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: aioConfig, password: aioStreamsPassword })
          });
          if (res.ok) return await res.json();
          lastErr = new Error(`Failed to generate AIO Metadata instance on ${host} (HTTP ${res.status})`);
        } catch (e) {
          lastErr = e;
        }
        await sleep(700 * (attempt + 1));
      }
      throw lastErr;
    };

    // A chunk that fails after retries is not fatal to the rest of the run —
    // it returns null instead of throwing, so the other chunks (and "For
    // You") still go through; its sources simply stay on native routing,
    // exactly like a source missing from the catalog template does above.
    const aioChunkResults = await aioMapWithConcurrency(chunks, 3, async (chunk, index) => {
      const host = chunkHosts[index];
      const aioConfig = JSON.parse(AIO_PRESET_JSON);
      if (chunk.kind === 'foryou') {
        // Union-filter against both Trakt's and MDBList's descriptor
        // templates together - filtering AIO_PRESET_JSON's Trakt-only array
        // against MDBList ids used to always produce an empty array (the
        // "Unavailable catalog" bug); concatenating both templates first
        // means a chunk can now safely contain trakt.* ids, mdblist.* ids,
        // or both at once. Any future "aio-metadata"-riding provider just
        // needs its own descriptor template appended here.
        const unionTemplate = [...JSON.parse(AIO_PRESET_JSON).catalogs, ...MDBLIST_CATALOG_TEMPLATE];
        aioConfig.catalogs = labelForYouCatalogNames(unionTemplate.filter(c => chunk.catalogIds.includes(c.id)));
      } else {
        aioConfig.catalogs = chunk.entries.map(aioCatalogConfigEntry);
      }

      if (!aioConfig.apiKeys) aioConfig.apiKeys = {};

      // Inject Digital Release Filter to remove titles not available outside
      // theaters — flat top-level fields on the config, not nested under a
      // `settings` object (confirmed against real exported AIO Metadata
      // instance configs; the old nested write was a silent no-op).
      aioConfig.hideUnreleasedDigital = true;
      aioConfig.hideUnreleasedShows = true;

      // AIO mode provisions one AIO Metadata instance per chunk, and every
      // instance exposes its own search catalog by default (confirmed in
      // cedya77/aiometadata's source, addon/lib/getManifest.ts: search
      // catalogs are gated on `config.search?.enabled ?? true`) — with
      // multiple instances installed, that means duplicate search results in
      // Nuvio. Keep search on for exactly one designated primary instance
      // (chunk index 0 — the "For You" chunk when present, otherwise
      // whichever generic chunk happens to be first) and turn it off on
      // every other chunk. Native Mode only ever provisions one instance, so
      // this never applies there.
      if (index > 0) {
        aioConfig.search = { enabled: false };
      }

      // The Trakt token only matters for the Trakt chunk, but it's harmless to
      // include on every instance in case a future chunk ever mixes catalog types.
      if (traktToken) {
        aioConfig.apiKeys.traktTokenId = traktToken;
      }

      // Trakt and MDBList can now both be checked at once, so this apiKey
      // gets set independently of (and can coexist with) the traktTokenId
      // branch above — this whole build only runs when the visitor actually
      // has "For You" selected with at least one provider checked.
      if (isForYouProviderOn('mdblist') && state.forYouMdblistKey) {
        aioConfig.apiKeys.mdblist = state.forYouMdblistKey;
        aioConfig.mdblistWatchTracking = true;
      }

      // Inject TMDB Key into every instance if provided to speed up metadata resolution
      if (tmdbKey) {
        aioConfig.apiKeys.tmdbApiKey = tmdbKey;
      }
      // TVDB is an alternate metadata source alongside TMDB — apiKeys is an
      // open bag AIO Metadata reads selectively, so this is a low-risk
      // addition even without confirming their schema explicitly supports
      // it: if unrecognized, it's just ignored rather than breaking anything.
      if (state.aioTvdbKey) {
        aioConfig.apiKeys.tvdb = state.aioTvdbKey;
      }

      // Apply the user's poster/ratings provider to every instance, since whichever
      // one answers a given meta request needs the poster override present.
      applyPosterConfig(aioConfig, posterService, rpdbTheme, rpdbKey, bttrUrl, topPosterKey);

      let url = null;
      try {
        const data = await saveAioMetadataConfig(host, aioConfig);
        // AIO Metadata's manifest lives at /stremio/{uuid}/manifest.json (no
        // password segment — that's AIO Streams' own scheme, not this one).
        // installUrl is trusted when present; the fallback must match that
        // same path shape or the resulting instance silently has no catalogs.
        const candidateUrl = data.installUrl || (host + 'stremio/' + (data.userUUID || data.uuid) + '/manifest.json');
        const alive = await checkManifestAlive(candidateUrl);
        if (alive.ok === false) {
          console.warn(`[AIO Streams] Instance on ${host} was created but its manifest isn't reachable — its folders will stay on native routing:`, alive.reason);
        } else {
          url = candidateUrl;
        }
      } catch (e) {
        console.warn(`[AIO Streams] Giving up on an AIO Metadata instance on ${host} after retries — its folders will stay on native routing:`, e);
      }

      state.pushingCurrent += 1;
      state.pushingLabel = `Creating AIO Metadata instances (${state.pushingCurrent} of ${chunks.length})...`;
      render();

      return { chunk, url };
    });

    // Only chunks that actually got an instance participate in the AIO
    // Streams presets and the final repoint pass — everything else (built
    // fresh here rather than before provisioning, since we only now know
    // which chunks actually succeeded) leaves its sources on native routing.
    const successfulChunks = aioChunkResults.filter((r) => r.url);
    const failedChunkCount = chunks.length - successfulChunks.length;
    const aioMetadataUrls = successfulChunks.map((r) => r.url);

    // AIO Streams namespaces every catalog it proxies from a preset with
    // "<instanceId>e3b0.<catalogId>" (confirmed live). Track that per catalog
    // so the pushed collection's sources can be rewritten to match once the
    // AIO Streams addon is actually installed, further down.
    const catalogIdToPrefixedId = {};
    successfulChunks.forEach(({ chunk }, index) => {
      const ids = chunk.kind === 'foryou' ? chunk.catalogIds : chunk.entries.map(e => e.id);
      ids.forEach((catalogId) => {
        catalogIdToPrefixedId[catalogId] = `aiometa-${index}e3b0.${catalogId}`;
      });
    });

    // 2. Configure AIO Streams Payload
    const selectedScrapers = new Set(scraperTypes && scraperTypes.length ? scraperTypes : ['torrentio']);
    const aioPreset = SCRAPER_PRESETS[state.aioScraperPreset || 'seeders'] || SCRAPER_PRESETS.seeders;
    // No debrid key = no cached results to filter to — fall back to AIO
    // Streams' own uncached/P2P mode (confirmed supported: AIOStreams.json's
    // reference config ships with `services` empty by default, and its
    // `includeP2P` field explicitly flips to true when no service is set).
    const hasDebrid = !!debridKey;
    // Preset builders, keyed by scraper type so they can be pushed in the
    // user's chosen priority order below instead of a fixed sequence —
    // array position is AIO Streams' only ordering signal (no explicit
    // priority field exists in its config schema).
    // All presets adhere strictly to AIOStreams addon options schema:
    // `resources` must be inside `options` so the Addon tab form loads cleanly.
    const scraperPresetBuilders = {
      torrentio: () => ({
        enabled: true,
        type: 'torrentio',
        instanceId: 'tio',
        options: {
          name: 'Torrentio',
          timeout: 7000,
          resources: ['stream'],
          providers: [],
          useMultipleInstances: false
        }
      }),
      comet: () => ({
        enabled: true,
        type: 'comet',
        instanceId: 'com',
        options: {
          name: 'Comet',
          timeout: 7000,
          resources: ['stream'],
          includeP2P: !hasDebrid,
          removeTrash: false,
          mediaTypes: []
        }
      }),
      // Shape confirmed against the community "Perfect Setup" reference
      // config (AIOStreams.json in this repo).
      mediafusion: () => ({
        enabled: true,
        type: 'mediafusion',
        instanceId: 'mdf',
        options: {
          name: 'MediaFusion',
          timeout: 7000,
          resources: ['stream'],
          useCachedResultsOnly: hasDebrid,
          enableWatchlistCatalogs: false,
          downloadViaBrowser: false,
          contributorStreams: false,
          certificationLevelsFilter: [],
          nudityFilter: [],
          mediaTypes: []
        }
      }),
    };
    const priorityOrder = (state.aioScraperPriority || []).filter((s) => selectedScrapers.has(s));
    selectedScrapers.forEach((s) => { if (!priorityOrder.includes(s)) priorityOrder.push(s); });
    const scraperPresets = priorityOrder
      .filter((s) => scraperPresetBuilders[s])
      .map((s) => scraperPresetBuilders[s]());

    // AIO Streams only picks up metadata addons through `presets` entries of
    // type 'custom' with an options.manifestUrl — confirmed against the
    // Studio's own real, working AIO Streams config, which wires its shared
    // AIOMetadata instances in exactly this way. A plain top-level `addons`
    // array is not read for catalogs at all, which produces a manifest with
    // zero catalogs — that's why "For You" (and everything else routed
    // through AIO Metadata) came back empty.
    const metadataPresets = aioMetadataUrls.map((url, index) => ({
      type: 'custom',
      instanceId: `aiometa-${index}`,
      enabled: true,
      options: {
        name: `AIO Metadata ${index + 1}`,
        manifestUrl: url,
        timeout: 7000,
        resources: ['catalog', 'meta'],
        mediaTypes: [],
        libraryAddon: false,
        resultPassthrough: false
      }
    }));

    // Map selected resolutions to AIOStreams preferred/excluded lists
    const allResolutions = ['2160p', '1440p', '1080p', '720p', '576p', '480p', '360p', '240p', '144p', 'Unknown'];
    const resKeyMap = { r2160p: '2160p', r1440p: '1440p', r1080p: '1080p', r720p: '720p', r576p: '576p', r480p: '480p', r360p: '360p', r240p: '240p', unknown: 'Unknown' };
    const allowedRes = (aioPreset.resolutions || []).map((r) => resKeyMap[r]).filter(Boolean);
    const excludedRes = allowedRes.length ? allResolutions.filter((r) => !allowedRes.includes(r)) : [];

    const aioStreamsConfig = {
      addonName: 'Nuvio Build - AIO Streams',
      services: hasDebrid ? [
        { id: debridType, enabled: true, credentials: { apiKey: debridKey } }
      ] : [],
      posterService: 'none',
      usePosterServiceForMeta: false,
      usePosterRedirectApi: false,
      ...(tmdbKey ? { tmdbApiKey: tmdbKey } : {}),
      presets: [...scraperPresets, ...metadataPresets],
      sortCriteria: {
        global: (state.aioSortOrder || ['seeders', 'cached', 'resolution', 'size']).map((key) => ({ key, direction: 'desc' })),
        movies: [], series: [], anime: []
      },
      preferredResolutions: allowedRes.length ? allowedRes : allResolutions,
      excludedResolutions: excludedRes,
      excludedQualities: aioPreset.removeTrash ? ['CAM', 'SCR', 'TS', 'TC'] : [],
      ...(aioPreset.maxResults ? { maxResultsPerResolution: aioPreset.maxResults } : {}),
      deduplicator: {
        enabled: aioPreset.deduplicateStreams !== false
      },
      language: state.aioLanguage || 'en-US',
      formatter: { id: state.aioFormatter || 'tamtaro' },
      // AIO Metadata's own hideUnreleasedDigital/hideUnreleasedShows only
      // filter which catalog entries show up; this is AIO Streams' own,
      // separate stream-level digital-release filter (confirmed shape from
      // real exported configs), needed to also keep theatrical-only titles
      // from surfacing streams.
      digitalReleaseFilter: { enabled: true, tolerance: 0, requestTypes: [], addons: [], showInfoOnFilter: true }
    };

    const aiostreamsHosts = [
      'https://aiostreamsfortheweebsstable.midnightignite.me',
      'https://aiostreams.fortheweak.cloud'
    ];

    const CORS_PROXY = 'https://nuvio-cors-proxy.goodintentionssmp.workers.dev/';

    state.pushingLabel = 'Building your AIO Streams backend...';
    render();

    // Try hosts
    let finalUrl = null;
    for (const host of aiostreamsHosts) {
      try {
        const proxiedUrl = `${CORS_PROXY}${host}/api/v1/user`;
        const res = await fetch(proxiedUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: aioStreamsConfig, password: aioStreamsPassword })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            const outUuid = data.uuid || (data.data && data.data.uuid) || (data.user && data.user.uuid) || data.id;
            const encPwd = data.encryptedPassword || (data.data && data.data.encryptedPassword) || (data.user && data.user.encryptedPassword) || aioStreamsPassword;
            finalUrl = host + '/stremio/' + outUuid + '/' + encodeURIComponent(encPwd) + '/manifest.json';
            // Saved so the Done screen can point the user back to their own
            // AIO Streams config for further self-service editing.
            state.aioStreamsUuid = outUuid;
            state.aioStreamsHost = host;
            break;
          }
        }
      } catch (e) {
        console.log('Failed AIO Streams host', host, e);
      }
    }

    if (!finalUrl) {
      throw new Error('All AIO Streams proxies failed.');
    }

    state.pushingCurrent += 1;
    state.pushingLabel = 'Finishing up your collection...';
    render();

    // The collection was already pushed (in doPushCollection, before this
    // step ran) as the plain Native selection — "For You" pointing at addonId
    // "aio-metadata" (a placeholder, not anything actually installed) and
    // every other folder still on native Trakt/TMDB routing. What's really
    // being installed is the "AIO Streams" addon above, whose real manifest id
    // is dynamic (host+uuid based). Install it into the profile FIRST, before
    // re-pushing the collection — confirmed live that pushing catalog
    // references to an addon Nuvio doesn't know about yet gets those specific
    // references stuck as "Unavailable catalog" even after the addon is
    // installed a moment later; Nuvio doesn't appear to revisit that
    // resolution afterward (a full remove-and-reinstall of the addon didn't
    // fix already-broken references either). Then re-push with every source
    // repointed to the real installed id and its AIO-Streams-namespaced
    // catalog id — "For You" via the placeholder it already carried, every
    // other selected source via the same template lookup used to gather
    // catalogs above (reusing `collections` so both passes agree exactly on
    // what "this source" means).
    try {
      const manifestRes = await fetch(finalUrl, { signal: AbortSignal.timeout(8000) });
      const manifest = await manifestRes.json();
      const realAddonId = manifest && manifest.id;
      if (realAddonId) {
        try {
          const addonsToInstall = [{ name: 'AIO Streams', url: finalUrl }];
          if (isForYouProviderOn('bingecat') && state.bingecatManifestUrl) {
            addonsToInstall.push({ name: 'Bingecat', url: state.bingecatManifestUrl });
          }
          await window.NuvioPush.installAddons(state.token, state.targetProfileId, addonsToInstall);
          // Cinemeta was seeded earlier by ensureMetadataAddons() during the
          // initial native-shaped push (mode wasn't known yet at that point —
          // this build only runs once AIO Streams Mode is confirmed). AIO
          // Streams provides its own metadata, so a leftover Cinemeta just
          // duplicates entries on the home screen. Non-fatal: worst case it
          // stays, same as any other addon-management best-effort call here.
          try {
            await window.NuvioPush.removeAddonsByName(state.token, state.targetProfileId, 'Cinemeta');
          } catch (e) { /* non-fatal */ }
        } catch (installErr) {
          console.error('Failed to install AIO Streams addon before repointing collection:', installErr);
        }
        let patched = false;
        const repoint = (s, colTitle, folderTitle) => {
          let canonicalId = null;
          if (s.provider === 'addon' && s.addonId === 'aio-metadata') {
            canonicalId = s.catalogId; // "For You" placeholder — already its own canonical id
          } else if (s.provider === 'tmdb' || s.provider === 'trakt') {
            const entry = aioTemplateLookup(templateIndex, colTitle, folderTitle, s.title);
            canonicalId = entry ? entry.id : null;
          } else {
            return; // already addon-shaped for some other reason, or unrecognized — leave untouched
          }
          const prefixedId = canonicalId && catalogIdToPrefixedId[canonicalId];
          if (!prefixedId) return; // wasn't part of what we just provisioned — leave native
          // The already-working "For You" placeholders carry a Stremio-
          // convention `type: 'movie'|'series'` field from the start; native
          // sources instead use this app's own `mediaType: 'MOVIE'|'TV'`. A
          // repointed source needs the former — confirmed live that leaving
          // only the stale `mediaType` behind resolves movie catalogs by
          // coincidence ("MOVIE".toLowerCase() = "movie") but never resolves
          // series/TV ones ("TV".toLowerCase() = "tv" ≠ "series").
          if (!s.type) {
            s.type = s.mediaType === 'MOVIE' ? 'movie' : 'series';
          }
          s.provider = 'addon';
          s.addonId = realAddonId;
          s.catalogId = prefixedId;
          delete s.tmdbId; delete s.tmdbListId; delete s.tmdbSourceType; delete s.traktListId; delete s.filters; delete s.sortBy; delete s.mediaType;
          patched = true;
        };
        collections.forEach((c) => {
          (c.folders || []).forEach((f) => {
            (f.sources || []).forEach((s) => repoint(s, c.title, f.title));
            (f.catalogSources || []).forEach((s) => repoint(s, c.title, f.title));
          });
        });
        // Also force the push when Bingecat is checked: repoint() correctly
        // leaves Bingecat's addon-shaped sources untouched (they aren't
        // "aio-metadata"), so `patched` can stay false if the visitor checked
        // only Bingecat and nothing else needed repointing — without this
        // OR-clause that case would never get pushed at all.
        if (patched || isForYouProviderOn('bingecat')) {
          ensureCollectionDefaults(collections);
          await window.NuvioPush.pushCollections(state.token, state.targetProfileId, collections);
        }
      }
    } catch (e) {
      console.error('Failed to re-point the collection at the installed AIO Streams addon:', e);
    }

    state.pushingCurrent += 1;
    state.pushingTotal = 0; // done — later pushingLabel-only steps won't show a stale bar

    const warningMsg = failedChunkCount > 0
      ? `Heads up: ${failedChunkCount} of ${chunks.length} personal catalog instance${failedChunkCount === 1 ? '' : 's'} couldn't be created (the host was unreachable after a few tries). Those folders will use normal Nuvio browsing for now; everything else is set up.`
      : null;

    return { aioStreamsUrl: finalUrl, warningMsg };
  }

  function renderAccount(panel) {
    const minLen = state.mode === 'create' ? 8 : 6;
    const starter = state.flow === 'starter';
    const sub = starter
      ? (state.mode === 'create'
          ? "I'll set up a new account and a fresh profile, then get your streaming ready."
          : "I'll sign you in and set up streaming on whichever profile you pick.")
      : (state.mode === 'create'
          ? "Create an account, pick a profile, and your collection loads on every device."
          : "Sign in, pick a profile, and your collection loads on every device.");
    panel.innerHTML = `
      ${header('Your Nuvio Account', sub, state.flow === 'collection', 'account')}
      <div class="wiz-body">
        <div class="wiz-toggle">
          <button class="wiz-toggle-btn ${state.mode === 'create' ? 'active' : ''}" data-mode="create" aria-pressed="${state.mode === 'create'}">Create account</button>
          <button class="wiz-toggle-btn ${state.mode === 'signin' ? 'active' : ''}" data-mode="signin" aria-pressed="${state.mode === 'signin'}">Sign in</button>
        </div>

        <div class="wiz-privacy">
          <span class="wiz-privacy-icon">${ICON.lock}</span>
          <span>Your email and password go straight to Nuvio from your browser. This site is just a static page. It has no server, so nothing you type ever gets stored or seen by me.</span>
        </div>

        <label class="wiz-label">Email address
          <input type="email" id="wiz-email" class="wiz-input" placeholder="you@example.com" value="${escapeAttr(state.email)}" autocomplete="email">
        </label>
        <label class="wiz-label">Password <span class="wiz-hint">(min. ${minLen} characters)</span>
          <span class="wiz-input-wrap">
            <input type="password" id="wiz-password" class="wiz-input" placeholder="Enter your password..." value="${escapeAttr(state.password)}" autocomplete="${state.mode === 'create' ? 'new-password' : 'current-password'}">
            <button type="button" class="wiz-input-toggle" id="wiz-pw-toggle" aria-pressed="false" aria-label="Show password">Show</button>
          </span>
        </label>
        ${state.mode === 'create' ? `
        <label class="wiz-label">Profile name
          <input type="text" id="wiz-profile-name" class="wiz-input" placeholder="${DEFAULT_PROFILE_NAME}" value="${escapeAttr(state.profileName)}">
        </label>` : ''}

        <div class="wiz-error" id="wiz-error" style="display:none;"></div>

        <button class="wiz-primary" id="wiz-continue">
          <span>${state.mode === 'create' ? 'Create account & continue' : 'Sign in & continue'}</span>
        </button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    // Starter/collection-only flows have no step before account, so header()
    // above doesn't render a Back arrow for them — only wire it up when it exists.
    const accountBackBtn = el('wiz-back');
    if (accountBackBtn) accountBackBtn.addEventListener('click', () => go('devices'));
    panel.querySelectorAll('.wiz-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncInputs();
        state.mode = btn.getAttribute('data-mode');
        render();
      });
    });
    const pwToggle = el('wiz-pw-toggle');
    if (pwToggle) pwToggle.addEventListener('click', () => {
      const pw = el('wiz-password');
      if (!pw) return;
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      pwToggle.textContent = show ? 'Hide' : 'Show';
      pwToggle.setAttribute('aria-pressed', String(show));
      pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    el('wiz-continue').addEventListener('click', onAccountContinue);
  }

  function renderProfile(panel) {
    const opts = state.profiles.map((p) =>
      `<option value="${p.profile_index}" ${state.selectedProfileId === p.profile_index && !state.createNewProfile ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    ).join('');

    const starter = state.flow === 'starter';
    panel.innerHTML = `
      ${header('Choose a Profile', starter ? 'Which profile do you want set up?' : 'Where do you want your collection?', true, 'profile')}
      <div class="wiz-body">
        <label class="wiz-label">Profile
          <select id="wiz-profile-select" class="wiz-input">
            <option value="__new__" ${state.createNewProfile ? 'selected' : ''}>➕ Create a new profile (recommended)</option>
            ${opts}
          </select>
        </label>

        <div id="wiz-newprofile-wrap" class="wiz-label" style="${state.createNewProfile ? '' : 'display:none;'}">
          <span>New profile name</span>
          <input type="text" id="wiz-profile-name" class="wiz-input" placeholder="${DEFAULT_PROFILE_NAME}" value="${escapeAttr(state.profileName)}">
        </div>

        <div class="wiz-note" id="wiz-profile-note">${profileNoteText()}</div>

        <div class="wiz-error" id="wiz-error" style="display:none;"></div>

        <button class="wiz-primary" id="wiz-push"><span>${starter ? 'Continue to streaming setup' : 'Load my collection into Nuvio'}</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => go('account'));

    const select = el('wiz-profile-select');
    select.addEventListener('change', () => {
      if (select.value === '__new__') {
        state.createNewProfile = true;
        state.selectedProfileId = null;
      } else {
        state.createNewProfile = false;
        state.selectedProfileId = Number(select.value);
      }
      el('wiz-newprofile-wrap').style.display = state.createNewProfile ? '' : 'none';
      el('wiz-profile-note').innerHTML = profileNoteText();
    });
    el('wiz-push').addEventListener('click', onPush);
  }

  function profileNoteText() {
    if (state.flow === 'starter') {
      return state.createNewProfile
        ? "I'll spin up a brand-new profile, then set up streaming on it. Your existing profiles stay exactly as they are."
        : "I'll add the streaming setup to this profile. Your collection on it stays exactly as it is.";
    }
    return state.createNewProfile
      ? "I'll create a brand-new profile just for this collection. Your existing profiles stay exactly as they are."
      : "Next you'll pick exactly where these rows slot into this profile's current collection. Nothing already there gets removed.";
  }

  function renderPushing(panel) {
    const hasProgress = state.pushingTotal > 0;
    const pct = hasProgress ? Math.min(100, Math.round((state.pushingCurrent / state.pushingTotal) * 100)) : 0;
    panel.innerHTML = `
      <div class="wiz-body wiz-center">
        <div class="popup-spinner"></div>
        <h3 class="wiz-title">${escapeHtml(state.pushingLabel || 'Setting up Nuvio...')}</h3>
        ${hasProgress ? `
          <div class="wiz-push-progress" style="width:100%; max-width:320px; margin:14px auto 4px;">
            <div style="background:var(--border); border-radius:999px; height:8px; overflow:hidden;">
              <div style="background:#4caf50; height:100%; width:${pct}%; transition:width 0.3s ease;"></div>
            </div>
            <p class="wiz-sub" style="margin-top:8px;">${state.pushingCurrent} of ${state.pushingTotal} done. Please don't close or refresh this page.</p>
          </div>
        ` : `<p class="wiz-sub">Talking to Nuvio. This only takes a moment.</p>`}
      </div>`;
  }

  function renderDone(panel) {
    if (!state._telemetryFired) {
      state._telemetryFired = true;
      if (window.KaptainTelemetry) window.KaptainTelemetry.hit('deployments');
    }
    // Save push state for sync dot indicator
    try {
      const folderIds = typeof getSelectedFolderIds === 'function' ? getSelectedFolderIds() : [];
      localStorage.setItem('kaptain_last_push', JSON.stringify({
        timestamp: Date.now(),
        profileId: state.targetProfileId,
        token: state.token,
        folderIds: folderIds,
      }));
    } catch (_) {}
    const name = escapeHtml(state.resultProfileName || 'your');
    const items = [];
    const ok = (txt) => items.push(`<li class="wiz-sum-ok">${ICON.check}<span>${txt}</span></li>`);
    const todo = (txt) => items.push(`<li class="wiz-sum-todo"><span class="wiz-sum-dot">○</span><span>${txt}</span></li>`);

    ok(state.accountAction === 'created' ? 'Nuvio account created' : 'Signed in to Nuvio');
    ok(`Profile: <strong>${name}</strong>`);
    if ((state.flow === 'collection' || state.flow === 'collection-only') && state.collectionRows > 0) {
      ok(`${state.collectionRows} ${state.collectionRows === 1 ? 'row' : 'rows'} added to your collection`);
    }
    if (state.addonsAdded && state.addonsAdded.length) {
      ok(`Scrapers installed: ${escapeHtml(state.addonsAdded.join(', '))}`);
    }
    if (state.torboxApplied) {
      ok('Torbox streaming switched on');
    } else if (state.streamingApplied) {
      todo('Torbox not set. Add a debrid key in Nuvio before streams will play.');
    }
    if (state.tmdbApplied) ok('TMDB integration on');
    if (state.mdblistApplied) ok('MDBList key saved');
    if (state.traktApplied) ok('Trakt connected');
    if (state.bingecatApplied) ok('For You powered by Bingecat AI');
    if (state.mdblistForYouApplied) ok('For You powered by MDBList');
    if (state.avatarApplied) ok('Profile image set');

    const readyToStream = state.torboxApplied;
    const hasMobile = state.devices.includes('mobile');
    const nextSteps = readyToStream
      ? `<strong>On your TV:</strong> open Nuvio → switch to the "${name}" profile → press play. That's it.${hasMobile ? `<br><br><strong>On mobile:</strong> open the Nuvio app → Settings → Connected Services → Torbox to finish connecting Torbox (takes ~30 seconds).` : ''}`
      : `<strong>On your TV:</strong> open Nuvio and switch to the "${name}" profile. To play streams you'll still need a Torbox (or other debrid) key in Nuvio's settings.`;

    const aioSelfServiceNote = (state.setupMode === 'aio' && state.aioStreamsUuid && state.aioStreamsHost) ? `
      <div class="wiz-donation-block">
        <p class="wiz-donation-lede">Want to fine-tune your AIO Streams config yourself later?</p>
        <p class="wiz-donation-sub">Visit <a href="${escapeAttr(state.aioStreamsHost)}/configure" target="_blank" rel="noopener" class="wiz-link">${escapeHtml(state.aioStreamsHost)}/configure</a> and sign in with UUID <code class="wiz-inline-code">${escapeHtml(state.aioStreamsUuid)}</code> and password <code class="wiz-inline-code">${escapeHtml(state.aioStreamsPassword || 'KaptainsCollection')}</code> (save both, they won't be shown again).</p>
      </div>` : '';

    panel.innerHTML = `
      ${header("You're live. 🎉", '', false)}
      <div class="wiz-body">
        <div class="wiz-success-badge">${ICON.check}</div>
        <ul class="wiz-summary">${items.join('')}</ul>
        <div class="wiz-note wiz-nextsteps">${nextSteps}</div>
        ${aioSelfServiceNote}

        <div class="wiz-donation-block">
            <p class="wiz-donation-lede">Enjoying it? Share your setup on <a href="https://www.reddit.com/r/Nuvio/" target="_blank" rel="noopener" class="wiz-link">r/Nuvio</a>, or DM <a href="https://www.reddit.com/user/KforKaptain/" target="_blank" rel="noopener" class="wiz-link">u/KforKaptain</a> with bugs, ideas, or content to add.</p>
            <p class="wiz-donation-sub">If this saved you some setup time, tips are always appreciated, never expected.</p>
            <div class="wiz-donation-actions">
                <a href="https://ko-fi.com/nuvio" target="_blank" rel="noopener" class="wiz-secondary wiz-donation-btn">☕ Support Nuvio</a>
                <button type="button" id="wiz-tip-kaptain-btn" class="wiz-secondary wiz-donation-btn">☕ Tip Kaptain</button>
            </div>
            <div id="wiz-tip-kaptain-confirm" class="wiz-tip-confirm" style="display:none;">
                <p style="margin:0 0 8px 0;">Have you donated to the Nuvio devs yet? None of this works without them.</p>
                <a href="https://ko-fi.com/kaptaincollection" target="_blank" rel="noopener" class="wiz-link">Yes, continue to Kaptain's tip page →</a>
            </div>
        </div>

        <button class="wiz-primary" id="wiz-done-close" style="margin-top:20px;"><span>Done</span></button>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    el('wiz-done-close').addEventListener('click', close);
    const tipBtn = el('wiz-tip-kaptain-btn');
    if (tipBtn) tipBtn.addEventListener('click', () => {
      const confirmBox = el('wiz-tip-kaptain-confirm');
      if (confirmBox) confirmBox.style.display = 'block';
      tipBtn.style.display = 'none';
    });
  }

  function renderError(panel) {
    panel.innerHTML = `
      ${header('Something Went Wrong', '', true)}
      <div class="wiz-body">
        <div class="wiz-error" style="display:block;">${escapeHtml(state.errorMsg)}</div>
        <p class="wiz-note">You can try again, or just grab the download instead. No login needed.</p>
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-err-download"><span>Download instead</span></button>
          <button class="wiz-primary" id="wiz-err-retry"><span>Try again</span></button>
        </div>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => go('account'));
    el('wiz-err-retry').addEventListener('click', () => go('account'));
    el('wiz-err-download').addEventListener('click', () => {
      close();
      // Skip the download confirm here - the visitor already asked for this
      // explicitly after a failed push; a second "are you sure" would grate.
      if (typeof compileAndDownloadJSON === 'function') compileAndDownloadJSON(true);
    });
  }

  // ====================================================================
  // ACTIONS
  // ====================================================================
  function syncInputs() {
    const email = el('wiz-email');
    const pw = el('wiz-password');
    const pn = el('wiz-profile-name');
    if (email) state.email = email.value.trim();
    if (pw) state.password = pw.value;
    if (pn) state.profileName = pn.value;
  }

  function showInlineError(msg) {
    const box = el('wiz-error');
    if (box) { box.textContent = msg; box.style.display = 'block'; }
  }

  // A problem with one specific field belongs next to that field, not in a
  // banner at the bottom of the form the eye has to travel back down to.
  // The banner stays for everything that isn't field-specific — network
  // failures, whatever Nuvio's API rejects.
  function clearFieldErrors() {
    const panel = el('wizard-panel');
    if (!panel) return;
    panel.querySelectorAll('.wiz-field-error').forEach((n) => n.remove());
    panel.querySelectorAll('[aria-invalid="true"]').forEach((n) => n.removeAttribute('aria-invalid'));
  }

  function showFieldError(inputId, msg) {
    const input = el(inputId);
    if (!input) return showInlineError(msg);
    clearFieldErrors();
    input.setAttribute('aria-invalid', 'true');
    const note = document.createElement('p');
    note.className = 'wiz-field-error';
    note.id = `${inputId}-error`;
    note.textContent = msg;
    input.setAttribute('aria-describedby', note.id);
    // The password field sits inside a .wiz-input-wrap with its Show toggle,
    // so anchor to the wrapper when there is one or the message lands inside
    // the input row.
    const anchor = input.closest('.wiz-input-wrap') || input;
    anchor.insertAdjacentElement('afterend', note);
    input.focus();
  }

  async function onAccountContinue() {
    syncInputs();
    clearFieldErrors();
    const errBox = el('wiz-error');
    if (errBox) errBox.style.display = 'none';
    const minLen = state.mode === 'create' ? 8 : 6;
    if (!state.email.includes('@')) return showFieldError('wiz-email', 'Please enter a valid email address.');
    if (state.password.length < minLen) return showFieldError('wiz-password', `Password must be at least ${minLen} characters.`);
    if (state.mode === 'create' && !state.profileName.trim()) state.profileName = DEFAULT_PROFILE_NAME;

    try {
      if (state.mode === 'create') {
        state.pushingLabel = 'Creating your Nuvio account...';
        go('pushing');
        let auth;
        try {
          auth = await window.NuvioPush.signup(state.email, state.password);
        } catch (e) {
          // Email already has a Nuvio account → quietly switch them to sign-in
          // instead of dead-ending on an error screen.
          if (/already (exists|registered)/i.test((e && e.message) || '')) {
            state.mode = 'signin';
            go('account');
            showInlineError('Looks like you already have a Nuvio account with that email, so I switched you over to Sign in. Enter your password to continue.');
            return;
          }
          throw e;
        }
        state.token = auth.token;
        state.accountAction = 'created';
        // Brand-new account → create the first profile, then continue.
        const profile = await createTargetProfile(state.profileName.trim() || DEFAULT_PROFILE_NAME);
        if (state.flow === 'starter') return proceedToStreaming();
        await doPushCollection(profile.profile_index);  // collection flow
        return proceedToStreaming();
      } else {
        state.pushingLabel = 'Signing in...';
        go('pushing');
        const auth = await window.NuvioPush.login(state.email, state.password);
        state.token = auth.token;
        state.accountAction = 'signedin';
        state.profiles = await window.NuvioPush.getProfiles(state.token);
        // Default to whichever profile this account last pushed to, if it
        // still exists — otherwise fall back to "create new profile".
        const remembered = getRememberedProfileId(state.email);
        const remembersMatch = remembered != null && state.profiles.some((p) => p.profile_index === remembered);
        state.createNewProfile = !remembersMatch;
        state.selectedProfileId = remembersMatch ? remembered : (state.profiles[0] ? state.profiles[0].profile_index : null);
        go('profile');
      }
    } catch (err) {
      state.errorMsg = (err && err.message) || String(err);
      go('error');
    }
  }

  function onPush() {
    doOnPush();
  }

  async function doOnPush() {
    const pn = el('wiz-profile-name');
    if (pn) state.profileName = pn.value;
    try {
      if (state.createNewProfile) {
        const profile = await createTargetProfile(state.profileName.trim() || DEFAULT_PROFILE_NAME);
        if (state.flow === 'starter') return proceedToStreaming();
        await doPushCollection(profile.profile_index);
        return proceedToStreaming();
      }
      // Existing profile chosen.
      const profile = state.profiles.find((p) => p.profile_index === state.selectedProfileId);
      const profileName = profile ? profile.name : `Profile ${state.selectedProfileId}`;
      state.targetProfileId = state.selectedProfileId;
      state.resultProfileName = profileName;
      if (state.flow === 'starter') return proceedToStreaming();
      // Collection flow → read current rows so the user can choose where the new
      // ones land, then show the placement step.
      state.pushingLabel = 'Reading your current collection...';
      go('pushing');
      state.existingCollections = await window.NuvioPush.pullCollections(state.token, state.selectedProfileId);
      if (!state.existingCollections.length) {
        // Empty profile — nothing to merge into, just push the selection.
        await doMergedPush(profileName);
        return;
      }
      state.placementOrder = null; // rebuilt fresh in renderPlacement
      state.placementMode = 'merge'; // always start on the safe merge default
      state.rowMergeChoice = {}; // per-matching-row 'add-missing' | 'replace' | 'leave', rebuilt fresh below
      go('placement');
    } catch (err) {
      state.errorMsg = (err && err.message) || String(err);
      go('error');
    }
  }

  // Existing rows minus any that share an id with an incoming category, so a
  // re-import replaces those rows in place instead of duplicating them.
  // Safe by default: convert a risky ROWS/FOLLOW_LAYOUT view mode to
  // TABBED_GRID unless the user explicitly opted out via the devices-step
  // "Auto-switch" checkbox. Previously this only applied when "Mobile" was
  // checked, so a laptop/TV-only user's unconverted layout went out with no
  // protection and no warning at all.
  function shouldOptimizeExport() {
    return state._devicesAutoSwitch !== false;
  }

  // Force-guarantees every pushed category has "Pin to Top" and "Focus Glow"
  // switched on, regardless of what the source data actually carried —
  // covers Studio-published rows missing the flag and old kept rows from a
  // profile pushed by an earlier version of this wizard. Mutates in place
  // and returns the same array; call immediately before every
  // pushCollections() so it's the last thing touching the payload.
  function ensureCollectionDefaults(collections) {
    (collections || []).forEach((cat) => {
      if (!cat) return;
      cat.pinToTop = true;
      cat.focusGlowEnabled = true;
    });
    return collections;
  }

  function normalizeCatTitle(title) {
    return (title || '').trim().toLowerCase();
  }

  function findMatchingExistingCategory(existingList, cat) {
    if (!cat || !Array.isArray(existingList)) return null;
    if (cat.id) {
      const byId = existingList.find((c) => c && c.id === cat.id);
      if (byId) return byId;
    }
    const t = normalizeCatTitle(cat.title);
    if (t) {
      const byTitle = existingList.find((c) => c && normalizeCatTitle(c.title) === t);
      if (byTitle) return byTitle;
    }
    return null;
  }

  // De-dup key for a folder source, used only by mergeCategoryUnion below —
  // NOT app.js's getSourceKey (title-only, collides across different real
  // sources that happen to share a display title). Addon-shaped sources key
  // off addonId+catalogId+type (matches how Nuvio actually addresses a
  // catalog); tmdb/trakt sources key off their real list id when present,
  // falling back to title only as a last resort.
  function sourceUnionKey(s) {
    if (!s) return '';
    if (s.provider === 'addon') return `addon|${s.addonId || ''}|${s.catalogId || ''}|${s.type || ''}`;
    if (s.provider === 'tmdb') {
      const g = (s.filters && s.filters.withGenres) || s.genre || '';
      const tmdbId = s.tmdbId || s.tmdbSourceId || '';
      const media = s.mediaType || s.type || '';
      return `tmdb|${tmdbId}|${s.tmdbSourceType || ''}|${g}|${s.title || s.name || ''}|${media}`;
    }
    if (s.provider === 'trakt') return `trakt|${s.traktListId || ''}|${s.title || s.name || ''}|${s.mediaType || s.type || ''}`;
    return `${s.provider || ''}|${s.catalogId || s.title || s.name || ''}|${s.type || s.mediaType || ''}`;
  }

  // "Add missing items" merge for one matching category row: keeps the
  // EXISTING category as the base (its props, its folder order) and never
  // removes anything, then folder+source-level unions in whatever the
  // incoming version has that the existing one doesn't:
  //  - a whole incoming folder missing on the existing side gets appended
  //  - a folder present on both sides gets its sources/catalogSources
  //    topped up with only the incoming entries not already present
  // Legacy folder-bingecat-* ids are stripped from the existing side first,
  // so add-missing can't resurrect the pre-multi-select 4-folder Bingecat
  // shape on a profile pushed before that change.
  function mergeCategoryUnion(existingCat, incomingCat) {
    const merged = { ...existingCat };
    const cleanedExisting = (existingCat.folders || []).filter((f) => !f || !BINGECAT_LEGACY_FOLDER_IDS.has(f.id));
    const folderList = cleanedExisting.filter(Boolean).map((f) => ({ ...f }));
    const byFolderId = new Map(folderList.map((f) => [f.id, f]));
    const byFolderTitle = new Map(folderList.map((f) => [normalizeCatTitle(f.title), f]));

    (incomingCat.folders || []).forEach((incFolder) => {
      if (!incFolder || (!incFolder.id && !incFolder.title)) return;
      const titleKey = normalizeCatTitle(incFolder.title);
      const existingFolder = (incFolder.id && byFolderId.get(incFolder.id)) || (titleKey && byFolderTitle.get(titleKey));
      if (!existingFolder) {
        folderList.push(incFolder);
        if (incFolder.id) byFolderId.set(incFolder.id, incFolder);
        if (titleKey) byFolderTitle.set(titleKey, incFolder);
        return;
      }
      const existingKeys = new Set((existingFolder.sources || []).map(sourceUnionKey));
      const missingSources = (incFolder.sources || []).filter((s) => !existingKeys.has(sourceUnionKey(s)));
      if (missingSources.length) {
        existingFolder.sources = [...(existingFolder.sources || []), ...missingSources];
        const existingCatKeys = new Set((existingFolder.catalogSources || []).map(sourceUnionKey));
        const missingCatSources = (incFolder.catalogSources || []).filter((s) => !existingCatKeys.has(sourceUnionKey(s)));
        existingFolder.catalogSources = [...(existingFolder.catalogSources || []), ...missingCatSources];
      }
    });
    merged.folders = folderList;
    return merged;
  }

  // For a row about to be set to Replace: names which of the profile's
  // current folders would be dropped (present on the existing side, absent
  // from the incoming version), so the visitor sees the concrete cost right
  // next to the control instead of only a generic warning. Returns null when
  // Replace would lose nothing (nothing to warn about).
  function replaceImpactSummary(existingCat, incomingCat) {
    if (!existingCat) return null;
    const incomingFolderIds = new Set((incomingCat.folders || []).map((f) => f && f.id).filter(Boolean));
    const incomingFolderTitles = new Set((incomingCat.folders || []).map((f) => f && normalizeCatTitle(f.title)).filter(Boolean));
    const droppedFolders = (existingCat.folders || []).filter((f) => f && f.id && !incomingFolderIds.has(f.id) && !incomingFolderTitles.has(normalizeCatTitle(f.title)));
    if (!droppedFolders.length) return null;
    const names = droppedFolders.map((f) => f.title || 'Untitled folder');
    const preview = names.length > 3
      ? `${names.slice(0, 3).join(', ')}, +${names.length - 3} more`
      : names.join(', ');
    const noun = droppedFolders.length === 1 ? 'folder' : 'folders';
    return `Replace will remove ${droppedFolders.length} ${noun} currently on this profile (${preview}) that aren't in your new selection.`;
  }

  function keptExisting(incoming) {
    const incomingIds = new Set((incoming || []).map((c) => c && c.id).filter(Boolean));
    const incomingTitles = new Set((incoming || []).map((c) => c && normalizeCatTitle(c.title)).filter(Boolean));
    // A category the user fully deselected produces zero rows, so it has no
    // id in `incoming` — but it's still a category this tool recognizes (it
    // exists in the full local `database`). Without this, keptExisting would
    // never remove it, leaving deselected rows stranded on the profile forever.
    const deselectedCategoryIds = new Set(
      (typeof database !== 'undefined' ? database : [])
        .filter((cat) => cat && cat.id && !incomingIds.has(cat.id))
        .map((cat) => cat.id)
    );
    const deselectedCategoryTitles = new Set(
      (typeof database !== 'undefined' ? database : [])
        .filter((cat) => cat && cat.title && !incomingTitles.has(normalizeCatTitle(cat.title)))
        .map((cat) => normalizeCatTitle(cat.title))
    );
    return (state.existingCollections || []).filter((c) => {
      if (!c || (!c.id && !c.title)) return true;
      const t = normalizeCatTitle(c.title);
      if (incomingIds.has(c.id) || (t && incomingTitles.has(t))) return false;        // will be replaced/merged by incoming version
      if (deselectedCategoryIds.has(c.id) || (t && deselectedCategoryTitles.has(t))) return false; // user actively deselected this whole category
      return true; // row from a category this tool doesn't recognize — leave it alone
    });
  }

  // Builds the initial row order the first time this placement screen is
  // shown for a given push: existing (kept) rows keep their current order,
  // new rows land at the bottom — same default as before, just now a real
  // per-row order the user can rearrange instead of one insertion index.
  function buildDefaultPlacementOrder(kept, incoming) {
    return [...kept.map((c) => c.id), ...incoming.map((c) => c.id)];
  }

  function renderPlacement(panel) {
    const incoming = assembleFilteredDatabase();
    const kept = keptExisting(incoming);
    const byId = new Map([...kept, ...incoming].map((c) => [c.id, c]));
    const existingById = new Map((state.existingCollections || []).map((c) => [c.id, c]));
    if (state.placementMode == null) state.placementMode = 'merge';
    if (!state.placementExcluded) state.placementExcluded = new Set();
    if (!state.rowMergeChoice) state.rowMergeChoice = {};
    // Rebuild the order if this is a fresh entry to this screen, or if the
    // selection changed since it was last built (ids no longer match).
    const currentIds = new Set([...kept.map((c) => c.id), ...incoming.map((c) => c.id)]);
    const orderIsStale = !state.placementOrder
      || state.placementOrder.length !== currentIds.size
      || state.placementOrder.some((id) => !currentIds.has(id));
    if (orderIsStale) {
      state.placementOrder = buildDefaultPlacementOrder(kept, incoming);
      state.placementExcluded = new Set();
      state.rowMergeChoice = {};
    }

    const incomingIds = new Set(incoming.map((c) => c.id));
    const newCount = incoming.length;
    const rowLabel = `${newCount} ${newCount === 1 ? 'row' : 'rows'}`;
    const isOverwrite = state.placementMode === 'overwrite';
    const existingCount = state.existingCollections ? state.existingCollections.length : 0;

    // Rows that are both incoming AND already on the profile under the same
    // id or title get a 3-way choice below (default "Add missing" — never removes or
    // overwrites what's already there unless the visitor explicitly picks
    // Replace).
    const isUpdate = (id) => {
      const c = byId.get(id);
      return incomingIds.has(id) && !!findMatchingExistingCategory(state.existingCollections || [], c);
    };
    const mergeChoiceLabels = { 'add-missing': 'Add missing', replace: 'Replace', leave: 'Leave as-is' };

    const orderRows = state.placementOrder.map((id, i) => {
      const c = byId.get(id);
      if (!c) return '';
      const isNew = incomingIds.has(id);
      const willUpdate = isUpdate(id);
      const isExcluded = state.placementExcluded.has(id);
      const mergeChoice = willUpdate ? (state.rowMergeChoice[id] || 'add-missing') : null;
      // Matching rows already show their state via the segmented control
      // below, so the tag is only needed for rows with no other control on
      // them (kept-as-is / purely-new / excluded).
      const tagHtml = willUpdate ? '' : `<span class="wiz-placement-tag ${isExcluded ? 'is-excluded' : isNew ? 'is-new' : ''}">${isExcluded ? 'excluded' : isNew ? 'new' : 'kept'}</span>`;
      // Purely-new rows (no matching id on the profile yet) keep the simple
      // skip checkbox. Matching rows get the 3-way merge-choice control
      // instead — replacing the old binary replace-or-leave-alone checkbox.
      const excludeControl = (isNew && !willUpdate) ? `
          <label class="wiz-placement-exclude">
            <input type="checkbox" class="wiz-placement-exclude-cb" data-key="${escapeAttr(id)}" ${isExcluded ? 'checked' : ''}>
            Skip this row
          </label>` : '';
      const mergeControl = willUpdate ? `
          <div class="wiz-merge-choice" data-key="${escapeAttr(id)}">
            ${['add-missing', 'replace', 'leave'].map((choice) => `<button type="button" class="wiz-merge-choice-btn ${mergeChoice === choice ? 'active' : ''}" data-choice="${choice}">${mergeChoiceLabels[choice]}</button>`).join('')}
          </div>` : '';
      const matchingExisting = willUpdate ? findMatchingExistingCategory(state.existingCollections || [], c) : null;
      const replaceWarning = (willUpdate && mergeChoice === 'replace') ? replaceImpactSummary(matchingExisting, c) : null;
      const replaceWarningHtml = replaceWarning ? `<div class="wiz-row-replace-warning">${escapeHtml(replaceWarning)}</div>` : '';
      // Fixed two-line shape — title/tag + arrows always on line 1, the row's
      // one action control (or nothing, for plain kept-as-is rows) on line 2
      // — so rows never reflow differently depending on how much content
      // they carry, unlike the old single wrapping flex line.
      return `
        <div class="wiz-reorder-row wiz-placement-row ${isExcluded ? 'is-excluded' : ''}" data-key="${escapeAttr(id)}">
          <div class="wiz-row-top">
            <span class="wiz-reorder-label">${escapeHtml(c.title || 'row')}${tagHtml}</span>
            <div class="reorder-arrows">
              <button type="button" class="reorder-arrow" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Move up" aria-label="Move up">▲</button>
              <button type="button" class="reorder-arrow" data-dir="1" ${i === state.placementOrder.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move down">▼</button>
            </div>
          </div>
          ${excludeControl}
          ${mergeControl}
          ${replaceWarningHtml}
        </div>`;
    }).join('');

    const keptNotice = kept.length ? `
      <div class="wiz-placement-kept-notice">
        <span class="wiz-placement-kept-count">${kept.length} ${kept.length === 1 ? 'custom row' : 'custom rows'}</span> already on this profile will be kept. You can reorder them alongside your new rows below.
      </div>` : '';

    panel.innerHTML = `
      <div class="wiz-step-content wiz-placement-wrap">
        <div class="wiz-step-eyebrow">Step 5 of 8 · Placement</div>
        <h2 class="wiz-step-title">How should these rows land?</h2>
        <p class="wiz-step-desc">Your selection has ${rowLabel}. Choose how to combine them with what is currently on <strong class="wiz-desc-profile">${escapeHtml(state.selectedProfileName || 'this profile')}</strong>.</p>

        <div class="wiz-placement-mode-toggle">
          <button type="button" class="wiz-mode-btn ${!isOverwrite ? 'active' : ''}" data-mode="merge">
            <span class="wiz-mode-title">Merge with current profile</span>
            <span class="wiz-mode-desc">Keep your existing rows and pick where new ones land</span>
          </button>
          <button type="button" class="wiz-mode-btn ${isOverwrite ? 'active' : ''}" data-mode="overwrite">
            <span class="wiz-mode-title">Fresh start</span>
            <span class="wiz-mode-desc">Replace everything on this profile with your new selection</span>
          </button>
        </div>

        ${isOverwrite ? `
          <div class="wiz-placement-overwrite-warning">
            This will replace all ${existingCount} ${existingCount === 1 ? 'row' : 'rows'} currently on this profile.
          </div>
        ` : `
          ${keptNotice}
          <div class="wiz-reorder-list wiz-placement-list">
            ${orderRows}
          </div>
        `}

        <div class="wiz-step-actions">
          <button type="button" class="wiz-btn-secondary wiz-back-btn">Back</button>
          <button type="button" class="wiz-btn-primary wiz-placement-continue-btn">Continue to streaming setup</button>
        </div>
      </div>
    `;

    panel.querySelectorAll('.wiz-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.placementMode = btn.dataset.mode;
        renderPlacement(panel);
      });
    });

    panel.querySelectorAll('.wiz-placement-exclude-cb').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.key;
        if (cb.checked) state.placementExcluded.add(id);
        else state.placementExcluded.delete(id);
        renderPlacement(panel);
      });
    });

    panel.querySelectorAll('.wiz-merge-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const parent = btn.closest('.wiz-merge-choice');
        if (!parent) return;
        const id = parent.dataset.key;
        const choice = btn.dataset.choice;
        if (!state.rowMergeChoice) state.rowMergeChoice = {};
        state.rowMergeChoice[id] = choice;
        renderPlacement(panel);
      });
    });

    panel.querySelectorAll('.reorder-arrow').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.wiz-reorder-row');
        if (!row) return;
        const id = row.dataset.key;
        const dir = parseInt(btn.dataset.dir, 10);
        const idx = state.placementOrder.indexOf(id);
        if (idx === -1) return;
        const targetIdx = idx + dir;
        if (targetIdx < 0 || targetIdx >= state.placementOrder.length) return;
        const temp = state.placementOrder[idx];
        state.placementOrder[idx] = state.placementOrder[targetIdx];
        state.placementOrder[targetIdx] = temp;
        renderPlacement(panel);
      });
    });

    panel.querySelector('.wiz-back-btn').addEventListener('click', () => {
      go('for-you-prompt');
    });

    panel.querySelector('.wiz-placement-continue-btn').addEventListener('click', async () => {
      try {
        const profile = state.profiles.find((p) => p.profile_index === state.selectedProfileId);
        await doMergedPush(profile ? profile.name : `Profile ${state.selectedProfileId}`);
      } catch (err) {
        state.errorMsg = (err && err.message) || String(err);
        go('error');
      }
    });
  }

  // Build the merged array — for merge mode, every row in state.placementOrder
  // (existing + incoming, in whatever order the user arranged them) — and
  // push it to the chosen existing profile, then go to the streaming step.
  async function doMergedPush(profileName) {
    state.pushingLabel = 'Loading your collection...';
    go('pushing');
    const incoming = assembleFilteredDatabase(shouldOptimizeExport());
    if (!incoming || incoming.length === 0) {
      throw new Error('No folders are selected, so there is nothing to send.');
    }
    let merged;
    if (state.placementMode === 'overwrite') {
      merged = incoming;
      // A previous setup on this profile may have installed its own AIO
      // Metadata instance for "For You" — replacing the collection without
      // clearing that out leaves it orphaned (pointing at rows that no
      // longer exist) and, if the user reconnects Trakt below, duplicated.
      try {
        await window.NuvioPush.removeAddonsByName(state.token, state.selectedProfileId, 'AIO Metadata');
      } catch (e) { /* non-fatal — worst case a stale instance survives, same as before this fix */ }
    } else {
      const kept = keptExisting(incoming);
      const byId = new Map([...kept, ...incoming].map((c) => [c.id, c]));
      const incomingIds = new Set(incoming.map((c) => c.id));
      const excluded = state.placementExcluded || new Set();
      const rowMergeChoice = state.rowMergeChoice || {};
      const order = (state.placementOrder && state.placementOrder.length)
        ? state.placementOrder
        : buildDefaultPlacementOrder(kept, incoming);
      merged = order
        // Excluded + never existed before → drop it from this push entirely.
        // (Matching rows always produce a row below, regardless of the
        // exclude Set — their 3-way choice covers "leave it alone" instead.)
        .filter((id) => {
          const c = byId.get(id);
          const existing = findMatchingExistingCategory(state.existingCollections || [], c);
          return !(excluded.has(id) && !existing);
        })
        .map((id) => {
          const c = byId.get(id);
          const existing = findMatchingExistingCategory(state.existingCollections || [], c);
          const isMatch = incomingIds.has(id) && !!existing;
          if (isMatch) {
            const choice = rowMergeChoice[id] || 'add-missing';
            if (choice === 'replace') return c; // fully overwrite with the incoming version
            if (choice === 'leave') return existing; // keep exactly as it is on the profile
            return mergeCategoryUnion(existing, c); // add-missing (default)
          }
          return c;
        })
        .filter(Boolean);
      // Safety net: if placementOrder somehow drifted (e.g. selection changed
      // between screens without a re-render), fall back to appending anything
      // missing rather than silently dropping rows.
      const placed = new Set(merged.map((c) => c.id));
      [...kept, ...incoming].forEach((c) => { if (!placed.has(c.id) && !excluded.has(c.id)) { merged.push(c); placed.add(c.id); } });
    }
    ensureCollectionDefaults(merged);
    await window.NuvioPush.pushCollections(state.token, state.selectedProfileId, merged);
    state.collectionRows = incoming.length;
    state.targetProfileId = state.selectedProfileId;
    state.resultProfileName = profileName;
    rememberProfileId(state.email, state.selectedProfileId);
    await ensureMetadataAddons(state.selectedProfileId);
    await proceedToStreaming();
  }

  // Safety net so a fresh profile's collection actually renders. No-op when the
  // metadata addons are already there (Nuvio usually seeds them).
  async function ensureMetadataAddons(profileId) {
    try {
      await window.NuvioPush.installAddons(state.token, profileId, METADATA_ADDONS);
      // Warm up manifest endpoints in background to prevent initial "Not Available" cold start
      (METADATA_ADDONS || []).forEach((addon) => {
        if (addon && addon.url) {
          fetch(addon.url, { mode: 'no-cors' }).catch(() => {});
        }
      });
    } catch (e) { /* non-fatal — collection is still saved */ }
  }

  // Nuvio accounts top out at 6 profiles. Past that the server rejects the
  // save with a bare HTTP 400 "Invalid profile id", which reads like a bug
  // rather than a limit - so check the count up front and, if the server
  // rejects anyway, translate the 400 into something actionable.
  const NUVIO_MAX_PROFILES = 6;
  const PROFILE_CAP_MSG = `Your Nuvio account already has the maximum of ${NUVIO_MAX_PROFILES} profiles, so a new one can't be created. Go back and pick an existing profile from the dropdown instead.`;

  function isProfileCapError(err) {
    const msg = ((err && err.message) || String(err || '')).toLowerCase();
    return msg.includes('invalid profile id') || msg.includes('http 400');
  }

  // Creates a fresh profile and records it as the streaming target.
  async function createTargetProfile(name) {
    state.pushingLabel = 'Creating your profile...';
    go('pushing');
    try {
      const existing = await window.NuvioPush.getProfiles(state.token);
      if (Array.isArray(existing) && existing.length >= NUVIO_MAX_PROFILES) {
        throw new Error(PROFILE_CAP_MSG);
      }
    } catch (e) {
      if (e && e.message === PROFILE_CAP_MSG) throw e;
      /* couldn't read the list - fall through and let the server decide */
    }
    let profile;
    try {
      profile = await window.NuvioPush.createProfile(state.token, name);
    } catch (err) {
      if (isProfileCapError(err)) throw new Error(PROFILE_CAP_MSG);
      throw err;
    }
    if (!profile) throw new Error('Your account is ready, but the profile could not be created. Please try again.');
    state.targetProfileId = profile.profile_index;
    state.resultProfileName = profile.name;
    return profile;
  }

  // Full push of the current selection to a brand-new / freshly-chosen profile.
  async function doPushCollection(profileId) {
    state.pushingLabel = 'Loading your collection...';
    go('pushing');
    const collections = assembleFilteredDatabase(shouldOptimizeExport());
    if (!collections || collections.length === 0) {
      throw new Error('No folders are selected, so there is nothing to send.');
    }
    ensureCollectionDefaults(collections);
    await window.NuvioPush.pushCollections(state.token, profileId, collections);
    state.collectionRows = collections.length;
    rememberProfileId(state.email, profileId);
    await ensureMetadataAddons(profileId);
  }

  // After the collection is saved: collection-only skips straight to done;
  // prefilled settings are applied in one shot; otherwise show the interactive
  // streaming sub-steps.
  async function proceedToStreaming() {
    // Baseline settings are a new-profile-only convenience — an existing
    // profile already has its own Nuvio settings the visitor configured
    // themselves, and this wizard shouldn't silently touch them just because
    // they're re-running it to add more content.
    if (state.createNewProfile) {
      try {
        await window.NuvioPush.applyProfileSettings(state.token, state.targetProfileId, SETTINGS_PLATFORMS, { autoplayTrailers: true });
      } catch (e) { /* non-fatal — profile/collection are already saved */ }
    }
    if (state.prefill) return applyPrefillAndFinish();
    if (state.flow === 'collection-only') { go('done'); return; }
    state.streamingSubStep = null;
    state.streamingShowAddons = false;
    go('mode');
  }

  async function applyPrefillAndFinish() {
    const p = state.prefill || {};
    state.pushingLabel = 'Setting up your streaming & integrations...';
    go('pushing');
    const pid = state.targetProfileId;
    const hasSettings = p.torboxKey || p.tmdbKey || p.tmdbEnabled || p.mdblistKey || p.trakt;
    if (hasSettings) {
      await window.NuvioPush.applyProfileSettings(state.token, pid, SETTINGS_PLATFORMS, {
        torboxKey: p.torboxKey, tmdbEnabled: p.tmdbEnabled, tmdbKey: p.tmdbKey,
        mdblistKey: p.mdblistKey, trakt: p.trakt,
      });
      state.torboxApplied = !!p.torboxKey;
      state.tmdbApplied = !!(p.tmdbKey || p.tmdbEnabled);
      state.mdblistApplied = !!p.mdblistKey;
      state.traktApplied = !!p.trakt;
    }
    const picked = (p.addons || []).filter((a) => a && a.checked && a.url);
    if (picked.length) {
      await window.NuvioPush.installAddons(state.token, pid, picked.map((a) => ({ name: a.name, url: a.url })));
      state.addonsAdded = picked.map((a) => a.name);
    }
    if (p.avatarUrl && String(p.avatarUrl).trim()) {
      await window.NuvioPush.setProfileAvatar(state.token, pid, p.avatarUrl);
      state.avatarApplied = true;
    }
    state.streamingApplied = true;
    go('done');
  }

  // ====================================================================
  // STREAMING SETUP (Torbox + addons) — three guided sub-steps
  // ====================================================================
  function ensureAddonChoices() {
    if (!state.addonChoices) {
      state.addonChoices = []; // custom user-added addons only; Torrentio/Comet handled by scraper config section
    }
    return state.addonChoices;
  }

  function renderStreaming(panel) {
    const sub = state.streamingSubStep || 'prompt';
    if (sub === 'torbox') return renderStreamingTorbox(panel);
    if (sub === 'addons') return renderStreamingAddons(panel);
    if (sub === 'custom-addons') return renderStreamingCustomAddons(panel);
    return renderStreamingPrompt(panel);
  }

  function renderStreamingPrompt(panel) {
    panel.innerHTML = `
      ${header('Set Up Streaming', '', true, 'streaming')}
      <div class="wiz-body wiz-streaming-prompt">
        <p class="wiz-prompt-heading">Do you want to set up Torbox Instant or streaming addons?</p>
        <p class="wiz-note">This is what makes content actually play. It's completely optional; you can always set it up later in Nuvio's settings.</p>
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-stream-skip"><span>Skip for now</span></button>
          <button class="wiz-primary" id="wiz-stream-yes"><span>Yes, let's do it →</span></button>
        </div>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    // Mirror the forward gate: if the For You screen was skipped on the way
    // in, Back has to reach past it to the mode picker rather than dropping
    // the visitor onto a screen they were deliberately spared.
    el('wiz-back').addEventListener('click', () => go(hasForYouFolder() ? 'for-you' : 'mode'));
    el('wiz-stream-skip').addEventListener('click', () => { state.streamingApplied = false; afterStreaming(); });
    el('wiz-stream-yes').addEventListener('click', () => { state.streamingSubStep = 'torbox'; render(); });
  }

  function renderStreamingTorbox(panel) {
    const showTmdb = state.devices.includes('mobile');
    panel.innerHTML = `
      ${header('Torbox Instant', 'Connect Torbox and streams play instantly, no per-source keys needed.', true, 'streaming')}
      <div class="wiz-body">
        <label class="wiz-label">Torbox API key <span class="wiz-hint">(optional)</span>
          <span class="wiz-input-wrap">
            <input type="text" id="wiz-torbox-key" class="wiz-input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${escapeAttr(state.torboxKey)}" autocomplete="off" spellcheck="false">
            <button type="button" class="wiz-input-toggle" id="wiz-torbox-test">Test</button>
          </span>
        </label>
        <div class="wiz-key-status" id="wiz-key-status">${torboxStatusHtml(state.torboxKey)}</div>
        ${state.devices.includes('mobile') ? `<div class="wiz-note">📱 <strong>On mobile:</strong> Torbox connects differently. After setup open the Nuvio app → Settings → Connected Services → Torbox. You'll get a short code to enter at <strong>tor.box/link</strong>.</div>` : ''}
        <div class="wiz-torbox-promo">
          <div class="wiz-torbox-promo-copy">
            <span class="wiz-torbox-promo-title">Don't have Torbox yet?</span>
            <span class="wiz-torbox-promo-text">Sign up with my link for a discount. It helps keep this project running.</span>
          </div>
          <a href="https://torbox.app/subscription?referral=691a76aa-4d6e-40c0-8625-ffe4e4189ae4" target="_blank" rel="noopener" class="wiz-torbox-promo-btn"><span>Get Torbox</span><span class="wiz-torbox-promo-arrow">→</span></a>
          <a href="https://torbox.app/subscription" target="_blank" rel="noopener" class="wiz-torbox-promo-skip">or sign up without a referral code</a>
        </div>
        ${showTmdb ? `
        <label class="wiz-label">TMDB API key <span class="wiz-hint">(optional, needed for Nuvio Mobile)</span>
          <span class="wiz-input-wrap">
            <input type="text" id="wiz-tmdb-key" class="wiz-input" placeholder="Paste your TMDB API key..." value="${escapeAttr(state.tmdbKey)}" autocomplete="off" spellcheck="false">
            <button type="button" class="wiz-input-toggle" id="wiz-tmdb-test">Test</button>
          </span>
        </label>
        <div class="wiz-key-status" id="wiz-tmdb-key-status"></div>
        <div class="wiz-note">Without a TMDB key, posters and metadata won't load on Nuvio Mobile. TV works fine without it. <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener" class="wiz-link">Get a free TMDB key →</a></div>
        ` : ''}
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-torbox-back"><span>← Back</span></button>
          <button class="wiz-primary" id="wiz-torbox-next"><span>Continue →</span></button>
        </div>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.streamingSubStep = 'prompt'; render(); });
    const keyInput = el('wiz-torbox-key');
    if (keyInput) keyInput.addEventListener('input', () => {
      state.torboxKey = keyInput.value.trim();
      state.torboxShapeWarned = false;
      const status = el('wiz-key-status');
      if (status) status.innerHTML = torboxStatusHtml(state.torboxKey);
    });
    const tmdbInput = el('wiz-tmdb-key');
    if (tmdbInput) tmdbInput.addEventListener('input', () => { state.tmdbKey = tmdbInput.value.trim(); });
    wireKeyTestButton('wiz-torbox-test', 'wiz-torbox-key', testTorboxKeyLive);
    wireKeyTestButton('wiz-tmdb-test', 'wiz-tmdb-key', testTmdbKeyLive);
    el('wiz-torbox-back').addEventListener('click', () => { state.streamingSubStep = 'prompt'; render(); });
    el('wiz-torbox-next').addEventListener('click', () => {
      const keyEl = el('wiz-torbox-key');
      if (keyEl) state.torboxKey = keyEl.value.trim();
      const tmdbEl = el('wiz-tmdb-key');
      if (tmdbEl) state.tmdbKey = tmdbEl.value.trim();
      if (state.torboxKey && !isTorboxKeyShape(state.torboxKey) && !state.torboxShapeWarned) {
        state.torboxShapeWarned = true;
        showToast('That Torbox key looks like a typo. Double-check it before finishing.', 'warning');
      }
      state.streamingSubStep = 'addons';
      state.streamingShowAddons = false;
      render();
    });
  }

  function renderStreamingAddons(panel) {
    const choices = ensureAddonChoices();
    if (!state.streamingShowAddons) {
      // Presets instead of a bare yes/no: the "yes" branch drops a first-timer
      // straight into checkboxes, quality presets and resolution grids. Each
      // card below is a complete, working answer, so nobody has to understand
      // the full panel to get a setup that works.
      panel.innerHTML = `
        ${header('Stream Sources', 'How much do you want to fiddle with this?', true, 'streaming')}
        <div class="wiz-body">
          <p class="wiz-note">${glossaryTip('scraper', 'Scrapers')} are what find something to actually play. They work with ${glossaryTip('torbox', 'Torbox')} out of the box — no extra keys.</p>
          ${SCRAPER_PRESET_CARDS.map((p) => `
            <button class="wiz-option" data-scraper-preset="${escapeAttr(p.id)}">
              <span class="wiz-option-icon${p.accent ? ' accent' : ''}">${p.icon}</span>
              <span class="wiz-option-text">
                <span class="wiz-option-title">${escapeHtml(p.title)}</span>
                <span class="wiz-option-desc">${escapeHtml(p.desc)}</span>
              </span>
            </button>`).join('')}
          <!-- onAddonsApply() warns here (e.g. scrapers picked with no Torbox
               key); without this container that warning is swallowed and the
               card click looks like it did nothing. -->
          <div class="wiz-error" id="wiz-error" style="display:none; margin-top:12px;"></div>
          <button type="button" class="wiz-quiet-link" id="wiz-addons-skip">Skip this — I'll sort out streaming in Nuvio myself</button>
        </div>`;
      el('wiz-close').addEventListener('click', close);
      el('wiz-back').addEventListener('click', () => { state.streamingSubStep = 'torbox'; render(); });
      el('wiz-addons-skip').addEventListener('click', () => onAddonsApply(false));
      panel.querySelectorAll('[data-scraper-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const preset = SCRAPER_PRESET_CARDS.find((p) => p.id === btn.dataset.scraperPreset);
          if (!preset) return;
          if (preset.custom) { state.streamingShowAddons = true; render(); return; }
          state.scraperConfig = Object.assign(defaultScraperConfig(), preset.config);
          onAddonsApply(true);
        });
      });
      return;
    }
    // Full addon list view
    const cfg = initScraperConfig();
    const selectedRes = new Set(cfg.resolutions || []);

    panel.innerHTML = `
      ${header('Scraper Addons', 'Pick which scrapers to wire in. You can always add more in Nuvio later.', true, 'streaming')}
      <div class="wiz-body">
        <div class="wiz-scraper-section">
          <div class="wiz-scraper-label">Content scrapers</div>
          <label class="wiz-addon-row">
            <input type="checkbox" class="wiz-addon-check" id="wiz-scraper-torrentio" ${cfg.torrentio ? 'checked' : ''}>
            <span class="wiz-addon-text">
              <span class="wiz-addon-name">Torrentio</span>
              <span class="wiz-addon-note">Finds the most streams. Works with Torbox Instant, no extra key needed.</span>
            </span>
          </label>
          <label class="wiz-addon-row">
            <input type="checkbox" class="wiz-addon-check" id="wiz-scraper-comet" ${cfg.comet ? 'checked' : ''}>
            <span class="wiz-addon-text">
              <span class="wiz-addon-name">Comet</span>
              <span class="wiz-addon-note">A second scraper for broader coverage. Instance quality varies by region.</span>
            </span>
          </label>
          <div id="wiz-comet-instance-wrap" style="${cfg.comet ? '' : 'display:none;'}">
            <label class="wiz-label">Comet instance
              <select id="wiz-scraper-instance" class="wiz-input">
                ${COMET_INSTANCES.map((inst) => `<option value="${escapeAttr(inst.value)}" ${cfg.cometInstance === inst.value ? 'selected' : ''}>${escapeHtml(inst.label)}</option>`).join('')}
              </select>
            </label>
          </div>
          <label class="wiz-addon-row">
            <input type="checkbox" class="wiz-addon-check" id="wiz-scraper-mediafusion" ${cfg.mediafusion ? 'checked' : ''}>
            <span class="wiz-addon-text">
              <span class="wiz-addon-name">MediaFusion</span>
              <span class="wiz-addon-note">A third scraper for extra coverage. Works with Torbox Instant, no extra key needed.</span>
            </span>
          </label>
          <label class="wiz-label" style="margin-top:14px;">Quality preset
            <select id="wiz-scraper-preset" class="wiz-input">
              <option value="safe" ${cfg.preset === 'safe' ? 'selected' : ''}>Safe Start</option>
              <option value="quality" ${cfg.preset === 'quality' ? 'selected' : ''}>Best Quality</option>
              <option value="lowBandwidth" ${cfg.preset === 'lowBandwidth' ? 'selected' : ''}>Low Bandwidth</option>
              <option value="maximum" ${cfg.preset === 'maximum' ? 'selected' : ''}>Maximum</option>
              <option value="firehose" ${cfg.preset === 'firehose' ? 'selected' : ''}>Firehose</option>
              <option value="seeders" ${cfg.preset === 'seeders' ? 'selected' : ''}>Sort by Seeders</option>
            </select>
          </label>
          <div id="wiz-preset-desc" class="wiz-note" style="margin-top:6px;">${escapeHtml(PRESET_DESCRIPTIONS[cfg.preset] || '')}</div>
          <button type="button" class="wiz-scraper-customize-toggle" id="wiz-scraper-customize-toggle">
            <span id="wiz-scraper-customize-caret">${cfg.customizeOpen ? '▾' : '▸'}</span> Customize
          </button>
          <div id="wiz-scraper-customize" style="${cfg.customizeOpen ? '' : 'display:none;'}">
            <div class="wiz-scraper-fields">
              <label class="wiz-label">Max results <span class="wiz-hint">per resolution (0 = unlimited)</span>
                <input type="number" id="wiz-scraper-maxresults" class="wiz-input" min="0" max="50" value="${cfg.maxResults}">
              </label>
              <label class="wiz-label">Max size <span class="wiz-hint">in GB (0 = no cap)</span>
                <input type="number" id="wiz-scraper-maxsize" class="wiz-input" min="0" max="1000" value="${cfg.maxSize}">
              </label>
            </div>
            <div class="wiz-scraper-toggles">
              <label class="wiz-scraper-toggle-row"><input type="checkbox" id="wiz-scraper-cached" ${cfg.cachedOnly ? 'checked' : ''}> Cached only</label>
              <label class="wiz-scraper-toggle-row"><input type="checkbox" id="wiz-scraper-trash" ${cfg.removeTrash ? 'checked' : ''}> Remove trash releases (cams, screeners)</label>
              <label class="wiz-scraper-toggle-row"><input type="checkbox" id="wiz-scraper-dedupe" ${cfg.deduplicateStreams ? 'checked' : ''}> Deduplicate streams</label>
            </div>
            <div class="wiz-label" style="margin-top:10px;">Resolutions</div>
            <div class="wiz-scraper-res-grid">
              ${RESOLUTION_KEYS.map((k) => `<label class="wiz-scraper-res-item"><input type="checkbox" class="wiz-scraper-res" value="${k}" ${selectedRes.has(k) ? 'checked' : ''}> ${RESOLUTION_LABELS[k]}</label>`).join('')}
            </div>
            <div class="wiz-scraper-res-shortcuts">
              <button type="button" class="wiz-scraper-shortcut" id="wiz-shortcut-quality">4K &amp; 1080p</button>
              <button type="button" class="wiz-scraper-shortcut" id="wiz-shortcut-all">All</button>
            </div>
          </div>
        </div>

        <div class="wiz-error" id="wiz-error" style="display:none;"></div>
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-addons-back-list"><span>← Back</span></button>
          <button class="wiz-primary" id="wiz-addons-finish"><span>Continue →</span></button>
        </div>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.streamingShowAddons = false; render(); });

    // Managed scraper toggles
    const torrentioEl = el('wiz-scraper-torrentio');
    const cometEl = el('wiz-scraper-comet');
    if (torrentioEl) torrentioEl.addEventListener('change', () => { cfg.torrentio = torrentioEl.checked; });
    if (cometEl) cometEl.addEventListener('change', () => {
      cfg.comet = cometEl.checked;
      const wrap = el('wiz-comet-instance-wrap');
      if (wrap) wrap.style.display = cfg.comet ? '' : 'none';
    });
    const instanceEl = el('wiz-scraper-instance');
    if (instanceEl) instanceEl.addEventListener('change', () => { cfg.cometInstance = instanceEl.value; });
    const mediafusionEl = el('wiz-scraper-mediafusion');
    if (mediafusionEl) mediafusionEl.addEventListener('change', () => { cfg.mediafusion = mediafusionEl.checked; });

    // Preset picker
    const presetEl = el('wiz-scraper-preset');
    if (presetEl) presetEl.addEventListener('change', () => {
      applyPresetToForm(presetEl.value);
      const descEl = el('wiz-preset-desc');
      if (descEl) descEl.textContent = PRESET_DESCRIPTIONS[presetEl.value] || '';
    });

    // Customize toggle
    const customizeToggle = el('wiz-scraper-customize-toggle');
    if (customizeToggle) customizeToggle.addEventListener('click', () => {
      cfg.customizeOpen = !cfg.customizeOpen;
      const pane = el('wiz-scraper-customize');
      const caret = el('wiz-scraper-customize-caret');
      if (pane) pane.style.display = cfg.customizeOpen ? '' : 'none';
      if (caret) caret.textContent = cfg.customizeOpen ? '▾' : '▸';
    });

    // Override fields — update cfg live so onAddonsApply reads current values
    const maxResultsEl = el('wiz-scraper-maxresults');
    const maxSizeEl = el('wiz-scraper-maxsize');
    const cachedEl = el('wiz-scraper-cached');
    const trashEl = el('wiz-scraper-trash');
    const dedupeEl = el('wiz-scraper-dedupe');
    if (maxResultsEl) maxResultsEl.addEventListener('input', () => { cfg.maxResults = Number(maxResultsEl.value) || 0; });
    if (maxSizeEl) maxSizeEl.addEventListener('input', () => { cfg.maxSize = Number(maxSizeEl.value) || 0; });
    if (cachedEl) cachedEl.addEventListener('change', () => { cfg.cachedOnly = cachedEl.checked; });
    if (trashEl) trashEl.addEventListener('change', () => { cfg.removeTrash = trashEl.checked; });
    if (dedupeEl) dedupeEl.addEventListener('change', () => { cfg.deduplicateStreams = dedupeEl.checked; });
    document.querySelectorAll('.wiz-scraper-res').forEach((cb) => {
      cb.addEventListener('change', () => {
        cfg.resolutions = [...document.querySelectorAll('.wiz-scraper-res:checked')].map((c) => c.value);
      });
    });

    // Resolution shortcuts
    const shortcutQuality = el('wiz-shortcut-quality');
    const shortcutAll = el('wiz-shortcut-all');
    if (shortcutQuality) shortcutQuality.addEventListener('click', () => applyPresetToForm('quality'));
    if (shortcutAll) shortcutAll.addEventListener('click', () => applyPresetToForm('maximum'));

    el('wiz-addons-back-list').addEventListener('click', () => { state.streamingShowAddons = false; render(); });
    el('wiz-addons-finish').addEventListener('click', () => { state.streamingSubStep = 'custom-addons'; render(); });
  }

  // Separate step (was previously bundled into the managed-scrapers screen
  // above): lets the user paste in their own addon manifest URLs.
  function renderStreamingCustomAddons(panel) {
    const choices = ensureAddonChoices();
    const customRows = choices.map((a, i) => `
      <label class="wiz-addon-row">
        <input type="checkbox" class="wiz-addon-check" data-idx="${i}" ${a.checked ? 'checked' : ''}>
        <span class="wiz-addon-text">
          <span class="wiz-addon-name">${escapeHtml(a.name)}</span>
          ${a.note ? `<span class="wiz-addon-note">${escapeHtml(a.note)}</span>` : ''}
        </span>
        <button type="button" class="wiz-addon-remove" data-remove="${i}" title="Remove">&times;</button>
      </label>`).join('');

    panel.innerHTML = `
      ${header('Add Your Own Addons', `Got your own ${glossaryTip('scraper', 'scraper')} or ${glossaryTip('addon', 'addon')}? Paste its ${glossaryTip('manifest', 'manifest URL')} below. Skip this if you're happy with what you picked already.`, true, 'streaming')}
      <div class="wiz-body">
        <p class="wiz-note" style="margin-bottom:10px; opacity:0.75;">A manifest URL looks like <code>https://torrentio.strem.fun/manifest.json</code> — the addon's own site gives you one to copy.</p>
        <div class="wiz-addon-add">
          <input type="text" id="wiz-addon-name" class="wiz-input wiz-addon-add-name" placeholder="Addon Name">
          <input type="text" id="wiz-addon-url" class="wiz-input wiz-addon-add-url" placeholder="Manifest URL (https://...)">
          <button type="button" class="wiz-secondary wiz-addon-add-btn" id="wiz-addon-add-btn"><span>Add Addon</span></button>
        </div>
        ${customRows ? `<div class="wiz-addon-list" id="wiz-addon-list" style="margin-top:8px;">${customRows}</div>` : '<div id="wiz-addon-list"></div>'}

        <div class="wiz-error" id="wiz-error" style="display:none;"></div>
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-custom-addons-back"><span>← Back</span></button>
          <button class="wiz-primary" id="wiz-custom-addons-finish"><span>Finish setup</span></button>
        </div>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.streamingSubStep = 'addons'; render(); });

    panel.querySelectorAll('.wiz-addon-check[data-idx]').forEach((cb) => {
      const idx = Number(cb.getAttribute('data-idx'));
      if (choices[idx]) cb.addEventListener('change', () => { choices[idx].checked = cb.checked; });
    });
    panel.querySelectorAll('.wiz-addon-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-remove'));
        choices.splice(idx, 1);
        render();
      });
    });
    const addBtn = el('wiz-addon-add-btn');
    addBtn.addEventListener('click', async () => {
      const nm = el('wiz-addon-name');
      const ur = el('wiz-addon-url');
      const url = (ur && ur.value || '').trim();
      if (!url) return showInlineError("Enter the addon's manifest link to add it.");
      addBtn.disabled = true;
      const check = await checkManifestAlive(url);
      addBtn.disabled = false;
      if (check.ok === false) return showInlineError(check.reason);
      if (check.ok === null && state._lastAddonUrlWarned !== url) {
        state._lastAddonUrlWarned = url;
        return showInlineError(check.reason);
      }
      state._lastAddonUrlWarned = null;
      choices.push({ name: (nm && nm.value || '').trim() || url, url, note: '', checked: true, verified: true });
      render();
    });
    el('wiz-custom-addons-back').addEventListener('click', () => { state.streamingSubStep = 'addons'; render(); });
    el('wiz-custom-addons-finish').addEventListener('click', () => { onAddonsApply(true); });
  }

  // Live key checks — actually calls the provider's API rather than just
  // checking the key's shape. Used by the "Test" buttons next to key fields.
  async function testTorboxKeyLive(key) {
    try {
      const res = await fetch('https://api.torbox.app/v1/api/user/me', {
        headers: { Authorization: `Bearer ${key}` },
      });
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, unreachable: true };
    }
  }
  async function testTmdbKeyLive(key) {
    try {
      // v3 API key via query param — matches how this key is actually used
      // everywhere else in this file (getPreviewMovie, aioConfig.apiKeys.tmdbApiKey,
      // the AIO Streams config payload). A v4 Read Access Token would need
      // Authorization: Bearer instead, but that's not what this app consumes.
      const res = await fetch(`https://api.themoviedb.org/3/authentication?api_key=${encodeURIComponent(key)}`);
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, unreachable: true };
    }
  }
  // MDBList's own key-check endpoint. Same defensive shape as the two above:
  // a network/CORS failure reports "unreachable" rather than claiming the
  // key is bad, since we can't tell those apart from the browser.
  async function testMdblistKeyLive(key) {
    try {
      const res = await fetch(`https://api.mdblist.com/user?apikey=${encodeURIComponent(key)}`);
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, unreachable: true };
    }
  }
  function wireKeyTestButton(buttonId, keyFieldId, testFn) {
    const btn = el(buttonId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const keyEl = el(keyFieldId);
      const key = keyEl ? keyEl.value.trim() : '';
      if (!key) { showToast('Enter a key first.', 'error'); return; }
      const original = btn.textContent;
      btn.textContent = '...';
      btn.disabled = true;
      const result = await testFn(key);
      btn.disabled = false;
      btn.textContent = original;
      if (result.unreachable) showToast('Could not reach the server to check that key. Try again in a moment.', 'error');
      else if (result.ok) showToast('✓ That key works.', 'success');
      else showToast('That key was rejected. Double-check it.', 'error');
    });
  }

  // Instant format feedback under the Torbox field.
  function torboxStatusHtml(key) {
    const k = String(key || '').trim();
    if (!k) return '';
    if (isTorboxKeyShape(k)) return `<span class="wiz-key-ok">${ICON.check} Looks like a valid Torbox key</span>`;
    return `<span class="wiz-key-bad">That doesn't look like a Torbox key. It should look like <code>xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</code></span>`;
  }

  // Push Torbox key + TMDB key + (optionally) addon list, then route onward.
  async function onAddonsApply(withAddons) {
    const choices = ensureAddonChoices();
    if (withAddons) {
      // Count managed scrapers that are checked (for Torbox warning)
      const scraperCfg = state.scraperConfig || defaultScraperConfig();
      const managedCount = (scraperCfg.torrentio ? 1 : 0) + (scraperCfg.comet ? 1 : 0) + (scraperCfg.mediafusion ? 1 : 0);

      const picked = choices.filter((a) => a.checked && a.url);
      const unverified = picked.filter((a) => !a.verified);
      if (unverified.length) {
        if (!state._streamManifestWarnedUrls) state._streamManifestWarnedUrls = new Set();
        for (const addon of unverified) {
          const check = await checkManifestAlive(addon.url);
          if (check.ok === false) return showInlineError(`${addon.name || addon.url}: ${check.reason}`);
          if (check.ok === null && !state._streamManifestWarnedUrls.has(addon.url)) {
            state._streamManifestWarnedUrls.add(addon.url);
            return showInlineError(`${addon.name || addon.url}: ${check.reason}`);
          }
          addon.verified = true;
        }
      }
      if (!state.torboxKey && (managedCount + picked.length > 0) && !state.streamWarned) {
        state.streamWarned = true;
        // Reached from the preset cards as well as the full panel now, so the
        // copy can't name one specific button.
        return showInlineError("Heads up: without a Torbox key these scrapers usually can't play anything. Choose again to continue without it.");
      }
    }
    try {
      state.pushingLabel = withAddons ? 'Setting up your streaming & integrations...' : 'Setting up your streaming...';
      go('pushing');
      const pid = state.targetProfileId;
      state.torboxApplied = false;
      if (state.torboxKey) {
        await window.NuvioPush.setupTorbox(state.token, pid, state.torboxKey, SETTINGS_PLATFORMS);
        state.torboxApplied = true;
      }
      if (state.tmdbKey) {
        await window.NuvioPush.applyProfileSettings(state.token, pid, SETTINGS_PLATFORMS, { tmdbKey: state.tmdbKey });
        state.tmdbApplied = true;
      }
      if (withAddons) {
        // Build parameterized manifest URLs for managed scrapers
        const scraperCfg = state.scraperConfig || defaultScraperConfig();
        const managedAddons = [];
        if (scraperCfg.torrentio) managedAddons.push({ name: 'Torrentio', url: buildTorrentioManifestUrl(scraperCfg) });
        if (scraperCfg.comet) managedAddons.push({ name: 'Comet', url: buildCometManifestUrl(scraperCfg.cometInstance, scraperCfg) });
        // MediaFusion installs with its default (unconfigured) settings — its
        // manifest URL doesn't support the same client-side config-encoding
        // Torrentio/Comet use, so the Quality Preset above doesn't apply to it.
        if (scraperCfg.mediafusion) managedAddons.push({ name: 'MediaFusion', url: 'https://mediafusion.elfhosted.com/manifest.json' });

        const picked = choices.filter((a) => a.checked && a.url);
        const toInstall = [...managedAddons, ...picked.map((a) => ({ name: a.name, url: a.url }))];
        if (toInstall.length) {
          await window.NuvioPush.installAddons(state.token, pid, toInstall);
          state.addonsAdded = toInstall.map((a) => a.name);
        }
      }
      state.streamingApplied = true;
      afterStreaming();
    } catch (err) {
      state.errorMsg = (err && err.message) || String(err);
      go('error');
    }
  }

  function hasForYouFolder() {
    try {
      const compiled = window.KaptainExport.assembleFilteredDatabase();
      return compiled.some(function(cat) {
        return (cat.folders || []).some(function(f) { return f.id === 'folder-25429024'; });
      });
    } catch (e) { return false; }
  }

  function afterStreaming() { go('done'); }

  // ====================================================================
  // DEVICE SELECTION STEP
  // ====================================================================
  function renderDevices(panel) {
    const tvChecked = state.devices.includes('tv');
    const mobileChecked = state.devices.includes('mobile');
    const viewMode = (localStorage.getItem('kaptain_view_mode') || 'FOLLOW_LAYOUT').toUpperCase();
    const hasRowsIssue = viewMode === 'ROWS' || viewMode === 'FOLLOW_LAYOUT';

    panel.innerHTML = `
      ${header('Your Devices', 'What do you use Nuvio on? This helps us set things up right.', false, 'devices')}
      <div class="wiz-body">
        <div class="wiz-label" style="margin-bottom:10px;">What devices do you use Nuvio on?</div>
        <div class="wiz-device-options">
          <label class="wiz-device-check-row${tvChecked ? ' checked' : ''}" id="wiz-device-tv-row">
            <input type="checkbox" id="wiz-device-tv" ${tvChecked ? 'checked' : ''}>
            <span class="wiz-device-label">📺  TV</span>
          </label>
          <label class="wiz-device-check-row${mobileChecked ? ' checked' : ''}" id="wiz-device-mobile-row">
            <input type="checkbox" id="wiz-device-mobile" ${mobileChecked ? 'checked' : ''}>
            <span class="wiz-device-label">📱  Mobile</span>
          </label>
        </div>
        <div class="wiz-rows-warning" id="wiz-rows-warning" style="display:${hasRowsIssue ? '' : 'none'};">
          <strong>Heads up:</strong> Rows mode doesn't scroll well outside the Nuvio TV app, and that includes Nuvio Mobile and Nuvio's web/desktop client. We recommend switching your export to Tabbed Grid.
          <label class="wiz-rows-warning-check">
            <input type="checkbox" id="wiz-rows-auto-switch" ${state._devicesAutoSwitch !== false ? 'checked' : ''}>
            Auto-switch to Tabbed Grid (recommended)
          </label>
        </div>
        <div class="wiz-error" id="wiz-error" style="display:none;"></div>
        <button class="wiz-primary" id="wiz-devices-next" style="margin-top:8px;"><span>Continue →</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);

    const tvCb = el('wiz-device-tv');
    const mobileCb = el('wiz-device-mobile');

    function syncDevicesUI() {
      const newDevices = [];
      if (tvCb && tvCb.checked) newDevices.push('tv');
      if (mobileCb && mobileCb.checked) newDevices.push('mobile');
      state.devices = newDevices;
      const tvRow = el('wiz-device-tv-row');
      const mobileRow = el('wiz-device-mobile-row');
      if (tvRow) tvRow.classList.toggle('checked', state.devices.includes('tv'));
      if (mobileRow) mobileRow.classList.toggle('checked', state.devices.includes('mobile'));
      const warning = el('wiz-rows-warning');
      if (warning) warning.style.display = hasRowsIssue ? '' : 'none';
      // Clear validation error as soon as the user makes a selection
      if (newDevices.length > 0) { const box = el('wiz-error'); if (box) box.style.display = 'none'; }
    }

    if (tvCb) tvCb.addEventListener('change', syncDevicesUI);
    if (mobileCb) mobileCb.addEventListener('change', syncDevicesUI);

    el('wiz-devices-next').addEventListener('click', () => {
      if (state.devices.length === 0) return showInlineError('Pick at least one device to continue.');
      try { localStorage.setItem('kaptain_last_devices', JSON.stringify(state.devices)); } catch (e) {}
      const autoSwitch = el('wiz-rows-auto-switch');
      state._devicesAutoSwitch = autoSwitch ? autoSwitch.checked : true;
      if (state._devicesAutoSwitch && hasRowsIssue) {
        if (window.KaptainExport && window.KaptainExport.setLastExportOptimize) {
          window.KaptainExport.setLastExportOptimize(true);
        }
      }
      go('account');
    });
  }

  // ====================================================================
  // FOR YOU STEP (AIO Metadata / Trakt setup when that folder is selected)
  // ====================================================================
  function goToStreaming() {
    state.streamingSubStep = null;
    state.streamingShowAddons = false;
    go('streaming');
  }

  // Shared markup for Native mode's Trakt sub-flow: authorize + paste-token,
  // used inside renderForYou. Bound to state.aioTraktToken (same field AIO
  // mode uses) so its value survives a re-render when another provider
  // checkbox is toggled alongside it - unlike Bingecat/MDBList's inputs,
  // this field previously wasn't bound to state at all (read locally at
  // click-time only), which only worked because Trakt used to be the sole
  // possible selection and never had to coexist with a re-render mid-flow.
  function renderTraktSubFlowHtml() {
    const hasToken = !!state.aioTraktToken;
    return `
        <div id="wiz-trakt-step1">
          <button type="button" class="wiz-primary" id="wiz-foryou-trakt" style="margin-bottom:18px;"><span>1. Authorize Trakt</span></button>
          <div class="wiz-note" style="margin-bottom:18px;">Clicking this will open AIO Metadata in a new tab. After authorizing, <strong>copy the Token ID</strong> shown on the screen and paste it below.</div>
        </div>

        <div id="wiz-trakt-step2" style="display:${hasToken ? 'block' : 'none'}; margin-bottom:18px;">
          <label class="wiz-label">Trakt Token ID
            <input type="text" id="wiz-trakt-token-id" class="wiz-input" placeholder="Paste your Token ID here..." value="${escapeAttr(state.aioTraktToken || '')}" style="margin-bottom:12px;" autocomplete="off">
          </label>
          <button type="button" class="wiz-primary" id="wiz-foryou-save-trakt"><span>2. Save Token</span></button>
        </div>

        <div id="wiz-trakt-status" style="display:none; margin-bottom:18px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;"></div>`;
  }

  // Native Mode's "For You" sub-flow: choose which service(s), then (if
  // Trakt or MDBList is on) pick the shared AIO Metadata instance once, then
  // one screen per checked provider in order - instead of stacking every
  // provider's fields on one long page. Mirrors AIO Streams' own split
  // (renderAioForYou above), reusing the same forYouProviderOrder()/
  // nativeForYouStepCount() family of helpers.
  function renderForYou(panel) {
    const step = state.nativeForYouStep || 'choose';
    if (step === 'instance') return renderNativeForYouInstance(panel);
    if (step === 'trakt') return renderNativeForYouTrakt(panel);
    if (step === 'bingecat') return renderNativeForYouBingecat(panel);
    if (step === 'mdblist') return renderNativeForYouMdblist(panel);
    return renderNativeForYouChoose(panel);
  }

  // Advances past `current` to the next screen in the walk, or - once
  // there's nowhere left to go - runs the same install/push confirmForYouSetup()
  // used to do from its single end-of-flow "Save & Continue" button.
  function advanceNativeForYou(current) {
    const next = nextNativeForYouStep(current);
    if (next) { state.nativeForYouStep = next; render(); }
    else { confirmForYouSetup(); }
  }

  function renderNativeForYouChoose(panel) {
    const traktOn = isForYouProviderOn('trakt');
    const bingecatOn = isForYouProviderOn('bingecat');
    const mdblistOn = isForYouProviderOn('mdblist');
    panel.innerHTML = `
      ${header('Set Up "For You"', '', false, 'mode')}
      <div class="wiz-body">
        <p class="wiz-note">Your collection includes the <strong style="color:var(--text-primary)">"For You"</strong> folder - personalized recommendations, watchlist, and what's coming up next. Pick which service(s) power it (you can pick more than one).</p>
        <div class="wiz-device-options" style="margin-bottom:16px;">
          <label class="wiz-device-check-row${traktOn ? ' checked' : ''}">
            <input type="checkbox" data-foryou-provider="trakt" ${traktOn ? 'checked' : ''}>
            <span class="wiz-device-text">
              <span class="wiz-device-label">${glossaryTip('trakt', 'Trakt')}</span>
              <span class="wiz-device-desc">Tracks what you watch and builds recommendations from it. Free account, no card.</span>
            </span>
          </label>
          <label class="wiz-device-check-row${bingecatOn ? ' checked' : ''}">
            <input type="checkbox" data-foryou-provider="bingecat" ${bingecatOn ? 'checked' : ''}>
            <span class="wiz-device-text">
              <span class="wiz-device-label">${glossaryTip('bingecat', 'Bingecat AI')}</span>
              <span class="wiz-device-desc">AI-generated picks. You build the list on Bingecat's site, then paste the link it gives you back here.</span>
            </span>
          </label>
          <label class="wiz-device-check-row${mdblistOn ? ' checked' : ''}">
            <input type="checkbox" data-foryou-provider="mdblist" ${mdblistOn ? 'checked' : ''}>
            <span class="wiz-device-text">
              <span class="wiz-device-label">${glossaryTip('mdblist', 'MDBList')}</span>
              <span class="wiz-device-desc">Curated and personal lists, synced back via ${glossaryTip('syncribullet', 'Syncribullet')}.</span>
            </span>
          </label>
        </div>
        <p class="wiz-note" style="opacity:0.7;">Picking none is fine too - tap "Skip for now" below.</p>
        <div class="wiz-btn-row" style="margin-top:16px;">
          <button class="wiz-secondary" id="wiz-foryou-skip"><span>Skip for now</span></button>
          <button class="wiz-primary" id="wiz-foryou-choose-continue"><span>Continue →</span></button>
        </div>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    wireForYouProviderToggle(panel);
    // "Skip for now" means skip *For You*, not skip the rest of setup - both
    // paths still have to land on the Torbox/scraper screens or the visitor
    // ends up on "You're live" with no debrid key and no scrapers at all.
    el('wiz-foryou-skip').addEventListener('click', () => goToStreaming());
    el('wiz-foryou-choose-continue').addEventListener('click', () => {
      if (!anyForYouProviderOn()) { goToStreaming(); return; }
      advanceNativeForYou('choose');
    });
  }

  function renderNativeForYouInstance(panel) {
    const instance = state.nativeAioInstance || 'auto';
    panel.innerHTML = `
      ${header('AIO Metadata Instance', 'Trakt and MDBList share one instance behind the scenes - pick which one to use.', true, 'mode')}
      <div class="wiz-body">
        ${nativeForYouStepCounterHtml('instance')}
        <label class="wiz-label">AIO Metadata Instance
          <select id="wiz-aio-instance" class="wiz-input" style="margin-bottom:12px;">
            <option value="auto" ${instance === 'auto' ? 'selected' : ''}>Auto (Fastest Instance)</option>
            <option value="https://aiometadata.elfhosted.com/" ${instance === 'https://aiometadata.elfhosted.com/' ? 'selected' : ''}>ElfHosted (Reliable, 200 Catalog Limit)</option>
            <option value="https://aiometadatafortheweebs.midnightignite.me/" ${instance === 'https://aiometadatafortheweebs.midnightignite.me/' ? 'selected' : ''}>Midnight (Community, 250 Catalog Limit)</option>
            <option value="https://aiometadata.viren070.me/" ${instance === 'https://aiometadata.viren070.me/' ? 'selected' : ''}>Viren (Community, 250 Catalog Limit)</option>
          </select>
        </label>
        <button class="wiz-primary" id="wiz-foryou-instance-continue" style="margin-top:6px;"><span>Continue →</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.nativeForYouStep = prevNativeForYouStep('instance'); render(); });
    el('wiz-foryou-instance-continue').addEventListener('click', () => {
      state.nativeAioInstance = el('wiz-aio-instance').value;
      advanceNativeForYou('instance');
    });
  }

  function renderNativeForYouTrakt(panel) {
    panel.innerHTML = `
      ${header('Set Up Trakt', 'Authorize Trakt so AIO Metadata can build "For You" from your watch history.', true, 'mode')}
      <div class="wiz-body">
        ${nativeForYouStepCounterHtml('trakt')}
        ${renderTraktSubFlowHtml()}
        <div class="wiz-error" id="wiz-error" style="display:none;"></div>
        <div class="wiz-note" style="margin-top:10px; opacity:0.75;">Once connected here, also link Trakt directly inside Nuvio (Settings &gt; Integrations) to enable scrobbling and watch history - those are separate from AIO Metadata.</div>
        <button class="wiz-primary" id="wiz-foryou-trakt-continue" style="margin-top:16px;"><span>Continue →</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.nativeForYouStep = prevNativeForYouStep('trakt'); render(); });

    el('wiz-foryou-trakt').addEventListener('click', async () => {
      const statusEl = el('wiz-trakt-status');
      let baseUrl = state.nativeAioInstance || 'auto';

      statusEl.style.display = 'block';
      statusEl.innerHTML = '<span style="color:#2196f3;">Locating instance...</span>';

      if (baseUrl === 'auto') {
        baseUrl = await checkAioMetadataInstances();
      }

      // Trakt's OAuth token is minted and stored server-side on WHICHEVER
      // host actually handled the authorize request - it means nothing to
      // a different host. Pin it here so confirmForYouSetup() saves the
      // config to this exact same host later, instead of re-running "auto"
      // detection independently and risking a different (fastest-at-that-
      // moment) host winning the race. Without this, authorizing on host A
      // then saving to host B silently leaves the token unrecognized and
      // "For You" resolves empty - confirmed live.
      state._traktAuthHost = baseUrl;

      statusEl.style.display = 'none';
      el('wiz-trakt-step2').style.display = 'block';

      // Open the AIOMetadata authorization page in a new tab
      window.open(baseUrl + 'api/auth/trakt/authorize', '_blank');
    });

    // Just captures the token now - the actual AIO Metadata instance gets
    // provisioned once, later, by confirmForYouSetup(), combined with
    // MDBList's config if that's also checked. Provisioning it here eagerly
    // (like the old single-provider flow did) would risk creating a second,
    // separate AIO Metadata instance alongside MDBList's - both self-report
    // the same addon id "aio-metadata", and two installed instances sharing
    // that id is an unconfirmed/risky configuration in Native Mode.
    el('wiz-foryou-save-trakt').addEventListener('click', () => {
      const tokenId = el('wiz-trakt-token-id').value.trim();
      const errEl = el('wiz-error');
      if (!tokenId) {
        errEl.textContent = 'Please enter the Token ID provided by AIO Metadata.';
        errEl.style.display = 'block';
        return;
      }
      errEl.style.display = 'none';
      state.aioTraktToken = tokenId;
      const statusEl = el('wiz-trakt-status');
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<span style="color:#4caf50;">✓ Token saved.</span>';
    });

    el('wiz-foryou-trakt-continue').addEventListener('click', () => {
      const errEl = el('wiz-error');
      errEl.style.display = 'none';
      if (!state.aioTraktToken && !state.aioTraktWarned) {
        state.aioTraktWarned = true;
        errEl.textContent = 'No Trakt Token ID saved. "For You" will still work for your other picks, but Trakt will stay empty. Tap "Continue" again to proceed without Trakt, or save the Token ID first.';
        errEl.style.display = 'block';
        return;
      }
      advanceNativeForYou('trakt');
    });
  }

  function renderNativeForYouBingecat(panel) {
    panel.innerHTML = `
      ${header('Set Up Bingecat AI', 'Bingecat builds AI-generated picks from your own manifest.', true, 'mode')}
      <div class="wiz-body">
        ${nativeForYouStepCounterHtml('bingecat')}
        ${renderBingecatSubFlowHtml()}
        <button class="wiz-primary" id="wiz-foryou-bingecat-continue" style="margin-top:16px;"><span>Continue →</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.nativeForYouStep = prevNativeForYouStep('bingecat'); render(); });
    wireBingecatAddButton();
    el('wiz-foryou-bingecat-continue').addEventListener('click', () => {
      if (!state.bingecatSources || !state.bingecatSources.length) {
        return showBingecatError('Add your Bingecat manifest URL above first, or tap Back and uncheck Bingecat AI.');
      }
      advanceNativeForYou('bingecat');
    });
  }

  function renderNativeForYouMdblist(panel) {
    panel.innerHTML = `
      ${header('Set Up MDBList', 'MDBList powers "For You" with your curated and personal lists; Syncribullet syncs your watch history back to it.', true, 'mode')}
      <div class="wiz-body">
        ${nativeForYouStepCounterHtml('mdblist')}
        ${renderMdblistSubFlowHtml({ includeSyncribullet: true })}
        <button class="wiz-primary" id="wiz-foryou-mdblist-continue" style="margin-top:16px;"><span>Continue →</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => { state.nativeForYouStep = prevNativeForYouStep('mdblist'); render(); });
    wireMdblistSubFlow(true);
    el('wiz-foryou-mdblist-continue').addEventListener('click', () => {
      if (!state.forYouMdblistKey) {
        return showMdblistError('Enter your MDBList API key first, or tap Back and uncheck MDBList.');
      }
      if (!state.syncribulletManifestUrl) {
        return showMdblistError('Add your Syncribullet manifest URL first, or Nuvio won\'t sync your watch history back to MDBList.');
      }
      advanceNativeForYou('mdblist');
    });
  }

  // ====================================================================
  // AIO METADATA TUTORIAL (floating pointers over a cross-origin iframe)
  // I can't reach into aiometadata.elfhosted.com's DOM, so I just guide the
  // visitor with plain instructions and let them paste the result back into
  // my own manifest URL field above.
  // ====================================================================
  function aioOpen() {
    const overlay = el('aio-overlay');
    if (!overlay) return;
    // Load the iframe only on first open, and never again, so a visitor who
    // closes and reopens the modal doesn't lose their Trakt login session.
    const iframe = el('aio-iframe');
    if (iframe && !iframe.src) iframe.src = 'https://aiometadata.viren070.me/configure';
    aioTutorialIndex = 0;
    overlay.classList.add('open');
    renderAioTutorial();
  }

  function aioClose() {
    const overlay = el('aio-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function renderAioTutorial() {
    const wrap = el('aio-tutorial');
    if (!wrap) return;
    const step = AIO_TUTORIAL_STEPS[aioTutorialIndex];
    wrap.className = `aio-tutorial state-${step.state}`;

    const actionsHtml = step.actions.map((a) => {
      if (a === 'next') return `<button class="wiz-primary" id="aio-tut-next" type="button"><span>Next Step</span></button>`;
      if (a === 'copy') return `<button class="wiz-secondary" id="aio-tut-copy" type="button"><span>Copy Preset to Clipboard</span></button>`;
      if (a === 'copy-primary') return `<button class="wiz-primary" id="aio-tut-copy" type="button"><span>Copy Preset to Clipboard</span></button>`;
      if (a === 'done') return `<button class="wiz-primary" id="aio-tut-done" type="button"><span>Done</span></button>`;
      return '';
    }).join('');

    const refHtml = step.refImage ? `
        <div class="aio-tooltip-ref" id="aio-tut-ref" title="Click to enlarge">
          <img src="${escapeAttr(step.refImage.src)}" alt="" style="object-position: ${escapeAttr(step.refImage.pos)};">
          <span class="aio-tooltip-ref-hint">Click to enlarge</span>
        </div>` : '';

    wrap.innerHTML = `
      <div class="aio-pointer"></div>
      <div class="aio-region"></div>
      <div class="aio-tooltip">
        <div class="aio-tooltip-handle" title="Drag to move"><span class="aio-tooltip-handle-grip"></span></div>
        <div class="aio-tooltip-step">${escapeHtml(step.label)}</div>
        <h4 class="aio-tooltip-title">${escapeHtml(step.title)}</h4>
        <p class="aio-tooltip-body">${escapeHtml(step.body)}</p>${refHtml}
        <div class="aio-tooltip-actions">${actionsHtml}</div>
      </div>`;

    const next = el('aio-tut-next');
    if (next) next.addEventListener('click', () => {
      aioTutorialIndex = Math.min(aioTutorialIndex + 1, AIO_TUTORIAL_STEPS.length - 1);
      renderAioTutorial();
    });
    const copy = el('aio-tut-copy');
    if (copy) copy.addEventListener('click', () => aioCopyPreset(copy));
    const done = el('aio-tut-done');
    if (done) done.addEventListener('click', () => {
      aioClose();
      const input = el('wiz-aio-manifest-url');
      if (input) input.focus();
    });
    const ref = el('aio-tut-ref');
    if (ref && step.refImage) ref.addEventListener('click', () => aioOpenLightbox(step.refImage.src));

    const tooltip = wrap.querySelector('.aio-tooltip');
    const frameWrap = el('aio-frame-wrap');
    if (tooltip && frameWrap) makeAioTooltipDraggable(tooltip, frameWrap);
  }

  function aioOpenLightbox(src) {
    const lightbox = el('aio-lightbox');
    const img = el('aio-lightbox-img');
    if (!lightbox || !img) return;
    img.src = src;
    lightbox.classList.add('open');
  }

  function aioCloseLightbox() {
    const lightbox = el('aio-lightbox');
    if (lightbox) lightbox.classList.remove('open');
  }

  // My best-guess pointer/tooltip position for each step is just that, a
  // guess, since I can't read the real iframe's layout or scroll position
  // from outside. Letting the visitor drag the card off whatever it's
  // covering is the actual fix when a guess is wrong for their screen.
  function makeAioTooltipDraggable(tooltip, frameWrap) {
    const handle = tooltip.querySelector('.aio-tooltip-handle');
    if (!handle) return;
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      const tipRect = tooltip.getBoundingClientRect();
      const wrapRect = frameWrap.getBoundingClientRect();
      startLeft = tipRect.left - wrapRect.left;
      startTop = tipRect.top - wrapRect.top;
      startX = e.clientX;
      startY = e.clientY;
      // Switch off the CSS-class-based position so explicit left/top can drive it.
      tooltip.style.left = `${startLeft}px`;
      tooltip.style.top = `${startTop}px`;
      tooltip.style.right = 'auto';
      tooltip.style.bottom = 'auto';
      tooltip.style.transform = 'none';
      tooltip.classList.add('dragging');
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const wrapRect = frameWrap.getBoundingClientRect();
      let left = startLeft + (e.clientX - startX);
      let top = startTop + (e.clientY - startY);
      left = Math.max(0, Math.min(left, wrapRect.width - tooltip.offsetWidth));
      top = Math.max(0, Math.min(top, wrapRect.height - tooltip.offsetHeight));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });

    const stopDrag = () => {
      dragging = false;
      tooltip.classList.remove('dragging');
    };
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
  }

  // Falls back to the old execCommand approach via a hidden textarea. The
  // Clipboard API isn't just "missing or present": some browsers/contexts
  // (older Safari, restricted iframes, permission-denied embeds) expose
  // navigator.clipboard but still throw when called, so I try it first and
  // fall back on ANY failure, not only when the API is absent.
  function aioCopyPresetFallback() {
    const ta = document.createElement('textarea');
    ta.value = AIO_PRESET_JSON;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) throw new Error('execCommand copy failed');
  }

  async function aioCopyPreset(btn) {
    const span = btn.querySelector('span');
    const original = span ? span.textContent : '';
    try {
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(AIO_PRESET_JSON);
      } catch (clipErr) {
        aioCopyPresetFallback();
      }
      if (span) {
        span.textContent = 'Copied!';
        setTimeout(() => { span.textContent = original; }, 1600);
      }
    } catch (e) {
      if (span) {
        span.textContent = "Couldn't copy, try again";
        setTimeout(() => { span.textContent = original; }, 2000);
      }
    }
  }

  // ----- small helpers -----
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  // Wire up the launcher button + overlay close, once the DOM is ready.
  document.addEventListener('DOMContentLoaded', () => {
    const launch = el('btn-send-to-nuvio');
    if (launch) launch.addEventListener('click', () => {
      if (typeof handleSendToNuvioClick === 'function') {
        handleSendToNuvioClick();
      } else {
        open();
      }
    });

    const overlay = el('wizard-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => { 
        if (e.target === overlay) {
            close(); 
            return;
        }
        
        // Handle pill button clicks
        const pill = e.target.closest('.wiz-pill');
        if (pill) {
            const group = pill.closest('.wiz-pill-group');
            if (group) {
                // Update active state
                group.querySelectorAll('.wiz-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                
                // Update hidden input and trigger change
                const hiddenInput = group.nextElementSibling;
                if (hiddenInput && hiddenInput.tagName === 'INPUT' && hiddenInput.type === 'hidden') {
                    hiddenInput.value = pill.getAttribute('data-value');
                    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
      });
      
      // Any bttr toggle/dropdown recomputes the template URL (using the
      // {imdb_id} placeholder) for the preview and final submission.
      const recomputeBttrUrl = () => {
        state.bttrUrl = buildBttrUrl('{imdb_id}', {
          quality: state.bttrQuality, genre: state.bttrGenre, rating: state.bttrRating,
          age: state.bttrAge, source: state.bttrSource, lang: state.bttrLanguage,
        });
      };

      const updateStateFromDOM = (e) => {
        const id = e.target.id;
        if (id === 'wiz-aio-trakt-token') state.aioTraktToken = e.target.value.trim();
        else if (id === 'wiz-aio-tmdb-key') { state.aioTmdbKey = e.target.value.trim(); updatePosterPreview(); }
        else if (id === 'wiz-aio-tvdb-key') { state.aioTvdbKey = e.target.value.trim(); }
        else if (id === 'wiz-aio-poster-service') {
          state.aioPosterService = e.target.value;
          const rpdbOpts = el('wiz-aio-rpdb-options');
          const bttrOpts = el('wiz-aio-bttr-options');
          const topOpts = el('wiz-aio-top-options');
          if (rpdbOpts) rpdbOpts.style.display = state.aioPosterService === 'rpdb' ? 'block' : 'none';
          if (bttrOpts) bttrOpts.style.display = state.aioPosterService === 'bttr' ? 'block' : 'none';
          if (topOpts) topOpts.style.display = state.aioPosterService === 'top' ? 'block' : 'none';
          refreshPosterPreview();
        }
        else if (id === 'wiz-aio-rpdb-theme') {
          state.aioRpdbTheme = e.target.value;
          const wrap = el('wiz-aio-rpdb-custom-wrap');
          if (wrap) wrap.style.display = state.aioRpdbTheme === 'custom' ? 'block' : 'none';
          refreshPosterPreview();
        }
        else if (id === 'wiz-aio-rpdb-key') { state.aioRpdbKey = e.target.value.trim(); refreshPosterPreview(); }
        else if (id === 'wiz-aio-debrid-type') {
          state.aioDebridType = e.target.value;
          const promo = el('wiz-aio-torbox-promo');
          if (promo) promo.style.display = state.aioDebridType === 'torbox' ? '' : 'none';
        }
        else if (id === 'wiz-aio-debrid-key') state.aioDebridKey = e.target.value.trim();
        else if (id.indexOf('wiz-aio-scraper-') === 0 && e.target.dataset.scraper) {
          const type = e.target.dataset.scraper;
          const current = new Set(state.aioScraperTypes || ['torrentio']);
          if (e.target.checked) {
            current.add(type);
          } else if (current.size > 1) {
            current.delete(type);
          } else {
            // Never allow zero scrapers -- a build with no scraperPresets
            // would go out with no way to find streams at all.
            e.target.checked = true;
          }
          state.aioScraperTypes = Array.from(current);
        }
        else if (id === 'wiz-aio-formatter') { state.aioFormatter = e.target.value; refreshFormatterPreview(); }
        else if (id === 'wiz-aio-language') state.aioLanguage = e.target.value;
        else if (id === 'wiz-aio-streams-password') state.aioStreamsPassword = e.target.value;
        else if (id === 'wiz-bttr-quality') { state.bttrQuality = e.target.checked; recomputeBttrUrl(); refreshPosterPreview(); }
        else if (id === 'wiz-bttr-genre') { state.bttrGenre = e.target.checked; recomputeBttrUrl(); refreshPosterPreview(); }
        else if (id === 'wiz-bttr-rating') { state.bttrRating = e.target.checked; recomputeBttrUrl(); refreshPosterPreview(); }
        else if (id === 'wiz-bttr-source') { state.bttrSource = e.target.value; recomputeBttrUrl(); refreshPosterPreview(); }
        else if (id === 'wiz-bttr-age') { state.bttrAge = e.target.checked; recomputeBttrUrl(); refreshPosterPreview(); }
        else if (id === 'wiz-bttr-language') { state.bttrLanguage = e.target.value; recomputeBttrUrl(); refreshPosterPreview(); }
        else if (id === 'wiz-aio-top-key') { state.aioTopPosterKey = e.target.value.trim(); refreshPosterPreview(); }
        else if (id === 'wiz-email') state.email = e.target.value;
        else if (id === 'wiz-profile-name') state.profileName = e.target.value;
        else if (id === 'wiz-torbox-key') state.torboxKey = e.target.value.trim();
        else if (id === 'wiz-tmdb-key') state.tmdbKey = e.target.value.trim();
        else return;
        saveInputs();
      };
      
      overlay.addEventListener('input', updateStateFromDOM);
      overlay.addEventListener('change', updateStateFromDOM);
    }

    const aioOverlay = el('aio-overlay');
    if (aioOverlay) {
      const aioCloseBtn = el('aio-close');
      if (aioCloseBtn) aioCloseBtn.addEventListener('click', aioClose);
      aioOverlay.addEventListener('click', (e) => { if (e.target === aioOverlay) aioClose(); });
    }

    const aioLightbox = el('aio-lightbox');
    if (aioLightbox) {
      const lightboxCloseBtn = el('aio-lightbox-close');
      if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', aioCloseLightbox);
      aioLightbox.addEventListener('click', (e) => { if (e.target === aioLightbox) aioCloseLightbox(); });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // Each layer closes just itself first, narrowest on top: the reference
      // lightbox can open on top of the AIO modal, which can open on top of
      // the wizard. Closing all three at once on one Escape would surprise.
      if (aioLightbox && aioLightbox.classList.contains('open')) { aioCloseLightbox(); return; }
      if (aioOverlay && aioOverlay.classList.contains('open')) { aioClose(); return; }
      if (overlay && overlay.classList.contains('open')) close();
    });
  });

  // Expose shared bits so the Quick editor can reuse them instead of duplicating.
  window.NuvioWizard = {
    open,
    close,
    SUGGESTED_ADDONS,
    isTorboxKeyShape,
    torboxStatusHtml,
    checkManifestAlive,
    // Shared with app.js so the Quick Editor explains the same jargon the
    // same way the wizard does, from one definition list.
    GLOSSARY,
    glossaryTip,
    testTorboxKeyLive,
    testTmdbKeyLive,
    testMdblistKeyLive,
  };
})();
