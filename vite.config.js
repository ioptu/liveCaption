import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false, // 调试时建议关闭混淆，正式版可开启
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/background.js'),
        content: path.resolve(__dirname, 'src/content.js'),
        offscreen: path.resolve(__dirname, 'src/offscreen.html'), // 这是一个 HTML 入口
      },
      output: {
        // 保持文件名简单，方便在 manifest.json 中引用
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          // 自动把 Transformers.js 需要的 WASM 文件复制到 dist/wasm
          src: 'node_modules/@xenova/transformers/dist/*.wasm',
          dest: 'wasm',
        },
      ],
    }),
  ],
});
