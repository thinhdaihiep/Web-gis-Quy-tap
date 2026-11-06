# Kế hoạch & Tiến độ Triển khai Hệ thống WebGIS Quân khu 5

---

## 1. Cơ chế Đồng bộ Bộ đệm Toàn CSDL: Sổ bộ Phiên bản Dữ liệu (Global Sync Registry)
- Quản lý phiên bản dữ liệu tập trung qua `app_settings/sync_registry`.
- Đảm bảo client chỉ tải lại các bảng có thay đổi phiên bản (`features`, `raster`, `communes`, `configs`, `aliases`).
- 100% Firebase Admin SDK trên máy chủ Node.js/Express.

---

## 2. Chuẩn hoá Import/Export GeoJSON (Lớp dữ liệu Mộ liệt sĩ, Nghĩa trang, Trận đánh, Quy tập)
- Hệ toạ độ: Chuẩn hoá WGS 84 (EPSG:4326 - Longitude / Latitude).
- Chỉ giữ trường `OBJECTID` viết hoa và các trường đúng schema; loại bỏ tự động `shape_area`, `shape_length`.
- Export GeoJSON định dạng chuẩn 4326 hỗ trợ sao lưu thủ công nhanh chóng.

---

## 3. Ràng buộc Chống Spam & Giới hạn Gửi Góp ý (Feedback) [HOÀN TẤT]

### 3.1. Ràng buộc Ký tự & Định dạng
- **Họ và tên**: 2 – 50 ký tự.
- **Số điện thoại**: 10 – 11 chữ số, bắt đầu bằng `0` (chuẩn số điện thoại Việt Nam).
- **Nội dung góp ý**: 10 – 500 ký tự.
- **Giao diện**:
  - Bộ đếm ký tự thời gian thực dạng số (`{length}/500`).
  - Cảnh báo màu khi sắp vượt giới hạn ký tự.
  - Thông báo lỗi gọn gàng ngay trong modal, không dùng `window.alert`.

### 3.2. Giới hạn 3 góp ý / đối tượng / ngày / IP
- **Khóa định danh**: `${clientIp}_${layerId}_${objectId}_${YYYY-MM-DD}` theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`, GMT+7).
- **Kiểm tra 2 lớp**:
  1. Bộ nhớ RAM nhanh (`feedbackDailyLimiter`).
  2. Truy vấn Firestore collection `PhanAnh` (đối soát trường `clientIp`, `Lop`, `OBJECTID`, `ngayGui`).
- **Endpoint kiểm tra**: `GET /api/feedback/daily-count?objectId=...&layerId=...`
  - Client tự động kiểm tra số lượt khi mở Modal.
  - Khi đã gửi đủ 3/3 góp ý: nút Gửi chuyển sang trạng thái khoá kèm biểu tượng cảnh báo và nhãn ngắn gọn `3/3`.

### 3.3. Bẫy Bot Honeypot & Cooldown 60s
- Trường ẩn `website` (honeypot): Bot tự động điền sẽ bị từ chối ngay lập tức.
- Giãn cách 60 giây giữa 2 lần gửi liên tiếp từ cùng một IP/trình duyệt.

### 3.4. Chuẩn thiết kế Giao diện (UI)
- Ưu tiên sử dụng Icon (`User`, `Phone`, `ShieldAlert`, `AlertCircle`, `Clock`, `Send`).
- Nhãn hiển thị ngắn gọn nhất theo yêu cầu thiết kế (`Họ tên`, `Số ĐT`, `3/3`, `Gửi`).
