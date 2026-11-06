package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

type Settings struct {
	NodePath        string `json:"nodePath"`
	CLIPath         string `json:"cliPath"`
	ConfigPath      string `json:"configPath"`
	CredentialsPath string `json:"credentialsPath"`
	StatePath       string `json:"statePath"`
}
type Status struct {
	Phase   string `json:"phase"`
	QQ      string `json:"qq"`
	Codex   string `json:"codex"`
	Agent   string `json:"agent"`
	Busy    bool   `json:"busy"`
	Project string `json:"project"`
	Message string `json:"message"`
	Task    *struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	} `json:"task"`
}

func defaultSettings(home string) Settings {
	node, _ := exec.LookPath("node")
	if node == "" {
		node = "/opt/homebrew/bin/node"
	}
	return Settings{node, filepath.Join(home, ".el-bot/client-runtime/node_modules/el-bot/dist/cli.mjs"), filepath.Join(home, ".el-bot/qq-codex.json"), filepath.Join(home, ".el-bot/qq-codex.env"), filepath.Join(home, ".el-bot/qq-codex-state.json")}
}

type boundedOutput struct{ bytes.Buffer }

func (b *boundedOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 128000 {
		return 0, errors.New("CLI response exceeds 128 KB")
	}
	return b.Buffer.Write(p)
}

// Reuse the existing CLI's identity, task admission, dedup and approval checks.
func invoke(s Settings, op string, extra ...string) (json.RawMessage, error) {
	switch op {
	case "status", "logs", "start", "stop", "restart", "preferences":
	default:
		return nil, errors.New("Unsupported operation")
	}
	for _, p := range []string{s.NodePath, s.CLIPath, s.ConfigPath, s.CredentialsPath, s.StatePath} {
		if !filepath.IsAbs(p) {
			return nil, errors.New("请填写完整本机文件路径。")
		}
	}
	for _, p := range []string{s.NodePath, s.CLIPath} {
		if info, err := os.Stat(p); err != nil || info.IsDir() {
			return nil, errors.New("找不到 Node 或 el-bot CLI；请检查连接设置。")
		}
	}
	args := []string{s.CLIPath, "codex", op, "--json", "--config", s.ConfigPath, "--credentials", s.CredentialsPath, "--state", s.StatePath}
	if op == "start" {
		args = append(args, "--background")
	}
	args = append(args, extra...)
	ctx, cancel := context.WithTimeout(context.Background(), 75*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, s.NodePath, args...)
	cmd.Env = append(os.Environ(), "PATH="+filepath.Dir(s.NodePath)+string(os.PathListSeparator)+os.Getenv("PATH"))
	output := &boundedOutput{}
	cmd.Stdout = output
	runErr := cmd.Run()
	if ctx.Err() != nil {
		return nil, errors.New("控制命令超时；请刷新状态确认结果。")
	}
	var envelope struct {
		OK     bool            `json:"ok"`
		Result json.RawMessage `json:"result"`
		Error  string          `json:"error"`
	}
	if err := json.Unmarshal(output.Bytes(), &envelope); err != nil {
		return nil, errors.New("CLI 未返回有效 JSON；请确认使用支持本机控制的版本。")
	}
	if !envelope.OK {
		return nil, fmt.Errorf("%s", envelope.Error)
	}
	if runErr != nil {
		return nil, errors.New("CLI execution failed")
	}
	return envelope.Result, nil
}
func (a *app) saveSettings() {
	for _, p := range []string{a.settings.NodePath, a.settings.CLIPath, a.settings.ConfigPath, a.settings.CredentialsPath, a.settings.StatePath} {
		if !filepath.IsAbs(p) {
			a.message = "请填写完整本机文件路径。"
			return
		}
	}
	data, _ := json.MarshalIndent(a.settings, "", "  ")
	if err := os.MkdirAll(filepath.Dir(a.settingsPath), 0700); err != nil {
		a.message = err.Error()
		return
	}
	tmp := a.settingsPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		a.message = err.Error()
		return
	}
	if err := os.Rename(tmp, a.settingsPath); err != nil {
		a.message = err.Error()
		return
	}
	a.message = "原型设置已保存，正式客户端配置未修改。"
	a.command("status")
}
