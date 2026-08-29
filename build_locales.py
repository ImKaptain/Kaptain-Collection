import json
import os
import sys
import time
import urllib.parse
import urllib.request

# The pack the picker actually ships. This used to point at the v0.90-era beta
# export, which is why row and tab labels went untranslated: the dictionary was
# built from a catalog that predated most of them. Regenerate the pack BEFORE
# running this, or the dictionary goes stale again as soon as the catalog moves.
SOURCE_JSON = "Kaptain_Nuvio_Native_mega091.json"
LOCALES_DIR = "locales"
LANGUAGES = {
    "es": "es",    # Spanish
    "fr": "fr",    # French
    "de": "de",    # German
    "it": "it",    # Italian
    "pl": "pl",    # Polish
    "ar": "ar",    # Arabic
    "pt": "pt",    # Portuguese
    "ru": "ru",    # Russian
    "zh": "zh-CN", # Chinese (Simplified)
    "ja": "ja",    # Japanese
    "ko": "ko",    # Korean
    "hi": "hi",    # Hindi
    "nl": "nl",    # Dutch
}

# Categories whose folder titles are proper nouns (person names, brand names,
# franchise titles) and must NOT be translated.
PROPER_NOUN_CATEGORIES = {
    "Actors",
    "Legendary Directors",
    "Studios",
    "Networks",
    "Streaming Services",
    "Film Collections",
}


def extract_strings():
    """Extract translatable strings and proper nouns from the master database.

    Returns (translatable, proper_nouns) where both are sets of strings.
    Category titles are always translatable.  Folder titles under
    PROPER_NOUN_CATEGORIES are marked as proper nouns and kept in English.
    """
    with open(SOURCE_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    translatable = set()
    proper_nouns = set()

    for cat in data:
        title = cat.get("title", "")
        if title:
            translatable.add(title)  # category titles are always translatable

        is_proper = title in PROPER_NOUN_CATEGORIES
        for folder in cat.get("folders", []):
            ft = folder.get("title", "")
            if ft:
                if is_proper:
                    proper_nouns.add(ft)
                else:
                    translatable.add(ft)
            for source in folder.get("sources", []):
                for key in ("title", "name", "genre"):
                    st = source.get(key, "")
                    if st:
                        translatable.add(st)

    # A brand can appear both as a folder title (proper noun) and as a source
    # name/genre (translatable) - "Netflix" does. Proper nouns win, or the brand
    # comes back translated and lower-cased.
    translatable -= proper_nouns
    return translatable, proper_nouns


def _gt_chunk(texts, target):
    """One request to Google's public translate endpoint, newline-joined.

    deep_translator's GoogleTranslator is used only for its language codes now -
    its scraper broke upstream and raises TranslationNotFound on ordinary strings
    like "Top Rated Movies", which would have silently written dictionaries that
    were 100% English while reporting success.
    """
    q = "\n".join(texts)
    url = "https://translate.googleapis.com/translate_a/single?" + urllib.parse.urlencode(
        {"client": "gtx", "sl": "en", "tl": target, "dt": "t", "q": q}
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    joined = "".join(seg[0] for seg in data[0] if seg and seg[0])
    return joined.split("\n")


def translate_all(target, strings, budget=1400):
    """Translate everything, chunked by character budget.

    A chunk is only accepted when the reply has exactly as many lines as the
    request had strings - otherwise the mapping would silently shift by one and
    mislabel every row after it. A mismatched chunk is retried one string at a
    time, and anything still failing keeps its English text.
    """
    out = {}
    i = 0
    done = 0
    while i < len(strings):
        part, size = [], 0
        while i < len(strings) and (not part or size + len(strings[i]) + 1 <= budget):
            part.append(strings[i]); size += len(strings[i]) + 1; i += 1
        ok = False
        for attempt in range(3):
            try:
                got = _gt_chunk(part, target)
                if len(got) == len(part):
                    out.update({s: (t.strip() or s) for s, t in zip(part, got)})
                    ok = True
                    break
            except Exception as e:
                if attempt == 2:
                    print(f"  chunk failed after retries ({e})")
            time.sleep(1.5 * (attempt + 1))
        if not ok:
            for s in part:
                try:
                    got = _gt_chunk([s], target)
                    out[s] = (got[0].strip() or s) if got else s
                except Exception:
                    out[s] = s
                time.sleep(0.2)
        done += len(part)
        print(f"  {done}/{len(strings)}", flush=True)
        time.sleep(0.35)
    return out


def main():
    force = "--force" in sys.argv
    # --only es,fr,it  limits the run to the languages the picker actually offers.
    only = None
    for i, a in enumerate(sys.argv):
        if a == "--only" and i + 1 < len(sys.argv):
            only = {x.strip() for x in sys.argv[i + 1].split(",") if x.strip()}

    if not os.path.exists(LOCALES_DIR):
        os.makedirs(LOCALES_DIR)

    translatable, proper_nouns = extract_strings()
    all_strings = translatable | proper_nouns
    print(f"Extracted {len(all_strings)} unique strings "
          f"({len(translatable)} translatable, {len(proper_nouns)} proper nouns).")

    # Write English base dictionary (identity mapping)
    en_dict = {s: s for s in sorted(all_strings)}
    with open(os.path.join(LOCALES_DIR, "en.json"), "w", encoding="utf-8") as f:
        json.dump(en_dict, f, ensure_ascii=False, indent=2)
    print(f"Wrote locales/en.json ({len(en_dict)} keys)")

    for lang_code, target_lang in LANGUAGES.items():
        if only and lang_code not in only:
            continue
        out_path = os.path.join(LOCALES_DIR, f"{lang_code}.json")

        if os.path.exists(out_path) and not force:
            print(f"[{lang_code}] already exists, skipping (use --force to regenerate).")
            continue

        print(f"Translating to {lang_code}...")

        # Translate first, then stamp proper nouns over the top so a brand that
        # also appears as a source name keeps its English spelling.
        translated_dict = translate_all(target_lang, sorted(translatable))
        for s in sorted(proper_nouns):
            translated_dict[s] = s

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(translated_dict, f, ensure_ascii=False, indent=2)

        proper_kept = len(proper_nouns)
        translated_count = len([v for k, v in translated_dict.items()
                               if k in translatable and v != k])
        print(f"  Saved {out_path} "
              f"({translated_count}/{len(translatable)} translated, "
              f"{proper_kept} proper nouns preserved)")


if __name__ == "__main__":
    main()
