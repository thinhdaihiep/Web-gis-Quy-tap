import React, { useState, useEffect, useRef } from 'react';
import {
  UserCircle,
  Plus,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Shield,
  UserCheck,
  X,
} from 'lucide-react';
import { AppUser, UserRole } from '../types';
import { db } from '../firebase';
import {
  collection,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';

interface UserWithPassword extends AppUser {
  password?: string;
  createdAt?: string;
}

const CACHE_KEY = 'gis_cached_users';

export const UserManagementTab: React.FC = () => {
  // Load cached users initially for instant render
  const [users, setUsers] = useState<UserWithPassword[]>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (_) {}
    return [
      {
        uid: 'admin_static',
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

  // Password visibility map
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
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
  const processRawUsers = (rawList: any[]): UserWithPassword[] => {
    const map = new Map<string, UserWithPassword>();

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
          password: item.password || '',
          createdAt: item.createdAt || '',
        });
      }
    });

    // Ensure default system admin account exists
    if (!map.has('admin')) {
      map.set('admin', {
        uid: 'admin_static',
        username: 'admin',
        displayName: 'Bản đồ qk5',
        role: 'admin',
        password: '123',
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

  // Realtime listener on Firestore 'users' collection
  useEffect(() => {
    setLoading(true);
    let unsubscribe = () => {};

    try {
      unsubscribe = onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          const rawDocs: any[] = [];
          snapshot.forEach((docSnap) => {
            rawDocs.push({
              uid: docSnap.id,
              ...docSnap.data(),
            });
          });

          const processed = processRawUsers(rawDocs);
          setUsers(processed);
          setLoading(false);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(processed));
          } catch (_) {}
        },
        (error) => {
          console.warn('Firestore onSnapshot error, falling back to /api/users:', error);
          fetchUsersFromServer().finally(() => setLoading(false));
        }
      );
    } catch (e) {
      console.warn('Cannot setup Firestore onSnapshot:', e);
      fetchUsersFromServer().finally(() => setLoading(false));
    }

    // Also call server API immediately to ensure instant sync
    fetchUsersFromServer().finally(() => setLoading(false));

    return () => {
      unsubscribe();
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
      // 1. Update Firestore
      if (uid !== 'admin_static') {
        await updateDoc(doc(db, 'users', uid), { role: newRole });
      }
      // 2. Sync with Server API
      await fetch(`/api/users/${uid}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      showFeedbackMessage('success', 'Đã cập nhật quyền thành công');
    } catch (err) {
      console.error('Lỗi cập nhật vai trò:', err);
      showFeedbackMessage('error', 'Không thể cập nhật quyền người dùng');
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
    const docId = `user_${cleanUser}`;
    const newUserDoc = {
      username: cleanUser,
      password: cleanPass,
      displayName: cleanName,
      role: newRole,
      createdAt: new Date().toISOString(),
    };

    try {
      // 1. Write to Firestore directly
      await setDoc(doc(db, 'users', docId), newUserDoc);

      // 2. Also send to Server API
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserDoc),
      });

      // 3. Optimistic local update
      const newEntry: UserWithPassword = {
        uid: docId,
        ...newUserDoc,
      };
      setUsers((prev) => {
        const updated = processRawUsers([...prev, newEntry]);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
        } catch (_) {}
        return updated;
      });

      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('editor');
      showFeedbackMessage('success', `Đã thêm tài khoản "${cleanName}" thành công`);
    } catch (err: any) {
      console.error('Lỗi thêm người dùng:', err);
      // Try fallback to server API alone
      try {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUserDoc),
        });
        if (res.ok) {
          showFeedbackMessage('success', `Đã thêm tài khoản "${cleanName}" thành công (qua Server)`);
          fetchUsersFromServer();
          setNewUsername('');
          setNewPassword('');
          setNewDisplayName('');
          setNewRole('editor');
        } else {
          showFeedbackMessage('error', 'Không thể thêm người dùng mới, vui lòng thử lại');
        }
      } catch (_) {
        showFeedbackMessage('error', 'Lỗi kết nối khi thêm người dùng mới');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (uid === 'admin_static') {
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
      // 1. Delete from Firestore
      await deleteDoc(doc(db, 'users', uid));
      // 2. Delete via Server API
      await fetch(`/api/users/${uid}`, { method: 'DELETE' });
      showFeedbackMessage('success', 'Đã xóa tài khoản thành công');
    } catch (err) {
      console.error('Lỗi xóa người dùng:', err);
      showFeedbackMessage('error', 'Không thể xóa người dùng trên máy chủ');
      fetchUsersFromServer();
    } finally {
      setDeletingUserId(null);
    }
  };

  const toggleShowPassword = (uid: string) => {
    setShowPasswordMap((prev) => ({
      ...prev,
      [uid]: !prev[uid],
    }));
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
              <option value="admin">Quản trị viên (Admin)</option>
              <option value="editor">Biên tập viên (Editor)</option>
              <option value="guest">Khách xem (Guest)</option>
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

      {/* User List Table */}
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
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-800 text-slate-200 text-[11px] uppercase font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">Người dùng</th>
                <th className="px-4 py-3">Tài khoản</th>
                <th className="px-4 py-3">Mật khẩu</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {users.map((u) => {
                const isSystemAdmin = u.username.toLowerCase() === 'admin';
                const showPass = !!showPasswordMap[u.uid];

                return (
                  <tr key={u.uid} className="hover:bg-slate-50/80 transition">
                    {/* Cột 1: Người dùng */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase shrink-0 ${
                            isSystemAdmin
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : u.role === 'editor'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
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

                    {/* Cột 3: Mật khẩu */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-700 bg-slate-50 border border-slate-200 px-2 py-1 rounded min-w-[70px] text-center">
                          {showPass ? (
                            u.password || (isSystemAdmin ? '123' : '•••')
                          ) : (
                            '••••••••'
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleShowPassword(u.uid)}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer"
                          title={showPass ? 'Ẩn mật khẩu' : 'Xem mật khẩu'}
                        >
                          {showPass ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Cột 4: Vai trò */}
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
                              : u.role === 'editor'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          <option value="admin">Quản trị viên</option>
                          <option value="editor">Biên tập viên</option>
                          <option value="guest">Khách</option>
                        </select>
                      )}
                    </td>

                    {/* Cột 5: Thao tác */}
                    <td className="px-4 py-3 text-right">
                      {isSystemAdmin ? (
                        <span className="text-[11px] text-slate-400 italic">Mặc định</span>
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
                        <button
                          type="button"
                          onClick={() => setDeletingUserId(u.uid)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Xóa tài khoản"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
