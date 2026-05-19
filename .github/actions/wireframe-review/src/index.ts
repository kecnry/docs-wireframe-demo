/**
 * Wireframe Review Action — Entry Point
 *
 * Orchestrates: discover → read artifacts → collect diff → analyze → comment
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import * as path from 'path';
import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import { discoverWireframeDemos, DiscoveredDemo } from './discover';
import { readAllArtifacts } from './artifacts';
import { collectDiff } from './diff';
import { createLLMClient } from '../../shared/llm';
import { analyzeAll } from './analyze';
import { formatComment, postComment, extractReplacements, CommentConfig } from '../../shared/comment';
import { validateDemo, ValidationResult } from './validate';
import { pushSuggestions, SuggestionConfig } from '../../shared/suggestions';

interface ExplicitConfig {
  wireframes: Array<{
    html: string;
    css?: string;
    'actions-js'?: string;
    'steps-source'?: string;
    context?: string;
    watch?: string[];
  }>;
}

async function run(): Promise<void> {
  try {
    // ── Handle /wireframe-apply command ────────────────────────────
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
    let demos: DiscoveredDemo[];
    let watchPatterns: string[] | undefined;

    if (configPath && fs.existsSync(path.resolve(repoRoot, configPath))) {
      core.info(`Using explicit config: ${configPath}`);
      const configContent = fs.readFileSync(path.resolve(repoRoot, configPath), 'utf-8');
      const config = parseYaml(configContent) as ExplicitConfig;
      demos = [];
      const watches: string[] = [];

      for (const entry of config.wireframes || []) {
        const htmlPath = path.resolve(repoRoot, entry.html);
        if (!htmlPath.startsWith(repoRoot + path.sep) && htmlPath !== repoRoot) {
          core.warning(`Skipping wireframe with path outside repo root: ${entry.html}`);
          continue;
        }
        const cssResolved = entry.css ? path.resolve(repoRoot, entry.css) : null;
        if (cssResolved && !cssResolved.startsWith(repoRoot + path.sep)) {
          core.warning(`Skipping CSS path outside repo root: ${entry.css}`);
          continue;
        }
        const jsResolved = entry['actions-js'] ? path.resolve(repoRoot, entry['actions-js']) : null;
        if (jsResolved && !jsResolved.startsWith(repoRoot + path.sep)) {
          core.warning(`Skipping JS path outside repo root: ${entry['actions-js']}`);
          continue;
        }
        demos.push({
          sourceFile: configPath,
          htmlPath: fs.existsSync(htmlPath) ? htmlPath : null,
          cssPath: cssResolved,
          jsPath: jsResolved,
          steps: null,
          rawConfig: entry.context || null,
          type: 'html-attribute',
        });
        if (entry.watch) {
          watches.push(...entry.watch);
        }
      }

      if (watches.length > 0) {
        watchPatterns = watches;
      }
    } else {
      core.info(`Auto-discovering wireframe demos in: ${docsRoot}`);
      demos = discoverWireframeDemos({ docsRoot, repoRoot });
    }

    if (demos.length === 0) {
      core.info('No wireframe demos found. Nothing to review.');
      return;
    }

    core.info(`Found ${demos.length} wireframe demo(s)`);
    for (const demo of demos) {
      core.info(`  - ${demo.htmlPath || 'unresolved'} (from ${demo.sourceFile})`);
    }

    // ── Read artifacts ─────────────────────────────────────────────
    const allArtifacts = readAllArtifacts(demos);

    if (allArtifacts.length === 0) {
      core.warning('No wireframe HTML files could be read. Nothing to analyze.');
      return;
    }

    core.info(`Read artifacts for ${allArtifacts.length} demo(s)`);

    // ── Validate steps against wireframe HTML ──────────────────────
    // Deduplicate artifacts by htmlPath before validating
    const uniqueForValidation = new Map<string, typeof allArtifacts[0]>();
    for (const a of allArtifacts) {
      const key = a.demo.htmlPath || a.label;
      if (!uniqueForValidation.has(key)) {
        uniqueForValidation.set(key, a);
      }
    }
    const validationResults: ValidationResult[] = Array.from(uniqueForValidation.values()).map(a => validateDemo(a));
    const validationIssues = validationResults.filter(r => !r.valid);
    if (validationIssues.length > 0) {
      core.warning(`Found ${validationIssues.reduce((n, r) => n + r.issues.length, 0)} validation issue(s) across ${validationIssues.length} demo(s)`);
      for (const r of validationIssues) {
        for (const issue of r.issues) {
          const stepRef = issue.step > 0 ? `step ${issue.step}: ` : '';
          core.warning(`  ${r.label} — ${stepRef}${issue.message}`);
        }
      }
    } else {
      core.info('All step definitions pass validation against wireframe HTML.');
    }

    // ── Collect diff ───────────────────────────────────────────────
    const wireframePathSet = new Set<string>();
    for (const a of allArtifacts) {
      if (a.demo.htmlPath) wireframePathSet.add(path.relative(repoRoot, a.demo.htmlPath));
      if (a.demo.cssPath) wireframePathSet.add(path.relative(repoRoot, a.demo.cssPath));
      if (a.demo.jsPath) wireframePathSet.add(path.relative(repoRoot, a.demo.jsPath));
    }
    const wireframeArtifactPaths = Array.from(wireframePathSet);

    const diff = await collectDiff({
      token: githubToken,
      sourceRoot,
      wireframeArtifactPaths,
      watchPatterns,
      maxDiffSize,
    });

    if (diff.relevantFiles.length === 0 && diff.wireframeFiles.length === 0) {
      core.info('No relevant source files or wireframe artifacts changed. Skipping analysis.');
      return;
    }

    // Log which scenario we're in for clarity
    if (diff.wireframeFiles.length > 0 && diff.relevantFiles.length === 0) {
      core.info('Only wireframe artifacts changed — will check for consistency.');
    } else if (diff.wireframeFiles.length > 0 && diff.relevantFiles.length > 0) {
      core.info('Both source and wireframe artifacts changed — will check if wireframe updates are sufficient.');
    } else {
      core.info('Source code changed — will check if wireframes need updating.');
    }

    // ── Create LLM client ──────────────────────────────────────────
    const client = createLLMClient(provider, model, apiKey, githubToken);

    // ── Analyze ────────────────────────────────────────────────────
    const scenarioFlags = {
      sourceChanged: diff.relevantFiles.length > 0,
      wireframeChanged: diff.wireframeFiles.length > 0,
    };
    const results = await analyzeAll(client, allArtifacts, diff.formattedDiff, scenarioFlags, validationResults, maxPromptTokens, repoRoot);

    // ── Auto-apply suggestions if enabled ──────────────────────────
    // Skip auto-apply if wireframe files were already changed in this PR
    // (e.g. from a previous suggestion PR that was merged).
    let appliedPrUrl: string | null = null;
    if (autoApply && diff.wireframeFiles.length === 0) {
      const hasReplacements = results.some(r =>
        r.needsUpdate && r.changes?.some(c => c.replacements && c.replacements.length > 0)
      );
      if (hasReplacements) {
        const suggestionConfig: SuggestionConfig = {
          branchPrefix: 'wireframe-suggestions',
          titlePrefix: '🖼️ Wireframe updates',
          commitPrefix: 'wireframe-review',
        };
        const suggestionResult = await pushSuggestions(githubToken, results, suggestionConfig);
        if (suggestionResult.error) {
          core.warning(`Auto-apply failed: ${suggestionResult.error}`);
        } else if (suggestionResult.prUrl) {
          appliedPrUrl = suggestionResult.prUrl;
          core.info(`Suggestion PR created: ${appliedPrUrl}`);
        }
      }
    } else if (autoApply && diff.wireframeFiles.length > 0) {
      core.info('Wireframe files already changed in this PR — skipping auto-apply.');
    }

    // ── Post comment ───────────────────────────────────────────────
    const anyUpdates = results.some(r => r.needsUpdate);
    const commentConfig: CommentConfig = {
      commentMarker: '<!-- wireframe-review-bot -->',
      dataStart: '<!-- wireframe-suggestions-data:',
      dataEnd: ':wireframe-suggestions-data -->',
      title: '🖼️ Wireframe Demo Review',
      validationTitle: 'Step/Selector Validation',
      applyCommand: '/wireframe-apply',
      footerText: 'Automated by [docs-wireframe-demo](https://github.com/spacetelescope/docs-wireframe-demo) wireframe review action',
    };
    const commentBody = formatComment(results, commentConfig, validationResults, { autoApplied: !!appliedPrUrl, appliedPrUrl });
    await postComment(githubToken, commentBody, anyUpdates, commentConfig.commentMarker);

    core.info('Wireframe review comment posted.');

    // Set outputs
    core.setOutput('needs-update', anyUpdates.toString());
    core.setOutput('demo-count', demos.length.toString());

    // Fail the action if requested and issues were found
    if (failOnError) {
      const totalValidationErrors = validationIssues.reduce((n, r) => n + r.issues.filter(i => i.severity === 'error').length, 0);
      const analysisErrors = results.filter(r => r.error).length;
      if (totalValidationErrors > 0) {
        core.setFailed(`${totalValidationErrors} validation error(s) found in wireframe step definitions.`);
      } else if (anyUpdates) {
        core.setFailed(`Wireframe updates needed — see PR comment for details.`);
      } else if (analysisErrors > 0) {
        core.setFailed(`${analysisErrors} wireframe(s) could not be analyzed (LLM errors).`);
      }
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Wireframe review failed: ${message}`);
  }
}

/**
 * Handle the /wireframe-apply command from an issue comment.
 * Reads stored replacement data from the bot's review comment and creates a suggestion PR.
 */
