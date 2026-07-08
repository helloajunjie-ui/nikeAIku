// ============================================================
// API 工具层 — 封装 fetch + JWT 注入 + 错误处理
// ============================================================

const BASE_URL = '/api';

let authToken: string | null = null;

export function setToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem('niko_token', token);
  } else {
    localStorage.removeItem('niko_token');
  }
}

export function getToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('niko_token');
  }
  return authToken;
}

export function clearToken(): void {
  authToken = null;
  localStorage.removeItem('niko_token');
}

interface ApiError {
  status: number;
  message: string;
}

export class ApiRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { skipAuth?: boolean }
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!options?.skipAuth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const errBody = await res.json();
      message = errBody.error || message;
    } catch {
      // ignore parse failure
    }
    throw new ApiRequestError(res.status, message);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ==================== Auth ====================

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    points: number;
    role: string;
  };
}

export function register(data: RegisterRequest): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/register', data, { skipAuth: true });
}

export function login(data: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/login', data, { skipAuth: true });
}

// ==================== Scenarios ====================

export interface ScenarioListItem {
  id: string;
  author_id: string;
  title: string;
  intro: string;
  cover_url: string;
  downloads: number;
  status: number;
  edited_by_admin: boolean;
  created_at: number;
  updated_at: number;
}

export interface ScenarioDetail extends ScenarioListItem {
  blueprint_data: string;
  flag_reason: string;
  edited_by_admin: boolean;
}

export interface CreateScenarioRequest {
  title: string;
  intro: string;
  blueprint_data: string;
  cover_url?: string;
}

export function listScenarios(params?: { page?: number; page_size?: number; author_id?: string }): Promise<{ scenarios: ScenarioListItem[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.page_size) searchParams.set('page_size', String(params.page_size));
  if (params?.author_id) searchParams.set('author_id', params.author_id);
  const qs = searchParams.toString();
  return request<{ scenarios: ScenarioListItem[]; total: number }>('GET', `/scenarios${qs ? `?${qs}` : ''}`);
}

export function getScenario(id: string): Promise<ScenarioDetail> {
  return request<ScenarioDetail>('GET', `/scenarios/${id}`);
}

export function createScenario(data: CreateScenarioRequest): Promise<ScenarioDetail> {
  return request<ScenarioDetail>('POST', '/scenarios', data);
}

export function updateScenario(id: string, data: Partial<CreateScenarioRequest>): Promise<ScenarioDetail> {
  return request<ScenarioDetail>('PUT', `/scenarios/${id}`, data);
}

export function deleteScenario(id: string): Promise<{ message: string }> {
  return request<{ message: string }>('DELETE', `/scenarios/${id}`);
}

export function searchScenarios(q: string): Promise<ScenarioListItem[]> {
  return request<ScenarioListItem[]>('GET', `/scenarios/search?q=${encodeURIComponent(q)}`);
}

// ==================== Saves ====================

export interface SaveItem {
  id: string;
  user_id: string;
  scenario_id: string;
  name: string;
  scenario_title: string;
  save_data: string;
  parent_sav_id?: string;
  created_at: number;
  updated_at: number;
}

export function listSaves(): Promise<SaveItem[]> {
  return request<SaveItem[]>('GET', '/saves');
}

export function getSave(id: string): Promise<SaveItem> {
  return request<SaveItem>('GET', `/saves/${id}`);
}

export function uploadSave(data: { scenario_id: string; name?: string; scenario_title?: string; save_data: string }): Promise<SaveItem> {
  return request<SaveItem>('POST', '/saves', data);
}

export function updateSave(id: string, data: { scenario_id: string; name?: string; scenario_title?: string; save_data: string }): Promise<SaveItem> {
  return request<SaveItem>('PUT', `/saves/${id}`, data);
}

export function deleteSave(id: string): Promise<void> {
  return request<void>('DELETE', `/saves/${id}`);
}

// ==================== Config ====================

export function getMasterPrompt(): Promise<{ master_prompt: string }> {
  return request<{ master_prompt: string }>('GET', '/config/master-prompt', undefined, { skipAuth: true });
}

