package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
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
	return mux
}

func (s *Server) Decisions() []model.ReviewDecision {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]model.ReviewDecision(nil), s.decisions...)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": "0.1.0"})
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, http.MethodGet)
		return
	}
	targets, err := s.provider.RankReviewTargets(r.Context(), model.ReviewState{SnapshotID: s.snapshot.AgentTurn.ID, Candidates: cloneCandidates(s.snapshot.Candidates)})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"snapshot": s.snapshot, "reviewTargets": targets, "decisions": s.Decisions()})
}

func (s *Server) handleReviewDecision(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, http.MethodPost)
		return
	}
	if !allowedOrigin(r.Header.Get("Origin")) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "origin is not allowed"})
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": "Content-Type must be application/json"})
		return
	}
	var input struct {
		TargetID string `json:"targetId"`
		Decision string `json:"decision"`
		Reason   string `json:"reason"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
		return
	}
	input.TargetID = strings.TrimSpace(input.TargetID)
	input.Decision = strings.ToLower(strings.TrimSpace(input.Decision))
	input.Reason = strings.TrimSpace(input.Reason)
	if input.TargetID == "" || (input.Decision != "approve" && input.Decision != "revise" && input.Decision != "reject") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "targetId and decision (approve, revise, reject) are required"})
		return
	}
	if !s.hasReviewTarget(input.TargetID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown review target"})
		return
	}
	decisionID, err := newDecisionID()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to create review decision"})
		return
	}
	createdAt := time.Now().UTC()
	decision := model.ReviewDecision{ID: decisionID, TargetID: input.TargetID, Decision: input.Decision, Reason: input.Reason, CreatedAt: createdAt}
	s.mu.Lock()
	s.decisions = append(s.decisions, decision)
	s.mu.Unlock()
	writeJSON(w, http.StatusCreated, decision)
}

func (s *Server) hasReviewTarget(targetID string) bool {
	for _, candidate := range s.snapshot.Candidates {
		if candidate.ID == targetID {
			return true
		}
	}
	return false
}

func cloneCandidates(candidates []model.ReviewCandidate) []model.ReviewCandidate {
	cloned := make([]model.ReviewCandidate, len(candidates))
	copy(cloned, candidates)
	for i := range cloned {
		cloned[i].EvidenceIDs = append([]string(nil), candidates[i].EvidenceIDs...)
		cloned[i].NodeIDs = append([]string(nil), candidates[i].NodeIDs...)
	}
	return cloned
}

func allowedOrigin(origin string) bool {
	if strings.TrimSpace(origin) == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := parsed.Hostname()
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func newDecisionID() (string, error) {
	var bytes [12]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return "decision-" + hex.EncodeToString(bytes[:]), nil
}

func methodNotAllowed(w http.ResponseWriter, allowed string) {
	w.Header().Set("Allow", allowed)
	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
