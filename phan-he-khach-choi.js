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
    let _pendingCaId    = null;
    let _bangND = "nguoi_dung";

    // 8 tỉnh thành trọng điểm cầu lông dùng cho bộ lọc Tìm Kèo
    const _TK_TINH_THANH = [
        { name: "TP. Hồ Chí Minh", districts: ["Quận 1","Quận 3","Quận 4","Quận 5","Quận 6","Quận 7","Quận 8","Quận 10","Quận 11","Quận 12","Tân Bình","Bình Thạnh","Gò Vấp","Thủ Đức","Phú Nhuận","Tân Phú","Bình Tân","Hóc Môn","Củ Chi","Nhà Bè","Bình Chánh","Cần Giờ"] },
        { name: "Hà Nội",           districts: ["Ba Đình","Hoàn Kiếm","Tây Hồ","Long Biên","Cầu Giấy","Đống Đa","Hai Bà Trưng","Hoàng Mai","Thanh Xuân","Nam Từ Liêm","Bắc Từ Liêm","Hà Đông","Đông Anh","Gia Lâm","Thanh Trì","Sóc Sơn"] },
        { name: "Bình Dương",       districts: ["Thủ Dầu Một","Thuận An","Dĩ An","Bến Cát","Tân Uyên","Bàu Bàng","Dầu Tiếng","Phú Giáo","Bắc Tân Uyên"] },
        { name: "Đà Nẵng",         districts: ["Hải Châu","Thanh Khê","Sơn Trà","Ngũ Hành Sơn","Liên Chiểu","Cẩm Lệ","Hòa Vang"] },
    ];

    // Cặp ID đồng bộ PC sidebar ↔ Mobile drawer (giới tính + trình độ dùng pills riêng)
    const _FILTER_PAIRS = [
        ["filterProvince",  "filterProvinceMobile"],
        ["filterDistrict",  "filterDistrictMobile"],
        ["filterDate",      "filterDateMobile"],
        ["filterMaxPrice",  "filterMaxPriceMobile"],
        ["filterTimeFrom",  "filterTimeFromMobile"],
        ["filterTimeTo",    "filterTimeToMobile"],
        ["filterCourtName", "filterCourtNameDrawer"],
    ];

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
        _napDropdownDrawer();
        window.timKiemCaDau();
        _initStarGuest();
    };

    function _hienManDangNhap() {
        const auth    = document.getElementById("guestAuthPanel");
        const profile = document.getElementById("guestProfileBlock");
        if (auth)    auth.style.display    = "block";
        if (profile) profile.style.display = "none";
        // Đóng form phụ đăng ký (authExtraFields) nếu đang mở — tránh hiện lại sau logout
        const extraFields = document.getElementById("authExtraFields");
        if (extraFields) {
            extraFields.classList.remove("is-open");
            // Reset giá trị form phụ
            extraFields.dataset.phone  = "";
            extraFields.dataset.pass   = "";
            extraFields.dataset.gender = "";
        }
        // Reset nút XÁC NHẬN về trạng thái ban đầu
        const btnMain = document.getElementById("btnXacNhan");
        if (btnMain) btnMain.textContent = "XÁC NHẬN →";
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

    async function _hienTrustScoreBar() {
        const el = document.getElementById("profileTrustScore");
        if (!el || !window.currentGuest?.sdt_khach) return;
        const score  = await _layDiemUyTin();
        const level  = _trustLevel(score);
        const pct    = score;
        el.innerHTML = `
            <div class="trust-bar-wrap">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span style="font-size:0.72rem;color:#94a3b8;font-weight:600;">ĐỘ UY TÍN</span>
                    <span class="trust-label ${level.cls}">${level.icon} ${level.label} — ${score}đ</span>
                </div>
                <div class="trust-bar-track">
                    <div class="trust-bar-fill ${level.cls}" style="width:${pct}%;"></div>
                </div>
            </div>`;
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

        // Hiển thị trust score bar
        _hienTrustScoreBar();

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

    // Che giấu 4 số giữa SĐT: "0961234567" → "096XXXX567"
    function _maskSdt(sdt) {
        const s = (sdt || "").replace(/\D/g, "");
        if (s.length < 7) return s;
        return s.slice(0, 3) + "XXXX" + s.slice(-3);
    }

    // HTML chip SĐT host có nút reveal — dùng trong card + modal
    function _sdtChipHtml(sdt, sdtEsc) {
        const masked = _maskSdt(sdt);
        return `<span class="shb-sdt shb-sdt-masked" id="sdtDisplay_${sdtEsc}">${masked}</span>` +
               `<button class="shb-reveal-btn" title="Hiện số điện thoại"
                   onclick="event.stopPropagation();window._hienSdt('${sdtEsc}',this)"
                   aria-label="Hiện SĐT"><i class="fa-regular fa-eye"></i></button>`;
    }

    // Reveal SĐT khi bấm nút mắt — chỉ cho user đã đăng nhập
    window._hienSdt = function (sdt, btn) {
        if (!window.currentGuest) {
            window.hienToast("Cần đăng nhập", "Vui lòng đăng nhập để xem số điện thoại.", "warning");
            return;
        }
        const span = document.getElementById(`sdtDisplay_${sdt}`);
        if (span) { span.textContent = sdt; span.classList.remove("shb-sdt-masked"); }
        if (btn)  { btn.style.display = "none"; }
    };

    // ── CLOUDFLARE TURNSTILE — Smart Session ─────────────────────────
    const _CF_SESSION_KEY = "tvl_cf_verified";
    const _CF_TTL = 7 * 24 * 60 * 60 * 1000; // 7 ngày

    function _kiemTraTurnstileSession() {
        try {
            const s = JSON.parse(localStorage.getItem(_CF_SESSION_KEY) || "{}");
            return s.exp && Date.now() < s.exp;
        } catch { return false; }
    }

    function _luuTurnstileSession() {
        localStorage.setItem(_CF_SESSION_KEY, JSON.stringify({ exp: Date.now() + _CF_TTL }));
    }

    // Trả về true nếu được bypass hoặc token hợp lệ, false nếu cần hiện widget
    function _xacMinhTurnstile() {
        if (_kiemTraTurnstileSession()) return true;
        const token = document.querySelector("[name='cf-turnstile-response']")?.value;
        if (token) { _luuTurnstileSession(); return true; }
        return false;
    }

    // ── TRUST SCORE HELPERS ──────────────────────────────────────────

    // Trừ điểm uy tín (bỏ qua nếu whitelisted)
    async function _truDiemUyTin(sdt, diemTru) {
        try {
            const users = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: sdt } });
            const u = (users || [])[0];
            if (!u) return;
            if (u.is_whitelisted) return;
            const current = u.diem_uy_tin ?? 100;
            const newScore = Math.max(0, current - diemTru);
            await window.dbEngine.ghi("nguoi_dung", { diem_uy_tin: newScore }, { sdt_khach: sdt });
            if (newScore < 40 && u.is_active !== false) {
                await window.dbEngine.ghi("nguoi_dung", { is_active: false }, { sdt_khach: sdt });
            }
        } catch (e) { console.error("_truDiemUyTin:", e); }
    }

    // Cộng điểm uy tín + so_ca_thanh_cong (cap 100)
    async function _congDiemUyTin(sdt, diemCong) {
        try {
            const users = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: sdt } });
            const u = (users || [])[0];
            if (!u || u.is_whitelisted) return;
            const newScore = Math.min(100, (u.diem_uy_tin ?? 100) + diemCong);
            const newCa    = (u.so_ca_thanh_cong ?? 0) + 1;
            await window.dbEngine.ghi("nguoi_dung", { diem_uy_tin: newScore, so_ca_thanh_cong: newCa }, { sdt_khach: sdt });
        } catch (e) { console.error("_congDiemUyTin:", e); }
    }

    // Đọc điểm uy tín của currentGuest từ DB (luôn fresh)
    async function _layDiemUyTin() {
        if (!window.currentGuest?.sdt_khach) return 100;
        try {
            const users = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: window.currentGuest.sdt_khach } });
            return (users || [])[0]?.diem_uy_tin ?? 100;
        } catch { return 100; }
    }

    // Trạng thái trust theo điểm
    function _trustLevel(score) {
        if (score >= 80) return { label: "Tốt", cls: "trust-ok",   icon: "✅" };
        if (score >= 60) return { label: "Cảnh cáo", cls: "trust-warn", icon: "⚠️" };
        if (score >= 40) return { label: "Rủi ro cao", cls: "trust-risk", icon: "🔴" };
        return { label: "Tử hình", cls: "trust-dead", icon: "☠️" };
    }

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

        // Hook cho feed app cập nhật UI sau khi đăng nhập thành công
        if (typeof window._onDangNhapThanhCong === "function") {
            window._onDangNhapThanhCong(user);
        }

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
                let savedToND = false;

                // Bước 1: Thử PATCH nguoi_dung — chỉ tính "lưu thành công" khi có row được cập nhật
                // PATCH trả [] (0 rows) = user không có trong nguoi_dung, không phải lỗi
                try {
                    const patchResult = await window.khoDuLieuVinhVien.ghiData(
                        "nguoi_dung",
                        { mat_khau_hash: hash, gioi_tinh: user.gioi_tinh || "male" },
                        { sdt_khach: phone }
                    );
                    savedToND = Array.isArray(patchResult) && patchResult.length > 0;
                } catch (_) {}

                // Bước 2: PATCH không cập nhật được row nào → INSERT để migrate user sang nguoi_dung
                if (!savedToND) {
                    try {
                        await window.khoDuLieuVinhVien.ghiData("nguoi_dung", {
                            ten_khach:     user.ten_khach,
                            sdt_khach:     phone,
                            mat_khau_hash: hash,
                            gioi_tinh:     user.gioi_tinh || "male",
                            vai_tro:       user.vai_tro   || "guest"
                        }, null);
                    } catch (_) {
                        // nguoi_dung chưa được tạo — lưu hash vào localStorage làm cache bền vững
                    }
                }

                // Luôn cache hash trong localStorage để login lại không cần modal
                // kể cả khi DB chưa sẵn sàng (migration chưa chạy)
                try { localStorage.setItem(`tvl_h_${phone}`, hash); } catch {}

                modal.remove();
                _luuSessionVaDangNhap({ ...user, mat_khau_hash: hash });
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

        // Turnstile check — widget đã được render sẵn từ _khoiTaoTabCaNhan()
        if (!_xacMinhTurnstile()) {
            window.hienToast("Xác minh", "Vui lòng hoàn thành xác minh bảo mật Cloudflare.", "warning"); return;
        }

        const btn = document.getElementById("btnXacNhan");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...'; }

        try {
            // Ưu tiên nguoi_dung, fallback khach_vang_lai nếu bảng chưa tồn tại
            let users = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: phone } });
            let bangDang = "nguoi_dung";

            if (!users || users.length === 0) {
                const kvl = await window.dbEngine.docThu("khach_vang_lai", { eq: { sdt_khach: phone } });
                if (kvl && kvl.length > 0) { users = kvl; bangDang = "khach_vang_lai"; }
                else if (users === null && kvl === null) {
                    window.hienToast("Mất kết nối", "Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.", "danger");
                    return;
                }
            }
            _bangND = bangDang;

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
                // Hash hiệu dụng = lấy từ DB, nếu không có thì lấy từ cache localStorage
                const effectiveHash = user.mat_khau_hash || localStorage.getItem(`tvl_h_${phone}`);

                if (!effectiveHash) {
                    // Không có hash ở đâu cả → modal đặt pass lần đầu
                    _hienModalDatPassLanDau(phone, pass, user);
                    return;
                }
                const hashInput = await _hashMatKhau(pass);
                if (hashInput !== effectiveHash) {
                    window.hienToast("Sai mật khẩu", "Nhập lại hoặc bấm 'Quên mật khẩu'.", "danger");
                    // Reset Turnstile để token cũ không hết hạn khi người dùng thử lại
                    if (window._tvlRenderTs) window._tvlRenderTs("turnstile-container");
                    return;
                }
                _luuSessionVaDangNhap({ ...user, mat_khau_hash: effectiveHash });
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

            // Lấy fingerprint thiết bị (FingerprintJS)
            let fpId = null;
            try {
                if (window.FingerprintJS) {
                    const fp = await window.FingerprintJS.load();
                    const res = await fp.get();
                    fpId = res.visitorId;
                }
            } catch (_) { /* FingerprintJS không load được — bỏ qua */ }

            // Kiểm tra fingerprint blacklist
            if (fpId) {
                const blList = await window.dbEngine.docThu("fingerprint_blacklist", { eq: { fingerprint_id: fpId } });
                if ((blList || []).length > 0) {
                    window.hienToast("Không thể đăng ký", "Thiết bị này đã bị cấm truy cập hệ thống.", "danger");
                    if (btnDK) { btnDK.disabled = false; btnDK.innerHTML = 'TẠO TÀI KHOẢN →'; }
                    return;
                }
                // Kiểm tra thiết bị đã tạo tài khoản trong 48h
                const existing = await window.dbEngine.docThu("nguoi_dung", { eq: { device_fingerprint: fpId } });
                if ((existing || []).length > 0) {
                    const lastJoined = new Date(existing[0].ngay_tham_gia || 0).getTime();
                    if (Date.now() - lastJoined < 48 * 60 * 60 * 1000) {
                        window.hienToast("Giới hạn thiết bị", "Thiết bị này đã tạo tài khoản trong 48 giờ qua. Vui lòng thử lại sau.", "warning");
                        if (btnDK) { btnDK.disabled = false; btnDK.innerHTML = 'TẠO TÀI KHOẢN →'; }
                        return;
                    }
                }
            }

            // Payload cho schema mới nguoi_dung (đầy đủ cột)
            const payloadND = {
                ten_khach:    ten,
                sdt_khach:    phone,
                gioi_tinh:    gender,
                mat_khau_hash: hash,
                vai_tro:      "guest",
                sdt_zalo:     sdtZalo,
                facebook_link: facebook || null,
                ma_gioi_thieu: maGT || null,
                device_fingerprint: fpId || null,
                diem_uy_tin: 100,
                free_pass_thang: 1,
                free_pass_reset_thang: new Date().getMonth() + 1
            };
            // Ưu tiên ghi vào nguoi_dung, fallback khach_vang_lai nếu bảng chưa sẵn sàng
            let newUser = null;
            let dangKyOk = false;

            // Thử 1: nguoi_dung
            try {
                const r = await window.khoDuLieuVinhVien.ghiData("nguoi_dung", payloadND, null);
                newUser = (Array.isArray(r) ? r[0] : null) || { ...payloadND };
                dangKyOk = true;
            } catch (e1) {
                console.warn("[Đăng ký] nguoi_dung fail:", e1.message);
            }

            // Thử 2: khach_vang_lai (nếu nguoi_dung chưa có)
            if (!dangKyOk) {
                try {
                    const r2 = await window.khoDuLieuVinhVien.ghiData("khach_vang_lai",
                        { ten_khach: ten, sdt_khach: phone }, null);
                    newUser = (Array.isArray(r2) ? r2[0] : null) || { ten_khach: ten, sdt_khach: phone, vai_tro: "guest", gioi_tinh: gender };
                    try { localStorage.setItem(`tvl_h_${phone}`, hash); } catch {}
                    _bangND = "khach_vang_lai";
                    dangKyOk = true;
                } catch (e2) {
                    console.warn("[Đăng ký] khach_vang_lai fail:", e2.message);
                }
            }

            if (!dangKyOk) {
                // Cả 2 bảng đều không khả dụng — cần chạy SQL schema
                window.hienToast("Lỗi đăng ký",
                    "Cơ sở dữ liệu chưa được thiết lập. Cần chạy supabase-schema.sql trên Supabase Dashboard.", "danger");
                return;
            }

            window.hienToast("Tạo tài khoản thành công! 🎉", `Chào ${ten}! Tài khoản đã được tạo.`, "success");
            _luuSessionVaDangNhap(newUser);
        } catch (e) {
            console.error("Lỗi đăng ký:", e?.message || e);
            const msg = e?.message || "";
            let moTaLoi = "Không thể tạo tài khoản. Kiểm tra kết nối và thử lại.";
            if (msg.includes("unique") || msg.includes("23505")) {
                moTaLoi = "Số điện thoại này đã được đăng ký. Vui lòng đăng nhập.";
            }
            window.hienToast("Lỗi đăng ký", moTaLoi, "danger");
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
    // Sinh danh sách giờ 30 phút từ 00:00 → 23:30 vào select
    function _napGioBoLoc(selectId, defaultLabel) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = `<option value="">${defaultLabel}</option>`;
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 30) {
                const val = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
                const opt = document.createElement("option");
                opt.value = val; opt.textContent = val;
                sel.appendChild(opt);
            }
        }
    }

    function _napDropdownBoLoc() {
        const provSel = document.getElementById("filterProvince");
        if (!provSel) return;
        // Nạp dropdown mốc giờ 24h — cả PC lẫn mobile drawer
        _napGioBoLoc("filterTimeFrom",       "Từ giờ");
        _napGioBoLoc("filterTimeTo",         "Đến");
        // Khởi tạo inline calendar
        window._renderTkCal && window._renderTkCal();
        _napGioBoLoc("filterTimeFromMobile", "Từ giờ");
        _napGioBoLoc("filterTimeToMobile",   "Đến");
        provSel.innerHTML = '<option value="">🇻🇳 Toàn Quốc</option>';
        _TK_TINH_THANH.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.name; opt.textContent = p.name;
            provSel.appendChild(opt);
        });
        provSel.addEventListener("change", () => {
            _capNhatHuyenBoLoc(provSel.value, "filterDistrict");
            window.timKiemCaDau && window.timKiemCaDau();
        });

        // Gắn listener cho mobile topbar input tên sân → search ngay
        const mobCourt = document.getElementById("filterCourtNameMobile");
        if (mobCourt) {
            mobCourt.addEventListener("input", function () {
                const pcEl = document.getElementById("filterCourtName");
                if (pcEl) pcEl.value = this.value;
                window.timKiemCaDau && window.timKiemCaDau();
            });
        }
    }

    function _capNhatHuyenBoLoc(provName, targetId) {
        const distSel = document.getElementById(targetId || "filterDistrict");
        if (!distSel) return;
        distSel.innerHTML = '<option value="">-- Tất cả Quận/Huyện --</option>';
        if (!provName) return;
        const prov = _TK_TINH_THANH.find(p => p.name === provName);
        if (prov) prov.districts.forEach(d => {
            const opt = document.createElement("option");
            opt.value = d; opt.textContent = d;
            distSel.appendChild(opt);
        });
    }

    window.capNhatQuanHuyenLoc = function () {
        _capNhatHuyenBoLoc(document.getElementById("filterProvince")?.value, "filterDistrict");
    };

    // Dùng cho onchange của Province select trong mobile drawer
    window._capNhatHuyenDrawer = function (provName) {
        _capNhatHuyenBoLoc(provName, "filterDistrictMobile");
    };

    // Populate tỉnh thành vào drawer mobile (gọi sau khi DOM ready)
    function _napDropdownDrawer() {
        const sel = document.getElementById("filterProvinceMobile");
        if (!sel) return;
        sel.innerHTML = '<option value="">🇻🇳 Toàn Quốc</option>';
        _TK_TINH_THANH.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.name; opt.textContent = p.name;
            sel.appendChild(opt);
        });
    }

    /* ═══════════════════════════════════════════════════
     * MOBILE DRAWER — Bộ lọc slide-up
     * ═══════════════════════════════════════════════════ */
    window.moBoLocDrawer = function () {
        // Pre-fill drawer từ giá trị sidebar PC hiện tại
        _FILTER_PAIRS.forEach(([pcId, moId]) => {
            const el = document.getElementById(moId);
            if (el) el.value = document.getElementById(pcId)?.value || "";
        });

        // Pre-fill mobile gender pills từ PC hidden select
        const curGender = document.getElementById("filterGender")?.value || "";
        document.querySelectorAll("#filterGenderPillsMobile .tk-pill").forEach(p => {
            p.classList.toggle("active", p.dataset.value === curGender);
        });

        // Pre-fill mobile level pills từ PC level pills đang active
        const activePCLevels = Array.from(
            document.querySelectorAll("#filterLevelPills .tk-pill.active")
        ).map(p => p.dataset.value);
        document.querySelectorAll("#filterLevelPillsMobile .tk-pill").forEach(p => {
            p.classList.toggle("active", activePCLevels.includes(p.dataset.value));
        });

        // Sync label giá mobile
        window._capNhatNhanGiaMobile && window._capNhatNhanGiaMobile();

        // Cập nhật dropdown huyện trong drawer
        const provM = document.getElementById("filterProvinceMobile")?.value;
        _capNhatHuyenBoLoc(provM || "", "filterDistrictMobile");
        if (provM) {
            const curDist = document.getElementById("filterDistrict")?.value;
            const distM = document.getElementById("filterDistrictMobile");
            if (distM && curDist) distM.value = curDist;
        }
        document.getElementById("tkDrawer")?.classList.add("is-open");
        document.getElementById("tkDrawerOverlay")?.classList.add("is-open");
        document.body.style.overflow = "hidden";
    };

    window.dongBoLocDrawer = function () {
        document.getElementById("tkDrawer")?.classList.remove("is-open");
        document.getElementById("tkDrawerOverlay")?.classList.remove("is-open");
        document.body.style.overflow = "";
    };

    window.xacNhanBoLocDrawer = function () {
        // Sync scalar fields drawer → sidebar PC
        _FILTER_PAIRS.forEach(([pcId, moId]) => {
            const pcEl = document.getElementById(pcId);
            if (pcEl) pcEl.value = document.getElementById(moId)?.value || "";
        });

        // Sync mobile gender pill → PC hidden select + PC gender pills
        const activeMobileGender = document.querySelector("#filterGenderPillsMobile .tk-pill.active")?.dataset.value || "";
        const pcGenderSel = document.getElementById("filterGender");
        if (pcGenderSel) pcGenderSel.value = activeMobileGender;
        document.querySelectorAll("#filterGenderPills .tk-pill").forEach(p => {
            p.classList.toggle("active", p.dataset.value === activeMobileGender);
        });

        // Sync mobile level pills → PC level pills (giữ single source of truth ở PC)
        const activeMobileLevels = Array.from(
            document.querySelectorAll("#filterLevelPillsMobile .tk-pill.active")
        ).map(p => p.dataset.value);
        document.querySelectorAll("#filterLevelPills .tk-pill").forEach(p => {
            p.classList.toggle("active", activeMobileLevels.includes(p.dataset.value));
        });

        // Sync mobile topbar court name
        const courtDrawer = document.getElementById("filterCourtNameDrawer")?.value;
        const mobTopbar   = document.getElementById("filterCourtNameMobile");
        if (mobTopbar && courtDrawer) mobTopbar.value = courtDrawer;

        window.dongBoLocDrawer();
        setTimeout(() => window.timKiemCaDau && window.timKiemCaDau(), 350);
    };

    /* ═══════════════════════════════════════════════════
     * 4. TÌM KIẾM & HIỂN THỊ CA ĐẤU (từ bảng ca_dau)
     * ═══════════════════════════════════════════════════ */
    window.timKiemCaDau = function () {
        clearTimeout(_filterTimeout);
        _filterTimeout = setTimeout(_thucHienTimKiem, 300);
    };

    // Cập nhật nhãn giá trên range slider
    window._capNhatNhanGia = function () {
        const val = Number(document.getElementById("filterMaxPrice")?.value) || 0;
        const lbl = document.getElementById("filterMaxPriceLabel");
        if (!lbl) return;
        lbl.textContent = val > 0 ? `≤ ${val.toLocaleString("vi-VN")}đ` : "Tất cả";
    };

    /* ═══════════════════════════════════════════════════
     * INLINE CALENDAR — Bộ lọc ngày đánh PC sidebar
     * ═══════════════════════════════════════════════════ */
    let _calYear, _calMonth;
    const _CAL_MONTH_NAMES = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
                               "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

    window._renderTkCal = function () {
        const now  = new Date();
        const y    = (_calYear  !== undefined) ? _calYear  : now.getFullYear();
        const m    = (_calMonth !== undefined) ? _calMonth : now.getMonth();
        const grid = document.getElementById("tkCalGrid");
        const title= document.getElementById("tkCalTitle");
        if (!grid) return;
        _calYear = y; _calMonth = m;
        if (title) title.textContent = `${_CAL_MONTH_NAMES[m]} ${y}`;

        const selectedDate = document.getElementById("filterDate")?.value || "";
        const todayStr     = now.toLocaleDateString("sv-SE"); // YYYY-MM-DD

        const firstDow  = new Date(y, m, 1).getDay();      // 0=Sun
        const lastDate  = new Date(y, m + 1, 0).getDate(); // số ngày trong tháng
        const prevLast  = new Date(y, m, 0).getDate();     // ngày cuối tháng trước

        const pad = n => String(n).padStart(2, "0");
        const mkDate = (dy, dm, dd) => `${dy}-${pad(dm + 1)}-${pad(dd)}`;

        let cells = [];

        // Ngày tháng trước (làm mờ)
        for (let i = firstDow - 1; i >= 0; i--) {
            const d  = prevLast - i;
            const pm = m === 0 ? 11 : m - 1;
            const py = m === 0 ? y - 1 : y;
            cells.push(`<button class="tk-cal-day tk-cal-other" tabindex="-1">${d}</button>`);
        }

        // Ngày trong tháng hiện tại
        for (let d = 1; d <= lastDate; d++) {
            const dateStr = mkDate(y, m, d);
            const isPast  = dateStr < todayStr;
            const isToday = dateStr === todayStr;
            const isSel   = dateStr === selectedDate;
            let cls = "tk-cal-day";
            if (isSel)        cls += " tk-cal-selected";
            else if (isToday) cls += " tk-cal-today";
            if (isPast && !isSel) cls += " tk-cal-past";
            cells.push(`<button class="${cls}" onclick="window._tkCalSelect('${dateStr}')">${d}</button>`);
        }

        // Điền nốt ô trống cuối (tháng sau, làm mờ)
        const remainder = cells.length % 7;
        if (remainder > 0) {
            for (let d = 1; d <= 7 - remainder; d++) {
                cells.push(`<button class="tk-cal-day tk-cal-other" tabindex="-1">${d}</button>`);
            }
        }

        grid.innerHTML = cells.join("");
    };

    window._tkCalNav = function (dir) {
        const now = new Date();
        let y = (_calYear  !== undefined) ? _calYear  : now.getFullYear();
        let m = (_calMonth !== undefined) ? _calMonth : now.getMonth();
        m += dir;
        if (m < 0)  { m = 11; y--; }
        if (m > 11) { m = 0;  y++; }
        _calYear = y; _calMonth = m;
        window._renderTkCal();
    };

    window._tkCalSelect = function (dateStr) {
        const inp = document.getElementById("filterDate");
        if (inp) inp.value = (inp.value === dateStr) ? "" : dateStr; // toggle off nếu bấm lại
        window._renderTkCal();
        window.timKiemCaDau && window.timKiemCaDau();
    };

    window._tkCalClear = function () {
        const inp = document.getElementById("filterDate");
        if (inp) inp.value = "";
        window._renderTkCal();
        window.timKiemCaDau && window.timKiemCaDau();
    };

    // Đóng modal hồ sơ người đăng
    window.dongHoSoNguoiDang = function () {
        const modal = document.getElementById("modal-ho-so-nguoi-dang");
        if (modal) { modal.classList.add("hidden"); modal.style.display = "none"; }
        document.body.style.overflow = "";
    };

    // Xem hồ sơ tín dụng người đăng kèo (HOST)
    window.xemHoSoNguoiDang = async function (sdt, ten) {
        const modal = document.getElementById("modal-ho-so-nguoi-dang");
        const body  = document.getElementById("modal-ho-so-nguoi-dang-body");
        if (!modal || !body) return;
        modal.classList.remove("hidden");
        modal.style.display = "flex"; // tường minh, không phụ thuộc .hidden CSS
        document.body.style.overflow = "hidden";
        body.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><br><br>Đang tải hồ sơ...</div>`;

        try {
            const [userRows, caDauRows, reviewsHost] = await Promise.all([
                window.dbEngine.doc("nguoi_dung", { eq: { sdt_khach: sdt } }).catch(() => []),
                window.dbEngine.doc("ca_dau", { eq: { sdt_nguoi_tao: sdt } }).catch(() => []),
                window.dbEngine.doc("danh_gia_tin_dung", {
                    eq: { sdt_nguoi_bi_danh_gia: sdt, loai_danh_gia: "GuestToHost" }
                }).catch(() => [])
            ]);
            const user = userRows[0] || {};
            const tenHien = user.ten_khach || ten || "Ẩn danh";
            const sdtHien = user.sdt_khach || sdt;
            const ngayTG  = user.ngay_tham_gia ? new Date(user.ngay_tham_gia).toLocaleDateString("vi-VN") : "--";
            const soKeo   = caDauRows.length;
            const avgSao  = reviewsHost.length > 0
                ? (reviewsHost.reduce((s, r) => s + (r.so_sao || 0), 0) / reviewsHost.length).toFixed(1)
                : null;
            const starStr = avgSao
                ? `${"★".repeat(Math.round(parseFloat(avgSao)))}${"☆".repeat(5 - Math.round(parseFloat(avgSao)))} ${avgSao}/5 (${reviewsHost.length} đánh giá)`
                : "Chưa có đánh giá";

            const reviewList = reviewsHost.slice(0, 5).map(r => {
                const ss = Math.max(1, Math.min(5, r.so_sao || 0));
                return `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="color:#fbbf24;font-size:0.82rem;">${"★".repeat(ss)}${"☆".repeat(5-ss)}</div>
                    ${r.nhan_xet ? `<div style="font-size:0.78rem;color:#cbd5e1;margin-top:3px;">"${r.nhan_xet}"</div>` : ""}
                    <div style="font-size:0.68rem;color:#64748b;margin-top:2px;">${new Date(r.created_at||0).toLocaleDateString("vi-VN")}</div>
                </div>`;
            }).join("") || `<p style="font-size:0.8rem;color:#64748b;">Chưa có đánh giá nào.</p>`;

            body.innerHTML = `
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
                <div style="width:52px;height:52px;border-radius:50%;background:rgba(26,115,232,0.15);border:2px solid rgba(26,115,232,0.35);display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">🏸</div>
                <div>
                    <div style="font-size:1rem;font-weight:700;color:#e2e8f0;">${tenHien}</div>
                    <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">📱 ${sdtHien} · Tham gia ${ngayTG}</div>
                    <div style="font-size:0.8rem;color:#fbbf24;margin-top:3px;">${starStr}</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
                <div style="background:rgba(26,115,232,0.08);border:1px solid rgba(26,115,232,0.2);border-radius:10px;padding:12px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:800;color:#60a5fa;">${soKeo}</div>
                    <div style="font-size:0.7rem;color:#64748b;margin-top:2px;">Ca đã đăng</div>
                </div>
                <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:10px;padding:12px;text-align:center;">
                    <div style="font-size:1.4rem;font-weight:800;color:#fbbf24;">${avgSao || "--"}</div>
                    <div style="font-size:0.7rem;color:#64748b;margin-top:2px;">Điểm đánh giá</div>
                </div>
            </div>
            <div style="font-size:0.76rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Đánh giá gần nhất</div>
            ${reviewList}`;
        } catch (e) {
            body.innerHTML = `<div style="text-align:center;padding:24px;color:#ef4444;">Không thể tải hồ sơ.</div>`;
        }
    };

    // Gender: single-select toggle (bấm lại để bỏ chọn)
    window._toggleGenderPill = function (btn) {
        const isActive = btn.classList.contains("active");
        const group = document.getElementById("filterGenderPills");
        if (group) group.querySelectorAll(".tk-pill").forEach(p => p.classList.remove("active"));
        if (!isActive) btn.classList.add("active"); // bấm lại → bỏ chọn
        const val = document.querySelector("#filterGenderPills .tk-pill.active")?.dataset.value || "";
        const sel = document.getElementById("filterGender");
        if (sel) sel.value = val;
        window.timKiemCaDau && window.timKiemCaDau();
    };

    // Level: multi-select toggle (nhiều nấc có thể chọn cùng lúc)
    window._toggleLevelPill = function (btn) {
        btn.classList.toggle("active");
        window.timKiemCaDau && window.timKiemCaDau();
    };

    // Province button toggle (PC sidebar)
    window._toggleProvincePill = function (btn) {
        const isActive = btn.classList.contains("active");
        // Tắt tất cả trước
        document.querySelectorAll("#filterProvincePills .tk-province-btn").forEach(b => b.classList.remove("active"));
        const inp = document.getElementById("filterProvince");
        if (isActive) {
            // Bấm lại → bỏ chọn → toàn quốc
            if (inp) inp.value = "";
            _capNhatHuyenBoLoc("", "filterDistrict");
        } else {
            btn.classList.add("active");
            const val = btn.dataset.value || "";
            if (inp) inp.value = val;
            _capNhatHuyenBoLoc(val, "filterDistrict");
        }
        window.timKiemCaDau && window.timKiemCaDau();
    };

    // Mobile drawer: gender pill single-select (không auto-search, chờ "Xác Nhận")
    window._toggleMobileGenderPill = function (btn) {
        const isActive = btn.classList.contains("active");
        document.querySelectorAll("#filterGenderPillsMobile .tk-pill").forEach(p => p.classList.remove("active"));
        if (!isActive) btn.classList.add("active"); // toggle off nếu bấm lại
    };

    // Mobile drawer: level pill multi-select (không auto-search, chờ "Xác Nhận")
    window._toggleMobileLevelPill = function (btn) {
        btn.classList.toggle("active");
    };

    // Cập nhật nhãn giá trên range slider mobile
    window._capNhatNhanGiaMobile = function () {
        const val = Number(document.getElementById("filterMaxPriceMobile")?.value) || 0;
        const lbl = document.getElementById("filterMaxPriceLabelMobile");
        if (!lbl) return;
        lbl.textContent = val > 0 ? `≤ ${val.toLocaleString("vi-VN")}đ` : "Tất cả";
    };

    // Xử lý click pill filter (single select — backward compat)
    window._chonPillFilter = function (btn, pillGroupId, selectId) {
        const group = document.getElementById(pillGroupId);
        if (group) group.querySelectorAll(".tk-pill").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const sel = document.getElementById(selectId);
        if (sel) { sel.value = btn.dataset.value || ""; }
        window.timKiemCaDau && window.timKiemCaDau();
    };

    // Auto-fill giờ bắt đầu: làm tròn lên mốc 30 phút gần nhất
    window._autoFillGioTimKeo = function () {
        const el = document.getElementById("filterTimeFrom");
        if (!el || el.value) return; // không ghi đè nếu đã có giá trị
        const now = new Date();
        const m   = now.getMinutes();
        const h   = now.getHours();
        const roundM = m < 30 ? 30 : 0;
        const roundH = m < 30 ? h  : h + 1;
        const pad = n => String(n % 24).padStart(2, "0");
        el.value = `${pad(roundH)}:${String(roundM).padStart(2, "0")}`;
    };

    // Reset toàn bộ bộ lọc về mặc định
    window.xoaBoLoc = function () {
        // Reset tất cả input/select
        ["filterProvince","filterDistrict","filterGender","filterLevel",
         "filterDate","filterCourtName","filterTimeFrom","filterTimeTo"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        // Cập nhật dropdown quận/huyện theo tỉnh đã xóa
        _capNhatHuyenBoLoc("", "filterDistrict");
        // Reset province buttons
        document.querySelectorAll("#filterProvincePills .tk-province-btn").forEach(b => b.classList.remove("active"));
        // Reset tất cả pills (giới tính + trình độ) — bỏ active hết
        ["filterGenderPills","filterLevelPills"].forEach(groupId => {
            const group = document.getElementById(groupId);
            if (!group) return;
            group.querySelectorAll(".tk-pill").forEach(p => p.classList.remove("active"));
        });
        // Reset giá về 0
        const priceEl = document.getElementById("filterMaxPrice");
        if (priceEl) { priceEl.value = 0; window._capNhatNhanGia && window._capNhatNhanGia(); }
        // Re-render inline calendar (xóa ngày đã chọn)
        window._renderTkCal && window._renderTkCal();
        window.timKiemCaDau && window.timKiemCaDau();
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
        // Multi-select: đọc tất cả pills đang active thay vì hidden select đơn giá trị
        const activeLevelPills = Array.from(
            document.querySelectorAll("#filterLevelPills .tk-pill.active")
        ).map(p => (p.dataset.value || "").toLowerCase()).filter(v => v);
        const maxPrice   = Number(document.getElementById("filterMaxPrice")?.value) || 0;
        const courtName  = document.getElementById("filterCourtName")?.value?.trim().toLowerCase() || "";
        const filterDate = document.getElementById("filterDate")?.value || "";
        const timeFrom   = document.getElementById("filterTimeFrom")?.value || "";
        const timeTo     = document.getElementById("filterTimeTo")?.value || "";

        try {
            // Tải song song: ca_dau, dat_slot, quan_ly_key, nguoi_dung
            const [allCaDau, allDatSlot, allKeys, allUsers] = await Promise.all([
                window.dbEngine.doc("ca_dau"),
                window.dbEngine.doc("dat_slot").catch(() => []),
                window.dbEngine.doc("quan_ly_key").catch(() => []),
                window.dbEngine.doc("nguoi_dung").catch(() => [])
            ]);
            // Ưu tiên: quan_ly_key (SaaS key) → nguoi_dung (hệ thống mới dùng SĐT làm key)
            const hostMap = {};
            allKeys.forEach(k => {
                if (k.ma_key) hostMap[k.ma_key] = { ten: k.ten_host || "", sdt: k.sdt_host || "" };
            });
            allUsers.forEach(u => {
                if (u.sdt_khach && !hostMap[u.sdt_khach]) {
                    hostMap[u.sdt_khach] = { ten: u.ten_khach || "", sdt: u.sdt_khach || "", trust: u.diem_uy_tin ?? 100 };
                } else if (u.sdt_khach && hostMap[u.sdt_khach]) {
                    // Bổ sung trust score cho key từ quan_ly_key
                    hostMap[u.sdt_khach].trust = u.diem_uy_tin ?? 100;
                }
            });

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

            // Helper: loại bỏ dấu tiếng Việt để so sánh accent-insensitive
            const _rmAccent = str => (str || "")
                .normalize("NFD").replace(/[̀-ͯ]/g, "")
                .replace(/[đĐ]/g, m => m === "đ" ? "d" : "D")
                .toLowerCase();

            // Chuẩn hóa filterDate về ISO YYYY-MM-DD (xử lý cả dd/mm/yyyy lẫn YYYY-MM-DD)
            let isoFilterDate = filterDate;
            if (filterDate && /^\d{2}\/\d{2}\/\d{4}$/.test(filterDate)) {
                const [d, m, y] = filterDate.split("/");
                isoFilterDate = `${y}-${m}-${d}`;
            }

            // Court name đã chuẩn hóa accent cho lần so sánh
            const normCourtQuery = _rmAccent(courtName);

            let results = allCaDau.filter(s => {
                // Chỉ hiện ca chưa chốt
                if (s.da_chot_ca) return false;
                // Ẩn ca bị đóng băng (báo cáo ≥3)
                if (s.is_frozen) return false;
                // Chỉ hiện ca hôm nay trở đi
                if (s.ngay_danh && s.ngay_danh < todayStr) return false;

                // Lọc tỉnh thành
                if (province && s.tinh_thanh !== province) return false;
                // Lọc quận huyện
                if (district && s.quan_huyen !== district) return false;

                // ── 1. Lọc giới tính — Strict AND (positive inclusion, không dùng negative OR) ──
                if (gender === "Nam") {
                    // tuyen_nam = true: gioi_tinh_can PHẢI là "Nam" hoặc "Cả hai"
                    if (s.gioi_tinh_can !== "Nam" && s.gioi_tinh_can !== "Cả hai") return false;
                    // Có giá nam thực tế > 0
                    if (!s.gia_nam || s.gia_nam <= 0) return false;
                }
                if (gender === "Nữ") {
                    // tuyen_nu = true: gioi_tinh_can PHẢI là "Nữ" hoặc "Cả hai"
                    if (s.gioi_tinh_can !== "Nữ" && s.gioi_tinh_can !== "Cả hai") return false;
                    // Có giá nữ thực tế > 0
                    if (!s.gia_nu || s.gia_nu <= 0) return false;
                }
                // "Cả hai" → trả về toàn bộ danh sách (không filter thêm điều kiện nào)

                // ── 2. Lọc trình độ — gắn chặt với giới tính đang lọc ──
                if (activeLevelPills.length > 0) {
                    const td = s.yeu_cau_trinh_do || {};
                    let levelsToCheck;
                    if      (gender === "Nam")   levelsToCheck = (td.nam || []).map(l => l.toLowerCase());
                    else if (gender === "Nữ")    levelsToCheck = (td.nu  || []).map(l => l.toLowerCase());
                    else                          levelsToCheck = [...(td.nam || []), ...(td.nu || [])].map(l => l.toLowerCase());
                    if (!activeLevelPills.some(lv => levelsToCheck.some(l => l.includes(lv)))) return false;
                }

                // ── 3. Lọc giá tối đa — dùng đúng giá theo giới tính đang chọn ──
                if (maxPrice > 0) {
                    if      (gender === "Nam")   { if ((s.gia_nam || 0) > maxPrice) return false; }
                    else if (gender === "Nữ")    { if ((s.gia_nu  || 0) > maxPrice) return false; }
                    else {
                        const minP = Math.min(s.gia_nam || 999999, s.gia_nu || s.gia_nam || 999999);
                        if (minP > maxPrice) return false;
                    }
                }

                // ── 4. Lọc tên sân — accent-insensitive + lowercase ──
                if (normCourtQuery && !_rmAccent(s.ten_san).includes(normCourtQuery)) return false;

                // ── 5. Lọc ngày cụ thể — ISO date đã chuẩn hóa ──
                if (isoFilterDate && s.ngay_danh !== isoFilterDate) return false;

                // Lọc khung giờ (Từ giờ / Đến giờ)
                if ((timeFrom || timeTo) && s.gio_bat_dau) {
                    const t = s.gio_bat_dau.substring(0, 5);
                    if (timeFrom && t < timeFrom) return false;
                    if (timeTo   && t > timeTo)   return false;
                }

                return true;
            });

            // Tính Ranking Score theo host: (diem_uy_tin*0.6) + (so_sao_tb*20*0.4)
            // Host trust < 70 → xếp xuống cuối
            results.forEach(ca => {
                const hostUser = allUsers.find(u =>
                    (u.sdt_khach && u.sdt_khach === ca.sdt_nguoi_tao) ||
                    (u.ma_key_host && u.ma_key_host === ca.ma_key_host)
                );
                const trust = hostUser?.diem_uy_tin ?? 100;
                const stars = hostUser?.so_sao_tb   ?? 0;
                ca._rankScore = (trust * 0.6) + (Number(stars) * 20 * 0.4);
                ca._trustLow  = trust < 70;
            });

            // Sắp xếp: trust bình thường lên trước (rank cao → ngày gần); trust thấp xuống cuối
            results.sort((a, b) => {
                if (a._trustLow !== b._trustLow) return a._trustLow ? 1 : -1;
                if (Math.abs(a._rankScore - b._rankScore) > 0.5) return b._rankScore - a._rankScore;
                const dtA = new Date(`${a.ngay_danh}T${a.gio_bat_dau || "00:00"}`);
                const dtB = new Date(`${b.ngay_danh}T${b.gio_bat_dau || "00:00"}`);
                return dtA - dtB;
            });

            if (countEl) countEl.textContent = results.length === 0
                ? "Không tìm thấy kèo phù hợp"
                : `${results.length} kèo phù hợp`;
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
                // Ưu tiên: ma_key_host (SaaS key cũ) → sdt_nguoi_tao (hệ thống mới)
                const hostInfo = hostMap[slot.ma_key_host] || hostMap[slot.sdt_nguoi_tao] || null;
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

        const now        = new Date();
        const isToday    = slot.ngay_danh === now.toLocaleDateString("sv-SE");
        const _tmrDate   = new Date(now); _tmrDate.setDate(now.getDate() + 1);
        const isTomorrow = slot.ngay_danh === _tmrDate.toLocaleDateString("sv-SE");
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
        // Gắn class trạng thái để CSS outer neon tự chọn màu viền
        if (isStarted)       card.classList.add("card-live");
        else if (isToday)    card.classList.add("card-today");
        else if (isTomorrow) card.classList.add("card-tomorrow");

        // Badge giới tính (gioi_tinh_can = "Nam" | "Nữ" | "Cả hai")
        const genderMap = {
            "Nam":    '<span class="gender-badge male"><i class="fa-solid fa-mars" style="color:#93c5fd;"></i> Nam</span>',
            "Nữ":    '<span class="gender-badge female"><i class="fa-solid fa-venus" style="color:#f9a8d4;"></i> Nữ</span>',
            "Cả hai":'<span class="gender-badge both"><i class="fa-solid fa-venus-mars"></i> Cả hai</span>'
        };
        const genderBadge = genderMap[slot.gioi_tinh_can] || "";

        // Link bản đồ — dùng link_maps nếu có; fallback: tên sân + quận/huyện (KHÔNG dùng địa chỉ chi tiết)
        const cardMapsUrl = slot.link_maps
            ? slot.link_maps
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([slot.ten_san, slot.quan_huyen].filter(Boolean).join(" "))}`;

        // Trình độ từ JSONB yeu_cau_trinh_do — pill cho cấp chuẩn, chữ nghiêng cho text tự do
        const td = slot.yeu_cau_trinh_do || {};
        const mArr = Array.isArray(td.nam) ? td.nam : (td.nam ? [td.nam] : []);
        const fArr = Array.isArray(td.nu)  ? td.nu  : (td.nu  ? [td.nu]  : []);
        const _pills = arr => {
            if (!arr.length) return `<span style="color:#475569;font-size:0.67rem;">--</span>`;
            const std = arr.filter(v => STANDARD_LEVELS.has(v)).map(v => `<span class="kh-level-pill">${v}</span>`).join("");
            const free = arr.filter(v => !STANDARD_LEVELS.has(v)).join(", ");
            return std + (free ? `<em style="color:#64748b;font-size:0.65rem;margin-left:4px;">${free}</em>` : "");
        };
        const ICON_NAM = '<span style="color:#60a5fa;font-style:normal;flex-shrink:0;">&#9794;</span>';
        const ICON_NU  = '<span style="color:#f472b6;font-style:normal;flex-shrink:0;">&#9792;</span>';
        let levelHTML = "";
        if (slot.gioi_tinh_can === "Cả hai") {
            levelHTML = `<span class="kh-trinh-do-line" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">${ICON_NAM} ${_pills(mArr)}</span>`
                      + `<span class="kh-trinh-do-line" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:3px;">${ICON_NU} ${_pills(fArr)}</span>`;
        } else if (slot.gioi_tinh_can === "Nữ") {
            levelHTML = `<span class="kh-trinh-do-line" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">${ICON_NU} ${_pills(fArr)}</span>`;
        } else {
            levelHTML = `<span class="kh-trinh-do-line" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">${ICON_NAM} ${_pills(mArr)}</span>`;
        }

        // Tiện ích từ JSONB tien_ich_bao_gom
        const baoGom = slot.tien_ich_bao_gom || {};
        const tichs = [];
        const _pill = (icon, label) =>
            `<span style="display:inline-flex;align-items:center;gap:2px;padding:2px 7px;border-radius:20px;background:rgba(255,85,0,0.15);border:1px solid rgba(255,85,0,0.35);color:#FF5500;font-size:0.67rem;font-weight:700;white-space:nowrap;flex-shrink:0;">${icon} ${label}</span>`;
        if (baoGom.san)    tichs.push(_pill('<i class="fa-solid fa-map"></i>',             'Tiền sân'));
        if (baoGom.cau)    tichs.push(_pill('<i class="fa-solid fa-feather-pointed"></i>', 'Tiền cầu'));
        if (baoGom.nuoc)   tichs.push(_pill('<i class="fa-solid fa-bottle-water"></i>',   'Nước'));
        if (baoGom.gui_xe) tichs.push(_pill('<i class="fa-solid fa-motorcycle"></i>',     'Gửi xe'));

        // Ngày hiển thị — có năm, cắt giây khỏi giờ
        const dateStr = slot.ngay_danh
            ? new Date(slot.ngay_danh).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
            : "--";
        const _fmt = (t) => t ? t.substring(0, 5) : "--"; // cắt "HH:MM:SS" → "HH:MM"
        const gioStart = _fmt(slot.gio_bat_dau);
        const gioEnd   = _fmt(slot.gio_ket_thuc);
        // Slot còn trống
        const conTrong = slot.tong_slot_can > 0 ? Math.max(0, slot.tong_slot_can - soKhach) : null;

        card.innerHTML = `
        <div class="slot-card-inner">
            <div class="slot-status-bar">${
                isToday    ? '<span class="badge-today">🔥 HÔM NAY</span>'
                : isTomorrow ? '<span class="badge-tomorrow">📅 NGÀY MAI</span>'
                : ''
            }</div>
            <div class="slot-card-header">
                <div class="slot-header-left">
                    <span class="slot-date">${dateStr}</span>
                    <span class="slot-time"><i class="fa-regular fa-clock"></i> ${gioStart} – ${gioEnd} (${slot.so_gio_choi || 0}h)</span>
                </div>
                <div class="slot-header-right">${genderBadge}</div>
            </div>

            ${slot.scam_warning ? `<div class="scam-banner"><i class="fa-solid fa-triangle-exclamation"></i>⚠️ CẢNH BÁO: Host chưa được xác minh. Tuyệt đối KHÔNG chuyển khoản cọc trước dưới mọi hình thức để tránh rủi ro lừa đảo!</div>` : ""}
            <div class="slot-card-body">
                <!-- Tên sân + quận — hyperlink mở Google Maps tab mới -->
                <div class="slot-court-info" itemscope itemtype="https://schema.org/SportsActivityLocation">
                    <h4 class="slot-court-name" itemprop="name" style="margin:0;">
                        <a href="${cardMapsUrl}" target="_blank" rel="noopener noreferrer"
                           onclick="event.stopPropagation()"
                           class="kh-san-link">
                            <i class="fa-solid fa-location-dot" style="color:#00ff88;font-size:0.82em;flex-shrink:0;filter:drop-shadow(0 0 3px rgba(0,255,136,0.6));"></i>
                            <span style="text-transform:uppercase;">${slot.ten_san || "Chưa có tên sân"}</span><span style="font-size:0.72em;opacity:0.6;margin-left:3px;">↗</span>
                            ${slot.quan_huyen ? `<span style="font-size:0.8em;color:#64748b;font-weight:500;">— ${slot.quan_huyen}</span>` : ""}
                        </a>
                    </h4>
                </div>

                <div class="slot-level-badge-wrap">
                    <div class="slot-details-row">
                        <div class="slot-detail-item" style="flex:1;">
                            <span class="detail-label">Trình độ yêu cầu</span>
                            <div class="kh-trinh-do-row" style="margin-top:4px;">${levelHTML}</div>
                        </div>
                    </div>
                    <div class="kh-da-dang-ky-badge">
                        <i class="fa-solid fa-users" style="margin-right:4px;opacity:0.7;"></i>
                        ${soKhach === 0
                            ? `<span style="color:#64748b;">Chưa có ai đặt</span>${slot.tong_slot_can > 0 ? `&nbsp;·&nbsp;<span style="color:#00ff88;font-weight:700;font-size:0.72rem;">● ${slot.tong_slot_can} slot trống</span>` : ''}`
                            : slot.tong_slot_can > 0
                                ? `<strong style="color:#e2e8f0;">${soKhach}/${slot.tong_slot_can}</strong> người đã đặt&nbsp;<span style="color:${conTrong > 0 ? '#00ff88' : '#ef4444'};font-weight:700;font-size:0.72rem;text-transform:uppercase;">${conTrong > 0 ? `● Còn ${conTrong} slot` : '● FULL SLOT'}</span>`
                                : `<strong style="color:#e2e8f0;">${soKhach}</strong> người đã đặt`}
                    </div>
                </div>

                <!-- Giá — luôn 2 cột 50/50, dim nếu không tuyển giới tính đó -->
                <div class="slot-price-row" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                    ${slot.gioi_tinh_can !== "Nữ"
                        ? `<div class="price-item price-male">
                            <span class="price-label"><i class="fa-solid fa-mars" style="color:#93c5fd;"></i> Nam</span>
                            <span class="price-value">${_fmtK(slot.gia_nam)}</span>
                           </div>`
                        : `<div class="price-item" style="opacity:0.35;">
                            <span class="price-label" style="color:#475569;"><i class="fa-solid fa-mars"></i> Nam</span>
                            <span class="price-value" style="color:#475569;font-size:0.75rem;">Không tuyển</span>
                           </div>`}
                    ${slot.gioi_tinh_can !== "Nam"
                        ? `<div class="price-item price-female">
                            <span class="price-label"><i class="fa-solid fa-venus" style="color:#f9a8d4;"></i> Nữ</span>
                            <span class="price-value">${_fmtK(slot.gia_nu)}</span>
                           </div>`
                        : `<div class="price-item" style="opacity:0.35;">
                            <span class="price-label" style="color:#475569;"><i class="fa-solid fa-venus"></i> Nữ</span>
                            <span class="price-value" style="color:#475569;font-size:0.75rem;">Không tuyển</span>
                           </div>`}
                </div>
            </div>

            <!-- Banner người đăng — 2 chips độc lập, chỉ hiện khi có data thật -->
            ${(hostInfo && (hostInfo.ten || hostInfo.sdt)) ? (() => {
                const _ten = (hostInfo.ten || "").trim();
                const _sdt = (hostInfo.sdt || "").trim();
                const _sdtEsc = _sdt.replace(/'/g, "\\'");
                const _tenEsc = _ten.replace(/'/g, "\\'");
                const _trust = hostInfo.trust ?? 100;
                const _trustBadge = _trust >= 80
                    ? `<span style="font-size:0.6rem;padding:1px 5px;border-radius:4px;background:rgba(0,255,136,0.12);border:1px solid rgba(0,255,136,0.35);color:#00ff88;font-weight:700;margin-left:4px;white-space:nowrap;">✅ UY TÍN TỐT</span>`
                    : _trust >= 60
                    ? `<span style="font-size:0.6rem;padding:1px 5px;border-radius:4px;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.35);color:#fbbf24;font-weight:700;margin-left:4px;white-space:nowrap;">⚠️ CẢNH CÁO</span>`
                    : `<span style="font-size:0.6rem;padding:1px 5px;border-radius:4px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);color:#f97316;font-weight:700;margin-left:4px;white-space:nowrap;">🔴 RỦI RO</span>`;
                return `<div class="slot-host-banner" onclick="event.stopPropagation()">
                    <span class="shb-name-chip"
                          onclick="window.xemHoSoNguoiDang('${_sdtEsc}','${_tenEsc}');event.stopPropagation()"
                          title="Xem hồ sơ & đánh giá host">
                        <i class="fa-solid fa-crown" style="color:#fbbf24;font-size:0.75em;flex-shrink:0;"></i>
                        <span class="shb-label">HOST:</span>
                        <span class="shb-name">${_ten.toUpperCase() || "ẨN DANH"}</span>${_trustBadge}
                    </span>
                    ${_sdt ? `<span class="shb-divider">|</span>
                    <span class="shb-phone-chip" onclick="event.stopPropagation()" title="SĐT Host">
                        <i class="fa-solid fa-phone" style="color:#FF5500;font-size:0.75em;flex-shrink:0;"></i>
                        <span class="shb-label">SĐT:</span>
                        ${_sdtChipHtml(_sdt, _sdtEsc)}
                    </span>` : ""}
                </div>`;
            })() : ""}

            <!-- Footer: Share(15%) | XEM CHI TIẾT(40%) | ĐẶT SLOT(45%) -->
            <div class="slot-card-footer">
                <button class="btn-slot-share"
                        onclick="window.shareKeo('${slot.id}');event.stopPropagation()"
                        title="Sao chép link">
                    <i class="fa-solid fa-link"></i>
                </button>
                <button class="btn-slot-detail"
                        onclick="window.moModalChiTietKeo('${slot.id}');event.stopPropagation()">
                    <i class="fa-regular fa-eye"></i> XEM CHI TIẾT
                </button>
                ${isLocked
                    ? (isFull
                        ? `<button style="background:#334155;border:1px solid #475569;color:#64748b;cursor:not-allowed;padding:9px 10px;border-radius:9px;font-size:0.78rem;font-weight:700;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;" disabled onclick="event.stopPropagation()">
                               <i class="fa-solid fa-users-slash"></i> FULL SLOT
                           </button>`
                        : `<button class="btn-dang-dien-ra" disabled onclick="event.stopPropagation()">
                               <span class="live-dot"></span> Đang diễn ra
                           </button>`)
                    : (window.currentGuest
                        ? (daDatSet.has(slot.id)
                            ? `<button class="btn-da-dat" disabled onclick="event.stopPropagation()">
                                <i class="fa-solid fa-circle-check"></i> ĐÃ ĐẶT
                               </button>`
                            : `<button class="btn-dat-slot" onclick="window.datSlot('${slot.id}');event.stopPropagation()">
                                <i class="fa-solid fa-ticket"></i> ĐẶT SLOT
                               </button>`)
                        : `<button class="btn-dat-slot btn-dat-slot-disabled"
                            onclick="event.stopPropagation();if(window.innerWidth < 768) window.openLoginSheet(); else window.hienToast('Cần đăng nhập','Đăng nhập hoặc đăng ký bên sidebar trái.','warning')">
                            <i class="fa-solid fa-lock"></i> ĐẶT SLOT
                           </button>`)
                }
            </div>
        </div>`;

        // Click bất kỳ vùng card (trừ Share & ĐẶT SLOT) → mở modal chi tiết
        card.querySelector('.slot-card-inner').addEventListener('click', function() {
            window.moModalChiTietKeo(slot.id);
        });

        return card;
    }

    /* ═══════════════════════════════════════════════════
     * 5. ĐẶT SLOT → INSERT vào bảng dat_slot
     * ═══════════════════════════════════════════════════ */
    window.datSlot = async function (caDauId) {
        if (!window.currentGuest) {
            window.hienToast("Cần đăng nhập", "Vui lòng đăng nhập để đăng bài hoặc đặt slot tham gia ca đấu!", "warning"); return;
        }

        try {
            // Kiểm tra ca đấu còn mở không
            const caDauList = await window.dbEngine.doc("ca_dau", { eq: { id: caDauId } });
            const caDau = caDauList[0];
            if (!caDau) { window.hienToast("Không tìm thấy", "Ca đấu không còn tồn tại.", "danger"); return; }
            if (caDau.da_chot_ca) { window.hienToast("Đã đóng", "Ca đấu này đã được chốt, không nhận thêm người.", "warning"); return; }

            // Kiểm tra trust score
            const myDiem = await _layDiemUyTin();

            // Turnstile check cho tài khoản uy tín < 80
            if (myDiem < 80) {
                if (!_xacMinhTurnstile()) {
                    if (window._tvlRenderTs) window._tvlRenderTs("turnstile-container");
                    window.hienToast("Xác minh bảo mật", "Uy tín < 80 — vui lòng hoàn thành Turnstile.", "warning");
                    return;
                }
            }

            if (myDiem < 40) {
                window.hienToast("Tài khoản bị hạn chế", "Điểm uy tín của bạn dưới 40 — tài khoản tạm khóa hành động đặt slot.", "danger");
                return;
            }
            if (myDiem < 60) {
                // Giới hạn 1 slot/ngày
                const todayStr = new Date().toISOString().slice(0, 10);
                const slotsHom = await window.dbEngine.doc("dat_slot", { eq: { sdt_khach: window.currentGuest.sdt_khach } }).catch(() => []);
                const soHomNay = slotsHom.filter(s => (s.thoi_gian_dat || "").startsWith(todayStr) && s.trang_thai_di_danh !== "Khách hủy").length;
                if (soHomNay >= 1) {
                    window.hienToast("Giới hạn 1 slot/ngày", `Uy tín ${myDiem}đ (mức Cảnh cáo) — chỉ được đặt tối đa 1 slot mỗi ngày.`, "warning");
                    return;
                }
            }

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

            // Xác định trạng thái slot: nếu uy tín 40-59 và ca không yêu cầu cọc → Chờ Host duyệt
            let trangThaiSlot = "Chờ đánh";
            if (myDiem >= 40 && myDiem < 60) {
                if (caDau.yeu_cau_coc) {
                    window.hienToast("Cần đặt cọc", `Uy tín của bạn đang ở mức rủi ro (${myDiem}đ). Ca đấu này yêu cầu chuyển cọc cho Host trước khi tham gia.`, "warning");
                } else {
                    trangThaiSlot = "Chờ Host duyệt";
                    window.hienToast("Yêu cầu đã gửi", `Uy tín thấp (${myDiem}đ) — slot chuyển sang chờ Host duyệt thủ công!`, "warning");
                }
            }

            // INSERT vào bảng dat_slot — gioi_tinh lấy từ currentGuest (fix bug hardcode "male")
            await window.dbEngine.ghi("dat_slot", {
                id_ca_dau:         caDauId,
                ten_khach:         window.currentGuest.ten_khach,
                sdt_khach:         window.currentGuest.sdt_khach,
                ma_slot:           maSlot,
                gioi_tinh:         window.currentGuest.gioi_tinh || "male",
                trang_thai_di_danh: trangThaiSlot
            });

            const msgSlot = trangThaiSlot === "Chờ Host duyệt"
                ? `Mã của bạn: ${maSlot}. Chờ Host duyệt.`
                : `Mã của bạn: ${maSlot}. Liên hệ host qua Zalo để xác nhận.`;
            window.hienToast("Đặt slot thành công! 🎉", msgSlot, "success");

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
            if (el1) {
                el1.textContent = `${soCaBuoi} Ca`;
                el1.style.color = soCaBuoi > 0 ? "var(--accent)" : "var(--text-muted)";
            }
            if (el2) {
                el2.textContent = _formatVND(tongChiTieu);
                el2.style.color = tongChiTieu > 0 ? "var(--accent-blue)" : "var(--text-muted)";
            }
            if (el3) {
                el3.textContent = `${soBung} Lần`;
                el3.style.color = soBung > 0 ? "#f87171" : "var(--text-muted)";
            }
            if (el4) {
                el4.textContent = `${soCho} Ca`;
                el4.style.color = soCho > 0 ? "#60a5fa" : "var(--text-muted)";
            }

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


            // Dữ liệu hiển thị
            const td      = s.yeu_cau_trinh_do || {};
            const baoGom  = s.tien_ich_bao_gom || {};
            const dateStr = s.ngay_danh ? new Date(s.ngay_danh).toLocaleDateString("vi-VN", { weekday:"long", day:"2-digit", month:"2-digit", year:"numeric" }) : "--";
            const tichArr = [];
            if (baoGom.san)    tichArr.push("🏟️ Tiền sân");
            if (baoGom.cau)    tichArr.push("🏸 Tiền cầu");
            if (baoGom.nuoc)   tichArr.push("💧 Nước uống");
            if (baoGom.gui_xe) tichArr.push("🏍️ Gửi xe");

            // Fallback: tên sân + quận/huyện — KHÔNG dùng dia_chi_san để tránh sai vị trí
            const mapsUrl = s.link_maps
                ? s.link_maps
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.ten_san, s.quan_huyen].filter(Boolean).join(" "))}`;

            // Tiêu đề modal — có link Maps + hover cam + icon ↗
            if (title) {
                const _titleDate = s.ngay_danh ? s.ngay_danh.split("-").reverse().join("/") : "--";
                title.innerHTML = `<i class="fa-solid fa-calendar-days" style="color:#FF5500;margin-right:8px;flex-shrink:0;font-size:0.9em;"></i><span style="color:rgba(255,255,255,0.6);font-weight:700;letter-spacing:0.05em;">CHI TIẾT CA ĐẤU</span><span style="color:#FF5500;margin:0 8px;font-weight:900;">•</span><span style="color:#fff;font-weight:900;letter-spacing:0.03em;">${_titleDate}</span>`;
            }

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

            // Hàm cắt giây khỏi chuỗi giờ: "18:00:00" → "18:00"
            const _fmtT = t => t ? t.substring(0, 5) : "--";
            const gioStr = `${_fmtT(s.gio_bat_dau)} – ${_fmtT(s.gio_ket_thuc)}${s.so_gio_choi ? ` (${s.so_gio_choi} Giờ)` : ""}`;

            // Chip tiện ích
            const _chip = (icon, lbl) =>
                `<span class="kmd-pill"><i class="${icon}" style="font-size:0.7em;"></i> ${lbl}</span>`;
            const tichChips = [];
            if (baoGom.san)    tichChips.push(_chip("fa-solid fa-map",              "Tiền sân"));
            if (baoGom.cau)    tichChips.push(_chip("fa-solid fa-feather-pointed",  "Tiền cầu"));
            if (baoGom.nuoc)   tichChips.push(_chip("fa-solid fa-bottle-water",     "Nước uống"));
            if (baoGom.gui_xe) tichChips.push(_chip("fa-solid fa-motorcycle",       "Gửi xe"));

            // Level pills — chuẩn → pill, text tự do → chữ nghiêng
            const mLvls = Array.isArray(td.nam) ? td.nam : (td.nam ? [td.nam] : []);
            const fLvls = Array.isArray(td.nu)  ? td.nu  : (td.nu  ? [td.nu]  : []);
            const gioiTinhHien = {"Nam":"NAM","Nữ":"NỮ","Cả hai":"NAM & NỮ"}[s.gioi_tinh_can] || (s.gioi_tinh_can||"--").toUpperCase();
            const _lvlPills = arr => {
                if (!arr.length) return `<span style="color:#64748b;font-size:0.78rem;">--</span>`;
                const std  = arr.filter(v => STANDARD_LEVELS.has(v)).map(v => `<span class="kmd-pill">${v}</span>`).join("");
                const free = arr.filter(v => !STANDARD_LEVELS.has(v)).join(", ");
                return std + (free ? `<em style="color:#64748b;font-size:0.75rem;margin-left:4px;">${free}</em>` : "");
            };

            // Tên cầu sử dụng — lấy từ loai_cau_su_dung[].ten, bỏ trùng
            const cauNames = [...new Set(
                (Array.isArray(s.loai_cau_su_dung) ? s.loai_cau_su_dung : [])
                    .map(c => (c.ten || "").trim()).filter(Boolean)
            )];
            const cauNamesHTML = cauNames.length > 0
                ? `<div class="kmd-row" style="margin-bottom:8px;">
                    <span class="kmd-lbl">LOẠI CẦU:</span>
                    <span class="kmd-val" style="color:#fbbf24;text-transform:uppercase;">${cauNames.join(", ")}</span>
                   </div>`
                : "";

            // Danh sách khách mới
            const khoachDaKy = khoachDaKyAll;
            const guestRows = khoachDaKy.map(g => {
                const tagCls = g.trang_thai_di_danh === "Đã tham gia" ? "kmd-status-ok"
                             : g.trang_thai_di_danh === "Bùng kèo"   ? "kmd-status-bung"
                             : g.trang_thai_di_danh === "Khách hủy"  ? "kmd-status-huy"
                             : "kmd-status-cho";
                return `<div class="kmd-guest-item">
                    <span class="kmd-guest-name">${g.ten_khach}</span>
                    <span class="kmd-guest-slot">${g.ma_slot}</span>
                    <span class="kmd-status-tag ${tagCls}">${g.trang_thai_di_danh}</span>
                </div>`;
            }).join("") || `<div style="text-align:center;padding:18px 0;"><i class="fa-solid fa-users-slash" style="font-size:1.6rem;color:#334155;display:block;margin-bottom:8px;"></i><span style="font-size:0.82rem;color:#64748b;">Chưa có ai đăng ký.</span></div>`;

            body.innerHTML = `
            ${s.scam_warning ? `<div class="scam-banner"><i class="fa-solid fa-triangle-exclamation"></i>⚠️ CẢNH BÁO: Host chưa được xác minh. Tuyệt đối KHÔNG chuyển khoản cọc trước dưới mọi hình thức để tránh rủi ro lừa đảo!</div>` : ""}
            <div class="kmd-cols">
                <!-- CỘT TRÁI: Địa Điểm & Thời Gian — thứ tự: KHU VỰC → NGÀY → GIỜ → SÂN → ĐỊA CHỈ -->
                <section class="kmd-col">
                    <h2 class="kmd-col-title"><i class="fa-solid fa-map-pin"></i> Địa Điểm & Thời Gian</h2>
                    <!-- KHU VỰC lên đầu tiên -->
                    ${(s.quan_huyen || s.tinh_thanh) ? `
                    <div class="kmd-subbox" style="margin-bottom:0;">
                        <div class="kmd-row" style="margin-bottom:0;">
                            <span class="kmd-lbl">KHU VỰC:</span>
                            <span class="kmd-val" style="color:#00ff88;">${[s.quan_huyen,s.tinh_thanh].filter(Boolean).join(", ")}</span>
                        </div>
                    </div>
                    <div class="kmd-divider"></div>` : ""}
                    <!-- Ngày & Giờ -->
                    <div class="kmd-subbox">
                        <div class="kmd-row">
                            <span class="kmd-lbl">NGÀY ĐÁNH:</span>
                            <span class="kmd-val">${dateStr}</span>
                        </div>
                        <div class="kmd-row" style="margin-bottom:0;">
                            <span class="kmd-lbl">GIỜ CHƠI:</span>
                            <span class="kmd-val">${gioStr}</span>
                        </div>
                    </div>
                    <div class="kmd-divider"></div>
                    <!-- Tên sân (hyperlink) + Địa chỉ -->
                    <div class="kmd-subbox" style="margin-bottom:0;flex:1;display:flex;flex-direction:column;">
                        <div class="kmd-row">
                            <span class="kmd-lbl">TÊN SÂN:</span>
                            <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
                               class="kmd-val kmd-ten-san-link"
                               style="color:#00e5ff;text-decoration:none;font-size:1.2rem;font-weight:900;text-transform:uppercase;letter-spacing:0.03em;line-height:1.3;cursor:pointer;">
                                <i class="fa-solid fa-location-dot" style="font-size:0.8em;margin-right:4px;filter:drop-shadow(0 0 3px rgba(0,229,255,0.6));"></i>${(s.ten_san || "--").toUpperCase()} <span style="font-size:0.72em;opacity:0.6;">↗</span>
                            </a>
                        </div>
                        <div class="kmd-row" style="margin-bottom:0;">
                            <span class="kmd-lbl">ĐỊA CHỈ CHI TIẾT:</span>
                            ${s.dia_chi_san
                                ? `<span class="kmd-val" style="font-size:0.9rem;line-height:1.45;font-weight:600;color:#e2e8f0;">${s.dia_chi_san}</span>`
                                : `<span class="kmd-val" style="font-size:0.9rem;line-height:1.45;font-weight:600;color:#475569;text-transform:uppercase;">Không có địa chỉ cụ thể</span>`}
                        </div>
                    </div>
                </section>

                <!-- CỘT PHẢI: Yêu Cầu & Chi Phí -->
                <section class="kmd-col">
                    <h2 class="kmd-col-title"><i class="fa-solid fa-sliders"></i> Yêu Cầu & Chi Phí</h2>
                    <!-- Nhóm 1: Nhân sự -->
                    <div class="kmd-subbox">
                        <div class="kmd-row">
                            <span class="kmd-lbl">CẦN TUYỂN:</span>
                            <span class="kmd-val">${gioiTinhHien}</span>
                        </div>
                        ${s.gioi_tinh_can !== "Nữ" ? `<div class="kmd-row">
                            <span class="kmd-lbl">TRÌNH ĐỘ NAM:</span>
                            <div class="kmd-pills-row">${_lvlPills(mLvls)}</div>
                        </div>` : ""}
                        ${s.gioi_tinh_can !== "Nam" ? `<div class="kmd-row">
                            <span class="kmd-lbl">TRÌNH ĐỘ NỮ:</span>
                            <div class="kmd-pills-row">${_lvlPills(fLvls)}</div>
                        </div>` : ""}
                        ${s.so_san_cu_the ? `<div class="kmd-row" style="margin-bottom:0;">
                            <span class="kmd-lbl">SÂN SỐ:</span>
                            <span class="kmd-val">${_formatSanSo(s.so_san_cu_the)}</span>
                        </div>` : ""}
                    </div>
                    <div class="kmd-divider"></div>
                    <!-- Nhóm 2: Tài chính — giá K, viền neon theo giới tính -->
                    <div class="kmd-subbox" style="margin-bottom:0;">
                        ${cauNamesHTML}
                        <div class="kmd-row" style="margin-bottom:8px;">
                            <span class="kmd-lbl">CHI PHÍ:</span>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:${tichChips.length > 0 ? '12px' : '0'};">
                            ${s.gioi_tinh_can !== "Nữ"
                                ? `<div class="kmd-price-male-active" style="background:rgba(0,195,255,0.08);border:2px solid rgba(0,195,255,0.55);border-radius:12px;padding:12px 10px;text-align:center;">
                                    <div style="font-size:0.66rem;color:#7dd3fc;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;margin-bottom:6px;">♂ NAM</div>
                                    <div style="font-size:1.35rem;font-weight:900;color:#00d4ff;line-height:1;letter-spacing:-0.01em;">${_fmtK(s.gia_nam)}</div>
                                   </div>`
                                : `<div style="background:rgba(51,65,85,0.3);border:1px solid rgba(71,85,105,0.3);border-radius:12px;padding:12px 10px;text-align:center;opacity:0.38;">
                                    <div style="font-size:0.66rem;color:#475569;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;margin-bottom:6px;">♂ NAM</div>
                                    <div style="font-size:0.8rem;color:#475569;font-style:italic;">Không tuyển</div>
                                   </div>`}
                            ${s.gioi_tinh_can !== "Nam"
                                ? `<div class="kmd-price-female-active" style="background:rgba(255,0,130,0.08);border:2px solid rgba(255,0,130,0.55);border-radius:12px;padding:12px 10px;text-align:center;">
                                    <div style="font-size:0.66rem;color:#fba8d4;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;margin-bottom:6px;">♀ NỮ</div>
                                    <div style="font-size:1.35rem;font-weight:900;color:#ff3ea5;line-height:1;letter-spacing:-0.01em;">${_fmtK(s.gia_nu)}</div>
                                   </div>`
                                : `<div style="background:rgba(51,65,85,0.3);border:1px solid rgba(71,85,105,0.3);border-radius:12px;padding:12px 10px;text-align:center;opacity:0.38;">
                                    <div style="font-size:0.66rem;color:#475569;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;margin-bottom:6px;">♀ NỮ</div>
                                    <div style="font-size:0.8rem;color:#475569;font-style:italic;">Không tuyển</div>
                                   </div>`}
                        </div>
                        ${tichChips.length > 0 ? `<div class="kmd-row" style="margin-bottom:0;"><span class="kmd-lbl">ĐÃ GỒM:</span><div class="kmd-pills-row" style="flex-wrap:wrap;gap:5px;">${tichChips.join("")}</div></div>` : ""}
                    </div>
                </section>
            </div>

            <div class="kmd-bottom">
                <h3 class="kmd-bottom-title">
                    <i class="fa-solid fa-users"></i> Người Đã Đăng Ký
                    <span style="font-weight:400;color:#64748b;margin-left:4px;">(${khoachDaKy.length})</span>
                </h3>
                ${guestRows}
            </div>

            <div class="kmd-footer-area">
            ${(() => {
                if (s.da_chot_ca) return `<div class="kmd-footer kmd-footer-chot"><i class="fa-solid fa-lock" style="margin-right:6px;"></i>Ca đấu đã được chốt — không nhận thêm đăng ký.</div>`;
                if (isLockedModal) return `<div class="kmd-footer kmd-footer-locked"><i class="fa-solid fa-hourglass-half" style="color:#fbbf24;margin-right:6px;"></i>${isStartedModal ? "Ca đấu đang diễn ra." : "Đã đủ slot — không nhận thêm."}</div>`;
                if (!window.currentGuest) return `<div style="text-align:center;padding:4px 0;"><p style="font-size:0.82rem;color:#64748b;margin-bottom:10px;">Đăng nhập để đặt slot tham gia ca này.</p><button class="btn-dat-slot" style="width:100%;" onclick="event.stopPropagation();window.chuyenTab('ca-nhan');window.dongModalChiTietKeo();if(window.innerWidth<768){setTimeout(()=>window.openLoginSheet?.(),300);}"><i class="fa-solid fa-right-to-bracket"></i> Đăng nhập / Đăng ký</button></div>`;
                const alreadyBooked = datSlotList.some(sl => sl.sdt_khach === window.currentGuest.sdt_khach && sl.trang_thai_di_danh !== "Khách hủy");
                const mySlotHere = datSlotList.find(sl => sl.sdt_khach === window.currentGuest.sdt_khach && sl.trang_thai_di_danh === "Đã tham gia");
                const canReport = s.da_chot_ca && !!mySlotHere;
                const reportBtn = canReport
                    ? `<button style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;padding:8px 14px;border-radius:9px;font-size:0.75rem;font-weight:700;cursor:pointer;font-family:inherit;margin-top:6px;width:100%;"
                        onclick="window.moFormBaoCao('${s.id}','${(s.sdt_nguoi_tao||'').replace(/'/g,"\\'")}')" >
                        <i class="fa-solid fa-flag"></i> Báo cáo Host lừa cọc
                       </button>` : "";
                return (alreadyBooked
                    ? `<button class="btn-da-dat" style="width:100%;" disabled><i class="fa-solid fa-circle-check"></i> ĐÃ ĐẶT SLOT</button>`
                    : `<button class="btn-dat-slot" style="width:100%;" onclick="window.datSlot('${s.id}');window.dongModalChiTietKeo()"><i class="fa-solid fa-bullseye"></i> ĐẶT SLOT THAM GIA</button>`)
                    + reportBtn;
            })()}
            </div>

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

    // Mở form báo cáo host (modal nhỏ inline)
    window.moFormBaoCao = function (idCaDau, sdtHost) {
        const existing = document.getElementById("formBaoCaoOverlay");
        if (existing) existing.remove();
        const el = document.createElement("div");
        el.id = "formBaoCaoOverlay";
        el.style.cssText = "position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:16px;";
        el.innerHTML = `
        <div style="background:#1a2844;border:1px solid rgba(239,68,68,0.4);border-radius:16px;padding:24px;max-width:400px;width:100%;">
            <h3 style="margin:0 0 16px;color:#fca5a5;font-size:1rem;">🚩 Báo Cáo Host Lừa Cọc</h3>
            <select id="bcLoai" class="app-select" style="width:100%;margin-bottom:10px;">
                <option value="lua_coc">Host yêu cầu cọc trái phép</option>
                <option value="khong_to_chuc">Host nhận cọc rồi không tổ chức</option>
                <option value="thong_tin_sai">Thông tin ca đấu sai lệch</option>
                <option value="khac">Khác</option>
            </select>
            <textarea id="bcMoTa" rows="3" class="app-input" style="width:100%;resize:none;margin-bottom:12px;" placeholder="Mô tả chi tiết sự việc..."></textarea>
            <div style="display:flex;gap:8px;">
                <button class="btn-primary" style="flex:1;background:rgba(239,68,68,0.8);"
                    onclick="window.guiBaoCao('${idCaDau}','${sdtHost}')">
                    <i class="fa-solid fa-flag"></i> Gửi Báo Cáo
                </button>
                <button class="btn-secondary" style="flex:1;" onclick="document.getElementById('formBaoCaoOverlay').remove()">
                    Hủy
                </button>
            </div>
        </div>`;
        document.body.appendChild(el);
    };

    window.guiBaoCao = async function (idCaDau, sdtHost) {
        const loai = document.getElementById("bcLoai")?.value || "khac";
        const moTa = document.getElementById("bcMoTa")?.value?.trim() || "";
        const mySdt = window.currentGuest?.sdt_khach;
        if (!mySdt) return;
        try {
            // Kiểm tra đã báo cáo ca này chưa
            const existed = await window.dbEngine.docThu("bao_cao", { eq: { id_ca_dau: idCaDau, sdt_nguoi_bao_cao: mySdt } });
            if ((existed || []).length > 0) {
                window.hienToast("Đã báo cáo", "Bạn đã gửi báo cáo cho ca đấu này rồi.", "warning");
                return;
            }
            await window.dbEngine.ghi("bao_cao", {
                id_ca_dau: idCaDau, sdt_nguoi_bao_cao: mySdt,
                sdt_bi_bao_cao: sdtHost, loai_bao_cao: loai,
                mo_ta: moTa, trang_thai: "cho_xu_ly"
            }, null);
            window.hienToast("Đã gửi báo cáo ✅", "Cảm ơn. Admin sẽ xem xét trong thời gian sớm nhất.", "success");
            document.getElementById("formBaoCaoOverlay")?.remove();

            // Kiểm tra đủ 3 báo cáo → đóng băng ca
            const allBc = await window.dbEngine.docThu("bao_cao", { eq: { id_ca_dau: idCaDau } });
            const validBc = (allBc || []).filter(b => b.trang_thai === "cho_xu_ly");
            if (validBc.length >= 3) {
                await window.dbEngine.ghi("ca_dau", { is_frozen: true, bao_cao_count: validBc.length }, { id: idCaDau });
            }
        } catch (e) {
            window.hienToast("Lỗi", "Không thể gửi báo cáo. Thử lại sau.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * GĐ3B — HUỶ ĐẶT SLOT
     * UPDATE trang_thai_di_danh = "Khách hủy" (KHÔNG DELETE bản ghi)
     * Điều kiện: ca chưa chốt (da_chot_ca = false)
     * ═══════════════════════════════════════════════════ */
    window.huyDatSlot = async function (datSlotId, idCaDau) {
        if (!await window.xacNhanModal("Xác nhận huỷ tham gia ca này?\nThao tác không thể hoàn tác. Bạn sẽ không thể đặt lại slot này.", '❌')) return;
        try {
            // Kiểm tra ca đấu có bị chốt chưa
            const caDauList = await window.dbEngine.doc("ca_dau", { eq: { id: idCaDau } });
            const caDau = caDauList[0];
            if (caDau?.da_chot_ca) {
                window.hienToast("Không thể huỷ", "Ca đấu đã được chốt. Liên hệ trực tiếp chủ sân.", "warning");
                return;
            }

            // Tính điểm trừ dựa trên thời gian còn lại trước giờ đánh
            const mySdt = window.currentGuest?.sdt_khach;
            if (mySdt && caDau?.ngay_danh && caDau?.gio_bat_dau) {
                const users = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: mySdt } });
                const u = (users || [])[0];
                if (u && !u.is_whitelisted) {
                    const startDt = new Date(`${caDau.ngay_danh}T${caDau.gio_bat_dau}`);
                    const diffH   = (startDt - Date.now()) / (1000 * 60 * 60);
                    const thangNow = new Date().getMonth() + 1;
                    const resetThang = u.free_pass_reset_thang ?? thangNow;
                    let freePass = u.free_pass_thang ?? 0;

                    // Reset free pass sang tháng mới
                    if (resetThang !== thangNow) freePass = 1;

                    if (diffH < 2) {
                        if (freePass > 0) {
                            // Dùng free pass — không trừ điểm
                            await window.dbEngine.ghi("nguoi_dung", {
                                free_pass_thang: 0,
                                free_pass_reset_thang: thangNow
                            }, { sdt_khach: mySdt });
                            window.hienToast("Free pass đã dùng", "Lần huỷ sát giờ này được miễn phạt (free pass tháng).", "info");
                        } else {
                            await _truDiemUyTin(mySdt, 7);
                            window.hienToast("Trừ 7 điểm uy tín", "Huỷ sát giờ đánh (< 2 tiếng) bị phạt.", "warning");
                        }
                    } else if (diffH < 4) {
                        if (freePass > 0) {
                            await window.dbEngine.ghi("nguoi_dung", { free_pass_thang: 0, free_pass_reset_thang: thangNow }, { sdt_khach: mySdt });
                        } else {
                            await _truDiemUyTin(mySdt, 3);
                            window.hienToast("Trừ 3 điểm uy tín", "Huỷ trong vòng 2-4 tiếng trước giờ đánh.", "warning");
                        }
                    }
                    // diffH >= 4 → không trừ điểm
                }
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

        // Hỗ trợ cả khach.html cũ (#danhGiaVeToiList) lẫn feed/index.html (#danhGiaContainer)
        const container = document.getElementById("danhGiaVeToiList")
                       || document.getElementById("danhGiaContainer");
        if (!container) return;

        // Hiện loading
        container.innerHTML = `<div style="text-align:center;padding:24px;color:#5a5a5a;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải đánh giá...</div>`;

        try {
            const [reviews, allCaDau, allNguoiDung] = await Promise.all([
                window.dbEngine.docThu("danh_gia_tin_dung", {
                    eq: {
                        sdt_nguoi_bi_danh_gia: window.currentGuest.sdt_khach,
                        loai_danh_gia:         "HostToGuest"
                    }
                }),
                window.dbEngine.docThu("ca_dau"),
                window.dbEngine.docThu("nguoi_dung")
            ]);

            const safeReviews     = reviews     || [];
            const safeCaDau       = allCaDau    || [];
            const safeNguoiDung   = allNguoiDung|| [];

            const caDauMap = {};
            safeCaDau.forEach(c => { caDauMap[c.id] = c; });

            const nguoiDungMap = {};
            safeNguoiDung.forEach(u => { if (u.sdt_khach) nguoiDungMap[u.sdt_khach] = u; });

            safeReviews.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            // Tính trung bình
            const avg = safeReviews.length > 0
                ? (safeReviews.reduce((s, r) => s + (r.so_sao || 0), 0) / safeReviews.length)
                : 0;
            const avgStr = avg > 0 ? avg.toFixed(1) : "—";

            // Ghi vào các element hiển thị điểm (hỗ trợ cả 2 bộ ID)
            const avgSaoEl = document.getElementById("avgSaoVeToi");
            if (avgSaoEl) {
                avgSaoEl.textContent = safeReviews.length > 0 ? `⭐ ${avgStr} (${safeReviews.length})` : "";
            }
            // Feed/index.html — 3 element riêng
            const tongDiemEl   = document.getElementById("tongDiemUyTin");
            const starsDispEl  = document.getElementById("starsDisplay");
            const soLuotEl     = document.getElementById("soLuotDanhGia");
            if (tongDiemEl) {
                tongDiemEl.textContent = avgStr;
                tongDiemEl.style.color = avg > 0 ? "#fbbf24" : "var(--text-muted)";
            }
            if (starsDispEl) {
                if (avg > 0) {
                    starsDispEl.innerHTML = Array(5).fill(0).map((_, i) =>
                        `<i class="fa-${i < Math.round(avg) ? "solid" : "regular"} fa-star"
                            style="color:${i < Math.round(avg) ? "#fbbf24" : "#444"};font-size:1.1rem;"></i>`
                    ).join("");
                } else {
                    starsDispEl.textContent = "—";
                }
            }
            if (soLuotEl) soLuotEl.textContent = safeReviews.length > 0
                ? `${safeReviews.length} lượt đánh giá` : "Chưa có đánh giá nào";

            if (safeReviews.length === 0) {
                container.innerHTML = `<p style="font-size:0.82rem;color:#5a5a5a;text-align:center;padding:24px 0;">
                    Chưa có đánh giá nào từ Host.</p>`;
                return;
            }

            container.innerHTML = safeReviews.map(r => {
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

    // Định dạng giá ngắn gọn: 65000 → "65K"
    function _fmtK(n) {
        return Math.round((n || 0) / 1000).toLocaleString("vi-VN") + "K";
    }

    // Danh sách cấp độ chuẩn — bọc pill; ngoài danh sách → chữ nghiêng
    const STANDARD_LEVELS = new Set(["Newbie", "Yếu", "TBY", "TB-", "TB+", "TB khá"]);

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
        // Khi phan-he-ung-dung.js (SPA coordinator) đã load → bỏ qua, để SPA điều phối
        // Chỉ tự khởi tạo khi chạy standalone (không có coordinator)
        if (window.khoiTaoUngDung) return;
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

            // Lấy SĐT host từ ca_dau (ưu tiên sdt_nguoi_tao cho model mới, fallback quan_ly_key)
            const caDauList = await window.dbEngine.docThu("ca_dau", { eq: { id: caDauId } });
            const caDau     = (caDauList || [])[0];
            let hostPhone   = caDau?.sdt_nguoi_tao || "";
            if (!hostPhone && caDau?.ma_key_host) {
                const keyList = await window.dbEngine.docThu("quan_ly_key",
                    { eq: { ma_key: caDau.ma_key_host } }) || [];
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
                window.dbEngine.docThu("dat_slot", { eq: { sdt_khach: myPhone } }),
                window.dbEngine.docThu("ca_dau"),
                window.dbEngine.docThu("danh_gia_tin_dung", {
                    eq: { sdt_nguoi_viet: myPhone, loai_danh_gia: "GuestToHost" }
                })
            ]);
            // docThu trả về null nếu lỗi — chuyển thành mảng rỗng để code dưới chạy được
            if (!myDatSlots) { timeline.innerHTML = `<div style="text-align:center;padding:40px;color:#5a5a5a;">Không thể tải lịch sử. Kiểm tra kết nối và thử lại.</div>`; return; }

            const caDauMap   = {};
            (allCaDau || []).forEach(c => { caDauMap[c.id] = c; });

            // Set ID ca đấu đã review
            const reviewedSet = new Set((myReviews || []).map(r => r.id_ca_dau));

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

    // Export các hàm private cần thiết cho phan-he-ung-dung.js gọi được
    window._napDropdownBoLoc  = _napDropdownBoLoc;
    window._napDropdownDrawer = _napDropdownDrawer;
    window._taiDanhGiaVeToi   = _taiDanhGiaVeToi;

    console.log("⚡ [Phân Hệ Khách Chơi v4.4]: BUG1-3-4 ✅ | ĐÁNH_GIÁ_VỀ_TÔI ✅ | TÔI_ĐÃ_ĐÁNH_GIÁ ✅ | HỒ_SƠ_TÍN_DỤNG_v2 ✅");
})();
