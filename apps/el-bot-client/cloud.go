package main

import (
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo"
)

var hostPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
var personaPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)
var revisionPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func (s CloudSettings) validate() error {
	if !hostPattern.MatchString(s.SSHHost) {
		return clientError("errorSshHost")
	}
	return nil
}

func sshCommand(control string, args ...string) ([]byte, error) {
	base := []string{"-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "-S", control}
	return runBounded(25*time.Second, 2*1024*1024, "/usr/bin/ssh", append(base, args...)...)
}

func connectCloud(s CloudSettings) (string, error) {
	if err := s.validate(); err != nil {
		return "", err
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".el-bot/tunnels")
	if err = os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	if err = os.Chmod(dir, 0700); err != nil {
		return "", err
	}
	control := filepath.Join(dir, "cloud-"+s.SSHHost)
	if _, err = sshCommand(control, "-O", "check", s.SSHHost); err != nil {
		_, err = sshCommand(control, "-M", "-f", "-N", "-T", "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3", "-L", "127.0.0.1:13080:127.0.0.1:3080", s.SSHHost)
		if err != nil {
			return "", clientError("errorSsh")
		}
	}
	return control, nil
}

func cloudURL(logs string, personas bool) (string, error) {
	lines := strings.Split(logs, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		index := strings.Index(lines[i], "dsh web: http")
		if index < 0 {
			continue
		}
		parsed, err := url.Parse(strings.TrimSpace(lines[i][index+len("dsh web: "):]))
		if err != nil || parsed.Scheme != "http" || parsed.Host != "127.0.0.1:13080" || parsed.User != nil {
			return "", clientError("errorCloudUrl")
		}
		if personas {
			parsed.Fragment = "el-bot-personas"
		}
		return parsed.String(), nil
	}
	return "", clientError("errorCloudUnavailable")
}

func openCloud(s CloudSettings, personas bool) error {
	control, err := connectCloud(s)
	if err != nil {
		return err
	}
	logs, err := sshCommand(control, s.SSHHost, "sudo -n docker logs --tail 500 el-bot-dsh 2>&1")
	if err != nil || len(logs) > 256000 {
		return clientError("errorSsh")
	}
	address, err := cloudURL(string(logs), personas)
	if err != nil {
		return err
	}
	// The authenticated address is never saved, displayed or logged.
	if err := mygo.Shell.OpenExternal(address); err != nil {
		return clientError("errorBrowser")
	}
	return nil
}

func personaCommand(operation, id, revision string) (string, error) {
	command := "sudo -n docker exec --user node el-bot-dsh node /opt/el-bot-dsh/dist/cli.mjs --profile cloud"
	switch operation {
	case "list":
	case "disable":
		command += " --disable"
	case "use":
		if !personaPattern.MatchString(id) || !revisionPattern.MatchString(revision) {
			return "", clientError("errorPersonaId")
		}
		command += " --use " + id + " --revision " + revision
	default:
		return "", clientError("errorOperation")
	}
	return command, nil
}

type PersonaMetadata struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}
type PersonaRevision struct {
	Metadata PersonaMetadata `json:"metadata"`
	Hash     string          `json:"hash"`
}
type PersonaCard struct {
	Metadata  PersonaMetadata   `json:"metadata"`
	Hash      string            `json:"hash"`
	Revisions []PersonaRevision `json:"revisions"`
}
type PersonaResult struct {
	Library struct {
		Cards  []PersonaCard `json:"cards"`
		Active *struct {
			ID   string `json:"id"`
			Hash string `json:"hash"`
		} `json:"active"`
	} `json:"library"`
}

func cloudPersonas(s CloudSettings, operation, id, revision string) (*PersonaResult, error) {
	command, err := personaCommand(operation, id, revision)
	if err != nil {
		return nil, err
	}
	control, err := connectCloud(s)
	if err != nil {
		return nil, err
	}
	data, runErr := sshCommand(control, s.SSHHost, command)
	var response struct {
		OK     bool          `json:"ok"`
		Result PersonaResult `json:"result"`
		Error  string        `json:"error"`
	}
	if json.Unmarshal(data, &response) != nil {
		return nil, clientError("errorPersona")
	}
	if runErr != nil || !response.OK {
		if response.Error != "" {
			return nil, errors.New(response.Error)
		}
		return nil, clientError("errorPersona")
	}
	return &response.Result, nil
}
