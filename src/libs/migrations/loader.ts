import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { MigrationFile } from "./types.ts";

/**
 * Charge les fichiers .sql d'un dossier, en les triant par nom (ordre lexicographique).
 * Ne lit pas process.env ; le chemin est fourni en paramètre.
 */
export async function loadSqlFiles(dir: string): Promise<MigrationFile[]> {
  const absDir = resolve(dir);
  const entries = await readdir(absDir);
  const sqlFiles = entries
    .filter((e) => e.endsWith(".sql"))
    .sort(); // ordre lexicographique : 001_xxx < 002_xxx

  const files: MigrationFile[] = [];
  for (const name of sqlFiles) {
    const filePath = join(absDir, name);
    const sql = await readFile(filePath, "utf-8");
    files.push({ name, path: filePath, sql });
  }
  return files;
}
