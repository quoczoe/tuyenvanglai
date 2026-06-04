# SYSTEM INSTRUCTIONS & MASTER BLUEPRINT: TUYENVANGLAI.IO.VN
> **"CHỢ KÈO VÃNG LAI"** — Kim chỉ nam vĩnh viễn cho toàn bộ phiên làm việc.
> Phiên bản: 1.1 | Cập nhật: 2026-06-03

---

## 🛠️ PHẦN I: HẠ TẦNG CÔNG NGHỆ CỐ ĐỊNH (CORE DATA ENGINE)

### 1.1 Kiến trúc hệ thống
- **Loại:** Web tĩnh thuần — **HTML5 / Vanilla JavaScript** (KHÔNG dùng bất kỳ framework nào: không React, không Vue, không Angular).
- **Kết nối:** Gọi thẳng REST API đám mây từ phía client (không cần backend server riêng).
- **Hosting:** Deploy trên **GitHub Pages** hoặc **Vercel**.

### 1.2 Hệ thống dữ liệu địa lý tĩnh
- **File:** `bo-may-du-lieu.js` (không có file `data-dia-ly.js` riêng)
- **Đối tượng xuất ra:** `window.MOCK_PROVINCES` — mảng 63 tỉnh/thành với quận/huyện đầy đủ
- **Cấu trúc:** Mỗi phần tử gồm `{ ten, mien, quan_huyen[] }` — mien có giá trị `'Nam'` / `'Trung'` / `'Bắc'`
- **Lưu ý quan trọng:** TP. Hồ Chí Minh và Hà Nội được đẩy lên **đầu danh sách** trong `window.MOCK_PROVINCES`.

### 1.3 Cơ sở dữ liệu đám mây — Supabase REST API
| Tham số | Giá trị |
|---|---|
| `SUPABASE_URL` | `https://kyidswbpfafsoqsdhfpu.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_3Cb5pwmj_zzz88iNiVNmow_JGUWmDzI` |

### 1.4 Giao diện kết nối dữ liệu bắt buộc (Global API Object)
Toàn bộ mã nguồn tương tác với Supabase **BẮT BUỘC** phải thông qua đối tượng toàn cục `window.khoDuLieuVinhVien` với đúng 3 phương thức sau:

```javascript
window.khoDuLieuVinhVien = {
  // Ghi / cập nhật dữ liệu lên Supabase
  async ghiData(tenBang, duLieu, dieuKienUpsert) { ... },

  // Đọc / truy vấn dữ liệu từ Supabase
  async docData(tenBang, boLoc) { ... },

  // Xóa dữ liệu khỏi Supabase
  async xoaData(tenBang, dieuKienXoa) { ... }
};
```

> ⚠️ **NGHIÊM CẤM** gọi `fetch()` hay `axios` trực tiếp đến Supabase endpoint ở bất kỳ nơi nào khác trong code. Mọi thao tác I/O đều phải đi qua `window.khoDuLieuVinhVien`.

---

## 🧠 PHẦN II: NGUYÊN TẮC PHÁT TRIỂN & ĐẦU RA CODE (CRITICAL RULES)

### Quy tắc 1 — GIAO DIỆN CHỦ ĐỘNG SÁNG TẠO
- Người dùng chỉ mô tả **logic chức năng**. AI phải **tự do sáng tạo** toàn bộ UI/UX.
- **Chuẩn thiết kế:** Shadcn UI + phong cách **Cyberpunk** (màu neon, viền sáng, hiệu ứng glow).
- **Ưu tiên tối đa:** Mobile-First — giao diện phải mượt mà, dễ dùng trên điện thoại trước.
- **Chế độ màu:** Dark Mode là **duy nhất** — không có light/dark toggle. Quyết định cố định, không thay đổi.
- **Responsive:** Hoạt động hoàn hảo trên mọi kích thước màn hình.

### Quy tắc 2 — CODE HOÀN CHỈNH 100%
- **BẮT BUỘC** xuất đầy đủ mã nguồn qua tính năng **Artifacts** (hoặc code block đầy đủ).
- **NGHIÊM CẤM TUYỆT ĐỐI:**
  - Viết placeholder: `// code viết tại đây`, `// TODO`, `// ...`
  - Bỏ sót hàm, class, hoặc logic với lý do "tương tự như trên"
  - Bất kỳ đoạn code nào khi copy-paste không chạy được lập tức
- Mỗi file phải là một **artifact độc lập hoàn chỉnh**, có thể chạy ngay.

### Quy tắc 3 — NGÔN NGỮ ĐỒNG BỘ 100% TIẾNG VIỆT
Các thành phần sau **BẮT BUỘC** viết bằng tiếng Việt:
- Toàn bộ văn bản hiển thị trên giao diện (label, button, title, placeholder)
- Thông báo hệ thống, cảnh báo lỗi, toast notification
- **100% comment** giải thích thuật toán trong code

---

## 📋 PHẦN III: ĐẶC TẢ LOGIC VÀ PHÂN LUỒNG CHỨC NĂNG CHI TIẾT

---

### 👑 PHÂN HỆ 1: QUẢN TRỊ VIÊN TỐI CAO (ADMIN)
**File:** `/admin/index.html` | **Logic:** `phan-he-quan-tri.js`

#### 1.1 Xác thực & Bảo mật
- Đường dẫn **ẩn** — không xuất hiện trên menu công khai.
- Đăng nhập bằng tài khoản/mật khẩu cứng (hardcoded), xử lý **hoàn toàn nội bộ** trên client.
- Sai thông tin đăng nhập → chặn truy cập.

#### 1.2 Hệ thống Key Host
> **Lưu ý:** Admin KHÔNG còn CRUD key qua UI. Bảng `quan_ly_key` vẫn tồn tại trên Supabase — Host tự kích hoạt key qua tab **Cá Nhân** trong SPA. Admin chỉ can thiệp key trực tiếp trên Supabase dashboard nếu cần.

**Cấu trúc key** (`quan_ly_key`): `ma_key (TVL-XXXXX-XXXX)` · `ten_host` · `sdt_host` · `so_ngay_duoc_xai` · `trang_thai` · `id_thiet_bi` · `ngay_kich_hoat` · `ngay_het_han`

#### 1.3 Tabs Admin Panel (6 tabs thực tế)
| Tab | Chức năng |
|---|---|
| **Thành Viên** | Bảng `nguoi_dung`: xem, sửa thông tin, đổi vai trò, reset mật khẩu, khóa/mở, xóa |
| **Đánh Giá** | Bảng `danh_gia_tin_dung`: xem, xóa bài đánh giá (bulk delete) |
| **Cấu Hình** | Bảng `cau_hinh_he_thong`: popup, QR donate, Telegram, logo/favicon |
| **Ca Đấu** | Bảng `ca_dau`: xem, sửa, xóa, chốt/mở chốt ca |
| **Góp Ý** | Bảng `gop_y_he_thong`: xem, xóa (bulk delete) |
| **Thống Kê** | Dashboard tổng hợp: tổng slot, ca đấu, thành viên, đánh giá |

#### 1.5 Đồng bộ & Big Data Marketing
- Admin xem danh sách toàn bộ thành viên trong bảng `nguoi_dung` (tab Thành Viên)
- Thông tin: Họ tên, SĐT, Ngày tham gia, Số buổi chơi, Tổng chi tiêu, Rating
- Mục đích: Big Data phục vụ chiến dịch tiếp thị sau này.

#### 1.6 Quyền lực tối cao
Admin là người duy nhất có quyền:
- ✅ Can thiệp, chỉnh sửa, ghi đè bất kỳ số liệu ca đấu nào
- ✅ Xóa bỏ đơn đặt slot của bất kỳ khách nào
- ✅ Xóa hoặc chỉnh sửa bất kỳ bài đánh giá nào
- ✅ Khóa/mở khóa tài khoản bất kỳ thành viên nào

#### 1.7 Cấu hình thông báo trang chủ
- **Form chỉnh sửa** nội dung thông báo popup hiển thị cho Khách ngoài.
- **Lưu vào Supabase:** Bảng `cau_hinh_he_thong`, cột `noi_dung_thong_bao`, dòng có `id = 'popup_chinh'`.

---

### 💰 PHÂN HỆ 2: TRẠM LÀM VIỆC CHỦ SÂN (HOST)
**Vị trí:** Tab `#dang-quan-ly` trong `index.html` (SPA) | **Logic:** `phan-he-host.js`

#### 2.1 Xác thực Key
- Host nhập mã Key → Hệ thống đối chiếu với bảng `quan_ly_key` trên Supabase.
- Lưu trạng thái xác thực vào `localStorage`.
- **Chặn truy cập** nếu:
  - Key sai / không tồn tại
  - Key hết hạn (`ngay_het_han < ngay_hien_tai`)
  - Trạng thái Key là "Bị khóa"
- **Ràng buộc thiết bị:** Ghi `id_thiet_bi` (fingerprint/UUID) vào bảng khi kích hoạt lần đầu. Lần sau chỉ cho phép thiết bị đúng `id_thiet_bi` đăng nhập.

#### 2.2 Quản lý Khách (Danh sách đăng ký ca)
- Hiển thị đầy đủ: Tên khách, SĐT Zalo, Mã slot, Trạng thái đi đánh.
- Mục đích: Host liên hệ qua Zalo dễ dàng.
- Host có quyền **cập nhật trạng thái** từng khách: `"Chờ đánh"` → `"Đã tham gia"` hoặc `"Bùng kèo"`.

---

#### 📦 KHỐI A — THIẾT LẬP KÈO CÔNG KHAI (PUBLIC METADATA)

