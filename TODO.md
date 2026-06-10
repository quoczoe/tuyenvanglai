# TODO — Cập nhật: 2026-06-10 (phiên 18)

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
