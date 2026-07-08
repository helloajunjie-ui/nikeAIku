package services

import (
	"fmt"
	"log"

	"github.com/niko-tavern/backend/config"
	"github.com/niko-tavern/backend/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// FTS5Enabled 标记 FTS5 全文搜索是否可用
var FTS5Enabled bool

// InitDatabase 初始化数据库连接并执行迁移
func InitDatabase(cfg *config.Config) error {
	var err error
	DB, err = gorm.Open(sqlite.Open(cfg.Database.Path), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return fmt.Errorf("打开数据库失败: %w", err)
	}

	// 启用 WAL 模式 + busy_timeout
	DB.Exec("PRAGMA journal_mode=WAL")
	DB.Exec("PRAGMA busy_timeout=5000")
	DB.Exec("PRAGMA foreign_keys=ON")

	// 自动迁移
	err = DB.AutoMigrate(
		&models.User{},
		&models.Scenario{},
		&models.Save{},
		&models.GlobalConfig{},
		&models.PlatformModel{},
		&models.PointLog{},
		&models.Image{},
		&models.UserEncryptedKey{},
	)
	if err != nil {
		return fmt.Errorf("数据库迁移失败: %w", err)
	}

	// 手动执行 FTS5 相关 SQL
	if err := initFTS5(); err != nil {
		log.Printf("[WARN] FTS5 初始化失败（非致命）: %v", err)
		FTS5Enabled = false
	} else {
		FTS5Enabled = true
	}

	// 初始化默认 L-Master
	initDefaultConfigs()

	log.Println("[DB] 数据库初始化完成")
	return nil
}

// initFTS5 创建 FTS5 虚拟表和触发器
func initFTS5() error {
	// 创建 FTS5 虚拟表
	if err := DB.Exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS scenarios_fts USING fts5(
			scn_id UNINDEXED,
			title,
			intro,
			author_name,
			tags,
			tokenize='trigram'
		)
	`).Error; err != nil {
		return err
	}

	// 插入触发器
	DB.Exec(`
		CREATE TRIGGER IF NOT EXISTS scenarios_ai AFTER INSERT ON scenarios BEGIN
			INSERT INTO scenarios_fts(scn_id, title, intro, author_name, tags)
			VALUES (new.id, new.title, new.intro, '', '');
		END;
	`)

	// 删除触发器
	DB.Exec(`
		CREATE TRIGGER IF NOT EXISTS scenarios_ad AFTER DELETE ON scenarios BEGIN
			DELETE FROM scenarios_fts WHERE scn_id = old.id;
		END;
	`)

	// 更新触发器
	DB.Exec(`
		CREATE TRIGGER IF NOT EXISTS scenarios_au AFTER UPDATE ON scenarios BEGIN
			UPDATE scenarios_fts
			SET title = new.title, intro = new.intro, author_name = '', tags = ''
			WHERE scn_id = old.id;
		END;
	`)

	log.Println("[DB] FTS5 虚拟表及触发器初始化完成")
	return nil
}

// RebuildFTSIndex 重建 FTS5 全文索引（用于初始数据同步或修复）
func RebuildFTSIndex() error {
	if !FTS5Enabled {
		return fmt.Errorf("FTS5 未启用")
	}

	// 清空旧索引
	DB.Exec("DELETE FROM scenarios_fts")

	// 从 scenarios 表重建
	result := DB.Exec(`
		INSERT INTO scenarios_fts(scn_id, title, intro, author_name, tags)
		SELECT id, title, intro, '', '' FROM scenarios WHERE status = 1
	`)
	if result.Error != nil {
		return result.Error
	}

	log.Printf("[DB] FTS5 索引重建完成，共 %d 条记录", result.RowsAffected)
	return nil
}

// initDefaultConfigs 初始化默认全局配置和种子数据
func initDefaultConfigs() {
	defaults := map[string]string{
		"master_prompt": `[L-Master: 站长全局规则]
你是一个文字冒险游戏引擎，遵循以下规则：
1. 每次回复必须使用 Markdown 格式排版
2. 回复末尾提供 [1][2][3] 选项结构供玩家选择
3. 保持沉浸式叙事风格
4. 回复长度控制在 500 字以内`,
		"register_bonus_points": "100",
	}

	for key, value := range defaults {
		var count int64
		DB.Model(&models.GlobalConfig{}).Where("key = ?", key).Count(&count)
		if count == 0 {
			DB.Create(&models.GlobalConfig{Key: key, Value: value})
			log.Printf("[DB] 初始化默认配置: %s", key)
		}
	}

	// 初始化默认平台模型（仅当表为空时）
	var modelCount int64
	DB.Model(&models.PlatformModel{}).Count(&modelCount)
	if modelCount == 0 {
		defaultModels := []models.PlatformModel{
			{
				ID:             "MODEL_DEEPSEEK_CHAT",
				ModelID:        "deepseek-chat",
				DisplayName:    "DeepSeek V3",
				ProviderFamily: "deepseek",
				Tags:           `["推荐","快速"]`,
				IsActive:       true,
				CostPerTurn:    1,
				PriceCoeff:     1.0,
				SortOrder:      1,
				ProviderURL:    "https://api.deepseek.com",
				APIKey:         "",
			},
			{
				ID:             "MODEL_DEEPSEEK_REASONER",
				ModelID:        "deepseek-reasoner",
				DisplayName:    "DeepSeek R1",
				ProviderFamily: "deepseek",
				Tags:           `["深度","推理"]`,
				IsActive:       true,
				CostPerTurn:    2,
				PriceCoeff:     1.5,
				SortOrder:      2,
				ProviderURL:    "https://api.deepseek.com",
				APIKey:         "",
			},
		}
		for _, m := range defaultModels {
			DB.Create(&m)
			log.Printf("[DB] 初始化默认模型: %s (%s)", m.DisplayName, m.ModelID)
		}
	}
}
