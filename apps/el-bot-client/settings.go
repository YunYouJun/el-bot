package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type CloudSettings struct {
	SSHHost string `json:"sshHost"`
}
type Settings struct {
	Cloud            CloudSettings `json:"cloud"`
	NodePath         string        `json:"nodePath"`
	CLIPath          string        `json:"cliPath"`
	ConfigPath       string        `json:"configPath"`
	CredentialsPath  string        `json:"credentialsPath"`
	StatePath        string        `json:"statePath"`
	CodexAppPath     string        `json:"codexAppPath"`
	CodebuddyAppPath string        `json:"codebuddyAppPath"`
	DshAppPath       string        `json:"dshAppPath"`
	QqAppPath        string        `json:"qqAppPath"`
}

func defaultSettings(home string) Settings {
	node, _ := exec.LookPath("node")
	if node == "" {
		node = "/opt/homebrew/bin/node"
	}
	base := filepath.Join(home, ".el-bot")
	return Settings{NodePath: node, CLIPath: filepath.Join(base, "client-runtime/node_modules/el-bot/dist/cli.mjs"), ConfigPath: filepath.Join(base, "qq-codex.json"), CredentialsPath: filepath.Join(base, "qq-codex.env"), StatePath: filepath.Join(base, "qq-codex-state.json")}
}

func loadSettings(path, home string) (Settings, error) {
	s := defaultSettings(home)
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return s, nil
	}
	if err != nil {
		return s, clientError("errorSettingsRead")
	}
	if json.Unmarshal(data, &s) != nil {
		return s, clientError("errorSettingsInvalid")
	}
	return s, nil
}

func validPath(path string) bool { return filepath.IsAbs(path) && !strings.ContainsRune(path, 0) }
func (s Settings) validateLocal() error {
	for _, path := range []string{s.NodePath, s.CLIPath, s.ConfigPath, s.CredentialsPath, s.StatePath} {
		if !validPath(path) {
			return clientError("errorPaths")
		}
	}
	for _, path := range []string{s.NodePath, s.CLIPath} {
		if info, err := os.Stat(path); err != nil || info.IsDir() {
			return clientError("errorRuntime")
		}
	}
	for _, path := range []string{s.CodexAppPath, s.CodebuddyAppPath, s.DshAppPath, s.QqAppPath} {
		if path != "" && !validPath(path) {
			return clientError("errorPaths")
		}
	}
	return nil
}

// Merge untouched fields so a newer client can share the existing settings.
func saveSettings(path string, s Settings) error {
	fields := map[string]json.RawMessage{}
	if data, err := os.ReadFile(path); err == nil {
		if json.Unmarshal(data, &fields) != nil {
			return clientError("errorSettingsInvalid")
		}
	} else if !os.IsNotExist(err) {
		return clientError("errorSettingsRead")
	}
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}
	var current map[string]json.RawMessage
	_ = json.Unmarshal(data, &current)
	for key, value := range current {
		fields[key] = value
	}
	data, err = json.MarshalIndent(fields, "", "  ")
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return clientError("errorSettingsSave")
	}
	f, err := os.CreateTemp(filepath.Dir(path), "client-*.tmp")
	if err != nil {
		return clientError("errorSettingsSave")
	}
	defer os.Remove(f.Name())
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Rename(f.Name(), path)
	}
	if err != nil {
		return clientError("errorSettingsSave")
	}
	return nil
}
