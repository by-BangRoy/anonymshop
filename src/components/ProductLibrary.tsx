import React, { useState } from 'react';
import {
  Package,
  ExternalLink,
  Trash2,
  Rocket,
  Search,
  Shield,
  Zap,
  Clock,
} from 'lucide-react';
import { ShopeeProduct } from '../types/shopee';

interface ProductLibraryProps {
  products: ShopeeProduct[];
  onDeleteProduct: (id: string) => Promise<void>;
  onBoostProduct: (productId: string) => Promise<void>;
  onStopBoost: (productId: string) => Promise<void>;
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

export const ProductLibrary: React.FC<ProductLibraryProps> = ({
  products,
  onDeleteProduct,
  onBoostProduct,
  onStopBoost,
  onBoostAll,
  isProcessing,
  intervalMinutes,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'boosted' | 'ready'>('all');

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.itemId.toString().includes(searchTerm) ||
      p.shopId.toString().includes(searchTerm);

    if (!matchesSearch) return false;
    if (filterStatus === 'boosted') return p.status === 'boosted';
    if (filterStatus === 'ready') return p.status !== 'boosted';
    return true;
  });

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header & Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-600" />
            <h3 className="text-base font-bold text-slate-900">
              Katalog Semua Produk ({products.length})
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Semua produk yang ditempel. Dapat dinaikkan secara bersamaan tanpa batasan slot.
          </p>
        </div>

        {/* Search, Filter & Bulk Action */}
        <div className="flex flex-wrap items-center gap-2">
          {products.length > 0 && (
            <button
              type="button"
              onClick={onBoostAll}
              disabled={isProcessing}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Naikkan Semua</span>
            </button>
          )}

          {products.length > 0 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama atau Item ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          )}

          {products.length > 0 && (
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterStatus === 'all'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('boosted')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterStatus === 'boosted'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Aktif Naik
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('ready')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  filterStatus === 'ready'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Idle
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Product List */}
      {products.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs">
          Belum ada produk yang ditambahkan. Tempelkan link produk Shopee di formulir atas.
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs">
          Tidak ada produk yang cocok dengan pencarian atau filter.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filteredProducts.map((product) => {
            const isBoosted = product.status === 'boosted';

            return (
              <div
                key={product.id}
                className="p-3.5 sm:p-4 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                {/* Left: Product Info (No Photos) */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-900 line-clamp-1">
                      {product.name}
                    </h4>
                    {isBoosted ? (
                      <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{formatCountdown(product.remainingSeconds)}</span>
                      </span>
                    ) : (
                      <span className="text-2xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                        Siap Naik
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {product.price && (
                      <>
                        <span className="font-semibold text-orange-600">
                          Rp {product.price.toLocaleString('id-ID')}
                        </span>
                        <span>·</span>
                      </>
                    )}
                    <span>Item ID: <strong className="text-slate-700">{product.itemId}</strong></span>
                    <span>·</span>
                    <span>Shop ID: <strong className="text-slate-700">{product.shopId}</strong></span>
                    <span>·</span>
                    <span>Total Boost: <strong className="text-slate-800">{product.totalBoostsCount || 0}x</strong></span>
                    {product.lastProxyUsed && (
                      <>
                        <span>·</span>
                        <span className="text-2xs text-blue-700 font-mono flex items-center gap-0.5">
                          <Shield className="w-2.5 h-2.5" />
                          {product.lastProxyUsed}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-0.5">
                    <a
                      href={product.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-2xs text-orange-600 hover:text-orange-700 flex items-center gap-0.5"
                    >
                      <span>Lihat di Shopee</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {isBoosted ? (
                    <button
                      type="button"
                      onClick={() => onStopBoost(product.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                      title="Jeda Boost"
                    >
                      Jeda
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onBoostProduct(product.id)}
                      disabled={isProcessing}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                    >
                      <Rocket className="w-3 h-3" />
                      <span>Naikkan</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDeleteProduct(product.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Hapus Produk"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
