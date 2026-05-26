/* =========================================================================
 * 🏸 PHÂN HỆ KHÁCH CHƠI VÃNG LAI - PHAN-HE-KHACH-CHOI.JS (v4.0)
 * Dự án: TUYENVANGLAI.IO.VN
 *
 * v4.0 (Phiên 4 — 2026-05-24):
 *   - MODULE 2: 1-Click Auth thay thế đăng nhập không mật khẩu cũ
 *       + SHA-256 hash phía client (Web Crypto API)
 *       + Form phân bước: SĐT+Pass+GT → slide-down thông tin bổ sung
 *       + Kịch bản A: đăng nhập (SĐT tồn tại) — Kịch bản B: đăng ký (SĐT mới)
 *       + Edge case: user cũ chưa có hash → modal đặt pass lần đầu
 *   - MODULE 3: Telegram integration (frontend polling) + Quên mật khẩu
 *   - MODULE 4: Host Upgrade — kích hoạt Key Host từ trang Profile
 *   - Đổi tên bảng: nguoi_dung (từ khach_vang_lai)
 *   - Fix bug: dat_slot.gioi_tinh lấy từ currentGuest thay vì hardcode "male"
 *   - Tất cả validate input dùng window.VALIDATE từ bo-may-du-lieu.js
 *
 * v3.0: GĐ3A modal, GĐ3B huỷ slot, GĐ3C lịch sử chi tiêu, GĐ3D đánh giá
 * v2.0: Đồng bộ field mapping Supabase (nguoi_dung / ca_dau / dat_slot)
 * =========================================================================
 */

