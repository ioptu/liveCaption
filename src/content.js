let lastFullText = "";
let subtitleContainer = null;

// 创建 UI 界面
function createSubtitleUI() {
  if (document.getElementById('whisper-subtitle-root')) return;
  
  subtitleContainer = document.createElement('div');
  subtitleContainer.id = 'whisper-subtitle-root';
  subtitleContainer.style = `
    position: fixed;
    bottom: 10%;
    left: 50%;
    transform: translateX(-50%);
    width: 80%;
    max-height: 150px;
    background: rgba(0, 0, 0, 0.75);
    color: #ffffff;
    font-size: 24px;
    font-family: sans-serif;
    text-align: center;
    padding: 15px;
    border-radius: 12px;
    z-index: 1000000;
    pointer-events: none;
    line-height: 1.5;
    overflow: hidden;
    text-shadow: 2px 2px 4px rgba(0,0,0,1);
  `;
  document.body.appendChild(subtitleContainer);
}

// 文本差量算法：提取新内容
function getDiff(oldStr, newStr) {
  oldStr = oldStr.trim();
  newStr = newStr.trim();
  
  if (newStr.startsWith(oldStr)) {
    return newStr.substring(oldStr.length);
  }
  // 如果新旧文本不匹配（滑动窗口漂移），返回最后一句
  return newStr.slice(-20); 
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UPDATE_SUBTITLE') {
    createSubtitleUI();
    
    const newText = msg.text.trim();
    if (!newText || newText === lastFullText) return;

    // 获取增量文本
    const diff = getDiff(lastFullText, newText);
    
    if (diff) {
      const span = document.createElement('span');
      span.innerText = diff + " ";
      subtitleContainer.appendChild(span);

      // 自动滚动到底部并限制长度
      if (subtitleContainer.childNodes.length > 50) {
        subtitleContainer.removeChild(subtitleContainer.firstChild);
      }
    }
    
    lastFullText = newText;
  }
});
