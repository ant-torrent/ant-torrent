// Package logbuf 提供进程内环形日志缓冲：后端日志双写到 stderr + 本缓冲，
// 供前端「日志」页查看（/api/logs）。不落盘，容量按行数封顶，超出丢弃最旧行；
// 进程重启即清空（排障针对当前进程，历史日志交给容器 logs / systemd journal）。
package logbuf

import (
	"strings"
	"sync"
)

// DefaultCap 默认缓冲行数（约数百 KB 内存上限）。
const DefaultCap = 2000

// LogBuf 是 io.Writer 兼容的按行环形缓冲，并发安全。
type LogBuf struct {
	mu      sync.Mutex
	lines   []string
	cap     int
	partial strings.Builder // 尚未遇到 \n 的半行，凑整后才入列
}

// New 创建容量为 cap 行的缓冲。
func New(cap int) *LogBuf {
	if cap <= 0 {
		cap = DefaultCap
	}
	return &LogBuf{cap: cap}
}

// Write 实现 io.Writer（log.SetOutput / gin.DefaultWriter 的多路复用目标）。
// 一次写入可能含多行；未以换行结尾的尾巴留存，与后续写入拼接。
func (b *LogBuf) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.partial.Write(p)
	for {
		line, rest, found := strings.Cut(b.partial.String(), "\n")
		if !found {
			break
		}
		b.addLine(line)
		b.partial.Reset()
		b.partial.WriteString(rest)
	}
	return len(p), nil
}

// Lines 返回缓冲副本（旧 → 新），未凑整的半行作为最后一行返回。
func (b *LogBuf) Lines() []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]string, len(b.lines), len(b.lines)+1)
	copy(out, b.lines)
	if partial := b.partial.String(); partial != "" {
		out = append(out, partial)
	}
	return out
}

func (b *LogBuf) addLine(line string) {
	line = strings.TrimRight(line, "\r")
	b.lines = append(b.lines, line)
	if over := len(b.lines) - b.cap; over > 0 {
		b.lines = append(b.lines[:0], b.lines[over:]...)
	}
}
