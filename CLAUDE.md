# CLAUDE.md — Jobguard

## Project Overview
AI-powered job application tracking and protection tool.
Stack: React 19, Vite 7, Node.js. Single-page app.

## Dev Commands
```
npm run dev       # start Vite dev server (localhost:5173)
npm run build     # production build → dist/
npm run preview   # preview production build
npm run lint      # ESLint check
```

## Project Structure
```
src/
  App.jsx         # root component — all app logic currently here
  main.jsx        # React 19 entry, mounts to #root
  assets/         # static assets
public/           # Vite public dir
index.html        # Vite HTML entry
vite.config.js    # Vite config with React plugin
```

## Conventions
- React 19 functional components only. No class components.
- No `<form>` tags — use onClick/onChange event handlers.
- Tailwind is NOT installed — use plain CSS or inline styles.
- ESLint is configured — run lint before considering a feature done.
- Single file preferred — don't split into multiple files unless component > ~150 lines or clearly reusable.

## Anthropic API Usage
- Always include a user-facing API key input field in any AI-powered feature.
- Never hardcode or assume an injected API key.
- Use `claude-haiku-4-5-20251001` as the model (the Sonnet 4 model was retired). Max tokens: 900 for vetting.
- Handle `AuthenticationError` (401) and `RateLimitError` (429) explicitly.

## State Management
- useState/useReducer only — no Redux, no Zustand yet.
- The app persists to localStorage (blacklist, records, favorites, agencies, cache, API key). Keep keys prefixed `jg_`.
- User data never goes in git. Backup files are listed in .gitignore.

## Do Not
- Install heavy dependencies without asking first.
- Use class components or legacy React patterns.
- Use `<form>` tags.
- Use `python3` or bash commands — this is a Node.js project on Windows (run commands in PowerShell).
