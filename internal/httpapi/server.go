package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/shyn48/duo/internal/model"
	"github.com/shyn48/duo/internal/review"
)

type Server struct {
	snapshot  model.Snapshot
	provider  review.JudgmentProvider
	mu        sync.RWMutex
	decisions []model.ReviewDecision
}

func NewServer(snapshot model.Snapshot, provider review.JudgmentProvider) *Server {
	return &Server{snapshot: snapshot, provider: provider}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/snapshot", s.handleSnapshot)
	mux.HandleFunc("/api/review-decisions", s.handleReviewDecision)
	return withCORS(mux)
}

func (s *Server) Decisions() []model.ReviewDecision {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]model.ReviewDecision(nil), s.decisions...)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": "0.1.0"})
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	targets, err := s.provider.RankReviewTargets(r.Context(), model.ReviewState{SnapshotID: s.snapshot.AgentTurn.ID, Candidates: s.snapshot.Candidates})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"snapshot": s.snapshot, "reviewTargets": targets, "decisions": s.Decisions()})
}

func (s *Server) handleReviewDecision(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	var input struct {
		TargetID string `json:"targetId"`
		Decision string `json:"decision"`
		Reason   string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}
	input.Decision = strings.ToLower(strings.TrimSpace(input.Decision))
	if input.TargetID == "" || (input.Decision != "approve" && input.Decision != "revise" && input.Decision != "reject") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "targetId and decision (approve, revise, reject) are required"})
		return
	}
	decision := model.ReviewDecision{ID: "decision-" + time.Now().UTC().Format("20060102T150405.000000000"), TargetID: input.TargetID, Decision: input.Decision, Reason: input.Reason, CreatedAt: time.Now().UTC()}
	s.mu.Lock()
	s.decisions = append(s.decisions, decision)
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, decision)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
