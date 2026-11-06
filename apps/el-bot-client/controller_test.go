package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"github.com/YunYouJun/el-bot/apps/el-bot-client/locales"
)

func TestSettingsUpgradePreservesPathsCloudAndUnknownFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "client.json")
	legacy := `{"cloud":{"sshHost":"yunlefun"},"nodePath":"/bin/node","cliPath":"/cli.mjs","configPath":"/config.json","credentialsPath":"/private.env","statePath":"/state.json","futureSetting":{"enabled":true}}`
	if err := os.WriteFile(path, []byte(legacy), 0600); err != nil {
		t.Fatal(err)
	}
	s, err := loadSettings(path, "/home/test")
	if err != nil {
		t.Fatal(err)
	}
	if s.Cloud.SSHHost != "yunlefun" || s.CredentialsPath != "/private.env" {
		t.Fatalf("migration changed existing settings: %+v", s)
	}
	if err = saveSettings(path, s); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	var result map[string]json.RawMessage
	_ = json.Unmarshal(data, &result)
	if string(result["futureSetting"]) != "{\n    \"enabled\": true\n  }" && !strings.Contains(string(result["futureSetting"]), "true") {
		t.Fatal("unknown setting was discarded")
	}
	info, _ := os.Stat(path)
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0600 {
		t.Fatal("settings are not private")
	}
	_ = os.WriteFile(path, []byte("corrupt"), 0600)
	if saveSettings(path, s) == nil {
		t.Fatal("corrupt settings should be retained")
	}
	data, _ = os.ReadFile(path)
	if string(data) != "corrupt" {
		t.Fatal("corrupt settings overwritten")
	}
}

func TestCommandsOnlyAdmitNamedOperationsAndFlags(t *testing.T) {
	s := Settings{CLIPath: "/cli.mjs", ConfigPath: "/config.json", CredentialsPath: "/private.env", StatePath: "/state.json"}
	args, err := commandArgs(s, "start")
	if err != nil {
		t.Fatal(err)
	}
	if args[len(args)-1] != "--background" {
		t.Fatal("start must remain detached")
	}
	for _, test := range []struct {
		op    string
		flags []string
	}{{"shell", nil}, {"status", []string{"--interrupt"}}, {"stop", []string{"; echo unsafe"}}, {"preferences", []string{"--message-format", "shell"}}, {"preferences", []string{"--image-theme"}}} {
		if _, err := commandArgs(s, test.op, test.flags...); err == nil {
			t.Fatalf("accepted unexpected command: %+v", test)
		}
	}
	if _, err := commandArgs(s, "restart", "--interrupt"); err != nil {
		t.Fatal(err)
	}
	if _, err := commandArgs(s, "preferences", "--message-format", "markdown", "--image-theme", "dark"); err != nil {
		t.Fatal(err)
	}
}

func TestCloudOnlyUsesTrustedLocalTunnelAndValidatedArguments(t *testing.T) {
	for _, host := range []string{"", "-F", "host; id", "user@host", "host\ncommand"} {
		if (CloudSettings{host}).validate() == nil {
			t.Fatalf("accepted SSH injection %q", host)
		}
	}
	if (CloudSettings{"yunlefun"}).validate() != nil {
		t.Fatal("known alias rejected")
	}
	for _, address := range []string{"https://example.com", "file:///private", "http://localhost:13080", "http://user@127.0.0.1:13080", "http://127.0.0.1:3080"} {
		if _, err := cloudURL("dsh web: "+address, false); err == nil {
			t.Fatalf("accepted unexpected address %q", address)
		}
	}
	url, err := cloudURL("dsh web: http://127.0.0.1:13080/?token=old\ndsh web: http://127.0.0.1:13080/?token=current", true)
	if err != nil || url != "http://127.0.0.1:13080/?token=current#el-bot-personas" {
		t.Fatal("latest authenticated entry was not selected")
	}
	if _, err := personaCommand("use", "id;command", strings.Repeat("a", 64)); err == nil {
		t.Fatal("accepted persona shell injection")
	}
	if _, _, err := programArgs(Settings{}, "shell"); err == nil {
		t.Fatal("accepted arbitrary application")
	}
}

func TestCatalogsAreCompleteAndTranslateNativeIdentity(t *testing.T) {
	var en, zh map[string]any
	for path, target := range map[string]*map[string]any{"locales/en.json": &en, "locales/zh-Hans.json": &zh} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if err = json.Unmarshal(data, target); err != nil {
			t.Fatal(err)
		}
	}
	en["@@locale"] = "locale"
	zh["@@locale"] = "locale"
	for key := range en {
		if _, ok := zh[key]; !ok {
			t.Fatalf("missing Chinese translation: %s", key)
		}
	}
	if len(en) != len(zh) {
		t.Fatal("catalog keys differ")
	}
	if got := []string{locales.Catalog.Format("en", "appName", nil), locales.Catalog.Format("zh-Hans", "appName", nil)}; !reflect.DeepEqual(got, []string{"Yun Bot", "云 Bot"}) {
		t.Fatalf("unexpected translated identity: %v", got)
	}
}
