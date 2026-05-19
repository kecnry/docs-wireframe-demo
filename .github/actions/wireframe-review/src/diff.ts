/**
 * Wireframe-specific diff collection.
 * Wraps the shared diff module with wireframe-relevant extensions.
 */

import { collectDiff as collectDiffShared } from '../../shared/diff';

// Re-export types for convenience
export type { ChangedFile, DiffResult } from '../../shared/diff';

/** File extensions relevant to wireframe demos */
const WIREFRAME_RELEVANT_EXTENSIONS = new Set([
  '.vue', '.html', '.css', '.scss', '.less',
  '.js', '.ts', '.jsx', '.tsx',
  '.rst',
]);

export interface WireframeCollectDiffOptions {
  token: string;
  sourceRoot: string;
  wireframeArtifactPaths: string[];
  watchPatterns?: string[];
  maxDiffSize: number;
}

/**
 * Collect PR diff for wireframe review.
 */
export async function collectDiff(options: WireframeCollectDiffOptions) {
  const { wireframeArtifactPaths, ...rest } = options;
  
  // Map wireframe terminology to shared module
  const result = await collectDiffShared({
    ...rest,
    trackedArtifactPaths: wireframeArtifactPaths,
    relevantExtensions: WIREFRAME_RELEVANT_EXTENSIONS,
  });

  // Map result back to wireframe terminology
  return {
    ...result,
    wireframeFiles: result.trackedFiles,
  };
}
