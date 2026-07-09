package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/niko-tavern/backend/models"
	"github.com/niko-tavern/backend/services"
)

// ChatProxy 平台代理模式：鉴权→扣费→透传流
func ChatProxy(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req models.ChatProxyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	// 查询模型配置（按 model_id 而非主键 id 查询）
	var model models.PlatformModel
	if err := services.DB.Where("model_id = ? AND is_active = ?", req.ModelID, true).First(&model).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该模型暂未开放或已下架"})
		return
	}

	// 查询模型关联的 AI 提供商（获取 BaseURL 和 APIKey）
	var provider models.AIProvider
	if err := services.DB.Where("id = ? AND is_active = ?", model.ProviderID, true).First(&provider).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "该模型关联的 AI 提供商不可用"})
		return
	}

	// 查询用户积分
	var user models.User
	if err := services.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户不存在"})
		return
	}

	// 预扣积分检查
	if user.Points < model.CostPerTurn {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "积分不足，请充值或使用自带 Key"})
		return
	}

	// 原子扣费
	result := services.DB.Exec("UPDATE users SET points = points - ? WHERE id = ? AND points >= ?",
		model.CostPerTurn, userID, model.CostPerTurn)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "积分不足，扣费失败"})
		return
	}

	// 构建 OpenAI 兼容请求
	openAIReq := map[string]interface{}{
		"model":    model.ModelID,
		"messages": req.Messages,
		"stream":   req.Stream,
	}

	bodyBytes, _ := json.Marshal(openAIReq)

	targetURL := buildChatURL(provider.BaseURL)
	httpReq, err := http.NewRequest("POST", targetURL, bytes.NewReader(bodyBytes))
	if err != nil {
		rollbackPoints(userID.(string), model.CostPerTurn)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "构建请求失败"})
		return
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)

	startTime := time.Now()
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	latencyMs := time.Since(startTime).Milliseconds()

	if err != nil {
		rollbackPoints(userID.(string), model.CostPerTurn)
		services.RecordHealth(model.ModelID, false, latencyMs)
		c.JSON(http.StatusBadGateway, gin.H{"error": "上游 API 请求失败: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// 上游错误，回滚积分
		rollbackPoints(userID.(string), model.CostPerTurn)
		services.RecordHealth(model.ModelID, false, latencyMs)
		body, _ := io.ReadAll(resp.Body)
		c.JSON(http.StatusBadGateway, gin.H{"error": "上游 API 返回错误", "detail": string(body)})
		return
	}

	// 记录健康数据（流式：记录响应头到达时间；非流式：在读取完整 body 后重新计时）
	if req.Stream {
		services.RecordHealth(model.ModelID, true, latencyMs)
	} else {
		// 非流式：读取完整 body 后重新计算 latency
		body, err := io.ReadAll(resp.Body)
		nonStreamLatencyMs := time.Since(startTime).Milliseconds()
		if err != nil {
			rollbackPoints(userID.(string), model.CostPerTurn)
			services.RecordHealth(model.ModelID, false, nonStreamLatencyMs)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "读取上游响应失败"})
			return
		}
		services.RecordHealth(model.ModelID, true, nonStreamLatencyMs)
		c.Data(http.StatusOK, "application/json", body)
		return
	}

	// 记录账本（异步）
	go func() {
		now := time.Now()
		services.DB.Create(&models.PointLog{
			ID:     "LOG_" + now.Format("150405.000") + "_" + userID.(string)[:8],
			UserID: userID.(string),
			Amount: -model.CostPerTurn,
			Reason: "游玩扣除: " + model.DisplayName,
		})
	}()

	// 透传 SSE 流
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.WriteHeader(http.StatusOK)

	written, err := io.Copy(c.Writer, resp.Body)
	// 如果流传输中断（客户端断开），回滚积分
	if err != nil {
		rollbackPoints(userID.(string), model.CostPerTurn)
	}
	// 如果没有任何数据写入，也回滚积分
	if written == 0 {
		rollbackPoints(userID.(string), model.CostPerTurn)
	}
}

// rollbackPoints 回滚积分
func rollbackPoints(userID string, amount int) {
	services.DB.Exec("UPDATE users SET points = points + ? WHERE id = ?", amount, userID)
}

// buildChatURL 智能拼接 OpenAI 兼容的 chat/completions URL
// 处理各种 ProviderURL 格式：
//
//	"https://api.deepseek.com"              → "https://api.deepseek.com/v1/chat/completions"
//	"https://api.deepseek.com/v1"           → "https://api.deepseek.com/v1/chat/completions"
//	"https://api.deepseek.com/v1/"          → "https://api.deepseek.com/v1/chat/completions"
//	"https://api.deepseek.com/v1/chat/completions" → 原样返回
func buildChatURL(base string) string {
	base = strings.TrimRight(base, "/")
	if strings.HasSuffix(base, "/chat/completions") {
		return base
	}
	if strings.HasSuffix(base, "/v1") {
		return base + "/chat/completions"
	}
	return base + "/v1/chat/completions"
}
