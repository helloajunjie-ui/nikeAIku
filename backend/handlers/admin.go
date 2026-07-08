package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/niko-tavern/backend/models"
	"github.com/niko-tavern/backend/services"
)

// ListUsers 获取用户列表（Admin only）
func ListUsers(c *gin.Context) {
	var users []models.User
	services.DB.Select("id, username, points, role, created_at, updated_at").Order("created_at DESC").Find(&users)
	c.JSON(http.StatusOK, users)
}

// UpdateUserPoints 充值/扣除积分（Admin only）
func UpdateUserPoints(c *gin.Context) {
	userID := c.Param("id")

	var req models.UpdatePointsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	result := services.DB.Exec("UPDATE users SET points = points + ? WHERE id = ?", req.Amount, userID)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	// 记录账本
	services.DB.Create(&models.PointLog{
		ID:     "LOG_" + uuid.New().String()[:12],
		UserID: userID,
		Amount: req.Amount,
		Reason: req.Reason,
	})

	c.JSON(http.StatusOK, gin.H{"message": "积分已更新"})
}

// ListPlatformModels 获取模型货架列表（Admin only）
func ListPlatformModels(c *gin.Context) {
	var modelsList []models.PlatformModel
	services.DB.Order("sort_order ASC, created_at DESC").Find(&modelsList)
	c.JSON(http.StatusOK, modelsList)
}

// ListActiveModels 获取活跃模型列表（公开，仅返回 is_active = true）
func ListActiveModels(c *gin.Context) {
	var modelsList []models.PlatformModel
	services.DB.Where("is_active = ?", true).Order("sort_order ASC, created_at DESC").Find(&modelsList)
	c.JSON(http.StatusOK, modelsList)
}

// CreatePlatformModel 创建模型货架（Admin only）
func CreatePlatformModel(c *gin.Context) {
	var req models.CreatePlatformModelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	pm := models.PlatformModel{
		ID:             "MODEL_" + uuid.New().String()[:12],
		ModelID:        req.ModelID,
		DisplayName:    req.DisplayName,
		ProviderFamily: req.ProviderFamily,
		Tags:           req.Tags,
		IsActive:       req.IsActive,
		CostPerTurn:    req.CostPerTurn,
		PriceCoeff:     req.PriceCoeff,
		SortOrder:      req.SortOrder,
		ProviderURL:    req.ProviderURL,
		APIKey:         req.APIKey,
	}

	if err := services.DB.Create(&pm).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建模型失败"})
		return
	}

	c.JSON(http.StatusCreated, pm)
}

// TogglePlatformModel 切换模型上架/下架状态（Admin only）
func TogglePlatformModel(c *gin.Context) {
	id := c.Param("id")

	var pm models.PlatformModel
	if err := services.DB.First(&pm, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "模型不存在"})
		return
	}

	services.DB.Model(&pm).Update("is_active", !pm.IsActive)
	c.JSON(http.StatusOK, gin.H{"message": "模型状态已切换", "is_active": !pm.IsActive})
}

// GetDashboard 监控大盘数据（Admin only）
func GetDashboard(c *gin.Context) {
	var resp models.DashboardResponse

	// 今日新增用户
	todayStart := time.Now().Truncate(24 * time.Hour).UnixMilli()
	var newUsersToday int64
	services.DB.Model(&models.User{}).
		Where("created_at >= ?", todayStart).
		Count(&newUsersToday)
	resp.NewUsersToday = int(newUsersToday)

	// 今日消耗积分
	var pointsConsumed struct {
		Total int64
	}
	services.DB.Raw(`
		SELECT COALESCE(SUM(amount), 0) as total
		FROM point_logs
		WHERE amount < 0 AND created_at >= ?
	`, todayStart).Scan(&pointsConsumed)
	resp.PointsConsumed = int(pointsConsumed.Total)

	// 最热剧本 Top 5
	services.DB.Where("status = 1").Order("downloads DESC").Limit(5).Find(&resp.TopScenarios)

	// 模型健康状态
	healthStats := services.GetAllHealthStats()
	for modelID, stats := range healthStats {
		var pm models.PlatformModel
		displayName := modelID
		if err := services.DB.Select("display_name").Where("id = ?", modelID).First(&pm).Error; err == nil {
			displayName = pm.DisplayName
		}
		resp.ModelHealth = append(resp.ModelHealth, models.ModelHealthDTO{
			ModelID:      modelID,
			DisplayName:  displayName,
			SuccessRate:  stats.SuccessRate,
			AvgLatencyMs: stats.AvgLatencyMs,
			Status:       stats.Status,
		})
	}

	c.JSON(http.StatusOK, resp)
}

// GetNotificationCount 获取用户通知数
func GetNotificationCount(c *gin.Context) {
	userID, _ := c.Get("user_id")

	// 简单实现：检查是否有未读的积分变动
	var count int64
	yesterday := time.Now().Add(-24 * time.Hour).UnixMilli()
	services.DB.Model(&models.PointLog{}).
		Where("user_id = ? AND created_at >= ?", userID, yesterday).
		Count(&count)

	c.JSON(http.StatusOK, models.NotificationCountResponse{Count: int(count)})
}
