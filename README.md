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

`npm run dev` generates article data from Markdown before starting Vite.

## Production Build

```bash
npm run build
```

The build generates article data, outputs static files to `dist/`, and creates
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
- Article content: `src/content/writings/*/index.md`
- Article styling: `src/styles/globals.css`
- Article data generation: `scripts/generate-content.mjs`
- Static route generation: `scripts/create-static-routes.mjs`

### Adding a Writing

Create a new folder under `src/content/writings/`. The folder name becomes the
public URL slug.

```text
src/content/writings/cuda-memory-coalescing/
  index.md
  images/
    warp-layout.png
```

Add frontmatter to `index.md`:

```md
---
title: "CUDA Memory Coalescing Notes"
description: "A practical note on global memory access patterns."
date: "2026-06-20"
tags: ["CUDA", "GPU", "Performance"]
draft: false
---

Write the article here.
```

The site automatically updates recent writings, article counts, tag filters,
year grouping, reading time, table of contents, routes, and previous/next links.

Use local images like this:

```md
![Warp memory layout](./images/warp-layout.png)
```

For wide diagrams:

```html
<figure class="wide">
  <img src="./images/warp-layout.png" alt="Warp memory layout" />
  <figcaption>Warp-level memory layout.</figcaption>
</figure>
```

Draft articles are ignored when `draft: true`.

## Notes

Generated output and local-only artifacts are intentionally ignored:

- `dist/`
- `node_modules/`
- `extra/`
- `public/writings/`
- `src/content/generated/`
