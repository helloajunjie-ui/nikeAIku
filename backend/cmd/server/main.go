package main

import (
	"fmt"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/niko-tavern/backend/config"
	"github.com/niko-tavern/backend/handlers"
	"github.com/niko-tavern/backend/middleware"
	"github.com/niko-tavern/backend/services"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("[NIKO酒馆] 后端服务启动中...")

	// 加载配置
	cfg := config.Load()

	// 初始化 JWT
	middleware.InitJWT(cfg.JWT.Secret)

	// 初始化数据库
	if err := services.InitDatabase(cfg); err != nil {
		log.Fatalf("[FATAL] 数据库初始化失败: %v", err)
	}

	// 初始化图片配置
	handlers.InitImageConfig(&cfg.Image)

	// 创建 Gin 引擎
	r := gin.Default()

	// 静态文件服务（图片）
	r.Static("/images", cfg.Image.StoragePath)

	// 前端静态文件服务（Docker 部署时 dist 目录与二进制同级）
	r.StaticFile("/", "./dist/index.html")
	r.Static("/assets", "./dist/assets")
	// SPA fallback: 所有非 /api 路径回退到 index.html
	r.NoRoute(func(c *gin.Context) {
		if len(c.Request.URL.Path) >= 4 && c.Request.URL.Path[:4] == "/api" {
			c.JSON(404, gin.H{"error": "not found"})
			return
		}
		c.File("./dist/index.html")
	})

	// CORS 中间件
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// ==================== 公开路由 ====================
	api := r.Group("/api")
	{
		// Auth
		api.POST("/register", handlers.Register)
		api.POST("/login", handlers.Login)

		// Config（公开）
		api.GET("/config/master-prompt", handlers.GetMasterPrompt)

		// Platform Models（公开，仅活跃模型）
		api.GET("/platform-models", handlers.ListActiveModels)

		// Scenarios（公开浏览）
		api.GET("/scenarios", handlers.ListScenarios)
		api.GET("/scenarios/search", handlers.SearchScenarios)
		api.GET("/scenarios/:id", handlers.GetScenario)
	}

	// ==================== 需要 JWT 认证的路由 ====================
	jwtGroup := r.Group("/api")
	jwtGroup.Use(middleware.JWTAuth())
	{
		// Scenarios（需要登录的操作）
		jwtGroup.POST("/scenarios", handlers.CreateScenario)
		jwtGroup.PUT("/scenarios/:id", handlers.UpdateScenario)
		jwtGroup.DELETE("/scenarios/:id", handlers.DeleteScenarioHandler)

		// Saves
		jwtGroup.GET("/saves", handlers.ListSaves)
		jwtGroup.POST("/saves", handlers.UploadSave)
		jwtGroup.GET("/saves/:id", handlers.GetSave)
		jwtGroup.PUT("/saves/:id", handlers.UpdateSave)
		jwtGroup.DELETE("/saves/:id", handlers.DeleteSave)

		// Chat Proxy
		jwtGroup.POST("/chat/proxy", handlers.ChatProxy)

		// F-56/F-59: 用户积分查询 & 乐观积分更新
		jwtGroup.GET("/user/points", handlers.GetUserPoints)

		// Notifications
		jwtGroup.GET("/user/notifications/count", handlers.GetNotificationCount)

		// F-36/F-38: 零信任加密密钥存储
		jwtGroup.POST("/user/encrypted-key", handlers.SaveEncryptedKey)
		jwtGroup.GET("/user/encrypted-key", handlers.GetEncryptedKey)

		// Image Upload
		jwtGroup.POST("/upload_image", handlers.UploadImage)
	}

	// ==================== Admin 路由 ====================
	adminGroup := r.Group("/api/admin")
	adminGroup.Use(middleware.JWTAuth())
	adminGroup.Use(middleware.AdminAuth())
	{
		adminGroup.PUT("/config/master-prompt", handlers.UpdateMasterPrompt)
		adminGroup.GET("/platform-models", handlers.ListPlatformModels)
		adminGroup.POST("/platform-models", handlers.CreatePlatformModel)
		adminGroup.POST("/platform-models/:id/toggle", handlers.TogglePlatformModel)
		adminGroup.GET("/users", handlers.ListUsers)
		adminGroup.POST("/users/:id/points", handlers.UpdateUserPoints)
		adminGroup.GET("/dashboard", handlers.GetDashboard)
		adminGroup.POST("/scenarios/:id/ban", handlers.BanScenario)
		adminGroup.GET("/scenarios/flagged", handlers.ListFlaggedScenarios)
		adminGroup.GET("/models/health", handlers.GetModelHealth)
	}

	// 启动服务器
	addr := fmt.Sprintf(":%s", cfg.Server.Port)
	log.Printf("[NIKO酒馆] 服务已启动，监听 %s", addr)

	if err := r.Run(addr); err != nil {
		log.Fatalf("[FATAL] 服务启动失败: %v", err)
		os.Exit(1)
	}
}
