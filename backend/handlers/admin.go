package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/niko-tavern/backend/models"
	"github.com/niko-tavern/backend/services"
	"golang.org/x/crypto/bcrypt"
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

// UpdateUser 编辑用户信息（Admin only）
func UpdateUser(c *gin.Context) {
	userID := c.Param("id")

	var req models.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	var user models.User
	if err := services.DB.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	updates := map[string]interface{}{}

	if req.Username != "" {
		updates["username"] = req.Username
	}
	if req.Role != "" {
		if req.Role != "user" && req.Role != "admin" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "角色只能是 user 或 admin"})
			return
		}
		updates["role"] = req.Role
	}
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
			return
		}
		updates["password_hash"] = string(hash)
	}
	if req.Points != nil {
		updates["points"] = *req.Points
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有需要更新的字段"})
		return
	}

	if err := services.DB.Model(&user).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新用户失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "用户已更新"})
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
		ProviderID:     req.ProviderID,
		ProviderFamily: req.ProviderFamily,
		Tags:           req.Tags,
		IsActive:       req.IsActive,
		CostPerTurn:    req.CostPerTurn,
		PriceCoeff:     req.PriceCoeff,
		SortOrder:      req.SortOrder,
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

// ==================== AI Provider CRUD ====================

// syncProviderModels 测试渠道连接并将可用模型增量导入 platform_models
// 返回 (测试是否成功, 导入数量, 错误)
func syncProviderModels(providerID string) (testOK bool, importedCount int) {
	var provider models.AIProvider
	if err := services.DB.First(&provider, "id = ?", providerID).Error; err != nil {
		return false, 0
	}

	baseURL := strings.TrimRight(provider.BaseURL, "/")
	var apiURL string
	if strings.HasSuffix(baseURL, "/v1") {
		apiURL = baseURL + "/models"
	} else {
		apiURL = baseURL + "/v1/models"
	}

	client := &http.Client{Timeout: 10 * time.Second}
	httpReq, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return false, 0
	}
	httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		return false, 0
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var modelList struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &modelList); err != nil {
		return true, 0 // 连接成功但解析失败
	}

	count := 0
	for _, m := range modelList.Data {
		displayName := "[" + provider.Name + "] " + m.ID
		var existing models.PlatformModel
		result := services.DB.Where("provider_id = ? AND model_id = ?", provider.ID, m.ID).First(&existing)
		if result.RowsAffected == 0 {
			newModel := models.PlatformModel{
				ID:             "PM_" + provider.ID + "_" + m.ID,
				ModelID:        m.ID,
				DisplayName:    displayName,
				ProviderID:     provider.ID,
				ProviderFamily: provider.Name,
				IsActive:       true,
				CostPerTurn:    1,
				PriceCoeff:     1.0,
				SortOrder:      0,
			}
			services.DB.Create(&newModel)
			count++
		}
	}
	return true, count
}

// ListProviders 获取 AI 提供商列表（Admin only）
type adminProviderDTO struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	BaseURL   string `json:"base_url"`
	HasAPIKey bool   `json:"has_api_key"`
	IsActive  bool   `json:"is_active"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

func ListProviders(c *gin.Context) {
	var providers []models.AIProvider
	services.DB.Order("created_at DESC").Find(&providers)
	dtos := make([]adminProviderDTO, len(providers))
	for i, p := range providers {
		dtos[i] = adminProviderDTO{
			ID:        p.ID,
			Name:      p.Name,
			BaseURL:   p.BaseURL,
			HasAPIKey: p.APIKey != "",
			IsActive:  p.IsActive,
			CreatedAt: p.CreatedAt,
			UpdatedAt: p.UpdatedAt,
		}
	}
	c.JSON(http.StatusOK, dtos)
}

// CreateProvider 创建 AI 提供商（Admin only）
// 创建成功后自动测试连接并将可用模型导入 platform_models
func CreateProvider(c *gin.Context) {
	var req models.CreateAIProviderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	provider := models.AIProvider{
		ID:       "PROV_" + uuid.New().String()[:12],
		Name:     req.Name,
		BaseURL:  req.BaseURL,
		APIKey:   req.APIKey,
		IsActive: req.IsActive,
	}

	if err := services.DB.Create(&provider).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建提供商失败"})
		return
	}

	// 创建成功后自动测试连接并导入模型
	_, importedCount := syncProviderModels(provider.ID)

	c.JSON(http.StatusCreated, gin.H{
		"provider":       provider,
		"imported_count": importedCount,
	})
}

// ToggleProvider 切换 AI 提供商启用/禁用状态（Admin only）
func ToggleProvider(c *gin.Context) {
	id := c.Param("id")

	var provider models.AIProvider
	if err := services.DB.First(&provider, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "提供商不存在"})
		return
	}

	services.DB.Model(&provider).Update("is_active", !provider.IsActive)
	c.JSON(http.StatusOK, gin.H{"message": "提供商状态已切换", "is_active": !provider.IsActive})
}

// UpdateProvider 更新 AI 提供商配置（BaseURL/APIKey），更新后自动测试连接并刷新模型货架（Admin only）
func UpdateProvider(c *gin.Context) {
	id := c.Param("id")

	var provider models.AIProvider
	if err := services.DB.First(&provider, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "提供商不存在"})
		return
	}

	var req struct {
		BaseURL string `json:"base_url"`
		APIKey  string `json:"api_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	// 更新字段（只更新非空值）
	updates := map[string]interface{}{}
	if req.BaseURL != "" {
		updates["base_url"] = req.BaseURL
	}
	if req.APIKey != "" {
		updates["api_key"] = req.APIKey
	}
	if len(updates) > 0 {
		if err := services.DB.Model(&provider).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
			return
		}
		// 重新读取最新数据
		services.DB.First(&provider, "id = ?", id)
	}

	// 更新后自动测试连接并刷新模型货架
	testOK, importedCount := syncProviderModels(provider.ID)

	c.JSON(http.StatusOK, gin.H{
		"provider":       provider,
		"test_ok":        testOK,
		"imported_count": importedCount,
	})
}

