package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/niko-tavern/backend/models"
	"github.com/niko-tavern/backend/services"
)

// GetMasterPrompt 获取 L-Master 全局提示词（无需认证）
func GetMasterPrompt(c *gin.Context) {
	var config models.GlobalConfig
	if err := services.DB.Where("key = ?", "master_prompt").First(&config).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "L-Master 未配置"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"key": config.Key, "value": config.Value})
}

// UpdateMasterPrompt 更新 L-Master（Admin only）
func UpdateMasterPrompt(c *gin.Context) {
	var req models.UpdateMasterPromptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var config models.GlobalConfig
	result := services.DB.Where("key = ?", "master_prompt").First(&config)
	if result.Error != nil {
		// 不存在则创建
		config = models.GlobalConfig{Key: "master_prompt", Value: req.Value}
		services.DB.Create(&config)
	} else {
		services.DB.Model(&config).Update("value", req.Value)
	}

	c.JSON(http.StatusOK, gin.H{"message": "L-Master 已更新，下一回合自动生效"})
}
