# TODO — Cập nhật: 2026-06-05

---

## 🔄 ĐANG LÀM DỞ

*(Không có task đang dở — phiên 2026-06-05 đã hoàn thành)*

---

## ✅ ĐÃ HOÀN THÀNH

### Phiên 2026-06-05 — 8 Security Modules + Auth Routing Fix + Logo Fix

**SQL Migration (user cần chạy thủ công):**
- [x] Tạo `security-migration.sql` — ALTER TABLE + 2 bảng mới (bao_cao, fingerprint_blacklist)

**Module 5 — Phone Masking:**
- [x] `_maskSdt()` + `_sdtChipHtml()` + `_hienSdt()` — mask SĐT host trong card

**Module 8 — Admin Whitelist:**
- [x] Checkbox is_whitelisted + input diem_uy_tin trong modal admin
- [x] `_luuUyTinTV()` — PATCH whitelist + điểm uy tín

**Module 7 — Ranking Algorithm:**
- [x] Sort theo `trust*0.6 + stars*0.4`; trust<70 xuống cuối

**Module 3 — Host Scam Protection:**
- [x] Toggle cọc disabled khi <7 ngày hoặc <3 ca thành công
- [x] `_quetTuKhoaLuaDao()` keyword scanner
- [x] Scam banner đỏ trong card và modal

**Module 2 — Trust Score System:**
- [x] `_truDiemUyTin()`, `_congDiemUyTin()`, `_layDiemUyTin()`, `_trustLevel()`
- [x] Hủy slot: phân tầng thời gian (-7/-3/0đ) + free pass tháng
- [x] Ghost report: nút "👻 Ghost" → trừ 15đ + đổi trạng thái "Bùng kèo"
- [x] `xacNhanThamGia()`: cộng +2đ khi host xác nhận tham gia
- [x] `datSlot()`: block <40đ; giới hạn 1/ngày (60-79đ); "Chờ Host duyệt" (40-59đ không cọc)
- [x] Nút Duyệt/Từ chối trong danh sách khách host
- [x] `baoCaoGhost()` hàm mới cho host
- [x] Trust score bar trong tab hồ sơ khách (`profileTrustScore`)
- [x] Block đăng bài khi uy tín < 60
- [x] Trust badge (✅/⚠️/🔴) cạnh tên host trong card

**Module 4 — Report System:**
- [x] Nút "Báo cáo Host lừa cọc" (chỉ hiện khi đã tham gia ca)
- [x] `moFormBaoCao()` + `guiBaoCao()` — INSERT bao_cao + auto-freeze ≥3 báo cáo
- [x] Filter ca is_frozen khỏi danh sách tìm kèo
- [x] Admin tab "Báo Cáo" (tab 7) + `adminTaiBaoCao()`
- [x] `adminPhatBC()`: BAN host + đóng băng ca
- [x] `adminThaBC()`: BAN reporter + fingerprint blacklist (phạt gậy ngược)
- [x] `adminKhoiPhucCa()`: mở lại ca bị đóng băng

**Module 1 — FingerprintJS:**
- [x] CDN `@fingerprintjs/fingerprintjs@3` trong index.html
- [x] Check blacklist + giới hạn 1 tài khoản/48h trong `hoanTatDangKy()`
- [x] Lưu `device_fingerprint` vào nguoi_dung khi đăng ký

**Module 6 — Cloudflare Turnstile:**
- [x] CDN Turnstile trước `</head>`; site key thật `0x4AAAAAADeiC_0mMTnc07rd`
- [x] Widget trong form login + form đăng bài
- [x] `_kiemTraTurnstileSession()` + smart session 7 ngày
- [x] Check Turnstile trong `datSlot()` khi uy tín < 80

**Auth Routing Fix (Production Bug):**
- [x] `phan-he-khach-choi.js` DOMContentLoaded: `/feed` guard → `window.khoiTaoUngDung`
- [x] `phan-he-host.js` DOMContentLoaded: `/feed` guard → `window.khoiTaoUngDung`
- [x] Toast messages: "Chưa đăng nhập" → "Vui lòng đăng nhập để đăng bài hoặc đặt slot tham gia ca đấu!"

