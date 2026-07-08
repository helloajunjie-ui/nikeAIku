package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/niko-tavern/backend/config"
	"github.com/niko-tavern/backend/models"
	"github.com/niko-tavern/backend/services"
)

var imageCfg *config.ImageConfig

func InitImageConfig(cfg *config.ImageConfig) {
	imageCfg = cfg
}

// UploadImage 上传封面图
func UploadImage(c *gin.Context) {
	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择图片文件"})
		return
	}

	// 检查文件大小
	if file.Size > int64(imageCfg.MaxSizeKB*1024) {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("图片大小不能超过 %dKB", imageCfg.MaxSizeKB)})
		return
	}

	// 检查文件类型
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 jpg/png/webp 格式"})
		return
	}

	// 确保存储目录存在
	if err := os.MkdirAll(imageCfg.StoragePath, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建存储目录失败"})
		return
	}

	// 生成唯一文件名
	filename := uuid.New().String()[:12] + ".webp"
	filePath := filepath.Join(imageCfg.StoragePath, filename)

	// 保存文件
	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return
	}
	defer src.Close()

	dst, err := os.Create(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存文件失败"})
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "写入文件失败"})
		return
	}

	// 记录图片元数据
	img := models.Image{
		ID:           "IMG_" + uuid.New().String()[:12],
		Path:         "/images/" + filename,
		OriginalName: file.Filename,
	}
	services.DB.Create(&img)

	c.JSON(http.StatusCreated, gin.H{
		"url":  img.Path,
		"path": img.Path,
	})
}
