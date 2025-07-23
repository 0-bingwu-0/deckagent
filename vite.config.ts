import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Proxy API requests to avoid CORS issues - for requests with session ID
      '/api/agent/sessions': {
        // target: 'https://resume-agent-692250778971.us-central1.run.app',
        // target: 'https://cold-newt-22.deno.dev',
        target: 'http://0.0.0.0:9001',
        changeOrigin: false,
        rewrite: (path) => {
          return '/apps/deck_agent/users/u_123/sessions';
        },
        secure: true,
      },
      '/api/agent/run': {
        // target: 'https://resume-agent-692250778971.us-central1.run.app',
        // target: 'https://cold-newt-22.deno.dev',
        target: 'http://0.0.0.0:9001',
        changeOrigin: false,
        rewrite: (path) => {
          // Check if there's a session ID in the path
          return '/run';
        },
        secure: true,
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
