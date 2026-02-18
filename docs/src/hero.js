/**
 * Hero section with large logo, tagline, and GitHub stars
 */

export function renderHero(starCount) {
  return `
    <div class="hero relative text-center pt-24 pb-20 px-8 overflow-hidden max-sm:pt-16 max-sm:pb-14 max-sm:px-5">
      <div class="relative z-1">
        <div class="relative inline-block mb-10">
          <img src="/dmux.svg" alt="dmux" class="h-44 w-auto relative z-1 drop-shadow-[0_0_80px_rgba(234,100,0,0.35)] max-sm:h-28" style="animation: hero-logo-in 0.8s cubic-bezier(0.16,1,0.3,1) both" />
          <div class="hero-scanlines absolute -inset-x-12 -inset-y-6 pointer-events-none z-2 rounded"></div>
        </div>
        <p class="font-[var(--font-display)] text-[42px] font-bold text-text-primary mb-4 tracking-[-0.035em] leading-[1.15] max-sm:text-[26px]" style="animation: fade-up 0.7s 0.1s cubic-bezier(0.16,1,0.3,1) both">Parallel agents with tmux and worktrees</p>
        <p class="text-[17px] text-text-secondary max-w-[520px] mx-auto mb-10 leading-[1.65] max-sm:text-[15px]" style="animation: fade-up 0.7s 0.2s cubic-bezier(0.16,1,0.3,1) both">Manage multiple AI coding agents in isolated git worktrees. Branch, develop, and merge &mdash; all in parallel.</p>
        <div class="flex gap-3 justify-center items-stretch flex-wrap max-sm:flex-col max-sm:items-center" style="animation: fade-up 0.7s 0.3s cubic-bezier(0.16,1,0.3,1) both">
          <a href="#getting-started" class="hero-btn-primary inline-flex items-center gap-2 px-7 h-10 rounded-[10px] font-[var(--font-display)] text-sm font-semibold bg-accent border border-accent shadow-[0_0_24px_rgba(234,100,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-accent-light hover:border-accent-light hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(234,100,0,0.35)] transition-all cursor-pointer max-sm:w-full max-sm:justify-center max-sm:max-w-[280px]">Get Started</a>
          <a href="https://github.com/formkit/dmux" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-5 h-10 rounded-[10px] font-[var(--font-display)] text-sm font-semibold bg-bg-card text-text-primary border border-border-light hover:border-border-hover hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-all cursor-pointer max-sm:w-full max-sm:justify-center max-sm:max-w-[280px]">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="#f0c040" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Star
            ${starCount ? `<span class="bg-accent-glow-mid text-accent px-1.5 py-px rounded-lg text-[11.5px] font-semibold tabular-nums">${formatStars(starCount)}</span>` : ''}
          </a>
          <button id="hero-copy-btn" title="Copy to clipboard" class="hero-install-btn group inline-flex items-center gap-2.5 bg-bg-code border border-border rounded-[10px] px-5 h-10 cursor-pointer hover:border-border-hover hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-all">
            <code class="font-[var(--font-mono)] text-sm font-medium text-accent tracking-[-0.02em] !bg-transparent !border-0 !p-0">npm -g i dmux</code>
            <svg class="hero-copy-icon text-text-dimmer group-hover:text-accent transition-colors" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <svg class="hero-check-icon hidden text-green-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function formatStars(count) {
  if (count >= 1000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(count);
}

const CACHE_KEY = 'dmux_gh_stars';
const CACHE_TTL = 3600000;

export async function fetchStars() {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { count, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return count;
    }
  } catch {}

  try {
    const res = await fetch('https://api.github.com/repos/formkit/dmux');
    if (!res.ok) return null;
    const data = await res.json();
    const count = data.stargazers_count;
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ count, ts: Date.now() })); } catch {}
    return count;
  } catch {
    return null;
  }
}

export function updateStarCount(count) {
  if (count == null) return;
  const formatted = formatStars(count);
  document.querySelectorAll('.hero-star-badge').forEach((el) => {
    el.textContent = formatted;
  });
}
