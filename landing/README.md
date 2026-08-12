# Flowkite landing site

The marketing page for [Flowkite](https://github.com/itsnevu/Flowkite), the open-source
Chrome extension that runs a two-agent system — a **Planner** that works out the approach
and a **Navigator** that reads the page and acts — locally in your browser, with an optional
cheap **Fast** model handling routine steps to cut cost. Hand-written HTML and CSS, a small
three.js scene behind the hero, and Lenis for smooth scrolling. No framework, no CSS toolkit.

## Develop

```bash
cd landing
pnpm install
pnpm dev
```

`pnpm build` type-checks with `tsc --noEmit` and then writes a static bundle to
`landing/dist`; `pnpm preview` serves that bundle locally so you can check the production
output before shipping it. `pnpm type-check` runs the type check on its own.

## Why it lives outside the workspace

The root `pnpm-workspace.yaml` only globs `chrome-extension`, `pages/*` and `packages/*`, so
this directory is deliberately not a workspace member. On its own that is not enough: pnpm
walks *up* from the current directory looking for a workspace root, so `pnpm install` here
would install the root workspace and never create `landing/node_modules`. The empty
`landing/pnpm-workspace.yaml` is a sentinel that stops the walk and makes `landing/` its own
workspace root, with its own lockfile and `node_modules`. That is what keeps three.js and
Lenis out of the extension's dependency graph and its bundle.

Install here separately — a root `pnpm install` will not touch this directory, and this one
will not touch the root.

## Deploy

The build is fully static and `vite.config.ts` sets `base: './'`, so it works from a domain
root or any subpath. Point a static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages,
plain nginx) at `landing/dist`, with `landing` as the base directory and
`pnpm install && pnpm build` as the build command. There is nothing server-side to run.

On Vercel, set the project's Root Directory to `landing`. Vercel still sees the `turbo.json`
at the repository root and would otherwise default the build command to `turbo run build`,
which fails here — `landing/` is its own workspace root with no `turbo.json` and no
`packageManager` field. `landing/vercel.json` pins the install, build and output settings so
that detection never applies.
