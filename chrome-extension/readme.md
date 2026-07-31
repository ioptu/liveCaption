>sszm  语音识别和字幕翻译均使用chrome浏览器内置的离线AI，因此生成速度和资源占用都很理想。（edge浏览器也在逐步开放内置的语音识别API，dev版（v.152）已支持，稳定版（v.150）还不支持）
>
>浏览器内置翻译引擎的翻译效果一般，较为生硬不如常见AI自然。不过，可以通过将offscreen.js文件中SHOW_TRANSLATION_ENABLED的值修改为false，来关闭sszm 的翻译功能，然后利用其它扩展的网页翻译来实现较高质量的翻译。


>sszm-sh 利用webgpu + onnx来驱动腾讯混元 hy-mt1.5-1.8b 模型做字幕翻译。语音识别使用的是chrome浏览器内置离线AI-SODA。
