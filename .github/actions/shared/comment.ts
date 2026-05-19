/**
 * Format and post/update a PR comment with review results.
 * Generic version that works for both wireframe and docs review.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';

// Generic analysis result interface
export interface AnalysisResult {
  label: string;
  needsUpdate: boolean;
  summary: string;
  changes: FileChange[] | null;
  error: string | null;
}

export interface FileChange {
  file: string;
  description: string;
  diff: string;
  replacements?: FileReplacement[];
}

export interface FileReplacement {
  search: string;
  replace: string;
}

export interface ValidationResult {
  label: string;
  valid: boolean;
  issues: Array<{
    message: string;
    severity: 'error' | 'warning';
    step?: number;
  }>;
}

export interface CommentConfig {
  /** Unique marker to identify bot comments (e.g., "<!-- wireframe-review-bot -->") */
  commentMarker: string;
  /** Data start marker for encoding suggestions (e.g., "<!-- wireframe-suggestions-data:") */
  dataStart: string;
  /** Data end marker (e.g., ":wireframe-suggestions-data -->") */
  dataEnd: string;
  /** Title for the comment (e.g., "🖼️ Wireframe Demo Review") */
  title: string;
  /** Validation section title (e.g., "Step/Selector Validation"), optional */
  validationTitle?: string;
  /** Apply command (e.g., "/wireframe-apply") */
  applyCommand: string;
  /** Footer text */
  footerText: string;
}

export interface CommentOptions {
  /** Whether suggestions were auto-applied */
  autoApplied?: boolean;
  /** URL of the auto-applied suggestion PR */
  appliedPrUrl?: string | null;
}

/**
 * Format the analysis results into a PR comment body.
 */
export function formatComment(
  results: AnalysisResult[],
  config: CommentConfig,
  validationResults?: ValidationResult[],
  options?: CommentOptions,
): string {
  const parts: string[] = [config.commentMarker];
  parts.push(`## ${config.title}\n`);

  // Show validation issues first (if provided)
  const validationIssues = validationResults?.filter(r => !r.valid) ?? [];
  if (validationIssues.length > 0 && config.validationTitle) {
    parts.push(`### ${config.validationTitle}\n`);
    for (const result of validationIssues) {
      parts.push(`**${result.label}**:\n`);
      for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? '❌' : '⚠️';
        const stepRef = issue.step ? `Step ${issue.step}: ` : '';
        parts.push(`- ${icon} ${stepRef}${issue.message}`);
      }
      parts.push('');
    }
  }

  const needsUpdate = results.filter(r => r.needsUpdate);
  const noUpdate = results.filter(r => !r.needsUpdate && !r.error);
  const errors = results.filter(r => r.error);

  if (needsUpdate.length === 0 && errors.length === 0) {
    parts.push('No changes needed for this PR.\n');
    for (const r of noUpdate) {
      parts.push(`- **${r.label}**: ${r.summary}`);
    }
    parts.push(`\n---\n*${config.footerText}*`);
    return parts.join('\n');
  }

  // Items that need updates
  for (const result of needsUpdate) {
    parts.push(`### ${result.label}\n`);
    parts.push(`${result.summary}\n`);

    if (result.changes && result.changes.length > 0) {
      for (const change of result.changes) {
        parts.push(`<details>`);
        parts.push(`<summary>📝 <strong>${change.file}</strong>: ${change.description}</summary>\n`);
        parts.push('```diff');
        parts.push(change.diff);
        parts.push('```\n');
        parts.push('</details>\n');
      }
    }
  }

  // Items that don't need updates
  if (noUpdate.length > 0) {
    parts.push('<details>');
    parts.push(`<summary>✅ ${noUpdate.length} item${noUpdate.length === 1 ? '' : 's'} need no changes</summary>\n`);
    for (const r of noUpdate) {
      parts.push(`- **${r.label}**: ${r.summary}`);
    }
    parts.push('\n</details>\n');
  }

  // Errors
  if (errors.length > 0) {
    const tokenErrors = errors.filter(r => r.error?.includes('too large') || r.error?.includes('token'));
    const otherErrors = errors.filter(r => !r.error?.includes('too large') && !r.error?.includes('token'));

    if (tokenErrors.length > 0) {
      parts.push(`### ⚠️ LLM Context Limit Exceeded\n`);
      parts.push(`${tokenErrors.length} item(s) could not be analyzed because the prompt exceeded the model's token limit.\n`);
      parts.push(`<details>`);
      parts.push(`<summary>How to fix this</summary>\n`);
      parts.push(`The default provider (\`github-models\` with \`gpt-4o\`) has an 8,000 token limit on the free tier.`);
      parts.push(`You can resolve this by:\n`);
      parts.push(`1. **Use a model with a larger context window** — add an \`api-key\` and switch to the \`openai\` or \`anthropic\` provider`);
      parts.push(`2. **Lower \`max-prompt-tokens\`** to more aggressively truncate content (may reduce analysis quality)`);
      parts.push(`\n</details>\n`);
    }

    if (otherErrors.length > 0) {
      parts.push('<details>');
      parts.push(`<summary>⚠️ ${otherErrors.length} item${otherErrors.length === 1 ? '' : 's'} could not be analyzed</summary>\n`);
      for (const r of otherErrors) {
        parts.push(`- **${r.label}**: ${r.error}`);
      }
      parts.push('\n</details>\n');
    }
  }

  const allReplacements = results
    .filter(r => r.needsUpdate && r.changes)
    .flatMap(r => r.changes!)
    .filter(c => c.replacements && c.replacements.length > 0);

  if (allReplacements.length > 0) {
    if (options?.autoApplied && options.appliedPrUrl) {
      parts.push(`\n> 🔀 **Suggestions applied automatically:** ${options.appliedPrUrl}\n> Review and merge the suggestion PR into this branch if the changes look correct.`);
    } else if (!options?.autoApplied) {
      parts.push(`\n> 💡 **To apply these suggestions**, reply to this PR with \`${config.applyCommand}\`.`);
      parts.push('> A new PR will be created with the proposed changes for you to review and merge.\n');
      // Encode replacements as hidden data in the comment
      const data = JSON.stringify(allReplacements.map(c => ({
        file: c.file,
        replacements: c.replacements,
      })));
      parts.push(`${config.dataStart}${Buffer.from(data).toString('base64')}${config.dataEnd}`);
    }
  }

  parts.push(`\n---\n*${config.footerText}*`);

  return parts.join('\n');
}

