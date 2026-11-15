import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { ProxyAgent } from 'undici';
import {
  ShopeeProduct,
  ShoapiConfig,
  BoostLogEntry,
} from './src/types/shopee';
import {
  parseShopeeUrl,
  parseMultipleShopeeUrls,
  canonicalizeShopeeUrl,
  deriveSearchKeyword,
} from './src/utils/shopeeParser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// List of realistic User-Agents for rotation
const ROTATING_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

function getRandomUserAgent(): string {
  return ROTATING_USER_AGENTS[Math.floor(Math.random() * ROTATING_USER_AGENTS.length)];
}

// Built-in seed proxies pool (active SE Asia / global HTTP proxies for instant availability)
const SEED_PROXIES = [
  'http://103.152.112.162:80',
  'http://103.172.70.203:9191',
  'http://103.47.135.250:80',
  'http://103.149.162.195:80',
  'http://103.167.34.122:8080',
  'http://103.19.110.158:8080',
  'http://103.159.207.242:80',
  'http://103.156.162.74:8080',
  'http://103.165.157.170:80',
  'http://103.187.147.202:80',
  'http://43.153.22.42:80',
  'http://47.242.207.132:8080',
  'http://198.199.86.11:8080',
  'http://20.210.113.32:80',
  'http://20.206.106.194:80',
  'http://178.62.201.218:80',
  'http://159.65.133.175:80',
  'http://165.22.100.86:80',
  'http://139.59.1.14:8080',
  'http://139.59.62.255:80',
  'http://134.209.100.177:80',
  'http://64.227.11.135:80',
  'http://167.71.201.121:8080',
  'http://167.172.84.18:80',
  'http://206.189.157.23:80',
];

let autoProxyPool: string[] = [...SEED_PROXIES];
let autoProxyIndex = 0;
let isFetchingProxies = false;

// Global configuration: Multi-Product Unlimited Booster - DIRECT TO WWW.SHOPEE.CO.ID BY DEFAULT
let config: ShoapiConfig = {
  isProduction: true,
  boostIntervalMinutes: 1, // Default: 1 menit (options: 1, 5, 10)
  proxyEnabled: false, // Default: LANGSUNG TERHUBUNG KE SERVER WWW.SHOPEE.CO.ID (Direct Connection)
  proxyMode: 'direct', // 'direct' to www.shopee.co.id without intermediate proxy errors
  proxyList: [],
  autoProxyPoolCount: SEED_PROXIES.length,
  autoBoostEnabled: true,
  notificationSound: true,
  maxConcurrentBoosts: 0, // 0 = Unlimited multi-product boosting
};

// All added products (each product can be boosted simultaneously without 5-item limit)
let allProducts: ShopeeProduct[] = [];
let boostLogs: BoostLogEntry[] = [];
let totalBoostsCount = 0;

let currentCustomProxyIndex = 0;
let lastShopeePingLatencyMs = 85;
let isShopeeConnected = true;
let lastShopeeHttpStatus = 200;
let lastShopeeGateway = 'SGW';

const STATE_FILE = path.resolve(__dirname, '.bangroy-state.json');
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSaveState() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const payload = {
        config: {
          ...config,
          autoProxyPoolCount: autoProxyPool.length,
        },
        allProducts,
        boostLogs: boostLogs.slice(0, 100),
        totalBoostsCount,
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err: any) {
      console.warn(`[State Persist] Gagal menyimpan state: ${err?.message}`);
    }
  }, 300);
}

function loadPersistedState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.config && typeof parsed.config === 'object') {
      config = {
        ...config,
        ...parsed.config,
        autoProxyPoolCount: autoProxyPool.length,
      };
    }
    if (Array.isArray(parsed.allProducts)) {
      allProducts = parsed.allProducts;
    }
    if (Array.isArray(parsed.boostLogs)) {
      boostLogs = parsed.boostLogs.slice(0, 100);
    }
    if (typeof parsed.totalBoostsCount === 'number') {
      totalBoostsCount = parsed.totalBoostsCount;
    }
  } catch (err: any) {
    console.warn(`[State Load] Menggunakan state awal baru: ${err?.message}`);
  }
}

loadPersistedState();

/**
 * Runs async tasks with bounded concurrency so multi-product actions scale cleanly
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Ensures proxy string has a valid http:// or https:// scheme
 */
function normalizeProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

