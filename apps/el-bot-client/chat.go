package main

import (
	"encoding/json"
	"regexp"
)

type chatPairing struct {
	Type      string `json:"type"`
	Server    string `json:"server"`
	Code      string `json:"code"`
	Purpose   string `json:"purpose"`
	ExpiresAt string `json:"expiresAt"`
}

func pairChat(s CloudSettings) (chatPairing, error) {
	control, err := connectCloud(s)
	if err != nil {
		return chatPairing{}, err
	}
	data, err := sshCommand(control, s.SSHHost, "sudo -n docker exec --user node el-bot-dsh node /opt/dsh-runtime/node_modules/@el-bot/mobile/dist/cli.mjs --profile cloud --pair")
	if err != nil || len(data) > 4096 {
		return chatPairing{}, clientError("errorSsh")
	}
	var result struct {
		Code      string `json:"code"`
		ExpiresAt string `json:"expiresAt"`
	}
	if json.Unmarshal(data, &result) != nil || !regexp.MustCompile(`^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$`).MatchString(result.Code) {
		return chatPairing{}, clientError("errorResponse")
	}
	// The admin-generated code is redeemed only at this instance's verified HTTPS entry.
	return chatPairing{Type: "chat-pairing", Server: "https://bot.yunle.fun", Code: result.Code, ExpiresAt: result.ExpiresAt}, nil
}
