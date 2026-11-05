package main

import (
	_ "embed"
	"encoding/json"
	"strings"

	"github.com/YunYouJun/el-bot/apps/el-bot-client/locales"
	"github.com/egoist/mygo"
	"github.com/egoist/mygo/i18n"
)

// The Go catalogs and controller remain the only source of product state.
//
//go:embed locales/en.json
var nativeCatalog []byte

type nativeChoice struct {
	Value string `json:"value"`
	Name  string `json:"name"`
}
type nativeState struct {
	Page               string            `json:"page"`
	Locale             string            `json:"locale"`
	Strings            map[string]string `json:"strings"`
	Draft              map[string]string `json:"draft"`
	AppPaths           map[string]string `json:"appPaths"`
	Host               string            `json:"host"`
	Pending            bool              `json:"pending"`
	LocalExpanded      bool              `json:"localExpanded"`
	Error              string            `json:"error"`
	Note               string            `json:"note"`
	Phase              string            `json:"phase"`
	QQ                 string            `json:"qq"`
	Agent              string            `json:"agent"`
	AgentConnection    string            `json:"agentConnection"`
	Task               string            `json:"task"`
	PhaseKey           string            `json:"phaseKey"`
	Preferences        Preferences       `json:"preferences"`
	PreferencesLoaded  bool              `json:"preferencesLoaded"`
	Logs               string            `json:"logs"`
	PersonaLoaded      bool              `json:"personaLoaded"`
	PersonaName        string            `json:"personaName"`
	PersonaDescription string            `json:"personaDescription"`
	PersonaSelection   string            `json:"personaSelection"`
	PersonaChoices     []nativeChoice    `json:"personaChoices"`
}

func (a *app) nativeSnapshot() []byte {
	var catalog map[string]json.RawMessage
	_ = json.Unmarshal(nativeCatalog, &catalog)
	texts := map[string]string{}
	for key := range catalog {
		if !strings.HasPrefix(key, "@") {
			texts[key] = locales.Catalog.Format(i18n.Locale(), key, nil)
		}
	}
	s := nativeState{
		Page: a.page, Locale: i18n.Locale(), Strings: texts,
		Draft: a.draft.fields(),
		AppPaths: map[string]string{
			"codex": a.settings.CodexAppPath, "qq": a.settings.QqAppPath,
			"codebuddy": a.settings.CodebuddyAppPath, "dsh": a.settings.DshAppPath,
		},
		Host: a.settings.Cloud.SSHHost, Pending: a.pending, LocalExpanded: a.localExpanded,
		Phase: phaseLabel(a.status.Phase), PhaseKey: a.status.Phase,
		QQ: connectionLabel(a.status.QQ), Agent: textOr(a.status.Agent, "Codex"),
		AgentConnection: connectionLabel(a.status.Codex),
		Preferences:     a.preferences, PreferencesLoaded: a.preferencesLoaded, Logs: a.logs,
		PersonaLoaded: a.personas != nil, PersonaName: t("defaultPersona"),
		PersonaDescription: t("defaultDescription"), PersonaSelection: a.personaSelection,
		PersonaChoices: []nativeChoice{{"default", t("defaultPersona")}},
	}
	if a.err != nil {
		s.Error = errorText(a.err)
	}
	if a.note != "" {
		s.Note = t(a.note)
	}
	if a.status.Task != nil {
		s.Task = a.status.Task.ID + " · " + a.status.Task.Status
	}
	if a.personas != nil {
		for _, card := range a.personas.Library.Cards {
			s.PersonaChoices = append(s.PersonaChoices, nativeChoice{card.Metadata.ID + ":" + card.Hash, card.Metadata.Name})
			if active := a.personas.Library.Active; active != nil && active.ID == card.Metadata.ID {
				for _, revision := range card.Revisions {
					if revision.Hash == active.Hash {
						s.PersonaName = revision.Metadata.Name
						s.PersonaDescription = revision.Metadata.Description
						if revision.Hash != card.Hash {
							s.PersonaChoices = append(s.PersonaChoices, nativeChoice{active.ID + ":" + active.Hash, revision.Metadata.Name})
						}
					}
				}
			}
		}
	}
	data, _ := json.Marshal(s)
	return data
}

