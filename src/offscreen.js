import { downsampleBuffer, calculateRMS } from './utils/audio-utils.js';

let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let worker = null;
let targetTabId = null;

// 配置参数
const WHISPER_SAMPLE_RATE = 16000;
const MAX_BUFFER_DURATION = 30; // 窗口大小：30秒
const STRIDE_DURATION = 2;      // 步长：每2秒推理一次
const VAD_THRESHOLD = 0.005;    // 静音阈值 (需要根据实际情况微调)

// 全局音频缓冲 (Float32)
let audioBufferQueue = []; 
let totalSamples = 0;
let lastInferenceTime = 0;

// 初始化 Web Worker
function initWorker() {
  if (!worker) {
    worker = new Worker('worker.js', { type: 'module' });
    
    worker.onmessage = (e) => {
      const { status, text, partial } = e.data;
      if (status === 'complete' || status === 'partial') {
        // 收到结果，转发给 content.js 显示
        if (targetTabId && text) {
          chrome.tabs.sendMessage(targetTabId, {
            type: 'UPDATE_SUBTITLE',
            text: text,
            isPartial: status === 'partial'
          });
        }
      }
    };
  }
}

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === 'START_RECORDING') {
    targetTabId = msg.data.tabId;
    await startAudioCapture(msg.data.streamId);
  } else if (msg.type === 'STOP_RECORDING') {
    stopAudioCapture();
  }
});

async function startAudioCapture(streamId) {
  initWorker();
  
  // 1. 获取流
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  // 2. 创建 AudioContext
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(mediaStream);
  
  // 3. 使用 ScriptProcessor (虽然废弃但简单，4096 样本缓冲)
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  
  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  // 4. 音频处理回调
  scriptProcessor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    
    // VAD 预检：如果这 4096 个采样全是静音，虽然我们还是要记录(为了背景)，但可以标记
    // 降采样到 16k
    const downsampled = downsampleBuffer(inputData, audioContext.sampleRate, WHISPER_SAMPLE_RATE);
    
    // 添加到队列
    audioBufferQueue.push(downsampled);
    totalSamples += downsampled.length;

    // 维护 30秒 的滑动窗口
    // 16000 * 30 = 480,000 采样点
    const maxSamples = WHISPER_SAMPLE_RATE * MAX_BUFFER_DURATION;
    while (totalSamples > maxSamples) {
      const removed = audioBufferQueue.shift();
      totalSamples -= removed.length;
    }

    // 触发推理逻辑 (每隔 STRIDE_DURATION 秒)
    const now = Date.now();
    if (now - lastInferenceTime > STRIDE_DURATION * 1000) {
      runInference();
      lastInferenceTime = now;
    }
  };
}

function runInference() {
  if (audioBufferQueue.length === 0) return;

  // 1. 合并缓冲区
  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of audioBufferQueue) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // 2. VAD 检查：检查最后 2 秒是否有声音
  const recentSamples = merged.slice(-WHISPER_SAMPLE_RATE * STRIDE_DURATION);
  const energy = calculateRMS(recentSamples);
  
  if (energy < VAD_THRESHOLD) {
    console.log("静音，跳过推理");
    return; 
  }

  // 3. 发送给 Worker
  worker.postMessage({
    type: 'run',
    audio: merged
  });
}

function stopAudioCapture() {
  if (scriptProcessor) scriptProcessor.disconnect();
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
  }
  if (audioContext) audioContext.close();
  
  audioBufferQueue = [];
  totalSamples = 0;
  console.log("录音已停止");
}
