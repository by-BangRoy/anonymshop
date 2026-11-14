import React, { useState, useEffect } from 'react';
import {
  X,
  Globe,
  Sliders,
  CheckCircle2,
  Shield,
  AlertTriangle,
  RotateCw,
  Clock,
  Radio,
} from 'lucide-react';
import { ShoapiConfig } from '../types/shopee';

interface ShoapiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ShoapiConfig;
  onSaveConfig: (updated: Partial<ShoapiConfig>) => Promise<void>;
  pingLatencyMs?: number;
}

export const ShoapiConfigModal: React.FC<ShoapiConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  pingLatencyMs = 85,
}) => {
  const [activeTab, setActiveTab] = useState<'interval' | 'rotating_proxy' | 'automation'>('interval');
  const [formData, setFormData] = useState<ShoapiConfig>({ ...config });
  const [proxyInput, setProxyInput] = useState<string>((config.proxyList || []).join('\n'));
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Proxy test state
  const [proxyTestInput, setProxyTestInput] = useState('');
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<{
    success: boolean;
    message?: string;
    originIp?: string;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  // Auto proxy pool state
  const [isRefreshingPool, setIsRefreshingPool] = useState(false);
  const [autoPoolCount, setAutoPoolCount] = useState<number>(config.autoProxyPoolCount || 25);

  // Shopee server live ping state
  const [isPingingShopee, setIsPingingShopee] = useState(false);
  const [currentLatency, setCurrentLatency] = useState<number>(pingLatencyMs);
  const [serverConnected, setServerConnected] = useState<boolean>(true);
  const [serverHttpStatus, setServerHttpStatus] = useState<number>(200);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...config });
      setProxyInput((config.proxyList || []).join('\n'));
      setAutoPoolCount(config.autoProxyPoolCount || 25);
      setCurrentLatency(pingLatencyMs);
    }
  }, [isOpen, config, pingLatencyMs]);

  const handleRefreshAutoPool = async () => {
    setIsRefreshingPool(true);
    try {
      const res = await fetch('/api/shopee/proxy/auto-refresh', { method: 'POST' });
      const data = await res.json();
      if (data.autoProxyPoolCount) {
        setAutoPoolCount(data.autoProxyPoolCount);
        setFormData((prev) => ({ ...prev, autoProxyPoolCount: data.autoProxyPoolCount }));
      }
    } catch (err) {
      console.warn('Gagal memuat proxy pool:', err);
    } finally {
      setIsRefreshingPool(false);
    }
  };

  if (!isOpen) return null;

  const handleSave = async () => {
    const parsedProxies = proxyInput
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);

    const updatedData: Partial<ShoapiConfig> = {
      ...formData,
      proxyList: parsedProxies,
    };

    await onSaveConfig(updatedData);
    setSaveMessage('Pengaturan interval & proxy berhasil disimpan!');
    setTimeout(() => {
      setSaveMessage(null);
      onClose();
    }, 1200);
  };

  const handleTestProxy = async () => {
    setIsTestingProxy(true);
    setProxyTestResult(null);
    try {
      const res = await fetch('/api/shopee/proxy/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proxy: proxyTestInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      setProxyTestResult(data);
    } catch (err: any) {
      setProxyTestResult({
        success: false,
        error: err?.message || 'Gagal terhubung ke proxy',
      });
    } finally {
      setIsTestingProxy(false);
    }
  };

  const handlePingShopee = async () => {
    setIsPingingShopee(true);
    try {
      const res = await fetch('/api/shopee/ping');
      const data = await res.json();
      if (typeof data.latencyMs === 'number') {
        setCurrentLatency(data.latencyMs);
      }
      if (typeof data.connected === 'boolean') {
        setServerConnected(data.connected);
      }
      if (typeof data.httpStatus === 'number') {
        setServerHttpStatus(data.httpStatus);
      }
    } catch {
      setServerConnected(false);
    } finally {
      setIsPingingShopee(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Pengaturan Interval & Server Shopee
              </h3>
              <p className="text-xs text-slate-500">
                Terhubung langsung tanpa perlu kredensial Shopee
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 gap-6 bg-white text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('interval')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'interval'
                ? 'border-orange-600 text-orange-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Interval Booster ({formData.boostIntervalMinutes}m)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rotating_proxy')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'rotating_proxy'
                ? 'border-orange-600 text-orange-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>
              Rotasi Proxy ({formData.proxyMode === 'custom' ? `${proxyInput.split('\n').filter((s) => s.trim()).length} Kustom` : formData.proxyMode === 'direct' ? 'Direct' : `${autoPoolCount} Auto`})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('automation')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'automation'
                ? 'border-orange-600 text-orange-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Otomatisasi</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {saveMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{saveMessage}</span>
            </div>
          )}

          {/* TAB 1: Interval Selection & Live Server Status */}
          {activeTab === 'interval' && (
            <div className="space-y-4 text-xs">
              {/* Server Live Heartbeat Card */}
              <div
                className={`p-3.5 border rounded-xl flex items-center justify-between ${
                  serverConnected
                    ? 'bg-emerald-50/80 border-emerald-200'
                    : 'bg-amber-50/80 border-amber-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      serverConnected ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'
                    }`}
                  />
                  <div>
                    <h4
                      className={`font-bold flex items-center gap-1.5 ${
                        serverConnected ? 'text-emerald-950' : 'text-amber-950'
                      }`}
                    >
                      <Globe
                        className={`w-4 h-4 ${
                          serverConnected ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      />
                      {serverConnected
                        ? `Status Server: Terhubung ke www.shopee.co.id (HTTP ${serverHttpStatus})`
                        : 'Status Server: Menghubungkan ke www.shopee.co.id...'}
                    </h4>
                    <p
                      className={`text-2xs mt-0.5 ${
                        serverConnected ? 'text-emerald-800' : 'text-amber-800'
                      }`}
                    >
                      Sistem aktif mengirim keep-alive ping secara otomatis tanpa perlu login atau kredensial.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-2xs font-semibold px-2 py-1 rounded bg-white border border-emerald-200 text-emerald-800">
                    {currentLatency}ms
                  </span>
                  <button
                    type="button"
                    onClick={handlePingShopee}
                    disabled={isPingingShopee}
                    className="p-1 text-emerald-700 hover:bg-emerald-100 rounded"
                    title="Tes Ping Ulang"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isPingingShopee ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Interval Selection (1 Menit, 5 Menit, 10 Menit) */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-800">
                  Pilih Interval Naikkan Produk Otomatis:
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { val: 1, label: '1 Menit', desc: 'Sangat cepat (60 detik)' },
                    { val: 5, label: '5 Menit', desc: 'Cepat & stabil (300 detik)' },
                    { val: 10, label: '10 Menit', desc: 'Rekomendasi (600 detik)' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setFormData({ ...formData, boostIntervalMinutes: opt.val as 1 | 5 | 10 })}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        formData.boostIntervalMinutes === opt.val
                          ? 'bg-orange-50/80 border-orange-500 ring-1 ring-orange-500'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs">{opt.label}</span>
                        {formData.boostIntervalMinutes === opt.val && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" />
                        )}
                      </div>
                      <div className="text-2xs text-slate-500 mt-1">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-semibold text-slate-800">Tanpa Perlu Kredensial Toko:</div>
                <p className="text-slate-600 leading-relaxed text-2xs">
                  Aplikasi beroperasi langsung melalui komunikasi HTTP publik dengan server Shopee. Anda tidak perlu memasukkan API key, access token, ataupun cookie toko. Cukup tempelkan link produk dan pilih interval yang diinginkan.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: Rotating Proxy */}
          {activeTab === 'rotating_proxy' && (
            <div className="space-y-4 text-xs">
              {/* Proxy Mode Selector: Auto vs Direct vs Custom */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-800">
                  Mode Rotasi Proxy:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, proxyEnabled: true, proxyMode: 'auto' })}
                    className={`p-3 rounded-xl border text-left transition-all relative ${
                      formData.proxyEnabled && (formData.proxyMode === 'auto' || !formData.proxyMode)
                        ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-500'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">Otomatis (Bawaan)</span>
                      {formData.proxyEnabled && (formData.proxyMode === 'auto' || !formData.proxyMode) && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      )}
                    </div>
                    <div className="text-2xs text-slate-500 mt-1">
                      Tanpa isi manual, auto pool ratusan proxy
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, proxyEnabled: false, proxyMode: 'direct' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      !formData.proxyEnabled || formData.proxyMode === 'direct'
                        ? 'bg-emerald-50/90 border-emerald-500 ring-1 ring-emerald-500'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">Direct Server</span>
                      {(!formData.proxyEnabled || formData.proxyMode === 'direct') && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </div>
                    <div className="text-2xs text-slate-500 mt-1">
                      Langsung ke www.shopee.co.id tanpa proxy
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, proxyEnabled: true, proxyMode: 'custom' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      formData.proxyEnabled && formData.proxyMode === 'custom'
                        ? 'bg-orange-50/90 border-orange-500 ring-1 ring-orange-500'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">Kustom Manual</span>
                      {formData.proxyEnabled && formData.proxyMode === 'custom' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" />
                      )}
                    </div>
                    <div className="text-2xs text-slate-500 mt-1">
                      Ketik daftar proxy pribadi sendiri
                    </div>
                  </button>
                </div>
              </div>

              {/* AUTO PROXY ACTIVE CARD */}
              {formData.proxyEnabled && (formData.proxyMode === 'auto' || !formData.proxyMode) && (
                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50/60 border border-blue-200 rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        <h4 className="font-bold text-blue-950 text-xs flex items-center gap-1.5">
                          <Shield className="w-4 h-4 text-blue-600" />
                          Rotasi Proxy Otomatis Aktif
                        </h4>
                        <span className="text-2xs font-extrabold px-2 py-0.5 rounded-full bg-blue-200/70 text-blue-800">
                          {autoPoolCount} Proxy Tersedia
                        </span>
                      </div>
                      <p className="text-2xs text-blue-900 leading-relaxed">
                        Sistem otomatis mengunduh dan merotasi ratusan proxy publik aktif setiap request tanpa Anda perlu mengisi manual.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleRefreshAutoPool}
                      disabled={isRefreshingPool}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs shrink-0"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isRefreshingPool ? 'animate-spin' : ''}`} />
                      <span>{isRefreshingPool ? 'Memperbarui...' : 'Perbarui Pool'}</span>
                    </button>
                  </div>

                  <div className="p-2.5 bg-white/80 rounded-lg border border-blue-100 flex items-center justify-between text-2xs text-blue-800">
                    <span>
                      Proxy Sedang Aktif: <strong className="font-mono text-blue-950">{formData.activeProxy || 'Rotasi Otomatis Round-Robin'}</strong>
                    </span>
                    <span className="text-emerald-700 font-medium">Smart Auto-Failover Aktif</span>
                  </div>
                </div>
              )}

              {/* CUSTOM PROXY INPUT (ONLY SHOWN IN CUSTOM MODE) */}
              {formData.proxyEnabled && formData.proxyMode === 'custom' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-800">
                    Daftar Alamat Proxy Kustom (Satu proxy per baris):
                  </label>
                  <textarea
                    rows={4}
                    value={proxyInput}
                    onChange={(e) => setProxyInput(e.target.value)}
                    placeholder={`http://user:pass@proxy1.example.com:8080\nhttp://123.45.67.89:3128`}
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  <p className="text-2xs text-slate-500">
                    Format: <code>http://host:port</code> atau <code>http://user:pass@host:port</code>.
                  </p>
                </div>
              )}

              {/* DIRECT SERVER NOTE */}
              {(!formData.proxyEnabled || formData.proxyMode === 'direct') && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                  <h5 className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-emerald-600" />
                    Koneksi Langsung ke www.shopee.co.id
                  </h5>
                  <p className="text-2xs text-emerald-800 leading-relaxed">
                    Setiap aksi booster produk akan langsung terhubung ke gateway Shopee tanpa perantara IP lain. Lebih cepat dan latensi minimal.
                  </p>
                </div>
              )}

              {/* Test Proxy connection box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <h5 className="font-semibold text-slate-800">
                    Uji Koneksi Proxy:
                  </h5>
                  <button
                    type="button"
                    onClick={handleTestProxy}
                    disabled={isTestingProxy}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
                  >
                    <RotateCw className={`w-3 h-3 ${isTestingProxy ? 'animate-spin' : ''}`} />
                    <span>{isTestingProxy ? 'Menguji...' : 'Tes Proxy Sekarang'}</span>
                  </button>
                </div>

                <input
                  type="text"
                  value={proxyTestInput}
                  onChange={(e) => setProxyTestInput(e.target.value)}
                  placeholder="Masukkan proxy spesifik untuk dites (atau kosongkan untuk tes proxy otomatis saat ini)"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-mono placeholder:text-slate-400"
                />

                {proxyTestResult && (
                  <div
                    className={`p-2.5 rounded-lg border text-2xs ${
                      proxyTestResult.success
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    {proxyTestResult.success ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          <strong>{proxyTestResult.message}</strong> Alamat IP: <code>{proxyTestResult.originIp}</code> (Latensi: {proxyTestResult.latencyMs}ms)
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        <span>{proxyTestResult.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Automation */}
          {activeTab === 'automation' && (
            <div className="space-y-4 text-xs">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <h5 className="font-semibold text-slate-900">
                      Auto-Boost Otomatis Aktif
                    </h5>
                    <p className="text-slate-500 text-2xs">
                      Secara otomatis memicu booster setiap kali timer {formData.boostIntervalMinutes} menit habis tanpa perlu klik manual.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.autoBoostEnabled}
                    onChange={(e) =>
                      setFormData({ ...formData, autoBoostEnabled: e.target.checked })
                    }
                    className="w-4 h-4 accent-orange-600 cursor-pointer"
                  />
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <h5 className="font-semibold text-slate-900">
                    Sistem Multi-Produk Booster (Tanpa Batas):
                  </h5>
                  <p className="text-slate-600 text-2xs leading-relaxed">
                    Tidak ada pembatasan 5 slot. Seluruh produk yang Anda tempelkan akan berjalan secara serentak dengan timer {formData.boostIntervalMinutes} menit masing-masing dan otomatis dinaikkan kembali ke server Shopee secara mandiri.
                  </p>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <h5 className="font-semibold text-slate-900">
                      Suara Notifikasi Nada Sukses
                    </h5>
                    <p className="text-slate-500 text-2xs">
                      Mainkan nada lembut saat produk berhasil dinaikkan ke server Shopee.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.notificationSound}
                    onChange={(e) =>
                      setFormData({ ...formData, notificationSound: e.target.checked })
                    }
                    className="w-4 h-4 accent-orange-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors"
          >
            Simpan Pengaturan
          </button>
        </div>
      </div>
    </div>
  );
};
