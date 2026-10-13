# Phase 02 — Extract tokens (light + dark, adaptive → `tokens.json`)

Turn the codebase's design tokens into a normalized `{ light, dark }` object. **Both themes are always
present** — dark falls back to light when the source has no dark variant.

Announce: `Sync-DSH: extract — tokens (light+dark)`.

## Command (consumes `signals.json` from Phase 01)
```
node <skill>/scripts/ods-extract-tokens.js --root <repo> \
  --signals .design-sync/signals.json --out .design-sync/tokens.json
```
Parses `:root{}`, Tailwind `@theme{}`, `.dark{}` and `[data-theme="dark"]{}` blocks, and merges a
`tokens.json` color map if present. Dark starts from light then applies dark overrides.

## `--signals` is real
When the signals file parses and lists `tokenSources`, **only those files are scanned first**. The full
repo re-walk is the fallback — it runs only when there are no pinned sources or the pinned scan yields
zero tokens. So pinning `tokenSources` (in `signals.json`, or via the config's `tokenSources` which detect
folds in) is the lever to scope extraction away from vendored/irrelevant CSS. Extractor dispatch is
otherwise unchanged.

## Output shape (`tokens.json`)
```json
{ "light": { "color": { "bg": "#ffffff", "fg": "#111111" } },
  "dark":  { "color": { "bg": "#000000", "fg": "#111111" } },
  "meta":  { "source": "css|token-file" } }
```

## Adaptivity (three source shapes it handles)
- **css-vars:** `:root` → light; `.dark` overrides → dark (unset keys inherit light).
- **token-file:** a `tokens.json` `color` map merges into light; `meta.source = "token-file"`.
- **no dark:** light-only source still emits both keys (`dark` = copy of `light`).

## Escalate on ambiguity
Non-standard sources (SCSS maps, `theme.ts`, inline styles) → dispatch the **`sync-dsh-extractor`** subagent; use
its `{light,dark}` JSON as `tokens.json`.

## DONE-gate
Phase 02 is DONE only when `.design-sync/tokens.json` exists with **both** `light.color` and `dark.color`
non-empty, the report `.design-sync/reports/02-extract.md` exists, and the JSON parses. A single-theme or
empty token file is NOT done.
