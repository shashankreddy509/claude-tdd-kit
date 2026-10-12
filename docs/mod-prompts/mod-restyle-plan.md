# Mod restyle plan (shaped 2026-10-08; BUILT 2026-10-08 as claude-tdd-kit PR #30)

Why: the UI in a public video ("9 NEW Claude Mods") looks far richer; ours is plain text. Restyle
ALL 3 mods (side-panel, cache-keeper, next-steps); desktop MAY look richer than terminal.
Reference frames + transcript: kept outside the repo (agents panel, Cache Tax, Blast radius,
Reflect, Skins, File tree).

## Why theirs look better (verified in their source)
- Desktop rows are hand-built `<Svg source=...>` strings: rounded `rect rx` bars, pills, icons,
  `@keyframes` pulse, dark-mode via `@media (prefers-color-scheme: dark)`, a hex palette.
  Terminal falls back to `Text color={hex}` + block-char bars. Source: the video's public repos.
  Licenses NOT checked: draw our own, copy nothing (kit is public).
- Ours: only Box/Text/Button, ~5 color names, no backgroundColor, no hex, no surface check.
- Elements: terminal = Box Text Button Input Select Link Code Markdown Client Raster Image (no Svg);
  desktop = same minus Raster/Image, plus Svg. Color = ThemeKey | string (hex ok). Box: borderStyle,
  borderColor, backgroundColor. Text: color, backgroundColor, bold, dimColor. Button: variant primary.

## Plan
Step A (terminal + desktop): per-mod palette of 3 theme accents (claude/success/permission), rest
subtle; rounded `borderColor="subtle"` cards, accent border on the card that needs action; filled
chips via `Text backgroundColor`; `━` bars (accent + subtle) for cache warmth and agent progress;
big-number stat tiles; `variant="primary"` on the main button.
Step B (desktop only): `if (e.surface === 'desktop' && 'Svg' in ui)` branch drawing SVG rows:
side-panel agent cards (bar, ✓/●, pulse), cache-keeper draining warmth bar, next-steps pill chips.

Files: mods/{side-panel,cache-keeper,next-steps}/hooks/register.tsx, their tests,
3 plugin.json version bumps. Prover: plugin validate + tsc + tests looped over
['terminal','desktop'], then screenshots in iTerm AND a LOCAL desktop session.

## Also from the video (shape separately, not yet decided)
- Cache Keeper: warn on SEND into a cold cache (ours only toasts before it goes cold) + `/keepwarm`.
- Reflect-style "save this correction" button (= merge-feedback as one click).
- Side panel: cost per sub-agent; File-tree card (touched files, committed = green).