**Logo Flash Fix:**
- [x] `_apLogoImg()`: chỉ set display:block trong `doSwap()` sau onload
- [x] `_apDungBrandConfig()`: fix bug luôn gọi `_apLogoImg()` (không so sánh cache vừa ghi)
- [x] Cache-busting `?v=2` trong `_apLogoImg()`

### Phiên 2026-06-04 — UI Polish + Bug Fix Login + UX Nâng Cấp

**Bug Fix Critical:**
- [x] **Fix login luôn báo sai pass** — `phan-he-quan-tri.js` `_hashMK`: đổi `SALT+plain` → `plain+SALT` khớp với `_hashMatKhau` trong login flow

**ALL CAPS Typography (TÌM KÈO):**
- [x] Card tên sân: `text-transform:uppercase` + icon ↗
- [x] Modal LOẠI CẦU: `text-transform:uppercase`
- [x] Badge trạng thái slot: `text-transform:uppercase` → "CÒN X SLOT", "FULL SLOT"
- [x] Nút đáy card: "Hết slot" → "FULL SLOT"

**Chuẩn hóa tên sân (Host Đăng bài):**
- [x] `_chuanHoaTenSan()` — 4 nhánh A/B/C/D + `toUpperCase()` auto prefix "SÂN CẦU LÔNG"
- [x] Hint text cam dưới ô TÊN SÂN
- [x] `_moTimKiemMaps` dùng `_chuanHoaTenSan` + nối quận/tỉnh vào query
- [x] `dangCaDauCuaHost` áp dụng chuẩn hóa trước khi lưu

**Địa chỉ sân optional:**
- [x] Label "Địa chỉ sân (không bắt buộc)"
- [x] Xóa `dia_chi_san` khỏi required validation
- [x] Modal: địa chỉ trống → hiện "KHÔNG CÓ ĐỊA CHỈ CỤ THỂ" màu xám

**Validate Link Google Maps:**
- [x] Regex: `google.com/maps|maps.app.goo.gl|goo.gl/maps|maps.google.com`
- [x] Viền đỏ + error hint khi sai định dạng
- [x] Block nút "Đăng Kèo" khi link sai

**UX Mobile — Hover/Active tên sân:**
- [x] CSS `.kh-san-link` — `:hover` cam, `:active` cam + `scale(0.98)`
- [x] `@media(hover:none)`: dotted cyan underline mặc định trên mobile
- [x] Icon 📍 glow `drop-shadow` ở card và modal
- [x] Class `kmd-ten-san-link:active` + `kmd-title-link` cho modal

**Modal Chi tiết — Typography & Layout:**
- [x] Modal title: "CHI TIẾT CA ĐẤU • dd/mm/yyyy" (xóa tên sân khỏi title)
- [x] Modal `max-width: 750px` (từ 680px)
- [x] Header `justify-content:center`, nút X `position:absolute;right:16px`

### Phiên 2026-06-03 — UI Fix Kế Toán Nội Bộ + Form Đăng Ca Mới