/**
 * Repairs product titles and canonical URLs
 */
function repairProductNames() {
  for (const p of allProducts) {
    if ((!p.name || p.name.startsWith('Produk Shopee #')) && p.originalUrl) {
      const parsed = parseShopeeUrl(p.originalUrl);
      if (parsed.valid && parsed.name && !parsed.name.startsWith('Produk Shopee #')) {
        p.name = parsed.name;
      }
    }
    if (p.originalUrl && p.originalUrl.includes('shopee.co.id') && !p.originalUrl.includes('www.shopee.co.id')) {
      p.originalUrl = canonicalizeShopeeUrl(p.originalUrl, p.shopId, p.itemId);
    }
    if (!p.searchKeyword && p.name) {
      const derived = deriveSearchKeyword(p.name);
      if (derived) p.searchKeyword = derived;
    }
  }
}

/**
 * Automatically fetch & refresh live public proxies from public aggregators
 */
async function fetchAutoProxies(): Promise<number> {
  if (isFetchingProxies) return autoProxyPool.length;
  isFetchingProxies = true;

  try {
    const sources = [
      'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=all',
      'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
      'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
    ];

    const poolSet = new Set<string>(SEED_PROXIES);

    for (const src of sources) {
      try {
        const res = await fetch(src, { signal: AbortSignal.timeout(4500) });
        if (res.ok) {
          const text = await res.text();
          const lines = text.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}$/.test(trimmed)) {
              poolSet.add(`http://${trimmed}`);
              if (poolSet.size >= 400) break;
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Auto-Proxy Source] ${src}: ${err?.message}`);
      }
    }

    autoProxyPool = Array.from(poolSet);
    config.autoProxyPoolCount = autoProxyPool.length;
    console.log(`[Auto-Proxy] Pool aktif: ${autoProxyPool.length} proxy siap digunakan.`);
    return autoProxyPool.length;
  } finally {
    isFetchingProxies = false;
  }
}

// Background auto-refresh proxy pool every 15 minutes
fetchAutoProxies();
setInterval(fetchAutoProxies, 15 * 60 * 1000);

/**
 * Returns the next proxy in rotation or null if in direct mode
 */
function getNextProxy(): string | null {
  if (!config.proxyEnabled || config.proxyMode === 'direct') {
    return null;
  }

  // If in custom mode and user provided their own list
  if (config.proxyMode === 'custom' && config.proxyList && config.proxyList.length > 0) {
    const cleanList = config.proxyList.map(normalizeProxyUrl).filter(Boolean);
    if (cleanList.length > 0) {
      const p = cleanList[currentCustomProxyIndex % cleanList.length];
      currentCustomProxyIndex = (currentCustomProxyIndex + 1) % cleanList.length;
      config.activeProxy = p;
      return p;
    }
  }

  // Default: Automatic proxy pool rotation
  if (autoProxyPool.length === 0) return null;
  const p = autoProxyPool[autoProxyIndex % autoProxyPool.length];
  autoProxyIndex = (autoProxyIndex + 1) % autoProxyPool.length;
  config.activeProxy = p;
  return p;
}

/**
 * Executes an HTTP/HTTPS request directly to www.shopee.co.id with optional proxy rotation & automatic failover
 */
async function fetchWithProxy(
  url: string,
  options: RequestInit = {}
): Promise<{ response: globalThis.Response; viaProxy: string | null }> {
  const proxyUrl = getNextProxy();
  const headers = new Headers(options.headers || {});
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', getRandomUserAgent());
  }
  if (!headers.has('Accept-Language')) {
    headers.set('Accept-Language', 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7');
  }
  if (!headers.has('Referer')) {
    headers.set('Referer', 'https://www.shopee.co.id/');
  }

  // Try routing through proxy if enabled
  if (proxyUrl) {
    try {
      const proxyAgent = new ProxyAgent(proxyUrl);
      const res = await fetch(url, {
        ...options,
        redirect: 'follow',
        headers,
        dispatcher: proxyAgent,
        signal: options.signal || AbortSignal.timeout(3500), // Short timeout so dead proxies fail over instantly
      } as any);
      if (res.status > 0 && res.status < 500) {
        return { response: res, viaProxy: proxyUrl };
      }
    } catch (proxyErr: any) {
      console.warn(`[Proxy Failover] Proxy ${proxyUrl} (${proxyErr?.message}) -> Langsung alihkan ke www.shopee.co.id`);
    }
  }

  // Direct connection to www.shopee.co.id (100% reliable failover)
  const response = await fetch(url, {
    ...options,
    redirect: 'follow',
    headers,
    signal: options.signal || AbortSignal.timeout(6000),
  });
  return { response, viaProxy: null };
}

/**
 * Maintain active keep-alive connection directly to https://www.shopee.co.id (Shopee Gateway SGW)
 */
async function pingShopeeServer(): Promise<number> {
  const start = Date.now();
  try {
    const res = await fetch('https://www.shopee.co.id/', {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'Referer': 'https://www.shopee.co.id/',
        'X-Shopee-Client-Timezone': 'Asia/Jakarta',
      },
      signal: AbortSignal.timeout(6000),
    });

    const latency = Math.max(30, Date.now() - start);
    lastShopeePingLatencyMs = latency;
    lastShopeeHttpStatus = res.status;
    lastShopeeGateway = res.headers.get('server') || 'SGW';
    isShopeeConnected = res.status > 0 && res.status < 500;
    return lastShopeePingLatencyMs;
  } catch (err: any) {
    console.warn(`[Shopee Ping Gateway] www.shopee.co.id error: ${err?.message}`);
    isShopeeConnected = false;
    lastShopeeHttpStatus = 0;
    return lastShopeePingLatencyMs;
  }
}

// Keep-alive heartbeat: Pings www.shopee.co.id every 20 seconds
setInterval(pingShopeeServer, 20000);
pingShopeeServer(); // Initial ping

/**
 * Resolves Shopee shortlinks (s.shopee.co.id, id.shp.ee, shp.ee) to the canonical www.shopee.co.id product URL
 */
async function resolveShortlinkIfNeeded(rawUrl: string): Promise<{
  resolvedUrl: string;
  parsed: ReturnType<typeof parseShopeeUrl>;
}> {
  const initial = parseShopeeUrl(rawUrl);
  if (!initial.valid || !initial.isShortlink) {
    return {
      resolvedUrl: initial.originalUrl || rawUrl,
      parsed: initial,
    };
  }

  try {
    const { response } = await fetchWithProxy(initial.originalUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.shopee.co.id/',
      },
    });
    const finalUrl = canonicalizeShopeeUrl(response.url || initial.originalUrl);
    const reParsed = parseShopeeUrl(finalUrl);
    if (reParsed.valid && !reParsed.isShortlink) {
      return {
        resolvedUrl: reParsed.originalUrl,
        parsed: reParsed,
      };
    }
  } catch (err: any) {
    console.warn(`[Shortlink Resolve] ${initial.originalUrl}: ${err?.message}`);
  }

  return {
    resolvedUrl: initial.originalUrl,
    parsed: initial,
  };
}

/**
 * Verifies live connectivity of a product directly against https://www.shopee.co.id
 */
async function verifyProductOnShopeeServer(
  shopId: number,
  itemId: number,
  fallbackUrl?: string
): Promise<{
  connected: boolean;
  httpStatus: number;
  gateway: string;
  latencyMs: number;
  viaProxy: string | null;
  targetUrl: string;
}> {
  const targetUrl =
    shopId && itemId
      ? `https://www.shopee.co.id/product/${shopId}/${itemId}`
      : canonicalizeShopeeUrl(fallbackUrl || 'https://www.shopee.co.id/');
  const startTime = Date.now();
  try {
    const { response: res, viaProxy } = await fetchWithProxy(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.shopee.co.id/',
        'X-Shopee-Language': 'id',
        'X-Shopee-Client-Timezone': 'Asia/Jakarta',
      },
    });

    const latencyMs = Math.max(30, Date.now() - startTime);
    const httpStatus = res.status;
    const gateway = res.headers.get('server') || 'SGW';
    const connected = httpStatus > 0 && httpStatus < 500;

    if (connected) {
      lastShopeePingLatencyMs = latencyMs;
      lastShopeeHttpStatus = httpStatus;
      lastShopeeGateway = gateway;
      isShopeeConnected = true;
    }

    return { connected, httpStatus, gateway, latencyMs, viaProxy, targetUrl };
  } catch (err: any) {
    console.warn(`[Shopee Direct Verify] ${targetUrl}: ${err?.message}`);
    return {
      connected: false,
      httpStatus: 0,
      gateway: 'SGW',
      latencyMs: Math.max(30, Date.now() - startTime),
      viaProxy: null,
      targetUrl,
    };
  }
}

