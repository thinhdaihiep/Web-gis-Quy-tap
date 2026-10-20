# Kế hoạch Nâng cấp SearchPane thành Tìm kiếm 2 Tab (Dữ liệu GIS & OpenStreetMap)

## 1. Phân tích Hiện trạng `AddFeatureModal` & Đề xuất Xử lý
Theo đúng yêu cầu kiểm tra:
* **Hiện trạng**: `AddFeatureModalProps` hiện tại **chỉ nhận** `markerLocation: { lat, lng } | null`. Trong component, ô nhập tên `initialValues['Ten']` luôn mặc định là rỗng `""` và `selectedLayerId` luôn mặc định là lớp đầu tiên (`layer1_tim_kiem`). Component chưa có prop nhận tên điền sẵn hay lớp gợi ý.
* **Giải pháp tối ưu & an toàn**:
  * Bổ sung 2 props tùy chọn vào `AddFeatureModalProps`:
    ```ts
    initialName?: string;
    initialLayerId?: string;
    ```
  * Khi mở modal từ icon `PlusCircle` của địa danh OSM:
    * Truyền `initialName = osmItem.name` -> Tự động điền vào ô Tên đối tượng.
    * Gợi ý `initialLayerId` phù hợp với loại địa danh (ví dụ: Nghĩa trang -> `layer4_nghia_trang`, Di tích/Chiến trường -> `layer2_tran_danh`, Thôn/Làng/Đồi núi -> `layer1_tim_kiem`).
    * Truyền `markerLocation = { lat: osmItem.lat, lng: osmItem.lon }` -> Tọa độ được điền sẵn chính xác.
  * *Cam kết*: Hoàn toàn tương thích ngược, không ảnh hưởng đến các luồng thêm đối tượng thông thường khác từ thanh công cụ bản đồ.

---

## 2. Chi tiết Triển khai các File

### 2.1. File `src/utils/osmService.ts` (Tạo mới)
* **Kiểu dữ liệu**:
  * `OsmGroup`: `'all' | 'hanh_chinh' | 'song_nui' | 'di_tich'`
  * `OsmItem`: `{ id, name, group, kind, kindLabel, lat, lon, ele? }`
  * `OsmError`: Lớp lỗi tùy chỉnh với thông báo tiếng Việt.
* **Cú pháp Overpass QL chuẩn xác**:
  * Áp dụng `out center tags;` cho toàn bộ kết quả.
  * Node: `place` (dân cư), `natural=peak|hill|volcano` (đỉnh núi/cao điểm).
  * Way: `waterway=river|stream|canal` (sông suối), `natural=ridge|valley|cliff` (dãy núi/thung lũng), `landuse=cemetery`, `amenity=grave_yard` (nghĩa trang), `historic=battlefield|memorial|monument` (di tích).
  * **Server-side Regex**:
    * Có từ khóa: Thêm `["name"~"từ khóa",i]` (hoặc `name:vi|alt_name|old_name`) vào từng selector. Kèm hàm escape ký tự đặc biệt regex.
    * Ô trống: Thêm `["name"]` để lọc lấy các đối tượng có tên.
* **Xoay vòng 3 máy chủ đã xác thực**:
  1. `https://overpass-api.de/api/interpreter`
  2. `https://overpass.kumi.systems/api/interpreter`
  3. `https://overpass.private.coffee/api/interpreter`
* **Kiểm soát mạng**:
  * `[timeout:25]` trong query, timeout 28s bằng `AbortController`.
  * Khử trùng lặp: Nếu trùng tên và khoảng cách < 50m thì giữ lại 1 bản ghi duy nhất.
  * Hàm tiện ích: `filterOsm(items, group)`, `makeBBoxKey(bounds)`, `isZoomOk(map)`.

---

### 2.2. File `src/components/SearchPane.tsx` (Nâng cấp)
* **Khu vực Đầu bảng (Dùng chung)**:
  * Ô `inputText` kèm nút `X` xóa nhanh.
    * Placeholder Tab Dữ liệu: `"Nhập tên, quê quán, nghĩa trang, mã số..."`
    * Placeholder Tab Bản đồ: `"Nhập tên địa danh (hoặc để trống quét tất cả)..."`
  * Nút `Search` (Icon `Search`), xoay vòng `animate-spin` khi `isSearching`.
* **Thanh 2 Tab**:
  * Tab 1: Icon `Database` + "Dữ liệu"
  * Tab 2: Icon `Globe` + "Bản đồ"
  * Đường viền chỉ báo (active indicator) màu xanh dương nổi bật.
