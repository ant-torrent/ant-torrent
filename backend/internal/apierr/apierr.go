// Package apierr 提供跨下载器共享的 API 错误类型：
// Status 用于 handler 回写 HTTP 状态码，Code+Args 交 i18n 渲染用户文案。
package apierr

import "errors"

// APIError 为带 HTTP 状态码与 i18n 错误码的业务错误。
type APIError struct {
	Status int
	Code   string
	Args   []any
}

func (e *APIError) Error() string { return e.Code }

// New 构造 APIError。
func New(status int, code string, args ...any) error {
	return &APIError{Status: status, Code: code, Args: args}
}

// As 从错误链中提取 *APIError。
func As(err error) (*APIError, bool) {
	var e *APIError
	if errors.As(err, &e) {
		return e, true
	}
	return nil, false
}
