/**
 * Docs-specific diff collection.
 * Wraps the shared diff module with docs-relevant extensions.
 */

import { collectDiff as collectDiffShared } from '../../shared/diff';

// Re-export types for convenience
export type { ChangedFile, DiffResult } from '../../shared/diff';

/** File extensions relevant to documentation */
const DOCS_RELEVANT_EXTENSIONS = new Set([
  '.rst', '.md', '.markdown',
  '.py', '.js', '.ts', '.vue',
  '.html', '.css',
  '.json', '.yaml', '.yml',
]);

export interface DocsCollectDiffOptions {
  token: string;
  sourceRoot: string;
  docsArtifactPaths: string[];
  watchPatterns?: string[];
  maxDiffSize: number;
}

/**
 * Collect PR diff for docs content review.
 */
export async function collectDiff(options: DocsCollectDiffOptions) {
  const { docsArtifactPaths, ...rest } = options;
  
  // Map docs terminology to shared module
  const result = await collectDiffShared({
    ...rest,
    trackedArtifactPaths: docsArtifactPaths,
    relevantExtensions: DOCS_RELEVANT_EXTENSIONS,
  });

  // Map result back to docs terminology
  return {
    ...result,
    docsFiles: result.trackedFiles,
  };
}
