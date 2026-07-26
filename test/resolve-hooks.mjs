// Node module-resolution hook for `node --test`, giving offline tests the two
// things the TS toolchain provides but the bare Node resolver doesn't:
//   1. the "@/..." path alias  ->  <repo>/src/...
//   2. extensionless imports    ->  add .ts / .tsx / /index.ts
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function tryExtensions(absNoExt) {
  const candidates = [
    absNoExt,
    `${absNoExt}.ts`,
    `${absNoExt}.tsx`,
    `${absNoExt}.mjs`,
    `${absNoExt}.js`,
    path.join(absNoExt, "index.ts"),
    path.join(absNoExt, "index.tsx"),
  ];
  return candidates.find(isFile) ?? null;
}

export async function resolve(specifier, context, nextResolve) {
  // 1. "@/x" alias
  if (specifier.startsWith("@/")) {
    const resolved = tryExtensions(path.join(SRC, specifier.slice(2)));
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }

  // 2. relative extensionless imports
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    const abs = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (!isFile(abs)) {
      const resolved = tryExtensions(abs);
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
