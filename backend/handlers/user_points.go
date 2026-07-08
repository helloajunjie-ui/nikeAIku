package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/niko-tavern/backend/models"
	"github.com/niko-tavern/backend/services"
)

// GetUserPoints 查询当前用户积分
func GetUserPoints(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var user models.User
	if err := services.DB.Select("points").First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"points": user.Points})
}

// GetModelHealth 获取所有模型健康状态（公开，非 admin 可访问）
func GetModelHealth(c *gin.Context) {
	healthStats := services.GetAllHealthStats()

	type ModelHealthItem struct {
		ModelID      string  `json:"model_id"`
		DisplayName  string  `json:"display_name"`
		SuccessRate  float64 `json:"success_rate"`
		AvgLatencyMs int64   `json:"avg_latency_ms"`
		Status       string  `json:"status"`
	}

	var result []ModelHealthItem
	for modelID, stats := range healthStats {
		var pm models.PlatformModel
		displayName := modelID
		if err := services.DB.Select("display_name").Where("id = ?", modelID).First(&pm).Error; err == nil {
			displayName = pm.DisplayName
		}
		result = append(result, ModelHealthItem{
			ModelID:      modelID,
			DisplayName:  displayName,
			SuccessRate:  stats.SuccessRate,
			AvgLatencyMs: stats.AvgLatencyMs,
			Status:       stats.Status,
		})
	}

	if result == nil {
		result = []ModelHealthItem{}
	}

	c.JSON(http.StatusOK, result)
}
