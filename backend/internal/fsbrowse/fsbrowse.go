// Package fsbrowse 提供目录枚举实现。本文件是两份拷贝之一（另一份在独立仓库
// github.com/ant-torrent/ant-agent 的 internal/fsbrowse），两份除 import 路径外
// 保持一致，保证后端本机模式与 agent 两条路径的排序、过滤与错误码语义一致；
// 改动任一侧必须同步另一侧。
package fsbrowse

import (
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"ant-torrent/backend/internal/protocol"
)

// Result 为目录枚举结果；Code 非空表示错误，此时 Status 为建议的 HTTP 状态码。
type Result struct {
	protocol.FsListResult
	Code   string
	Status int
}

// DefaultDir 返回空路径时的默认起始目录（用户家目录，取不到则退化为根）。
func DefaultDir() string {
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return home
	}
	return string(filepath.Separator)
}

// List 枚举 dir 下的一级子目录。raw 为空时使用默认目录；相对路径报 invalidPath。
func List(raw string) Result {
	dir := raw
	if dir == "" {
		dir = DefaultDir()
	} else {
		dir = filepath.Clean(dir)
		if !filepath.IsAbs(dir) {
			return Result{Code: "invalidPath", Status: http.StatusBadRequest}
		}
	}
	info, err := os.Stat(dir)
	if err != nil {
		code, status := statError(err)
		return Result{Code: code, Status: status}
	}
	if !info.IsDir() {
		return Result{Code: "notADirectory", Status: http.StatusBadRequest}
	}
	items, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, fs.ErrPermission) {
			return Result{Code: "pathPermissionDenied", Status: http.StatusForbidden}
		}
		return Result{Code: "fsReadFailed", Status: http.StatusInternalServerError}
	}
	entries := make([]protocol.FsEntry, 0, len(items))
	for _, e := range items {
		if !isDirEntry(dir, e) {
			continue
		}
		entries = append(entries, protocol.FsEntry{Name: e.Name(), Path: filepath.Join(dir, e.Name())})
	}
	sort.Slice(entries, func(i, j int) bool {
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	parent := filepath.Dir(dir)
	if parent == dir {
		parent = "" // 已到根目录
	}
	return Result{FsListResult: protocol.FsListResult{Path: dir, Parent: parent, Entries: entries}}
}

// statError 映射 os.Stat 错误为错误码与 HTTP 状态。
func statError(err error) (string, int) {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return "pathNotFound", http.StatusNotFound
	case errors.Is(err, fs.ErrPermission):
		return "pathPermissionDenied", http.StatusForbidden
	default:
		return "fsReadFailed", http.StatusInternalServerError
	}
}

// isDirEntry 判断目录项是否为目录；symlink 跟随目标（解析失败按非目录跳过）。
func isDirEntry(dir string, e fs.DirEntry) bool {
	if e.IsDir() {
		return true
	}
	if e.Type()&fs.ModeSymlink == 0 {
		return false
	}
	info, err := os.Stat(filepath.Join(dir, e.Name()))
	return err == nil && info.IsDir()
}
