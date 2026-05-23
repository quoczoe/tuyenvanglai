# SYSTEM INSTRUCTIONS & MASTER BLUEPRINT: TUYENVANGLAI.IO.VN
> **"CHỢ KÈO VÃNG LAI"** — Kim chỉ nam vĩnh viễn cho toàn bộ phiên làm việc.
> Phiên bản: 1.0 | Cập nhật: 2026-05-23

---

## 🛠️ PHẦN I: HẠ TẦNG CÔNG NGHỆ CỐ ĐỊNH (CORE DATA ENGINE)

### 1.1 Kiến trúc hệ thống
- **Loại:** Web tĩnh thuần — **HTML5 / Vanilla JavaScript** (KHÔNG dùng bất kỳ framework nào: không React, không Vue, không Angular).
- **Kết nối:** Gọi thẳng REST API đám mây từ phía client (không cần backend server riêng).
- **Hosting:** Deploy trên **GitHub Pages** hoặc **Vercel**.

### 1.2 Hệ thống dữ liệu địa lý tĩnh
- **File:** `data-dia-ly.js`
- **Đối tượng xuất ra:** `KHO_DATA_DIA_LY`
- **Cấu trúc phân cấp:**
  ```
  KHO_DATA_DIA_LY
  ├── Nam (Miền Nam)
  │   ├── Tỉnh/Thành phố
  │   │   └── Quận/Huyện[]
  ├── Trung (Miền Trung)
  │   └── ...
  └── Bắc (Miền Bắc)
      └── ...
  ```
- **Lưu ý quan trọng:** TP. Hồ Chí Minh và Hà Nội phải luôn được ưu tiên đẩy lên **đầu danh sách** trong dropdown tương ứng.

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
- **Chế độ màu:** Dark Mode là **mặc định**. Phải có nút switch chuyển đổi sang Light Mode.
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
**File:** `/admin-toi-cao.html`

#### 1.1 Xác thực & Bảo mật
- Đường dẫn **ẩn** — không xuất hiện trên menu công khai.
- Đăng nhập bằng tài khoản/mật khẩu cứng (hardcoded), xử lý **hoàn toàn nội bộ** trên client.
- Sai thông tin đăng nhập → chặn truy cập.

#### 1.2 Quản lý phân phối SaaS (Mã Key Host)
**Sinh mã Key:**
- Định dạng: `TVL-XXXXX-XXXX` (ký tự chữ hoa + số ngẫu nhiên)
- Ví dụ: `TVL-A3K9P-7X2Q`

**Thao tác CRUD trên Key:**
| Thao tác | Mô tả |
|---|---|
| Thêm mới | Tạo Key mới với đầy đủ tham số |
| Sửa thông tin | Cập nhật Tên Host, SĐT, Cấp gói, Số ngày |
| Xóa | Xóa vĩnh viễn khỏi hệ thống |
| Khóa/Mở khóa | Thay đổi trạng thái lập tức |
| Reset thiết bị | Xóa `id_thiet_bi` trong bảng `quan_ly_key` để giải phóng Key khi Host đổi điện thoại |

**Tham số của mỗi Key:**
```
- Tên Host (ten_host)
- SĐT Host (sdt_host)
- Cấp độ gói (goi_dich_vu)
- Trạng thái: "Chưa kích hoạt" | "Đang chạy" | "Bị khóa"
- Số ngày sử dụng: mặc định 30 ngày (so_ngay_duoc_xai)
- ID thiết bị (id_thiet_bi) — dùng để ràng buộc thiết bị
- Ngày kích hoạt (ngay_kich_hoat)
- Ngày hết hạn (ngay_het_han)
```

#### 1.3 Đồng bộ & Big Data Marketing
- Admin nhận được **Dashboard tổng hợp** thu thập tự động:
  - Toàn bộ danh sách Khách vãng lai từ **tất cả các Host**
  - Thông tin: Họ tên, SĐT Zalo, Ngày tham gia
- Mục đích: Làm Big Data phục vụ chiến dịch tiếp thị sau này.

#### 1.4 Quyền lực tối cao
Admin là người duy nhất có quyền:
- ✅ Can thiệp, chỉnh sửa, ghi đè bất kỳ số liệu ca đấu nào
- ✅ Xóa bỏ đơn đặt slot của bất kỳ khách nào
- ✅ Xóa hoặc chỉnh sửa bất kỳ bài đánh giá nào
- ✅ Bổ sung dữ liệu vào bất kỳ bảng nào

#### 1.5 Cấu hình thông báo trang chủ
- **Form chỉnh sửa** nội dung thông báo popup hiển thị cho Khách ngoài.
- **Lưu vào Supabase:** Bảng `cau_hinh_he_thong`, cột `noi_dung_thong_bao`, dòng có `id = 'popup_chinh'`.

---

### 💰 PHÂN HỆ 2: TRẠM LÀM VIỆC CHỦ SÂN (HOST)
**File:** `/host.html`

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
**File:** `/khach.html`

