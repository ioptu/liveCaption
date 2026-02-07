import { pipeline, env } from './lib/transformers.min.js';

// --- 核心配置修改 ---
// 1. 明确告诉插件只从本地加载
env.allowRemoteModels = false; 
env.allowLocalModels = true;

// 2. 这里的路径非常关键！它是相对于 worker.js 的位置
// 我们的结构是 src/worker.js 和 models/whisper-base/
// 所以需要先跳出 src (../) 进入 models
env.localModelPath = '../models/'; 

// 3. 既然是纯原生加载，关闭浏览器缓存检查，完全依赖扩展本地文件
env.useBrowserCache = false;

// 4. 核心：禁止从 CDN 加载 WebAssembly 内核
// 告诉引擎不要去 cdn.jsdelivr.net 找那些 .mjs 文件
env.backends.onnx.wasm.wasmPaths = 'lib/'; 
// 如果你使用的是 3.x 版本的 transformers.js，使用以下设置
env.backends.onnx.wasm.proxy = false; 

// 5. 针对 WebGPU 的路径特殊处理
// 强制让它在本地寻找 jsep (WebGPU) 内核文件
env.backends.onnx.wasm.numThreads = 1;

let transcriber = null;

async function loadModel() {
  if (!transcriber) {
    console.log("Worker: 正在加载本地 WebGPU 模型...");
    try {
      // 注意：这里的第二个参数只需要写文件夹名 'whisper-base'
      // 它会自动拼接到 env.localModelPath 后面
      transcriber = await pipeline('automatic-speech-recognition', 'whisper-base', {
        device: 'webgpu',
        // 显式开启量化支持
        quantized: true,
        // 显式指定分词器和配置都在本地
        revision: 'main', 
      });
      console.log("Worker: 模型加载成功");
    } catch (err) {
      console.error("模型加载失败，请检查 models 目录结构是否完整:", err);
    }
  }
}

self.onmessage = async (e) => {
  const { type, audio } = e.data;

  if (type === 'run') {
    if (!transcriber) await loadModel();

    try {
      // 实时流式优化的参数
      const output = await transcriber(audio, {
        language: 'chinese',
        task: 'transcribe',
        // 滑动窗口的核心参数
        chunk_length_s: 30,
        stride_length_s: 5,
        // 关键：强制返回文本
        return_timestamps: false,
        // 提示：你可以加入初始提示词，减少幻听
        prompt: "以下是普通话实时字幕：", 
      });

      self.postMessage({
        status: 'complete',
        text: output.text
      });

    } catch (err) {
      // 如果是因为音频太短报错，可以忽略
      console.error("推理执行中发生错误:", err);
    }
  }
};
