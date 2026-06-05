# HISTORY — Những gì đã hoàn thành

## Phiên 1–2 (2026-05-23 → 05-24)
- `ket-noi-supabase.js` — window.khoDuLieuVinhVien (ghiData/docData/xoaData)
- `bo-may-du-lieu.js` v2.0 — dbEngine proxy, MOCK_PROVINCES 63 tỉnh, SHUTTLECOCK_BRANDS
- `hieu-ung-giao-dien.js` — hienToast, khoiTaoTheme
- `phan-he-ung-dung.js` — SPA routing
- `giao-dien.css` + `components.css` v5.0 — dark Cyberpunk system
- `phan-he-host.js` v2.0 — xác thực key, đăng kèo, kế toán, smart pricing, Chốt Ca
- `phan-he-khach-choi.js` v3.0 — tìm kèo, đặt/huỷ slot, hồ sơ, lịch sử, đánh giá
- `phan-he-quan-tri.js` v3.0 — CRUD key, Big Data, cấu hình, quản lý thành viên
- `phan-he-gop-y.js`
- `index.html` v5.2 — hero, HUD, gateway, host/guest SPA
- `admin/index.html` v3.0 — quản lý key, thành viên, đánh giá
- `404.html`, `vercel.json`, `supabase-schema.sql` ✅ deployed

## Phiên 3 (2026-05-24)
- GĐ1C: Đồng bộ tên bảng Supabase (quan_ly_key, ca_dau, dat_slot, ...)
- GĐ3A-D: Modal chi tiết kèo, huỷ slot, lịch sử chi tiêu, đánh giá về tôi

## Phiên 4 (2026-05-24)
- Đại tu Responsive: mobile overflow, HUD clamp, gender pill, date picker icon
- Admin v4.0: tab Quản Lý Thành Viên, modal CRUD thành viên, reviewMap, xemDanhGia

## Phiên 5 (2026-06-05) — Bảo mật toàn diện
- Admin: Supabase Auth JWT (bỏ hardcode TVL@2026)
- Guest: Session Token UUID trong `guest_sessions` table
- `ket-noi-supabase.js` v7.0: supabaseAuth + guestRPC + _adminJWT
- `security-auth-v4.sql` v4.3: is_admin() + 6 RPC + RLS + rate limiting
- `phan-he-khach-choi.js` v7.0: login/register/datSlot/huySlot qua RPC

## Phiên 6 (2026-06-05) — Admin UI overhaul
- Admin layout v8.0: flex column (body → adminConsole → sticky-top + tab-content)
- `_fitTable()`: JS dynamic max-height chống dual-scroll
- Cascade delete user: dat_slot → ca_dau → guest_sessions → nguoi_dung
- `_toggleCaMenu`: position:fixed để tránh bị clip
- Tab Góp Ý: di chuyển vào trong adminConsole (trước bị đặt ngoài)
- thead sticky: border-collapse:separate (fix Chromium z-index bug)
- Config tab: 2-column grid layout

## Phiên 7 (2026-06-06) — Bug fixes cascade & session
- Fix `taoTaiKhoanTestHangLoat` không đặt slot được: bỏ `!_token` startup check, thêm direct fetch fallback
- Fix cascade delete: `admin_cascade_xoa_user` RPC v2 (không cần auth_uid), policies mới
- Fix F5 không logout: `khoiTaoTrangKhach` đổi thành `async`, await direct fetch trước khi hiện dashboard
- `_kiemTraUserConTonTai`: poll 60s + visibilitychange, `arr === null` = network error (giữ session)
- `datSlot`/`huySlot`: fallback direct REST khi RPC chưa deploy
- Admin UI: Ca Đấu toolbar gom 1 hàng, Config tab 2 cột, thead bleed-through fixed
