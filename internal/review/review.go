package review

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/shyn48/duo/internal/model"
)

type JudgmentProvider interface {
	RankReviewTargets(context.Context, model.ReviewState) ([]model.ReviewTarget, error)
}

type DeterministicProvider struct{}

type scoredTarget struct {
	target model.ReviewTarget
	units  int
}

func NewDeterministicProvider() DeterministicProvider { return DeterministicProvider{} }

func (DeterministicProvider) RankReviewTargets(_ context.Context, input model.ReviewState) ([]model.ReviewTarget, error) {
	scored := make([]scoredTarget, 0, len(input.Candidates))
	for _, candidate := range input.Candidates {
		units := scoreUnits(candidate)
		scored = append(scored, scoredTarget{target: model.ReviewTarget{
			ID:             candidate.ID,
			Label:          candidate.Label,
			Kind:           candidate.Kind,
			Score:          float64(units) / 20,
			Reason:         reason(candidate),
			Confidence:     1,
			JudgmentSource: "deterministic",
			Signals: model.ReviewSignals{
				DiffLines:            candidate.DiffLines,
				FanOut:               candidate.FanOut,
				BoundaryCrossings:    candidate.BoundaryCrossings,
				PublicContractImpact: candidate.PublicContractImpact,
				Verification:         candidate.Verification,
			},
			EvidenceIDs: append([]string(nil), candidate.EvidenceIDs...),
			NodeIDs:     append([]string(nil), candidate.NodeIDs...),
		}, units: units})
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].units == scored[j].units {
			return scored[i].target.ID < scored[j].target.ID
		}
		return scored[i].units > scored[j].units
	})
	targets := make([]model.ReviewTarget, len(scored))
	for i := range scored {
		targets[i] = scored[i].target
		targets[i].Rank = i + 1
	}
	return targets, nil
}

func scoreUnits(candidate model.ReviewCandidate) int {
	result := candidate.DiffLines + candidate.FanOut*3
	result += candidate.BoundaryCrossings * 40
	result += candidate.PublicContractImpact * 30
	switch strings.ToLower(candidate.Verification) {
	case "failed":
		result += 40
	case "unknown", "":
		result += 10
	}
	return result
}

func reason(candidate model.ReviewCandidate) string {
	parts := make([]string, 0, 4)
	if candidate.BoundaryCrossings > 0 {
		parts = append(parts, fmt.Sprintf("%d boundary crossing(s)", candidate.BoundaryCrossings))
	}
	if candidate.FanOut > 0 {
		parts = append(parts, fmt.Sprintf("fan-out %d", candidate.FanOut))
	}
	if candidate.PublicContractImpact > 0 {
		parts = append(parts, "public contract impact")
	}
	if strings.EqualFold(candidate.Verification, "failed") {
		parts = append(parts, "verification failed")
	}
	if len(parts) == 0 {
		return "Review changed evidence and direct dependents"
	}
	return "Review first: " + strings.Join(parts, " · ")
}
