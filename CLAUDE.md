# TUYENVANGLAI.IO.VN — "CHỢ KÈO VÃNG LAI"
> Phiên bản rút gọn. Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DECISIONS.md](docs/DECISIONS.md) · [docs/HISTORY.md](docs/HISTORY.md)

---

## STACK & CONVENTIONS

- **HTML5 / Vanilla JS SPA** — không React/Vue/Angular
- **Supabase REST** qua `window.khoDuLieuVinhVien` (KHÔNG gọi fetch trực tiếp tới Supabase)
- **Dark Mode duy nhất** — Cyberpunk, Mobile-First, không toggle
- **Toàn bộ UI text + comment = tiếng Việt**
- **Code 100%** — không placeholder, không TODO, copy-paste là chạy ngay

## SUPABASE
```
URL:      https://kyidswbpfafsoqsdhfpu.supabase.co
ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5aWRzd2JwZmFmc29xc2RoZnB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDI1ODksImV4cCI6MjA5NDkxODU4OX0.ustQ0xaRQqxyCWid1dkC-1YuhX0yA0wQJ5JOyq98TRY
```
I/O bắt buộc qua: `window.khoDuLieuVinhVien.ghiData / docData / xoaData`
Proxy: `window.dbEngine.doc / ghi / xoa / docThu`

## AUTH
- **Admin**: `supabase.auth.signInWithPassword()` → JWT → `window._adminJWT`
- **Guest**: `guestRPC.login()` → UUID token → `tvl_guest._token` (localStorage)
- **Admin account**: mynameisanhquocpro@gmail.com | SĐT: 0961446003

## PALETTE & FONTS
```
#0f1e35 nền | #1a2844 card | #e2e8f0 text | #00ff88 accent | #1e3a5f border
Font: Inter (admin/host/guest) | Bebas Neue + Barlow Condensed (index.html)
```

## BẢNG DỮ LIỆU
```
nguoi_dung   — sdt_khach PK, mat_khau_hash, vai_tro, is_active, ma_key_host
quan_ly_key  — ma_key PK (TVL-XXXXX-XXXX), trang_thai (Chưa kích hoạt/Đang chạy/Bị khóa)
ca_dau       — id UUID PK, ma_key_host FK, sdt_nguoi_tao TEXT, da_chot_ca BOOL
dat_slot     — id UUID PK, id_ca_dau FK ON DELETE CASCADE, ma_slot (SLOT-XXXXX)
danh_gia_tin_dung — NO UPDATE sau INSERT
cau_hinh_he_thong — id TEXT PK (popup_chinh, qr_donate, telegram_*, ...)
gop_y_he_thong    — góp ý người dùng
khach_vang_lai    — LEGACY ONLY, không thêm logic mới
```

## BUSINESS RULES (BẤT BIẾN)
- `da_chot_ca = true` → Host bị khóa hoàn toàn, chỉ Admin can thiệp
- Huỷ slot = UPDATE `trang_thai_di_danh = "Khách hủy"` (không DELETE, không đặt lại)
- Tính tiền chỉ khi `da_chot_ca=true AND trang_thai_di_danh="Đã tham gia"`
- Đánh giá: 3 điều kiện AND (chốt ca + đã đăng ký + Đã tham gia)
- `danh_gia_tin_dung`: NO UPDATE sau INSERT

## SECURITY CHECKLIST (mỗi file HTML)
```javascript
// Disable chuột phải, F12, Ctrl+U, DevTools detect, console.clear
// user-select: none toàn trang; input/textarea được select
```

## CURRENT STATE (cập nhật: 2026-06-09 phiên 10)

### Trạng thái file
| File | Version | Ghi chú |
|---|---|---|
| `ket-noi-supabase.js` | v7.0 | supabaseAuth + guestRPC + _adminJWT |
| `bo-may-du-lieu.js` | v2.0 | dbEngine proxy, 63 tỉnh |
| `phan-he-ung-dung.js` | v3.1 | SPA routing + has-subtab toggle |
| `phan-he-host.js` | v8.0 | Ca Đã Đăng FULL: sort/filter/search/pagination/table-layout-fixed, TamKhoa, DS Khách no-reload DOM update, xemHoSoKhach, moQuickDanhGia |
| `phan-he-khach-choi.js` | v8.1 | SĐT reveal click-area, modal HồSơ ẩn SĐT, trust bar redesign |
| `phan-he-quan-tri.js` | v9.0 | gopY: sort/filter/pagination + _rank + compare tường minh |
| `phan-he-gop-y.js` | v2.0 | rate limit: 5/ngày + cooldown 5 phút |
| `index.html` | v10.0 | Ca Đã Đăng: table-layout:fixed colgroup%, flat card, CSS sticky, 7 modal; DS Khách: responsive, modal-ho-so-khach + modal-quick-dg thêm mới |
| `admin/index.html` | v9.0 | gopY tab: filter+pagination 1 hàng, sort STT, cột Người Dùng 320px |
| `cms-seed.sql` | v2.1 | thêm gop_y_auth_select + gop_y_auth_delete policy cho authenticated role |
| `giao-dien.css` | v7.1 | toast z-index: 1000→9999 (fix toast bị che modal) |
| `components.css` | v5.1 | slot-card margin:0, footer grid 22fr 37fr 41fr |

