package i18n

import (
	"fmt"
	"strings"
)

// 支持的语言，未知语言回退 zh-CN
const (
	ZhCN = "zh-CN"
	EnUS = "en-US"
)

// messages 为文案表：key → 各语言文案（可含 %s/%d 占位符）。
var messages = map[string]map[string]string{
	ZhCN: {
		"serverNotFound":           "服务器不存在",
		"invalidRequestBody":       "请求参数无效",
		"serverNameEmpty":          "服务器名称不能为空",
		"serverUrlEmpty":           "接口地址不能为空",
		"categoryNameEmpty":        "分类名不能为空",
		"categoryNameInvalid":      "分类名无效",
		"categoryEditFailed":       "分类编辑失败",
		"categoriesRequired":       "未指定要删除的分类",
		"tagsRequired":             "未指定要操作的标签",
		"getCategoriesFailed":      "获取分类失败（HTTP %d）",
		"getTagsFailed":            "获取标签失败（HTTP %d）",
		"tagCreateFailed":          "标签创建失败",
		"tagDeleteFailed":          "标签删除失败",
		"loginFailed":              "登录 qBittorrent 失败，请检查服务器连接配置",
		"unreachable":              "无法连接到 qBittorrent 服务器（%s）",
		"parseError":               "解析 qBittorrent 响应失败",
		"qbError":                  "qBittorrent 返回 HTTP %d",
		"getDefaultSavePathFailed": "获取默认保存路径失败（HTTP %d）",
		"pathNotFound":             "目录不存在",
		"notADirectory":            "路径不是目录",
		"pathPermissionDenied":     "没有权限访问该目录",
		"invalidPath":              "必须提供绝对路径",
		"fsReadFailed":             "读取目录失败",
		"pathOutsideAllowedDirs":   "路径不在 agent 允许的目录范围内",
		"agentRequired":            "该服务器为远程部署，需在其所在机器安装 agent 才能浏览目录",
		"agentOffline":             "agent 连接已断开",
		"agentTimeout":             "agent 响应超时",
		"agentError":               "调用 agent 失败",
		"aiInvalidProvider":        "大模型协议仅支持 openai 或 anthropic",
		"aiModelRequired":          "启用 AI 助手时必须填写模型名称",
		"aiApiKeyRequired":         "启用 AI 助手时必须填写 API Key",
		"aiMcpNameRequired":        "MCP 服务器名称不能为空",
		"aiMcpTypeInvalid":         "MCP 服务器类型仅支持 stdio 或 http",
		"aiStdioCommandRequired":   "stdio 类型的 MCP 服务器必须填写启动命令",
		"aiHttpUrlRequired":        "http 类型的 MCP 服务器必须填写 URL",
		"aiSaveFailed":             "保存 AI 配置失败（%v）",
		"aiNotConfigured":          "AI 助手未启用，请先在应用设置中完成配置",
		"authRequired":             "请先登录",
		"authInvalidCredentials":   "用户名或密码错误",
		"authNotSetUp":             "尚未设置账号，请先完成初始化引导",
		"authAlreadySetUp":         "账号已设置，无需重复初始化",
		"authUsernameRequired":     "用户名不能为空",
		"authPasswordTooShort":     "密码至少 8 位",
		"authPasswordTooLong":      "密码过长（最多 72 字节）",
		"authWrongPassword":        "原密码不正确",
		"authTooManyAttempts":      "尝试次数过多，请 %d 分钟后再试",
		"authSaveFailed":           "保存账号信息失败（%v）",
		"authSessionIssueFailed":   "签发会话失败",
		"authStoreBroken":          "账号数据异常，请检查 data/auth.json",
		"logInvalidLevel":          "日志级别仅支持 debug / info / warn / error",
		"logInvalidFormat":         "日志格式仅支持 text / json",
		"logSaveFailed":            "保存日志配置失败（%v）",
		"trUnreachable":            "无法连接到 Transmission 服务器（%s）",
		"trAuthFailed":             "Transmission 认证失败，请检查服务器连接配置",
		"trError":                  "Transmission 返回错误（%s）",
		"trParseError":             "解析 Transmission 响应失败",
		"downloaderTypeMismatch":   "该操作与服务器类型不匹配",
		"torrentNotFound":          "种子不存在",
		"trSessionKeyInvalid":      "不支持的配置键：%s",
		"invalidServerType":        "下载器类型仅支持 qbittorrent 或 transmission",
	},
	EnUS: {
		"serverNotFound":           "Server not found",
		"invalidRequestBody":       "Invalid request body",
		"serverNameEmpty":          "Server name is required",
		"serverUrlEmpty":           "Server URL is required",
		"categoryNameEmpty":        "Category name is required",
		"categoryNameInvalid":      "Invalid category name",
		"categoryEditFailed":       "Failed to edit category",
		"categoriesRequired":       "No categories specified",
		"tagsRequired":             "No tags specified",
		"getCategoriesFailed":      "Failed to load categories (HTTP %d)",
		"getTagsFailed":            "Failed to load tags (HTTP %d)",
		"tagCreateFailed":          "Failed to create tags",
		"tagDeleteFailed":          "Failed to delete tags",
		"loginFailed":              "Failed to log in to qBittorrent, check the server connection settings",
		"unreachable":              "Cannot reach the qBittorrent server (%s)",
		"parseError":               "Failed to parse the qBittorrent response",
		"qbError":                  "qBittorrent returned HTTP %d",
		"getDefaultSavePathFailed": "Failed to get the default save path (HTTP %d)",
		"pathNotFound":             "Directory not found",
		"notADirectory":            "Path is not a directory",
		"pathPermissionDenied":     "Permission denied for this directory",
		"invalidPath":              "An absolute path is required",
		"fsReadFailed":             "Failed to read the directory",
		"pathOutsideAllowedDirs":   "Path is outside the directories allowed by the agent",
		"agentRequired":            "This server is remote; install the agent on its host to browse directories",
		"agentOffline":             "Agent connection is closed",
		"agentTimeout":             "Agent response timed out",
		"agentError":               "Agent call failed",
		"aiInvalidProvider":        "Provider must be openai or anthropic",
		"aiModelRequired":          "Model name is required when the AI assistant is enabled",
		"aiApiKeyRequired":         "API key is required when the AI assistant is enabled",
		"aiMcpNameRequired":        "MCP server name is required",
		"aiMcpTypeInvalid":         "MCP server type must be stdio or http",
		"aiStdioCommandRequired":   "A launch command is required for stdio MCP servers",
		"aiHttpUrlRequired":        "A URL is required for http MCP servers",
		"aiSaveFailed":             "Failed to save AI settings (%v)",
		"aiNotConfigured":          "The AI assistant is not enabled; finish its setup in app settings first",
		"authRequired":             "Authentication required",
		"authInvalidCredentials":   "Invalid username or password",
		"authNotSetUp":             "No account yet — complete the initial setup first",
		"authAlreadySetUp":         "The account is already set up",
		"authUsernameRequired":     "Username is required",
		"authPasswordTooShort":     "Password must be at least 8 characters",
		"authPasswordTooLong":      "Password is too long (72 bytes max)",
		"authWrongPassword":        "Current password is incorrect",
		"authTooManyAttempts":      "Too many attempts — retry in %d minute(s)",
		"authSaveFailed":           "Failed to save the account (%v)",
		"authSessionIssueFailed":   "Failed to issue a session",
		"authStoreBroken":          "Account data is corrupted; check data/auth.json",
		"logInvalidLevel":          "Log level must be debug / info / warn / error",
		"logInvalidFormat":         "Log format must be text / json",
		"logSaveFailed":            "Failed to save log settings (%v)",
		"trUnreachable":            "Cannot reach the Transmission server (%s)",
		"trAuthFailed":             "Transmission authentication failed, check the server connection settings",
		"trError":                  "Transmission returned an error (%s)",
		"trParseError":             "Failed to parse the Transmission response",
		"downloaderTypeMismatch":   "This action does not match the server type",
		"torrentNotFound":          "Torrent not found",
		"trSessionKeyInvalid":      "Unsupported setting key: %s",
		"invalidServerType":        "Downloader type must be qbittorrent or transmission",
	},
}

