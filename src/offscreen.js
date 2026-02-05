import { pipeline, env } from '@xenova/transformers';

// --- 1. 强制配置环境以适应 Chrome 扩展 ---
// 允许加载本地模型
env.allowLocalModels = true; 
env.useBrowserCache = false;
// 禁用多线程 Worker (解决 Manifest V3 Blob 报错的关键)
env.backends.onnx.wasm.numThreads = 1; 
env.backends.onnx.wasm.proxy = false;
// 指定 WASM 文件的绝对路径 (由 Vite 插件复制过去)
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('wasm/');

let transcriber = null;
let isProcessing = false;

// --- 2. 监听后台消息 ---
chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === 'START_TRANSCRIPTION') {
        if (isProcessing) return;
        isProcessing = true;
        console.log("收到录音任务，StreamID:", msg.streamId);
        await runPipeline(msg.streamId);
    }
});

// --- 3. 核心流水线 ---
async function runPipeline(streamId) {
    // A. 加载模型 (WebGPU 模式)
    if (!transcriber) {
        console.log("正在加载 WebGPU 模型...");
        transcriber = await pipeline('automatic-speech-recognition', 'whisper-tiny', {
            device: 'webgpu', // 核心：使用 GPU 加速
            local_files_only: true, // 只读本地
            model_path: 'models/whisper-tiny', // 对应 public/models/whisper-tiny
        });
        console.log("模型加载完成！");
    }

    // B. 获取音频流
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId
            }
        },
        video: false
    });

    // C. 音频处理 (重采样到 16kHz)
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    // 必须连接到 destination，否则用户会听不到声音
    source.connect(audioContext.destination);

    // 使用 ScriptProcessor 进行切片 (虽然被废弃，但在扩展环境下最稳)
    const bufferSize = 4096;
    const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    source.connect(processor);
    processor.connect(audioContext.destination);

    let audioChunks = [];
    const INFERENCE_THRESHOLD = 3 * 16000; // 每 3 秒数据推理一次

    processor.onaudioprocess = async (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioChunks.push(new Float32Array(inputData));

        const totalSamples = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);

        if (totalSamples >= INFERENCE_THRESHOLD) {
            // 合并 Buffer
            const fullBuffer = new Float32Array(totalSamples);
            let offset = 0;
            for (const chunk of audioChunks) {
                fullBuffer.set(chunk, offset);
                offset += chunk.length;
            }
            audioChunks = []; // 清空

            // 执行推理
            try {
                const result = await transcriber(fullBuffer, {
                    //language: 'chinese', // 强制中文，或去掉让它自动检测
                    language: null, 
                    task: 'transcribe'
                });

                if (result.text && result.text.trim()) {
                    console.log("识别结果:", result.text);
                    sendMessageToTab(result.text);
                }
            } catch (err) {
                console.error("推理出错:", err);
            }
        }
    };
}

// 发送结果给当前激活的标签页
// src/offscreen.js

async function sendMessageToTab(text) {
    // 关键：向 Background 发送，让 Background 中转，或者精准查询
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 调试：看看这里能不能搜到 Tab
    console.log("当前活跃 Tab:", tabs);

    if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { 
            type: 'UPDATE_SUBTITLE', 
            text: text 
        }).catch(err => {
            console.warn("发送消息失败（可能页面未刷新或脚本未注入）:", err);
        });
    }
}
