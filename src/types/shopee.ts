export interface ShopeeProduct {
  id: string;
  itemId: number;
  shopId: number;
  name: string;
  originalUrl: string;
  price?: number;
  currency?: string;
  rating?: number;
  salesCount?: number;
  status: 'idle' | 'boosted' | 'queued' | 'error';
  boostedAt: number | null;
  boostExpiresAt: number | null;
  remainingSeconds: number;
  durationSeconds: number;
  slotNumber?: number;
  totalBoostsCount: number;
  lastBoostStatus?: string;
  lastProxyUsed?: string;
  addedAt: number;
}

export interface BoostSlot {
  slotNumber: number;
  productId: string | null;
  product?: ShopeeProduct | null;
  boostedAt: number | null;
  expiresAt: number | null;
  remainingSeconds: number;
  status: 'empty' | 'active' | 'cooldown_ready';
  lastProxy?: string;
  durationSeconds?: number;
}

export interface ShoapiConfig {
  isProduction: boolean;
  boostIntervalMinutes: 1 | 5 | 10 | number;
  proxyEnabled: boolean;
  proxyMode?: 'auto' | 'custom' | 'direct';
  proxyList: string[];
  autoProxyPoolCount?: number;
  activeProxy?: string;
  autoBoostEnabled: boolean;
  notificationSound: boolean;
  maxConcurrentBoosts: number; // e.g. 50 or 0 for unlimited
}

export interface BoostLogEntry {
  id: string;
  timestamp: number;
  itemId: number;
  shopId: number;
  productName: string;
  status: 'success' | 'failed' | 'cooldown' | 'queued';
  message: string;
  slotNumber?: number;
  source: 'auto' | 'manual';
  proxyUsed?: string;
  durationSeconds?: number;
}

export interface ParsedLinkResult {
  valid: boolean;
  itemId?: number;
  shopId?: number;
  name?: string;
  originalUrl: string;
  domain?: string;
  error?: string;
}
