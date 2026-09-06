package auth

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestValidateNewPassword(t *testing.T) {
	cases := []struct {
		pw  string
		err error
	}{
		{"1234567", ErrPasswordTooShort},
		{"12345678", nil},
		{strings.Repeat("a", MinPasswordBytes), nil},
		{strings.Repeat("a", MaxPasswordBytes), nil}, // 恰好 72 字节
		{strings.Repeat("a", MaxPasswordBytes+1), ErrPasswordTooLong},
	}
	for _, c := range cases {
		if got := ValidateNewPassword(c.pw); !errors.Is(got, c.err) {
			t.Errorf("ValidateNewPassword(%q bytes=%d) = %v, want %v", c.pw, len(c.pw), got, c.err)
		}
	}
}

func TestPasswordHashRoundTrip(t *testing.T) {
	hash, err := HashPassword("s3cret-pw")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(hash, "s3cret-pw") {
		t.Error("正确密码未通过校验")
	}
	if CheckPassword(hash, "wrong-pw") {
		t.Error("错误密码通过了校验")
	}
}

func TestGenerateRandomPassword(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		pw, err := GenerateRandomPassword()
		if err != nil {
			t.Fatal(err)
		}
		if n := len(pw); n < 8 || n > 12 {
			t.Fatalf("密码长度 %d 超出 [8,12]", n)
		}
		var hasLower, hasUpper, hasDigit bool
		for _, ch := range pw {
			switch {
			case strings.ContainsRune(pwLower, ch):
				hasLower = true
			case strings.ContainsRune(pwUpper, ch):
				hasUpper = true
			case strings.ContainsRune(pwDigits, ch):
				hasDigit = true
			default:
				t.Fatalf("密码 %q 含字符集外字符 %q", pw, ch)
			}
		}
		if !hasLower || !hasUpper || !hasDigit {
			t.Fatalf("密码 %q 未同时包含大小写与数字", pw)
		}
		if seen[pw] {
			t.Fatalf("200 次内出现重复密码 %q", pw)
		}
		seen[pw] = true
	}
}

func TestTokenMintAndVerify(t *testing.T) {
	const secret = "test-secret"
	now := time.Unix(1_700_000_000, 0)
	tok, err := mintToken(secret, 3, "admin", time.Hour, now)
	if err != nil {
		t.Fatal(err)
	}
	c, err := verifyToken(secret, 3, tok, now.Add(time.Minute))
	if err != nil {
		t.Fatalf("有效令牌校验失败: %v", err)
	}
	if c.U != "admin" {
		t.Errorf("用户名 = %q, want admin", c.U)
	}

	// 密钥不匹配
	if _, err := verifyToken("other-secret", 3, tok, now); err == nil {
		t.Error("换密钥后令牌仍通过")
	}
	// epoch 不匹配（会话已被踢出）
	if _, err := verifyToken(secret, 4, tok, now); err == nil {
		t.Error("epoch 推进后令牌仍通过")
	}
	// 过期
	if _, err := verifyToken(secret, 3, tok, now.Add(2*time.Hour)); err == nil {
		t.Error("过期令牌仍通过")
	}
	// 篡改载荷
	if _, err := verifyToken(secret, 3, tok[:len(tok)-2]+"AA", now); err == nil {
		t.Error("篡改后的令牌仍通过")
	}
}

func TestLoginLimiter(t *testing.T) {
	l := NewLoginLimiter()
	key := "1.2.3.4"
	for i := 0; i < perIPMaxFails-1; i++ {
		if !l.Allow(key) {
			t.Fatalf("第 %d 次失败后不应锁定", i+1)
		}
		l.Fail(key)
	}
	if !l.Allow(key) {
		t.Fatal("未达阈值不应锁定")
	}
	l.Fail(key) // 第 5 次 → 锁定
	if l.Allow(key) {
		t.Error("达到阈值后应锁定")
	}
	if d := l.RetryAfter(key); d <= 0 || d > perIPLockout {
		t.Errorf("RetryAfter = %v, 应在 (0, %v]", d, perIPLockout)
	}
	l.Reset(key)
	if !l.Allow(key) {
		t.Error("Reset 后应解锁")
	}
}

func TestLoginLimiterGlobalFallback(t *testing.T) {
	l := NewLoginLimiter()
	// 每换一个 IP 各失败 1 次,不超过单 IP 阈值,但累计达到全局阈值
	for i := 0; i < globalMaxFails; i++ {
		key := "10.0.0." + string(rune('a'+i%26)) + string(rune('a'+i/26))
		if i < globalMaxFails-1 && !l.Allow(key) {
			t.Fatalf("未达全局阈值不应锁定 (i=%d)", i)
		}
		l.Fail(key)
	}
	if l.Allow("10.9.9.9") {
		t.Error("达到全局阈值后,新 IP 也应被限锁")
	}
}

