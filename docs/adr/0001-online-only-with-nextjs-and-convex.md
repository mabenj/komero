# Online-only, built on Next.js + Convex on Vercel

Komero is used mostly in shops, where signal is often poor, so full offline support (local database, queued writes that survive reloads) was seriously considered. We dropped it to keep the build simple. When the connection drops, Komero shows the last data with an "Offline" banner and holds taps only while the app stays open. We picked Next.js on Vercel with Convex for data, live updates and auth, because Convex gives instant cross-device updates and transactional Stock changes without running a realtime service ourselves.

## Considered Options

- **Firebase**: the best offline story (persistent write queue, atomic increments), but offline was dropped and a document store gives nothing extra here.
- **Supabase (+ PowerSync for offline)**: free tier pauses after about a week idle, which is a bad fit for a household app that sits unused during holidays.
- **Next.js + Neon Postgres + Drizzle + Better Auth**: plain SQL we own, but Vercel functions can't push updates, so it would need ~3 s polling or a separate pub/sub vendor. We preferred instant updates.
- **InstantDB**: offline-first by default, but its last-write-wins writes can lose a concurrent –1 on Stock.
