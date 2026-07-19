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
    firehose:     'Unlimited results across every resolution — no filtering, no dedup. Nuvio decides what plays. Maximum coverage.',
    seeders:      'Like Firehose, but sorted by seeder count instead of quality. Finds the most popular torrent for each title.',
  };

  function defaultScraperConfig() {
    const p = SCRAPER_PRESETS.firehose;
    return {
      preset: 'firehose', sortBy: p.sortBy, torrentio: true, comet: false,
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

  function refreshFormatterPreview() {
    const nameEl = el('wiz-formatter-preview-name');
    const descEl = el('wiz-formatter-preview-desc');
    if (!nameEl || !descEl) return;
    const example = FORMATTER_PREVIEW_EXAMPLES[state.aioFormatter] || FORMATTER_PREVIEW_EXAMPLES.tamtaro;
    nameEl.textContent = example.name;
    descEl.textContent = example.description;
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
    placementIndex: null,      // where to splice the new rows into existingCollections
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
  };

  function el(id) { return document.getElementById(id); }

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
    state.tmdbKey = '';
    state._devicesAutoSwitch = true;
    state._streamManifestWarnedUrls = null;
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

    if (state.step === 'devices') return renderDevices(panel);
    if (state.step === 'choose') return renderChoose(panel);
    if (state.step === 'mode') return renderMode(panel);
    if (state.step === 'aio-setup') return renderAioSetup(panel);
    if (state.step === 'account') return renderAccount(panel);
    if (state.step === 'profile') return renderProfile(panel);
    if (state.step === 'placement') return renderPlacement(panel);
    if (state.step === 'streaming') return renderStreaming(panel);
    if (state.step === 'pushing') return renderPushing(panel);
    if (state.step === 'for-you') return renderForYou(panel);
    if (state.step === 'done') return renderDone(panel);
    if (state.step === 'error') return renderError(panel);
  }

  function header(title, subtitle, withBack, progressStep) {
    return `
      <div class="wiz-header">
        ${withBack ? `<button class="wiz-back" id="wiz-back" title="Back">${ICON.back}</button>` : ''}
        <div class="wiz-header-text">
          <h3 class="wiz-title">${title}</h3>
          ${subtitle ? `<p class="wiz-sub">${subtitle}</p>` : ''}
        </div>
        <button class="wiz-close" id="wiz-close" aria-label="Close">&times;</button>
      </div>
      ${progressStep ? progressBar(progressStep) : ''}`;
  }

  // Inline "?" tooltips for jargon terms (Trakt, Debrid, RPDB, etc.) — a
  // beginner has no other way to learn what these words mean before picking
  // a setup mode.
  const GLOSSARY = {
    trakt: 'Trakt tracks what you watch and builds personalized recommendation lists.',
    torbox: 'Torbox is a paid "debrid" service — it fetches and streams files instantly instead of torrenting.',
    debrid: 'A debrid service downloads/streams files on fast servers so you never wait on a torrent.',
    rpdb: 'RPDB (Ratings Poster Database) overlays star ratings directly on movie/show posters.',
    aiometadata: 'AIO Metadata is a community service that builds your personalized "For You" catalog from Trakt.',
    aiostreams: 'AIO Streams is a power-user addon that combines several scrapers and a debrid service into one stream source.',
    scraper: 'A scraper addon searches the web for playable stream links for whatever you\'re watching.',
  };
  function glossaryTip(key) {
    const text = GLOSSARY[key];
    if (!text) return '';
    return `<span class="wiz-glossary-tip" tabindex="0" data-tip="${escapeAttr(text)}">?</span>`;
  }

  // Simple Account → Profile → Streaming progress for the guided steps.
  function progressIndex(step) {
    if (step === 'account') return 0;
    if (step === 'profile' || step === 'placement') return 1;
    if (step === 'streaming') return 2;
    return -1;
  }
  function progressBar(step) {
    const idx = progressIndex(step);
    if (idx < 0) return '';
    const labels = ['Account', 'Profile', 'Streaming'];
    const dots = labels.map((label, i) => {
      const cls = i < idx ? 'done' : (i === idx ? 'current' : '');
      const mark = i < idx ? ICON.check : (i + 1);
      return `<span class="wiz-prog-step ${cls}"><span class="wiz-prog-dot">${mark}</span><span class="wiz-prog-label">${label}</span></span>`;
    }).join('<span class="wiz-prog-line"></span>');
    return `<div class="wiz-progress">${dots}</div>`;
  }

  function renderChoose(panel) {
    const { folders, sources } = countSelection();
    panel.innerHTML = `
      ${header('Get Your Collection into Nuvio', `${folders} folders · ${sources} sources ready to go`, false)}
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

  function renderMode(panel) {
    panel.innerHTML = `
      ${header('Setup Mode', 'Choose how you want to configure your streaming setup.', false)}
      <div class="wiz-body">
        <button class="wiz-option" id="wiz-pick-native" style="margin-bottom:12px;">
          <span class="wiz-option-icon accent">${ICON.rocket}</span>
          <span class="wiz-option-text">
            <span class="wiz-option-title">Native Mode (Recommended)</span>
            <span class="wiz-option-desc">Fastest load times, maximum uptime. Trakt${glossaryTip('trakt')} is natively integrated, Torbox${glossaryTip('torbox')} is configured for streaming. AIO Metadata${glossaryTip('aiometadata')} only used for Trakt "For You" lists.</span>
            <span class="wiz-option-desc" style="margin-top:6px; opacity:0.8;">Note: this wizard's Trakt step only powers the "For You" folder. To enable Trakt scrobbling/watch history in Nuvio itself, connect it separately in Nuvio's own Settings → Integrations.</span>
          </span>
        </button>
        <button class="wiz-option" id="wiz-pick-aio">
          <span class="wiz-option-icon">${ICON.download}</span>
          <span class="wiz-option-text">
            <span class="wiz-option-title">AIO Streams Mode</span>
            <span class="wiz-option-desc">Power-user setup. Routes Debrid${glossaryTip('debrid')} services, RPDB${glossaryTip('rpdb')} (Ratings Posters), and 12 distributed AIOMetadata${glossaryTip('aiometadata')} instances through a unified AIO Streams${glossaryTip('aiostreams')} backend payload.</span>
          </span>
        </button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-pick-native').addEventListener('click', () => {
      state.setupMode = 'native';
      go('for-you');
    });
    el('wiz-pick-aio').addEventListener('click', () => {
      state.setupMode = 'aio';
      go('aio-setup');
    });
  }

  function renderAioSetup(panel) {
    panel.innerHTML = `
      ${header('AIO Streams Setup', 'This builds the addon that finds and plays your streams — think of it as an advanced version of what Native Mode sets up.', true)}
      <div class="wiz-body">
        
        <!-- Trakt Section -->
        <div class="wiz-section" style="margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid var(--border);">
          <h4 style="margin:0 0 10px 0; font-size:1.05rem;">1. Trakt & TMDB Authorization</h4>
          <p class="wiz-note" style="margin-bottom:10px;">Connect Trakt to power your "For You" lists, and TMDB to speed up metadata loading.</p>
          <button type="button" class="wiz-primary" id="wiz-aio-trakt-auth" style="margin-bottom:10px;"><span>Authorize Trakt in AIO Metadata</span></button>
          <label class="wiz-label" style="margin-bottom:12px;">Trakt Token ID (Paste here after authorizing)
            <input type="text" id="wiz-aio-trakt-token" class="wiz-input" placeholder="e.g. 12345678-abcd-1234..." value="${escapeAttr(state.aioTraktToken || '')}" autocomplete="off">
          </label>
          <label class="wiz-label" style="margin-bottom:0;">TMDB API Key (Optional but recommended)
            <span class="wiz-input-wrap">
              <input type="text" id="wiz-aio-tmdb-key" class="wiz-input" placeholder="Enter TMDB API Key..." value="${escapeAttr(state.aioTmdbKey || '')}" autocomplete="off">
              <button type="button" class="wiz-input-toggle" id="wiz-aio-tmdb-test">Test</button>
            </span>
          </label>
        </div>

        <!-- Poster Section -->
        <div class="wiz-section" style="margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid var(--border);">
          <h4 style="margin:0 0 10px 0; font-size:1.05rem;">2. Ratings & Poster Provider${glossaryTip('rpdb')}</h4>
          <p class="wiz-note" style="margin-bottom:10px;">Optional: Choose a custom poster provider to show ratings directly on movie posters.</p>
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

        <!-- Debrid Section -->
        <div class="wiz-section" style="margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid var(--border);">
          <h4 style="margin:0 0 10px 0; font-size:1.05rem;">3. Debrid Service${glossaryTip('debrid')}</h4>
          <p class="wiz-note" style="margin-bottom:10px;">Select your Debrid service and provide the API key for high-speed streaming.</p>
          <label class="wiz-label">Debrid Provider
            <select id="wiz-aio-debrid-type" class="wiz-input" style="margin-bottom:12px;">
              <option value="realdebrid" ${(state.aioDebridType || (state.torboxKey ? 'torbox' : 'realdebrid')) === 'realdebrid' ? 'selected' : ''}>Real-Debrid</option>
              <option value="alldebrid" ${state.aioDebridType === 'alldebrid' ? 'selected' : ''}>AllDebrid</option>
              <option value="premiumize" ${state.aioDebridType === 'premiumize' ? 'selected' : ''}>Premiumize</option>
              <option value="torbox" ${(state.aioDebridType || (state.torboxKey ? 'torbox' : '')) === 'torbox' ? 'selected' : ''}>Torbox</option>
            </select>
          </label>
          <label class="wiz-label" style="margin-bottom:0;">Debrid API Key
            <span class="wiz-input-wrap">
              <input type="password" id="wiz-aio-debrid-key" class="wiz-input" placeholder="Enter API Key..." value="${escapeAttr(state.aioDebridKey || '')}" autocomplete="off" spellcheck="false">
              <button type="button" class="wiz-input-toggle" id="wiz-aio-debrid-toggle">Show</button>
            </span>
          </label>
        </div>

        <!-- Scraper Section -->
        <div class="wiz-section" style="margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid var(--border);">
          <h4 style="margin:0 0 10px 0; font-size:1.05rem;">4. Scraper Provider${glossaryTip('scraper')}</h4>
          <p class="wiz-note" style="margin-bottom:10px;">Choose one or more scraper engines for AIO Streams to pull results from. Running more than one adds redundancy.</p>
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
        </div>

        <!-- Advanced Configuration Section -->
        <div class="wiz-section" style="margin-bottom:20px;">
          <h4 style="margin:0 0 10px 0; font-size:1.05rem;">5. Formatting & Language</h4>
          <p class="wiz-note" style="margin-bottom:10px;">Customize how metadata is formatted and displayed across the app.</p>

          <div class="wiz-formatter-studio">
            <div class="wiz-formatter-preview">
              <div class="wiz-formatter-preview-name" id="wiz-formatter-preview-name">${escapeHtml((FORMATTER_PREVIEW_EXAMPLES[state.aioFormatter] || FORMATTER_PREVIEW_EXAMPLES.tamtaro).name)}</div>
              <div class="wiz-formatter-preview-desc" id="wiz-formatter-preview-desc">${escapeHtml((FORMATTER_PREVIEW_EXAMPLES[state.aioFormatter] || FORMATTER_PREVIEW_EXAMPLES.tamtaro).description)}</div>
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

        <div class="wiz-error" id="wiz-aio-error" style="display:none; margin-bottom:15px;"></div>
        
        <button class="wiz-primary" id="wiz-aio-generate"><span>Generate AIO Streams Build</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => go('mode'));

    // Picks up a TMDB key already saved from a previous session (or falls
    // back to the preview-only key) and shows today's popular movie.
    updatePosterPreview();

    el('wiz-aio-trakt-auth').addEventListener('click', () => {
      // Open AIO Metadata Auth in new tab
      window.open('https://aiometadata.viren070.me/api/auth/trakt/authorize', '_blank');
    });

    const debridToggle = el('wiz-aio-debrid-toggle');
    if (debridToggle) debridToggle.addEventListener('click', () => {
      const key = el('wiz-aio-debrid-key');
      const show = key.type === 'password';
      key.type = show ? 'text' : 'password';
      debridToggle.textContent = show ? 'Hide' : 'Show';
    });
    wireKeyTestButton('wiz-aio-tmdb-test', 'wiz-aio-tmdb-key', testTmdbKeyLive);

    el('wiz-aio-generate').addEventListener('click', async () => {
      const errEl = el('wiz-aio-error');
      errEl.style.display = 'none';

      // Capture inputs from the DOM immediately
      const debridKey = el('wiz-aio-debrid-key').value.trim();
      const debridType = el('wiz-aio-debrid-type').value;
      const scraperTypes = ['torrentio', 'comet', 'mediafusion'].filter(t => {
        const box = el('wiz-aio-scraper-' + t);
        return box && box.checked;
      });
      const traktToken = el('wiz-aio-trakt-token').value.trim();
      const tmdbKey = el('wiz-aio-tmdb-key').value.trim();
      const posterService = el('wiz-aio-poster-service').value;
      const rpdbTheme = el('wiz-aio-rpdb-theme').value;
      const rpdbKey = el('wiz-aio-rpdb-key').value.trim();
      const topPosterKey = el('wiz-aio-top-key') ? el('wiz-aio-top-key').value.trim() : '';

      let bttrUrl = '';
      if (posterService === 'bttr') {
        bttrUrl = buildBttrUrl('{imdb_id}', {
          quality: state.bttrQuality, genre: state.bttrGenre, rating: state.bttrRating,
          age: state.bttrAge, source: state.bttrSource, lang: state.bttrLanguage,
        });
      }

      // Ensure state is updated so it persists through saving
      state.aioTmdbKey = tmdbKey;
      state.aioPosterService = posterService;
      state.aioRpdbTheme = rpdbTheme;
      state.aioRpdbKey = rpdbKey;
      state.bttrUrl = bttrUrl;
      state.aioTopPosterKey = topPosterKey;

      if (!debridKey) {
        errEl.textContent = 'Debrid API Key is required for AIO Streams.';
        errEl.style.display = 'block';
        return;
      }

      // Logging into Trakt in the popup isn't the same as connecting it here —
      // the Token ID from that page still has to be pasted in. Catch the case
      // where someone did the former but not the latter before we spend a
      // whole provisioning cycle building a "For You" that'll come back empty.
      if (!traktToken && hasForYouFolder() && !state.aioTraktWarned) {
        state.aioTraktWarned = true;
        errEl.textContent = 'No Trakt Token ID pasted in — "For You" will show up but stay empty without it. Tap "Generate AIO Streams Build" again to continue without Trakt, or paste the Token ID first.';
        errEl.style.display = 'block';
        return;
      }

      state.pushingLabel = 'Generating AIO Metadata Instances & Building AIO Streams...';
      go('pushing');

      try {
        const build = await generateAIOStreamsBuild(debridType, debridKey, rpdbKey, rpdbTheme, posterService, scraperTypes, traktToken, tmdbKey, bttrUrl, topPosterKey);
        state.aioManifestUrl = build.aioStreamsUrl;
        state.traktApplied = true;
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

        afterStreaming(); // We'll bypass the streaming step since AIO Streams is our streaming!
      } catch (err) {
        state.errorMsg = (err && err.message) || String(err);
        go('error');
      }
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

  // Mirrors Studio's aio_converter.cjs bucketing rules, so a visitor's personal
  // instances end up organized the same way Kaptain's own production
  // instances are. Purely a grouping key — the catalog data itself always
  // comes from the published template, never rebuilt here.
  function aioBucketInstanceId(colTitle, folderTitle) {
    if (colTitle === 'Actors') {
      const firstChar = (folderTitle || '').charAt(0).toUpperCase();
      if (firstChar <= 'I') return '1';
      if (firstChar <= 'P') return '12';
      return '13';
    }
    if (colTitle === 'Streaming Services') {
      if (['Netflix', 'Prime Video', 'HBO Max'].includes(folderTitle)) return '2';
      if (['Disney+', 'Apple TV+', 'Hulu'].includes(folderTitle)) return '3';
      if (['Paramount+', 'Peacock', 'MGM+'].includes(folderTitle)) return '4';
      if (['Starz', 'AMC+', 'Shudder', 'Criterion', 'Mubi'].includes(folderTitle)) return '5';
      return '11';
    }
    if (colTitle === 'Genres' || colTitle === 'By Decade') return '6';
    if (colTitle === 'Networks' || colTitle === 'Studios') return '7';
    if (colTitle === 'Awards') return '8';
    if (colTitle === 'Legendary Directors' || colTitle === 'Film Collections') return '9';
    if (colTitle === 'Trending / New' || colTitle === 'Anime' || colTitle === 'Moods & Vibes') return '10';
    if (colTitle === 'International Cinema') return '14';
    return '10'; // fallback bucket for anything unrecognized (e.g. "Discover")
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
    // 0. Fetch the Studio's published catalog template (everything except
    // "For You"). Missing/unreachable just means every non-"For You" folder
    // falls back to native routing below — not a fatal error.
    let aioTemplate = [];
    try {
      const templateRes = await fetch('Kaptain_Catalog_Template.json');
      if (templateRes.ok) aioTemplate = await templateRes.json();
    } catch (e) {
      console.warn('Could not load AIO catalog template — non-"For You" folders will stay on native routing:', e);
    }
    const templateIndex = aioBuildTemplateIndex(aioTemplate);

    // Read the visitor's selection once and reuse the same reference for both
    // gathering catalogs below and the final repoint pass further down, so
    // both passes are guaranteed to agree on exactly the same sources.
    const collections = window.KaptainExport.assembleFilteredDatabase();

    // 1. Gather "For You" (Trakt, visitor-specific, already addon-shaped) catalogs —
    // unchanged from before.
    const allCatalogs = collections.flatMap(c =>
      (c.folders || []).flatMap(f => (f.sources || []).filter(s => s.provider === 'addon' && s.addonId === 'aio-metadata').map(s => s.catalogId))
    );
    const uniqueCatalogs = [...new Set(allCatalogs)];
    // If no Trakt catalogs, we still need at least one for "For You"
    if (uniqueCatalogs.length === 0) {
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
          const instId = aioBucketInstanceId(c.title, f.title);
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
    // flow already uses (`checkInstances()` further down in this file),
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

    const chunks = []; // { kind: 'trakt', catalogIds } | { kind: 'generic', instId, entries }
    const chunkHosts = [];
    if (traktCatalogs.length) {
      chunks.push({ kind: 'trakt', catalogIds: traktCatalogs });
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
            body: JSON.stringify({ config: aioConfig, password: 'kaptain-collection-auto' })
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
      aioConfig.catalogs = chunk.kind === 'trakt'
        ? aioConfig.catalogs.filter(c => chunk.catalogIds.includes(c.id))
        : chunk.entries.map(aioCatalogConfigEntry);

      if (!aioConfig.apiKeys) aioConfig.apiKeys = {};

      // Inject Digital Release Filter to remove titles not available outside
      // theaters — flat top-level fields on the config, not nested under a
      // `settings` object (confirmed against real exported AIO Metadata
      // instance configs; the old nested write was a silent no-op).
      aioConfig.hideUnreleasedDigital = true;
      aioConfig.hideUnreleasedShows = true;

      // The Trakt token only matters for the Trakt chunk, but it's harmless to
      // include on every instance in case a future chunk ever mixes catalog types.
      if (traktToken) {
        aioConfig.apiKeys.traktTokenId = traktToken;
      }

      // Inject TMDB Key into every instance if provided to speed up metadata resolution
      if (tmdbKey) {
        aioConfig.apiKeys.tmdbApiKey = tmdbKey;
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
      const ids = chunk.kind === 'trakt' ? chunk.catalogIds : chunk.entries.map(e => e.id);
      ids.forEach((catalogId) => {
        catalogIdToPrefixedId[catalogId] = `aiometa-${index}e3b0.${catalogId}`;
      });
    });

    // 2. Configure AIO Streams Payload
    const selectedScrapers = new Set(scraperTypes && scraperTypes.length ? scraperTypes : ['torrentio']);
    const scraperPresets = [];
    if (selectedScrapers.has('torrentio')) {
      scraperPresets.push({
        enabled: true,
        type: 'torrentio',
        instanceId: 'torrentio-1',
        options: {
          name: 'Torrentio',
          timeout: 7000,
          useMultipleInstances: false,
          resolutions: ['4k', '1080p', '720p', '480p'],
          maxResults: 10,
          sortCachedUncachedTogether: false,
          cachedOnly: true,
          removeTrash: true,
          mediaTypes: ['movie', 'series', 'anime']
        },
        resources: ['stream']
      });
    }

    if (selectedScrapers.has('comet')) {
      scraperPresets.push({
        enabled: true,
        type: 'comet',
        instanceId: 'comet-1',
        options: {
          name: 'Comet',
          timeout: 7000,
          scrapeDebridAccountTorrents: true,
          mediaTypes: ['movie', 'series', 'anime'],
          url: 'https://cometfortheweebs.midnightignite.me/'
        },
        resources: ['stream']
      });
    }

    // Shape confirmed against the community "Perfect Setup" reference
    // config (AIOStreams.json in this repo) — MediaFusion was in the UI
    // dropdown before this but was never actually implemented here.
    if (selectedScrapers.has('mediafusion')) {
      scraperPresets.push({
        enabled: true,
        type: 'mediafusion',
        instanceId: 'mdf-1',
        options: {
          name: 'MediaFusion',
          timeout: 7000,
          useCachedResultsOnly: true,
          enableWatchlistCatalogs: false,
          downloadViaBrowser: false,
          contributorStreams: false,
          certificationLevelsFilter: [],
          nudityFilter: [],
          mediaTypes: []
        },
        resources: ['stream']
      });
    }

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
        resources: [],
        mediaTypes: [],
        libraryAddon: false,
        resultPassthrough: false
      }
    }));

    const aioStreamsConfig = {
      addonName: 'Nuvio Build - AIO Streams',
      services: [
        { id: debridType, enabled: true, credentials: { apiKey: debridKey } }
      ],
      posterService: 'none',
      usePosterServiceForMeta: false,
      usePosterRedirectApi: false,
      ...(tmdbKey ? { tmdbApiKey: tmdbKey } : {}),
      presets: [...scraperPresets, ...metadataPresets],
      sortCriteria: {
        global: [
          {key: 'seeders', direction: 'desc'},
          {key: 'cached', direction: 'desc'},
          {key: 'resolution', direction: 'desc'},
          {key: 'size', direction: 'desc'}
        ],
        movies: [], series: [], anime: []
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
          body: JSON.stringify({ config: aioStreamsConfig, password: 'kaptain-collection-auto' })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            const outUuid = data.uuid || (data.data && data.data.uuid) || (data.user && data.user.uuid) || data.id;
            const encPwd = data.encryptedPassword || (data.data && data.data.encryptedPassword) || (data.user && data.user.encryptedPassword) || 'kaptain-collection-auto';
            finalUrl = host + '/stremio/' + outUuid + '/' + encodeURIComponent(encPwd) + '/manifest.json';
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
          await window.NuvioPush.installAddons(state.token, state.targetProfileId, [{ name: 'AIO Streams', url: finalUrl }]);
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
        if (patched) {
          await window.NuvioPush.pushCollections(state.token, state.targetProfileId, collections);
        }
      }
    } catch (e) {
      console.error('Failed to re-point the collection at the installed AIO Streams addon:', e);
    }

    state.pushingCurrent += 1;
    state.pushingTotal = 0; // done — later pushingLabel-only steps won't show a stale bar

    const warningMsg = failedChunkCount > 0
      ? `Heads up: ${failedChunkCount} of ${chunks.length} personal catalog instance${failedChunkCount === 1 ? '' : 's'} couldn't be created (the host was unreachable after a few tries). Those folders will use normal Nuvio browsing for now — everything else is set up.`
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
      ${header('Your Nuvio Account', sub, true, 'account')}
      <div class="wiz-body">
        <div class="wiz-toggle">
          <button class="wiz-toggle-btn ${state.mode === 'create' ? 'active' : ''}" data-mode="create">Create account</button>
          <button class="wiz-toggle-btn ${state.mode === 'signin' ? 'active' : ''}" data-mode="signin">Sign in</button>
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
            <button type="button" class="wiz-input-toggle" id="wiz-pw-toggle">Show</button>
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
    // Starter flow has no choose step before account — back just closes.
    el('wiz-back').addEventListener('click', () => (state.flow === 'collection' ? go('devices') : close()));
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
            <p class="wiz-sub" style="margin-top:8px;">${state.pushingCurrent} of ${state.pushingTotal} done — please don't close or refresh this page.</p>
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
    if (state.avatarApplied) ok('Profile image set');

    const readyToStream = state.torboxApplied;
    const hasMobile = state.devices.includes('mobile');
    const nextSteps = readyToStream
      ? `<strong>On your TV:</strong> open Nuvio → switch to the "${name}" profile → press play. That's it.${hasMobile ? `<br><br><strong>On mobile:</strong> open the Nuvio app → Settings → Connected Services → Torbox to finish connecting Torbox (takes ~30 seconds).` : ''}`
      : `<strong>On your TV:</strong> open Nuvio and switch to the "${name}" profile. To play streams you'll still need a Torbox (or other debrid) key in Nuvio's settings.`;

    panel.innerHTML = `
      ${header("You're live. 🎉", '', false)}
      <div class="wiz-body">
        <div class="wiz-center"><div class="wiz-success-badge">${ICON.check}</div></div>
        <ul class="wiz-summary">${items.join('')}</ul>
        <div class="wiz-note wiz-nextsteps">${nextSteps}</div>

        <div class="wiz-note" style="margin-top:12px; text-align:center;">
            Enjoying it? Share your setup on <a href="https://www.reddit.com/r/Nuvio/" target="_blank" style="color:var(--accent);">r/Nuvio</a>.<br>
            Found a bug, have a suggestion, or want to submit content? DM <a href="https://www.reddit.com/user/KforKaptain/" target="_blank" style="color:var(--accent);">u/KforKaptain</a> on Reddit.
        </div>

        <div class="wiz-donation-block" style="margin-top:12px; padding:15px; border-radius:8px; background:rgba(255,255,255,0.05); text-align:center;">
            <p style="margin:0 0 10px 0; font-size:0.9rem; opacity:0.9;">If this saved you some setup time, tips are always appreciated — never expected.</p>
            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                <a href="https://ko-fi.com/nuvio" target="_blank" class="wiz-secondary" style="flex:1; min-width:140px; text-decoration:none; display:inline-flex; justify-content:center; align-items:center;">☕ Support Nuvio</a>
                <a href="https://ko-fi.com/kaptain" target="_blank" class="wiz-secondary" style="flex:1; min-width:140px; text-decoration:none; display:inline-flex; justify-content:center; align-items:center;">☕ Tip Kaptain</a>
            </div>
        </div>

        <button class="wiz-primary" id="wiz-done-close" style="margin-top:20px;"><span>Done</span></button>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    el('wiz-done-close').addEventListener('click', close);
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
      if (typeof compileAndDownloadJSON === 'function') compileAndDownloadJSON();
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

  async function onAccountContinue() {
    syncInputs();
    const minLen = state.mode === 'create' ? 8 : 6;
    if (!state.email.includes('@')) return showInlineError('Please enter a valid email address.');
    if (state.password.length < minLen) return showInlineError(`Password must be at least ${minLen} characters.`);
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
      state.placementIndex = null; // default to bottom, computed in renderPlacement
      state.placementMode = 'merge'; // always start on the safe merge default
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

  function keptExisting(incoming) {
    const incomingIds = new Set((incoming || []).map((c) => c && c.id).filter(Boolean));
    // A category the user fully deselected produces zero rows, so it has no
    // id in `incoming` — but it's still a category this tool recognizes (it
    // exists in the full local `database`). Without this, keptExisting would
    // never remove it, leaving deselected rows stranded on the profile forever.
    const deselectedCategoryIds = new Set(
      (typeof database !== 'undefined' ? database : [])
        .filter((cat) => cat && cat.id && !incomingIds.has(cat.id))
        .map((cat) => cat.id)
    );
    return (state.existingCollections || []).filter((c) => {
      if (!c || !c.id) return true;
      if (incomingIds.has(c.id)) return false;        // will be replaced by the incoming version
      if (deselectedCategoryIds.has(c.id)) return false; // user actively deselected this whole category
      return true; // row from a category this tool doesn't recognize — leave it alone
    });
  }

  function renderPlacement(panel) {
    const incoming = assembleFilteredDatabase();
    const kept = keptExisting(incoming);
    if (state.placementIndex == null) state.placementIndex = kept.length; // default: bottom
    if (state.placementMode == null) state.placementMode = 'merge';

    const newCount = incoming.length;
    const rowLabel = `${newCount} ${newCount === 1 ? 'row' : 'rows'}`;
    const isOverwrite = state.placementMode === 'overwrite';
    const existingCount = state.existingCollections.length;
    const opts = [`<option value="0" ${state.placementIndex === 0 ? 'selected' : ''}>⬆️ At the very top</option>`];
    kept.forEach((c, i) => {
      const idx = i + 1;
      const isBottom = idx === kept.length;
      const label = isBottom
        ? `⬇️ At the very bottom (after "${escapeHtml(c.title || 'row')}")`
        : `After "${escapeHtml(c.title || 'row')}"`;
      opts.push(`<option value="${idx}" ${state.placementIndex === idx ? 'selected' : ''}>${label}</option>`);
    });

    panel.innerHTML = `
      ${header('Where Should It Go?', `Slot your ${rowLabel} into this profile's collection.`, true, 'placement')}
      <div class="wiz-body">
        <div class="wiz-toggle" style="margin-bottom:14px;">
          <button type="button" class="wiz-toggle-btn ${!isOverwrite ? 'active' : ''}" data-placement-mode="merge">Add to existing</button>
          <button type="button" class="wiz-toggle-btn ${isOverwrite ? 'active' : ''}" data-placement-mode="overwrite">Replace everything</button>
        </div>
        <div id="wiz-placement-merge-ui" style="${isOverwrite ? 'display:none;' : ''}">
          <label class="wiz-label">Insert position
            <select id="wiz-placement-select" class="wiz-input">${opts.join('')}</select>
          </label>
          <div class="wiz-note">Rows you're still sending stay in place and refresh in place rather than duplicating. If you've fully deselected a category since your last push, it's removed here too — not just when you "Replace everything."</div>
        </div>
        <div id="wiz-placement-overwrite-ui" style="${isOverwrite ? '' : 'display:none;'}">
          <div class="wiz-note wiz-note-danger">
            <strong>This deletes ${existingCount} existing ${existingCount === 1 ? 'row' : 'rows'} on this profile</strong> and replaces them with your ${rowLabel}. This can't be undone.
          </div>
          <label class="wiz-confirm-check">
            <input type="checkbox" id="wiz-overwrite-confirm">
            I understand this permanently replaces this profile's collection.
          </label>
        </div>
        <div class="wiz-note" style="margin-top:10px;"><strong>Heads up:</strong> If your collection includes the "For You" folder, you'll connect your Trakt account in the next steps — it only takes a minute.</div>
        <div class="wiz-error" id="wiz-error" style="display:none;"></div>
        <button class="wiz-primary" id="wiz-place-push" ${isOverwrite ? 'disabled' : ''}><span>${isOverwrite ? 'Replace this profile' : 'Add my rows here'}</span></button>
      </div>`;

    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => go('profile'));
    el('wiz-placement-select').addEventListener('change', (e) => {
      state.placementIndex = Number(e.target.value);
    });
    panel.querySelectorAll('[data-placement-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.placementMode = btn.getAttribute('data-placement-mode');
        render();
      });
    });
    const confirmCb = el('wiz-overwrite-confirm');
    if (confirmCb) confirmCb.addEventListener('change', () => {
      el('wiz-place-push').disabled = isOverwrite && !confirmCb.checked;
    });
    el('wiz-place-push').addEventListener('click', async () => {
      try {
        const profile = state.profiles.find((p) => p.profile_index === state.selectedProfileId);
        await doMergedPush(profile ? profile.name : `Profile ${state.selectedProfileId}`);
      } catch (err) {
        state.errorMsg = (err && err.message) || String(err);
        go('error');
      }
    });
  }

  // Build the merged array (existing rows + incoming spliced at placementIndex)
  // and push it to the chosen existing profile, then go to the streaming step.
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
    } else {
      const kept = keptExisting(incoming);
      const idx = Math.max(0, Math.min(state.placementIndex == null ? kept.length : state.placementIndex, kept.length));
      merged = kept.slice(0, idx).concat(incoming, kept.slice(idx));
    }
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
    try { await window.NuvioPush.installAddons(state.token, profileId, METADATA_ADDONS); }
    catch (e) { /* non-fatal — collection is still saved */ }
  }

  // Creates a fresh profile and records it as the streaming target.
  async function createTargetProfile(name) {
    state.pushingLabel = 'Creating your profile...';
    go('pushing');
    const profile = await window.NuvioPush.createProfile(state.token, name);
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
    await window.NuvioPush.pushCollections(state.token, profileId, collections);
    state.collectionRows = collections.length;
    rememberProfileId(state.email, profileId);
    await ensureMetadataAddons(profileId);
  }

  // After the collection is saved: collection-only skips straight to done;
  // prefilled settings are applied in one shot; otherwise show the interactive
  // streaming sub-steps.
  async function proceedToStreaming() {
    try {
      await window.NuvioPush.applyProfileSettings(state.token, state.targetProfileId, SETTINGS_PLATFORMS, { autoplayTrailers: true });
    } catch (e) { /* non-fatal — profile/collection are already saved */ }
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
    return renderStreamingPrompt(panel);
  }

  function renderStreamingPrompt(panel) {
    panel.innerHTML = `
      ${header('Set Up Streaming', '', true, 'streaming')}
      <div class="wiz-body wiz-streaming-prompt">
        <p class="wiz-prompt-heading">Do you want to set up Torbox Instant or streaming addons?</p>
        <p class="wiz-note">This is what makes content actually play. It's completely optional — you can always set it up later in Nuvio's settings.</p>
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-stream-skip"><span>Skip for now</span></button>
          <button class="wiz-primary" id="wiz-stream-yes"><span>Yes, let's do it →</span></button>
        </div>
      </div>`;
    el('wiz-close').addEventListener('click', close);
    el('wiz-back').addEventListener('click', () => go('for-you'));
    el('wiz-stream-skip').addEventListener('click', () => { state.streamingApplied = false; afterStreaming(); });
    el('wiz-stream-yes').addEventListener('click', () => { state.streamingSubStep = 'torbox'; render(); });
  }

  function renderStreamingTorbox(panel) {
    const showTmdb = state.devices.includes('mobile');
    panel.innerHTML = `
      ${header('Torbox Instant', 'Connect Torbox and streams play instantly — no per-source keys needed.', true, 'streaming')}
      <div class="wiz-body">
        <label class="wiz-label">Torbox API key <span class="wiz-hint">(optional)</span>
          <span class="wiz-input-wrap">
            <input type="text" id="wiz-torbox-key" class="wiz-input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${escapeAttr(state.torboxKey)}" autocomplete="off" spellcheck="false">
            <button type="button" class="wiz-input-toggle" id="wiz-torbox-test">Test</button>
          </span>
        </label>
        <div class="wiz-key-status" id="wiz-key-status">${torboxStatusHtml(state.torboxKey)}</div>
        ${state.devices.includes('mobile') ? `<div class="wiz-note">📱 <strong>On mobile:</strong> Torbox connects differently — after setup open the Nuvio app → Settings → Connected Services → Torbox. You'll get a short code to enter at <strong>tor.box/link</strong>.</div>` : ''}
        <div class="wiz-torbox-promo">
          <div class="wiz-torbox-promo-copy">
            <span class="wiz-torbox-promo-title">Don't have Torbox yet?</span>
            <span class="wiz-torbox-promo-text">Sign up with my link for a discount. It helps keep this project running.</span>
          </div>
          <a href="https://torbox.app/subscription?referral=691a76aa-4d6e-40c0-8625-ffe4e4189ae4" target="_blank" rel="noopener" class="wiz-torbox-promo-btn"><span>Get Torbox</span><span class="wiz-torbox-promo-arrow">→</span></a>
          <a href="https://torbox.app/subscription" target="_blank" rel="noopener" class="wiz-torbox-promo-skip">or sign up without a referral code</a>
        </div>
        ${showTmdb ? `
        <label class="wiz-label">TMDB API key <span class="wiz-hint">(optional — needed for Nuvio Mobile)</span>
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
        showToast('That Torbox key looks like a typo — double-check it before finishing.', 'warning');
      }
      state.streamingSubStep = 'addons';
      state.streamingShowAddons = false;
      render();
    });
  }

  function renderStreamingAddons(panel) {
    const choices = ensureAddonChoices();
    if (!state.streamingShowAddons) {
      panel.innerHTML = `
        ${header('Scraper Addons', '', true, 'streaming')}
        <div class="wiz-body wiz-streaming-prompt">
          <p class="wiz-prompt-heading">Do you want to add scraper addons?</p>
          <p class="wiz-note">Scrapers find streams for your content. Torrentio is pre-selected and works great with Torbox — no extra key needed.</p>
          <div class="wiz-btn-row">
            <button class="wiz-secondary" id="wiz-addons-skip"><span>No, I'm done</span></button>
            <button class="wiz-primary" id="wiz-addons-yes"><span>Yes, show me</span></button>
          </div>
        </div>`;
      el('wiz-close').addEventListener('click', close);
      el('wiz-back').addEventListener('click', () => { state.streamingSubStep = 'torbox'; render(); });
      el('wiz-addons-skip').addEventListener('click', () => onAddonsApply(false));
      el('wiz-addons-yes').addEventListener('click', () => { state.streamingShowAddons = true; render(); });
      return;
    }
    // Full addon list view
    const cfg = initScraperConfig();
    const selectedRes = new Set(cfg.resolutions || []);
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

        <div class="wiz-addon-add">
          <div class="wiz-note wiz-note-custom">Got your own addon? Paste its manifest URL here.</div>
          <input type="text" id="wiz-addon-name" class="wiz-input wiz-addon-add-name" placeholder="Addon Name">
          <input type="text" id="wiz-addon-url" class="wiz-input wiz-addon-add-url" placeholder="Manifest URL (https://...)">
          <button type="button" class="wiz-secondary wiz-addon-add-btn" id="wiz-addon-add-btn"><span>Add Addon</span></button>
        </div>
        ${customRows ? `<div class="wiz-addon-list" id="wiz-addon-list" style="margin-top:8px;">${customRows}</div>` : '<div id="wiz-addon-list"></div>'}

        <div class="wiz-error" id="wiz-error" style="display:none;"></div>
        <div class="wiz-btn-row">
          <button class="wiz-secondary" id="wiz-addons-back-list"><span>← Back</span></button>
          <button class="wiz-primary" id="wiz-addons-finish"><span>Finish setup</span></button>
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

    // Custom addon rows (user-added, separate from managed scrapers above)
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
    el('wiz-addons-back-list').addEventListener('click', () => { state.streamingShowAddons = false; render(); });
    el('wiz-addons-finish').addEventListener('click', () => { onAddonsApply(true); });
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
      const res = await fetch('https://api.themoviedb.org/3/authentication', {
        headers: { Authorization: `Bearer ${key}` },
      });
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
      if (result.unreachable) showToast('Could not reach the server to check that key — try again in a moment.', 'error');
      else if (result.ok) showToast('✓ That key works.', 'success');
      else showToast('That key was rejected — double-check it.', 'error');
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
      const managedCount = (scraperCfg.torrentio ? 1 : 0) + (scraperCfg.comet ? 1 : 0);

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
        return showInlineError("Heads up: without a Torbox key these scrapers usually can't play anything. Tap \"Finish setup\" again to continue without it.");
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
      ${header('Your Devices', 'What do you use Nuvio on? This helps us set things up right.', false)}
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
          <strong>Heads up:</strong> Rows mode doesn't scroll well outside the Nuvio TV app — that includes Nuvio Mobile and Nuvio's web/desktop client. We recommend switching your export to Tabbed Grid.
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

  function renderForYou(panel) {
    panel.innerHTML = `
      ${header('Connect Trakt', '', false)}
      <div class="wiz-body">
        <p class="wiz-note">Your collection includes the <strong style="color:var(--text-primary)">"For You"</strong> folder, which is powered by Trakt - it shows your personal recommendations, watchlist, and what's coming up next.</p>
        <label class="wiz-label">AIO Metadata Instance
          <select id="wiz-aio-instance" class="wiz-input" style="margin-bottom:12px;">
            <option value="auto">Auto (Fastest Instance)</option>
            <option value="https://aiometadata.elfhosted.com/">ElfHosted (Reliable, 200 Catalog Limit)</option>
            <option value="https://aiometadatafortheweebs.midnightignite.me/">Midnight (Community, 250 Catalog Limit)</option>
            <option value="https://aiometadata.viren070.me/">Viren (Community, 250 Catalog Limit)</option>
          </select>
        </label>
        
        <div id="wiz-trakt-step1">
          <button type="button" class="wiz-primary" id="wiz-foryou-trakt" style="margin-bottom:18px;"><span>1. Authorize Trakt</span></button>
          <div class="wiz-note" style="margin-bottom:18px;">Clicking this will open AIO Metadata in a new tab. After authorizing, <strong>copy the Token ID</strong> shown on the screen and paste it below.</div>
        </div>
        
        <div id="wiz-trakt-step2" style="display:none; margin-bottom:18px;">
          <label class="wiz-label">Trakt Token ID
            <input type="text" id="wiz-trakt-token-id" class="wiz-input" placeholder="Paste your Token ID here..." style="margin-bottom:12px;" autocomplete="off">
          </label>
          <label class="wiz-label" style="margin-bottom:12px;">TMDB API Key (Optional but recommended)
            <input type="text" id="wiz-foryou-tmdb-key" class="wiz-input" placeholder="Enter TMDB API Key..." value="${escapeAttr(state.tmdbKey || state.aioTmdbKey || '')}" autocomplete="off">
          </label>
          <button type="button" class="wiz-primary" id="wiz-foryou-save-trakt"><span>2. Connect & Generate</span></button>
        </div>
        
        <div id="wiz-trakt-status" style="display:none; margin-bottom:18px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;"></div>
        <input type="hidden" id="wiz-aio-manifest-url" value="${escapeAttr(state.aioManifestUrl)}">
        <div class="wiz-error" id="wiz-error" style="display:none;"></div>
        <div class="wiz-note" style="margin-top:10px; opacity:0.75;">Once connected here, also link Trakt directly inside Nuvio (Settings > Integrations) to enable scrobbling and watch history - those are separate from AIO Metadata.</div>
        <div class="wiz-btn-row" style="margin-top:16px;">
          <button class="wiz-secondary" id="wiz-foryou-skip"><span>Skip for now</span></button>
          <button class="wiz-primary" id="wiz-foryou-save"><span>Save &amp; Continue</span></button>
        </div>
      </div>`;

    el('wiz-close').addEventListener('click', close);

    const checkInstances = async () => {
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
    };

    el('wiz-foryou-trakt').addEventListener('click', async () => {
      const statusEl = el('wiz-trakt-status');
      let baseUrl = el('wiz-aio-instance').value;
      
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<span style="color:#2196f3;">Locating instance...</span>';
      
      if (baseUrl === 'auto') {
        baseUrl = await checkInstances();
      }
      
      statusEl.style.display = 'none';
      el('wiz-trakt-step2').style.display = 'block';
      
      // Open the AIOMetadata authorization page in a new tab
      window.open(baseUrl + 'api/auth/trakt/authorize', '_blank');
    });
    
    el('wiz-foryou-save-trakt').addEventListener('click', async () => {
      const tokenId = el('wiz-trakt-token-id').value.trim();
      const errEl = el('wiz-error');
      
      if (!tokenId) {
        errEl.textContent = 'Please enter the Token ID provided by AIO Metadata.';
        errEl.style.display = 'block';
        return;
      }
      
      errEl.style.display = 'none';
      const statusEl = el('wiz-trakt-status');
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<span style="color:#4caf50;">✓ Connecting Token & Generating metadata lists...</span>';
      
      let baseUrl = el('wiz-aio-instance').value;
      if (baseUrl === 'auto') {
        baseUrl = await checkInstances();
      }
      
      // Build AIO Metadata Config
      const aioConfig = JSON.parse(AIO_PRESET_JSON);
      if (!aioConfig.apiKeys) aioConfig.apiKeys = {};

      // Inject Digital Release Filter — flat top-level fields, not nested
      // under `settings` (confirmed against real exported configs).
      aioConfig.hideUnreleasedDigital = true;
      aioConfig.hideUnreleasedShows = true;
      
      aioConfig.apiKeys.traktTokenId = tokenId;
      
      const foryouTmdbKey = el('wiz-foryou-tmdb-key');
      if (foryouTmdbKey && foryouTmdbKey.value.trim()) {
        const key = foryouTmdbKey.value.trim();
        aioConfig.apiKeys.tmdb = key;
        state.tmdbKey = key;
      }
      
      try {
        const saveRes = await fetch(baseUrl + 'api/config/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: aioConfig,
            password: 'kaptain-collection-auto'
          })
        });
        
        const saveData = await saveRes.json();
        if (saveData.success && saveData.installUrl) {
          state.aioManifestUrl = saveData.installUrl;
          state._aioUrlVerified = true;
          const inp = el('wiz-aio-manifest-url');
          if (inp) inp.value = state.aioManifestUrl;
          statusEl.innerHTML = '<span style="color:#4caf50;">✓ Trakt Successfully Connected! Click Save & Continue.</span>';
          statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          throw new Error('Invalid response from AIOMetadata API');
        }
      } catch(e) {
        errEl.textContent = 'Failed to generate AIO Metadata configuration. Please try again.';
        errEl.style.display = 'block';
        statusEl.style.display = 'none';
      }
    });

    el('wiz-foryou-skip').addEventListener('click', () => go('done'));
    
    el('wiz-foryou-save').addEventListener('click', async () => {
      const inp = el('wiz-aio-manifest-url');
      if (inp && inp.value && !state._aioUrlVerified) state.aioManifestUrl = inp.value.trim();
      
      if (!state.aioManifestUrl) return showInlineError('Connect Trakt to generate your AIO Metadata URL, or tap "Skip for now".');
      
      if (!state._aioUrlVerified) {
        const check = await checkManifestAlive(state.aioManifestUrl);
        if (check.ok === false) return showInlineError(`That URL doesn't look right: ${check.reason}`);
        if (check.ok === null && state._lastAioUrlWarned !== state.aioManifestUrl) {
          state._lastAioUrlWarned = state.aioManifestUrl;
          return showInlineError('Couldn\'t verify that URL — it may still work. Tap "Save & Continue" again to use it anyway.');
        }
        state._aioUrlVerified = true;
      }
      try {
        state.pushingLabel = 'Connecting Trakt...';
        go('pushing');
        await window.NuvioPush.installAddons(state.token, state.targetProfileId, [{ name: 'AIO Metadata', url: state.aioManifestUrl }]);
        state.traktApplied = true;
        goToStreaming();
      } catch (err) {
        state.errorMsg = (err && err.message) || String(err);
        go('error');
      }
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
        else if (id === 'wiz-aio-debrid-type') state.aioDebridType = e.target.value;
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
  };
})();
