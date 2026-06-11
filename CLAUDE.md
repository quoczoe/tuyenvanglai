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

### BẢNG UY TÍN — SSOT `window.DIEM_UY_TIN` (bo-may-du-lieu.js §0B)
> MỌI nơi tính điểm đọc từ đây — KHÔNG hardcode con số phạt. Điểm sàn 0, trần 100.
- **Tham gia OK** (host xác nhận "Đã tham gia"): **+2**, cap 100. Cộng ở `xacNhanThamGia` (checkbox) + `doiTrangThaiDiDanh` (dropdown, chỉ khi CHUYỂN sang — tránh cộng lặp).
- **Khách hủy** (thang giờ tới giờ đánh, GMT+7): `>4h: 0 · 2–4h: −2 · 30p–2h: −4 · <30p: −6`. Ranh giới 4h/2h thuộc bracket thấp hơn (240→−2, 120→−2, 30→−4). Free-pass tháng miễn 1 lần. Modal xác nhận BÁO TRƯỚC mức phạt.
- **Host hủy ca đã có người đặt**: `>4h: 0 · 2–4h: −3 · 30p–2h: −6 · <30p: −8` (`xoaCaDau`, phạt HOST).
- **Bùng kèo** (đếm rolling 30 ngày qua `huy_luc`): lần 1 = **−10**, lần 2 = **−20** + cảnh báo "lần 3 sẽ khóa", lần 3+ = **KHÓA tài khoản** (`is_active=false`). CẢ "Báo cáo Ghost" lẫn dropdown "Bùng kèo" → CÙNG hàm `window.xuLyBungKeo(sdt, datSlotId, {ghiStatus})`.
- Khóa tài khoản dùng cột `is_active` (sẵn có) — login chặn (khach-choi:91/636/1006), admin mở khóa bằng nút sẵn có `_khoaMoTV`. KHÔNG cần SQL mới.
- Thang giờ khai báo dạng mảng `[{phut,diem}]` xếp GIẢM dần; phần tử đầu = ngưỡng miễn (so sánh strict `>`). Tra cứu: `window.tinhDiemPhatTheoGio(thang, phutConLai)`. Helper: `phutConLaiToiGioDanh()`, `moTaThoiGianConLai()`. Test: `node .devtest/trust-test.js` (32 assertion PASS).
- **Wording**: app CẦU LÔNG — dùng "đánh" KHÔNG dùng "đá". Giá trị DB `trang_thai_di_danh` ("Chờ đánh"/"Đã tham gia"/"Bùng kèo"/"Khách hủy") GIỮ NGUYÊN (không đổi value). Chỉ đổi nhãn/thông báo hiển thị.

## SECURITY CHECKLIST (mỗi file HTML)
```javascript
// Disable chuột phải, F12, Ctrl+U, DevTools detect, console.clear
// user-select: none toàn trang; input/textarea được select
```

## CURRENT STATE (cập nhật: 2026-06-11 PHIÊN E — cọc DS Khách + thiết kế thông báo + chuẩn hóa bảng)

> Cache-bust `?v=` HIỆN TẠI (index.html): giao-dien.css=`20260611f`, components.css=`20260611f`, ket-noi-supabase.js=`20260610d`, bo-may-du-lieu.js=`20260611c`, hieu-ung-giao-dien.js=`20260611b`, phan-he-khach-choi.js=`20260611f`, phan-he-host.js=`20260611f`, phan-he-ung-dung.js=`20260610b`, phan-he-gop-y.js=`20260610`. admin/index.html: ket-noi=`20260610d`, bo-may=`20260611c`, hieu-ung=`20260611b`, quan-tri=`20260611b`.

