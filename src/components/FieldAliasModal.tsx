import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Search, X, FileSpreadsheet, Save, Eye } from 'lucide-react';
import { getCustomAliasMap, getHiddenFieldsMap, saveCustomAliasMap, getAllAliasRules, FieldAliasRule } from '../fieldAlias';

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
  const [draftMap, setDraftMap] = useState<Record<string, string>>({});
  const [draftHiddenMap, setDraftHiddenMap] = useState<Record<string, boolean>>({});
  const [rules, setRules] = useState<FieldAliasRule[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [newKey, setNewKey] = useState<string>('');
  const [newAlias, setNewAlias] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const initialMap = getCustomAliasMap();
      const initialHiddenMap = getHiddenFieldsMap();
      setDraftMap(initialMap);
      setDraftHiddenMap(initialHiddenMap);
      setRules(getAllAliasRules(initialMap, initialHiddenMap));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const updateDraft = (newMap: Record<string, string>, newHiddenMap: Record<string, boolean>) => {
    setDraftMap(newMap);
    setDraftHiddenMap(newHiddenMap);
    setRules(getAllAliasRules(newMap, newHiddenMap));
  };

  const handleToggleVisibility = (key: string, currentlyVisible: boolean) => {
    const nextHiddenMap = { ...draftHiddenMap, [key]: currentlyVisible };
    updateDraft(draftMap, nextHiddenMap);
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newAlias.trim()) return;

    const trimmedKey = newKey.trim();
    const trimmedAlias = newAlias.trim();

    const nextMap = { ...draftMap, [trimmedKey]: trimmedAlias };
    const nextHiddenMap = { ...draftHiddenMap, [trimmedKey]: false };
    updateDraft(nextMap, nextHiddenMap);

    setNewKey('');
    setNewAlias('');
  };

  const handleDeleteRule = (keyToDelete: string) => {
    const nextMap = { ...draftMap, [keyToDelete]: '__DELETED__' };
    const nextHiddenMap = { ...draftHiddenMap };
    delete nextHiddenMap[keyToDelete];
    updateDraft(nextMap, nextHiddenMap);
  };

  const handleSave = () => {
    saveCustomAliasMap(draftMap, draftHiddenMap);
    if (onAliasesUpdated) onAliasesUpdated();
    onClose();
  };

  const handleDiscard = () => {
    onClose();
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
                Bảng Thuộc tính các đối tượng
              </h3>
              <p className="text-[11px] text-slate-400">
                Chuyển đổi tên trường dữ liệu gốc sang tiếng Việt &amp; cài đặt ẩn/hiển thị
              </p>
            </div>
          </div>
          <button
            onClick={handleDiscard}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title="Đóng bảng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {/* Add New Rule Form */}
          <form onSubmit={handleAddRule} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span>Thêm tên hiển thị mới</span>
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

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm tên trường hoặc tên hiển thị..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Mapping Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-2.5 w-5/12">Tên trường dữ liệu gốc</th>
                  <th className="p-2.5 w-5/12">Tên hiển thị tiếng Việt</th>
                  <th className="p-2.5 w-12 text-center" title="Hiển thị ở Popup & Bảng thuộc tính">
                    <Eye className="w-3.5 h-3.5 text-slate-600 mx-auto" />
                  </th>
                  <th className="p-2.5 w-10 text-center">
                    <Trash2 className="w-3.5 h-3.5 text-slate-600 mx-auto" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredRules.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400 italic">
                      Không tìm thấy tên trường phù hợp
                    </td>
                  </tr>
                ) : (
                  filteredRules.map((rule, idx) => (
                    <tr key={`rule_row_${idx}_${rule.key}`} className="hover:bg-blue-50/50 transition">
                      <td className="p-2.5 font-mono text-blue-700 font-bold text-xs select-text">
                        {rule.key}
                      </td>
                      <td className="p-2.5 text-slate-900 font-bold text-xs select-text">
                        {rule.alias}
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={rule.visible}
                          onChange={() => handleToggleVisibility(rule.key, rule.visible)}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer accent-blue-600"
                          title={rule.visible ? 'Đang hiển thị ở Popup & Bảng thuộc tính' : 'Đang ẩn ở Popup & Bảng thuộc tính'}
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule.key)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded transition cursor-pointer"
                          title="Xóa tên hiển thị này"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer with explicit Save and Discard buttons */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-500">
            Tổng cộng: <span className="font-bold text-slate-800">{filteredRules.length}</span> quy tắc
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>Hủy</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