/**
 * Post or update the review comment on the PR.
 */
export async function postComment(
  token: string,
  body: string,
  hasSuggestions: boolean,
  commentMarker: string,
): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const pullNumber = github.context.payload.pull_request?.number;

  if (!pullNumber) {
    throw new Error('This action must be run on a pull_request event.');
  }

  if (hasSuggestions) {
    // Edit existing comment so suggestions stay consolidated
    const existingComment = await findExistingComment(octokit, owner, repo, pullNumber, commentMarker);
    if (existingComment) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body,
      });
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body,
      });
    }
  } else {
    // No suggestions / errors — new comment for timeline visibility,
    // but skip if the latest bot comment already says the same thing.
    const latest = await findLatestBotComment(octokit, owner, repo, pullNumber, commentMarker);
    if (latest && latest.body === body) {
      core.info('Skipping comment — latest bot comment is identical.');
      return;
    }
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
  }
}

async function findBotComments(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  commentMarker: string,
): Promise<Array<{ id: number; body: string }>> {
  const matches: Array<{ id: number; body: string }> = [];
  let page = 1;
  while (true) {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
      per_page: 100,
      page,
    });

    if (comments.length === 0) break;

    for (const comment of comments) {
      if (comment.body?.includes(commentMarker)) {
        matches.push({ id: comment.id, body: comment.body });
      }
    }

    if (comments.length < 100) break;
    page++;
  }

  return matches;
}

async function findExistingComment(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  commentMarker: string,
): Promise<{ id: number } | null> {
  const all = await findBotComments(octokit, owner, repo, pullNumber, commentMarker);
  return all.length > 0 ? { id: all[0].id } : null;
}

async function findLatestBotComment(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  commentMarker: string,
): Promise<{ id: number; body: string } | null> {
  const all = await findBotComments(octokit, owner, repo, pullNumber, commentMarker);
  return all.length > 0 ? all[all.length - 1] : null;
}

export interface StoredReplacement {
  file: string;
  replacements: Array<{ search: string; replace: string }>;
}

/**
 * Extract stored replacement data from an existing review comment.
 */
export async function extractReplacements(
  token: string,
  pullNumber: number,
  commentMarker: string,
  dataStart: string,
  dataEnd: string,
): Promise<StoredReplacement[]> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const existing = await findExistingComment(octokit, owner, repo, pullNumber, commentMarker);
  if (!existing) return [];

  const { data: comment } = await octokit.rest.issues.getComment({
    owner,
    repo,
    comment_id: existing.id,
  });

  const body = comment.body || '';
  const startIdx = body.indexOf(dataStart);
  const endIdx = body.indexOf(dataEnd);
  if (startIdx === -1 || endIdx === -1) return [];

  const encoded = body.slice(startIdx + dataStart.length, endIdx);
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
  } catch {
    return [];
  }
}