### PHIÊN E — CỌC DS KHÁCH + THIẾT KẾ THÔNG BÁO + CHUẨN HÓA BẢNG
- **Cọc DS Khách (localStorage, KHÔNG SQL)**: cột "Cọc" cuối DS Khách (chỉ ca `yeu_cau_coc`) badge "Chưa cọc"→"✓ Đã cọc"; persist `localStorage tvl_coc_status` per-slot; tóm tắt X/Y ở DS Khách + Chi Tiết ca; khách: nhắc tĩnh `.ls-coc-reminder` trong Lịch Sử. Helper `_daCoc/_toggleCoc/_syncCocColumn` (host). Cột thêm ở CUỐI → không đụng `cells[7]/[9]`. Verify 10/10. *(Giới hạn: mark host ở LS host, khách không đọc được → nhắc tĩnh; muốn đồng bộ cần field DB.)*
- **Thiết kế THÔNG BÁO**: `docs/THIET-KE-THONG-BAO.md` (CHƯA code, chờ duyệt) — khuyến nghị polling 30s + bảng `thong_bao` + drawer chuông; v1 = 6 sự kiện ưu tiên Cao + 1 SQL.
- **Chuẩn bảng `.hs-table`** (components.css): header nền+`600`+hoa, border dọc, zebra, hover, helper `.ta-r/.ta-c/.ta-l` (tiền=phải, số/ngày/trạng thái/thao tác=giữa, văn bản=trái), `.dt-hide-sm`. Áp Doanh Thu (tiền→PHẢI, mobile ẩn Tổng Chi+In). Admin `.ad-table`/host `.app-table`/guest-list ĐÃ chuẩn sẵn. Bump `?v=20260611f`.

### PHIÊN D — UI DOANH THU + THU CỌC TRƯỚC
- **Doanh Thu full-width**: `.hs-table` thiếu `width` (chỉ inline `min-width:860px`) → bảng căn trái ~860px, trống nửa phải desktop. Fix `.hs-table{width:100%}` (components.css). Nút In ẩn mobile qua `.dt-print-btn` + `@media(max-width:767px)`. Metric `.stats-grid-4` vốn đã full-width (không sửa).
- **Thu Cọc Trước (option: thông báo + xác nhận)**: trước đây `yeu_cau_coc` lưu DB nhưng khách KHÔNG đọc (chỉ host-side mock). Nay khách đọc `ca.yeu_cau_coc` → badge `.coc-banner` (amber) trên card Tìm Kèo + modal chi tiết; `datSlot` thêm `xacNhanModal` nhắc liên hệ host chuyển cọc (HỦY=không đặt). KHÔNG chặn cứng/KHÔNG thu tiền (cọc ngoài app). Verify `.devtest/verify-coc.js` 9/9. Bump `?v=20260611e` (khach-choi+host+css).

### PHIÊN C — SUITE PLAYWRIGHT SỐNG (DB thật, dữ liệu QATEST) — 81/81 PASS
- **Fix 3 bug rapid-click** (bấm nhanh 5× trừ điểm/toast nhiều lần): guard `_huyDatSlotBusy` (`huyDatSlot`), `_ghostBusy` (`baoCaoGhost`), `_chotCaBusy` (`chotCaDau`) — cùng pattern `_datSlotBusy`/`_doiTTBusy`/`_dangCaBusy`. Bump `?v=20260611d` (khach-choi+host).
- **🔴 PHÁT HIỆN: anon KHÔNG DELETE được (RLS thiếu policy DELETE → trả 204 nhưng xóa 0 dòng)**, xác nhận live. Hệ quả: (1) **Host KHÔNG xóa được ca của mình** (`xoaCaDau`→"Không thể xóa — liên hệ Admin"); (2) **Phạt "Host hủy ca"** nằm SAU verify-deleted → DELETE luôn fail → phạt host KHÔNG BAO GIỜ áp dụng live (thang HOST_HUY đúng nhưng path bị chặn). Cần SQL/RPC token (chờ duyệt — `docs/LO-TRINH-BAO-MAT.md`). Workaround host: "Tạm khóa" (PATCH OK).
- **Dọn QATEST**: anon không DELETE → NEUTRALIZE bằng PATCH (ca `da_chot_ca+is_tam_khoa+ngày quá khứ` ẩn Tìm Kèo; slot "Khách hủy"; user `is_active=false`) → 0 còn HIỆN. Xóa VẬT LÝ cần `cleanup-qatest.sql` (MỚI, chờ duyệt). Harness `.devtest/qa-lib.js` + 6 sweep (`nhom0..4` + `nhom-cleanup`).

