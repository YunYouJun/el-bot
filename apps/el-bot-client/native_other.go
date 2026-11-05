//go:build !darwin

package main

import "github.com/egoist/mygo"

type nativeView struct{}

func (a *app) attachNative(*mygo.Window) (*nativeView, error) { return nil, nil }
func (*nativeView) render([]byte)                             {}
func (*nativeView) close()                                    {}
