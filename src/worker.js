import { pipeline, env } from './lib/transformers.min.js';

let transcriber = null;
let isInitialized = false;

// 监听来自 offscreen.js 的消息
self.onmessage = async (e) => {
  const { type, audio, config } = e.data;

  // --- 步骤 1: 初始化配置 ---
  if (type === 'init') {
    const { libPath, modelPath } = config;

    // 禁用远程加载
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    
    // 设置模型根目录（绝对 URL）
    env.localModelPath = modelPath; 
    env.useBrowserCache = false;

    // 设置 ONNX Runtime 内核路径 (WASM/WebGPU)
    env.backends.onnx.wasm.wasmPaths = libPath;
    if (env.backends.onnx.webgpu) {
      env.backends.onnx.webgpu.wasmPaths = libPath;
    }
    
    // 针对 Chrome 扩展环境关闭代理
    env.backends.onnx.wasm.proxy = false;

    isInitialized = true;
    console.log("Worker: 配置初始化成功，路径锁定为:", libPath);
    return;
  }

  // --- 步骤 2: 执行推理 ---
  if (type === 'run') {
    if (!isInitialized) {
      console.error("Worker: 尚未初始化，请先发送 init 消息");
      return;
    }

    if (!transcriber) {
      await loadModel();
    }

    // 确保模型加载成功
    if (!transcriber) return;

    try {
      const output = await transcriber(audio, {
        language: 'chinese',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
        // 加入提示词有助于减少 WebGPU 初始阶段的幻听
        prompt: "以下是普通话实时字幕：", 
      });

      self.postMessage({
        status: 'complete',
        text: output.text
      });

    } catch (err) {
      console.error("Worker: 推理执行错误:", err);
      // 如果报错，尝试重置状态，允许下次重新初始化
      if (err.message.includes('disposed')) transcriber = null;
    }
  }
};

/**
 * 异步加载模型
 */
async function loadModel() {
  console.log("Worker: 正在加载 WebGPU Whisper 模型...");
  try {
    transcriber = await pipeline('automatic-speech-recognition', 'whisper-base', {
      device: 'webgpu',
      // 'fp16' 对应量化后的模型，'fp32' 对应全量模型
      // 我们的 YML 下载的是量化版并去掉了后缀，这里建议用 fp16 适配
      dtype: 'fp16', 
    });
    console.log("Worker: 模型已就绪 (WebGPU)");
  } catch (err) {
    console.error("Worker: 模型加载失败，详情:", err);
  }
}