**A.1 Địa lý Cascading (3 tầng)**
```
Vùng miền (Nam/Trung/Bắc)
  └─► Tỉnh/Thành phố [từ KHO_DATA_DIA_LY]
        └─► Quận/Huyện [từ KHO_DATA_DIA_LY]
```
- TP.HCM và HN luôn ở **đầu danh sách** hoặc có thanh tìm kiếm lọc nhanh.

**A.2 Lịch trình thông minh**
| Trường | Ràng buộc |
|---|---|
| Ngày đánh | Chỉ cho chọn từ ngày hiện tại đến `ngay_het_han` của Key |
| Giờ bắt đầu | Time picker |
| Giờ kết thúc | Time picker |
| **Tổng số giờ chơi** | **Read-only** — tự động tính: `gio_ket_thuc - gio_bat_dau` |

**A.3 Định mức Sân đấu**
- Tên sân (text)
- Số lượng sân mở (select 1–8)
- Số thứ tự sân (text linh hoạt: `"sân 3"`, `"1,2"`, `"1.2"`)
- Địa chỉ sân: Tích hợp Google Maps API search, hoặc điền tự do nếu không tìm được

**A.4 Ràng buộc giới tính & Trình độ (Logic cặp)**

```
Chọn "Nam"      → Chỉ hiện ô trình độ Nam  | Ẩn ô trình độ Nữ
Chọn "Nữ"       → Chỉ hiện ô trình độ Nữ   | Ẩn ô trình độ Nam
Chọn "Cả hai"   → Hiện cả 2 ô trình độ độc lập
```

**Danh sách trình độ (select):**
- Newbie
- Yếu
- Trung bình yếu
- Trung bình-
- Trung bình+
- Trung bình khá
- *(Hoặc ô nhập text tự do: số tháng/năm chơi)*

**A.5 Chi phí & Tiện ích công khai**
- Ô giá tiền thu Nam (VNĐ)
- Ô giá tiền thu Nữ (VNĐ)
- 4 Checkbox hiện thị công khai cho Khách xem:
  - `[ ] Sân` — giá vé đã bao gồm tiền sân
  - `[ ] Cầu` — giá vé đã bao gồm tiền cầu
  - `[ ] Nước` — giá vé đã bao gồm nước uống
  - `[ ] Gửi xe` — giá vé đã bao gồm gửi xe

---

#### 📊 KHỐI B — MA TRẬN KẾ TOÁN NỘI BỘ (ẨN HOÀN TOÀN VỚI KHÁCH)

**B.1 Tính toán Chi phí ca**

**Tổng tiền sân:**
```
Tổng tiền sân = Giá thuê sân 1 giờ × Số giờ chơi × Số lượng sân mở
```

**Tiền cầu (phức tạp):**
- Ô chọn thương hiệu cầu: Hỗ trợ nhập chữ để lọc danh sách cầu Việt Nam phổ biến.
- Cho phép **thêm/xóa nhiều loại cầu** khác nhau trong một buổi (dynamic list).
- Ô nhập giá hỗ trợ **3 đơn vị đồng bộ 2 chiều:**

| Ô nhập | Giá trị | Tự động tính |
|---|---|---|
| Giá 1 ống 12 quả | X đồng | → Giá 1 quả = X / 12 |
| Giá 1 ống 6 quả | Y đồng | → Giá 1 quả = Y / 6 |
| Giá lẻ 1 quả | Z đồng | (nguồn gốc) |

- Ô nhập số lượng cầu tiêu thụ thực tế → Tự động thêm hậu tố `"quả"` hoặc `"trái"`.
- **Tổng tiền cầu** = Giá 1 quả × Số lượng quả thực tế.

**Chi phí phát sinh:**
- Ô nhập tổng tiền nước hoặc các khoản chi ngoài ca khác.

**B.2 Phân bổ doanh thu**
- Ô số người chơi thực tế (Bao nhiêu Nam / Bao nhiêu Nữ).
- Ô cấu hình **chênh lệch giá giới tính:**
  - Nhập `5000` → Nam trả cao hơn Nữ 5.000đ
  - Nhập `-5000` → Nam trả ít hơn Nữ 5.000đ
  - Nhập `0` → Nam và Nữ trả bằng nhau

**B.3 Thuật toán gợi ý giá thu khách — Realtime Engine**

> 🔄 **Lắng nghe sự kiện realtime** trên tất cả ô chi phí và số người → Tự động tính và hiển thị 3 tùy chọn:

| Tùy chọn | Công thức |
|---|---|
| **Huề vốn** | Doanh thu thu về = Tổng chi phí (Sân + Cầu + Nước phát sinh) |
| **Lãi ít** (Lãi trà đá) | Huề vốn + biên lãi nhỏ (khoảng 10-15%) |
| **Lãi nhiều** | Huề vốn + biên lãi lớn (khoảng 25-40%) |

- Host **bấm chọn 1 trong 3** → Hệ thống **tự động điền ngược** số tiền vào ô Giá Nam và Giá Nữ ở Khối A (có tính đến chênh lệch giới tính đã cấu hình).

---

#### ⚙️ KHỐI C — CƠ CHẾ VẬN HÀNH, ĐÓNG BĂNG & ĐÁNH GIÁ

**C.1 Sửa bài đăng**
- Bài đã đăng được phép **chỉnh sửa** nội dung **nếu ca đấu chưa hết giờ chơi**.

**C.2 Chốt Ca (Đóng băng dữ liệu — KHÔNG THỂ ĐẢO NGƯỢC)**
- Host bấm nút **"CHỐT CA"** khi thu xong tiền.
- Hệ thống lập tức:
  1. Set `da_chot_ca = TRUE` trong bảng `ca_dau`.
  2. **KHÓA CHẾT TOÀN BỘ** — Host không thể sửa hay xóa bất kỳ thông tin nào.
  3. Dữ liệu lưu **vĩnh viễn** vào lịch sử doanh thu Host.
  4. Đồng bộ tự động lên Dashboard Admin.

**C.3 Điều kiện Host đánh giá Khách (3 điều kiện AND)**
```
Điều kiện 1: Ca đấu ĐÃ được Host bấm CHỐT CA (da_chot_ca = TRUE)
     AND
Điều kiện 2: Khách ĐÃ ĐĂNG KÝ THÀNH CÔNG vào ca đó (có record trong bảng dat_slot)
     AND
Điều kiện 3: Trạng thái của khách đó là "Đã tham gia" (trang_thai_di_danh = 'Đã tham gia')
```
- **Sau khi gửi:** Bài đánh giá **KHÓA CỨNG** — không được sửa, không được xóa.

---

### 👤 PHÂN HỆ 3: SÀN KHÁCH VÃNG LAI (GUEST)
**Vị trí:** Tabs `#tim-keo` và `#ho-so` trong `index.html` (SPA) | **Logic:** `phan-he-khach-choi.js`

#### 3.1 Đăng nhập (Phone + Mật khẩu)
- **Bước 1:** Nhập SĐT + mật khẩu → SHA-256 hash (Web Crypto API) so sánh với `mat_khau_hash` trong bảng `nguoi_dung`.
- **User mới:** Form mở rộng slide-down: Họ tên, giới tính (bắt buộc), tùy chọn SĐT Zalo / Facebook / mã giới thiệu.
- **Tài khoản bị khóa:** `is_active === false` → toast lỗi + chặn đăng nhập.
- **Lưu session:** `tvl_user` (localStorage, 7 ngày) — tự động nhận diện cho lần truy cập sau.
- **Hạn chế quyền hạn tuyệt đối:** Khách KHÔNG được nhìn thấy hay can thiệp bất kỳ dữ liệu quản trị nào của Host và Admin.

#### 3.2 Bộ lọc quét kèo công khai (Cascading Filter)
```
Tỉnh/Thành phố
  └─► Quận/Huyện
        └─► Giới tính (Nam / Nữ / Cả hai)
              └─► Trình độ
                    └─► Ngưỡng giá cao nhất muốn trả (slider hoặc input)
                          └─► Tìm kiếm theo Tên sân (text search)
```
**Kết xuất ưu tiên:**
- Kèo đang hoạt động (chưa `da_chot_ca`)
- Chưa qua ngày đánh
- Sắp xếp theo thời gian gần nhất

#### 3.3 Đặt Slot
- Khách bấm **"ĐẶT SLOT"** → Hệ thống:
  1. Sinh mã token ngẫu nhiên định dạng `SLOT-XXXXX`.
  2. Ghi vào bảng `dat_slot`: Tên, SĐT, Mã slot, ID ca đấu, Thời gian đặt.
  3. Cập nhật lên Supabase realtime.

#### 3.4 Hồ sơ cá nhân Khách (Guest Dashboard)

**Thông tin tổng quan:**
- Tên, SĐT Zalo, Ngày tham gia hệ thống.

**Thống kê tài chính vãng lai (Auto-scan theo SĐT):**
| Chỉ số | Mô tả |
|---|---|
| Tổng số buổi ra sân | Đếm record `dat_slot` có `trang_thai_di_danh = 'Đã tham gia'` theo SĐT |
| Tổng tiền đã chi trả | Cộng tổng `gia_nam` hoặc `gia_nu` tương ứng của tất cả ca đã tham gia |
| Số chủ sân đã giao lưu | Đếm số `ma_key_host` distinct trong lịch sử |

**Bộ lọc thời gian:**
- Tuần này
- Tháng này
- Năm nay
- Tùy chọn khoảng ngày: Từ ngày `____` đến ngày `____`

#### 3.5 Điều kiện Khách đánh giá Host (3 điều kiện AND)
```
Điều kiện 1: SĐT khách ĐÃ đăng ký thành công vào ca đó (có record trong dat_slot)
     AND
Điều kiện 2: Ca đấu ĐÃ được Host bấm CHỐT CA (da_chot_ca = TRUE)
     AND
Điều kiện 3: Host xác nhận trạng thái của khách là "Đã tham gia"
```
- **Sau khi gửi:** Bài đánh giá **KHÓA CỨNG VĨNH VIỄN** — không cho sửa, không cho xóa.

