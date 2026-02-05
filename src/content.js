chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'UPDATE_SUBTITLE') {
        renderSubtitle(msg.text);
    }
});

function renderSubtitle(text) {
    const ID = 'webgpu-ai-sub-container';
    let el = document.getElementById(ID);
    
    if (!el) {
        el = document.createElement('div');
        el.id = ID;
        // 样式：置顶、半透明黑底、白字、鼠标穿透
        el.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 2147483647 !important;
            background: rgba(0, 0, 0, 0.75);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 22px;
            font-family: sans-serif;
            pointer-events: none;
            text-shadow: 0 1px 2px black;
            max-width: 80%;
            text-align: center;
        `;
        document.body.appendChild(el);
    }
    
    el.innerText = text;
    
    // 触发 input 事件以便其他翻译插件捕获
    el.dispatchEvent(new Event('input', { bubbles: true }));
}
