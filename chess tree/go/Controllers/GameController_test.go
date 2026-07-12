package Controllers

import "testing"

func TestProcessingUsernameUsesConfiguredAccount(t *testing.T) {
	t.Setenv("PIPELINE_USERNAME", "  configured-player  ")
	if got := processingUsername(); got != "configured-player" {
		t.Fatalf("processing username = %q, want configured-player", got)
	}
}

func TestProcessingUsernameKeepsCompatibilityFallback(t *testing.T) {
	t.Setenv("PIPELINE_USERNAME", "")
	if got := processingUsername(); got != fallbackProcessingUsername {
		t.Fatalf("processing username = %q, want fallback %q", got, fallbackProcessingUsername)
	}
}

func TestUserProcessingIsSingleFlight(t *testing.T) {
	const username = "single-flight-player"
	endUserProcessing(username)
	if !beginUserProcessing(username) {
		t.Fatal("expected the first processing request to acquire the username")
	}
	if beginUserProcessing("SINGLE-FLIGHT-PLAYER") {
		t.Fatal("expected a concurrent request for the same username to be rejected")
	}
	endUserProcessing(username)
	if !beginUserProcessing(username) {
		t.Fatal("expected the username to be released after processing")
	}
	endUserProcessing(username)
}