---

## 💾 PHẦN IV: QUY HOẠCH BẢNG DỮ LIỆU ĐÁM MÂY (SUPABASE SCHEMA)

> Hệ thống có **7 bảng PostgreSQL** (6 nghiệp vụ + 1 legacy):

### Bảng 0: `nguoi_dung` — Tài khoản người dùng (Bảng chính)
> **Đây là bảng auth chính.** Mọi đăng nhập, profile, phân quyền đều từ bảng này.

| Cột | Kiểu dữ liệu | Ghi chú |
|---|---|---|
| `sdt_khach` | `TEXT` | **Primary Key (UNIQUE)** — SĐT là định danh duy nhất |
| `ten_khach` | `TEXT` | Tên / biệt danh |
| `mat_khau_hash` | `TEXT` | SHA-256 hash mật khẩu (Web Crypto API, client-side) |
| `gioi_tinh` | `TEXT` | `'male'` / `'female'` |
| `trinh_do` | `TEXT` | Trình độ chơi cầu lông |
| `vai_tro` | `TEXT` | `'guest'` (mặc định) / `'host'` (sau khi kích hoạt key) |
| `is_active` | `BOOLEAN` | `true` = hoạt động · `false` = bị khóa |
| `facebook_link` | `TEXT` | Link Facebook (nullable) |
| `sdt_zalo` | `TEXT` | SĐT Zalo riêng nếu khác SĐT chính (nullable) |
| `gmail` | `TEXT` | Gmail (nullable) |
| `bio` | `TEXT` | Giới thiệu bản thân (nullable) |
| `avatar_url` | `TEXT` | URL ảnh đại diện (nullable) |
| `ma_key_host` | `TEXT` | Key đã kích hoạt → Foreign Key `quan_ly_key.ma_key` (nullable) |
| `ngay_tham_gia` | `TIMESTAMP` | Auto: `now()` |

---

### Bảng 1: `quan_ly_key` — Hệ thống Key Host
| Cột | Kiểu dữ liệu | Ghi chú |
|---|---|---|
| `ma_key` | `TEXT` | **Primary Key** — Định dạng `TVL-XXXXX-XXXX` |
| `ten_host` | `TEXT` | Tên chủ sân |
| `sdt_host` | `TEXT` | Số điện thoại chủ sân |
| `so_ngay_duoc_xai` | `INTEGER` | Mặc định: 30 |
| `trang_thai` | `TEXT` | `'Chưa kích hoạt'` / `'Đang chạy'` / `'Bị khóa'` |
| `id_thiet_bi` | `TEXT` | Fingerprint thiết bị — NULL cho đến khi kích hoạt |
| `ngay_kich_hoat` | `TIMESTAMP` | Null cho đến khi Host nhập Key lần đầu |
| `ngay_het_han` | `TIMESTAMP` | `ngay_kich_hoat + so_ngay_duoc_xai days` |

---

### Bảng 2: `ca_dau` — Thông tin Kèo & Kế toán
| Cột | Kiểu dữ liệu | Ghi chú |
|---|---|---|
| `id` | `UUID` | **Primary Key** — Auto-generate |
| `ma_key_host` | `TEXT` | Foreign Key → `quan_ly_key.ma_key` |
| `vung_mien` | `TEXT` | `'Nam'` / `'Trung'` / `'Bắc'` |
| `tinh_thanh` | `TEXT` | Tên tỉnh/thành |
| `quan_huyen` | `TEXT` | Tên quận/huyện |
| `ten_san` | `TEXT` | Tên sân cầu lông |
| `so_san_cu_the` | `TEXT` | Ví dụ: `"sân 3"`, `"1,2"` |
| `dia_chi_san` | `TEXT` | Địa chỉ đầy đủ |
| `link_maps` | `TEXT` | Google Maps URL (nullable) |
| `ngay_danh` | `DATE` | Ngày tổ chức ca đấu |
| `gio_bat_dau` | `TIME` | Giờ bắt đầu |
| `gio_ket_thuc` | `TIME` | Giờ kết thúc |
| `loai_cau_su_dung` | `JSONB` | Danh sách cầu: `[{ten, gia_qua, so_luong}]` |
| `yeu_cau_trinh_do` | `JSONB` | `{nam: "...", nu: "..."}` |
| `gia_nam` | `INTEGER` | Giá thu Nam (VNĐ) |
| `gia_nu` | `INTEGER` | Giá thu Nữ (VNĐ) |
| `tien_ich_bao_gom` | `JSONB` | `{san: bool, cau: bool, nuoc: bool, gui_xe: bool}` |
| `chi_phi_san_co_dinh` | `INTEGER` | Tổng tiền thuê sân |
| `tong_doanh_thu_du_kien` | `INTEGER` | Doanh thu dự kiến |
| `da_chot_ca` | `BOOLEAN` | **Mặc định: `false`** → `true` khi Host bấm Chốt Ca |
| `created_at` | `TIMESTAMP` | Auto: `now()` |

---

### Bảng 3: `dat_slot` — Danh sách Đăng ký
| Cột | Kiểu dữ liệu | Ghi chú |
|---|---|---|
| `id` | `UUID` | **Primary Key** — `DEFAULT gen_random_uuid()` |
| `id_ca_dau` | `UUID` | Foreign Key → `ca_dau.id` |
| `ten_khach` | `TEXT` | Tên / biệt danh khách |
| `sdt_khach` | `TEXT` | SĐT Zalo |
| `ma_slot` | `TEXT` | Định dạng `SLOT-XXXXX` |
| `trang_thai_di_danh` | `TEXT` | Mặc định: `'Chờ đánh'` → `'Đã tham gia'` hoặc `'Bùng kèo'` |
| `thoi_gian_dat` | `TIMESTAMP` | Auto: `now()` |

---

### Bảng 4: `danh_gia_tin_dung` — Hệ thống Review Chặt Chẽ
| Cột | Kiểu dữ liệu | Ghi chú |
|---|---|---|
| `id` | `UUID` | **Primary Key** — Auto-generate |
| `id_ca_dau` | `UUID` | Foreign Key → `ca_dau.id` |
| `sdt_nguoi_viet` | `TEXT` | SĐT người viết đánh giá |
| `sdt_nguoi_bi_danh_gia` | `TEXT` | SĐT người bị đánh giá |
| `loai_danh_gia` | `TEXT` | `'HostToGuest'` hoặc `'GuestToHost'` |
| `so_sao` | `INTEGER` | Từ 1 đến 5 (có kiểm tra constraint) |
| `nhan_xet` | `TEXT` | Nội dung bài đánh giá |
| `created_at` | `TIMESTAMP` | Auto: `now()` — KHÔNG cho phép UPDATE sau khi tạo |

---

### Bảng 5: `cau_hinh_he_thong` — Tham số Vận hành CMS
| Cột | Kiểu dữ liệu | Ghi chú |
|---|---|---|
| `id` | `TEXT` | **Primary Key** — Nhận giá trị định danh cố định |
| `noi_dung_thong_bao` | `TEXT` | Nội dung thông báo / cấu hình (text hoặc URL) |

**Các dòng cố định (Seeded data):**
| `id` | Mô tả |
|---|---|
| `popup_chinh` | Thông báo popup hiển thị cho khách trang chủ |
| `so_keo_hien_thi` | Số kèo hiển thị trong HUD (số) |
| `so_thanh_vien` | Số thành viên hiển thị trong HUD (số) |
| `qr_donate` | URL ảnh QR code ủng hộ |
| `tieu_de_donate` | Tiêu đề section donate |
| `text_donate` | Mô tả/hướng dẫn donate |
| `telegram_bot_token` | Bot token gửi thông báo Telegram |
| `telegram_chat_id` | Chat ID nhận thông báo Telegram |

---

### Bảng 6: `gop_y_he_thong` — Góp Ý Người Dùng
| Cột | Kiểu dữ liệu | Ghi chú |
|---|---|---|
| `id` | `UUID` | **Primary Key** — Auto-generate |
| `ten_user` | `TEXT` | Tên người gửi góp ý |
| `sdt_user` | `TEXT` | SĐT người gửi |
| `so_sao` | `INTEGER` | Rating 1–5 sao |
| `loai_gop_y` | `TEXT` | Loại góp ý (Lỗi, Ý kiến, Khen ngợi...) |
| `noi_dung` | `TEXT` | Nội dung góp ý |
| `created_at` | `TIMESTAMP` | Auto: `now()` |

---

### ⚠️ Bảng LEGACY: `khach_vang_lai`
> **KHÔNG CÒN LÀ BẢNG CHÍNH.** Chỉ tồn tại làm fallback migration — code đọc `nguoi_dung` trước, nếu không tìm thấy mới fallback vào `khach_vang_lai` để hỗ trợ tài khoản cũ. Không thêm logic nghiệp vụ mới vào bảng này.

---

## 🗂️ PHẦN V: CẤU TRÚC FILE DỰ ÁN