(function () {
    // ── Trạng thái toàn cục ──
    window.currentGuest = null;
    let _guestRatingVal = 5;
    let _filterTimeout  = null;
    let _pendingCaId    = null; // ID ca đấu chờ mở modal sau khi đăng nhập (từ share link ?ca=)
    // Tên bảng người dùng đang dùng — tự động detect khi đăng nhập/đăng ký
    // Mặc định "nguoi_dung" (sau migration), fallback "khach_vang_lai" (trước migration)
    let _bangND = "nguoi_dung";

    /* ═══════════════════════════════════════════════════
     * 1. KHỞI TẠO TRANG KHÁCH
     * ═══════════════════════════════════════════════════ */
    window.khoiTaoTrangKhach = function () {
        // Ẩn nút TÌM KÈO NGAY khi đang ở tab Kèo mặc định (mobile)
        if (window.innerWidth < 768) {
            const btnTK = document.getElementById("btnTimKeoMobile");
            if (btnTK) btnTK.classList.add("hidden-by-tab");
        }

        const saved = localStorage.getItem("tvl_guest");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Kiểm tra hạn session — tự đăng xuất nếu quá hạn
                if (parsed._expires_at && Date.now() > parsed._expires_at) {
                    localStorage.removeItem("tvl_guest");
                    window.currentGuest = null;
                    _hienManDangNhap();
                } else {
                    window.currentGuest = parsed;
                    _hienThiDashboardKhach();
                }
            } catch {
                window.currentGuest = null;
                _hienManDangNhap();
            }
        } else {
            _hienManDangNhap();
        }
        _napDropdownBoLoc();
        window.timKiemCaDau();
        _initStarGuest();
    };

    function _hienManDangNhap() {
        const auth    = document.getElementById("guestAuthPanel");
        const profile = document.getElementById("guestProfileBlock");
        if (auth)    auth.style.display    = "block";
        if (profile) profile.style.display = "none";
        // Ẩn khu vực Lịch Sử Đấu
        const lichSuSection = document.getElementById("lichSuDauSection");
        if (lichSuSection) lichSuSection.classList.add("lich-su-hidden");

        /* ── FIX-LOGOUT: Trên mobile, #guestAuthPanel nằm bên trong #login-sheet
           (position:fixed, đang ẩn ngoài màn hình). Cần chuyển sang tab Cá Nhân
           và tự động mở bottom sheet để user thấy form đăng nhập/đăng ký.
           Trên desktop: #login-sheet là position:static nên hiện bình thường. ── */
        if (window.innerWidth < 768) {
            // Reset tab về Cá Nhân
            const sidebar = document.querySelector(".kh-sidebar");
            const right   = document.querySelector(".kh-right");
            const btnKeo  = document.getElementById("tabTimKeo");
            const btnP    = document.getElementById("tabCaNhan");
            const btnLs   = document.getElementById("tabLichSu");
            if (sidebar) sidebar.style.display = "flex";
            if (right)   right.style.display   = "none";
            if (lichSuSection) lichSuSection.classList.add("lich-su-hidden");
            [btnKeo, btnP, btnLs].forEach(b => b?.classList.remove("kh-tab-active"));
            btnP?.classList.add("kh-tab-active");
            // Mở login sheet để user thấy form đăng nhập
            setTimeout(() => window.openLoginSheet?.(), 50); // Timeout nhỏ để DOM update trước
        }
    }

    function _hienThiDashboardKhach() {
        // Đóng bottom sheet login nếu đang mở (tránh khung trắng trống còn hiện sau đăng nhập)
        window.closeLoginSheet?.();

        const auth    = document.getElementById("guestAuthPanel");
        const profile = document.getElementById("guestProfileBlock");
        if (auth)    auth.style.display    = "none";
        if (profile) profile.style.display = "block";

        const g = window.currentGuest;
        if (!g) return;

        const nameEl  = document.getElementById("profileGuestName");
        const phoneEl = document.getElementById("profileGuestPhone");
        const dateEl  = document.getElementById("profileGuestDate");
        if (nameEl)  nameEl.textContent  = g.ten_khach || "Lông thủ ẩn danh";
        if (phoneEl) phoneEl.textContent = `SĐT: ${g.sdt_khach || "--"}`;
        if (dateEl) {
            const joined = g.ngay_tham_gia ? new Date(g.ngay_tham_gia).toLocaleDateString("vi-VN") : "--";
            dateEl.textContent = `Gia nhập: ${joined}`;
        }

        // MODULE 4: Routing theo vai_tro
        const isHost = g.vai_tro === "host";
        // FIX 11: dùng btnNangCapHostHint (nút ? nhỏ) thay vì sectionNangCapHost (card to)
        const hintBtn      = document.getElementById("btnNangCapHostHint");
        const sectionGuest = document.getElementById("sectionNangCapHost"); // giữ backward compat
        const sectionHost  = document.getElementById("sectionHostDaKichHoat");
        const keyDisplay   = document.getElementById("profileHostKey");

        if (isHost) {
            // Đã là Host → ẩn hint, ẩn card nâng cấp, hiện badge host
            if (hintBtn)      hintBtn.style.display      = "none";
            if (sectionGuest) sectionGuest.style.display = "none";
            if (sectionHost)  sectionHost.style.display  = "flex";
            // Hiện key + tải hạn sử dụng từ DB
            _capNhatUIHostDaKichHoat(g.ma_key_host || "");
        } else {
            // Còn là guest → hiện nút hint ?, ẩn badge host
            if (hintBtn)      hintBtn.style.display      = "flex";
            if (sectionGuest) sectionGuest.style.display = "none"; // card to đã xóa khỏi HTML
            if (sectionHost)  sectionHost.style.display  = "none";
        }

        // FEAT-1: Tích vàng xác minh Host — hiện kế bên tên
        const hostBadgeEl = document.getElementById("profileHostBadge");
        if (hostBadgeEl) hostBadgeEl.style.display = isHost ? "inline-flex" : "none";

        // 2F: Auto-fill ngày mặc định sau khi đăng nhập
        _dinhNgayMacDinh();

        _taiThongKeKhach();
        _taiDanhGiaVeToi();    // Đánh giá về tôi (HostToGuest) — cập nhật ngay khi mở tab Cá Nhân
        _taiDaGuiDanhGia();    // Đánh giá tôi đã gửi (GuestToHost)

        // Ẩn #lichSuDauSection — Desktop: modal overlay; Mobile: tab điều khiển
        const lichSuSection = document.getElementById("lichSuDauSection");
        if (lichSuSection) lichSuSection.classList.add("lich-su-hidden");
        document.body.style.overflow = "";
    }

    /**
     * 2F — Tự động điền ngày mặc định vào các ô date khi dashboard mở.
     * statsDateFrom = đầu tháng hiện tại, statsDateTo = hôm nay, filterDate = hôm nay
     */
    function _dinhNgayMacDinh() {
        const homNay = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
        const dauThang = homNay.substring(0, 7) + "-01";       // "YYYY-MM-01"

        const fromEl   = document.getElementById("statsDateFrom");
        const toEl     = document.getElementById("statsDateTo");

        if (fromEl && !fromEl.value) fromEl.value = dauThang;
        if (toEl   && !toEl.value)   toEl.value   = homNay;
        // filterDate: để trống mặc định — không auto-fill
    }

    /* ═══════════════════════════════════════════════════
     * 2. 1-CLICK AUTH — MODULE 2 (Phiên 4)
     *    Form phân bước: SĐT + Pass + GT → Đăng nhập / Đăng ký
     * ═══════════════════════════════════════════════════ */

    /**
     * SHA-256 hash phía client dùng Web Crypto API (không cần thư viện bên ngoài).
     * Salt tĩnh "tvl_pepper_2026" — thay bằng giá trị thực trước production.
     */
    async function _hashMatKhau(pass) {
        const data = new TextEncoder().encode(pass + "tvl_pepper_2026");
        const buf  = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    /**
     * Lưu session và chuyển sang dashboard.
     * localStorage lưu toàn bộ thông tin cần thiết cho routing.
     */
    function _luuSessionVaDangNhap(user) {
        window.currentGuest = user;

        // Đọc tuỳ chọn "Lưu trạng thái đăng nhập"
        const luuLau = document.getElementById("chkLuuDangNhap")?.checked ?? false;
        const ngayMs = luuLau ? 7 : 1; // 7 ngày hoặc 1 ngày
        const expiresAt = Date.now() + ngayMs * 24 * 60 * 60 * 1000;

        // Lưu đủ field để host routing và display hoạt động không cần fetch lại
        localStorage.setItem("tvl_guest", JSON.stringify({
            ten_khach:      user.ten_khach || "",
            sdt_khach:      user.sdt_khach || "",
            gioi_tinh:      user.gioi_tinh || "male",
            vai_tro:        user.vai_tro || "guest",
            ma_key_host:    user.ma_key_host || null,
            telegram_id:    user.telegram_id || null,
            ngay_tham_gia:  user.ngay_tham_gia || null,
            _expires_at:    expiresAt   // timestamp hết hạn (ms)
        }));
        const ten = user.ten_khach || "Lông thủ";
        const label = luuLau ? "Đã lưu 7 ngày" : "Phiên 1 ngày";
        window.hienToast(`🏸 Chào ${ten}!`, `Đã vào sàn vãng lai. ${label}.`, "success");
        _hienThiDashboardKhach();

        // Nếu có share link đang chờ → mở lại modal chi tiết ca đấu đó
        if (_pendingCaId) {
            const caId = _pendingCaId;
            _pendingCaId = null;
            setTimeout(() => {
                window.closeLoginSheet?.();
                window.moModalChiTietKeo(caId);
            }, 400);
        }
    }

    /**
     * Hiện modal đặt mật khẩu lần đầu cho user cũ (chưa có mat_khau_hash).
     */
    function _hienModalDatPassLanDau(phone, pass, user) {
        const existingModal = document.getElementById("modalDatPassLanDau");
        if (existingModal) existingModal.remove();

        const modal = document.createElement("div");
        modal.id = "modalDatPassLanDau";
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
        modal.innerHTML = `
            <div style="background:#1a2844;border:1px solid #00ff88;border-radius:16px;padding:28px 24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
                <h3 style="color:#00ff88;margin:0 0 10px;font-size:1.15rem;">🔑 Lần đầu dùng hệ thống mới</h3>
                <p style="color:#9ca3af;font-size:0.9rem;margin:0 0 20px;line-height:1.5;">
                    Tài khoản <strong style="color:#e2e8f0;">${phone}</strong> đã tồn tại nhưng chưa có mật khẩu.<br>
                    Mật khẩu bạn vừa nhập sẽ được đặt cho tài khoản này.
                </p>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button id="btnXacNhanDatPass" style="flex:1;min-width:140px;padding:10px;background:#00ff88;color:#0a1628;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.95rem;">
                        ✅ Xác nhận đặt mật khẩu
                    </button>
                    <button onclick="document.getElementById('modalDatPassLanDau').remove()" style="padding:10px 16px;background:transparent;color:#9ca3af;border:1px solid #374151;border-radius:8px;cursor:pointer;">
                        Hủy
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        document.getElementById("btnXacNhanDatPass").addEventListener("click", async () => {
            try {
                const hash = await _hashMatKhau(pass);
                await window.dbEngine.ghi("nguoi_dung",
                    { mat_khau_hash: hash, gioi_tinh: user.gioi_tinh || "male" },
                    { sdt_khach: phone }
                );
                modal.remove();
                const updatedUser = { ...user, mat_khau_hash: hash };
                _luuSessionVaDangNhap(updatedUser);
            } catch (e) {
                window.hienToast("Lỗi", "Không thể đặt mật khẩu. Thử lại sau.", "danger");
            }
        });
    }

    /**
     * Mở rộng form phụ đăng ký (slide-down) khi SĐT chưa tồn tại.
     */
    function _xoFormPhu(phone, pass, gender) {
        const extraFields = document.getElementById("authExtraFields");
        if (!extraFields) return;
        // Lưu tạm giá trị để dùng khi submit
        extraFields.dataset.phone  = phone;
        extraFields.dataset.pass   = pass;
        extraFields.dataset.gender = gender;
        extraFields.classList.add("is-open");
        // Cuộn xuống để thấy form phụ
        extraFields.scrollIntoView({ behavior: "smooth", block: "start" });

        // Cập nhật label nút chính
        const btnMain = document.getElementById("btnXacNhan");
        if (btnMain) btnMain.textContent = "→ Xem thêm thông tin bổ sung...";
    }

    /**
     * Hàm chính — gọi khi bấm "XÁC NHẬN" (Bước 1).
     */
    window.xacThucNguoiDung = async function () {
        const phone  = (document.getElementById("inputPhone")?.value || "").replace(/\D/g, "");
        const pass   = document.getElementById("inputPass")?.value || "";
        const gender = document.querySelector('input[name="gioiTinh"]:checked')?.value || "male";

        // Validate đầu vào bước 1
        if (!window.VALIDATE.sdt(phone)) {
            window.hienToast("SĐT không hợp lệ", "Nhập đúng 10 số, đầu 03/05/07/08/09.", "danger"); return;
        }
        if (!window.VALIDATE.pass(pass)) {
            window.hienToast("Mật khẩu quá ngắn", "Tối thiểu 6 ký tự.", "danger"); return;
        }

        const btn = document.getElementById("btnXacNhan");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...'; }

        try {
            // Bước 1: Thử bảng "nguoi_dung" (schema mới — sau migration)
            // Dùng docThu() để im lặng nếu bảng chưa tồn tại (không hiện toast lỗi)
            let users = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: phone } });

            if (users === null) {
                // Bảng "nguoi_dung" chưa tồn tại → fallback sang "khach_vang_lai" (schema cũ)
                console.info("[Auth] Bảng nguoi_dung chưa có → dùng khach_vang_lai (migration chưa chạy)");
                _bangND = "khach_vang_lai";
                users = await window.dbEngine.doc("khach_vang_lai", { eq: { sdt_khach: phone } });
            } else {
                _bangND = "nguoi_dung";
            }

            const user = users[0] || null;

            if (user) {
                // ── 5B: Kiểm tra tài khoản bị khóa (dùng is_active — cột mới) ──
                if (user.is_active === false) {
                    window.hienToast(
                        "Tài khoản bị khóa",
                        "Tài khoản của bạn đã bị Admin tạm khóa. Liên hệ Admin để biết thêm.",
                        "danger"
                    );
                    return;
                }

                // ── KỊCH BẢN A: SĐT ĐÃ TỒN TẠI → ĐĂNG NHẬP ──
                if (!user.mat_khau_hash) {
                    // Edge case: user cũ chưa có mật khẩu → modal đặt pass lần đầu
                    _hienModalDatPassLanDau(phone, pass, user);
                    return;
                }
                const hashInput = await _hashMatKhau(pass);
                if (hashInput !== user.mat_khau_hash) {
                    window.hienToast("Sai mật khẩu", "Nhập lại hoặc bấm 'Quên mật khẩu'.", "danger");
                    return;
                }
                _luuSessionVaDangNhap(user);
            } else {
                // ── KỊCH BẢN B: SĐT CHƯA TỒN TẠI → MỞ FORM ĐĂNG KÝ ──
                _xoFormPhu(phone, pass, gender);
            }
        } catch (e) {
            // dbEngine đã hiện toast "Mất kết nối" rồi — không hiện thêm
            console.error("Lỗi xác thực:", e);
            // Chỉ reset nút, không toast lần 2
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = 'XÁC NHẬN →'; }
        }
    };

    /**
     * Hoàn tất đăng ký — gọi khi bấm "TẠO TÀI KHOẢN" trong form phụ.
     */
    window.hoanTatDangKy = async function () {
        const extraFields = document.getElementById("authExtraFields");
        if (!extraFields) return;

        const phone  = extraFields.dataset.phone;
        const pass   = extraFields.dataset.pass;
        const gender = extraFields.dataset.gender || "male";

        // Lấy thông tin bổ sung
        const ten      = (document.getElementById("inputTenKhach")?.value || "").trim();
        const zaloCk   = document.getElementById("checkZaloTrungSDT")?.checked !== false; // default ON
        const sdtZaloEl = document.getElementById("inputSdtZalo");
        const sdtZalo  = zaloCk ? null : (sdtZaloEl?.value?.replace(/\D/g, "") || null);
        const facebook = (document.getElementById("inputFacebook")?.value || "").trim();
        const maGT     = (document.getElementById("inputMaGioiThieu")?.value || "").trim();
        const telegramId = null; // Sẽ kết nối riêng qua poll

        // Validate
        if (!window.VALIDATE.ten(ten)) {
            window.hienToast("Tên không hợp lệ", "Tên chỉ được chứa chữ cái tiếng Việt (2-50 ký tự).", "danger"); return;
        }
        if (!zaloCk && sdtZalo && !window.VALIDATE.sdt(sdtZalo)) {
            window.hienToast("SĐT Zalo không hợp lệ", "Nhập đúng 10 số, đầu 03/05/07/08/09.", "danger"); return;
        }
        if (facebook && !window.VALIDATE.facebook(facebook)) {
            window.hienToast("Link Facebook không hợp lệ", "Phải bắt đầu bằng https://facebook.com hoặc fb.com.", "danger"); return;
        }

        const btnDK = document.getElementById("btnHoanTatDangKy");
        if (btnDK) { btnDK.disabled = true; btnDK.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...'; }

        try {
            const hash = await _hashMatKhau(pass);

            // Xây payload theo schema của bảng đang dùng
            let payload;
            if (_bangND === "nguoi_dung") {
                // Schema mới (sau migration) — ghi đầy đủ cột
                payload = {
                    ten_khach:    ten,
                    sdt_khach:    phone,
                    gioi_tinh:    gender,
                    mat_khau_hash: hash,
                    vai_tro:      "guest",
                    sdt_zalo:     sdtZalo,
                    facebook_link: facebook || null,
                    ma_gioi_thieu: maGT || null
                };
            } else {
                // Schema cũ "khach_vang_lai" — chỉ ghi các cột tồn tại
                // Các cột mới (mat_khau_hash, vai_tro, gioi_tinh...) chưa có → bỏ qua
                payload = {
                    ten_khach: ten,
                    sdt_khach: phone
                    // ngay_tham_gia tự động ghi bởi DEFAULT now() trên Supabase
                };
            }

            const results = await window.dbEngine.ghi(_bangND, payload);
            const newUser = results[0] || { ...payload, vai_tro: "guest", gioi_tinh: gender };

            window.hienToast("Tạo tài khoản thành công! 🎉", `Chào ${ten}! Tài khoản đã được tạo.`, "success");
            _luuSessionVaDangNhap(newUser);
        } catch (e) {
            // dbEngine đã hiện toast "Mất kết nối" nếu là lỗi mạng
            console.error("Lỗi đăng ký:", e);
            // Chỉ hiện toast nếu là lỗi logic (không phải lỗi mạng)
            if (!e.message?.includes("fetch") && !e.message?.includes("network")) {
                window.hienToast("Lỗi đăng ký", "Không thể tạo tài khoản. Thử lại sau.", "danger");
            }
        } finally {
            if (btnDK) { btnDK.disabled = false; btnDK.innerHTML = 'TẠO TÀI KHOẢN & ĐĂNG NHẬP'; }
        }
    };

    /**
     * Toggle hiển thị ô SĐT Zalo riêng khi bỏ chọn "trùng SĐT đăng nhập".
     */
    window.toggleZaloRieng = function () {
        const checked = document.getElementById("checkZaloTrungSDT")?.checked;
        const row = document.getElementById("rowSdtZaloRieng");
        if (row) row.style.display = checked ? "none" : "block";
    };

    /**
     * Quên mật khẩu — phân nhánh theo telegram_id có tồn tại không.
     */
    window.quenMatKhau = async function () {
        const phone = (document.getElementById("inputPhone")?.value || "").replace(/\D/g, "");
        if (!window.VALIDATE.sdt(phone)) {
            window.hienToast("Nhập SĐT trước", "Vui lòng nhập SĐT ở ô trên, sau đó bấm 'Quên mật khẩu'.", "info");
            return;
        }

        try {
            const users = await window.dbEngine.doc("nguoi_dung", { eq: { sdt_khach: phone } });
            const user  = users[0] || null;

            if (!user) {
                window.hienToast("SĐT chưa đăng ký", "Số điện thoại này chưa có tài khoản trên hệ thống.", "warning");
                return;
            }

            if (user.telegram_id) {
                // Có telegram → hướng dẫn mở Bot nhận mã
                _hienModalQuenPassTelegram(phone, user.telegram_id);
            } else {
                // Không có telegram → liên hệ Admin
                _hienModalQuenPassAdmin(phone);
            }
        } catch (e) {
            window.hienToast("Lỗi kiểm tra", "Không thể kiểm tra tài khoản. Thử lại sau.", "danger");
        }
    };

    function _hienModalQuenPassTelegram(phone) {
        const modal = document.createElement("div");
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
        modal.innerHTML = `
            <div style="background:#1a2844;border:1px solid #00ff88;border-radius:16px;padding:28px 24px;max-width:400px;width:100%;">
                <h3 style="color:#00ff88;margin:0 0 10px;">🔐 Khôi phục mật khẩu</h3>
                <p style="color:#9ca3af;font-size:0.9rem;margin:0 0 20px;line-height:1.5;">
                    Mở Telegram Bot để nhận mã khôi phục mật khẩu mới.
                </p>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button onclick="window.ketNoiTelegramQuenPass('${phone}');this.closest('[style*=fixed]').remove()"
                        style="flex:1;padding:10px;background:#00ff88;color:#0a1628;border:none;border-radius:8px;font-weight:700;cursor:pointer;">
                        📲 Mở Telegram Bot →
                    </button>
                    <button onclick="this.closest('[style*=fixed]').remove()"
                        style="padding:10px 16px;background:transparent;color:#9ca3af;border:1px solid #374151;border-radius:8px;cursor:pointer;">
                        Hủy
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    function _hienModalQuenPassAdmin(phone) {
        const modal = document.createElement("div");
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
        modal.innerHTML = `
            <div style="background:#1a2844;border:1px solid #ef4444;border-radius:16px;padding:28px 24px;max-width:400px;width:100%;">
                <h3 style="color:#ef4444;margin:0 0 10px;">⚠️ Chưa liên kết Telegram</h3>
                <p style="color:#9ca3af;font-size:0.9rem;margin:0 0 20px;line-height:1.5;">
                    Tài khoản <strong style="color:#e2e8f0;">${phone}</strong> chưa liên kết Telegram.<br>
                    Vui lòng liên hệ Admin để reset mật khẩu.
                </p>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <a href="tel:0901234567" style="flex:1;text-align:center;padding:10px;background:#00ff88;color:#0a1628;border-radius:8px;font-weight:700;text-decoration:none;font-size:0.95rem;">
                        📞 Gọi Admin
                    </a>
                    <button onclick="this.closest('[style*=fixed]').remove()"
                        style="padding:10px 16px;background:transparent;color:#9ca3af;border:1px solid #374151;border-radius:8px;cursor:pointer;">
                        Đóng
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    /* ═══════════════════════════════════════════════════
     * MODULE 3 — TELEGRAM INTEGRATION
     * ═══════════════════════════════════════════════════ */
    const TELEGRAM_BOT_NAME = "TVLVangLaiBot"; // Placeholder — admin thay trước deploy

    /**
     * Kết nối Telegram khi đăng ký mới (từ form phụ).
     */
    window.ketNoiTelegram = function () {
        const phone = document.getElementById("authExtraFields")?.dataset?.phone;
        if (!phone) return;
        const link = `https://t.me/${TELEGRAM_BOT_NAME}?start=verify_${phone}`;
        window.open(link, "_blank", "noopener,noreferrer");
        _batDauPollTelegramId(phone, "inputTelegramStatus");
        window.hienToast("Đang chờ kết nối...", "Mở Telegram, bấm Start trên Bot.", "info");
    };

    /**
     * Kết nối Telegram khi quên mật khẩu.
     */
    window.ketNoiTelegramQuenPass = function (phone) {
        const link = `https://t.me/${TELEGRAM_BOT_NAME}?start=verify_${phone}`;
        window.open(link, "_blank", "noopener,noreferrer");
        _batDauPollMatKhauMoi(phone);
        window.hienToast("Đang chờ...", "Bot sẽ gửi mật khẩu mới về Telegram của bạn.", "info");
    };

    /**
     * Poll mỗi 3 giây, tối đa 60 giây để kiểm tra telegram_id đã được ghi chưa.
     */
    async function _batDauPollTelegramId(phone, statusElId, maxTries = 20) {
        let attempts = 0;
        const poll = setInterval(async () => {
            attempts++;
            if (attempts > maxTries) {
                clearInterval(poll);
                window.hienToast("Hết giờ chờ", "Chưa kết nối được. Có thể bỏ qua và kết nối sau.", "warning");
                return;
            }
            try {
                const result = await window.dbEngine.doc("nguoi_dung", { eq: { sdt_khach: phone } });
                if (result[0]?.telegram_id) {
                    clearInterval(poll);
                    // Cập nhật UI
                    const statusEl = statusElId ? document.getElementById(statusElId) : null;
                    if (statusEl) {
                        statusEl.innerHTML = '<span style="color:#00ff88;">✅ Đã kết nối Telegram</span>';
                    }
                    window.hienToast("Thành công! 🎉", "Đã kết nối Telegram.", "success");
                }
            } catch {
                // Ignore lỗi khi poll
            }
        }, 3000);
    }

    /**
     * Poll mỗi 3 giây để kiểm tra bot đã reset mat_khau_hash chưa.
     */
    async function _batDauPollMatKhauMoi(phone, maxTries = 20) {
        window.hienToast("Đang chờ Bot...", "Vui lòng chờ Telegram Bot xử lý.", "info");
        let attempts = 0;
        const oldHash = window.currentGuest?.mat_khau_hash || null;
        const poll = setInterval(async () => {
            attempts++;
            if (attempts > maxTries) {
                clearInterval(poll);
                window.hienToast("Hết giờ chờ", "Bot chưa phản hồi. Liên hệ Admin để hỗ trợ.", "warning");
                return;
            }
            try {
                const result = await window.dbEngine.doc("nguoi_dung", { eq: { sdt_khach: phone } });
                const newHash = result[0]?.mat_khau_hash;
                if (newHash && newHash !== oldHash) {
                    clearInterval(poll);
                    window.hienToast("✅ Mật khẩu đã được reset", "Mật khẩu mới đã gửi về Telegram. Đăng nhập lại.", "success");
                }
            } catch {
                // Ignore
            }
        }, 3000);
    }

    /* ═══════════════════════════════════════════════════
     * MODULE 4 — HOST UPGRADE (Kích hoạt Key từ Profile)
     * ═══════════════════════════════════════════════════ */

    /**
     * Tạo fingerprint UUID cho thiết bị (dựa trên localStorage).
     * Lần đầu tạo mới, các lần sau đọc từ localStorage.
     */
    function _layHoacTaoDeviceId() {
        let deviceId = localStorage.getItem("tvl_device_id");
        if (!deviceId) {
            // Sinh UUID v4 đơn giản
            deviceId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
            });
            localStorage.setItem("tvl_device_id", deviceId);
        }
        return deviceId;
    }

    /**
     * Kích hoạt Key Host từ trang Profile.
     */
    window.kichHoatKeyHost = async function () {
        const key = (document.getElementById("inputKeyNangCap")?.value || "").trim().toUpperCase();

        if (!window.VALIDATE.keyHost(key)) {
            window.hienToast("Sai định dạng Key", "Mã Key phải theo dạng TVL-XXXXX-XXXX.", "danger"); return;
        }

        const btn = document.getElementById("btnKichHoatKey");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

        try {
            // 1. Kiểm tra key trong quan_ly_key
            const keys = await window.dbEngine.doc("quan_ly_key", { eq: { ma_key: key } });
            const keyData = keys[0];

            if (!keyData) {
                window.hienToast("Key không tồn tại", "Mã Key không hợp lệ hoặc chưa được tạo.", "danger"); return;
            }
            if (keyData.trang_thai === "Bị khóa") {
                window.hienToast("Key bị khóa", "Mã Key này đã bị Admin khóa.", "danger"); return;
            }
            if (keyData.ngay_het_han && new Date(keyData.ngay_het_han) < new Date()) {
                window.hienToast("Key hết hạn", "Mã Key đã hết hạn sử dụng.", "danger"); return;
            }

            // 2. Kiểm tra device binding
            const deviceId = _layHoacTaoDeviceId();
            if (keyData.id_thiet_bi && keyData.id_thiet_bi !== deviceId) {
                window.hienToast("Sai thiết bị", "Key đã được kích hoạt trên thiết bị khác. Liên hệ Admin để reset.", "danger"); return;
            }

            // 3. Nâng cấp vai_tro trong nguoi_dung
            const phone = window.currentGuest?.sdt_khach;
            if (!phone) {
                window.hienToast("Chưa đăng nhập", "Vui lòng đăng nhập trước.", "danger"); return;
            }
            await window.dbEngine.ghi("nguoi_dung",
                { vai_tro: "host", ma_key_host: key },
                { sdt_khach: phone }
            );

            // 4. Cập nhật quan_ly_key: kích hoạt + ghi device binding
            const ngayKichHoat = new Date().toISOString();
            const soNgay = keyData.so_ngay_duoc_xai || 30;
            const ngayHetHan = new Date(Date.now() + soNgay * 86400000).toISOString();
            await window.dbEngine.ghi("quan_ly_key",
                { trang_thai: "Đang chạy", id_thiet_bi: deviceId, ngay_kich_hoat: ngayKichHoat, ngay_het_han: ngayHetHan },
                { ma_key: key }
            );

            // 5. Cập nhật local session + UI
            window.currentGuest.vai_tro    = "host";
            window.currentGuest.ma_key_host = key;
            localStorage.setItem("tvl_guest", JSON.stringify(window.currentGuest));
            _capNhatUIHostDaKichHoat(key);
            window.hienToast("Thành công! 🏟️", "Tài khoản đã được nâng cấp thành Host Sân.", "success");
        } catch (e) {
            console.error("Lỗi kích hoạt key:", e);
            window.hienToast("Lỗi", "Không thể kích hoạt Key. Thử lại sau.", "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = 'Kích Hoạt →'; }
        }
    };

    /**
     * Cập nhật UI sau khi kích hoạt Key thành công.
     * Cũng tải hạn sử dụng từ DB để hiển thị.
     */
    function _capNhatUIHostDaKichHoat(key, ngayHetHanRaw) {
        const sectionGuest  = document.getElementById("sectionNangCapHost");
        const sectionHost   = document.getElementById("sectionHostDaKichHoat");
        const keyDisplay    = document.getElementById("profileHostKey");
        const expiryDisplay = document.getElementById("profileHostExpiry");
        if (sectionGuest) sectionGuest.style.display = "none";
        if (sectionHost)  sectionHost.style.display  = "flex";
        if (keyDisplay)   keyDisplay.textContent      = key;
        if (expiryDisplay) {
            if (ngayHetHanRaw) {
                const d = new Date(ngayHetHanRaw);
                expiryDisplay.textContent = d.toLocaleDateString("vi-VN");
                const conLai = Math.ceil((d - Date.now()) / 86400000);
                expiryDisplay.style.color = conLai <= 7 ? "#f87171" : "#fbbf24";
            } else {
                // Nếu không có sẵn → tải từ DB
                window.dbEngine.doc("quan_ly_key", { eq: { ma_key: key } })
                    .then(rows => {
                        const row = rows?.[0];
                        if (row?.ngay_het_han) {
                            const d = new Date(row.ngay_het_han);
                            expiryDisplay.textContent = d.toLocaleDateString("vi-VN");
                            const conLai = Math.ceil((d - Date.now()) / 86400000);
                            expiryDisplay.style.color = conLai <= 7 ? "#f87171" : "#fbbf24";
                        } else {
                            expiryDisplay.textContent = "Chưa kích hoạt";
                            expiryDisplay.style.color = "#94a3b8";
                        }
                    }).catch(() => { expiryDisplay.textContent = "--"; });
            }
        }
    }

    /**
     * Alias cũ cho backward compat (một số file HTML còn dùng)
     */
    window.xacThucKhachChoi = window.xacThucNguoiDung;

    window.dangXuatKhach = function () {
        localStorage.removeItem("tvl_guest");
        window.currentGuest = null;
        // Xóa toàn bộ nội dung lịch sử cũ để không hiện lại sau đăng xuất
        const timeline = document.getElementById("lichSuTimeline");
        if (timeline) timeline.innerHTML = "";
        const stats = document.getElementById("lichSuStats");
        if (stats) stats.innerHTML = "";
        // Đóng modal lịch sử
        const lichSuSection = document.getElementById("lichSuDauSection");
        if (lichSuSection) lichSuSection.classList.add("lich-su-hidden");
        document.body.style.overflow = "";
        window.hienToast("Đã đăng xuất", "Hẹn gặp lại lông thủ!", "info");
        _hienManDangNhap();
    };

    /* ═══════════════════════════════════════════════════
     * 3. BỘ LỌC TÌM KIẾM KÈO
     * ═══════════════════════════════════════════════════ */
    function _napDropdownBoLoc() {
        const provSel = document.getElementById("filterProvince");
        if (!provSel || !window.MOCK_PROVINCES) return;
        provSel.innerHTML = '<option value="">🇻🇳 Toàn Quốc</option>';
        window.MOCK_PROVINCES.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.name; opt.textContent = p.name;
            provSel.appendChild(opt);
        });
        provSel.addEventListener("change", () => {
            _capNhatHuyenBoLoc(provSel.value);
            window.timKiemCaDau();
        });
    }

    function _capNhatHuyenBoLoc(provName) {
        const distSel = document.getElementById("filterDistrict");
        if (!distSel) return;
        distSel.innerHTML = '<option value="">-- Tất cả Quận/Huyện --</option>';
        if (!provName || !window.MOCK_PROVINCES) return;
        const prov = window.MOCK_PROVINCES.find(p => p.name === provName);
        if (prov) prov.districts.forEach(d => {
            const opt = document.createElement("option");
            opt.value = d; opt.textContent = d;
            distSel.appendChild(opt);
        });
    }

    window.capNhatQuanHuyenLoc = function () {
        _capNhatHuyenBoLoc(document.getElementById("filterProvince")?.value);
    };

    /* ═══════════════════════════════════════════════════
     * 4. TÌM KIẾM & HIỂN THỊ CA ĐẤU (từ bảng ca_dau)
     * ═══════════════════════════════════════════════════ */
    window.timKiemCaDau = function () {
        clearTimeout(_filterTimeout);
        _filterTimeout = setTimeout(_thucHienTimKiem, 300);
    };

    async function _thucHienTimKiem() {
        const container = document.getElementById("slotsSearchResultContainer");
        const countEl   = document.getElementById("countSearchResult");
        if (!container) return;

        container.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;margin-bottom:8px;display:block;"></i>
            Đang tìm kèo phù hợp...
        </div>`;

        const province   = document.getElementById("filterProvince")?.value || "";
        const district   = document.getElementById("filterDistrict")?.value || "";
        const gender     = document.getElementById("filterGender")?.value || "";
        const level      = document.getElementById("filterLevel")?.value || "";
        const maxPrice   = Number(document.getElementById("filterMaxPrice")?.value) || 0;
        const courtName  = document.getElementById("filterCourtName")?.value?.trim().toLowerCase() || "";
        const filterDate = document.getElementById("filterDate")?.value || "";
        const timeFrame  = document.getElementById("filterTimeFrame")?.value || "";

        try {
            // Tải ca_dau, dat_slot và quan_ly_key song song
            const [allCaDau, allDatSlot, allKeys] = await Promise.all([
                window.dbEngine.doc("ca_dau"),
                window.dbEngine.doc("dat_slot").catch(() => []),
                window.dbEngine.doc("quan_ly_key").catch(() => [])
            ]);
            // Map ma_key → {ten_host, sdt_host} để hiển thị tên chủ sân
            const hostMap = {};
            allKeys.forEach(k => { hostMap[k.ma_key] = { ten: k.ten_host || "", sdt: k.sdt_host || "" }; });

            // Set các ca_dau mà user hiện tại đã đặt slot (không bị hủy)
            const daDatSet = new Set();
            if (window.currentGuest) {
                const myPhone = window.currentGuest.sdt_khach;
                allDatSlot.forEach(s => {
                    if (s.sdt_khach === myPhone && s.trang_thai_di_danh !== "Khách hủy") {
                        daDatSet.add(s.id_ca_dau);
                    }
                });
            }

            // Nhóm dat_slot theo id_ca_dau để đếm (loại trừ "Khách hủy")
            const datSlotMap = {};
            allDatSlot.forEach(s => {
                if (s.trang_thai_di_danh === "Khách hủy") return; // không đếm slot đã hủy
                if (!datSlotMap[s.id_ca_dau]) datSlotMap[s.id_ca_dau] = [];
                datSlotMap[s.id_ca_dau].push(s);
            });

            const now = new Date();
            const todayStr = now.toLocaleDateString("sv-SE");

            let results = allCaDau.filter(s => {
                // Chỉ hiện ca chưa chốt
                if (s.da_chot_ca) return false;
                // Chỉ hiện ca hôm nay trở đi
                if (s.ngay_danh && s.ngay_danh < todayStr) return false;

                // Lọc tỉnh thành
                if (province && s.tinh_thanh !== province) return false;
                // Lọc quận huyện
                if (district && s.quan_huyen !== district) return false;

                // Lọc giới tính (select: "male"/"female"/"both"/"")
                if (gender) {
                    const sg = s.gioi_tinh_can; // "Nam" | "Nữ" | "Cả hai"
                    if (gender === "male"   && sg === "Nữ")  return false;
                    if (gender === "female" && sg === "Nam")  return false;
                    // gender === "both": chỉ lấy "Cả hai"
                    if (gender === "both" && sg !== "Cả hai") return false;
                }

                // Lọc trình độ
                if (level) {
                    const td = s.yeu_cau_trinh_do || {};
                    const allLevels = [...(td.nam || []), ...(td.nu || [])];
                    if (!allLevels.some(l => l.toLowerCase().includes(level.toLowerCase()))) return false;
                }

                // Lọc giá tối đa
                if (maxPrice > 0) {
                    const minPrice = Math.min(s.gia_nam || 999999, s.gia_nu || s.gia_nam || 999999);
                    if (minPrice > maxPrice) return false;
                }

                // Lọc tên sân
                if (courtName && !(s.ten_san || "").toLowerCase().includes(courtName)) return false;

                // Lọc ngày cụ thể
                if (filterDate && s.ngay_danh !== filterDate) return false;

                // Lọc khung giờ
                if (timeFrame && s.gio_bat_dau) {
                    const h = parseInt(s.gio_bat_dau.split(":")[0]);
                    if (timeFrame === "morning"   && (h < 5  || h >= 12)) return false;
                    if (timeFrame === "afternoon" && (h < 12 || h >= 17)) return false;
                    if (timeFrame === "evening"   && (h < 17 || h >= 23)) return false;
                }

                return true;
            });

            // Sắp xếp: gần nhất trước
            results.sort((a, b) => {
                const dtA = new Date(`${a.ngay_danh}T${a.gio_bat_dau || "00:00"}`);
                const dtB = new Date(`${b.ngay_danh}T${b.gio_bat_dau || "00:00"}`);
                return dtA - dtB;
            });

            if (countEl) countEl.textContent = results.length;
            container.innerHTML = "";

            if (results.length === 0) {
                container.innerHTML = `
                <div style="text-align:center;padding:40px 20px;color:#64748b;width:100%;grid-column:1/-1;">
                    <i class="fa-solid fa-magnifying-glass" style="font-size:2rem;margin-bottom:12px;display:block;opacity:0.4;"></i>
                    <p style="font-size:0.9rem;text-align:center;">Không tìm thấy kèo phù hợp.</p>
                    <p style="font-size:0.8rem;margin-top:4px;text-align:center;">Thử thay đổi bộ lọc hoặc xem tất cả kèo.</p>
                </div>`;
                return;
            }

            results.forEach(slot => {
                const soKhach = (datSlotMap[slot.id] || []).length;
                const hostInfo = hostMap[slot.ma_key_host] || null;
                const card = _taoCaCard(slot, soKhach, daDatSet, hostInfo);
                container.appendChild(card);
            });
        } catch (e) {
            console.error("Lỗi tìm kiếm:", e);
            container.innerHTML = `<div style="text-align:center;padding:30px;color:#ef4444;">
                Lỗi tải dữ liệu. Vui lòng thử lại.
            </div>`;
        }
    }

    function _taoCaCard(slot, soKhach = 0, daDatSet = new Set(), hostInfo = null) {
        const card = document.createElement("div");
        card.className = "slot-card";
        card.dataset.caId = slot.id; // Để query nút sau khi đặt slot thành công

        const now     = new Date();
        const isToday = slot.ngay_danh === now.toLocaleDateString("sv-SE");
        // J5: Kiểm tra slot đã full (tong_slot_can > 0 và đã đặt đủ) — "Khách hủy" không tính
        const isFull = slot.tong_slot_can > 0 && soKhach >= slot.tong_slot_can;
        // FEAT-5: Khóa đặt slot khi đã đến giờ bắt đầu
        const isStarted = (() => {
            if (!slot.ngay_danh || !slot.gio_bat_dau) return false;
            const [hh, mm] = (slot.gio_bat_dau || "").split(":").map(Number);
            const startTime = new Date(slot.ngay_danh);
            startTime.setHours(hh || 0, mm || 0, 0, 0);
            return startTime <= now;
        })();
        // Khóa nút ĐẶT nếu: full HOẶC đã bắt đầu
        const isLocked = isFull || isStarted;

        // Badge giới tính (gioi_tinh_can = "Nam" | "Nữ" | "Cả hai")
        const genderMap = {
            "Nam":    '<span class="gender-badge male"><i class="fa-solid fa-mars"></i> Nam</span>',
            "Nữ":     '<span class="gender-badge female"><i class="fa-solid fa-venus"></i> Nữ</span>',
            "Cả hai": '<span class="gender-badge both"><i class="fa-solid fa-venus-mars"></i> Cả hai</span>'
        };
        const genderBadge = genderMap[slot.gioi_tinh_can] || "";

        // Trình độ từ JSONB yeu_cau_trinh_do — TASK 3.6: mỗi giới tính 1 dòng riêng
        const td = slot.yeu_cau_trinh_do || {};
        const mLevels = Array.isArray(td.nam) ? td.nam.join(", ") : (td.nam || "");
        const fLevels = Array.isArray(td.nu)  ? td.nu.join(", ")  : (td.nu  || "");
        // H4b: Icon giới tính màu thay emoji 🏸
        const ICON_NAM = '<span style="color:#60a5fa;font-style:normal;">&#9794;</span>'; // ♂ xanh dương
        const ICON_NU  = '<span style="color:#f472b6;font-style:normal;">&#9792;</span>'; // ♀ hồng
        let levelHTML = "";
        if (slot.gioi_tinh_can === "Cả hai") {
            levelHTML = `<span class="kh-trinh-do-line" style="display:flex;align-items:center;gap:4px;">${ICON_NAM} Nam: ${mLevels || "--"}</span>`
                      + `<span class="kh-trinh-do-line" style="display:flex;align-items:center;gap:4px;">${ICON_NU} Nữ: ${fLevels || "--"}</span>`;
        } else if (slot.gioi_tinh_can === "Nữ") {
            levelHTML = `<span class="kh-trinh-do-line" style="display:flex;align-items:center;gap:4px;">${ICON_NU} ${fLevels || "--"}</span>`;
        } else {
            levelHTML = `<span class="kh-trinh-do-line" style="display:flex;align-items:center;gap:4px;">${ICON_NAM} ${mLevels || "--"}</span>`;
        }

        // Tiện ích từ JSONB tien_ich_bao_gom
        const baoGom = slot.tien_ich_bao_gom || {};
        const tichs = [];
        if (baoGom.san)    tichs.push('<span class="tien-ich"><i class="fa-solid fa-map"></i> Sân</span>');
        if (baoGom.cau)    tichs.push('<span class="tien-ich"><i class="fa-solid fa-feather-pointed"></i> Cầu</span>');
        if (baoGom.nuoc)   tichs.push('<span class="tien-ich"><i class="fa-solid fa-bottle-water"></i> Nước</span>');
        if (baoGom.gui_xe) tichs.push('<span class="tien-ich"><i class="fa-solid fa-motorcycle"></i> Gửi xe</span>');

        // Ngày hiển thị
        const dateStr = slot.ngay_danh
            ? new Date(slot.ngay_danh).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })
            : "--";

        card.innerHTML = `
        <div class="slot-card-inner">
            <div class="slot-card-header">
                <div class="slot-header-left">
                    ${isToday ? '<span class="badge-today">🔥 HÔM NAY</span>' : ''}
                    <span class="slot-date">${dateStr}</span>
                    <span class="slot-time"><i class="fa-regular fa-clock"></i> ${slot.gio_bat_dau || "--"} – ${slot.gio_ket_thuc || "--"} (${slot.so_gio_choi || 0}h)</span>
                </div>
                <div class="slot-header-right">${genderBadge}</div>
            </div>

            <div class="slot-card-body">
                <div class="slot-court-info">
                    <h4 class="slot-court-name">
                        <i class="fa-solid fa-location-dot" style="color:#00ff88;margin-right:6px;"></i>
                        ${slot.ten_san || "Chưa có tên sân"}
                    </h4>
                    <p class="slot-court-address">${slot.dia_chi_san || ""}</p>
                    <p class="slot-location">${slot.quan_huyen || ""}, ${slot.tinh_thanh || ""}</p>
                    ${slot.so_san_cu_the ? `<p style="font-size:0.75rem;color:#64748b;">${_formatSanSo(slot.so_san_cu_the)} (${slot.so_san_mo || 1} sân)</p>` : ""}
                </div>

                <!-- Wrap trình độ + badge để đảm bảo chiều cao đồng đều giữa các card -->
                <div class="slot-level-badge-wrap">
                    <div class="slot-details-row">
                        <div class="slot-detail-item" style="flex:1;">
                            <span class="detail-label">Trình độ yêu cầu</span>
                            <div class="kh-trinh-do-row">${levelHTML}</div>
                        </div>
                    </div>
                    <!-- TASK 3.6: badge "Đã đăng ký" tách thành dòng riêng -->
                    <div class="kh-da-dang-ky-badge">
                        <i class="fa-solid fa-users" style="margin-right:4px;opacity:0.7;"></i>${soKhach} người đã đăng ký
                    </div>
                </div>

                <div class="slot-price-row">
                    <div class="price-item price-male">
                        <span class="price-label"><i class="fa-solid fa-mars"></i> Nam</span>
                        <span class="price-value">${_formatVND(slot.gia_nam)}</span>
                    </div>
                    <div class="price-item price-female">
                        <span class="price-label"><i class="fa-solid fa-venus"></i> Nữ</span>
                        <span class="price-value">${_formatVND(slot.gia_nu)}</span>
                    </div>
                </div>

                ${tichs.length > 0 ? `<div class="tien-ich-row">Bao gồm: ${tichs.join("")}</div>` : ""}

                <div class="slot-host-row">
                    <i class="fa-solid fa-user-tie" style="color:#64748b;font-size:0.8rem;"></i>
                    <span style="font-size:0.78rem;color:#94a3b8;">Chủ sân: ${hostInfo?.ten || "Ẩn danh"}${hostInfo?.sdt ? ` · ${hostInfo.sdt}` : ""}</span>
                    ${slot.link_maps ? `<a href="${slot.link_maps}" target="_blank" rel="noopener noreferrer"
                        style="font-size:0.76rem;color:#00ff88;margin-left:8px;">
                        <i class="fa-solid fa-map-location-dot"></i> Bản đồ</a>` : ""}
                </div>
            </div>

            <div class="slot-card-footer" style="display:flex;gap:8px;align-items:center;">
                <button class="kh-btn-detail" onclick="window.moModalChiTietKeo('${slot.id}')">
                    <i class="fa-solid fa-circle-info"></i> Chi tiết
                </button>
                <button class="kh-btn-share" onclick="window.shareKeo('${slot.id}')" title="Sao chép link chia sẻ">
                    <i class="fa-solid fa-share-nodes"></i>
                </button>
                ${isLocked
                    // Đã full hoặc đã bắt đầu → khóa
                    ? (isFull
                        ? `<button style="flex:1;background:#334155;border:1px solid #475569;color:#64748b;cursor:not-allowed;padding:10px 22px;border-radius:12px;font-size:0.82rem;font-weight:700;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;" disabled>
                               <i class="fa-solid fa-users-slash"></i> Đã đủ slot
                           </button>`
                        : `<button style="flex:1;background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.3);color:#fb923c;cursor:not-allowed;padding:10px 22px;border-radius:12px;font-size:0.82rem;font-weight:700;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;" disabled>
                               <i class="fa-solid fa-play"></i> Đang diễn ra
                           </button>`)
                    // Chưa bắt đầu + chưa full
                    : (window.currentGuest
                        ? (daDatSet.has(slot.id)
                            ? `<button class="btn-da-dat" style="flex:1;" disabled>
                                <i class="fa-solid fa-circle-check"></i> ĐÃ ĐẶT
                               </button>`
                            : `<button class="btn-dat-slot" style="flex:1;" onclick="window.datSlot('${slot.id}')">
                                <i class="fa-solid fa-ticket"></i> ĐẶT SLOT
                               </button>`)
                        : `<button class="btn-dat-slot btn-dat-slot-disabled" style="flex:1;"
                            onclick="if(window.innerWidth < 768) window.openLoginSheet(); else window.hienToast('Cần đăng nhập','Đăng nhập hoặc đăng ký bên sidebar trái.','warning')">
                            <i class="fa-solid fa-lock"></i> ĐẶT SLOT
                           </button>`)
                }
            </div>
        </div>`;

        return card;
    }

    /* ═══════════════════════════════════════════════════
     * 5. ĐẶT SLOT → INSERT vào bảng dat_slot
     * ═══════════════════════════════════════════════════ */
    window.datSlot = async function (caDauId) {
        if (!window.currentGuest) {
            window.hienToast("Chưa đăng nhập", "Vui lòng đăng nhập trước.", "warning"); return;
        }

        try {
            // Kiểm tra ca đấu còn mở không
            const caDauList = await window.dbEngine.doc("ca_dau", { eq: { id: caDauId } });
            const caDau = caDauList[0];
            if (!caDau) { window.hienToast("Không tìm thấy", "Ca đấu không còn tồn tại.", "danger"); return; }
            if (caDau.da_chot_ca) { window.hienToast("Đã đóng", "Ca đấu này đã được chốt, không nhận thêm người.", "warning"); return; }

            // Kiểm tra đã đặt slot chưa
            const existingSlots = await window.dbEngine.doc("dat_slot", {
                eq: { id_ca_dau: caDauId, sdt_khach: window.currentGuest.sdt_khach }
            });
            if (existingSlots.length > 0) {
                const existing = existingSlots[0];
                if (existing.trang_thai_di_danh === "Khách hủy") {
                    window.hienToast("Đã hủy trước đó", "Bạn đã hủy slot này rồi và không thể đặt lại.", "warning");
                } else {
                    window.hienToast("Đã đăng ký rồi", `Bạn đã có mã slot: ${existing.ma_slot}`, "info");
                }
                return;
            }

            // Sinh mã SLOT-XXXXX
            const maSlot = "SLOT-" + Math.random().toString(36).slice(2, 7).toUpperCase();

            // INSERT vào bảng dat_slot — gioi_tinh lấy từ currentGuest (fix bug hardcode "male")
            await window.dbEngine.ghi("dat_slot", {
                id_ca_dau:         caDauId,
                ten_khach:         window.currentGuest.ten_khach,
                sdt_khach:         window.currentGuest.sdt_khach,
                ma_slot:           maSlot,
                gioi_tinh:         window.currentGuest.gioi_tinh || "male",
                trang_thai_di_danh: "Chờ đánh"
            });

            window.hienToast("Đặt slot thành công! 🎉", `Mã của bạn: ${maSlot}. Liên hệ host qua Zalo để xác nhận.`, "success");

            // Cập nhật nút ngay lập tức — không reload toàn bộ danh sách
            const cardEl = document.querySelector(`[data-ca-id="${caDauId}"]`);
            if (cardEl) {
                const nutDatSlot = cardEl.querySelector(".btn-dat-slot");
                if (nutDatSlot) {
                    nutDatSlot.className = "btn-da-dat";
                    nutDatSlot.disabled = true;
                    nutDatSlot.innerHTML = '<i class="fa-solid fa-circle-check"></i> ĐÃ ĐẶT';
                    nutDatSlot.style.flex = "1";
                    nutDatSlot.onclick = null;
                }
            }
            // Cập nhật thống kê sidebar
            _taiThongKeKhach();
        } catch (e) {
            console.error("Lỗi đặt slot:", e);
            window.hienToast("Lỗi", "Không thể đặt slot. Thử lại sau.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 6. THỐNG KÊ HỒ SƠ CÁ NHÂN KHÁCH
     *    Đọc từ dat_slot JOIN ca_dau — chỉ tính tiền khi da_chot_ca=true
     * ═══════════════════════════════════════════════════ */
    async function _taiThongKeKhach() {
        if (!window.currentGuest) return;

        const fromDate = document.getElementById("statsDateFrom")?.value;
        const toDate   = document.getElementById("statsDateTo")?.value;

        try {
            // Tải dat_slot của khách này + toàn bộ ca_dau
            const [myDatSlots, allCaDau] = await Promise.all([
                window.dbEngine.doc("dat_slot", { eq: { sdt_khach: window.currentGuest.sdt_khach } }),
                window.dbEngine.doc("ca_dau")
            ]);

            // Build map ca_dau theo id để lookup nhanh
            const caDauMap = {};
            allCaDau.forEach(c => { caDauMap[c.id] = c; });

            let soCaBuoi = 0, tongChiTieu = 0, soBung = 0, soCho = 0;

            myDatSlots.forEach(slot => {
                const caDau = caDauMap[slot.id_ca_dau];
                if (!caDau) return;

                // Lọc theo khoảng thời gian
                if (fromDate && caDau.ngay_danh && caDau.ngay_danh < fromDate) return;
                if (toDate   && caDau.ngay_danh && caDau.ngay_danh > toDate)   return;

                // Đang chờ đánh (chưa chốt ca)
                if (!caDau.da_chot_ca && slot.trang_thai_di_danh === "Chờ đánh") soCho++;

                // Đã bùng kèo
                if (slot.trang_thai_di_danh === "Bùng kèo") soBung++;

                // Đã tham gia
                if (slot.trang_thai_di_danh === "Đã tham gia") {
                    soCaBuoi++;
                    // Chỉ tính tiền khi ca đã chốt (da_chot_ca = true)
                    if (caDau.da_chot_ca) {
                        const gia = slot.gioi_tinh === "female" ? (caDau.gia_nu || 0) : (caDau.gia_nam || 0);
                        tongChiTieu += gia;
                    }
                }
            });

            // Cập nhật UI
            const el1 = document.getElementById("statsTotalSlots");
            const el2 = document.getElementById("statsTotalCost");
            const el3 = document.getElementById("statsBungKeo");
            const el4 = document.getElementById("statsPending");
            if (el1) el1.textContent = `${soCaBuoi} Ca`;
            if (el2) el2.textContent = _formatVND(tongChiTieu);
            if (el3) el3.textContent = `${soBung} Lần`;
            if (el4) el4.textContent = `${soCho} Ca`;

        } catch (e) { console.error("Lỗi tải thống kê:", e); }
    }

    window.locNhanhThoiGian = function (loai, btnEl) {
        // FIX 4 — TOGGLE: nếu tag này đang active → click lại → tắt, reset về "Tất cả"
        const isAlreadyActive = btnEl && btnEl.classList.contains("active");
        if (isAlreadyActive) {
            document.querySelectorAll(".kh-time-btn").forEach(b => b.classList.remove("active"));
            const fromEl = document.getElementById("statsDateFrom");
            const toEl   = document.getElementById("statsDateTo");
            if (fromEl) fromEl.value = "";
            if (toEl)   toEl.value   = "";
            _taiThongKeKhach();
            _taiLichSuChiTieu();
            return;
        }

        const now   = new Date();
        const fromEl = document.getElementById("statsDateFrom");
        const toEl  = document.getElementById("statsDateTo");
        if (!fromEl || !toEl) return;

        const toStr = now.toLocaleDateString("sv-SE");

        if (loai === "week") {
            const d = new Date(now);
            d.setDate(d.getDate() - d.getDay() + 1);
            fromEl.value = d.toLocaleDateString("sv-SE");
        } else if (loai === "month") {
            fromEl.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        } else if (loai === "year") {
            fromEl.value = `${now.getFullYear()}-01-01`;
        } else {
            fromEl.value = "";
            toEl.value   = "";
            _taiThongKeKhach();
            return;
        }
        toEl.value = toStr;
        _taiThongKeKhach();
        _taiLichSuChiTieu(); // Cập nhật lịch sử chi tiêu theo cùng khoảng thời gian

        document.querySelectorAll(".kh-time-btn").forEach(b => b.classList.remove("active"));
        if (btnEl) btnEl.classList.add("active");
    };

    /* ═══════════════════════════════════════════════════
     * 7. ĐÁNH GIÁ HOST (3 ĐIỀU KIỆN AND)
     *    Lưu vào bảng danh_gia_tin_dung
     * ═══════════════════════════════════════════════════ */
    async function _taiDanhSachHostChoGuestDanhGia() {
        if (!window.currentGuest) return;
        const sel = document.getElementById("guestReviewHostSelect");
        if (!sel) return;

        sel.innerHTML = '<option value="">-- Đang tải... --</option>';

        try {
            // Tải dat_slot của khách đã xác nhận tham gia + ca_dau đã chốt
            const [myDatSlots, allCaDau, myReviews] = await Promise.all([
                window.dbEngine.doc("dat_slot", {
                    eq: { sdt_khach: window.currentGuest.sdt_khach, trang_thai_di_danh: "Đã tham gia" }
                }),
                window.dbEngine.doc("ca_dau"),
                window.dbEngine.doc("danh_gia_tin_dung", {
                    eq: { sdt_nguoi_viet: window.currentGuest.sdt_khach, loai_danh_gia: "GuestToHost" }
                }).catch(() => [])
            ]);

            const caDauMap = {};
            allCaDau.forEach(c => { caDauMap[c.id] = c; });

            // Set các ca đã đánh giá rồi
            const daDanhGiaCaIds = new Set(myReviews.map(r => r.id_ca_dau));

            // Lọc: ca đã chốt + khách đã tham gia
            const eligible = [];
            myDatSlots.forEach(slot => {
                const caDau = caDauMap[slot.id_ca_dau];
                if (!caDau || !caDau.da_chot_ca) return; // Phải chốt ca rồi
                eligible.push({
                    caDau,
                    alreadyReviewed: daDanhGiaCaIds.has(slot.id_ca_dau)
                });
            });

            // Loại bỏ trùng (nếu đặt slot nhiều lần)
            const seen = new Set();
            const uniqueEligible = eligible.filter(e => {
                if (seen.has(e.caDau.id)) return false;
                seen.add(e.caDau.id);
                return true;
            });

            sel.innerHTML = '<option value="">-- Chọn ca đấu để đánh giá --</option>';
            if (uniqueEligible.length === 0) {
                sel.innerHTML += '<option disabled>Chưa có ca đấu đủ điều kiện</option>';
                return;
            }

            uniqueEligible.forEach(({ caDau, alreadyReviewed }) => {
                const opt = document.createElement("option");
                opt.value = caDau.id;
                const dateStr = caDau.ngay_danh ? new Date(caDau.ngay_danh).toLocaleDateString("vi-VN") : "--";
                opt.textContent = `${caDau.ten_san || "--"} | ${dateStr} ${alreadyReviewed ? "✅ Đã đánh giá" : ""}`;
                if (alreadyReviewed) opt.disabled = true;
                sel.appendChild(opt);
            });
        } catch (e) {
            console.error("Lỗi tải host list:", e);
            sel.innerHTML = '<option value="">Lỗi tải dữ liệu</option>';
        }
    }

    window.guiDanhGiaHost = async function () {
        if (!window.currentGuest) {
            window.hienToast("Chưa đăng nhập", "Vui lòng đăng nhập trước.", "warning"); return;
        }

        const sel     = document.getElementById("guestReviewHostSelect");
        const comment = document.getElementById("guestReviewComment")?.value?.trim();
        const caDauId = sel?.value;

        if (!caDauId) { window.hienToast("Chưa chọn ca", "Vui lòng chọn ca đấu cần đánh giá.", "warning"); return; }

        const myPhone = window.currentGuest.sdt_khach;

        try {
            // Kiểm tra đã đánh giá chưa
            const existed = await window.dbEngine.doc("danh_gia_tin_dung", {
                eq: { id_ca_dau: caDauId, sdt_nguoi_viet: myPhone, loai_danh_gia: "GuestToHost" }
            }).catch(() => []);
            if (existed.length > 0) {
                window.hienToast("Đã đánh giá", "Bạn đã gửi đánh giá cho ca này rồi.", "warning"); return;
            }

            // Lấy SĐT host từ ca_dau → quan_ly_key
            const caDauList = await window.dbEngine.doc("ca_dau", { eq: { id: caDauId } });
            const caDau = caDauList[0];
            let hostPhone = caDau?.ma_key_host || ""; // fallback là mã key

            if (caDau?.ma_key_host) {
                const keyList = await window.dbEngine.doc("quan_ly_key", { eq: { ma_key: caDau.ma_key_host } }).catch(() => []);
                if (keyList[0]?.sdt_host) hostPhone = keyList[0].sdt_host;
            }

            // Ghi vào bảng danh_gia_tin_dung
            await window.dbEngine.ghi("danh_gia_tin_dung", {
                id_ca_dau:             caDauId,
                sdt_nguoi_viet:        myPhone,
                sdt_nguoi_bi_danh_gia: hostPhone,
                loai_danh_gia:         "GuestToHost",
                so_sao:                _guestRatingVal,
                nhan_xet:              comment || null
            });

            window.hienToast("Đánh giá thành công! ⭐", `Đã gửi ${_guestRatingVal} sao cho chủ sân.`, "success");

            // Reset form
            sel.value = "";
            const commentEl = document.getElementById("guestReviewComment");
            if (commentEl) commentEl.value = "";
            _guestRatingVal = 5;
            const starCtr = document.getElementById("guestRatingStars");
            if (starCtr) _capNhatStarUI(starCtr, 5);

            await _taiDanhSachHostChoGuestDanhGia();
        } catch (e) {
            console.error("Lỗi gửi đánh giá:", e);
            window.hienToast("Lỗi", "Không gửi được đánh giá.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * GĐ3A — MODAL CHI TIẾT CA ĐẤU
     * Hiện toàn bộ thông tin: địa chỉ, Maps, trình độ, giá,
     * tiện ích, danh sách người đã đăng ký (ẩn SĐT), nút ĐẶT SLOT
     * ═══════════════════════════════════════════════════ */
    /* ═══════════════════════════════════════════════════
     * SHARE KEO — Sao chép link ca đấu để chia sẻ
     * URL format: ?ca=<id> — tự động mở modal khi load trang
     * ═══════════════════════════════════════════════════ */
    window.shareKeo = async function (idCaDau) {
        const url = window.location.origin + window.location.pathname + '?ca=' + idCaDau;
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Kèo cầu lông', url });
            } else {
                await navigator.clipboard.writeText(url);
                window.hienToast('Đã sao chép link!', 'Dán link vào Zalo/Facebook để chia sẻ.', 'success');
            }
        } catch {
            // Fallback nếu clipboard API không có
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            window.hienToast('Đã sao chép link!', 'Dán link vào Zalo/Facebook để chia sẻ.', 'success');
        }
    };

    // Tự động mở modal chi tiết nếu URL có tham số ?ca=<id>
    // Luôn mở modal ngay — modal tự xử lý trạng thái đăng nhập/chưa đăng nhập
    // Nếu chưa đăng nhập → lưu _pendingCaId, sau login sẽ gọi lại moModalChiTietKeo
    (function _autoOpenFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const caId = params.get('ca');
        if (!caId) return;

        // Nếu chưa đăng nhập → lưu pending để sau login re-open modal tự động
        if (!window.currentGuest) _pendingCaId = caId;

        // Mở modal ngay (dù chưa đăng nhập — modal hiện nút "Đăng nhập để đặt slot")
        setTimeout(() => window.moModalChiTietKeo(caId), 600);
    })();

    window.moModalChiTietKeo = async function (idCaDau) {
        const overlay = document.getElementById("modalChiTietKeoOverlay");
        const body    = document.getElementById("modalKeoBody");
        const title   = document.getElementById("modalKeoTitle");
        if (!overlay || !body) return;

        overlay.style.display = "flex";
        body.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;display:block;margin-bottom:10px;"></i>
            Đang tải thông tin ca đấu...</div>`;

        try {
            const [caDauList, datSlotList, reviewsOfCa] = await Promise.all([
                window.dbEngine.doc("ca_dau", { eq: { id: idCaDau } }),
                window.dbEngine.doc("dat_slot", { eq: { id_ca_dau: idCaDau } }),
                window.dbEngine.doc("danh_gia_tin_dung", { eq: { id_ca_dau: idCaDau } }).catch(() => [])
            ]);
            const s = caDauList[0];
            if (!s) {
                body.innerHTML = `<p style="color:#ef4444;text-align:center;padding:20px;">Không tìm thấy ca đấu.</p>`;
                return;
            }

            // Tiêu đề modal
            if (title) title.innerHTML = `<i class="fa-solid fa-location-dot" style="color:#00ff88;margin-right:6px;"></i>${s.ten_san || "Ca Đấu"}`;

            // Dữ liệu hiển thị
            const td      = s.yeu_cau_trinh_do || {};
            const baoGom  = s.tien_ich_bao_gom || {};
            const dateStr = s.ngay_danh ? new Date(s.ngay_danh).toLocaleDateString("vi-VN", { weekday:"long", day:"2-digit", month:"2-digit", year:"numeric" }) : "--";
            const tichArr = [];
            if (baoGom.san)    tichArr.push("🏟️ Tiền sân");
            if (baoGom.cau)    tichArr.push("🏸 Tiền cầu");
            if (baoGom.nuoc)   tichArr.push("💧 Nước uống");
            if (baoGom.gui_xe) tichArr.push("🏍️ Gửi xe");

            const mapsUrl = s.link_maps
                ? s.link_maps
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.dia_chi_san || s.ten_san || "")}`;

            // Kiểm tra trạng thái ĐANG DIỄN RA (trùng logic với _taoCaCard)
            const nowModal = new Date();
            const isStartedModal = (() => {
                if (!s.ngay_danh || !s.gio_bat_dau) return false;
                const [hh, mm] = (s.gio_bat_dau || "").split(":").map(Number);
                const st = new Date(s.ngay_danh);
                st.setHours(hh || 0, mm || 0, 0, 0);
                return st <= nowModal;
            })();
            const khoachDaKyAll = datSlotList.filter(g => g.trang_thai_di_danh !== "Khách hủy");
            const isFullModal = s.tong_slot_can > 0 && khoachDaKyAll.length >= s.tong_slot_can;
            const isLockedModal = isStartedModal || isFullModal;

            // Danh sách khách đã đăng ký (ẩn SĐT)
            const khoachDaKy = khoachDaKyAll;
            const guestListHTML = khoachDaKy.length > 0
                ? khoachDaKy.map(g => `
                    <div class="kh-modal-guest-row">
                        <span style="font-weight:600;">${g.ten_khach}</span>
                        <span style="font-size:0.7rem;color:#64748b;">${g.ma_slot}</span>
                        <span style="font-size:0.7rem;color:${
                            g.trang_thai_di_danh === "Đã tham gia" ? "#00ff88"
                            : g.trang_thai_di_danh === "Bùng kèo" ? "#ef4444" : "#fbbf24"
                        };">${g.trang_thai_di_danh}</span>
                    </div>`).join("")
                : `<p style="font-size:0.8rem;color:#64748b;text-align:center;padding:8px 0;">Chưa có ai đăng ký.</p>`;

            body.innerHTML = `
            <!-- Địa điểm -->
            <div class="kh-modal-section">
                <div class="kh-modal-section-title"><i class="fa-solid fa-map-pin"></i> Địa Điểm & Thời Gian</div>
                <div class="kh-modal-info-grid">
                    <div class="kh-modal-info-item">
                        <div class="kh-modal-info-lbl">Ngày đánh</div>
                        <div class="kh-modal-info-val">${dateStr}</div>
                    </div>
                    <div class="kh-modal-info-item">
                        <div class="kh-modal-info-lbl">Giờ chơi</div>
                        <div class="kh-modal-info-val">${s.gio_bat_dau || "--"} – ${s.gio_ket_thuc || "--"} (${s.so_gio_choi || 0}h)</div>
                    </div>
                    <div class="kh-modal-info-item" style="grid-column:1/-1;">
                        <div class="kh-modal-info-lbl">Địa chỉ sân</div>
                        <div class="kh-modal-info-val" style="font-size:0.8rem;">${s.dia_chi_san || "--"}</div>
                        <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">${s.quan_huyen || ""} · ${s.tinh_thanh || ""}</div>
                    </div>
                </div>
                <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
                    style="display:inline-flex;align-items:center;gap:6px;color:#00ff88;font-size:0.8rem;font-weight:600;
                    margin-top:8px;padding:6px 12px;border-radius:8px;background:rgba(0,255,136,0.08);
                    border:1px solid rgba(0,255,136,0.3);text-decoration:none;transition:all 0.2s;">
                    <i class="fa-solid fa-map-location-dot"></i> Xem trên Google Maps
                </a>
            </div>

            <!-- Yêu cầu & Giá -->
            <div class="kh-modal-section">
                <div class="kh-modal-section-title"><i class="fa-solid fa-sliders"></i> Yêu Cầu & Giá Vé</div>
                <div class="kh-modal-info-grid">
                    <div class="kh-modal-info-item">
                        <div class="kh-modal-info-lbl">Giới tính</div>
                        <div class="kh-modal-info-val">${s.gioi_tinh_can || "--"}</div>
                    </div>
                    <div class="kh-modal-info-item">
                        <div class="kh-modal-info-lbl">Trình độ Nam</div>
                        <div class="kh-modal-info-val" style="font-size:0.76rem;">${(td.nam || []).join(", ") || "--"}</div>
                    </div>
                    <div class="kh-modal-info-item">
                        <div class="kh-modal-info-lbl">Trình độ Nữ</div>
                        <div class="kh-modal-info-val" style="font-size:0.76rem;">${(td.nu || []).join(", ") || "--"}</div>
                    </div>
                    <div class="kh-modal-info-item">
                        <div class="kh-modal-info-lbl">Sân số</div>
                        <div class="kh-modal-info-val">${s.so_san_cu_the ? _formatSanSo(s.so_san_cu_the) : "--"} (${s.so_san_mo || 1} sân)</div>
                    </div>
                    <div class="kh-modal-info-item">
                        <div class="kh-modal-info-lbl">Giá Nam ♂</div>
                        <div class="kh-modal-info-val" style="color:#60a5fa;">${_formatVND(s.gia_nam)}</div>
                    </div>
                    <div class="kh-modal-info-item">
                        <div class="kh-modal-info-lbl">Giá Nữ ♀</div>
                        <div class="kh-modal-info-val" style="color:#f472b6;">${_formatVND(s.gia_nu)}</div>
                    </div>
                </div>
                ${tichArr.length > 0 ? `<p style="font-size:0.78rem;color:#94a3b8;margin-top:8px;">
                    <i class="fa-solid fa-check" style="color:#00ff88;margin-right:4px;"></i>
                    Giá đã bao gồm: ${tichArr.join(" · ")}</p>` : ""}
            </div>

            <!-- Danh sách đã đăng ký -->
            <div class="kh-modal-section">
                <div class="kh-modal-section-title">
                    <i class="fa-solid fa-users"></i> Người Đã Đăng Ký (${khoachDaKy.length} người)
                </div>
                ${guestListHTML}
            </div>

            <!-- Nút ĐẶT SLOT -->
            ${s.da_chot_ca
                ? `<div style="text-align:center;padding:10px;font-size:0.82rem;color:#64748b;">
                    <i class="fa-solid fa-lock" style="color:#fbbf24;margin-right:6px;"></i>Ca đấu đã được chốt.
                   </div>`
                : isLockedModal
                    ? `<div style="text-align:center;padding:10px;font-size:0.82rem;color:#64748b;background:rgba(71,85,105,0.2);border-radius:8px;border:1px solid rgba(71,85,105,0.3);">
                        <i class="fa-solid fa-hourglass-half" style="color:#fbbf24;margin-right:6px;"></i>
                        ${isStartedModal ? "Ca đấu đang diễn ra — không nhận thêm đăng ký." : "Đã đủ slot tham gia."}
                       </div>`
                    : `<div style="padding-top:8px;border-top:1px solid var(--border);margin-top:8px;">
                        ${window.currentGuest
                            ? (() => {
                                const alreadyBooked = datSlotList.some(
                                    sl => sl.sdt_khach === window.currentGuest.sdt_khach
                                          && sl.trang_thai_di_danh !== "Khách hủy"
                                );
                                return alreadyBooked
                                    ? `<button class="btn-da-dat" style="width:100%;" disabled>
                                           <i class="fa-solid fa-circle-check"></i> ĐÃ ĐẶT SLOT
                                       </button>`
                                    : `<button class="btn-dat-slot" style="width:100%;" onclick="window.datSlot('${s.id}');window.dongModalChiTietKeo()">
                                           <i class="fa-solid fa-ticket"></i> ĐẶT SLOT THAM GIA
                                       </button>`;
                              })()
                            : `<div style="text-align:center;padding:4px 0;">
                                <p style="font-size:0.82rem;color:#64748b;margin-bottom:10px;">Đăng nhập để đặt slot tham gia ca này.</p>
                                <button class="btn-dat-slot" style="width:100%;"
                                    onclick="window.dongModalChiTietKeo();setTimeout(()=>{if(window.innerWidth<768)window.openLoginSheet?.();else{var s=document.getElementById('guestAuthPanel');if(s)s.scrollIntoView({behavior:'smooth'});}},200)">
                                    <i class="fa-solid fa-right-to-bracket"></i> Đăng nhập / Đăng ký
                                </button>
                               </div>`
                        }
                       </div>`
            }

            ${(() => {
                // FEAT-3: Hiện đánh giá công khai về ca này (GuestToHost)
                const gthReviews = reviewsOfCa.filter(r => r.loai_danh_gia === "GuestToHost");
                if (gthReviews.length === 0) return "";
                const avgSao = gthReviews.length > 0
                    ? (gthReviews.reduce((acc, r) => acc + (r.so_sao || 0), 0) / gthReviews.length).toFixed(1)
                    : null;
                const reviewItems = gthReviews
                    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                    .slice(0, 5)
                    .map(r => {
                        const ss   = Math.max(0, Math.min(5, r.so_sao || 0));
                        const strs = Array(5).fill(0).map((_, i) =>
                            `<i class="fa-solid fa-star" style="color:${i < ss ? "#fbbf24" : "#2d3748"};font-size:0.72rem;"></i>`
                        ).join("");
                        // Tên người viết (ẩn SĐT, chỉ hiện tên biệt danh từ sdt_nguoi_viet)
                        const writerSdt  = r.sdt_nguoi_viet || "";
                        const writerName = writerSdt
                            ? `<a href="#" class="review-author-link"
                                  onclick="event.preventDefault();window.xemHoSoCongKhai('${writerSdt.replace(/'/g,"\\'")}')">
                                  ${writerSdt.slice(-4).padStart(writerSdt.length, '·')}
                               </a>`
                            : "Khách";
                        return `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">
                                <div style="display:flex;gap:2px;">${strs}</div>
                                <span style="font-size:0.68rem;color:#9ca3af;">${writerName}</span>
                                <span style="font-size:0.65rem;color:#64748b;margin-left:auto;">
                                    ${r.created_at ? new Date(r.created_at).toLocaleDateString("vi-VN") : ""}
                                </span>
                            </div>
                            ${r.nhan_xet ? `<div style="font-size:0.77rem;color:#e2e8f0;line-height:1.4;">"${r.nhan_xet}"</div>` : ""}
                        </div>`;
                    }).join("");
                return `
                <div class="kh-modal-section" style="margin-top:8px;">
                    <div class="kh-modal-section-title">
                        <i class="fa-solid fa-star" style="color:#fbbf24;"></i>
                        Đánh Giá Về Ca Này
                        ${avgSao ? `<span style="font-size:0.78rem;color:#fbbf24;font-weight:700;margin-left:auto;">⭐ ${avgSao} (${gthReviews.length})</span>` : ""}
                    </div>
                    ${reviewItems}
                </div>`;
            })()}`;
        } catch (e) {
            console.error("Lỗi tải chi tiết kèo:", e);
            body.innerHTML = `<p style="color:#ef4444;text-align:center;padding:20px;">Lỗi tải dữ liệu. Thử lại sau.</p>`;
        }
    };

    window.dongModalChiTietKeo = function () {
        const overlay = document.getElementById("modalChiTietKeoOverlay");
        if (overlay) overlay.style.display = "none";
    };

    /* ═══════════════════════════════════════════════════
     * GĐ3B — HUỶ ĐẶT SLOT
     * UPDATE trang_thai_di_danh = "Khách hủy" (KHÔNG DELETE bản ghi)
     * Điều kiện: ca chưa chốt (da_chot_ca = false)
     * ═══════════════════════════════════════════════════ */
    window.huyDatSlot = async function (datSlotId, idCaDau) {
        if (!confirm("Xác nhận huỷ tham gia ca này?\nThao tác không thể hoàn tác. Bạn sẽ không thể đặt lại slot này.")) return;
        try {
            // Kiểm tra ca đấu có bị chốt chưa
            const caDauList = await window.dbEngine.doc("ca_dau", { eq: { id: idCaDau } });
            const caDau = caDauList[0];
            if (caDau?.da_chot_ca) {
                window.hienToast("Không thể huỷ", "Ca đấu đã được chốt. Liên hệ trực tiếp chủ sân.", "warning");
                return;
            }
            // Cập nhật trạng thái — KHÔNG xóa bản ghi
            await window.dbEngine.ghi("dat_slot", { trang_thai_di_danh: "Khách hủy" }, { id: datSlotId });
            window.hienToast("Đã huỷ đăng ký", "Bạn đã huỷ tham gia ca này thành công.", "info");
            // Reload các section liên quan
            await Promise.all([_taiThongKeKhach(), _taiLichSuDau()]);
            window.timKiemCaDau();
        } catch (e) {
            console.error("Lỗi huỷ slot:", e);
            window.hienToast("Lỗi", "Không thể huỷ đăng ký. Thử lại sau.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * GĐ3B phụ — DANH SÁCH CA ĐÃ ĐĂNG KÝ
     * Hiện tất cả dat_slot của khách kèm nút Huỷ nếu đủ điều kiện
     * ═══════════════════════════════════════════════════ */
    async function _taiDaKySlot() {
        if (!window.currentGuest) return;
        const container = document.getElementById("danhSachDaKySlot");
        if (!container) return;

        try {
            const [myDatSlots, allCaDau] = await Promise.all([
                window.dbEngine.doc("dat_slot", { eq: { sdt_khach: window.currentGuest.sdt_khach } }),
                window.dbEngine.doc("ca_dau")
            ]);
            const caDauMap = {};
            allCaDau.forEach(c => { caDauMap[c.id] = c; });

            // Sắp xếp: mới nhất lên đầu (theo thoi_gian_dat)
            myDatSlots.sort((a, b) => new Date(b.thoi_gian_dat || 0) - new Date(a.thoi_gian_dat || 0));

            // Chỉ hiện 10 slot gần nhất
            const hienThi = myDatSlots.slice(0, 10);

            if (hienThi.length === 0) {
                container.innerHTML = `<p style="font-size:0.78rem;color:#64748b;text-align:center;padding:10px 0;">
                    Bạn chưa đăng ký ca đấu nào.</p>`;
                return;
            }

            container.innerHTML = hienThi.map(slot => {
                const ca        = caDauMap[slot.id_ca_dau];
                const tenSan    = ca?.ten_san    || "Ca đấu";
                const ngayDanh  = ca?.ngay_danh  ? new Date(ca.ngay_danh).toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit" }) : "--";
                const gioBD     = ca?.gio_bat_dau || "";
                const da_chot   = ca?.da_chot_ca  || false;

                // Màu trạng thái
                const ttColor = slot.trang_thai_di_danh === "Đã tham gia" ? "#00ff88"
                    : slot.trang_thai_di_danh === "Bùng kèo"   ? "#ef4444"
                    : slot.trang_thai_di_danh === "Khách hủy"  ? "#9ca3af" : "#fbbf24";

                // Điều kiện hiện nút Huỷ: chưa bị chốt + đang "Chờ đánh"
                const coTheHuy = !da_chot && slot.trang_thai_di_danh === "Chờ đánh";

                return `<div class="kh-slot-row">
                    <div class="kh-slot-info">
                        <div class="kh-slot-san">${tenSan}</div>
                        <div class="kh-slot-meta">${ngayDanh}${gioBD ? " · " + gioBD : ""} · <span style="color:${ttColor};font-weight:600;">${slot.trang_thai_di_danh === "Khách hủy" ? "Đã Huỷ" : slot.trang_thai_di_danh}</span></div>
                        <div class="kh-slot-meta" style="color:#64748b;">${slot.ma_slot || ""}</div>
                    </div>
                    ${coTheHuy
                        ? `<button class="kh-btn-huy" onclick="window.huyDatSlot('${slot.id}','${slot.id_ca_dau}')">
                            <i class="fa-solid fa-xmark"></i> Huỷ
                           </button>`
                        : ""}
                </div>`;
            }).join("");

            if (myDatSlots.length > 10) {
                container.innerHTML += `<p style="font-size:0.72rem;color:#64748b;text-align:center;margin-top:8px;">
                    Đang hiện 10 / ${myDatSlots.length} slot gần nhất</p>`;
            }
        } catch (e) {
            console.error("Lỗi tải danh sách đã ký:", e);
            container.innerHTML = `<p style="font-size:0.78rem;color:#ef4444;">Lỗi tải dữ liệu.</p>`;
        }
    }

    /* ═══════════════════════════════════════════════════
     * GĐ3C — LỊCH SỬ CHI TIÊU CHI TIẾT
     * Chỉ tính tiền khi da_chot_ca = true + "Đã tham gia"
     * Ca chưa chốt → badge "Chờ chốt ca", giá để "--"
     * Ca hủy → badge "Đã hủy", không tính tiền
     * ═══════════════════════════════════════════════════ */
    async function _taiLichSuChiTieu() {
        if (!window.currentGuest) return;
        const container = document.getElementById("chiTietLichSuChiTieu");
        if (!container) return;

        const fromDate = document.getElementById("statsDateFrom")?.value;
        const toDate   = document.getElementById("statsDateTo")?.value;

        try {
            const [myDatSlots, allCaDau] = await Promise.all([
                window.dbEngine.doc("dat_slot", { eq: { sdt_khach: window.currentGuest.sdt_khach } }),
                window.dbEngine.doc("ca_dau")
            ]);
            const caDauMap = {};
            allCaDau.forEach(c => { caDauMap[c.id] = c; });

            // Gắn thông tin ca vào từng slot + lọc theo khoảng thời gian
            const withCa = myDatSlots
                .map(slot => ({ slot, ca: caDauMap[slot.id_ca_dau] }))
                .filter(({ ca }) => {
                    if (!ca) return false;
                    if (fromDate && ca.ngay_danh && ca.ngay_danh < fromDate) return false;
                    if (toDate   && ca.ngay_danh && ca.ngay_danh > toDate)   return false;
                    return true;
                })
                .sort((a, b) => {
                    // Sắp xếp theo ngày đánh mới nhất trước
                    const da = a.ca?.ngay_danh || "";
                    const db = b.ca?.ngay_danh || "";
                    return db.localeCompare(da);
                });

            if (withCa.length === 0) {
                container.innerHTML = `<p style="font-size:0.78rem;color:#64748b;text-align:center;padding:10px 0;">
                    Không có dữ liệu trong khoảng thời gian này.</p>`;
                return;
            }

            // Tính tổng thực chi (chỉ da_chot_ca + Đã tham gia)
            let tongThucChi = 0;
            withCa.forEach(({ slot, ca }) => {
                if (ca.da_chot_ca && slot.trang_thai_di_danh === "Đã tham gia") {
                    const gia = slot.gioi_tinh === "female" ? (ca.gia_nu || 0) : (ca.gia_nam || 0);
                    tongThucChi += gia;
                }
            });

            // Giới hạn hiển thị 15 dòng, còn lại ẩn
            let _showAll = false;
            const LIMIT = 15;

            const renderItems = (items) => items.map(({ slot, ca }) => {
                const ngayStr = ca.ngay_danh
                    ? new Date(ca.ngay_danh).toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric" })
                    : "--";
                const tenSan = ca.ten_san || "Ca đấu";
                const tinh   = ca.tinh_thanh || "";

                // Xác định giá và badge trạng thái
                let priceHTML = "";
                let badgeHTML = "";

                if (slot.trang_thai_di_danh === "Khách hủy") {
                    priceHTML = `<span style="color:#9ca3af;">0đ</span>`;
                    badgeHTML = `<span class="kh-badge-tt kh-badge-huy">Đã hủy</span>`;
                } else if (slot.trang_thai_di_danh === "Bùng kèo") {
                    priceHTML = `<span style="color:#9ca3af;">--</span>`;
                    badgeHTML = `<span class="kh-badge-tt kh-badge-bung">Bùng kèo</span>`;
                } else if (ca.da_chot_ca && slot.trang_thai_di_danh === "Đã tham gia") {
                    const gia = slot.gioi_tinh === "female" ? (ca.gia_nu || 0) : (ca.gia_nam || 0);
                    priceHTML = `<span style="color:#00ff88;font-weight:700;">${_formatVND(gia)}</span>`;
                    badgeHTML = `<span class="kh-badge-tt kh-badge-ok">Đã chốt</span>`;
                } else if (!ca.da_chot_ca && slot.trang_thai_di_danh === "Đã tham gia") {
                    priceHTML = `<span style="color:#fbbf24;">Chờ chốt</span>`;
                    badgeHTML = `<span class="kh-badge-tt kh-badge-cho">Chờ chốt ca</span>`;
                } else {
                    // Chờ đánh — ca chưa chốt
                    priceHTML = `<span style="color:#fbbf24;">--</span>`;
                    badgeHTML = `<span class="kh-badge-tt kh-badge-cho">Chờ đánh</span>`;
                }

                return `<div class="kh-history-item">
                    <div>
                        <div class="kh-history-san">${tenSan}</div>
                        <div class="kh-history-date">${ngayStr}${tinh ? " · " + tinh : ""}</div>
                        ${badgeHTML}
                    </div>
                    <div class="kh-history-price">${priceHTML}</div>
                </div>`;
            }).join("");

            const summaryHTML = `<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px;
                display:flex;justify-content:space-between;font-size:0.82rem;font-weight:700;">
                <span style="color:var(--text-muted);">Tổng thực chi (ca đã chốt)</span>
                <span style="color:#00ff88;">${_formatVND(tongThucChi)}</span>
            </div>`;

            if (withCa.length <= LIMIT) {
                container.innerHTML = renderItems(withCa) + summaryHTML;
            } else {
                container.innerHTML = renderItems(withCa.slice(0, LIMIT))
                    + `<button onclick="this.outerHTML='${renderItems(withCa.slice(LIMIT)).replace(/'/g, "\\'") + summaryHTML.replace(/'/g, "\\'")}'"
                        style="width:100%;margin-top:8px;padding:8px;border-radius:8px;border:1px solid var(--border);
                        background:transparent;color:var(--text-muted);font-size:0.78rem;cursor:pointer;font-family:inherit;">
                        <i class="fa-solid fa-chevron-down"></i> Xem thêm ${withCa.length - LIMIT} dòng
                    </button>`
                    + summaryHTML;
            }
        } catch (e) {
            console.error("Lỗi tải lịch sử chi tiêu:", e);
            container.innerHTML = `<p style="font-size:0.78rem;color:#ef4444;">Lỗi tải dữ liệu.</p>`;
        }
    }
    // Gán cho window để time filter có thể gọi
    window.locThongKeKhach = function() {
        _taiThongKeKhach();
    };

    /* ═══════════════════════════════════════════════════
     * GĐ3D — XEM ĐÁNH GIÁ CỦA HOST VỀ MÌNH
     * Query danh_gia_tin_dung WHERE sdt_nguoi_bi_danh_gia = myPhone
     * AND loai_danh_gia = "HostToGuest"
     * ═══════════════════════════════════════════════════ */
    async function _taiDanhGiaVeToi() {
        if (!window.currentGuest) return;
        const container = document.getElementById("danhGiaVeToiList");
        if (!container) return;

        try {
            const [reviews, allCaDau, allNguoiDung] = await Promise.all([
                window.dbEngine.doc("danh_gia_tin_dung", {
                    eq: {
                        sdt_nguoi_bi_danh_gia: window.currentGuest.sdt_khach,
                        loai_danh_gia:         "HostToGuest"
                    }
                }).catch(() => []),
                window.dbEngine.doc("ca_dau").catch(() => []),
                window.dbEngine.doc("nguoi_dung").catch(() => [])
            ]);

            const caDauMap = {};
            allCaDau.forEach(c => { caDauMap[c.id] = c; });

            // Map SĐT → tên người dùng (cho FEAT-3: clickable reviewer name)
            const nguoiDungMap = {};
            allNguoiDung.forEach(u => { if (u.sdt_khach) nguoiDungMap[u.sdt_khach] = u; });

            // Sắp xếp mới nhất trước
            reviews.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            // Hiện số sao trung bình
            const avgSaoEl = document.getElementById("avgSaoVeToi");
            if (avgSaoEl) {
                if (reviews.length > 0) {
                    const tb = (reviews.reduce((s, r) => s + (r.so_sao || 0), 0) / reviews.length).toFixed(1);
                    avgSaoEl.textContent = `⭐ ${tb} (${reviews.length})`;
                } else {
                    avgSaoEl.textContent = "";
                }
            }

            if (reviews.length === 0) {
                container.innerHTML = `<p style="font-size:0.78rem;color:#64748b;text-align:center;padding:10px 0;">
                    Chưa có đánh giá nào.</p>`;
                return;
            }

            container.innerHTML = reviews.map(r => {
                const soSao  = Math.max(0, Math.min(5, r.so_sao || 0));
                const stars  = Array(5).fill(0).map((_, i) =>
                    `<i class="fa-solid fa-star" style="color:${i < soSao ? "#fbbf24" : "#2d3748"};font-size:0.78rem;"></i>`
                ).join("");
                const ca     = caDauMap[r.id_ca_dau];
                const caInfo = ca ? `${ca.ten_san || ""}${ca.ngay_danh ? " · " + new Date(ca.ngay_danh).toLocaleDateString("vi-VN") : ""}` : "";

                // FEAT-3: Hiện tên người viết đánh giá (host) với link xem hồ sơ
                const reviewerSdt  = r.sdt_nguoi_viet || "";
                const reviewerUser = nguoiDungMap[reviewerSdt];
                const reviewerName = reviewerUser?.ten_khach || ca?.ten_san || "Chủ sân";
                const reviewerLink = reviewerSdt
                    ? `<a href="#" class="review-author-link"
                          onclick="event.preventDefault();window.xemHoSoCongKhai('${reviewerSdt.replace(/'/g,"\\'")}')">
                          <i class="fa-solid fa-user" style="font-size:0.62rem;margin-right:3px;"></i>${reviewerName}
                       </a>`
                    : `<span style="color:#9ca3af;">${reviewerName}</span>`;

                return `<div class="kh-review-about">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
                        <div class="kh-review-stars">${stars}</div>
                        <span style="font-size:0.68rem;color:#64748b;margin-left:auto;">${r.created_at ? new Date(r.created_at).toLocaleDateString("vi-VN") : ""}</span>
                    </div>
                    ${caInfo ? `<div style="font-size:0.7rem;color:#64748b;margin-bottom:3px;">
                        <i class="fa-solid fa-table-tennis-paddle-ball" style="color:#00ff88;margin-right:4px;"></i>${caInfo}</div>` : ""}
                    <div style="font-size:0.72rem;color:#9ca3af;margin-bottom:4px;">Từ Host: ${reviewerLink}</div>
                    ${r.nhan_xet
                        ? `<div style="font-size:0.78rem;color:var(--text-main);line-height:1.5;">"${r.nhan_xet}"</div>`
                        : `<div style="font-size:0.75rem;color:#64748b;font-style:italic;">Không có nhận xét</div>`}
                </div>`;
            }).join("");
        } catch (e) {
            console.error("Lỗi tải đánh giá về mình:", e);
            container.innerHTML = `<p style="font-size:0.78rem;color:#ef4444;">Lỗi tải dữ liệu.</p>`;
        }
    }

    /* ═══════════════════════════════════════════════════
     * GĐ-CÁ-NHÂN: TÔI ĐÃ ĐÁNH GIÁ
     * Query danh_gia_tin_dung WHERE sdt_nguoi_viet = myPhone AND loai = GuestToHost
     * Hiện danh sách với nút "Chi tiết" → mở modal ca đấu
     * ═══════════════════════════════════════════════════ */
    async function _taiDaGuiDanhGia() {
        if (!window.currentGuest) return;
        const container = document.getElementById("daGuiDanhGiaList");
        if (!container) return;

        try {
            const [myReviews, allCaDau] = await Promise.all([
                window.dbEngine.doc("danh_gia_tin_dung", {
                    eq: { sdt_nguoi_viet: window.currentGuest.sdt_khach, loai_danh_gia: "GuestToHost" }
                }).catch(() => []),
                window.dbEngine.doc("ca_dau").catch(() => [])
            ]);

            const caDauMap = {};
            allCaDau.forEach(c => { caDauMap[c.id] = c; });

            // Mới nhất trước
            myReviews.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            if (myReviews.length === 0) {
                container.innerHTML = `<p style="font-size:0.78rem;color:#64748b;text-align:center;padding:10px 0;">
                    Chưa gửi đánh giá nào.</p>`;
                return;
            }

            container.innerHTML = myReviews.map(r => {
                const soSao = Math.max(1, Math.min(5, r.so_sao || 1));
                const stars = Array(5).fill(0).map((_, i) =>
                    `<i class="fa-solid fa-star" style="color:${i < soSao ? "#fbbf24" : "#2d3748"};font-size:0.72rem;"></i>`
                ).join("");
                const ca = caDauMap[r.id_ca_dau];
                const caName = ca ? (ca.ten_san || "Ca đấu") : "Ca đấu";
                const caDate = ca?.ngay_danh ? " · " + new Date(ca.ngay_danh).toLocaleDateString("vi-VN") : "";
                return `<div class="kh-review-about">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">
                        <div class="kh-review-stars">${stars}</div>
                        <span style="font-size:0.68rem;color:#64748b;margin-left:auto;">
                            ${r.created_at ? new Date(r.created_at).toLocaleDateString("vi-VN") : ""}
                        </span>
                    </div>
                    <div style="font-size:0.7rem;color:#64748b;margin-bottom:3px;">
                        <i class="fa-solid fa-table-tennis-paddle-ball" style="color:#60a5fa;margin-right:4px;"></i>
                        ${r.id_ca_dau
                            ? `<button onclick="window.moModalChiTietKeo('${r.id_ca_dau}')"
                                style="background:none;border:none;padding:0;color:#60a5fa;
                                cursor:pointer;font-size:0.7rem;font-family:inherit;
                                text-decoration:underline;text-underline-offset:2px;">
                                ${caName}${caDate} →
                               </button>`
                            : `${caName}${caDate}`}
                    </div>
                    ${r.nhan_xet
                        ? `<div style="font-size:0.78rem;color:var(--text-main);line-height:1.5;">"${r.nhan_xet}"</div>`
                        : `<div style="font-size:0.75rem;color:#64748b;font-style:italic;">Không có nhận xét</div>`}
                </div>`;
            }).join("");
        } catch (e) {
            console.error("Lỗi tải đánh giá đã gửi:", e);
            container.innerHTML = `<p style="font-size:0.78rem;color:#ef4444;">Lỗi tải dữ liệu.</p>`;
        }
    }

    /* ═══════════════════════════════════════════════════
     * 8. SAO ĐÁNH GIÁ KHÁCH
     * ═══════════════════════════════════════════════════ */
    function _initStarGuest() {
        _initStarContainer("guestRatingStars", val => { _guestRatingVal = val; });
    }

    function _initStarContainer(id, onSelect) {
        const ctr = document.getElementById(id);
        if (!ctr) return;
        ctr.innerHTML = "";
        for (let i = 1; i <= 5; i++) {
            const s = document.createElement("i");
            s.className = "fa-solid fa-star star-item";
            s.dataset.val = i;
            s.addEventListener("click",      () => { onSelect(i); _capNhatStarUI(ctr, i); ctr.dataset.sel = i; });
            s.addEventListener("mouseenter", () => _capNhatStarUI(ctr, i, true));
            s.addEventListener("mouseleave", () => _capNhatStarUI(ctr, Number(ctr.dataset.sel) || 5));
            ctr.appendChild(s);
        }
        ctr.dataset.sel = 5;
        _capNhatStarUI(ctr, 5);
    }

    function _capNhatStarUI(ctr, val, isHover = false) {
        if (!isHover) ctr.dataset.sel = val;
        ctr.querySelectorAll(".star-item").forEach((s, i) => {
            s.style.color     = i < val ? "#fbbf24" : "#374151";
            s.style.transform = i < val ? "scale(1.1)" : "scale(1)";
        });
    }

    /* ═══════════════════════════════════════════════════
     * 9. TIỆN ÍCH
     * ═══════════════════════════════════════════════════ */
    function _formatVND(n) {
        return Number(n || 0).toLocaleString("vi-VN") + "đ";
    }

    /**
     * Chuẩn hóa chuỗi "sân số" nhập tự do thành dạng đẹp.
     * Các input hỗ trợ:
     *   "1,2"              → "Sân 1, Sân 2"
     *   "1.2"              → "Sân 1, Sân 2"
     *   "sân 1, sân 2"     → "Sân 1, Sân 2"
     *   "sân số 1, sân số 2" → "Sân 1, Sân 2"
     *   "3"                → "Sân 3"
     *   "A, B"             → "Sân A, Sân B"
     */
    function _formatSanSo(raw) {
        if (!raw || !raw.trim()) return "";
        // Tách bằng dấu phẩy HOẶC dấu chấm (dùng làm separator)
        const parts = raw
            .split(/[,，.]+/)
            .map(p => p.trim())
            // Loại bỏ tiền tố "sân số", "sân", "san so", "san" (không phân biệt hoa thường)
            .map(p => p.replace(/^(sân\s+số|sân|san\s+so|san)\s*/i, "").trim())
            .filter(p => p.length > 0);
        if (parts.length === 0) return raw;
        return parts.map(p => `Sân ${p}`).join(", ");
    }

    /* ═══════════════════════════════════════════════════
     * 10. KHỞI ĐỘNG KHI LOAD TRANG
     * ═══════════════════════════════════════════════════ */
    document.addEventListener("DOMContentLoaded", () => {
        const check = setInterval(() => {
            if (window.khoiTaoTheme && window.khoiTaoHologramGlow && window.dbEngine) {
                clearInterval(check);
                window.khoiTaoTheme();
                window.khoiTaoHologramGlow();
                window.khoiTaoTrangKhach();
            }
        }, 100);
    });

    /* ═══════════════════════════════════════════════════
     * FIX 12 — ACCORDION TOGGLE cho 4 card phụ sidebar
     * ═══════════════════════════════════════════════════ */
    window.toggleAccordion = function (bodyId, headerEl) {
        const body  = document.getElementById(bodyId);
        const arrow = headerEl ? headerEl.querySelector(".acc-arrow") : null;
        if (!body) return;
        const isOpen = body.classList.contains("open");
        body.classList.toggle("open", !isOpen);
        if (arrow) arrow.classList.toggle("open", !isOpen);
    };

    /* ═══════════════════════════════════════════════════
     * LỊCH SỬ ĐẤU — Tổng hợp lịch sử, chi tiêu, đánh giá
     * Gộp: CA ĐÃ ĐĂNG KÝ + LỊCH SỬ CHI TIÊU + ĐÁNH GIÁ HOST
     * ═══════════════════════════════════════════════════ */
    let _lsdFromDate = null;
    let _lsdToDate   = null;

    /**
     * Bộ lọc thời gian cho lịch sử đấu — gọi khi bấm các nút Tuần/Tháng/Năm/Tất cả
     */
    window.locLichSuDau = function(type, btn) {
        // Cập nhật active cho filter buttons lịch sử
        document.querySelectorAll(".kh-ls-filter-btn").forEach(b => b.classList.remove("active"));
        if (btn) btn.classList.add("active");

        const now   = new Date();
        const today = now.toISOString().split("T")[0];

        if (type === "week") {
            const mon = new Date(now);
            mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Thứ 2 tuần này
            _lsdFromDate = mon.toISOString().split("T")[0];
            _lsdToDate   = today;
        } else if (type === "month") {
            _lsdFromDate = today.substring(0, 7) + "-01";
            _lsdToDate   = today;
        } else if (type === "year") {
            _lsdFromDate = today.substring(0, 4) + "-01-01";
            _lsdToDate   = today;
        } else {
            _lsdFromDate = null;
            _lsdToDate   = null;
        }

        _taiLichSuDau();
    };

    /**
     * Render inline star rating cho inline review form
     */
    function _renderInlineStars(container, rating, slotId) {
        if (!container) return;
        container.innerHTML = Array(5).fill(0).map((_, i) =>
            `<span class="kh-star ${i < rating ? "filled" : ""}"
                  onclick="window._setInlineStar('${slotId}', ${i + 1})"
                  style="cursor:pointer;font-size:1.5rem;">★</span>`
        ).join("");
        container.dataset.rating = String(rating);
    }

    window._setInlineStar = function(slotId, val) {
        const starEl = document.getElementById("stars_" + slotId);
        if (starEl) _renderInlineStars(starEl, val, slotId);
    };

    /**
     * Toggle mở/đóng phần chi tiết của một item lịch sử
     */
    window._toggleLsItem = function(itemId) {
        const body = document.getElementById("body_" + itemId);
        const icon = document.getElementById("icon_" + itemId);
        if (!body) return;
        const isOpen = body.style.display !== "none";
        body.style.display = isOpen ? "none" : "block";
        if (icon) icon.className = isOpen ? "fa-solid fa-chevron-down" : "fa-solid fa-chevron-up";
    };

    /**
     * BUG-3 FIX: Copy mã slot vào clipboard
     */
    window._copyMaSlot = async function(ma) {
        try {
            await navigator.clipboard.writeText(ma);
        } catch {
            /* Fallback cho trình duyệt cũ */
            const t = document.createElement("textarea");
            t.value = ma;
            document.body.appendChild(t);
            t.select();
            document.execCommand("copy");
            document.body.removeChild(t);
        }
        window.hienToast("Đã sao chép! ✅", `Mã slot: ${ma}`, "success");
    };

    /**
     * Gửi đánh giá host từ inline form trong LỊCH SỬ ĐẤU
     */
    window.guiDanhGiaHostInline = async function(caDauId, slotId) {
        if (!window.currentGuest) {
            window.hienToast("Chưa đăng nhập", "Vui lòng đăng nhập trước.", "warning");
            return;
        }

        const starEl    = document.getElementById("stars_" + slotId);
        const commentEl = document.getElementById("comment_" + slotId);
        const soSao     = parseInt(starEl?.dataset?.rating || "5", 10);
        const comment   = (commentEl?.value || "").trim() || null;
        const myPhone   = window.currentGuest.sdt_khach;

        try {
            // Kiểm tra đã đánh giá chưa
            const existed = await window.dbEngine.doc("danh_gia_tin_dung", {
                eq: { id_ca_dau: caDauId, sdt_nguoi_viet: myPhone, loai_danh_gia: "GuestToHost" }
            }).catch(() => []);
            if (existed.length > 0) {
                window.hienToast("Đã đánh giá", "Bạn đã gửi đánh giá cho ca này rồi.", "warning");
                return;
            }

            // Lấy SĐT host từ ca_dau → quan_ly_key
            const caDauList = await window.dbEngine.doc("ca_dau", { eq: { id: caDauId } });
            const caDau     = caDauList[0];
            let hostPhone   = caDau?.ma_key_host || "";
            if (caDau?.ma_key_host) {
                const keyList = await window.dbEngine.doc("quan_ly_key",
                    { eq: { ma_key: caDau.ma_key_host } }).catch(() => []);
                if (keyList[0]?.sdt_host) hostPhone = keyList[0].sdt_host;
            }

            await window.dbEngine.ghi("danh_gia_tin_dung", {
                id_ca_dau:             caDauId,
                sdt_nguoi_viet:        myPhone,
                sdt_nguoi_bi_danh_gia: hostPhone,
                loai_danh_gia:         "GuestToHost",
                so_sao:                soSao,
                nhan_xet:              comment
            });

            window.hienToast("Đánh giá thành công! ⭐", `Đã gửi ${soSao} sao cho chủ sân.`, "success");
            _taiLichSuDau(); // Reload để cập nhật trạng thái
        } catch (e) {
            console.error("Lỗi gửi đánh giá inline:", e);
            window.hienToast("Lỗi", "Không gửi được đánh giá.", "danger");
        }
    };

    /**
     * Tải và render toàn bộ LỊCH SỬ ĐẤU
     */
    async function _taiLichSuDau() {
        if (!window.currentGuest) return;
        const timeline = document.getElementById("lichSuTimeline");
        const statsEl  = document.getElementById("lichSuStats");
        if (!timeline) return;

        timeline.innerHTML = `<div class="kh-loading">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải lịch sử...</div>`;

        try {
            const myPhone = window.currentGuest.sdt_khach;
            const [myDatSlots, allCaDau, myReviews] = await Promise.all([
                window.dbEngine.doc("dat_slot", { eq: { sdt_khach: myPhone } }),
                window.dbEngine.doc("ca_dau"),
                window.dbEngine.doc("danh_gia_tin_dung", {
                    eq: { sdt_nguoi_viet: myPhone, loai_danh_gia: "GuestToHost" }
                }).catch(() => [])
            ]);

            const caDauMap   = {};
            allCaDau.forEach(c => { caDauMap[c.id] = c; });

            // Set ID ca đấu đã review
            const reviewedSet = new Set(myReviews.map(r => r.id_ca_dau));

            // Join + filter theo khoảng thời gian
            const withCa = myDatSlots
                .map(slot => ({ slot, ca: caDauMap[slot.id_ca_dau] }))
                .filter(({ ca }) => {
                    if (!ca) return false;
                    if (_lsdFromDate && ca.ngay_danh && ca.ngay_danh < _lsdFromDate) return false;
                    if (_lsdToDate   && ca.ngay_danh && ca.ngay_danh > _lsdToDate)   return false;
                    return true;
                })
                .sort((a, b) => {
                    const da = a.ca?.ngay_danh || "";
                    const db = b.ca?.ngay_danh || "";
                    return db.localeCompare(da);
                });

            // Tính stats nhanh
            let soThamGia = 0, tongChi = 0, choDanh = 0, daHuy = 0, daBung = 0;
            withCa.forEach(({ slot, ca }) => {
                const tt = slot.trang_thai_di_danh;
                if (tt === "Đã tham gia") {
                    soThamGia++;
                    if (ca.da_chot_ca) {
                        tongChi += slot.gioi_tinh === "female" ? (ca.gia_nu || 0) : (ca.gia_nam || 0);
                    }
                } else if (tt === "Chờ đánh")  { choDanh++; }
                else if (tt === "Khách hủy")   { daHuy++; }
                else if (tt === "Bùng kèo")    { daBung++; }
            });

            // Render stats grid — hàng 1: 2 card lớn; hàng 2: 3 card nhỏ cùng tổng width
            if (statsEl) {
                const _card = (val, color, icon, lbl) =>
                    `<div class="kh-stat-badge">
                        <div class="kh-stat-val" style="color:${color};">${val}</div>
                        <div class="kh-stat-lbl"><i class="fa-solid ${icon}"></i> ${lbl}</div>
                    </div>`;
                statsEl.innerHTML = `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        ${_card(soThamGia,           "#00ff88", "fa-flag-checkered",      "Đã tham gia")}
                        ${_card(_formatVND(tongChi), "#60a5fa", "fa-wallet",              "Tổng chi"   )}
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                        ${_card(choDanh, "#fbbf24", "fa-clock",                "Chờ đánh")}
                        ${_card(daBung,  "#ef4444", "fa-triangle-exclamation", "Đã bùng" )}
                        ${_card(daHuy,   "#9ca3af", "fa-circle-xmark",         "Đã hủy"  )}
                    </div>`;
            }

            if (withCa.length === 0) {
                timeline.innerHTML = `<div class="kh-empty">
                    <i class="fa-solid fa-calendar-xmark"></i>
                    <p>Chưa có lịch sử đấu trong khoảng thời gian này.</p>
                </div>`;
                return;
            }

            // Map màu, icon, nhãn hiển thị theo trạng thái
            // Chú ý: key = giá trị DB, label = text hiển thị cho khách
            const ttMap = {
                "Đã tham gia": { color: "#00ff88", bg: "rgba(0,255,136,0.1)",   icon: "fa-circle-check",         label: "Đã Tham Gia" },
                "Chờ đánh":    { color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  icon: "fa-clock",                label: "Chờ Đánh"    },
                "Khách hủy":   { color: "#9ca3af", bg: "rgba(156,163,175,0.1)", icon: "fa-circle-xmark",         label: "Đã Huỷ"      },
                "Bùng kèo":    { color: "#ef4444", bg: "rgba(239,68,68,0.1)",   icon: "fa-triangle-exclamation", label: "Bùng Kèo"    },
            };

            // Render timeline items
            timeline.innerHTML = withCa.map(({ slot, ca }) => {
                const ngayStr = ca.ngay_danh
                    ? new Date(ca.ngay_danh).toLocaleDateString("vi-VN", {
                        weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
                    : "--";
                const tt      = ttMap[slot.trang_thai_di_danh] || { color: "#9ca3af", bg: "rgba(156,163,175,0.1)", icon: "fa-question", label: slot.trang_thai_di_danh };
                const itemId  = "lsItem_" + slot.id;
                const baoGom  = ca.tien_ich_bao_gom || {};
                const tichArr = [];
                if (baoGom.san)    tichArr.push("🏟️ Sân");
                if (baoGom.cau)    tichArr.push("🏸 Cầu");
                if (baoGom.nuoc)   tichArr.push("💧 Nước");
                if (baoGom.gui_xe) tichArr.push("🏍️ Xe");

                // Giá tiền hiển thị
                let priceHTML = "";
                if (ca.da_chot_ca && slot.trang_thai_di_danh === "Đã tham gia") {
                    const gia = slot.gioi_tinh === "female" ? (ca.gia_nu || 0) : (ca.gia_nam || 0);
                    priceHTML = `<span style="font-weight:700;color:#00ff88;font-size:0.88rem;">${_formatVND(gia)}</span>`;
                } else if (!ca.da_chot_ca && slot.trang_thai_di_danh === "Đã tham gia") {
                    priceHTML = `<span style="color:#fbbf24;font-size:0.72rem;">Chờ chốt</span>`;
                } else if (slot.trang_thai_di_danh === "Khách hủy") {
                    priceHTML = `<span style="color:#9ca3af;font-size:0.72rem;">Đã hủy</span>`;
                }

                // Điều kiện đánh giá host
                const coTheReview = ca.da_chot_ca
                    && slot.trang_thai_di_danh === "Đã tham gia"
                    && !reviewedSet.has(ca.id);
                const daReview    = reviewedSet.has(ca.id);

                // Inline review form (chỉ hiện khi đủ điều kiện)
                let reviewSection = "";
                if (coTheReview) {
                    reviewSection = `
                    <div class="kh-ls-inline-review">
                        <div style="font-size:0.78rem;font-weight:700;color:#fbbf24;margin-bottom:8px;">
                            <i class="fa-solid fa-star"></i> Đánh giá Host Sân
                        </div>
                        <div class="kh-stars" id="stars_${slot.id}" style="margin-bottom:8px;"></div>
                        <textarea id="comment_${slot.id}" rows="3" maxlength="1000"
                            placeholder="Sân đẹp, host nhiệt tình, cầu tốt... (tối đa 1000 ký tự)"
                        ></textarea>
                        <div class="kh-ls-char-count" id="charCount_${slot.id}">0 / 1000 ký tự</div>
                        <button class="kh-ls-btn-review"
                                onclick="window.guiDanhGiaHostInline('${ca.id}','${slot.id}')">
                            <i class="fa-solid fa-paper-plane"></i> Gửi Đánh Giá
                        </button>
                    </div>`;
                } else if (daReview) {
                    reviewSection = `
                    <div style="font-size:0.78rem;color:#00ff88;display:flex;align-items:center;gap:6px;margin-top:6px;">
                        <i class="fa-solid fa-circle-check"></i> Đã đánh giá ca này
                    </div>`;
                } else if (slot.trang_thai_di_danh === "Đã tham gia" && !ca.da_chot_ca) {
                    reviewSection = `
                    <div style="font-size:0.72rem;color:#fbbf24;display:flex;align-items:center;gap:6px;margin-top:6px;">
                        <i class="fa-regular fa-clock"></i> Chờ Host chốt ca mới có thể đánh giá
                    </div>`;
                }

                // Nút hủy slot (nếu đang chờ và ca chưa chốt)
                const nutHuy = (!ca.da_chot_ca && slot.trang_thai_di_danh === "Chờ đánh")
                    ? `<button onclick="window.huyDatSlot('${slot.id}','${slot.id_ca_dau}')"
                           style="margin-top:6px;padding:4px 10px;border-radius:6px;
                                  border:1px solid rgba(239,68,68,0.5);background:rgba(239,68,68,0.06);
                                  color:#ef4444;font-size:0.72rem;cursor:pointer;font-family:inherit;
                                  display:inline-flex;align-items:center;gap:5px;">
                           <i class="fa-solid fa-xmark"></i> Huỷ đăng ký
                       </button>`
                    : "";

                return `
                <div class="kh-ls-item" id="${itemId}">
                    <!-- BUG-3 FIX: Toàn bộ đầu dòng đều clickable để toggle mở/đóng -->
                    <div class="kh-ls-item-head" onclick="window._toggleLsItem('${itemId}')"
                         style="cursor:pointer;">
                        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                            <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;
                                  border-radius:20px;background:${tt.bg};color:${tt.color};
                                  font-size:0.67rem;font-weight:700;white-space:nowrap;flex-shrink:0;">
                                <i class="fa-solid ${tt.icon}" style="font-size:0.58rem;"></i>
                                ${tt.label}
                            </span>
                            <div style="min-width:0;flex:1;">
                                <div style="font-weight:700;color:#e2e8f0;font-size:0.88rem;
                                     white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                    ${ca.ten_san || "Ca đấu"}
                                </div>
                                <div style="font-size:0.7rem;color:#9ca3af;margin-top:1px;">
                                    ${ngayStr}${ca.gio_bat_dau ? " · " + ca.gio_bat_dau : ""}${ca.tinh_thanh ? " · " + ca.tinh_thanh : ""}
                                </div>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                            ${priceHTML}
                            <!-- Nút icon — không gắn onclick riêng, sự kiện bubble lên head div -->
                            <span class="kh-ls-expand-btn" title="Xem chi tiết" style="pointer-events:none;">
                                <i class="fa-solid fa-chevron-down" id="icon_${itemId}"></i>
                            </span>
                        </div>
                    </div>
                    <!-- Body chi tiết (ẩn mặc định) -->
                    <div class="kh-ls-item-body" id="body_${itemId}" style="display:none;">
                        <div style="font-size:0.78rem;color:#9ca3af;margin-bottom:8px;">
                            <i class="fa-solid fa-map-pin" style="color:#00ff88;margin-right:4px;"></i>
                            ${ca.dia_chi_san || "Chưa có địa chỉ"}
                            ${ca.quan_huyen  ? " · " + ca.quan_huyen  : ""}
                            ${ca.tinh_thanh  ? " · " + ca.tinh_thanh  : ""}
                        </div>
                        ${tichArr.length > 0 ? `<div style="font-size:0.72rem;color:#9ca3af;margin-bottom:8px;">
                            Bao gồm: ${tichArr.join(" · ")}</div>` : ""}
                        <!-- BUG-3 FIX: Thêm nút copy mã slot -->
                        <div style="font-size:0.75rem;color:#64748b;margin-bottom:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                            Mã slot: <code style="color:#e2e8f0;background:rgba(255,255,255,0.05);
                                padding:2px 6px;border-radius:4px;">${slot.ma_slot || "--"}</code>
                            ${slot.ma_slot ? `<button onclick="event.stopPropagation();window._copyMaSlot('${slot.ma_slot}')"
                                style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);
                                color:#9ca3af;border-radius:4px;padding:2px 7px;font-size:0.68rem;
                                cursor:pointer;font-family:inherit;line-height:1.5;transition:background 0.15s;"
                                title="Sao chép mã slot">
                                <i class="fa-regular fa-copy"></i> Copy
                            </button>` : ""}
                        </div>
                        ${nutHuy}
                        ${reviewSection}
                    </div>
                </div>`;
            }).join("");

            // Khởi tạo star rating cho các inline form
            withCa.forEach(({ slot, ca }) => {
                const coTheReview = ca.da_chot_ca
                    && slot.trang_thai_di_danh === "Đã tham gia"
                    && !reviewedSet.has(ca.id);
                if (!coTheReview) return;

                const starEl = document.getElementById("stars_" + slot.id);
                if (starEl) _renderInlineStars(starEl, 5, slot.id);

                const textEl = document.getElementById("comment_" + slot.id);
                const cntEl  = document.getElementById("charCount_" + slot.id);
                if (textEl && cntEl) {
                    textEl.addEventListener("input", () => {
                        cntEl.textContent = `${textEl.value.length} / 1000 ký tự`;
                    });
                }
            });

        } catch (e) {
            console.error("Lỗi tải lịch sử đấu:", e);
            if (timeline) {
                timeline.innerHTML = `<div class="kh-empty">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>Lỗi tải dữ liệu. Thử lại sau.</p>
                </div>`;
            }
        }
    }
    // Gán ra ngoài để huyDatSlot và locThongKeKhach có thể gọi lại
    window._taiLichSuDau = function() { _taiLichSuDau(); };

    /* ═══════════════════════════════════════════════════
     * J4 — TAB TOGGLE MOBILE (Tìm Kèo / Trang Cá Nhân)
     * Chỉ hoạt động khi innerWidth < 768px; desktop không bị ảnh hưởng
     * ═══════════════════════════════════════════════════ */
    window.switchKhachTab = function(tab) {
        const sidebar = document.querySelector(".kh-sidebar");
        const right   = document.querySelector(".kh-right");
        const lichSu  = document.getElementById("lichSuDauSection");
        const btnKeo  = document.getElementById("tabTimKeo");
        const btnP    = document.getElementById("tabCaNhan");
        const btnLs   = document.getElementById("tabLichSu");

        if (window.innerWidth >= 768) return; // Desktop: không làm gì

        // Reset tất cả tab buttons
        [btnKeo, btnP, btnLs].forEach(b => b?.classList.remove("kh-tab-active"));

        // Nút TÌM KÈO NGAY: ẩn khi đang ở tab kèo, hiện khi ở tab khác
        const btnTimKeoMobile = document.getElementById("btnTimKeoMobile");

        if (tab === "keo") {
            if (sidebar) sidebar.style.display = "none";
            if (right)   right.style.display   = "flex";
            if (lichSu)  lichSu.classList.add("lich-su-hidden");
            btnKeo?.classList.add("kh-tab-active");
            if (btnTimKeoMobile) btnTimKeoMobile.classList.add("hidden-by-tab");
        } else if (tab === "profile") {
            if (sidebar) sidebar.style.display = "flex";
            if (right)   right.style.display   = "none";
            if (lichSu)  lichSu.classList.add("lich-su-hidden");
            btnP?.classList.add("kh-tab-active");
            if (btnTimKeoMobile) btnTimKeoMobile.classList.remove("hidden-by-tab");
            // Nếu chưa đăng nhập → mở bottom sheet login để user thấy form
            if (!window.currentGuest) setTimeout(() => window.openLoginSheet?.(), 80);
        } else if (tab === "history") {
            if (sidebar) sidebar.style.display = "none";
            if (right)   right.style.display   = "none";
            if (lichSu)  lichSu.classList.remove("lich-su-hidden");
            btnLs?.classList.add("kh-tab-active");
            if (btnTimKeoMobile) btnTimKeoMobile.classList.remove("hidden-by-tab");
            if (window.currentGuest) {
                _taiLichSuDau();
            } else {
                // Chưa đăng nhập → hiện prompt inline trong section lịch sử
                // KHÔNG gọi openLoginSheet() để tránh overlay tối toggle
                const timeline = document.getElementById("lichSuTimeline");
                const stats    = document.getElementById("lichSuStats");
                if (stats) stats.innerHTML = "";
                if (timeline) {
                    timeline.innerHTML = `
                    <div style="text-align:center;padding:50px 20px;">
                        <i class="fa-solid fa-user-lock" style="font-size:2.5rem;color:#334155;display:block;margin-bottom:16px;"></i>
                        <p style="color:#94a3b8;font-size:0.92rem;margin-bottom:20px;line-height:1.5;">
                            Vui lòng đăng nhập để<br>xem lịch sử đấu của bạn.
                        </p>
                        <button onclick="window.switchKhachTab('profile')"
                            style="background:linear-gradient(135deg,#00d97a,#00a855);border:none;color:#fff;
                            font-size:0.9rem;font-weight:700;padding:12px 28px;border-radius:12px;
                            cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:8px;">
                            <i class="fa-solid fa-right-to-bracket"></i> Đăng nhập / Đăng ký
                        </button>
                    </div>`;
                }
            }
        }
    };

    // Khởi tạo: ẩn sidebar, hiện right khi mobile mặc định (tab "Tìm Kèo" active)
    (function _initMobileTab() {
        if (window.innerWidth < 768) {
            const sidebar = document.querySelector(".kh-sidebar");
            const right   = document.querySelector(".kh-right");
            const lichSu  = document.getElementById("lichSuDauSection");
            if (sidebar) sidebar.style.display = "none";
            if (right)   right.style.display   = "flex";
            if (lichSu)  lichSu.classList.add("lich-su-hidden");
        }
    })();

    // Xử lý khi resize: cả hai chiều (PC→mobile và mobile→PC)
    window.addEventListener("resize", function() {
        const lichSu  = document.getElementById("lichSuDauSection");
        if (window.innerWidth >= 768) {
            // Desktop: reset sidebar và right về CSS mặc định
            const sidebar = document.querySelector(".kh-sidebar");
            const right   = document.querySelector(".kh-right");
            if (sidebar) sidebar.style.display = "";
            if (right)   right.style.display   = "";
            // Desktop: modal lịch sử đóng khi resize về desktop (tránh trạng thái lộn xộn)
            if (lichSu) lichSu.classList.add("lich-su-hidden");
            document.body.style.overflow = "";
        } else {
            // Mobile → đóng modal lịch sử nếu đang mở (dùng tab thay thế)
            if (lichSu) lichSu.classList.add("lich-su-hidden");
            document.body.style.overflow = "";
            // Áp dụng trạng thái tab đang active
            const activeBtn = document.querySelector(".kh-tab-btn.kh-tab-active");
            if (activeBtn) {
                if (activeBtn.id === "tabCaNhan")      window.switchKhachTab("profile");
                else if (activeBtn.id === "tabLichSu") window.switchKhachTab("history");
                else window.switchKhachTab("keo");
            } else {
                window.switchKhachTab("keo");
            }
        }
    });

    /* ═══════════════════════════════════════════════════
     * J5 — BOTTOM SHEET LOGIN (mobile only)
     * Mở/đóng #login-sheet bằng class .sheet-open
     * ═══════════════════════════════════════════════════ */
    window.openLoginSheet = function() {
        const sheet   = document.getElementById("login-sheet");
        const overlay = document.getElementById("login-overlay");
        if (sheet)   sheet.classList.add("sheet-open");
        if (overlay) { overlay.style.display = "block"; overlay.classList.add("sheet-open"); }
    };

    window.closeLoginSheet = function() {
        const sheet   = document.getElementById("login-sheet");
        const overlay = document.getElementById("login-overlay");
        if (sheet)   sheet.classList.remove("sheet-open");
        if (overlay) { overlay.classList.remove("sheet-open"); overlay.style.display = "none"; }
    };

    /* ═══════════════════════════════════════════════════
     * PC: Toggle mở/đóng #lichSuDauSection khi bấm nút "📋 Lịch Sử Đấu"
     * ═══════════════════════════════════════════════════ */
    window.toggleLichSuDesktop = function () {
        if (!window.currentGuest) return;
        const section  = document.getElementById("lichSuDauSection");
        const inner    = document.getElementById("btnLichSuInner");
        if (!section) return;

        const isOpen = !section.classList.contains("lich-su-hidden");

        if (isOpen) {
            // Đóng modal
            section.classList.add("lich-su-hidden");
            if (inner) {
                inner.style.borderColor = "rgba(0,255,136,0.5)";
                inner.style.boxShadow   = "0 0 18px rgba(0,255,136,0.18),0 0 4px rgba(0,255,136,0.08) inset";
            }
            document.body.style.overflow = "";
        } else {
            // Mở modal
            section.classList.remove("lich-su-hidden");
            if (inner) {
                inner.style.borderColor = "rgba(0,255,136,0.85)";
                inner.style.boxShadow   = "0 0 28px rgba(0,255,136,0.35),0 0 8px rgba(0,255,136,0.15) inset";
            }
            // Khoá scroll body khi modal mở (desktop)
            if (window.innerWidth >= 768) document.body.style.overflow = "hidden";
            // Tải dữ liệu khi mở
            _taiLichSuDau();
        }
    };

    /* ═══════════════════════════════════════════════════
     * FEAT-1: Toggle tooltip badge host trên mobile
     * (desktop dùng :hover; mobile cần onclick)
     * ═══════════════════════════════════════════════════ */
    window._toggleBadgeTooltip = function () {
        const badge = document.getElementById("profileHostBadge");
        if (!badge) return;
        badge.classList.toggle("tooltip-open");
        // Tự đóng sau 3 giây nếu đang mở
        if (badge.classList.contains("tooltip-open")) {
            setTimeout(() => badge.classList.remove("tooltip-open"), 3000);
        }
    };

    /* ═══════════════════════════════════════════════════
     * FEAT-2: TẢI ĐÁNH GIÁ TÔI ĐÃ GỬI (GuestToHost)
     * Query danh_gia_tin_dung WHERE sdt_nguoi_viet = myPhone
     * AND loai_danh_gia = "GuestToHost"
     * Hiện tên Host (FEAT-3) với link xem hồ sơ công khai
     * ═══════════════════════════════════════════════════ */
    async function _taiDanhGiaDaGui() {
        if (!window.currentGuest) return;
        const container = document.getElementById("danhGiaDaGuiList");
        if (!container) return;

        try {
            const [reviews, allCaDau, allNguoiDung] = await Promise.all([
                window.dbEngine.doc("danh_gia_tin_dung", {
                    eq: {
                        sdt_nguoi_viet: window.currentGuest.sdt_khach,
                        loai_danh_gia:  "GuestToHost"
                    }
                }).catch(() => []),
                window.dbEngine.doc("ca_dau").catch(() => []),
                window.dbEngine.doc("nguoi_dung").catch(() => [])
            ]);

            const caDauMap = {};
            allCaDau.forEach(c => { caDauMap[c.id] = c; });

            // Map SĐT → user (để hiện tên host bị đánh giá — FEAT-3)
            const nguoiDungMap = {};
            allNguoiDung.forEach(u => { if (u.sdt_khach) nguoiDungMap[u.sdt_khach] = u; });

            // Sắp xếp mới nhất trước
            reviews.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            if (reviews.length === 0) {
                container.innerHTML = `<p style="font-size:0.78rem;color:#64748b;text-align:center;padding:10px 0;">
                    Bạn chưa gửi đánh giá nào cho Host.</p>`;
                return;
            }

            container.innerHTML = reviews.map(r => {
                const soSao = Math.max(0, Math.min(5, r.so_sao || 0));
                const stars = Array(5).fill(0).map((_, i) =>
                    `<i class="fa-solid fa-star" style="color:${i < soSao ? "#fbbf24" : "#2d3748"};font-size:0.78rem;"></i>`
                ).join("");

                const ca     = caDauMap[r.id_ca_dau];
                const caInfo = ca
                    ? `${ca.ten_san || ""}${ca.ngay_danh ? " · " + new Date(ca.ngay_danh).toLocaleDateString("vi-VN") : ""}`
                    : "";

                // FEAT-3: Tên Host bị đánh giá + link hồ sơ công khai
                const hostSdt  = r.sdt_nguoi_bi_danh_gia || "";
                const hostUser = nguoiDungMap[hostSdt];
                const hostName = hostUser?.ten_khach || ca?.ten_san || "Host";
                const hostLink = hostSdt
                    ? `<a href="#" class="review-author-link"
                          onclick="event.preventDefault();window.xemHoSoCongKhai('${hostSdt.replace(/'/g,"\\'")}')">
                          <i class="fa-solid fa-store" style="font-size:0.62rem;margin-right:3px;"></i>${hostName}
                       </a>`
                    : `<span style="color:#9ca3af;">${hostName}</span>`;

                return `<div class="kh-review-about">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
                        <div class="kh-review-stars">${stars}</div>
                        <span style="font-size:0.68rem;color:#64748b;margin-left:auto;">${r.created_at ? new Date(r.created_at).toLocaleDateString("vi-VN") : ""}</span>
                    </div>
                    ${caInfo ? `<div style="font-size:0.7rem;color:#64748b;margin-bottom:4px;">
                        <i class="fa-solid fa-table-tennis-paddle-ball" style="color:#00ff88;margin-right:4px;"></i>${caInfo}</div>` : ""}
                    <div style="font-size:0.72rem;color:#9ca3af;margin-bottom:4px;">Gửi đến Host: ${hostLink}</div>
                    ${r.nhan_xet
                        ? `<div style="font-size:0.78rem;color:var(--text-main);line-height:1.5;">"${r.nhan_xet}"</div>`
                        : `<div style="font-size:0.75rem;color:#64748b;font-style:italic;">Không có nhận xét</div>`}
                </div>`;
            }).join("");
        } catch (e) {
            console.error("Lỗi tải đánh giá đã gửi:", e);
            container.innerHTML = `<p style="font-size:0.78rem;color:#ef4444;">Lỗi tải dữ liệu.</p>`;
        }
    }

    /* ═══════════════════════════════════════════════════
     * FEAT-3: HỒ SƠ CÔNG KHAI — xem thông tin bất kỳ user
     * Mở modal #modalHoSoCongKhaiOverlay với dữ liệu của sdt
     * ═══════════════════════════════════════════════════ */
    window.xemHoSoCongKhai = async function (sdt) {
        const overlay = document.getElementById("modalHoSoCongKhaiOverlay");
        const body    = document.getElementById("modalHoSoBody");
        const title   = document.getElementById("modalHoSoTitle");
        if (!overlay || !body) return;

        overlay.style.display = "flex";
        body.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;display:block;margin-bottom:10px;"></i>
            Đang tải hồ sơ...</div>`;

        try {
            /* Tải song song: user info, đánh giá nhận, đánh giá gửi, lịch sử slot, tất cả ca đấu */
            const [userList, receivedReviews, sentReviews, datSlots, allCaDau] = await Promise.all([
                window.dbEngine.doc("nguoi_dung", { eq: { sdt_khach: sdt } }).catch(() => []),
                window.dbEngine.doc("danh_gia_tin_dung", { eq: { sdt_nguoi_bi_danh_gia: sdt } }).catch(() => []),
                window.dbEngine.doc("danh_gia_tin_dung", { eq: { sdt_nguoi_viet: sdt, loai_danh_gia: "GuestToHost" } }).catch(() => []),
                window.dbEngine.doc("dat_slot", { eq: { sdt_khach: sdt } }).catch(() => []),
                window.dbEngine.doc("ca_dau").catch(() => [])
            ]);

            const user       = userList[0];
            const isHost     = user?.vai_tro === "host";
            const tenHienThi = user?.ten_khach || sdt;
            const joinDate   = user?.ngay_tham_gia
                ? new Date(user.ngay_tham_gia).toLocaleDateString("vi-VN") : "--";

            // Map ca_dau id → ca_dau object
            const caDauMap = {};
            allCaDau.forEach(c => { caDauMap[c.id] = c; });

            // Hàm ẩn số điện thoại
            const _maskPhone = (p) => p ? p.slice(0, 3) + "***" + p.slice(-3) : "Ẩn danh";

            // Tải tên người viết đánh giá (reviewer names)
            let reviewerMap = {};
            try {
                const reviewerUsers = await window.dbEngine.doc("nguoi_dung").catch(() => []);
                reviewerUsers.forEach(u => { reviewerMap[u.sdt_khach] = u.ten_khach || u.sdt_khach; });
            } catch (_) {}

            // ── ĐÁNH GIÁ NHẬN (HostToGuest) — đây là cơ sở tính sao TB ──
            const htgReviews = receivedReviews.filter(r => r.loai_danh_gia === "HostToGuest" && r.so_sao >= 1 && r.so_sao <= 5);
            // avgSao chỉ tính từ đánh giá của HOST gửi về KHÁCH (HostToGuest)
            const avgSao = htgReviews.length > 0
                ? (htgReviews.reduce((s, r) => s + r.so_sao, 0) / htgReviews.length).toFixed(1)
                : null;

            // Thống kê buổi tham gia
            const daThamGia = datSlots.filter(s => s.trang_thai_di_danh === "Đã tham gia").length;

            // Cập nhật tiêu đề modal
            if (title) title.innerHTML = `
                <i class="fa-solid fa-user-circle" style="color:#60a5fa;"></i>
                ${tenHienThi}
                ${isHost ? `<span class="hsck-host-badge">
                    <i class="fa-solid fa-circle-check"></i> Host Sân
                </span>` : ""}`;

            /* ── Render HTML đánh giá nhận (HostToGuest) ── */
            const recentHtgReviews = [...htgReviews]
                .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                .slice(0, 8);
            const receivedHTML = recentHtgReviews.length === 0
                ? `<p style="font-size:0.8rem;color:#64748b;text-align:center;padding:10px 0;">Chưa có đánh giá nào.</p>`
                : recentHtgReviews.map(r => {
                    const soSao = Math.max(1, Math.min(5, r.so_sao));
                    const stars = Array(5).fill(0).map((_, i) =>
                        `<i class="fa-solid fa-star" style="color:${i < soSao ? "#fbbf24" : "#2d3748"};font-size:0.72rem;"></i>`
                    ).join("");
                    const reviewerPhone = r.sdt_nguoi_viet || "";
                    const reviewerName  = reviewerMap[reviewerPhone] || _maskPhone(reviewerPhone);
                    const reviewerLink  = reviewerPhone
                        ? `<span style="font-size:0.72rem;color:#94a3b8;">
                               Bởi: <button onclick="event.stopPropagation();window.xemHoSoCongKhai('${reviewerPhone}')"
                                   style="background:none;border:none;padding:0;color:#60a5fa;cursor:pointer;
                                   font-size:0.72rem;font-family:inherit;text-decoration:underline;text-underline-offset:2px;">
                               ${reviewerName}</button></span>`
                        : "";
                    return `<div class="hsck-review-item">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
                            <div style="display:flex;gap:2px;">${stars}</div>
                            <span style="font-size:0.63rem;color:#64748b;margin-left:auto;">
                                ${r.created_at ? new Date(r.created_at).toLocaleDateString("vi-VN") : ""}
                            </span>
                        </div>
                        ${reviewerLink}
                        ${r.nhan_xet
                            ? `<div style="font-size:0.78rem;color:#e2e8f0;line-height:1.5;margin-top:4px;">"${r.nhan_xet}"</div>`
                            : `<em style="font-size:0.73rem;color:#6b7280;">Không có nhận xét</em>`}
                    </div>`;
                }).join("");

            /* ── Render HTML đánh giá đã gửi (GuestToHost) ── */
            const recentSentReviews = [...sentReviews]
                .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                .slice(0, 6);
            const sentHTML = recentSentReviews.length === 0
                ? `<p style="font-size:0.8rem;color:#64748b;text-align:center;padding:10px 0;">Chưa gửi đánh giá nào.</p>`
                : recentSentReviews.map(r => {
                    const soSao = Math.max(1, Math.min(5, r.so_sao));
                    const stars = Array(5).fill(0).map((_, i) =>
                        `<i class="fa-solid fa-star" style="color:${i < soSao ? "#fbbf24" : "#2d3748"};font-size:0.68rem;"></i>`
                    ).join("");
                    const ca = caDauMap[r.id_ca_dau];
                    const caName = ca ? (ca.ten_san || "Ca đấu") : "Ca đấu";
                    const caDate = ca?.ngay_danh ? " · " + new Date(ca.ngay_danh).toLocaleDateString("vi-VN") : "";
                    return `<div class="hsck-review-item" style="opacity:0.9;">
                        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:3px;">
                            <div style="display:flex;gap:1px;">${stars}</div>
                            <span style="font-size:0.63rem;color:#64748b;margin-left:auto;">
                                ${r.created_at ? new Date(r.created_at).toLocaleDateString("vi-VN") : ""}
                            </span>
                        </div>
                        <div style="font-size:0.68rem;color:#64748b;margin-bottom:2px;">
                            <i class="fa-solid fa-table-tennis-paddle-ball" style="color:#60a5fa;margin-right:3px;"></i>
                            ${caName}${caDate}
                        </div>
                        ${r.nhan_xet
                            ? `<div style="font-size:0.75rem;color:#e2e8f0;line-height:1.4;">"${r.nhan_xet}"</div>`
                            : `<em style="font-size:0.7rem;color:#6b7280;">Không có nhận xét</em>`}
                    </div>`;
                }).join("");

            /* ── Render LỊCH SỬ TẠI SÂN (dat_slot history) ── */
            const recentSlots = [...datSlots]
                .sort((a, b) => new Date(b.thoi_gian_dat || 0) - new Date(a.thoi_gian_dat || 0))
                .slice(0, 8);
            const slotStatusColor = { "Đã tham gia": "#00ff88", "Bùng kèo": "#ef4444", "Khách hủy": "#9ca3af", "Chờ đánh": "#fbbf24" };
            const historyHTML = recentSlots.length === 0
                ? `<p style="font-size:0.8rem;color:#64748b;text-align:center;padding:10px 0;">Chưa có lịch sử đặt slot.</p>`
                : recentSlots.map(s => {
                    const ca = caDauMap[s.id_ca_dau];
                    const caName = ca ? (ca.ten_san || "Ca đấu") : "Ca đấu";
                    const caDate = ca?.ngay_danh ? new Date(ca.ngay_danh).toLocaleDateString("vi-VN") : "--";
                    const st = s.trang_thai_di_danh || "Chờ đánh";
                    const stColor = slotStatusColor[st] || "#94a3b8";
                    const stLabel = st === "Khách hủy" ? "Đã Huỷ" : st;
                    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;
                                border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span style="font-size:0.63rem;font-weight:700;color:${stColor};
                                     background:rgba(255,255,255,0.04);padding:2px 6px;
                                     border-radius:10px;white-space:nowrap;flex-shrink:0;">${stLabel}</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:0.78rem;color:#e2e8f0;white-space:nowrap;
                                        overflow:hidden;text-overflow:ellipsis;">${caName}</div>
                            <div style="font-size:0.67rem;color:#64748b;">${caDate}</div>
                        </div>
                    </div>`;
                }).join("");

            /* ── Render body modal — thứ tự: avatar → stats → ratings UP → sent → history DOWN ── */
            body.innerHTML = `
            <!-- Avatar + Thông tin cơ bản -->
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
                <div style="width:56px;height:56px;border-radius:50%;
                            background:linear-gradient(135deg,#1a3a6e,#0f2d53);
                            border:2.5px solid ${isHost ? "#fbbf24" : "#1e3a5f"};
                            display:flex;align-items:center;justify-content:center;
                            font-size:1.6rem;flex-shrink:0;
                            box-shadow:${isHost ? "0 0 14px rgba(251,191,36,0.3)" : "none"};">
                    ${isHost ? "🏟️" : "🏸"}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:1rem;font-weight:700;color:#e2e8f0;
                                display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        ${tenHienThi}
                        ${isHost ? `<span class="hsck-host-badge"><i class="fa-solid fa-circle-check"></i> Host</span>` : ""}
                    </div>
                    <div style="font-size:0.73rem;color:#9ca3af;margin-top:3px;">
                        <i class="fa-regular fa-calendar" style="margin-right:4px;"></i>Gia nhập: ${joinDate}
                    </div>
                    ${avgSao ? `<div style="font-size:0.78rem;color:#fbbf24;margin-top:3px;font-weight:700;">
                        ⭐ ${avgSao} / 5.0
                        <span style="color:#9ca3af;font-weight:400;font-size:0.7rem;">&nbsp;(${htgReviews.length} đánh giá từ host)</span>
                    </div>` : ""}
                </div>
            </div>

            <!-- Thống kê nhanh -->
            <div class="hsck-stat-grid">
                <div class="hsck-stat-card">
                    <div class="hsck-stat-val" style="color:#00ff88;">${daThamGia}</div>
                    <div class="hsck-stat-lbl">🏸 Buổi đã đánh</div>
                </div>
                <div class="hsck-stat-card">
                    <div class="hsck-stat-val" style="color:#fbbf24;">${avgSao || "—"}</div>
                    <div class="hsck-stat-lbl">⭐ Sao TB</div>
                </div>
            </div>

            <!-- Đánh giá nhận (HostToGuest) — ĐẶT LÊN TRÊN -->
            <div style="font-size:0.74rem;font-weight:700;color:#9ca3af;
                        text-transform:uppercase;letter-spacing:0.05em;
                        margin:14px 0 8px;display:flex;align-items:center;gap:6px;">
                <i class="fa-solid fa-star" style="color:#fbbf24;"></i>
                Đánh Giá Về Người Này
                ${htgReviews.length > 0 ? `<span style="font-size:0.72rem;color:#fbbf24;margin-left:auto;font-weight:700;">
                    ⭐ ${avgSao} (${htgReviews.length})</span>` : ""}
            </div>
            ${receivedHTML}

            <!-- Đánh giá đã gửi (GuestToHost) — giữa -->
            ${sentReviews.length > 0 ? `
            <div style="font-size:0.74rem;font-weight:700;color:#9ca3af;
                        text-transform:uppercase;letter-spacing:0.05em;
                        margin:14px 0 8px;display:flex;align-items:center;gap:6px;">
                <i class="fa-solid fa-comment-dots" style="color:#60a5fa;"></i>
                Đánh Giá Đã Gửi Về Sân
                <span style="font-size:0.7rem;font-weight:400;color:#64748b;margin-left:auto;">${sentReviews.length} lần</span>
            </div>
            ${sentHTML}` : ""}

            <!-- Lịch sử tại sân — ĐẶT XUỐNG DƯỚI -->
            <div style="font-size:0.74rem;font-weight:700;color:#9ca3af;
                        text-transform:uppercase;letter-spacing:0.05em;
                        margin:14px 0 8px;display:flex;align-items:center;gap:6px;">
                <i class="fa-solid fa-clock-rotate-left" style="color:#00ff88;"></i>
                Lịch Sử Tại Sân
                <span style="font-size:0.7rem;font-weight:400;color:#64748b;margin-left:auto;">${datSlots.length} lượt</span>
            </div>
            ${historyHTML}
            `;
        } catch (e) {
            console.error("Lỗi tải hồ sơ công khai:", e);
            body.innerHTML = `<p style="color:#ef4444;text-align:center;padding:20px;">Lỗi tải dữ liệu. Thử lại sau.</p>`;
        }
    };

    /* Alias để các nơi gọi window._moHoSoCongKhai vẫn hoạt động */
    window._moHoSoCongKhai = window.xemHoSoCongKhai;

    window.dongModalHoSoCongKhai = function () {
        const overlay = document.getElementById("modalHoSoCongKhaiOverlay");
        if (overlay) overlay.style.display = "none";
    };

    console.log("⚡ [Phân Hệ Khách Chơi v4.4]: BUG1-3-4 ✅ | ĐÁNH_GIÁ_VỀ_TÔI ✅ | TÔI_ĐÃ_ĐÁNH_GIÁ ✅ | HỒ_SƠ_TÍN_DỤNG_v2 ✅");
})();
