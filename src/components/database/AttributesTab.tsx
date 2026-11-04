import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Eye, Trash2, Check, Save } from 'lucide-react';
import {
  getCustomAliasMap,
  getHiddenFieldsMap,
  saveCustomAliasMap,
  getAllAliasRules,
  FieldAliasRule,
} from '../../fieldAlias';

export interface AttributesTabProps {
  onAliasesUpdated?: () => void;
}

export const AttributesTab: React.FC<AttributesTabProps> = ({ onAliasesUpdated }) => {
  const [draftMap, setDraftMap] = useState<Record<string, string>>({});
  const [draftHiddenMap, setDraftHiddenMap] = useState<Record<string, boolean>>({});
  const [rules, setRules] = useState<FieldAliasRule[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [newKey, setNewKey] = useState<string>('');
  const [newAlias, setNewAlias] = useState<string>('');
  const [aliasSavedSuccess, setAliasSavedSuccess] = useState<boolean>(false);

  const hasInitializedRef = useRef<boolean>(false);
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const initialMap = getCustomAliasMap();
      const initialHiddenMap = getHiddenFieldsMap();
      setDraftMap(initialMap);
      setDraftHiddenMap(initialHiddenMap);
      setRules(getAllAliasRules(initialMap, initialHiddenMap));
    }
  }, []);

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

  const handleSaveAttributes = () => {
    saveCustomAliasMap(draftMap, draftHiddenMap);
    if (onAliasesUpdated) onAliasesUpdated();
    setAliasSavedSuccess(true);
    setTimeout(() => setAliasSavedSuccess(false), 2500);
  };

  const filteredRules = rules.filter(
    (r) =>
      r.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.alias.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-slate-700 flex-1">
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
          placeholder="Tìm tên trường gốc hoặc tên hiển thị..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Success notification */}
      {aliasSavedSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-lg text-xs flex items-center space-x-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-bold">Đã lưu thành công cấu hình thuộc tính!</span>
        </div>
      )}

      {/* Mapping Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
              <th className="p-2.5 w-5/12">Tên trường</th>
              <th className="p-2.5 w-5/12">Tên hiển thị</th>
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

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSaveAttributes}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>Lưu cấu hình</span>
        </button>
      </div>
    </div>
  );
};