// newTestStore 在临时目录创建已设置账号的 Store。
func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := NewStore(filepath.Join(t.TempDir(), FileName))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Setup("admin", "admin-pw-123"); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestStoreNotSetUpAndCorruptFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), FileName)

	s, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	required, err := s.SetupRequired()
	if err != nil || !required {
		t.Fatalf("空文件应报告需要初始化, got %v, %v", required, err)
	}
	if err := s.VerifyLogin("admin", "x"); !errors.Is(err, ErrNotSetUp) {
		t.Errorf("未设置账号时登录应返回 ErrNotSetUp, got %v", err)
	}
	if err := s.SetPasswordHash("x"); !errors.Is(err, ErrNotSetUp) {
		t.Errorf("未设置账号时重置应返回 ErrNotSetUp, got %v", err)
	}

	// 已有账号后文件被破坏:重载必须报错,绝不能回退为「未设置」
	if err := s.Setup("admin", "admin-pw-123"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetupRequired(); err == nil {
		t.Error("auth.json 损坏后读路径应报错")
	}
}

func TestStoreSetupTwiceRejected(t *testing.T) {
	s := newTestStore(t)
	if err := s.Setup("root", "another-pw-1"); !errors.Is(err, ErrAlreadySetUp) {
		t.Errorf("重复初始化应返回 ErrAlreadySetUp, got %v", err)
	}
}

func TestStoreLoginAndChangePassword(t *testing.T) {
	s := newTestStore(t)
	now := time.Now()

	if err := s.VerifyLogin("admin", "wrong-pw-1"); !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("错误密码应返回 ErrInvalidCredentials, got %v", err)
	}
	if err := s.VerifyLogin("nobody", "admin-pw-123"); !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("错误用户名应返回 ErrInvalidCredentials, got %v", err)
	}

	oldToken, _, err := s.IssueToken("admin", now)
	if err != nil {
		t.Fatal(err)
	}
	// 改密码:错误旧密码被拒;正确旧密码成功且推进 epoch
	if err := s.ChangePassword("admin", "bad-old-pw", "new-pw-12345"); !errors.Is(err, ErrWrongPassword) {
		t.Errorf("错误旧密码应返回 ErrWrongPassword, got %v", err)
	}
	if err := s.ChangePassword("admin", "admin-pw-123", "new-pw-12345"); err != nil {
		t.Fatal(err)
	}
	if err := s.VerifyLogin("admin", "new-pw-12345"); err != nil {
		t.Fatalf("新密码登录失败: %v", err)
	}
	if _, _, err := s.VerifyToken(oldToken, time.Now()); err == nil {
		t.Error("改密码后旧会话令牌应失效")
	}
}

func TestStoreHotReloadAfterExternalWrite(t *testing.T) {
	path := filepath.Join(t.TempDir(), FileName)
	server, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := server.Setup("admin", "admin-pw-123"); err != nil {
		t.Fatal(err)
	}
	token, _, err := server.IssueToken("admin", time.Now())
	if err != nil {
		t.Fatal(err)
	}

	// 模拟 CLI 重置:另开一个 Store 实例写新哈希(epoch+1)
	cli, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	hash, err := HashPassword("cli-pw-1234")
	if err != nil {
		t.Fatal(err)
	}
	if err := cli.SetPasswordHash(hash); err != nil {
		t.Fatal(err)
	}

	// 原服务端实例须热感知新 epoch:旧令牌失效、新密码可登录
	if _, _, err := server.VerifyToken(token, time.Now()); err == nil {
		t.Error("服务端未感知 CLI 重置,旧会话仍有效")
	}
	if err := server.VerifyLogin("admin", "cli-pw-1234"); err != nil {
		t.Errorf("服务端未感知 CLI 重置,新密码登录失败: %v", err)
	}
}

func TestStoreTokenRefreshWindow(t *testing.T) {
	s := newTestStore(t)
	now := time.Now()
	token, _, err := s.IssueToken("admin", now)
	if err != nil {
		t.Fatal(err)
	}
	// 签发初期:无需续期;超过 RefreshThreshold 后:应续期
	_, refresh, err := s.VerifyToken(token, now.Add(time.Minute))
	if err != nil || refresh {
		t.Errorf("签发初期 refresh = %v, err = %v, want false, nil", refresh, err)
	}
	_, refresh, err = s.VerifyToken(token, now.Add(SessionTTL-RefreshThreshold-time.Minute).Add(time.Minute))
	if err != nil || !refresh {
		t.Errorf("临近过期 refresh = %v, err = %v, want true, nil", refresh, err)
	}
}

func TestStoreSetupPersistsAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, FileName)
	s1, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := s1.Setup("admin", "admin-pw-123"); err != nil {
		t.Fatal(err)
	}
	s2, err := NewStore(path) // 模拟重启
	if err != nil {
		t.Fatal(err)
	}
	if required, _ := s2.SetupRequired(); required {
		t.Error("重启后不应再要求初始化")
	}
	if err := s2.VerifyLogin("admin", "admin-pw-123"); err != nil {
		t.Errorf("重启后登录失败: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("auth.json 权限 = %o, want 600", perm)
	}
}
