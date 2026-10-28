# Kế hoạch Nâng cấp Bảo mật Server Thuần Admin SDK & Kiến trúc Đồng bộ Bộ đệm Toàn diện (Global Sync Registry)

---

## Tóm tắt Mục tiêu
Nâng cấp toàn diện cơ chế xác thực danh tính, phân quyền cán bộ và ghi nhận dữ liệu không gian GIS từ máy chủ Node.js/Express thông qua **100% Firebase Admin SDK thuần túy**, kết hợp xây dựng **Sổ bộ Phiên bản Dữ liệu Toàn diện (Global Sync Registry)** để giải quyết triệt để bài toán: *Làm thế nào máy khách (Client) nhận biết được bất kỳ cập nhật mới nào trong CSDL (từ mộ chí, lớp raster đến ranh giới xã và cấu hình) để tự động đồng bộ chính xác mà không tốn băng thông*.

---

## 1. Cơ chế Đồng bộ Bộ đệm Toàn CSDL: Sổ bộ Phiên bản Dữ liệu (Global Sync Registry)

### 1.1. Bản chất Vấn đề
Hệ thống WebGIS Quân khu 5 lưu trữ và đệm nhiều tập dữ liệu độc lập vào bộ nhớ máy khách (IndexedDB & LocalStorage):
1. **Lớp đối tượng không gian (`map_features`)**: Vị trí mộ chí, điểm quy tập, khu vực tìm kiếm hài cốt liệt sĩ.
2. **Lớp bản đồ Raster nền (`raster_layers`)**: Bản đồ UTM 1975, Đô thị 1972...
3. **Dữ liệu Ranh giới Hành chính (`commune_chunks`)**: Bản đồ địa giới xã/phường 11 tỉnh thành.
4. **Cấu hình lớp bản đồ (`layer_configs`)**: Tên tùy chỉnh và trạng thái bật/tắt các lớp nghiệp vụ.
5. **Từ điển Bí danh thuộc tính (`field_aliases`)**: Danh mục chuẩn hóa tên trường hiển thị.

Nếu máy khách chỉ đọc đệm cục bộ (IndexedDB) mà không có cơ chế "báo hiệu", máy khách sẽ bị kẹt dữ liệu cũ vĩnh viễn. Ngược lại, nếu mỗi lần mở web lại tải toàn bộ các bảng về thì sẽ gây tốn chi phí đọc Firestore và làm ứng dụng tải chậm.

---

### 1.2. Giải pháp Kiến trúc: Global Sync Registry (Sổ bộ Phiên bản Siêu nhẹ)

Hệ thống duy trì duy nhất một tài liệu siêu nhẹ (~200 bytes) trong Firestore tại đường dẫn:
`app_settings/sync_registry`

```json
{
  "featuresVersion": 104,
  "featuresUpdatedAt": "2026-10-26T10:30:00Z",
  "rasterVersion": 12,
  "rasterUpdatedAt": "2026-10-25T05:16:25Z",
  "communesVersion": 3,
  "communesUpdatedAt": "2026-10-15T09:00:00Z",
  "configsVersion": 7,
  "configsUpdatedAt": "2026-10-20T08:00:00Z",
  "aliasesVersion": 5,
  "aliasesUpdatedAt": "2026-10-18T14:20:00Z"
}
```

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TRÌNH DUYỆT KHÁCH (CLIENT)                      │
│                                                                        │
│  1. Khởi động ──► Nạp tức thì TẤT CẢ từ IndexedDB (Bản đồ hiện 0ms)    │
│                                                                        │
│  2. Gửi 1 yêu cầu kiểm tra siêu nhẹ (khoảng 200 bytes):                │
│     GET /api/sync/versions                                             │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         EXPRESS SERVER (NODE.JS)                       │
│                                                                        │
│  3. Đọc nhanh `app_settings/sync_registry` qua Firebase Admin SDK      │
│     và trả về bảng phiên bản hiện tại cho Client                       │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CLIENT TỰ ĐỘNG SO SÁNH PHIÊN BẢN                     │
│                                                                        │
│  ├── featuresVersion (Client: 103 < Server: 104)                       │
│  │   └──► CÓ MỘ CHÍ MỚI: Chỉ tải lại `map_features` và đè IndexedDB!   │
│  │                                                                     │
│  ├── rasterVersion (Client: 12 == Server: 12)                          │
│  │   └──► RASTER KHÔNG ĐỔI: Giữ nguyên đệm (0 bytes tải mạng)          │
│  │                                                                     │
│  └── communesVersion (Client: 3 == Server: 3)                          │
│      └──► RANH GIỚI KHÔNG ĐỔI: Giữ nguyên đệm (0 bytes tải mạng)       │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 1.3. Cơ chế Tự động Nhảy Phiên bản khi Cập nhật Dữ liệu

