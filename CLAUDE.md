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
thong_bao         — id UUID PK, nguoi_nhan TEXT (SĐT), loai, tieu_de, noi_dung, link_data JSONB, da_doc, created_at. RLS khóa anon — chỉ qua RPC SECURITY DEFINER (ghi/lay/dem/danh_dau token-verified)
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
> **ÁP ĐIỂM KHI HOST ĐỔI TRẠNG THÁI = STATE-BASED DELTA** qua `window.apDiemTheoTrangThai(sdt,oldState,newState,slotId,ctx)` (phan-he-khach-choi.js): `diem += deltaMới−deltaCũ` (undo cũ+áp mới, KHÔNG cộng dồn dù đổi qua lại). doiTrangThaiDiDanh/xacNhanThamGia/baoCaoGhost(qua xuLyBungKeo wrapper) đều route qua đây. oldState đọc DB thật. Chi tiết: xem PHIÊN REDESIGN trong CURRENT STATE.
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

## CURRENT STATE (cập nhật: 2026-06-20 KHAI TỬ GOOGLE + ĐĂNG KÝ EMAIL OTP)

> Cache-bust `?v=` HIỆN TẠI (index.html): giao-dien.css=`20260620i`, components.css=`20260620a`, ket-noi-supabase.js=`20260620h`, bo-may-du-lieu.js=`20260620b`, hieu-ung-giao-dien.js=`20260612a`, phan-he-khach-choi.js=`20260620m`, phan-he-host.js=`20260619b`, phan-he-thong-bao.js=`20260620b`, phan-he-ung-dung.js=`20260620f`, phan-he-gop-y.js=`20260620c`. admin/index.html: ket-noi=`20260620h`, bo-may=`20260620b`, hieu-ung=`20260612a`, quan-tri=`20260620b`.

### PHIÊN KHAI TỬ GOOGLE AUTH + ĐĂNG KÝ EMAIL OTP ✅ (verify `.devtest/verify-dangky-otp.js`=4/4, console/network sạch)
- **GỠ SẠCH Google** (index.html + phan-he-khach-choi.js): xóa 2 nút `.btn-google` + divider "hoặc" + view `#gauthNeedPhone`; xóa hàm `dangNhapGoogle`/`_xuLyGoogleTroVe`/`_hienBuocThemSdtGoogle`/`_tenTuGoogle`/`googleHoanTatSdt`/`_layClientAuth`; xóa listener `onAuthStateChange`+vòng `_ggInt` ở init (chống xung đột script). Wrapper `guestRPC.googleDangNhap/googleDangKySdt` (ket-noi) để LẠI dạng dead-code (vô hại, không gọi).
- **Đăng ký = Email OTP (TÁI DÙNG backend — KHÔNG SQL/Edge Function mới)**: `hoanTatDangKy` sau validate + `dangKyV2` tạo TK (`is_email_verified=false`) → KHÔNG vào trang chủ ngay; lưu `_dkPending={user,token,email}` → gửi OTP qua `authEmail.guiMaXacThucEmail` (Edge `xac-thuc-email`) → mở modal tĩnh `#dkOtpOverlay` (không đóng khi click nền, chỉ nút X). Nhập đúng 6 số → `guestRPC.xacNhanEmail` set verified → `_luuSessionVaDangNhap` vào trang chủ. Sai/hết hạn → toast, modal giữ nguyên.
- **Cooldown 60s/email** nút "Gửi lại mã" (`#dkOtpResend`) qua `_cooldownNut(btn,60,"otp_dangky_"+email)` (bền F5). Modal mở là gửi mã lần đầu + bật cooldown ngay.
- Nút X (`_huyDangKyOtp`): bỏ modal, `_dkPending=null` — TK đã tạo (chưa xác thực), đăng nhập lại bằng mật khẩu sau vẫn được (login không bắt buộc verified).
- ⚠️ Test Google cũ (`verify-google-ready`, `verify-google-session-otp-account`, T5/T6 của `verify-auth-2tab`) ĐÃ LỖI THỜI (Google bị gỡ) — KHÔNG chạy nữa.
- Bump `?v=20260620m`: phan-he-khach-choi.js (index.html). index.html sửa inline (entry, served fresh). KHÔNG SQL, KHÔNG thư viện.

