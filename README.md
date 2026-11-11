# OurBasket

A shared shopping list for two people (Dor and Maayan), in Hebrew and right-to-left.
One list, edited from any device, synced in real time, with categories, checked items,
purchase history and export to WhatsApp text or a printable page.

> **Status:** Step 1 (project setup) is done: Next.js, Chakra UI in RTL, Hebrew text,
> tests and CI. Next: the database (step 2). See [`OurBasketSpec.md`](OurBasketSpec.md)
> for the full spec and the decision log (Hebrew).

## Tech stack

| Area     | Choice                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| App      | [Next.js 16](https://nextjs.org) (App Router, Cache Components), React 19, TypeScript (strict)                                     |
| UI       | [Chakra UI 3](https://chakra-ui.com), Hebrew text via [next-intl](https://next-intl.dev)                                           |
| Tests    | [Vitest](https://vitest.dev), [Playwright](https://playwright.dev), [axe-core](https://github.com/dequelabs/axe-core)              |
| Planned  | PostgreSQL 16 + [Prisma 7](https://www.prisma.io), [Better Auth](https://www.better-auth.com), [Pusher Channels](https://pusher.com) |
| Hosting  | [Vercel](https://vercel.com) (Frankfurt) + [Neon](https://neon.tech) (Frankfurt) — from step 11                                    |

## Running locally

**Requirements:** Node.js 24, npm, and Google Chrome (for the end-to-end tests).
Docker Desktop is needed from step 2 (local database).

```bash
npm install
npm run dev                # http://localhost:3000
```

`.env.example` lists the environment variables the later steps need. Copy it to `.env`
when they are in use; step 1 needs none.

## Configuration

Settings that aren't secret live in [`src/config/app.config.ts`](src/config/app.config.ts):
language and direction (`he`, `rtl`), time zone (`Asia/Jerusalem`), the theme color, the
two users, the 12-color palette, the default categories (emoji and color) and the
limits (names up to 60 characters, quantities 1–999). All UI text is in
[`messages/he.json`](messages/he.json).

Secrets and emails are environment variables only: see [`.env.example`](.env.example).

## Tests

```bash
npm test                   # unit tests (Vitest)
npm run test:e2e           # production build + Playwright in Chrome, on port 3200
```

- End-to-end tests run on a desktop browser and on a phone-sized one (Pixel 7); tests
  for both are tagged `@mobile`.
- Every test fails on any browser console error.
- Each screen is scanned with axe-core (WCAG 2.1 A and AA), and on the phone every
  tappable element must be at least 44×44 pixels.

Other checks: `npm run lint`, `npm run typecheck`, `npm run format:check`
(`npm run format` fixes formatting).

## CI

[GitHub Actions](.github/workflows/ci.yml) runs formatting, lint, types, the unit tests,
the build and the end-to-end tests on every push and on every Pull Request into `main`.

## Workflow

`main` is protected: every step goes through its own branch (for example
`step-1-project-setup`) and a Pull Request.

## Project structure

```
src/
  app/                 routes (layout, pages), icon.svg
  components/          providers (Chakra, Emotion)
  config/              app.config.ts and the contrast helper
  i18n/                next-intl setup (one fixed locale)
messages/he.json       all UI text
tests/e2e/             Playwright tests and helpers (accessibility, touch targets)
```