### PHIÊN 19 — CHUẨN HÓA UY TÍN (SSOT `DIEM_UY_TIN`) + WORDING
- **A. Bảng uy tín 1 nguồn**: `window.DIEM_UY_TIN` + `tinhDiemPhatTheoGio/phutConLaiToiGioDanh/moTaThoiGianConLai` (bo-may §0B). Xóa số phạt hardcode cũ (host −15/−10 → đi qua const). Chi tiết bảng ở §BUSINESS RULES.
- **Bùng kèo hợp nhất** `window.xuLyBungKeo()` (khach-choi): đếm rolling-30d theo `huy_luc`, lần 1/2/3 = −10/−20/KHÓA. `baoCaoGhost` + `doiTrangThaiDiDanh` đều route qua đây. `xacNhanModal` thay `confirm()` cũ.
- **Khách hủy** (`huyDatSlot`): thang `KHACH_HUY` (0/−2/−4/−6), modal báo trước mức phạt + thời gian còn lại, ghi `huy_luc` ở fallback REST. **Host hủy ca** (`xoaCaDau`): thang `HOST_HUY` (0/−3/−6/−8) phạt host + cảnh báo trong modal xóa.
- **Khóa tài khoản** = `is_active=false` (login chặn sẵn; admin `_khoaMoTV` mở khóa) → KHÔNG cần SQL/cột mới.
- **B. Wording**: 6× `"đá xong"→"đánh xong"` trong khach-choi (2 toast + 4 comment). Còn lại ("ngày/giờ/Chờ đánh", "đánh giá") đã đúng. Giá trị DB GIỮ NGUYÊN.
- **Verify**: `node .devtest/trust-test.js` = 32/32 PASS (ranh giới 240/120/30 + hằng số); `node --check` 3 file = OK.
- **⏳ CHƯA LÀM (chuyển phiên mới)**: suite Playwright SỐNG (QATEST: dựng dữ liệu, vòng đời ca, doanh thu, test sống từng luật uy tín, rapid-click live, săn lỗi) — cần context riêng, harness `.devtest/` đã sẵn.

### PHIÊN 18 (A–E) — QUYẾT ĐỊNH KỸ THUẬT MỚI
- **Slot-limit fix (18A)**: nhánh highTrust `datSlot` join ca_dau (`_demChoDanhThucSu`) → đếm "ca chưa đá xong" thật, bộ đếm reset đúng (trước kẹt "Chờ đánh" vĩnh viễn). SQL dọn tùy chọn: `migration-cleanup-slot-ket-v1.sql` (CHƯA chạy).
- **XSS (18A)**: `hienToast` đổi `innerHTML`→`textContent` (chặn XSS toast toàn app); `phan-he-quan-tri.js` vá `_escHtml` các điểm sót (ten_san/nhan_xet/_layTen). Còn lại escHTML khach-choi+host trong `docs/LO-TRINH-BAO-MAT.md §2.2`.
- **Phân quyền admin (18A)**: cổng login JWT OK, nhưng THAO TÁC admin chỉ chặn bằng UI — RLS `is_admin()` (security-auth-v4 Parts 2-8) CHƯA chạy → ai có anon key cũng gọi REST được. Ghi `LO-TRINH-BAO-MAT.md §0.1`.
- **Design tokens (18B)**: thêm `--space-*`, `--fs-*`, `--shadow-sm/md/lg` + `.tvl-empty` + `.tvl-xscroll` (giao-dien.css).
- **LỊCH SỬ fix (18B)**: gỡ `.ls-card` LEGACY (display:flex) trong inline `<style>` index.html ghi đè giao-dien.css → chevron+giá canh phải đúng.
- **Turnstile localhost bypass (18B)**: `window._tvlIsLocalhost` → skip render + KHÔNG load CF api.js + bypass `_xacMinhTurnstile`. Domain thật GIỮ NGUYÊN.
- **nguoi_dung select fix (18B)**: bỏ cột `ma_key_host,so_sao_tb` (không tồn tại) khỏi `_thucHienTimKiem` → hết 400 mỗi lần tìm.
- **Dropdown DS Khách fix (18D)**: `.gl-cdd-menu` → `position:fixed` + toạ độ JS từ nút (`_toggleGlCdd`) → thoát overflow `#modal-guest-list-scroll`; tự lật + kẹp viewport + đóng khi scroll. Admin `.ca-action-menu` đã fixed sẵn.
- **Money→K (18E)**: `window.formatTienK()` (bo-may) — 75.000đ→`75K`, 1.250.000đ→`1.250K`. MỌI render tiền route qua đây (_formatVND/_fmtK/_vnd... đều delegate). Trust "đ" + input label "(đ)" giữ nguyên.
- **Anti-spam (18E)**: toast dedupe (cùng type+title+msg trong 2s→1) + guard `_doiTTBusy` cho `doiTrangThaiDiDanh` (chống double trừ điểm bùng).
- **Harness test**: `.devtest/` (server.js + Playwright scripts) + `screenshots/` (đã `.vercelignore`). Creds admin CHỈ truyền qua ENV, không ghi file.