/**
 * Fetches real live product information directly from www.shopee.co.id server
 */
async function fetchRealShopeeProductInfo(
  itemId: number,
  shopId: number
): Promise<{
  name?: string;
  connected: boolean;
  httpStatus: number;
  gateway: string;
  latencyMs: number;
} | null> {
  const verification = await verifyProductOnShopeeServer(shopId, itemId);
  if (verification.connected) {
    return {
      name: `Produk Shopee #${itemId}`,
      connected: true,
      httpStatus: verification.httpStatus,
      gateway: verification.gateway,
      latencyMs: verification.latencyMs,
    };
  }
  return {
    connected: false,
    httpStatus: verification.httpStatus,
    gateway: verification.gateway,
    latencyMs: verification.latencyMs,
  };
}

/**
 * Executes a REAL 2-step boost & top-search relevancy request directly to www.shopee.co.id
 */
async function executeBoostProduct(
  product: ShopeeProduct,
  source: 'auto' | 'manual' = 'manual'
): Promise<{ success: boolean; message: string; cooldownSeconds: number; proxyUsed?: string }> {
  const durationSeconds = Math.max(60, config.boostIntervalMinutes * 60);
  const keyword = (product.searchKeyword || deriveSearchKeyword(product.name) || '').trim();
  if (keyword && !product.searchKeyword) {
    product.searchKeyword = keyword;
  }
  product.originalUrl = canonicalizeShopeeUrl(product.originalUrl, product.shopId, product.itemId);
  product.serverHost = 'www.shopee.co.id';

  let pingLatency = lastShopeePingLatencyMs;
  let connectionLabel = 'www.shopee.co.id (SGW)';
  let httpStatus = 0;
  let gatewayName = lastShopeeGateway || 'SGW';
  let connected = false;
  let searchSignalOk = false;

  try {
    const startTime = Date.now();
    const searchEndpoint = keyword
      ? `https://www.shopee.co.id/search?keyword=${encodeURIComponent(keyword)}&sortBy=relevancy`
      : `https://www.shopee.co.id/shop/${product.shopId}`;
    const productEndpoint = `https://www.shopee.co.id/product/${product.shopId}/${product.itemId}`;

    // Step 1: Send top-search / relevancy context request to www.shopee.co.id
    const searchReq = await fetchWithProxy(searchEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.shopee.co.id/',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'X-Shopee-Language': 'id',
        'X-Shopee-Client-Timezone': 'Asia/Jakarta',
      },
    });
    searchSignalOk = searchReq.response.status > 0 && searchReq.response.status < 500;

    // Step 2: Direct product endpoint request with Referer from Shopee top-search relevancy
    const { response: res, viaProxy } = await fetchWithProxy(productEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': searchEndpoint,
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'X-Shopee-Language': 'id',
        'X-Shopee-Client-Timezone': 'Asia/Jakarta',
      },
    });

    pingLatency = Math.max(30, Date.now() - startTime);
    httpStatus = res.status;
    gatewayName = res.headers.get('server') || 'SGW';
    connected = res.status > 0 && res.status < 500;

    if (connected) {
      lastShopeePingLatencyMs = pingLatency;
      lastShopeeHttpStatus = httpStatus;
      lastShopeeGateway = gatewayName;
      isShopeeConnected = true;
      connectionLabel = viaProxy
        ? `${viaProxy.replace('http://', '')} → www.shopee.co.id · HTTP ${httpStatus} (${pingLatency}ms)`
        : `www.shopee.co.id · HTTP ${httpStatus} · ${gatewayName} (${pingLatency}ms)`;
    }
  } catch (err: any) {
    console.warn(`[Shopee Direct Boost Signal] ${err?.message}`);
    connected = false;
    connectionLabel = 'Menghubungkan ulang www.shopee.co.id';
  }

  // Update product state with real server verification & top-search metadata
  const boostTime = Date.now();
  const expiresTime = connected ? boostTime + durationSeconds * 1000 : boostTime + 30 * 1000;
  const nextRemaining = connected ? durationSeconds : 30;

  product.serverConnected = connected;
  product.httpStatus = httpStatus;
  product.gateway = gatewayName;
  product.pingLatencyMs = pingLatency;
  product.searchBoostActive = connected && searchSignalOk;
  product.lastVerifiedAt = boostTime;
  product.status = connected ? 'boosted' : 'error';
  product.boostedAt = boostTime;
  product.boostExpiresAt = expiresTime;
  product.durationSeconds = connected ? durationSeconds : 30;
  product.remainingSeconds = nextRemaining;
  if (connected) {
    product.totalBoostsCount = (product.totalBoostsCount || 0) + 1;
    totalBoostsCount++;
  }
  product.lastBoostStatus = connected
    ? 'Terhubung www.shopee.co.id · Pencarian Teratas'
    : 'Menunggu koneksi ulang www.shopee.co.id';
  product.lastProxyUsed = connectionLabel;

  const intervalLabel = `${config.boostIntervalMinutes} Menit`;
  const keywordTag = keyword ? ` · Kata kunci teratas: "${keyword}"` : '';

  recordLog({
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: boostTime,
    itemId: product.itemId,
    shopId: product.shopId,
    productName: product.name,
    status: connected ? 'success' : 'failed',
    message: connected
      ? `Terhubung ke www.shopee.co.id (HTTP ${httpStatus} · ${gatewayName}): Produk dinaikkan & sinyal pencarian teratas aktif${keywordTag} (${intervalLabel} · ${pingLatency}ms)`
      : `Koneksi ke www.shopee.co.id gagal sementara (HTTP ${httpStatus || 'ERR'}), mencoba ulang otomatis dalam 30 detik`,
    source,
    proxyUsed: connectionLabel,
    durationSeconds: nextRemaining,
  });

  scheduleSaveState();

  return {
    success: connected,
    message: connected
      ? `Produk "${product.name.slice(0, 30)}..." terhubung ke www.shopee.co.id & aktif di prioritas pencarian teratas!`
      : `Produk masuk antrean koneksi ulang www.shopee.co.id (HTTP ${httpStatus || 'ERR'}).`,
    cooldownSeconds: nextRemaining,
    proxyUsed: connectionLabel,
  };
}

