import React, { useState, useEffect, useRef } from 'react';
import {
  UserCircle,
  Plus,
  Trash2,
  RefreshCw,
  KeyRound,
  Check,
  CheckCircle2,
  AlertCircle,
  Shield,
  UserCheck,
  X,
} from 'lucide-react';
import { AppUser, UserRole } from '../types';

interface ManagedUser extends AppUser {
  createdAt?: string;
}

const CACHE_KEY = 'gis_cached_users';

// Token for administrative user endpoints (POST, PATCH, DELETE /api/users)
// Dynamically reads the active admin session token from login, or falls back to env token
const getAdminHeaders = (): Record<string, string> => {
  let sessionToken = '';
  try {
    const rawSession = localStorage.getItem('gis_user_session');
    if (rawSession) {
      const parsed = JSON.parse(rawSession);
      if (parsed && parsed.token) {
        sessionToken = parsed.token;
      }
    }
  } catch (_) {}

  const adminToken =
    sessionToken ||
    (import.meta as any).env?.VITE_ADMIN_API_TOKEN ||
    'gis_admin_secret_token_default';

  return {
    'Content-Type': 'application/json',
    'x-admin-token': adminToken,
  };
};

export const UserManagementTab: React.FC = () => {
  // Load cached users initially for instant render
  const [users, setUsers] = useState<ManagedUser[]>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (_) {}
    return [
      {
        uid: 'user_admin',
        username: 'admin',
        displayName: 'Bản đồ qk5',
        role: 'admin',
      },
    ];
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Add User Form State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('editor');

  // Password reset inline state
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const feedbackTimerRef = useRef<any>(null);

  const showFeedbackMessage = (type: 'success' | 'error', message: string) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedback({ type, message });
    feedbackTimerRef.current = setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  // Helper to deduplicate and format user list
  const processRawUsers = (rawList: any[]): ManagedUser[] => {
    const map = new Map<string, ManagedUser>();

    rawList.forEach((item) => {
      const uname = String(item.username || item.email || '').trim();
      const unameLower = uname.toLowerCase();
      if (!unameLower) return;

      if (!map.has(unameLower)) {
        map.set(unameLower, {
          uid: item.uid || item.id || `user_${unameLower}`,
          username: uname,
          email: item.email || '',
          displayName:
            unameLower === 'admin' && (item.displayName === 'Quản trị viên' || !item.displayName)
              ? 'Bản đồ qk5'
              : item.displayName || uname,
          photoURL: item.photoURL || '',
          role: (item.role as UserRole) || 'editor',
          createdAt: item.createdAt || '',
        });
      }
    });

    // Ensure default system admin account exists
    if (!map.has('admin')) {
      map.set('admin', {
        uid: 'user_admin',
        username: 'admin',
        displayName: 'Bản đồ qk5',
        role: 'admin',
      });
    }

    const result = Array.from(map.values());
    // Keep admin at top, then sort by name
    result.sort((a, b) => {
      if (a.username.toLowerCase() === 'admin') return -1;
      if (b.username.toLowerCase() === 'admin') return 1;
      return (a.displayName || a.username).localeCompare(b.displayName || b.username);
    });

    return result;
  };

  // Fetch users from server API as a reliable fallback/cross-sync
  const fetchUsersFromServer = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.users)) {
          const processed = processRawUsers(data.users);
          setUsers(processed);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(processed));
          } catch (_) {}
        }
      }
    } catch (apiErr) {
      console.warn('Cannot fetch from /api/users, fallback to Firestore listener:', apiErr);
    }
  };

  // Load users from server API on mount
  useEffect(() => {
    setLoading(true);
    fetchUsersFromServer().finally(() => setLoading(false));

    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    // Optimistic local update
    setUsers((prev) => {
      const updated = prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u));
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    try {
      const res = await fetch(`/api/users/${uid}/role`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        throw new Error('Server returned error');
      }
      showFeedbackMessage('success', 'Đã cập nhật quyền thành công');
    } catch (err) {
      console.error('Lỗi cập nhật vai trò:', err);
      showFeedbackMessage('error', 'Không thể cập nhật quyền người dùng');
      fetchUsersFromServer();
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = newUsername.trim().toLowerCase();
    const cleanPass = newPassword.trim();
    const cleanName = newDisplayName.trim() || newUsername.trim();

    if (!cleanUser || !cleanPass) {
      showFeedbackMessage('error', 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu');
      return;
    }

    // Check if username already exists
    if (users.some((u) => u.username.toLowerCase() === cleanUser)) {
      showFeedbackMessage('error', `Tên đăng nhập "${newUsername.trim()}" đã tồn tại trên hệ thống`);
      return;
    }

    setIsSubmitting(true);
    const newUserDoc = {
      username: cleanUser,
      password: cleanPass,
      displayName: cleanName,
      role: newRole,
    };

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(newUserDoc),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Server error when creating user');
      }

      showFeedbackMessage('success', `Đã thêm tài khoản "${cleanName}" thành công`);
      await fetchUsersFromServer();
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('editor');
    } catch (err: any) {
      console.error('Lỗi thêm người dùng:', err);
      showFeedbackMessage('error', err.message || 'Không thể thêm người dùng mới, vui lòng thử lại');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (uid === 'admin_static' || uid === 'user_admin') {
      showFeedbackMessage('error', 'Không thể xóa tài khoản Quản trị viên hệ thống');
      setDeletingUserId(null);
      return;
    }

    // Optimistic remove
    setUsers((prev) => {
      const updated = prev.filter((u) => u.uid !== uid);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    try {
      const res = await fetch(`/api/users/${uid}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        throw new Error('Server failed to delete user');
      }
      showFeedbackMessage('success', 'Đã xóa tài khoản thành công');
    } catch (err) {
      console.error('Lỗi xóa người dùng:', err);
      showFeedbackMessage('error', 'Không thể xóa người dùng trên máy chủ');
      fetchUsersFromServer();
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleStartResetPassword = (uid: string) => {
    setResettingUserId(uid);
    setNewResetPassword('');
  };

  const handleCancelResetPassword = () => {
    setResettingUserId(null);
    setNewResetPassword('');
  };

  const handleConfirmResetPassword = async (uid: string) => {
    const cleanPass = newResetPassword.trim();
    if (!cleanPass) {
      showFeedbackMessage('error', 'Vui lòng nhập mật khẩu mới');
      return;
    }

    setIsResetting(true);
    try {
      const res = await fetch(`/api/users/${uid}/password`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ password: cleanPass }),
      });

      if (!res.ok) {
        throw new Error('Server password update failed');
      }

      showFeedbackMessage('success', 'Đã đặt lại mật khẩu mới thành công');
      setResettingUserId(null);
      setNewResetPassword('');
    } catch (err: any) {
      console.error('Lỗi đặt lại mật khẩu:', err);
      showFeedbackMessage('error', 'Không thể cập nhật mật khẩu, vui lòng thử lại');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Header Banner */}
      <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-200 flex items-center justify-center text-blue-600">
            <UserCircle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Quản lý tài khoản & phân quyền
            </h3>
            <p className="text-[11px] text-slate-500">
              Thiết lập danh sách người dùng, vai trò truy cập và mật khẩu
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg shadow-2xs font-semibold">
            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Tổng số: <strong>{users.length}</strong></span>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchUsersFromServer().finally(() => setLoading(false));
            }}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 border border-slate-200 bg-white rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert Banner */}
      {feedback && (
        <div
          className={`px-3.5 py-2 rounded-xl border flex items-center gap-2.5 text-xs font-semibold animate-in fade-in duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span className="flex-1">{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Add User Form */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl shadow-2xs">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-blue-600" />
          <span>Thêm người dùng mới</span>
        </h4>
        <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Tên đăng nhập <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="ví dụ: qk5_user"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Mật khẩu <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Nhập mật khẩu"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Tên hiển thị
            </label>
            <input
              type="text"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="ví dụ: Cán bộ QK5"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Vai trò
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
            >
              <option value="editor">Biên tập viên (Editor)</option>
              <option value="admin">Quản trị viên (Admin)</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5 disabled:bg-blue-400"
            >
              {isSubmitting ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>Thêm tài khoản</span>
            </button>
          </div>
        </form>
      </div>

      {/* User List: Responsive Table for Desktop & 2-Row Card List for Mobile */}
      {loading && users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
          <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs">Đang tải danh sách người dùng...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-xs">
          Chưa có dữ liệu người dùng.
        </div>
      ) : (
        <>
          {/* MOBILE VIEW (< sm): 2-Row Card Structure */}
          <div className="block sm:hidden space-y-2.5">
            {users.map((u) => {
              const isSystemAdmin = u.username.toLowerCase() === 'admin';
              const isResettingThis = resettingUserId === u.uid;

              return (
                <div
                  key={u.uid}
                  className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2.5"
                >
                  {/* HÀNG 1: Thông tin người dùng & Tên đăng nhập */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase shrink-0 ${
                          isSystemAdmin
                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                            : u.role === 'admin'
                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {u.displayName ? u.displayName.charAt(0) : u.username.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-xs truncate flex items-center gap-1.5">
                          <span className="truncate">{u.displayName || u.username}</span>
                          {isSystemAdmin && (
                            <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 text-[10px] font-black rounded shrink-0">
                              Hệ thống
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">
                          @{u.username}
                        </div>
                      </div>
                    </div>

                    {u.createdAt && (
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    )}
                  </div>

                  {/* HÀNG 2: Dropdown Phân quyền (bên trái) & Thao tác (bên phải) */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    {/* Phân quyền */}
                    <div className="shrink-0">
                      {isSystemAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px]">
                          <Shield className="w-3 h-3 text-rose-600" />
                          <span>Quản trị viên</span>
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg border focus:outline-none cursor-pointer ${
                            u.role === 'admin'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          <option value="editor">Biên tập viên</option>
                          <option value="admin">Quản trị viên</option>
                        </select>
                      )}
                    </div>

                    {/* Thao tác */}
                    <div className="flex items-center gap-1.5 justify-end">
                      {isResettingThis ? (
                        <div className="flex items-center gap-1 animate-in fade-in">
                          <input
                            type="text"
                            value={newResetPassword}
                            onChange={(e) => setNewResetPassword(e.target.value)}
                            placeholder="Mật khẩu mới"
                            className="w-24 px-2 py-1 bg-white border border-blue-400 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleConfirmResetPassword(u.uid);
                              if (e.key === 'Escape') handleCancelResetPassword();
                            }}
                          />
                          <button
                            type="button"
                            disabled={isResetting}
                            onClick={() => handleConfirmResetPassword(u.uid)}
                            className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition cursor-pointer"
                            title="Lưu"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelResetPassword}
                            className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition cursor-pointer"
                            title="Hủy"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartResetPassword(u.uid)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded-lg transition cursor-pointer"
                          title="Đặt lại mật khẩu"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {!isSystemAdmin && (
                        deletingUserId === u.uid ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.uid)}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                            >
                              Có
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingUserId(null)}
                              className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium rounded-lg cursor-pointer"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeletingUserId(u.uid)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg transition cursor-pointer"
                            title="Xóa tài khoản"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP VIEW (>= sm): Compact 4-Column Table */}
          <div className="hidden sm:block border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-800 text-slate-200 text-[11px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-4 py-3">Người dùng</th>
                  <th className="px-4 py-3">Tài khoản</th>
                  <th className="px-4 py-3">Vai trò</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {users.map((u) => {
                  const isSystemAdmin = u.username.toLowerCase() === 'admin';
                  const isResettingThis = resettingUserId === u.uid;

                  return (
                    <tr key={u.uid} className="hover:bg-slate-50/80 transition">
                      {/* Cột 1: Người dùng */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase shrink-0 ${
                              isSystemAdmin
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : u.role === 'admin'
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {u.displayName ? u.displayName.charAt(0) : u.username.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{u.displayName || u.username}</span>
                              {isSystemAdmin && (
                                <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded">
                                  Hệ thống
                                </span>
                              )}
                            </div>
                            {u.createdAt && (
                              <div className="text-[10px] text-slate-400">
                                Tạo: {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Cột 2: Tài khoản (Username) */}
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded">
                          {u.username}
                        </span>
                      </td>

                      {/* Cột 3: Vai trò */}
                      <td className="px-4 py-3">
                        {isSystemAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs">
                            <Shield className="w-3 h-3 text-rose-600" />
                            <span>Quản trị viên</span>
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
                            className={`text-xs font-bold px-2.5 py-1 rounded-lg border focus:outline-none cursor-pointer ${
                              u.role === 'admin'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            <option value="editor">Biên tập viên</option>
                            <option value="admin">Quản trị viên</option>
                          </select>
                        )}
                      </td>

                      {/* Cột 4: Thao tác (KeyRound + Trash2) */}
                      <td className="px-4 py-3 text-right">
                        {isResettingThis ? (
                          <div className="flex items-center justify-end gap-1.5 animate-in fade-in">
                            <input
                              type="text"
                              value={newResetPassword}
                              onChange={(e) => setNewResetPassword(e.target.value)}
                              placeholder="Mật khẩu mới"
                              className="w-28 px-2 py-1 bg-white border border-blue-400 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleConfirmResetPassword(u.uid);
                                if (e.key === 'Escape') handleCancelResetPassword();
                              }}
                            />
                            <button
                              type="button"
                              disabled={isResetting}
                              onClick={() => handleConfirmResetPassword(u.uid)}
                              className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition cursor-pointer disabled:bg-blue-300"
                              title="Lưu mật khẩu mới"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelResetPassword}
                              className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition cursor-pointer"
                              title="Hủy"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : deletingUserId === u.uid ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[11px] text-rose-600 font-bold">Xóa?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.uid)}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded cursor-pointer transition shadow-2xs"
                            >
                              Có
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingUserId(null)}
                              className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium rounded cursor-pointer transition"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartResetPassword(u.uid)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="Đặt lại mật khẩu"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            {!isSystemAdmin && (
                              <button
                                type="button"
                                onClick={() => setDeletingUserId(u.uid)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title="Xóa tài khoản"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
