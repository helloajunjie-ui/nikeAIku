package config

import (
	"os"
	"time"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Image    ImageConfig
}

type ServerConfig struct {
	Port         string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

type DatabaseConfig struct {
	Path string
}

type JWTConfig struct {
	Secret     string
	ExpireDays int
}

type ImageConfig struct {
	MaxSizeKB   int
	StoragePath string
}

func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Port:         getEnv("PORT", "8080"),
			ReadTimeout:  30 * time.Second,
			WriteTimeout: 60 * time.Second,
		},
		Database: DatabaseConfig{
			Path: getEnv("DB_PATH", "./data/niko.db"),
		},
		JWT: JWTConfig{
			Secret:     getEnv("JWT_SECRET", "niko-tavern-secret-change-in-production"),
			ExpireDays: 7,
		},
		Image: ImageConfig{
			MaxSizeKB:   5120,
			StoragePath: getEnv("IMAGE_STORAGE_PATH", "./data/images"),
		},
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
