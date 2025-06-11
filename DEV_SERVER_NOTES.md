# Development Server Notes

## Current Status ✅

The development environment is working correctly with the following configuration:

### Working Commands:
- `bun run dev` - Uses webpack dev server (recommended)
- `bun run dev:webpack` - Same as above (alias)

### Known Issues:
- `bun run dev:turbo` - Currently has compatibility issues with Turbopack WASM bindings
- SWC native binaries may be corrupted, falls back to WASM (slower but functional)

### Recommended Workflow:
1. Use `bun run dev` for development (webpack mode)
2. This provides full functionality with hot reload
3. Build process works correctly for production

### Performance Notes:
- Webpack mode may be slightly slower than Turbo but is more stable
- All TypeScript compilation and linting works correctly
- All features (DOCX processing, RAG, etc.) are fully functional

### If you encounter issues:
1. Stop the dev server (Ctrl+C)
2. Clear Next.js cache: `rm -rf .next`
3. Restart with `bun run dev`

The development environment is ready for use! 🚀