Cơ chế này tương thích hoàn hảo với cả hai phương thức cập nhật theo đúng định hướng của Mr.Goal:

1. **Khi Cán bộ/Admin cập nhật đơn lẻ trên Web**:
   - Khi cán bộ lưu/sửa 1 đối tượng mộ chí (`POST /api/features/save` hoặc `/api/features/delete`):
     Server thực thi ghi dữ liệu vào collection `map_features`, đồng thời **tự động tăng `featuresVersion` (+1)** và cập nhật `featuresUpdatedAt` trong `sync_registry`.
   - Khi Admin thêm/sửa 1 layer raster hoặc quét lại BBox (`POST /api/raster-layers/*`):
     Server tự động tăng `rasterVersion` (+1) trong `sync_registry`.
   - Khi Admin lưu tên lớp hoặc từ điển bí danh:
     Server tự động tăng `configsVersion` hoặc `aliasesVersion`.

2. **Khi Chạy Script Nạp Dữ liệu Hàng loạt trên Dev Server**:
   - Sau khi script Admin SDK trên Dev Server hoàn thành việc import hàng nghìn bản ghi (từ file Excel/GeoJSON/KML), script chỉ cần gọi 1 hàm chốt:
     `bumpSyncVersion('features')`
   - Ngay lập tức, toàn bộ các máy khách ngoài thực địa khi mở ứng dụng sẽ thấy phiên bản mới và tự động kéo dữ liệu mới nhất về máy mà không cần bất kỳ thao tác thủ công nào.

---

## 2. Đánh giá Tính Đáp ứng & An toàn trên App Hosting

1. **Hoàn toàn Không ảnh hưởng Phiên bản Cũ đang chạy**:
   - Tài liệu `sync_registry` là một document độc lập trong collection `app_settings`. Phiên bản cũ trên App Hosting không đọc document này nên tiếp tục chạy bình thường 100%.
   - Cấu trúc các bảng dữ liệu nghiệp vụ hoàn toàn giữ nguyên.
2. **Tiết kiệm Chi phí Đọc Firestore tối đa**:
   - Mỗi lần mở ứng dụng, thay vì Client phải đọc nhiều collection lớn (tốn hàng nghìn lượt đọc), Client chỉ cần đọc **đúng 1 document `sync_registry`** siêu nhỏ.
   - Khi không có dữ liệu mới: Số lượt tải dữ liệu lớn là **0**.
   - Khi có dữ liệu mới: Client chỉ tải duy nhất bảng có thay đổi.
3. **Độ trễ Cực thấp**:
   - Server Node.js đọc `sync_registry` qua Admin SDK bằng đường truyền mạng nội bộ Google Cloud gRPC (< 10ms).

---

## 3. Các Quyết định Kỹ thuật đã Thống nhất cùng Mr.Goal

> [!IMPORTANT]
> 1. **Kiến trúc Server**: 100% **Firebase Admin SDK (`adminDb`)**, gỡ bỏ hoàn toàn Web SDK (`serverDb`) trên máy chủ.
> 2. **Chính sách hiển thị lớp Raster (Phương án B)**:
>    - **Lớp Firebase Storage**: Chỉ hiển thị cho tài khoản đăng nhập (`admin`/`editor`) khi không bị ẩn (`enabled !== false`). Tuyệt đối không hiển thị cho khách.
>    - **Lớp GitHub Release**: Hiển thị cho toàn bộ người dùng khi `enabled !== false`.
> 3. **Mô hình Ghi dữ liệu GIS**:
>    - Web App tập trung xử lý ghi đơn lẻ từng đối tượng với tần suất thấp (`/api/features/save`, `/api/features/delete`) có xác thực token ký số HMAC-SHA256.
>    - Nạp dữ liệu hàng loạt quy mô lớn sẽ chạy thông qua Script độc lập với Admin SDK trên Dev Server.
> 4. **Cơ chế Đồng bộ Bộ đệm Toàn CSDL**: Áp dụng mô hình **Global Sync Registry** (`app_settings/sync_registry`) để đồng bộ thông minh theo từng phân hệ dữ liệu.

---

