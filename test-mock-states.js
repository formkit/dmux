#!/usr/bin/env node

import { PaneAnalyzer } from './dist/PaneAnalyzer.js';

// Mock terminal outputs for different states
const mockStates = {
  optionDialog1: `
=== File Operations ===
Would you like to delete all temporary files?
[Y]es  [N]o  [C]ancel
> `,

  optionDialog2: `
Select an action:
  1. Create new file
  2. Edit existing file
  3. Delete file
  4. Exit
Enter choice (1-4): `,

  optionDialog3: `
⚠️  Warning: This will modify production database

Do you want to continue? (y/n): `,

  openPrompt1: `
Welcome to the assistant!

> `,

  openPrompt2: `
Enter the filename to create:
> `,

  openPrompt3: `
What would you like me to help you with today?

> `,

  inProgress1: `
✶ Working on your request...

Analyzing codebase...
Found 23 files to process
Processing file 1 of 23...
Processing file 2 of 23...
`,

  inProgress2: `
⏺ Running tests...

  test-suite-1
    ✓ should handle basic input
    ✓ should validate options
    ✓ should process commands

Test results: 3 passed, 0 failed
`,

  claudeWorking: `
✶ Testing two-stage detection with various dialogs… (esc to interrupt · ctrl+t to hide todos)
  ⎿  ☒ Implement two-stage LLM analysis
     ☒ Create separate method for option extraction
     ☐ Test two-stage detection with various dialogs

─────────────────────────────────────────────────────────────────────────────────
>
─────────────────────────────────────────────────────────────────────────────────
  ⏵⏵ accept edits on (shift+tab to cycle)`
};

async function testAnalyzer() {
  const analyzer = new PaneAnalyzer();

  console.log('🧪 Testing PaneAnalyzer with mock states\n');
  console.log('=' . repeat(60));

  for (const [name, content] of Object.entries(mockStates)) {
    console.log(`\n📋 Test: ${name}`);
    console.log('-'.repeat(40));

    // Mock the determineState and extractOptions methods to test without tmux
    const state = await analyzer.determineState(content);
    console.log(`State detected: ${state}`);

    if (state === 'option_dialog') {
      const options = await analyzer.extractOptions(content);
      console.log('Options extracted:', JSON.stringify(options, null, 2));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Testing complete!');
}

testAnalyzer().catch(console.error);