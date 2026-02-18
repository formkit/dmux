/**
 * Content registry - all pages and section definitions
 */

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
    page.load = () => import(`./${page.path.slice(1)}.js`);
  }
}
