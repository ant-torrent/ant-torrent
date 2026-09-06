package auth

import (
	"sync"
	"time"
)

// 登录防爆破参数：同一来源 15 分钟内失败 5 次锁 5 分钟；
// 全局 60 秒内失败 20 次全局限锁 60 秒——gin 默认信任所有代理，
// ClientIP 可被伪造 X-Forwarded-For 绕过，全局兜底防换 IP 撞库。
const (
	perIPMaxFails  = 5
	perIPWindow    = 15 * time.Minute
	perIPLockout   = 5 * time.Minute
	globalMaxFails = 20
	globalWindow   = time.Minute
	globalLockout  = time.Minute
)

// failRecord 记录一个键的失败计数窗口与锁定截止时间。
type failRecord struct {
	fails       int
	windowStart time.Time
	lockUntil   time.Time
}

// LoginLimiter 以内存计数实现登录防爆破：按 ClientIP 分桶，另设全局限锁兜底。
type LoginLimiter struct {
	mu     sync.Mutex
	fails  map[string]*failRecord
	global failRecord
}

// NewLoginLimiter 创建防爆破限流器。
func NewLoginLimiter() *LoginLimiter {
	return &LoginLimiter{fails: make(map[string]*failRecord)}
}

// Allow 报告该来源当前是否允许尝试登录。
func (l *LoginLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	return !blocked(&l.global, now) && !blocked(l.recordLocked(key), now)
}

// Fail 记录一次失败尝试；锁定期间不累计、不延长，锁定到期自然解除。
func (l *LoginLimiter) Fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	rec := l.recordLocked(key)
	if !blocked(rec, now) {
		bump(rec, perIPMaxFails, perIPWindow, perIPLockout, now)
	}
	if !blocked(&l.global, now) {
		bump(&l.global, globalMaxFails, globalWindow, globalLockout, now)
	}
	l.evictLocked(now)
}

// Reset 登录成功后清零该来源的失败计数。
func (l *LoginLimiter) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.fails, key)
}

// RetryAfter 返回该来源的剩余锁定时长（未锁定为 0）。
func (l *LoginLimiter) RetryAfter(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, rec := range []*failRecord{l.recordLocked(key), &l.global} {
		if d := time.Until(rec.lockUntil); d > 0 {
			return d
		}
	}
	return 0
}

func (l *LoginLimiter) recordLocked(key string) *failRecord {
	rec, ok := l.fails[key]
	if !ok {
		rec = &failRecord{}
		l.fails[key] = rec
	}
	return rec
}

// evictLocked 惰性清理已解锁且无未过期失败计数的条目，防 map 无界增长。
func (l *LoginLimiter) evictLocked(now time.Time) {
	for k, rec := range l.fails {
		if !blocked(rec, now) && rec.fails == 0 {
			delete(l.fails, k)
		}
	}
}

func blocked(rec *failRecord, now time.Time) bool {
	return now.Before(rec.lockUntil)
}

// bump 在窗口内累计失败，达到阈值即锁定并重置计数窗口。
func bump(rec *failRecord, maxFails int, window, lockout time.Duration, now time.Time) {
	if rec.windowStart.IsZero() || now.Sub(rec.windowStart) > window {
		rec.fails = 0
		rec.windowStart = now
	}
	rec.fails++
	if rec.fails >= maxFails {
		rec.lockUntil = now.Add(lockout)
		rec.fails = 0
		rec.windowStart = time.Time{}
	}
}
