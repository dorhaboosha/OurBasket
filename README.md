# OurBasket

A shared shopping list for two people (Dor and Maayan), in Hebrew and right-to-left.
One list, edited from any device, synced in real time, with categories, checked items,
purchase history and export to WhatsApp text or a printable page.

> **Status:** Steps 1–6 are done: the project setup (Next.js, Chakra UI in RTL, Hebrew
> text, tests, CI), the database (Prisma, tables, rules, seed), sign-in with Google for
> the two allowed accounts, the navigation with category management in the settings,
> the shopping list itself, and "update list", which records purchases. Next: the
> history screen (step 7). See
> [`OurBasketSpec.md`](OurBasketSpec.md) for the full spec and the decision log (Hebrew).

## Tech stack

| Area     | Choice                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| App      | [Next.js 16](https://nextjs.org) (App Router, Cache Components), React 19, TypeScript (strict)                                     |
| UI       | [Chakra UI 3](https://chakra-ui.com), Hebrew text via [next-intl](https://next-intl.dev), [dnd-kit](https://dndkit.com) (drag and drop), [Lucide](https://lucide.dev) icons                                           |
| Database | PostgreSQL 16 with [Prisma 7](https://www.prisma.io) (`@prisma/adapter-pg`)                                                       |
| Auth     | [Better Auth](https://www.better-auth.com) with Google                                                                             |
| Tests    | [Vitest](https://vitest.dev), [Playwright](https://playwright.dev), [axe-core](https://github.com/dequelabs/axe-core)              |
| Planned  | [Pusher Channels](https://pusher.com) (step 8)                                                                                     |
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

In `.env`, fill in:

- `BETTER_AUTH_SECRET`: any random string of 32+ characters:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `USER_EMAIL_DOR`, `USER_EMAIL_MAAYAN`: the two Google accounts allowed to sign in.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: an OAuth client of type "Web application"
  in the Google Cloud project "OurBasket", with the JavaScript origin
  `http://localhost:3000` and the redirect URI
  `http://localhost:3000/api/auth/callback/google`. While the consent screen is in
  "Testing", both emails must be listed as test users.

## Sign-in

Only two people can use the app, with their Google accounts. There is no sign-up and no
password.

- Sign-in asks Google for name and email only (`openid email profile`).
- A Google sign-in is accepted only if the email is one of the two in the environment
  (`USER_EMAIL_*`) **and** Google says it is verified; otherwise no user or session is
  created and the login page explains why.
- Every page, action and route checks the session on the server, and checks again that
  the email is still allowed: removing an email from the environment signs that user out
  on their next request.
- Each sign-in copies the current name and email from Google to the user, so a Google
  email change doesn't leave a stale one behind.
- Changing `USER_EMAIL_DOR` or `USER_EMAIL_MAAYAN` to another Google account works: on
  that account's first sign-in, the old account's user row (and its sessions) is removed.
- [`src/proxy.ts`](src/proxy.ts) only redirects requests without a session cookie to
  `/login`; it is not the security check.
- `/login` and `/privacy` are public.

## Screens

- **The list:** the products by category, each category opened or closed with its header
  (remembered on this device). Search filters as you type, in every category.
  - Add a product with a name, a quantity (1–999) and a category (none means General).
    Adding a product that's already listed adds up the quantities instead, up to 999.
  - Check a product off: it is crossed out and goes to the bottom of its category.
  - `-` and `+` change the quantity by one; presses from both phones all count. The
    quantity can also be typed; 0 deletes the product.
  - Edit a product's name, quantity or category, or delete it. A delete (also by `-` at 1
    or a typed 0) shows "undo", which puts the product back where it was.
  - Drag a product by its handle to reorder it, or into another category.
  - "Clear list" deletes every product after asking. It isn't a purchase: history stays.
  - "Update list" (on once something is checked off) asks first, then records the checked
    products in a new history record, as they are (names, quantities, categories), and
    removes them from the list. Only products still checked are bought: one the other
    phone unchecked meanwhile stays on the list.
- **Navigation:** a sidebar on computers and a bar at the bottom of the screen on
  phones, with the list, the history and the settings. The top bar shows the app's
  name and who is signed in.
- **Settings:** the categories (add, edit, delete, reorder), the account (sign out) and
  about the app.
  - A category has a name (up to 60 characters, unique after normalizing), one of the 12
    palette colors and one emoji (40 suggestions, or any other typed in).
  - Drag a category by its handle to reorder it, with a mouse or a finger; with the
    keyboard, Space picks it up, the arrows move it and Space puts it down.
  - Deleting a category asks first, and says how many products on the list go with it.
    If that number changed meanwhile, nothing is deleted and the question updates.
  - "General" is the system category: it can be renamed and recolored, never deleted.
  - Edits are checked against the version they started from: if the other person saved
    first, the save is refused and the latest data is shown.

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
- End-to-end tests sign in without Google: they create the user and a session directly
  in the test database and set the session cookie. They use test emails, never the real
  ones.
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
  app/                 routes: (app)/ = signed-in pages (list, history, settings,
                       with the navigation), login/, privacy/, api/auth (Better
                       Auth), icon.svg
  components/          providers (Chakra, Emotion), toasts, shared dialog styles
  config/              app.config.ts and the contrast helper
  i18n/                next-intl setup (one fixed locale)
  lib/                 Prisma client, Better Auth server and client, name normalization
  modules/             domain logic: auth/ (allowlist, hooks, current user),
                       categories/ (validation, database actions, seed),
                       products/ (validation, database actions),
                       list/ (revision, snapshot, how the screen shows it),
                       history/ (update list: recording purchases)
  proxy.ts             redirects to /login when there is no session cookie
  generated/           Prisma client (generated, not in git)
messages/he.json       all UI text
prisma/                schema, migrations, seed script
docker/                local database setup
tests/integration/     tests against the test database
tests/e2e/             Playwright tests and helpers (accessibility, touch targets)
```
