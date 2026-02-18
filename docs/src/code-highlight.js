/**
 * Lightweight syntax highlighting and copy-to-clipboard for code blocks.
 * Uses token placeholders to prevent regex passes from corrupting each other.
 */

const KEYWORDS = /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|default|async|await|new|this|try|catch|throw|typeof|interface|type|extends|implements|enum|readonly|true|false|null|undefined|void|string|number|boolean)\b/g;
const STRINGS = /(["'`])(?:(?=(\\?))\2.)*?\1/g;
const COMMENTS = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
const NUMBERS = /\b(\d+\.?\d*)\b/g;
const FUNCTIONS = /\b([a-zA-Z_]\w*)\s*(?=\()/g;
const SHELL_COMMENT = /^(\s*#.*)$/gm;
const SHELL_CMD = /^(\s*)(npm|npx|pnpm|yarn|curl|git|cd|mkdir|cat|echo|tmux|dmux|ls|rm|cp|mv|sudo|brew|apt|pip|node|deno|bun|chmod|export)\b/gm;
const SHELL_FLAG = /\s(--?[\w-]+)/g;
const JSON_KEY = /("[\w-]+")\s*:/g;

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Replace regex matches with placeholder tokens to prevent later passes
 * from matching inside previously-inserted span tags.
 */
function tok(text, regex, cls, tokens) {
  return text.replace(regex, (match) => {
    const i = tokens.length;
    tokens.push(`<span class="${cls}">${match}</span>`);
    return `\x00${i}\x00`;
  });
}

function restore(text, tokens) {
  return text.replace(/\x00(\d+)\x00/g, (_, i) => tokens[i]);
}

function highlightJS(code) {
  const tokens = [];
  let r = escapeHtml(code);
  r = tok(r, COMMENTS, 'hl-comment', tokens);
  r = tok(r, STRINGS, 'hl-string', tokens);
  r = tok(r, KEYWORDS, 'hl-keyword', tokens);
  r = tok(r, NUMBERS, 'hl-number', tokens);
  r = tok(r, FUNCTIONS, 'hl-fn', tokens);
  return restore(r, tokens);
}

function highlightShell(code) {
  const tokens = [];
  let r = escapeHtml(code);
  r = tok(r, SHELL_COMMENT, 'hl-comment', tokens);
  r = tok(r, STRINGS, 'hl-string', tokens);
  // SHELL_CMD: preserve leading whitespace, only highlight the command
  r = r.replace(SHELL_CMD, (match, ws, cmd) => {
    const i = tokens.length;
    tokens.push(`<span class="hl-keyword">${cmd}</span>`);
    return `${ws}\x00${i}\x00`;
  });
  // SHELL_FLAG: preserve leading space, only highlight the flag
  r = r.replace(SHELL_FLAG, (match, flag) => {
    const i = tokens.length;
    tokens.push(`<span class="hl-fn">${flag}</span>`);
    return ` \x00${i}\x00`;
  });
  return restore(r, tokens);
}

function highlightJSON(code) {
  const tokens = [];
  let r = escapeHtml(code);
  r = tok(r, STRINGS, 'hl-string', tokens);
  // JSON_KEY: highlight the key, preserve the colon
  r = r.replace(JSON_KEY, (match, key) => {
    const i = tokens.length;
    tokens.push(`<span class="hl-fn">${key}</span>`);
    return `\x00${i}\x00:`;
  });
  r = tok(r, NUMBERS, 'hl-number', tokens);
  r = tok(r, /\b(true|false|null)\b/g, 'hl-keyword', tokens);
  return restore(r, tokens);
}

export function highlight(code, lang) {
  if (!lang) lang = '';
  lang = lang.toLowerCase().trim();
  if (['bash', 'sh', 'shell', 'zsh'].includes(lang)) return highlightShell(code);
  if (['json', 'jsonc'].includes(lang)) return highlightJSON(code);
  if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(lang)) return highlightJS(code);
  return escapeHtml(code);
}

export function processCodeBlocks(container) {
  container.querySelectorAll('pre code').forEach((block) => {
    const lang = block.dataset.lang || '';
    const raw = block.textContent;
    block.innerHTML = highlight(raw, lang);

    const pre = block.parentElement;
    if (pre && !pre.querySelector('.code-copy')) {
      const btn = document.createElement('button');
      btn.className = 'code-copy';
      btn.title = 'Copy to clipboard';
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(raw).then(() => {
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
          setTimeout(() => {
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
          }, 2000);
        });
      });
      pre.style.position = 'relative';
      pre.appendChild(btn);
    }

    if (lang && !pre.querySelector('.code-lang')) {
      const label = document.createElement('span');
      label.className = 'code-lang';
      label.textContent = lang;
      pre.appendChild(label);
    }
  });
}
