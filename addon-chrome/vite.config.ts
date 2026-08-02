import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';

// ビルド後に dist 直下に必要なファイルを整備するプラグイン
function postBuildPlugin() {
  return {
    name: 'post-build',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');
      const src = resolve(__dirname, 'src');

      // 生成済みの Vite 版 HTML を dist/src に配置するため、そこからコピーする
      const generatedHtmlDir = resolve(dist, 'src');

      // 古い dist 直下の HTML を削除し、Vite 生成物を dist 直下に移動する
      for (const name of ['popup.html', 'options.html']) {
        const source = resolve(generatedHtmlDir, name);
        const target = resolve(dist, name);
        let html = readFileSync(source, 'utf-8');
        // Chrome 拡張では絶対パス `/assets/...` ではなく相対パス `assets/...` が必要
        html = html.replace(/src="\/assets\//g, 'src="assets/');
        writeFileSync(target, html, 'utf-8');
      }

      // Vite 生成の中間 HTML ディレクトリを削除する
      rmSync(generatedHtmlDir, { recursive: true, force: true });

      // manifest.json を dist 直下にコピーする
      copyFileSync(resolve(src, 'manifest.json'), resolve(dist, 'manifest.json'));
    },
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup.html'),
        options: resolve(__dirname, 'src/options.html'),
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  plugins: [postBuildPlugin()],
});
