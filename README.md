# OurBasket

A shared shopping list for two people (Dor and Maayan), in Hebrew and right-to-left.
One list, edited from any device, synced in real time, with categories, checked items,
purchase history and export to WhatsApp text or a printable page.

> **Status:** Steps 1–2 are done: the project setup (Next.js, Chakra UI in RTL, Hebrew
> text, tests, CI) and the database (Prisma, tables, rules, seed). Next: sign-in with
> Google (step 3). See [`OurBasketSpec.md`](OurBasketSpec.md) for the full spec and the
> decision log (Hebrew).

## Tech stack

| Area     | Choice                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| App      | [Next.js 16](https://nextjs.org) (App Router, Cache Components), React 19, TypeScript (strict)                                     |
| UI       | [Chakra UI 3](https://chakra-ui.com), Hebrew text via [next-intl](https://next-intl.dev)                                           |
| Database | PostgreSQL 16 with [Prisma 7](https://www.prisma.io) (`@prisma/adapter-pg`)                                                       |
| Tests    | [Vitest](https://vitest.dev), [Playwright](https://playwright.dev), [axe-core](https://github.com/dequelabs/axe-core)              |
| Planned  | [Better Auth](https://www.better-auth.com) (step 3), [Pusher Channels](https://pusher.com) (step 8)                               |
| Hosting  | [Vercel](https://vercel.com) (Frankfurt) + [Neon](https://neon.tech) (Frankfurt) — from step 11                                    |

## Running locally

**Requirements:** Node.js 24, npm, Docker Desktop, and Google Chrome (for the
end-to-end tests).

```bash
npm install                # also generates the Prisma client
cp .env.example .env       # the database URLs already match the Docker database
npm run db:up              # Postgres 16 in Docker, on host port 5437
npm run db:migrate         # apply migrations, and regenerate the Prisma client
npm run db:seed            # the 12 default categories (safe to run again)
npm run dev                # http://localhost:3000
```

`npm run db:studio` opens Prisma Studio, to look at or clean up local data.
`npm run db:down` stops the database (the data stays in a Docker volume).

## Database

The schema is in [`prisma/schema.prisma`](prisma/schema.prisma): categories, products,
the list revision (`list_state`, one row), and the purchase history (records and their
items, stored as snapshots). There is no household table: there is one shared list.

Rules Prisma can't express live in the migration SQL, so they hold even if a bug or a
direct query tries otherwise:

- Quantities are whole numbers from 1 to 999; names are not blank and at most 60
  characters; `list_state` has a single row.
- A product's name is unique across the whole list, by its normalized form (trimmed,
  spaces collapsed, English lower-cased: [`src/lib/names.ts`](src/lib/names.ts)).
- A category with products can't be deleted (delete its products first, in the same
  transaction).
- The system category "General" can't be deleted, can't stop being the system
  category, and there is only one.
- History items keep the category's id, name, color and emoji as they were, even after
  the category is deleted.

All times are `timestamptz` (UTC), shown in `Asia/Jerusalem`.

## Configuration

Settings that aren't secret live in [`src/config/app.config.ts`](src/config/app.config.ts):
language and direction (`he`, `rtl`), time zone (`Asia/Jerusalem`), the theme color, the
two users, the 12-color palette, the default categories (emoji and color) and the
limits (names up to 60 characters, quantities 1–999). All UI text is in
[`messages/he.json`](messages/he.json).

Secrets and emails are environment variables only: see [`.env.example`](.env.example).

## Tests

```bash
npm run test:unit          # fast, no database
npm run test:integration   # against the ourbasket_test database (npm run db:up first)
npm test                   # both
npm run test:e2e           # production build + Playwright in Chrome, on port 3200
```

Integration tests use a separate `ourbasket_test` database (created by
[`docker/init-test-db.sql`](docker/init-test-db.sql)), so they never touch development
data. They apply the migrations first and empty the tables before each test.

- End-to-end tests run on a desktop browser and on a phone-sized one (Pixel 7); tests
  for both are tagged `@mobile`.
- Every test fails on any browser console error.
- Each screen is scanned with axe-core (WCAG 2.1 A and AA), and on the phone every
  tappable element must be at least 44×44 pixels.

Other checks: `npm run lint`, `npm run typecheck`, `npm run format:check`
(`npm run format` fixes formatting).

## CI

[GitHub Actions](.github/workflows/ci.yml) runs formatting, lint, types, the unit and
integration tests (against a Postgres 16 service), the seed (twice), the build and the
end-to-end tests on every push and on every Pull Request into `main`.

## Workflow

`main` is protected: every step goes through its own branch (for example
`step-1-project-setup`) and a Pull Request, and the CI check
"Lint, types, tests and build" must pass before merging.

## Project structure

```
src/
  app/                 routes (layout, pages), icon.svg
  components/          providers (Chakra, Emotion)
  config/              app.config.ts and the contrast helper
  i18n/                next-intl setup (one fixed locale)
  lib/                 Prisma client, name normalization
  modules/             domain logic: categories/ (seed)
  generated/           Prisma client (generated, not in git)
messages/he.json       all UI text
prisma/                schema, migrations, seed script
docker/                local database setup
tests/integration/     tests against the test database
tests/e2e/             Playwright tests and helpers (accessibility, touch targets)
```
