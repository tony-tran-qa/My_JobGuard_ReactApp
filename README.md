# JobGuard Web (React)

A local web app that vets companies and job postings for scam signals using the Anthropic API. It runs in your browser, keeps all data on your machine, and has no backend.

Companion projects: the JobGuard Chrome extension (separate repo) and an unfinished Android app.

## Features

- **Vet:** enter a company name, an optional homepage URL and role. The app returns a risk level, a recommendation, red and green flags, company intel and verification steps.
- **Records:** every vetting is saved. Search, filter by risk, recommendation, ownership or firm type, and sort.
- **Favorites:** bookmark companies you want to apply to.
- **Agencies:** list staffing / recruiter and IT consulting firms, so Records can show whether a company is a direct employer. Firms the AI labels as staffing or IT consulting are added automatically.
- **Blacklist:** companies that are blocked before any API call is made.
- **Backup and restore:** each tab exports and imports its own JSON file. Settings has a full backup (`jobguard-all-records.json`) with optional autosave to a folder you choose.

## Requirements

- Node.js 20 or newer
- Chrome or Edge (the autosave folder uses the File System Access API)
- An Anthropic API key (console.anthropic.com)

## Run it

```
npm install
npm run dev
```

Open http://localhost:5173/ in Chrome, go to **Settings** and paste your API key.

Other scripts: `npm run build`, `npm run preview`, `npm run lint`.

## Where your data lives

Everything is stored in the browser's localStorage for `localhost:5173`:
blacklist, records, favorites, agencies, the 24-hour vetting cache and your API key.

- Each browser keeps its own copy. Chrome and the VS Code embedded browser do not share data.
- Clearing Chrome's "cookies and other site data" wipes it. Clearing only cached images and files does not.
- Use **Settings > Choose Backup/Export Folder** and pick a folder outside this project. The app then autosaves `jobguard-all-records.json` there on every change. Chrome may ask you to allow access again after a restart.
- The API key is never exported or backed up.

## Backup files

| File | Where | Contents |
|---|---|---|
| `jobguard-all-records.json` | Settings (Export/Backup All, autosave) | blacklist, records, favorites, agencies |
| `jobguard-blacklist.json` | Blacklist tab | blacklist |
| `jobguard-records.json` | Records tab | records (what the current filter shows) |
| `jobguard-favorites.json` | Favorites tab | favorites |
| `jobguard-agencies.json` | Agencies tab | agencies |

Imports merge into what is already there and never delete anything. All of these files are personal data and are listed in `.gitignore`. Keep them outside the repo.

## How it calls the API

The browser calls `https://api.anthropic.com/v1/messages` directly, using your key and the `anthropic-dangerous-direct-browser-access` header. Model: `claude-haiku-4-5-20251001`. The prompt tells the model it has no internet access, so results come from the model's training knowledge only and a company it doesn't recognise is reported as unverified, not as a scam. Treat the output as a screening aid, not a verdict.

## Project layout

```
src/App.jsx    all app logic and UI
src/main.jsx   React entry point
index.html     Vite entry
```

## Notes

- Vite 7, React 19, ESLint 9. No CSS framework.
- Lint currently reports a few pre-existing `no-empty` errors for empty `catch {}` blocks around localStorage access.
- There are no automated tests in this repo yet.
