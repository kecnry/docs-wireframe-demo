/**
 * Collect and filter PR diffs using the GitHub API.
 * Generic version that works for both wireframe and docs review.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { minimatch } from 'minimatch';

export interface ChangedFile {
  filename: string;
  status: string;
  patch: string | undefined;
}

export interface DiffResult {
  /** All changed files in the PR */
  allFiles: ChangedFile[];
  /** Files filtered to the source root / watch patterns */
  relevantFiles: ChangedFile[];
  /** Files that are tracked artifacts (docs/wireframes) themselves */
  trackedFiles: ChangedFile[];
  /** Formatted diff string for the LLM, within the token budget */
  formattedDiff: string;
}

/**
 * Fetch the list of changed files in the current PR.
 */
async function fetchChangedFiles(token: string): Promise<ChangedFile[]> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const pullNumber = github.context.payload.pull_request?.number;

  if (!pullNumber) {
    throw new Error('This action must be run on a pull_request event.');
  }

  const files: ChangedFile[] = [];
  let page = 1;

  // Paginate through all changed files
  while (true) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
      page,
    });

    if (data.length === 0) break;

    for (const file of data) {
      files.push({
        filename: file.filename,
        status: file.status,
        patch: file.patch,
      });
    }

    if (data.length < 100) break;
    page++;
  }

  return files;
}

/**
 * Check if a file is relevant for analysis based on extension.
 * Can be customized per action type.
 */
export function isRelevantExtension(filename: string, relevantExtensions: Set<string>): boolean {
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  return relevantExtensions.has(ext);
}

/**
 * Prioritize and format diffs for the LLM prompt within a character budget.
 */
function formatDiff(
  files: ChangedFile[],
  maxSize: number,
): string {
  // Sort by patch size (smaller first for more coverage)
  const sorted = [...files].sort((a, b) => {
    return (a.patch?.length ?? 0) - (b.patch?.length ?? 0);
  });

  const parts: string[] = [];
  let totalSize = 0;
  const includedFull: string[] = [];
  const summarizedOnly: string[] = [];

  for (const file of sorted) {
    const header = `--- ${file.filename} (${file.status}) ---\n`;
    const patch = file.patch ?? '(binary or too large)';
    const entry = header + patch + '\n\n';

    if (totalSize + entry.length <= maxSize) {
      parts.push(entry);
      totalSize += entry.length;
      includedFull.push(file.filename);
    } else {
      summarizedOnly.push(file.filename);
    }
  }

  // If some files were truncated, add a summary section
  if (summarizedOnly.length > 0) {
    const summary = `\n--- Files changed but diff omitted for size (${summarizedOnly.length} files) ---\n` +
      summarizedOnly.map(f => `  ${f}`).join('\n') + '\n';
    parts.push(summary);
  }

  return parts.join('');
}

export interface CollectDiffOptions {
  token: string;
  sourceRoot: string;
  trackedArtifactPaths: string[];
  watchPatterns?: string[];
  maxDiffSize: number;
  relevantExtensions: Set<string>;
}

/**
 * Collect PR diff, filter to relevant files, and format for the LLM.
 * Generic version that works for both wireframe and docs review.
 */
export async function collectDiff(options: CollectDiffOptions): Promise<DiffResult> {
  const { token, sourceRoot, trackedArtifactPaths, watchPatterns, maxDiffSize, relevantExtensions } = options;

  const allFiles = await fetchChangedFiles(token);

  // Normalize source root for matching
  const normalizedRoot = sourceRoot.replace(/\/$/, '');

  // Filter to relevant files
  const relevantFiles = allFiles.filter(f => {
    // If watch patterns are provided, use those
    if (watchPatterns && watchPatterns.length > 0) {
      return watchPatterns.some(pattern => minimatch(f.filename, pattern));
    }
    // Otherwise filter to source root
    if (normalizedRoot === '.') return true;
    return f.filename.startsWith(normalizedRoot + '/') || f.filename.startsWith(normalizedRoot);
  });

  // Identify tracked artifact files that were changed
  const trackedFiles = allFiles.filter(f =>
    trackedArtifactPaths.some(p => f.filename === p || f.filename.endsWith('/' + p))
  );

  // Merge relevant source files + tracked artifact files (deduplicated),
  // then filter to only relevant extensions
  const seen = new Set(relevantFiles.map(f => f.filename));
  const allRelevant = [...relevantFiles];
  for (const tf of trackedFiles) {
    if (!seen.has(tf.filename)) {
      allRelevant.push(tf);
      seen.add(tf.filename);
    }
  }

  const extensionFiltered = allRelevant.filter(f => isRelevantExtension(f.filename, relevantExtensions));
  const formattedDiff = formatDiff(extensionFiltered, maxDiffSize);

  core.info(`PR has ${allFiles.length} changed files, ${relevantFiles.length} source, ${trackedFiles.length} tracked artifacts`);

  return { allFiles, relevantFiles, trackedFiles, formattedDiff };
}
