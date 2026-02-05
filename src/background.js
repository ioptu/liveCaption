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

// 点击图标开始录音
chrome.action.onClicked.addListener(async (tab) => {
  await ensureOffscreenDocument();

  // 获取 Media Stream ID (这必须在 background 中做)
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id
  });

  // 把 ID 发给 Offscreen 去处理
  chrome.runtime.sendMessage({
    type: 'START_TRANSCRIPTION',
    streamId: streamId
  });
});

// 添加监听器：接收来自 Offscreen 的文字，并转发给当前网页
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'INFERENCE_DONE') {
        // 后台有权限查询 tabs
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'UPDATE_SUBTITLE',
                    text: msg.text
                });
            }
        });
    }
});
