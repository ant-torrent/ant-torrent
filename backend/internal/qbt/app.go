package qbt

import (
	"net/http"
	"strings"
)

// GetDefaultSavePath 返回 qBittorrent 默认保存路径（纯文本端点 app/defaultSavePath）。
func (m *ClientManager) GetDefaultSavePath(serverID string, conn Conn) (string, error) {
	body, status, err := m.doRequest(serverID, conn, http.MethodGet, "app/defaultSavePath", nil)
	if err != nil {
		return "", err
	}
	if status != http.StatusOK {
		return "", &APIError{Status: http.StatusBadGateway, Code: "getDefaultSavePathFailed", Args: []any{status}}
	}
	return strings.TrimSpace(string(body)), nil
}