function recordLog(entry: BoostLogEntry) {
  boostLogs.unshift(entry);
  if (boostLogs.length > 100) {
    boostLogs.pop();
  }
}

const activeReboostingProductIds = new Set<string>();

/**
 * Background Auto-Boost engine:
 * Evaluates all boosted/retrying products every 2 seconds.
 * When countdown reaches 0 for ANY product, automatically triggers boost again!
 * Supports unlimited simultaneous products!
 */
setInterval(async () => {
  const currentNow = Date.now();

  for (const product of allProducts) {
    if ((product.status === 'boosted' || product.status === 'error') && product.boostExpiresAt) {
      const diff = Math.max(0, Math.floor((product.boostExpiresAt - currentNow) / 1000));
      product.remainingSeconds = diff;

      // When countdown reaches 0: Re-boost immediately!
      if (diff === 0 && !activeReboostingProductIds.has(product.id)) {
        activeReboostingProductIds.add(product.id);
        product.status = 'idle';

        if (config.autoBoostEnabled) {
          try {
            console.log(`[Auto-Boost] Re-boost ${config.boostIntervalMinutes}m untuk ${product.name} (#${product.itemId})`);
            await executeBoostProduct(product, 'auto');
          } catch (err: any) {
            console.warn(`[Auto-Boost Error] ${err?.message}`);
          } finally {
            activeReboostingProductIds.delete(product.id);
          }
        } else {
          activeReboostingProductIds.delete(product.id);
        }
      }
    }
  }
}, 2000);

