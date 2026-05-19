/**
 * Documentation Content Review Action — Entry Point
 *
 * Orchestrates: discover → collect diff → analyze → comment
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import * as path from 'path';
import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import { discoverDocs, DiscoveredDoc } from './discover';
import { collectDiff } from './diff';
import { createLLMClient } from '../../shared/llm';
import { analyzeAll } from './analyze';
import { formatComment, postComment, extractReplacements, CommentConfig } from '../../shared/comment';
import { pushSuggestions, SuggestionConfig } from '../../shared/suggestions';

interface ExplicitConfig {
  docs: Array<{
    file: string;
    context?: string;
    watch?: string[];
  }>;
}

async function run(): Promise<void> {
  try {
    // ── Handle /docs-apply command ─────────────────────────────────
    if (github.context.eventName === 'issue_comment') {
      await handleApplyCommand();
      return;
    }

    // ── Read inputs ────────────────────────────────────────────────
    const docsRoot = path.resolve(core.getInput('docs-root') || 'docs/');
    const sourceRoot = core.getInput('source-root') || '.';
    const configPath = core.getInput('config-path') || '';
    const provider = core.getInput('provider') || 'github-models';
    const model = core.getInput('model') || '';
    const apiKey = core.getInput('api-key') || '';
    const maxDiffSize = parseInt(core.getInput('max-diff-size') || '50000', 10);
    const maxPromptTokens = parseInt(core.getInput('max-prompt-tokens') || '100000', 10);
    const failOnError = core.getInput('fail-on-error') === 'true';
    const autoApply = core.getInput('auto-apply') === 'true';
    const githubToken = process.env.GITHUB_TOKEN || '';

    if (!githubToken) {
      core.setFailed('GITHUB_TOKEN environment variable is required.');
      return;
    }

    const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();

    // ── Discover or load config ────────────────────────────────────
    let docs: DiscoveredDoc[];
    let watchPatterns: string[] | undefined;

    if (configPath && fs.existsSync(path.resolve(repoRoot, configPath))) {
      core.info(`Using explicit config: ${configPath}`);
      const configContent = fs.readFileSync(path.resolve(repoRoot, configPath), 'utf-8');
      const config = parseYaml(configContent) as ExplicitConfig;
      docs = [];
      const watches: string[] = [];

      for (const entry of config.docs || []) {
        const filePath = path.resolve(repoRoot, entry.file);
        if (!filePath.startsWith(repoRoot + path.sep) && filePath !== repoRoot) {
          core.warning(`Skipping doc file with path outside repo root: ${entry.file}`);
          continue;
        }
        docs.push({
          filePath: fs.existsSync(filePath) ? filePath : filePath,
          relativePath: entry.file,
        });
        if (entry.watch) {
          watches.push(...entry.watch);
        }
      }

      if (watches.length > 0) {
        watchPatterns = watches;
      }
    } else {
      core.info(`Auto-discovering documentation files in: ${docsRoot}`);
      docs = discoverDocs({ docsRoot, repoRoot });
    }

    if (docs.length === 0) {
      core.info('No documentation files found. Nothing to review.');
      return;
    }

    core.info(`Found ${docs.length} documentation file(s)`);
    for (const doc of docs) {
      core.info(`  - ${doc.relativePath}`);
    }

    // ── Collect diff ───────────────────────────────────────────────
    const docsArtifactPaths = docs.map(d => path.relative(repoRoot, d.filePath));

    const diff = await collectDiff({
      token: githubToken,
      sourceRoot,
      docsArtifactPaths,
      watchPatterns,
      maxDiffSize,
    });

    if (diff.relevantFiles.length === 0 && diff.docsFiles.length === 0) {
      core.info('No relevant source files or documentation files changed. Skipping analysis.');
      return;
    }

    // Log which scenario we're in
    if (diff.docsFiles.length > 0 && diff.relevantFiles.length === 0) {
      core.info('Only documentation files changed — will check for consistency.');
    } else if (diff.docsFiles.length > 0 && diff.relevantFiles.length > 0) {
      core.info('Both source and documentation changed — will check if doc updates are sufficient.');
    } else {
      core.info('Source code changed — will check if documentation needs updating.');
    }

    // ── Create LLM client ──────────────────────────────────────────
    const client = createLLMClient(provider, model, apiKey, githubToken);

    // ── Analyze ────────────────────────────────────────────────────
    const scenarioFlags = {
      sourceChanged: diff.relevantFiles.length > 0,
      docsChanged: diff.docsFiles.length > 0,
    };

    // Analyze only docs that were changed, or all docs if source changed
    let docsToAnalyze: string[];
    if (scenarioFlags.docsChanged) {
      docsToAnalyze = diff.docsFiles.map(f => path.resolve(repoRoot, f.filename));
    } else {
      // Source changed but docs didn't — analyze all docs
      docsToAnalyze = docs.map(d => d.filePath);
    }

    const results = await analyzeAll(
      client,
      docsToAnalyze,
      diff.formattedDiff,
      scenarioFlags,
      maxPromptTokens,
      repoRoot,
    );

    // ── Auto-apply suggestions if enabled ──────────────────────────
    let appliedPrUrl: string | null = null;
    if (autoApply && diff.docsFiles.length === 0) {
      const hasReplacements = results.some(r =>
        r.needsUpdate && r.changes?.some(c => c.replacements && c.replacements.length > 0)
      );
      if (hasReplacements) {
        const suggestionConfig: SuggestionConfig = {
          branchPrefix: 'docs-suggestions',
          titlePrefix: '📝 Documentation updates',
          commitPrefix: 'docs-review',
        };
        const suggestionResult = await pushSuggestions(githubToken, results, suggestionConfig);
        if (suggestionResult.error) {
          core.warning(`Auto-apply failed: ${suggestionResult.error}`);
        } else if (suggestionResult.prUrl) {
          appliedPrUrl = suggestionResult.prUrl;
          core.info(`Suggestion PR created: ${appliedPrUrl}`);
        }
      }
    } else if (autoApply && diff.docsFiles.length > 0) {
      core.info('Documentation files already changed in this PR — skipping auto-apply.');
    }

    // ── Post comment ───────────────────────────────────────────────
    const anyUpdates = results.some(r => r.needsUpdate);
    const commentConfig: CommentConfig = {
      commentMarker: '<!-- docs-content-review-bot -->',
      dataStart: '<!-- docs-suggestions-data:',
      dataEnd: ':docs-suggestions-data -->',
      title: '📚 Documentation Content Review',
      applyCommand: '/docs-apply',
      footerText: 'Automated by [docs-wireframe-demo](https://github.com/spacetelescope/docs-wireframe-demo) docs content review action',
    };
    const commentBody = formatComment(results, commentConfig, undefined, { autoApplied: !!appliedPrUrl, appliedPrUrl });
    await postComment(githubToken, commentBody, anyUpdates, commentConfig.commentMarker);

    core.info('Documentation review comment posted.');

    // Set outputs
    core.setOutput('needs-update', anyUpdates.toString());
    core.setOutput('doc-count', docs.length.toString());

    // Fail the action if requested and issues were found
    if (failOnError) {
      const analysisErrors = results.filter(r => r.error).length;
      if (anyUpdates) {
        core.setFailed(`Documentation updates needed — see PR comment for details.`);
      } else if (analysisErrors > 0) {
        core.setFailed(`${analysisErrors} doc file(s) could not be analyzed (LLM errors).`);
      }
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Documentation review failed: ${message}`);
  }
}

/**
 * Handle the /docs-apply command from an issue comment.
 */
