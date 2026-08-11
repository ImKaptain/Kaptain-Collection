# Optional Account / Auto-Save

Branch: `feature/optional-account-autosave`  
Status: first slice scaffold (feature-flagged OFF by default)

## Why this approach

**Primary: separate free Supabase project + client-side vault encryption (AES-GCM), with a local-only encrypted fallback.**

GitHub Pages cannot host secrets or a paid backend. A dedicated Supabase free project gives optional email auth and synced storage without touching Nuvio’s production API (`api.nuvio.tv`). Secrets are encrypted in the browser with a vault passphrase the server never sees — so even a leaked DB row or anon-key RLS mistake yields ciphertext. Local-only mode uses the same crypto against `localStorage`, so Tim can test without creating a project first.

Alternatives considered briefly:
- **Client-only localStorage (no account):** free/secure with a passphrase, but no cross-device “account.”
- **Firebase:** similar free tier; skipped because this repo already speaks Supabase-style REST in `nuvio-push.js`.
- **Reuse Nuvio Supabase:** rejected — would overload production and couple picker prefs to Nuvio accounts.

## What gets auto-saved (payload v1)

| Area | Fields |
|------|--------|
| API keys | `torboxKey`, `tmdbKey`, `mdblistKey`, `forYouMdblistKey`, `aioTraktToken`, `aioRpdbKey`, `aioDebridKey`, `aioDebridType` |
| Collection edits | `selectedMap`, category/folder/source order, `categorySort`, GIF disable flags, view mode |
| Light prefs | wizard `email`, `profileName`, `setupMode` (not Nuvio password) |

**Never saved:** Nuvio account password, Supabase service-role keys, Bingecat/Syncribullet install URLs only if Tim later opts in (not in v1).

## Security model

1. Vault passphrase ≠ account password; passphrase never leaves the device.
2. PBKDF2-SHA-256 (310k iters) → AES-256-GCM; salt + IV stored beside ciphertext.
3. Cloud rows are ciphertext-only; RLS locks rows to `auth.uid()`.
4. Feature flag off ⇒ zero UI / zero network / anonymous path unchanged.
5. Anon key is public-by-design (like Nuvio’s); never commit service role.

## Supabase setup checklist (Tim)

1. Create a **new** free Supabase project (not Nuvio’s).
2. Auth → enable Email (password and/or magic link).
3. SQL editor — run:

```sql
create table if not exists public.kaptain_vaults (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ciphertext text not null,
  salt text not null,
  iv text not null,
  updated_at timestamptz not null default now()
);

alter table public.kaptain_vaults enable row level security;

create policy "own vault read" on public.kaptain_vaults
  for select using (auth.uid() = user_id);
create policy "own vault insert" on public.kaptain_vaults
  for insert with check (auth.uid() = user_id);
create policy "own vault update" on public.kaptain_vaults
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own vault delete" on public.kaptain_vaults
  for delete using (auth.uid() = user_id);
```

4. Copy Project URL + **anon** key into `account-config.local.js` (see example file).
5. Set `enabled: true` in that local override.
6. Serve on port **8099** (`python -m http.server 8099`) and open `http://localhost:8099/`.

## Local test (no Supabase, no DevTools)

This feature branch has `enabled: true` in `account-config.js`. On `main` / public, keep `enabled: false` so the Account tile stays hidden for anonymous visitors.

1. From the repo folder run: `python -m http.server 8099` (skip if already running).
2. Open **http://127.0.0.1:8099/** (or localhost).
3. Title screen -> **More options** -> **Account / Auto-Save** (tile should be visible).
4. Enter passphrase **TestVault1** twice -> **Create vault**. Status should say vault unlocked / manage view.
5. Close the modal -> **More options** -> **Quick Editor**.
6. Click **Advanced**, paste fake Torbox and TMDB keys, turn a couple folders off.
7. Open **Account / Auto-Save** again -> **Save now** (you should see a short "Saved encrypted vault" toast). Edits also auto-save while unlocked.
8. **Lock vault**, then refresh the page (F5).
9. **More options** -> tile should say **Unlock Auto-Save** -> enter **TestVault1** -> **Unlock**.
10. Confirm toast/status says restored, and your fake keys + folder picks are back (Quick Editor -> Advanced).

Wrong passphrase should show an on-screen error and leave the vault locked.

Optional: `?account=1` forces the UI on even when `enabled` is false; `?account=0` clears that force flag. This branch does not need the force flag for normal testing.

## Still open for Tim

- Create Supabase project + paste anon URL/key (cloud sync).
- Decide email/password vs magic-link only.
- Whether Bingecat/Syncribullet manifest URLs should join the vault later.
- When to flip `enabled: true` on the public site (only after Tim confirms).

## Do not

- Merge/push to `main` or deploy Pages without Tim asking.
- Point this feature at `api.nuvio.tv`.
- Commit `account-config.local.js` or any real keys.
