package snapshot

import "github.com/shyn48/duo/internal/model"

func Fixture() model.Snapshot {
	return model.Snapshot{
		Repository: model.Repository{ID: "fixture-vpay", Name: "vpay-backend", Revision: "agent-turn-001"},
		AgentTurn: model.AgentTurn{
			ID: "turn-001", Title: "Add idempotent payment retries", Status: "review", ChangedFiles: 5,
			CompletionClaim: "Implemented retry-safe payment processing and added tests.",
		},
		Nodes: []model.Node{
			{ID: "api", Label: "API", Kind: "component", Status: "related", FileCount: 5},
			{ID: "domain", Label: "Domain", Kind: "component", Status: "related", FileCount: 8},
			{ID: "payments", Label: "Payments", Kind: "component", Status: "changed", FileCount: 12},
			{ID: "adapters", Label: "Adapters", Kind: "component", Status: "related", FileCount: 6},
			{ID: "tests", Label: "Tests", Kind: "component", Status: "changed", FileCount: 10},
		},
		Edges: []model.Edge{
			{From: "api", To: "payments", Kind: "dependency", Status: "changed"},
			{From: "payments", To: "domain", Kind: "dependency", Status: "related"},
			{From: "payments", To: "adapters", Kind: "dependency", Status: "related"},
			{From: "tests", To: "payments", Kind: "verification", Status: "changed"},
		},
		Evidence: []model.Evidence{
			{ID: "diff-payments", Kind: "diff", Title: "Changed payment retry path", Detail: "src/payments/retry.go · +84 −19", Status: "changed", TargetID: "payments"},
			{ID: "diff-api", Kind: "diff", Title: "Payment API contract", Detail: "internal/api/payments.go · +12 −4", Status: "changed", TargetID: "api"},
			{ID: "test-payments", Kind: "test", Title: "Payment retry tests", Detail: "14 passed · 1 failed", Status: "failed", TargetID: "payments"},
			{ID: "test-api", Kind: "test", Title: "API contract tests", Detail: "18 passed · 0 failed", Status: "passed", TargetID: "api"},
			{ID: "constraint-boundary", Kind: "constraint", Title: "Domain boundary", Detail: "Payments may depend on domain, not the reverse", Status: "attention", TargetID: "payments"},
		},
		Verification: model.Verification{Status: "attention", Passed: 141, Failed: 1, Command: "go test ./...", Elapsed: "26s"},
		Candidates: []model.ReviewCandidate{
			{ID: "payments", Label: "Payments", Kind: "component", DiffLines: 103, FanOut: 7, BoundaryCrossings: 2, PublicContractImpact: 1, Verification: "failed", EvidenceIDs: []string{"diff-payments", "test-payments", "constraint-boundary"}, NodeIDs: []string{"payments", "domain", "adapters"}},
			{ID: "api", Label: "API", Kind: "component", DiffLines: 16, FanOut: 3, BoundaryCrossings: 0, PublicContractImpact: 1, Verification: "passed", EvidenceIDs: []string{"diff-api", "test-api"}, NodeIDs: []string{"api", "payments"}},
			{ID: "tests", Label: "Tests", Kind: "component", DiffLines: 45, FanOut: 1, BoundaryCrossings: 0, PublicContractImpact: 0, Verification: "passed", EvidenceIDs: []string{"test-payments"}, NodeIDs: []string{"tests", "payments"}},
		},
	}
}
