// Package protocol 定义 AntTorrent 后端与 agent 之间的 WebSocket 消息协议。
// 本文件是两份拷贝之一（另一份在独立仓库 github.com/ant-torrent/ant-agent 的
// internal/protocol），两仓库分属不同 Go module、编译器不再兜底，改动必须两仓库同步；
// 线上契约文档见 backend/README.md 与 ant-agent 仓库 README。
//
// 通信模型：agent 主动反向连接后端 /api/agent/ws，连接后立即上报 hello；
// 之后端到 agent 的 RPC 请求按 id 配对响应，method 采用命名空间（如 "fs.list"），
// 后续可扩展新方法而不破坏协议。
package protocol

import "encoding/json"

// AgentHello 为 agent 连接建立后立即上报的事件帧。
type AgentHello struct {
	Event string `json:"event"` // 固定 "hello"
	Data  struct {
		Version     string   `json:"version"`
		AllowedDirs []string `json:"allowedDirs"`
	} `json:"data"`
}

// AgentRequest 为后端 → agent 的 RPC 请求（JSON 文本帧）。
type AgentRequest struct {
	ID     uint64          `json:"id"`
	Method string          `json:"method"` // 如 "fs.list"
	Params json.RawMessage `json:"params,omitempty"`
}

// AgentError 错误只携带 code，文案由后端按 Accept-Language 渲染，
// Message 仅作调试信息不面向用户。
type AgentError struct {
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

// AgentResponse 为 agent → 后端的 RPC 响应。
type AgentResponse struct {
	ID     uint64          `json:"id"`
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *AgentError     `json:"error,omitempty"`
}

// FsListParams 为 fs.list 的请求参数。
type FsListParams struct {
	Path string `json:"path"`
}

// FsEntry 为目录条目（仅目录，不含文件）。
type FsEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// FsListResult 为 fs.list 的响应。
type FsListResult struct {
	Path    string    `json:"path"`
	Parent  string    `json:"parent"` // 根目录为空字符串
	Entries []FsEntry `json:"entries"`
}
