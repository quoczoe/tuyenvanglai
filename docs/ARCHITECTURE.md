# ARCHITECTURE — TUYENVANGLAI.IO.VN

## Stack
- HTML5 / Vanilla JS SPA — không framework (no React/Vue/Angular)
- Supabase REST API + JS SDK v2 (window._sbClient)
- Deploy: Vercel | Domain: tuyenvanglai.io.vn
- CSS: Dark Cyberpunk, Mobile-First, dark-only (no toggle)

## Supabase
| | |
|---|---|
| URL | `https://kyidswbpfafsoqsdhfpu.supabase.co` |
| ANON_KEY | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5aWRzd2JwZmFmc29xc2RoZnB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDI1ODksImV4cCI6MjA5NDkxODU4OX0.ustQ0xaRQqxyCWid1dkC-1YuhX0yA0wQJ5JOyq98TRY` |

## Data Flow
```
*.html (UI)
  ↓
phan-he-*.js (logic)
  ↓
window.dbEngine (bo-may-du-lieu.js — proxy + error toast)
  ↓
window.khoDuLieuVinhVien (ket-noi-supabase.js — REST fetch)
  ↓
Supabase REST API
```

## Auth Architecture
```
Admin  → supabase.auth.signInWithPassword(email, pass) → JWT
       → verify vai_tro='admin' in nguoi_dung → window._adminJWT cached
       → LAY_HEADERS_CHUAN() injects JWT into all admin DB calls

Guest  → guestRPC.login(sdt, sha256hash) → phan_he_guest_login RPC
       → returns { status, token (UUID), user }
       → token stored as tvl_guest._token in localStorage
       → datSlot / huySlot require valid token
```

## localStorage (chỉ 2 keys)
- `tvl_host_key` → `{ ma_key, ten_host, ngay_het_han }`
- `tvl_guest` → `{ sdt_khach, ten_khach, _token, _expires_at, ... }`

## File Structure
```
├── index.html              SPA: trang chủ + Khách + Host
├── admin/index.html        Admin panel (ẩn, không menu)
├── 404.html
├── vercel.json
├── ket-noi-supabase.js     window.khoDuLieuVinhVien + supabaseAuth + guestRPC
├── bo-may-du-lieu.js       window.dbEngine + MOCK_PROVINCES (63 tỉnh) + SHUTTLECOCK_BRANDS
├── hieu-ung-giao-dien.js   hienToast, khoiTaoTheme
├── phan-he-ung-dung.js     SPA routing/hash
├── phan-he-khach-choi.js   Guest logic
├── phan-he-host.js         Host logic
├── phan-he-quan-tri.js     Admin logic
├── phan-he-gop-y.js        Feedback logic
├── giao-dien.css           Global CSS
├── components.css          Component CSS v5.0
├── supabase-schema.sql     ✅ deployed
├── security-auth-v4.sql    ⏳ cần chạy Phần 2→8
└── migration-admin-cascade.sql  ⏳ cần chạy (cascade delete + policies)
```

## Database Schema (7 bảng)

### nguoi_dung (bảng auth chính)
`sdt_khach` PK · `ten_khach` · `mat_khau_hash` · `gioi_tinh` · `vai_tro` (guest/host/admin) · `is_active` · `sdt_zalo` · `facebook_link` · `bio` · `avatar_url` · `ma_key_host` → quan_ly_key · `ngay_tham_gia`
> Lưu ý: `auth_uid UUID` chỉ có sau khi chạy security-auth-v4.sql Part 1

### quan_ly_key
`ma_key` PK (TVL-XXXXX-XXXX) · `ten_host` · `sdt_host` · `so_ngay_duoc_xai` · `trang_thai` (Chưa kích hoạt/Đang chạy/Bị khóa) · `id_thiet_bi` · `ngay_kich_hoat` · `ngay_het_han`

### ca_dau
`id` UUID PK · `ma_key_host` → quan_ly_key · `sdt_nguoi_tao` TEXT · `tinh_thanh` · `quan_huyen` · `ten_san` · `ngay_danh` · `gio_bat_dau/ket_thuc` · `gia_nam/nu` · `da_chot_ca` BOOL DEFAULT false · `yeu_cau_trinh_do` JSONB · `tien_ich_bao_gom` JSONB

### dat_slot
`id` UUID PK · `id_ca_dau` → ca_dau(id) **ON DELETE CASCADE** · `sdt_khach` · `ten_khach` · `ma_slot` (SLOT-XXXXX) · `trang_thai_di_danh` (Chờ đánh/Đã tham gia/Bùng kèo/Khách hủy) · `thoi_gian_dat`

### danh_gia_tin_dung
`id` UUID PK · `id_ca_dau` · `sdt_nguoi_viet` · `sdt_nguoi_bi_danh_gia` · `loai_danh_gia` (HostToGuest/GuestToHost) · `so_sao` 1-5 · `nhan_xet` · `created_at` (NO UPDATE)

### cau_hinh_he_thong
`id` TEXT PK · `noi_dung_thong_bao`
Keys: `popup_chinh` · `so_keo_hien_thi` · `so_thanh_vien` · `qr_donate` · `tieu_de_donate` · `text_donate` · `telegram_bot_token` · `telegram_chat_id`

### gop_y_he_thong
`id` UUID · `ten_user` · `sdt_user` · `so_sao` · `loai_gop_y` · `noi_dung` · `created_at`

### khach_vang_lai
⚠️ LEGACY ONLY — fallback migration, không thêm logic mới

## Admin Layout (v8.0)
```
body (flex column, 100vh, overflow:hidden)
├── .ad-header (flex-shrink:0, 60px)
└── .ad-main (flex:1, overflow:hidden)
    ├── #adminAuthPanel (display:none by default)
    └── #adminConsole (display:flex khi login OK, flex-direction:column)
        ├── .ad-sticky-top (flex-shrink:0 — không scroll)
        └── .ad-tab-content.active (flex:1, overflow-y:auto)
```
`_fitTable()`: JS đo offsetHeight → set table-responsive.maxHeight (chống dual-scroll)

## Security SQL Status
| File | Trạng thái |
|---|---|
| `supabase-schema.sql` | ✅ Deployed |
| `security-auth-v4.sql` Parts 1-8 | ⏳ Cần chạy |
| `migration-admin-cascade.sql` | ⏳ Cần chạy (v2 — không cần auth_uid) |

## Guest Session Validation (startup)
`khoiTaoTrangKhach` là `async function`. Thực hiện **await** direct fetch tới nguoi_dung trước khi hiện dashboard. Nếu user bị xóa/khóa → hiện login form ngay (không flash dashboard).
