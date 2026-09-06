package config

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	"ant-torrent/backend/internal/jsonfile"
)

// 下载器类型取值。存量数据（Type 为空）在加载时由 ensureTypes 回填为 qbittorrent。
const (
	TypeQbittorrent  = "qbittorrent"
	TypeTransmission = "transmission"
)

// ServerConfig represents a qBittorrent server connection configuration.
type ServerConfig struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	URL        string `json:"url"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	AgentToken string `json:"agentToken"`
	// Type 为下载器类型：qbittorrent（默认）| transmission
	Type string `json:"type,omitempty"`
}

// Downloader 返回归一化后的下载器类型（空/未知值兜底为 qbittorrent，
// 防止手工编辑 servers.json 写入非法值导致行为分支失控）。
func (c *ServerConfig) Downloader() string {
	switch c.Type {
	case TypeTransmission:
		return TypeTransmission
	default:
		return TypeQbittorrent
	}
}

// Store manages server configurations with JSON file persistence.
type Store struct {
	path    string
	servers []ServerConfig
	mu      sync.RWMutex
}

// NewStore creates a new Store and loads configurations from the JSON file.
// If the file does not exist, it starts with an empty server list;
// users are guided to add their own servers from the settings page.
func NewStore(path string) *Store {
	s := &Store{path: path}
	if err := s.load(); err != nil {
		// File doesn't exist or is invalid — start empty (no demo seeding)
		s.servers = []ServerConfig{}
		_ = s.save()
	}
	s.ensureAgentTokens()
	s.ensureTypes()
	return s
}

// ensureTypes 为存量服务器回填缺失的下载器类型（幂等，仅缺失时回写一次）。
func (s *Store) ensureTypes() {
	s.mu.Lock()
	defer s.mu.Unlock()
	changed := false
	for i := range s.servers {
		if got := s.servers[i].Downloader(); s.servers[i].Type != got {
			s.servers[i].Type = got
			changed = true
		}
	}
	if changed {
		_ = s.save()
	}
}

// ensureAgentTokens 为存量服务器补生成缺失的 agent token（幂等，仅缺失时回写一次）。
func (s *Store) ensureAgentTokens() {
	s.mu.Lock()
	defer s.mu.Unlock()
	changed := false
	for i := range s.servers {
		if s.servers[i].AgentToken == "" {
			s.servers[i].AgentToken = generateToken()
			changed = true
		}
	}
	if changed {
		_ = s.save()
	}
}

// List returns all server configurations.
func (s *Store) List() []ServerConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]ServerConfig, len(s.servers))
	copy(result, s.servers)
	return result
}

// Get returns a server configuration by ID, or nil if not found.
func (s *Store) Get(id string) *ServerConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.servers {
		if s.servers[i].ID == id {
			cfg := s.servers[i]
			return &cfg
		}
	}
	return nil
}

// Create adds a new server configuration and returns its generated ID.
func (s *Store) Create(cfg ServerConfig) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	if cfg.ID == "" {
		cfg.ID = generateID()
	}
	if cfg.AgentToken == "" {
		cfg.AgentToken = generateToken()
	}
	if cfg.Type == "" {
		cfg.Type = TypeQbittorrent
	}
	s.servers = append(s.servers, cfg)
	_ = s.save()
	return cfg.ID
}

// Update modifies an existing server configuration with the given patch.
func (s *Store) Update(id string, patch map[string]any) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.servers {
		if s.servers[i].ID != id {
			continue
		}
		if v, ok := patch["name"].(string); ok {
			s.servers[i].Name = v
		}
		if v, ok := patch["url"].(string); ok {
			s.servers[i].URL = v
		}
		if v, ok := patch["username"].(string); ok {
			s.servers[i].Username = v
		}
		if v, ok := patch["password"].(string); ok {
			s.servers[i].Password = v
		}
		if v, ok := patch["type"].(string); ok && (v == TypeQbittorrent || v == TypeTransmission) {
			s.servers[i].Type = v
		}
		_ = s.save()
		return nil
	}
	return fmt.Errorf("server %s not found", id)
}

// Delete removes a server configuration by ID.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.servers {
		if s.servers[i].ID == id {
			s.servers = append(s.servers[:i], s.servers[i+1:]...)
			_ = s.save()
			return nil
		}
	}
	return errors.New("server not found")
}

// RegenerateAgentToken 重置服务器的 agent token 并持久化，返回新 token。
func (s *Store) RegenerateAgentToken(id string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.servers {
		if s.servers[i].ID == id {
			s.servers[i].AgentToken = generateToken()
			_ = s.save()
			return s.servers[i].AgentToken, nil
		}
	}
	return "", errors.New("server not found")
}

// load reads server configurations from the JSON file.
func (s *Store) load() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, &s.servers)
}

// save writes server configurations to the JSON file.
func (s *Store) save() error {
	// 统一走原子写；0644 仅为新建文件时的默认权限，已存在的文件沿用其权限位
	return jsonfile.Write(s.path, s.servers, 0o644)
}

// generateID creates a simple unique ID based on timestamp.
func generateID() string {
	return fmt.Sprintf("srv-%d", time.Now().UnixNano()%100000)
}

// generateToken 生成 agent 认证用的随机十六进制密钥。
func generateToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand 失败极罕见；退化到时间戳保证可用
		return fmt.Sprintf("fallback-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}
