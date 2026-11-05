# el-bot 机器人头像

`el-bot-qq-avatar.webp` 用于客户端概览头像。图片使用用户提供的角色插画作为参考，通过内置 imagegen 工具编辑生成；保留角色外观、蓝紫配色和眨眼表情，将手持的 V 形标志替换为 el-bot 机器人标志，并调整为适合圆形裁切的方形构图。

该头像独立于 `assets/brand/` 的规范品牌 SVG 和平台应用图标，不参与 `pnpm icons:generate`，也不属于品牌目录中的 MIT 授权声明。QQ 后台已上传同一构图的原始 PNG；仓库只保留面向客户端的 512 × 512 WebP，减少资源大小与解码内存。

WebP 使用 `cwebp -q 85 -resize 512 512 <原始 PNG> -o assets/avatars/el-bot-qq-avatar.webp` 导出。原始生成图片保留在本机，不提交 Git；如需重新上传 QQ，使用平台接受的 PNG 或 JPEG 格式。

## 生成提示词

```text
Use case: compositing
Asset type: 1024x1024 square QQ bot profile avatar for el-bot.
Input images: Image 1 is the edit target and exact character/style reference. Image 2 is a supporting insert reference showing the existing el-bot brand logo (a simple solid white robot head, two vertical blue rounded eye slots and a central short antenna on a blue rounded square).
Primary request: Adapt Image 1 into a beautiful square profile avatar, preserving the same recognizable chibi anime character, silver-white long hair with pale lilac shading, cyan blue eye, cheerful winking expression, round hair buns, red diamond hair ornament, white-and-cyan outfit, clean dark linework, blue-purple background and original illustration style.
Change only the emblem she is holding: replace the large blue-purple V and orbital circle with the el-bot logo from Image 2, as a single coherent blue plaque with the white robot head and two blue vertical eyes, still held naturally by both hands. The held el-bot emblem must be clean and recognizable. No V symbol or orbital circle remains.
Composition: redesign the crop into a square close portrait, head and shoulders/upper body with the held emblem visible in the lower-center. Keep entire face, hair buns and main logo inside the central circular safe area, away from corners, so the image works when QQ displays it as a circle. Reduce background gadget detail gently if needed for clarity at small sizes. Preserve the original color palette and identity. Full-bleed blue-purple background, no rounded square framing and no border.
Constraints: one character only, no app screenshot, no device mockup, no caption, no added text, no watermark. Do not change the character to a generic robot or 3D style. Do not carry over any corner text into the avatar crop.
```
