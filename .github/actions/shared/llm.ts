/**
 * LLM provider abstraction.
 *
 * Supports:
 * - GitHub Models (default, uses GITHUB_TOKEN)
 * - OpenAI
 * - Anthropic
 */

import * as core from '@actions/core';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMClient {
  chat(messages: Message[]): Promise<string>;
}

// ── GitHub Models ──────────────────────────────────────────────────────

const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';
const GITHUB_MODELS_DEFAULT_MODEL = 'gpt-4o';

class GitHubModelsClient implements LLMClient {
  private token: string;
  private model: string;

  constructor(token: string, model: string) {
    this.token = token;
    this.model = model || GITHUB_MODELS_DEFAULT_MODEL;
  }

  async chat(messages: Message[]): Promise<string> {
    const body = {
      model: this.model,
      messages,
      temperature: 0.2,
    };

    const response = await fetchWithRetry(GITHUB_MODELS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) {
      throw new Error(`GitHub Models error: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from GitHub Models');
    }

    return content;
  }
}

// ── OpenAI ─────────────────────────────────────────────────────────────

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_DEFAULT_MODEL = 'gpt-4o';

class OpenAIClient implements LLMClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model || OPENAI_DEFAULT_MODEL;
  }

  async chat(messages: Message[]): Promise<string> {
    const body = {
      model: this.model,
      messages,
      temperature: 0.2,
    };

    const response = await fetchWithRetry(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) {
      throw new Error(`OpenAI error: ${data.error.message}`);
    }

    return data.choices?.[0]?.message?.content ?? '';
  }
}

// ── Anthropic ──────────────────────────────────────────────────────────

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-20250514';

class AnthropicClient implements LLMClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model || ANTHROPIC_DEFAULT_MODEL;
  }

  async chat(messages: Message[]): Promise<string> {
    // Anthropic uses a separate system parameter
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 4096,
      temperature: 0.2,
      messages: nonSystemMsgs,
    };

    if (systemMsg) {
      body.system = systemMsg.content;
    }

    const response = await fetchWithRetry(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as {
      content?: Array<{ type: string; text?: string }>;
      error?: { message?: string };
    };

    if (data.error) {
      throw new Error(`Anthropic error: ${data.error.message}`);
    }

    const textBlock = data.content?.find(b => b.type === 'text');
    return textBlock?.text ?? '';
  }
}

// ── Retry logic ────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries: number = 3,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.ok) return response;

      // Retry on rate limits and server errors
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, 60000)
          : Math.min(1000 * Math.pow(2, attempt), 30000);

        core.warning(`LLM API returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Non-retryable error — return the response for error extraction
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        core.warning(`LLM API request failed: ${lastError.message}, retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error('LLM API request failed after retries');
}

// ── Factory ────────────────────────────────────────────────────────────

export function createLLMClient(
  provider: string,
  model: string,
  apiKey: string,
  githubToken: string,
): LLMClient {
  switch (provider) {
    case 'github-models':
      return new GitHubModelsClient(githubToken, model);
    case 'openai':
      if (!apiKey) throw new Error('api-key input is required for the openai provider');
      return new OpenAIClient(apiKey, model);
    case 'anthropic':
      if (!apiKey) throw new Error('api-key input is required for the anthropic provider');
      return new AnthropicClient(apiKey, model);
    default:
      throw new Error(`Unknown LLM provider: ${provider}. Use github-models, openai, or anthropic.`);
  }
}