#### 3.1 Đăng nhập nhanh (Không mật khẩu)
- Nhập **Tên / Biệt danh** + **SĐT Zalo**.
- Lưu trạng thái vào `localStorage` → Tự động nhận diện cho lần truy cập sau.
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

> Mọi luồng logic phải ánh xạ chính xác vào **5 bảng PostgreSQL** sau:

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
| `id_slot` | `UUID` | **Primary Key** — Auto-generate |
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

### Bảng 5: `cau_hinh_he_thong` — Tham số Vận hành
| Cột | Kiểu dữ liệu | Ghi chú |
|---|---|---|
| `id` | `TEXT` | **Primary Key** — Nhận giá trị định danh cố định |
| `noi_dung_thong_bao` | `TEXT` | Nội dung thông báo / cấu hình |

**Các dòng cố định (Seeded data):**
```sql
INSERT INTO cau_hinh_he_thong (id, noi_dung_thong_bao) VALUES
  ('popup_chinh',    'Nội dung thông báo mặc định cho Khách ngoài trang chủ...'),
  ('host_access_key', '...');
```

---

## 🗂️ PHẦN V: CẤU TRÚC FILE DỰ ÁN

```
tuyenvanglai.io.vn/
├── index.html               ← Trang chủ (hiển thị popup thông báo cho Khách)
├── khach.html               ← Sàn Khách Vãng Lai (Guest Portal)
├── host.html                ← Trạm Chủ Sân (Host Workspace)
├── admin-toi-cao.html       ← Admin tối cao (đường dẫn ẩn)
├── data-dia-ly.js           ← Dữ liệu địa lý tĩnh (KHO_DATA_DIA_LY)
├── kho-du-lieu.js           ← window.khoDuLieuVinhVien (Supabase connector)
├── styles/
│   ├── main.css             ← CSS toàn cục (Dark/Light mode, Cyberpunk theme)
│   └── components.css       ← CSS component (buttons, cards, modals...)
└── assets/
    ├── logo.svg
    └── icons/
```

---

## 🚀 PHẦN VI: CHECKLIST TRƯỚC KHI XUẤT CODE

Trước khi xuất bất kỳ file code nào, AI phải tự kiểm tra:

- [ ] Giao diện theo chuẩn Shadcn UI + Cyberpunk, Mobile-First, có Dark/Light mode switch
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
| `bo-may-du-lieu.js` | `window.dbEngine` (Supabase → LocalStorage fallback) + `window.MOCK_PROVINCES` (63 tỉnh) + `window.SHUTTLECOCK_BRANDS` | 2026-05-23 |
| `hieu-ung-giao-dien.js` | `chuyenDoiTheme`, `khoiTaoTheme`, `khoiTaoHologramGlow`, `hienToast` | 2026-05-23 |
| `giao-dien.css` | CSS toàn cục — Dark/Light mode, Cyberpunk theme, layout HUD, modal, table, button base | 2026-05-23 |
| `phan-he-chu-san.js` | Toàn bộ logic Host: xác thực key, đăng kèo, kế toán, cầu bidirectional sync, smart pricing, Chốt Ca, quản lý khách, đánh giá | 2026-05-23 |
| `phan-he-khach-choi.js` | Toàn bộ logic Khách: đăng nhập nhanh, 8-filter tìm kèo, đặt slot SLOT-XXXXX, hồ sơ 4-thống kê, đánh giá host | 2026-05-23 |
| `phan-he-quan-tri.js` | Toàn bộ logic Admin: xác thực cứng, CRUD key TVL-XXXXX-XXXX, big data khách, kiểm duyệt đánh giá, cấu hình popup | 2026-05-23 |
| `host.html` | Giao diện Trạm Chủ Sân v2 — Inter font, dark-only, hs-* design system, nút Maps xanh lá, filter tabs (Tất cả/Đang chạy/Đã đóng), alternating table rows, form validation style | 2026-05-23 |
| `khach.html` | Giao diện Sàn Khách v2 — Inter font, dark-only, kh-* design system, filter bar sticky top:68px, avatar 64px, stats 4-badge compact, logout đỏ, nút ĐẶT SLOT gradient xanh lá to | 2026-05-23 |
| `admin.html` | Giao diện Admin v2 — Inter font, dark-only, ad-* design system, dashboard 4 metric cards (Tổng Key/Đang Dùng/Hết Hạn/Tổng Host), filter pills 5 trạng thái key, alternating table rows, auto highlight sắp hết hạn | 2026-05-23 |
| `components.css` | Component system v5.0 — btn-mini, status-badge, radio/checkbox pill, host-status-bar, shuttlecock grid, pricing sug, slot card, stats-grid-4, gender-badge, tien-ich, maps sug | 2026-05-23 |
| `index.html` | **v5.2 — 6 fixes**: Section "Tại sao chọn?" (3 feature card ngang), fallback HUD 45 CA ĐẤU / 1820 THÀNH VIÊN, title mobile -20% (`clamp(1.12rem,7.2vw,1.6rem)`), disabled card dim icon (không dim text), badge-gold overflow fix mobile, Barlow Condensed h1-h6 toàn trang | 2026-05-23 |
| `404.html` | Trang 404 riêng: số 404 gradient neon, shuttlecock xoay, nút quay về trang chủ + back, quick links | 2026-05-23 |
| `vercel.json` | Redirect /admin → /admin.html, /host → /host.html, /khach → /khach.html, /index → /index.html. Thêm route 404 catch-all | 2026-05-23 |

