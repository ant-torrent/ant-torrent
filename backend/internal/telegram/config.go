// Package telegram 提供 Telegram bot 集成（v1：添加种子到指定服务器）：
// 后端以长轮询接收更新，经用户 ID 白名单鉴权后，把磁力链接 / .torrent
// 文件投递到用户选定的 qBittorrent / Transmission 服务器。
//
// 配置持久化在 data/settings.json 的 telegram 段。类型定义在本包、由
// internal/settings 引用（与 internal/ai 的拆分方式一致，避免 import 环）；
// bot 生命周期见 manager.go（借鉴 ai/mcp 的 Reconcile + 配置指纹模式）。
package telegram

import "ant-torrent/backend/internal/i18n"

// Config 为 Telegram bot 的全部配置，持久化在 data/settings.json。
type Config struct {
	Enabled        bool    `json:"enabled"`
	BotToken       string  `json:"botToken"`       // 永不回传给前端
	AllowedUserIDs []int64 `json:"allowedUserIds"` // 用户 ID 白名单（运行中实时读取，改动即生效）
	ProxyURL       string  `json:"proxyUrl"`       // 空 = 直连；http(s):// 或 socks5://
	Language       string  `json:"language"`       // bot 文案语言：zh-CN | en-US（空 = zh-CN）
}

// Clone 返回深拷贝（AllowedUserIDs 切片独立，防外部修改共享底层数组）。
func (c Config) Clone() Config {
	out := c
	out.AllowedUserIDs = append([]int64(nil), c.AllowedUserIDs...)
	return out
}

// Configured 判断 bot 是否具备启动条件（不校验 token 网络有效性）。
func (c Config) Configured() bool {
	return c.Enabled && c.BotToken != ""
}

// IsAllowed 判断 Telegram 用户 ID 是否在白名单内。
func (c Config) IsAllowed(userID int64) bool {
	for _, id := range c.AllowedUserIDs {
		if id == userID {
			return true
		}
	}
	return false
}

// Lang 返回 bot 文案语言，空值/非法值兜底 zh-CN。
func (c Config) Lang() string {
	if c.Language == i18n.EnUS {
		return i18n.EnUS
	}
	return i18n.ZhCN
}

// ConfigStore 为 Telegram 配置的持久化后端接口（由 internal/settings.Store
// 实现——settings.json 的读写归属通用配置层，本包不反向依赖 settings，避免依赖环）。
type ConfigStore interface {
	TelegramConfig() Config
	SaveTelegramConfig(cfg Config) error
}
