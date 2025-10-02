# Vue Frontend Migration Plan

## Overview
Migrating from string-based Vue code in `static.ts` to a proper filesystem-based frontend with Vite bundling.

## Current State
- ✅ Frontend directory structure created (`frontend/`)
- ✅ Vite configured with multi-page build
- ✅ Package.json created for frontend
- ✅ Assets extracted from `static.ts`:
  - `styles.css` (extracted)
  - `extracted-dashboard.js` (676 lines)
  - `extracted-terminal.js` (842 lines)

## Migration Strategy

### Phase 1: Setup & Configuration ✅
1. Create `frontend/` directory with proper structure
2. Set up Vite with Vue plugin
3. Configure multi-page build (dashboard + terminal)
4. Extract existing assets from strings

### Phase 2: Component Migration (IN PROGRESS)
1. Convert extracted JS to proper Vue SFCs:
   - `Dashboard.vue` - Main dashboard component
   - `Terminal.vue` - Terminal viewer component
   - Break down into smaller components:
     - `PaneCard.vue`
     - `ActionMenu.vue`
     - `CreatePaneDialog.vue`
     - `ActionDialog.vue`

2. Extract composables:
   - `usePanes.ts` - Pane management logic
   - `useTheme.ts` - Theme switching logic
   - `useActions.ts` - Action system logic

3. Extract utilities:
   - `api.ts` - API client functions
   - `types.ts` - TypeScript interfaces

### Phase 3: Build Integration
1. Update `package.json` scripts to build frontend
2. Modify `dmux` executable wrapper to bundle frontend
3. Update server to serve from `frontend/dist` instead of strings
4. Handle development vs production modes

### Phase 4: Testing
1. Test development mode with hot reload
2. Test production build
3. Verify all features work:
   - Pane creation
   - Action menus
   - Theme switching
   - Terminal viewer
   - Status updates

## Directory Structure

```
frontend/
├── package.json
├── vite.config.ts
├── src/
│   ├── dashboard.html          # Entry point for dashboard
│   ├── dashboard.ts            # Dashboard bootstrap
│   ├── terminal.html           # Entry point for terminal
│   ├── terminal.ts             # Terminal bootstrap
│   ├── styles.css              # Global styles
│   ├── components/
│   │   ├── Dashboard.vue       # Main dashboard
│   │   ├── Terminal.vue        # Main terminal viewer
│   │   ├── PaneCard.vue       # Individual pane card
│   │   ├── ActionMenu.vue     # Kebab menu
│   │   ├── CreatePaneDialog.vue
│   │   └── ActionDialog.vue
│   ├── composables/
│   │   ├── usePanes.ts
│   │   ├── useTheme.ts
│   │   └── useActions.ts
│   └── utils/
│       ├── api.ts
│       └── types.ts
└── dist/                       # Build output (gitignored)
    ├── dashboard.html
    ├── dashboard.js
    ├── terminal.html
    ├── terminal.js
    └── styles.css
```

## Build Process

### Development
```bash
cd frontend
npm run dev  # Starts Vite dev server on port 5173
```

### Production
```bash
cd frontend
npm run build  # Builds to frontend/dist/

cd ..
npm run build  # Builds TypeScript backend
# The dmux executable should bundle frontend/dist into the binary
```

## Server Changes

Update `src/server/routes.ts`:
```typescript
// Instead of:
app.get('/', () => getDashboardHtml());
app.get('/styles.css', () => getDashboardCss());
app.get('/dashboard.js', () => getDashboardJs());

// Use:
app.get('/', serveFromDist('dashboard.html'));
app.get('/dashboard.js', serveFromDist('dashboard.js'));
app.get('/styles.css', serveFromDist('styles.css'));
```

## Benefits

1. **Developer Experience**
   - Proper syntax highlighting in VS Code
   - Vue tooling (Volar, Vue DevTools)
   - Hot module reload during development
   - Type checking for TypeScript

2. **Maintainability**
   - Separate concerns (template, script, style)
   - Component reusability
   - Easier to test
   - Better code organization

3. **Performance**
   - Vite's optimized builds
   - Tree-shaking
   - Code splitting
   - Minification

4. **Scalability**
   - Easy to add new components
   - Can use npm packages directly
   - Better state management options
   - Can add routing if needed

## Next Steps

1. Manually create `Dashboard.vue` from extracted template/script
2. Create `Terminal.vue` similarly
3. Extract common components (PaneCard, etc.)
4. Set up composables for shared logic
5. Update build scripts
6. Update server to serve from dist
7. Test thoroughly
8. Remove `static.ts` file

## Notes

- The extracted files are in `frontend/` for reference
- Original `static.ts` remains until migration is complete
- Development mode can run Vite server separately
- Production mode bundles everything into `dist/`