### Quyết định kỹ thuật quan trọng
- **table-layout:fixed + colgroup %**: Ca Đã Đăng — cố định tỷ lệ cột (4/13/26/13/13/13/18%), columns không nhảy khi chuyển trang
- **min-height:0 on flex child**: KEY FIX — flex child `.table-wrap` mặc định `min-height:auto` nên không shrink được, overflow-y không kích hoạt. Fix: `min-height:0`
- **overflow-x:clip thay hidden**: CSS `overflow-x:hidden` tạo scroll context phụ trên mobile. `clip` ngăn overflow mà không tạo scroll context → sticky hoạt động đúng
- **doiTrangThaiDiDanh no-reload**: Sau DB update → cập nhật DOM trực tiếp (`selectEl.closest('tr')` → `cells[7]` Thanh Toán, `cells[9]` Đánh Giá). Không gọi `openGuestListModal` → thứ tự row không bị đảo
- **Guests sort by created_at asc**: `sortedGuests = [...guests].sort(...)` khi load → thứ tự STT cố định suốt session
- **daChotCa trên modal dataset**: `modal.dataset.daChotCa = "1"/"0"` → DOM update trong doiTrangThaiDiDanh đọc được mà không refetch
- **is_tam_khoa field**: Tạm Khóa ca không nhận slot mới nhưng vẫn hiển thị ngoài trang. Cần SQL: `ALTER TABLE ca_dau ADD COLUMN IF NOT EXISTS is_tam_khoa BOOLEAN DEFAULT FALSE`
- **modal-ho-so-khach + modal-quick-dg**: Hai modal này THIẾU khỏi index.html → click Tên Khách và nút Đánh Giá đều fail. Đã thêm vào (phiên 10)
- **toast z-index 9999**: toast `z-index:1000` bị che bởi modal `z-index:1200+`. Fix: tăng lên 9999
- **ttCellHTML conditional**: "Chỉ Đã tham gia → checkbox thanh toán; Bùng kèo → input tiền phạt; Khách hủy/Chờ đánh → —"
- **gopY RLS bug + sort + STT**: (giữ từ phiên 8)
- **body display:block**: (giữ từ phiên 8)

### SQL cần chạy trên Supabase Dashboard
1. `security-auth-v4.sql` — Parts 2→8 (is_admin, 6 RPC, RLS)
2. `migration-admin-cascade.sql` — v2 (cascade delete + policies)
3. **GÓP Ý FIX** (urgent):
```sql
DROP POLICY IF EXISTS "gop_y_auth_select" ON gop_y_he_thong;
DROP POLICY IF EXISTS "gop_y_auth_delete" ON gop_y_he_thong;
CREATE POLICY "gop_y_auth_select" ON gop_y_he_thong FOR SELECT TO authenticated USING (true);
CREATE POLICY "gop_y_auth_delete" ON gop_y_he_thong FOR DELETE TO authenticated USING (true);
```
4. **TẠM KHÓA CA** (mới): `ALTER TABLE ca_dau ADD COLUMN IF NOT EXISTS is_tam_khoa BOOLEAN DEFAULT FALSE;`

### Known issues
- Admin xóa user → F5 vẫn thấy dashboard nếu chưa chạy migration-admin-cascade.sql
- Góp ý admin tab không hiện data cho đến khi chạy SQL snippet trên
- Tạm Khóa ca đấu không hoạt động cho đến khi chạy SQL ALTER TABLE trên
- xoaCaDau: silently fail nếu RLS anon không cho DELETE (cần security-auth-v4.sql)
- Cột "Trình Độ" trong DS Khách hiện `--` vì `dat_slot` chưa có field `trinh_do`

## NEXT UP
- 🔴 Chạy SQL góp ý fix + TẠM KHÓA migration → test
- 🔴 Chạy `security-auth-v4.sql` Parts 2→8 → full auth hoạt động
- 🟡 GĐ4A: Dashboard doanh thu Host (subtab + 4 metric + filter)
- 🟡 GĐ4B: Export/In ca đấu (print popup + CSV)
- 🟢 Deploy Vercel: GitHub repo → custom domain tuyenvanglai.io.vn
- 🟢 Chart.js Admin (tab Thống Kê)

---

## QUY TẮC LÀM VIỆC
- Trước task dài → tạo/cập nhật TODO.md
- Sau mỗi bước → đánh dấu [x] TODO.md ngay
- Resume sau limit → đọc TODO.md trước
- Context ~60% → nhắc /compact-save
- Context ~80% → BẮT BUỘC /compact-save ngay
