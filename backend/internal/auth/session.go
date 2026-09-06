package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// 会话与 cookie 参数。SessionTTL 为 30 天滑动过期：剩余不足 RefreshThreshold 时
// 在认证成功的响应中重发新 cookie。续期只延长过期时间、不推进 epoch——
// epoch 仅在改密码 / CLI 重置时 +1，用于批量踢出会话。
const (
	CookieName       = "ant_session"
	SessionTTL       = 30 * 24 * time.Hour
	RefreshThreshold = 15 * 24 * time.Hour
)

// claims 为会话令牌载荷：用户名、签发时的会话纪元与过期时间（Unix 秒）。
// token = base64url(payload) + "." + base64url(HMAC-SHA256(payload, secret))，
// 纯标准库实现，无服务端会话表（无状态，多标签页/多设备各自持有独立令牌）。
type claims struct {
	U   string `json:"u"`
	E   int64  `json:"e"`
	Exp int64  `json:"exp"`
}

var errInvalidToken = errors.New("invalid session token")

// mintToken 签发会话令牌。
func mintToken(secret string, epoch int64, username string, ttl time.Duration, now time.Time) (string, error) {
	payload, err := json.Marshal(claims{U: username, E: epoch, Exp: now.Add(ttl).Unix()})
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmacSha256([]byte(encoded), secret)
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac), nil
}

// verifyToken 校验令牌签名、纪元与有效期，返回载荷。
func verifyToken(secret string, epoch int64, token string, now time.Time) (claims, error) {
	encoded, sig, ok := strings.Cut(token, ".")
	if !ok {
		return claims{}, errInvalidToken
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return claims{}, errInvalidToken
	}
	// hmac.Equal 为常数时间比较，防时序侧信道
	if !hmac.Equal(hmacSha256([]byte(encoded), secret), got) {
		return claims{}, errInvalidToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return claims{}, errInvalidToken
	}
	var c claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return claims{}, errInvalidToken
	}
	if c.E != epoch || now.Unix() >= c.Exp {
		return claims{}, errInvalidToken
	}
	return c, nil
}

func hmacSha256(data []byte, secret string) []byte {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write(data)
	return h.Sum(nil)
}

// randomHex32 生成 64 位十六进制会话签名密钥。
// crypto/rand 失败时直接 panic——会话密钥无法退化生成（可预测 = 全部失守）。
func randomHex32() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand 不可用，无法生成会话密钥: " + err.Error())
	}
	return hex.EncodeToString(b)
}