async function handleApplyCommand(): Promise<void> {
  const payload = github.context.payload;
  const commentBody = payload.comment?.body || '';

  if (!commentBody.trim().startsWith('/docs-apply')) {
    core.info('Comment does not start with /docs-apply — skipping.');
    return;
  }

  const pr = payload.issue?.pull_request;
  if (!pr) {
    core.info('Comment is not on a pull request — skipping.');
    return;
  }

  const githubToken = process.env.GITHUB_TOKEN || '';
  if (!githubToken) {
    core.setFailed('GITHUB_TOKEN environment variable is required.');
    return;
  }

  const prNumber = payload.issue!.number;
  core.info(`Handling /docs-apply for PR #${prNumber}`);

  // Extract stored replacements from the bot's earlier review comment
  const replacements = await extractReplacements(
    githubToken,
    prNumber,
    '<!-- docs-content-review-bot -->',
    '<!-- docs-suggestions-data:',
    ':docs-suggestions-data -->'
  );

  if (replacements.length === 0) {
    core.warning('No stored suggestions found in the docs review comment.');
    const octokit = github.getOctokit(githubToken);
    const { owner, repo } = github.context.repo;
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: '⚠️ No documentation suggestions found to apply. The review comment may not have proposed any changes, or it may have been updated.',
    });
    return;
  }

  // Build fake AnalysisResult to reuse pushSuggestions
  const fakeResults = [{
    label: 'docs-apply',
    needsUpdate: true,
    summary: '',
    changes: replacements.map(r => ({
      file: r.file,
      description: '',
      diff: '',
      replacements: r.replacements,
    })),
    error: null,
  }];

  const suggestionConfig: SuggestionConfig = {
    branchPrefix: 'docs-suggestions',
    titlePrefix: '📝 Documentation updates',
    commitPrefix: 'docs-review',
  };
  const result = await pushSuggestions(githubToken, fakeResults, suggestionConfig);

  const octokit = github.getOctokit(githubToken);
  const { owner, repo } = github.context.repo;

  if (result.prUrl) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `✅ Suggestion PR created: ${result.prUrl}\n\nReview and merge it into this branch to apply the documentation changes.`,
    });
  } else if (result.error) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `❌ Failed to create suggestion PR: ${result.error}`,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: '⚠️ No replacements could be applied to the current files. The documentation may have changed since the review.',
    });
  }
}

run();