### Trạng thái file
| File | Version | Ghi chú |
|---|---|---|
| `ket-noi-supabase.js` | v7.2 | +AbortController **timeout 15s** cho `docData` (reads); writes cố ý không timeout |
| `bo-may-du-lieu.js` | v3.1 | **SSOT TRINH_DO_LIST (12 mức)** + `TRINH_DO_LABEL`/`nhanTrinhDo`/`chuanHoaTrinhDo` + `_renderTrinhDoUI()` (render động level UI on DOMContentLoaded) |
| `phan-he-ung-dung.js` | v3.2 | profile load/save normalize `chuanHoaTrinhDo` |
| `phan-he-host.js` | v9.6 | **`_docCaDauCuaToi()` (dual sdt_nguoi_tao+key) → fix Doanh Thu/Hồ sơ khách rỗng**; guard `_dangCaBusy`; Sunday-week fix; xóa-ca cảnh báo bookings; `_tkInvalidateCache` sau mọi mutation; level đọc từ `#levelNamPills/#levelNuPills` |
| `phan-he-khach-choi.js` | v9.4 | filter level **khớp CHÍNH XÁC** + normalize; **cache nền 20s + seq-token (B2) + `_datSlotBusy` (B3)**; skeleton loading; STANDARD_LEVELS từ SSOT |
| `phan-he-quan-tri.js` | v9.0 | gopY: sort/filter/pagination |
| `phan-he-gop-y.js` | v2.0 | rate limit: 5/ngày + cooldown 5 phút |
| `index.html` | v11.0 | scrollbar-gutter:stable; skeleton placeholders; preload CSS font; level containers render động; a11y (for/id + aria-label); gỡ xoaBoLoc inline ghi đè |
| `admin/index.html` | v9.1 | bump ?v= 4 script (hết v7.0) |
| `giao-dien.css` | v7.4 | +skeleton CSS (`.tvl-skel*`); dọn `transition:all`→prop cụ thể; gỡ CSS rác (.tab-nav, .app-header-spacer, dup .app-card/.kt-*) |
| `components.css` | v5.2 | dọn `transition:all`→prop cụ thể |
| `migration-dat-slot-v2.sql` | NEW | ADD COLUMN da_thanh_toan/tien_thu_bung/huy_luc — CHƯA CHẠY |
| `migration-trinh-do-v1.sql` | NEW | Chuẩn hóa taxonomy 12 mức (hồ sơ Khá→KHÁ/Giỏi→KHÁ; ca_dau Khá→TB KHÁ) — **CHƯA CHẠY** |
| `docs/LO-TRINH-BAO-MAT.md` | NEW | Lộ trình RLS (security-auth-v4 + 2 RPC + refactor client) + XSS (escHTML) — chờ duyệt |

