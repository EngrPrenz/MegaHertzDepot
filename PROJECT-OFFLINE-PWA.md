# Project: Offline-first PWA with Sync

> A stock-counting app for small stores that works fully without internet, then syncs and resolves conflicts when the connection returns.

**Working name:** `countwise` (rename freely)
**Target pace:** ~10-15 hrs/week
**Target duration:** 7 weeks (+ 1 buffer week)
**Goal:** A deployed, installable PWA with a real sync engine, a convergence test suite, and a README that explains the sync design clearly.

> **Use case is swappable.** I picked store inventory counting because the conflict scenarios are easy to explain (two people counting the same shelf). A barangay survey/checklist tool or a field-inspection app works with the same architecture. Decide in Week 1 and stick with it.

---

## 1. Why this project

- Instantly graspable pitch: **"It works with no signal and syncs later."**
- Realistic problem: patchy connectivity is normal in many real workplaces.
- Technically meaty: service workers, IndexedDB, sync protocols, and conflict resolution are topics most student portfolios never touch.
- Gives strong interview material: "How do you handle conflicts?" is a question I'll be able to answer with a design I built and tested.
- Pairs well with the Feature Flag Service: that one shows backend/SDK depth, this one shows frontend + distributed-systems thinking.

---

## 2. The problem (what the app actually does)

A small store owner (or a few staff) needs to count stock. The back room has bad signal. Staff open the app on their phones, count items, add new products, and adjust quantities. Everything works offline. When a phone gets signal, changes sync to the server and show up on other devices.

### Concrete scenarios the app must handle
1. Staff A counts shelf items offline in the back room. Later reconnects. Counts appear on the owner's device.
2. Staff A and Staff B both adjust the same product offline, then both sync. Neither change is lost.
3. Staff A renames a product while Staff B deletes it, both offline. The system resolves it predictably.
4. Sync dies halfway (connection drops mid-request). Nothing is duplicated or corrupted on retry.
5. App is updated while users are offline. They aren't forced into a broken state.

---

## 3. Scope

### MVP (must ship)
- [ ] Installable PWA (manifest, icons, app shell loads offline)
- [ ] Auth (login works online; session survives offline use)
- [ ] Stores, products, and stock adjustments with full offline CRUD
- [ ] Local-first storage in IndexedDB (writes never wait for the network)
- [ ] Sync engine: outbox push + cursor-based pull
- [ ] Conflict handling (deltas for quantities, last-write-wins for other fields, tombstones for deletes)
- [ ] Clear sync status UI (offline / syncing / synced / error, pending change count)
- [ ] Service worker update flow ("New version available. Reload")
- [ ] Convergence test suite + an offline E2E test (Playwright)
- [ ] Deployed demo + README with sync architecture diagram

### Stretch (only after MVP)
- [ ] Conflict review UI for edits that couldn't be auto-merged
- [ ] Background Sync API where supported (with fallback)
- [ ] Barcode scanning with the device camera (BarcodeDetector API or a library)
- [ ] Multi-device presence / "last synced by" indicators
- [ ] CSV export and import
- [ ] Low-stock alerts
- [ ] End-to-end encrypted local storage

### Out of scope (on purpose)
- Native apps, payments, multi-warehouse logistics, full RBAC, CRDT libraries (I want to design the sync myself first).

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript + Vite | Mobile-first UI |
| Styling | Tailwind + shadcn/ui | Keep screens few and clean |
| PWA tooling | `vite-plugin-pwa` (Workbox) | Precaching, update prompts |
| Local DB | IndexedDB via Dexie | Reactive queries with `useLiveQuery` |
| API | Node.js + Express | Same layered structure as the Feature Flag project |
| Server DB | PostgreSQL | Docker locally; Supabase is fine for the deployed demo |
| Validation | Joi (or Zod shared with the client) | Validate sync payloads strictly |
| Auth | JWT (+ refresh token) | Needs to be offline-tolerant (see section 9) |
| Testing | Vitest/Jest, Supertest, Playwright | Playwright's offline mode is key here |
| CI/CD | GitHub Actions | Lint, test, build |

---

## 5. Architecture

