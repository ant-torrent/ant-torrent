// Package auth 实现 AntTorrent 的单用户账号认证：
// 账号与 bcrypt 密码哈希持久化在 data/auth.json（0600），
// 会话为 HMAC 签名的无状态令牌（见 session.go），经 epoch 控制批量失效。
package auth

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"ant-torrent/backend/internal/jsonfile"
)

// FileName 为账号数据文件名，位于服务端数据目录（相对进程 CWD 的 ./data/）。
const FileName = "auth.json"

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrWrongPassword      = errors.New("wrong password")
	ErrNotSetUp           = errors.New("account not set up")
	ErrAlreadySetUp       = errors.New("account already set up")
	ErrUsernameRequired   = errors.New("username required")
)

// Record 为 auth.json 的落盘结构。SessionSecret 用于签发会话令牌；
// SessionEpoch 推进后所有旧令牌失效（改密码 / CLI 重置时 +1）。
type Record struct {
	Username      string `json:"username"`
	PasswordHash  string `json:"passwordHash"`  // bcrypt
	SessionSecret string `json:"sessionSecret"` // 32 字节随机 hex
	SessionEpoch  int64  `json:"sessionEpoch"`
}

// fileStamp 为文件指纹（mtime + size），用于检测 CLI 对 auth.json 的外部修改。
type fileStamp struct {
	mtime time.Time
	size  int64
	valid bool
}

// Store 管理账号记录与令牌的签发/校验。
// auth.json 可被 CLI 并发修改（如 reset-password），故读路径先按文件指纹
// 热重载——运行中的服务端无需重启即可感知 CLI 重置并踢出全部会话。
type Store struct {
	path    string
	mu      sync.Mutex
	rec     Record
	present bool      // 是否已设置账号（内存态，见 reloadIfNeeded）
	stamp   fileStamp // 上次加载时的文件指纹
}

// NewStore 加载 auth.json。文件不存在 → 未设置账号（present=false）；
// 文件存在但损坏 → 返回错误，调用方应拒绝启动——回退为「未设置」会让
// 任何人通过破坏文件重新初始化账号接管系统。
func NewStore(path string) (*Store, error) {
	s := &Store{path: path}
	if err := s.reloadIfNeeded(); err != nil {
		return nil, err
	}
	return s, nil
}

// SetupRequired 报告是否尚未设置账号（决定前端进入初始化引导还是登录页）。
func (s *Store) SetupRequired() (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.reloadIfNeeded(); err != nil {
		return false, err
	}
	return !s.present, nil
}

// Username 返回当前账号用户名（未设置时为空串）。
func (s *Store) Username() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.rec.Username
}

// Setup 初始化账号（仅未设置时可用）：生成会话密钥、写入 bcrypt 哈希并落盘。
func (s *Store) Setup(username, password string) error {
	if strings.TrimSpace(username) == "" {
		return ErrUsernameRequired
	}
	if err := ValidateNewPassword(password); err != nil {
		return err
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.reloadIfNeeded(); err != nil {
		return err
	}
	if s.present {
		return ErrAlreadySetUp
	}
	return s.persistLocked(Record{
		Username:      username,
		PasswordHash:  hash,
		SessionSecret: randomHex32(),
		SessionEpoch:  1,
	})
}

// VerifyLogin 校验登录凭据。用户名不匹配与密码错误统一返回
// ErrInvalidCredentials，不泄露「用户名是否存在」。
func (s *Store) VerifyLogin(username, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.reloadIfNeeded(); err != nil {
		return err
	}
	if !s.present {
		return ErrNotSetUp
	}
	if subtle.ConstantTimeCompare([]byte(username), []byte(s.rec.Username)) != 1 ||
		!CheckPassword(s.rec.PasswordHash, password) {
		return ErrInvalidCredentials
	}
	return nil
}

// ChangePassword 校验旧密码后更新为新哈希并推进 epoch（其他会话全部失效）。
func (s *Store) ChangePassword(username, oldPassword, newPassword string) error {
	if err := ValidateNewPassword(newPassword); err != nil {
		return err
	}
	hash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.reloadIfNeeded(); err != nil {
		return err
	}
	if !s.present {
		return ErrNotSetUp
	}
	if subtle.ConstantTimeCompare([]byte(username), []byte(s.rec.Username)) != 1 ||
		!CheckPassword(s.rec.PasswordHash, oldPassword) {
		return ErrWrongPassword
	}
	s.rec.PasswordHash = hash
	s.rec.SessionEpoch++
	return s.persistLocked(s.rec)
}

// SetPasswordHash 供 CLI 重置密码使用：写入新哈希并推进 epoch 踢出全部会话。
// 账号未设置时报错（此时应启动服务端走初始化引导，而非重置）。
func (s *Store) SetPasswordHash(hash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.reloadIfNeeded(); err != nil {
		return err
	}
	if !s.present {
		return ErrNotSetUp
	}
	s.rec.PasswordHash = hash
	s.rec.SessionEpoch++
	return s.persistLocked(s.rec)
}

// IssueToken 为用户签发会话令牌，返回令牌与过期时间。
func (s *Store) IssueToken(username string, now time.Time) (token string, exp time.Time, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	exp = now.Add(SessionTTL)
	token, err = mintToken(s.rec.SessionSecret, s.rec.SessionEpoch, username, SessionTTL, now)
	return token, exp, err
}

// VerifyToken 校验会话令牌，返回用户名与是否应滑动续期。
// 续期判据只取决于令牌自身剩余有效期（确定性），与任何服务端状态无关，
// 多标签页并发续期各得一个合法令牌，cookie 覆盖谁都不产生失效。
func (s *Store) VerifyToken(token string, now time.Time) (username string, refresh bool, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.reloadIfNeeded(); err != nil {
		return "", false, err
	}
	if !s.present {
		return "", false, ErrNotSetUp
	}
	c, err := verifyToken(s.rec.SessionSecret, s.rec.SessionEpoch, token, now)
	if err != nil {
		return "", false, err
	}
	refresh = now.Unix() >= c.Exp-int64(RefreshThreshold/time.Second)
	return c.U, refresh, nil
}

// reloadIfNeeded 检测 auth.json 的外部变更并重载。
// 文件在运行中被删除时不降级为「未设置」——沿用内存记录
// （防删文件绕过认证重新初始化），重启后按「未设置」处理。
func (s *Store) reloadIfNeeded() error {
	stamp, present, err := statFile(s.path)
	if err != nil {
		return err
	}
	if !present {
		return nil
	}
	if s.present && stamp == s.stamp {
		return nil
	}
	data, err := os.ReadFile(s.path)
	if err != nil {
		return err
	}
	var rec Record
	if err := json.Unmarshal(data, &rec); err != nil {
		return fmt.Errorf("解析 %s 失败: %w", s.path, err)
	}
	s.rec, s.present, s.stamp = rec, true, stamp
	return nil
}

// persistLocked 落盘并同步内存态与文件指纹（避免下次读路径重复加载）。
func (s *Store) persistLocked(rec Record) error {
	if err := jsonfile.Write(s.path, rec, 0o600); err != nil {
		return err
	}
	s.rec = rec
	s.present = true
	if stamp, _, err := statFile(s.path); err == nil {
		s.stamp = stamp
	}
	return nil
}

// statFile 返回文件指纹；文件不存在时 present=false 且不视为错误。
func statFile(path string) (fileStamp, bool, error) {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fileStamp{}, false, nil
		}
		return fileStamp{}, false, err
	}
	return fileStamp{mtime: info.ModTime(), size: info.Size(), valid: true}, true, nil
}
