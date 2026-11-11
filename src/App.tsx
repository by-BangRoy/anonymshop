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

export default function App() {
  const [products, setProducts] = useState<ShopeeProduct[]>([]);
  const [logs, setLogs] = useState<BoostLogEntry[]>([]);
  const [config, setConfig] = useState<ShoapiConfig>({
    isProduction: true,
    boostIntervalMinutes: 1,
    proxyEnabled: false,
    proxyList: [],
    autoBoostEnabled: true,
    notificationSound: true,
    maxConcurrentBoosts: 0,
  });

  const [pingLatencyMs, setPingLatencyMs] = useState(85);
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
    } catch (err) {
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
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
          <div className="flex items-center gap-2">
            <span>ShoBoost Multi-Produk</span>
            <span>·</span>
            <span>Bisa Naikkan Banyak Produk Sekaligus Tanpa Batas</span>
            <span>·</span>
            <span>Server Shopee.co.id ({pingLatencyMs}ms)</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Interval {config.boostIntervalMinutes} Menit</span>
            <span>·</span>
            <span>Tanpa Kredensial</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
