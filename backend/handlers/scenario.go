package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/niko-tavern/backend/models"
	"github.com/niko-tavern/backend/services"
)

// ListScenarios 获取剧本列表
// - 公开浏览：仅 status=1（正常公开）
// - 作者查询自己作品：status=1 或 status=-1（作者删除的也可见，前端可过滤）
func ListScenarios(c *gin.Context) {
	var scenarios []models.Scenario
	query := services.DB.Model(&models.Scenario{})

	// 作者过滤：如果指定了 author_id，显示该作者所有非物理删除的剧本
	authorID := c.Query("author_id")
	if authorID != "" {
		query = query.Where("author_id = ? AND status != -1", authorID)
	} else {
		// 公开浏览仅显示 status=1
		query = query.Where("status = 1")
	}

	// 排序
	sort := c.DefaultQuery("sort", "newest")
	switch sort {
	case "hot":
		query = query.Order("downloads DESC")
	case "oldest":
		query = query.Order("created_at ASC")
	default:
		query = query.Order("created_at DESC")
	}

	// 先查总数
	var total int64
	query.Count(&total)

	// 分页参数
	page := 1
	pageSize := 20
	if p, err := parseInt(c.Query("page")); err == nil && p > 0 {
		page = p
	}
	if ps, err := parseInt(c.Query("page_size")); err == nil && ps > 0 && ps <= 100 {
		pageSize = ps
	}

	offset := (page - 1) * pageSize
	if err := query.Offset(offset).Limit(pageSize).Find(&scenarios).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}

	if scenarios == nil {
		scenarios = []models.Scenario{}
	}

	c.JSON(http.StatusOK, gin.H{
		"scenarios": scenarios,
		"total":     total,
	})
}

// parseInt 安全解析整数
func parseInt(s string) (int, error) {
	if s == "" {
		return 0, fmt.Errorf("empty")
	}
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("not a number")
		}
		n = n*10 + int(c-'0')
	}
	return n, nil
}

// GetScenario 获取单个剧本详情
func GetScenario(c *gin.Context) {
	id := c.Param("id")
	var scenario models.Scenario
	if err := services.DB.Where("id = ?", id).First(&scenario).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "剧本不存在"})
		return
	}
	c.JSON(http.StatusOK, scenario)
}

// CreateScenario 创建剧本
func CreateScenario(c *gin.Context) {
	var req models.CreateScenarioRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	userID, _ := c.Get("user_id")

	scenario := models.Scenario{
		ID:            "SCN_" + strings.ReplaceAll(uuid.New().String(), "-", "")[:12],
		AuthorID:      userID.(string),
		Title:         req.Title,
		Intro:         req.Intro,
		BlueprintData: req.BlueprintData,
		CoverURL:      req.CoverURL,
		Status:        1,
	}

	if err := services.DB.Create(&scenario).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建剧本失败"})
		return
	}

	c.JSON(http.StatusCreated, scenario)
}

// UpdateScenario 修改剧本（作者本人或 Admin）
func UpdateScenario(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")
	role, _ := c.Get("role")

	var scenario models.Scenario
	if err := services.DB.Where("id = ?", id).First(&scenario).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "剧本不存在"})
		return
	}

	// 权限检查：只有作者或 Admin 可修改
	if scenario.AuthorID != userID.(string) && role.(string) != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "没有修改权限"})
		return
	}

	var req models.UpdateScenarioRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	updates := map[string]interface{}{}
	if req.Title != "" {
		updates["title"] = req.Title
	}
	if req.Intro != "" {
		updates["intro"] = req.Intro
	}
	if req.BlueprintData != "" {
		updates["blueprint_data"] = req.BlueprintData
	}
	if req.CoverURL != "" {
		updates["cover_url"] = req.CoverURL
	}
	if role.(string) == "admin" {
		updates["edited_by_admin"] = true
	}

	if err := services.DB.Model(&scenario).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "剧本已成功更新"})
}

// SearchScenarios 全文搜索（FTS5 优先，降级 LIKE）
func SearchScenarios(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.Redirect(http.StatusTemporaryRedirect, "/api/scenarios?sort=hot")
		return
	}

	var results []models.Scenario

	if services.FTS5Enabled {
		// FTS5 安全转义
		safeQuery := "\"" + strings.ReplaceAll(query, "\"", "\"\"") + "\""
		services.DB.Raw(`
			SELECT s.*
			FROM scenarios s
			JOIN scenarios_fts f ON s.id = f.scn_id
			WHERE scenarios_fts MATCH ?
			AND s.status = 1
			ORDER BY f.rank ASC, s.downloads DESC
			LIMIT 20
		`, safeQuery).Scan(&results)
	} else {
		// 降级：LIKE 模糊搜索
		like := "%" + query + "%"
		services.DB.Where("status = 1 AND (title LIKE ? OR intro LIKE ?)", like, like).
			Order("downloads DESC").
			Limit(20).
			Find(&results)
	}

	c.JSON(http.StatusOK, results)
}

// BanScenario 一键封禁剧本（Admin only）
// DeleteScenarioHandler 软删除剧本（作者删除或管理员删除）
// DELETE /api/scenarios/:id
// 权限：原作者 或 admin
// 将 status 置为 -1，保留数据完整性
func DeleteScenarioHandler(c *gin.Context) {
	userID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	scenarioID := c.Param("id")

	var scenario models.Scenario
	if err := services.DB.First(&scenario, "id = ?", scenarioID).Error; err != nil {
		c.JSON(404, gin.H{"error": "剧本不存在"})
		return
	}

	// 权限校验：只有原作者 或 管理员 能删除
	if scenario.AuthorID != userID.(string) && role.(string) != "admin" {
		c.JSON(403, gin.H{"error": "无权删除此剧本"})
		return
	}

	// 软删除：status = -1
	if err := services.DB.Model(&scenario).Update("status", -1).Error; err != nil {
		c.JSON(500, gin.H{"error": "删除失败"})
		return
	}

	c.JSON(200, gin.H{"message": "剧本已删除"})
}

func BanScenario(c *gin.Context) {
	id := c.Param("id")

	var req models.BanScenarioRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	result := services.DB.Model(&models.Scenario{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":      0,
		"flag_reason": req.Reason,
	})

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库执行失败"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "找不到该剧本"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "剧本已全网下架", "scenario_id": id})
}

// ListFlaggedScenarios 获取已封禁剧本列表（Admin only）
func ListFlaggedScenarios(c *gin.Context) {
	var scenarios []models.Scenario
	services.DB.Where("status = 0").Order("updated_at DESC").Find(&scenarios)
	c.JSON(http.StatusOK, scenarios)
}
