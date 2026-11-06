package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/YunYouJun/el-bot/apps/el-bot-client/locales"
)

type clientError string

func (e clientError) Error() string { return locales.Catalog.Format("en", string(e), nil) }
func t(key string) string           { return locales.Catalog.Format(activeLocale, key, nil) }
func errorText(err error) string {
	var known clientError
	if errors.As(err, &known) {
		return t(string(known))
	}
	return err.Error()
}

type Status struct {
	Phase   string `json:"phase"`
	QQ      string `json:"qq"`
	Codex   string `json:"codex"`
	Agent   string `json:"agent"`
	Busy    bool   `json:"busy"`
	Project string `json:"project"`
	Task    *struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	} `json:"task"`
}
type Preferences struct {
	MessageFormat string `json:"messageFormat"`
	ImageTheme    string `json:"imageTheme"`
}
type boundedOutput struct {
	bytes.Buffer
	limit int
}

func (b *boundedOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > b.limit {
		return 0, clientError("errorTooLarge")
	}
	return b.Buffer.Write(p)
}

func runBounded(timeout time.Duration, limit int, executable string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, executable, args...)
	cmd.Env = append(os.Environ(), "PATH="+filepath.Dir(executable)+string(os.PathListSeparator)+os.Getenv("PATH")+string(os.PathListSeparator)+"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin")
	output := &boundedOutput{limit: limit}
	cmd.Stdout = output
	err := cmd.Run()
	if ctx.Err() != nil {
		return nil, clientError("errorTimeout")
	}
	return output.Bytes(), err
}

func commandArgs(s Settings, op string, extra ...string) ([]string, error) {
	switch op {
	case "status", "logs", "start", "stop", "restart", "preferences":
	default:
		return nil, clientError("errorOperation")
	}
	for i := 0; i < len(extra); i++ {
		switch extra[i] {
		case "--interrupt":
			if op != "stop" && op != "restart" {
				return nil, clientError("errorOperation")
			}
		case "--message-format", "--image-theme":
			if op != "preferences" || i+1 >= len(extra) {
				return nil, clientError("errorOperation")
			}
			key, value := extra[i], extra[i+1]
			i++
			if (key == "--message-format" && value != "image" && value != "markdown" && value != "text") || (key == "--image-theme" && value != "light" && value != "dark") {
				return nil, clientError("errorOperation")
			}
		default:
			return nil, clientError("errorOperation")
		}
	}
	args := []string{s.CLIPath, "codex", op, "--json", "--config", s.ConfigPath, "--credentials", s.CredentialsPath, "--state", s.StatePath}
	if op == "start" {
		args = append(args, "--background")
	}
	return append(args, extra...), nil
}

func invoke(s Settings, op string, extra ...string) (json.RawMessage, error) {
	args, err := commandArgs(s, op, extra...)
	if err != nil {
		return nil, err
	}
	if err = s.validateLocal(); err != nil {
		return nil, err
	}
	data, runErr := runBounded(75*time.Second, 128000, s.NodePath, args...)
	var response struct {
		OK     bool            `json:"ok"`
		Result json.RawMessage `json:"result"`
		Error  string          `json:"error"`
	}
	if json.Unmarshal(data, &response) != nil {
		if runErr != nil {
			var known clientError
			if errors.As(runErr, &known) {
				return nil, runErr
			}
		}
		return nil, clientError("errorResponse")
	}
	if !response.OK {
		if response.Error != "" {
			return nil, errors.New(response.Error)
		}
		return nil, clientError("errorCli")
	}
	if runErr != nil {
		return nil, clientError("errorCli")
	}
	return response.Result, nil
}
