/**
 * App entry point: single-page layout with scroll-spy navigation
 */

import { initSidebar, updateActiveSection } from './sidebar.js';
import { renderHero, fetchStars, formatStars } from './hero.js';
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
  bindEarlyAccessForm();

  // Initialize sidebar with scroll-spy
  initSidebar();
  setupScrollSpy();

  // Fetch stars async (update badge in-place to avoid re-triggering hero animations)
  const count = await fetchStars();
  if (count) {
    const badge = heroContainer.querySelector('.hero-star-badge');
    if (badge) {
      badge.textContent = formatStars(count);
      badge.classList.remove('hidden');
    }
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

function bindEarlyAccessForm() {
  const form = document.getElementById('sa-early-access-form');
  if (!form) return;
  const btn = document.getElementById('sa-submit-btn');
  const label = btn.querySelector('.sa-submit-label');
  const spinner = btn.querySelector('.sa-submit-spinner');
  const errorMsg = document.getElementById('sa-error-msg');
  const formWrapper = document.getElementById('sa-form-wrapper');
  const successMsg = document.getElementById('sa-success-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('sa-name-input').value.trim();
    const email = document.getElementById('sa-email-input').value.trim();
    if (!name || !email) return;

    // Loading state
    btn.disabled = true;
    label.classList.add('hidden');
    spinner.classList.remove('hidden');
    errorMsg.classList.add('hidden');

    try {
      const res = await fetch('/api/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      // Success — slide form out, show success message
      formWrapper.classList.add('sa-slide-out');
      formWrapper.addEventListener('animationend', () => {
        formWrapper.classList.add('hidden');
        successMsg.classList.remove('hidden');
        successMsg.classList.add('sa-slide-in');
      }, { once: true });
    } catch (err) {
      // Reset button
      btn.disabled = false;
      label.classList.remove('hidden');
      spinner.classList.add('hidden');
      // Show error
      errorMsg.textContent = err.message;
      errorMsg.classList.remove('hidden');
    }
  });
}

init();