---

### 🔄 ĐANG DỞ / CẦN KIỂM TRA

| File / Task | Vấn đề / Việc cần làm |
|---|---|
| `index.html` | Số liệu HUD đã có fallback mặc định 45/1820 — cần test trên production với Supabase thật để verify số liệu thật ghi đè đúng |
| **Supabase Schema** | Chưa xác nhận 5 bảng (`quan_ly_key`, `ca_dau`, `dat_slot`, `danh_gia_tin_dung`, `cau_hinh_he_thong`) đã được tạo trên Supabase dashboard |
| **RLS Policies** | Row Level Security trên Supabase chưa được cấu hình — cần thiết lập trước khi deploy production |

---

### ⏳ CHƯA LÀM / BACKLOG

| Task | Mức độ ưu tiên | Ghi chú |
|---|---|---|
| Deploy lên GitHub Pages / Vercel | 🔴 Cao | Cần config domain `tuyenvanglai.io.vn` trỏ về hosting |
| Tạo script SQL tạo 5 bảng Supabase | 🔴 Cao | Cần chạy trên Supabase SQL Editor trước khi test thật |
| Cấu hình RLS Supabase | 🔴 Cao | Anon key cần được giới hạn quyền theo từng bảng |
| Test end-to-end luồng Host → Khách | 🟡 Trung | Kiểm tra: tạo key → đăng kèo → khách đặt slot → chốt ca → đánh giá |
| Test realtime sync (nhiều thiết bị) | 🟡 Trung | Supabase Realtime subscription cho slot card cập nhật tức thời |
| `data-dia-ly.js` độc lập | 🟢 Thấp | CLAUDE.md đặc tả file này nhưng dữ liệu hiện đang nằm trong `bo-may-du-lieu.js` (window.MOCK_PROVINCES). Tách ra nếu cần scale |
| PWA / Offline mode | 🟢 Thấp | Service Worker + manifest.json để cài được như app |
| Push notification khi có khách đặt slot | 🟢 Thấp | Web Push API hoặc dùng Zalo OA |

---

### 📝 GHI CHÚ KỸ THUẬT QUAN TRỌNG

- **Dữ liệu địa lý:** `window.MOCK_PROVINCES` (63 tỉnh) nằm trong `bo-may-du-lieu.js` — **không** có file `data-dia-ly.js` riêng như CLAUDE.md đặc tả ban đầu.
- **CSS versioning:** Toàn bộ hệ thống đã đồng bộ lên `?v=5.0`. Nếu sửa CSS thì tăng version để busting cache.
- **index.html màu sắc:** `#0a1628` nền, `#00ff88` accent xanh neon (mệnh Dương Liễu Mộc 2002), `#1a4a7a` navy phụ, `#f0f0f0` text. Dark mode duy nhất — không có light mode toggle. Font: Bebas Neue (brand title) + Barlow Condensed (h1-h6 toàn trang). Fallback HUD: 45 CA ĐẤU / 1820 THÀNH VIÊN.
- **index.html section layout:** Hero → CTA → HUD metrics → Sport branches (4-col/2×2) → Gateway cards (Guest/Host) → "Tại sao chọn?" (3 icon card ngang) → Footer.
- **404 routing:** `vercel.json` có catch-all route → `/404.html`. Nếu dùng GitHub Pages cần tạo file `404.md` hoặc copy `404.html`.
- **Admin URL:** File là `admin.html` (không phải `admin-toi-cao.html` như CLAUDE.md đặc tả). Đường dẫn thực tế: `/admin.html`.
- **dbEngine fallback:** Khi Supabase không kết nối được, hệ thống tự động chuyển sang LocalStorage sandbox — dữ liệu chỉ tồn tại trong browser, mất khi clear cache.
- **Chốt Ca:** Sau khi `da_chot_ca = true`, chỉ Admin mới có thể can thiệp dữ liệu. Host bị khóa hoàn toàn.

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
| `host.html` | ✅ | ✅ | ✅ | ✅ |
| `khach.html` | ✅ | ✅ | ✅ | ✅ |
| `admin.html` | ✅ | ✅ | ✅ | ✅ |
| `404.html` | ✅ | ❌ (không cần) | ✅ | ❌ |

---

*File này là kim chỉ nam tuyệt đối. Mọi phiên làm việc tiếp theo phải đọc và tuân thủ 100% nội dung trên.*
