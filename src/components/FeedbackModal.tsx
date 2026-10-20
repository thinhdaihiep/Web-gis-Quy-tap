import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  MessageSquare,
  User,
  Phone,
  Send,
  Trash2,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  FeedbackItem,
  FeedbackStatus,
  createFeedback,
  subscribeFeedbacksForObject,
  deleteFeedback,
  updateFeedbackStatus,
} from '../feedbackService';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  objectId: string | number | null;
  layerId: string | null;
  featureName?: string;
  layerName?: string;
  currentRole: 'admin' | 'editor' | 'guest';
  isLoggedIn: boolean;
  onSuccessToast?: (msg: string) => void;
}

const COOLDOWN_KEY = 'webgis_feedback_cooldown_time';
const COOLDOWN_DURATION_MS = 60 * 1000; // 60 giây

function maskPhoneNumber(phone: string): string {
  const clean = String(phone || '').trim();
  if (!clean) return '***';
  if (clean.length <= 4) return '****';
  if (clean.length >= 8) {
    return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
  }
  return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  objectId,
  layerId,
  featureName = 'Đối tượng GIS',
  layerName = 'Lớp bản đồ',
  currentRole,
  isLoggedIn,
  onSuccessToast,
}) => {
  const [ten, setTen] = useState('');
  const [dienThoai, setDienThoai] = useState('');
  const [noiDung, setNoiDung] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const timerRef = useRef<any>(null);

  // Khởi tạo và kiểm tra bộ đếm chống spam từ localStorage
  useEffect(() => {
    const updateCooldown = () => {
      try {
        const storedEndTime = localStorage.getItem(COOLDOWN_KEY);
        if (storedEndTime) {
          const diffMs = parseInt(storedEndTime, 10) - Date.now();
          if (diffMs > 0) {
            setSecondsLeft(Math.ceil(diffMs / 1000));
            return;
          }
        }
      } catch (_) {}
      setSecondsLeft(0);
    };

    updateCooldown();
    timerRef.current = setInterval(updateCooldown, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Lắng nghe danh sách phản ánh theo OBJECTID và Lop
  useEffect(() => {
    if (!isOpen || !objectId || !layerId) {
      setFeedbacks([]);
      return;
    }

    setIsLoadingList(true);
    const unsubscribe = subscribeFeedbacksForObject(
      objectId,
      layerId,
      (items) => {
        setFeedbacks(items);
        setIsLoadingList(false);
      },
      () => {
        setIsLoadingList(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, objectId, layerId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (secondsLeft > 0) return;

    const trimmedTen = ten.trim();
    const trimmedDienThoai = dienThoai.trim();
    const trimmedNoiDung = noiDung.trim();

    if (!trimmedTen || !trimmedDienThoai || !trimmedNoiDung) {
      return;
    }

    if (!objectId || !layerId) return;

    try {
      setIsSubmitting(true);
      await createFeedback({
        OBJECTID: objectId,
        Lop: layerId,
        TenLop: layerName,
        TenDoiTuong: featureName,
        Ten: trimmedTen,
        DienThoai: trimmedDienThoai,
        NoiDung: trimmedNoiDung,
      });

      // Kích hoạt bộ đếm ngược chống spam (60s)
      const nextCooldownEnd = Date.now() + COOLDOWN_DURATION_MS;
      try {
        localStorage.setItem(COOLDOWN_KEY, String(nextCooldownEnd));
      } catch (_) {}
      setSecondsLeft(60);

      // Xóa nội dung nhưng giữ lại Tên/SĐT để người dùng tiện gửi thêm nếu cần
      setNoiDung('');

      if (onSuccessToast) {
        onSuccessToast('Gửi góp ý thành công!');
      }
    } catch (error) {
      console.error('Lỗi khi gửi góp ý:', error);
      alert('Không thể gửi góp ý. Vui lòng kiểm tra lại kết nối!');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (currentRole !== 'admin') return;
    if (!window.confirm('Xóa góp ý này?')) return;

    try {
      setDeletingId(id);
      await deleteFeedback(id);
      if (onSuccessToast) {
        onSuccessToast('Đã xóa góp ý');
      }
    } catch (err) {
      console.error('Lỗi khi xóa góp ý:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (id: string, newStatus: FeedbackStatus) => {
    if (currentRole !== 'admin' && currentRole !== 'editor') return;
    try {
      await updateFeedbackStatus(id, newStatus);
    } catch (err) {
      console.error('Lỗi khi cập nhật trạng thái:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[4000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
        {/* Header Modal */}
        <div className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-5 h-5 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base truncate">
                {featureName}
              </h3>
              <p className="text-[11px] text-slate-300 truncate">
                {layerName} &bull; ID: <span className="font-mono text-amber-300 font-semibold">{String(objectId)}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md transition cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* PHẦN TRÊN: FORM NHẬP PHẢN ÁNH */}
          <section className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:p-3.5 shadow-2xs">
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                {/* Ô 1: Họ tên */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={ten}
                    onChange={(e) => setTen(e.target.value)}
                    placeholder="Họ và tên"
                    className="w-full pl-8.5 pr-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-1.5 focus:ring-sky-500 focus:border-sky-500 transition text-slate-900"
                  />
                </div>

                {/* Ô 2: Số điện thoại */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </span>
                  <input
                    type="tel"
                    required
                    value={dienThoai}
                    onChange={(e) => setDienThoai(e.target.value)}
                    placeholder="Số điện thoại"
                    className="w-full pl-8.5 pr-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-1.5 focus:ring-sky-500 focus:border-sky-500 transition text-slate-900 font-mono"
                  />
                </div>
              </div>

              {/* Ô 3: Nội dung phản ánh */}
              <div className="relative">
                <textarea
                  required
                  rows={2}
                  value={noiDung}
                  onChange={(e) => setNoiDung(e.target.value)}
                  placeholder="Nội dung góp ý..."
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-1.5 focus:ring-sky-500 focus:border-sky-500 transition text-slate-900 resize-none"
                />
              </div>

              {/* Nút gửi & Bộ đếm chống spam */}
              <div className="flex items-center justify-between pt-1">
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  {!isLoggedIn && (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                      SĐT được ẩn công khai
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || secondsLeft > 0}
                  className={`inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold shadow-xs transition cursor-pointer ${
                    secondsLeft > 0
                      ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed'
                      : isSubmitting
                      ? 'bg-sky-400 text-white cursor-wait'
                      : 'bg-sky-600 hover:bg-sky-700 text-white active:scale-95'
                  }`}
                  title={secondsLeft > 0 ? `Vui lòng đợi ${secondsLeft}s trước khi gửi tiếp` : 'Gửi góp ý'}
                >
                  {secondsLeft > 0 ? (
                    <>
                      <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                      <span>{secondsLeft}s</span>
                    </>
                  ) : isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Gửi</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* PHẦN DƯỚI: DANH SÁCH GÓP Ý ĐÃ GỬI */}
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
                <span>Danh sách ({feedbacks.length})</span>
              </div>
            </div>

            {isLoadingList ? (
              <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
              </div>
            ) : feedbacks.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs italic">
                Chưa có góp ý nào cho đối tượng này.
              </div>
            ) : (
              <div className="space-y-2">
                {feedbacks.map((item) => {
                  const displayPhone = isLoggedIn
                    ? item.DienThoai
                    : maskPhoneNumber(item.DienThoai);

                  const isMoi = item.TrangThai === 'moi';
                  const isDangXuLy = item.TrangThai === 'dang_xu_ly';
                  const isDaXuLy = item.TrangThai === 'da_xu_ly';

                  return (
                    <div
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-lg p-2.5 sm:p-3 shadow-2xs hover:border-slate-300 transition text-xs space-y-1.5"
                    >
                      {/* Dòng 1: Tên + Trạng thái + Nút Xóa (Admin) */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 truncate">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{item.Ten}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Trạng thái Badge (Admin/Editor có thể đổi nhanh) */}
                          {currentRole === 'admin' || currentRole === 'editor' ? (
                            <select
                              value={item.TrangThai}
                              onChange={(e) =>
                                handleStatusChange(item.id, e.target.value as FeedbackStatus)
                              }
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border cursor-pointer focus:outline-hidden ${
                                isMoi
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : isDangXuLy
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              <option value="moi">Mới</option>
                              <option value="dang_xu_ly">Đang xử lý</option>
                              <option value="da_xu_ly">Đã xử lý</option>
                            </select>
                          ) : (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                                isMoi
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : isDangXuLy
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {isMoi && <AlertCircle className="w-2.5 h-2.5" />}
                              {isDangXuLy && <Clock className="w-2.5 h-2.5" />}
                              {isDaXuLy && <CheckCircle className="w-2.5 h-2.5" />}
                              <span>
                                {isMoi ? 'Mới' : isDangXuLy ? 'Đang xử lý' : 'Đã xử lý'}
                              </span>
                            </span>
                          )}

                          {/* Nút xóa - Chỉ hiển thị cho Admin */}
                          {currentRole === 'admin' && (
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              disabled={deletingId === item.id}
                              className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition cursor-pointer"
                              title="Xóa góp ý"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Dòng 2: Điện thoại & Thời gian */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 gap-2">
                        <div className="flex items-center gap-1 truncate font-mono">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{displayPhone}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 text-slate-400">
                          <Clock className="w-3 h-3" />
                          <span>{item.ThoiGian}</span>
                        </div>
                      </div>

                      {/* Dòng 3: Nội dung phản ánh */}
                      <div className="bg-slate-50 rounded p-2 text-slate-800 text-xs leading-relaxed border border-slate-100 whitespace-pre-wrap break-words">
                        {item.NoiDung}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
