# TODO — Cập nhật: 2026-06-05 (phiên 5)

---

## 🔄 ĐANG LÀM DỞ

**SQL Migration security-auth-v4.sql — đang chạy từng phần:**
- [x] Phần 1: Cấu trúc bảng (ALTER TABLE, CREATE TABLE guest_sessions, login_attempts)
- [ ] Phần 2: is_admin() SECURITY DEFINER function ← **Cần chạy ngay để fix circular RLS**
- [ ] Phần 3: RPC phan_he_guest_login ← **Cần để login hoạt động lại**
- [ ] Phần 4: RPC phan_he_dat_pass_lan_dau
- [ ] Phần 5: RPC verify_guest_token
- [ ] Phần 6: RPC guest_dat_slot
- [ ] Phần 7: RPC guest_huy_slot + get_current_guest_profile
- [ ] Phần 8: RLS Policies (DROP cũ + CREATE mới dùng is_admin())

**Sau khi chạy xong SQL — test 8 bước:**
- [ ] Đăng nhập /admin/ bằng email mynameisanhquocpro@gmail.com
- [ ] Đăng nhập khách bằng SĐT + pass → nhận _token trong tvl_guest
- [ ] Đăng ký tài khoản mới (SĐT chưa tồn tại) → nhận token, vào dashboard
- [ ] Đặt slot → mã 8 ký tự (VD: SLOT-A3B9F21C)
- [ ] Hủy slot → trang_thai_di_danh="Khách hủy"
- [ ] Sai pass 6 lần → "Quá nhiều lần thử, chờ 15 phút"
- [ ] Console `window._xacNhanDoiVaiTro` → `undefined`
- [ ] Tài khoản admin đăng nhập main site → thấy nút "Vào Admin →"

---

## ✅ ĐÃ HOÀN THÀNH

### Phiên 2026-06-05 (phiên 5) — Hệ Thống Auth Bảo Mật Toàn Diện

**Kiến trúc Auth mới:**
- [x] Admin: Supabase Auth JWT (`supabase.auth.signInWithPassword`) — xóa ADMIN_USER/MAT_MAU_ADMIN
- [x] Guest: Session Token UUID trong DB (`guest_sessions` table) — xóa localStorage self-service
- [x] `window._adminJWT` cache trong `LAY_HEADERS_CHUAN` → dbEngine tự dùng JWT cho admin calls
- [x] `window._ap` namespace cho `xacNhanDoiVaiTro` + `thucHienDoiVaiTro` — ẩn khỏi global scope

**Code changes:**
- [x] `ket-noi-supabase.js` v7.0: thêm `supabaseAuth` + `guestRPC` (6 methods)
- [x] `admin/index.html` v7.0: CDN Supabase JS v2, form email thay username
- [x] `phan-he-quan-tri.js` v7.0: auth JWT, _adminJWT cache, _ap namespace
- [x] `phan-he-khach-choi.js` v7.0: login/register/datSlot/huySlot qua RPC, _token session
- [x] `index.html` v7.0: CDN Supabase JS v2, admin card #sectionAdminAccess

**SQL security-auth-v4.sql v4.3 — tạo mới với tất cả fixes:**
- [x] is_admin() SECURITY DEFINER — fix circular RLS
- [x] phan_he_guest_login: rate limit 5/15min + global 30/min spray fix + NOT_FOUND enumeration fix + 2% cleanup
- [x] phan_he_dat_pass_lan_dau: thêm device_fp, ma_gioi_thieu, diem_uy_tin=100
- [x] verify_guest_token: JOIN nguoi_dung check is_active realtime
- [x] guest_dat_slot: fetch ten từ DB, 8 ký tự + collision loop
- [x] guest_huy_slot + get_current_guest_profile
- [x] RLS policies dùng is_admin() (không circular)

**Bảo mật đã fix:**
- [x] ADMIN_USER="admin"/MAT_MAU_ADMIN="TVL@2026" → xóa hoàn toàn khỏi JS
- [x] Session forgery: localStorage → Supabase JWT (không giả mạo được)
- [x] IDOR Guest: localStorage sdt_khach → UUID token trong DB
- [x] Phone enumeration: rate limit áp dụng kể cả NOT_FOUND
- [x] Password spray: global rate limit 30 attempt/phút
- [x] DB congestion: cleanup xác suất 2%
- [x] Global function exposure: window._ap namespace
- [x] Đăng ký bị sập sau RLS: hoanTatDangKy → guestRPC.datPassLanDau()
- [x] Circular RLS: is_admin() SECURITY DEFINER

### Phiên 2026-06-04 (phiên 4) — Lịch Sử 13 Bug Fixes + Đồng Bộ Màu
- [x] 13 bug fixes lịch sử từ screenshot review (trust score, badge, province, slot code...)
- [x] Đồng bộ màu: #151D30 → #181818, sub-tab underline tabs

### Phiên 2026-06-04 (phiên 3) — Lịch Sử Redesign
- [x] 4 stat cards, dual-zone card, filter bar, neon buttons, responsive

### Phiên 2026-06-05 — 8 Security Modules + Auth Routing
- [x] FingerprintJS, Turnstile, Trust Score, Report System, Scam Protection, Whitelist, Ranking, Phone Masking

### Phiên trước (đến 2026-05-26)
- [x] Toàn bộ phân hệ Khách/Host/Admin core features
- [x] supabase-schema.sql đã deploy

---

## 📋 NEXT UP (theo thứ tự ưu tiên)

### 🔴 Cao — Cần làm ngay

**Hoàn thành SQL migration (xem ĐANG LÀM DỞ):**
- Chạy security-auth-v4.sql Phần 2→8 trên Supabase Dashboard
- Sau đó test 8 bước bên trên

**Deploy Vercel:**
- [ ] GitHub repo → push code v7.0 → Vercel import → custom domain tuyenvanglai.io.vn

### 🟡 Trung bình

- [ ] Fix Telegram: đổi TELEGRAM_BOT_NAME placeholder bằng bot thật
- [ ] Admin credentials: đổi pass Supabase Auth trước deploy thật (mynameisanhquocpro@gmail.com)
- [ ] Verify hoanTatDangKy: fingerprint_blacklist table chưa tồn tại → check bảng tồn tại trước khi query

### 🟢 Thấp

- [ ] Chart.js Admin (Line/Bar/Doughnut)
- [ ] Export JSON/CSV Admin
- [ ] Supabase Realtime WebSocket
- [ ] PWA / Service Worker
