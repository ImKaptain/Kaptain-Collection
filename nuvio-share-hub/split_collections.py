import os
import json
import re

# File Paths
MEGA_JSON_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Kaptain_Mega_047_Nuvio_Updated.json"))
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "collections"))

# Human-friendly descriptions and emoji tags for categories
CATEGORY_INFO = {
    "For You / Trending / New": {
        "description": "Dynamic, up-to-date lists including Trakt Up Next, Recommendations, and your personal Watchlist with custom animated hover cards.",
        "icon": "⚡",
        "tag": "Media"
    },
    "Streaming Services": {
        "description": "Premium matching base and hover cards for all major streaming platforms including Netflix, Disney+, HBO Max, Hulu, Apple TV+, and Prime Video.",
        "icon": "🎬",
        "tag": "Services"
    },
    "Networks": {
        "description": "Massive collection of custom artwork and effects for television networks including AMC, BBC, FX, HBO, Showtime, CW, and global channels.",
        "icon": "📺",
        "tag": "Networks"
    },
    "Genres": {
        "description": "Beautiful cinematic backdrops and folder designs for Action, Comedy, Sci-Fi, Horror, Anime, and all major film & TV genres.",
        "icon": "🎭",
        "tag": "Genres"
    },
    "Film Collections": {
        "description": "Custom-designed folder layouts for major cinematic universes, sagas, and movie franchises (Marvel, Star Wars, Harry Potter, DC, etc.).",
        "icon": "📦",
        "tag": "Collections"
    },
    "Actors": {
        "description": "Spotlight folder designs and elegant custom artwork for 58 of cinema's most popular, legendary, and trending actors.",
        "icon": "🌟",
        "tag": "Actors"
    },
    "Legendary Directors": {
        "description": "Custom showcase layouts honoring legendary filmmakers (Christopher Nolan, Quentin Tarantino, Martin Scorsese, Stanley Kubrick, and more).",
        "icon": "🎥",
        "tag": "Directors"
    },
    "Studios": {
        "description": "Dedicated studio spotlights for major production houses and animation studios including Studio Ghibli, Pixar, A24, Marvel, and more.",
        "icon": "🏰",
        "tag": "Studios"
    },
    "By Decade": {
        "description": "Nostalgic time-capsule folders grouping cinematic masterpieces and hit TV shows by decade, spanning from the 1950s to the 2020s.",
        "icon": "📅",
        "tag": "Decades"
    },
    "Anime": {
        "description": "Dedicated anime worlds collection featuring custom artwork for popular series, Shonen hits, and major anime franchises.",
        "icon": "🔥",
        "tag": "Anime"
    },
    "Awards": {
        "description": "Prestigious award categories showcasing Academy Awards (Oscars), Golden Globes, and Cannes Film Festival spotlight folders.",
        "icon": "🏆",
        "tag": "Awards"
    }
}

def slugify(text):
    """Convert text to a clean file-friendly slug."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s-]+', '_', text).strip('_')
    return text

def split_collection():
    print(f"Reading Mega Collection from: {MEGA_JSON_PATH}")
    if not os.path.exists(MEGA_JSON_PATH):
        print(f"Error: Mega Collection JSON file not found at {MEGA_JSON_PATH}")
        return

    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(MEGA_JSON_PATH, "r", encoding="utf-8") as f:
        mega_data = json.load(f)

    if not isinstance(mega_data, list):
        print("Error: Mega JSON must be a list of collection objects.")
        return

    individual_collections = []
    total_folders = 0

    print("Splitting collections...")
    for idx, coll in enumerate(mega_data):
        title = coll.get("title", f"Collection {idx}")
        coll_id = coll.get("id", f"collection-{idx}")
        folders = coll.get("folders", [])
        folders_count = len(folders)
        total_folders += folders_count

        slug = slugify(title)
        filename = f"{slug}.json"
        filepath = os.path.join(OUTPUT_DIR, filename)

        # Wrap in a list to preserve compatibility with Nuvio's import array structure
        coll_wrapped = [coll]

        # Write split collection file
        with open(filepath, "w", encoding="utf-8") as out_f:
            json.dump(coll_wrapped, out_f, indent=2, ensure_ascii=False)

        # Calculate exact file size in KB
        size_bytes = os.path.getsize(filepath)
        size_kb = round(size_bytes / 1024, 1)

        # Get curated details
        info = CATEGORY_INFO.get(title, {
            "description": f"Custom selection including {folders_count} handpicked folders for {title}.",
            "icon": "📁",
            "tag": "Collection"
        })

        individual_collections.append({
            "id": coll_id,
            "title": title,
            "filename": filename,
            "description": info["description"],
            "icon": info["icon"],
            "tag": info["tag"],
            "folders_count": folders_count,
            "size_kb": size_kb
        })
        print(f" - Created {filename} ({folders_count} folders, {size_kb} KB)")

    # Also copy the full mega collection into the collections directory for easy single link downloading
    mega_dest_path = os.path.join(OUTPUT_DIR, "nuvio_mega_collection.json")
    with open(mega_dest_path, "w", encoding="utf-8") as out_mega:
        json.dump(mega_data, out_mega, indent=2, ensure_ascii=False)
    
    mega_size_bytes = os.path.getsize(mega_dest_path)
    mega_size_kb = round(mega_size_bytes / 1024, 1)

    # Generate metadata
    metadata = {
        "mega_collection": {
            "filename": "nuvio_mega_collection.json",
            "title": "Nuvio Mega Collection",
            "description": "Complete premium collection combined into a single, high-fidelity file. Instantly imports all 11 categories with over 350+ fully customized folders, custom base & hover cards, and active dynamic artwork.",
            "categories_count": len(mega_data),
            "folders_count": total_folders,
            "size_kb": mega_size_kb
        },
        "individual_collections": individual_collections
    }

    metadata_path = os.path.join(OUTPUT_DIR, "metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f_meta:
        json.dump(metadata, f_meta, indent=2, ensure_ascii=False)

    print("\nSplitting complete!")
    print(f"Total Collections Split: {len(mega_data)}")
    print(f"Total Folders Cataloged: {total_folders}")
    print(f"Mega Collection size: {mega_size_kb} KB")
    print(f"Metadata catalog written to: {metadata_path}\n")

if __name__ == "__main__":
    split_collection()
