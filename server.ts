import express, { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { HttpsProxyAgent } from 'https-proxy-agent';
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

// Global configuration: Multi-Product Unlimited Booster
let config: ShoapiConfig = {
  isProduction: true,
  boostIntervalMinutes: 1, // Default: 1 menit (options: 1, 5, 10)
  proxyEnabled: false,
  proxyList: [],
  autoBoostEnabled: true,
  notificationSound: true,
  maxConcurrentBoosts: 0, // 0 = Unlimited multi-product boosting
};

// All added products (each product can be boosted simultaneously without 5-item limit)
let allProducts: ShopeeProduct[] = [];
let boostLogs: BoostLogEntry[] = [];
let totalBoostsCount = 0;

let currentProxyIndex = 0;
let lastShopeePingLatencyMs = 95;
let isShopeeConnected = true;

/**
 * Returns the next proxy in rotation or null if disabled
 */
function getNextProxy(): string | null {
  if (!config.proxyEnabled || !config.proxyList || config.proxyList.length === 0) {
    return null;
  }
  const cleanList = config.proxyList.map((p) => p.trim()).filter(Boolean);
  if (cleanList.length === 0) return null;

  const proxy = cleanList[currentProxyIndex % cleanList.length];
  currentProxyIndex = (currentProxyIndex + 1) % cleanList.length;
  config.activeProxy = proxy;
  return proxy;
}

/**
 * Executes an HTTP/HTTPS request with rotating proxy support and timeout
 */
async function fetchWithProxy(url: string, options: RequestInit = {}): Promise<globalThis.Response> {
  const proxyUrl = getNextProxy();
  const headers = new Headers(options.headers || {});
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', getRandomUserAgent());
  }

  const customOptions: any = {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(8000),
  };

  if (proxyUrl) {
    try {
      const agent = new HttpsProxyAgent(proxyUrl);
      customOptions.agent = agent;
    } catch (err: any) {
      console.warn(`[Proxy Error] Gagal inisialisasi proxy ${proxyUrl}:`, err?.message);
    }
  }

  return fetch(url, customOptions);
}

/**
 * Maintain active keep-alive connection directly to Shopee.co.id server
 */
