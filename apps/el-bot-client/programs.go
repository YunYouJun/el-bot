package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

type programEntry struct {
	Name           string
	Title          string
	ActionKey      string
	BundleID       string
	LegacyBundleID string
}

var programEntries = []programEntry{
	{Name: "codex", Title: "Codex", ActionKey: "openCodex", BundleID: "com.openai.codex"},
	{Name: "qq", Title: "QQ", ActionKey: "openQq", BundleID: "com.tencent.qq"},
	{Name: "codebuddy", Title: "CodeBuddy", ActionKey: "openCodebuddy", BundleID: "com.tencent.codebuddycn"},
	{Name: "dsh", Title: "DSH", ActionKey: "openDsh", BundleID: "com.deepseek.dsh", LegacyBundleID: "dsh-tauri"},
}

func programEntryFor(name string) (programEntry, bool) {
	for _, entry := range programEntries {
		if entry.Name == name {
			return entry, true
		}
	}
	return programEntry{}, false
}

func (s Settings) programPath(name string) string {
	switch name {
	case "codex":
		return s.CodexAppPath
	case "qq":
		return s.QqAppPath
	case "codebuddy":
		return s.CodebuddyAppPath
	case "dsh":
		return s.DshAppPath
	}
	return ""
}

func programArgs(s Settings, name string) (string, []string, error) {
	entry, ok := programEntryFor(name)
	if !ok {
		return "", nil, clientError("errorOperation")
	}
	path := s.programPath(name)
	if runtime.GOOS == "darwin" {
		if path == "" {
			return "/usr/bin/open", []string{"-b", entry.BundleID}, nil
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
	entry, ok := programEntryFor(name)
	if !ok {
		return clientError("errorOperation")
	}
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
	if err != nil && entry.LegacyBundleID != "" && s.programPath(name) == "" {
		_, err = runBounded(25*time.Second, 4096, executable, "-b", entry.LegacyBundleID)
	}
	if err != nil {
		return clientError("errorProgram")
	}
	return nil
}
