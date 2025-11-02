import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Security: Disable sourcemaps in production
    sourcemap: false,
    
    // Production optimizations
    minify: 'esbuild',
    // Note: Console statements are handled by logger utility (only logs in dev mode)
    // For additional console removal, install: npm install -D vite-plugin-remove-console
    // Then add: import removeConsole from 'vite-plugin-remove-console';
    // And add to plugins array: removeConsole()
    
    // Security: Don't expose file structure
    rollupOptions: {
      output: {
        // Obfuscate chunk file names with hashes
        chunkFileNames: 'assets/[hash].js',
        entryFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
      },
    },
    
    // Security: Chunk size warnings
    chunkSizeWarningLimit: 1000,
  },
  
  // Security: Define environment variables (prevent accidental exposure)
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
