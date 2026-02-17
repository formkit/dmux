// Interactive dmux terminal simulation
export function initTerminalSim() {
  const terminalOutput = document.querySelector('.demo-ui');
  if (!terminalOutput) return;

  const terminalWindow = terminalOutput.closest('.terminal-window');
  if (!terminalWindow) return;

  // Clear any existing content
  terminalOutput.innerHTML = '';

  // State
  let currentStep = 0;
  let typingIndex = 0;
  let agentIndex = 0;
  let hasStarted = false;
  const userPrompt = 'Create an order form for my soy latte coffee stand.';
  const agents = ['Claude Code', 'opencode', 'Codex'];

  // Create initial UI structure
  function createPromptScreen() {
    return `
      <div class="terminal-screen">
        <div class="terminal-label">Enter initial prompt (ESC to cancel):</div>
        <div class="terminal-box">
          <div class="terminal-box-content">
            <span class="prompt-symbol">&gt;</span>
            <span class="user-input"></span>
            <span class="cursor">█</span>
          </div>
        </div>
        <div class="terminal-hint">Press Ctrl+O to open in $EDITOR for complex multi-line input</div>
        <div class="terminal-version">v2.2.1</div>
      </div>
    `;
  }

  function createAgentSelectScreen() {
    return `
      <div class="terminal-screen">
        <div class="terminal-box">
          <div class="terminal-box-header">Select agent (←/→, 1/2, C/O, Enter, ESC):</div>
          <div class="terminal-box-content agent-selection">
            <div class="agent-options">
              <span class="agent active" data-agent-index="0">
                <span class="agent-arrow">▶</span> <span class="agent-name">Claude Code</span>
              </span>
              <span class="agent" data-agent-index="1">
                <span class="agent-arrow" style="visibility: hidden;">▶</span> <span class="agent-name">opencode</span>
              </span>
              <span class="agent" data-agent-index="2">
                <span class="agent-arrow" style="visibility: hidden;">▶</span> <span class="agent-name">Codex</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function createPaneScreen() {
    return `
      <div class="terminal-screen">
        <div class="pane-grid">
          <div class="pane-card active-pane">
            <div class="pane-header">
              <span class="pane-icon">⋮</span>
              <span class="pane-name">soy-latte-order</span>
              <span class="pane-agent">(cc)</span>
            </div>
            <div class="pane-prompt">"Create an order form for my s…"</div>
            <div class="pane-status">
              <span class="status-icon">⟳</span>
              <span class="status-text">Analyzing...</span>
            </div>
          </div>
          <div class="pane-card new-pane">
            <div class="pane-header">
              <span class="pane-icon">+</span>
              <span class="pane-name">New dmux pane</span>
            </div>
            <div class="pane-empty"></div>
          </div>
        </div>
        <div class="terminal-footer">
          <div class="terminal-commands">Commands: <span class="cmd-key">[j]</span>ump • <span class="cmd-key">[m]</span>enu • <span class="cmd-key">[x]</span>close • <span class="cmd-key">[n]</span>ew • <span class="cmd-key">[r]</span>emote • <span class="cmd-key">[q]</span>uit</div>
          <div class="terminal-hint">Use arrow keys (↑↓←→) for spatial navigation, Enter to select</div>
          <div class="terminal-version">v2.2.1</div>
        </div>
      </div>
    `;
  }

  function createThreePaneScreen() {
    return `
      <div class="terminal-screen">
        <div class="pane-grid">
          <div class="pane-card">
            <div class="pane-header">
              <span class="pane-icon">⋮</span>
              <span class="pane-name">soy-latte-order</span>
              <span class="pane-agent">(cc)</span>
            </div>
            <div class="pane-prompt">"Create an order form for my s…"</div>
            <div class="pane-status">
              <span class="status-icon">✻</span>
              <span class="status-text">Working...</span>
            </div>
          </div>
          <div class="pane-card active-pane">
            <div class="pane-header">
              <span class="pane-icon">⋮</span>
              <span class="pane-name">coffee-order-api</span>
              <span class="pane-agent">(cc)</span>
            </div>
            <div class="pane-prompt">"Create an api endpoint for che…"</div>
            <div class="pane-status">
              <span class="status-icon">✻</span>
              <span class="status-text">Working...</span>
            </div>
          </div>
          <div class="pane-card new-pane">
            <div class="pane-header">
              <span class="pane-icon">+</span>
              <span class="pane-name">New dmux pane</span>
            </div>
            <div class="pane-empty"></div>
          </div>
        </div>
        <div class="terminal-footer">
          <div class="terminal-commands">Commands: <span class="cmd-key">[j]</span>ump • <span class="cmd-key">[m]</span>enu • <span class="cmd-key">[x]</span>close • <span class="cmd-key">[n]</span>ew • <span class="cmd-key">[r]</span>emote • <span class="cmd-key">[q]</span>uit</div>
          <div class="terminal-hint">Use arrow keys (↑↓←→) for spatial navigation, Enter to select</div>
          <div class="terminal-version">v2.2.1</div>
        </div>
      </div>
    `;
  }

  function createMenuScreen() {
    return `
      <div class="terminal-screen">
        <div class="terminal-box menu-box">
          <div class="menu-header">Menu: soy-latte-order</div>
          <div class="menu-content">
            <div class="menu-item active"><span class="menu-arrow">▶</span> View</div>
            <div class="menu-item">  Close</div>
            <div class="menu-item">  Merge</div>
            <div class="menu-item">  Rename</div>
            <div class="menu-item">  Copy Path</div>
            <div class="menu-item">  Open in Editor</div>
            <div class="menu-item">  Toggle Autopilot</div>
          </div>
          <div class="menu-footer">↑↓ to navigate • Enter to select • ESC to cancel</div>
        </div>
      </div>
    `;
  }

  function createMergeDialog() {
    return `
      <div class="terminal-screen">
        <div class="terminal-box menu-box">
          <div class="menu-header">Worktree Has Uncommitted Changes</div>
          <div class="menu-content">
            <div class="merge-info">Changes in:</div>
            <div class="merge-files">
              <div>src/components/OrderForm.tsx</div>
              <div>src/api/orders.ts</div>
              <div>src/styles/form.css</div>
              <div>package.json</div>
              <div>...</div>
            </div>
            <div class="menu-spacer"></div>
            <div class="menu-item active"><span class="menu-arrow">▶</span> AI commit (editable) - Generate message from diff, edit before commit</div>
            <div class="menu-item">  AI commit (automatic) - Auto-generate and commit immediately</div>
            <div class="menu-item">  Manual commit message - Write your own commit message</div>
            <div class="menu-item">  Cancel merge - Resolve manually later</div>
          </div>
          <div class="menu-footer">↑↓ to navigate • Enter to select • ESC to cancel</div>
        </div>
      </div>
    `;
  }

  function createClosePaneDialog() {
    return `
      <div class="terminal-screen">
        <div class="terminal-box menu-box">
          <div class="menu-header">Close Pane?</div>
          <div class="menu-content">
            <div class="merge-info">Merge successful! Close pane "soy-latte-order"?</div>
            <div class="menu-spacer"></div>
            <div class="menu-item active"><span class="menu-arrow">▶</span> Yes - Close pane and remove worktree</div>
            <div class="menu-item">  No - Keep pane open</div>
          </div>
          <div class="menu-footer">↑↓ to navigate • Enter to select • ESC to cancel</div>
        </div>
      </div>
    `;
  }

  function createFinalTwoPaneScreen() {
    return `
      <div class="terminal-screen">
        <div class="pane-grid">
          <div class="pane-card active-pane">
            <div class="pane-header">
              <span class="pane-icon">⋮</span>
              <span class="pane-name">coffee-order-api</span>
              <span class="pane-agent">(cc)</span>
            </div>
            <div class="pane-prompt">"Create an api endpoint for che…"</div>
            <div class="pane-status">
              <span class="status-icon">✻</span>
              <span class="status-text">Working...</span>
            </div>
          </div>
          <div class="pane-card new-pane">
            <div class="pane-header">
              <span class="pane-icon">+</span>
              <span class="pane-name">New dmux pane</span>
            </div>
            <div class="pane-empty"></div>
          </div>
        </div>
        <div class="terminal-footer">
          <div class="terminal-commands">Commands: <span class="cmd-key">[j]</span>ump • <span class="cmd-key">[m]</span>enu • <span class="cmd-key">[x]</span>close • <span class="cmd-key">[n]</span>ew • <span class="cmd-key">[r]</span>emote • <span class="cmd-key">[q]</span>uit</div>
          <div class="terminal-hint">Use arrow keys (↑↓←→) for spatial navigation, Enter to select</div>
          <div class="terminal-version">v2.2.1</div>
        </div>
      </div>
    `;
  }

  // Step 0: Empty terminal (initial state)
  function showEmptyTerminal() {
    terminalOutput.innerHTML = '';
  }

  // Step 1: Show prompt screen
  function showPromptScreen() {
    terminalOutput.innerHTML = createPromptScreen();
  }

  // Type out user input character by character
  function typeUserInput() {
    const userInputEl = terminalOutput.querySelector('.user-input');
    const cursor = terminalOutput.querySelector('.cursor');

    if (!userInputEl || !cursor) return;

    if (typingIndex < userPrompt.length) {
      userInputEl.textContent += userPrompt[typingIndex];
      typingIndex++;
      setTimeout(typeUserInput, 80); // Typing speed
    } else {
      // Typing done, hide cursor and show agent select after delay
      setTimeout(() => {
        cursor.style.display = 'none';
        setTimeout(showAgentSelect, 500);
      }, 500);
    }
  }

  // Step 2: Show agent selection screen
  function showAgentSelect() {
    terminalOutput.innerHTML = createAgentSelectScreen();

    // Start cycling through agents
    setTimeout(cycleAgents, 500);
  }

  // Cycle through agent options
  function cycleAgents() {
    agentIndex++;

    // Cycle: Claude Code (0) → opencode (1) → Codex (2) → back to Claude Code (3 wraps to 0)
    if (agentIndex > agents.length) {
      // We've completed the full cycle back to Claude Code
      setTimeout(showPaneScreen, 800);
      return;
    }

    const actualIndex = agentIndex % agents.length;

    // Update the active agent and arrow visibility
    const agentOptions = terminalOutput.querySelectorAll('.agent');
    agentOptions.forEach((agent, idx) => {
      const arrow = agent.querySelector('.agent-arrow');
      if (idx === actualIndex) {
        agent.classList.add('active');
        if (arrow) arrow.style.visibility = 'visible';
      } else {
        agent.classList.remove('active');
        if (arrow) arrow.style.visibility = 'hidden';
      }
    });

    // Continue cycling
    setTimeout(cycleAgents, 400);
  }

  // Step 3: Show pane with analyzing status
  function showPaneScreen() {
    terminalOutput.innerHTML = createPaneScreen();

    // After 2 seconds, change "Analyzing..." to "✻ Working..."
    setTimeout(() => {
      const statusText = terminalOutput.querySelector('.status-text');
      if (statusText) {
        statusText.textContent = 'Working...';
      }
      const statusIcon = terminalOutput.querySelector('.status-icon');
      if (statusIcon) {
        statusIcon.textContent = '✻';
      }

      // After another 2 seconds, dim the first pane and highlight the new pane
      setTimeout(() => {
        const firstPane = terminalOutput.querySelector('.pane-card.active-pane');
        const newPane = terminalOutput.querySelector('.pane-card.new-pane');

        if (firstPane) {
          firstPane.classList.remove('active-pane');
        }
        if (newPane) {
          newPane.classList.add('active-pane');
          newPane.classList.remove('new-pane');
        }

        // After 1 second, show prompt screen for second task
        setTimeout(() => {
          showPromptScreen();

          // Type the second prompt after 1.5 seconds
          setTimeout(() => {
            typeSecondUserInput();
          }, 1500);
        }, 1000);
      }, 2000);
    }, 2000);
  }

  // Type out second user input
  function typeSecondUserInput() {
    const secondPrompt = 'Create an api endpoint for checking your coffee order\'s status';
    let secondIndex = 0;

    function typeSecond() {
      const userInputEl = terminalOutput.querySelector('.user-input');
      const cursor = terminalOutput.querySelector('.cursor');

      if (!userInputEl || !cursor) return;

      if (secondIndex < secondPrompt.length) {
        userInputEl.textContent += secondPrompt[secondIndex];
        secondIndex++;
        setTimeout(typeSecond, 80);
      } else {
        // Typing done, show the 3-pane screen after a delay
        setTimeout(() => {
          showThreePaneScreen();
        }, 1000);
      }
    }

    typeSecond();
  }

  // Step 4: Show final 3-pane screen with both tasks working
  function showThreePaneScreen() {
    terminalOutput.innerHTML = createThreePaneScreen();

    // After 2 seconds, change soy-latte-order to "◌ Idle" and highlight it
    setTimeout(() => {
      const firstPane = terminalOutput.querySelector('.pane-card:first-child');
      const secondPane = terminalOutput.querySelector('.pane-card.active-pane');

      if (firstPane) {
        const statusIcon = firstPane.querySelector('.status-icon');
        const statusText = firstPane.querySelector('.status-text');
        if (statusIcon) statusIcon.textContent = '◌';
        if (statusText) statusText.textContent = 'Idle';

        // Highlight first pane, dim second
        firstPane.classList.add('active-pane');
      }
      if (secondPane) {
        secondPane.classList.remove('active-pane');
      }

      // Show menu after 1 second
      setTimeout(() => {
        showMenuScreen();
      }, 1000);
    }, 2000);
  }

  // Show menu and navigate to merge
  function showMenuScreen() {
    terminalOutput.innerHTML = createMenuScreen();

    let menuIndex = 0;
    const menuItems = ['View', 'Close', 'Merge'];

    function navigateMenu() {
      menuIndex++;

      if (menuIndex >= menuItems.length) {
        // Reached "Merge", show merge dialog
        setTimeout(() => {
          showMergeDialog();
        }, 500);
        return;
      }

      // Update active menu item
      const items = terminalOutput.querySelectorAll('.menu-item');
      items.forEach((item, idx) => {
        const arrow = item.querySelector('.menu-arrow');
        if (idx === menuIndex) {
          item.classList.add('active');
          if (!arrow) {
            item.innerHTML = `<span class="menu-arrow">▶</span> ${item.textContent.trim()}`;
          }
        } else {
          item.classList.remove('active');
          if (arrow) {
            item.textContent = '  ' + item.textContent.replace('▶ ', '');
          }
        }
      });

      setTimeout(navigateMenu, 400);
    }

    setTimeout(navigateMenu, 600);
  }

  // Show merge dialog and navigate to automatic commit
  function showMergeDialog() {
    terminalOutput.innerHTML = createMergeDialog();

    setTimeout(() => {
      // Move to "AI commit (automatic)"
      const items = terminalOutput.querySelectorAll('.menu-item');
      items.forEach((item, idx) => {
        const arrow = item.querySelector('.menu-arrow');
        if (idx === 1) {
          item.classList.add('active');
          if (!arrow) {
            item.innerHTML = `<span class="menu-arrow">▶</span> ${item.textContent.trim()}`;
          }
        } else {
          item.classList.remove('active');
          if (arrow) {
            item.textContent = '  ' + item.textContent.replace('▶ ', '');
          }
        }
      });

      // Show close pane dialog after commit
      setTimeout(() => {
        showClosePaneDialog();
      }, 1000);
    }, 800);
  }

  // Show close pane confirmation dialog
  function showClosePaneDialog() {
    terminalOutput.innerHTML = createClosePaneDialog();

    // Pause for 1.5 seconds, then show final screen
    setTimeout(() => {
      showFinalScreen();
    }, 1500);
  }

  // Show final 2-pane screen
  function showFinalScreen() {
    terminalOutput.innerHTML = createFinalTwoPaneScreen();
    // Final state
  }

  // Function to start the animation sequence
  function startAnimation() {
    // Reset state
    typingIndex = 0;
    agentIndex = 0;

    // Show prompt screen first
    setTimeout(() => {
      showPromptScreen();

      // Pause on prompt screen for 1.5 seconds before typing
      setTimeout(() => {
        typeUserInput();
      }, 1500);
    }, 300);
  }

  // Listen for dmux typing completion to start the simulation
  window.addEventListener('dmuxTypingComplete', () => {
    if (!hasStarted) {
      hasStarted = true;
      startAnimation();
    }
  });

  // Add play again button handler
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('play-again-link')) {
      e.preventDefault();
      terminalOutput.innerHTML = '';
      startAnimation();
    }
  });

  // Initialize with empty terminal (wait for dmux typing to complete)
  showEmptyTerminal();
}