// ImportProviderModels 从渠道拉取模型列表并批量导入模型货架（Admin only）
func ImportProviderModels(c *gin.Context) {
	providerID := c.Param("id")

	var provider models.AIProvider
	if err := services.DB.First(&provider, "id = ?", providerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "提供商不存在"})
		return
	}

	var req struct {
		Models []string `json:"models" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	created := 0
	skipped := 0
	for _, m := range req.Models {
		// 检查是否已存在相同 model_id + provider_id 的记录
		var existing models.PlatformModel
		if err := services.DB.Where("model_id = ? AND provider_id = ?", m, providerID).First(&existing).Error; err == nil {
			skipped++
			continue
		}

		pm := models.PlatformModel{
			ID:             "MODEL_" + uuid.New().String()[:12],
			ModelID:        m,
			DisplayName:    provider.Name + " " + m,
			ProviderID:     providerID,
			ProviderFamily: provider.Name,
			IsActive:       true,
			CostPerTurn:    1,
			PriceCoeff:     1.0,
		}
		if err := services.DB.Create(&pm).Error; err != nil {
			continue
		}
		created++
	}

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("导入完成：新增 %d 个模型，跳过 %d 个已存在", created, skipped),
		"created": created,
		"skipped": skipped,
	})
}

// TestProviderConnection 测试 AI 提供商连接（Admin only）
// 如果提供了 provider_id，测试成功后自动将模型导入 platform_models
func TestProviderConnection(c *gin.Context) {
	var req struct {
		BaseURL    string `json:"base_url" binding:"required"`
		APIKey     string `json:"api_key"`     // 当 provider_id 为空时必需
		ProviderID string `json:"provider_id"` // 可选：已有渠道的 ID，传入后自动导入模型
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	// 确定 API Key 和 BaseURL
	apiKey := req.APIKey
	baseURL := strings.TrimRight(req.BaseURL, "/")

	// 如果传入了 provider_id，从数据库读取 APIKey 和 BaseURL
	if req.ProviderID != "" {
		var provider models.AIProvider
		if err := services.DB.Where("id = ?", req.ProviderID).First(&provider).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "未找到该渠道"})
			return
		}
		apiKey = provider.APIKey
		baseURL = strings.TrimRight(provider.BaseURL, "/")
	}

	if apiKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "API Key 不能为空"})
		return
	}

	// 兼容 baseURL 已包含 /v1 的情况（如 https://api.deepseek.com/v1）
	var apiURL string
	if strings.HasSuffix(baseURL, "/v1") {
		apiURL = baseURL + "/models"
	} else {
		apiURL = baseURL + "/v1/models"
	}

	client := &http.Client{Timeout: 10 * time.Second}
	httpReq, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建请求失败"})
		return
	}
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("连接失败: %v", err),
		})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("API 返回状态码 %d: %s", resp.StatusCode, string(body)),
		})
		return
	}

	// 尝试解析模型列表
	var modelList struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	modelNames := []string{}
	importedCount := 0
	if err := json.Unmarshal(body, &modelList); err == nil {
		for _, m := range modelList.Data {
			modelNames = append(modelNames, m.ID)
		}
		// 如果传入了 provider_id，自动将模型导入 platform_models
		if req.ProviderID != "" {
			// 查找 provider 获取名称
			var provider models.AIProvider
			if err := services.DB.Where("id = ?", req.ProviderID).First(&provider).Error; err == nil {
				for _, m := range modelList.Data {
					displayName := "[" + provider.Name + "] " + m.ID
					var existing models.PlatformModel
					result := services.DB.Where("provider_id = ? AND model_id = ?", provider.ID, m.ID).First(&existing)
					if result.RowsAffected == 0 {
						newModel := models.PlatformModel{
							ID:             "PM_" + provider.ID + "_" + m.ID,
							ModelID:        m.ID,
							DisplayName:    displayName,
							ProviderID:     provider.ID,
							ProviderFamily: provider.Name,
							IsActive:       true,
							CostPerTurn:    1,
							PriceCoeff:     1.0,
							SortOrder:      0,
						}
						services.DB.Create(&newModel)
						importedCount++
					}
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":        true,
		"message":        "连接成功",
		"models":         modelNames,
		"imported_count": importedCount,
	})
}

// GetDashboard 监控大盘数据（Admin only）
func GetDashboard(c *gin.Context) {
	var resp models.DashboardResponse

	todayStart := time.Now().Truncate(24 * time.Hour).UnixMilli()

	// 总用户数
	var totalUsers int64
	services.DB.Model(&models.User{}).Count(&totalUsers)
	resp.TotalUsers = int(totalUsers)

	// 今日新增用户
	var newUsersToday int64
	services.DB.Model(&models.User{}).
		Where("created_at >= ?", todayStart).
		Count(&newUsersToday)
	resp.NewUsersToday = int(newUsersToday)

	// 总剧本数
	var totalScenarios int64
	services.DB.Model(&models.Scenario{}).Count(&totalScenarios)
	resp.TotalScenarios = int(totalScenarios)

	// 总存档数
	var totalSaves int64
	services.DB.Model(&models.Save{}).Count(&totalSaves)
	resp.TotalSaves = int(totalSaves)

	// 今日消耗积分
	var pointsConsumed struct {
		Total int64
	}
	services.DB.Raw(`
		SELECT COALESCE(SUM(amount), 0) as total
		FROM point_logs
		WHERE amount < 0 AND created_at >= ?
	`, todayStart).Scan(&pointsConsumed)
	resp.TotalPointsUsed = int(pointsConsumed.Total)

	// 活跃模型数
	var activeModels int64
	services.DB.Model(&models.PlatformModel{}).Where("is_active = ?", true).Count(&activeModels)
	resp.ActiveModels = int(activeModels)

	// 最热剧本 Top 5
	services.DB.Where("status = 1").Order("downloads DESC").Limit(5).Find(&resp.TopScenarios)

	// 模型健康状态
	healthStats := services.GetAllHealthStats()
	for modelID, stats := range healthStats {
		var pm models.PlatformModel
		displayName := modelID
		// GetAllHealthStats 的 key 是 model_id（即 PlatformModel.ModelID），不是主键 id
		if err := services.DB.Select("display_name").Where("model_id = ?", modelID).First(&pm).Error; err == nil {
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

// BatchTestProviders 批量测试所有活跃渠道的连通性（使用数据库中存储的 APIKey）
func BatchTestProviders(c *gin.Context) {
	var providers []models.AIProvider
	services.DB.Where("is_active = ?", true).Find(&providers)

	type ProviderStatus struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Online     bool   `json:"online"`
		Message    string `json:"message"`
		ModelCount int    `json:"model_count"`
		NewModels  int    `json:"new_models"`
	}

	results := []ProviderStatus{}
	for _, p := range providers {
		testOK, newModels := syncProviderModels(p.ID)
		if !testOK {
			results = append(results, ProviderStatus{ID: p.ID, Name: p.Name, Online: false, Message: "连接失败"})
			continue
		}
		// 重新统计该渠道的模型数量
		var modelCount int64
		services.DB.Model(&models.PlatformModel{}).Where("provider_id = ?", p.ID).Count(&modelCount)
		results = append(results, ProviderStatus{
			ID:         p.ID,
			Name:       p.Name,
			Online:     true,
			Message:    "通畅",
			ModelCount: int(modelCount),
			NewModels:  newModels,
		})
	}

	c.JSON(http.StatusOK, results)
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
