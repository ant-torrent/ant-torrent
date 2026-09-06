// Package settings 统一管理 data/settings.json：应用级配置（日志 + AI 助手）。
//
// 文件结构（v2，含 log 段）：
//
//	{"log": {"level": "info", "format": "text", "accessLog": true}, "ai": {...}}
//
// 兼容 v1（历史版本根对象即 AIConfig，无任何包裹段）：加载时识别并按旧格式
// 读取，下次保存自然迁移为新结构。
package settings

import (
	"encoding/json"
	"os"
	"sync"

	"ant-torrent/backend/internal/ai"
	"ant-torrent/backend/internal/jsonfile"
)

// FileName 为配置文件名，位于服务端数据目录（相对进程 CWD 的 ./data/）。
const FileName = "settings.json"

// 日志配置合法取值。
var (
	LogLevels  = []string{"debug", "info", "warn", "error"}
	LogFormats = []string{"text", "json"}
)

// LogConfig 为日志配置：级别、输出格式、访问日志开关。保存即生效（运行中热更新）。
type LogConfig struct {
	Level     string `json:"level"`     // debug | info | warn | error
	Format    string `json:"format"`    // text | json
	AccessLog bool   `json:"accessLog"` // gin 请求访问日志开关
}

// DefaultLogConfig 返回日志默认配置。
func DefaultLogConfig() LogConfig {
	return LogConfig{Level: "info", Format: "text", AccessLog: true}
}

// Config 为 settings.json 的落盘结构。
type Config struct {
	Log LogConfig   `json:"log"`
	AI  ai.AIConfig `json:"ai"`
}

// Store 管理 settings.json 的加载与保存。
type Store struct {
	path string
	mu   sync.Mutex
	cfg  Config
}

// NewStore 加载 settings.json。文件不存在 → 全默认（AI 关闭、日志 info/text/开）；
// v1 旧格式（根对象即 AIConfig）→ 自动识别并迁移读取，log 段取默认值。
func NewStore(path string) *Store {
	s := &Store{path: path, cfg: Config{Log: DefaultLogConfig()}}
	s.load()
	return s
}

// Log 返回日志配置。
func (s *Store) Log() LogConfig {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cfg.Log
}

// SaveLog 校验并保存日志配置。
func (s *Store) SaveLog(cfg LogConfig) (LogConfig, error) {
	cfg = normalizeLog(cfg)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cfg.Log = cfg
	return cfg, s.persistLocked()
}

// AIConfig 返回 AI 配置副本。
func (s *Store) AIConfig() ai.AIConfig {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cfg.AI.Clone()
}

// SaveAIConfig 保存 AI 配置。
func (s *Store) SaveAIConfig(cfg ai.AIConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cfg.AI = cfg.Clone()
	return s.persistLocked()
}

// load 读取磁盘；容忍损坏文件（保留默认值，首次保存时覆盖）。
func (s *Store) load() {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var raw map[string]json.RawMessage
	if json.Unmarshal(data, &raw) != nil {
		return
	}
	if aiRaw, ok := raw["ai"]; ok {
		_ = json.Unmarshal(aiRaw, &s.cfg.AI)
	} else {
		// v1 旧格式：根对象即 AIConfig
		_ = json.Unmarshal(data, &s.cfg.AI)
	}
	if logRaw, ok := raw["log"]; ok {
		_ = json.Unmarshal(logRaw, &s.cfg.Log)
		// accessLog 缺省视为开启（bool 零值无法区分「未设置」与「显式关闭」）
		var lm map[string]json.RawMessage
		if json.Unmarshal(logRaw, &lm) == nil {
			if _, present := lm["accessLog"]; !present {
				s.cfg.Log.AccessLog = true
			}
		}
	}
	s.cfg.Log = normalizeLog(s.cfg.Log)
}

// normalizeLog 归一化非法取值（如手改文件），避免非法配置导致日志失效。
func normalizeLog(cfg LogConfig) LogConfig {
	def := DefaultLogConfig()
	if !contains(LogLevels, cfg.Level) {
		cfg.Level = def.Level
	}
	if !contains(LogFormats, cfg.Format) {
		cfg.Format = def.Format
	}
	return cfg
}

func contains(list []string, v string) bool {
	for _, item := range list {
		if item == v {
			return true
		}
	}
	return false
}

// persistLocked 落盘（0600：含 LLM API Key；已有文件沿用其权限位）。
func (s *Store) persistLocked() error {
	return jsonfile.Write(s.path, s.cfg, 0o600)
}