### Quyết định kỹ thuật quan trọng (phiên 14-17)
- **Taxonomy trình độ — SSOT**: `window.TRINH_DO_LIST` 12 mức IN HOA (`NEWBIE, YẾU-, YẾU, YẾU+, TBY-, TBY, TBY+, TB-, TB, TB+, TB KHÁ, KHÁ`) ở bo-may-du-lieu.js. `TRINH_DO_LABEL` đổi nhãn KHÁ→"KHÁ (BÁN CHUYÊN)". `_renderTrinhDoUI()` render động 6 chỗ (hồ sơ select, filter select+pills PC+mobile, host Nam/Nữ) on DOMContentLoaded — KHÔNG hardcode. Host đọc level qua `#levelNamPills/#levelNuPills .lvl-cb:checked` (vá bug cũ thiếu "tb"). Filter so khớp **CHÍNH XÁC** (không substring) sau `chuanHoaTrinhDo` (trim+UPPER).
- **Doanh Thu/Hồ sơ khách fix**: `_docCaDauCuaToi(extraBoLoc)` query dual `sdt_nguoi_tao` (+legacy `ma_key_host` nếu TVL-key). Thay `eq:{ma_key_host:currentHostKey}` cũ — vì `currentHostKey=SĐT` ở hệ mới nhưng ca có `ma_key_host=null` → trước đây rỗng.
- **Double-submit guards**: `_datSlotBusy` (datSlot, khách) + `_dangCaBusy` (đăng kèo, host — đặt ĐỒNG BỘ ngay trước INSERT vì btn.disabled sau await là quá muộn). Cờ nhả trong `finally`.
- **Cache tìm kèo (B2/C1)**: `_tkCache` TTL 20s + `_tkSeq` seq-token chống race trong `_thucHienTimKiem`; `window._tkInvalidateCache()` gọi sau mọi mutation host (đăng/sửa/xóa/chốt/tạm khóa/mở lại) + sau datSlot khách. `nguoi_dung` select cột an toàn (fallback `select=*` nếu cột thiếu → không vỡ).
- **docData timeout**: AbortController 15s (mặc định, `boLoc.timeoutMs` tùy chỉnh) → reads treo (mất mạng) không còn skeleton xoay mãi. Writes KHÔNG timeout (tránh double-write).
- **Layout shift**: `html{scrollbar-gutter:stable}` (index) chống nhảy ngang khi scrollbar xuất/ẩn; skeleton `.tvl-skel*` cho vùng động; preload CSS font (`rel=preload as=style`).
- **is_tam_khoa sync**: tamKhoaCaDau/moLaiCaDau (host) → update DB + local state. `/tim-keo` card: nút "NGƯNG NHẬN SLOT" xám disabled. Modal chi tiết: footer thông báo. `datSlot()` guard client-side.
- **SLOT_LIMIT_CONFIG object**: `window.SLOT_LIMIT_CONFIG = { newAccount, lowTrust, normal, highTrust }` — admin chỉnh thông số không cần sửa logic.
- **Account mới <7 ngày rule**: fetch `nguoi_dung.created_at` 1 lần (thay `_layDiemUyTin()` riêng), check `Date.now() - created_at < 7*24*3600*1000`. Rule: 2/ngày + 5 "Chờ đánh" trong 7 ngày (join ca_dau để loại ca đã kết thúc).
- **soActiveSlots join ca_dau**: `_choDanhSlots` filter "Chờ đánh" trong 7 ngày → batch fetch `ca_dau` bằng `boLoc.in` → loại ca đã qua `gio_ket_thuc` → chỉ đếm ca CHƯA kết thúc. Tránh block mãi mãi vì host chưa chốt.
- **Auto-hide ca quá giờ**: trong `_thucHienTimKiem` filter: nếu `ngay_danh + gio_ket_thuc < now` → `return false` (ẩn hoàn toàn khỏi danh sách).
- **Lịch sử display "Đã tham gia"**: slot "Chờ đánh" + ca đã qua `gio_ket_thuc` → render badge "Đã Tham Gia" (display-only, không ghi DB).
- **_truDiemUyTin exposed**: `window._truDiemUyTin` để phan-he-host.js gọi. Bùng kèo → trừ 10đ.
- **SĐT reveal+copy**: `_hienSdt()` sau reveal → `navigator.clipboard.writeText(sdt)` → toast "Đã sao chép SĐT ✅".
- **Font-render tên sân**: `.kh-san-link > span:first-of-type` trong giao-dien.css: `font-family:Inter`, `font-weight:700`, `line-height:1.4`, `letter-spacing:0.03em`, `color:#22d3ee`, `-webkit-font-smoothing:antialiased`, `text-rendering:optimizeLegibility`. Inline style trong JS chỉ giữ `text-transform:uppercase`.
- **Trust badge pill**: `border-radius:9999px`, `rgba(16,185,129,0.15)`, SVG star icon, `color:#10b981`.
- **table-layout:fixed + colgroup %**: Ca Đã Đăng — cố định tỷ lệ cột
- **Custom dropdown DS Khách**: drop-up detection, `_closeAllGlCdd()`, `tr.tr-cdd-open z-index:99`
- **doiTrangThaiDiDanh no-reload**: DOM update trực tiếp cells[7]+cells[9]
- **dat_slot missing columns**: PHẢI chạy `migration-dat-slot-v2.sql` trước khi test Thanh Toán

