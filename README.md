# JobGuard Web (React)

A local web app that vets companies and job postings for scam signals using the Anthropic API. It runs in your browser, keeps all data on your machine, and has no backend.

Companion projects: the JobGuard Chrome extension (separate repo) and an unfinished Android app.

## Features

- **Vet:** enter a company name, an optional homepage URL and role. The app returns a risk level, a recommendation, red and green flags, company intel and verification steps. The summary shows the company and its home website: the URL you typed, or the website the AI knows, labelled as AI suggested so you can verify it yourself. The website is saved with each record.
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

## Git operations

Commands are for PowerShell, run from the project root folder. Any terminal works as long as it is in that folder: the VS Code terminal (Terminal > New Terminal, opens in the project root), a standalone PowerShell or Windows Terminal window (`cd` to the project folder first), or Command Prompt or Git Bash (same commands, except `Add-Content` is PowerShell only). Check with `pwd` before running git.

This repo is `https://github.com/tony-tran-qa/My_JobGuard_ReactApp`, branch `main`.

### First-time setup (already done for this repo)

| Command | When to use it |
|---|---|
| `git init` | Once, in a new project folder, to start tracking it. |
| `git add .` | Stage every change. Files matched by `.gitignore` are skipped. |
| `git status` | Always before committing. Check that no `jobguard-*.json`, `.bak` or `results` files are listed. |
| `git commit -m "message"` | Save the staged changes as a commit. |
| `git branch -M main` | Rename the default branch from `master` to `main` (once, before the first push). |
| `git remote add origin <url>` | Link the local folder to the GitHub repo (once). |
| `git push -u origin main` | First push. Sets `main` to track `origin/main`. |

### Everyday changes

| Command | When to use it |
|---|---|
| `git status` | See what changed and what is staged. |
| `git diff` | See the exact line changes before staging. |
| `git add <file>` | Stage one file instead of everything. |
| `git commit -m "message"` | Commit after staging. |
| `git push` | Send commits to GitHub (after the first push no extra arguments are needed). |
| `git pull` | Get changes from GitHub. Run it before starting work if you edit from more than one machine. |
| `git log --oneline` | Review recent commits. |

### Stop tracking a file but keep it on disk

Use this when a file was committed by mistake or should now be ignored (personal data, editor config, backups):

```
git rm --cached <file>
Add-Content .gitignore "<file>"
git add .gitignore
git commit -m "Untrack <file>"
git push
```

Use `git rm --cached -r <folder>` for a folder. Adding a name to `.gitignore` alone does not untrack a file that is already committed. Use `git rm <file>` (no `--cached`) to delete a file from both git and disk. Anything already pushed stays in the commit history.

### Check what is ignored

```
git check-ignore -v <file>
```

Use it to confirm which `.gitignore` rule is hiding a file, for example the personal data files `jobguard-*.json`.

## Known warnings and errors

Things that look alarming but are expected or easy to fix.

| Message | Meaning | What to do |
|---|---|---|
| `warning: in the working copy of '<file>', LF will be replaced by CRLF the next time Git touches it` | Windows line endings. The repo stores LF and Git converts to CRLF in your working folder. Common on every `git add` on Windows. | Nothing. It is harmless and does not change the content. To silence it: `git config core.autocrlf true`. |
| Branch is called `master` after `git init` | Older Git default. GitHub repos here use `main`. | `git branch -M main` before the first push. |
| Browser sign-in window opens on first `git push` | Git Credential Manager asks for GitHub login. | Sign in as `tony-tran-qa`. The push then continues. |
| A file is still tracked after adding it to `.gitignore` | `.gitignore` only affects untracked files. | See "Stop tracking a file but keep it on disk" above. |
| `remote origin already exists` | The remote was already added. | `git remote set-url origin <url>` to change it. |
| `Updates were rejected` or `fetch first` on push | GitHub has commits you don't have locally (for example a README created on the site). | `git pull --rebase`, then `git push`. |
| GitHub repo page has no About gear | The About box only appears once the repo has a first commit. | Push first, then edit the description on the repo page. |
