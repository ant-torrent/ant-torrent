// CLI 子命令：ant-torrent <子命令> [参数]。
// 无子命令时启动服务端（见 main.go）。数据路径沿用服务端约定：
// 相对进程 CWD 的 ./data/，reset-password 可用 --data-dir/-d 覆盖，
// 但必须与运行中服务端的数据目录一致——CLI 写入 auth.json 后，
// 运行中的服务端会按文件指纹热感知（踢出全部会话），无需重启。
package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"ant-torrent/backend/internal/auth"
)

// runSubcommand 执行子命令，返回进程退出码。
func runSubcommand(name string, args []string) int {
	switch name {
	case "reset-password":
		return runResetPassword(args)
	case "help", "-h", "--help":
		printUsage(os.Stdout)
		return 0
	default:
		fmt.Fprintf(os.Stderr, "未知子命令: %s\n\n", name)
		printUsage(os.Stderr)
		return 2
	}
}

func printUsage(w *os.File) {
	fmt.Fprintf(w, `AntTorrent 后端

用法:
  ant-torrent                       启动服务端（监听 :8080，数据目录为 CWD 下的 ./data/）
  ant-torrent <子命令> [参数]

子命令:
  reset-password [--data-dir 路径]   重置密码为 8-12 位随机密码并使全部已登录会话失效
  help                              显示本帮助
`)
}

func runResetPassword(args []string) int {
	fs := flag.NewFlagSet("reset-password", flag.ExitOnError)
	dataDir := fs.String("data-dir", "./data", "数据目录（须与运行中服务端一致）")
	// -d 为 -data-dir 的缩写（两个 flag 绑定同一变量）
	fs.StringVar(dataDir, "d", "./data", "数据目录（须与运行中服务端一致，-data-dir 缩写）")
	_ = fs.Parse(args)

	store, err := auth.NewStore(filepath.Join(*dataDir, auth.FileName))
	if err != nil {
		fmt.Fprintf(os.Stderr, "读取账号数据失败: %v\n", err)
		return 1
	}
	password, err := auth.GenerateRandomPassword()
	if err != nil {
		fmt.Fprintf(os.Stderr, "生成随机密码失败: %v\n", err)
		return 1
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		fmt.Fprintf(os.Stderr, "加密密码失败: %v\n", err)
		return 1
	}
	if err := store.SetPasswordHash(hash); err != nil {
		if errors.Is(err, auth.ErrNotSetUp) {
			fmt.Fprintln(os.Stderr, "尚未设置账号，请先启动服务端完成初始化引导，无需重置密码。")
			return 1
		}
		fmt.Fprintf(os.Stderr, "保存新密码失败: %v\n", err)
		return 1
	}

	fmt.Printf("AntTorrent 密码已重置\n")
	fmt.Printf("  用户名:   %s\n", store.Username())
	fmt.Printf("  新密码:   %s\n", password)
	fmt.Printf("  数据文件: %s\n", filepath.Join(*dataDir, auth.FileName))
	fmt.Printf("\n所有已登录会话已失效（正在运行的服务端会自动感知，无需重启）。\n请使用新密码重新登录，并妥善保存新密码（它不会再次显示）。\n")
	return 0
}
