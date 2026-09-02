/**
 * Soft-gated test channels for Kaptain Collection (GitHub Pages).
 * Codes are invite-style, not cryptographic secrets. Anyone who finds the
 * beta file URL can load it. Rotate codes when a beta closes.
 *
 * Add/retire channels here. Matching files must exist under collections/ (+ root templates).
 *
 * Friend packs (friendPack: {...}) load another creator's collection as-is and
 * teach Native Mode to provision their AIO Metadata catalog pack on push.
 */
window.KAPTAIN_TEST_CHANNELS = {
  // v0.92 preview: latest Studio draft — title logos, International flags, Discover Top lockups
  MEGA092: {
    id: 'MEGA092',
    label: 'v0.92 Preview',
    versionLabel: 'v0.92',
    blurb: 'Preview of Mega Collection v0.92 before it goes live.',
    databaseUrl: 'collections/database.mega092.js',
    templateUrl: 'Kaptain_Catalog_Template.mega092.json',
    redditFeedbackUrl: 'https://www.reddit.com/message/compose/?to=KforKaptain&subject=Mega%20v0.92%20beta%20feedback',
    redditCommunityUrl: 'https://www.reddit.com/r/Nuvio/',
    patchNotes: {
      title: "What's new in v0.92 (beta)",
      intro:
        "You're on a preview build of Mega Collection v0.92. Live visitors still see the public default until this ships. How updates work: Existing folders, lists, and artwork refresh dynamically in-place — but NEW folders, new streaming networks, and new categories will never auto-import without pushing an update. Use Send to Nuvio / Quick Update in the picker anytime you want to sync new catalog additions to your profile without redoing your addon setup.",
      bullets: [
        '🎛️ Brand New Profile Studio: Log in with Nuvio to reorder your TV rows, pin categories to top, and cherry-pick 750+ folders from Kaptain\'s Vault',
        '📺 Network Vote Floor Fix: Relaxed vote floors across all 68 networks (US cable + UK channels like BBC, ITV, Channel 4, Dave, Sky) for full, deep television lineups',
        '🌟 Actor & Director Expansion: 152 curated Actors and 84 Legendary Directors with dedicated list routing and hand-matched live-action hero backdrops',
        '🎨 Master V2 Artwork & Logos: High-res V2 covers across Spotlights, Networks, Studios, Streaming, Anime, Docs, Reality, and Based On',
        '🌍 Global Storefronts & 15 Languages: Clean single-select Region picker with 21 balanced country storefronts (US, UK, Canada, Australia, Nordics, Europe, LatAm) and instant translation across 15 languages',
        '🎬 Authentic Hero & Clean Light Mode: Right-two-thirds hero stage matching the real Nuvio TV layout, plus a crisp, distraction-free light mode canvas',
      ],
      feedback:
        "Found a bug, empty row, or weird title? Message me on Reddit. That's the fastest way I can fix it before v0.92 goes live.",
    },
  },

  // v0.91 preview: Studio Draft 78 — Spotlights, Based on, experimental art, P0/P1 fixes
  MEGA091: {
    id: 'MEGA091',
    label: 'v0.91 Preview',
    versionLabel: 'v0.91',
    blurb: 'Preview of Mega Collection v0.91 before it goes live.',
    databaseUrl: 'collections/database.mega091.js',
    templateUrl: 'Kaptain_Catalog_Template.mega091.json',
    redditFeedbackUrl: 'https://www.reddit.com/message/compose/?to=KforKaptain&subject=Mega%20v0.91%20beta%20feedback',
    redditCommunityUrl: 'https://www.reddit.com/r/Nuvio/',
    patchNotes: {
      title: "What's new in v0.91 (beta)",
      intro:
        "You're on a preview build of Mega Collection v0.91. Live visitors still see the public default until this ships. Try it in the picker. If you Send to Nuvio, you're pushing this beta catalog to your profile.",
      bullets: [
        'New Spotlights row (8 rotating archetypes) and Based on shelves',
        'Experimental artwork on Spotlights, Discover, Genres, and more',
        'History Series constrained with period/historical keywords + live-action strips',
        'Streaming Series exclusions aligned (animation / talk / reality strips)',
        'Dual vote floors, decade title cleanup, Genre Popular sort fixed',
        'Setup: region remaps streaming availability; Preferred Language feeds AIO Metadata; cleaner language list',
      ],
      feedback:
        "Found a bug, empty row, or weird title? Message me on Reddit. That's the fastest way I can fix it before v0.91 goes live.",
    },
  },

  // v0.90 preview: Discover rebuild, vote floors, exclusions, Anime Discover
  MEGA090: {
    id: 'MEGA090',
    label: 'v0.90 Preview',
    versionLabel: 'v0.90',
    blurb: 'Preview of Mega Collection v0.90 before it goes live.',
    databaseUrl: 'collections/database.beta.js',
    templateUrl: 'Kaptain_Catalog_Template.beta.json',
    redditFeedbackUrl: 'https://www.reddit.com/message/compose/?to=KforKaptain&subject=Mega%20v0.90%20beta%20feedback',
    redditCommunityUrl: 'https://www.reddit.com/r/Nuvio/',
    patchNotes: {
      title: "What's new in v0.90 (beta)",
      intro:
        "You're on a preview build of Mega Collection v0.90. Live visitors still see v0.87 until this ships. Try it in the picker. If you Send to Nuvio, you're pushing this beta catalog to your profile.",
      bullets: [
        'Streaming Services rebuilt on native TMDB Discover (Top 10s stay as lists)',
        'Smarter vote floors by list type: Popular, New, Top Rated, AVOD vs premium',
        'Exclusions: adult/softcore cleanup on Romance; Animation/docs stripped from live-action Comedy, Moods, and more',
        'Anime converted from lists to TMDB Discover with adult/ecchi blocks and sharper subfolders',
        'Romance Series / RomCom Series fixed off Drama/Comedy-only mismatches',
      ],
      feedback:
        "Found a bug, empty row, or weird title? Message me on Reddit. That's the fastest way I can fix it before v0.90 goes live.",
    },
  },

  // Friends of Kaptain - Kaoxt's MDBList / AIO Metadata collection (as-is)
  // Key must be uppercase: lookupTestChannel normalizes input with toUpperCase().
  KAOXTV1: {
    id: 'KaoxtV1',
    label: 'Kaoxt Collection',
    versionLabel: 'Friends · Kaoxt',
    blurb: "Kaoxt's collection, ready to browse and send to Nuvio.",
    databaseUrl: 'collections/database.kaoxt.js',
    templateUrl: null,
    friendPack: {
      id: 'kaoxt',
      creatorName: 'Kaoxt',
      aioCatalogsUrl: 'collections/kaoxt-aio-catalogs.json',
      aioBaseConfigUrl: 'collections/kaoxt-aio-base-config.json',
    },
    redditFeedbackUrl: 'https://www.reddit.com/message/compose/?to=KforKaptain&subject=Friends%20of%20Kaptain%20-%20Kaoxt%20feedback',
    redditCommunityUrl: 'https://www.reddit.com/r/Nuvio/',
    patchNotes: {
      title: 'Kaoxt Collection',
      intro:
        "You're in Kaoxt's collection, using Kaptain's picker. The lists run on AIO Metadata (MDBList). When you Send to Nuvio, this tool installs those catalogs for whatever you picked. Kaptain's Collection stays as it was until you tap Exit Friends.",
      bullets: [
        "Browse and edit Kaoxt's folders the same way you do in Kaptain's Collection",
        'Send to Nuvio installs Kaoxt\'s AIO Metadata catalogs for your selection',
        'You need an MDBList API key (free at mdblist.com) for the lists to load',
        'Kaoxt\'s "For You" folder uses Bingecat. Paste your own Bingecat manifest if you keep that folder',
      ],
      feedback:
        'Questions or bugs with this Friends preview? Message Kaptain on Reddit. Collection content feedback goes to Kaoxt.',
    },
  },
};
