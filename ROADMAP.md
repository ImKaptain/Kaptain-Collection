# Feature Proposal: "Simple Customize" Questionnaire Flow

## 🎯 Concept Overview
A guided, step-by-step onboarding flow ("Simple Customize") modeled after the classic Curation Wizard. Instead of manually inspecting every folder or navigating hundreds of checkboxes, users answer high-level lifestyle & content preference questions. 

Their answers automatically tailor the output configuration by adding/removing entire folder groups, applying language parameters, and injecting positive & negative TMDB filters (`with_*` and `without_*`).

---

## 📋 Questionnaire Structure & Decision Matrix

### 1. Core Content Tastes
* **"Do you watch Anime?"**
  * **Yes**: Include Anime folders (Spotlight, Top Rated, Shonen, etc.).
  * **No**: Remove Anime folders + inject `withoutGenres: 16` and `withoutKeywords: 210024` into general movie/series discover sources.
* **"Do you watch International / Foreign Cinema?"**
  * **Yes**: Include International categories (British, Korean, French, Nordic, etc.).
  * **No**: Exclude International folders + set `withOriginalLanguage: "en"`.
* **"Do you watch Indian / Bollywood Cinema?"**
  * **Yes**: Include Bollywood/Tollywood folders.
  * **No**: Exclude Indian categories + inject `withoutKeywords: 9715`.
* **"Do you watch Reality TV & Documentaries?"**
  * **Yes**: Keep Reality TV & Doc rows.
  * **No**: Exclude Reality TV & Doc folder groups.

### 2. Services & Networks
* **"Select the streaming services you use / want:"**
  * Checkboxes: Netflix, Prime Video, Disney+, Apple TV+, Max, Paramount+, Hulu, Peacock, etc.
  * *Action*: Include/exclude specific folders in the "Streaming Services" category.
* **"Select the TV networks you watch:"**
  * Checkboxes: HBO, AMC, Showtime, BBC, FX, Discovery, History, etc.
  * *Action*: Include/exclude specific folders in the "Networks" category.

### 3. Language & Localization
* **"What is your primary language for audio / metadata?"**
  * Selection: English, Spanish, French, German, Italian, Portuguese, etc.
  * *Action*: Sets default discover language and subtitle prioritization.
* **"Do you want non-native language content in your discover rows?"**
  * **Yes**: Allow multi-language discover results.
  * **No**: Hard-lock `withOriginalLanguage` to the chosen primary language.

---

## 🛠️ Architecture & Integration Points
1. **Entry Point**: Available from the Title Screen / Wizard as **"Simple Customize"** alongside "Take the Tour", "Quick Editor", and "Build Manually".
2. **Preset Generation**: Answers build an in-memory configuration profile that modifies:
   - `selectedMap` (which folders/categories are included).
   - Global filter overrides (e.g. `withoutGenres`, `withoutKeywords`, `withOriginalLanguage`).
3. **Seamless Hand-off**: The resulting customized selection feeds directly into the "Send to Nuvio" export pipeline or Quick Editor for fine-tuning.
