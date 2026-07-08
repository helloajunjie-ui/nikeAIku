package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/niko-tavern/backend/models"
	"github.com/niko-tavern/backend/services"
)

// SaveEncryptedKey 保存用户加密后的 API Key BLOB（零信任存储）
// F-36: 端侧加密后上传，服务器永不触碰明文
// F-38: 服务器仅存储密文，无解密能力
func SaveEncryptedKey(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		EncryptedBlob string `json:"encrypted_blob" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少加密数据"})
		return
	}

	// Upsert: 每个用户只有一条加密记录
	var existing models.UserEncryptedKey
	result := services.DB.Where("user_id = ?", userID).First(&existing)
	if result.Error != nil {
		// 创建新记录
		record := models.UserEncryptedKey{
			UserID:        userID,
			EncryptedBlob: req.EncryptedBlob,
		}
		if err := services.DB.Create(&record).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
			return
		}
	} else {
		// 更新已有记录
		existing.EncryptedBlob = req.EncryptedBlob
		if err := services.DB.Save(&existing).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "加密密钥已保存"})
}

// GetEncryptedKey 获取用户加密后的 API Key BLOB
// 前端在本地用密码解密
func GetEncryptedKey(c *gin.Context) {
	userID := c.GetString("user_id")

	var record models.UserEncryptedKey
	result := services.DB.Where("user_id = ?", userID).First(&record)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到加密密钥"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"encrypted_blob": record.EncryptedBlob,
		"updated_at":     record.UpdatedAt,
	})
}
