import fs from "node:fs";
import path from "node:path";

let loaded = false;

export function ensureLocalEnvLoaded() {
  if (loaded) {
    return;
  }

  loaded = true;
  for (const envPath of candidateEnvPaths()) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const contents = fs.readFileSync(envPath, "utf8");
    applyEnvContents(contents);
  }
}

function candidateEnvPaths() {
  return uniquePaths([
    process.env.MNEMONIC_ENV_PATH,
    path.resolve(process.cwd(), ".env"),
    process.resourcesPath ? path.resolve(process.resourcesPath, ".env") : undefined,
    process.execPath ? path.resolve(path.dirname(process.execPath), ".env") : undefined
  ]);
}

function applyEnvContents(contents: string) {
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function uniquePaths(paths: Array<string | undefined>) {
  return Array.from(new Set(paths.filter((value): value is string => Boolean(value))));
}
