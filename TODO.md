# TODO — Cập nhật: 2026-06-12 (FIX CĂN HÀNG CỘT TRẠNG THÁI DS KHÁCH)

---

## 🎯 FIX CỘT TRẠNG THÁI (dropdown + nút Từ chối) (2026-06-12) ✅ verify `.devtest/verify-ttcol.js` = 9/9
- [x] Bọc dropdown + nút "Từ chối" trong `.gl-tt-wrap` (flex row, `align-items:center`, gap:8px, flex-wrap). Bỏ `margin-top:6px` trên `.gl-tu-choi-btn`. @≤600: `flex-direction:column; align-items:flex-start` (stack dọc căn trái). Widen cột Trạng Thái `width:19%;min-width:235px` (rebalance Đặt Lúc 13→11, Hủy Lúc 11→10, Thanh Toán 11→10) → dropdown+nút đủ 1 hàng desktop, bảng không vỡ. Verify: @1440 cùng hàng centers thẳng (ddTop 503/btnTop 504, nút bên phải); @390 stack (btn dưới, flex-start). Bump `?v=20260612i` (giao-dien.css, host).

---

## 🐞 PHIÊN FIX 2 BUG (2026-06-12) ✅ verify `.devtest/verify-timecalc.js` = 8/8, sạch
- [x] **BUG 1 — Tính giờ ca QUA NỬA ĐÊM (nghiêm trọng)**: ca 22:00–00:00, `gio_ket_thuc="00:00"` parse ra 00:00 ĐẦU ngày (đã qua) → bị coi "Hết giờ" oan. SSOT mới (bo-may §0B): `window.thoiDiemBatDauCa(ngay,bd)` + `window.thoiDiemKetThucCa(ngay,bd,kt)` (nếu kt<=bd → +1 NGÀY). `phaCaDau` refactor dùng helper. Áp vào MỌI nơi so giờ kết thúc: host `_isExpiredCa` + badge 3 trạng thái (Sắp diễn ra/Đang diễn ra/Hết giờ qua `phaCaDau`) + `autoUpdateChoDao` (nhận timestamp, trước nhận chuỗi "HH:MM"→Invalid→latent dead); khach auto-hide Tìm Kèo (1837) + đếm ca chưa kết thúc (2295/2471) + Lịch Sử "Đã tham gia" (4059). Verify mock Date.now: 21:33=truoc, 22:30/23:59=trong, 00:01 hôm sau=sau; end=00:00 hôm sau; ca thường 18:00–20:00 không hồi quy; ca 22:00–00:00 HIỆN trong Tìm Kèo.
- [x] **BUG 2 — Lọc Doanh Thu mobile**: form lọc inline-flex wrap lộn xộn @390. Restructure semantic (`.dt-filter-bar` > `.dt-filter-period` + `.dt-filter-range`) + CSS responsive: PC 1 hàng; @≤600 period full-width (hàng 1) + range [từ ngày → đến ngày Lọc] full-width (hàng 2), ẩn "hoặc", date inputs `flex:1` không cắt dd/mm/yyyy. Verify: @1440 1 hàng (period 230/range 393), @390 period+range full + 2 hàng + không tràn.
- [x] Bump `?v=20260612h`: giao-dien.css, bo-may-du-lieu.js, phan-he-khach-choi.js, phan-he-host.js (index) + bo-may (admin). Ảnh `dt-filter-{1440,390}.png`. `node --check` OK.

---