export function updateMasterPrompt(data: { master_prompt: string }): Promise<{ master_prompt: string }> {
  return request<{ master_prompt: string }>('PUT', '/config/master-prompt', data);
}

// ==================== Chat ====================

export interface ChatRequest {
  model_id: string;
  scenario_id: string;
  save_id: string;
  user_input: string;
  system_prompt: string;
  history: Array<{ role: string; content: string }>;
}

export function chatProxy(data: ChatRequest): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`${BASE_URL}/chat/proxy`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
}

// ==================== Admin ====================

export interface AdminUser {
  id: string;
  username: string;
  points: number;
  role: string;
  status: number;
  created_at: number;
}

export interface AdminPlatformModel {
  id: string;
  model_id: string;
  display_name: string;
  provider_family: string;
  tags: string;
  is_active: boolean;
  cost_per_turn: number;
  price_coeff: number;
  sort_order: number;
  provider_url: string;
  created_at: number;
}

export interface DashboardData {
  total_users: number;
  new_users_today: number;
  total_scenarios: number;
  total_saves: number;
  total_points_used: number;
  active_models: number;
}

export function adminListUsers(): Promise<AdminUser[]> {
  return request<AdminUser[]>('GET', '/admin/users');
}

export function adminUpdatePoints(userId: string, points: number): Promise<{ points: number }> {
  return request<{ points: number }>('POST', `/admin/users/${userId}/points`, { amount: points, reason: '管理员调整' });
}

export function listActiveModels(): Promise<AdminPlatformModel[]> {
  return request<AdminPlatformModel[]>('GET', '/platform-models');
}

export function adminListModels(): Promise<AdminPlatformModel[]> {
  return request<AdminPlatformModel[]>('GET', '/admin/platform-models');
}

export function adminCreateModel(data: { model_id: string; display_name: string; provider_family: string; provider_url: string; cost_per_turn: number; price_coeff?: number; tags?: string }): Promise<AdminPlatformModel> {
  return request<AdminPlatformModel>('POST', '/admin/platform-models', data);
}

export function adminToggleModel(id: string): Promise<AdminPlatformModel> {
  return request<AdminPlatformModel>('POST', `/admin/platform-models/${id}/toggle`);
}

export function adminGetDashboard(): Promise<DashboardData> {
  return request<DashboardData>('GET', '/admin/dashboard');
}

// F-63/F-64: 封禁剧本列表 & 一键封禁
export function adminListFlaggedScenarios(): Promise<FlaggedScenario[]> {
  return request<FlaggedScenario[]>('GET', '/admin/scenarios/flagged');
}

export function adminBanScenario(id: string, reason: string): Promise<void> {
  return request<void>('POST', `/admin/scenarios/${id}/ban`, { reason });
}

export interface FlaggedScenario {
  id: string;
  title: string;
  author_id: string;
  flag_reason: string;
  status: number;
  created_at: number;
  updated_at: number;
}

// ==================== F-56/F-58: 用户积分 & 模型健康状态 ====================

export function getUserPoints(): Promise<{ points: number }> {
  return request<{ points: number }>('GET', '/user/points');
}

export interface ModelHealthItem {
  model_id: string;
  display_name: string;
  success_rate: number;
  avg_latency_ms: number;
  status: string;
}

export function getModelHealth(): Promise<ModelHealthItem[]> {
  return request<ModelHealthItem[]>('GET', '/models/health');
}

// ==================== Image ====================

// F-36/F-38: 零信任加密密钥存储
export function saveEncryptedKey(encryptedBlob: string): Promise<void> {
  return request<void>('POST', '/user/encrypted-key', { encrypted_blob: encryptedBlob });
}

export function getEncryptedKey(): Promise<{ encrypted_blob: string; updated_at: number }> {
  return request<{ encrypted_blob: string; updated_at: number }>('GET', '/user/encrypted-key');
}

export function uploadImage(file: File): Promise<{ url: string }> {
  const token = getToken();
  const formData = new FormData();
  formData.append('image', file);

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${BASE_URL}/upload_image`, {
    method: 'POST',
    headers,
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new ApiRequestError(res.status, errBody.error || res.statusText);
    }
    return res.json() as Promise<{ url: string }>;
  });
}
