# Budget Tracker

A clean, fast personal budget tracker that runs entirely in your browser — no
sign-up, no server, no data leaving your computer. Log spending, split paychecks,
schedule bills and biweekly paydays on a calendar, and see where your money goes
with live charts.

![tabs: Dashboard · Add · Calendar · Paycheck · Insights · History · Settings](assets/preview.png)

## Features

- **Quick spending entry** — amount, account, category, done. No bank linking required.
- **Paycheck splitter** — set fixed amounts to specific accounts; the remainder lands
  where you choose.
- **Calendar** — see scheduled bills and paydays on a month grid; tap any day for detail.
- **Recurring bills + biweekly payday** — schedule anything weekly, every 2 weeks,
  monthly, or one-time. Turn on **auto-post** and items record themselves on their due
  date (checked each time you open the app).
- **Budgets** — optional monthly limit per category; progress bars turn amber near the
  limit and red when over.
- **Insights** — income vs spending, category and account breakdowns, and your spending
  pace for the month (Chart.js).
- **Dark mode**, responsive layout, installable to a phone home screen.
- **Local-first** — everything saves to your browser's `localStorage`. Export/import a
  JSON backup anytime.

## Run it

Just open `index.html` in any modern browser (double-click it). To use it like an app
on your phone, open the file's URL and choose **Add to Home Screen**.

## Deploy free (optional)

Because it's static, it works on **GitHub Pages**:

1. Push this folder to a GitHub repo.
2. Repo **Settings → Pages → Source: `main` / root**.
3. Open the published URL. Done.

> Note: hosting it publicly only publishes the *app*, not your data — your numbers stay
> in your own browser.

## Project structure

```
index.html              app shell + markup
assets/css/styles.css   styling + light/dark themes
assets/js/data.js       state, storage, schedule engine, helpers
assets/js/charts.js     Chart.js wrappers
assets/js/app.js        rendering, navigation, actions
How-To-Use.md           plain-English quick start
```

## A note on bank syncing

This app is intentionally local and credential-free, so it does **not** connect to
banks. Automatic bank-transaction import requires a bank-aggregation service (Plaid,
MX, Finicity) **plus a small backend server** to hold API keys securely — that can't
live safely inside a static page. The schedule + auto-post features cover most of the
"set it and forget it" need without sharing any bank logins. See the project notes if
you want to add real syncing later.

## Tech

Vanilla HTML/CSS/JS. One dependency: [Chart.js](https://www.chartjs.org/) via CDN.
No build step.
