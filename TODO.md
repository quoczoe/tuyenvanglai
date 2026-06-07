# TODO — Cập nhật: 2026-06-10 (phiên 12)

---

## ✅ ĐÃ HOÀN THÀNH (phiên 12) — DS Khách dropdown fix + mobile responsive

### Custom Dropdown Trạng Thái (phan-he-host.js + index.html)
- [x] Thay native `<select>` bằng custom dropdown SVG (4 trạng thái, icon màu)
- [x] Bulk action bar: Đã tham gia / Bùng kèo / Khách hủy (có confirm modal)
- [x] Toggle switch Thanh Toán thay checkbox (`capNhatThanhToanToggle`)
- [x] Time-guard: block Khách hủy khi ca đã bắt đầu (3 lớp: UI disable, JS guard, backend)
- [x] Guest side: ẩn nút hủy slot khi ca đã started (`huyDatSlot` + dashboard)
- [x] Drop-up detection: `_toggleGlCdd` đo menu.bottom vs modal-guest-list-inner.bottom → `.is-drop-up`
- [x] CSS: `.gl-cdd-menu` position:absolute, `.is-drop-up` top:auto/bottom:calc(100%+6px), `tr.tr-cdd-open z-index:99`, `td.td-cdd overflow:visible`
- [x] `_closeAllGlCdd()`: đóng tất cả dropdown khi click ngoài / đóng modal / chọn option

### Chi Tiết Ca Đấu — xemChiTietCaDau (phan-he-host.js)
- [x] Thêm cột THANH TOÁN (badge Đã trả / Chưa trả / Phạt X)
- [x] Tổng Thu chỉ tính slot da_thanh_toan=true
- [x] Hiển thị "Tham gia (M/N)" trong badge bar và card
- [x] _thStyle + _tdStyle có white-space:nowrap
- [x] class `cd-finance-grid` trên div 3 card tài chính

### Mobile Responsive (index.html)
- [x] `#modal-guest-list-table { min-width:1100px }` trên `@media 768px`
- [x] Colgroup col 9 (Trạng Thái) min-width:150px, col 10 (Đánh Giá) min-width:120px
- [x] `#modal-guest-list-table td,th { white-space:nowrap; overflow:hidden; text-overflow:ellipsis }`
- [x] `.cd-finance-grid { grid-template-columns:1fr }` trên mobile (3 card stack dọc)
- [x] `#gl-bulk-bar button { white-space:nowrap; flex-shrink:0 }`
- [x] Bảng cầu + bảng khách trong Chi Tiết: overflow-x:auto + -webkit-overflow-scrolling:touch

---

## ✅ ĐÃ HOÀN THÀNH (phiên 11) — Chi Tiết Ca Đấu redesign + DS Khách fixes

### Modal Chi Tiết Ca Đấu — index.html + phan-he-host.js
- [x] Modal wrapper: border-radius:16px, padding:18-24px, backdrop blur(6px), shadow sâu hơn
- [x] Header: icon SVG dashboard + subtitle, nút ✕ có hover đỏ
- [x] Khối thông tin ca: SVG icons Calendar/Clock/Grid/MapPin thay emoji
- [x] 3 card tài chính: breakdown bảng 2 cột (label+giá), border-radius:12px
- [x] Card Lời/Lỗ: mũi tên SVG động theo chiều; "Buổi này bị lỗ" đổi màu #fdba74
- [x] Badge bar thống kê khách: nằm trong panel có viền
- [x] Section heading: accent bar 4px thay icon FontAwesome
- [x] Bảng cầu + bảng khách: border-radius container, padding th/td chuẩn, badge GT+Trạng thái, hover row
- [x] dongModalCaDetail: fix set cả style.display='none' + classList.add('hidden')

### DS Khách fixes — phan-he-host.js + ket-noi-supabase.js
- [x] capNhatThanhToan: Set+Map double-guard, remove double toast từ catch
- [x] doiTrangThaiDiDanh: fix dataset.daThanhtoan (camelCase bug), remove double toast, write huy_luc
- [x] openGuestListModal: batch fetch trinh_do từ nguoi_dung, dùng thoi_gian_dat (đúng field)
- [x] ket-noi-supabase.js: thêm boLoc.in support cho docData
- [x] Mobile Ca Đã Đăng: thêm .cdd-scroll-outer, đổi overflow-x:clip → visible
- [x] Tạo migration-dat-slot-v2.sql (chưa chạy)

---

## ✅ ĐÃ HOÀN THÀNH (phiên 9+10) — CA ĐÃ ĐĂNG FULL OVERHAUL

### Bảng Ca Đã Đăng (index.html + phan-he-host.js)
- [x] Flat card (no border/bg), border-radius:14px + overflow:hidden → bo góc sạch
- [x] table-layout:fixed + colgroup % (4/13/26/13/13/13/18%) → cột không nhảy khi chuyển trang
- [x] CSS: `min-height:0` trên table-wrap → flex scroll hoạt động đúng
- [x] Pagination: cố định 10/trang, xóa per-page select, giữ ‹ 1/1 ›
- [x] Sort/filter/search state: `_caDauRawData`, `_caDauSortCol/Dir`, `_caDauFilterSt`, `_caDauSearch`
- [x] Cột STT global (idx theo trang), màu xen kẽ, border-right giữa cột
- [x] Cột Thời Gian, Sân, Slot Đăng Ký, Giá (price-container căn giữa + label 34px)
- [x] Cột Trạng Thái: Đang mở / Hết giờ / Tạm khóa (cam) / Đã chốt
- [x] Cột Hành Động: grid 2×2, icon+text — ca mở: Sửa/Chốt Ca/Tạm Khóa/Xóa; ca chốt: Chi tiết/Đánh giá
- [x] tamKhoaCaDau() + moLaiCaDau() → UPDATE is_tam_khoa
- [x] xoaCaDau: post-delete verify (RLS block → báo lỗi rõ)
- [x] _moModalSuaCa: edit inline modal (giá/số người/cầu), không redirect sang tab Đăng
- [x] overflow-x:clip (thay hidden) trên #tab-dang-quan-ly, #dql-content mobile → fix sticky

### Modal DS Khách (openGuestListModal + index.html)
- [x] Modal rộng 90%/max-width:1100px PC; mobile giữ overflow-x:auto
- [x] thead 10 cột: #/Tên/SĐT/GT/Trình Độ/Đặt Lúc/Hủy Lúc/Thanh Toán/Trạng Thái/Đánh Giá
- [x] Sort guests by created_at asc → thứ tự STT cố định sau update
- [x] daChotCa lưu trên modal.dataset.daChotCa → DOM update không refetch
- [x] doiTrangThaiDiDanh: DOM update cells[7]+cells[9] trực tiếp, không reload modal
- [x] ttCellHTML conditional: Đã tham gia→checkbox; Bùng kèo→input; Khách hủy/Chờ→—
- [x] select có data-sdt/ten/da-thanh-toan/tien-bung để DOM update dùng
- [x] Thêm #modal-ho-so-khach (fix click Tên Khách không hiện modal)
- [x] Thêm #modal-quick-dg với qd-stars/qd-comment/qd-submit-btn (fix nút Đánh giá)
- [x] toast z-index: 1000→9999 (fix toast bị che modal)

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
