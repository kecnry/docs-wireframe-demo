/**
 * Prompt templates for documentation content review.
 */

import { Message } from '../../shared/llm';
import * as path from 'path';

const SYSTEM_PROMPT = `You are a documentation review assistant. Analyze PR diffs to determine if documentation content needs updating.

Your task is to check whether code changes in a PR require corresponding updates to documentation files (RST, Markdown, etc.).

Focus on:
- **API changes**: New/renamed/removed functions, classes, methods, parameters
- **Configuration changes**: New settings, changed defaults, deprecated options
- **Feature changes**: New features that need documentation, removed features
- **Link updates**: Code reorganization that might break internal links or references
- **Example updates**: Code examples in docs that reference changed APIs
- **Installation/setup changes**: New dependencies, changed requirements

When suggesting doc updates, check for:
1. **Outdated text**: Descriptions that no longer match the code
2. **Broken links**: Internal references to moved/renamed files or symbols
3. **Missing content**: New features or APIs that aren't documented
4. **Incorrect examples**: Code samples that won't work with the changes

Respond with ONLY a JSON object:
{"needsUpdate": true/false, "summary": "Brief explanation", "changes": [{"file": "path", "description": "what/why", "diff": "unified diff", "replacements": [{"search": "exact text in file", "replace": "new text"}]}]}
If needsUpdate is false, set changes to null. For replacements, "search" must be exact text matching a unique location.`;

/** Rough token estimation: ~3 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export interface DocContentOptions {
  filePath: string;
  content: string;
}

/**
 * Build the analysis prompt for a documentation file.
 */
export function buildAnalysisPrompt(
  doc: DocContentOptions,
  formattedDiff: string,
  options: { sourceChanged: boolean; docsChanged: boolean },
  maxPromptTokens: number = 100000,
  repoRoot: string = '',
): Message[] {
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  const parts: string[] = [];
  const docRelPath = repoRoot ? path.relative(repoRoot, doc.filePath) : doc.filePath;

  parts.push(`# Documentation File: ${docRelPath}\n`);

  // Tell the LLM which scenario this is
  if (options.docsChanged && !options.sourceChanged) {
    parts.push(`> **Scenario**: Only documentation files were changed in this PR (no source code changes). Please review the doc changes for correctness and consistency.\n`);
  } else if (options.sourceChanged && !options.docsChanged) {
    parts.push(`> **Scenario**: Source code was changed but documentation was not. Determine if the source changes require documentation updates.\n`);
  } else {
    parts.push(`> **Scenario**: Both source code and documentation were changed in this PR. The documentation below already reflects updates from this PR. Only suggest further changes if the existing doc updates are **insufficient** for the source changes. If the documentation already covers the changes, set needsUpdate to false.\n`);
  }

  parts.push(`## Current Documentation Content\n\`\`\`\n${doc.content}\n\`\`\`\n`);

  // Apply token budget
  const systemTokens = estimateTokens(SYSTEM_PROMPT);
  const contentSoFar = parts.join('\n');
  const contentTokens = estimateTokens(contentSoFar);
  const diffTokens = estimateTokens(formattedDiff);
  const totalTokens = systemTokens + contentTokens + diffTokens;

  if (totalTokens > maxPromptTokens) {
    throw new Error(
      `Prompt too large for token budget (~${totalTokens} tokens, limit is ${maxPromptTokens}). ` +
      `Use a provider with a larger context window or increase max-prompt-tokens.`
    );
  }

  parts.push(`## Pull Request Diff\n\`\`\`diff\n${formattedDiff}\n\`\`\`\n`);

  parts.push(`Analyze whether this PR diff requires any updates to the documentation file above. Remember to respond with ONLY a JSON object.`);

  messages.push({ role: 'user', content: parts.join('\n') });

  return messages;
}