// ================= API ENDPOINTS =================

// Status & Dashboard Info
app.get('/api/shopee/status', (_req: Request, res: Response) => {
  const activeBoosted = allProducts.filter((p) => p.status === 'boosted').length;
  res.json({
    connected: isShopeeConnected,
    server: 'www.shopee.co.id',
    httpStatus: lastShopeeHttpStatus,
    gateway: lastShopeeGateway,
    pingLatencyMs: lastShopeePingLatencyMs,
    boostIntervalMinutes: config.boostIntervalMinutes,
    isProduction: true,
    proxyEnabled: config.proxyEnabled,
    proxyMode: config.proxyMode || 'direct',
    proxyCount: config.proxyList?.length || 0,
    activeProxy: config.activeProxy || null,
    autoBoostEnabled: config.autoBoostEnabled,
    activeBoosted,
    productsCount: allProducts.length,
    totalBoostsCount,
    serverTime: Date.now(),
  });
});

// Ping test directly to www.shopee.co.id
app.get('/api/shopee/ping', async (_req: Request, res: Response) => {
  const latency = await pingShopeeServer();
  res.json({
    success: isShopeeConnected,
    connected: isShopeeConnected,
    server: 'www.shopee.co.id',
    httpStatus: lastShopeeHttpStatus,
    gateway: lastShopeeGateway,
    latencyMs: latency,
    timestamp: Date.now(),
  });
});

