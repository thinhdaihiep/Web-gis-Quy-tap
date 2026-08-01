import React, { useState } from 'react';
import { Table, Plus, Trash2, Search, RefreshCw, X, Check, FileSpreadsheet, Sparkles } from 'lucide-react';
import { getCustomAliasMap, saveCustomAliasMap, getAllAliasRules, FieldAliasRule } from '../fieldAlias';

interface FieldAliasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAliasesUpdated?: () => void;
}

export const FieldAliasModal: React.FC<FieldAliasModalProps> = ({
  isOpen,
  onClose,
  onAliasesUpdated,
}) => {
  const [rules, setRules] = useState<FieldAliasRule[]>(() => getAllAliasRules());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [newKey, setNewKey] = useState<string>('');
  const [newAlias, setNewAlias] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newAlias.trim()) return;

    const trimmedKey = newKey.trim();
    const trimmedAlias = newAlias.trim();

    const currentMap = getCustomAliasMap();
    currentMap[trimmedKey] = trimmedAlias;
    saveCustomAliasMap(currentMap);

    setRules(getAllAliasRules());
    setNewKey('');
    setNewAlias('');
    setStatusMessage(`Đã thêm ánh xạ: "${trimmedKey}" ➔ "${trimmedAlias}"`);
    setTimeout(() => setStatusMessage(null), 3000);

    if (onAliasesUpdated) onAliasesUpdated();
  };

  const handleDeleteRule = (keyToDelete: string) => {
    const currentMap = getCustomAliasMap();
    delete currentMap[keyToDelete];
    saveCustomAliasMap(currentMap);

    setRules(getAllAliasRules());
    setStatusMessage(`Đã xóa quy tắc ánh xạ cho trường "${keyToDelete}"`);
    setTimeout(() => setStatusMessage(null), 3000);

    if (onAliasesUpdated) onAliasesUpdated();
  };

  const handleResetDefault = () => {
    if (window.confirm('Bạn có chắc muốn khôi phục danh sách ánh xạ tên trường về mặc định?')) {
      localStorage.removeItem('gis_field_alias_dictionary');
      setRules(getAllAliasRules());
      setStatusMessage('Đã khôi phục danh sách ánh xạ về mặc định.');
      setTimeout(() => setStatusMessage(null), 3000);
      if (onAliasesUpdated) onAliasesUpdated();
    }
  };

  const filteredRules = rules.filter(
    (r) =>
      r.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.alias.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600/30 rounded-lg border border-blue-400/30 text-blue-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-100 uppercase tracking-wide">
                Bảng Ánh Xạ Tên Trường Thuộc Tính (Field Aliases)
              </h3>
              <p className="text-[11px] text-slate-400">
                Chuyển đổi tên trường dữ liệu gốc sang tiếng Việt (Tự động đồng bộ Firestore cho toàn bộ thiết bị & tài khoản)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border-b border-blue-100 p-3 flex items-start space-x-2 text-xs text-blue-900 shrink-0">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <span>
            Hệ thống tự động nhận diện các trường như <b>TimDuoc</b> (Đã quy tập), <b>ChuaThay</b> (Chưa tìm thấy), <b>Xa</b> (Xã phường), <b>Tinh</b> (Tỉnh TP)... Bạn có thể thêm hoặc tùy chỉnh thêm các trường mới cho các lớp dữ liệu khác bên dưới.
          </span>
        </div>

        {/* Status Toast Notification */}
        {statusMessage && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold flex items-center space-x-2 shrink-0 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-200" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {/* Add New Rule Form */}
          <form onSubmit={handleAddRule} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span>Thêm ánh xạ mới</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <input
                type="text"
                placeholder="Tên trường gốc (vd: TimDuoc)"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="sm:col-span-2 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
              <input
                type="text"
                placeholder="Tên hiển thị (vd: Đã quy tập)"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                className="sm:col-span-2 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-slate-800"
              />
              <button
                type="submit"
                disabled={!newKey.trim() || !newAlias.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm</span>
              </button>
            </div>
          </form>

          {/* Search & Reset Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tên trường hoặc alias..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleResetDefault}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1 border border-slate-200 shrink-0"
              title="Khôi phục danh sách về mặc định hệ thống"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Đặt lại mặc định</span>
            </button>
          </div>

          {/* Mapping Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-2.5 w-1/2">Tên trường trong GeoJSON (Key)</th>
                  <th className="p-2.5 w-1/2">Tên hiển thị tiếng Việt (Alias)</th>
                  <th className="p-2.5 w-12 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredRules.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-400 italic">
                      Không tìm thấy quy tắc ánh xạ phù hợp
                    </td>
                  </tr>
                ) : (
                  filteredRules.map((rule) => (
                    <tr key={rule.key} className="hover:bg-blue-50/50 transition">
                      <td className="p-2.5 font-mono text-blue-700 font-bold text-[11px]">
                        {rule.key}
                      </td>
                      <td className="p-2.5 text-slate-900 font-bold">
                        {rule.alias}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          onClick={() => handleDeleteRule(rule.key)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                          title="Xóa quy tắc ánh xạ này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
          >
            Đóng & Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
};
