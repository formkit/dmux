# Quick Start: Vue Frontend

## Build & Run

```bash
# First time setup
npm install
cd frontend && npm install && cd ..

# Build everything
npm run build

# Run dmux
./dmux
```

## Development

```bash
# Terminal 1: Frontend dev server (hot reload)
npm run dev:frontend
# Opens http://localhost:5173

# Terminal 2: Backend
npm run dev
```

## File Structure

```
frontend/src/
├── components/
│   ├── Dashboard.vue    ← Main dashboard component
│   └── Terminal.vue     ← Terminal viewer (placeholder)
├── dashboard.ts         ← Dashboard entry point
├── terminal.ts          ← Terminal entry point
└── styles.css           ← Global styles
```

## Edit Frontend

1. Edit `frontend/src/components/Dashboard.vue`
2. Save (hot reload updates instantly in dev mode)
3. For production: `npm run build`

## Common Tasks

```bash
# Clean all builds
npm run clean

# Rebuild everything
npm run build

# Build just frontend
npm run build:frontend

# Check types
npm run typecheck
```

## Key URLs

- Dashboard: `http://localhost:{port}/`
- Terminal viewer: `http://localhost:{port}/panes/{paneId}`
- API: `http://localhost:{port}/api/panes`

## Troubleshooting

**Build fails?**
```bash
cd frontend && npm install
npm run clean && npm run build
```

**Can't find files?**
```bash
ls frontend/dist/  # Should show dashboard.html, etc.
npm run build:frontend  # Rebuild if empty
```

**Hot reload not working?**
- Make sure you're running `npm run dev:frontend`
- Access via `http://localhost:5173` (Vite dev server)

## What Changed

Before: Vue code in strings (`src/server/static.ts`)
After: Proper Vue files (`frontend/src/components/*.vue`)

Benefits:
✅ IDE support
✅ Type checking
✅ Hot reload
✅ Optimized builds
