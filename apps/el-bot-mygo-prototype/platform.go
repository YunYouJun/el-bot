package main

import (
	"os/exec"
	"runtime"
)

// Native integration lives outside views; add OS-specific adapters here.
func openProgram(name string) string {
	if runtime.GOOS != "darwin" {
		return "本机程序入口目前只在 macOS 验证。"
	}
	id := map[string]string{"Codex": "com.openai.codex", "QQ": "com.tencent.qq", "CodeBuddy": "com.tencent.codebuddycn", "DSH": "com.deepseek.dsh"}[name]
	if id == "" {
		return "不支持的程序。"
	}
	if err := exec.Command("/usr/bin/open", "-b", id).Run(); err != nil {
		return "未找到应用，请先安装或使用正式客户端配置路径。"
	}
	return "已打开 " + name
}