// Negotiate 从 Accept-Language 头解析最匹配的语言，无匹配时回退 zh-CN。
// 例："en-US,en;q=0.9,zh-CN;q=0.8" → en-US；"zh" → zh-CN。
func Negotiate(acceptLanguage string) string {
	if acceptLanguage == "" {
		return ZhCN
	}
	for _, part := range strings.Split(acceptLanguage, ",") {
		// 去掉 ;q= 权重
		tag := strings.TrimSpace(strings.SplitN(part, ";", 2)[0])
		if tag == "" {
			continue
		}
		switch {
		case tag == ZhCN || strings.HasPrefix(tag, "zh"):
			return ZhCN
		case tag == EnUS || strings.HasPrefix(tag, "en"):
			return EnUS
		}
	}
	return ZhCN
}

// T 返回指定语言的文案；key 不存在时回退 zh-CN，仍不存在则原样返回 key。
// 传入 args 时按 fmt.Sprintf 格式化。
func T(lang, key string, args ...any) string {
	if txt, ok := messages[lang][key]; ok {
		return format(txt, args)
	}
	if txt, ok := messages[ZhCN][key]; ok {
		return format(txt, args)
	}
	return key
}

func format(txt string, args []any) string {
	if len(args) == 0 {
		return txt
	}
	return fmt.Sprintf(txt, args...)
}
