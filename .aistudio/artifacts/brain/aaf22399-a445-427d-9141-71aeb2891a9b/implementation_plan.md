# Kế hoạch tối ưu hóa đọc/ghi Firestore (Server In-Memory Cache + Client IndexedDB)

## 1. Đánh giá tính tương thích với môi trường App Hosting / Cloud Run
Môi trường **Firebase App Hosting** (vận hành trên nền tảng Cloud Run container với lệnh `npm run start` chạy `dist/server.cjs`):

* **Client IndexedDB (Trình duyệt):**
  * Chạy hoàn toàn 100% ở phía máy khách (Local Browser Storage).
  * **Không phụ thuộc vào hosting**, hoạt động ổn định trên mọi môi trường triển khai (Firebase App Hosting, Cloud Run, CDN, v.v.).

* **Server In-Memory Cache (Express Server):**
  * **Cơ chế hoạt động trong App Hosting:** App Hosting / Cloud Run quản lý các container có thể tự động scale (tăng/giảm số lượng instance hoặc scale-to-zero khi không có truy cập).
  * **Hành vi bộ nhớ:** Mỗi container instance giữ một bản cache trong RAM. Khi một instance khởi động hoặc hết thời hạn TTL (ví dụ: 15-30 phút), nó chỉ đọc Firestore đúng **1 lần** để nạp vào RAM rồi phục vụ cho hàng nghìn lượt request của người dùng gửi tới instance đó.
  * **Không làm gián đoạn dịch vụ:** Bộ nhớ đệm chỉ đóng vai trò "Read-Through Cache" (đọc nhanh từ RAM), hoàn toàn không lưu trữ trạng thái cố định (stateless backend) nên tương thích hoàn hảo với đặc tính scale của App Hosting.

* **Cơ chế dự phòng an toàn (Fallback Gracefully):**
  * Trong trường hợp API cache phía server gặp độ trễ hoặc lỗi mạng tạm thời, client sẽ tự động fallback truy vấn trực tiếp Firestore SDK như cơ chế hiện tại.
  * Không làm mất dữ liệu, không ảnh hưởng đến logic tạo điểm (`map_features`) hay biên tập bản đồ.

---

## 2. Các điểm tắc nghẽn hiện tại
1. **Lớp ảnh vệ tinh (`raster_layers`):** Đọc toàn bộ collection mỗi lần tải trang chủ và mỗi lần chuyển sang tab quản lý Raster.
2. **Dữ liệu phân mảnh hành chính (`commune_chunks`):** Đọc nhiều tài liệu chunk lớn từ Firestore mỗi phiên làm việc.
3. **Cấu hình lớp & Từ điển trường (`layer_configs`, `field_alias_dictionary`):** Tải lại toàn bộ mỗi khi khởi động ứng dụng.
4. **Không có cơ chế kiểm tra phiên bản (ETag/Version metadata):** Mọi request đều kéo dữ liệu thô thay vì kiểm tra timestamp thay đổi gần nhất.

---

## 3. Kiến trúc giải pháp kết hợp

```
[Trình duyệt / Client]
       │
       ├─ (1) Kiểm tra IndexedDB cục bộ (Cache-First)
       │      └─ Nếu có dữ liệu + chưa hết hạn / cùng version: Dùng ngay (0 network, 0 Firestore read)
       │
       ▼ (2) Khi cần tải mới hoặc dữ liệu cục bộ hết hạn
[Server Express API (/api/cache/...)] (Chạy trên App Hosting)
       │
       ├─ (3) Kiểm tra Server RAM Cache (TTL + Invalidation khi có ghi)
       │      └─ Nếu có trong RAM: Trả về client ngay (0 Firestore read)
       │
       ▼ (4) Chỉ khi Server RAM Cache chưa có / bị xóa bộ đệm
[Firebase Firestore] (Chỉ 1 lượt đọc cho nhiều client dùng chung)
```

---

## 4. Các bước triển khai cụ thể

### Giai đoạn 1: Triển khai Client IndexedDB Caching
- Xây dựng tiện ích quản lý IndexedDB nhẹ, thuần TypeScript không phụ thuộc thêm thư viện ngoài (zero dependency).
- Lưu trữ các tập dữ liệu có dung lượng lớn hoặc ít thay đổi:
  - `commune_chunks` (danh mục hành chính xã/huyện/tỉnh).
  - `raster_layers` (danh sách lớp ảnh vệ tinh).
  - `layer_configs` và `field_alias_dictionary`.
- Thiết lập cơ chế kiểm tra `lastUpdated` hoặc TTL (Time-to-Live) để tự động làm mới khi cần.

### Giai đoạn 2: Triển khai Server-side In-Memory Cache & Proxy API
- Trong `server.ts`, xây dựng router `/api/cache/...`:
  - `GET /api/cache/raster-layers`: Lưu trữ danh sách raster layers trong RAM của server (TTL: 15-30 phút hoặc xóa cache khi có sự kiện thêm/xóa ảnh).
  - `GET /api/cache/communes`: Lưu trữ và phục vụ commune chunks qua server RAM.
  - `GET /api/cache/layer-configs`: Lưu trữ cấu hình các lớp dữ liệu.
- Xử lý Cache Invalidation: Khi có hành động thêm/sửa/xóa lớp raster hoặc cấu hình lớp, gọi hàm xóa cache tương ứng trên server để các lượt đọc kế tiếp lấy dữ liệu mới nhất.

### Giai đoạn 3: Cập nhật luồng đọc dữ liệu trong giao diện
- Cập nhật `src/firebaseService.ts` và `src/App.tsx`:
  - Ưu tiên đọc từ IndexedDB client -> nếu rỗng, gọi API Proxy từ server -> nếu server chưa cache mới chạm vào Firestore.
- Cập nhật `src/components/RasterManagementTab.tsx`: Sử dụng dữ liệu cache thay vì liên tục gọi `getDocs(collection(db, 'raster_layers'))`.

---

## 5. Kết quả dự kiến
- **Lượt đọc Firestore:** Giảm từ **80% - 95%** tổng số reads hàng ngày.
- **Tốc độ phản hồi:** Thời gian tải danh sách xã và danh sách ảnh vệ tinh giảm từ vài giây xuống dưới 50ms khi dữ liệu đã nằm trong bộ nhớ đệm.
- **Tính tương thích:** 100% tương thích với Firebase App Hosting và Cloud Run, không gây lỗi build hay ảnh hưởng tới các chức năng hiện có.
