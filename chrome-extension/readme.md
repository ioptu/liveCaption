 
> 使用webgpu和离线AI模型，对硬件有一定要求。
>
> 其中sszm_whisper-vad和sszm_whisper使用whisper做语音识别，sszm_voxtral.realtime使用voxtralchrome做语音识别，均使用chrome内置AI做翻译。
>
> whisper相对比较轻量，效果一般，而voxtral达到预期效果，硬件要求也较高(本地测试当前版本的扩展的显存占用最低时为5G)。
>
> 首次选择一种语言后，触发后台下载对应的语言翻译模型，如果popup页面底部一直显示“启动中... 请稍等”，可尝试多次点击“开启字幕”按钮。
>
> ( ~用于流程测试~ voxtral版已具备较高可用性)
