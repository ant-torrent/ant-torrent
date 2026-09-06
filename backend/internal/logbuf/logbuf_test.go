package logbuf

import (
	"fmt"
	"strings"
	"sync"
	"testing"
)

func TestWriteSplitsLines(t *testing.T) {
	b := New(100)
	// 一次写入多行 + 分多次写入的半行拼接
	n, err := b.Write([]byte("line1\nline2\nli"))
	if err != nil || n != len("line1\nline2\nli") {
		t.Fatalf("Write 返回 %d, %v", n, err)
	}
	// 半行（无换行）作为最后一行返回，但不与后续写入合并成新行
	if got := b.Lines(); len(got) != 3 || got[0] != "line1" || got[1] != "line2" || got[2] != "li" {
		t.Fatalf("完整行应入列、半行作最后一行: %q", got)
	}
	b.Write([]byte("ne3\n"))
	got := b.Lines()
	if len(got) != 3 || got[2] != "line3" {
		t.Fatalf("半行应与后续写入拼接: %q", got)
	}
}

func TestPartialLineReturnedAsLast(t *testing.T) {
	b := New(100)
	b.Write([]byte("a\nb")) // b 无换行
	got := b.Lines()
	if len(got) != 2 || got[1] != "b" {
		t.Fatalf("未凑整半行应作为最后一行: %q", got)
	}
}

func TestCapEvictionKeepsNewest(t *testing.T) {
	b := New(3)
	for i := 0; i < 5; i++ {
		b.Write([]byte(fmt.Sprintf("l%d\n", i)))
	}
	got := b.Lines()
	if len(got) != 3 || got[0] != "l2" || got[2] != "l4" {
		t.Fatalf("超容量应丢弃最旧行: %q", got)
	}
}

func TestTrimsCarriageReturn(t *testing.T) {
	b := New(10)
	b.Write([]byte("with-cr\r\n"))
	if got := b.Lines(); got[0] != "with-cr" {
		t.Fatalf("应去除行尾 \\r: %q", got)
	}
}

func TestConcurrentWrites(t *testing.T) {
	b := New(DefaultCap)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				b.Write([]byte(fmt.Sprintf("g%d-l%d\n", i, j)))
			}
		}(i)
	}
	wg.Wait()
	got := b.Lines()
	if len(got) != 800 { // 未超容量，应全量保留
		t.Fatalf("并发 800 行(未超容量)应全量保留, got %d", len(got))
	}
	if joined := strings.Join(got, "\n"); strings.Contains(joined, "\r") || strings.Contains(joined, "g\n") {
		t.Error("并发写入不应产生撕裂行")
	}
}