```
 +--------------------------- Browser (each device) --------------------------+
 |                                                                             |
 |   React UI  <--live queries--  Dexie (IndexedDB)                            |
 |      |                          |  products, adjustments, outbox, meta      |
 |      | writes                   |                                           |
 |      +--------------------------+                                           |
 |                                 |                                           |
 |                         Sync Engine (push / pull)                           |
 |                                 |                                           |
 |        Service Worker (Workbox): app shell + static asset caching           |
 +---------------------------------+-------------------------------------------+
                                   |  HTTPS (only when online)
                                   v
                       +-----------+------------+
                       |      Express API       |
                       |  /auth  /sync/push     |
                       |  /sync/pull            |
                       +-----------+------------+
                                   |
                                   v
                       +------------------------+
                       |       PostgreSQL       |
                       | products, adjustments, |
                       | change log (seq cursor)|
                       +------------------------+
```

### Core principles
1. **Local-first:** every user action writes to IndexedDB first. The UI reads from IndexedDB. The network is never in the critical path of a user action.
2. **Outbox pattern:** every local change also appends a record to an `outbox` table. Sync drains the outbox.
3. **Server is the ordering authority:** the server assigns a monotonically increasing `seq` to every accepted change. Clients pull "everything after my last `seq`."
4. **Idempotent everything:** every mutation has a client-generated `mutationId`. Replaying the same mutation twice has no extra effect.
5. **Make conflicts impossible where you can:** model data so most operations commute (see section 7).

---

## 6. Data model

### Client (Dexie / IndexedDB)

```ts
// products: current local state of each product
products: {
  id: string;            // client-generated UUID (works offline)
  storeId: string;
  name: string;
  sku?: string;
  nameUpdatedAt: number; // per-field timestamps for LWW
  deletedAt?: number;    // tombstone, never hard-delete locally until synced
  serverSeq?: number;    // last server seq that touched this row
}

// adjustments: append-only stock movements (the source of truth for quantity)
adjustments: {
  id: string;            // client-generated UUID
  productId: string;
  delta: number;         // +5, -2 (a "count" can be recorded as a delta vs. last known)
  reason: 'count' | 'sale' | 'restock' | 'damage' | 'other';
  createdAt: number;
  deviceId: string;
  userId: string;
}

// outbox: pending changes to push, in order
outbox: {
  mutationId: string;    // idempotency key
  type: 'product.create' | 'product.update' | 'product.delete' | 'adjustment.create';
  payload: object;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

// meta: sync bookkeeping
meta: {
  key: 'lastPulledSeq' | 'deviceId' | 'lastSyncAt';
  value: any;
}
```

**Quantity is derived:** `currentStock = sum(adjustments.delta)` for a product. Never store and overwrite a single `quantity` field. That one decision removes the hardest conflict class.

### Server (PostgreSQL)

```sql
users (id uuid pk, email text unique, password_hash text, created_at timestamptz)

stores (id uuid pk, name text, owner_id uuid references users)

store_members (store_id uuid, user_id uuid, role text, primary key (store_id, user_id))

products (
  id uuid pk,                       -- client-generated
  store_id uuid references stores,
  name text,
  sku text,
  name_updated_at bigint,           -- for LWW comparison
  deleted_at timestamptz,           -- tombstone
  updated_seq bigint                -- last change seq
)

adjustments (
  id uuid pk,                       -- client-generated (dedupes naturally)
  product_id uuid,
  store_id uuid,
  delta int not null,
  reason text,
  created_at bigint,
  device_id text,
  user_id uuid
)

-- Every accepted change gets a seq. Clients pull by seq.
change_log (
  seq bigserial primary key,
  store_id uuid not null,
  entity_type text not null,        -- 'product' | 'adjustment'
  entity_id uuid not null,
  op text not null,                 -- 'upsert' | 'delete'
  payload jsonb not null,
  created_at timestamptz default now()
)
create index on change_log (store_id, seq);

-- Idempotency: remember which mutations were already applied
applied_mutations (
  mutation_id uuid primary key,
  device_id text,
  applied_at timestamptz default now()
)
```

---

## 7. Conflict strategy (the heart of the project)

Different kinds of data get different strategies. This is the design decision to explain in interviews.

