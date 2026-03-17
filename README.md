# Python Dojo Web

Python Dojo Web is a browser-only Python practice app built for learning by doing.

It runs entirely in the browser using:
- **Pyodide** for Python execution
- **Monaco Editor** for the coding experience
- **localStorage** for progress persistence

That means:
- no backend required
- runs locally in a browser
- easy to host publicly
- simple to share with other learners

## Features

- interactive Python katas
- Monaco editor
- in-browser Python execution
- autosaved progress and drafts
- export/import progress
- skill progression with unlocks
- GitHub Pages deployment path

## Quick start locally

Because this app loads browser modules and assets, run it through a small static web server instead of opening `index.html` directly.

### Option 1: Python

```bash
cd python-dojo-web
python3 -m http.server 8080
```

Open:

```text
http://127.0.0.1:8080
```

### Option 2: Node

```bash
cd python-dojo-web
npx serve .
```

## Project structure

```text
python-dojo-web/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── .gitignore
├── .nojekyll
├── 404.html
├── index.html
├── README.md
├── content/
│   └── lessons.json
└── static/
    ├── app.js
    └── styles.css
```

## Progress storage

Progress is stored in the browser using `localStorage`.

Stored data includes:
- completed lessons
- attempts
- saved drafts
- bookmarked/current lesson

Use the in-app export/import buttons to move progress between devices.

## GitHub Pages deployment

This repo includes a GitHub Actions workflow:

```text
.github/workflows/deploy-pages.yml
```

### First-time setup

1. Create a new GitHub repo
2. Push this repo to GitHub
3. Open **Settings → Pages**
4. Set **Source** to **GitHub Actions**
5. Push changes to `main`

The site will deploy automatically.

## Create and push a GitHub repo

If you use the GitHub CLI:

```bash
cd python-dojo-web
git add .
git commit -m "Initial commit"
gh repo create python-dojo-web --public --source=. --remote=origin --push
```

If you create the repo manually on GitHub first:

```bash
cd python-dojo-web
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:YOUR-USERNAME/python-dojo-web.git
git push -u origin main
```

Then enable **GitHub Actions** in **Settings → Pages**.

## Editing lessons

Lessons live in:

```text
content/lessons.json
```

Each lesson contains:
- metadata
- starter code
- hidden checks
- hints

That makes it easy to grow the curriculum without rewriting app logic.

## Limits of this version

- Python runs in the browser, so this is best for learning exercises rather than heavy package workflows
- progress is browser-local unless exported/imported
- curriculum quality matters more than framework complexity

## Next good upgrades

- more lessons and project tracks
- nicer landing/branding
- streaks and achievements
- richer execution visualizations
- optional cloud sync