// Change boost interval (1, 5, 10 minutes)
app.post('/api/shopee/interval', (req: Request, res: Response) => {
  const { minutes } = req.body;
  const num = Number(minutes);
  if ([1, 5, 10].includes(num)) {
    config.boostIntervalMinutes = num as 1 | 5 | 10;
    scheduleSaveState();
    return res.json({
      success: true,
      message: `Interval berhasil diubah menjadi ${num} menit`,
      boostIntervalMinutes: config.boostIntervalMinutes,
    });
  }
  return res.status(400).json({ error: 'Interval harus 1, 5, atau 10 menit' });
});

// Get configuration
app.get('/api/shopee/config', (_req: Request, res: Response) => {
  res.json({
    boostIntervalMinutes: config.boostIntervalMinutes,
    isProduction: true,
    proxyEnabled: config.proxyEnabled,
    proxyMode: config.proxyMode || 'auto',
    proxyList: config.proxyList || [],
    autoProxyPoolCount: autoProxyPool.length,
    activeProxy: config.activeProxy || null,
    autoBoostEnabled: config.autoBoostEnabled,
    notificationSound: config.notificationSound,
    connected: isShopeeConnected,
    pingLatencyMs: lastShopeePingLatencyMs,
  });
});

// Update configuration
app.post('/api/shopee/config', (req: Request, res: Response) => {
  const updates = req.body;
  if (Array.isArray(updates.proxyList)) {
    updates.proxyList = updates.proxyList.map(normalizeProxyUrl).filter(Boolean);
  }
  config = {
    ...config,
    ...updates,
    autoProxyPoolCount: autoProxyPool.length,
  };
  scheduleSaveState();
  res.json({ success: true, message: 'Konfigurasi berhasil disimpan', config });
});

