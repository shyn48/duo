package main

import "testing"

func TestIsLoopbackAddr(t *testing.T) {
	for _, test := range []struct {
		name string
		addr string
		want bool
	}{
		{name: "ipv4", addr: "127.0.0.1:4173", want: true},
		{name: "ipv6", addr: "[::1]:4173", want: true},
		{name: "localhost", addr: "localhost:4173", want: true},
		{name: "all interfaces", addr: ":4173", want: false},
		{name: "explicit all interfaces", addr: "0.0.0.0:4173", want: false},
		{name: "remote", addr: "192.168.1.10:4173", want: false},
		{name: "invalid", addr: "not-an-address", want: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := isLoopbackAddr(test.addr); got != test.want {
				t.Fatalf("isLoopbackAddr(%q) = %v, want %v", test.addr, got, test.want)
			}
		})
	}
}
