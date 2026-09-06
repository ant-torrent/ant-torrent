// Package jsonfile 提供 JSON 配置文件的统一原子落盘工具。
package jsonfile

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Write 将 v 以 JSON（两空格缩进）原子写入 path：
// 先写同目录临时文件并 fsync，再 rename 覆盖，进程中断也不会留下半截文件。
// 目标文件已存在时沿用其现有权限位（保护用户手动收紧的权限），否则使用 perm。
func Write(path string, v any, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if info, err := os.Stat(path); err == nil {
		perm = info.Mode().Perm()
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	// 失败路径清理临时文件；成功路径 rename 后文件已不存在，Remove 报错无妨
	defer func() { _ = os.Remove(tmpName) }()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}
