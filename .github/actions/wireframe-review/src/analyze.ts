/**
 * Orchestrate LLM analysis for each discovered wireframe demo.
 */

import * as core from '@actions/core';
import { DemoArtifacts } from './artifacts';
import { LLMClient } from '../../shared/llm';
import { buildAnalysisPrompt } from './prompts';
import { ValidationResult } from './validate';

export interface FileReplacement {
  search: string;
  replace: string;
}

export interface FileChange {
  file: string;
  description: string;
  diff: string;
  replacements?: FileReplacement[];
}

export interface AnalysisResult {
  /** The demo that was analyzed */
  label: string;
  /** Whether the LLM thinks the wireframe needs updating */
  needsUpdate: boolean;
  /** Summary of the analysis */
  summary: string;
  /** Specific file changes proposed, if any */
  changes: FileChange[] | null;
  /** If the analysis failed, the error message */
  error: string | null;
}

/**
 * Parse the LLM response into a structured result.
 * Handles JSON wrapped in markdown fences or bare.
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
 * Analyze a single wireframe demo against the PR diff.
 */
async function analyzeOne(
  client: LLMClient,
  artifacts: DemoArtifacts,
  formattedDiff: string,
  scenarioFlags: { sourceChanged: boolean; wireframeChanged: boolean },
  validationResults?: ValidationResult[],
  maxPromptTokens?: number,
  repoRoot?: string,
): Promise<AnalysisResult> {
  const label = artifacts.label;

  try {
    const messages = buildAnalysisPrompt(artifacts, formattedDiff, scenarioFlags, validationResults, maxPromptTokens, repoRoot);
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
 * Analyze all wireframe demos against the PR diff.
 */
export async function analyzeAll(
  client: LLMClient,
  allArtifacts: DemoArtifacts[],
  formattedDiff: string,
  scenarioFlags: { sourceChanged: boolean; wireframeChanged: boolean },
  validationResults?: ValidationResult[],
  maxPromptTokens?: number,
  repoRoot?: string,
): Promise<AnalysisResult[]> {
  // Deduplicate by htmlPath — many docs pages reference the same wireframe
  const grouped = new Map<string, DemoArtifacts[]>();
  for (const a of allArtifacts) {
    const key = a.demo.htmlPath || a.label;
    const group = grouped.get(key) || [];
    group.push(a);
    grouped.set(key, group);
  }

  core.info(`${allArtifacts.length} demo(s) map to ${grouped.size} unique wireframe(s)`);

  const results: AnalysisResult[] = [];

  for (const [, group] of grouped) {
    // Use the first artifact as representative; merge step definitions from all
    const representative = mergeGroupArtifacts(group);
    core.info(`Analyzing wireframe: ${representative.label}`);
    const result = await analyzeOne(client, representative, formattedDiff, scenarioFlags, validationResults, maxPromptTokens, repoRoot);
    results.push(result);

    if (result.error) {
      core.warning(`Analysis error for ${result.label}: ${result.error}`);
    } else if (result.needsUpdate) {
      core.info(`  → Changes suggested: ${result.summary}`);
    } else {
      core.info(`  → No changes needed: ${result.summary}`);
    }
  }

  return results;
}

/**
 * Limit merged steps to a reasonable size.
 * Includes as many unique step sets as fit within ~4000 chars,
 * then summarizes the rest.
 */
function limitStepsContent(stepSets: string[]): string {
  const MAX_CHARS = 4000;
  const parts: string[] = [];
  let totalChars = 0;
  let included = 0;

  for (const steps of stepSets) {
    if (totalChars + steps.length > MAX_CHARS && included > 0) {
      break;
    }
    parts.push(steps);
    totalChars += steps.length;
    included++;
  }

  if (included < stepSets.length) {
    parts.push(`\n(... ${stepSets.length - included} additional step definition sets omitted for brevity)`);
  }

  return parts.join('\n\n--- (steps from another page) ---\n\n');
}

/**
 * Merge a group of artifacts that share the same wireframe HTML.
 * Combines step definitions from all demos so the LLM sees all
 * step variations in one request.
 */
function mergeGroupArtifacts(group: DemoArtifacts[]): DemoArtifacts {
  if (group.length === 1) return group[0];

  const first = group[0];

  // Collect unique step definitions
  const allSteps = new Set<string>();
  for (const a of group) {
    if (a.stepsContent) allSteps.add(a.stepsContent);
  }

  const mergedSteps = allSteps.size > 0
    ? limitStepsContent(Array.from(allSteps))
    : null;

  const sources = group.map(a => {
    const p = a.demo.sourceFile;
    // Use just the filename, not the full absolute path
    return p.split('/').pop() || p;
  });
  // Deduplicate source filenames and limit to first 5
  const uniqueSources = [...new Set(sources)];
  const sourceList = uniqueSources.length > 5
    ? uniqueSources.slice(0, 5).join(', ') + `, +${uniqueSources.length - 5} more`
    : uniqueSources.join(', ');
  const htmlBase = first.demo.htmlPath
    ? require('path').basename(first.demo.htmlPath)
    : 'unknown';

  return {
    ...first,
    stepsContent: mergedSteps,
    label: `${htmlBase} (referenced by ${group.length} pages, e.g. ${sourceList})`,
  };
}
