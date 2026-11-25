# OurBasket

A shared shopping list for two people (Dor and Maayan), in Hebrew and right-to-left.
One list, edited from any device, synced in real time, with categories, checked items,
purchase history and export to WhatsApp text or a printable page.

> **Status:** Steps 1–10 are done: the project setup (Next.js, Chakra UI in RTL, Hebrew
> text, tests, CI), the database (Prisma, tables, rules, seed), sign-in with Google for
> the two allowed accounts, the navigation with category management in the settings,
> the shopping list itself, "update list", the purchase history, real-time sync between
> the two phones, exporting the list, and installing it as an app (PWA, logo and icons).
> Step 11: the app is deployed on Vercel, at https://ourbasket-kohl.vercel.app. Step 12,
> acceptance: each criterion and the tests that check it are in
> [`docs/acceptance.md`](docs/acceptance.md). See
> [`OurBasketSpec.md`](OurBasketSpec.md) for the full spec and the decision log (Hebrew).

## Tech stack

| Area     | Choice                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| App      | [Next.js 16](https://nextjs.org) (App Router, Cache Components), React 19, TypeScript (strict)                                     |
| UI       | [Chakra UI 3](https://chakra-ui.com), Hebrew text via [next-intl](https://next-intl.dev), [dnd-kit](https://dndkit.com) (drag and drop), [Lucide](https://lucide.dev) icons                                           |
| Database | PostgreSQL 16 with [Prisma 7](https://www.prisma.io) (`@prisma/adapter-pg`)                                                       |
| Auth     | [Better Auth](https://www.better-auth.com) with Google                                                                             |
| Tests    | [Vitest](https://vitest.dev), [Playwright](https://playwright.dev), [axe-core](https://github.com/dequelabs/axe-core)              |
| Sync     | [Pusher Channels](https://pusher.com) (private channel, events carry only a revision)                                              |
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
- `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`, and
  `NEXT_PUBLIC_PUSHER_KEY` / `NEXT_PUBLIC_PUSHER_CLUSTER` (the same key and cluster):
  from a Pusher Channels app (App Keys). Without them the app still works; the other
  phone just catches up when it comes back to the app instead of at once.
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
  - "Export" (on while something is left to buy) copies the list for WhatsApp or opens
    the print page. See [Export](#export).
- **Navigation:** a sidebar on computers and a bar at the bottom of the screen on
  phones, with the list, the history and the settings. The top bar shows the app's
  name and who is signed in.
- **History:** one card per purchase, newest first (20 at a time, then "older
  purchases"), with its date and time in Israel time and how many products and
  categories it had.
  - A purchase's page shows its products by category, as they were when bought (even if
    the category was renamed or deleted since).
  - "Add to list" puts its products back on the list: a listed product gets the
    quantity added (up to 999) and keeps its category; another goes to its category
    from then (by id), or to General if that was deleted.
  - Deleting a purchase asks first. It doesn't put anything back on the list.
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

## Export

Both include only the products not checked off yet, by category, in list order (spec 11).

- **Copy for WhatsApp:** copies text like this to the clipboard, ready to paste:

  ```text
  OurBasket — רשימת קניות

  🥛 מוצרי חלב
  • חלב — 2
  • גבינה צהובה — 1
  ```

  Each line starts with an invisible right-to-left mark, so a line starting with a Latin
  word still reads right to left. If the clipboard can't be used, the text is shown,
  selected, to copy by hand.

- **Print / PDF:** opens [`/print`](src/app/print/page.tsx), a plain black-and-white
  page with the date, the categories with their emoji, and an empty box by each product
  to check off with a pen. It opens the browser's print dialog, where "Save as PDF" is one
  of the printers. A product or a category heading is never cut between pages. No PDF is
  made on the server.

  In the app added to an iPhone's home screen, iOS ignores the print dialog (nothing
  opens, nothing fails). There the button makes a PDF in the phone instead
  ([`src/modules/export/pdf.ts`](src/modules/export/pdf.ts)): the same page drawn on a
  canvas, page by page, with [pdf-lib](https://pdf-lib.js.org), and opens the share
  sheet with it, which offers Print, Save to Files and WhatsApp. The PDF is made when the
  page opens, since the share sheet only opens straight from a tap.

## Installing on a phone

OurBasket installs as an app (a PWA, spec 13): it gets its own icon on the home screen
and opens in its own window, without the browser's bar.

- **Android (Chrome):** open the site, then the menu (⋮) → "Install app" (or "Add to home
  screen"). Chrome may also offer it in a banner.
- **iPhone (Safari):** open the site, then Share (the square with an arrow) → "Add to Home
  Screen" → "Add". The iPhone never offers it by itself.

It still needs the internet: there is no offline mode, and without a connection a notice
says so.

**The logo:** [`public/logo.svg`](public/logo.svg) is the only source. The favicon is the
SVG itself; every PNG (the 32×32 favicon, 192 and 512, the maskable 192 and 512 that
Android crops to its own shape, and the iPhone's 180) is made from it by
[`src/app/icons/[name]/route.tsx`](src/app/icons/[name]/route.tsx), at build time. To
change the logo, replace the SVG: keep its background the brand color, and the drawing
within the middle 80% circle. The manifest is
[`src/app/manifest.ts`](src/app/manifest.ts).

## Real-time sync

Both phones stay current (spec 12):

- After every saved change, the server sends `list-changed` with the new revision on the
  private channel `private-ourbasket` (after the response, so it never slows an action).
  The event carries no data: the other phone reloads the page from the server.
- Only a signed-in, allowed user may listen: Pusher asks
  [`/api/pusher/auth`](src/app/api/pusher/auth/route.ts), which checks the session.
- Events aren't relied on: the app also reloads when it becomes visible again, when the
  internet comes back, and when the Pusher channel is joined (at first and after every
  reconnect). Requests at the same moment become one reload; one soon after a reload
  waits a second, then reloads again.
  An open form keeps what was typed.
- Without an internet connection, a notice says the app needs one.

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
- Every server action is called without permission and must send the caller to /login
  without changing anything ([`tests/integration/actions-auth.test.ts`](tests/integration/actions-auth.test.ts)):
  a new action fails it until it's added there.

[`docs/acceptance.md`](docs/acceptance.md) lists each acceptance criterion (spec §20)
with the tests that check it, and what is checked by hand on production.

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

## Deployment

[Vercel](https://vercel.com) (Hobby) runs the app; [Neon](https://neon.tech) (Free) is
the database, both in Frankfurt. The free tiers' limits, and how far we are from them,
are in [`docs/free-tier-limits.md`](docs/free-tier-limits.md).

- [`vercel.json`](vercel.json): functions in `fra1` (Frankfurt, next to Neon), and the
  build command `npm run vercel-build`.
- [`scripts/vercel-build.mjs`](scripts/vercel-build.mjs) builds the app and then, in
  Production only, runs `prisma migrate deploy` and the seed (safe to run again). A
  broken build never touches the database; a failed migration fails the deployment, and
  the previous one keeps serving. Migrations must therefore work with the code already
  running.
- Production: **https://ourbasket-kohl.vercel.app** (Vercel project `ourbasket`).
- Every push to `main` deploys to Production. `main` only takes Pull Requests whose CI
  passed, and a Vercel Deployment Check holds the new version until the CI check
  "Lint, types, tests and build" passes on `main` too.
- Every Pull Request gets a Preview deployment, with its own database (a Neon branch), never
  the Production one. Google sign-in doesn't work there (its URL changes), so only the
  login and privacy pages can be checked; sign-in is checked locally and in Production.
- [`/api/health`](src/app/api/health/route.ts) answers `{"status":"ok"}` when the app
  reaches the database, and 503 otherwise.

One-time setup:

1. **Neon:** a project `ourbasket`, Postgres 16, region `aws-eu-central-1` (Frankfurt).
   Its default branch, `production`, is Production. Copy the pooled connection string
   (host contains `-pooler`) for `DATABASE_URL` and the direct one for `DIRECT_URL`.
2. **Google Cloud** (project "OurBasket"): a second OAuth client, "OurBasket
   production", with the JavaScript origin `https://ourbasket-kohl.vercel.app` and the
   redirect URI `https://ourbasket-kohl.vercel.app/api/auth/callback/google`. Branding:
   home page `/login`, privacy policy `/privacy`, authorized domain
   `ourbasket-kohl.vercel.app`, no logo (a logo needs Google's verification). Publish the
   app ("In production"). Google shows a client secret only once, when it's created; to
   replace one, "Add secret", update `GOOGLE_CLIENT_SECRET` in Vercel, redeploy, check
   sign-in, then disable and delete the old secret.
3. **Pusher:** a separate Channels app for Production (cluster `eu`), so local tests
   never send events to the phones.
4. **Vercel:** import the GitHub repository (framework Next.js, Node.js 24), and set the
   Production variables from [`.env.example`](.env.example): the Neon strings,
   `BETTER_AUTH_URL` (the app's URL), a new `BETTER_AUTH_SECRET`, the two
   `USER_EMAIL_*`, the production Google client, and the production Pusher app.
5. After the first deploy: a Neon branch `preview` (from `production`, with its data, so
   it has the tables and the default categories; auto-delete: never). In its SQL Editor,
   `DELETE FROM "user"; DELETE FROM "verification";` removes the copied accounts and
   sessions. A branch also copies the database roles with their passwords, so reset the
   `ourbasket_owner` password on `preview` (Roles; this branch only). The Preview
   variables are its connection strings and a separate `BETTER_AUTH_SECRET` (Better Auth
   refuses to start without one, even on the login page). Preview doesn't inherit the
   Production variables, and the Production secret stays Production-only.
6. Vercel > Settings > Build and Deployment > Deployment Checks: add the GitHub check
   "Lint, types, tests and build".

## Project structure

```
src/
  app/                 routes: (app)/ = signed-in pages (list, history, settings,
                       with the navigation), login/, privacy/, print/, api/auth
                       (Better Auth), api/pusher, icons/ (made from the logo),
                       manifest.ts
  components/          providers (Chakra, Emotion), toasts, shared dialog styles
  config/              app.config.ts and the contrast helper
  i18n/                next-intl setup (one fixed locale)
  lib/                 Prisma client, Better Auth server and client, name normalization
  modules/             domain logic: export/ (what is exported, WhatsApp text),
                       realtime/ (Pusher events and permission),
                       auth/ (allowlist, hooks, current user),
                       categories/ (validation, database actions, seed),
                       products/ (validation, database actions),
                       list/ (revision, snapshot, how the screen shows it),
                       history/ (update list, reading, adding back, deleting)
  proxy.ts             redirects to /login when there is no session cookie
  generated/           Prisma client (generated, not in git)
public/logo.svg        the logo, source of every icon
messages/he.json       all UI text
prisma/                schema, migrations, seed script
docker/                local database setup
tests/integration/     tests against the test database
tests/e2e/             Playwright tests and helpers (accessibility, touch targets)
```