| Data | Strategy | Why |
|---|---|---|
| **Stock quantity** | Append-only **deltas** (adjustments) summed together | Operations commute: +3 from A and -1 from B always equals +2 regardless of order. No conflict possible. |
| **Product name / SKU** | **Per-field last-write-wins** by timestamp (tie-break on deviceId) | Simple, predictable, low-stakes data |
| **Deletes** | **Tombstones** (`deleted_at`) | Lets delete propagate to other devices; prevents "zombie" rows reappearing |
| **Edit vs. delete** | Delete wins over a concurrent edit (documented rule) | Simple and explainable; stretch goal: surface it for review |
| **Duplicate pushes** | Idempotency via `mutationId` and client-generated IDs | Retried requests never double-apply |

### The clock problem (be honest about it)
Client clocks can be wrong. Pure wall-clock LWW can let a phone with a wrong clock "win" forever.

Mitigations, from simplest to more robust:
1. **MVP:** use client timestamps for LWW but **clamp** any timestamp that's too far in the future relative to the server's time, and record the server's receive time.
2. **Better:** a hybrid logical clock (HLC) per device.
3. **Document the limitation** in the README either way. Acknowledging it is a strength.

### Stock count semantics
A physical "count" ("I counted 24 on the shelf") is not a delta. Handle it as follows:
- UI: user enters the counted number.
- App computes `delta = counted - currentLocalStock` and stores it as an adjustment with `reason: 'count'`.
- Known limitation: if another device adjusted stock in between, the final total may differ from the counted number. Show this clearly (e.g., "counted 24, adjusted since: +2, now 26"). Decide and document the behavior in Week 3.

---

## 8. Sync protocol

### Push (client to server)
`POST /sync/push`

```json
{
  "deviceId": "dev_abc",
  "mutations": [
    { "mutationId": "uuid", "type": "adjustment.create", "payload": { "...": "..." } },
    { "mutationId": "uuid", "type": "product.update",    "payload": { "...": "..." } }
  ]
}
```

Server behavior, per mutation, in one transaction:
1. Skip if `mutationId` already in `applied_mutations` (idempotent).
2. Validate and authorize (does this user belong to this store?).
3. Apply with the conflict rules from section 7.
4. Append to `change_log` (gets a `seq`).
5. Record `applied_mutations`.

Response: per-mutation result (`applied | duplicate | rejected` with reason). The client removes applied and duplicate items from the outbox and flags rejected ones for review.

### Pull (server to client)
`GET /sync/pull?since=<seq>&limit=500`

Returns changes with `seq > since` for stores the user belongs to, plus `nextSeq` and `hasMore`. The client applies them to IndexedDB in a transaction, then stores `lastPulledSeq`.

### Sync loop
1. Push the outbox in order (batch size ~50).
2. Pull until `hasMore` is false.
3. Update status and `lastSyncAt`.

**Triggers:** app start, `online` event, after local changes (debounced), manual "Sync now" button, and Background Sync where available.

**Failure handling:** exponential backoff with jitter, a hard stop on auth errors (prompt re-login), and never drop an outbox item without a result from the server.

### Applying pulled changes locally
- Don't let pulled data overwrite a local change that's still in the outbox. Apply server state, then re-apply pending local mutations on top, or compare timestamps per field.
- Test this explicitly. It's where most subtle bugs live.

---

## 9. Auth when offline

- Login requires the network once. Store the JWT and a refresh token.
- The app must keep working with an **expired access token** while offline (no forced logout).
- On reconnect, silently refresh before syncing. If refresh fails, show "Please log in again to sync." **Do not delete local unsynced data on logout without a clear warning.**
- Know the tradeoff: local data in IndexedDB isn't encrypted by default. Document it, and consider a stretch goal for encryption.

---

## 10. Service worker and PWA details

