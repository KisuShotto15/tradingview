// Loaded via `node --import ./test/register.mjs` before any test module. Applies
// main-thread polyfills and registers the resolution hook (alias + extensions).
import { register } from "node:module";
import "./polyfill.mjs";

register("./resolve-hooks.mjs", import.meta.url);
