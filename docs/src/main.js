/**
 * App entry point: single-page layout with scroll-spy navigation
 */

import { initSidebar, updateActiveSection } from './sidebar.js';
import { renderHero, fetchStars, updateStarCount } from './hero.js';
import { processCodeBlocks } from './code-highlight.js';
import { sections } from './content/index.js';

async function init() {
  // Render hero
  const heroContainer = document.getElementById('hero-container');
  heroContainer.innerHTML = renderHero(null);
  bindCopyBtn();

  // Load and render all content sections
  const contentEl = document.getElementById('content');
  let html = '';

  for (const section of sections) {
    for (const page of section.pages) {
      const mod = await page.load();
      const sectionId = page.path.slice(1); // "/introduction" -> "introduction"
      // Rewrite internal links from #/xxx to #xxx for single-page anchors
      const rendered = mod.render().replace(/href="#\//g, 'href="#');
      html += `<section id="${sectionId}" class="doc-section">${rendered}</section>`;
    }
  }

  contentEl.innerHTML = html;
  processCodeBlocks(contentEl);

  // Initialize sidebar with scroll-spy
  initSidebar();
  setupScrollSpy();

  // Fetch stars async
  const count = await fetchStars();
  if (count) {
    updateStarCount(count);
    // Re-render hero with star count
    heroContainer.innerHTML = renderHero(count);
    bindCopyBtn();
  }

  // Handle initial hash anchor
  if (window.location.hash) {
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) {
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }
}

function setupScrollSpy() {
  const sectionEls = document.querySelectorAll('.doc-section');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          updateActiveSection(entry.target.id);
          break;
        }
      }
    },
    { rootMargin: '-10% 0px -80% 0px' }
  );

  for (const el of sectionEls) {
    observer.observe(el);
  }
}

function bindCopyBtn() {
  const btn = document.getElementById('hero-copy-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText('npm -g i dmux').then(() => {
      btn.querySelector('.hero-copy-icon').classList.add('hidden');
      btn.querySelector('.hero-check-icon').classList.remove('hidden');
      setTimeout(() => {
        btn.querySelector('.hero-copy-icon').classList.remove('hidden');
        btn.querySelector('.hero-check-icon').classList.add('hidden');
      }, 1500);
    });
  });
}

init();
