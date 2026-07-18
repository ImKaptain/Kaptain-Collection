import json

SERVICES_TO_REMOVE = ["AMC+", "Crunchyroll", "Discovery+", "MGM+", "Paramount+", "Shudder"]

def main():
    with open('Kaptain_Nuvio_Native_064.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    for collection in data:
        for folder in collection.get('folders', []):
            if folder.get('title') in ["Top Streaming Movies", "Top Streaming Series"]:
                original_count = len(folder.get('sources', []))
                folder['sources'] = [
                    source for source in folder.get('sources', [])
                    if source.get('title') not in SERVICES_TO_REMOVE
                ]
                new_count = len(folder.get('sources', []))
                print(f"Removed {original_count - new_count} sources from {folder.get('title')}")

    with open('Kaptain_Nuvio_Native_064.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

if __name__ == '__main__':
    main()
