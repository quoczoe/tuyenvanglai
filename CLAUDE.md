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

## CURRENT STATE (cập nhật: 2026-06-07)

### Trạng thái file
| File | Version | Ghi chú |
|---|---|---|
| `ket-noi-supabase.js` | v7.0 | supabaseAuth + guestRPC + _adminJWT |
| `bo-may-du-lieu.js` | v2.0 | dbEngine proxy, 63 tỉnh |
| `phan-he-ung-dung.js` | v3.1 | SPA routing + has-subtab toggle |
| `phan-he-host.js` | v6.3 | smart time default, disable past hours, _onNgayDanhChange |
| `phan-he-khach-choi.js` | v8.1 | SĐT reveal click-area, modal HồSơ ẩn SĐT, trust bar redesign |
| `phan-he-quan-tri.js` | v8.0 | cascade delete RPC, _fitTable, flex layout |
| `index.html` | v8.0 | /tim-keo UX, /dang-quan-ly UX, /ca-nhan profile, mobile subtab fix |
| `admin/index.html` | v8.0 | Flex layout, 7 tabs, border-collapse:separate |
| `phan-he-gop-y.js` | stable | |
| `giao-dien.css` | v7.0 | slot-grid gap:0, kh-san-link display:flex, trust card |
| `components.css` | v5.1 | slot-card margin:0, footer grid 22fr 37fr 41fr |

### Quyết định kỹ thuật quan trọng (phiên này)
- **slot-grid**: dùng `gap:0` + `margin:1px` trên card, `border-radius:4px` thay 14px — cards sát nhau
- **mobile subtab bug**: media query `.subtab-nav { top: 56px }` phải đặt SAU `.subtab-nav { top: 80px }` trong CSS cascade — lỗi này đã fix bằng cách chuyển vào @media 768px CHÍNH (dòng ~935)
- **has-subtab class**: `chuyenTab()` trong phan-he-ung-dung.js tự toggle `body.has-subtab` → padding-top: 108px khi có subtab
- **kh-san-link**: đổi `inline-flex` → `flex` + `width:100%` để fix "khu vực xuống dòng"
- **SĐT reveal**: click cả dòng `.shb-phone-chip` → tự click nút reveal bên trong
- **F5 trust bar bug**: expose `window._hienTrustScoreBar` từ phan-he-khach-choi.js, gọi trong `_renderProfile` phan-he-ung-dung.js
- **coc-toggle**: `display: flex; width: fit-content` desktop, `width: 100%; justify-content: center` mobile; `.coc-toggle-desc` ẩn trên mobile

### SQL cần chạy trên Supabase Dashboard
1. `security-auth-v4.sql` — Parts 2→8 (is_admin, 6 RPC, RLS)
2. `migration-admin-cascade.sql` — v2 (cascade delete + policies, không cần auth_uid)

### Known issues
- Admin xóa user → F5 vẫn thấy dashboard nếu chưa chạy migration-admin-cascade.sql
- `phan_he_guest_login` RPC cần security-auth-v4.sql Part 3 để login hoạt động
- Guest login fallback trực tiếp REST nếu RPC chưa deploy

## NEXT UP
- 🔴 Chạy `migration-admin-cascade.sql` trên Supabase → test xóa user
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