- **Precache the app shell** (JS, CSS, HTML, icons) with Workbox so the app loads offline.
- **Navigation fallback** to `index.html` for client-side routes.
- **Don't cache API sync calls** in the service worker. Sync is handled by app code with explicit logic.
- **Update flow:** use `registerType: 'prompt'`. Show "New version available. Reload" instead of silently swapping code mid-session.
- **Version compatibility:** if the IndexedDB schema changes, use Dexie versioning and migrations, and test upgrading from the old schema with existing data.
- **Persistent storage:** call `navigator.storage.persist()` so the browser is less likely to evict local data. Show a warning if it's denied.
- **iOS/Safari caveats:** Background Sync isn't available there and storage can be evicted more aggressively. Design the sync to work without Background Sync (foreground triggers and a manual button). Test in Chrome (Android) and Safari if possible.
- **Install experience:** manifest, maskable icons, theme color, a custom "Install app" prompt.

---

## 11. UI / UX

### Screens
1. **Login**
2. **Store picker** (or single store at first)
3. **Product list:** search, current stock, low-stock highlight
4. **Product detail:** adjustment history (who, when, which device), edit, delete
5. **Quick count mode:** a fast, thumb-friendly flow for walking the shelves
6. **Sync status screen:** pending changes, last sync, errors, "Sync now"
7. **Settings:** account, device name, storage info

### UX details that make it feel real
- A persistent, unobtrusive **sync indicator** (offline / syncing / up to date / needs attention) with pending count.
- Everything feels instant, with no spinners on local writes.
- "Pending sync" badges on items that haven't reached the server.
- Clear empty and error states, and big touch targets (mobile-first).
- Optimistic UI is automatic here because local DB is the source the UI reads from.

---

## 12. Testing strategy

| Level | What to cover |
|---|---|
| **Unit** | Conflict rules (LWW, tombstones, delta summing), clock clamping, outbox ordering, backoff logic |
| **Sync engine (headless)** | Run the real engine against a test server with an in-memory/fake IndexedDB; simulate failures at each step |
| **API integration (Supertest)** | Push/pull endpoints, idempotent retries, authorization, validation errors, pagination via `since` |
| **Convergence / property tests** | Two or three simulated clients apply random operations offline, sync in random order and interleavings, and **all end in identical state** |
| **E2E (Playwright)** | `context.setOffline(true)`: create items offline, go online, confirm they appear on a second browser context; reload while offline and confirm the app still loads |
| **Migration tests** | Open an app with old-schema data and confirm upgrade works |

### Failure scenarios to inject on purpose
- Connection drops mid-push (server applied some mutations; client never got the response). Retry must not duplicate.
- Duplicate pushes of the same `mutationId`
- Server rejects one mutation in a batch. The rest still apply.
- Clock skew on one device
- Pull returns changes for an item with a pending local edit

> The convergence test is the single most impressive thing in this project's test suite. Treat it as a first-class deliverable.

---

## 13. Security checklist

- [ ] Passwords hashed (bcrypt/argon2); JWT with sensible expiry
- [ ] Every sync request authorizes store membership server-side
- [ ] Strict validation of all sync payloads (never trust client IDs, timestamps, or types)
- [ ] Rate limiting on auth and sync endpoints
- [ ] Payload size limits and batch size caps
- [ ] CORS configured deliberately
- [ ] No secrets in the repo; `.env.example` provided
- [ ] README documents that local data isn't encrypted (and what that implies)

---

## 14. Roadmap (7 weeks at ~10-15 hrs/week)

> **Sequencing tip:** Start this after the Feature Flag Service reaches a working MVP (roughly its Week 6), so the two projects don't compete for the same hours.

### Week 1: Foundations
- Repo setup (client + server), TypeScript, linting, CI
- Server schema, migrations, auth endpoints
- Vite + `vite-plugin-pwa` skeleton: installable, app shell loads offline
- **Done when:** I can install the app, go offline, reload it, and still see the shell.

### Week 2: Local-first core
- Dexie schema, products and adjustments CRUD entirely offline
- Derived stock calculation and live-query UI
- Outbox table, with every local write enqueuing a mutation
- **Done when:** the whole app works offline with zero server involved, and the outbox fills correctly.

### Week 3: Push sync
- `/sync/push` with idempotency, validation, and the `change_log`
- Client push loop, batching, backoff
- Conflict rules implemented and unit tested
- Decide and document "count vs. delta" behavior
- **Done when:** offline changes reach the server exactly once, even with retries and dropped connections.

### Week 4: Pull sync + applying changes
- `/sync/pull` with seq cursor and pagination
- Apply pulled changes locally, including with pending local edits
- Tombstones and delete handling
- **Done when:** two browsers converge after going offline, editing, and reconnecting.