```
tuyenvanglai.io.vn/
├── index.html               ← SPA chính: trang chủ + Khách (#tim-keo, #ho-so) + Host (#dang-quan-ly)
├── 404.html                 ← Trang lỗi 404 riêng (shuttlecock xoay, gradient neon)
├── admin/
│   └── index.html           ← Admin tối cao (đường dẫn ẩn, không trên menu công khai)
├── vercel.json              ← Routing Vercel (redirect không đuôi .html, 404 catch-all)
│
├── ket-noi-supabase.js      ← window.khoDuLieuVinhVien (ghiData / docData / xoaData)
├── bo-may-du-lieu.js        ← window.dbEngine proxy + window.MOCK_PROVINCES (63 tỉnh) + window.SHUTTLECOCK_BRANDS
├── hieu-ung-giao-dien.js    ← khoiTaoTheme, hienToast, khoiTaoHologramGlow
├── phan-he-ung-dung.js      ← Điều phối SPA: routing hash, khởi tạo tab, điều hướng màn hình
├── phan-he-khach-choi.js    ← Logic Khách: tìm kèo, bộ lọc, đặt slot, hồ sơ, lịch sử, đánh giá
├── phan-he-host.js          ← Logic Host: xác thực key, đăng kèo, kế toán, chốt ca, đánh giá
├── phan-he-quan-tri.js      ← Logic Admin: quản lý key, Big Data, cấu hình hệ thống
├── phan-he-gop-y.js         ← Logic góp ý / feedback người dùng
│
├── giao-dien.css            ← CSS toàn cục: dark theme Cyberpunk, layout, modal, responsive
├── components.css           ← CSS component: buttons, cards, slot-card, status-badge, pills...
│
├── supabase-schema.sql      ← DDL 6 bảng + RLS + seed data (đã chạy thành công)
├── cms-seed.sql             ← Seed data CMS / cấu hình hệ thống bổ sung
└── migration-nguoi-dung.sql ← Migration bảng người dùng (thêm cột is_active, mat_khau_hash...)
```

---

## 🚀 PHẦN VI: CHECKLIST TRƯỚC KHI XUẤT CODE

Trước khi xuất bất kỳ file code nào, AI phải tự kiểm tra:

- [ ] Giao diện theo chuẩn Shadcn UI + Cyberpunk, Mobile-First, **Dark Mode duy nhất** (không có toggle)
- [ ] Toàn bộ text hiển thị, alert, comment đều bằng **tiếng Việt**
- [ ] Mọi I/O Supabase đi qua `window.khoDuLieuVinhVien` (không gọi fetch trực tiếp)
- [ ] Không có placeholder, không có hàm bỏ trống, code copy-paste là chạy ngay
- [ ] Logic ràng buộc Chốt Ca + Điều kiện đánh giá được implement đúng 3 điều kiện AND
- [ ] Bảng `danh_gia_tin_dung` không cho phép UPDATE sau khi INSERT
- [ ] `da_chot_ca = TRUE` → Khóa toàn bộ edit của Host
- [ ] Key Host check đủ: tồn tại + chưa hết hạn + không bị khóa + đúng thiết bị

---

## 📊 PHẦN VII: BẢNG THEO DÕI TIẾN ĐỘ DỰ ÁN

> ⚡ **QUY TẮC BẮT BUỘC CHO AI:** Sau khi hoàn thành **bất kỳ file hoặc task lớn nào**, AI **PHẢI TỰ ĐỘNG** cập nhật section này ngay lập tức — không cần người dùng nhắc nhở. Ghi rõ: file nào xong, file nào đang làm, file nào chưa làm, và ghi chú vấn đề nếu có.

---

### ✅ ĐÃ HOÀN THÀNH

