/**
 * Orchestrate LLM analysis for each discovered documentation file.
 */

import * as core from '@actions/core';
import * as fs from 'fs';
import { LLMClient } from '../../shared/llm';
import { buildAnalysisPrompt, DocContentOptions } from './prompts';
import { AnalysisResult, FileChange } from '../../shared/comment';

/**
 * Parse the LLM response into a structured result.
 */
function parseResponse(raw: string, label: string): Omit<AnalysisResult, 'label' | 'error'> {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const parsed = JSON.parse(cleaned);

  const changes: FileChange[] | null = parsed.changes
    ? (parsed.changes as FileChange[]).map(c => ({
        file: c.file,
        description: c.description,
        diff: c.diff || '',
        replacements: Array.isArray(c.replacements) ? c.replacements : undefined,
      }))
    : null;

  return {
    needsUpdate: Boolean(parsed.needsUpdate),
    summary: String(parsed.summary || ''),
    changes,
  };
}

/**
 * Analyze a single documentation file against the PR diff.
 */
async function analyzeOne(
  client: LLMClient,
  doc: DocContentOptions,
  formattedDiff: string,
  scenarioFlags: { sourceChanged: boolean; docsChanged: boolean },
  maxPromptTokens?: number,
  repoRoot?: string,
): Promise<AnalysisResult> {
  const label = doc.filePath;

  try {
    const messages = buildAnalysisPrompt(doc, formattedDiff, scenarioFlags, maxPromptTokens, repoRoot);
    const response = await client.chat(messages);

    try {
      const result = parseResponse(response, label);
      return { ...result, label, error: null };
    } catch (parseErr) {
      // Retry once with a nudge to fix JSON
      core.warning(`Failed to parse LLM response for ${label}, retrying with format nudge`);
      const retryMessages = [
        ...messages,
        { role: 'assistant' as const, content: response },
        { role: 'user' as const, content: 'Your response was not valid JSON. Please respond with ONLY a JSON object, no markdown fences or other text.' },
      ];
      const retryResponse = await client.chat(retryMessages);
      try {
        const result = parseResponse(retryResponse, label);
        return { ...result, label, error: null };
      } catch {
        return {
          label,
          needsUpdate: false,
          summary: '',
          changes: null,
          error: `Failed to parse LLM response after retry: ${parseErr}`,
        };
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    core.error(`LLM analysis failed for ${label}: ${errorMsg}`);
    return {
      label,
      needsUpdate: false,
      summary: '',
      changes: null,
      error: errorMsg,
    };
  }
}

/**
 * Analyze all documentation files against the PR diff.
 */
export async function analyzeAll(
  client: LLMClient,
  docPaths: string[],
  formattedDiff: string,
  scenarioFlags: { sourceChanged: boolean; docsChanged: boolean },
  maxPromptTokens?: number,
  repoRoot?: string,
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];

  for (const filePath of docPaths) {
    core.info(`Analyzing documentation: ${filePath}`);

    // Read the doc file content
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      core.warning(`Could not read ${filePath}: ${err}`);
      results.push({
        label: filePath,
        needsUpdate: false,
        summary: '',
        changes: null,
        error: `Could not read file: ${err}`,
      });
      continue;
    }

    const result = await analyzeOne(
      client,
      { filePath, content },
      formattedDiff,
      scenarioFlags,
      maxPromptTokens,
      repoRoot,
    );

    results.push(result);
  }

  return results;
}
