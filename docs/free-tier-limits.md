# Free tiers and their limits

OurBasket runs on free plans only (spec 15.4). This page lists the limits that matter,
checked on 2026-11-21, and what two people using a shopping list actually need. Plans
change: check the providers' pages before relying on a number.

## Summary

| Service        | Plan          | The limit that could matter                                | Our use (estimate)                     |
| -------------- | ------------- | ---------------------------------------------------------- | -------------------------------------- |
| Vercel         | Hobby         | 1M function invocations, 4 h active CPU, 100 GB a month    | A few thousand requests a month        |
| Neon           | Free          | 100 CU-hours of compute, 1 GB storage per project          | Tens of hours; a few MB                |
| Pusher         | Sandbox       | 200,000 messages a day, 100 concurrent connections         | Tens of messages a day; 2–4 connections |
| GitHub Actions | Public repo   | Free minutes for public repositories                       | About 10 minutes per push              |
| Google OAuth   | Free          | 100 test users while "Testing"; no cost                    | 2 users                                |

Nothing is close to a limit. The first one to watch would be Neon's compute hours, if the
database stopped scaling to zero.

## Vercel (Hobby)

- **Personal, non-commercial use only.** OurBasket is a private list for two people.
- 1,000,000 function invocations, 4 hours of active CPU (time actually computing, not
  waiting for the database) and 360 GB-hours of memory a month. 100 GB of fast data
  transfer a month. A function runs for at most 300 seconds.
- One function region: `fra1` (Frankfurt, [`vercel.json`](../vercel.json)), next to Neon.
- Over a limit, Hobby doesn't bill: the feature stops until the 30-day window resets.
- Sources: [Hobby plan](https://vercel.com/docs/plans/hobby),
  [limits](https://vercel.com/docs/limits).

## Neon (Free)

- Per project: 100 CU-hours of compute a month (a 0.25 CU compute for about 400 hours),
  1 GB of storage, 5 GB of public network transfer. Up to 10 branches.
- The compute scales to zero after 5 minutes without queries (can't be turned off on Free)
  and wakes in a second or so: the first request after a quiet time is a little slower.
  Two people opening a list a few times a day keep it asleep most of the time.
- Over 1 GB, writes that add data fail. The list, categories and history are tiny: years
  of weekly purchases are a few MB.
- Source: [Free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas),
  [pricing](https://neon.com/pricing).

## Pusher Channels (Sandbox)

- 200,000 messages a day and 100 concurrent connections. Each saved change sends one
  message (`list-changed`), delivered to each connected phone (each delivery counts).
- Over the limits Pusher emails first; connections over the cap are refused. The app still
  works without Pusher: the other phone catches up when it comes back to the app.
- Source: [Channels pricing](https://pusher.com/channels/pricing).

## GitHub Actions

- Standard GitHub-hosted runners are free for public repositories. The CI runs on every
  push and Pull Request, about 7–10 minutes each.

## Google sign-in

- Google sign-in (OAuth) costs nothing. The scopes are non-sensitive (`openid email
  profile`), so no Google verification is needed.
- While the consent screen is "Testing", only listed test users (up to 100) can sign in.
  Production publishes it ("In production", as in Our Calendar): any Google account can
  reach the consent screen, and the app's allowlist still lets in only the two emails.
