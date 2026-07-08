package services

import (
	"sync"
	"time"
)

// HealthRecord 单次健康记录
type HealthRecord struct {
	Success   bool      `json:"success"`
	LatencyMs int64     `json:"latency_ms"`
	Timestamp time.Time `json:"timestamp"`
}

// ModelHealth per-model Ring Buffer
type ModelHealth struct {
	mu      sync.RWMutex
	records [100]HealthRecord
	cursor  int
	filled  bool
}

var healthMap = make(map[string]*ModelHealth)
var healthMu sync.RWMutex

// GetOrCreateHealth 获取或创建模型的健康监测器
func GetOrCreateHealth(modelID string) *ModelHealth {
	healthMu.RLock()
	h, ok := healthMap[modelID]
	healthMu.RUnlock()
	if ok {
		return h
	}

	healthMu.Lock()
	defer healthMu.Unlock()
	if h, ok := healthMap[modelID]; ok {
		return h
	}
	h = &ModelHealth{}
	healthMap[modelID] = h
	return h
}

// Record 记录一次健康数据
func (mh *ModelHealth) Record(success bool, latencyMs int64) {
	mh.mu.Lock()
	defer mh.mu.Unlock()

	mh.records[mh.cursor] = HealthRecord{
		Success:   success,
		LatencyMs: latencyMs,
		Timestamp: time.Now(),
	}
	mh.cursor = (mh.cursor + 1) % 100
	if mh.cursor == 0 {
		mh.filled = true
	}
}

// Stats 计算当前健康状态
func (mh *ModelHealth) Stats() (successRate float64, avgLatencyMs int64) {
	mh.mu.RLock()
	defer mh.mu.RUnlock()

	count := mh.cursor
	if mh.filled {
		count = 100
	}
	if count == 0 {
		return 1.0, 0
	}

	var successes int
	var totalLatency int64
	for i := 0; i < count; i++ {
		if mh.records[i].Success {
			successes++
		}
		totalLatency += mh.records[i].LatencyMs
	}
	successRate = float64(successes) / float64(count)
	avgLatencyMs = totalLatency / int64(count)
	return
}

// Status 返回状态字符串
func (mh *ModelHealth) Status() string {
	successRate, avgLatency := mh.Stats()
	switch {
	case successRate > 0.95 && avgLatency < 3000:
		return "通畅"
	case successRate > 0.80 || avgLatency < 8000:
		return "拥挤"
	default:
		return "异常"
	}
}

// RecordHealth 全局便捷函数
func RecordHealth(modelID string, success bool, latencyMs int64) {
	h := GetOrCreateHealth(modelID)
	h.Record(success, latencyMs)
}

// GetAllHealthStats 获取所有模型健康状态
func GetAllHealthStats() map[string]struct {
	SuccessRate  float64 `json:"success_rate"`
	AvgLatencyMs int64   `json:"avg_latency_ms"`
	Status       string  `json:"status"`
} {
	healthMu.RLock()
	defer healthMu.RUnlock()

	result := make(map[string]struct {
		SuccessRate  float64 `json:"success_rate"`
		AvgLatencyMs int64   `json:"avg_latency_ms"`
		Status       string  `json:"status"`
	})
	for id, h := range healthMap {
		sr, lat := h.Stats()
		result[id] = struct {
			SuccessRate  float64 `json:"success_rate"`
			AvgLatencyMs int64   `json:"avg_latency_ms"`
			Status       string  `json:"status"`
		}{
			SuccessRate:  sr,
			AvgLatencyMs: lat,
			Status:       h.Status(),
		}
	}
	return result
}