async function handleApplyCommand(): Promise<void> {
  const payload = github.context.payload;
  const commentBody = payload.comment?.body || '';

  if (!commentBody.trim().startsWith('/wireframe-apply')) {
    core.info('Comment does not start with /wireframe-apply — skipping.');
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
  core.info(`Handling /wireframe-apply for PR #${prNumber}`);

  // Extract stored replacements from the bot's earlier review comment
  const replacements = await extractReplacements(
    githubToken,
    prNumber,
    '<!-- wireframe-review-bot -->',
    '<!-- wireframe-suggestions-data:',
    ':wireframe-suggestions-data -->'
  );

  if (replacements.length === 0) {
    core.warning('No stored suggestions found in the wireframe review comment.');
    // Post a reply so the user knows
    const octokit = github.getOctokit(githubToken);
    const { owner, repo } = github.context.repo;
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: '⚠️ No wireframe suggestions found to apply. The review comment may not have proposed any changes, or it may have been updated.',
    });
    return;
  }

  // Build fake AnalysisResult to reuse pushSuggestions
  const fakeResults = [{
    label: 'wireframe-apply',
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
    branchPrefix: 'wireframe-suggestions',
    titlePrefix: '🖼️ Wireframe updates',
    commitPrefix: 'wireframe-review',
  };
  const result = await pushSuggestions(githubToken, fakeResults, suggestionConfig);

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  if (result.prUrl) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `✅ Suggestion PR created: ${result.prUrl}\n\nReview and merge it into this branch to apply the wireframe changes.`,
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
      body: '⚠️ No replacements could be applied to the current files. The wireframe may have changed since the review.',
    });
  }
}

run();
