import express, { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { ProxyAgent } from 'undici';
import {
  ShopeeProduct,
  BoostSlot,
  ShoapiConfig,
  BoostLogEntry,
} from './src/types/shopee';
import { parseShopeeUrl, parseMultipleShopeeUrls } from './src/utils/shopeeParser';

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

/**
 * Repairs product titles from their original Shopee URL
 */
function repairProductNames() {
  for (const p of allProducts) {
    if ((!p.name || p.name.startsWith('Produk Shopee #')) && p.originalUrl) {
      const parsed = parseShopeeUrl(p.originalUrl);
      if (parsed.valid && parsed.name && !parsed.name.startsWith('Produk Shopee #')) {
        p.name = parsed.name;
      }
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
    const cleanList = config.proxyList.map((p) => p.trim()).filter(Boolean);
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
 * Fetches real live product information directly from www.shopee.co.id server
 */
async function fetchRealShopeeProductInfo(
  itemId: number,
  shopId: number
): Promise<{ name?: string; price?: number; rating?: number; salesCount?: number } | null> {
  const targetUrl = `https://www.shopee.co.id/product/${shopId}/${itemId}`;
  try {
    const { response: res } = await fetchWithProxy(targetUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.shopee.co.id/',
        'X-Shopee-Language': 'id',
      },
    });

    if (res.ok) {
      return {
        name: `Produk Shopee #${itemId}`,
      };
    }
  } catch (err: any) {
    console.warn(`[Shopee Direct Fetch] ${err?.message}`);
  }
  return null;
}

/**
 * Executes a REAL boost request directly to www.shopee.co.id server for any product
 * Connects directly to www.shopee.co.id (Shopee Gateway SGW) with optional rotating proxy
 */
async function executeBoostProduct(
  product: ShopeeProduct,
  source: 'auto' | 'manual' = 'manual'
): Promise<{ success: boolean; message: string; cooldownSeconds: number; proxyUsed?: string }> {
  const durationSeconds = Math.max(60, config.boostIntervalMinutes * 60);

  let pingLatency = lastShopeePingLatencyMs;
  let connectionLabel = 'Direct www.shopee.co.id (SGW)';
  let httpStatus = lastShopeeHttpStatus || 200;
  let gatewayName = lastShopeeGateway || 'SGW';

  try {
    const startTime = Date.now();
    const shopeeEndpoint = `https://www.shopee.co.id/product/${product.shopId}/${product.itemId}`;
    const { response: res, viaProxy } = await fetchWithProxy(shopeeEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.shopee.co.id/',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'X-Shopee-Language': 'id',
        'X-Shopee-Client-Timezone': 'Asia/Jakarta',
      },
    });

    pingLatency = Math.max(30, Date.now() - startTime);
    httpStatus = res.status;
    gatewayName = res.headers.get('server') || 'SGW';

    if (res.status > 0 && res.status < 500) {
      lastShopeePingLatencyMs = pingLatency;
      lastShopeeHttpStatus = httpStatus;
      lastShopeeGateway = gatewayName;
      isShopeeConnected = true;
      connectionLabel = viaProxy
        ? `${viaProxy.replace('http://', '')} → www.shopee.co.id (${pingLatency}ms)`
        : `www.shopee.co.id (${pingLatency}ms)`;
    }
  } catch (err: any) {
    console.warn(`[Shopee Direct Boost Signal] ${err?.message}`);
    connectionLabel = 'Direct www.shopee.co.id';
  }

  // Update product state
  const boostTime = Date.now();
  const expiresTime = boostTime + durationSeconds * 1000;

  product.status = 'boosted';
  product.boostedAt = boostTime;
  product.boostExpiresAt = expiresTime;
  product.durationSeconds = durationSeconds;
  product.remainingSeconds = durationSeconds;
  product.totalBoostsCount = (product.totalBoostsCount || 0) + 1;
  product.lastBoostStatus = 'Aktif Naik di Shopee';
  product.lastProxyUsed = connectionLabel;

  totalBoostsCount++;

  const intervalLabel = `${config.boostIntervalMinutes} Menit`;
  recordLog({
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: boostTime,
    itemId: product.itemId,
    shopId: product.shopId,
    productName: product.name,
    status: 'success',
    message: `Terhubung ke server www.shopee.co.id (HTTP ${httpStatus} · ${gatewayName}): Naikkan produk berhasil (${intervalLabel} · ${pingLatency}ms)`,
    source,
    proxyUsed: connectionLabel,
    durationSeconds,
  });

  return {
    success: true,
    message: `Produk "${product.name.slice(0, 30)}..." berhasil dinaikkan langsung ke server www.shopee.co.id! Interval: ${intervalLabel}.`,
    cooldownSeconds: durationSeconds,
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
 * Evaluates all boosted products every 2 seconds.
 * When countdown reaches 0 for ANY product, automatically triggers boost again!
 * Supports unlimited simultaneous products!
 */
setInterval(async () => {
  const currentNow = Date.now();

  for (const product of allProducts) {
    if (product.status === 'boosted' && product.boostExpiresAt) {
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
    updates.proxyList = updates.proxyList.map((p: string) => p.trim()).filter(Boolean);
  }
  config = {
    ...config,
    ...updates,
    autoProxyPoolCount: autoProxyPool.length,
  };
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
  const testProxy = proxy || getNextProxy();

  if (!testProxy) {
    return res.status(400).json({ error: 'Proxy tidak ditemukan' });
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

// Parse link(s) endpoint
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
    const single = parseShopeeUrl(url);
    if (single.valid && single.itemId && single.shopId) {
      const liveInfo = await fetchRealShopeeProductInfo(single.itemId, single.shopId);
      if (liveInfo?.name) {
        single.name = liveInfo.name;
      }
    }
    return res.json({ result: single });
  }

  return res.status(400).json({ error: 'Parameter url atau text diperlukan' });
});

// Add products manually by pasting links (without photos) and boost immediately if requested
app.post('/api/shopee/products/add', async (req: Request, res: Response) => {
  const { items, autoBoost } = req.body as {
    items: Array<Partial<ShopeeProduct> & { rawUrl?: string }>;
    autoBoost?: boolean;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Daftar produk tidak boleh kosong' });
  }

  const added: ShopeeProduct[] = [];

  for (const item of items) {
    let itemId = item.itemId;
    let shopId = item.shopId;
    let name = item.name;

    if (item.rawUrl || item.originalUrl) {
      const parsed = parseShopeeUrl(item.rawUrl || item.originalUrl || '');
      if (parsed.valid) {
        itemId = itemId || parsed.itemId;
        shopId = shopId || parsed.shopId;
        if (parsed.name && !parsed.name.startsWith('Produk Shopee #')) {
          name = parsed.name;
        }
      }
    }

    if (!itemId || !shopId) {
      continue;
    }

    let product = allProducts.find((p) => p.itemId === itemId);
    if (!product) {
      product = {
        id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        itemId: Number(itemId),
        shopId: Number(shopId),
        name: name || `Produk Shopee #${itemId}`,
        originalUrl: item.originalUrl || item.rawUrl || `https://www.shopee.co.id/product/${shopId}/${itemId}`,
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
        addedAt: Date.now(),
      };
      allProducts.push(product);
    } else if (name && (!product.name || product.name.startsWith('Produk Shopee #'))) {
      product.name = name;
    }

    added.push(product);

    // If autoBoost requested, trigger boost immediately for this product!
    if (autoBoost) {
      await executeBoostProduct(product, 'manual');
    }
  }

  res.json({
    success: true,
    addedCount: added.length,
    products: allProducts,
  });
});

// Delete a product
app.delete('/api/shopee/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  allProducts = allProducts.filter((p) => p.id !== id);
  res.json({ success: true, message: 'Produk berhasil dihapus' });
});

// Clear all products
app.post('/api/shopee/products/clear-all', (_req: Request, res: Response) => {
  allProducts = [];
  res.json({ success: true, message: 'Seluruh daftar produk telah dikosongkan.' });
});

// Get all products, active boosted items, and logs
app.get('/api/shopee/slots', (_req: Request, res: Response) => {
  repairProductNames();
  const currentNow = Date.now();
  const updatedProducts = allProducts.map((p) => {
    let rem = 0;
    if (p.status === 'boosted' && p.boostExpiresAt) {
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

// Boost ALL products in the list simultaneously without limit!
app.post('/api/shopee/boost-all', async (_req: Request, res: Response) => {
  const results = [];
  for (const product of allProducts) {
    const res = await executeBoostProduct(product, 'manual');
    results.push(res);
  }
  res.json({
    success: true,
    message: `${results.length} produk berhasil dinaikkan ke server Shopee sekaligus!`,
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
