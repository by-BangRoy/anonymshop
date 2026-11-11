import React, { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  Clipboard,
  Rocket,
  CheckCircle2,
  AlertCircle,
  Plus,
  Layers,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { parseShopeeUrl, parseMultipleShopeeUrls } from '../utils/shopeeParser';
import { ParsedLinkResult } from '../types/shopee';

interface LinkPasterProps {
  onAddAndBoost: (item: {
    rawUrl: string;
    itemId: number;
    shopId: number;
    name: string;
  }) => Promise<void>;
  onAddProducts: (
    items: Array<{
      rawUrl: string;
      itemId: number;
      shopId: number;
      name: string;
    }>,
    autoBoost: boolean
  ) => Promise<void>;
  isProcessing: boolean;
}

export const LinkPaster: React.FC<LinkPasterProps> = ({
  onAddAndBoost,
  onAddProducts,
  isProcessing,
}) => {
  const [pasteMode, setPasteMode] = useState<'single' | 'batch'>('single');
  const [inputValue, setInputValue] = useState('');
  const [batchValue, setBatchValue] = useState('');
  const [parsedSingle, setParsedSingle] = useState<ParsedLinkResult | null>(null);
  const [batchResults, setBatchResults] = useState<ParsedLinkResult[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live parse single input
  useEffect(() => {
    if (!inputValue.trim()) {
      setParsedSingle(null);
      return;
    }
    const res = parseShopeeUrl(inputValue.trim());
    setParsedSingle(res);
  }, [inputValue]);

  // Live parse batch input
  useEffect(() => {
    if (!batchValue.trim()) {
      setBatchResults([]);
      return;
    }
    const results = parseMultipleShopeeUrls(batchValue);
    setBatchResults(results);
  }, [batchValue]);

  // Paste from clipboard
  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          if (pasteMode === 'single') {
            setInputValue(text.trim());
          } else {
            setBatchValue(text.trim());
          }
        }
      }
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Izin clipboard dibatasi browser. Silakan tekan Ctrl+V / Cmd+V pada kolom input.',
      });
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Submit single product with immediate boost
  const handleBoostImmediately = async () => {
    if (!parsedSingle || !parsedSingle.valid || !parsedSingle.itemId || !parsedSingle.shopId) {
      setStatusMessage({ type: 'error', text: 'Masukkan link produk Shopee yang valid terlebih dahulu' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    try {
      await onAddAndBoost({
        rawUrl: parsedSingle.originalUrl,
        itemId: parsedSingle.itemId,
        shopId: parsedSingle.shopId,
        name: parsedSingle.name || `Produk Shopee #${parsedSingle.itemId}`,
      });
      setInputValue('');
      setParsedSingle(null);
      setStatusMessage({
        type: 'success',
        text: 'Link produk berhasil didaftarkan dan langsung dinaikkan ke server Shopee!',
      });
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Gagal menaikkan produk ke Shopee' });
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Submit single product to list only
  const handleAddToListOnly = async () => {
    if (!parsedSingle || !parsedSingle.valid || !parsedSingle.itemId || !parsedSingle.shopId) {
      return;
    }

    try {
      await onAddProducts(
        [
          {
            rawUrl: parsedSingle.originalUrl,
            itemId: parsedSingle.itemId,
            shopId: parsedSingle.shopId,
            name: parsedSingle.name || `Produk #${parsedSingle.itemId}`,
          },
        ],
        false
      );
      setInputValue('');
      setParsedSingle(null);
      setStatusMessage({ type: 'success', text: 'Produk berhasil ditambahkan ke daftar booster.' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Gagal menyimpan produk' });
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Submit batch links and boost all of them
  const handleBatchSubmit = async (autoBoostAll: boolean) => {
    const validItems = batchResults
      .filter((r) => r.valid && r.itemId && r.shopId)
      .map((r) => ({
        rawUrl: r.originalUrl,
        itemId: r.itemId!,
        shopId: r.shopId!,
        name: r.name || `Produk Shopee #${r.itemId}`,
      }));

    if (validItems.length === 0) {
      setStatusMessage({ type: 'error', text: 'Tidak ada link produk valid yang terdeteksi.' });
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    try {
      await onAddProducts(validItems, autoBoostAll);
      const count = validItems.length;
      setBatchValue('');
      setBatchResults([]);
      setStatusMessage({
        type: 'success',
        text: autoBoostAll
          ? `Berhasil mendaftarkan dan langsung menaikkan ${count} produk sekaligus ke server Shopee!`
          : `Berhasil menambahkan ${count} produk ke dalam daftar booster!`,
      });
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Gagal menambahkan kumpulan link' });
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Top Banner & Mode Toggle */}
      <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-orange-50/70 to-amber-50/40">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-600 text-white">
                <Rocket className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Tempel Link Produk Shopee (Bisa Banyak Produk)
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Bisa menaikkan banyak produk sekaligus tanpa dibatasi hanya 5 produk. Tempel link tunggal atau kumpulan banyak link sekaligus.
            </p>
          </div>

          {/* Single vs Batch Tabs */}
          <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg shadow-2xs self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setPasteMode('single')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                pasteMode === 'single'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Link Tunggal</span>
            </button>
            <button
              type="button"
              onClick={() => setPasteMode('batch')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                pasteMode === 'batch'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Batch (Banyak Link Sekaligus)</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Status Notification Toast */}
        {statusMessage && (
          <div
            className={`flex items-start gap-2.5 p-3 rounded-lg text-xs font-medium border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {pasteMode === 'single' ? (
          /* Single Link Mode */
          <div className="space-y-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <LinkIcon className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Tempel link produk Shopee, contoh: https://shopee.co.id/Nama-Produk-i.104928172.2391029381"
                className="w-full pl-10 pr-24 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-shadow"
              />
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="absolute inset-y-1.5 right-1.5 px-3 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200 rounded-md flex items-center gap-1.5 transition-colors shadow-2xs"
                title="Paste dari Clipboard"
              >
                <Clipboard className="w-3.5 h-3.5 text-slate-500" />
                <span>Paste</span>
              </button>
            </div>

            {/* Live Detected Preview Card */}
            {parsedSingle && (
              <div
                className={`p-3.5 rounded-lg border transition-all ${
                  parsedSingle.valid
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-red-50/50 border-red-200'
                }`}
              >
                {parsedSingle.valid ? (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" />
                          Link Shopee Valid
                        </span>
                        <span className="text-xs text-slate-500">
                          Domain: {parsedSingle.domain}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900 line-clamp-1">
                        {parsedSingle.name}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-slate-600">
                        <span>
                          Item ID: <strong className="text-slate-800">{parsedSingle.itemId}</strong>
                        </span>
                        <span>·</span>
                        <span>
                          Shop ID: <strong className="text-slate-800">{parsedSingle.shopId}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons (No slot limits!) */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleAddToListOnly}
                        disabled={isProcessing}
                        className="px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Simpan Saja</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleBoostImmediately}
                        disabled={isProcessing}
                        className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Rocket className="w-3.5 h-3.5" />
                        <span>Tempel & Naikkan Sekarang</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{parsedSingle.error}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Batch Mode: Unlimited Multi-Product Paste */
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Tempel Banyak Link Shopee Sekaligus (Bebas Berapa Pun, Satu per Baris):
                </label>
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
                >
                  <Clipboard className="w-3 h-3" />
                  <span>Paste dari Clipboard</span>
                </button>
              </div>
              <textarea
                rows={5}
                value={batchValue}
                onChange={(e) => setBatchValue(e.target.value)}
                placeholder="https://shopee.co.id/...-i.12345.67890&#10;https://shopee.co.id/...-i.12345.67891&#10;https://shopee.co.id/...-i.12345.67892&#10;https://shopee.co.id/...-i.12345.67893&#10;https://shopee.co.id/...-i.12345.67894&#10;https://shopee.co.id/...-i.12345.67895&#10;https://shopee.co.id/...-i.12345.67896"
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            {/* Batch summary & action */}
            {batchResults.length > 0 && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-xs text-slate-700 space-y-0.5">
                  <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Terdeteksi: {batchResults.filter((r) => r.valid).length} link produk Shopee valid.
                  </p>
                  <p className="text-slate-500">
                    Semua produk ini bisa langsung dinaikkan bersamaan ke server Shopee tanpa batasan slot.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleBatchSubmit(false)}
                    disabled={isProcessing || batchResults.filter((r) => r.valid).length === 0}
                    className="px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors"
                  >
                    Simpan Saja
                  </button>

                  <button
                    type="button"
                    onClick={() => handleBatchSubmit(true)}
                    disabled={isProcessing || batchResults.filter((r) => r.valid).length === 0}
                    className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Naikkan Semua Sekaligus</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