### Week 5: Sync UX + auth edge cases
- Sync status indicator, pending badges, "Sync now", error states
- Offline-tolerant auth and token refresh
- Quick count mode
- **Done when:** a non-technical person can tell whether their data is safe, and the app never logs them out unexpectedly.

### Week 6: Hardening + tests
- Convergence/property tests
- Playwright offline E2E flows
- Failure injection tests and Dexie migration test
- Service worker update flow (prompt to reload)
- **Done when:** tests prove convergence under random interleavings and injected failures.

### Week 7: Deploy, dogfood, document
- Deploy API and PWA (HTTPS required for service workers)
- Use it for real: count something real (my own room's stuff, a family store, a friend's shop) on a phone
- README with sync diagram, conflict strategy, limitations, and a demo GIF showing offline-to-online sync
- **Done when:** someone can read the README and understand the sync design in a few minutes.

### Week 8: Buffer / stretch
- Conflict review UI, barcode scanning, or CSV import/export
- Fix rough edges found while dogfooding

---

## 15. Definition of done

- [ ] Installable, works offline, deployed on HTTPS
- [ ] Two devices converge after offline edits (demonstrated in a GIF and in automated tests)
- [ ] Convergence/property test suite passing in CI with a visible badge
- [ ] Playwright offline E2E test passing
- [ ] README includes: pitch + GIF, architecture diagram, sync protocol, conflict strategy table, known limitations
- [ ] Used for at least one real counting session
- [ ] Added to portfolio site and resume

---

## 16. README outline (write this as you go)

1. One-line pitch + demo GIF (airplane mode on, edit, airplane mode off, data appears on second device)
2. Features
3. Architecture diagram
4. How sync works (outbox, push, pull, cursor)
5. Conflict strategy table and the reasoning behind each choice
6. Offline behavior: what works, what doesn't, browser caveats
7. Testing approach (especially the convergence tests)
8. Known limitations (clock skew, unencrypted local storage, edit/delete rule) and what I'd do next

---

## 17. Interview talking points to prepare

- Why local-first? What does the UI read from, and why?
- Why model stock as deltas instead of overwriting a quantity?
- What's your conflict strategy for each type of data, and why different ones?
- What happens if the connection drops after the server applies a push but before the client gets the response?
- How do you prevent duplicate application of the same change?
- What are the problems with client timestamps, and how did you mitigate them?
- Why a server-assigned sequence number as the pull cursor?
- How do you handle a service worker update while the user has unsynced data?
- What would you change to support thousands of devices or real-time sync? (WebSockets/SSE push, CRDTs, per-store sharding.)
- What are the known weaknesses of your design?

---

## 18. Resume bullets (draft, fill in real numbers later)

- Built an offline-first inventory PWA (React, TypeScript, Dexie/IndexedDB, Express, PostgreSQL) with a custom sync engine using an outbox pattern, idempotent mutations, and a server-sequenced change log.
- Designed a conflict-resolution strategy combining commutative stock deltas, per-field last-write-wins, and tombstoned deletes, verified by property-based convergence tests across simulated devices with injected network failures.
- Implemented installable app-shell caching with Workbox, offline-tolerant authentication, and a prompted service-worker update flow; covered critical offline paths with Playwright end-to-end tests.
- Validated the app with real use in an actual counting session and documented design tradeoffs and known limitations.

---

## 19. Risks and how to handle them

| Risk | Mitigation |
|---|---|
| Sync design rabbit hole | Fix the strategy in section 7 up front; no CRDT libraries; start with the simplest rule that works |
| Debugging "it works on my machine" sync bugs | Build the convergence test harness early (Week 3-4), not at the end |
| iOS/Safari limitations | Design sync to work with foreground triggers only; treat Background Sync as an optional extra |
| Overbuilding UI | Few screens, shadcn/ui, mobile-first; the sync engine is the star |
| Both projects at once drain hours | Start after Feature Flag MVP; pause stretch goals on both |
| Service worker caching confusion | Precache the shell only; never cache sync API calls; test update flow early |

---

## 20. Progress log

| Week | Planned | Actual | Notes |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
