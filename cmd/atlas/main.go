package main

import (
	"flag"
	"log"
	"net/http"

	"github.com/shyn48/duo/internal/httpapi"
	"github.com/shyn48/duo/internal/review"
	"github.com/shyn48/duo/internal/snapshot"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:4173", "HTTP listen address")
	flag.Parse()

	server := httpapi.NewServer(snapshot.Fixture(), review.NewDeterministicProvider())
	log.Printf("Duo Atlas API listening on http://%s", *addr)
	if err := http.ListenAndServe(*addr, server.Handler()); err != nil {
		log.Fatal(err)
	}
}