### SQL cần chạy trên Supabase Dashboard
1. **DAT SLOT MIGRATION** (urgent — checkbox Thanh Toán fail nếu chưa chạy):
   File: `migration-dat-slot-v2.sql`
   ```sql
   ALTER TABLE dat_slot ADD COLUMN IF NOT EXISTS da_thanh_toan BOOLEAN DEFAULT FALSE;
   ALTER TABLE dat_slot ADD COLUMN IF NOT EXISTS tien_thu_bung INTEGER DEFAULT 0;
   ALTER TABLE dat_slot ADD COLUMN IF NOT EXISTS huy_luc TIMESTAMPTZ;
   ```
2. `security-auth-v4.sql` — Parts 2→8 (is_admin, 6 RPC, RLS)
3. `migration-admin-cascade.sql` — v2 (cascade delete + policies)
4. **GÓP Ý FIX**:
```sql
DROP POLICY IF EXISTS "gop_y_auth_select" ON gop_y_he_thong;
DROP POLICY IF EXISTS "gop_y_auth_delete" ON gop_y_he_thong;
CREATE POLICY "gop_y_auth_select" ON gop_y_he_thong FOR SELECT TO authenticated USING (true);
CREATE POLICY "gop_y_auth_delete" ON gop_y_he_thong FOR DELETE TO authenticated USING (true);
```
5. **TẠM KHÓA CA**: `ALTER TABLE ca_dau ADD COLUMN IF NOT EXISTS is_tam_khoa BOOLEAN DEFAULT FALSE;`

### Known issues
- Checkbox "Thanh Toán" fail → cần chạy migration-dat-slot-v2.sql
- Admin xóa user → F5 vẫn thấy dashboard nếu chưa chạy migration-admin-cascade.sql
- Góp ý admin tab không hiện data cho đến khi chạy SQL gop_y fix
- Tạm Khóa ca đấu không hoạt động cho đến khi chạy SQL ALTER TABLE is_tam_khoa
- xoaCaDau: silently fail nếu RLS anon không cho DELETE (cần security-auth-v4.sql)
- **🔴 BẢO MẬT (chưa fix — chờ duyệt lộ trình)**: RLS lỏng (anon SELECT/UPDATE nguoi_dung USING(true) → lộ mat_khau_hash + leo thang admin); XSS lưu trữ (innerHTML chưa escape). Xem `docs/LO-TRINH-BAO-MAT.md`.
- **migration-trinh-do-v1.sql CHƯA CHẠY** → DB còn giá trị level cũ (Newbie/Khá...); UI đã dùng 12 mức mới. Chạy 1 lần TRƯỚC/TẠI deploy UI mới.
- Doanh Thu host hệ SĐT: ĐÃ fix client (`_docCaDauCuaToi`) — không cần SQL.

## NEXT UP
- 🔴 Chạy `migration-trinh-do-v1.sql` (backup trước; đối chiếu SELECT trước/sau) → DB khớp taxonomy 12 mức
- 🔴 Chạy `migration-dat-slot-v2.sql` → test checkbox Thanh Toán
- 🔴 Chạy SQL góp ý fix + TẠM KHÓA migration
- 🔴 BẢO MẬT: duyệt `docs/LO-TRINH-BAO-MAT.md` → RLS (security-auth-v4 + 2 RPC + refactor client) + XSS escHTML
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