## 4. Chi tiết Kế hoạch Triển khai Mã nguồn

### Hạng mục 1: Nâng cấp `server.ts` sang 100% Admin SDK & Sync Registry
1. **Dọn dẹp Web SDK**:
   - Gỡ bỏ toàn bộ code khởi tạo Web SDK `serverDb` và import `firebase/firestore`.
   - Đảm bảo toàn bộ ứng dụng chỉ sử dụng `adminDb` từ Service Account.
2. **Xây dựng Module Quản lý Phiên bản Dữ liệu (`/api/sync/versions`)**:
   - Tạo endpoint `GET /api/sync/versions` đọc nhanh tài liệu `app_settings/sync_registry`.
   - Hàm nội bộ `bumpSyncVersion(type: 'features' | 'raster' | 'configs' | 'aliases' | 'communes')`: Tự động tăng số phiên bản và gắn timestamp hiện tại mỗi khi có thao tác ghi dữ liệu tương ứng.
3. **Nâng cấp Cụm API Xác thực & Người dùng**:
   - `seedDefaultAdmin()`: Chạy qua `adminDb`.
   - `/api/login`: Đọc qua `adminDb`, so khớp mật khẩu băm Bcrypt và cấp HMAC token.
   - `/api/users/*`: Thêm cán bộ, phân quyền, đổi mật khẩu, xóa qua `adminDb`.
4. **Nâng cấp Cụm API Ghi Dữ liệu Không gian**:
   - `/api/features/save`: Lưu 1 đối tượng qua `adminDb` -> gọi `bumpSyncVersion('features')`.
   - `/api/features/delete`: Xóa đối tượng qua `adminDb` -> gọi `bumpSyncVersion('features')`.
   - `/api/features/batch`: Lưu batch qua `adminDb.batch()` -> gọi `bumpSyncVersion('features')`.
5. **Nâng cấp Cụm API Lớp Bản đồ Raster**:
   - `/api/raster-layers`: Đọc danh mục qua `adminDb`.
   - `/api/raster-layers/*`: Cập nhật trạng thái enabled, quét lại BBox qua `adminDb` -> gọi `bumpSyncVersion('raster')`.

---

### Hạng mục 2: Nâng cấp Client `src/firebaseService.ts` & `src/App.tsx`
1. **Quản lý Phiên bản Cục bộ (Local Version Tracker)**:
   - Lưu trữ các chỉ số phiên bản đã nạp vào LocalStorage (ví dụ: `gis_local_versions`).
2. **Cơ chế Đối soát Ngầm Thông minh (Selective Sync)**:
   - Khi khởi động, nạp ngay dữ liệu từ IndexedDB để giao diện mở tức thì.
   - Gửi yêu cầu ngầm tới `/api/sync/versions`:
     - Nếu `server.rasterVersion > local.rasterVersion`: Tự động nạp mới `raster_layers` và cập nhật IndexedDB.
     - Nếu `server.featuresVersion > local.featuresVersion`: Tự động nạp mới `map_features` và cập nhật IndexedDB.
     - Tương tự cho `configs`, `aliases`, `communes`.
3. **Bộ lọc Quyền hiển thị Raster chuẩn hóa theo Phương án B**:
   - Khách vãng lai: Chỉ hiển thị các lớp GitHub có `enabled !== false`.
   - Cán bộ đăng nhập: Hiển thị thêm các lớp Firebase có `enabled !== false`.

---

## 5. Lộ trình Thực hiện Từng bước

- **Bước 1**: Cập nhật `server.ts` sang 100% Admin SDK, xây dựng `sync_registry` và các API xác thực, ghi dữ liệu đơn lẻ.
- **Bước 2**: Cập nhật `src/firebaseService.ts` và `src/App.tsx` với cơ chế đồng bộ có chọn lọc dựa trên `sync_registry`.
- **Bước 3**: Tạo sẵn mẫu script `scripts/bulk_import_features.ts` trên Dev Server hỗ trợ import hàng loạt dữ liệu và tự động kích hoạt nhảy phiên bản sync.
- **Bước 4**: Kiểm thử toàn diện:
  - Thử nghiệm sửa 1 mộ chí -> kiểm tra máy khách nhận biết cập nhật.
  - Thử nghiệm thêm 1 layer raster -> kiểm tra máy khách tự động cập nhật combobox.
  - Kiểm tra tài khoản khách: Đảm bảo không thấy lớp Firebase.
- **Bước 5**: Báo cáo kết quả chi tiết cho Mr.Goal.
