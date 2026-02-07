import { downsampleBuffer, calculateRMS } from './utils/audio-utils.js';

let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let worker = null;
let targetTabId = null;
let isInferencing = false; 

const WHISPER_SAMPLE_RATE = 16000;
const MAX_BUFFER_DURATION = 30; 
const STRIDE_DURATION = 2;      
const VAD_THRESHOLD = 0.005;    

let audioBufferQueue = []; 
let totalSamples = 0;
let lastInferenceTime = 0;

function initWorker() {
  if (!worker) {
    const workerURL = chrome.runtime.getURL('src/worker.js');
    worker = new Worker(workerURL, { type: 'module' });

    worker.postMessage({
      type: 'init',
      config: {
        libPath: chrome.runtime.getURL('src/lib/'),
        modelPath: chrome.runtime.getURL('models/')
      }
    });

    worker.onmessage = (e) => {
      const { status, text } = e.data;
      if (status === 'complete') {
        isInferencing = false; 
        if (text) {
          // 修改点：发给 background 而不是直接发给 tabs
          chrome.runtime.sendMessage({
            type: 'RELAY_SUBTITLE',
            targetTabId: targetTabId,
            text: text
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
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: false
  });
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(mediaStream);
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  scriptProcessor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    const downsampled = downsampleBuffer(inputData, audioContext.sampleRate, WHISPER_SAMPLE_RATE);
    audioBufferQueue.push(downsampled);
    totalSamples += downsampled.length;

    const maxSamples = WHISPER_SAMPLE_RATE * MAX_BUFFER_DURATION;
    while (totalSamples > maxSamples) {
      const removed = audioBufferQueue.shift();
      totalSamples -= removed.length;
    }

    const now = Date.now();
    if (!isInferencing && (now - lastInferenceTime > STRIDE_DURATION * 1000)) {
      runInference();
      lastInferenceTime = now;
    }
  };
}

function runInference() {
  if (audioBufferQueue.length === 0 || isInferencing) return;
  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of audioBufferQueue) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const energy = calculateRMS(merged.slice(-WHISPER_SAMPLE_RATE * STRIDE_DURATION));
  if (energy < VAD_THRESHOLD) return; 

  isInferencing = true;
  worker.postMessage({ type: 'run', audio: merged });
}

function stopAudioCapture() {
  if (scriptProcessor) scriptProcessor.disconnect();
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
  audioBufferQueue = [];
  totalSamples = 0;
  isInferencing = false;
}
