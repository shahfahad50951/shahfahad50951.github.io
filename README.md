# Shah Fahad Personal Website

Source code for my personal website and technical writing archive focused on
CUDA, GPU systems, LLM inference, profiling, and performance engineering.

## Live Site

The site is intended to be deployed with GitHub Pages.

```text
https://<github-username>.github.io/
```

For a project-pages repository, the URL will usually be:

```text
https://<github-username>.github.io/<repository-name>/
```

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- GitHub Pages
- GitHub Actions

## Pages

- `/` - home page with intro, current focus, and recent writings
- `/about/` - professional background, experience, education, and contact
- `/writings/` - writing archive with topic filters
- `/writings/[slug]/` - technical article pages

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

The build outputs static files to `dist/`. The post-build script creates static
route folders so direct GitHub Pages URLs work for nested routes.

## Deployment

Deployment is handled by `.github/workflows/deploy.yml`.

1. Push the repository to GitHub.
2. Open the repository settings.
3. Go to **Pages**.
4. Set **Build and deployment** -> **Source** to **GitHub Actions**.
5. Push to `main`, or run the workflow manually from the **Actions** tab.

The workflow installs dependencies, builds the site, uploads `dist/`, and
deploys it to GitHub Pages.

## Content

- Main site copy and layout: `src/app/App.tsx`
- Article content: `src/content/writings.json`
- Article styling: `src/styles/globals.css`
- Static route generation: `scripts/create-static-routes.mjs`

## Notes

Generated output and local-only artifacts are intentionally ignored:

- `dist/`
- `node_modules/`
- `extra/`
