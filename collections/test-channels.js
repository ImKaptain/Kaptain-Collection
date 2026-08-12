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
