/**
 * Content registry - all pages and section definitions
 */

import * as introduction from './introduction.js';
import * as gettingStarted from './getting-started.js';
import * as coreConcepts from './core-concepts.js';
import * as keyboardShortcuts from './keyboard-shortcuts.js';
import * as merging from './merging.js';
import * as hooks from './hooks.js';
import * as configuration from './configuration.js';
import * as agents from './agents.js';
import * as multiAgent from './multi-agent.js';
import * as multiProject from './multi-project.js';

const modules = {
  introduction,
  'getting-started': gettingStarted,
  'core-concepts': coreConcepts,
  'keyboard-shortcuts': keyboardShortcuts,
  merging,
  hooks,
  configuration,
  agents,
  'multi-agent': multiAgent,
  'multi-project': multiProject,
};

export const sections = [
  {
    title: 'Overview',
    pages: [
      { path: '/introduction', title: 'Introduction' },
      { path: '/getting-started', title: 'Getting Started' },
    ],
  },
  {
    title: 'Usage',
    pages: [
      { path: '/core-concepts', title: 'Core Concepts' },
      { path: '/keyboard-shortcuts', title: 'Keyboard Shortcuts' },
      { path: '/merging', title: 'Merging' },
    ],
  },
  {
    title: 'Advanced',
    pages: [
      { path: '/hooks', title: 'Hooks' },
      { path: '/configuration', title: 'Configuration' },
      { path: '/agents', title: 'Agents' },
      { path: '/multi-agent', title: 'Multi-Agent' },
      { path: '/multi-project', title: 'Multi-Project' },
    ],
  },
];

// Add load function to each page
for (const section of sections) {
  for (const page of section.pages) {
    const key = page.path.slice(1);
    page.load = () => Promise.resolve(modules[key]);
  }
}
