# dmux Documentation Site

Single-page marketing and documentation site for dmux.

## Development

```bash
# Install dependencies (from project root)
pnpm install

# Start dev server
cd docs
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Features

- 🌙 Dark mode only, CLI-inspired design
- ⚡ Fast, single-page application
- 🎨 Animated terminal-style UI
- 📱 Fully responsive
- 🎯 SEO optimized
- 🚀 Built with Vite for optimal performance

## Structure

- `src/index.html` - Main HTML structure
- `src/style.css` - All styles (terminal theme)
- `src/script.js` - Interactive features and animations
- `dist/` - Production build output (generated)

## Deployment

The `dist/` directory can be deployed to any static hosting service:

- Netlify
- Vercel
- GitHub Pages
- Cloudflare Pages
- AWS S3 + CloudFront

Simply run `pnpm build` and deploy the `dist/` directory.
