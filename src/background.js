let isCapturing = false;

// 监听图标点击
chrome.action.onClicked.addListener(async (tab) => {
  if (isCapturing) {
    await stopCapture(tab.id);
  } else {
    await startCapture(tab.id);
  }
});

async function startCapture(tabId) {
  try {
    // 1. 获取当前标签页的音频流 ID
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });

    // 2. 确保 Offscreen 文档存在
    await setupOffscreenDocument('src/offscreen.html');

    // 3. 发送开始指令给 Offscreen
    chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      data: { streamId, tabId }
    });

    isCapturing = true;
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });

  } catch (err) {
    console.error("启动失败:", err);
    resetState();
  }
}

async function stopCapture(tabId) {
  // 1. 通知 Offscreen 停止并释放流
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  } catch (e) {
    // 忽略发送失败（可能 offscreen 已经死掉了）
  }

  // 2. 销毁 Offscreen 文档 (彻底释放 WebGPU 和 AudioContext)
  setTimeout(async () => {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
    }
    
    // 3. 通知 Content Script 移除字幕 UI
    chrome.tabs.sendMessage(tabId, { type: 'REMOVE_UI' });
    
    resetState();
  }, 500);
}

function resetState() {
  isCapturing = false;
  chrome.action.setBadgeText({ text: "" });
}

// 辅助函数：创建 Offscreen
async function setupOffscreenDocument(path) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: path,
    reasons: ['USER_MEDIA'],
    justification: 'Recording tab audio for captioning'
  });
}
