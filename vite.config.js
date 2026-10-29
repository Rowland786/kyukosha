import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pages = ['index', 'guide', 'report', 'track', 'archive', 'about', 'desk'];

// 页面里写 <include src="header.html" page="guide"></include>，构建时换成 partials 里的片段
function partials() {
  return {
    name: 'kyukosha-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(/<include src="([^"]+)"(?: page="([^"]*)")?\s*><\/include>/g, (_, file, page) => {
          let part = readFileSync(resolve(__dirname, 'src/partials', file), 'utf8');
          if (page) part = part.replace(`data-nav="${page}"`, `data-nav="${page}" aria-current="page"`);
          return part;
        });
      },
    },
  };
}

export default defineConfig({
  base: '/kyukosha/',
  plugins: [partials()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 2048,
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p, resolve(__dirname, p === 'index' ? 'index.html' : `${p}/index.html`)])),
    },
  },
  server: { port: 5178 },
});