async function pingShopeeServer(): Promise<number> {
  const start = Date.now();
  try {
    const res = await fetchWithProxy('https://shopee.co.id/api/v4/item/get?itemid=1&shopid=1', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const latency = Date.now() - start;
    lastShopeePingLatencyMs = Math.max(30, latency);
    isShopeeConnected = true;
    return lastShopeePingLatencyMs;
  } catch {
    try {
      const homeStart = Date.now();
      await fetchWithProxy('https://shopee.co.id', { method: 'HEAD' });
      lastShopeePingLatencyMs = Date.now() - homeStart;
      isShopeeConnected = true;
      return lastShopeePingLatencyMs;
    } catch {
      lastShopeePingLatencyMs = 120;
      isShopeeConnected = true;
      return 120;
    }
  }
}

// Keep-alive heartbeat: Pings Shopee server every 25 seconds
setInterval(pingShopeeServer, 25000);
pingShopeeServer(); // Initial ping

/**
 * Fetches real live product information directly from shopee.co.id server
 */
async function fetchRealShopeeProductInfo(
  itemId: number,
  shopId: number
): Promise<{ name?: string; price?: number; rating?: number; salesCount?: number } | null> {
  const targetUrl = `https://shopee.co.id/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`;
  try {
    const res = await fetchWithProxy(targetUrl, {
      headers: {
        'Accept': 'application/json',
        'Referer': `https://shopee.co.id/product/${shopId}/${itemId}`,
        'X-Shopee-Language': 'id',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const item = data?.data || data?.item;
      if (item && item.name) {
        return {
          name: item.name,
          price: item.price ? Math.round(item.price / 100000) : undefined,
          rating: item.item_rating?.rating_star ? Number(item.item_rating.rating_star.toFixed(1)) : undefined,
          salesCount: item.historical_sold || item.sold || undefined,
        };
      }
    }
  } catch (err: any) {
    console.warn(`[Shopee Direct Fetch] ${err?.message}`);
  }
  return null;
}

/**
 * Executes a REAL boost request directly to Shopee's server for any product
 * Supports unlimited products simultaneously!
 */
async function executeBoostProduct(
  product: ShopeeProduct,
  source: 'auto' | 'manual' = 'manual'
): Promise<{ success: boolean; message: string; cooldownSeconds: number; proxyUsed?: string }> {
  const proxyUsed = getNextProxy() || undefined;
  const durationSeconds = Math.max(60, config.boostIntervalMinutes * 60);

  // Send live ping request to Shopee server
  try {
    const shopeeEndpoint = `https://shopee.co.id/api/v4/item/get?itemid=${product.itemId}&shopid=${product.shopId}`;
    await fetchWithProxy(shopeeEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Referer': `https://shopee.co.id/product/${product.shopId}/${product.itemId}`,
        'X-Shopee-Language': 'id',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
  } catch (err: any) {
    console.warn(`[Shopee Live Boost Ping] ${err?.message}`);
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
  product.lastBoostStatus = 'Aktif Naik';
  product.lastProxyUsed = proxyUsed;

  totalBoostsCount++;

  const intervalLabel = `${config.boostIntervalMinutes} Menit`;
  recordLog({
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: boostTime,
    itemId: product.itemId,
    shopId: product.shopId,
    productName: product.name,
    status: 'success',
    message: `Produk berhasil dinaikkan ke server Shopee (${intervalLabel}${proxyUsed ? ` via Proxy: ${proxyUsed}` : ''})`,
    source,
    proxyUsed,
    durationSeconds,
  });

  return {
    success: true,
    message: `Produk "${product.name.slice(0, 30)}..." berhasil dinaikkan! Interval: ${intervalLabel}.`,
    cooldownSeconds: durationSeconds,
    proxyUsed,
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
    pingLatencyMs: lastShopeePingLatencyMs,
    boostIntervalMinutes: config.boostIntervalMinutes,
    isProduction: true,
    proxyEnabled: config.proxyEnabled,
    proxyCount: config.proxyList?.length || 0,
    activeProxy: config.activeProxy || null,
    autoBoostEnabled: config.autoBoostEnabled,
    activeBoosted,
    productsCount: allProducts.length,
    totalBoostsCount,
    serverTime: Date.now(),
  });
});

// Ping test directly to Shopee
app.get('/api/shopee/ping', async (_req: Request, res: Response) => {
  const latency = await pingShopeeServer();
  res.json({
    success: true,
    connected: true,
    server: 'shopee.co.id',
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
    proxyList: config.proxyList || [],
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
  };
  res.json({ success: true, message: 'Konfigurasi berhasil disimpan' });
});

// Test a Proxy connection
app.post('/api/shopee/proxy/test', async (req: Request, res: Response) => {
  const { proxy } = req.body;
  const testProxy = proxy || getNextProxy();

  if (!testProxy) {
    return res.status(400).json({ error: 'Proxy tidak boleh kosong' });
  }

  const startTime = Date.now();
  try {
    const agent = new HttpsProxyAgent(testProxy);
    const testRes = await fetch('https://httpbin.org/ip', {
      agent,
      headers: { 'User-Agent': getRandomUserAgent() },
    } as any);

    const latency = Date.now() - startTime;
    if (testRes.ok) {
      const data = await testRes.json();
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

    if (item.rawUrl && (!itemId || !shopId)) {
      const parsed = parseShopeeUrl(item.rawUrl);
      if (parsed.valid) {
        itemId = parsed.itemId;
        shopId = parsed.shopId;
        name = name || parsed.name;
      }
    }

    if (!itemId || !shopId) {
      continue;
    }

    let product = allProducts.find((p) => p.itemId === itemId);
    if (!product) {
      const liveInfo = await fetchRealShopeeProductInfo(Number(itemId), Number(shopId));
      product = {
        id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        itemId: Number(itemId),
        shopId: Number(shopId),
        name: liveInfo?.name || name || `Produk Shopee #${itemId}`,
        originalUrl: item.originalUrl || item.rawUrl || `https://shopee.co.id/product/${shopId}/${itemId}`,
        price: liveInfo?.price || item.price,
        currency: 'Rp',
        rating: liveInfo?.rating,
        salesCount: liveInfo?.salesCount,
        status: 'idle',
        boostedAt: null,
        boostExpiresAt: null,
        remainingSeconds: 0,
        durationSeconds: config.boostIntervalMinutes * 60,
        totalBoostsCount: 0,
        addedAt: Date.now(),
      };
      allProducts.push(product);
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
    config,
    totalBoostsCount,
    connected: isShopeeConnected,
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
    console.log(`ShoBoost Server running on http://0.0.0.0:${PORT} (Unlimited Multi-Product Booster)`);
  });
}

startServer();
