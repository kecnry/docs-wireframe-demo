/**
 * Auto-discovery of documentation files in a docs root.
 *
 * Scans for .rst and .md files that contain actual documentation content.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DiscoveredDoc {
  /** Path to the documentation file */
  filePath: string;
  /** Relative path from docs root for labeling */
  relativePath: string;
}

/**
 * Recursively find all documentation files under a directory.
 */
function findDocFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden directories, build outputs, and common non-doc dirs
      if (
        !entry.name.startsWith('.') &&
        !entry.name.startsWith('_') &&
        entry.name !== 'node_modules' &&
        entry.name !== '__pycache__'
      ) {
        results.push(...findDocFiles(fullPath, extensions));
      }
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

export interface DiscoverDocsOptions {
  docsRoot: string;
  repoRoot: string;
}

/**
 * Discover all documentation files in the docs root.
 */
export function discoverDocs(options: DiscoverDocsOptions): DiscoveredDoc[] {
  const { docsRoot, repoRoot } = options;
  const docsRootAbs = path.resolve(repoRoot, docsRoot);

  const extensions = ['.rst', '.md'];
  const docFiles = findDocFiles(docsRootAbs, extensions);

  return docFiles.map(filePath => ({
    filePath,
    relativePath: path.relative(docsRootAbs, filePath),
  }));
}
