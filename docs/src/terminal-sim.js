// Living Terminal Simulation - Realistic dmux Demo
export class TerminalSimulator {
  constructor(element) {
    this.element = element;
    this.lines = [];
    this.currentLine = 0;
    this.charIndex = 0;
    this.isTyping = false;
    this.currentColor = 'var(--text-primary)';

    // Terminal simulation script - realistic dmux workflow
    this.script = [
      { text: '$ dmux', color: 'var(--orange-primary)', delay: 1000, speed: 80 },
      { text: '', delay: 500 },
      { text: '╭─ dmux Panes ─────────────────────────────────────╮', color: 'var(--orange-primary)', delay: 200, speed: 20 },
      { text: '│                                                   │', color: 'var(--orange-primary)', speed: 20 },
      { text: '│  <span class="dim">No panes yet. Press \'n\' to create one.</span>       │', color: 'var(--orange-primary)', speed: 20 },
      { text: '│                                                   │', color: 'var(--orange-primary)', speed: 20 },
      { text: '│  <span class="dim">[n] New  [q] Quit</span>                              │', color: 'var(--orange-primary)', speed: 20 },
      { text: '╰───────────────────────────────────────────────────╯', color: 'var(--orange-primary)', speed: 20 },
      { text: '', delay: 1500 },
      { text: 'Enter prompt: <span class="cursor-blink">█</span>', color: 'var(--text-primary)', delay: 800, persist: true },
      { text: 'Enter prompt: fix authentication bug<span class="cursor-blink">█</span>', color: 'var(--text-primary)', delay: 100, speed: 100, replace: true },
      { text: '', delay: 800, clear: 11 },
      { text: '╭─ dmux Panes ─────────────────────────────────────╮', color: 'var(--orange-primary)', speed: 10 },
      { text: '│                                                   │', color: 'var(--orange-primary)', speed: 10 },
      { text: '│  → <span class="highlight">fix-auth</span>          [<span class="status-working">Working</span>]   Claude Code │', color: 'var(--orange-primary)', speed: 10 },
      { text: '│                                                   │', color: 'var(--orange-primary)', speed: 10 },
      { text: '│  <span class="dim">[j] Jump  [m] Merge  [x] Close  [n] New  [q] Quit</span> │', color: 'var(--orange-primary)', speed: 10 },
      { text: '╰───────────────────────────────────────────────────╯', color: 'var(--orange-primary)', speed: 10 },
      { text: '', delay: 2000 },
      { text: 'Enter prompt: <span class="cursor-blink">█</span>', color: 'var(--text-primary)', delay: 500, persist: true },
      { text: 'Enter prompt: add user dashboard<span class="cursor-blink">█</span>', color: 'var(--text-primary)', delay: 100, speed: 120, replace: true },
      { text: '', delay: 800, clear: 8 },
      { text: '╭─ dmux Panes ─────────────────────────────────────╮', color: 'var(--orange-primary)', speed: 10 },
      { text: '│                                                   │', color: 'var(--orange-primary)', speed: 10 },
      { text: '│  → <span class="highlight">add-dashboard</span>    [<span class="status-working">Working</span>]   Claude Code │', color: 'var(--orange-primary)', speed: 10 },
      { text: '│    fix-auth          [<span class="status-done">Done</span>]      Merged       │', color: 'var(--orange-primary)', speed: 10 },
      { text: '│                                                   │', color: 'var(--orange-primary)', speed: 10 },
      { text: '│  <span class="dim">[j] Jump  [m] Merge  [x] Close  [n] New  [q] Quit</span> │', color: 'var(--orange-primary)', speed: 10 },
      { text: '╰───────────────────────────────────────────────────╯', color: 'var(--orange-primary)', speed: 10 },
      { text: '', delay: 3000, loop: true }
    ];
  }

  async start() {
    await this.runScript();
  }

  async runScript() {
    while (true) {
      for (let i = 0; i < this.script.length; i++) {
        const step = this.script[i];

        // Handle clear command
        if (step.clear) {
          await this.clearLines(step.clear);
          await this.sleep(step.delay || 100);
          continue;
        }

        // Handle replace command
        if (step.replace) {
          this.lines[this.lines.length - 1] = `<span style="color: ${step.color}">${step.text}</span>`;
          this.render();
          await this.sleep(step.delay || 100);
          continue;
        }

        // Type out the line
        await this.typeLine(step.text, step.color || 'var(--text-primary)', step.speed || 30);

        // Wait after typing
        await this.sleep(step.delay || 100);

        // Check if we should loop
        if (step.loop) {
          await this.sleep(2000);
          this.lines = [];
          this.render();
          break; // Restart the script
        }
      }
    }
  }

  async typeLine(text, color, speed) {
    return new Promise(resolve => {
      let charIndex = 0;
      const plainText = text.replace(/<[^>]*>/g, ''); // Remove HTML for char counting
      const lineIndex = this.lines.length;

      // Start with empty line
      this.lines.push('');

      const typeChar = () => {
        if (charIndex < plainText.length) {
          // Build up the visible text with HTML preserved
          const beforeHTML = text.substring(0, this.findHTMLAwareIndex(text, charIndex + 1));
          this.lines[lineIndex] = `<span style="color: ${color}">${beforeHTML}</span>`;
          this.render();
          charIndex++;
          setTimeout(typeChar, speed);
        } else {
          this.lines[lineIndex] = `<span style="color: ${color}">${text}</span>`;
          this.render();
          resolve();
        }
      };

      typeChar();
    });
  }

  findHTMLAwareIndex(htmlText, targetIndex) {
    let visibleCount = 0;
    let htmlIndex = 0;
    let inTag = false;

    while (htmlIndex < htmlText.length && visibleCount < targetIndex) {
      if (htmlText[htmlIndex] === '<') {
        inTag = true;
      } else if (htmlText[htmlIndex] === '>') {
        inTag = false;
        htmlIndex++;
        continue;
      }

      if (!inTag) {
        visibleCount++;
      }
      htmlIndex++;
    }

    return htmlIndex;
  }

  async clearLines(count) {
    this.lines = this.lines.slice(0, -count);
    this.render();
  }

  render() {
    this.element.innerHTML = this.lines.join('\n');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize terminal simulation
export function initTerminalSim() {
  const terminalOutput = document.querySelector('.demo-ui');
  if (!terminalOutput) {
    console.error('Terminal output element not found');
    return;
  }

  const sim = new TerminalSimulator(terminalOutput);
  sim.start();
}
