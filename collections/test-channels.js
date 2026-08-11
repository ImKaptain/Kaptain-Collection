/**
 * Soft-gated test channels for Kaptain Collection (GitHub Pages).
 * Codes are invite-style, not cryptographic secrets. Anyone who finds the
 * beta file URL can load it. Rotate codes when a beta closes.
 *
 * Add/retire channels here. Matching files must exist under collections/ (+ root templates).
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
};
