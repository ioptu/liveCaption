import { pipeline, env } from './lib/transformers.min.js'; 
// 注意：如果你没有本地 transformers.min.js，你需要从 CDN 引入，
// 但 MV3 限制 CDN，建议下载 transformer.js 到本地 lib 目录。
// 假设你已经把 transformers.js 放到了 src/lib/ 或者直接引用 node_modules

// 配置 transformers.js
env.allowLocalModels = true;
env.useBrowserCache = false;

let transcriber = null;

// 初始化模型
async function loadModel() {
  if (!transcriber) {
    console.log("Worker: 正在加载模型...");
    // 确保你的 public/models/whisper-base 文件夹里有 config.json, tokenizer.json 等
    transcriber = await pipeline('automatic-speech-recognition', '../models/whisper-base', {
      device: 'webgpu', // 强制 WebGPU
      quantized: true   // 使用量化版
    });
    console.log("Worker: 模型加载完毕");
  }
}

self.onmessage = async (e) => {
  const { type, audio } = e.data;

  if (type === 'run') {
    if (!transcriber) await loadModel();

    try {
      // Whisper 调用
      // chunk_length_s: 30 确保利用完整的滑动窗口上下文
      const output = await transcriber(audio, {
        language: 'chinese',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false // 实时字幕不需要时间戳，只要字
      });

      self.postMessage({
        status: 'complete',
        text: output.text
      });

    } catch (err) {
      console.error("推理错误:", err);
    }
  }
};
