let offscreenDoc = null;

// 创建离线文档的辅助函数
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });

  if (existingContexts.length > 0) return;

  // 指向 Vite 构建后的路径
  await chrome.offscreen.createDocument({
    url: 'src/offscreen.html', 
    reasons: ['USER_MEDIA'],
    justification: 'Real-time WebGPU audio transcription',
  });
}

// src/background.js

let isRunning = false;

chrome.action.onClicked.addListener(async (tab) => {
    if (isRunning) {
        // --- 关闭逻辑 ---
        await stopTranscription();
        isRunning = false;
        // 可选：通过图标上的文字提示状态
        chrome.action.setBadgeText({ text: "" }); 
        console.log("已停止识别并关闭 Offscreen");
    } else {
        // --- 启动逻辑 ---
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
        await ensureOffscreenDocument();
        
        chrome.runtime.sendMessage({
            type: 'START_TRANSCRIPTION',
            streamId: streamId
        });
        
        isRunning = true;
        chrome.action.setBadgeText({ text: "ON" });
        chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
    }
});

// 销毁 Offscreen 的函数
async function stopTranscription() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
        await chrome.offscreen.closeDocument();
    }
}

// 添加监听器：接收来自 Offscreen 的文字，并转发给当前网页
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'INFERENCE_DONE') {
        // 后台有权限查询 tabs
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id && tabs[0].url.startsWith('http')) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'UPDATE_SUBTITLE',
                    text: msg.text
                });
            }
        });
    }
});