| File / Task | Mô tả ngắn | Cập nhật lần cuối |
|---|---|---|
| `ket-noi-supabase.js` | `window.khoDuLieuVinhVien` — connector Supabase (ghiData / docData / xoaData) | 2026-05-23 |
| `bo-may-du-lieu.js` | `window.dbEngine` proxy + `window.MOCK_PROVINCES` (63 tỉnh HCM+HN đầu) + `window.SHUTTLECOCK_BRANDS` | 2026-05-23 |
| `hieu-ung-giao-dien.js` | `khoiTaoTheme`, `hienToast`, `khoiTaoHologramGlow` | 2026-05-23 |
| `phan-he-ung-dung.js` | Điều phối SPA: routing hash, khởi tạo tab, điều hướng màn hình | 2026-05-24 |
| `giao-dien.css` | CSS toàn cục — dark Cyberpunk theme, layout HUD, modal, table, button base, responsive | 2026-05-24 |
| `components.css` | Component system v5.0 — btn-mini, status-badge, radio/checkbox pill, slot card, stats-grid-4, gender-badge, tien-ich, kmd-* modal design system | 2026-05-24 |
| `phan-he-host.js` | Toàn bộ logic Host: xác thực key, đăng kèo, kế toán, cầu bidirectional sync, smart pricing, Chốt Ca, quản lý khách, đánh giá | 2026-05-24 |
| `phan-he-khach-choi.js` | Logic Khách: tìm kèo, bộ lọc đa tiêu chí, đặt slot, huỷ slot, hồ sơ, lịch sử chi tiêu, đánh giá, modal chi tiết kèo (kmd-* 2 cột) | 2026-05-24 |
| `phan-he-quan-tri.js` | Logic Admin: quản lý key, Big Data (dat_slot thật), cấu hình 3 PATCH riêng vào cau_hinh_he_thong, quản lý thành viên + đánh giá | 2026-05-24 |
| `phan-he-gop-y.js` | Logic góp ý / feedback người dùng | 2026-05-24 |
| `index.html` | SPA chính — hero, HUD, gateway, host workspace (#dang-quan-ly), guest (#tim-keo, #ho-so), subtab-nav fixed, kmd-* modal, filter sidebar, slot cards | 2026-05-24 |
| `admin/index.html` | Admin tối cao — quản lý key, Big Data thành viên, cấu hình thông báo, modal thành viên | 2026-05-24 |
| `404.html` | Trang 404 riêng: số 404 gradient neon, shuttlecock xoay, nút quay về trang chủ + back, quick links | 2026-05-23 |
| `vercel.json` | Routing Vercel: /admin → /admin/index.html, redirect không đuôi .html, 404 catch-all | 2026-05-24 |
| `supabase-schema.sql` | DDL 6 bảng + RLS + seed data — đã chạy thành công trên Supabase | 2026-05-23 |
| `cms-seed.sql` | Seed data CMS bổ sung | 2026-05-24 |
| `migration-nguoi-dung.sql` | Migration bảng người dùng (is_active, mat_khau_hash...) | 2026-05-24 |

---

### 🔄 ĐANG DỞ / CẦN KIỂM TRA

| File / Task | Vấn đề / Việc cần làm |
|---|---|
| `index.html` | Số liệu HUD đã có fallback mặc định 45/1820 — cần test trên production với Supabase thật để verify số liệu thật ghi đè đúng |
| **Supabase Schema** | `supabase-schema.sql` đã tạo và chạy thành công. Cần verify dữ liệu thật trên dashboard |
| **End-to-end test** | Cần test: tạo key → kích hoạt → đăng kèo → khách đặt slot → chốt ca → đánh giá |

---

### ⏳ CHƯA LÀM / BACKLOG

| Task | Mức độ ưu tiên | Ghi chú |
|---|---|---|
| Deploy lên GitHub Pages / Vercel | 🔴 Cao | Cần config domain `tuyenvanglai.io.vn` trỏ về hosting |
| GĐ4A — Dashboard doanh thu Host | 🟡 Trung | Tab "Doanh Thu" trong host console: 4 metric + bảng lịch sử + filter Tuần/Tháng/Năm |
| GĐ4B — Export/In ca đấu | 🟡 Trung | Print popup + CSV download |
| Test realtime sync (nhiều thiết bị) | 🟡 Trung | Supabase Realtime subscription cho slot card cập nhật tức thời |
| GĐ5A — Biểu đồ Admin Chart.js | 🟢 Thấp | Line chart doanh thu, bar chart ca theo tỉnh, pie phân bố key |
| GĐ5B — Export data Admin | 🟢 Thấp | JSON backup + CSV khách |
| GĐ5C — Realtime Sync Supabase | 🟢 Thấp | WebSocket subscription |
| Tách dữ liệu địa lý | 🟢 Thấp | `window.MOCK_PROVINCES` hiện trong `bo-may-du-lieu.js`. Tách ra file riêng nếu cần scale (không dùng tên `data-dia-ly.js` cũ) |
| PWA / Offline mode | 🟢 Thấp | Service Worker + manifest.json |

---

### 📝 GHI CHÚ KỸ THUẬT QUAN TRỌNG

- **Dữ liệu địa lý:** `window.MOCK_PROVINCES` (63 tỉnh) nằm trong `bo-may-du-lieu.js` — **không có** file `data-dia-ly.js` hay đối tượng `KHO_DATA_DIA_LY` riêng biệt.
- **CSS versioning:** Toàn bộ hệ thống đã đồng bộ lên `?v=5.0`. Nếu sửa CSS thì tăng version để busting cache.
- **index.html màu sắc:** `#0a1628` nền, `#00ff88` accent xanh neon (mệnh Dương Liễu Mộc 2002), `#1a4a7a` navy phụ, `#f0f0f0` text. Dark mode duy nhất — không có light mode toggle. Font: Bebas Neue (brand title) + Barlow Condensed (h1-h6 toàn trang). Fallback HUD: 45 CA ĐẤU / 1820 THÀNH VIÊN.
- **index.html section layout:** Hero → CTA → HUD metrics → Sport branches (4-col/2×2) → Gateway cards (Guest/Host) → "Tại sao chọn?" (3 icon card ngang) → Footer.
- **404 routing:** `vercel.json` có catch-all route → `/404.html`. Nếu dùng GitHub Pages cần tạo file `404.md` hoặc copy `404.html`.
- **Admin URL:** File thực tế là `admin/index.html`. Đường dẫn truy cập: `/admin/` (không phải `/admin.html` hay `/admin-toi-cao.html`). `vercel.json` đã cấu hình redirect tương ứng.
- **dbEngine fallback:** Khi Supabase không kết nối được, hệ thống tự động chuyển sang LocalStorage sandbox — dữ liệu chỉ tồn tại trong browser, mất khi clear cache.
- **Chốt Ca:** Sau khi `da_chot_ca = true`, chỉ Admin mới có thể can thiệp dữ liệu. Host bị khóa hoàn toàn.
- **dat_slot PK:** Là `id` (UUID), KHÔNG phải `id_slot`. Khi PATCH: `{ id: datSlotId }`. Schema SQL thực tế dùng `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- **Huỷ slot:** UPDATE `trang_thai_di_danh = "Khách hủy"` — KHÔNG DELETE bản ghi. Chỉ cho phép huỷ khi `da_chot_ca === false`. Khách KHÔNG thể đặt lại sau khi huỷ.
- **Lịch sử chi tiêu:** Chỉ cộng tiền vào tổng khi `da_chot_ca === true AND trang_thai_di_danh === "Đã tham gia"`. Ca chờ chốt hiện badge "Chờ chốt ca" (không cộng). Ca hủy = 0đ.
- **Bảng user chính:** `nguoi_dung` — dùng `sdt_khach` làm PK. Auth bằng `mat_khau_hash` (SHA-256, Web Crypto API). Trạng thái tài khoản: `is_active` (boolean). **`khach_vang_lai` chỉ là legacy fallback** — không thêm logic mới vào đây.
- **Login flow:** SĐT + mật khẩu → SHA-256 hash → so sánh `mat_khau_hash` trong `nguoi_dung`. Session lưu vào `tvl_user` (7 ngày).
- **Cấu hình admin:** Bảng `cau_hinh_he_thong` có nhiều rows — mỗi config là 1 PATCH riêng theo `id`. Xem danh sách đầy đủ ở PHẦN IV Bảng 5.
- **Bảng góp ý:** `gop_y_he_thong` — INSERT từ `phan-he-gop-y.js`, gửi notification qua Telegram bot. Quản lý trong tab "Góp Ý" của admin.
- **Key Host status:** `trang_thai` trong `quan_ly_key`: `"Chưa kích hoạt"` / `"Đang chạy"` / `"Bị khóa"`.
- **Modal chi tiết kèo:** `id="modalChiTietKeoOverlay"`. Gọi `window.moModalChiTietKeo(idCaDau)`. Đóng: `window.dongModalChiTietKeo()` hoặc click outside.

---

## 🔒 PHẦN VIII: BẢO MẬT & CHỐNG COPY (áp dụng cho tất cả file HTML)

> ⚠️ **Lưu ý bảo mật thực tế:** Các biện pháp dưới đây chỉ ngăn **người dùng thông thường** (không có kiến thức kỹ thuật). Developer có thể bypass hoàn toàn. **Bảo mật thật sự nằm ở backend Supabase** — RLS policies, anon key restrictions, và server-side validation.

---

### 8.1 Checklist bắt buộc cho mỗi file HTML

Mỗi file HTML khi xuất ra **PHẢI** có đoạn script bảo vệ sau (đặt trước `</body>`):

```javascript
// ── BẢO VỆ MÃ NGUỒN — chống xem source người dùng thông thường ──
(function(){
    // 1. Disable chuột phải
    document.addEventListener('contextmenu', function(e){ e.preventDefault(); });

    // 2. Disable phím tắt DevTools & View Source
    document.addEventListener('keydown', function(e){
        // F12
        if (e.key === 'F12') { e.preventDefault(); return false; }
        // Ctrl+Shift+I / Ctrl+Shift+C / Ctrl+Shift+J
        if (e.ctrlKey && e.shiftKey && ['I','C','J'].includes(e.key.toUpperCase())) {
            e.preventDefault(); return false;
        }
        // Ctrl+U (View Source)
        if (e.ctrlKey && e.key.toUpperCase() === 'U') {
            e.preventDefault(); return false;
        }
    });

    // 3. Detect DevTools mở → reload page
    (function devToolsDetect(){
        var threshold = 160;
        setInterval(function(){
            if (window.outerWidth - window.innerWidth > threshold ||
                window.outerHeight - window.innerHeight > threshold) {
                document.body.innerHTML = '';
                window.location.reload();
            }
        }, 1000);
    })();

    // 4. Console protection — clear định kỳ + fake message
    setInterval(function(){ console.clear(); }, 2000);
    console.log('%c⛔ DỪNG LẠI!', 'color:red;font-size:2rem;font-weight:bold;');
    console.log('%cĐây là tính năng dành cho developer. Nếu ai đó yêu cầu bạn dán gì đó vào đây, đó là lừa đảo.',
        'color:#ff6b6b;font-size:1rem;');
})();
```

### 8.2 CSS bắt buộc trong mọi file HTML

```css
/* Disable text selection toàn trang */
body, * {
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
}
/* Cho phép select trong ô input/textarea (UX) */
input, textarea, [contenteditable] {
    -webkit-user-select: text;
    user-select: text;
}
```

### 8.3 Quy tắc về JS Minification

- Các file `.js` khi đã ổn định (không còn debug) **nên được minify** để khó đọc hơn.
- Công cụ gợi ý: [Terser](https://terser.org/) hoặc [UglifyJS](https://lisperator.net/uglifyjs/).
- File gốc vẫn giữ trong repo, file minified deploy lên hosting.
- Khi AI sinh code JS mới: viết code rõ ràng trước, minify sau — **không viết code rối từ đầu**.

### 8.4 Phạm vi áp dụng

| File | Bảo vệ chuột phải | Disable F12 | User-select: none | Console warning |
|---|---|---|---|---|
| `index.html` | ✅ | ✅ | ✅ | ✅ |
| `admin/index.html` | ✅ | ✅ | ✅ | ✅ |
| `404.html` | ✅ | ❌ (không cần) | ✅ | ❌ |

---

## 📌 PHẦN IX: QUY TẮC TỰ ĐỘNG CẬP NHẬT TIẾN ĐỘ

> ⚡ **BẮT BUỘC TUYỆT ĐỐI:** Sau khi hoàn thành **TỪNG TASK** (fix bug, thêm feature, sửa file...), AI **PHẢI TỰ ĐỘNG** cập nhật section **TIẾN ĐỘ CÔNG VIỆC** ngay bên dưới — **không cần người dùng nhắc nhở**.

**Quy tắc cập nhật:**
- Task xong → chuyển từ `[ ]` sang `[x]` và di chuyển vào mục **✅ Đã hoàn thành**
- Task đang làm → giữ trong mục **🔄 Đang làm dở**, cập nhật các điểm con
- Task mới phát sinh → bổ sung vào mục **📋 Chưa làm**
- Ghi rõ ngày cập nhật cuối cùng bên cạnh mỗi mục lớn

---

## 🗓️ PHẦN X: TIẾN ĐỘ CÔNG VIỆC & TRẠNG THÁI DỰ ÁN

> Cập nhật lần cuối: **2026-06-03** — Đồng bộ file list thực tế với CLAUDE.md

---

### 1️⃣ TIẾN ĐỘ CHI TIẾT

#### ✅ Hoàn thành TRƯỚC phiên này (phiên 1–2):
- [x] `index.html` v5.2 — Trang chủ hoàn chỉnh (hero, HUD, gateway cards, "Tại sao chọn?", footer)
- [x] `vercel.json` — Routing không đuôi .html, 404 catch-all
- [x] `404.html` — Trang lỗi 404 riêng (số gradient neon, shuttlecock xoay)
- [x] `ket-noi-supabase.js` — `window.khoDuLieuVinhVien` với JWT anon key đúng định dạng
- [x] `bo-may-du-lieu.js` v2.0 — `window.dbEngine` proxy (doc/ghi/xoa), `window.MOCK_PROVINCES` (63 tỉnh HCM+HN đầu), `window.SHUTTLECOCK_BRANDS`, sửa syntax error `hienLoiMang`
- [x] `hieu-ung-giao-dien.js` — `khoiTaoTheme`, `hienToast`, `khoiTaoHologramGlow`
- [x] `giao-dien.css` — CSS toàn cục Cyberpunk, dark-only
- [x] `components.css` v5.0 — Toàn bộ component system
- [x] `phan-he-host.js` v2.0 — Field mapping Supabase chuẩn, xóa `registered_guests[]`, Maps link thật
- [x] `index.html` host section v2.0 — Responsive, dark palette, filter tabs (#dang-quan-ly tab)
- [x] `supabase-schema.sql` — 6 bảng + RLS + seed data (đã chạy thành công trên dashboard)
- [x] Chống F12 / DevTools + user-select:none tất cả file HTML
- [x] Palette `#0f1e35` nền, `#1a2844` card, `#e2e8f0` text đồng bộ toàn trang

#### ✅ Hoàn thành TRONG phiên này (phiên 3 — 2026-05-24):

**GĐ1C — Đồng bộ tên bảng & field mapping (hoàn chỉnh 100%):**
- [x] `phan-he-quan-tri.js` v3.0 — Viết lại hoàn toàn:
  - Tất cả table names: `"quan_ly_key"` / `"ca_dau"` / `"khach_vang_lai"` / `"danh_gia_tin_dung"` / `"dat_slot"`
  - Xóa toàn bộ dual payload (`key+ma_key`, `ten_host+note`, `status+trang_thai`, ...)
  - Xóa `goi_dich_vu` / `plan` (không có trong schema)
  - Match key bằng `{ ma_key: k }` thay vì `{ key: k }`
  - `_taiDanhSachKhach` dùng `dat_slot` + `khach_vang_lai` + `ca_dau` (xóa `registered_guests[]`)
  - `luuThongBaoAdmin` → 3 PATCH call riêng biệt vào `cau_hinh_he_thong`
  - `_taiThongBao` → đọc `cfgMap` theo `c.id` key
- [x] `admin/index.html` v3.0 — Xóa select "Cấp Độ Gói", `keyFormStatus` dùng giá trị tiếng Việt trực tiếp
- [x] `phan-he-khach-choi.js` v3.0 — Xóa `window.locThongKeKhach = _taiThongKeKhach` (dòng cũ), thay bằng hàm mới gọi cả `_taiLichSuChiTieu`

**GĐ3 — 4 tính năng Khách mới (hoàn chỉnh 100%):**
- [x] `index.html` (guest section) v3.0 — Thêm CSS cho modal + slot items + history table + review items + detail button; thêm 3 sidebar card (`cardDaKySlot`, `cardLichSuChiTieu`, `cardDanhGiaVeToi`); thêm `<div id="modalChiTietKeoOverlay">`
- [x] **GĐ3A — Modal chi tiết kèo**: `window.moModalChiTietKeo(idCaDau)` + `window.dongModalChiTietKeo()` — hiện: địa chỉ, Maps link, thời gian, trình độ, giá nam/nữ, tiện ích, danh sách người đã ký (ẩn SĐT), nút ĐẶT SLOT
- [x] **GĐ3B — Huỷ đặt slot**: `window.huyDatSlot(datSlotId, idCaDau)` — UPDATE `trang_thai_di_danh = "Khách hủy"` (không DELETE), điều kiện `da_chot_ca === false`, confirm dialog, reload liên quan sau khi huỷ
- [x] **GĐ3B phụ — Danh sách Ca Đã Đăng Ký**: `_taiDaKySlot()` — hiện 10 slot gần nhất, nút Huỷ chỉ hiện khi đủ điều kiện
- [x] **GĐ3C — Lịch sử chi tiêu chi tiết**: `_taiLichSuChiTieu()` — badge logic chuẩn (Chờ chốt ca/Đã chốt/Đã hủy/Bùng kèo), tổng thực chi chỉ tính ca chốt + Đã tham gia, phân trang 15 dòng + Xem thêm, filter theo khoảng thời gian
- [x] **GĐ3D — Đánh giá về tôi**: `_taiDanhGiaVeToi()` — query `danh_gia_tin_dung` WHERE `sdt_nguoi_bi_danh_gia=myPhone AND loai_danh_gia="HostToGuest"`, hiện sao + nhận xét + tên sân + ngày
- [x] Nút "Chi tiết" trên mỗi card kèo → gọi `moModalChiTietKeo(slot.id)`
- [x] `window.locThongKeKhach` mới gọi cả `_taiThongKeKhach()` + `_taiLichSuChiTieu()`
- [x] `locNhanhThoiGian` cũng reload `_taiLichSuChiTieu` khi đổi bộ lọc thời gian

**Kiểm tra chất lượng:**
- [x] Syntax check `node --check` tất cả 4 file JS → ✅ 0 lỗi

#### ✅ Hoàn thành TRONG phiên này (phiên 4 — 2026-05-24): ĐẠI TU Responsive + Bug UI/UX + Admin Nâng Cấp

**Phân hệ 1 — index.html:**
- [x] Fix popup logic: dùng `.find(c => c.id === "popup_chinh")` thay vì `cfgList[0]` (order không đảm bảo)
- [x] Fix mobile HUD ≤480px: `flex-wrap:wrap`, `flex:1 1 40%`, `clamp` font-size cho value/label

**Phân hệ 2 — index.html (guest section) + phan-he-khach-choi.js:**
- [x] `giao-dien.css`: Mobile overflow fix (`overflow-x:hidden`, `max-width:100%`, `word-break:break-word`)
- [x] `giao-dien.css`: `.btn-da-dat` CSS, PC card height equalize (`.slot-card{display:flex;flex-direction:column}`)
- [x] `index.html` (guest section): Gender pill `-webkit-user-select:none; -webkit-tap-highlight-color:transparent`
- [x] `phan-he-khach-choi.js`: `daDatSet` — check slot đã đặt khi render, truyền vào `_taoCaCard()`
- [x] `phan-he-khach-choi.js`: Button "ĐÃ ĐẶT" inline update sau đặt slot thành công (không reload trang)
- [x] `phan-he-khach-choi.js`: `_dinhNgayMacDinh()` — auto-fill đầu tháng / hôm nay khi mở dashboard
- [x] `phan-he-khach-choi.js`: Block đăng nhập khi `is_active === false` → toast + return

**Phân hệ 3 — index.html (host section) + phan-he-host.js:**
- [x] `giao-dien.css`: Mobile overflow host, ẩn native time/date picker icon (`::-webkit-calendar-picker-indicator`)
- [x] `index.html` host section: Tăng max-width 1280px → 1600px (2-col layout đã sẵn)
- [x] `index.html` host section: SVG shuttlecock inline thay Font Awesome feather icon cho checkbox "Cầu"
- [x] `phan-he-host.js`: Fix Nominatim bbox — dùng `d.boundingbox` từ API, fallback `±0.005`
- [x] `phan-he-host.js`: `_formatInputTienTe()` + `_layGiaTriThoInput()` helpers (utility, không gắn oninput vào type=number)

**Phân hệ 4 — admin/index.html + phan-he-quan-tri.js:**
- [x] `admin/index.html`: Đổi tab "Big Data Khách" → "Quản Lý Thành Viên" + cập nhật title/description
- [x] `admin/index.html`: Thêm `<th>⭐ Sao TB</th>` + `<th>Hành động</th>`, colspan 7→9
- [x] `admin/index.html`: Modal `#modalThanhVienOverlay` + `#modalThanhVienBody` trước `</body>`
- [x] `phan-he-quan-tri.js`: `let reviewMap = {}` module-level
- [x] `phan-he-quan-tri.js`: `_taiDanhSachKhach()` — load `danh_gia_tin_dung` song song, build `reviewMap`, render cell Sao TB + Hành động dropdown (9 cột)
- [x] `phan-he-quan-tri.js`: `moHanhDongThanhVien()` + click-outside listener
- [x] `phan-he-quan-tri.js`: `moModalSuaThanhVien()` — pre-filled form, show modal
- [x] `phan-he-quan-tri.js`: `luuSuaThanhVien()` — PATCH nguoi_dung, reload table
- [x] `phan-he-quan-tri.js`: `doiVaiTroThanhVien()` — toggle guest↔host
- [x] `phan-he-quan-tri.js`: `capLaiMatKhau()` — set `mat_khau_hash = null`
- [x] `phan-he-quan-tri.js`: `khoaMoTaiKhoan()` — toggle `is_active`
- [x] `phan-he-quan-tri.js`: `xoaTaiKhoan()` — double confirm + DELETE (giữ dat_slot)
- [x] `phan-he-quan-tri.js`: `dongModalThanhVien()` + click-outside-modal listener
- [x] `phan-he-quan-tri.js`: `xemDanhGiaThanhVien()` — modal chi tiết đánh giá, phân màu Host(green)/Guest(purple)
- [x] `phan-he-quan-tri.js`: `xoaDanhGia()` — xóa bài đánh giá, cập nhật reviewMap local, reload modal + bảng

**Kiểm tra chất lượng phiên 4:**
- [x] Syntax check `node --check` tất cả 5 file JS → ✅ 0 lỗi

**SQL cần user chạy thủ công (Phân hệ 5 — Supabase Dashboard):**
- [ ] Verify bảng `nguoi_dung` đã có cột `is_active BOOLEAN DEFAULT TRUE` và `mat_khau_hash TEXT`
- [ ] RLS policies đủ cho 7 bảng (xem `supabase-schema.sql`)
- [ ] INSERT cấu hình rows với ON CONFLICT DO NOTHING

---

### 2️⃣ KIẾN TRÚC HIỆN TẠI

#### Cơ sở dữ liệu Supabase (6 bảng — đã tạo thành công):

```
quan_ly_key          ca_dau                dat_slot
─────────────        ──────────────────    ──────────────────────
ma_key (PK/TEXT)     id (PK/UUID)          id (PK/UUID)
ten_host             ma_key_host ──FK──►   id_ca_dau ──FK──► ca_dau.id
sdt_host             tinh_thanh            ten_khach
so_ngay_duoc_xai     quan_huyen            sdt_khach
trang_thai           ten_san               ma_slot
id_thiet_bi          dia_chi_san           gioi_tinh ('male'|'female')
ngay_kich_hoat       ngay_danh             trang_thai_di_danh
ngay_het_han         gio_bat_dau           thoi_gian_dat
                     gio_ket_thuc
                     so_gio_choi           danh_gia_tin_dung
                     gioi_tinh_can         ──────────────────────
                     yeu_cau_trinh_do (J)  id (PK/UUID)
                     gia_nam               id_ca_dau ──FK──► ca_dau.id
                     gia_nu                sdt_nguoi_viet
                     tien_ich_bao_gom (J)  sdt_nguoi_bi_danh_gia
                     da_chot_ca (bool)     loai_danh_gia
                     ...                   so_sao
                                           nhan_xet
khach_vang_lai        cau_hinh_he_thong    created_at (NO UPDATE)
─────────────────     ─────────────────
⚠️ LEGACY ONLY        id (PK/TEXT)         gop_y_he_thong
Fallback migration    noi_dung_thong_bao   ──────────────────
Dùng nguoi_dung       ── 8 rows config:    id (PK/UUID)
thay thế              popup_chinh          ten_user, sdt_user
                      so_keo_hien_thi      so_sao, loai_gop_y
                      so_thanh_vien        noi_dung
                      qr_donate            created_at
                      tieu_de_donate
                      text_donate
                      telegram_bot_token
                      telegram_chat_id
```

#### Luồng dữ liệu (State Flow):

```
BROWSER STATE (localStorage — chỉ 2 loại dữ liệu):
  tvl_host_key  → { ma_key, ten_host, ngay_het_han } (Host đăng nhập)
  tvl_guest     → { ten_khach, sdt_khach, ngay_tham_gia } (Khách đăng nhập)

SUPABASE (tất cả I/O nghiệp vụ):
  window.khoDuLieuVinhVien  ← ket-noi-supabase.js (REST API trực tiếp)
       ↑
  window.dbEngine  ← bo-may-du-lieu.js (proxy + error toast)
       ↑
  phan-he-*.js  (logic nghiệp vụ)
       ↑
  *.html  (UI, event handlers)

LỖI MẠNG → hienLoiMang() → hienToast("error") — KHÔNG fallback localStorage nghiệp vụ
```

#### Kiến trúc file hệ thống:
```
tuyenvanglai.io.vn/
├── index.html                ✅ SPA chính — host + khách + trang chủ
├── 404.html                  ✅ Hoàn chỉnh
├── admin/
│   └── index.html            ✅ Hoàn chỉnh v3.0
├── vercel.json               ✅ Hoàn chỉnh
├── ket-noi-supabase.js       ✅ Hoàn chỉnh (JWT key chuẩn)
├── bo-may-du-lieu.js         ✅ Hoàn chỉnh v2.0
├── hieu-ung-giao-dien.js     ✅ Hoàn chỉnh
├── phan-he-ung-dung.js       ✅ Hoàn chỉnh (SPA routing)
├── phan-he-host.js           ✅ Hoàn chỉnh v2.0
├── phan-he-khach-choi.js     ✅ Hoàn chỉnh v3.0
├── phan-he-quan-tri.js       ✅ Hoàn chỉnh v3.0
├── phan-he-gop-y.js          ✅ Hoàn chỉnh
├── giao-dien.css             ✅ Hoàn chỉnh
├── components.css            ✅ Hoàn chỉnh v5.0
├── supabase-schema.sql       ✅ Đã chạy thành công trên Supabase
├── cms-seed.sql              ✅ Đã tạo
└── migration-nguoi-dung.sql  ✅ Đã tạo
```

---

### 3️⃣ QUYẾT ĐỊNH CỐ ĐỊNH (KHÔNG ĐƯỢC THAY ĐỔI)

#### A. Kiến trúc & Dữ liệu
| Quyết định | Lý do |
|---|---|
| **Chỉ 1 giao diện dark** — không có light/dark toggle | Người dùng đã xác nhận, bỏ toggle giảm complexity CSS |
| **localStorage chỉ lưu 2 loại** (ma_key Host + ten+sdt Khách) | Mọi dữ liệu nghiệp vụ phải từ Supabase, tránh data stale |
| **Không fallback localStorage** khi mất mạng | Hiện thông báo lỗi rõ ràng, tránh người dùng thao tác với data cũ/sai |
| **dat_slot PK là `id`** (không phải `id_slot`) | SQL thực tế dùng `id UUID DEFAULT gen_random_uuid()` |
| **3 PATCH riêng** vào `cau_hinh_he_thong` | Schema chỉ có `id` + `noi_dung_thong_bao` — không thể lưu nhiều field trong 1 row |

#### B. Logic Nghiệp Vụ Cốt Lõi
| Quyết định | Chi tiết | Lý do |
|---|---|---|
| **Huỷ slot = UPDATE**, không DELETE | `trang_thai_di_danh = "Khách hủy"` | Host/Admin vẫn theo dõi được lịch sử, kiểm soát bom hàng |
| **Khách KHÔNG thể đặt lại** sau khi huỷ | `existingSlots[0].trang_thai_di_danh === "Khách hủy"` → block | Ngăn lạm dụng đặt-huỷ-đặt lại |
| **Chỉ tính tiền** khi `da_chot_ca=true + "Đã tham gia"` | Tổng chi tiêu của khách | Số liệu tài chính phải khớp tiền thật đã thu |
| **Đánh giá bị khóa vĩnh viễn** sau khi gửi | `danh_gia_tin_dung`: chính sách DB NO UPDATE | Tránh hối lộ, chỉnh sửa đánh giá |
| **Chốt ca KHÔNG THỂ đảo ngược** | `da_chot_ca = TRUE` → host bị khóa hoàn toàn | Đảm bảo tính toàn vẹn dữ liệu tài chính |
| **Điều kiện đánh giá: 3 AND bắt buộc** | Xem chi tiết ở PHẦN III của CLAUDE.md | Đảm bảo đánh giá có căn cứ thực tế |

#### C. UI/UX Cố Định
| Quyết định | Chi tiết |
|---|---|
| **Palette chính** | `#0f1e35` nền · `#1a2844` card · `#e2e8f0` text · `#00ff88` accent · `#1e3a5f` border |
| **Font chính** | Inter (host/khach/admin), Bebas Neue + Barlow Condensed (index) |
| **Tên bảng nghiệp vụ** | `"nguoi_dung"` (chính) · `"quan_ly_key"` · `"ca_dau"` · `"dat_slot"` · `"danh_gia_tin_dung"` · `"gop_y_he_thong"` · `"cau_hinh_he_thong"` · `"khach_vang_lai"` (legacy) |
| **Google Maps** | `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` — không dùng API key |
| **Mã Key Host** | Format `TVL-XXXXX-XXXX` (chữ hoa + số, bỏ I/O/1/0) |
| **Mã Slot Khách** | Format `SLOT-XXXXX` (5 ký tự random base36 uppercase) |
| **Status tiếng Việt** | `"Chưa kích hoạt"` / `"Đang chạy"` / `"Bị khóa"` (không dùng English) |
| **Admin credentials** | `ADMIN_USER="admin"`, `MAT_MAU_ADMIN="TVL@2026"` (hardcoded, đổi trước deploy thật) |

---

### 4️⃣ KẾ HOẠCH PHIÊN SAU

#### 🔴 TASK 1 (ưu tiên cao nhất): Test & Verify End-to-End
**Mục tiêu:** Xác nhận toàn bộ hệ thống chạy đúng với Supabase thật.

**Checklist test theo luồng:**
```
1. Admin tạo key mới → verify xuất hiện trong bảng quan_ly_key trên Supabase dashboard
2. Host nhập key → verify trang_thai chuyển "Đang chạy", id_thiet_bi được ghi
3. Host đăng kèo → verify record mới trong bảng ca_dau
4. Khách đăng nhập → verify record trong nguoi_dung (sdt_khach, ten_khach, mat_khau_hash)
5. Khách bấm "Chi tiết" → modal hiện đầy đủ thông tin
6. Khách bấm "ĐẶT SLOT" → verify record trong dat_slot (trang_thai_di_danh="Chờ đánh")
7. Khách bấm "Huỷ" → verify trang_thai_di_danh="Khách hủy" (không xóa record)
8. Host vào danh sách khách → thấy slot vừa đặt
9. Host cập nhật "Đã tham gia" → verify trong dat_slot
10. Host bấm "Chốt Ca" → verify da_chot_ca=true, form bị disable
11. Khách vào Lịch Sử Chi Tiêu → ca chốt hiện giá tiền, ca chưa chốt hiện badge "Chờ chốt ca"
12. Khách đánh giá host → verify record trong danh_gia_tin_dung
13. Host đánh giá khách → verify record + loai_danh_gia="HostToGuest"
14. Khách xem "Đánh Giá Về Tôi" → thấy đánh giá từ host
15. Admin xem Big Data → thấy khách + số buổi + tổng chi (chỉ ca đã chốt)
```

**Nếu gặp lỗi khi test**, ưu tiên kiểm tra:
- RLS policy trên Supabase có cho phép anon INSERT/UPDATE không (xem `supabase-schema.sql`)
- JWT anon key trong `ket-noi-supabase.js` còn hiệu lực không (check Supabase dashboard)
- `dbEngine` có đang dùng đúng tên bảng không (console log trước mỗi call)

---

#### 🟡 TASK 2: GĐ4A — Dashboard Doanh Thu Host
**File cần sửa:** `index.html` (host section) + `phan-he-host.js`

**Mô tả chi tiết:**
- Thêm subtab "📊 Doanh Thu" trong host workspace (#dang-quan-ly)
- 4 metric cards: Tổng Ca Đấu · Ca Đã Chốt · Tổng Khách Tham Gia · Doanh Thu Ước Tính
- Bảng lịch sử ca đấu: Ngày · Sân · Số Khách · Tổng Thu · Trạng thái
- Bộ lọc thời gian: Tuần này / Tháng này / Năm nay / Tùy chọn

**Logic tính doanh thu:**
```javascript
// Chỉ tính ca đã chốt
caDauCuaHost.filter(c => c.da_chot_ca)
  .map(c => {
    const datSlots = datSlotMap[c.id] || [];
    const soKhachDiDanh = datSlots.filter(s => s.trang_thai_di_danh === "Đã tham gia").length;
    const doanhThu = datSlots
      .filter(s => s.trang_thai_di_danh === "Đã tham gia")
      .reduce((sum, s) => sum + (s.gioi_tinh === "female" ? c.gia_nu : c.gia_nam), 0);
    return { ...c, soKhachDiDanh, doanhThu };
  });
```

**Hàm cần thêm vào `phan-he-host.js`:**
- `window.chuyenSubTabHost(tabName)` — điều hướng subtab
- `_taiDoanhThuHost()` — load & render dashboard doanh thu

---

#### 🟡 TASK 3: GĐ4B — Export/In Ca Đấu
**File cần sửa:** `phan-he-host.js` + `index.html` (host section)

**Hàm cần thêm vào `phan-he-host.js`:**
```javascript
window.inCaDau = function(idCaDau) {
    // Popup print với danh sách khách + mã slot
    const win = window.open("", "_blank");
    win.document.write(`<html>...print layout...</html>`);
    win.print();
};

window.xuatCSVCaDau = function(idCaDau) {
    // Blob CSV → download link
    const csv = "Tên,SĐT,Mã Slot,Trạng thái\n" + guests.map(g => ...).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ca-dau-${idCaDau}.csv`; a.click();
};
```

---

#### 🟢 TASK 4: Deploy lên Vercel
**Bước thực hiện:**
1. Tạo GitHub repo mới (public hoặc private)
2. Push toàn bộ thư mục `d:\TUYENVANGLAI.IO.VN\` lên repo
3. Vào [vercel.com](https://vercel.com) → Import GitHub repo
4. Framework: Other (static site)
5. Build command: để trống
6. Output directory: để trống (root)
7. Sau khi deploy → thêm custom domain `tuyenvanglai.io.vn` trong Vercel dashboard
8. Cập nhật DNS của domain: CNAME → `cname.vercel-dns.com`

**File `vercel.json` đã có sẵn** — Vercel sẽ tự nhận diện.

---

#### 🟢 TASK 5 (nice-to-have): Biểu Đồ Admin
**File cần sửa:** `admin/index.html` + `phan-he-quan-tri.js`

Thêm CDN Chart.js vào `admin/index.html`:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

3 biểu đồ trong tab Thống Kê:
- Line chart: Doanh thu theo tháng (6 tháng gần nhất)
- Bar chart: Số ca đấu theo tỉnh (top 10)
- Doughnut chart: Phân bố trạng thái Key (Đang chạy / Bị khóa / Hết hạn / Chưa kích hoạt)

---

*File này là kim chỉ nam tuyệt đối. Mọi phiên làm việc tiếp theo phải đọc và tuân thủ 100% nội dung trên.*

---

## Quy tắc làm việc khi bị limit
- Trước khi bắt đầu bất kỳ task dài nào, tạo hoặc cập nhật file TODO.md liệt kê từng bước cụ thể.
- Sau mỗi bước hoàn thành, đánh dấu [x] vào TODO.md ngay lập tức.
- Nếu được resume sau khi bị limit, đọc TODO.md trước tiên để biết đang ở bước nào và tiếp tục từ đó.

---

## 📦 PHẦN XI: CONTEXT MANAGEMENT (TỰ ĐỘNG DUY TRÌ)

> Mục đích: Duy trì context liên tục giữa các phiên làm việc, kể cả sau khi /compact.

### Rules (bắt buộc)
- **Trước mỗi lần compact:** PHẢI cập nhật TODO.md và `Current State` trong PHẦN XI này.
- **Dùng `/compact-save`** thay cho `/compact` để đảm bảo context không bị mất.
- Sau mỗi task lớn AI **phải tự cập nhật** `Current State` và `Modified Files` mà không cần nhắc.
- Khi context đạt ~60%, tự động cập nhật CLAUDE.md + TODO.md rồi thông báo: "⚠️ Context ~60%, nên chạy /compact-save ngay"
- Khi context đạt ~80%, BẮT BUỘC nhắc: "🔴 Context ~80%, chạy /compact-save NGAY trước khi mất context"

---

### Current State (cập nhật: 2026-06-05)

**Stack đã detect:**
- HTML5 / Vanilla JS SPA — không framework
- Supabase REST (anon key) qua `window.khoDuLieuVinhVien`
- CSS: Dark Cyberpunk, Mobile-First, `#0f1e35` nền / `#00ff88` accent
- Deploy target: Vercel (đã deploy production tại domain thật)
- Cloudflare Turnstile site key: `0x4AAAAAADeiC_0mMTnc07rd`
- FingerprintJS v3 CDN tích hợp

**Trạng thái các phân hệ:**
| Phân hệ | File | Trạng thái | Ghi chú |
|---|---|---|---|
| Kết nối DB | `ket-noi-supabase.js` | ✅ Ổn định | JWT anon key chuẩn |
| Dữ liệu | `bo-may-du-lieu.js` | ✅ Ổn định | 63 tỉnh, SHUTTLECOCK_BRANDS |
| Hiệu ứng | `hieu-ung-giao-dien.js` | ✅ Ổn định | toast, hologram glow |
| SPA routing | `phan-he-ung-dung.js` | ✅ v2.0 | Phiên 06-05: logo flash bug fix, `_apLogoImg` chỉ show sau onload |
| CSS toàn cục | `giao-dien.css` | ✅ v6.0 | Phiên 06-05: trust badge, scam banner, phone mask, pending host badge |
| CSS component | `components.css` | ✅ Ổn định | v5.0 |
| Host Portal | `phan-he-host.js` | ✅ v5.0 | Phiên 06-05: 8 security modules + DOMContentLoaded guard fix + toast message update |
| Host HTML | `index.html` (host section) | ✅ v5.0 | Phiên 06-05: Turnstile widget đăng bài, toggle cọc, profileTrustScore element |
| Khách | `phan-he-khach-choi.js` | ✅ v5.0 | Phiên 06-05: 8 security modules + DOMContentLoaded guard fix + trust badge host |
| Admin logic | `phan-he-quan-tri.js` | ✅ v4.0 | Phiên 06-05: whitelist, báo cáo tab, phạt gậy ngược + fingerprint blacklist |
| Admin HTML | `admin/index.html` | ✅ v4.0 | Phiên 06-05: tab "Báo Cáo" (tab 7), whitelist checkbox trong modal |
| Góp ý | `phan-he-gop-y.js` | ✅ Ổn định | |
| Security | `security-migration.sql` | ✅ Đã tạo | Chờ user chạy trên Supabase Dashboard |
| Schema DB | `supabase-schema.sql` | ✅ Đã deploy | |
| 404 | `404.html` | ✅ Hoàn chỉnh | |
| Vercel routing | `vercel.json` | ✅ Hoàn chỉnh | |

**Những gì hoạt động chắc chắn:**
- Guest vào trang chủ → xem kèo tự do, không bị redirect (DOMContentLoaded guard đã fix)
- Trust Score: hủy slot tính thời gian (-7/-3/0đ), ghost report (-15đ), tham gia (+2đ), free pass
- Phone masking: 096XXXX567, nút 👁 reveal chỉ khi login
- Ranking: `trust*0.6 + stars*0.4`, host trust<70 xuống cuối
- Scam banner đỏ khi host chưa đủ quyền nhưng text chứa từ khóa cọc
- Report: khách đã tham gia → báo cáo → ≥3 báo cáo → ca đóng băng tự động
- Admin: whitelist, tab Báo Cáo, phạt gậy ngược (BAN + fingerprint blacklist)
- FingerprintJS: chặn 1 thiết bị tạo >1 tài khoản trong 48h
- Turnstile: site key thật `0x4AAAAAADeiC_0mMTnc07rd`, smart session 7 ngày

**Known issues / chưa verify:**
- `security-migration.sql` chưa được chạy trên Supabase → các cột mới (diem_uy_tin, is_whitelisted...) chưa có trong DB
- Turnstile server-side verification cần Supabase Edge Function (hiện chỉ client-side)
- Tài khoản cũ có hash sai từ phiên 06-04 → cần admin XOÁ HASH + reset lại
- HUD số liệu (45 ca / 1820 thành viên) là fallback cứng

---

### Recent Decisions (phiên 2026-06-05)
| Quyết định | Lý do |
|---|---|
| DOMContentLoaded guard: `window.khoiTaoUngDung` thay vì `pathname.includes('/feed')` | App deploy ở root `/` không phải `/feed/` → guard cũ không chặn được, gây auto-redirect guest |
| `_apLogoImg()` chỉ set `display:block` trong `doSwap()` (sau onload) | Set trước onload → ảnh trống + text logo hiện cùng lúc → flash |
| `_apDungBrandConfig()` luôn gọi `_apLogoImg()` sau fetch | Bug: lưu cache xong đọc lại so sánh → bằng nhau → không bao giờ gọi lần đầu |
| Trust badge (✅/⚠️/🔴) inline trong card host banner | Không cần thêm API call mới — trust đã có trong `hostMap` sau khi fetch `allUsers` |
| Block đăng bài khi uy tín < 60 (không phải < 40) | Spec: 40-59 là "rủi ro cao" → khóa đăng bài; dưới 40 mới BAN tài khoản |
| `adminThaBC` BAN + fingerprint blacklist (phạt gậy ngược) | Spec Module 4: báo cáo giả mạo → BAN vĩnh viễn + add fingerprint vào blacklist |
| Turnstile site key `0x4AAAAAADeiC_0mMTnc07rd` hardcode vào HTML | User cung cấp key chính thức; replace `YOUR_SITE_KEY` placeholder |

---

### Modified Files (phiên 2026-06-05)
| File | Thay đổi |
|---|---|
| `security-migration.sql` | **MỚI** — ALTER TABLE nguoi_dung/ca_dau + CREATE TABLE bao_cao/fingerprint_blacklist |
| `giao-dien.css` | Trust score bar, scam banner, phone mask chip, pending-host badge CSS |
| `phan-he-khach-choi.js` | 8 security modules; phone mask; ranking; trust badges; DOMContentLoaded guard fix; toast messages |
| `phan-he-host.js` | Module 3 (scam); Module 2 (ghost report, block đăng bài, Turnstile); DOMContentLoaded guard fix; toast messages |
| `phan-he-quan-tri.js` | Module 8 (whitelist + `_luuUyTinTV`); Module 4 admin (báo cáo, phạt/tha/khôi phục + fingerprint) |
| `phan-he-ung-dung.js` | Logo flash bug fix (async fetch + onload-only swap); cache-busting `?v=2` |
| `index.html` | FingerprintJS CDN; Turnstile CDN + widget (login form + đăng bài); toggle cọc; `profileTrustScore` div; Turnstile site key thật |
| `admin/index.html` | Tab "Báo Cáo" (tab 7); checkbox `is_whitelisted` + input `diem_uy_tin` trong modal thành viên |
