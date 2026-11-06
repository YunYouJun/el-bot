package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNativeBoundaryRejectsUnexpectedOperations(t *testing.T) {
	for _, payload := range []string{
		`{"action":"shell","value":"id"}`,
		`{"action":"openProgram","value":"/bin/sh"}`,
		`{"action":"navigate","value":"webview"}`,
		`{"action":"locale","value":"../../en"}`,
		`{"action":"edit","field":"token","value":"secret"}`,
		`{"action":"choosePath","field":"sshHost"}`,
		`{"action":"editPreference","field":"messageFormat","value":"shell"}`,
		`{"action":"stop","value":"--interrupt"}`,
		`{"action":"persona","value":"id;command:revision"}`,
		`{"action":"edit","field":"cliPath","value":"a\u0000b"}`,
		`{"action":"edit","field":"cliPath","value":"` + strings.Repeat("x", 16384) + `"}`,
	} {
		if _, err := decodeNativeEvent([]byte(payload)); err == nil {
			t.Fatalf("accepted unexpected native event: %.100s", payload)
		}
	}
	for _, payload := range []string{
		`{"action":"navigate","value":"settings"}`,
		`{"action":"locale","value":""}`,
		`{"action":"edit","field":"sshHost","value":"test-host"}`,
		`{"action":"choosePath","field":"credentialsPath"}`,
		`{"action":"editPreference","field":"messageFormat","value":"markdown"}`,
		`{"action":"refreshStatus"}`,
	} {
		if _, err := decodeNativeEvent([]byte(payload)); err != nil {
			t.Fatalf("rejected supported native event: %s", payload)
		}
	}
}

func TestNativeDraftEditsDoNotChangeSavedSettings(t *testing.T) {
	a := &app{settings: Settings{Cloud: CloudSettings{SSHHost: "existing"}}, page: "quickActions"}
	a.draft = a.settings
	a.handleNativeEvent([]byte(`{"action":"edit","field":"sshHost","value":"draft-host"}`))
	if a.settings.Cloud.SSHHost != "existing" || a.draft.Cloud.SSHHost != "draft-host" {
		t.Fatal("native editing changed saved settings")
	}
	a.pending = true
	a.handleNativeEvent([]byte(`{"action":"edit","field":"sshHost","value":"blocked"}`))
	if a.draft.Cloud.SSHHost != "draft-host" {
		t.Fatal("editing admitted while operation is pending")
	}
	var state nativeState
	if err := json.Unmarshal(a.nativeSnapshot(), &state); err != nil {
		t.Fatal(err)
	}
	if state.Host != "existing" || state.Draft["sshHost"] != "draft-host" || !state.Pending {
		t.Fatal("native snapshot does not preserve controller state")
	}
	if len(state.Languages) != 3 || state.LocalePreference != "" {
		t.Fatalf("native snapshot languages = %+v, preference = %q", state.Languages, state.LocalePreference)
	}
	if len(state.Programs) != 4 || state.Programs[0].Name != "codex" || state.Programs[0].Action == "" {
		t.Fatalf("native snapshot programs = %+v", state.Programs)
	}
	if state.Strings["openCloud"] == "" || state.Strings["sidebar"] == "" {
		t.Fatal("native UI did not receive translated labels")
	}
	a.pending = false
	a.handleNativeEvent([]byte(`{"action":"savePreferences"}`))
	if a.err != clientError("errorState") {
		t.Fatal("reply settings can be saved without loading them first")
	}
}