func (s Settings) fields() map[string]string {
	return map[string]string{
		"sshHost": s.Cloud.SSHHost, "nodePath": s.NodePath, "cliPath": s.CLIPath,
		"configPath": s.ConfigPath, "credentialsPath": s.CredentialsPath, "statePath": s.StatePath,
		"codexAppPath": s.CodexAppPath, "codebuddyAppPath": s.CodebuddyAppPath,
		"dshAppPath": s.DshAppPath, "qqAppPath": s.QqAppPath,
	}
}
func (s *Settings) field(key string) *string {
	switch key {
	case "sshHost":
		return &s.Cloud.SSHHost
	case "nodePath":
		return &s.NodePath
	case "cliPath":
		return &s.CLIPath
	case "configPath":
		return &s.ConfigPath
	case "credentialsPath":
		return &s.CredentialsPath
	case "statePath":
		return &s.StatePath
	case "codexAppPath":
		return &s.CodexAppPath
	case "codebuddyAppPath":
		return &s.CodebuddyAppPath
	case "dshAppPath":
		return &s.DshAppPath
	case "qqAppPath":
		return &s.QqAppPath
	}
	return nil
}

type nativeEvent struct {
	Action string `json:"action"`
	Value  string `json:"value"`
	Field  string `json:"field"`
}

func decodeNativeEvent(data []byte) (nativeEvent, error) {
	var event nativeEvent
	if len(data) > 16384 || json.Unmarshal(data, &event) != nil || strings.ContainsRune(event.Value, 0) {
		return event, clientError("errorOperation")
	}
	valid := false
	switch event.Action {
	case "navigate":
		valid = event.Value == "quickActions" || event.Value == "personas" || event.Value == "settings"
	case "locale":
		valid = event.Value == "" || event.Value == "en" || event.Value == "zh-Hans"
	case "openProgram":
		valid = event.Value == "codex" || event.Value == "qq" || event.Value == "codebuddy" || event.Value == "dsh"
	case "edit", "choosePath":
		var s Settings
		valid = s.field(event.Field) != nil && (event.Action != "choosePath" || event.Field != "sshHost")
	case "toggleLocal":
		valid = event.Value == "true" || event.Value == "false"
	case "persona":
		if event.Value == "default" {
			valid = true
		} else {
			p := strings.SplitN(event.Value, ":", 2)
			valid = len(p) == 2 && personaPattern.MatchString(p[0]) && revisionPattern.MatchString(p[1])
		}
	case "editPreference":
		valid = (event.Field == "messageFormat" && (event.Value == "image" || event.Value == "markdown" || event.Value == "text")) || (event.Field == "imageTheme" && (event.Value == "light" || event.Value == "dark"))
	case "openCloud", "managePersonas", "refreshPersonas", "refreshStatus", "start", "stop", "restart", "saveCloud", "saveLocal", "readPreferences", "savePreferences", "logs":
		valid = event.Value == "" && event.Field == ""
	}
	if !valid {
		return event, clientError("errorOperation")
	}
	return event, nil
}
func (a *app) handleNativeEvent(data []byte) {
	e, err := decodeNativeEvent(data)
	if err != nil {
		a.err = err
		a.invalidate()
		return
	}
	if a.pending && e.Action != "locale" && e.Action != "navigate" {
		return
	}
	switch e.Action {
	case "navigate":
		a.navigate(e.Value)
	case "locale":
		mygo.App.SetLocale(e.Value)
	case "openCloud":
		a.launchCloud(false)
	case "managePersonas":
		a.launchCloud(true)
	case "openProgram":
		a.launchProgram(e.Value)
	case "refreshPersonas":
		a.readPersonas("list", "", "")
	case "toggleLocal":
		a.localExpanded = e.Value == "true"
		if a.localExpanded {
			a.command("status")
		}
	case "refreshStatus":
		a.command("status")
	case "start", "stop", "restart":
		a.action(e.Action)
	case "edit":
		*a.draft.field(e.Field) = e.Value
	case "choosePath":
		a.chooseNativePath(e.Field)
	case "saveCloud":
		a.save(true)
	case "saveLocal":
		a.save(false)
	case "readPreferences":
		a.command("preferences")
	case "editPreference":
		if e.Field == "messageFormat" {
			a.preferences.MessageFormat = e.Value
		} else {
			a.preferences.ImageTheme = e.Value
		}
	case "savePreferences":
		if a.preferencesLoaded {
			a.command("preferences", "--message-format", a.preferences.MessageFormat, "--image-theme", a.preferences.ImageTheme)
		} else {
			a.err = clientError("errorState")
		}
	case "logs":
		a.command("logs")
	case "persona":
		if e.Value == "default" {
			a.readPersonas("disable", "", "")
		} else {
			parts := strings.SplitN(e.Value, ":", 2)
			a.readPersonas("use", parts[0], parts[1])
		}
	}
	a.invalidate()
}
func (a *app) chooseNativePath(key string) {
	parent := a.win
	go func() {
		paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: parent, Title: t(key)})
		mygo.RunOnMain(func() {
			if a.win == parent && err == nil && len(paths) > 0 {
				*a.draft.field(key) = paths[0]
				a.invalidate()
			}
		})
	}()
}
