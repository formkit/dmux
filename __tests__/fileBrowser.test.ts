import { describe, expect, it } from 'vitest';
import {
  buildBrowserSearchEntries,
  buildBrowserTree,
  flattenBrowserTree,
  getAncestorPaths,
  type BrowserSnapshot,
} from '../src/utils/fileBrowser.js';

const snapshot: BrowserSnapshot = {
  rootPath: '/repo',
  files: [
    {
      path: 'README.md',
      name: 'README.md',
      parentPath: null,
      exists: true,
      changed: false,
      statusCode: '',
      statusLabel: '',
    },
    {
      path: 'src/index.ts',
      name: 'index.ts',
      parentPath: 'src',
      exists: true,
      changed: true,
      statusCode: ' M',
      statusLabel: 'M',
    },
    {
      path: 'src/utils/helpers.ts',
      name: 'helpers.ts',
      parentPath: 'src/utils',
      exists: true,
      changed: false,
      statusCode: '',
      statusLabel: '',
    },
    {
      path: 'notes/todo.md',
      name: 'todo.md',
      parentPath: 'notes',
      exists: true,
      changed: true,
      statusCode: '??',
      statusLabel: '??',
    },
  ],
};

describe('file browser tree helpers', () => {
  it('filters to changed files while keeping changed ancestor directories', () => {
    const tree = buildBrowserTree(snapshot, {
      sortMode: 'name',
      filterMode: 'diffed',
    });
    const rows = flattenBrowserTree(tree, new Set(['src', 'notes']));
    const paths = rows.map((row) => row.path);

    expect(paths).toEqual(['notes', 'notes/todo.md', 'src', 'src/index.ts']);
    expect(rows.find((row) => row.path === 'src')?.statusLabel).toBe('M');
    expect(rows.find((row) => row.path === 'notes')?.statusLabel).toBe('M');
  });

  it('renders full-width ascii connectors for nested files', () => {
    const tree = buildBrowserTree(snapshot, {
      sortMode: 'name',
      filterMode: 'all',
    });
    const rows = flattenBrowserTree(tree, new Set(['src', 'src/utils']));
    const helperRow = rows.find((row) => row.path === 'src/utils/helpers.ts');
    const srcRow = rows.find((row) => row.path === 'src');

    expect(srcRow?.displayLabel).toBe('├─ src/');
    expect(helperRow?.displayLabel).toBe('│  │  └─ helpers.ts');
  });

  it('filters nested matches and auto-expands ancestor directories', () => {
    const tree = buildBrowserTree(snapshot, {
      sortMode: 'name',
      filterMode: 'all',
      filterQuery: 'helper',
    });
    const rows = flattenBrowserTree(tree, new Set(), {
      forceExpandDirectories: true,
    });

    expect(rows.map((row) => row.path)).toEqual(['src', 'src/utils', 'src/utils/helpers.ts']);
  });

  it('returns flat search results without parent-only directory rows', () => {
    const rows = buildBrowserSearchEntries(snapshot, {
      sortMode: 'name',
      filterMode: 'all',
      filterQuery: 'helper',
    });

    expect(rows.map((row) => row.path)).toEqual(['src/utils/helpers.ts']);
    expect(rows[0]?.displayLabel).toBe('src/utils/helpers.ts');
  });

  it('includes matching directories in flat search results', () => {
    const rows = buildBrowserSearchEntries(snapshot, {
      sortMode: 'name',
      filterMode: 'all',
      filterQuery: 'utils',
    });

    expect(rows.map((row) => row.path)).toContain('src/utils');
    expect(rows.find((row) => row.path === 'src/utils')?.statusLabel).toBe('');
  });

  it('hides dependency directories unless explicitly targeted', () => {
    const dependencySnapshot: BrowserSnapshot = {
      rootPath: '/repo',
      files: [
        ...snapshot.files,
        {
          path: 'node_modules/pkg/index.js',
          name: 'index.js',
          parentPath: 'node_modules/pkg',
          exists: true,
          changed: false,
          statusCode: '',
          statusLabel: '',
        },
      ],
    };

    const hiddenTree = buildBrowserTree(dependencySnapshot, {
      sortMode: 'name',
      filterMode: 'all',
    });
    const hiddenRows = flattenBrowserTree(hiddenTree, new Set(), {
      forceExpandDirectories: true,
    });
    expect(hiddenRows.some((row) => row.path.startsWith('node_modules'))).toBe(false);

    const targetedTree = buildBrowserTree(dependencySnapshot, {
      sortMode: 'name',
      filterMode: 'all',
      filterQuery: 'node_modules',
    });
    const targetedRows = flattenBrowserTree(targetedTree, new Set(), {
      forceExpandDirectories: true,
    });
    expect(targetedRows.some((row) => row.path === 'node_modules')).toBe(true);
  });

  it('sorts siblings by modified time when requested', () => {
    const modifiedSnapshot: BrowserSnapshot = {
      rootPath: '/repo',
      files: [
        {
          path: 'src/newer.ts',
          name: 'newer.ts',
          parentPath: 'src',
          exists: true,
          changed: false,
          statusCode: '',
          statusLabel: '',
        },
        {
          path: 'src/older.ts',
          name: 'older.ts',
          parentPath: 'src',
          exists: true,
          changed: false,
          statusCode: '',
          statusLabel: '',
        },
      ],
    };

    const tree = buildBrowserTree(modifiedSnapshot, {
      sortMode: 'modified',
      filterMode: 'all',
      modifiedTimes: new Map([
        ['src/newer.ts', 20],
        ['src/older.ts', 10],
      ]),
    });
    const rows = flattenBrowserTree(tree, new Set(['src']));

    expect(rows.map((row) => row.path)).toEqual(['src', 'src/newer.ts', 'src/older.ts']);
  });

  it('returns ancestors from root to parent', () => {
    expect(getAncestorPaths('src/utils/helpers.ts')).toEqual(['src', 'src/utils']);
    expect(getAncestorPaths('README.md')).toEqual([]);
  });
});
