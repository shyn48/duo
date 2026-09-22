package main

import (
	"flag"
	"log"
	"net"
	"net/http"
	"strings"

	"github.com/shyn48/duo/internal/httpapi"
	"github.com/shyn48/duo/internal/review"
	"github.com/shyn48/duo/internal/snapshot"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:4173", "HTTP listen address")
	repositoryPath := flag.String("repo", ".", "repository path to ingest")
	flag.Parse()
	if !isLoopbackAddr(*addr) {
		log.Fatalf("Duo Atlas only supports loopback listen addresses in local mode; got %q", *addr)
	}

	repositorySnapshot, err := snapshot.LoadRepository(*repositoryPath)
	if err != nil {
		log.Fatalf("load repository %q: %v", *repositoryPath, err)
	}
	server := httpapi.NewServer(repositorySnapshot, review.NewDeterministicProvider())
	log.Printf("Duo Atlas API listening on http://%s for %s", *addr, repositorySnapshot.Repository.Root)
	if err := http.ListenAndServe(*addr, server.Handler()); err != nil {
		log.Fatal(err)
	}
}

func isLoopbackAddr(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil || host == "" {
		return false
	}
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