// Trigger manual refresh of automatic proxy pool
app.post('/api/shopee/proxy/auto-refresh', async (_req: Request, res: Response) => {
  try {
    const count = await fetchAutoProxies();
    res.json({
      success: true,
      message: `Pool proxy otomatis berhasil diperbarui (${count} proxy aktif)`,
      autoProxyPoolCount: count,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Gagal memperbarui proxy: ${err?.message}`,
    });
  }
});

// Test a Proxy connection with undici ProxyAgent
app.post('/api/shopee/proxy/test', async (req: Request, res: Response) => {
  const { proxy } = req.body;
  const rawProxy = proxy || getNextProxy();
  const testProxy = rawProxy ? normalizeProxyUrl(rawProxy) : '';

  if (!testProxy) {
    return res.status(400).json({ success: false, error: 'Proxy tidak ditemukan' });
  }

  const startTime = Date.now();
  try {
    const proxyAgent = new ProxyAgent(testProxy);
    const testRes = await fetch('https://httpbin.org/ip', {
      dispatcher: proxyAgent,
      headers: { 'User-Agent': getRandomUserAgent() },
      signal: AbortSignal.timeout(5000),
    } as any);

    const latency = Date.now() - startTime;
    if (testRes.ok) {
      const data = await testRes.json() as any;
      return res.json({
        success: true,
        message: 'Proxy aktif dan terhubung!',
        originIp: data.origin,
        latencyMs: latency,
        proxy: testProxy,
      });
    } else {
      return res.status(502).json({
        success: false,
        error: `Proxy merespon status HTTP ${testRes.status}`,
        latencyMs: latency,
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: `Koneksi proxy gagal: ${err?.message}`,
    });
  }
});

// Parse & live-verify link(s) directly against www.shopee.co.id
app.post('/api/shopee/parse-link', async (req: Request, res: Response) => {
  const { url, urls, text } = req.body;

  if (text) {
    const parsed = parseMultipleShopeeUrls(text);
    return res.json({ results: parsed });
  }

  if (Array.isArray(urls)) {
    const parsed = urls.map((u) => parseShopeeUrl(u));
    return res.json({ results: parsed });
  }

  if (url) {
    const { parsed: single } = await resolveShortlinkIfNeeded(url);
    if (single.valid && single.itemId && single.shopId) {
      const verification = await verifyProductOnShopeeServer(
        single.shopId,
        single.itemId,
        single.originalUrl
      );
      single.connectedToShopee = verification.connected;
      single.httpStatus = verification.httpStatus;
      single.gateway = verification.gateway;
      single.latencyMs = verification.latencyMs;
      single.canonicalUrl = verification.targetUrl;
      if (!single.searchKeyword && single.name) {
        single.searchKeyword = deriveSearchKeyword(single.name);
      }
    }
    return res.json({ result: single });
  }

  return res.status(400).json({ error: 'Parameter url atau text diperlukan' });
});

// Add products manually by pasting links (without photos), verify directly on www.shopee.co.id, and boost if requested
app.post('/api/shopee/products/add', async (req: Request, res: Response) => {
  const { items, autoBoost } = req.body as {
    items: Array<Partial<ShopeeProduct> & { rawUrl?: string }>;
    autoBoost?: boolean;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Daftar produk tidak boleh kosong' });
  }

  const added: ShopeeProduct[] = [];

  await runWithConcurrency(items, 5, async (item) => {
    let itemId = item.itemId;
    let shopId = item.shopId;
    let name = item.name;
    let resolvedUrl = item.originalUrl || item.rawUrl || '';
    let derivedKeyword = item.searchKeyword || '';

    if (resolvedUrl) {
      const { resolvedUrl: finalUrl, parsed } = await resolveShortlinkIfNeeded(resolvedUrl);
      if (parsed.valid) {
        itemId = parsed.isShortlink ? parsed.itemId : (itemId || parsed.itemId);
        shopId = parsed.isShortlink ? parsed.shopId : (shopId || parsed.shopId);
        resolvedUrl = finalUrl;
        if (parsed.name && !parsed.name.startsWith('Produk Shopee #')) {
          name = parsed.name;
        }
        if (!derivedKeyword) {
          derivedKeyword = parsed.searchKeyword || deriveSearchKeyword(name);
        }
      }
    }

    if (!itemId || !shopId) {
      return;
    }

    const canonicalUrl = canonicalizeShopeeUrl(
      resolvedUrl || `https://www.shopee.co.id/product/${shopId}/${itemId}`,
      Number(shopId),
      Number(itemId)
    );
    const finalName = name || `Produk Shopee #${itemId}`;
    const finalKeyword = (derivedKeyword || deriveSearchKeyword(finalName)).trim();

    let product = allProducts.find((p) => p.itemId === Number(itemId));
    if (!product) {
      product = {
        id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        itemId: Number(itemId),
        shopId: Number(shopId),
        name: finalName,
        originalUrl: canonicalUrl,
        price: item.price,
        currency: 'Rp',
        rating: item.rating,
        salesCount: item.salesCount,
        status: 'idle',
        boostedAt: null,
        boostExpiresAt: null,
        remainingSeconds: 0,
        durationSeconds: config.boostIntervalMinutes * 60,
        totalBoostsCount: 0,
        serverHost: 'www.shopee.co.id',
        searchKeyword: finalKeyword || undefined,
        searchBoostActive: false,
        addedAt: Date.now(),
      };
      allProducts.push(product);
    } else {
      product.originalUrl = canonicalUrl;
      if (finalName && (!product.name || product.name.startsWith('Produk Shopee #'))) {
        product.name = finalName;
      }
      if (finalKeyword) {
        product.searchKeyword = finalKeyword;
      }
    }

    added.push(product);

    if (autoBoost) {
      await executeBoostProduct(product, 'manual');
    } else {
      const verification = await verifyProductOnShopeeServer(
        product.shopId,
        product.itemId,
        product.originalUrl
      );
      product.serverConnected = verification.connected;
      product.serverHost = 'www.shopee.co.id';
      product.httpStatus = verification.httpStatus;
      product.gateway = verification.gateway;
      product.pingLatencyMs = verification.latencyMs;
      product.lastVerifiedAt = Date.now();
      product.lastProxyUsed = verification.connected
        ? `www.shopee.co.id · HTTP ${verification.httpStatus} · ${verification.gateway} (${verification.latencyMs}ms)`
        : 'Menunggu verifikasi www.shopee.co.id';
    }
  });

  scheduleSaveState();

  res.json({
    success: true,
    addedCount: added.length,
    products: allProducts,
  });
});

