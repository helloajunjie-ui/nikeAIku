package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/niko-tavern/backend/middleware"
	"github.com/niko-tavern/backend/models"
	"github.com/niko-tavern/backend/services"
	"golang.org/x/crypto/bcrypt"
)

// Register 用户注册
func Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if len(req.Username) < 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名至少 3 个字符"})
		return
	}

	// 检查用户名是否已存在
	var count int64
	services.DB.Model(&models.User{}).Where("username = ?", req.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "用户名已存在"})
		return
	}

	// 密码哈希
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
		return
	}

	// 获取注册赠送积分
	var bonusPoints int
	var gc models.GlobalConfig
	if err := services.DB.Where("key = ?", "register_bonus_points").First(&gc).Error; err == nil {
		bonusPoints = 0
		// 简单转换
		for _, ch := range gc.Value {
			if ch >= '0' && ch <= '9' {
				bonusPoints = bonusPoints*10 + int(ch-'0')
			}
		}
	}

	user := models.User{
		ID:           "USR_" + strings.ReplaceAll(uuid.New().String(), "-", "")[:12],
		Username:     req.Username,
		PasswordHash: string(hash),
		Points:       bonusPoints,
		Role:         "user",
	}

	if err := services.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建用户失败"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "注册成功",
		"user_id": user.ID,
		"points":  user.Points,
	})
}

// Login 用户登录
func Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var user models.User
	if err := services.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	token, err := middleware.GenerateToken(user.ID, user.Username, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成令牌失败"})
		return
	}

	c.JSON(http.StatusOK, models.LoginResponse{
		Token: token,
		User:  user,
	})
}
