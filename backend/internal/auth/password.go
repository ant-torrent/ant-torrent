package auth

import (
	"crypto/rand"
	"errors"
	"math/big"

	"golang.org/x/crypto/bcrypt"
)

// 密码长度边界（按字节）：下限防弱口令；上限 72 字节是 bcrypt 的静默截断点，
// 不设上限会导致「改密成功」与「实际生效密码」不一致。
const (
	MinPasswordBytes = 8
	MaxPasswordBytes = 72
)

var (
	ErrPasswordTooShort = errors.New("password too short")
	ErrPasswordTooLong  = errors.New("password too long")
)

// ValidateNewPassword 校验新密码长度。
func ValidateNewPassword(pw string) error {
	if len(pw) < MinPasswordBytes {
		return ErrPasswordTooShort
	}
	if len(pw) > MaxPasswordBytes {
		return ErrPasswordTooLong
	}
	return nil
}

// HashPassword 生成 bcrypt 哈希。
func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// CheckPassword 校验明文密码与哈希是否匹配。
func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// 随机密码字符集：大小写字母 + 数字，剔除肉眼易混淆的字符（O/0、I/l/1）。
const (
	pwLower  = "abcdefghijkmnpqrstuvwxyz"
	pwUpper  = "ABCDEFGHJKLMNPQRSTUVWXYZ"
	pwDigits = "23456789"
)

// GenerateRandomPassword 生成长度在 8~12 位间均匀随机的密码，
// 大小写字母与数字各至少一位（用于 CLI reset-password）。
func GenerateRandomPassword() (string, error) {
	const (
		minLen = 8
		maxLen = 12
	)
	all := pwLower + pwUpper + pwDigits
	n, err := randInt(maxLen - minLen + 1)
	if err != nil {
		return "", err
	}
	length := minLen + n

	pw := make([]byte, length)
	// 前 3 位各取一类保证覆盖，随后洗牌打散固定位置
	for i, set := range []string{pwLower, pwUpper, pwDigits} {
		c, err := pickByte(set)
		if err != nil {
			return "", err
		}
		pw[i] = c
	}
	for i := 3; i < length; i++ {
		c, err := pickByte(all)
		if err != nil {
			return "", err
		}
		pw[i] = c
	}
	// Fisher-Yates 洗牌（加密安全随机源）
	for i := length - 1; i > 0; i-- {
		j, err := randInt(i + 1)
		if err != nil {
			return "", err
		}
		pw[i], pw[j] = pw[j], pw[i]
	}
	return string(pw), nil
}

// pickByte 从字符集中等概率取一个字符。
func pickByte(set string) (byte, error) {
	i, err := randInt(len(set))
	if err != nil {
		return 0, err
	}
	return set[i], nil
}

// randInt 返回 [0, n) 内的加密安全随机整数。
func randInt(n int) (int, error) {
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0, err
	}
	return int(v.Int64()), nil
}
