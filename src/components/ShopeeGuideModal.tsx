import React from 'react';
import {
  X,
  HelpCircle,
  Clock,
  TrendingUp,
  Layers,
  CheckCircle2,
  Code2,
} from 'lucide-react';

interface ShopeeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShopeeGuideModal: React.FC<ShopeeGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Panduan Naikkan Produk Shopee
              </h3>
              <p className="text-xs text-slate-500">
                Cara kerja algoritma "Naikkan Produk" & Integrasi ShoAPI
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

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed">
          {/* Section 1 */}
          <div className="p-4 bg-orange-50/60 border border-orange-200 rounded-xl space-y-2">
            <h4 className="text-sm font-bold text-orange-950 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-600" />
              Aturan Utama "Naikkan Produk" di Shopee
            </h4>
            <ul className="space-y-1.5 list-disc pl-4 text-slate-700">
              <li>
                <strong>Multi-Produk Tanpa Batas:</strong> ShoBoost kini mendukung penaikan banyak produk secara bersamaan (tidak dibatasi 5 produk) dengan timer masing-masing produk berjalan serentak.
              </li>
              <li>
                <strong>Interval Fleksibel:</strong> Anda dapat memilih interval dorongan 1 Menit (sangat cepat), 5 Menit, atau 10 Menit sesuai kebutuhan traffic toko.
              </li>
              <li>
                <strong>Gratis & Tanpa Kredensial:</strong> Cukup tempelkan link produk tanpa perlu memasukkan API key atau cookie toko.
              </li>
            </ul>
          </div>

          {/* Section 2 */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Mengapa Perlu Otomatisasi (ShoBoost)?
            </h4>
            <p>
              Dengan <strong>ShoBoost</strong>:
            </p>
            <ul className="space-y-1 list-disc pl-4 text-slate-600">
              <li>Timer 1, 5, atau 10 menit dihitung secara presisi secara real-time.</li>
              <li>Sistem auto-boost otomatis memicu panggilan ShoAPI / Shopee server kembali tepat saat waktu habis (24 jam 7 hari).</li>
              <li>Jika Anda memiliki lebih dari 5 produk, Anda bisa mengaktifkan mode rotasi antrean untuk menggilir produk.</li>
            </ul>
          </div>

          {/* Section 3 */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-600" />
              Tentang Library ShoAPI (mu-hanz/shoapi)
            </h4>
            <p>
              Aplikasi ini mengadopsi standar library <code>mu-hanz/shoapi</code> yang mengimplementasikan Shopee Open API V2 resmi:
            </p>
            <ul className="space-y-1 list-disc pl-4 font-mono text-2xs text-slate-600">
              <li>POST /api/v2/product/boost_item (menaikkan item_id_list)</li>
              <li>GET /api/v2/product/get_boosted_list (cek status slot & cooldown)</li>
              <li>HMAC-SHA256 signature generator untuk keamanan komunikasi server Shopee</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors"
          >
            Mengerti, Kembali ke Aplikasi
          </button>
        </div>
      </div>
    </div>
  );
};
