package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

func programArgs(s Settings, name string) (string, []string, error) {
	paths := map[string]string{"codex": s.CodexAppPath, "codebuddy": s.CodebuddyAppPath, "dsh": s.DshAppPath, "qq": s.QqAppPath}
	path, ok := paths[name]
	if !ok {
		return "", nil, clientError("errorOperation")
	}
	if runtime.GOOS == "darwin" {
		if path == "" {
			return "/usr/bin/open", []string{"-b", map[string]string{"codex": "com.openai.codex", "codebuddy": "com.tencent.codebuddycn", "dsh": "com.deepseek.dsh", "qq": "com.tencent.qq"}[name]}, nil
		}
		if !validPath(path) || filepath.Ext(path) != ".app" {
			return "", nil, clientError("errorProgram")
		}
		if info, err := os.Stat(path); err != nil || !info.IsDir() {
			return "", nil, clientError("errorProgram")
		}
		return "/usr/bin/open", []string{"-a", path}, nil
	}
	if !validPath(path) {
		return "", nil, clientError("errorPlatform")
	}
	if info, err := os.Stat(path); err != nil || info.IsDir() {
		return "", nil, clientError("errorProgram")
	}
	return path, nil, nil
}

func openProgram(s Settings, name string) error {
	executable, args, err := programArgs(s, name)
	if err != nil {
		return err
	}
	if runtime.GOOS != "darwin" {
		command := exec.Command(executable, args...)
		if err := command.Start(); err != nil {
			return clientError("errorProgram")
		}
		go func() { _ = command.Wait() }()
		return nil
	}
	_, err = runBounded(25*time.Second, 4096, executable, args...)
	if err != nil && runtime.GOOS == "darwin" && name == "dsh" && s.DshAppPath == "" {
		_, err = runBounded(25*time.Second, 4096, executable, "-b", "dsh-tauri")
	}
	if err != nil {
		return clientError("errorProgram")
	}
	return nil
}
