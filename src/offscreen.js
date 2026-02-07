import { downsampleBuffer, calculateRMS } from './utils/audio-utils.js';

let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let worker = null;
let targetTabId = null;

// 推理状态控制
let isInferencing = false; 

// 配置参数
const WHISPER_SAMPLE_RATE = 16000;
const MAX_BUFFER_DURATION = 30; // 窗口大小：30秒，Whisper 的标准输入长度
const STRIDE_DURATION = 2;      // 步长：每2秒执行一次推理
const VAD_THRESHOLD = 0.005;    // 静音阈值，低于此值不触发 WebGPU

// 全局音频缓冲 (Float32)
let audioBufferQueue = []; 
let totalSamples = 0;
let lastInferenceTime = 0;

/**
 * 初始化 Web Worker
 * 使用 chrome.runtime.getURL 确保在扩展沙箱中路径正确
 */
function initWorker() {
  if (!worker) {
    const workerPath = chrome.runtime.getURL('src/worker.js');
    worker = new Worker(workerPath, { type: 'module' });
    
    worker.onmessage = (e) => {
      const { status, text } = e.data;
      if (status === 'complete') {
        // 推理结束，释放锁
        isInferencing = false; 
        
        if (targetTabId && text) {
          // 将识别结果发送给 content.js
          chrome.tabs.sendMessage(targetTabId, {
            type: 'UPDATE_SUBTITLE',
            text: text
          });
        }
      }
    };

    worker.onerror = (err) => {
      console.error("Worker 发生错误:", err);
      isInferencing = false; // 发生错误也要解锁，否则后续无法识别
    };
  }
}

/**
 * 监听来自 background.js 的控制指令
 */
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === 'START_RECORDING') {
    targetTabId = msg.data.tabId;
    await startAudioCapture(msg.data.streamId);
  } else if (msg.type === 'STOP_RECORDING') {
    stopAudioCapture();
  }
});

/**
 * 启动音频采集流
 */
async function startAudioCapture(streamId) {
  initWorker();
  
  try {
    // 1. 捕获标签页音频流
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    // 2. 创建音频上下文
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    // 3. 创建处理器 (4096 样本缓冲区)
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    
    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    // 4. 音频实时处理回调
    scriptProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // 降采样至 16000Hz
      const downsampled = downsampleBuffer(inputData, audioContext.sampleRate, WHISPER_SAMPLE_RATE);
      
      // 压入队列并累加采样数
      audioBufferQueue.push(downsampled);
      totalSamples += downsampled.length;

      // 维护 30秒 的滑动窗口
      const maxSamples = WHISPER_SAMPLE_RATE * MAX_BUFFER_DURATION;
      while (totalSamples > maxSamples) {
        const removed = audioBufferQueue.shift();
        totalSamples -= removed.length;
      }

      // 检查是否达到推理间隔，且当前没有正在进行的推理
      const now = Date.now();
      if (!isInferencing && (now - lastInferenceTime > STRIDE_DURATION * 1000)) {
        runInference();
        lastInferenceTime = now;
      }
    };
  } catch (err) {
    console.error("无法启动音频捕获:", err);
  }
}

/**
 * 执行推理逻辑
 */
function runInference() {
  if (audioBufferQueue.length === 0 || isInferencing) return;

  // 1. 合并当前缓冲区中的所有采样点
  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of audioBufferQueue) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // 2. VAD 检查：检查最近一部分音频的能量
  // 取最近 2 秒数据进行能量计算
  const recentSamples = merged.slice(-WHISPER_SAMPLE_RATE * STRIDE_DURATION);
  const energy = calculateRMS(recentSamples);
  
  if (energy < VAD_THRESHOLD) {
    // 如果太安静，清除“幻听”可能产生的旧字幕（可选）
    return; 
  }

  // 3. 设置锁并发送至 Worker 进行 WebGPU 推理
  isInferencing = true;
  worker.postMessage({
    type: 'run',
    audio: merged
  });
}

/**
 * 彻底停止捕获并释放资源
 */
function stopAudioCapture() {
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  // 清空缓冲
  audioBufferQueue = [];
  totalSamples = 0;
  isInferencing = false;
  console.log("Offscreen: 音频流已断开，资源已释放");
}
