import { execSync } from 'child_process';

export const callClaudeCode = async (prompt: string): Promise<string | null> => {
  try {
    const result = execSync(
      `echo "${prompt.replace(/"/g, '\\"')}" | claude --no-interactive --max-turns 1 2>/dev/null | head -n 5`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 5000,
      }
    );
    const lines = result.trim().split('\n');
    const response = lines.join(' ').trim();
    return response || null;
  } catch {
    return null;
  }
};

export const generateSlug = async (prompt: string): Promise<string> => {
  if (!prompt) return `attn-${Date.now()}`;

  // Extract JIRA key if user included it in the prompt
  // Matches: "JNY-1234", "[JNY-1234]", "jny-1234"
  const jiraMatch = prompt.match(/\b([A-Za-z]+-\d+)\b/);
  const jiraPrefix = jiraMatch ? jiraMatch[1].toLowerCase() + '-' : '';

  // Strip the JIRA key from the prompt before sending to LLM
  const cleanPrompt = prompt.replace(/\[?[A-Za-z]+-\d+\]?:?\s*/g, '').trim();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    // Try multiple models with fallback
    const models = ['google/gemini-2.5-flash', 'x-ai/grok-4-fast:free', 'openai/gpt-4o-mini'];

    for (const model of models) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: `Generate a 1-2 word kebab-case slug for this prompt. Only respond with the slug, nothing else: "${cleanPrompt}"`
              }
            ],
            max_tokens: 10,
            temperature: 0.3
          })
        });

        if (response.ok) {
          const data = await response.json() as any;
          const slug = data.choices[0].message.content.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
          if (slug) return jiraPrefix + slug;
        }
      } catch {
        // Try next model
        continue;
      }
    }
  }

  const claudeResponse = await callClaudeCode(
    `Generate a 1-2 word kebab-case slug for this prompt. Only respond with the slug, nothing else: "${cleanPrompt}"`
  );
  if (claudeResponse) {
    const slug = claudeResponse.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (slug) return jiraPrefix + slug;
  }

  return jiraPrefix + `attn-${Date.now()}`;
};
