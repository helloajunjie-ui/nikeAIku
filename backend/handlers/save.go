package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/niko-tavern/backend/models"
	"github.com/niko-tavern/backend/services"
)

// ListSaves 获取当前用户的存档列表
func ListSaves(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var saves []models.Save
	if err := services.DB.Where("user_id = ?", userID).Order("updated_at DESC").Find(&saves).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	c.JSON(http.StatusOK, saves)
}

// UploadSave 上传存档
func UploadSave(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req models.UploadSaveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	// 如果未提供 name，从 save_data 中尝试解析
	name := req.Name
	scenarioTitle := req.ScenarioTitle
	if name == "" {
		name = "存档 " + uuid.New().String()[:8]
	}

	save := models.Save{
		ID:            "SAV_" + uuid.New().String()[:12],
		UserID:        userID.(string),
		ScenarioID:    req.ScenarioID,
		Name:          name,
		ScenarioTitle: scenarioTitle,
		SaveData:      req.SaveData,
		ParentSavID:   req.ParentSavID,
	}

	if err := services.DB.Create(&save).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "上传存档失败"})
		return
	}

	c.JSON(http.StatusCreated, save)
}

// GetSave 获取单个存档
func GetSave(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	var save models.Save
	if err := services.DB.Where("id = ? AND user_id = ?", id, userID).First(&save).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "存档不存在"})
		return
	}
	c.JSON(http.StatusOK, save)
}

// DeleteSave 删除存档（仅存档所有者可删除）
func DeleteSave(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	var save models.Save
	if err := services.DB.Where("id = ? AND user_id = ?", id, userID).First(&save).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "存档不存在"})
		return
	}

	if err := services.DB.Delete(&save).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除存档失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "存档已删除"})
}

// UpdateSave 更新存档（仅存档所有者可更新）
func UpdateSave(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	var existing models.Save
	if err := services.DB.Where("id = ? AND user_id = ?", id, userID).First(&existing).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "存档不存在"})
		return
	}

	var req models.UploadSaveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	name := req.Name
	scenarioTitle := req.ScenarioTitle
	if name == "" {
		name = existing.Name
		if name == "" {
			name = "存档 " + id[:8]
		}
	}

	existing.SaveData = req.SaveData
	existing.Name = name
	existing.ScenarioTitle = scenarioTitle

	if err := services.DB.Save(&existing).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新存档失败"})
		return
	}

	c.JSON(http.StatusOK, existing)
}
