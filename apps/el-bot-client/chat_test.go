package main

import "testing"

func TestChatPairingHasNoArbitraryRemoteTarget(t *testing.T) {
	for _, value := range []string{
		`{"action":"pairChat","value":"https://other.example"}`,
		`{"action":"pairChat","field":"sshHost","value":"phone"}`,
		`{"action":"pairChat","value":"phone; command"}`,
	} {
		if _, err := decodeNativeEvent([]byte(value)); err == nil {
			t.Fatal("accepted an arbitrary pairing target")
		}
	}
	for _, value := range []string{"", "phone"} {
		if _, err := decodeNativeEvent([]byte(`{"action":"pairChat","value":"` + value + `"}`)); err != nil {
			t.Fatal(err)
		}
	}
}