**Kế Toán Nội Bộ (modal #ktModal):**
- [x] Ẩn/hiện có điều kiện ô `Chênh lệch Nam/Nữ` (#ktGapGroup) — chỉ hiện khi giới tính = "Cả hai"
- [x] Ẩn/hiện đối xứng `#ktEstMaleGroup` / `#ktEstFemaleGroup` theo giới tính đã chọn
- [x] Tách "Tổng tiền sân" (#hostTotalCost) thành text thuần (downgrade) + "Tổng chi phí" (#hostTotalAllCost) thành banner nổi bật (1.3rem, bold 800, orange border)
- [x] `_tinhGoiYGia()` tính đúng: `tienSan = gia×giờ×sân` và `tongCP = sân+cầu+nước`
- [x] Giá trị mặc định cầu: 300.000đ / 12 quả (`_themHangCauMoi`)
- [x] Hiển thị tên cầu trong modal Chi tiết kèo (guest): đọc `loai_cau_su_dung[].ten`, join bằng ", "

**Form Đăng Ca Mới (host section):**
- [x] Tái cấu trúc multi-column grid (`.form-row`, `.col-san`, `.col-4`, `.row-h5`)
- [x] `.row-h5` grid: `1fr 1fr 1fr 1fr auto` — cột nút co dãn theo nội dung
- [x] Nút "Tính toán & Gợi ý giá" hiển thị đầy đủ text (không còn icon-only)
- [x] Xóa `.row-h6` wrapper — `levelNamSection` + `levelNuSection` là 2 div độc lập 100% width
- [x] `_capNhatTrinhDoSection()` đơn giản hóa: thuần `display:block/none`, bỏ `gridColumn`
- [x] Mobile collapse: tất cả grid → `1fr` (≤768px)

### Phiên trước (tổng hợp đến 2026-05-26)

**Phân hệ Khách:**
- [x] Mobile bottom sheet login (`#login-sheet`)
- [x] Tab chuyển đổi mobile (`switchKhachTab`)
- [x] Modal chi tiết kèo (`moModalChiTietKeo`)
- [x] Huỷ slot (`huyDatSlot`) — UPDATE không DELETE
- [x] Lịch sử chi tiêu (`_taiLichSuChiTieu`) — badge + phân trang
- [x] Đánh giá về tôi (`_taiDanhGiaVeToi`) — HostToGuest reviews

**Phân hệ Host:**
- [x] Dashboard Doanh Thu (`_renderDoanhThu`) — 4 metric + bảng + filter thời gian
- [x] Export CSV ca đấu (`xuatCSVCaDau`)
- [x] Modal Hồ sơ tín dụng khách (click tên → stars + history)
- [x] Auto-lock ca sau `gio_ket_thuc`
- [x] Tab Hướng Dẫn (collapsible FAQ)

**Phân hệ Admin:**
- [x] Tab Ca Đấu: xem/sửa/xóa/chốt/mở lại toàn hệ thống
- [x] Quản lý thành viên: sao TB, modal sửa, đổi vai trò, reset mật khẩu, khóa, xóa
- [x] Tạo nhiều Key cùng lúc (`taoNhieuKey`)
- [x] Toggle popup_enabled + save/load

**Hạ tầng:**
- [x] `supabase-schema.sql` — 6 bảng + RLS + seed (đã deploy Supabase)
- [x] `vercel.json` — routing đầy đủ
- [x] Bảo vệ mã nguồn: disable F12, chuột phải, user-select:none

---

## 📋 NEXT UP (theo thứ tự ưu tiên)

### 🔴 Cao — Cần làm ngay

**SQL (user tự chạy trên Supabase Dashboard):**
- [ ] Verify `nguoi_dung` có đủ cột: `is_active BOOLEAN DEFAULT TRUE`, `mat_khau_hash TEXT`
- [ ] RLS policies đủ cho 7 bảng (xem `supabase-schema.sql`)
- [ ] INSERT config rows vào `cau_hinh_he_thong` với `ON CONFLICT DO NOTHING`
- [ ] `ALTER TABLE ca_dau ADD COLUMN IF NOT EXISTS tong_slot_can INTEGER DEFAULT 0`

**End-to-end Test:**
- [ ] Admin tạo key → Supabase có record
- [ ] Host kích hoạt key → `trang_thai = "Đang chạy"`, `id_thiet_bi` ghi vào
- [ ] Host đăng kèo → record trong `ca_dau`
- [ ] Khách đăng ký + đặt slot → `dat_slot` INSERT
- [ ] Host chốt ca → `da_chot_ca = true`, form bị lock
- [ ] Khách xem lịch sử → tiền hiện đúng
- [ ] Đánh giá 2 chiều (Host→Guest + Guest→Host)
- [ ] Admin xem Big Data đúng số liệu

### 🟡 Trung bình

- [ ] **Deploy Vercel:** GitHub repo → import → custom domain `tuyenvanglai.io.vn` → DNS CNAME
- [ ] **Fix Telegram:** Thay `TELEGRAM_BOT_NAME = "TVLVangLaiBot"` (placeholder) bằng bot thật trước deploy
- [ ] **Admin credentials:** Đổi `MAT_MAU_ADMIN="TVL@2026"` trước deploy thật

### 🟢 Thấp / Nice-to-have

- [ ] Chart.js Admin: Line (doanh thu/tháng), Bar (ca theo tỉnh), Doughnut (trạng thái key)
- [ ] Export JSON backup + CSV khách (Admin)
- [ ] Supabase Realtime subscription (WebSocket cho slot card)
- [ ] PWA / Service Worker + manifest.json
