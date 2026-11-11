import React from 'react';
import {
  Rocket,
  Settings,
  HelpCircle,
  Zap,
  Globe,
  Shield,
  Trash2,
  Clock,
  Layers,
} from 'lucide-react';
import { ShoapiConfig } from '../types/shopee';

interface HeaderProps {
  config: ShoapiConfig;
  onToggleAutoBoost: () => void;
  onBoostAll: () => void;
  onOpenConfig: () => void;
  onOpenGuide: () => void;
  onClearAll: () => void;
  onChangeInterval: (minutes: 1 | 5 | 10) => void;
  totalBoostsCount: number;
  productsCount: number;
  activeBoostedCount: number;
  pingLatencyMs?: number;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  onToggleAutoBoost,
  onBoostAll,
  onOpenConfig,
  onOpenGuide,
  onClearAll,
  onChangeInterval,
  totalBoostsCount,
  productsCount,
  activeBoostedCount,
  pingLatencyMs = 85,
}) => {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-4 gap-4">
          {/* Logo & Live Mode Banner */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-sm shadow-orange-500/20 shrink-0">
              <Rocket className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  ShoBoost
                </h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                  Multi-Produk Tanpa Batas
                </span>
                {/* Live server connection badge */}
                <span className="text-xs px-2 py-0.5 rounded font-medium bg-emerald-100 text-emerald-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <Globe className="w-3 h-3" />
                  <span>Server Shopee ({pingLatencyMs}ms)</span>
                </span>
                {config.proxyEnabled && (
                  <span className="text-xs px-2 py-0.5 rounded font-medium bg-blue-100 text-blue-800 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    <span>Rotasi Proxy ({config.proxyList?.length || 0})</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Bisa Naikkan Banyak Produk Sekaligus Tanpa Batas · Timer Otomatis {config.boostIntervalMinutes} Menit
              </p>
            </div>
          </div>

          {/* Controls & Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Interval Selector: 1 Menit, 5 Menit, 10 Menit */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg text-xs">
              <span className="text-slate-500 px-1.5 flex items-center gap-1 font-medium text-2xs">
                <Clock className="w-3 h-3 text-orange-600" />
                Interval:
              </span>
              <button
                type="button"
                onClick={() => onChangeInterval(1)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  config.boostIntervalMinutes === 1
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Naikkan produk setiap 1 menit"
              >
                1 Menit
              </button>
              <button
                type="button"
                onClick={() => onChangeInterval(5)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  config.boostIntervalMinutes === 5
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Naikkan produk setiap 5 menit"
              >
                5 Menit
              </button>
              <button
                type="button"
                onClick={() => onChangeInterval(10)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  config.boostIntervalMinutes === 10
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Naikkan produk setiap 10 menit"
              >
                10 Menit
              </button>
            </div>

            {/* Active Booster counter indicator (Unlimited) */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-500">Aktif Naik:</span>
              <span className="font-bold text-orange-600">
                {activeBoostedCount} / {productsCount}
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">Total:</span>
              <span className="font-semibold text-slate-800">{totalBoostsCount}x</span>
            </div>

            {/* Auto Boost Toggle */}
            <button
              type="button"
              onClick={onToggleAutoBoost}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                config.autoBoostEnabled
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title={config.autoBoostEnabled ? 'Auto-Boost aktif: otomatis menaikkan semua produk saat timer habis' : 'Klik untuk mengaktifkan auto-boost'}
            >
              <span className={`w-2 h-2 rounded-full ${config.autoBoostEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>{config.autoBoostEnabled ? 'Auto-Boost: ON' : 'Auto-Boost: OFF'}</span>
            </button>

            {/* Boost All Products Button (Any amount!) */}
            {productsCount > 0 && (
              <button
                type="button"
                onClick={onBoostAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-600 text-white hover:bg-orange-700 shadow-sm transition-colors"
                title="Naikkan seluruh produk sekaligus tanpa batas"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Naikkan Semua ({productsCount})</span>
              </button>
            )}

            {/* Clear All Products button if products exist */}
            {productsCount > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-slate-200"
                title="Kosongkan Semua Produk"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Kosongkan</span>
              </button>
            )}

            {/* Shopee Guide */}
            <button
              type="button"
              onClick={onOpenGuide}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Panduan</span>
            </button>

            {/* Proxy & Settings */}
            <button
              type="button"
              onClick={onOpenConfig}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Pengaturan</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
