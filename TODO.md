# TODO — Cập nhật: 2026-06-09 (phiên 9)

---

## ✅ ĐÃ HOÀN THÀNH PHIÊN NÀY

### CA ĐÃ ĐĂNG — index.html + phan-he-host.js (phiên 9)
- [x] **Fix header cố định**: table-wrap max-height:60vh + overflow-y:auto + thead position:sticky;top:0
- [x] **Gộp cột Ngày+Giờ**: 1 cột "Thứ/Ngày Giờ" — format "T6, 06/06/2026 | 18:00 → 20:00"
- [x] **Fix cột Giá**: "Nam: Xk / Nữ: Xk" cùng 1-2 hàng, không cắt ngắn
- [x] **Fix nút Slot (DS Khách)**: openGuestListModal mở #modal-guest-list (đã thêm vào index.html)
- [x] **Fix nút Xóa ca**: post-delete verification — nếu RLS silently block → báo lỗi rõ thay vì "thành công"
- [x] **Fix nút Chi tiết**: xemChiTietCaDau mở #modal-ca-detail (đã thêm vào index.html)
- [x] **Fix nút Đánh giá**: moModalDanhGiaCa mở #modal-danh-gia-ca (đã thêm vào index.html)
- [x] **Fix nút Sửa**: _moModalSuaCa mở #modal-sua-ca inline (không redirect sang tab Đăng)
- [x] **Auto chốt ca**: moModalXacNhanChotCa mở #modal-xacnhan-chot (đã thêm vào index.html)
- [x] **Bộ lọc**: dropdown trạng thái (Tất cả/Đang mở/Hết giờ/Đã chốt)
- [x] **Ô tìm kiếm**: realtime filter theo sân, tên khách, SĐT (qua _caDauSearch)
- [x] **Sort theo cột**: click header → asc/desc (# | Ngày | Sân | Giá | Trạng Thái)
- [x] **Màu xen kẽ**: alternating row background giữa các hàng
- [x] **Kẻ dòng cột**: border-right giữa các cột
- [x] **Cột STT**: thêm cột # (index+1)
- [ ] **Fix nút Chi tiết + Đánh giá**: không hoạt động sau khi chốt ca — fix
- [ ] **Fix nút Sửa**: mở inline form/modal chỉnh giá, số cầu, số người — không redirect sang tab Đăng
- [ ] **Auto chốt ca**: realtime check giờ hết → prompt chỉnh sửa lần cuối → xác nhận chốt
- [ ] **Bộ lọc**: dropdown trạng thái (đang mở/đã chốt), ngày, sân
- [ ] **Kẻ dòng + màu xen kẽ**: alternating row colors, border-bottom giữa các hàng
- [ ] **Cột STT**: thêm số thứ tự
- [ ] **Sort theo cột**: click header → sort asc/desc
- [ ] **Ô tìm kiếm**: realtime filter theo tên sân, tên khách, SĐT khách

**SQL cần chạy trước (góp ý fix):**
```sql
CREATE POLICY "gop_y_auth_select" ON gop_y_he_thong FOR SELECT TO authenticated USING (true);
CREATE POLICY "gop_y_auth_delete" ON gop_y_he_thong FOR DELETE TO authenticated USING (true);
```

**SQL Migration security-auth-v4.sql — đang chạy từng phần:**
- [x] Phần 1: Cấu trúc bảng
- [ ] Phần 2→8: Còn lại (is_admin, 6 RPC, RLS)

---

## ✅ ĐÃ HOÀN THÀNH

### Phiên 2026-06-08 (phiên 8) — Admin gopY + index.html fixes

**Admin tab Góp Ý — phan-he-quan-tri.js + admin/index.html:**
- [x] Fix RLS: gop_y_he_thong chỉ có policy anon → thêm authenticated SELECT+DELETE vào cms-seed.sql
- [x] Error state rõ: phân biệt null (lỗi fetch) vs [] (thực sự trống)
- [x] Expose `window._taiDanhSachGopY` để onclick inline gọi được
- [x] Sort tường minh: `_gopYCompare(a,b,col,dir)` + `_gopYDoSort()` — không dùng closure
- [x] _rank cố định sau load: oldest=rank1, hiển thị g._rank thay start+i+1
- [x] Sort STT (#) hoạt động thực sự — số thứ tự thay đổi khi sort
- [x] Filter + Pagination gộp 1 hàng (đầu bảng)
- [x] Cột Người Dùng: 120px → 160px → 320px
- [x] Rate limiting phan-he-gop-y.js: max 5/ngày + cooldown 5 phút
- [x] Nút ? (coc-tip) mobile: right-align tooltip tránh tràn phải
- [x] Btn-kt "?" chuyển ra ngoài button → tap mobile không mở modal

**index.html fixes:**
- [x] `body { display: block !important }` — override giao-dien.css flex layout
- [x] Desktop padding-top: 96px → 80px (= header height, xóa dải đen)
- [x] Mobile padding-top: 72px → 56px (= mobile header height)
- [x] Hamburger: span background #fff, button border+bg rõ hơn

### Phiên 2026-06-07 (phiên 7) — UX Polish /tim-keo + /dang-quan-ly + /ca-nhan

**slot-grid & card layout:**
- [x] `gap: 0` + `border-radius: 4px` + `margin: 1px` cho card trong grid — sát nhau
- [x] `slot-card { margin-bottom: 0 }` trong components.css
- [x] `#slotsSearchResultContainer.keo-grid { gap: 1px }` trong index.html
- [x] `minmax(500px, 1fr)` cho slot-grid — cột đủ rộng cho tên sân

**kh-san-link fix (tên sân không xuống dòng):**
- [x] `display: flex; width: 100%` thay `inline-flex; max-width: 100%`
- [x] `flex-shrink: 0` cho span ↗ và — khu vực; `flex-shrink: 1` cho span tên sân

**SĐT reveal UX (/tim-keo):**
- [x] Click cả dòng `.shb-phone-chip` → delegate click tới `.shb-reveal-btn` bên trong
- [x] Nút SHARE footer tăng tỉ lệ: `15fr 40fr 45fr` → `22fr 37fr 41fr`

**HỒ SƠ TÍN DỤNG (/tim-keo modal):**
- [x] Truyền `slot.id` vào `xemHoSoNguoiDang` → check DOM `sdtDisplay_${uid}` có masked không
- [x] Thêm block điểm uy tín: score lớn + badge + progress bar glow + scale 0-25-50-75-100

**/ca-nhan profile redesign:**
- [x] Nút ĐĂNG XUẤT chuyển lên góc phải `.profile-top` (margin-left: auto)
- [x] `#profileTrustScore` tách ra ngoài `.profile-meta` thành `.profile-trust-wrap` full-width
- [x] Redesign trust bar: score số lớn, badge, bar, scale
- [x] F5 bug fix: expose `window._hienTrustScoreBar`, gọi trong `_renderProfile` (phan-he-ung-dung.js)
- [x] Mobile: `.btn-logout-label { display: none }` — icon only

**/dang-quan-ly — giờ mặc định smart:**
- [x] `_gioMacDinhHomNay()`: realtime + 20p snap bội 15 — thay 18:00 cứng
- [x] `_capNhatGioSelect(isToday)`: disable hour options trong quá khứ
- [x] `_capNhatPhutSelect()`: disable minute options khi giờ = giờ hiện tại
- [x] `window._onNgayDanhChange`: validate reject ngày quá khứ + snap giờ + re-enable
- [x] End time = start + 2h tự động
- [x] `hostDatePlay onkeydown="return false"` chặn gõ tay ngày quá khứ

**/dang-quan-ly — THU CỌC TRƯỚC redesign:**
- [x] Toggle switch thay checkbox, label "Thu Cọc Trước" rõ nghĩa
- [x] Nút `?` dùng class `.tt.coc-tip` — tooltip đẹp đúng vị trí, đồng bộ với Maps `?`
- [x] Tooltip đổ xuống dưới (top: calc(100%+8px)), rộng 260px
- [x] Layout inline-flex compact: toggle ngay cạnh title, không space-between
- [x] Mobile: `width: 100%; justify-content: center`; ẩn `.coc-toggle-desc`

**/dang-quan-ly mobile subtab fix:**
- [x] Bug root cause: media query `top: 56px` ở dòng 182 nằm TRƯỚC `.subtab-nav { top: 80px }` ở dòng 198 → bị override
- [x] Fix: xóa media query sai vị trí, chuyển vào @media 768px CHÍNH (sau `.subtab-nav` base)
- [x] `body.has-subtab` toggle trong `chuyenTab()` (phan-he-ung-dung.js)
- [x] `padding-top: 108px !important` khi has-subtab, `background: rgba(8,8,8,1)` cho subtab-nav
- [x] `overflow-x: hidden` cho `#tab-dang-quan-ly` và `#dql-content`

### Phiên 2026-06-06 (phiên 6) — Admin UI/UX Overhaul
- [x] Flex layout admin, _fitTable, cascade delete, dropdown fixed position, logout button

### Phiên 2026-06-05 (phiên 5) — Auth Security
- [x] Supabase JWT admin, guest RPC session token, security-auth-v4.sql

### Phiên trước (đến 2026-06-04)
- [x] Toàn bộ core features, bug fixes lịch sử, redesign

---

## 📋 NEXT UP (theo thứ tự ưu tiên)

### 🔴 Cao — Cần làm ngay
- [ ] Chạy security-auth-v4.sql Phần 2→8 trên Supabase Dashboard
- [ ] Test 8 bước auth sau khi SQL chạy xong
- [ ] Deploy Vercel: GitHub → custom domain tuyenvanglai.io.vn

### 🟡 Trung bình
- [ ] GĐ4A: Dashboard doanh thu Host (subtab + 4 metric + filter)
- [ ] GĐ4B: Export/In ca đấu (print popup + CSV)
- [ ] Fix Telegram bot placeholder
- [ ] Verify hoanTatDangKy: fingerprint_blacklist table check

### 🟢 Thấp
- [ ] Chart.js Admin (Line/Bar/Doughnut)
- [ ] Export JSON/CSV Admin
- [ ] Supabase Realtime WebSocket
- [ ] PWA / Service Worker