* **ComboBox lọc theo từng Tab**:
  * Tab Dữ liệu: `-- Tất cả các lớp --`, `Khu vực tìm kiếm, quy tập`, `Các trận đánh lịch sử`, `Mộ liệt sĩ`, `Nghĩa trang liệt sĩ`.
  * Tab Bản đồ: `-- Tất cả địa danh --` (`all`), `Hành chính` (`hanh_chinh`), `Sông núi` (`song_nui`), `Nghĩa trang & Di tích` (`di_tich`).
* **Cơ chế Tìm kiếm & Cache**:
  * Cache: `cachedOsmData = { bboxKey, keyword, allElements: OsmItem[] }`.
  * Chỉ gọi `searchOsm` khi:
    * (a) Người dùng bấm nút Search hoặc nhấn Enter.
    * (b) Chuyển sang Tab Bản đồ mà chưa có dữ liệu cache.
  * **Khi kéo/zoom bản đồ (bbox thay đổi)**: **KHÔNG tự quét lại, GIỮ NGUYÊN kết quả cũ**. Chỉ quét lại khi người dùng bấm Search/Enter.
  * **Khi đổi ComboBox ở Tab Bản đồ**: Lọc Client-side tức thì bằng `filterOsm(cache.allElements, group)`, không gọi mạng.
  * Kiểm tra Zoom: Nếu `!isZoomOk(map)` thì hiển thị cảnh báo: *"Vui lòng phóng to bản đồ (Zoom ≥ 11) để quét địa danh."* và không gửi request.
  * Hủy request đang chạy bằng `AbortController`. Bỏ qua im lặng nếu `e.name === 'AbortError'`; hiển thị `e.message` nếu là `OsmError`.
* **Quy tắc Chuyển Tab**:
  * Sang Tab Bản đồ: Chưa có dữ liệu -> Tự động quét.
  * Sang Tab Dữ liệu: Chưa có kết quả & ô nhập có từ khóa -> Tự động lọc.
  * Giữ nguyên kết quả của mỗi tab khi qua lại.
  * Khi chuyển tab hoặc đóng pane: Xóa sạch marker tạm.
* **Thẻ Kết quả Tab Bản đồ**:
  * Hàng 1: Icon theo nhóm (`Home` xanh lá cho hành chính, `Mountain` cam cho sông núi, `Landmark` tím cho di tích) + Tên đậm + Độ cao `(876m)` nếu có `ele` + Badge loại `kindLabel`.
  * Hàng 2: Tọa độ `lat, lng` font monospace, 5-6 chữ số thập phân (KHÔNG khoảng cách).
  * Cụm nút tác vụ (toàn bộ là Icon kèm tooltip):
    * `Navigation`: Bay bản đồ đến vị trí và ghim marker nhấp nháy tạm.
    * `Copy`: Sao chép `"tên, lat, lng"` vào clipboard.
    * `MapPin`: Mở `https://www.google.com/maps?q=lat,lng` ở tab mới.
    * `PlusCircle` (Chỉ hiện cho Admin / Biên tập viên): Mở modal thêm đối tượng vào 1 trong 4 lớp GIS với tên và tọa độ điền sẵn.

---

### 2.3. File `src/components/AddFeatureModal.tsx` & `src/App.tsx`
* **`AddFeatureModal.tsx`**:
  * Thêm props `initialName?: string; initialLayerId?: string;`.
  * Khi modal mở: nếu có `initialName`, điền vào `formValues['Ten']`; nếu có `initialLayerId`, chọn lớp đó.
* **`App.tsx`**:
  * Truyền `mapInstance` và `currentRole` cho `SearchPane`.
  * Quản lý `tempOsmLayerGroupRef` (`L.LayerGroup`): Khi ghim marker mới thì xóa sạch marker cũ trước. Dọn sạch khi đóng pane hoặc chuyển tab.
  * Xử lý callback định vị OSM và mở `AddFeatureModal` với dữ liệu điền sẵn (`addFeatureInitialData`).

---

## 3. Quy trình Triển khai & Kiểm tra
1. Tạo `src/utils/osmService.ts`.
2. Bổ sung props cho `src/components/AddFeatureModal.tsx`.
3. Nâng cấp `src/components/SearchPane.tsx`.
4. Kết nối trong `src/App.tsx`.
5. Chạy `compile_applet` và kiểm tra TypeScript, đảm bảo không có bất kỳ lỗi nào.
