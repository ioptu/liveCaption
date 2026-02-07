let subtitleContainer = null;
let lastText = "";

function createSubtitleUI() {
  if (document.getElementById('ai-subtitle-overlay')) return;

  const div = document.createElement('div');
  div.id = 'ai-subtitle-overlay';
  div.style.cssText = `
    position: fixed;
    bottom: 50px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 20px;
    font-family: sans-serif;
    z-index: 999999;
    pointer-events: none;
    text-align: center;
    min-width: 300px;
    max-width: 80%;
    transition: opacity 0.3s;
    text-shadow: 1px 1px 2px black;
  `;
  document.body.appendChild(div);
  subtitleContainer = div;
}

function removeSubtitleUI() {
  const el = document.getElementById('ai-subtitle-overlay');
  if (el) el.remove();
  lastText = "";
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UPDATE_SUBTITLE') {
    if (!subtitleContainer) createSubtitleUI();
    
    const newText = msg.text.trim();
    
    // 简单的去重与更新逻辑
    // 因为是滑动窗口，每次都会返回长长的一段话，我们通常只需要显示最后一句
    // 或者直接显示 AI 返回的完整修正结果
    if (newText && newText !== lastText) {
      subtitleContainer.innerText = newText;
      lastText = newText;
      
      // 3秒后如果没有新内容，稍微变淡
      clearTimeout(subtitleContainer.timer);
      subtitleContainer.style.opacity = '1';
      subtitleContainer.timer = setTimeout(() => {
        subtitleContainer.style.opacity = '0.5';
      }, 3000);
    }
  } else if (msg.type === 'REMOVE_UI') {
    removeSubtitleUI();
  }
});
