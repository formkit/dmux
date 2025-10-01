import { execSync } from 'child_process';

// State types for agent status
export type PaneState = 'option_dialog' | 'open_prompt' | 'in_progress';

// Interface for the structured response from the LLM
export interface PaneAnalysis {
  state: PaneState;
  question?: string;
  options?: Array<{
    action: string;
    keys: string[];
    description?: string;
  }>;
  potentialHarm?: {
    hasRisk: boolean;
    description?: string;
  };
  summary?: string; // Brief summary when state is 'open_prompt' (idle)
}

export class PaneAnalyzer {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
  }

  /**
   * Captures the last N lines from a tmux pane
   */
  capturePaneContent(paneId: string, lines: number = 50): string {
    try {
      // Capture pane content with line history
      // -p prints to stdout, -S -<lines> starts from <lines> lines back
      const content = execSync(
        `tmux capture-pane -t '${paneId}' -p -S -${lines}`,
        { encoding: 'utf8', stdio: 'pipe' }
      );

      return content;
    } catch (error) {
      // Failed to capture pane content
      return '';
    }
  }

  /**
   * Stage 1: Determines the state of the pane
   */
  async determineState(content: string): Promise<PaneState> {
    if (!this.apiKey) {
      // API key not set
      return 'in_progress';
    }

    const systemPrompt = `You are analyzing terminal output to determine its current state.
IMPORTANT: Focus primarily on the LAST 10 LINES of the output, as that's where the current state is shown.

Return a JSON object with a "state" field containing exactly one of these three values:
- "option_dialog": ONLY when specific options/choices are clearly presented
- "in_progress": When there are progress indicators showing active work
- "open_prompt": DEFAULT state - use this unless you're certain it's one of the above

OPTION DIALOG - Must have clear choices presented:
- "Continue? [y/n]"
- "Select: 1) Create 2) Edit 3) Cancel"
- "[A]ccept, [R]eject, [E]dit"
- Menu with numbered/lettered options
- Clear list of specific keys/choices to select

IN PROGRESS - Look for these in the BOTTOM 10 LINES:
- KEY INDICATOR: "(esc to interrupt)" or "esc to cancel" = ALWAYS in_progress
- Progress symbols with ANY action word: ✶ ⏺ ✽ ⏳ 🔄 followed by any word ending in "ing..."
- Common progress words: "Working..." "Loading..." "Processing..." "Running..." "Building..."
- Claude Code's creative words: "Pondering..." "Crunching..." "Flibbergibberating..." etc.
- ANY word ending in "ing..." with progress symbols
- Active progress bars or percentages
- The phrase "esc to interrupt" anywhere = definitely in_progress

OPEN PROMPT - The DEFAULT state:
- Empty prompts: "> "
- Questions waiting for input
- Any prompt line without specific options
- Static UI elements like "⏵⏵ accept edits on" (without "esc to interrupt")
- When there's no clear progress or options

CRITICAL:
1. Check the BOTTOM 10 lines first - that's where the current state appears
2. If you see "(esc to interrupt)" ANYWHERE = it's in_progress
3. When uncertain, default to "open_prompt"`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/dmux/dmux',
          'X-Title': 'dmux',
        },
        body: JSON.stringify({
          model: 'x-ai/grok-4-fast:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analyze this terminal output and return a JSON object with the state:\n\n${content}` }
          ],
          temperature: 0.1,
          max_tokens: 20,
          response_format: { type: 'json_object' },
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        // API error
        return 'in_progress';
      }

      const data: any = await response.json();
      const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');

      // Validate the state
      const state = result.state;
      if (state === 'option_dialog' || state === 'open_prompt' || state === 'in_progress') {
        return state;
      }

      return 'in_progress';
    } catch (error) {
      // Failed to determine state
      return 'in_progress';
    }
  }

  /**
   * Stage 2: Extract option details if state is option_dialog
   */
  async extractOptions(content: string): Promise<Omit<PaneAnalysis, 'state'>> {
    if (!this.apiKey) {
      return {};
    }

    const systemPrompt = `You are analyzing an option dialog in a terminal.
Extract the following and return as JSON:
1. The question being asked
2. Each available option with:
   - The action/choice description
   - The exact keys to press (could be letters, numbers, arrow keys + enter, etc.)
   - Any additional context

Return a JSON object with:
- question: The question or prompt text
- options: Array of {action, keys, description}
- potential_harm: {has_risk, description} if there's risk of harm

EXAMPLES:
Input: "Delete all files? [y/n]"
Output: {
  "question": "Delete all files?",
  "options": [
    {"action": "Yes", "keys": ["y"]},
    {"action": "No", "keys": ["n"]}
  ],
  "potential_harm": {"has_risk": true, "description": "Will delete all files"}
}

Input: "Select option:\n1. Create file\n2. Edit file\n3. Cancel"
Output: {
  "question": "Select option:",
  "options": [
    {"action": "Create file", "keys": ["1"]},
    {"action": "Edit file", "keys": ["2"]},
    {"action": "Cancel", "keys": ["3"]}
  ]
}

Input: "[A]ccept edits, [R]eject, [E]dit manually"
Output: {
  "question": "Choose action for edits",
  "options": [
    {"action": "Accept edits", "keys": ["a", "A"]},
    {"action": "Reject", "keys": ["r", "R"]},
    {"action": "Edit manually", "keys": ["e", "E"]}
  ]
}`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/dmux/dmux',
          'X-Title': 'dmux',
        },
        body: JSON.stringify({
          model: 'x-ai/grok-4-fast:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Extract the option details from this dialog and return as JSON:\n\n${content}` }
          ],
          temperature: 0.1,
          max_tokens: 300,
          response_format: { type: 'json_object' },
        })
      });

      if (!response.ok) {
        // API error in option extraction
        return {};
      }

      const data: any = await response.json();
      const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');

      return {
        question: result.question,
        options: result.options?.map((opt: any) => ({
          action: opt.action,
          keys: Array.isArray(opt.keys) ? opt.keys : [opt.keys],
          description: opt.description
        })),
        potentialHarm: result.potential_harm ? {
          hasRisk: result.potential_harm.has_risk,
          description: result.potential_harm.description
        } : undefined
      };
    } catch (error) {
      // Failed to extract options
      return {};
    }
  }

  /**
   * Stage 3: Extract summary when state is open_prompt (idle)
   */
  async extractSummary(content: string): Promise<string | undefined> {
    if (!this.apiKey) {
      return undefined;
    }

    const systemPrompt = `You are analyzing terminal output from an AI coding agent (Claude Code or opencode).
The agent is now idle and waiting for the next prompt.

Your task: Provide a 1 paragraph or shorter summary of what the agent communicated to the user before going idle.

Focus on:
- What the agent just finished doing or said
- Any results, conclusions, or feedback provided
- Keep it concise (1-2 sentences max)
- Use past tense ("completed", "fixed", "created", etc.)

Return a JSON object with a "summary" field.

Examples:
- "Completed refactoring the authentication module and fixed TypeScript errors."
- "Created the new user dashboard component with responsive design."
- "Build succeeded with no errors. All tests passed."
- "Unable to find the specified file. Waiting for clarification."

If there's no meaningful content or the output is unclear, return an empty summary.`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/dmux/dmux',
          'X-Title': 'dmux',
        },
        body: JSON.stringify({
          model: 'x-ai/grok-4-fast:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Extract the summary from this terminal output:\n\n${content}` }
          ],
          temperature: 0.1,
          max_tokens: 100,
          response_format: { type: 'json_object' },
        })
      });

      if (!response.ok) {
        return undefined;
      }

      const data: any = await response.json();
      const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');

      return result.summary || undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Main analysis function that captures and analyzes a pane
   */
  async analyzePane(paneId: string): Promise<PaneAnalysis> {
    // Capture the pane content (50 lines for state detection)
    const content = this.capturePaneContent(paneId, 50);

    if (!content) {
      return { state: 'in_progress' };
    }

    // Stage 1: Determine the state
    const state = await this.determineState(content);

    // If it's an option dialog, extract option details
    if (state === 'option_dialog') {
      const optionDetails = await this.extractOptions(content);
      return {
        state,
        ...optionDetails
      };
    }

    // If it's open_prompt (idle), extract summary
    if (state === 'open_prompt') {
      const summary = await this.extractSummary(content);
      return {
        state,
        summary
      };
    }

    // Otherwise just return the state (in_progress)
    return { state };
  }
}