package models

// User 用户模型
type User struct {
	ID           string `gorm:"primaryKey;type:varchar(36)" json:"id"`
	Username     string `gorm:"uniqueIndex;type:varchar(50);not null" json:"username"`
	PasswordHash string `gorm:"not null" json:"-"`
	Points       int    `gorm:"default:0" json:"points"`
	Role         string `gorm:"default:'user';type:varchar(20)" json:"role"`
	CreatedAt    int64  `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt    int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

// Scenario 剧本模板模型
type Scenario struct {
	ID            string `gorm:"primaryKey;type:varchar(36)" json:"id"`
	AuthorID      string `gorm:"index;type:varchar(36)" json:"author_id"`
	Title         string `gorm:"type:varchar(200);not null" json:"title"`
	Intro         string `gorm:"type:text" json:"intro"`
	BlueprintData string `gorm:"type:text" json:"blueprint_data"`
	CoverURL      string `gorm:"type:varchar(500);default:''" json:"cover_url"`
	Downloads     int    `gorm:"default:0" json:"downloads"`
	Status        int    `gorm:"default:1" json:"status"`
	FlagReason    string `gorm:"type:text;default:''" json:"flag_reason"`
	EditedByAdmin bool   `gorm:"default:false" json:"edited_by_admin"`
	CreatedAt     int64  `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt     int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

// Save 玩家存档模型
type Save struct {
	ID            string `gorm:"primaryKey;type:varchar(36)" json:"id"`
	UserID        string `gorm:"index;type:varchar(36)" json:"user_id"`
	ScenarioID    string `gorm:"index;type:varchar(36)" json:"scenario_id"`
	Name          string `gorm:"type:varchar(200);default:''" json:"name"`
	ScenarioTitle string `gorm:"type:varchar(200);default:''" json:"scenario_title"`
	SaveData      string `gorm:"type:text" json:"save_data"`
	ParentSavID   string `gorm:"type:varchar(36);index" json:"parent_sav_id"`
	CreatedAt     int64  `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt     int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

// GlobalConfig 全局配置模型（L-Master 等）
type GlobalConfig struct {
	Key       string `gorm:"primaryKey;type:varchar(100)" json:"key"`
	Value     string `gorm:"type:text;not null" json:"value"`
	UpdatedAt int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

// AIProvider AI 渠道/提供商
type AIProvider struct {
	ID        string `gorm:"primaryKey;type:varchar(36)" json:"id"`
	Name      string `gorm:"not null;type:varchar(100)" json:"name"`
	BaseURL   string `gorm:"not null;type:varchar(500)" json:"base_url"`
	APIKey    string `gorm:"not null;type:varchar(500)" json:"-"`
	IsActive  bool   `gorm:"default:true" json:"is_active"`
	CreatedAt int64  `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

func (AIProvider) TableName() string { return "ai_providers" }

// PlatformModel 平台大模型货架
type PlatformModel struct {
	ID             string  `gorm:"primaryKey;type:varchar(36)" json:"id"`
	ModelID        string  `gorm:"not null;type:varchar(100)" json:"model_id"`
	DisplayName    string  `gorm:"not null;type:varchar(100)" json:"display_name"`
	ProviderID     string  `gorm:"type:varchar(36);index" json:"provider_id"`
	ProviderFamily string  `gorm:"default:'';type:varchar(50)" json:"provider_family"`
	Tags           string  `gorm:"type:text;default:'[]'" json:"tags"`
	IsActive       bool    `gorm:"default:true" json:"is_active"`
	CostPerTurn    int     `gorm:"default:0" json:"cost_per_turn"`
	PriceCoeff     float64 `gorm:"default:0" json:"price_coeff"`
	SortOrder      int     `gorm:"default:0" json:"sort_order"`
	CreatedAt      int64   `gorm:"autoCreateTime:milli" json:"created_at"`
	UpdatedAt      int64   `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

// PointLog 积分流水账本
type PointLog struct {
	ID        string `gorm:"primaryKey;type:varchar(36)" json:"id"`
	UserID    string `gorm:"index;not null;type:varchar(36)" json:"user_id"`
	Amount    int    `gorm:"not null" json:"amount"`
	Reason    string `gorm:"type:text;not null" json:"reason"`
	CreatedAt int64  `gorm:"autoCreateTime:milli" json:"created_at"`
}

// Image 图片元数据
type Image struct {
	ID           string `gorm:"primaryKey;type:varchar(36)" json:"id"`
	Path         string `gorm:"type:varchar(500);not null" json:"path"`
	OriginalName string `gorm:"type:varchar(200)" json:"original_name"`
	CreatedAt    int64  `gorm:"autoCreateTime:milli" json:"created_at"`
}

// UserEncryptedKey 用户加密密钥存储（零信任架构）
// 服务器仅存密文 BLOB，永不解密
type UserEncryptedKey struct {
	UserID        string `gorm:"primaryKey;type:varchar(36)" json:"user_id"`
	EncryptedBlob string `gorm:"type:text;not null" json:"encrypted_blob"`
	UpdatedAt     int64  `gorm:"autoUpdateTime:milli" json:"updated_at"`
}

// TableName 显式指定表名
func (PointLog) TableName() string         { return "point_logs" }
func (GlobalConfig) TableName() string     { return "global_configs" }
func (PlatformModel) TableName() string    { return "platform_models" }
func (UserEncryptedKey) TableName() string { return "user_encrypted_keys" }

// ---- Request/Response DTOs ----

type RegisterRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Password string `json:"password" binding:"required,min=6,max=100"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type CreateScenarioRequest struct {
	Title         string `json:"title" binding:"required"`
	Intro         string `json:"intro"`
	BlueprintData string `json:"blueprint_data"`
	CoverURL      string `json:"cover_url"`
}

type UpdateScenarioRequest struct {
	Title         string `json:"title"`
	Intro         string `json:"intro"`
	BlueprintData string `json:"blueprint_data"`
	CoverURL      string `json:"cover_url"`
}

type BanScenarioRequest struct {
	Reason string `json:"reason" binding:"required"`
}

type UploadSaveRequest struct {
	ScenarioID    string `json:"scenario_id" binding:"required"`
	Name          string `json:"name"`
	ScenarioTitle string `json:"scenario_title"`
	SaveData      string `json:"save_data" binding:"required"`
	ParentSavID   string `json:"parent_sav_id"`
}

type UpdateMasterPromptRequest struct {
	Value string `json:"value" binding:"required"`
}

type CreatePlatformModelRequest struct {
	ModelID        string  `json:"model_id" binding:"required"`
	DisplayName    string  `json:"display_name" binding:"required"`
	ProviderID     string  `json:"provider_id" binding:"required"`
	ProviderFamily string  `json:"provider_family"`
	Tags           string  `json:"tags"`
	IsActive       bool    `json:"is_active"`
	CostPerTurn    int     `json:"cost_per_turn"`
	PriceCoeff     float64 `json:"price_coeff"`
	SortOrder      int     `json:"sort_order"`
}

type CreateAIProviderRequest struct {
	Name     string `json:"name" binding:"required"`
	BaseURL  string `json:"base_url" binding:"required"`
	APIKey   string `json:"api_key" binding:"required"`
	IsActive bool   `json:"is_active"`
}

type UpdateUserRequest struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	Password string `json:"password"`
	Points   *int   `json:"points"`
}

type UpdatePointsRequest struct {
	Amount int    `json:"amount" binding:"required"`
	Reason string `json:"reason" binding:"required"`
}

type ChatProxyRequest struct {
	ModelID  string        `json:"model_id" binding:"required"`
	Messages []ChatMessage `json:"messages" binding:"required"`
	Stream   bool          `json:"stream"`
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type NotificationCountResponse struct {
	Count int `json:"count"`
}

type DashboardResponse struct {
	TotalUsers      int              `json:"total_users"`
	NewUsersToday   int              `json:"new_users_today"`
	TotalScenarios  int              `json:"total_scenarios"`
	TotalSaves      int              `json:"total_saves"`
	TotalPointsUsed int              `json:"total_points_used"`
	ActiveModels    int              `json:"active_models"`
	TopScenarios    []Scenario       `json:"top_scenarios"`
	ModelHealth     []ModelHealthDTO `json:"model_health"`
}

type ModelHealthDTO struct {
	ModelID      string  `json:"model_id"`
	DisplayName  string  `json:"display_name"`
	SuccessRate  float64 `json:"success_rate"`
	AvgLatencyMs int64   `json:"avg_latency_ms"`
	Status       string  `json:"status"`
}
