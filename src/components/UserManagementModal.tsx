import React, { useState, useEffect } from 'react';
import { X, UserCircle, Plus, Trash2 } from 'lucide-react';
import { AppUser, UserRole } from '../types';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';

interface UserManagementModalProps {
  onClose: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ onClose }) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Add User Form State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('editor');

  const fetchUsers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const userList: AppUser[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        userList.push({
          uid: docSnap.id,
          username: data.username || data.email || '',
          email: data.email || '',
          displayName: data.displayName || '',
          photoURL: data.photoURL || '',
          role: data.role || 'guest',
        });
      });
      setUsers(userList);
    } catch (err) {
      console.error('Lỗi khi tải danh sách người dùng:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    try {
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u)));
      await updateDoc(doc(db, 'users', uid), {
        role: newRole,
      });
    } catch (err) {
      console.error('Lỗi cập nhật vai trò:', err);
      alert('Không thể cập nhật quyền người dùng.');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) {
      alert('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    try {
      const newUserId = `user_${Date.now()}`;
      const newUserDoc = {
        username: newUsername.trim(),
        password: newPassword,
        displayName: newDisplayName.trim() || newUsername.trim(),
        role: newRole,
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'users', newUserId), newUserDoc);
      
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('editor');
      
      fetchUsers();
    } catch (err) {
      console.error('Lỗi thêm người dùng:', err);
      alert('Không thể thêm người dùng mới.');
    }
  };

  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const handleDeleteUser = async (uid: string) => {
    if (uid === 'admin_static') {
      alert('Không thể xóa tài khoản Quản trị viên hệ thống gốc.');
      setDeletingUserId(null);
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', uid));
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
    } catch (err) {
      console.error('Lỗi xóa người dùng:', err);
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[5000] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2 text-slate-800">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <UserCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base">Quản lý người dùng</h2>
              <p className="text-xs text-slate-500">Thiết lập tài khoản và quyền truy cập</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto bg-white flex-1 flex flex-col gap-6">
          
          {/* Add User Form */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Thêm người dùng mới
            </h3>
            <form onSubmit={handleAddUser} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tên đăng nhập</label>
                <input 
                  type="text" 
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="Nhập tên đăng nhập"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mật khẩu</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="Nhập mật khẩu"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tên hiển thị</label>
                <input 
                  type="text" 
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="Hiển thị trên app"
                />
              </div>
              <div className="w-[140px]">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Vai trò</label>
                <select 
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                >
                  <option value="admin">Quản trị viên</option>
                  <option value="editor">Biên tập viên</option>
                  <option value="guest">Khách</option>
                </select>
              </div>
              <button 
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition cursor-pointer shadow-sm"
              >
                Thêm mới
              </button>
            </form>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">Không có dữ liệu người dùng.</div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs uppercase font-bold">
                  <tr>
                    <th className="px-4 py-3">Người dùng</th>
                    <th className="px-4 py-3">Tài khoản (Username)</th>
                    <th className="px-4 py-3">Vai trò</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-50">
                      <td className="px-4 py-3 flex items-center gap-2">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-slate-200" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs uppercase shrink-0">
                            {u.displayName ? u.displayName.charAt(0) : (u.username ? u.username.charAt(0) : 'U')}
                          </div>
                        )}
                        <span className="font-semibold text-slate-800">{u.displayName || u.username}</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{u.username || u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
                          className={`text-xs font-bold px-2 py-1.5 rounded-lg border focus:outline-none cursor-pointer ${
                            u.role === 'admin'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : u.role === 'editor'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          <option value="admin">Quản trị viên</option>
                          <option value="editor">Biên tập viên</option>
                          <option value="guest">Khách</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {deletingUserId === u.uid ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-xs text-rose-600 font-semibold">Xóa?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.uid)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded cursor-pointer transition shadow-xs"
                            >
                              Đồng ý
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
                            onClick={() => setDeletingUserId(u.uid)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title="Xóa tài khoản"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-sm transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
