package main

import (
	"os"
	"path/filepath"
	"sync"
	"unsafe"

	"github.com/ebitengine/purego"
	"github.com/egoist/mygo"
)

type nativeView struct{ window uintptr }

var nativeLibrary struct {
	sync.Once
	err     error
	install func(uintptr, string, int, uintptr) int32
	update  func(uintptr, string, int) int32
	close   func(uintptr)
}

func (a *app) attachNative(window *mygo.Window) (*nativeView, error) {
	nativeLibrary.Do(func() {
		executable, err := os.Executable()
		if err != nil {
			nativeLibrary.err = err
			return
		}
		library := filepath.Join(filepath.Dir(executable), "../Resources/libYunBotNative.dylib")
		handle, err := purego.Dlopen(library, purego.RTLD_NOW|purego.RTLD_LOCAL)
		if err != nil {
			nativeLibrary.err = clientError("errorNativeUI")
			return
		}
		var version func() int32
		purego.RegisterLibFunc(&version, handle, "YunBotNativeVersion")
		if version() != 1 {
			nativeLibrary.err = clientError("errorNativeUI")
			return
		}
		purego.RegisterLibFunc(&nativeLibrary.install, handle, "YunBotNativeInstall")
		purego.RegisterLibFunc(&nativeLibrary.update, handle, "YunBotNativeUpdate")
		purego.RegisterLibFunc(&nativeLibrary.close, handle, "YunBotNativeClose")
	})
	if nativeLibrary.err != nil {
		return nil, nativeLibrary.err
	}
	if a.nativeCallback == 0 {
		a.nativeCallback = purego.NewCallback(func(source uintptr, data *byte, length int) {
			if length < 0 || length > 16384 || data == nil {
				return
			}
			copy := append([]byte(nil), unsafe.Slice(data, length)...)
			mygo.RunOnMain(func() {
				if a.win != nil && a.native != nil && a.native.window == source {
					a.handleNativeEvent(copy)
				}
			})
		})
	}
	view := &nativeView{window.NativeHandle()}
	data := a.nativeSnapshot()
	if nativeLibrary.install(view.window, string(data), len(data), a.nativeCallback) != 1 {
		return nil, clientError("errorNativeUI")
	}
	return view, nil
}
func (v *nativeView) render(data []byte) { nativeLibrary.update(v.window, string(data), len(data)) }
func (v *nativeView) close()             { nativeLibrary.close(v.window) }