### 🔐 ĐẠI TU HỆ THỐNG AUTH (chuỗi phiên 2026-06-20) — chi tiết từng phiên ở TODO.md
> **SQL SSOT: `migration-auth-v1.sql` (Phần 1–10) — 🔴 PHẢI CHẠY LẠI mỗi lần có thay đổi.** Edge Functions: `supabase/functions/quen-mat-khau/` + `xac-thuc-email/` (🔴 deploy `--no-verify-jwt`, dùng chung secrets Resend). Google OAuth: 🔴 bật Google provider ở Supabase Auth + redirect domain.
- **Cột mới `nguoi_dung`**: `gmail`, `is_email_verified`. Bảng mới: `mat_khau_reset`, `email_verify_codes`, `anti_spam_logs`, `blacklist_devices`, `otp_send_logs`.
- **Đăng nhập/Đăng ký linh hoạt SĐT|Gmail**: `auth_dang_nhap_linh_hoat` (resolve email→sdt→gọi `phan_he_guest_login` cũ), `auth_dang_ky_v2` (+gmail, chống trùng → `REG_PHONE_ALREADY_EXISTS`/`REG_EMAIL_ALREADY_EXISTS`). UI 2 tab Đăng nhập/Đăng ký (tone **cam-đen #FF7A00**, tab gạch chân cam, nút pill `--lava-grad`), no-shift `.gauth-views min-height`.
- **Google 1-click**: `signInWithOAuth('google')` → `onAuthStateChange(SIGNED_IN)`→`_xuLyGoogleTroVe`→`auth_google_dang_nhap`(có→token)/`need_phone`(mới→`#gauthNeedPhone` thêm SĐT, auto-fill tên từ `_tenTuGoogle`)→`auth_google_dang_ky`. Google = `is_email_verified=true`.
- **Quên MK qua email**: Edge `quen-mat-khau`→mã 6 số→email HTML (CTA `?reset=1&dd=&code=`)→modal `qmk` 2 bước. Masking: nhập SĐT→che `quo***u@gmail.com`, nhập Gmail→full.
- **Xác thực Email + đổi SĐT/Email "khóa gốc"**: Profile badge `.email-badge--inside` (✓ trong ô, khóa readonly cả SĐT+Gmail) + nút `[Thay đổi]` (`btn-thaydoi`). "Xác thực ngay"(chưa verify)→OTP tới mail nhập. Đổi SĐT/Email→OTP "khóa gốc" về gmail đã xác thực→`xac_thuc_ma_goc`→mở khóa: SĐT(`doi_so_dien_thoai` DI CHUYỂN PK qua mọi bảng) / Email(OTP tới mail mới→`xac_nhan_email`). Smart filter `_locEmailInput` cắt `@gmail.com` thừa. Banner nhắc liên kết email snooze 24h.
- **Rate-limit OTP gửi mail**: backend `kiem_tra_otp_rate` (5 lần/15p/email∥IP, service_role, EF gọi trước Resend→`OTP_SPAM_BLOCKED`). Frontend cooldown 60s `_cooldownNut`/`_chayCooldown`/`_khoiPhucCooldown` **THEO ĐỊNH DANH** (`otp_cooldown_<sđt|email>`, bind `oninput`).
- **Anti-spam thiết bị (v2 device-only)**: `anti_spam_logs`+`blacklist_devices(expires 2h)`. `check_device_rate_limit` đếm DISTINCT tài khoản/10p **CHỈ theo `device_id`** (BỎ IP — chống khóa nhầm chung Wifi/4G), ≥3→khóa 2h. **Tách đôi FE**: `checkDeviceIsBlocked()`(read-only `kiem_tra_thiet_bi_bi_khoa`, cổng đầu, KHÔNG log) + `logSuccessfulAuthAction(dinhDanh,action)`(cổng cuối, gọi `anti_spam_gate` GHI VẾT — **CHỈ khi Auth THÀNH CÔNG**, sai pass/trùng→không log). 5 điểm: login/register/google×2/booking. Mã `DEVICE_BLOCKED_SPAM`→toast "thử lại sau 2 tiếng". Admin mở khóa: `DELETE FROM blacklist_devices WHERE device_id=...` + xóa `anti_spam_logs` 10p.
- **Static backdrop**: modal qmk/xte/dct KHÔNG đóng khi click nền mờ — chỉ nút X.
- device_id = FingerprintJS visitorId (fallback localStorage); IP = ipify best-effort (timeout 2s). Mọi RPC anti-spam FE **fail-open** nếu chưa deploy.
- Verify (.devtest): `verify-auth-rework`(6) `verify-auth-2tab`(8) `verify-google-ready`(3) `verify-email-verify`(6) `verify-doi-thongtin`(6) `verify-otp-cooldown`(5) `verify-reg-dup-backdrop-cooldown`(6) `verify-antispam`(4) `verify-antispam-v2`(6) `verify-google-session-otp-account`(4) `verify-tb-gopy-badge`(5) — TẤT CẢ PASS.

### PHIÊN GÓP Ý NÂNG CẤP (trạng thái/phản hồi + tách Ủng hộ + popup trang chủ + min-height) ✅ 2026-06-20
> Verify: `verify-gopy-validate.js`=3/3 · `verify-popup-trangchu.js`=7/7 · `verify-gopy-lichsu.js`=5/5 · `verify-gopy-split.js`=5/5 · `verify-gopy-noshift.js`=3/3 · `verify-mobile-nav.js`=6/6 · `verify-profile-shrink.js`=6/6. Console/network sạch.
- **🔴 SQL `migration-gopy-phanhoi-v1.sql` (CHỜ CHẠY)**: +cột `gop_y_he_thong.trang_thai`('cho_xu_ly'|'dang_thuc_hien'|'da_xong'|'tu_choi') + `noi_dung_phan_hoi`. RPC `admin_phan_hoi_gop_y(id,tt,phanhoi)` SECURITY DEFINER (GRANT authenticated): update + bắn `thong_bao` cho `sdt_user` với MỌI trạng thái xử lý (nội dung khớp 🛠️/✅/❌). RPC `lay_gop_y_cua_toi(token,sdt)` SECURITY DEFINER token-verified qua `_tb_phien_hop_le` (GRANT anon) → user đọc lịch sử CHÍNH MÌNH.
- **Admin gopY** (phan-he-quan-tri.js): cột "Trạng Thái" (badge Xám/Xanh dương/Xanh lá/Đỏ `_GOPY_TT`) + nút "Xử lý" → `_moModalPhanHoiGopY` (modal dựng động inline) → `_xacNhanPhanHoiGopY` gọi `_sbClient.rpc('admin_phan_hoi_gop_y')`. Hint "🔔 Mọi thay đổi trạng thái...kích hoạt chuông". colspan 8→9.
- **Popup trang chủ**: `luuThongBaoAdmin` bump config `popup_updated_at`=Date.now() CHỈ khi content/enabled đổi (snapshot `_popupSnap`). Frontend `window._kiemTraPopupTrangChu` (ung-dung, gọi cuối `khoiTaoUngDung` +1200ms): enabled+content+mốc≠`localStorage.last_seen_popup_time` → modal dark `#tvlHomePopupOverlay` (textContent chống XSS) nút "Không hiển thị lại" lưu mốc.
- **Tách Góp ý/Ủng hộ** (Header): nút gộp → `.btn-gop-y`(mở modal) + `.btn-ung-ho`(highlight amber → `window.cuonToiUngHo`=chuyển tab gioi-thieu + `scrollIntoView` mượt tới `#donateSectionWrap`, KHÔNG mở modal). Drawer mobile tách tương tự. Cả 2 ẩn @≤768.
- **Modal "ĐÁNH GIÁ & GÓP Ý"** (phan-he-gop-y.js): BỎ tab Ủng hộ, còn 2 tab grid 1fr 1fr (50/50): "💬 Gửi góp ý"(default) + "📋 Lịch sử góp ý" (`_taiLichSuGopY` via `guestRPC.layGopYCuaToi` → card dọc badge + box "💬 Admin phản hồi" thụt lề, escape XSS, guard chưa-login/rỗng). thong-bao.js +meta màu `gopy_phan_hoi`.
- **Khóa min-height chống giật** (index.html inline): `.uho-tab-content min-height:440px` (PC, ≥ form 432px → 2 tab bằng nhau) /380px(@≤480). `.uho-ls-empty` flex center + min-height 400/320 → thông báo chưa-login căn giữa.


### PHIÊN FONT MODAL VI PHẠM TÊN + NÚT "BỎ QUA (HIỆN LẠI SAU 2H)" ✅ (verify `.devtest/verify-ten-cuongche.js`=6/6, console/network sạch)
- **Font tiếng Việt** (phan-he-ung-dung.js `_hienModalViPhamTen` + `_hienModalDaKhoaTen`): áp `_MODAL_FONT` = `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` lên div modal + `font-family:inherit` cho nút (button không kế thừa font). 🔴 LƯU Ý: tên font có khoảng trắng dùng **nháy ĐƠN** (`'Segoe UI'`) vì nhúng trong `style="..."` (nháy đôi) — nháy đôi sẽ đóng attribute sớm làm hỏng font. Tinh chỉnh `font-weight` (700 tiêu đề, 500 nội dung) + `line-height` 1.3–1.6.
- **Nút "Để sau" → "Bỏ qua (Hiện lại sau 2h)"** (`window._boQuaTen2h`): lưu `localStorage["tvl_ten_snooze_"+sdt] = Date.now()+2h`. `quetTenViPham` nhánh-trong-24h: nếu `Date.now() < snoozeUntil` → KHÔNG hiện modal nhắc (F5/đổi tab yên trong 2h). **Lock 24h VẪN áp** (nhánh quá-hạn chạy TRƯỚC snooze-check). `_xoaCanhBaoTen` xóa luôn key snooze. Const `_TEN_SNOOZE_2H`.
- **SQL `migration-ten-canh-bao-v1.sql` ĐÃ CHẠY** (console sạch, không còn lỗi 42703) → timestamp `ten_canh_bao_luc` lưu DB (bền cross-device), `_tenColOK`=true.
- Bump `?v=20260619b`: phan-he-ung-dung.js (index). KHÔNG thư viện.

### PHIÊN CƯỠNG CHẾ ĐỔI TÊN — validate đăng ký/đổi tên + hồi tố tối hậu thư 24h ✅ (verify `.devtest/verify-ten-cuongche.js`=6/6 + helper `verify-ten-validate.js`=30/30 + regression tên-IN-HOA 5/5)
- **Validate chủ động** (dùng `window.kiemTraTenHopLe` — SSOT ở bo-may §VALIDATE): `hoanTatDangKy` (khach-choi, đăng ký) + `luuProfile` (ung-dung, đổi tên) → tên rác/tục tĩu/mạo danh/spam → toast `lyDo` + focus ô + CHẶN ghi Supabase. `luuProfile` lưu hợp lệ → `window._xoaCanhBaoTen(sdt)` + đóng modal.
- **Hồi tố `window.quetTenViPham()` (ung-dung)**: quét tên user hiện tại; vi phạm → modal tối hậu thư `#modalViPhamTen` (lý do + "đổi trong 24h kẻo KHÓA") 2 nút: **Đổi ngay** (`window._doiTenNgay` → `chuyenTab('ca-nhan')` + focus/scroll/select `#profileName`) · **Để sau** (`window._dongModalViPhamTen` → đóng, mốc đã ghi). Quá 24h → PATCH `is_active=false` (khóa; login + khoiTaoTrangKhach chặn sẵn) + `#modalDaKhoaTen` + xóa session + null currentUser/Guest.
- **Timestamp cảnh báo (DB-primary + fallback)**: cột `nguoi_dung.ten_canh_bao_luc` (🔴 SQL `migration-ten-canh-bao-v1.sql` — ALTER ADD COLUMN, anon UPDATE được, KHÔNG RPC). Cờ `_tenColOK` probe 1 lần: cột chưa có → fallback localStorage `tvl_ten_vp_<sdt>` (cơ chế VẪN chạy, tránh spam 400 — chỉ 1 lỗi probe/phiên cho tới khi chạy SQL). Khóa dùng `is_active` (sẵn có).
- **4 điểm kích hoạt quét**: open web/F5 (`khoiTaoTrangKhach` sau dashboard + `khoiTaoUngDung` nếu đã login), đăng nhập (`_onDangNhapThanhCong`), đổi tab (`visibilitychange`). Guard `_quetTenBusy`.
- Bump `?v=`: phan-he-khach-choi.js=`20260619f`, phan-he-ung-dung.js=`20260619a` (index). KHÔNG thư viện.

### PHIÊN HELPER VALIDATE TÊN NGƯỜI DÙNG `window.kiemTraTenHopLe` ✅ (verify `.devtest/verify-ten-validate.js`=30/30, console/network sạch)
- **bo-may-du-lieu.js** (sau `window.VALIDATE`): `window.kiemTraTenHopLe(raw)` → `{ ok, loai, lyDo }` (SSOT cho đăng ký/đổi tên/quét hồi tố). Logic: (1) **THÔ trên chuỗi gốc**: chặn ký tự đặc biệt/phân tách `_TEN_KY_TU_CAM` (loai `kytu` — chống `D.I.T`/`D_I_T`/`D-I-T`); khoảng trắng thừa đầu/cuối + `\s{2,}` (loai `khoangtrang` — chống `D   I   T`). (2) IN HOA GIỮ DẤU → độ dài 5–35 (`ngan`/`dai`), allowlist `[A-ZÀ-Ỹ ]` (`kytu`), số từ 2–5 (`itu`/`nhieutu`). (3) **Từ cấm 3 bước**: Bước1 whitelist NGUYÊN DẤU `_TEN_WHITELIST` (CÁC/MỄ/MỆ/KÍCH... → bỏ qua, chống chặn nhầm); Bước2 `_boDauTen` → whole-word khớp `_TEN_CAM_TOKEN` (test/mạo danh BQT + tục tĩu); Bước3 cụm nhiều từ `_TEN_CAM_CUM` (chứa chuỗi đã bỏ dấu). (4) **Spam**: token >8 ký tự HOẶC ≥4 ký tự không nguyên âm (`spam`). Helper mới `_boDauTen` + regex `_TEN_NGUYEN_AM`.
- ⚠️ MỚI CHỈ là HELPER — CHƯA wire vào `hoanTatDangKy`/`luuProfile` + cơ chế hồi tố modal 24h/khóa (là task riêng sau).
- Bump `?v=20260619a`: bo-may-du-lieu.js (index + admin). KHÔNG thư viện, KHÔNG SQL.

### PHIÊN VALIDATION BẮT BUỘC GIÁ + TRÌNH ĐỘ KHI ĐĂNG CA (/dang-quan-ly) ✅ (verify `.devtest/verify-dangca-validate.js`=5/5, console/network sạch)
- **Gốc**: `dangCaDauCuaHost` (host.js) KHÔNG validate giá/trình độ → host bỏ trống → ca lên hệ thống giá "0K" (hiểu lầm miễn phí) + dải trình độ trống làm vỡ/nhảy khung card /tim-keo.
- **Fix (host.js, sau khi build `yeu_cau_trinh_do`, TRƯỚC double-submit/INSERT)**: theo GIỚI TÍNH ĐƯỢC TUYỂN (`_tuyenNam`=male|both, `_tuyenNu`=female|both): (1) giá `gia_nam`/`gia_nu` phải `> 0` (chặn 0K); (2) `mLevels`/`fLevels` phải có `≥ 1` mức (checkbox HOẶC custom). Sai → `hienToast` chi tiết ("GIÁ THU NAM/NỮ..." / "trình độ ... NAM/NỮ") + `_baoLoiTruong(elId)` (highlight đỏ box-shadow layout-safe, cuộn+focus, tự xóa khi sửa) + `return` (KHÔNG INSERT). Helper `_baoLoiTruong` mới.
- Chỉ áp cho `dangCaDauCuaHost` (đăng ca form). `_luuSuaCa` (modal sửa ca) GIỮ NGUYÊN. KHÔNG SQL.
- Bump `?v=20260619b`: phan-he-host.js (index.html).

### PHIÊN FIX NHÃN "HOST:" NHẢY DỌC KÝ TỰ (tên host dài, mobile /tim-keo) ✅ (verify `.devtest/verify-host-label.js`=3/3 + regression host-2lines 5/5 + cardalign 8/8, console/network sạch)
- **Gốc lỗi (components.css)**: `.shb-label` ("HOST:"/"SĐT:") THIẾU `white-space:nowrap`+`flex-shrink:0`; `.shb-name` có `nowrap` nhưng THIẾU `min-width:0`+ellipsis → tên host dài giữ full min-content (nowrap) → flexbox bóp `.shb-label` về ~0 → "HOST:" nhảy dọc từng ký tự H/O/S/T/:.
- **Fix CSS**: `.shb-label` +`white-space:nowrap;flex-shrink:0` (luôn 1 dòng ngang). `.shb-name` +`overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto` (co lại + cắt "…" như tên sân). `.shb-name-chip` +`min-width:0;max-width:100%` (không tràn card). Áp GLOBAL (không media-query) — desktop tên dài cũng cắt gọn. KHÔNG đụng JS/cấu trúc HTML, KHÔNG SQL.
- Bump `?v=20260619b`: components.css (index.html).

### PHIÊN TỐI ƯU 4 BỘ LỌC /tim-keo (Giới tính · Trình độ AND · Giá 0K · Khung giờ) ✅ (verify `.devtest/verify-filters-4.js`=7/7 + regression district 4/4 + host-filter 9/9, console/network sạch)
- **Giới tính** (`_thucHienTimKiem`): GỠ gate `gia_nam/gia_nu <= 0 → return false` — chọn Nam/Nữ vẫn hiện ca "Cả hai" (đã đúng từ trước) NHƯNG nay ca giá **0K vẫn hiện** (trước bị ẩn oan). Nhãn giữ "Nam/Nữ/Cả hai" (chính xác hơn "Chỉ Nam" vì có cả Cả hai).
- **Trình độ multi-select**: đổi `.some()` (OR) → **`.every()` (AND nghiêm ngặt)** — ca phải có ĐỦ TẤT CẢ mức đã chọn; thiếu 1 mức → ẩn.
- **Giá tối đa**: nhánh "Cả hai" trước `Math.min(s.gia_nam || 999999, ...)` → `0 || 999999`=999999 → **ẩn oan ca 0K**. Sửa: `[gia_nam,gia_nu].filter(typeof==='number')` rồi `Math.min` → 0K là giá hợp lệ nhỏ nhất → hiện.
- **Khung giờ (ràng buộc chéo UI)**: thêm `_apDungDisableKhungGio`/`window._capNhatDisableKhungGio`/`window._khungGioChange(which,isMobile)`. Chọn Từ → disable mọi option ≤ Từ ở "Đến"; chọn Đến → disable mọi option ≥ Đến ở "Từ"; gán mâu thuẫn → tự reset ô KHÔNG vừa đổi. Wire onchange 4 select (PC `filterTimeFrom/To`, mobile `...Mobile`) → `_khungGioChange`; gọi `_capNhatDisableKhungGio()` ở init/`moBoLocDrawer`/`xacNhanBoLocDrawer`/`xoaBoLoc`. So sánh chuỗi "HH:MM" an toàn.
- Bump `?v=20260619e`: phan-he-khach-choi.js (index.html onchange giờ = entry, served fresh). KHÔNG SQL.

### PHIÊN FIX BỘ LỌC QUẬN/HUYỆN MOBILE (drawer→PC sync) ✅ (verify `.devtest/verify-district-mobile.js`=4/4 + regression `verify-tim-host-filter.js`=9/9, console/network sạch)
- **Gốc lỗi**: `xacNhanBoLocDrawer` sync mobile→PC qua vòng `_FILTER_PAIRS` chỉ gán `pcEl.value = mobileVal`. PC `#filterDistrict` là `<select>` → gán `.value` cho option CHƯA TỒN TẠI (vì options quận PC KHÔNG được repopulate theo tỉnh mới) → FAIL âm thầm (value về "") → district filter bị bỏ → mobile "lọc sai" (hiện cả tỉnh thay vì đúng quận). PC vốn đúng (`_toggleProvincePill` repopulate `#filterDistrict` + search).
- **Fix (khach-choi `xacNhanBoLocDrawer`)**: sau vòng `_FILTER_PAIRS`, xử lý RIÊNG tỉnh/quận: set hidden `#filterProvince` = tỉnh mobile → đồng bộ active pills tỉnh PC → `_capNhatHuyenBoLoc(tỉnh, "filterDistrict")` POPULATE options quận PC → MỚI gán `#filterDistrict.value` (giờ option có → value stick). `moBoLocDrawer` (mở drawer) vốn đã repopulate đúng — không đụng.
- **Logic lọc = AND nghiêm ngặt SẴN CÓ** trong `_thucHienTimKiem`: mỗi tiêu chí sai → `return false` (Tỉnh/Quận/Giới tính/Trình độ/Ngày/Giờ/Giá/Tên sân/Host) → giao thoa AND. Các `||`/`.some()` còn lại CHỈ nằm TRONG 1 tiêu chí (host khớp tên-HOẶC-SĐT; multi-select trình độ) — đúng UX, không phải OR-giữa-tiêu-chí. KHÔNG sửa core filter.
- Bump `?v=20260619d`: phan-he-khach-choi.js. KHÔNG SQL.

### PHIÊN NỀN TẢNG SEO KỸ THUẬT (index + brand) ✅
- **Tạo mới** `robots.txt` (Allow all, Disallow /admin, khai báo Sitemap) + `sitemap.xml` (/, /tim-keo, /dang-quan-ly). Vercel ưu tiên file tĩnh trước rewrite `/:path*` → 2 file này được phục vụ đúng (giống .js/.css).
- **`<head>` index.html** thêm: `<link rel=canonical>`, `<meta robots index,follow>`, **Open Graph** (og:title/description/image/url/site_name/locale → preview FB/Zalo/Messenger), **Twitter Card**, **JSON-LD** `WebSite`(name "Tuyển Vãng Lai" + alternateName) + `Organization` → khai báo TÊN THƯƠNG HIỆU cho Google/Cốc Cốc. KHÔNG `?v=` (index.html là entry, served fresh).
- ⚠️ **Code chỉ là điều kiện CẦN (để được index)**, KHÔNG đủ để lên top. Việc QUYẾT ĐỊNH thứ hạng (thủ công, chủ app làm): submit + verify **Google Search Console** + **Cốc Cốc Webmaster** (webmaster.coccoc.com — engine trong ảnh) + submit sitemap + Request Indexing; backlink (FB group/Zalo trỏ về domain); chờ vài ngày–tuần. Brand term "tuyenvanglai" khả thi top sớm; từ generic ("cầu lông"...) là cuộc đua dài.
- **Google verify đã gắn**: `<meta name="google-site-verification" content="6zOENW...">` trong `<head>` index.html (deploy rồi mới Verify được — Google fetch trang live). Cốc Cốc webmaster portal hiện không vào được → dựa coccocbot tự crawl (robots.txt cho phép `*`) + backlink.
- **Ảnh share OG 1200×630** (`og-share.png` ở gốc): trước dùng `logo.png` (banner 1865×350) → FB/Zalo crop 1.91:1 cắt cụt chỉ còn "VANG" + nền trắng nuốt chữ "TUYEN" viền trắng. Sinh ảnh nền tối + logo đầy đủ + tagline bằng Playwright (`.devtest/gen-og.js`, KHÔNG thêm lib; chạy cùng `server.js`). `og:image`/`twitter:image` → `og-share.png` + khai báo width/height/type/alt. Sau deploy phải dùng **FB Sharing Debugger → Scrape Again** để xóa cache preview cũ.

### PHIÊN MENU CHIA SẺ CA ĐẤU /tim-keo (chỉ link / full thông tin) ✅ (verify `.devtest/verify-share-menu.js`=7/7, console/network sạch)
- **Nút share (icon mắt xích) trên card** đổi `onclick` từ `shareKeo` → `window._moMenuShare(event, id)` → mở **menu nhỏ** `#khShareMenu` (position:fixed, định vị JS theo nút như `.gl-cdd-menu` → KHÔNG bị card overflow cắt, responsive PC+mobile, mở lên trên/thiếu chỗ mở xuống, đóng khi click ngoài/scroll/resize, toggle khi bấm lại).
- **2 lựa chọn** (`window._shareChon`): (1) **Chỉ sao chép liên kết** → URL `?id=` (bỏ www.) → toast "Đã copy link share!"; (2) **Sao chép full thông tin** → `_buildShareFull(slot, host)` dựng văn mẫu chuẩn (icon đa nền tảng + `\n`/`\n\n`) → toast "Đã copy full thông tin ca đấu!".
- **Format văn mẫu (chốt 2026-06-19c)**: `🏸 [QUẬN-TỈNH] - TUYỂN VÃNG LAI [THỨ, dd/mm/yyyy] 🏸` (**địa bàn + thứ/ngày IN HOA**) / ⏰ giờ / 📍 `TÊN SÂN HOA (Sân <số>)` (sân số qua `_formatSanSo`, ẩn nếu trống) / 🏢 địa chỉ (ẩn nếu trống) / 💪 **Trình độ yêu cầu:** rồi MỖI GIỚI 1 DÒNG `- Nam: ...` / `- Nữ: ...` (chỉ giới tuyển; trình độ **viết hoa chữ cái đầu** qua `_capFirst`, vd "TB+"→"Tb+") / 🏸 loại cầu (trống→**"Chưa rõ"**) / 💰 giá `- Nam:`/`- Nữ:` dạng K (chỉ giới tuyển) / ✨ tiện ích bao gồm / **`- SĐT/Zalo: <sdt> - (<TÊN HOST HOA>)`** (bỏ qua nếu host ảo/thiếu data) / 🔗 link.
- **Data ca**: `_taoCaCard` lưu `_shareCache[slot.id]={slot, host:hostInfo}` (tránh query lại). Helper: `_shareUrl`/`_lvlListShare`/`_fmtCauShare`/`_buildShareFull`. `window.shareKeo` GIỮ NGUYÊN (chỉ-link, còn dùng ở `verify-share-link.js`). Clipboard có fallback execCommand.
- CSS `.kh-share-menu`/`.kh-share-opt` (components.css, tông cam #FF7A00 khớp footer; @≤480 tap target lớn hơn). KHÔNG SQL, không thư viện. Bump `?v=`: components.css=`20260619a`, phan-he-khach-choi.js=`20260619b`.

### PHIÊN FIX HOST XÓA CA ĐẤU (RLS silent no-op → RPC token-verified) ✅ (verify `.devtest/verify-xoa-ca.js`=6/6, console/network sạch)
- **Gốc lỗi**: `xoaCaDau` (host) DELETE `ca_dau` qua REST anon → RLS THIẾU policy DELETE → HTTP 204 nhưng XÓA 0 DÒNG (silent no-op) → verify thấy ca còn → toast "Ca đấu vẫn còn trên hệ thống... Liên hệ Admin". KHÔNG phải bug WHERE-filter (DELETE theo `{id}` đúng).
- **Fix (đúng pattern app — như guest_dat_slot/guest_huy_slot)**: RPC **`guest_xoa_ca_dau(p_token,p_sdt,p_ca_id)`** SECURITY DEFINER (`migration-xoa-ca-dau-v1.sql`, 🔴 CHỜ CHẠY) — verify token↔sdt (guest_sessions) + so khớp QUYỀN SỞ HỮU `ca_dau.sdt_nguoi_tao=p_sdt` + dọn `dat_slot` con TRƯỚC rồi xóa `ca_dau`. Trả `{status: ok|khong_ton_tai|khong_so_huu|unauthorized, deleted}`. GRANT anon.
- **ket-noi-supabase.js**: wrapper `guestRPC.xoaCaDau(token,sdt,caId)` → rpc('guest_xoa_ca_dau').
- **phan-he-host.js `xoaCaDau`**: lấy `_myToken/_myPhone` từ currentGuest → gọi RPC TRƯỚC (`ok`/`khong_ton_tai`→xóa xong; `khong_so_huu`→"Không có quyền"; `unauthorized`→"Phiên hết hạn"). **Fallback** direct REST khi RPC chưa deploy: dọn `dat_slot` con (id_ca_dau) + xóa `ca_dau` theo `{id,sdt_nguoi_tao:_myPhone}` + verify. Success: filter `_caDauRawData` + `_caDauApply()` → card biến mất NGAY (không F5) + toast "Đã xóa ✅". Phạt host hủy ca / G2 GIỮ NGUYÊN.
- Bump `?v=`: ket-noi-supabase.js=`20260619a` (index+admin), phan-he-host.js=`20260619a` (index).

### PHIÊN KHUNG TRÌNH ĐỘ CỐ ĐỊNH → CARD /tim-keo THẲNG HÀNG MỌI CẤU HÌNH GIỚI TÍNH ✅ (verify `.devtest/verify-cardalign-note.js`=6/6)
- **Gốc lỗi**: khung "TRÌNH ĐỘ YÊU CẦU" cao theo nội dung: "Cả hai"=2 dòng giới; chỉ Nam/chỉ Nữ=1 dòng; ca có "ghi chú trình độ" (free text) thêm 1 dòng/giới. → khung cao thấp khác nhau → hàng "người đã đặt"+GIÁ tụt → card lệch hàng (ô khoanh đỏ = ca chỉ Nữ thấp hơn ca Cả hai).
- **Fix 2 tầng (khach-choi `_taoCaCard`)**: (1) `_pills` LUÔN render `.kh-level-note` (rỗng=`kh-level-note--empty` aria-hidden) → giữ chỗ 1 dòng ghi chú. (2) ca chỉ-Nam / chỉ-Nữ thêm **`_spacerLine`** (`.kh-trinh-do-line--spacer`, `visibility:hidden`, gồm 1 pill "--" + note rỗng) → LUÔN đủ 2 dòng giới như "Cả hai". CSS (giao-dien.css) `.kh-level-note { min-height:15px; line-height:1.4 }` + `.kh-level-note--empty { visibility:hidden }`.
- **Kết quả**: Cả hai = Nam = Nữ → khung trình độ cùng cao + hàng GIÁ thẳng hàng tuyệt đối (verify: lwH 158/158/158, priceOffset 383/383/383, spread 0; lines [2,2,2], spacers [0,1,1]). KHÔNG SQL. Bump giao-dien.css=`20260615a`, khach-choi=`20260615h`.

### PHIÊN SỬA TÊN CẦU TRONG MODAL "CHỈNH SỬA CA ĐẤU" ✅ (verify `.devtest/verify-suaca-cau-ten.js`=5/5)
- **Gốc**: `_moModalSuaCa` (host.js) render mục "Cầu sử dụng" tên cầu là `<span>` TĨNH → không sửa được; `_luuSuaCa` giữ `ten` từ `...orig` (DB cũ).
- **Fix**: đổi span → `<input type="text" id="msc_cau_ten_${i}" value="${_escAttr(c.ten)}">` (thêm cột "Tên cầu" trong grid `1fr 78px 92px`, có label + placeholder + autocomplete=off). Thêm helper `_escAttr` (escape value HTML-attr, che dấu nháy). `_luuSuaCa` đọc `g("msc_cau_ten_"+i).trim()` → ghi đè `ten` trong `cauListUp` (để trống → "Chưa rõ" ở chi tiết, đồng bộ phiên trước). KHÔNG SQL. Bump host=`20260615b`.

### PHIÊN FIX CARD GÓC TRÊN-PHẢI GRID /tim-keo (lệch khung trình độ + giá) ✅ (verify `.devtest/verify-grid-topright.js`=10/10)
- **Gốc lỗi (CSS inline index.html)**: `#slotsSearchResultContainer.keo-grid { grid-template-columns: repeat(3,1fr) }` + `.slot-card { min-width: 360px }`. Ở viewport 1280/1440 vùng `.tk-main` chỉ ~864–1040px nhưng 3×360+gap ≈ 1082px → **grid TRÀN ngang → cột phải (card[2], top-right) bị cắt mép** → khung "TRÌNH ĐỘ YÊU CẦU" + hàng giá Nam/Nữ co kéo lệch. Cố định tại vị trí cột 3 bất kể dữ liệu (đo: overflow 73px@1280, 42px@1440; ≥1680 hết tràn nên không lỗi).
- **Fix**: `grid-template-columns: repeat(3, minmax(0,1fr))` (cột co giãn đều, không để item nong cột) + `.slot-card { min-width: 0 }` (card thu theo cột; mức tối thiểu đã đặt ở `minmax(220/240px,1fr)` trong media tablet/PC-vừa). Card[2] giờ == card[0] (rộng/lvl/giá) ở mọi width. CSS inline index.html (entry, không ?v=). KHÔNG SQL, không JS đổi.

### PHIÊN BỎ TÊN CẦU MẶC ĐỊNH "HẢI YẾN" + HIỂN THỊ "CHƯA RÕ" ✅ (verify `.devtest/verify-cau-chuaro.js`=5/5)
- **Host (phan-he-host.js)**: hàng cầu mặc định trong Kế Toán Nội Bộ đổi `_themHangCauMoi("Hải Yến","12",300000,12)` → `_themHangCauMoi("","12",300000,12)` (2 call site: `_hienThiDashboard` + `_resetFormDangCa`) → ô TÊN CẦU TRỐNG khi mở modal (placeholder "Hải Yến, Victor..." vẫn còn làm gợi ý). Quy cách/giá mặc định giữ nguyên.
- **Frontend (phan-he-khach-choi.js `moModalChiTietKeo`)**: hàng "LOẠI CẦU" giờ LUÔN hiện; `cauNames` rỗng (host bỏ trống) → hiển thị **"Chưa rõ"** (uppercase "CHƯA RÕ") thay vì ẩn hàng. Có tên cầu → hiện đúng tên.
- KHÔNG SQL. Bump khach-choi=`20260615f`, host=`20260615a`.

### PHIÊN LỌC HOST/SĐT + "CA CỦA TÔI ĐĂNG" (/tim-keo) ✅ (verify `.devtest/verify-tim-host-filter.js`=9/9)
- **Ô tìm Host/SĐT** (`#filterHost` sidebar + `#filterHostDrawer` mobile): lọc theo tên host (accent-insensitive, khớp 1 phần) HOẶC SĐT người đăng (khớp 1 phần chuỗi số). `_thucHienTimKiem` đọc `hostQuery`; trong filter dùng `hostMap[sdt_nguoi_tao]` so `_hTen.includes(normHostQuery) || _hSdt.includes(hostDigits)`. Thêm cặp `["filterHost","filterHostDrawer"]` vào `_FILTER_PAIRS` (tự sync PC↔drawer).
- **Toggle "Ca của tôi đăng"** (`#filterMyCas` + `#filterMyCasDrawer`, class `.tk-mycas-toggle`): CHỈ hiện khi đã đăng nhập — `window._capNhatBoLocCaNhan()` ẩn/hiện group theo `currentGuest` + uncheck khi logout, gọi ở đầu `_thucHienTimKiem` + `moBoLocDrawer`. Filter: `myOnly` → `s.sdt_nguoi_tao === currentGuest.sdt_khach`. AND với mọi filter khác. `xoaBoLoc` reset cả 2.
- KHÔNG SQL, không thư viện. CSS `.tk-mycas-toggle` inline index.html (entry, không ?v=). Bump khach-choi=`20260615e`.

### PHIÊN DẢI TRÌNH ĐỘ RỘNG + GIÁ TỶ LỆ THUẬN (ca ảo) ✅ (verify `.devtest/verify-seed-ca-ao.js`=15/15)
- **Dải trình độ RỘNG, thực tế** (thay slice 2–4 cấp quanh quẩn 1 band): bảng `_DAI` = mảng `[startIdx,endIdx]` trong `LV=NEWBIE..TB+` — `[0,2][0,3][0,4][0,5][1,5][1,6][1,8][4,8][4,9][7,9]`. Luôn bắt đầu đáy band (0/1/4/7), trải 2–8 cấp qua nhiều band (NEWBIE→YẾU, NEWBIE→TBY, YẾU→TB...), KHÔNG chạm TB KHÁ/KHÁ. Nữ `nuRange.end ≤ namRange.end`.
- **🔴 GIÁ TỶ LỆ THUẬN TRẦN trình độ** (`topIdx` = trần của gender đang tuyển): `topIdx≤3 (≤YẾU+)→50/55/60K` · `4–6 (TBY)→60/65/70K` · `≥7 (TB-..TB+)→70/75/80/85K`. Bỏ random giá độc lập cũ (loại bug ca NEWBIE/YẾU mà giá 70–75K). `gia_nu = max(50, giaNam − {5|10})`.
- Verify thêm 1c2 (maxSpan≥5) + 1f (giá khớp trình độ). Bump quan-tri=`20260615g`. KHÔNG SQL.

### PHIÊN ĐỒNG BỘ KÝ TỰ CHE SĐT (XXXX toàn hệ thống) ✅ (verify `.devtest/verify-seed-ca-ao.js`=13/13)
- **Vấn đề**: ca thật che SĐT bằng `XXXX` (`_maskSdt` → `096XXXX567`); ca ảo lại che bằng `***` (`_maskSdtGiua` → `096***600`) → khách dễ phát hiện ca ảo.
- **Fix (phan-he-khach-choi.js)**: `_maskSdtGiua` đổi `"***"`→`"XXXX"` (giờ `096XXXX600`, định dạng GIỐNG HỆT `_maskSdt`). Đồng bộ luôn `_maskPhone` (modal hồ sơ công khai) `"***"`→`"XXXX"`. Toàn hệ thống dùng 1 kiểu che `XXXX`. KHÔNG SQL. Bump khach-choi=`20260615d`.

### PHIÊN FIX BANNER HOST/SĐT 2 DÒNG CỐ ĐỊNH (chống nhảy khung) ✅ (verify `.devtest/verify-host-2lines.js`=5/5)
- **Vấn đề**: `.slot-host-banner` là flex ROW + `flex-wrap` + divider "|" → tên host ngắn (VŨ KIÊN) → HOST+SĐT cùng 1 dòng; tên dài (NGÔ NGỌC TRUNG) → wrap 2 dòng → chiều cao banner lệch → card nhảy khung.
- **Fix (components.css)**: `.slot-host-banner` → `flex-direction:column; align-items:flex-start; gap:3px` → HOST luôn dòng 1, SĐT luôn dòng 2, chiều cao CỐ ĐỊNH bất kể tên dài/ngắn (verify: ngắn=dài=69px). Ẩn `.slot-host-banner .shb-divider{display:none}` (dấu "|" vô nghĩa khi xếp dọc). CSS-only, áp cả card thật lẫn ảo. Bump components.css=`20260615b`.

### PHIÊN CA ẢO CÓ NGƯỜI + FIX TRẦN 1000 DÒNG ANON ✅ (verify `.devtest/verify-seed-ca-ao.js`=13/13)
- **Ca LIVE (đang diễn ra) phải CÓ người**: trước chỉ FULL mới seed slot, LIVE = 0 người. Nay `slotCount` = FULL→`tong_slot_can`; LIVE→`_rndIntS(max(2,⌈tong*0.5⌉), tong−1)` (≥ nửa, < full → vẫn nhãn "Đang diễn ra" + có người). Seed cho CẢ full & live. (verify 3b liveEmpty=0)
- **🔴 FIX TRẦN 1000 DÒNG (db-max-rows role anon)**: `doc("dat_slot")` không filter → Supabase chỉ trả 1000 dòng CŨ NHẤT (limit client KHÔNG vượt được trần server) → ca mới (gồm ca ảo) + booking thật gần đây bị đếm thiếu slot → hiện "0 người"/không full. **Fix `_thucHienTimKiem` (khach-choi)**: tách fetch — đọc `ca_dau` trước, lọc ca CÒN HIỆU LỰC (`!da_chot_ca && !is_frozen`) lấy ids, rồi `doc("dat_slot",{in:{id_ca_dau:activeIds},limit})` → kết quả nhỏ < 1000, TỰ loại slot rác của ca đã neutralize. Đây là fix BUG THẬT (không chỉ ca ảo). Bump khach-choi=`20260615c`. donDepCaAo cũng +limit (best-effort). Bump quan-tri=`20260615f`.
- **Dọn rác**: `cleanup-ca-ao.sql` cập nhật — nhận diện ca ảo qua `ten_san LIKE 'SÂN CẦU LÔNG %'` (+ mồ côi/`VK-`) vì host_ao thường đã bị xóa → ca mồ côi. anon KHÔNG DELETE ca/slot → cần chạy SQL owner để purge vật lý (app vẫn chạy đúng không cần purge nhờ in-filter).

### PHIÊN REFINE CA ẢO (chân thật hơn) ✅ (verify `.devtest/verify-seed-ca-ao.js`=12/12)
- **Tên sân**: dataset giữ bare ("Sân Hải Yến") → generator build `ten_san = "SÂN CẦU LÔNG " + bỏ "Sân " + UPPERCASE` (vd "SÂN CẦU LÔNG HẢI YẾN"). dia_chi_san dùng tenSan.
- **Trình độ = CỤM tự nhiên (v2)**: BẮT ĐẦU từ ĐÁY band — `_STARTS=[0,1,4,7]` = NEWBIE/YẾU-/TBY-/TB- (chỉ số trong `LV=TRINH_DO_LIST.slice(0,10)`), liền kề 2–4 cấp `LV.slice(base, base+rnd(2..min(4,TOP-base+1)))`. **KHÔNG bắt đầu từ cấp "+"** (tránh "yếu+, tby-..." kiểu lấy đuôi band trước rồi sang band sau), **KHÔNG chạm TB KHÁ/KHÁ (bán chuyên)**. Nữ `baseNu ≤ baseNam`. (v1 cũ slice tùy ý đã bỏ.)
- **Mã slot khách ảo `VK-` → `SLOT-`+8hex IN HOA** (đồng bộ 100% khách thật).
- **tong_slot_can linh hoạt 3–8/sân** (cộng độc lập từng sân → tổng lẻ/chẵn đa dạng, bỏ cứng 7-8). Bump quan-tri=`20260615d`.
- *Verify lưu ý*: thêm purge host_ao ĐẦU mỗi lần chạy (teardown DELETE bị abort khi đóng browser → host ảo sót lại, lần sau tái dùng pool cũ data-style cũ → 1c lệch). Data thật vẫn sạch.

### PHIÊN SINH CA ĐẤU ẢO (Seed Virtual Matches) ✅ (verify `.devtest/verify-seed-ca-ao.js`=8/8)
- **Mục tiêu**: admin sinh ca đấu ẢO trông tự nhiên (HCM+HN) tăng mật độ /tim-keo; khách KHÔNG đặt được & KHÔNG xem hồ sơ host ảo. **KHÔNG SQL, KHÔNG thêm cột.**
- **🔴 Đánh dấu host ảo = `nguoi_dung.ma_gioi_thieu = 'HOST_AO'`** (vai_tro='host' để KHỎI vướng CHECK `chk_vai_tro` — `vai_tro='host_ao'` bị DB từ chối 23514). `ma_gioi_thieu` là TEXT tự do, KHÔNG hiển thị trên card → marker an toàn. Mọi nhận diện đọc cột này.
- **Admin (phan-he-quan-tri.js)**: nút "🏟️ Sinh Ca Ảo" (`moModalSeedCaAo`/`seedCaDauAo`, guard `_seedAoBusy`) + "🧹 Dọn Ca Ảo" (`donDepCaAo`). Datasets `_KHU_VUC_SAN` (HCM+HN, quận↔sân khớp `MOCK_PROVINCES` case-sensitive), tên VN IN HOA (`_tenVietHoa`), `_CAU_BRANDS`, `_GIO_PHO_BIEN`. Giá nam 50–85K bước 5K, nữ=`Math.max(50,nam−{5|10})`. Trình độ NEWBIE..TB+ (nữ ≤ nam). **🔴 ÉP ANON khi ghi** (`window._adminJWT=null` trong try/finally) vì authenticated THIẾU INSERT/DELETE policy. **Khóa đặt = ~70% FULL (seed đủ `tong_slot_can` dòng dat_slot, BULK array 1 request) + ~30% LIVE** (now−1h..+, tính theo phút-trong-ngày → an toàn qua nửa đêm, `ngay_danh`=hôm nay để không bị ẩn). `is_tam_khoa` KHÔNG dùng. ca insert kèm `id=crypto.randomUUID()`.
- **Frontend (phan-he-khach-choi.js)**: select thêm `ma_gioi_thieu`; `hostMap[sdt].virtual=ma_gioi_thieu==='HOST_AO'`. Card host ảo: chip tên KHÔNG onclick (title "Tài khoản hệ thống"), SĐT tĩnh `_maskSdtGiua`=`096***600` (bỏ reveal). Guard `xemHoSoNguoiDang`/`xemHoSoCongKhai`: user.ma_gioi_thieu==='HOST_AO' → đóng modal + toast. DS thành viên admin (`_taiDanhSachKhach`) bỏ qua host ảo (không tính count).
- **Dọn dẹp**: anon KHÔNG DELETE được ca_dau/dat_slot (RLS) → `donDepCaAo` NEUTRALIZE (slot→"Khách hủy", ca→`da_chot_ca=true` ẩn) + DELETE nguoi_dung host ảo (anon DELETE OK; sdt_nguoi_tao là TEXT không FK). Purge VẬT LÝ: `cleanup-ca-ao.sql` (DELETE-only, KHÔNG ALTER, thứ tự dat_slot→ca_dau→nguoi_dung). Bump quan-tri=`20260615b`, khach-choi=`20260615b`.

### PHIÊN PHÓNG TO 2 NÚT CTA HERO TRANG CHỦ ✅ (verify `.devtest/verify-hero-cta.js`=5/5)
- **CSS inline trong index.html** (landing hero, không file `?v=` riêng → load tươi): `.lp-btn-cta` ("Tìm Kèo Ngay") → padding `18px 42px`, font `1.1rem`, `min-width:210px`, **gradient cyan `#06b6d4→#22d3ee`** + glow mạnh + `animation lpCtaPulse 2.4s` (nhịp glow thu hút, tắt khi `prefers-reduced-motion` / hover). `.lp-btn-sec` ("Đăng Kèo") → padding `17px 34px`, font `1rem`, `min-width:180px`, nền `rgba(255,255,255,0.06)` + viền `1.5px` (hover sang cyan). Cả 2: `justify-content:center` + `:active` scale. `.lp-cta-wrap` gap `14px`. Thực tế: cta=264×57, sec=180×55. KHÔNG SQL, không thư viện.

### PHIÊN NÚT SHARE MOBILE + LINK SHARE GỌN/UY TÍN ✅ (verify `.devtest/verify-share-link.js`=6/6)
- **Nút Share mobile bị bó hẹp/tù** (components.css): `.btn-slot-share` thêm `padding:0 16px` + `min-width:52px`. Media `@max-width:380px` đổi cột share `auto`→`minmax(56px,auto)` (footer grid) → nút giãn rộng, dễ bấm (verify: w=56, padL/R=16px).
- **Link share gọn/uy tín** (`shareKeo`, khach-choi): bỏ `www.` (`window.location.host.replace(/^www\./i,'')`) + đổi tham số `?ca=`→**`?id=`** → `https://tuyenvanglai.io.vn/...?id=<uuid>`. **Parse backward-compat**: `_autoOpenFromUrl` (khach-choi) + auto-open (ung-dung) đọc `params.get('id') || params.get('ca')` → link cũ `?ca=` VẪN mở modal. KHÔNG SQL. Bump `?v=`: components.css=`20260615a`, khach-choi=`20260615a`, ung-dung=`20260615a`.

### PHIÊN PHÂN TÁCH CARD LỊCH SỬ THAM GIA (CSS) ✅ (verify `.devtest/verify-lichsu-separation.js`=8/8)
- **Vấn đề**: card ca đấu (LỊCH SỬ > Lịch Sử Tham Gia) nền tối phẳng (`#181818`) + viền mờ (`rgba(255,255,255,0.05)`); khi xổ chi tiết, body `rgba(0,0,0,0.2)` cũng tối → ranh giới với ca trên/dưới dính thành một mảng tối.
- **Fix (giao-dien.css)**: `.ls-card` nền `#161c28` + viền nét `rgba(30,58,95,0.7)` + `margin-bottom:14px` + shadow nhẹ. Card MỞ = class mới **`.ls-card--open`** (viền accent `rgba(0,255,136,0.55)` + glow + `box-shadow 0 10px 28px` → nổi khỏi 2 ca liền kề). `.ls-card-body` nền **`#1a2438` (SÁNG hơn header → tương phản)** + `border-top:rgba(0,255,136,0.22)` (ranh accent header↔nội dung).
- **JS (khach-choi `_toggleLsItem`)**: toggle thêm `card.classList.toggle("ls-card--open", !isOpen)` (card = `body.closest(".ls-card")`). KHÔNG SQL. Bump `?v=20260614c`: giao-dien.css, khach-choi.

### PHIÊN SNOOZE NHẮC CHỐT CA 2H + PHÂN QUYỀN ẨN MÃ SLOT ✅ (verify `.devtest/verify-snooze-maskslot.js`=7/7)
- **Snooze 2h modal "Xác Nhận Số Liệu & Chốt Ca"**: nút footer "Bỏ qua" → **"Không nhắc lại trong 2h"** (index.html, `onclick=boQuaNhacChotCa2h()`). `window.boQuaNhacChotCa2h` (host.js): `localStorage.tvl_snooze_chotca = Date.now()` + đóng modal + toast. `window._dangSnoozeNhacChot()` = `Date.now()-ts < 2h` (const `_SNOOZE_CHOTCA_MS`). AUTO-show trong `_taiLichSuCaDau` (host.js:~1776) thêm guard `&& !window._dangSnoozeNhacChot()` → KHÔNG tự bật trong 2h (bền F5/đổi tab). **Mở THỦ CÔNG vẫn được** (snooze chỉ chặn auto). KHÔNG SQL.
- **Phân quyền MÃ ĐẶT SLOT trong CHI TIẾT CA ĐẤU** (`moModalChiTietKeo`, khach-choi, mục "Người Đã Đăng Ký"): chống lấy mã người khác đi phá. `_meSdt=currentGuest.sdt_khach`, `_laHostCa = _meSdt===s.sdt_nguoi_tao`. Mỗi dòng: `_xemFull = _laHostCa || g.sdt_khach===_meSdt`. Full → `g.ma_slot`; ẩn → `_anMaSlot()` giữ tiền tố trước "-" + `******` (SLOT-XXXX→`SLOT-******`, KR-→`KR-******`) + icon khóa + title. Host xem full MỌI mã; khách chỉ full mã CHÍNH MÌNH. KHÔNG SQL.

### PHIÊN ẨN MENU TRÙNG (mobile) + TÊN NGƯỜI DÙNG IN HOA TOÀN HỆ THỐNG ✅ (verify `.devtest/verify-tenhoa-menu.js`=5/5)
- **Ẩn mục trùng**: menu 3 gạch mobile có dòng "Tài Khoản / Đăng Nhập" trùng với icon trang cá nhân ngoài header khi đã login. Thêm `id="mobileNavAccountItem"` (index.html) → `_capNhatHeaderState()` (phan-he-ung-dung.js) ẩn (`display:none`) khi `currentUser`, hiện lại (`display:""`) khi logout. **Expose `window._capNhatHeaderState`** (harness `loginAs` chỉ set `currentGuest`, không render header → verify gọi trực tiếp).
- **Tên IN HOA = 2 tầng**: (1) **Tầng dữ liệu** (đồng bộ "từ lúc đăng ký"): uppercase khi lưu — `hoanTatDangKy` (khach-choi, uppercase `ten` SAU validate; regex `À-ỹ` chấp nhận hoa có dấu), `luuProfile` (ung-dung, `ten_khach`), `luuThemKhach` (host, khách đặt riêng). (2) **Tầng hiển thị** (CSS safety-net cho data cũ): `giao-dien.css` thêm `text-transform:uppercase` cho `#headerUserName, #profileDisplayName, #profileGuestName, .host-name, .review-author-link, .gl-ten-khach, .tvl-ten-hoa`. Class `.gl-ten-khach` áp ô Tên Khách DS Khách (host); `.tvl-ten-hoa` áp tên modal hồ sơ khách (host); `tenHien`/`tenHienThi` (modal hồ sơ công khai khach-choi) uppercase tại biến display. KHÔNG SQL, không thư viện.

### PHIÊN THÊM "KHÁCH ĐẶT RIÊNG" (đặt ngoài app) ✅ (verify `.devtest/verify-themkhach.js`=6/6)
- **Vấn đề**: khách đặt riêng qua Zalo/FB/khách quen/tuyển ngoài không qua web → DS Khách + doanh thu thiếu. Vì DS/doanh thu/đếm khách đều tính theo từng dòng `dat_slot` (host.js:4096-4104) → cho host TỰ THÊM 1 dòng dat_slot (KHÔNG cần tài khoản). **KHÔNG SQL** (cột sẵn có).
- **UI**: nút **"➕ Thêm khách đặt riêng"** (`#gl-addguest-bar` đầu modal DS Khách) → modal `#modal-them-khach` (Tên bắt buộc + Giới tính Nam/Nữ `_tkChonGT` + SĐT tuỳ chọn). Funcs host.js: `moModalThemKhach`/`dongModalThemKhach`/`luuThemKhach` (guard `_themKhachBusy`).
- **Thuật ngữ**: "Khách đặt riêng" (bao quát mọi nguồn ngoài app). Mã prefix **`KR-`**+8hex → badge **"Đặt riêng"** (`.gl-datrieng-badge`) cạnh tên trong DS Khách. Trạng thái thêm = "Chờ đánh" (host đánh dấu Đã tham gia + Thanh Toán sau như khách web).
- **An toàn**: SĐT rỗng → tên render text thường (KHÔNG link `xemHoSoKhach`, tránh tra nhầm hồ sơ trống). Không tài khoản → apDiem/thông báo no-op. Sau thêm: reload modal + `_taiLichSuCaDau` + `_tkInvalidateCache`. Doanh thu tự cộng `gia_nam/gia_nu` khi tham gia+thanh toán+chốt ca (verify=70000 đúng). Bump `?v=`: giao-dien.css=`e`, host=`f`.
- **FIX lệch badge** (`.devtest/verify-badge-center.js`=4/4): badge "Đặt riêng" nằm chung dòng với tên → cả cụm bị căn giữa làm tên lệch trái so với mã. Sửa `.gl-datrieng-badge` → `display:block;width:fit-content;margin:3px auto 0` → badge xuống dòng riêng, căn giữa (tên/badge/mã đều giữa, lệch 0px). Bump giao-dien.css=`f`.

### PHIÊN XÁC NHẬN SLOT QUA ZALO/FB (Bước 1) + ĐIỂM DANH TẠI SÂN (Bước 2) ✅ (verify `.devtest/verify-xacnhan-msg.js`=6/6)
- **Quy trình chống slot ảo 2 bước** dùng `ma_slot`: **B1** khách↔host nhắn qua Zalo/FB/SĐT đối chiếu mã + xác nhận đúng người TRƯỚC; **B2** tại sân host điểm danh bằng mã (`#gl-checkin-bar`, đổi nhãn "Bước 2 · Điểm danh tại sân bằng mã").
- **Khách** (card Lịch Sử, khach-choi): nút **"Copy mã & lời nhắn xác nhận"** (`.ls-btn-xacnhan`) + hint → `window._copyLoiNhanXacNhan(btn)` đọc `data-msg` (nội dung soạn sẵn khách→host gồm sân/giờ/ngày/mã). Helper `_buildMsgXacNhanKhach`/`_escAttr`/`_fmtNgayMsg`/`_fmtGioMsg`. Chỉ hiện khi có mã + KHÔNG phải "Khách hủy"/"Host từ chối".
- **Host** (DS Khách row, host.js): nút nhỏ **"Nhắn xác nhận"** (`.gl-nhan-btn`) cạnh `.gl-maslot` → `window._glCopyLoiNhanHost(btn)` (nội dung host→khách). Helper `_buildMsgXacNhanHost`/`_glEscAttr`/... Ca info từ `_caRow = caDauList[0]`. Hiện khi có mã + `!isHuy` + khác "Host từ chối".
- **Nội dung tin nhắn**: trung lập "bạn/mình", emoji nhẹ + gạch đầu dòng (Sân/Thời gian/Mã). Lưu qua `data-msg` (HTML-attr escape → trình duyệt tự decode) → tránh lỗi quote/newline trong onclick. Clipboard có fallback `execCommand`.
- **Hint quy trình**: không phản hồi → khách cân nhắc tự hủy (`huyDatSlot` sẵn có) / host cân nhắc Từ chối (`tuChoiKhach` sẵn có). KHÔNG thêm action mới, KHÔNG SQL. Bump `?v=20260613d`: giao-dien.css, khach-choi, host.
- **REFINE (`?v=20260613e`)**: nút "Nhắn xác nhận"/"Copy mã & lời nhắn" chỉ hiện **TRƯỚC giờ bắt đầu ca** (qua giờ 2 bên đã ở sân → nhắn vô nghĩa, ẩn cho gọn). Host: thêm `pha === "truoc"` vào `_showNhan` (dùng `pha=phaCaDau(_caInfo)`). Khách: thêm `_truocGioCard` (ưu tiên `phaCaDau(ca)==="truoc"`, fallback so `gio_bat_dau`, thiếu giờ→vẫn hiện) vào điều kiện nút. Ô "Bước 2 · Điểm danh tại sân" GIỮ hiện mọi pha. Verify mở rộng = 7/7 (trước hiện / sau ẩn / bar luôn hiện).

### PHIÊN ĐIỂM DANH BẰNG MÃ XÁC NHẬN + ĐIỂM UY TÍN HỒ SƠ KHÁCH ✅ (verify `.devtest/verify-checkin-maslot.js`=5/5, `verify-hoso-uytin.js`=5/5)
- **`ma_slot` (Mã Xác Nhận) — hoàn thiện phía host** (trước đây nửa vời: khách có mã, host không dùng được). (1) DS Khách hiện `ma_slot` dưới tên (`.gl-maslot`) + `<tr data-uid="cdd-<id>" data-ma-slot>`. (2) Ô **"Điểm danh bằng mã"** (`#gl-checkin-bar` trong index.html) → `window.glCheckinByCode()` (host.js): nhập/dán mã (khớp cả khi thiếu tiền tố "SLOT-") → cuộn tới + tô sáng (pulse) dòng → nếu "Chờ đánh" gọi `_triggerGlCdd(uid,"Đã tham gia")` (qua guard pha giờ + xác nhận); "Đã tham gia" rồi → báo đã điểm danh; "Khách hủy"/"Host từ chối"/"Bùng kèo" → cảnh báo. **⚠ uid dropdown = `cdd-<g.id>`** (KHÔNG phải g.id) — `_triggerGlCdd` dùng `getElementById(uid)`. Reset ô khi mở modal. (3) Chuẩn hoá format fallback `ma_slot` (khach-choi) = `SLOT-`+8 hex IN HOA (đồng nhất RPC, vd SLOT-9ECEF0F5; trước là 5 ký tự base32).
- **Hồ Sơ Khách (host) thêm thanh ĐIỂM UY TÍN**: `xemHoSoKhach` fetch thêm `nguoi_dung(diem_uy_tin,is_active)` → thanh 0–100 + band màu (≥80 cao xanh / 60–79 bình thường cyan / 40–59 cần cải thiện cam / <40 hạn chế đỏ / is_active=false → 🔒 Tạm khóa đỏ). KHÔNG SQL.
- Bump `?v=20260613c`: khach-choi, host (host cũng đã `20260613b` cho điểm uy tín hồ sơ — gộp `c`).

### PHIÊN CHỈ GỠ NÚT "★ ĐÁNH GIÁ CA ĐẤU" (sửa lỗi gỡ quá tay) ✅ (verify `.devtest/verify-go-danhgia.js` = 9/9, sạch)
- **BỐI CẢNH**: phiên trước hiểu sai → gỡ TOÀN BỘ đánh giá. Chủ app CHỈ muốn gỡ nút "★ Đánh giá" (ghi chú ca, `moModalDanhGiaCa`) ở cột HÀNH ĐỘNG mục "Ca Đấu Đã Chốt". Đã **KHÔI PHỤC 2 chiều đánh giá** từ transcript (không git) + reverse edit phiên này.
- **CHỈ GỠ (giữ gỡ)**: `window.moModalDanhGiaCa`/`dongModalDanhGiaCa`/`luuDanhGiaCa` (host.js) + modal `#modal-danh-gia-ca` (index.html) + nút "★ Đánh giá" cột HÀNH ĐỘNG Ca Đã Đăng. (Ghi chú ca lưu `ca_dau.danh_gia` — tính năng này bỏ.)
- **KHÔI PHỤC ĐẦY ĐỦ** (= trạng thái T0): **Host→Khách** (cột "Đánh Giá" DS Khách + `moQuickDanhGiaKhach`/`#modal-quick-dg` + `moModalDanhGiaKhach`/`guiDanhGiaKhach`/`#modalDanhGiaKhachOverlay` + hệ thống sao + `reviewsMap`/`ratingCellHTML`/`canRate` + ô cells[9] trong `doiTrangThaiDiDanh` + review trong `xemHoSoKhach`); **Khách→Host** (`guiDanhGiaHostInline` + form Lịch Sử + tab "Đánh Giá Nhận Được" `#subtab-lich-su-danh-gia` + `_taiDanhGiaVeToi`/`_taiDaGuiDanhGia`/`_taiDanhGiaDaGui` + `guiDanhGiaHost`/`_taiDanhSachHostChoGuestDanhGia` + star system + review trong `moModalChiTietKeo`/`xemHoSoNguoiDang`/`xemHoSoCongKhai`); badge sao hồ sơ + `_taiDiemUyTin` (ung-dung); CSS review (`.ls-review-*`/`.kh-review-*`/`.review-author-link`/`#danhGiaContainer`/`.profile-rating`/`.review-card`); ranking `so_sao_tb` khôi phục.
- **KHÔNG SQL** (bảng `danh_gia_tin_dung` luôn còn nguyên). Bump `?v=20260613a`: giao-dien.css, khach-choi, host, ung-dung.

> **Đồng bộ K + căn giữa bảng + tên sân Lịch Sử** (verify `.devtest/verify-tables.js` = 9/9): (1) Modal "Xác Nhận Số Liệu & Chốt Ca" (`moModalXacNhanChotCa`): input tiền thuê sân + nước = **K đồng** (hiện /1000, `_recalcXacNhan`/`xacNhanVaChotCa` ×1000 khi tính/lưu); tổng vốn đã K. (2) **Căn GIỮA** mọi `<th>`+`<td>`: DS Khách (`#modal-guest-list-table th,td` center; Tên Khách center; `.gl-tt-wrap{justify-content:center}` + @≤600 align-items:center → cột Trạng Thái "Host từ chối" giữa tuyệt đối) + `.hs-table` (Doanh Thu — th/td + ô tiền `.ta-r` đều center, ĐẢO chuẩn kế toán cũ theo yêu cầu). (3) `.ls-card-name` (Lịch Sử Tham Gia) **bỏ max-width/ellipsis** → tên sân full 1 dòng. Bump `?v=20260612l` (giao-dien.css, components.css, host).

> **Form Chỉnh Sửa Ca (`_moModalSuaCa`/`_luuSuaCa`)**: (P1) đơn vị **K** cho chi phí thuê sân/khác + giá cầu (hiện /1000, lưu ×1000); (P2) tổng slot = Nam+Nữ **readonly tự tính** (`_mscTinhTongSlot`); (P3A) input **giờ** bắt đầu/kết thúc (TIME) → lưu + recompute `so_gio_choi` (xử qua đêm) + `chi_phi_san_co_dinh` (=gia×giờ×sân) + warning + TB **G6** đổi giờ cho khách đã đặt; (P3B) **ghi chú trình độ** Nam/Nữ tách từ `yeu_cau_trinh_do` JSONB (giữ cấp chuẩn + merge note, escape XSS); (P4) section `.msc-section-title` + label `.msc-field-label` 600. KHÔNG SQL (cột có sẵn). Verify `.devtest/verify-suaca.js` = 16/16. Bump `?v=20260612k` (giao-dien.css, host, thong-bao).

> **Ghi chú trình độ (free text) trong card**: `<em>`→`.kh-level-note` (1 dòng: nowrap+overflow:hidden+ellipsis, `flex:0 1 100%` chiếm dòng riêng, title=full, escape XSS `_escLsut`). Áp cả Nam+Nữ. **QUAN TRỌNG**: thêm `min-width:0` cả chuỗi flex (`.slot-card-body,.slot-level-badge-wrap,.slot-details-row,.slot-detail-item,.kh-trinh-do-row,.kh-trinh-do-line`) để truncate hoạt động (mặc định flex min-width:auto → note nowrap kéo card giãn 875px). Selector `.slot-card-body .kh-level-note` để thắng `.slot-card-body *{white-space:normal}`. Verify `.devtest/verify-notetrunc.js` = 7/7 (note h=15 1 dòng, sw=875→cw=262 ellipsis, card 595=595=595). Bump `?v=20260612j` (giao-dien.css, khach-choi).

> **Cột Trạng Thái DS Khách**: dropdown + nút "Từ chối" bọc `.gl-tt-wrap` (flex row, align-items:center, gap; @≤600 column stack căn trái). Cột widen `min-width:235px` (đủ 1 hàng desktop; rebalance Đặt/Hủy/Thanh Toán). Verify `.devtest/verify-ttcol.js` = 9/9. Bump `?v=20260612i` (giao-dien.css, phan-he-host.js).

### PHIÊN FIX TÍNH GIỜ CA QUA ĐÊM + LỌC DOANH THU MOBILE ✅ (verify `.devtest/verify-timecalc.js` = 8/8)
- **🔴 BUG TÍNH GIỜ (ca qua nửa đêm)**: ca 22:00–00:00, `gio_ket_thuc="00:00"` → 00:00 ĐẦU ngày (đã qua) → "Hết giờ" OAN. **SSOT mới** (bo-may §0B): `thoiDiemBatDauCa(ngay,bd)` + `thoiDiemKetThucCa(ngay,bd,kt)` — nếu `kt<=bd` → kết thúc thuộc NGÀY HÔM SAU (+1 ngày). `phaCaDau` refactor dùng helper. **MỌI nơi so giờ kết thúc PHẢI dùng `thoiDiemKetThucCa`**: host `_isExpiredCa` + badge 3 trạng thái (Sắp diễn ra/Đang diễn ra/Hết giờ qua `phaCaDau`) + `autoUpdateChoDao`(nhận TIMESTAMP, trước nhận "HH:MM"→Invalid→dead); khach auto-hide Tìm Kèo + đếm ca chưa kết thúc + Lịch Sử "Đã tham gia". Giờ "HH:MM" parse = LOCAL = GMT+7 (nhất quán Date.now, không lỗi UTC).
- **Lọc Doanh Thu mobile**: `.dt-filter-bar` > `.dt-filter-period` + `.dt-filter-range` + CSS responsive (@≤600: period full-width hàng 1; range [từ→đến + Lọc] full-width hàng 2; ẩn "hoặc"; date `flex:1`). PC 1 hàng.
- Bump `?v=20260612h`: giao-dien.css, bo-may, khach-choi, host (index) + bo-may (admin).

> Cọc-row trong card: ca cọc = banner vàng `.coc-banner--1l`; ca KHÔNG cọc = dòng `.coc-banner--free` "✓ Không yêu cầu cọc trước" (xanh nhạt #4ade80 opacity 0.7, cùng box→cân height). LUÔN render (bỏ gating anyCoc). Bump `?v=20260612g` (giao-dien.css, khach-choi). Verify `.devtest/verify-cardalign.js` = 8/8.

### PHIÊN FIX LAYOUT CARD CA ĐẤU ✅ (verify `.devtest/verify-cardalign.js` = 8/8, sạch)
- **Equal-height + gom gap**: bỏ `.slot-card-body{flex:1}` (gây gap giữa giá↔host). `.slot-host-banner, .slot-host-spacer { margin-top:auto }` → host+footer dính đáy, khoảng trắng gom 1 chỗ trên host. Card không host → `.slot-host-spacer`. Verify 3 card: height=554, footer=679, host=546 (đều).
- **Cọc giữ chỗ thông minh**: `anyCoc = results.some(yeu_cau_coc)` truyền vào `_taoCaCard(...,anyCoc)`. Chỉ khi CÓ ca cọc → card không cọc render `.coc-banner--empty` (visibility:hidden 1 dòng) → tên sân thẳng hàng (sanTop=332 đều). Không ca cọc → KHÔNG placeholder (không phí chỗ). Cọc banner rút 1 dòng `.coc-banner--1l` (nowrap+ellipsis, title=full).
- **Pills**: cap 4 + `.kh-level-more` "+N" → ca nhiều mức không cao hơn. Bump `?v=20260612f`: giao-dien.css, phan-he-khach-choi.js.

### PHIÊN FIX 4 VẤN ĐỀ ✅ (verify `.devtest/verify-fix4.js` = 18/18, console/network sạch)
- **P4 chuông F5**: `#tbChuong` LUÔN hiện sẵn (static, bỏ inline display:none; CSS `display:inline-flex`). JS `_hienChuong`=no-op, `_anChuong`=chỉ ẩn badge (không ẩn chuông). Khách chưa login bấm → điều hướng đăng nhập (`moDrawerThongBao` guard `_actor()`). 0ms, không layout shift.
- **P1 nút Hủy trong modal Chi Tiết** (`moModalChiTietKeo`): footer thêm `.btn-huy-slot-modal` (đỏ, ưu tiên — chỉ khi có slot active + ca chưa bắt đầu, kể cả full) → gọi CHUNG `huyDatSlot`. Guard chống hủy 2 lần: `huyDatSlot` đọc trạng thái thật, đã "Khách hủy"/"Host từ chối" → bỏ qua. Hủy xong → `dongModalChiTietKeo()` + refresh.
- **P2 card lệch**: equal-height `@media ≥601px` (stretch + flex column + body flex:1 + footer margin-top:auto). Pills cap 4 + badge `.kh-level-more` "+N" (bấm → Chi Tiết). 3 card cùng hàng = cùng height + footer thẳng hàng.
- **P3 tab Đánh giá nhận được**: dark theme (`#danhGiaContainer` card; `.kh-review-about` border-bottom; row sao+sân(cyan)+ngày / "Từ Host" `.review-author-link` accent+hover / nội dung) + responsive @390 + escape XSS (`_escLsut`). Link → `xemHoSoCongKhai` mở modal hồ sơ.
- Bump `?v=20260612e`: giao-dien.css, phan-he-khach-choi.js, phan-he-thong-bao.js.

### PHIÊN FIX LỊCH SỬ ĐIỂM — bug điểm/lịch sử hủy + UI redesign + 🔴 FIX _token nền ✅
> Verify `.devtest/verify-fix-lichsu.js` = 7/7 · `.devtest/verify-ui-lichsu.js` = 13/13 · regression Nhóm 3 13/13. Console/network sạch.
- **Bug hủy slot (PHẦN 1)**: `huyDatSlot` trừ điểm qua `_truDiemUyTin` (DB CÓ cập nhật) nhưng (a) KHÔNG `ghiLichSuUyTin` → lịch sử trống; (b) KHÔNG refresh thanh điểm → UI kẹt "96". Fix: thêm `ghiLichSuUyTin` + `_hienTrustScoreBar()` + `taiLichSuDiemUyTin()` sau hủy thành công.
- **🔴 FIX NỀN `_token` mất sau ĐĂNG NHẬP THẬT**: `_onDangNhapThanhCong` (phan-he-ung-dung.js) gán `currentGuest = user` (hồ sơ DB, KHÔNG `_token`) → ghi đè token mà `_luuSessionVaDangNhap` vừa set → guiThongBao + layLichSuUyTin + datSlot/huySlot bảo mật hỏng tới F5 (fallback REST cứu datSlot/huySlot; nhưng thông báo + lịch sử KHÔNG chạy sau login mới). Fix: hợp nhất giữ `_token`. **→ Sau login mới: thông báo + lịch sử điểm hoạt động ngay (không cần F5).**
- **UI Độ Uy Tín redesign (PHẦN 2)**: bỏ ✅ "Tốt" → pill `border-radius:999px` theo band (≥80 Uy tín cao xanh · 60–79 Bình thường cyan · 40–59 Cần cải thiện cam · <40 Hạn chế đỏ · khóa "🔒 Tạm khóa") cùng hàng số điểm; scale 0/40/60/80/100; `_renderTrustBar(el,score,isActive)`+`_trustBand()`. `_trustLevel` đồng bộ nhãn mới.
- **Lịch sử COLLAPSIBLE**: `#profileLichSuDiem`=`.lsut-card` + toggle "Xem/Ẩn" + chevron, mặc định ĐÓNG (max-height transition), tối đa 10 dòng + "Xem thêm (N)", lazy-load (`toggleLichSuDiem`/`_renderLsutBody`/`_lsutXemThem`). CSS collapsible+pill ở index.html inline.
- Bump `phan-he-khach-choi.js`+`phan-he-ung-dung.js`=`20260612d`.

### PHIÊN BUILD NHÓM 3 — KHÓA TRẠNG THÁI THEO GIỜ + TỪ CHỐI KHÁCH + LỊCH SỬ ĐIỂM ✅ LIVE
> SQL ĐÃ CHẠY: `migration-tu-choi-v1.sql` (verify, 0 schema change) + `migration-lich-su-uy-tin-v1.sql` (bảng `lich_su_uy_tin` + 3 RPC: `ghi_lich_su_uy_tin` no-token / `lay_lich_su_uy_tin` token / `get_lich_su_uy_tin_admin` authenticated). Token GHI = no-token v1 (chủ app chấp nhận; siết v2). **Verify `.devtest/verify-nhom3.js` = 13/13 PASS, console/network sạch.**
- **PHA ca = SSOT `window.phaCaDau(ca)`** (bo-may §0B): truoc/trong/sau (GMT+7, xử ca qua đêm; thiếu giờ → null=không khóa). Trạng thái value mới **"Host từ chối"** (TEXT tự do, KHÔNG SQL).
- **2A Khóa theo giờ**: `openGuestListModal` tính pha → lưu `modal._caInfo`/`dataset.pha` + banner `#gl-phase-banner` (truoc=xanh nhắc chỉ Từ chối / sau-chưa-chốt=vàng nhắc chốt). `_renderCustomDropdown(...,pha)`: pha "truoc" disable "Đã tham gia"/"Bùng kèo"/"Khách hủy". Guard 2 lớp `_triggerGlCdd` + `doiTrangThaiDiDanh` (đọc `_caInfo`, chặn nếu "truoc"). Timer `_glPhaseTimer` 60s tự refresh modal KHI pha đổi (không phá thao tác).
- **2B "Từ chối khách"** (`window.tuChoiKhach(slotId,caId,sdt,ten)`, host.js): chỉ pha "truoc" + "Chờ đánh" → nút cam `.gl-tu-choi-btn`. Set "Host từ chối"+huy_luc → giải phóng slot (loại khỏi đếm + `daTuChoiSet` badge "BỊ TỪ CHỐI" phía khách, chặn re-book) → TB **G4** (cam/TB) cho khách → phạt host (`_phatDiemHostTuChoi`) nếu <2h theo thang HOST_HUY + ghi lịch sử host. Guard `_tuChoiBusy`.
- **2C Lịch sử điểm**: `window.ghiLichSuUyTin({sdt,delta,lyDo,caId,tenSan,diemTruoc,diemSau})` + `window.layLichSuUyTin(n)` (phan-he-thong-bao.js). Hook trong `apDiemTheoTrangThai` (chỉ net≠0, ly_do tự suy, tra ca_id/ten_san từ slotId nếu thiếu) + `_phatDiemHostTuChoi`.
- **2D UI**: Hồ Sơ khách — card "Lịch Sử Điểm Uy Tín" (`#lichSuDiemBody`, `taiLichSuDiemUyTin` auto-load + nút Tải lại, timeline `.lsut-*` escHTML). Admin — section "📜 Lịch Sử Điểm Uy Tín" trong modal quản lý user (`_xemLichSuDiemAdmin` → RPC `get_lich_su_uy_tin_admin` qua `_sbClient` authenticated, render inline-style vì admin KHÔNG nạp giao-dien.css).
- **PHẦN 0 (trước đó cùng phiên)**: drawer thông báo BỎ emoji → left-border accent theo mức độ (Cao đỏ/TB cam/Thấp xanh) + chấm `.tb-cat-dot` + chấm xanh chưa đọc + read opacity 0.72.

### PHIÊN BUILD NHÓM 3 — PHẦN 0 (icon thông báo) ✅ + PHẦN 1 (SQL chờ duyệt)
- **P0 — Drawer thông báo BỎ emoji/icon → LEFT-BORDER ACCENT theo mức độ** (verify `.devtest/verify-p0icon.js` = 7/7 PASS, console/network sạch): `_META` (phan-he-thong-bao.js) chỉ còn `{mau}`; `_render` bỏ `.tb-item-icon`, set `border-left-color` inline + chấm `.tb-cat-dot` 8px cùng màu. Màu: **Cao đỏ #ff4444** (G2/G3/H3b/S1) · **TB cam #ff8800** (H2) · **Thấp xanh #00ff88** (G1/H1). Chưa đọc: `.tb-dot` xanh góc trái + nền nhạt + opacity 1; đã đọc: opacity 0.72. Empty/loading bỏ emoji. CSS `.tb-item` (giao-dien.css). Bump `giao-dien.css`+`phan-he-thong-bao.js`=`20260612b`.
- **P1 — 2 file SQL ĐÃ SOẠN, 🔴 CHỜ DUYỆT (chưa chạy)**:
  - `migration-tu-choi-v1.sql` — 3A KHÔNG cần thay schema (trang_thai_di_danh TEXT tự do → status mới "Host từ chối"; gio_bat_dau/gio_ket_thuc/huy_luc có sẵn). Chứa RPC `get_slot_time()` TUỲ CHỌN + VERIFY chốt giả định.
  - `migration-lich-su-uy-tin-v1.sql` — bảng `lich_su_uy_tin`(id,sdt,delta,ly_do,ca_id,ten_san,diem_truoc,diem_sau,created_at) + index (sdt,created_at DESC) + RLS khóa anon + RPC `ghi_lich_su_uy_tin`(trusted no-token), `lay_lich_su_uy_tin`(token-verified), `get_lich_su_uy_tin_admin`(authenticated/admin) + VERIFY.
- **P2+P3 (khóa trạng thái theo phase giờ + "Từ chối khách" + hook lịch sử điểm + UI tab Lịch sử + admin view + Playwright) = CHƯA BUILD** — chờ SQL được duyệt + chạy.

### PHIÊN FIX THEO ƯU TIÊN — NHÓM 1+2 ✅ (verify `.devtest/verify-prio1.js` = 15/15 PASS, console/network sạch)
- **1A — "undefined" sau đổi trạng thái**: gốc = `.then()` của `_triggerGlCdd` (host) dùng mảng `_opts` THIẾU field `label` → `cur.label`=undefined → badge ghi "undefined", phải F5. Fix: ghi `${cur.icon}${cur.val}` (nhãn luôn = val). Badge cập nhật NGAY, không F5.
- **1B — Visual cue element bấm được** (giao-dien.css): `.gl-cdd>button[data-guest-id]` + `.gl-coc-badge` → hover glow accent (`box-shadow`+`filter:brightness`), `:active scale(0.97)`, ripple `::after` radial (tắt qua `prefers-reduced-motion`). Dùng box-shadow/filter/transform (KHÔNG bị inline-style ghi đè, không `!important`). Thêm hint `.coc-hint ✏️` cạnh badge "Chưa cọc" (ẩn khi "✓ Đã cọc") qua helper `_cocNhanHTML(da)` (host).
- **1C — UI Thông báo** (phan-he-thong-bao.js `_META`): G2 `🗑️`→`❌`, H3b `🚫`→`👻`. CSS `.tb-item` chuyển card→list: divider 1px `rgba(30,58,95,.55)` giữa item + padding 15/16 thở + dải nhấn trái `border-left 3px` cho unread; `.tb-drawer-body` padding 0. Screenshot `tb-drawer-1440.png`/`tb-drawer-390.png`; chuông @390 trong viewport OK.
- **2A — Xác nhận 1 lần trước `doiTrangThaiDiDanh`**: `window.xacNhanModal(msg,icon,opts)` mở rộng nhãn nút tuỳ chỉnh (`opts.ok`/`opts.cancel`), KHÔI PHỤC mặc định "Xác nhận"/"Huỷ" khi đóng → backward compat mọi caller cũ. `_triggerGlCdd` (giờ `async`): hỏi xác nhận khi đổi sang "Đã tham gia" (nút "Xác nhận — không sửa lại được"/"Hủy bỏ", nội dung theo trạng thái đích) / "Bùng kèo" (cảnh báo trừ điểm); "Chờ đánh" + "Khách hủy" KHÔNG hỏi. Hủy → giữ nguyên dropdown.

### PHIÊN THIẾT KẾ NHÓM 3 — 📋 CHỜ DUYỆT (KHÔNG CODE) → `docs/THIET-KE-NHOM3.md`
- **3A** Khóa trạng thái theo 3 pha giờ ca (trước/trong/sau) + "Từ chối khách" (nút riêng, slot giải phóng, không trừ khách, trừ host <4h theo HOST_HUY). **0 SQL** (`trang_thai_di_danh` là TEXT tự do → status mới "Host từ chối"; cột giờ có sẵn). Cần chốt: status mới hay tái dùng "Khách hủy"; cho đặt lại ca bị từ chối?; phạt host <4h.
- **3B** Bảng `lich_su_uy_tin` + 2–3 RPC (1 file SQL) + hook vào SSOT `apDiemTheoTrangThai` + tab "Lịch Sử Điểm" (Hồ sơ) + admin view. Cần chốt: thêm bảng+RPC?; admin xem qua JWT policy hay RPC riêng?
- ⛔ DỪNG — chờ chủ app duyệt từng câu hỏi trước khi build.

### PHIÊN REDESIGN ĐIỂM UY TÍN — STATE-BASED DELTA (thay event-based) ✅
- **Vấn đề gốc**: hệ cũ cộng/trừ điểm theo SỰ KIỆN (mỗi lần gọi hàm = 1 lần đổi điểm) → đổi trạng thái qua lại tích lũy sai.
- **`window.apDiemTheoTrangThai(sdt, oldState, newState, slotId, ctx)` (phan-he-khach-choi.js)** = NGUỒN DUY NHẤT xử lý điểm khi host đổi trạng thái. Nguyên tắc: `diem_uy_tin += (deltaMới − deltaCũ)` → tự undo trạng thái cũ + áp mới, KHÔNG cộng dồn. **Bảng delta**: Chờ đánh=0 · Đã tham gia=+2 · Bùng kèo=−10(lần1)/−20(lần2)/0+khóa(lần≥3) · Khách hủy=thang giờ (chỉ khi truyền `ctx.phut`; host-set dropdown=0). Đếm lần bùng = số slot KHÁC đang "Bùng kèo" (rolling 30 ngày)+1. `so_ca_thanh_cong`: +1 vào Tham gia / −1 rời (net, clamp≥0). Khóa 1 CHIỀU (admin mở). Toast điểm + thông báo G1/G3/H3b/S1 đều phát tại đây.
- **`oldState` đọc từ DB THẬT** trong `doiTrangThaiDiDanh` (server-authoritative, không tin DOM/dataset). `xacNhanThamGia` (checkbox) cũng gọi apDiem (cả 2 chiều). `xuLyBungKeo` giờ là **wrapper** (đọc oldState + ghi "Bùng kèo" nếu ghiStatus + gọi apDiem) → giữ `baoCaoGhost` hoạt động.
- **Verify** `.devtest/verify-statebased.js` = **4/4 PASS**, console/network sạch: T1 Chờ→Tham→Bùng→Tham→Bùng(80)→70; T2 Bùng→Tham×5(80)→70; T3 bùng 3 slot khác nhau(100)→70+KHÓA; T4 bùng→tham→bùng cùng slot(80)→70 KHÔNG khóa.
- **SQL `da_dem_bung`**: KHÔNG cần cho 4 test. Soạn `migration-bung-flag-v1.sql` (🟡 tùy chọn, chờ duyệt) CHỈ cho edge hiếm: bùng A→đổi A đi→bùng B thì B nên là lần 2 (đếm bền vững "đã bùng là đã bùng"). Hiện đếm theo trạng thái "Bùng kèo" hiện tại.
- **Giới hạn clamp**: nếu điểm sát trần 100, toggle qua trạng thái +2 có thể bị kẹp mất ≤2đ (vd start 100 thay vì 80). Không ảnh hưởng test (start 80). Bump `?v=20260611i` (khach-choi, host).

### PHIÊN FIX 3 BUG KHẨN + UI CHUÔNG (sau PHIÊN THÔNG BÁO v1) ✅
- **Bug 1 — Trừ điểm CỘNG DỒN khi đổi trạng thái qua lại (NGHIÊM TRỌNG)**: gốc = `doiTrangThaiDiDanh` đọc `dataset.prev` nhưng dropdown custom (`_triggerGlCdd`) truyền proxy chỉ có `data-current` → `prevVal` luôn = giá trị mới → nhánh "Bùng kèo" gọi `xuLyBungKeo` mỗi lần, không chặn. **Fix (KHÔNG SQL — đã chốt)**: gate theo TRẠNG THÁI CŨ. (1) `xuLyBungKeo` nhận `opts.ttCu`; nếu null đọc DB (cho baoCaoGhost path ghiStatus=true); **chỉ trừ điểm khi trạng thái cũ = "Chờ đánh"** (cũ≠Chờ đánh → return sớm, không đếm/trừ). (2) `doiTrangThaiDiDanh` lấy `_ttCu = dataset.current`, truyền vào xuLyBungKeo; **+2 chỉ khi `_ttCu==="Chờ đánh"`**. (3) `xacNhanThamGia` (checkbox legacy) đọc trạng thái cũ trước khi ghi, +2 chỉ khi cũ="Chờ đánh". `bulkDoiTrangThai`/`autoUpdateChoDao` chỉ ghi status (không điểm) → an toàn. Verify: Bùng↔Tham gia 5 lần → điểm đổi đúng 1 lần (100→90); +2 đúng 1 lần (80→82). *(Residual edge hiếm: Tham gia→Chờ đánh→Tham gia có thể +2 lại — cần cột `da_xu_ly_diem` mới bulletproof; chủ app chọn KHÔNG thêm SQL.)*
- **Bug 2 — UI chuông chìm + mobile**: `.tb-chuong` đổi `color:#cbd5e1`→**`#00ff88` (accent)** + bg/border đậm hơn + glow + hover mạnh; thêm biến thể `[data-theme="light"]` (xanh đậm #00965a). Mobile @390: chuông HIỆN trong viewport (cạnh login + hamburger) — verify + screenshot `bell-390.png`/`bell-1440.png`.
- **Bug 3A — Host sửa được slot khách đã tự hủy**: `_renderCustomDropdown` cố ý cho đổi cả "Khách hủy". **Fix**: nếu `trangThai==="Khách hủy"` → render BADGE KHÓA tĩnh (không dropdown) + tooltip "Khách đã tự hủy slot này"; thêm guard trong `_triggerGlCdd` chặn đổi từ "Khách hủy".
- **Bug 3B — Lệch trạng thái card khách**: `daDatSet` loại "Khách hủy" → card hiện nút "ĐẶT SLOT" nhưng `datSlot` chặn re-book → lệch. **Fix (chủ app chốt: KHÔNG cho đặt lại)**: thêm `daHuySet` (ca khách đã tự hủy) → card + modal chi tiết hiện badge **"ĐÃ HỦY"** (`.btn-da-huy`, disabled, đỏ) thay nút Đặt. Verify Playwright **6/6 PASS**, console/network sạch. Bump `?v=20260611h` (giao-dien.css, khach-choi, host).

### PHIÊN THÔNG BÁO v1 — HỆ THỐNG THÔNG BÁO (polling 30s, 7 sự kiện) ✅ LIVE
- **SQL `migration-thong-bao-v1.sql` ĐÃ CHẠY**: bảng `thong_bao` (id, `nguoi_nhan TEXT`=SĐT, loai, tieu_de, noi_dung, `link_data jsonb`, da_doc, created_at) + 2 index + RLS **khóa anon trực tiếp**. 5 RPC SECURITY DEFINER tự verify token với `guest_sessions` (KHÔNG phụ thuộc `verify_guest_token`; verify đọc KHÔNG check is_active → user khóa vẫn đọc S1): `ghi_thong_bao`(trusted insert, bắt token người gửi, gộp chống spam), `lay_thong_bao`(delta+lọc 30 ngày), `dem_thong_bao_chua_doc`, `danh_dau_da_doc`, `danh_dau_tat_ca_da_doc`.
- **Định danh = SĐT (TEXT)** vì khách+host đăng nhập bằng SĐT + UUID session-token (`guest_sessions`), KHÔNG có `auth.uid()` (chỉ Admin có). → `nguoi_nhan` lưu SĐT.
- **`phan-he-thong-bao.js` (MỚI)**: tự khởi tạo `_sbClient`; poll 30s khi tab visible (ẩn→ngưng); badge số chưa đọc; drawer phải (chuông trong header `#tbChuong`); click thông báo→điều hướng (`chuyenTab` tim-keo/lich-su · `openGuestListModal` cho host) + đánh dấu đọc; "Tất cả đã đọc"; escHTML mọi nội dung. **`window.guiThongBao({nguoiNhan,loai,tieuDe,noiDung,linkData,gopGiay})`** = helper phát (best-effort, fire-and-forget, token+SĐT actor lấy tự động từ `currentGuest`). Lifecycle: `khoiDongThongBao()` (trong `_hienThiDashboardKhach`), `dungThongBao()` (trong `dangXuatKhach`).
- **7 điểm phát** (`window.guiThongBao`): G1 (xacNhanThamGia + doiTrangThaiDiDanh "Đã tham gia"→khách), G2 (xoaCaDau→tất cả khách đã đặt, "tìm kèo khác"), G3 (doiTrangThaiDiDanh "Khách hủy" + xuLyBungKeo→khách), H1 (datSlot→host, gộp `gop_key=H1:caId`/60s), H2 (huyDatSlot→host, gộp 60s), H3b (xuLyBungKeo→host), S1 (xuLyBungKeo lần 3/điểm<40 + _truDiemUyTin khi CHẠM mốc khóa→người bị khóa). **Chống spam**: gộp H1/H2 cùng ca trong 60s (1 dòng, update nội dung).
- **Bảo mật**: anon KHÔNG đọc/ghi bảng `thong_bao` trực tiếp qua REST (verify live: GET trả `[]`). Caveat v1: `ghi_thong_bao` cấp anon → user đã đăng nhập CÓ THỂ giả thông báo (cùng mức rủi ro app hiện tại); siết triệt để = dời điểm phát vào action-RPC (v2/lộ trình bảo mật).
- **Verify** `.devtest/verify-thongbao.js` = **13/13 PASS**, console/network SẠCH: H1 end-to-end qua datSlot thật; badge/drawer/mark-read UI; 7 loại round-trip + render icon; gộp 60s→1 dòng; RLS chặn anon; mark-all→unread=0.
- **Admin broadcast = v2** (KHÔNG build phiên này). CHƯA build: G4/G5/G6/H4/H5/S2/S3/S4 (nhắc 2h, chấm điểm, điểm đổi, ca đầy, broadcast...).

### PHIÊN E — CỌC DS KHÁCH + THIẾT KẾ THÔNG BÁO + CHUẨN HÓA BẢNG
- **Cọc DS Khách (localStorage, KHÔNG SQL)**: cột "Cọc" cuối DS Khách (chỉ ca `yeu_cau_coc`) badge "Chưa cọc"→"✓ Đã cọc"; persist `localStorage tvl_coc_status` per-slot; tóm tắt X/Y ở DS Khách + Chi Tiết ca; khách: nhắc tĩnh `.ls-coc-reminder` trong Lịch Sử. Helper `_daCoc/_toggleCoc/_syncCocColumn` (host). Cột thêm ở CUỐI → không đụng `cells[7]/[9]`. Verify 10/10. *(Giới hạn: mark host ở LS host, khách không đọc được → nhắc tĩnh; muốn đồng bộ cần field DB.)*
- **Thiết kế THÔNG BÁO**: `docs/THIET-KE-THONG-BAO.md` → **ĐÃ BUILD ở PHIÊN THÔNG BÁO v1** (xem mục đầu CURRENT STATE): polling 30s + bảng `thong_bao` + drawer chuông; 7 sự kiện G1/G2/G3/H1/H2/H3b/S1.
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
| `bo-may-du-lieu.js` | v3.2 | + **SSOT `kiemTraTenHopLe(raw)`** (validate tên chặt: ký tự đặc biệt/khoảng trắng/độ dài 5-35/2-5 từ/từ cấm 3 bước whitelist-bỏ-dấu-whole-word/spam) + `_boDauTen`. SSOT TRINH_DO_LIST (12 mức) + `_renderTrinhDoUI()` |
| `phan-he-ung-dung.js` | v3.4 | + **CƯỠNG CHẾ ĐỔI TÊN**: `quetTenViPham` + modal vi phạm (font system-ui, nút "Bỏ qua 2h"=`_boQuaTen2h` localStorage `tvl_ten_snooze_*`) + lock 24h `is_active` + timestamp DB `ten_canh_bao_luc` (fallback localStorage, cờ `_tenColOK`). `luuProfile` validate tên. profile normalize `chuanHoaTrinhDo` |
| `phan-he-host.js` | v9.9 | + **STATE-BASED**: doiTrangThaiDiDanh đọc oldState từ DB thật → gọi `apDiemTheoTrangThai`; xacNhanThamGia gọi apDiem (cả 2 chiều); bỏ logic +2/xuLyBungKeo cũ. Trước: Bug3A dropdown khóa Khách hủy |
| `phan-he-khach-choi.js` | v9.8 | + **`hoanTatDangKy` validate tên** (`kiemTraTenHopLe`) + hook `quetTenViPham` (open web/F5); menu Share full thông tin; STATE-BASED `apDiemTheoTrangThai` (delta net, đếm bùng, khóa); `xuLyBungKeo`→wrapper |
| `phan-he-thong-bao.js` | v1.0 (MỚI) | Hệ thống thông báo polling 30s. Tự `_sbClient`; chuông+badge+drawer; `guiThongBao()` helper phát; 5 RPC token-verified; escHTML; điều hướng click |
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
6. **HOST XÓA CA** (PHIÊN 2026-06-19 — host không xóa được ca cho tới khi chạy): `migration-xoa-ca-dau-v1.sql` — tạo RPC `guest_xoa_ca_dau` SECURITY DEFINER (token-verified + so khớp `sdt_nguoi_tao` + dọn `dat_slot` con rồi xóa `ca_dau`) + GRANT anon. KHÔNG thêm bảng/cột.

### Known issues
- Checkbox "Thanh Toán" fail → cần chạy migration-dat-slot-v2.sql
- Admin xóa user → F5 vẫn thấy dashboard nếu chưa chạy migration-admin-cascade.sql
- Góp ý admin tab không hiện data cho đến khi chạy SQL gop_y fix
- Tạm Khóa ca đấu không hoạt động cho đến khi chạy SQL ALTER TABLE is_tam_khoa
- xoaCaDau: ĐÃ FIX (PHIÊN 2026-06-19) — gọi RPC `guest_xoa_ca_dau` (token-verified, SECURITY DEFINER bỏ qua RLS). 🔴 CẦN CHẠY `migration-xoa-ca-dau-v1.sql` để host xóa được thật (trước khi chạy: fallback REST vẫn fail anon → hiện message hướng dẫn chạy SQL).
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
