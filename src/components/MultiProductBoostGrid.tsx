import React from 'react';
import {
  Clock,
  Rocket,
  CheckCircle2,
  Trash2,
  RefreshCw,
  ExternalLink,
  Flame,
  Shield,
  Zap,
  Square,
  Layers,
} from 'lucide-react';
import { ShopeeProduct } from '../types/shopee';

interface MultiProductBoostGridProps {
  products: ShopeeProduct[];
  onBoostProduct: (productId: string) => Promise<void>;
  onStopBoost: (productId: string) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onBoostAll: () => Promise<void>;
  isProcessing: boolean;
  intervalMinutes: number;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const MultiProductBoostGrid: React.FC<MultiProductBoostGridProps> = ({
  products,
  onBoostProduct,
  onStopBoost,
  onDeleteProduct,
  onBoostAll,
  isProcessing,
  intervalMinutes,
}) => {
  const boostedProducts = products.filter((p) => p.status === 'boosted');
  const idleProducts = products.filter((p) => p.status !== 'boosted');

  return (
    <section className="space-y-3">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-600" />
            <h2 className="text-base font-bold text-slate-900">
              Daftar Booster Produk Aktif (Bisa Banyak Produk)
            </h2>
            <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
              {boostedProducts.length} Aktif Naik
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Setiap produk yang ditempel memiliki timer hitung mundur {intervalMinutes} menit tersendiri dan otomatis dinaikkan kembali ke server Shopee.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {products.length > 0 && (
            <button
              type="button"
              onClick={onBoostAll}
              disabled={isProcessing}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Naikkan Semua ({products.length} Produk)</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid of Multi-Products (Dynamic size, no 5 slot limit!) */}
      {products.length === 0 ? (
        <div className="p-10 bg-white rounded-xl border border-dashed border-slate-300 text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <Layers className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-800">Belum Ada Produk yang Ditempel</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Tempelkan link produk Shopee pada formulir di atas. Anda bisa menaikkan sebanyak mungkin produk sekaligus tanpa dibatasi hanya 5 produk!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {products.map((product, idx) => {
            const isBoosted = product.status === 'boosted';
            const totalDuration = product.durationSeconds || intervalMinutes * 60;
            const elapsed = totalDuration - (product.remainingSeconds || 0);
            const progressPercent = isBoosted
              ? Math.min(100, Math.max(0, (elapsed / totalDuration) * 100))
              : 0;

            return (
              <div
                key={product.id}
                className={`relative flex flex-col justify-between rounded-xl p-3.5 border transition-all ${
                  isBoosted
                    ? 'bg-white border-orange-200 shadow-sm ring-1 ring-orange-400/30'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                {/* Header item badge */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`flex items-center justify-center px-1.5 py-0.5 rounded text-2xs font-bold ${
                        isBoosted
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 truncate max-w-[140px]">
                      ID: {product.itemId}
                    </span>
                  </div>

                  {isBoosted ? (
                    <span className="flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      Aktif Naik
                    </span>
                  ) : (
                    <span className="text-2xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      Idle / Siap
                    </span>
                  )}
                </div>

                {/* Product details (Without Photos) */}
                <div className="flex-1 space-y-2">
                  <h4
                    className="text-xs font-semibold text-slate-900 line-clamp-2 leading-tight"
                    title={product.name}
                  >
                    {product.name}
                  </h4>

                  <div className="flex items-center justify-between text-2xs text-slate-500">
                    <span>Toko: <strong className="text-slate-700">{product.shopId}</strong></span>
                    <span>Boost: <strong className="text-orange-600">{product.totalBoostsCount || 0}x</strong></span>
                    {product.originalUrl && (
                      <a
                        href={product.originalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-orange-600 hover:text-orange-700 inline-flex items-center ml-auto"
                        title="Buka di Shopee"
                      >
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    )}
                  </div>

                  {product.lastProxyUsed && (
                    <div className="flex items-center gap-1 text-2xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-mono truncate">
                      <Shield className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{product.lastProxyUsed}</span>
                    </div>
                  )}

                  {/* Timer Display */}
                  {isBoosted ? (
                    <div className="p-2 rounded-lg bg-orange-50/70 border border-orange-100 space-y-1.5">
                      <div className="flex items-center justify-between text-2xs text-slate-600">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-orange-600" />
                          Sisa Waktu ({intervalMinutes}m):
                        </span>
                        <span className="font-mono font-bold text-xs text-orange-700">
                          {formatCountdown(product.remainingSeconds)}
                        </span>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full bg-orange-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-orange-500 h-full rounded-full transition-all duration-1000"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-slate-100/80 border border-slate-200 text-center">
                      <div className="text-2xs font-semibold text-slate-700 flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Siap Dinaikkan</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5">
                  {isBoosted ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onBoostProduct(product.id)}
                        disabled={isProcessing}
                        className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                        title="Naikkan Ulang Sekarang (Reset Timer)"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Boost Ulang</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onStopBoost(product.id)}
                        className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-xs font-medium transition-colors"
                        title="Hentikan Boost"
                      >
                        Jeda
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteProduct(product.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 transition-colors"
                        title="Hapus Produk"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onBoostProduct(product.id)}
                        disabled={isProcessing}
                        className="flex-1 py-1.5 px-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1 shadow-2xs transition-all disabled:opacity-50"
                      >
                        <Rocket className="w-3 h-3" />
                        <span>Naikkan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteProduct(product.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 transition-colors"
                        title="Hapus Produk"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
