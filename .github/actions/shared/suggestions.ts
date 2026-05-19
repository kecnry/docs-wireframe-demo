/**
 * Push suggested changes to a new branch and open a PR.
 * Generic version that works for both wireframe and docs review.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { AnalysisResult } from './comment';

export interface SuggestionPRResult {
  /** URL of the created suggestion PR, or null if none created */
  prUrl: string | null;
  /** Branch name of the suggestion PR */
  branch: string | null;
  /** Error message if creation failed */
  error: string | null;
}

export interface SuggestionConfig {
  /** Branch name prefix (e.g., "wireframe-suggestions" or "docs-suggestions") */
  branchPrefix: string;
  /** PR title prefix (e.g., "🖼️ Wireframe updates" or "📝 Docs updates") */
  titlePrefix: string;
  /** Commit message prefix (e.g., "wireframe-review" or "docs-review") */
  commitPrefix: string;
}

/**
 * Apply suggested changes by creating a branch and opening a PR.
 */
export async function pushSuggestions(
  token: string,
  results: AnalysisResult[],
  config: SuggestionConfig,
): Promise<SuggestionPRResult> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  // Support both pull_request and issue_comment triggers
  const pr = github.context.payload.pull_request;
  const issueNumber = github.context.payload.issue?.number;
  const prNumber = pr?.number ?? issueNumber;

  if (!prNumber) {
    return { prUrl: null, branch: null, error: 'Could not determine PR number' };
  }

  // For issue_comment, we need to fetch PR details from the API
  let prHeadRef: string;
  let prHeadSha: string;
  if (pr) {
    prHeadRef = pr.head.ref as string;
    prHeadSha = pr.head.sha as string;
  } else {
    const { data: prData } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
    prHeadRef = prData.head.ref;
    prHeadSha = prData.head.sha;
  }

  // Collect all file changes with replacements
  const changesWithReplacements = results
    .filter(r => r.needsUpdate && r.changes)
    .flatMap(r => r.changes!)
    .filter(c => c.replacements && c.replacements.length > 0);

  if (changesWithReplacements.length === 0) {
    core.info('No actionable replacements from LLM — skipping suggestion PR.');
    return { prUrl: null, branch: null, error: null };
  }

  const suggestionBranch = `${config.branchPrefix}/pr-${prNumber}`;

  try {
    // Create the suggestion branch from the PR head
    try {
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${suggestionBranch}`,
        sha: prHeadSha,
      });
    } catch (err: unknown) {
      // Branch may already exist from a previous run — update it
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('Reference already exists')) {
        await octokit.rest.git.updateRef({
          owner,
          repo,
          ref: `heads/${suggestionBranch}`,
          sha: prHeadSha,
          force: true,
        });
      } else {
        throw err;
      }
    }

    // Group changes by file to batch replacements
    const fileChanges = new Map<string, Array<{ search: string; replace: string }>>();
    for (const change of changesWithReplacements) {
      const existing = fileChanges.get(change.file) || [];
      existing.push(...change.replacements!);
      fileChanges.set(change.file, existing);
    }

    // Apply changes to each file
    const treeEntries: Array<{
      path: string;
      mode: '100644';
      type: 'blob';
      sha: string;
    }> = [];

    for (const [filePath, replacements] of fileChanges) {
      // Get current file content from the PR branch
      let content: string;
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: prHeadSha,
        });
        if ('content' in data && data.encoding === 'base64') {
          content = Buffer.from(data.content, 'base64').toString('utf-8');
        } else {
          core.warning(`Could not read ${filePath} — skipping`);
          continue;
        }
      } catch {
        core.warning(`File ${filePath} not found on PR branch — skipping`);
        continue;
      }

      // Apply each replacement
      let modified = content;
      let appliedCount = 0;
      for (const { search, replace } of replacements) {
        if (modified.includes(search)) {
          modified = modified.replace(search, replace);
          appliedCount++;
        } else {
          core.warning(`Replacement search text not found in ${filePath} — skipping one replacement`);
        }
      }

      if (appliedCount === 0 || modified === content) {
        core.info(`No replacements applied to ${filePath} — skipping`);
        continue;
      }

      // Create a blob for the modified content
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: Buffer.from(modified).toString('base64'),
        encoding: 'base64',
      });

      treeEntries.push({
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      });
    }

    if (treeEntries.length === 0) {
      core.info('No replacements could be applied — skipping suggestion PR.');
      // Clean up the branch
      try {
        await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${suggestionBranch}` });
      } catch { /* ignore */ }
      return { prUrl: null, branch: null, error: null };
    }

    // Create a tree with the modified files
    const { data: tree } = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: prHeadSha,
      tree: treeEntries,
    });

    // Create a commit
    const { data: commit } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: `${config.commitPrefix}: suggested updates for PR #${prNumber}`,
      tree: tree.sha,
      parents: [prHeadSha],
    });

    // Update the suggestion branch to the new commit
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${suggestionBranch}`,
      sha: commit.sha,
    });

    // Create or update the suggestion PR
    let prUrl: string;
    const existingPRs = await octokit.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${suggestionBranch}`,
      base: prHeadRef,
      state: 'open',
    });

    if (existingPRs.data.length > 0) {
      prUrl = existingPRs.data[0].html_url;
      core.info(`Updated existing suggestion PR: ${prUrl}`);
    } else {
      const { data: newPR } = await octokit.rest.pulls.create({
        owner,
        repo,
        title: `${config.titlePrefix} for PR #${prNumber}`,
        body: `Automated update suggestions for #${prNumber}.\n\nGenerated by review action. Review and merge into \`${prHeadRef}\` if the changes look correct.`,
        head: suggestionBranch,
        base: prHeadRef,
      });
      prUrl = newPR.html_url;
      core.info(`Created suggestion PR: ${prUrl}`);
    }

    return { prUrl, branch: suggestionBranch, error: null };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    core.warning(`Failed to create suggestion PR: ${errorMsg}`);
    return { prUrl: null, branch: null, error: errorMsg };
  }
}
