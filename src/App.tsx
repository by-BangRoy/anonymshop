import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { LinkPaster } from './components/LinkPaster';
import { MultiProductBoostGrid } from './components/MultiProductBoostGrid';
import { ProductLibrary } from './components/ProductLibrary';
import { ActivityLogs } from './components/ActivityLogs';
import { ShoapiConfigModal } from './components/ShoapiConfigModal';
import { ShopeeGuideModal } from './components/ShopeeGuideModal';
import { playBoostChime } from './utils/audio';
import {
  ShopeeProduct,
  ShoapiConfig,
  BoostLogEntry,
} from './types/shopee';
import { Layers, Flame, Zap, Globe, Clock, ShieldCheck } from 'lucide-react';

export default function App() {
  const [products, setProducts] = useState<ShopeeProduct[]>([]);
  const [logs, setLogs] = useState<BoostLogEntry[]>([]);
  const [config, setConfig] = useState<ShoapiConfig>({
    isProduction: true,
    boostIntervalMinutes: 1,
    proxyEnabled: false,
    proxyMode: 'direct',
    proxyList: [],
    autoBoostEnabled: true,
    notificationSound: true,
    maxConcurrentBoosts: 0,
  });

  const [pingLatencyMs, setPingLatencyMs] = useState(85);
  const [isConnected, setIsConnected] = useState(true);
  const [serverGateway, setServerGateway] = useState('SGW');
  const [lastHttpStatus, setLastHttpStatus] = useState(200);
  const [totalBoostsCount, setTotalBoostsCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  // Fetch full state from backend
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/shopee/slots');
      if (!res.ok) return;
      const data = await res.json();
      if (data.allProducts) setProducts(data.allProducts);
      if (data.boostLogs) setLogs(data.boostLogs);
      if (data.config) setConfig(data.config);
      if (typeof data.totalBoostsCount === 'number') {
        setTotalBoostsCount(data.totalBoostsCount);
      }
      if (typeof data.pingLatencyMs === 'number') {
        setPingLatencyMs(data.pingLatencyMs);
      }
      if (typeof data.connected === 'boolean') {
        setIsConnected(data.connected);
      }
      if (typeof data.gateway === 'string' && data.gateway) {
        setServerGateway(data.gateway);
      }
      if (typeof data.httpStatus === 'number') {
        setLastHttpStatus(data.httpStatus);
      }
    } catch (err) {
      setIsConnected(false);
      console.warn('Gagal sinkronisasi data server:', err);
    }
  }, []);

  // Initial fetch and 3-second polling
  useEffect(() => {
    fetchState();
    const interval = setInterval(() => {
      fetchState();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchState]);

  // Client-side 1-second countdown ticker for all boosted products
  useEffect(() => {
    const timer = setInterval(() => {
      setProducts((prevProducts) =>
        prevProducts.map((p) => {
          if (p.status === 'boosted' && p.remainingSeconds > 0) {
            const nextSec = p.remainingSeconds - 1;
            return {
              ...p,
              remainingSeconds: Math.max(0, nextSec),
            };
          }
          return p;
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Change interval (1, 5, 10 minutes)
  const handleChangeInterval = async (minutes: 1 | 5 | 10) => {
    setConfig((prev) => ({ ...prev, boostIntervalMinutes: minutes }));
    try {
      await fetch('/api/shopee/interval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      });
      await fetchState();
    } catch (err) {
      console.warn('Gagal mengubah interval:', err);
    }
  };

  // Add a product and boost it immediately
  const handleAddAndBoost = async (item: {
    rawUrl: string;
    itemId: number;
    shopId: number;
    name: string;
  }) => {
    setIsProcessing(true);
    try {
      const addRes = await fetch('/api/shopee/products/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [item],
          autoBoost: true,
        }),
      });
      const addData = await addRes.json();
      if (!addData.success) {
        throw new Error(addData.error || 'Gagal menambahkan produk');
      }

      if (config.notificationSound) {
        playBoostChime();
      }

      await fetchState();
    } finally {
      setIsProcessing(false);
    }
  };

  // Bulk add products (can add and boost 10, 20, 50 products!)
  const handleAddProducts = async (
    items: Array<{
      rawUrl: string;
      itemId: number;
      shopId: number;
      name: string;
    }>,
    autoBoost: boolean
  ) => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/shopee/products/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, autoBoost }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal menyimpan produk');
      }
      if (autoBoost && config.notificationSound) {
        playBoostChime();
      }
      await fetchState();
    } finally {
      setIsProcessing(false);
    }
  };

  // Boost a product by ID
  const handleBoostProduct = async (productId: string) => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/shopee/boost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (data.success && config.notificationSound) {
        playBoostChime();
      }
      await fetchState();
    } finally {
      setIsProcessing(false);
    }
  };

  // Boost ALL products simultaneously!
  const handleBoostAll = async () => {
    if (products.length === 0) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/shopee/boost-all', { method: 'POST' });
      const data = await res.json();
      if (data.success && config.notificationSound) {
        playBoostChime();
      }
      await fetchState();
    } finally {
      setIsProcessing(false);
    }
  };

  // Stop boosting a product
  const handleStopBoost = async (productId: string) => {
    try {
      await fetch('/api/shopee/boost/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      await fetchState();
    } catch (err) {
      console.warn('Gagal menjeda booster:', err);
    }
  };

  // Delete single product
  const handleDeleteProduct = async (id: string) => {
    try {
      await fetch(`/api/shopee/products/${id}`, { method: 'DELETE' });
      await fetchState();
    } catch (err) {
      console.warn('Gagal menghapus produk:', err);
    }
  };

  // Clear all products (In-UI modal confirmation without window.confirm)
  const handleClearAll = () => {
    setIsConfirmingClear(true);
  };

  const handleConfirmClearAll = async () => {
    setIsConfirmingClear(false);
    try {
      await fetch('/api/shopee/products/clear-all', { method: 'POST' });
      await fetchState();
    } catch (err) {
      console.warn('Gagal mengosongkan produk:', err);
    }
  };

  // Toggle Auto-Boost
  const handleToggleAutoBoost = async () => {
    const updatedStatus = !config.autoBoostEnabled;
    setConfig((prev) => ({ ...prev, autoBoostEnabled: updatedStatus }));
    try {
      await fetch('/api/shopee/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoBoostEnabled: updatedStatus }),
      });
    } catch (err) {
      console.warn('Gagal mengubah status auto boost:', err);
    }
  };

  // Save ShoAPI and Proxy configuration
  const handleSaveConfig = async (updated: Partial<ShoapiConfig>) => {
    try {
      await fetch('/api/shopee/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      setConfig((prev) => ({ ...prev, ...updated }));
      await fetchState();
    } catch (err) {
      console.warn('Gagal menyimpan konfigurasi:', err);
    }
  };

  const activeBoostedCount = products.filter((p) => p.status === 'boosted').length;

  return (
    <div className="min-h-screen bg-slate-100/60 text-slate-900 flex flex-col font-sans antialiased selection:bg-orange-500 selection:text-white">
      {/* Header with unlimited multi-product booster indicator */}
      <Header
        config={config}
        onToggleAutoBoost={handleToggleAutoBoost}
        onBoostAll={handleBoostAll}
        onOpenConfig={() => setIsConfigOpen(true)}
        onOpenGuide={() => setIsGuideOpen(true)}
        onClearAll={handleClearAll}
        onChangeInterval={handleChangeInterval}
        totalBoostsCount={totalBoostsCount}
        productsCount={products.length}
        activeBoostedCount={activeBoostedCount}
        pingLatencyMs={pingLatencyMs}
        connected={isConnected}
        gateway={serverGateway}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Dynamic Metrics Overview Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-2xs sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Produk Ditempel
              </span>
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{products.length}</span>
              <span className="text-2xs text-slate-500 font-medium">Produk</span>
            </div>
            <p className="text-2xs text-slate-400 mt-1">Multi-produk tanpa batas</p>
          </div>

          <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-2xs sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Sedang Naik
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Flame className="w-4 h-4 text-orange-600 animate-bounce" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-orange-600">{activeBoostedCount}</span>
              <span className="text-2xs text-slate-500 font-medium">
                ({products.length > 0 ? Math.round((activeBoostedCount / products.length) * 100) : 0}%)
              </span>
            </div>
            <p className="text-2xs text-slate-400 mt-1">Timer live hitung mundur</p>
          </div>

          <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-2xs sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Boost Sukses
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-700">{totalBoostsCount}x</span>
              <span className="text-2xs text-emerald-700 font-semibold px-1.5 py-0.2 rounded bg-emerald-50 border border-emerald-200">
                Auto Re-Boost
              </span>
            </div>
            <p className="text-2xs text-slate-400 mt-1">Penaikan otomatis 24/7</p>
          </div>

          <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-2xs sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Koneksi Server Shopee
              </span>
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                }`}
              >
                <Globe className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-lg font-black ${isConnected ? 'text-emerald-800' : 'text-amber-800'}`}>
                {pingLatencyMs}ms
              </span>
              <span
                className={`text-2xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                  isConnected
                    ? 'text-emerald-700 bg-emerald-100/80 border-emerald-300'
                    : 'text-amber-700 bg-amber-100/80 border-amber-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                {isConnected ? 'Terhubung' : 'Koneksi Terputus'}
              </span>
            </div>
            <p className="text-2xs text-slate-500 mt-1">
              {serverGateway} Gateway · HTTP {lastHttpStatus} · www.shopee.co.id
            </p>
          </div>
        </div>

        {/* Section 1: Tempel Link Produk Shopee (Supports Unlimited Multi-Products) */}
        <LinkPaster
          onAddAndBoost={handleAddAndBoost}
          onAddProducts={handleAddProducts}
          isProcessing={isProcessing}
        />

        {/* Section 2: Multi-Product Booster Grid (No 5 slot limit!) */}
        <MultiProductBoostGrid
          products={products}
          onBoostProduct={handleBoostProduct}
          onStopBoost={handleStopBoost}
          onDeleteProduct={handleDeleteProduct}
          onBoostAll={handleBoostAll}
          isProcessing={isProcessing}
          intervalMinutes={config.boostIntervalMinutes}
        />

        {/* Section 3: Two Column Layout (Catalog & History Logs) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ProductLibrary
              products={products}
              onDeleteProduct={handleDeleteProduct}
              onBoostProduct={handleBoostProduct}
              onStopBoost={handleStopBoost}
              onBoostAll={handleBoostAll}
              isProcessing={isProcessing}
              intervalMinutes={config.boostIntervalMinutes}
            />
          </div>

          <div className="lg:col-span-1">
            <ActivityLogs logs={logs} onClearLogs={() => setLogs([])} />
          </div>
        </div>
      </main>

      {/* Modals */}
      <ShoapiConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={config}
        onSaveConfig={handleSaveConfig}
        pingLatencyMs={pingLatencyMs}
      />

      <ShopeeGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {/* Confirm Clear Modal (In-UI without window.confirm) */}
      {isConfirmingClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-100">
            <h4 className="text-sm font-bold text-slate-900">Kosongkan Semua Produk?</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tindakan ini akan menghapus seluruh daftar link produk yang telah Anda tempel.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmingClear(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAll}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors"
              >
                Ya, Kosongkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean quiet footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-700">BangRoy Boost SHP</span>
            <span>·</span>
            <span>Otomasi Multi-Produk Server Shopee</span>
            <span>·</span>
            <span className={`${isConnected ? 'text-emerald-700' : 'text-amber-700'} flex items-center gap-1 font-medium`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              www.shopee.co.id ({pingLatencyMs}ms)
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>Interval {config.boostIntervalMinutes} Menit</span>
            <span>·</span>
            <span className="text-slate-600 font-medium">Tanpa Kredensial / Login</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