## 📐 PHIÊN FIX LAYOUT CARD CA ĐẤU (2026-06-12) ✅ verify `.devtest/verify-cardalign.js` = 8/8, sạch
- [x] **A. Equal-height + gom gap**: bỏ `.slot-card-body{flex:1}` (đang hút slack → gap giữa giá↔host). Thay: `.slot-host-banner, .slot-host-spacer { margin-top:auto }` → host+footer DÍNH ĐÁY, khoảng trắng gom 1 chỗ trên host (đều). Card không host → render `.slot-host-spacer` (margin-top:auto). Verify: 3 card height=554, footer=679, host=546 (đều).
- [x] **B. Cọc-row LUÔN có nội dung** (cập nhật): ca cọc = banner vàng `.coc-banner--1l`; ca KHÔNG cọc = dòng `.coc-banner--free` **"✓ Không yêu cầu cọc trước"** (xanh nhạt #4ade80 opacity 0.7, cùng box → cân height + tên sân thẳng hàng). Bỏ gating `anyCoc` (luôn render). Cọc banner rút gọn 1 dòng (nowrap+ellipsis, title=full). Bump `?v=20260612g`.
- [x] **C. Pills 1 hàng**: cap 4 + badge `.kh-level-more` "+N" (từ phiên trước) — verify ca 8 mức không cao hơn ca 3 mức (height đều 554).
- [x] `_thucHienTimKiem` truyền `anyCoc`; `_taoCaCard(...,anyCoc)`. Bump `?v=20260612f`: giao-dien.css, phan-he-khach-choi.js. Ảnh `cardalign-{1440,390}.png`. `node --check` OK.

---

## 🔧 PHIÊN FIX 4 VẤN ĐỀ (2026-06-12) ✅ verify `.devtest/verify-fix4.js` = 18/18, sạch
- [x] **P4 — chuông F5 chớp trễ**: `#tbChuong` LUÔN hiện sẵn (static): bỏ inline `display:none`; CSS `.tb-chuong{display:inline-flex}`; JS `_hienChuong`=no-op, `_anChuong`=chỉ ẩn badge. Khách chưa login bấm chuông → điều hướng đăng nhập (`moDrawerThongBao` guard `_actor()`). → 0ms, không layout shift.
- [x] **P1 — nút Hủy trong modal Chi Tiết**: footer `moModalChiTietKeo` thêm nút đỏ `.btn-huy-slot-modal` (ưu tiên, chỉ khi có slot active + ca chưa bắt đầu, kể cả ca full) → gọi CHUNG `huyDatSlot` (Lịch Sử). Guard chống hủy 2 lần: `huyDatSlot` đọc trạng thái thật, nếu đã "Khách hủy"/"Host từ chối" → bỏ qua. Hủy xong → `dongModalChiTietKeo()` + refresh card.
- [x] **P2 — card lệch hàng**: equal-height mở rộng `@media ≥601px` (`#slotsSearchResultContainer` stretch + `.slot-card` flex column + body flex:1 + footer margin-top:auto) → footer thẳng hàng + chiều cao bằng nhau. Pills trình độ cap 4 + badge `.kh-level-more` "+N" (bấm → Chi Tiết). Verify: 3 card cùng hàng = 591px, footer = 715px (đều).
- [x] **P3 — tab Đánh giá nhận được**: CSS dark theme (`#danhGiaContainer` card; `.kh-review-about` border-bottom separator; row1 sao+sân(cyan)+ngày; row2 "Từ Host" link `.review-author-link` accent+hover; row3 nội dung) + responsive @390 + escape XSS (`_escLsut` cho ten_san/reviewerName/nhan_xet). Link host → `xemHoSoCongKhai` (đã có) mở modal hồ sơ.
- [x] Bump `?v=20260612e`: giao-dien.css, phan-he-khach-choi.js, phan-he-thong-bao.js. Ảnh `fix4-timkeo-{1440,390}.png` / `fix4-danhgia-{1440,390}.png`. `node --check` OK.

---

## 🔧 PHIÊN FIX LỊCH SỬ ĐIỂM UY TÍN (2026-06-12)

### PHẦN 1 — BUG hủy slot → điểm/lịch sử ✅ (verify `.devtest/verify-fix-lichsu.js` = 7/7)
- [x] Gốc: `huyDatSlot` trừ điểm qua `_truDiemUyTin` (DB CÓ cập nhật) NHƯNG (a) KHÔNG gọi `ghiLichSuUyTin` → lịch sử trống; (b) KHÔNG refresh thanh điểm → UI kẹt giá trị cũ ("vẫn 96"). Fix: thêm `ghiLichSuUyTin` (delta/lý do/diem_truoc/sau) + `_hienTrustScoreBar()` + `taiLichSuDiemUyTin()` sau hủy. Verify: hủy <30p → DB 100→94, lịch sử 1 dòng −6, thanh điểm = 94, toast "Trừ 6".

### 🔴 BUG NỀN phát hiện khi verify — `_token` mất sau ĐĂNG NHẬP THẬT ✅
- [x] `_onDangNhapThanhCong` (phan-he-ung-dung.js) gán `currentGuest = user` (hồ sơ DB, KHÔNG có `_token`) → ghi đè `_token` mà `_luuSessionVaDangNhap` vừa set → MỌI RPC token (guiThongBao, layLichSuUyTin, datSlot/huySlot bảo mật) hỏng tới khi F5. Fix: hợp nhất giữ `_token`. Verify (login THẬT): `hasToken=true`, layLichSuUyTin trả 50 dòng. Bump `phan-he-ung-dung.js?v=20260612d`.

### PHẦN 2 — UI lịch sử + badge uy tín ✅ (verify `.devtest/verify-ui-lichsu.js` = 13/13)
- [x] 2A Collapsible: `#profileLichSuDiem` → `.lsut-card` + nút toggle "Xem/Ẩn" + chevron; mặc định ĐÓNG (max-height 0, transition mượt); tối đa 10 dòng + nút "Xem thêm (N)"; lazy-load lần mở đầu.
- [x] 2B Pill trạng thái: bỏ ✅ "Tốt" → pill `border-radius:999px` theo band: ≥80 "Uy tín cao" (xanh accent) · 60–79 "Bình thường" (cyan) · 40–59 "Cần cải thiện" (cam) · <40 "Hạn chế" (đỏ) · is_active=false "🔒 Tạm khóa" (đỏ đậm). Đặt cùng hàng số điểm. `_trustLevel` đồng bộ nhãn mới (host profile modal).
- [x] 2C Layout: [số điểm + pill] / [progress full-width] / [scale 0—40—60—80—100] / [card lịch sử collapsed]. `_renderTrustBar(el,score,isActive)` + `_trustBand()`. Ảnh `lichsu-ui-1440.png` / `lichsu-ui-390.png` (login THẬT, hiển thị timeline).
- [x] Bump `phan-he-khach-choi.js?v=20260612d` + CSS collapsible/pill trong index.html inline. Regression: Nhóm 3 13/13 + fix 7/7, console/network sạch.

---

## 🏗️ PHIÊN BUILD NHÓM 3 (2026-06-12)

### PHẦN 0 — FIX ICON THÔNG BÁO ✅ (verify `.devtest/verify-p0icon.js` = 7/7 PASS, sạch)
- [x] Bỏ HOÀN TOÀN emoji/icon trong drawer (`_META` chỉ còn `mau`; `_render` bỏ `.tb-item-icon`). LEFT-BORDER 3px theo mức độ (Cao đỏ #ff4444: G2/G3/H3b/S1 · TB cam #ff8800: H2 · Thấp xanh #00ff88: G1/H1) + chấm `.tb-cat-dot` 8px cùng màu + chấm xanh `.tb-dot` "chưa đọc" góc trái + read `opacity:0.72`. Empty/loading bỏ emoji. Bump `giao-dien.css`+`phan-he-thong-bao.js` `?v=20260612b`. Ảnh `tb-icon-1440.png`/`tb-icon-390.png`.

### PHẦN 1 — SQL (ĐÃ SOẠN, CHỜ DUYỆT — KHÔNG CHẠY)
- [x] `migration-tu-choi-v1.sql`: KHÔNG cần thay schema (trang_thai_di_danh TEXT tự do → status mới "Host từ chối"; cột giờ + huy_luc có sẵn). RPC `get_slot_time()` TUỲ CHỌN + khối VERIFY chốt giả định.
- [x] `migration-lich-su-uy-tin-v1.sql`: bảng `lich_su_uy_tin` (9 cột) + index + RLS khóa anon + RPC `ghi_lich_su_uy_tin`(trusted, no-token theo chữ ký duyệt) + `lay_lich_su_uy_tin`(token-verified, đọc của mình) + `get_lich_su_uy_tin_admin`(authenticated/admin) + SELECT verify.
- [ ] 🔴 DỪNG — chờ chủ app duyệt + chạy 2 file SQL trước khi build PHẦN 2+3.

### PHẦN 2+3 — BUILD CODE + VERIFY ✅ (SQL đã chạy + token giữ no-token v1)
> **VERIFY** `.devtest/verify-nhom3.js` = **13/13 PASS**, console/network sạch.
- [x] 2A khóa trạng thái theo phase giờ: SSOT `window.phaCaDau(ca)` (bo-may) → truoc/trong/sau. `openGuestListModal` tính pha + lưu `modal._caInfo`/`dataset.pha` + banner pha. `_renderCustomDropdown(...,pha)`: pha "truoc" → disable "Đã tham gia"/"Bùng kèo"/"Khách hủy" (🔒). Guard ở `_triggerGlCdd` + `doiTrangThaiDiDanh` (chặn server-side). Timer 60s `_glPhaseTimer` refresh khi pha ĐỔI.
- [x] 2B "Từ chối khách" (chỉ pha trước + "Chờ đánh"): nút cam `.gl-tu-choi-btn` → `window.tuChoiKhach()` → status "Host từ chối" + huy_luc → TB **G4** cho khách → phạt host (`_phatDiemHostTuChoi`) nếu <2h (thang HOST_HUY) + ghi lịch sử host. Khách: `daTuChoiSet` → badge "BỊ TỪ CHỐI" + chặn re-book (datSlot guard + RPC). Slot "Host từ chối" loại khỏi đếm (giải phóng).
- [x] 2C hook `window.ghiLichSuUyTin()` (phan-he-thong-bao.js) vào `apDiemTheoTrangThai` — chỉ khi net≠0; ly_do tự suy (Tham gia/Bùng lần N/Khách hủy ...); ca_id/ten_san tra từ slotId nếu thiếu.
- [x] 2D UI tab "Lịch Sử Điểm" trong Hồ Sơ (`taiLichSuDiemUyTin` + `window.layLichSuUyTin` token-verified, timeline `.lsut-*`, escHTML, auto-load khi hiện Hồ Sơ); admin `_xemLichSuDiemAdmin` (RPC `get_lich_su_uy_tin_admin` qua `_sbClient` authenticated, render inline-style).
- [x] G4 thêm vào `_META` (cam/TB). Bump `?v=20260612c`: giao-dien.css, bo-may, khach-choi, host, thong-bao (index) + bo-may, quan-tri (admin). `node --check` 5 file OK.

---

## 🎯 PHIÊN FIX THEO ƯU TIÊN (2026-06-12)

### NHÓM 1 — NHANH, KHÔNG SQL ✅
- [x] 1A. Fix "undefined" — gốc: `.then()` của `_triggerGlCdd` (host) dùng mảng `_opts` THIẾU field `label` → `cur.label`=undefined. Fix: dùng `cur.val`. Verify: badge → "Đã tham gia"/"Bùng kèo"/"Chờ đánh" NGAY, KHÔNG undefined, KHÔNG F5.
- [x] 1B. Visual cue — `giao-dien.css`: `.gl-cdd>button` & `.gl-coc-badge` hover glow accent + `:active scale(0.97)` + ripple `::after` (radial, prefers-reduced-motion tắt); hint `.coc-hint ✏️` cạnh "Chưa cọc" (ẩn khi "✓ Đã cọc"). Verify: hint hiện/ẩn đúng + ::after áp dụng.
- [x] 1C. Thông báo — `phan-he-thong-bao.js` `_META`: G2 🗑️→❌, H3b 🚫→👻; `giao-dien.css` `.tb-item` list-style divider 1px + padding 15/16 + dải nhấn trái cho unread + body padding 0. Verify icon ❌/👻 + divider + screenshot `tb-drawer-1440.png`/`tb-drawer-390.png` + chuông @390 trong viewport.

### NHÓM 2 — TRUNG BÌNH ✅
- [x] 2A. `xacNhanModal(msg,icon,opts)` mở rộng nhãn nút (khôi phục mặc định khi đóng → backward compat). `_triggerGlCdd` (async): hỏi xác nhận trước "Đã tham gia"/"Bùng kèo" (nội dung theo trạng thái đích, nút "Hủy bỏ"/"Xác nhận — không sửa lại được"); "Chờ đánh"/"Khách hủy" KHÔNG hỏi. Verify nội dung + nhãn + khôi phục + không hỏi "Chờ đánh".

> **VERIFY** `.devtest/verify-prio1.js` = **15/15 PASS**, console/network SẠCH.

### NHÓM 3 — LỚN (CHỈ THIẾT KẾ — DỪNG CHỜ DUYỆT) 📋
- [x] 3A. Soạn thiết kế khóa trạng thái theo giờ ca + "Từ chối khách" → `docs/THIET-KE-NHOM3.md` §1. KHÔNG code.
- [x] 3B. Soạn thiết kế Lịch Sử Điểm Uy Tín → `docs/THIET-KE-NHOM3.md` §2. KHÔNG code.
- [ ] 🔴 CHỜ CHỦ APP DUYỆT 3A + 3B trước khi build.

### HẬU KỲ ✅
- [x] Bump `?v=20260612a`: giao-dien.css, hieu-ung-giao-dien.js, phan-he-host.js, phan-he-thong-bao.js (index) + hieu-ung (admin).
- [x] `node --check` 3 file JS = OK. Playwright `.devtest/verify-prio1.js` = 15/15 PASS (walker v2, recorder console+network).

---

## 🔄 PHIÊN REDESIGN ĐIỂM UY TÍN: EVENT-BASED → STATE-BASED DELTA — ✅ 4/4 PASS

### ✅ Hàm trung tâm `apDiemTheoTrangThai(sdt, oldState, newState, slotId, ctx)` (phan-he-khach-choi.js)
- [x] Nguyên tắc: `diem += (deltaMới − deltaCũ)` → undo trạng thái cũ + áp mới, KHÔNG cộng dồn dù đổi qua lại.
- [x] Bảng delta: Chờ đánh=0 · Đã tham gia=+2 · Bùng kèo=−10/−20/0+khóa(lần≥3) · Khách hủy=thang giờ (ctx.phut; host-set=0). Đếm lần bùng = số slot KHÁC "Bùng kèo" (30 ngày)+1. `so_ca_thanh_cong` net (+1 vào/−1 rời Tham gia). Khóa 1 chiều. Toast điểm + TB G1/G3/H3b/S1 tập trung tại đây.
- [x] `xuLyBungKeo` → wrapper (đọc oldState + ghi Bùng nếu ghiStatus + gọi apDiem) → `baoCaoGhost` giữ nguyên.

### ✅ Thay thế điểm gọi (oldState đọc DB THẬT, không tin DOM)
- [x] `doiTrangThaiDiDanh`: đọc oldState từ DB → ghi status mới → `apDiemTheoTrangThai`; bỏ toàn bộ logic +2/xuLyBungKeo/notif cũ.
- [x] `xacNhanThamGia`: gọi apDiem cả 2 chiều (tick/bỏ tick); bỏ +2 cũ.

### ✅ Verify `.devtest/verify-statebased.js` — 4/4 PASS, console/network sạch
- [x] T1 Chờ→Tham→Bùng→Tham→Bùng (80)→**70**; T2 Bùng→Tham×5 (80)→**70**; T3 bùng 3 slot khác nhau (100)→**70 + KHÓA**; T4 bùng→tham→bùng cùng slot (80)→**70 KHÔNG khóa**.

### 🟡 SQL tùy chọn + giới hạn
- [ ] `migration-bung-flag-v1.sql` (`da_dem_bung BOOL`) — KHÔNG cần cho 4 test; chỉ cho edge "bùng A→đổi đi→bùng B = lần 2". CHỜ DUYỆT.
- [x] Giới hạn clamp: điểm sát trần 100 toggle qua +2 có thể kẹp ≤2đ (không ảnh hưởng test start 80). Bump `?v=20260611i` (khach-choi, host).

---

## 🐞 PHIÊN FIX 3 BUG KHẨN + UI THÔNG BÁO MOBILE — ✅ 6/6 PASS

### ✅ Bug 1 — Trừ điểm CỘNG DỒN khi đổi trạng thái qua lại (NGHIÊM TRỌNG)
- [x] Gốc: `doiTrangThaiDiDanh` đọc `dataset.prev` (không tồn tại trên proxy dropdown) → `prevVal`=giá trị mới → "Bùng kèo" trừ mỗi lần.
- [x] Fix KHÔNG SQL (chủ app chốt): gate theo trạng thái CŨ. `xuLyBungKeo` nhận `opts.ttCu` (null→đọc DB), **chỉ phạt khi cũ="Chờ đánh"**; `doiTrangThaiDiDanh` truyền `_ttCu=dataset.current`, +2/G3 chỉ khi cũ="Chờ đánh"; `xacNhanThamGia` đọc cũ trước khi ghi.
- [x] Verify: Bùng↔Tham gia 5 lần → điểm đổi đúng 1 lần (100→90); +2 đúng 1 lần (80→82).

### ✅ Bug 2 — UI icon chuông tối/chìm + mobile
- [x] `.tb-chuong` accent `#00ff88` + bg/border đậm + glow + hover mạnh + biến thể light mode.
- [x] Mobile @390: chuông HIỆN trong viewport (cạnh login+hamburger). Screenshot `bell-390.png`/`bell-1440.png`.

### ✅ Bug 3A — Host sửa được slot khách đã tự hủy
- [x] `_renderCustomDropdown`: slot "Khách hủy" → badge KHÓA tĩnh (không dropdown) + tooltip "Khách đã tự hủy slot này"; guard `_triggerGlCdd` chặn đổi từ "Khách hủy".

### ✅ Bug 3B — Lệch trạng thái card khách (đã hủy)
- [x] Chủ app chốt **KHÔNG cho đặt lại**. Thêm `daHuySet` → card + modal chi tiết hiện badge **"ĐÃ HỦY"** (`.btn-da-huy` đỏ, disabled) thay nút Đặt.

### ✅ Dọn + bump
- [x] Bump `?v=20260611h`: giao-dien.css, phan-he-khach-choi.js, phan-he-host.js. Verify `.devtest/verify-bugfix3.js` 6/6 PASS, console/network sạch. `node --check` OK.

---

## 🔔 PHIÊN BUILD HỆ THỐNG THÔNG BÁO v1 (polling 30s · 7 sự kiện G1/G2/G3/H1/H2/H3b/S1 · KHÔNG admin broadcast)

### ✅ BƯỚC 0 — KIỂM TRA ĐỊNH DANH (xong)
- [x] Đọc `security-auth-v4.sql` + `supabase-schema.sql` + code login/host thực tế.
- [x] **Kết luận: định danh người dùng = SĐT (TEXT)**, KHÔNG dùng UUID. Khách & Host đăng nhập qua `guestRPC.login` → `phan_he_guest_login` RPC trả UUID **session token** lưu `guest_sessions` (token↔sdt_khach). Cả 2 vai trò KHÔNG có Supabase Auth `auth.uid()` (chỉ Admin có). Mọi bảng định danh bằng SĐT (`dat_slot.sdt_khach`, `ca_dau.sdt_nguoi_tao`, `danh_gia_tin_dung.sdt_*`). → cột `nguoi_nhan TEXT` (SĐT). Lý do chi tiết ghi trong header `migration-thong-bao-v1.sql` + báo cáo.
- [x] **`guest_sessions` xác nhận đã deploy + sống** (login chỉ có 1 đường = RPC; không có fallback REST tạo session) → RPC token-verified khả thi NGAY.

### ✅ BƯỚC 1 — SOẠN SQL (xong — đã DUYỆT + CHẠY trên Supabase)
- [x] `migration-thong-bao-v1.sql` (MỚI): bảng `thong_bao` + 2 index + RLS khóa anon + 5 RPC SECURITY DEFINER (`ghi_thong_bao`/`lay_thong_bao`/`dem_thong_bao_chua_doc`/`danh_dau_da_doc`/`danh_dau_tat_ca_da_doc`) tự verify token với `guest_sessions` + verify SELECT cuối file.
- [x] Bảo mật theo yêu cầu: RLS bật, KHÔNG policy anon trực tiếp → đọc/ghi/đánh dấu CHỈ qua RPC (không dựa filter client). INSERT chỉ qua `ghi_thong_bao` (trusted function), bắt token người gửi.
- [x] 🟢 Chủ app đã DUYỆT + chạy SQL thành công trên Supabase Dashboard.

### ✅ BƯỚC 2 — BUILD (xong)
- [x] `phan-he-thong-bao.js` MỚI: tự khởi tạo `_sbClient`; poll 30s (visibilitychange — ẩn tab thì ngưng); badge `dem_thong_bao_chua_doc`; drawer phải `lay_thong_bao` (lọc 30 ngày); click→điều hướng (`chuyenTab`/`openGuestListModal`) + đánh dấu đọc; "Tất cả đã đọc"; escHTML mọi nội dung. Expose `window.guiThongBao()` (best-effort, fire-and-forget).
- [x] `index.html`: nút chuông 🔔 + badge trong header + overlay/drawer markup; nạp `<script phan-he-thong-bao.js?v=20260611g>`; bump CSS giao-dien + JS khach-choi/host → `?v=20260611g`.
- [x] 7 điểm phát qua `window.guiThongBao`: **G1** (xacNhanThamGia + doiTrangThaiDiDanh "Đã tham gia"), **G2** (xoaCaDau→tất cả khách đã đặt), **G3** (doiTrangThaiDiDanh "Khách hủy" + xuLyBungKeo), **H1** (datSlot, gộp 60s), **H2** (huyDatSlot, gộp 60s), **H3b** (xuLyBungKeo→host), **S1** (xuLyBungKeo lần 3/điểm<40 + _truDiemUyTin khi chạm mốc khóa). Chống spam: gộp H1/H2 cùng `gop_key` trong 60s (`gopGiay:60`).
- [x] Hook lifecycle: `khoiDongThongBao()` trong `_hienThiDashboardKhach`, `dungThongBao()` trong `dangXuatKhach`.
- [x] CSS drawer (giao-dien.css, palette hex tự chứa): `.tb-chuong/.tb-badge/.tb-overlay/.tb-drawer/.tb-item/...` + responsive mobile full-width.
- [x] `node --check` 3 file JS = OK.

### ✅ BƯỚC 3 — VERIFY Playwright (`.devtest/verify-thongbao.js`) — **13/13 PASS**, console/network SẠCH
- [x] H1 end-to-end qua `datSlot` THẬT (khách K1 đặt → host nhận "Khách đặt slot mới"); badge hiện; drawer mở + render; click→đánh dấu đọc→badge giảm 1; cả 6 loại còn lại round-trip + render đủ icon; **gộp 2 H1 cùng ca/60s → 1 dòng**; **anon đọc REST thong_bao trực tiếp → [] (RLS khóa)**; đánh dấu tất cả → unread=0 + badge ẩn.

### ✅ BƯỚC 4 — DỌN + BUMP (xong)
- [x] Bump `?v=20260611g`: giao-dien.css, phan-he-khach-choi.js, phan-he-host.js, phan-he-thong-bao.js (mới). Cập nhật TODO.md + CLAUDE.md.
- [x] Bảng 7 sự kiện pass/fail: tất cả PASS (xem BƯỚC 3). Không bug tồn đọng.

### Bảng 7 sự kiện (verify)
| # | Sự kiện | Phát từ | Người nhận | Verify |
|---|---|---|---|---|
| G1 | Host xác nhận "Đã tham gia" | xacNhanThamGia / doiTrangThaiDiDanh | khách | ✅ |
| G2 | Host hủy ca | xoaCaDau | tất cả khách đã đặt | ✅ |
| G3 | Bùng kèo / Khách hủy | doiTrangThaiDiDanh / xuLyBungKeo | khách | ✅ |
| H1 | Khách đặt slot (gộp 60s) | datSlot | host | ✅ (end-to-end thật) |
| H2 | Khách hủy slot (gộp 60s) | huyDatSlot | host | ✅ |
| H3b | Khách bùng | xuLyBungKeo | host | ✅ |
| S1 | Tài khoản bị khóa | xuLyBungKeo / _truDiemUyTin | người bị khóa | ✅ |

---

## ✅/📋 PHIÊN E — CỌC DS KHÁCH + THIẾT KẾ THÔNG BÁO + CHUẨN HÓA BẢNG

### ✅ PART 1 — Trạng thái cọc trong DS Khách (KHÔNG SQL, dùng localStorage)
- [x] **Cột "Cọc"** trong DS Khách host (chỉ ca `yeu_cau_coc`) — thêm ở CUỐI bảng (sau Đánh Giá) để KHÔNG đụng `cells[7]/[9]` mà `doiTrangThaiDiDanh` dựa vào. Badge "Chưa cọc" (cam) → bấm → "✓ Đã cọc" (xanh). Slot Khách hủy/Bùng → "—".
- [x] **Persist localStorage** `tvl_coc_status` (per-slot) — cọc thỏa thuận NGOÀI app, host tự theo dõi; nhớ qua reload trên cùng trình duyệt host. Helper `_daCoc/_toggleCoc/_capNhatCocSummary/_syncCocColumn` (phan-he-host.js).
- [x] **Tóm tắt X/Y** "đã xác nhận cọc": trong DS Khách modal (`#gl-coc-summary`) + modal Chi Tiết ca (`xemChiTietCaDau` → `.coc-banner` X/Y).
- [x] **Phía khách**: Lịch Sử ca `yeu_cau_coc` + slot "Chờ đánh" → nhắc tĩnh `.ls-coc-reminder` "liên hệ host chuyển cọc". (Giới hạn: mark "đã cọc" của host ở localStorage host → khách KHÔNG đọc được; nhắc là TĨNH. Muốn ẩn theo trạng thái host cần field DB — chờ duyệt, không tự SQL.)
- [x] **Verify** `.devtest/verify-coc2.js` = **10/10 PASS** (cột hiện/ẩn đúng, badge toggle + LS persist, X/Y cập nhật, chi tiết X/Y, nhắc khách). Console/network sạch.

### 📋 PART 2 — Thiết kế hệ thống THÔNG BÁO (CHƯA CODE — chờ duyệt)
- [x] Soạn `docs/THIET-KE-THONG-BAO.md`: (A) danh sách sự kiện (khách/host/admin) + bổ sung; (B) 2 phương án (polling 30s vs Realtime) → **khuyến nghị polling** (RLS còn lỏng, quy mô nhỏ); (C) UI chuông 🔔 + drawer phải + click→điều hướng; (D) ước lượng (1 SQL + 1 JS mới + ~5 file sửa, độ phức tạp TB); (E) rủi ro (spam/cũ/quyền chéo/đa thiết bị/XSS). Đề xuất v1 = 6 sự kiện ưu tiên Cao.
- [ ] 🔴 **CẦN DUYỆT**: chọn polling/realtime + phạm vi v1 + admin broadcast? → mở phiên build + 1 file SQL.

### ✅ PART 3 — Chuẩn hóa căn chỉnh bảng
- [x] **Chuẩn `.hs-table`** (components.css): header nền đậm+`font-weight:600`+chữ hoa; border dọc/ngang subtle; **zebra** hàng chẵn; **hover** nhẹ; helper căn ngữ nghĩa `.ta-r`(tiền=phải)/`.ta-c`(số/trạng thái/thao tác/ngày=giữa)/`.ta-l`(văn bản=trái); `.dt-hide-sm` ẩn cột mobile.
- [x] **Áp vào Doanh Thu** (host): Ngày→giữa, Tên Sân→trái, Khách→giữa, **Tổng Chi/Tổng Thu/Lời-Lỗ→PHẢI** (chuẩn kế toán), Thao Tác→giữa; header khớp; bỏ zebra inline (dùng CSS); mobile ẩn cột Tổng Chi + nút In. Ảnh `screenshots/dt-p3{before,after}-{390,1440}.png`.
- [x] **Rà bảng khác**: admin `.ad-table` (×5) ĐÃ chuẩn sẵn (zebra/header/border/hover); host `.app-table` (Ca Đã Đăng) đã overhaul phiên 9-10; `#modal-guest-list-table` có border/zebra/hover inline; bảng cau/khách chi-tiết có header bg + tiền căn phải. → chỉ `.hs-table` thiếu chuẩn (đã fix).
- [x] Bump `?v=20260611f`: giao-dien.css, components.css, phan-he-khach-choi.js, phan-he-host.js.

---

## ✅ PHIÊN D — FIX UI DOANH THU + HOÀN THIỆN "THU CỌC TRƯỚC"

### ✅ PART 1 — UI Doanh Thu (tab Đăng & Quản Lý) full-width
- [x] **Chẩn đoán** (đo width chain Playwright, không đoán): metric `.stats-grid-4` ĐÃ full-width sẵn (4 cột desktop / 2 cột ≤768px). Thủ phạm "trống nửa phải": **`.hs-table` không có rule CSS** — chỉ inline `min-width:860px` mà THIẾU `width` → bảng co ~860px căn trái trong container 1394px.
- [x] **Fix**: `components.css` thêm `.hs-table { width:100% }` (lấp đầy desktop; min-width inline vẫn giữ cuộn ngang mobile trong `.tvl-xscroll`). 
- [x] **Mobile ẩn nút In**: class `.dt-print-btn` + `@media (max-width:767px){ display:none }`. Verify DOM: `@390 In=none`, `@1440 In=flex` (CSV+Chi Tiết vẫn hiện). Ảnh `screenshots/dt-{before,after}-{390,1440}.png`.
- [x] Bump `components.css?v=20260611e`, `phan-he-host.js?v=20260611e`.

### ✅ PART 2 — Chức năng "Thu Cọc Trước"
- [x] **Chẩn đoán = (A) CHƯA HOÀN THIỆN**: form host lưu `yeu_cau_coc` vào `ca_dau` (cột tồn tại; toggle gated `_kiemTraDieuKienCoc`: ≥7 ngày + ≥3 ca chốt). NHƯNG phía khách (`phan-he-khach-choi.js`) **0 chỗ đọc `yeu_cau_coc`** — chỉ có scam_warning (ngược chiều) + report lừa-cọc. → Host bật cọc, khách không thấy gì.
- [x] **Chủ app chọn: "Thông báo + xác nhận khi đặt"** (không chặn cứng, không thu tiền — cọc thỏa thuận NGOÀI app). Đã build:
  - Badge `.coc-banner` (amber) "Ca này YÊU CẦU CỌC TRƯỚC" trên **card Tìm Kèo** + **modal chi tiết**.
  - **`datSlot`**: nếu `caDau.yeu_cau_coc` → `xacNhanModal` nhắc khách đã liên hệ host chuyển cọc; HỦY = không đặt, ĐỒNG Ý = đặt tiếp.
  - CSS `.coc-banner` (giao-dien.css, mirror `.scam-banner` màu amber).
- [x] **Verify sống** (`.devtest/verify-coc.js`): **9/9 PASS** — banner card/modal đúng (ca-cọc hiện, ca-thường ẩn); confirm có nội dung cọc; HỦY→không đặt, ĐỒNG Ý→đặt; ca-không-cọc không hỏi. Console/network sạch. Bump `giao-dien.css?v=20260611e`, `phan-he-khach-choi.js?v=20260611e`.

---

## ✅ PHIÊN C — SUITE PLAYWRIGHT SỐNG TRÊN DB THẬT (QATEST) + FIX BUG RAPID-CLICK

> Harness `.devtest/qa-lib.js` (dùng chung) + 6 sweep độc lập. Dữ liệu test tiền tố
> `QATEST-` (5 SĐT `038999000{1..5}`). Walker v2: timeout/cap, listener console+network
> mọi sweep (Nhóm 5). **Tổng: 81/81 assertion PASS**, console/network SẠCH mọi sweep.

### Kết quả từng nhóm
- **Nhóm 0** (dựng QATEST): 1 host + 4 khách + 5 ca (có ca giá lẻ 75.000đ) → 5/5 hiện Tìm Kèo. **PASS**.
- **Nhóm 1** (vòng đời ca): đăng→search→đặt(trống −1)→Lịch Sử→DS Khách→Chờ đánh→Đã tham gia→**persist sau reload**→khách hủy(trống +1, không tính ca chờ)→chốt→không đặt thêm. **18/18**.
- **Nhóm 2.1** (doanh thu): = Σ slot HỢP LỆ (Đã tham gia + đã thanh toán + ca chốt); loại hủy/chờ/chưa-trả. Bảng + modal Chi Tiết format **K**, 0 chỗ `.000đ`. **8/8**.
- **Nhóm 3.2a** (uy tín): Tham gia **+2** (cap 100, không cộng lặp); Khách hủy thang giờ **0/-2/-4/-6** đúng ranh giới 240/120/30; modal BÁO TRƯỚC đúng mức phạt. **21/21**.
- **Nhóm 3.2b** (uy tín): Bùng **−10/−20+cảnh báo/lần3 KHÓA** (cả 2 đường dropdown+ghost qua `xuLyBungKeo`) → login chặn (`blocked`) → admin `_khoaMoTV` mở khóa → login lại OK. Host hủy thang `0/-3/-3/-6/-6/-8` (đúng). Ngưỡng: <40 chặn / <60 siết 1-ngày / ≥80 cap 3-ngày / <80 mất highTrust. **19/19**.
- **Nhóm 4.2** (rapid-click ×5): datSlot/đổi-trạng-thái/góp-ý/đăng-kèo/chốt → 1 bản ghi + ≤1 toast. **10/10** sau fix.

### 🔴 BUG ĐÃ FIX (phát hiện ở Nhóm 4.2 — bấm nhanh 5× trừ điểm/toast NHIỀU LẦN)
- [x] **`huyDatSlot`** (khach-choi) thiếu guard → 5 click = trừ điểm hủy ×5 (80→70 thay vì 78). Thêm cờ `window._huyDatSlotBusy` (set trước `xacNhanModal`, nhả trong `finally`). Xác nhận lại: 80→78 (1 lần).
- [x] **`baoCaoGhost`** (host) thiếu guard → 5 click = `xuLyBungKeo` chạy ×5 trên cùng slot (100→70). Thêm `window._ghostBusy` + restructure confirm vào try/finally. Xác nhận: 100→90 (1 lần).
- [x] **`chotCaDau`** (host) thiếu guard → 5 click = 5 PATCH + toast lặp (2 toast). Thêm `window._chotCaBusy`. Xác nhận: 1 toast.
- [x] Verify không hồi quy: Nhóm 1 re-run **18/18** sau fix. `node --check` 2 file PASS. Bump `?v=20260611d` (khach-choi + host trong index.html).

### 🔴 PHÁT HIỆN BẢO MẬT/CHỨC NĂNG SỐNG — anon KHÔNG DELETE được (RLS)
- DELETE qua anon key trả **204 nhưng xóa 0 dòng** (RLS không có policy DELETE) — xác nhận live ở `dat_slot`/`ca_dau`/`nguoi_dung`. Hệ quả thực tế:
  - **Host KHÔNG xóa được ca của mình** (`xoaCaDau` → "Không thể xóa — liên hệ Admin"). Client xử lý đúng (verify + báo), nhưng tính năng Xóa **vô dụng cho host** đến khi có RLS DELETE policy / RPC token. Workaround: "Tạm khóa" (PATCH, hoạt động).
  - **Phạt "Host hủy ca"** trong `xoaCaDau` nằm SAU bước verify-deleted → vì DELETE luôn fail, **phạt host không bao giờ áp dụng** live (thang HOST_HUY đúng nhưng path bị chặn). 
- → KHÔNG tự sửa (cần SQL/RPC — chờ duyệt). Trùng lộ trình `docs/LO-TRINH-BAO-MAT.md` (security-auth-v4 + RPC). Đây là RLS lỏng theo CHIỀU NGƯỢC (chặn DELETE hợp lệ) song song với RLS lỏng chiều xuôi (cho anon SELECT/UPDATE).

### 🧹 Dọn QATEST + SQL chờ duyệt
- [x] Vì anon không DELETE được → **NEUTRALIZE bằng PATCH**: ca→`da_chot_ca+is_tam_khoa+ngày quá khứ` (ẩn Tìm Kèo), slot→"Khách hủy", user→`is_active=false`. Verify: **0 card QATEST còn HIỆN** trong Tìm Kèo; leftCaVisible/SlotActive/UserActive = 0.
- [ ] 🔴 **`cleanup-qatest.sql`** (MỚI — chờ duyệt): xóa VẬT LÝ ~55 ca + ~50 slot + 3 góp ý + 5 user QATEST còn tồn (ràng theo tiền tố `QATEST-SAN-`/5 SĐT). Chạy 1 lần trên dashboard.

### Hạ tầng test (`.devtest/`)
- `qa-lib.js` (helper chung: __QA in-page — createUser/loginAs/createCa/seedSlot/resetSlotsOf/cleanup + bắt toast/confirm + listener). Sweep: `nhom0-setup`, `nhom1-vongdoi`, `nhom2-doanhthu`, `nhom3a-trust`, `nhom3b-trust2`, `nhom4-rapid`, `nhom-cleanup`. (`.devtest/` đã `.vercelignore`.)

---

## ✅ PHIÊN 19 — CHUẨN HÓA BẢNG UY TÍN (SSOT) + WORDING ĐÁ→ĐÁNH

### ✅ A. Bảng thưởng/phạt uy tín — 1 nguồn `window.DIEM_UY_TIN`
- [x] Thêm `window.DIEM_UY_TIN` + `tinhDiemPhatTheoGio` / `phutConLaiToiGioDanh` / `moTaThoiGianConLai` (bo-may-du-lieu.js §0B). Thang giờ dạng mảng `[{phut,diem}]` chỉnh ở 1 chỗ.
- [x] **Tham gia OK +2** route qua `THAM_GIA_OK` (xacNhanThamGia + dropdown doiTrangThaiDiDanh, chỉ cộng khi CHUYỂN sang "Đã tham gia").
- [x] **Khách hủy** thang `KHACH_HUY` (>4h:0 / 2–4h:−2 / 30p–2h:−4 / <30p:−6) thay logic 7/3 cũ; modal BÁO TRƯỚC mức phạt + thời gian còn lại; ghi `huy_luc` fallback REST.
- [x] **Bùng kèo** hợp nhất `window.xuLyBungKeo(sdt,datSlotId,{ghiStatus})`: đếm rolling-30d theo `huy_luc`, lần 1=−10 / lần 2=−20+cảnh báo / lần 3=KHÓA (`is_active=false`). CẢ `baoCaoGhost` + `doiTrangThaiDiDanh` đi qua đây (xóa −15 & −10 hardcode).
- [x] **Host hủy ca có người đặt** thang `HOST_HUY` (>4h:0 / 2–4h:−3 / 30p–2h:−6 / <30p:−8) phạt host trong `xoaCaDau` + cảnh báo modal.
- [x] Khóa TK = `is_active=false` (login chặn khach-choi:91/636/1006; admin `_khoaMoTV` mở khóa sẵn) → KHÔNG cần SQL.
- [x] Verify headless: `node .devtest/trust-test.js` = **32/32 PASS** (ranh giới 240/120/30 + hằng số). `node --check` 3 file = OK.

### ✅ B. Wording đá→đánh
- [x] 6× `"đá xong"→"đánh xong"` (khach-choi: 2 toast hiển thị 2106/2124 + 4 comment). Giá trị DB `trang_thai_di_danh` GIỮ NGUYÊN. host/index/gop-y sạch (đều là "đánh"/"đánh giá" đúng).

### ✅ C — ĐÃ LÀM Ở PHIÊN C (xem mục đầu file)
- [x] Suite Playwright SỐNG trên QATEST: Nhóm 0/1/2.1/3.2a/3.2b/4.2/5 → **81/81 PASS**, fix 3 bug rapid-click (huyDatSlot/baoCaoGhost/chotCaDau thiếu guard), phát hiện RLS chặn anon DELETE (host xóa ca + phạt host-hủy bất khả thi live) → `cleanup-qatest.sql` chờ duyệt.

---

## ✅ PHIÊN 18E — Money→K + luật uy tín + chống spam toast/click (Nhóm 2,3,4)

### ✅ Nhóm 2.2 — ĐỒNG BỘ TIỀN VỀ "K" TOÀN HỆ THỐNG
- [x] Thêm `window.formatTienK()` (bo-may-du-lieu.js): 75.000đ→`75K`, 1.250.000đ→`1.250K`, lẻ<1000đ→0,1K (75.500đ→`75,5K`). Verify Playwright: `["75K","1.250K","75,5K","0K"]` ✅.
- [x] Route MỌI hiển thị tiền về formatTienK: `_formatVND`+`_fmtK` (khach-choi), `_formatVND`+`_formatK` (host), `_vnd`+`_fVND` (quan-tri) + inline (`_fmt` host:1990, host:2056/3028, price-filter khach-choi:1179/1416) + placeholder `0đ`→`0K` (index.html). 
- [x] Verify: grep `toLocaleString+đ` value-render = **0**; màn Doanh Thu/Tìm Kèo `.000đ` còn = **0** (ảnh `money-doanhthu-1440.png`). Trust "đ" (uy tín) + label input "(đ)" GIỮ nguyên (không phải money-value).

### ✅ Nhóm 3.1 — BẢNG LUẬT UY TÍN (đã đọc code)
| Hành động | Điểm | Mốc/Hệ quả |
|---|---|---|
| Đặt slot khi điểm <40 | chặn | tài khoản hạn chế |
| Đặt slot <60 | 1/ngày | mức Cảnh cáo |
| Đặt slot 60–79 | không giới hạn/ngày | normal |
| Đặt slot ≥80 | 3/ngày + 5 ca chưa đá | highTrust |
| TK mới <7 ngày | 2/ngày + 5 ca chưa đá | |
| Đăng kèo (host) điểm <60 | chặn đăng | (trừ whitelist) |
| Hoàn thành ("Đã tham gia") | **+2** (max 100) +so_ca_thanh_cong | thưởng |
| Điểm <40 | is_active=false | tự khóa TK |
| Whitelist | miễn trừ điểm + miễn khóa đăng | |

### 🟡 Nhóm 3.3 — CHỜ CHỦ APP QUYẾT (không tự sửa luật)
- ⚠️ **Phạt "Bùng kèo" KHÔNG nhất quán**: nút "Báo cáo Ghost" → **−15** (host:2253); dropdown đổi trạng thái→"Bùng kèo" → **−10** (host:2935). Cùng kết quả "Bùng kèo" nhưng phạt khác nhau. Cần chốt 1 con số.

### ✅ Nhóm 4 — Toast & chống spam
- [x] **4.2.B Toast dedupe**: `hienToast` thêm dedupe (cùng type+title+msg trong 2s → 1 toast). Bấm nhanh 5 lần → không 5 toast chồng.
- [x] **4.2.A Guard**: INSERT đã guard (datSlot `_datSlotBusy`, đăng kèo `_dangCaBusy`, góp ý `_dangGui`). UPDATE phần lớn idempotent; **`doiTrangThaiDiDanh`** trừ điểm bùng (−10) KHÔNG idempotent + dropdown dùng proxy (selectEl.disabled vô hiệu) → thêm cờ `window._doiTTBusy` (chặn double trừ điểm).
- 🟢 4.1 review toast: các toast trong luồng đều có tiêu đề + lý do cụ thể tiếng Việt (vd "Giới hạn ca đang chờ — Bạn đang có N ca chưa đá xong..."), 3 loại success/warning/danger khớp design system. Chưa thấy "Có lỗi xảy ra" chung chung trong luồng chính.

### ⏳ CHƯA LÀM (cần phiên Playwright riêng — dữ liệu QATEST)
- [ ] Nhóm 0 (dựng QATEST: 1 host + 2 khách + 4-5 ca), Nhóm 1 (vòng đời ca: đăng→search→đặt→DS khách→đổi trạng thái persist→mở khóa Đánh Giá→hủy→chốt), Nhóm 2.1 (assert doanh thu = tổng slot hợp lệ), Nhóm 3.2 (test sống từng luật uy tín), Nhóm 4.2 LIVE (rapid-click 5x mọi nút), Nhóm 5 (săn lỗi kèm assertion). → Lý do hoãn: cần dựng+dọn dữ liệu test sống (Playwright dài), tách phiên riêng để tránh treo/làm dở.

### 🟡 Deploy
- [x] Bump `?v=20260611b`: bo-may, khach-choi, host, hieu-ung (index) + bo-may, quan-tri, hieu-ung (admin). `node --check` 5 file PASS.

---

## ✅ PHIÊN 18D — Test chức năng sâu + fix bug dropdown DS Khách

### 🔴 Đã fix — BUG dropdown DS Khách bị cắt khi ít hàng
- [x] **Gốc**: `.gl-cdd-menu` là `position:absolute` trong `td.td-cdd`, nhưng tổ tiên `#modal-guest-list-scroll` có `overflow-y:auto` (+`overflow-x:auto` mobile) → **CẮT menu**. Drop-up detection cũ đo theo `#modal-guest-list-inner` (sai container — có footer/bulk-bar dưới vùng scroll) → ít hàng thì menu bị cắt TRƯỚC khi kịp lật.
- [x] **Fix triệt để**: chuyển menu sang **`position:fixed`** + toạ độ tính theo nút (`_toggleGlCdd`), neo viewport → thoát mọi overflow; tự lật lên khi thiếu chỗ + kẹp 2 mép + đóng khi scroll/resize. CSS `.gl-cdd-menu` → fixed; gỡ `.is-drop-up` (không cần).
- [x] **Tái hiện + xác minh** (Playwright, ca 1 khách "SÂN CẦU LÔNG GENZ"): BEFORE(absolute) `clippedByScroll=true onTop=false` (cắt); AFTER(fixed) `inViewport=true onTop=true` → **PASS** @390 & @1440. Ảnh `screenshots/{before,after}-dropdown-{390,1440}.png`.

### 🟢 Quét cùng pattern toàn site
- ✅ Admin `.ca-action-menu` (`_toggleCaMenu`): ĐÃ dùng `position:fixed`+flip+clamp+scroll-close (đúng chuẩn, không cần sửa).
- ✅ Còn lại: `<select>` native + `<input type=date>` (trình duyệt tự định vị, không bị clip) + pills inline. → chỉ dropdown DS Khách cần fix.

### ✅ Test chức năng theo kỳ vọng (assertion)
- [x] **A1 Profile persist**: lưu bio → xóa session → đăng nhập tươi (ép tải DB) → bio đúng giá trị mới. **PASS ✅**
- [x] **A2 Level filter EXACT (12 mức)**: mỗi mức → **0 false-positive** (không card nào hiện ra mà thiếu đúng mức đó; "TB" không lọt "TB KHÁ"). **PASS ✅** cả 12.
- [~] **A3 datSlot phản ánh UI**: SKIP — tài khoản test đã đặt hết ca mở (data); path đã chạy sạch ở sweep 18C.
- 🟢 Các assertion khác (hủy slot, host đổi trạng thái persist + mở khóa Đánh Giá, đăng kèo hiện trong Tìm Kèo, chấm điểm) — path đã exercise 0-lỗi ở 18C; chưa assert sâu (mutate dữ liệu thật, để lần sau hoặc trên DB test riêng).

### 🧹 Dọn dữ liệu test
- [x] Xóa 2 góp ý `'QA auto feedback'` + reset bio rỗng + hủy slot test A3 (A3 skip nên không tạo).

### 🟡 Deploy
- [x] Bump `phan-he-host.js?v=20260611` (dropdown fix). CSS sửa trong inline `<style>` index.html (entry tải tươi). `node --check` host.js PASS.

---

## ✅ PHIÊN 18C — Săn lỗi tự động (Playwright, listener console+network)

- [x] Walker v2 cứng rắn: timeout 20s/bước + tổng 10 phút + write fire-and-forget + log tiến độ ngay (v1 treo 4h vì await write không timeout + chỉ in cuối). Đi khách→host→admin @390 & @1440 trong 94s.
- [x] **KHÁCH: 0 lỗi** (login, tìm kèo + filter + từ khóa không kết quả, chi tiết ca, đặt slot, hủy slot, lịch sử, hồ sơ lưu, góp ý gửi) — console+network sạch cả 2 khổ.
- [x] **HOST: 0 lỗi** (đăng kèo input sai giá âm/ngày quá khứ → bị chặn client KHÔNG ra network, sửa ca, doanh thu, DS ca, DS khách) — sạch cả 2 khổ.
- [x] Dọn dead code `_hostTs/_hostToken/_tsSession` (phan-he-host.js).
- [x] ✅ **ADMIN QA xong** (creds thật qua ENV): login OK, QA tab **Báo cáo** + **Đánh giá** @390 & @1440 → **0 console error / 0 network ≥400**, căn chỉnh tốt (1440 xuất sắc; 390 card 2×2 + tab nav wrap + bảng cuộn ngang OK). escHTML (ten_san/nhan_xet/tên user) render đúng dạng text. **Không cần fix.** Ảnh: `screenshots/admin-{baocao,danhgia}-{390,1440}.png`.
  - 🔒 Hygiene: creds chỉ qua ENV (`ADMIN_EMAIL`/`ADMIN_PW`), KHÔNG ghi file. Grep toàn dự án: password **0 kết quả**; email **0 trong .devtest** (chỉ còn ở CLAUDE.md + security-auth-v4.sql — file dự án gốc). Đã xóa ảnh có form login. PowerShell không giữ state giữa lệnh → ENV tự mất sau lần chạy.
- [x] Không phát sinh fix client (sweep sạch) → không cần bump thêm; host.js (dead code) vẫn ở `?v=20260610f`.

---

## ✅ PHIÊN 18B — QA giao diện bằng Playwright (chụp + soi + fix + so sánh)

### 🛠️ Hạ tầng test
- [x] Harness `.devtest/` (server tĩnh localhost:5599 + Playwright 1.60 chromium): login `0961446000`, chụp mọi tab @390 & @1440, bắt console error. (`.vercelignore` loại `.devtest/`+`screenshots/` khỏi deploy.)
- [x] PNG cũ dọn vào `screenshots/` (giữ logo.png/favicon.png assets ở gốc). Repo không phải git → bỏ qua .gitignore.
- [x] **Tắt Turnstile khi `location.hostname==='localhost'`** (cờ `window._tvlIsLocalhost`): bỏ render widget + KHÔNG nạp api.js CF + bypass `_xacMinhTurnstile`. Domain thật GIỮ NGUYÊN. Console localhost nay sạch 100%.

### 🔴 Đã fix — BUG GIAO DIỆN: LỊCH SỬ (ưu tiên 1, "lệch rõ nhất")
- [x] **Nguyên nhân**: `.ls-card` LEGACY trong `<style>` inline index.html (`display:flex;gap:14px`) ghi đè `.ls-card` thật ở giao-dien.css (do thứ tự nguồn) → `.ls-card-inner` chỉ rộng 319px thay vì full-width → chevron ▼ + giá "65.000đ" canh phải SAI (trôi theo độ dài tên sân), nội dung dồn trái 30%.
- [x] **Fix**: gỡ block `.ls-card`/`.ls-dot` legacy (dead, không dùng trong JS). Đo lại Playwright: `.ls-card` block, inner 1392px, chevron x=1379 (mép phải). Before/after: `screenshots/{before,after}-lichsu-*`.

### 🔴 Đã fix — Console error production
- [x] `_thucHienTimKiem` select `nguoi_dung` xin cột `ma_key_host,so_sao_tb` KHÔNG tồn tại → 400 mỗi lần tìm + 1 round-trip fallback `select=*` (lộ PII). Đổi select còn `sdt_khach,ten_khach,diem_uy_tin` (ranking đã null-guard). Console sạch.

### 🟡 Đã fix — polish
- [x] Bảng Doanh Thu host (mobile rộng 860px): thêm class `.tvl-xscroll` (bóng mép gợi ý cuộn ngang, background-attachment local). Bảng vốn đã cuộn đúng (overflow-x:auto, không tràn trang) — bổ sung "gợi ý cuộn" theo yêu cầu.

### ✅ Soi đạt chuẩn — KHÔNG cần sửa
- Hồ Sơ (form grid 2 cột, trust bar), Đăng Ca (2 section, pills 12 mức), Filter drawer mobile, Góp Ý modal (VietQR), DS Ca (cuộn ngang OK), Tìm Kèo, Đánh giá (empty state "—" hợp lệ). Tất cả @390 & @1440 căn chỉnh tốt.

### ⛔ BỊ CHẶN
- [ ] Tab admin (Báo cáo, Đánh giá): thiếu credentials admin test (đề bài để `[điền]`). Cần bạn cấp SĐT+mật khẩu admin test để chụp/soi 2 tab này.

### 🟡 Deploy
- [x] Bump `?v=20260610f` cho file đổi: index→ giao-dien.css, hieu-ung, khach-choi, host; admin→ hieu-ung, quan-tri. Các file không đổi giữ version cũ.

---

## ✅ PHIÊN 18 — Bug giới hạn slot + escHTML/XSS + design tokens + transition cleanup

### 🔴 Đã fix — BUG NGHIÊM TRỌNG: giới hạn đặt slot không reset
- [x] **Nguyên nhân gốc**: nhánh `highTrust` (điểm ≥80) trong `datSlot` đếm slot "Chờ đánh" trong 30 ngày NHƯNG **không join ca_dau** → ca đã đá xong mà host quên chốt vẫn kẹt "Chờ đánh" → bộ đếm `soActiveSlots` không bao giờ reset → chặn khách cả tuần dù không còn ca chờ. (Nhánh `newAccount` đã join đúng, nhánh highTrust bị sót.)
- [x] **Fix**: gom đọc `dat_slot` 1 lần → `_demSlotHomNay()` (đếm theo lịch VN) + `_demChoDanhThucSu()` (join ca_dau, CHỈ đếm ca chưa tới `gio_ket_thuc`, loại ca đã chốt/đã xóa). Dùng chung cho cả newAccount + highTrust. Đổi `if` rời rạc → `if/else if` (các mức loại trừ lẫn nhau).
- [x] **Thông báo cụ thể** từng loại giới hạn (point 5): "đủ N slot hôm nay — reset sau 0h" vs "N ca chưa đá xong — chờ đá xong là tự được đặt tiếp". Không còn 1 câu chung chung.
- [x] **Pattern liên quan** (`_taiThongKeKhach`): counter "đang chờ" cũng loại ca đã quá `gio_ket_thuc` (nhất quán).
- [x] Cập nhật comment `SLOT_LIMIT_CONFIG` (maxChoNgay7/maxActiveSlots = "ca chưa đá xong cùng lúc", không theo mốc ngày cố định).

### 🟢 Quét rộng pattern đếm/limit/cooldown — KHÔNG có bug khác
- ✅ Host: KHÔNG có giới hạn đăng kèo/ngày (chỉ hint khuyến nghị 8 người, không chặn). Cooldown thanh toán = 3s anti-double-click (Map tạm, tự hết).
- ✅ Góp ý (`phan-he-gop-y.js`): rate-limit 5/ngày + cooldown 5 phút dùng cửa sổ trượt 24h (`ts > dayAgo`) → reset đúng.
- ✅ `dbEngine.doc/docThu` KHÔNG cache → mọi kiểm tra giới hạn đọc dữ liệu tươi. Cache 20s chỉ ở `_thucHienTimKiem` (riêng).
- ✅ Tài khoản mới <7 ngày / badge: derive từ `created_at` → tự hết.

### 🔴 Đã fix — XSS (độc lập, không đụng SQL)
- [x] **`hienToast` (hieu-ung-giao-dien.js)**: dựng `innerHTML` với `${title}/${msg}` → XSS qua TOÀN BỘ toast (caller truyền ten_khach/ten_san/sdt). Đổi sang `textContent` (DOM/CSS giữ nguyên). Chặn 1 lớp XSS dùng chung toàn app.
- [x] **`phan-he-quan-tri.js`** vá điểm sót `_escHtml`: `ca.ten_san` (Báo cáo), `_layTen` tên user + `nhan_xet` (bảng Đánh giá), nâng escape `< >` → `_escHtml` đủ 5 ký tự (card đánh giá).
- [x] Cập nhật `docs/LO-TRINH-BAO-MAT.md` §0.1 (kiểm phân quyền admin) + §2.0 (XSS đã vá) + §2.2 (escHTML còn lại: khach-choi + host).

### 🔴 Phân quyền Admin — đã GHI NHẬN (không tự siết RLS)
- [x] Cổng đăng nhập admin: JWT Supabase Auth + SELECT verify `vai_tro=admin` (auth_uid không fake được) → hợp lý.
- [ ] 🔴 NHƯNG thao tác admin (xóa user/đổi vai trò/CRUD key/xóa ca) **chỉ dựa RLS**; RLS đang `USING(true)`, `is_admin()` (security-auth-v4 Parts 2→8) CHƯA chạy → ai có anon key cũng gọi REST được. Ghi `docs/LO-TRINH-BAO-MAT.md` §0.1. **Chờ duyệt — KHÔNG tự chạy SQL.**

### 🟡 Đại tu giao diện — design system tokens + empty-state
- [x] Bổ sung **thang token** vào `giao-dien.css` (block "CSS Variables bổ sung"): `--space-1..12` (spacing 4/8pt), `--fs-xs..2xl` (font-size theo cấp), `--shadow-sm/md/lg` (đã có sẵn `--shadow-card/glow`, radius, transition, màu HSL, neon, status).
- [x] Thêm empty-state CHUẨN `.tvl-empty` (icon + tiêu đề + lời nhắn + nút hành động) token-based — dùng chung cho danh sách rỗng.
- 🟢 GHI CHÚ: design system + empty-state (`.ls-empty/.kh-empty`) + skeleton + 404 + toast + card/modal ĐÃ có sẵn và khá hoàn chỉnh (layer "REFACTOR THEME 2026"). KHÔNG viết lại mù HTML từng trang (không render được → rủi ro vỡ UI đang chạy + vi phạm "giữ cấu trúc class JS"). Cần QA thị giác thủ công cho phần tinh chỉnh còn lại.

### 🟢 Dọn transition:all inline (đã xác nhận không gây shift)
- [x] Đổi `transition: all <dur>` → danh sách prop tường minh (background-color/border-color/color/box-shadow/transform/opacity — KHÔNG có prop gây reflow) tại: **index.html (21)** + **admin/index.html (8)** + **404.html (3)** = 32 chỗ. Giữ nguyên duration.
- [x] 404.html: DevTools-detect chỉ kiểm chiều ngang (bỏ chiều dọc — false-positive mobile), đồng bộ index.html.

### 🟡 SQL đã soạn (CHỜ DUYỆT — chưa chạy)
- [ ] `migration-cleanup-slot-ket-v1.sql` (MỚI) — DỌN slot kẹt "Chờ đánh" (ca đã kết thúc, chưa chốt). SECTION 1 chẩn đoán → SECTION 3 UPDATE (comment sẵn, phương án "Khách hủy") → SECTION 4 đối chiếu. **KHÔNG bắt buộc** (fix client đã neutralize bug); chỉ để dọn dữ liệu.

### 🟡 Deploy
- [x] Bump `?v=20260610e` cho file đã sửa: `giao-dien.css`, `hieu-ung-giao-dien.js`, `phan-he-khach-choi.js` (index.html) + `hieu-ung-giao-dien.js`, `phan-he-quan-tri.js` (admin/index.html). (404.html/index.html/admin/index.html là entry HTML — fetch tươi.)
- [x] `node --check` 3 file JS sửa → PASS.

---

## ✅ PHIÊN 17 — Quét phan-he-host.js

### 🔴 Đã fix
- [x] **Doanh Thu rỗng cho host hệ SĐT**: `_taiDoanhThuHost` lọc `ma_key_host=currentHostKey` nhưng currentHostKey=SĐT còn ca mới có `ma_key_host=null`. Thêm helper `_docCaDauCuaToi()` (dual `sdt_nguoi_tao` + legacy key) — dùng cho doanh thu + hồ sơ khách. Bump `phan-he-host.js?v=20260610d`.

### 🟡 Đã fix
- [x] Hồ Sơ Khách thiếu lịch sử (cùng bug key) → dùng `_docCaDauCuaToi()`.
- [x] Double-submit "Đăng kèo": guard `_dangCaBusy` đồng bộ ngay trước INSERT (btn.disabled cũ đặt sau await → muộn).
- [x] "Tuần này" lỗi Chủ Nhật (`getDay()===0` ra Thứ Hai ngày mai) → công thức `_dow===0 ? -6 : 1-_dow`.
- [x] Xóa kèo có người đặt: confirm cảnh báo "N khách đang giữ slot sẽ mất chỗ".
- [x] B3 cache khách: `_tkInvalidateCache()` sau đăng/sửa/xóa/chốt/tạm khóa/mở lại ca.

### 🟢 Đã xác minh / để lại
- ✅ Công thức doanh thu đúng (Đã tham gia + da_thanh_toan + da_chot_ca; loại slot hủy).
- ✅ Reads host hưởng timeout 15s; writes cố ý không timeout.
- ✅ Level đăng kèo lấy từ TRINH_DO_LIST; slot≥1; ngày quá khứ chặn ở input.
- 🟢 escHTML các điểm render host (DS Khách ten_khach, chi tiết ca ten_san/dia_chi, đánh giá nhan_xet) — gộp vào đợt XSS [docs/LO-TRINH-BAO-MAT.md](docs/LO-TRINH-BAO-MAT.md) §2.2 (chờ duyệt).
- 🟢 Ca qua đêm (end<start) bị khách auto-hide sai — edge hiếm, chưa xử.

---

## ✅/🔵 PHIÊN 16 — Quét tầng dữ liệu (ket-noi-supabase.js + bo-may-du-lieu.js)

### ✅ Đã fix
- [x] **B1 — Timeout reads**: `docData` thêm AbortController (15s) → hết "skeleton quay mãi" khi mất mạng giữa chừng. Bump `ket-noi-supabase.js?v=20260610d` (index + admin).
- [x] **B2 — Race filter**: sequence-token `_tkSeq`/`_mySeq` trong `_thucHienTimKiem` → bỏ response cũ về sau.
- [x] **B3 — Double-submit `datSlot`**: guard `window._datSlotBusy` (try/finally). [Còn lại: `UNIQUE(sdt_khach,id_ca_dau)` ở DB — xem lộ trình]
- [x] **B5/C1 — Cache + select an toàn**: cache nền 4 bảng TTL 20s (lọc client) + `nguoi_dung` chỉ lấy cột cần (fallback `select=*` nếu cột thiếu, không vỡ); invalidate cache sau khi đặt slot. Bump `phan-he-khach-choi.js?v=20260610d`.

### 🔴 ĐỀ XUẤT — BẢO MẬT → đã soạn lộ trình: **[docs/LO-TRINH-BAO-MAT.md](docs/LO-TRINH-BAO-MAT.md)**
- [ ] **RLS**: chạy `security-auth-v4.sql` + 2 RPC mới (`get_public_host_info`, `host_cham_diem`) + refactor 4–5 điểm client đọc/ghi `nguoi_dung` sang RPC (thứ tự an toàn trong lộ trình). KHÔNG tự chạy SQL — chờ duyệt.
- [ ] **XSS**: thêm `escHTML()` + bọc các điểm render dữ liệu DB (ten_san/nhan_xet/bio...). Có thể làm độc lập trước RLS.

### 🟢 GHI CHÚ
- C2: `supabase-schema.sql` lỗi thời (thiếu cột diem_uy_tin, so_ca_thanh_cong, is_whitelisted, is_tam_khoa, is_frozen, da_thanh_toan...) — code chạy đúng DB thật; nên cập nhật file schema.
- C3: taxonomy tầng dữ liệu chuẩn 12 mức; `migration-trinh-do-v1.sql` CHƯA CHẠY (DB còn giá trị cũ).
- C4: `upsertData` có dùng (admin), `khoiTaoSandbox` là stub — không dead code.
- A1: key client là anon (đúng), không lộ service_role.

---

## ✅ ĐÃ HOÀN THÀNH (phiên 15) — Fix layout shift + rà giao diện

### 🔴 Layout shift
- [x] **scrollbar-gutter: stable** cho `html` (index.html) → hết "khung nhảy" ngang khi thanh cuộn dọc xuất hiện/biến mất (mobile overlay scrollbar không bị ảnh hưởng)
- [x] **Skeleton placeholder** (chống nhảy dọc khi tải): CSS `.tvl-skel`/`.tvl-skel-card`/`.tvl-skel-row`/`.tvl-skel-block` (giao-dien.css) + thay placeholder ban đầu (index.html) & loading-state JS cho: danh sách kèo (`_thucHienTimKiem`), lịch sử (`_taiLichSuDau`), doanh thu (host `_renderDoanhThu`). Tôn trọng `prefers-reduced-motion`.
- [x] **Preload CSS font** (`rel=preload as=style`) → font tải sớm, giảm FOUT/nhảy chữ tiêu đề

### 🟢 Dọn dẹp
- [x] Đổi `transition: all` → prop cụ thể (background/border-color/color/box-shadow/transform/opacity) trong **giao-dien.css + components.css** (15 chỗ). Còn `transition:all` trong inline-style index.html/admin/404 — chưa đụng (ngoài phạm vi đã duyệt).

### ✅ Đã xác minh / kiểm tra
- `hieu-ung-giao-dien.js`, `.reveal`, mọi `@keyframes` (2 CSS) đều transform/opacity/paint-only → KHÔNG gây shift.
- `xoaBoLoc` (phan-he-khach-choi.js:1442) reset ĐẦY ĐỦ (pills giới tính+trình độ, lịch, nhãn giá "Tất cả", tên sân, khung giờ). Không thiếu.

### 🟡 Deploy
- [x] Bump `?v=` admin/index.html (4 script `7.0` → mốc chung); index.html 4 file đổi nội dung → `20260610c` (giao-dien.css, components.css, phan-he-khach-choi, phan-he-host)

---

## ✅ ĐÃ HOÀN THÀNH (phiên 14) — Review & fix toàn diện index.html

### 🔴 Lỗi chức năng
- [x] Gỡ inline `xoaBoLoc` rút gọn (cuối index.html) ghi đè bản đầy đủ trong phan-he-khach-choi.js → nút "Xóa Bộ Lọc" nay reset đủ pills + lịch + nhãn giá
- [x] Drawer mobile: thêm pill trình độ "TB" (PC có, mobile thiếu) + sửa `data-value="TB khá"` → `"TB Khá"` (sync mobile→PC dùng `.includes()` phân biệt hoa-thường nên trước đó bị bỏ qua)

### 🟡 Tối ưu / Deploy
- [x] Bump tất cả `?v=` cache-bust về mốc chung `20260610` (CSS + 7 file JS) — tránh user cũ chạy code cache cũ
- [x] DevTools-detect: bỏ check chiều dọc (`outerHeight-innerHeight`), chỉ giữ chiều ngang → tránh xóa trắng app oan trên mobile

### 🟢 Dọn dẹp
- [x] Gỡ CSS trùng/rác: `.app-card` margin-bottom 2 lần; gộp `.kt-result-box` & `.kt-sug-card` (2 định nghĩa → 1, giữ nguyên computed); xóa `.tab-nav`/`.tab-nav-inner`/`.app-header-spacer` legacy
- [x] Gỡ dead code: IIFE redirect host.html (thân `if` rỗng) + script block rỗng
- [x] A11y: `aria-label` cho nút icon-only (phân trang ‹ ›, tải lại DS ca) + `aria-live` page-info; gắn `for`/`id` cho 8 label Hồ Sơ + 8 label Đăng Ca

### ✅ Chuẩn hóa taxonomy trình độ (đã xử lý — code xong, SQL chờ chạy)
- [x] **Nguồn duy nhất (SSOT)** `window.TRINH_DO_LIST` (12 mức IN HOA: NEWBIE, YẾU-, YẾU, YẾU+, TBY-, TBY, TBY+, TB-, TB, TB+, TB KHÁ, KHÁ) + `TRINH_DO_LABEL` (KHÁ→"KHÁ (BÁN CHUYÊN)") + `nhanTrinhDo()` + `chuanHoaTrinhDo()` trong `bo-may-du-lieu.js`
- [x] **Render động** 6 chỗ từ SSOT (`_renderTrinhDoUI` chạy on DOMContentLoaded): Hồ sơ select, Filter select+pills PC+mobile, Host Nam+Nữ checkbox — xóa toàn bộ hardcode trong index.html
- [x] Host đọc/reset checkbox theo container `#levelNamPills`/`#levelNuPills` (sửa luôn **bug có sẵn**: vòng lặp cũ thiếu `"tb"` → mức TB không bao giờ lưu)
- [x] `STANDARD_LEVELS` lấy từ SSOT; hiển thị pill dùng `nhanTrinhDo()` (KHÁ → "KHÁ (BÁN CHUYÊN)")
- [x] Filter so khớp **CHÍNH XÁC 1 mức** (bỏ substring), normalize trim+UPPER 2 vế
- [x] Hồ sơ load/save normalize `chuanHoaTrinhDo`
- [x] Bump `?v=20260610b` cho 4 file JS sửa (bo-may-du-lieu, phan-he-khach-choi, phan-he-host, phan-he-ung-dung)
- [ ] 🔴 **CHẠY SQL**: `migration-trinh-do-v1.sql` (đã soạn, **chưa chạy**). Mapping đã duyệt: Hồ sơ Khá→KHÁ, Giỏi→KHÁ; Ca đấu Khá→TB KHÁ. BACKUP DB trước; chạy 1 lần ngay tại/trước deploy; đối chiếu SELECT trước/sau (Section 1 vs 4) + kiểm Section 5 giá trị lạ.

---

## ✅ ĐÃ HOÀN THÀNH (phiên 13) — /tim-keo UX + slot limit + trust score

### Đồng bộ Tạm Khóa ca (phan-he-khach-choi.js + phan-he-host.js)
- [x] Card `/tim-keo`: nút "NGƯNG NHẬN SLOT" xám disabled khi is_tam_khoa
- [x] Modal chi tiết footer: thông báo "Tạm khóa — không nhận đăng ký mới"
- [x] `datSlot()` guard client-side: block bypass khi is_tam_khoa

### SLOT_LIMIT_CONFIG + Rule tài khoản mới (phan-he-khach-choi.js)
- [x] `window.SLOT_LIMIT_CONFIG` config object (newAccount/lowTrust/highTrust)
- [x] Fetch user 1 lần (created_at + diem_uy_tin) thay `_layDiemUyTin()` riêng
- [x] Rule account <7 ngày: 2/ngày + 5 "Chờ đánh" trong 7 ngày gần nhất
- [x] Các nhánh cũ skip khi `_isNewAccount = true`
- [x] `window._truDiemUyTin` exposed lên window
- [x] Bùng kèo → trừ 10đ (doiTrangThaiDiDanh, phan-he-host.js)

### Fix đếm sai "Chờ đánh" (phan-he-khach-choi.js)
- [x] Join ca_dau batch fetch (`boLoc.in`) để loại ca đã qua gio_ket_thuc
- [x] soActiveSlots cutoff 30 ngày (highTrust branch)
- [x] `_soCho7Ngay` chỉ đếm ca CHƯA kết thúc

### /tim-keo UX polish (phan-he-khach-choi.js + giao-dien.css)
- [x] Auto-hide ca quá gio_ket_thuc trong filter `_thucHienTimKiem`
- [x] Lịch sử display-only: "Chờ đánh" → "Đã Tham Gia" khi ca đã kết thúc
- [x] Giá Nam/Nữ: `display:flex;align-items:center;white-space:nowrap;gap:4px`
- [x] Tên sân font-render cao cấp: Inter 700, line-height:1.4, letter-spacing:0.03em, color:#22d3ee, antialiased (giao-dien.css)
- [x] SĐT reveal → auto copy clipboard + toast "Đã sao chép SĐT ✅"
- [x] Trust badge "UY TÍN TỐT" → pill border-radius:9999px + SVG star + rgba(16,185,129)

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
