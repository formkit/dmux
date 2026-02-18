/**
 * Floating navigation with scroll-spy active state
 */

import { sections } from './content/index.js';

let navContainer = null;

export function initSidebar() {
  navContainer = document.getElementById('sidebar-nav');
  renderNav(navContainer);
}

export function updateActiveSection(sectionId) {
  if (!navContainer) return;
  navContainer.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.section === sectionId);
  });
}

function renderNav(container) {
  let html = '';
  for (const section of sections) {
    html += `<div class="mb-1.5">`;
    html += `<div class="py-2 font-[var(--font-display)] text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-dimmer">${section.title}</div>`;
    for (const page of section.pages) {
      const sectionId = page.path.slice(1);
      html += `<a href="#${sectionId}" class="nav-link" data-section="${sectionId}">${page.title}</a>`;
    }
    html += `</div>`;
  }
  container.innerHTML = html;
}
