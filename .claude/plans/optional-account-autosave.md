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

## Local test (no Supabase)

1. In DevTools: `localStorage.setItem('kaptain_account_force', '1')` then reload  
   **or** set `enabled: true` in `account-config.js` / local override (leave supabase fields empty).
2. Title screen → **Account / Auto-Save** → create vault with a passphrase.
3. Enter API keys in Quick Editor, toggle folders / reorder.
4. Reload → unlock with passphrase → keys + selections restore.
5. Confirm with flag off / force cleared: no account button, cold start = full Mega Bundle as today.

## Still open for Tim

- Create Supabase project + paste anon URL/key (cloud sync).
- Decide email/password vs magic-link only.
- Whether Bingecat/Syncribullet manifest URLs should join the vault later.
- When to flip `enabled: true` on the public site (only after Tim confirms).

## Do not

- Merge/push to `main` or deploy Pages without Tim asking.
- Point this feature at `api.nuvio.tv`.
- Commit `account-config.local.js` or any real keys.