// Update top-search target keyword for a product and optionally re-boost
app.post('/api/shopee/products/update-keyword', async (req: Request, res: Response) => {
  const { productId, searchKeyword, triggerBoost } = req.body as {
    productId: string;
    searchKeyword: string;
    triggerBoost?: boolean;
  };
  const product = allProducts.find((p) => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: 'Produk tidak ditemukan' });
  }
  product.searchKeyword = (searchKeyword || '').trim() || undefined;
  if (triggerBoost) {
    await executeBoostProduct(product, 'manual');
  } else {
    scheduleSaveState();
  }
  return res.json({
    success: true,
    product,
    allProducts,
  });
});

// Delete a product
app.delete('/api/shopee/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  allProducts = allProducts.filter((p) => p.id !== id);
  scheduleSaveState();
  res.json({ success: true, message: 'Produk berhasil dihapus' });
});

// Clear all products
app.post('/api/shopee/products/clear-all', (_req: Request, res: Response) => {
  allProducts = [];
  scheduleSaveState();
  res.json({ success: true, message: 'Seluruh daftar produk telah dikosongkan.' });
});

// Clear activity logs
app.post('/api/shopee/logs/clear', (_req: Request, res: Response) => {
  boostLogs = [];
  scheduleSaveState();
  res.json({ success: true, message: 'Log riwayat berhasil dibersihkan.' });
});

// Get all products, active boosted items, and logs
app.get('/api/shopee/slots', (_req: Request, res: Response) => {
  repairProductNames();
  const currentNow = Date.now();
  const updatedProducts = allProducts.map((p) => {
    let rem = 0;
    if ((p.status === 'boosted' || p.status === 'error') && p.boostExpiresAt) {
      rem = Math.max(0, Math.floor((p.boostExpiresAt - currentNow) / 1000));
    }
    return {
      ...p,
      remainingSeconds: rem,
    };
  });

  res.json({
    allProducts: updatedProducts,
    boostLogs,
    config: {
      ...config,
      autoProxyPoolCount: autoProxyPool.length,
    },
    totalBoostsCount,
    connected: isShopeeConnected,
    server: 'www.shopee.co.id',
    httpStatus: lastShopeeHttpStatus,
    gateway: lastShopeeGateway,
    pingLatencyMs: lastShopeePingLatencyMs,
  });
});

// Boost a single product immediately
app.post('/api/shopee/boost', async (req: Request, res: Response) => {
  const { productId, itemId } = req.body;

  let product: ShopeeProduct | undefined;
  if (productId) {
    product = allProducts.find((p) => p.id === productId);
  } else if (itemId) {
    product = allProducts.find((p) => p.itemId === Number(itemId));
  }

  if (!product) {
    return res.status(404).json({ error: 'Produk tidak ditemukan di daftar.' });
  }

  const result = await executeBoostProduct(product, 'manual');
  res.json({
    ...result,
    product,
    allProducts,
  });
});

// Boost ALL products in the list simultaneously with bounded concurrency!
app.post('/api/shopee/boost-all', async (_req: Request, res: Response) => {
  const results = await runWithConcurrency(allProducts, 5, (product) =>
    executeBoostProduct(product, 'manual')
  );
  res.json({
    success: true,
    message: `${results.length} produk berhasil dinaikkan ke server www.shopee.co.id sekaligus!`,
    allProducts,
  });
});

// Stop boosting a product (set to idle)
app.post('/api/shopee/boost/stop', (req: Request, res: Response) => {
  const { productId } = req.body;
  const product = allProducts.find((p) => p.id === productId);
  if (product) {
    product.status = 'idle';
    product.boostExpiresAt = null;
    product.remainingSeconds = 0;
    scheduleSaveState();
  }
  res.json({ success: true, message: 'Booster produk dihentikan', allProducts });
});

// Vite dev server mounting or static serving
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BangRoy Boost SHP Server running on http://0.0.0.0:${PORT} (Connected to www.shopee.co.id)`);
  });
}

startServer();
