@AGENTS.md

## Language

- All application UI strings are in **English**.
- Code comments and identifiers in English (consistent with UI).
- Commit messages and PR descriptions in **neutral Spanish** (no Argentine/Rioplatense slang: avoid "vos", "tenés", "querés", "andá", "che", etc.). Use "tú", "tienes", "quieres", "ve", "aquí".
- README and developer-facing docs can stay in Spanish (they're not part of the app UI).

## Drawing tools architecture

All chart drawings (trendlines, fibs, rays, channels, long/short positions, horizontal/vertical lines, price/date ranges) live in `src/lib/drawings/` and `src/components/chart/drawings/`. They are:

- Rendered as **SVG overlay** on top of lightweight-charts (not via Primitive API).
- Stored in a dedicated Zustand store (`src/lib/store/drawings-store.ts`).
- Persisted to Supabase table `user_drawings` (one row per drawing, `data JSONB`, `kind` discriminator).
- Mutated only through actions that push to an undo/redo history stack.

The data model is a **discriminated union** by `kind`. All operations (render, hit-test, drag, serialize) `switch (drawing.kind)`.

## Keyboard shortcuts

Centralized in `src/hooks/useKeyboardShortcuts.ts`. The chart-level handler is global (`window`), guarded against input elements.

| Key | Action |
|---|---|
| `Esc` | Cancel current placement → reset tool → deselect |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Del` / `Backspace` | Delete selected drawing |
