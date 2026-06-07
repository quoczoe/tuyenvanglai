/* =========================================================================
 * 🏟️ PHÂN HỆ HOST SÂN (HOST PORTAL) - PHAN-HE-HOST.JS (v3.0)
 * Dự án: TUYENVANGLAI.IO.VN
 *
 * v3.0 (Phiên 4 — 2026-05-24):
 *   - MODULE 4: Bỏ key entry screen — thay bằng session-based auth
 *       khoiTaoTrangHost() đọc tvl_guest (vai_tro='host') thay vì tvl_host_key
 *   - GĐ4A: Dashboard Doanh Thu Host (tab mới)
 *   - GĐ4B: Export CSV + In ca đấu
 *   - F0: Đổi text "Host Sân" → "Host Sân"
 *   - F3: Nominatim maps inline (thay nút redirect Google Maps)
 *   - F5: Shuttlecock form layout 2 cột rộng rãi
 *
 * v2.0: Đồng bộ field mapping với Supabase schema thật
 *       Bỏ hoàn toàn registered_guests[] → dùng bảng dat_slot riêng
 *       Bỏ "slots"/"keys"/"reviews" → dùng "ca_dau"/"quan_ly_key"/"danh_gia_tin_dung"
 * =========================================================================
 */

(function () {
    // ── Trạng thái toàn cục phân hệ Host ──
    window.currentHostKey  = null;
    window.currentHostInfo = null;
    window.shuttlecocksList = [];
    window.currentEditingSlotId = null;
    window.hostRatingStarIndex  = 5;

    let _calcBreakEvenMale = 0, _calcBreakEvenFemale = 0;
    let _calcSmallMale = 0,     _calcSmallFemale = 0;
    let _calcBigMale   = 0,     _calcBigFemale   = 0;

    // Chuẩn hóa tên sân: tự bổ sung "SÂN CẦU LÔNG " nếu thiếu, viết hoa toàn bộ
    function _chuanHoaTenSan(raw) {
        const s = (raw || "").trim();
        if (!s) return s;
        const lower       = s.toLowerCase();
        const coSan       = lower.includes("sân");
        const coCauLong   = lower.includes("cầu lông");
        const coBadminton = lower.includes("badminton");
        let result;
        if (coSan && !coCauLong && !coBadminton) {
            // A: có "sân" nhưng không có "cầu lông"/"badminton" → thay bằng tiền tố chuẩn
            result = "SÂN CẦU LÔNG " + s.replace(/^sân\s*/i, "").trim();
        } else if (coCauLong && !coSan) {
            // B: có "cầu lông" nhưng thiếu "sân" → chèn "SÂN " vào đầu
            result = "SÂN " + s;
        } else if (!coSan && !coCauLong && !coBadminton) {
            // C: không có từ khóa nào → chèn thẳng tiền tố chuẩn
            result = "SÂN CẦU LÔNG " + s;
        } else {
            // D: đã đủ "sân cầu lông" hoặc chứa "badminton" → giữ nguyên
            result = s;
        }
        return result.toUpperCase();
    }

    // Từ khóa chống lừa đảo cọc
    const _SCAM_KEYWORDS = ["cọc","đặt cọc","chuyển khoản","stk","số tài khoản","momo","chuyển trước","bank","tài khoản ngân hàng"];

    function _quetTuKhoaLuaDao(text) {
        const lower = (text || "").toLowerCase();
        return _SCAM_KEYWORDS.some(kw => lower.includes(kw));
    }

    // Kiểm tra host đủ điều kiện bật toggle cọc (tuổi ≥7 ngày + ≥3 ca thành công)
    async function _kiemTraDieuKienCoc(ngayThamGia, sdt) {
        const now = Date.now();
        const joined = ngayThamGia ? new Date(ngayThamGia).getTime() : now;
        const tuoiNgay = (now - joined) / (1000 * 60 * 60 * 24);
        if (tuoiNgay < 7) return false;
        try {
            const cas = await window.dbEngine.doc("ca_dau", { eq: { sdt_nguoi_tao: sdt } }).catch(() => []);
            const soThanhCong = cas.filter(c => c.da_chot_ca && !c.is_frozen).length;
            return soThanhCong >= 3;
        } catch { return false; }
    }

    // Modal context — lưu giữa lần mở để _updateKtBanner() đọc được
    let _ktModalSlot   = 0;
    let _ktModalGender = "both";
    let _ktModalSoSan  = 1;

    /* ═══════════════════════════════════════════════════
     * TIỆN ÍCH XÁC ĐỊNH VÙNG MIỀN TỪ TỈNH THÀNH
     * ═══════════════════════════════════════════════════ */
    function _xacDinhVungMien(tinh) {
        const namArr = ["TP. Hồ Chí Minh","Bình Dương","Đồng Nai","Long An","Tây Ninh","Bình Phước",
            "Bà Rịa - Vũng Tàu","Tiền Giang","Bến Tre","Trà Vinh","Vĩnh Long","Đồng Tháp",
            "An Giang","Kiên Giang","Cần Thơ","Hậu Giang","Sóc Trăng","Bạc Liêu","Cà Mau",
            "Lâm Đồng","Bình Thuận","Ninh Thuận","Khánh Hòa"];
        const trungArr = ["Đà Nẵng","Quảng Nam","Quảng Ngãi","Bình Định","Phú Yên","Gia Lai",
            "Kon Tum","Đắk Lắk","Đắk Nông","Thừa Thiên Huế","Quảng Trị","Quảng Bình",
            "Hà Tĩnh","Nghệ An","Thanh Hóa"];
        if (namArr.includes(tinh)) return "Nam";
        if (trungArr.includes(tinh)) return "Trung";
        return "Bắc";
    }

    /* ═══════════════════════════════════════════════════
     * 1. KHỞI TẠO TRANG HOST — SESSION-BASED AUTH (v3.0)
     * Không còn màn hình nhập key riêng — check tvl_guest.vai_tro
     * ═══════════════════════════════════════════════════ */
    window.khoiTaoTrangHost = async function () {
        // Mô hình mới: 1 tài khoản, mọi user đều có quyền đăng kèo
        // Chỉ cần đăng nhập — không cần Key SaaS
        const savedSession = localStorage.getItem("tvl_user") || localStorage.getItem("tvl_guest");

        if (!savedSession) {
            window.hienToast("Cần đăng nhập", "Vui lòng đăng nhập để đăng bài hoặc đặt slot tham gia ca đấu!", "warning");
            _hienThiManKichHoat();
            // Trong SPA (index.html): chuyển tab không reload
            // Ngoài SPA (host.html cũ): redirect về trang login
            setTimeout(() => {
                if (window.chuyenTab) window.chuyenTab('ca-nhan');
                else window.location.href = "/ho-so";
            }, 1500);
            return;
        }

        try {
            const userData = JSON.parse(savedSession);
            // Kiểm tra session hết hạn
            if (userData._expires_at && Date.now() > userData._expires_at) {
                localStorage.removeItem("tvl_user");
                localStorage.removeItem("tvl_guest");
                window.hienToast("Phiên hết hạn", "Vui lòng đăng nhập lại.", "warning");
                setTimeout(() => {
                    if (window.chuyenTab) window.chuyenTab('ca-nhan');
                    else window.location.href = "/ho-so";
                }, 1500);
                _hienThiManKichHoat();
                return;
            }
            window.currentUser    = userData;
            window.currentGuest   = userData; // backward compat
            window.currentHostKey = userData.sdt_khach; // dùng SĐT làm định danh thay key
        } catch {
            _hienThiManKichHoat();
            return;
        }

        _hienThiDashboard();
        _khoiTaoStarRating();

        // Kiểm tra điều kiện mở toggle cọc (async, không block UI)
        const sdt = window.currentGuest?.sdt_khach;
        const ngayThamGia = window.currentGuest?.ngay_tham_gia;
        if (sdt) {
            _kiemTraDieuKienCoc(ngayThamGia, sdt).then(duDieu => {
                const chk = document.getElementById("hostRequireCoc");
                const lbl = document.getElementById("hostRequireCocLabel");
                if (chk && duDieu) {
                    chk.disabled = false;
                    if (lbl) lbl.textContent = 'Bật để yêu cầu khách chuyển cọc trước khi giữ chỗ';
                }
            }).catch(() => {});
        }
    };

    /**
     * Giữ lại hàm xacThucKeyHost để backward compat (host.html cũ còn form nhập key).
     * Sau khi host.html được cập nhật, hàm này sẽ không còn được gọi.
     */
    window.xacThucKeyHostDuPhong = window.xacThucKeyHost;

    function _hienThiManKichHoat() {
        const auth = document.getElementById("hostAuthPanel");
        const con  = document.getElementById("hostConsole");
        if (auth) auth.style.display = "block";
        if (con)  con.style.display  = "none";
    }

    /* ═══════════════════════════════════════════════════════════════
     * FIX E — Hiện hướng dẫn mua key bên dưới form nhập key
     * Gọi khi user đã đăng nhập nhưng vai_tro vẫn là 'guest'
     * ═══════════════════════════════════════════════════════════════ */
    function _hienHuongDanMuaKey(tenKhach) {
        // Cập nhật sub-text để phù hợp ngữ cảnh
        const sub = document.getElementById("hostAuthSubText");
        if (sub) {
            sub.textContent = "Nhập mã SaaS Key để kích hoạt quyền đăng kèo vãng lai.";
        }

        // Inject hướng dẫn liên hệ vào #hostKeyHint
        const hint = document.getElementById("hostKeyHint");
        if (!hint) return;
        hint.innerHTML = `
            <div style="margin-top:14px;padding:12px 14px;border-radius:8px;
                        border:1px solid rgba(0,255,136,0.2);
                        background:rgba(0,255,136,0.04);
                        font-size:0.78rem;color:#9ca3af;line-height:1.6;">
                <div style="color:#00ff88;font-weight:700;margin-bottom:6px;">
                    <i class="fa-solid fa-circle-info"></i>
                    Xin chào${tenKhach ? " " + tenKhach : ""}!
                </div>
                Bạn đang truy cập khu vực <strong style="color:#e2e8f0;">HOST SÂN</strong> —
                dành cho người muốn đăng bài gom khách vãng lai.<br><br>
                Để kích hoạt, bạn cần một <strong style="color:#00ff88;">Mã SaaS Key</strong>
                từ Admin. Liên hệ:<br>
                <a href="https://m.me/tuyenvanglai" target="_blank" rel="noopener"
                   style="color:#00ff88;font-weight:700;text-decoration:none;
                          display:inline-flex;align-items:center;gap:6px;margin-top:8px;">
                    <i class="fa-brands fa-facebook-messenger"></i>
                    Nhắn tin Admin qua Facebook Messenger ↗
                </a>
            </div>
        `;
        hint.style.display = "block";
    }

    async function _hienThiDashboard() {
        const auth = document.getElementById("hostAuthPanel");
        const con  = document.getElementById("hostConsole");
        if (auth) auth.style.display = "none";
        if (con)  con.style.display  = "block";

        // Hiện thông tin từ session — không cần key
        const _g = window.currentGuest || window.currentUser;
        const nameEl = document.getElementById("hostDisplayName");
        const keyEl  = document.getElementById("hostDisplayKey");
        const expEl  = document.getElementById("hostDisplayExpiry");
        if (nameEl) nameEl.textContent = _g?.ten_khach || "Người dùng";
        if (keyEl)  keyEl.style.display  = "none";
        if (expEl)  expEl.style.display  = "none";

        _napDropdownTinhThanh("hostProvince", "hostDistrict");

        const dateInput = document.getElementById("hostDatePlay");
        if (dateInput) {
            const today = new Date().toLocaleDateString("sv-SE");
            dateInput.min = today;
            if (!dateInput.value) dateInput.value = today;
        }

        // Điền cặp select giờ:phút — mặc định realtime+20p khi hôm nay, 18:00 khi ngày khác
        {
            const _dv = document.getElementById("hostDatePlay")?.value;
            const _today = new Date().toLocaleDateString("sv-SE");
            const _isToday = !_dv || _dv === _today;
            const startDef = _isToday ? _gioMacDinhHomNay() : "18:00";
            const [_sh, _sm] = startDef.split(":").map(Number);
            const _endMin = _sh * 60 + _sm + 120;
            const endDef = `${String(Math.floor(_endMin / 60) % 24).padStart(2,"0")}:${String(_endMin % 60).padStart(2,"0")}`;
            _napThoiGianPair("hostTimeStart", startDef);
            _napThoiGianPair("hostTimeEnd",   endDef);
            _capNhatGioSelect(_isToday);
        }

        window.shuttlecocksList = [];
        const ctr = document.getElementById("shuttlecockListContainer");
        if (ctr) ctr.innerHTML = "";
        _themHangCauMoi("Hải Yến", "12", 300000, 12);

        _tinhThoiGian();
        await _taiLichSuCaDau();
        _resetFormDangCa();
    }

    /* Show/hide section trình độ + cập nhật label + disable/enable ô giá theo giới tính */
    window._capNhatTrinhDoSection = function (gender) {
        const namSec  = document.getElementById("levelNamSection");
        const nuSec   = document.getElementById("levelNuSection");
        const lblNam  = document.getElementById("labelTrinhDoNam");
        if (!namSec || !nuSec) return;

        // ── Trình độ show/hide — 2 dòng độc lập 100% rộng ──
        if (gender === "male") {
            namSec.style.display = "block";
            nuSec.style.display  = "none";
            if (lblNam) lblNam.textContent = "Trình độ Nam yêu cầu";
        } else if (gender === "female") {
            namSec.style.display = "none";
            nuSec.style.display  = "block";
        } else {
            namSec.style.display = "block";
            nuSec.style.display  = "block";
            if (lblNam) lblNam.textContent = "Trình độ Nam yêu cầu";
        }

        // ── Disable/enable ô giá Nam/Nữ theo giới tính tuyển ──
        const malePrice   = document.getElementById("hostPublicPriceMale");
        const femalePrice = document.getElementById("hostPublicPriceFemale");
        if (gender === "male") {
            if (malePrice)   { malePrice.disabled = false; malePrice.placeholder = "VD: 80"; }
            if (femalePrice) {
                femalePrice.disabled = true;
                femalePrice.value = "";
                femalePrice.dataset.rawValue = "0";
                femalePrice.placeholder = "(Không tuyển nữ)";
            }
        } else if (gender === "female") {
            if (malePrice)   {
                malePrice.disabled = true;
                malePrice.value = "";
                malePrice.dataset.rawValue = "0";
                malePrice.placeholder = "(Không tuyển nam)";
            }
            if (femalePrice) { femalePrice.disabled = false; femalePrice.placeholder = "VD: 60"; }
        } else {
            if (malePrice)   { malePrice.disabled = false; malePrice.placeholder = "VD: 80"; }
            if (femalePrice) { femalePrice.disabled = false; femalePrice.placeholder = "VD: 60"; }
        }
    };

    /* Mở Google Maps tìm kiếm theo tên sân + địa chỉ đã nhập */
    const _MAPS_REGEX = /(google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com)/i;

    window._validateMapsLink = function () {
        const inp = document.getElementById("hostMapsLink");
        const err = document.getElementById("hostMapsLinkErr");
        const btn = document.getElementById("btnDangCa");
        if (!inp) return true;
        const val = inp.value.trim();
        if (!val) {
            inp.style.borderColor = "";
            if (err) { err.textContent = ""; err.style.display = "none"; }
            if (btn) btn.disabled = false;
            return true;
        }
        const valid = _MAPS_REGEX.test(val);
        inp.style.borderColor = valid ? "" : "#ef4444";
        if (err) {
            err.textContent = valid ? "" : "Link Google Maps không đúng định dạng, vui lòng kiểm tra lại!";
            err.style.display = valid ? "none" : "block";
        }
        if (btn) btn.disabled = !valid;
        return valid;
    };

    window._moTimKiemMaps = function () {
        const rawName  = (document.getElementById("hostCourtName")?.value || "").trim();
        const tenSan   = _chuanHoaTenSan(rawName);
        const inp      = document.getElementById("hostCourtName");
        if (inp && tenSan && tenSan !== rawName) inp.value = tenSan;
        const addr     = (document.getElementById("hostCourtAddress")?.value || "").trim();
        const district = document.getElementById("hostDistrict")?.value || "";
        const province = document.getElementById("hostProvince")?.value || "";
        const q = [tenSan, addr, district, province].filter(Boolean).join(" ");
        if (!q) {
            window.hienToast("Thiếu thông tin", "Nhập tên sân hoặc địa chỉ trước khi tìm Maps.", "warning");
            return;
        }
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, "_blank");
    };

    /* ═══════════════════════════════════════════════════
     * 2. XÁC THỰC KEY KÍCH HOẠT
     * ═══════════════════════════════════════════════════ */
    window.xacThucKeyHost = async function () {
        const inp = document.getElementById("hostActivationKey");
        if (!inp) return;
        const key = inp.value.trim().toUpperCase();
        if (!key) {
            window.hienToast("Thiếu thông tin", "Vui lòng nhập mã Key kích hoạt.", "danger");
            return;
        }

        const btn = document.querySelector("[onclick='xacThucKeyHost()']");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...'; }

        try {
            // Tra cứu key trong bảng quan_ly_key
            const keys = await window.dbEngine.doc("quan_ly_key", { eq: { ma_key: key } });
            const matched = keys[0];

            if (!matched) {
                window.hienToast("Key không tồn tại", "Mã Key này không có trong hệ thống. Vui lòng kiểm tra lại.", "danger");
                return;
            }

            // Kiểm tra trạng thái
            if (matched.trang_thai === "Bị khóa") {
                window.hienToast("Key bị khóa", "Key này đã bị Admin khóa tạm thời. Liên hệ Admin để mở khóa.", "danger");
                return;
            }

            // Kiểm tra hạn dùng
            if (matched.ngay_het_han) {
                const ngayHetHan = new Date(matched.ngay_het_han);
                if (ngayHetHan < new Date()) {
                    window.hienToast("Key đã hết hạn", `Key hết hạn từ ${ngayHetHan.toLocaleDateString("vi-VN")}. Liên hệ Admin gia hạn.`, "danger");
                    return;
                }
            }

            // Kiểm tra ràng buộc thiết bị
            const deviceId = _layHoacTaoDeviceId();
            if (matched.id_thiet_bi && matched.id_thiet_bi !== deviceId) {
                window.hienToast("Thiết bị không khớp", "Key này đã được kích hoạt trên thiết bị khác. Liên hệ Admin để reset.", "danger");
                return;
            }

            // Ghi device_id lần đầu kích hoạt + cập nhật ngay_kich_hoat nếu chưa có
            if (!matched.id_thiet_bi) {
                const capNhatPayload = { id_thiet_bi: deviceId };
                if (!matched.ngay_kich_hoat) {
                    const now = new Date();
                    capNhatPayload.ngay_kich_hoat = now.toISOString();
                    // Tính lại ngay_het_han từ ngày kích hoạt nếu chưa có
                    if (!matched.ngay_het_han) {
                        const soNgay = matched.so_ngay_duoc_xai || 30;
                        capNhatPayload.ngay_het_han = new Date(now.getTime() + soNgay * 86400000).toISOString();
                    }
                    capNhatPayload.trang_thai = "Đang chạy";
                }
                try {
                    await window.dbEngine.ghi("quan_ly_key", capNhatPayload, { ma_key: key });
                } catch (e) { console.warn("Không cập nhật được device_id:", e); }
            }

            window.currentHostKey  = key;
            window.currentHostInfo = matched;
            // FIX E: Cập nhật vai_tro + ma_key_host trong session tvl_guest
            const savedG = localStorage.getItem("tvl_guest");
            if (savedG) {
                try {
                    const gd = JSON.parse(savedG);
                    gd.vai_tro    = "host";
                    gd.ma_key_host = key;
                    localStorage.setItem("tvl_guest", JSON.stringify(gd));
                    window.currentUser = gd;
                    // Đồng thời ghi lên Supabase để đồng bộ nguoi_dung.vai_tro
                    try {
                        await window.dbEngine.ghi(
                            "nguoi_dung",
                            { vai_tro: "host", ma_key_host: key },
                            { sdt_khach: gd.sdt_khach }
                        );
                    } catch (dbErr) {
                        console.warn("[xacThucKeyHost] Không ghi được nguoi_dung:", dbErr);
                        // Không chặn luồng — localStorage đã cập nhật
                    }
                } catch (_) { /* JSON lỗi — bỏ qua */ }
            }
            localStorage.setItem("tvl_host_key", key); // backward compat
            window.hienToast("🏟️ Kích hoạt thành công!", "Chào mừng Host Sân mới! Đang tải dashboard...", "success");
            // FIX E: Không reload/redirect — render dashboard tại chỗ
            await _hienThiDashboard();

        } catch (e) {
            console.error("Lỗi xác thực key:", e);
            window.hienToast("Lỗi kết nối", "Không thể xác thực Key lên máy chủ. Vui lòng thử lại.", "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key"></i> Kích Hoạt Quyền Quản Trị'; }
        }
    };

    window.dangXuatHost = async function () {
        if (!await window.xacNhanModal("Bạn có chắc muốn đăng xuất khỏi Trạm Host?\nBạn sẽ được chuyển về trang Khách.", '🚪')) return;
        // Xóa cả session mới (tvl_guest) lẫn backward compat cũ (tvl_host_key)
        localStorage.removeItem("tvl_host_key");
        // Reset vai_tro về guest trong tvl_guest (không xóa hoàn toàn — giữ thông tin cá nhân)
        try {
            const saved = localStorage.getItem("tvl_guest");
            if (saved) {
                const guestData = JSON.parse(saved);
                // Chỉ clear vai_tro host, giữ thông tin đăng nhập khách
                guestData.vai_tro    = "guest";
                guestData.ma_key_host = null;
                localStorage.setItem("tvl_guest", JSON.stringify(guestData));
            }
        } catch { localStorage.removeItem("tvl_guest"); }
        window.currentHostKey  = null;
        window.currentHostInfo = null;
        window.currentUser     = null;
        window.hienToast("Đã đăng xuất Host", "Phiên quản trị đã kết thúc. Quay về trang Khách...", "info");
        setTimeout(() => {
            if (window.chuyenTab) window.chuyenTab('gioi-thieu');
            else window.location.href = "/";
        }, 1500);
    };

    function _layHoacTaoDeviceId() {
        let did = localStorage.getItem("tvl_device_id");
        if (!did) {
            did = "DV-" + Math.random().toString(36).slice(2, 10).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();
            localStorage.setItem("tvl_device_id", did);
        }
        return did;
    }

    /* ═══════════════════════════════════════════════════
     * 3. DROPDOWN TỈNH/HUYỆN
     * ═══════════════════════════════════════════════════ */
    // 8 tỉnh thành trọng điểm cầu lông (dùng chung với bộ lọc Tìm Kèo)
    const _TINH_THANH_TRONG_DIEM = [
        { name: "TP. Hồ Chí Minh", districts: ["Quận 1","Quận 3","Quận 4","Quận 5","Quận 6","Quận 7","Quận 8","Quận 10","Quận 11","Quận 12","Tân Bình","Bình Thạnh","Gò Vấp","Thủ Đức","Phú Nhuận","Tân Phú","Bình Tân","Hóc Môn","Củ Chi","Nhà Bè","Bình Chánh","Cần Giờ"] },
        { name: "Hà Nội",           districts: ["Ba Đình","Hoàn Kiếm","Tây Hồ","Long Biên","Cầu Giấy","Đống Đa","Hai Bà Trưng","Hoàng Mai","Thanh Xuân","Nam Từ Liêm","Bắc Từ Liêm","Hà Đông","Đông Anh","Gia Lâm","Thanh Trì","Sóc Sơn"] },
        { name: "Bình Dương",       districts: ["Thủ Dầu Một","Thuận An","Dĩ An","Bến Cát","Tân Uyên","Bàu Bàng","Dầu Tiếng","Phú Giáo","Bắc Tân Uyên"] },
        { name: "Đà Nẵng",         districts: ["Hải Châu","Thanh Khê","Sơn Trà","Ngũ Hành Sơn","Liên Chiểu","Cẩm Lệ","Hòa Vang"] },
    ];

    function _napDropdownTinhThanh(provId, distId) {
        const provSel = document.getElementById(provId);
        if (!provSel) return;
        provSel.innerHTML = '<option value="">-- Chọn Tỉnh/Thành --</option>';
        _TINH_THANH_TRONG_DIEM.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.name; opt.textContent = p.name;
            provSel.appendChild(opt);
        });
        provSel.addEventListener("change", () => _capNhatHuyen(provSel.value, distId));
    }

    function _capNhatHuyen(provName, distId) {
        const distSel = document.getElementById(distId);
        if (!distSel) return;
        distSel.innerHTML = '<option value="">-- Chọn Quận/Huyện --</option>';
        if (!provName) return;
        const prov = _TINH_THANH_TRONG_DIEM.find(p => p.name === provName);
        if (prov) prov.districts.forEach(d => {
            const opt = document.createElement("option");
            opt.value = d; opt.textContent = d;
            distSel.appendChild(opt);
        });
    }

    window.capNhatQuanHuyenHost = function () {
        _capNhatHuyen(document.getElementById("hostProvince")?.value, "hostDistrict");
    };

    /* ═══════════════════════════════════════════════════
     * VALIDATION SÂN CỤ THỂ — chặn trùng lặp + vượt số lượng
     * ═══════════════════════════════════════════════════ */
    window.validateSanCuThe = function (inputEl) {
        const soSan  = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const hintEl = document.getElementById("hintSanCuThe");
        const btnEl  = document.getElementById("btnDangCa");
        let raw = inputEl.value;
        let errorMsg = "";

        if (soSan === 1) {
            raw = raw.replace(/[^0-9]/g, "").slice(0, 3);
            inputEl.value = raw;
            if (hintEl) { hintEl.textContent = raw ? `Sân số ${raw}` : ""; hintEl.style.color = "#64748b"; }
            if (btnEl) btnEl.disabled = false;
            return;
        }

        // Chuẩn hóa chuỗi
        raw = raw.replace(/[^0-9,\s]/g, "");
        raw = raw.replace(/(\d) /g, "$1, ");
        raw = raw.replace(/(\d)[, ]+(\d)/g, "$1, $2");
        inputEl.value = raw;

        const parts = raw.split(",").map(p => p.trim()).filter(p => p !== "");

        // Kiểm tra trùng lặp
        const seen = new Set();
        let hasDup = false;
        for (const p of parts) {
            if (seen.has(p)) { hasDup = true; break; }
            seen.add(p);
        }

        if (hasDup) {
            errorMsg = "⚠️ Số sân không được trùng lặp!";
        } else if (parts.length > soSan) {
            errorMsg = `⚠️ Số sân cụ thể vượt quá ${soSan} sân đã chọn!`;
        }

        if (hintEl) {
            if (errorMsg) {
                hintEl.textContent = errorMsg;
                hintEl.style.color = "#ef4444";
            } else if (parts.length > 0) {
                hintEl.textContent = `Sân: ${parts.join(", ")} (${parts.length}/${soSan})`;
                hintEl.style.color = "#64748b";
            } else {
                hintEl.textContent = "";
            }
        }

        if (btnEl) btnEl.disabled = !!errorMsg;
    };


    /* ═══════════════════════════════════════════════════
     * TIỆN ÍCH: Cặp select GIỜ : PHÚT cho thời gian 24h
     * prefix = "hostTimeStart" hoặc "hostTimeEnd"
     * → điền vào id="${prefix}H" (00-23) và id="${prefix}M" (00,05,...,55)
     * ═══════════════════════════════════════════════════ */
    // Tính giờ mặc định hôm nay = realtime + 20 phút, snap lên bội số 15 gần nhất
    function _gioMacDinhHomNay() {
        const now = new Date();
        const totalMin = now.getHours() * 60 + now.getMinutes() + 20;
        const snapped  = Math.ceil(totalMin / 15) * 15;
        const h = Math.floor(snapped / 60) % 24;
        const m = snapped % 60;
        return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    }

    // Cập nhật disabled trên option phút theo giờ đang chọn (chỉ khi ngày = hôm nay)
    function _capNhatPhutSelect() {
        const dateVal  = document.getElementById("hostDatePlay")?.value || "";
        const todayStr = new Date().toLocaleDateString("sv-SE");
        const selH = document.getElementById("hostTimeStartH");
        const selM = document.getElementById("hostTimeStartM");
        if (!selH || !selM) return;
        if (dateVal !== todayStr) {
            Array.from(selM.options).forEach(o => { o.disabled = false; o.style.color = ""; });
            return;
        }
        const now = new Date();
        const curH = now.getHours();
        const curM = now.getMinutes();
        const selHVal = parseInt(selH.value, 10);
        Array.from(selM.options).forEach(o => {
            const m = parseInt(o.value, 10);
            const isPast = selHVal < curH || (selHVal === curH && m <= curM);
            o.disabled = isPast;
            o.style.color = isPast ? "#334155" : "";
        });
    }
    window._capNhatPhutSelect = _capNhatPhutSelect;

    // Disable giờ quá khứ trong select Giờ Bắt Đầu khi ngày = hôm nay
    function _capNhatGioSelect(isToday) {
        const selH = document.getElementById("hostTimeStartH");
        if (!selH) return;
        const curH = new Date().getHours();
        Array.from(selH.options).forEach(o => {
            const h = parseInt(o.value, 10);
            const isPast = isToday && h < curH;
            o.disabled = isPast;
            o.style.color = isPast ? "#334155" : "";
        });
        _capNhatPhutSelect();
    }

    // Xử lý khi user thay đổi ngày đánh
    window._onNgayDanhChange = function () {
        const dateInput = document.getElementById("hostDatePlay");
        const todayStr  = new Date().toLocaleDateString("sv-SE");
        // Chặn ngày trong quá khứ — reset về hôm nay và thông báo
        if (dateInput?.value && dateInput.value < todayStr) {
            dateInput.value = todayStr;
            window.hienToast?.("Không hợp lệ", "Không thể chọn ngày trong quá khứ. Đã reset về hôm nay.", "warning");
        }
        const isToday   = !dateInput?.value || dateInput.value === todayStr;
        _capNhatGioSelect(isToday);
        // Nếu giờ đang chọn đã qua → snap về giờ hợp lệ
        if (isToday) {
            const selH = document.getElementById("hostTimeStartH");
            const selM = document.getElementById("hostTimeStartM");
            if (selH && selM) {
                const now = new Date();
                const selectedTotalMin = parseInt(selH.value, 10) * 60 + parseInt(selM.value, 10);
                const curTotalMin = now.getHours() * 60 + now.getMinutes();
                if (selectedTotalMin <= curTotalMin) {
                    const nextStr = _gioMacDinhHomNay();
                    const [nh, nm] = nextStr.split(":").map(Number);
                    selH.value = String(nh).padStart(2, "0");
                    selM.value = String(nm).padStart(2, "0");
                    // End = start + 2h
                    const endTotalMin = nh * 60 + nm + 120;
                    const eH = document.getElementById("hostTimeEndH");
                    const eM = document.getElementById("hostTimeEndM");
                    if (eH) eH.value = String(Math.floor(endTotalMin / 60) % 24).padStart(2, "0");
                    if (eM) eM.value = String(endTotalMin % 60).padStart(2, "0");
                }
            }
        }
        window._tinhThoiGian?.();
    };

    function _napThoiGianPair(prefix, defaultHHMM) {
        const parts = (defaultHHMM || "00:00").split(":");
        const defH  = parts[0] || "00";
        const defM  = String(Math.round(Number(parts[1] || 0) / 5) * 5).padStart(2, "0"); // snap về bước 5 gần nhất
        const selH  = document.getElementById(prefix + "H");
        const selM  = document.getElementById(prefix + "M");
        if (!selH || !selM) return;

        // Giờ 00-23
        selH.innerHTML = "";
        for (let h = 0; h < 24; h++) {
            const hh  = String(h).padStart(2, "0");
            const opt = document.createElement("option");
            opt.value = hh; opt.textContent = hh;
            if (hh === defH) opt.selected = true;
            selH.appendChild(opt);
        }

        // Phút 00, 05, 10, ..., 55 (12 lựa chọn)
        selM.innerHTML = "";
        for (let m = 0; m < 60; m += 5) {
            const mm  = String(m).padStart(2, "0");
            const opt = document.createElement("option");
            opt.value = mm; opt.textContent = mm;
            if (mm === defM) opt.selected = true;
            selM.appendChild(opt);
        }
    }
    window._napThoiGianPair = _napThoiGianPair;

    // Đọc giá trị "HH:MM" từ cặp select
    function _getTimeFromPair(prefix) {
        const h = document.getElementById(prefix + "H")?.value || "00";
        const m = document.getElementById(prefix + "M")?.value || "00";
        return `${h}:${m}`;
    }
    window._getTimeFromPair = _getTimeFromPair;

    /* ═══════════════════════════════════════════════════
     * 4. TÍNH THỜI GIAN CA CHƠI
     * ═══════════════════════════════════════════════════ */
    window.tinhToanThoiGianHieuLuc = _tinhThoiGian;
    window._tinhThoiGian           = _tinhThoiGian; // alias cho index.html SPA

    function _tinhThoiGian() {
        _capNhatPhutSelect(); // cập nhật disabled phút khi giờ thay đổi
        let startStr = _getTimeFromPair("hostTimeStart");
        const endStr = _getTimeFromPair("hostTimeEnd");
        const durEl  = document.getElementById("hostTotalDuration");
        if (!startStr || !endStr || !durEl) return;

        // Fix 5: Chặn giờ quá khứ khi ngày đánh là hôm nay
        const dateVal = document.getElementById("hostDatePlay")?.value || "";
        const todayStr = new Date().toLocaleDateString("sv-SE");
        if (dateVal === todayStr) {
            const now = new Date();
            const curTotalMin = now.getHours() * 60 + now.getMinutes();
            const [sh, sm] = startStr.split(":").map(Number);
            if (sh * 60 + sm < curTotalMin) {
                const nextMin = Math.ceil((curTotalMin + 1) / 30) * 30;
                const nh = Math.floor(nextMin / 60) % 24;
                const nm = nextMin % 60;
                startStr = `${String(nh).padStart(2,"0")}:${String(nm).padStart(2,"0")}`;
                const tsEl = document.getElementById("hostTimeStart");
                if (tsEl) tsEl.value = startStr;
                window.hienToast?.("Chú ý giờ 🕐", "Giờ bắt đầu đã qua — tự động điều chỉnh về mốc gần nhất.", "warning");
            }
        }

        // Dùng ngày bất kỳ làm mốc tính — chỉ cần giờ chênh lệch chính xác
        const baseDate = dateVal || new Date().toISOString().split("T")[0];
        const tS = new Date(`${baseDate}T${startStr}`);
        let   tE = new Date(`${baseDate}T${endStr}`);
        if (tE <= tS) tE = new Date(tE.getTime() + 86400000);

        const hours = (tE - tS) / 3600000;
        durEl.value = `${hours.toFixed(1)} Giờ`;
        _tinhGoiYGia();
    }

    /* ═══════════════════════════════════════════════════
     * 5. GIỚI TÍNH - TRÌNH ĐỘ LIÊN KẾT
     * ═══════════════════════════════════════════════════ */
    window.chuyenTrangThaiLienKetGioiTinh = function () {
        const val = document.querySelector('input[name="hostGenderSelect"]:checked')?.value || "male";
        const mB = document.getElementById("linkedMaleLevelBlock");
        const fB = document.getElementById("linkedFemaleLevelBlock");
        if (val === "male")   { if (mB) mB.style.display = "block"; if (fB) fB.style.display = "none"; }
        else if (val === "female") { if (mB) mB.style.display = "none"; if (fB) fB.style.display = "block"; }
        else { if (mB) mB.style.display = "block"; if (fB) fB.style.display = "block"; }
    };

    /* ═══════════════════════════════════════════════════
     * 6. QUẢN LÝ CẦU LÔNG - THÊM/XÓA/ĐỒNG BỘ GIÁ
     * ═══════════════════════════════════════════════════ */
    window.themLoaiCauMoi = function (ten = "", loai = "12", gia = 240000, daDung = 0) {
        _themHangCauMoi(ten, loai, gia, daDung);
    };
    // Export alias để HTML inline onclick dùng được
    window._themHangCauMoi = function (ten = "", loai = "12", gia = 240000, daDung = 0) {
        _themHangCauMoi(ten, loai, gia, daDung);
    };

    function _themHangCauMoi(ten = "", loai = "12", gia = 300000, daDung = 12) {
        const ctr = document.getElementById("shuttlecockListContainer");
        if (!ctr) return;
        const id  = "sc_" + Math.random().toString(36).slice(2, 10);
        const div = document.createElement("div");
        // Bỏ class shuttlecock-row — thay bằng inline style hoàn toàn để tránh mọi CSS conflict
        div.id = `row_${id}`;
        div.style.cssText = "background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;margin-bottom:10px;box-sizing:border-box;";

        const giaK = Math.round((gia || 0) / 1000);

        // Shared styles — single-line strings để tránh newline trong attribute HTML
        const C  = "color:#94a3b8;font-size:0.66rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;display:block;margin-bottom:4px;";
        const B  = "background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);border-radius:8px;color:#f0f0f0;font-size:0.85rem;font-family:inherit;width:100%;box-sizing:border-box;outline:none;";
        const IT = B + "padding:8px 10px;";
        const IN = B + "padding:8px 6px;text-align:center;";
        const IS = B + "padding:8px 6px;cursor:pointer;";
        const FO = "this.style.borderColor='#FF5500'";
        const BL = "this.style.borderColor='rgba(255,255,255,0.18)'";

        // FLEX layout: name=flex:1 (co giãn), các cột còn lại cố định px
        div.innerHTML =
        `<div style="display:flex;align-items:flex-end;gap:8px;">` +
            `<div style="flex:1;min-width:0;overflow:hidden;">` +
                `<span style="${C}">Tên cầu</span>` +
                `<input type="text" id="scName_${id}" value="${ten}" placeholder="Hải Yến, Victor..." style="${IT}" autocomplete="off" onfocus="${FO}" onblur="${BL}">` +
            `</div>` +
            `<div style="flex:0 0 128px;width:128px;">` +
                `<span style="${C}">Quy cách</span>` +
                `<select id="scLoai_${id}" style="${IS}" onfocus="${FO}" onblur="${BL}" onchange="window._dongBoGia('${id}','loai');window._tinhChiPhiCau();">` +
                    `<option value="12" ${loai==="12"?"selected":""}>Ống 12 quả</option>` +
                    `<option value="6"  ${loai==="6" ?"selected":""}>Ống 6 quả</option>` +
                    `<option value="1"  ${loai==="1" ?"selected":""}>Lẻ 1 quả</option>` +
                `</select>` +
            `</div>` +
            `<div style="flex:0 0 72px;width:72px;">` +
                `<span style="${C}">Giá (K)</span>` +
                `<input type="text" id="scGiaOng_${id}" value="${giaK > 0 ? giaK : ''}" data-raw-val="${gia}" placeholder="240" style="${IN}" onfocus="${FO}" onblur="${BL}" oninput="window._formatGiaCau('${id}',this);window._tinhChiPhiCau();_tinhGoiYGia();" onchange="window._dongBoGia('${id}','ong')">` +
            `</div>` +
            `<div style="flex:0 0 72px;width:72px;">` +
                `<span style="${C}">Đã dùng</span>` +
                `<input type="number" id="scDaDung_${id}" value="${daDung}" min="0" placeholder="0" style="${IN}" onfocus="${FO}" onblur="${BL}" oninput="_tinhGoiYGia();window._tinhChiPhiCau();" onchange="_tinhGoiYGia();window._tinhChiPhiCau();">` +
            `</div>` +
            `<div style="flex:0 0 34px;width:34px;display:flex;align-items:flex-end;">` +
                `<button type="button" onclick="window.xoaLoaiCau('${id}')" title="Xóa" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:7px;border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.08);color:#ef4444;cursor:pointer;font-size:0.8rem;">` +
                    `<i class="fa-solid fa-trash-can"></i>` +
                `</button>` +
            `</div>` +
        `</div>`;
        ctr.appendChild(div);
        window.shuttlecocksList.push(id);
        _tinhGoiYGia();
        _tinhChiPhiCau();
    }

    // C1: scGiaLe_ đã bị xóa — _dongBoGia chỉ cần trigger tính toán lại
    window._dongBoGia = function (id, nguon) {
        const loaiEl  = document.getElementById(`scLoai_${id}`);
        const giOngEl = document.getElementById(`scGiaOng_${id}`);
        if (!loaiEl || !giOngEl) return;
        // Không còn sync scGiaLe_ — chỉ cập nhật gợi ý giá
        _tinhGoiYGia();
        _tinhChiPhiCau();
    };

    /* Định dạng ô Giá cầu — chế độ K: người dùng gõ "240" → rawVal lưu "240000" */
    window._formatGiaCau = function (id, inputEl) {
        const raw = (inputEl.value || '').replace(/[^0-9]/g, '');
        const num = raw === '' ? 0 : parseInt(raw, 10);
        inputEl.dataset.rawVal = String(num * 1000); // lưu đồng đầy đủ
        inputEl.value = num > 0 ? String(num) : ''; // hiển thị K (số ngắn)
    };

    /* ═══════════════════════════════════════════════════
     * C2 — TÍNH CHI PHÍ CẦU TIÊU THỤ
     * Lặp qua tất cả hàng cầu → tính tổng → cập nhật #tongChiPhiCau
     * ═══════════════════════════════════════════════════ */
    function _tinhChiPhiCau() {
        let tongChi = 0;
        (window.shuttlecocksList || []).forEach(scId => {
            const loai   = document.getElementById(`scLoai_${scId}`)?.value || "12";
            const giaEl  = document.getElementById(`scGiaOng_${scId}`);
            const gia    = Number(giaEl?.dataset.rawVal || (giaEl?.value || '0').replace(/[^0-9]/g, '')) || 0;
            const soQua = parseInt(document.getElementById(`scDaDung_${scId}`)?.value) || 0;
            let giaMoiQua = gia;
            if      (loai === "12") giaMoiQua = gia / 12;
            else if (loai === "6")  giaMoiQua = gia / 6;
            // loai === "1" → giaMoiQua = gia (đã là giá 1 quả)
            tongChi += Math.round(giaMoiQua * soQua);
        });
        const el = document.getElementById('hostTotalCauCost');
        if (el) el.textContent = _formatK(tongChi);
        return tongChi;
    }
    window.tinhChiPhiCau  = _tinhChiPhiCau;
    window._tinhChiPhiCau = _tinhChiPhiCau; // alias cho inline oninput/onchange handlers trong template HTML

    /* ── R3: Event delegation cho #shuttlecockListContainer ──
     * Dùng document-level delegation để không cần lo thời điểm container được render.
     * Bắt input/change từ các ô giá cầu + số lượng → tự động tính lại chi phí + gợi ý giá. */
    (function _setupShuttlecockDelegation() {
        function _handleSC(e) {
            const id = (e.target && e.target.id) ? e.target.id : '';
            if (
                id.startsWith('scGiaOng_') ||
                id.startsWith('scGiaLe_')  ||
                id.startsWith('scDaDung_') ||
                id.startsWith('scLoai_')   ||
                id.startsWith('scName_')
            ) {
                _tinhChiPhiCau();
                _tinhGoiYGia();
            }
        }
        // Dùng capture=false (bubble) để bắt được từ input nested
        document.addEventListener('input',  _handleSC, false);
        document.addEventListener('change', _handleSC, false);
    })();

    window.xoaLoaiCau = function (id) {
        if (window.shuttlecocksList.length <= 1) {
            window.hienToast("Không được xóa", "Cần ít nhất 1 loại cầu.", "warning"); return;
        }
        document.getElementById(`row_${id}`)?.remove();
        window.shuttlecocksList = window.shuttlecocksList.filter(x => x !== id);
        _tinhGoiYGia();
    };

    // _goiYCau đã bị xoá — khách tự nhập tên cầu không có gợi ý

    /* ═══════════════════════════════════════════════════
     * 7. BỘ MÁY KẾ TOÁN - GỢI Ý GIÁ
     * ═══════════════════════════════════════════════════ */
    window.tinhToanPricingGoiY = _tinhGoiYGia;
    window._tinhGoiYGia        = _tinhGoiYGia; // alias cho inline oninput handlers trong template HTML

    function _tinhGoiYGia() {
        // ── H-JS1: Đọc đúng input ID thực tế ──
        const dur      = parseFloat(document.getElementById("hostTotalDuration")?.value) || 0;
        const soSan    = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const giaSanH  = _parseCurrency("hostAccountingCourtPrice");
        const tienNuoc = _parseCurrency("hostAccountingWaterCost");
        const soNam    = Number(document.getElementById("hostAccountingEstMale")?.value) || 0;
        const soNu     = Number(document.getElementById("hostAccountingEstFemale")?.value) || 0;
        const chenh    = _parseCurrency("hostAccountingGap");

        // 1. Tiền sân = giá/giờ × số giờ × số sân
        const tienSan = giaSanH * dur * soSan;
        // 2. Tiền cầu — _tinhChiPhiCau() tính và cập nhật #tongChiPhiCau
        const tienCau = _tinhChiPhiCau();
        // 3. Tổng chi phí ca đấu = sân + cầu + nước
        const tongCP  = tienSan + tienCau + tienNuoc;
        const tongNguoi = soNam + soNu;

        // Ô "Tổng tiền sân" — text trần, hiển thị tiền sân thuần
        const tienSanEl = document.getElementById("hostTotalCost");
        if (tienSanEl) tienSanEl.textContent = _formatK(tienSan);

        // Ô "Tổng chi phí (sân+cầu+nước)" — tổng hợp cuối cùng, hiển thị đơn vị K
        const tongCPEl = document.getElementById("hostTotalAllCost");
        if (tongCPEl) tongCPEl.textContent = _formatK(tongCP);

        if (tongNguoi === 0) {
            ["sugBreakNam","sugBreakNu","sugBreakLai",
             "sugSmallNam","sugSmallNu","sugSmallLai",
             "sugBigNam",  "sugBigNu",  "sugBigLai"].forEach(id => {
                const el = document.getElementById(id); if (el) el.textContent = "--";
            });
            return;
        }

        // 4. Gợi ý giá — làm tròn LÊN hàng nghìn gần nhất (Math.ceil)
        const _ceil1k = x => Math.ceil(Math.max(0, x) / 1000) * 1000;

        // Giá đề xuất bình quân = tổng chi phí / số người
        const giaDeXuat = tongCP / tongNguoi;

        // Phân bổ Nam/Nữ theo chênh lệch cấu hình
        // Công thức: soNam*giaNam + soNu*giaNu = tongDT → giaNu = (tongDT - soNam*chenh) / tongNguoi
        function tinhGiaNamNu(tongDT) {
            const giaNu_raw  = (tongDT - soNam * chenh) / tongNguoi;
            const giaNu  = _ceil1k(giaNu_raw);
            const giaNam = _ceil1k(giaNu_raw + chenh);
            return { giaNam, giaNu };
        }

        const beBreak = tinhGiaNamNu(tongCP);             // Huê Vốn
        const beSmall = tinhGiaNamNu(giaDeXuat * 1.1 * tongNguoi);  // Lãi Ít × 1.1
        const beBig   = tinhGiaNamNu(giaDeXuat * 1.2 * tongNguoi);  // Lãi Nhiều × 1.2

        _calcBreakEvenMale = beBreak.giaNam; _calcBreakEvenFemale = beBreak.giaNu;
        _calcSmallMale = beSmall.giaNam;     _calcSmallFemale = beSmall.giaNu;
        _calcBigMale   = beBig.giaNam;       _calcBigFemale   = beBig.giaNu;

        const thu = (n, u) => soNam * n + soNu * u;

        const set4 = (namId, nuId, laiId, n, u) => {
            const en = document.getElementById(namId);
            const eu = document.getElementById(nuId);
            // Ẩn/hiện dòng giá theo giới tính đang tuyển
            if (_ktModalGender === "male") {
                if (en) { en.style.display = ""; en.innerHTML = `<span class="kt-price-gender">Nam</span><span class="kt-price-val">${_formatK(n)}</span>`; }
                if (eu) eu.style.display = "none";
            } else if (_ktModalGender === "female") {
                if (en) en.style.display = "none";
                if (eu) { eu.style.display = ""; eu.innerHTML = `<span class="kt-price-gender">Nữ</span><span class="kt-price-val">${_formatK(u)}</span>`; }
            } else {
                if (en) { en.style.display = ""; en.innerHTML = `<span class="kt-price-gender">Nam</span><span class="kt-price-val">${_formatK(n)}</span>`; }
                if (eu) { eu.style.display = ""; eu.innerHTML = `<span class="kt-price-gender">Nữ</span><span class="kt-price-val">${_formatK(u)}</span>`; }
            }
            const el = document.getElementById(laiId);
            if (el) {
                const t = thu(n, u);
                const laiVal = t - tongCP;
                if (laiId === "sugBreakLai") {
                    el.innerHTML = `<span class="kt-thu">Thu: ${_formatK(t)}</span><span class="kt-lai kt-lai-zero">Lãi: 0K</span>`;
                } else {
                    el.innerHTML = `<span class="kt-thu">Thu: ${_formatK(t)}</span><span class="kt-lai kt-lai-pos">Lãi ~${_formatK(laiVal)}</span>`;
                }
            }
        };
        set4("sugBreakNam","sugBreakNu","sugBreakLai", beBreak.giaNam, beBreak.giaNu);
        set4("sugSmallNam","sugSmallNu","sugSmallLai", beSmall.giaNam, beSmall.giaNu);
        set4("sugBigNam",  "sugBigNu",  "sugBigLai",  beBig.giaNam,   beBig.giaNu);
    }

    window.apDungGoiYGia = function (phuongAn) {
        let giaNam = 0, giaNu = 0;
        if (phuongAn === "breakeven") { giaNam = _calcBreakEvenMale; giaNu = _calcBreakEvenFemale; }
        else if (phuongAn === "small") { giaNam = _calcSmallMale; giaNu = _calcSmallFemale; }
        else if (phuongAn === "big")   { giaNam = _calcBigMale;   giaNu = _calcBigFemale; }
        if (_ktModalGender !== "female") _setCurrencyInputK("hostPublicPriceMale",   giaNam);
        if (_ktModalGender !== "male")   _setCurrencyInputK("hostPublicPriceFemale", giaNu);
        ["sugBoxBreak","sugBoxSmall","sugBoxBig"].forEach(id => document.getElementById(id)?.classList.remove("selected"));
        const box = document.getElementById(`sugBox${phuongAn === "breakeven" ? "Break" : phuongAn === "small" ? "Small" : "Big"}`);
        if (box) box.classList.add("selected");
        window.hienToast("Đã áp dụng giá ✅", `Nam: ${_formatVND(giaNam)} | Nữ: ${_formatVND(giaNu)}`, "success");
        // Đóng modal kế toán sau 350ms để user thấy card được chọn
        setTimeout(() => window.dongKtModal && window.dongKtModal(), 350);
    };

    /* ═══════════════════════════════════════════════════
     * AUTO-FILL SLOT (8 người/sân) + SOFT WARNING
     * ═══════════════════════════════════════════════════ */

    // Tự động điền Số slot = soSan × 8 khi thay đổi Số sân mở
    window._autoFillSlot = function () {
        const soSan    = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const slotEl   = document.getElementById("input-total-slots");
        if (slotEl) slotEl.value = soSan * 8;
        window._kiemTraMatDoNguoi && window._kiemTraMatDoNguoi();
    };

    // Cảnh báo mềm cho form ngoài: total/soSan > 8 → hiển thị màu cam
    window._kiemTraMatDoNguoi = function () {
        const soSan    = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const total    = Number(document.getElementById("input-total-slots")?.value) || 0;
        const hintEl   = document.getElementById("hintSoSlot");
        if (!hintEl) return;
        if (total > 0 && total / soSan > 8) {
            hintEl.textContent = `⚠️ Khuyến nghị: 1 sân chỉ nên tối đa 8 người để đảm bảo thời gian đánh. Bạn vẫn có thể tiếp tục nếu muốn tuyển nhiều hơn.`;
            hintEl.style.display = "block";
        } else {
            hintEl.textContent = "";
            hintEl.style.display = "none";
        }
    };

    // Cảnh báo mềm cho modal kế toán
    window._kiemTraMatDoNguoiModal = function () {
        const mVal   = Number(document.getElementById("hostAccountingEstMale")?.value) || 0;
        const fVal   = Number(document.getElementById("hostAccountingEstFemale")?.value) || 0;
        const total  = mVal + fVal;
        const hintEl = document.getElementById("hintSoNguoiModal");
        if (!hintEl) return;
        if (total > 0 && total / _ktModalSoSan > 8) {
            hintEl.textContent = `⚠️ Khuyến nghị: 1 sân chỉ nên tối đa 8 người để đảm bảo thời gian đánh. Bạn vẫn có thể tiếp tục nếu muốn tuyển nhiều hơn.`;
            hintEl.style.display = "block";
        } else {
            hintEl.textContent = "";
            hintEl.style.display = "none";
        }
    };

    /* ═══════════════════════════════════════════════════
     * KẾ TOÁN MODAL — Mở / Đóng + Pre-fill 2 chiều
     * ═══════════════════════════════════════════════════ */
    /* Hàm cập nhật banner "Tuyển" — gọi khi mở modal và khi estMale/estFemale thay đổi */
    window._updateKtBanner = function () {
        const info = document.getElementById("ktModalInfo");
        if (!info) return;

        const mVal = Number(document.getElementById("hostAccountingEstMale")?.value) || 0;
        const fVal = Number(document.getElementById("hostAccountingEstFemale")?.value) || 0;
        const dur  = parseFloat(document.getElementById("hostTotalDuration")?.value) || 0;
        const soSan = Number(document.getElementById("hostCourtQuantity")?.value) || 1;

        // Quy tắc hiển thị slot
        let slotTxt;
        if (mVal > 0 && fVal > 0) {
            // Đã phân bổ rõ → hiện chi tiết
            slotTxt = `${mVal} slot Nam, ${fVal} slot Nữ`;
        } else if (_ktModalSlot > 0) {
            // Lấy từ form ngoài
            const gLbl = _ktModalGender === "male" ? " Nam" : _ktModalGender === "female" ? " Nữ" : "";
            slotTxt = `${_ktModalSlot.toLocaleString("vi-VN")} slot${gLbl}`;
        } else {
            // Fallback: dùng tổng đang nhập
            const total = mVal + fVal;
            slotTxt = total > 0 ? `${total} slot` : "chưa xác định";
        }

        const durTxt    = dur > 0 ? `${dur} giờ` : "chưa xác định";
        const genderTxt = _ktModalGender === "male" ? "Nam" : _ktModalGender === "female" ? "Nữ" : "Cả hai";
        info.innerHTML  = `<i class="fa-solid fa-circle-info" style="color:var(--accent);margin-right:6px;"></i>
            Buổi chơi: <strong style="color:#e2e8f0;">${durTxt}</strong> &nbsp;·&nbsp;
            ${soSan} sân &nbsp;·&nbsp; Tuyển: <strong style="color:#e2e8f0;">${slotTxt}</strong>
            &nbsp;·&nbsp; Giới tính: <strong style="color:#e2e8f0;">${genderTxt}</strong>`;
    };

    window.moKtModal = function () {
        const ov = document.getElementById("ktModalOverlay");
        if (!ov) return;

        // ── Đọc dữ liệu từ form chính ──
        const dur    = parseFloat(document.getElementById("hostTotalDuration")?.value) || 0;
        const soSan  = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const gender = document.querySelector('input[name="hostGenderSelect"]:checked')?.value || "both";
        let soSlot   = Number(document.getElementById("input-total-slots")?.value) || 0;

        // Lưu vào module vars để _updateKtBanner() và _kiemTraMatDoNguoiModal() dùng
        _ktModalSlot   = soSlot;
        _ktModalGender = gender;
        _ktModalSoSan  = soSan;

        // ── Show/hide ô nhập Nam/Nữ — reset hoàn toàn mỗi lần mở ──
        const mGroup = document.getElementById("ktEstMaleGroup");
        const fGroup = document.getElementById("ktEstFemaleGroup");
        if (mGroup) mGroup.style.display = (gender === "female") ? "none" : "";
        if (fGroup) fGroup.style.display = (gender === "male")   ? "none" : "";

        // ── Ẩn ô Chênh lệch Nam/Nữ khi chỉ tuyển 1 giới ──
        const gapGroup = document.getElementById("ktGapGroup");
        if (gapGroup) gapGroup.style.display = (gender !== "both") ? "none" : "";

        // ── Điền số người dự kiến mỗi lần mở (sync từ slot form ngoài) ──
        const mEl = document.getElementById("hostAccountingEstMale");
        const fEl = document.getElementById("hostAccountingEstFemale");
        if (mEl && fEl) {
            const mExist = Number(mEl.value) || 0;
            const fExist = Number(fEl.value) || 0;
            if (soSlot > 0) {
                // Có slot → chia theo giới tính
                if (gender === "male")        { mEl.value = soSlot; fEl.value = 0; }
                else if (gender === "female") { mEl.value = 0; fEl.value = soSlot; }
                else { mEl.value = Math.ceil(soSlot / 2); fEl.value = Math.floor(soSlot / 2); }
            } else if (mExist + fExist > 0) {
                // Không có slot nhưng đã có giá trị cũ → giữ nguyên, lấy tổng làm _ktModalSlot
                _ktModalSlot = mExist + fExist;
            }
        }

        // ── Cập nhật banner + cảnh báo mật độ ──
        window._updateKtBanner();
        window._kiemTraMatDoNguoiModal();

        // ── Chạy lại công thức ──
        _tinhGoiYGia();

        ov.style.display = "flex";
        document.body.style.overflow = "hidden";
    };

    window.dongKtModal = function () {
        const ov = document.getElementById("ktModalOverlay");
        if (ov) ov.style.display = "none";
        document.body.style.overflow = "";
    };

    /* ═══════════════════════════════════════════════════
     * 8. GOOGLE MAPS — MỞ LINK TÌM KIẾM MIỄN PHÍ
     * ═══════════════════════════════════════════════════ */
    window.giaLapTimGoogleMaps = function () {
        const addr   = (document.getElementById("hostCourtAddress")?.value || "").trim();
        const rawName = (document.getElementById("hostCourtName")?.value || "").trim();
        const tenSan = _chuanHoaTenSan(rawName);
        const inp = document.getElementById("hostCourtName");
        if (inp && tenSan && tenSan !== rawName) inp.value = tenSan;
        const tuKhoa = [tenSan, addr].filter(Boolean).join(" ");
        if (!tuKhoa) {
            window.hienToast("Chưa có địa chỉ", "Vui lòng nhập tên sân hoặc địa chỉ trước khi tra Maps.", "warning");
            return;
        }
        const url = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(tuKhoa);
        window.open(url, "_blank", "noopener,noreferrer");
        const mapState = document.getElementById("hostMapLinkState");
        if (mapState) mapState.innerHTML = `<i class='fa-solid fa-arrow-up-right-from-square' style='color:#00ff88;'></i> Đã mở Google Maps — kiểm tra và sao chép địa chỉ vào ô bên trên`;
    };

    window.dongMapsMockModal = function () {};
    window.goiYDiaChiMaps   = function () {};

    /* ═══════════════════════════════════════════════════
     * 9. ĐĂNG / CHỈNH SỬA CA ĐẤU → bảng ca_dau
     * ═══════════════════════════════════════════════════ */
    window.dangCaDauCuaHost = async function () {
        if (!window.currentUser && !window.currentGuest) {
            window.hienToast("Cần đăng nhập", "Vui lòng đăng nhập để đăng bài hoặc đặt slot tham gia ca đấu!", "warning"); return;
        }

        // Kiểm tra uy tín: 40-59 → không được đăng bài
        const _mySdt = (window.currentUser || window.currentGuest)?.sdt_khach;
        if (_mySdt) {
            const _uList = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: _mySdt } }).catch(() => []);
            const _u = (_uList || [])[0];
            if (_u && !_u.is_whitelisted && (_u.diem_uy_tin ?? 100) < 60) {
                window.hienToast("Không thể đăng bài",
                    `Điểm uy tín ${_u.diem_uy_tin ?? 0}đ (< 60) — Tài khoản bị khóa tính năng đăng bài. Cải thiện uy tín bằng cách tham gia ca đấu đúng hẹn.`,
                    "danger");
                return;
            }
        }

        // Turnstile check cho đăng bài
        const _hostTs = document.getElementById("cfTurnstileHostWrap");
        const _hostToken = document.querySelector("#cfTurnstileHost [name='cf-turnstile-response'], #cfTurnstileHostWrap [name='cf-turnstile-response']")?.value;
        const _tsSession = (() => { try { const s = JSON.parse(localStorage.getItem("tvl_cf_verified")||"{}"); return s.exp && Date.now() < s.exp; } catch { return false; } })();

        const tinh_thanh  = document.getElementById("hostProvince")?.value;
        const quan_huyen  = document.getElementById("hostDistrict")?.value;
        const ten_san     = _chuanHoaTenSan(document.getElementById("hostCourtName")?.value || "");
        if (ten_san) { const _inp = document.getElementById("hostCourtName"); if (_inp) _inp.value = ten_san; }
        const dia_chi_san = document.getElementById("hostCourtAddress")?.value?.trim();
        const so_san_mo   = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const so_san_cu_the = document.getElementById("hostCourtNumber")?.value?.trim();
        const ngay_danh   = document.getElementById("hostDatePlay")?.value;
        const gio_bat_dau  = _getTimeFromPair("hostTimeStart");
        const gio_ket_thuc = _getTimeFromPair("hostTimeEnd");
        const durStr      = document.getElementById("hostTotalDuration")?.value;
        const gia_nam     = _parseCurrency("hostPublicPriceMale");
        const gia_nu      = _parseCurrency("hostPublicPriceFemale");

        if (!window._validateMapsLink()) return;
        if (!tinh_thanh || !quan_huyen || !ten_san || !ngay_danh || !gio_bat_dau || !gio_ket_thuc) {
            window.hienToast("Thiếu thông tin", "Vui lòng điền đầy đủ: Tỉnh/Thành, Quận/Huyện, Tên sân, Ngày giờ.", "danger");
            return;
        }

        // Giới tính
        const genderRaw = document.querySelector('input[name="hostGenderSelect"]:checked')?.value || "male";
        const gioiTinhMap = { male: "Nam", female: "Nữ", both: "Cả hai" };
        const gioi_tinh_can = gioiTinhMap[genderRaw] || "Cả hai";

        // Trình độ (JSONB)
        const mLevels = [], fLevels = [];
        if (genderRaw === "male" || genderRaw === "both") {
            ["newbie","yeu","tby","tb_minus","tb_plus","tbk"].forEach(lv => {
                const cb = document.getElementById(`m_lvl_${lv}`); if (cb?.checked) mLevels.push(cb.value);
            });
            const cu = document.getElementById("hostMaleCustomLevel")?.value?.trim();
            if (cu) mLevels.push(cu);
        }
        if (genderRaw === "female" || genderRaw === "both") {
            ["newbie","yeu","tby","tb_minus","tb_plus","tbk"].forEach(lv => {
                const cb = document.getElementById(`f_lvl_${lv}`); if (cb?.checked) fLevels.push(cb.value);
            });
            const cu = document.getElementById("hostFemaleCustomLevel")?.value?.trim();
            if (cu) fLevels.push(cu);
        }
        const yeu_cau_trinh_do = { nam: mLevels, nu: fLevels };

        // Tiện ích (JSONB)
        const tien_ich_bao_gom = {
            san:    !!document.getElementById("inc_san")?.checked,
            cau:    !!document.getElementById("inc_cau")?.checked,
            nuoc:   !!document.getElementById("inc_nuoc")?.checked,
            gui_xe: !!document.getElementById("inc_xe")?.checked
        };

        // Kế toán nội bộ
        const so_gio_choi   = parseFloat(durStr) || 0;
        const gia_thue_san_1h    = _parseCurrency("hostAccountingCourtPrice");
        const chi_phi_nuoc_khac = _parseCurrency("hostAccountingWaterCost");
        const so_nguoi_nam      = Number(document.getElementById("hostAccountingEstMale")?.value) || 0;
        const so_nguoi_nu       = Number(document.getElementById("hostAccountingEstFemale")?.value) || 0;
        const chenh_lech_gia    = _parseCurrency("hostAccountingGap");
        const chi_phi_san_co_dinh = gia_thue_san_1h * so_gio_choi * so_san_mo;
        const tong_doanh_thu_du_kien = so_nguoi_nam * gia_nam + so_nguoi_nu * gia_nu;

        // Danh sách cầu (JSONB) — tong_chi_phi_cau dùng _tinhChiPhiCau() cho kết quả đồng nhất
        const loai_cau_su_dung = window.shuttlecocksList.map(id => {
            const loai   = Number(document.getElementById(`scLoai_${id}`)?.value) || 12;
            const giaOngEl = document.getElementById(`scGiaOng_${id}`);
            const giaOng = Number(giaOngEl?.dataset.rawVal || (giaOngEl?.value || '0').replace(/[^0-9]/g, '')) || 0;
            const daDung = Number(document.getElementById(`scDaDung_${id}`)?.value) || 0;
            const ten    = document.getElementById(`scName_${id}`)?.value || "";
            const gia_qua = loai > 1 ? Math.round(giaOng / loai) : giaOng;
            const thanh_tien = gia_qua * daDung;
            const donViMap = { "12": "ống 12 quả", "6": "ống 6 quả", "1": "quả lẻ" };
            // C4: thêm quy_cach để phân biệt đơn vị tính khi đọc lại
            const quy_cach = loai === 12 ? "ong12" : loai === 6 ? "ong6" : "le1";
            return { ten, quy_cach, don_vi: donViMap[String(loai)] || "ống", gia_qua, so_luong: daDung, thanh_tien, gia_ong: giaOng, loai };
        });
        // Dùng _tinhChiPhiCau() để đảm bảo tong_chi_phi_cau nhất quán với hiển thị
        const tong_chi_phi_cau = _tinhChiPhiCau();

        // FEAT-4: Số slot cần tuyển — bắt buộc nhập
        const tong_slot_can = Number(document.getElementById("input-total-slots")?.value) || 0;
        if (!tong_slot_can || tong_slot_can < 1) {
            window.hienToast("Thiếu thông tin", "Vui lòng nhập Số Slot Cần Tuyển (tối thiểu 1).", "danger");
            document.getElementById("input-total-slots")?.focus();
            return;
        }

        const _myUser = window.currentUser || window.currentGuest;

        // Kiểm tra scam warning: host chưa đủ điều kiện cọc nhưng text chứa từ khóa lừa đảo
        const yeu_cau_coc = !!document.getElementById("hostRequireCoc")?.checked;
        const _combinedText = [ten_san, dia_chi_san].join(" ");
        const _hostDuDieu = !document.getElementById("hostRequireCoc")?.disabled;
        const scam_warning = !_hostDuDieu && _quetTuKhoaLuaDao(_combinedText);

        const payload = {
            ma_key_host: null,
            vung_mien:   _xacDinhVungMien(tinh_thanh),
            tinh_thanh, quan_huyen, ten_san, dia_chi_san,
            so_san_mo, so_san_cu_the,
            ngay_danh, gio_bat_dau, gio_ket_thuc, so_gio_choi,
            gioi_tinh_can, yeu_cau_trinh_do,
            gia_nam, gia_nu, tien_ich_bao_gom,
            gia_thue_san_1h, chi_phi_san_co_dinh,
            loai_cau_su_dung, tong_chi_phi_cau, chi_phi_nuoc_khac,
            so_nguoi_nam, so_nguoi_nu, chenh_lech_gia,
            tong_doanh_thu_du_kien, tong_slot_can,
            da_chot_ca: false,
            yeu_cau_coc,
            scam_warning
        };
        // Thêm sdt_nguoi_tao nếu migration đã chạy (cột tồn tại)
        if (_myUser?.sdt_khach) payload.sdt_nguoi_tao = _myUser.sdt_khach;

        const btn = document.getElementById("btnDangCa");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng...'; }

        try {
            // Thử ghi với sdt_nguoi_tao trước (cần migration-nguoi-dung.sql đã chạy)
            // Nếu cột chưa tồn tại → Supabase trả lỗi → fallback không có cột đó
            let ghiThanhCong = false;
            try {
                if (window.currentEditingSlotId) {
                    await window.khoDuLieuVinhVien.ghiData("ca_dau", payload, { id: window.currentEditingSlotId });
                } else {
                    await window.khoDuLieuVinhVien.ghiData("ca_dau", payload, null);
                }
                ghiThanhCong = true;
            } catch (e1) {
                // Cột sdt_nguoi_tao chưa tồn tại → thử lại không có cột đó
                if (payload.sdt_nguoi_tao !== undefined) {
                    const payloadKhongSdt = Object.assign({}, payload);
                    delete payloadKhongSdt.sdt_nguoi_tao;
                    if (window.currentEditingSlotId) {
                        await window.khoDuLieuVinhVien.ghiData("ca_dau", payloadKhongSdt, { id: window.currentEditingSlotId });
                    } else {
                        await window.khoDuLieuVinhVien.ghiData("ca_dau", payloadKhongSdt, null);
                    }
                    ghiThanhCong = true;
                } else {
                    throw e1;
                }
            }

            if (ghiThanhCong) {
                if (window.currentEditingSlotId) {
                    window.hienToast("Đã cập nhật! ✅", "Thông tin ca đấu đã được chỉnh sửa thành công.", "success");
                    window.currentEditingSlotId = null;
                } else {
                    window.hienToast("Đăng tuyển thành công! 🏸", "Ca đấu đã lên hệ thống, khách sẽ thấy ngay!", "success");
                }
                _resetFormDangCa();
                await _taiLichSuCaDau();
            }
        } catch (e) {
            console.error("Lỗi đăng ca đấu:", e);
            window.hienToast("Lỗi lưu dữ liệu", "Không thể lưu ca đấu. Vui lòng thử lại.", "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> XÁC NHẬN ĐĂNG TUYỂN'; }
        }
    };

    function _resetFormDangCa() {
        window.currentEditingSlotId = null;
        const ids = ["hostProvince","hostDistrict","hostCourtName","hostCourtAddress","hostCourtNumber",
                     "hostMaleCustomLevel","hostFemaleCustomLevel","input-total-slots"];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        // Ô giá K — clear cả value lẫn rawValue
        ["hostPublicPriceMale","hostPublicPriceFemale"].forEach(id => {
            const el = document.getElementById(id); if (el) { el.value = ""; el.dataset.rawValue = "0"; }
        });
        // Ô tiền → dùng _setCurrencyInput để hiển thị đúng định dạng dấu chấm nghìn
        ["hostAccountingCourtPrice","hostAccountingWaterCost","hostAccountingGap"].forEach(id => {
            const el = document.getElementById(id); if (el) { el.value = ""; el.dataset.rawValue = "0"; }
        });
        ["hostAccountingEstMale","hostAccountingEstFemale"].forEach(id => {
            const el = document.getElementById(id); if (el) { el.value = ""; el.dataset.rawValue = "0"; }
        });

        const today = new Date().toLocaleDateString("sv-SE");
        const dateEl = document.getElementById("hostDatePlay");
        if (dateEl) dateEl.value = today;

        window.shuttlecocksList = [];
        const ctr = document.getElementById("shuttlecockListContainer");
        if (ctr) ctr.innerHTML = "";
        _themHangCauMoi("Hải Yến", "12", 300000, 12);

        const genderMale = document.getElementById("genderMale");
        if (genderMale) { genderMale.checked = true; }
        // Cập nhật section trình độ theo giới tính vừa reset (hỗ trợ cả SPA mới lẫn host.html cũ)
        if (window._capNhatTrinhDoSection) window._capNhatTrinhDoSection("male");
        if (window.chuyenTrangThaiLienKetGioiTinh) window.chuyenTrangThaiLienKetGioiTinh();

        // Reset toàn bộ checkbox trình độ Nam + Nữ
        ["m_lvl_newbie","m_lvl_yeu","m_lvl_tby","m_lvl_tb_minus","m_lvl_tb","m_lvl_tb_plus","m_lvl_tbk",
         "f_lvl_newbie","f_lvl_yeu","f_lvl_tby","f_lvl_tb_minus","f_lvl_tb","f_lvl_tb_plus","f_lvl_tbk"
        ].forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });

        ["inc_san","inc_cau","inc_nuoc","inc_xe"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = (id === "inc_san" || id === "inc_cau");
        });

        // Reset giờ về smart default (realtime+20p nếu hôm nay, 18:00 nếu ngày khác)
        {
            const _dv2    = document.getElementById("hostDatePlay")?.value;
            const _tod2   = new Date().toLocaleDateString("sv-SE");
            const _isTod2 = !_dv2 || _dv2 === _tod2;
            const _sd2    = _isTod2 ? _gioMacDinhHomNay() : "18:00";
            const [_sh2, _sm2] = _sd2.split(":").map(Number);
            const _em2 = _sh2 * 60 + _sm2 + 120;
            const _ed2 = `${String(Math.floor(_em2 / 60) % 24).padStart(2,"0")}:${String(_em2 % 60).padStart(2,"0")}`;
            _napThoiGianPair("hostTimeStart", _sd2);
            _napThoiGianPair("hostTimeEnd",   _ed2);
            _capNhatGioSelect(_isTod2);
        }
        const hintEl2 = document.getElementById("hintSanCuThe");
        if (hintEl2) hintEl2.textContent = "";

        const btnEl = document.getElementById("btnDangCa");
        if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fa-solid fa-rocket"></i> Đăng Kèo'; }
        const cancelBtn = document.getElementById("btnHuyChinhSua");
        if (cancelBtn) cancelBtn.style.display = "none";

        _tinhThoiGian();
    }
    window._resetFormDangCa = _resetFormDangCa; // export cho index.html SPA

    /* ═══════════════════════════════════════════════════
     * 10. TẢI & HIỂN THỊ LỊCH SỬ CA ĐẤU
     *   State: sort, filter, search — phân tách load vs render
     * ═══════════════════════════════════════════════════ */
    let _caDauRawData  = []; // Toàn bộ ca đấu + slotMap
    let _caDauSlotMap  = {}; // { caId: [datSlot...] }
    let _caDauSortCol  = "ngay_danh";
    let _caDauSortDir  = "desc";
    let _caDauFilterSt = "all"; // all | running | expired | closed
    let _caDauSearch   = "";
    let _caDauPage     = 1;
    let _caDauPerPage  = 10;

    window.loadLichSuCaDauHost = _taiLichSuCaDau;

    function _isExpiredCa(s) {
        if (!s.ngay_danh || !s.gio_ket_thuc) return false;
        const [hh, mm] = s.gio_ket_thuc.split(":").map(Number);
        const end = new Date(s.ngay_danh);
        end.setHours(hh, mm, 0, 0);
        return end < new Date();
    }

    function _caDauStatus(slot) {
        if (slot.da_chot_ca)   return "closed";
        if (slot.is_tam_khoa)  return "tam_khoa";
        if (_isExpiredCa(slot)) return "expired";
        return "running";
    }

    // Hiển thị icon sort trên thead
    function _caDauUpdateSortIcons() {
        ["#", "ngay_danh", "ten_san", "gia_nam", "da_chot_ca"].forEach(col => {
            const el = document.getElementById(`cdd-sort-icon-${col}`);
            if (!el) return;
            if (col === _caDauSortCol) {
                el.textContent = _caDauSortDir === "asc" ? "↑" : "↓";
                el.style.color = "#00ff88";
            } else {
                el.textContent = "";
            }
        });
    }

    // Cập nhật UI phân trang (nút prev/next, page info)
    function _caDauUpdatePagination(totalFiltered) {
        const totalPages = Math.max(1, Math.ceil(totalFiltered / _caDauPerPage));
        if (_caDauPage > totalPages) _caDauPage = totalPages;
        if (_caDauPage < 1)         _caDauPage = 1;
        const pi   = document.getElementById("cdd-page-info");
        const prev = document.getElementById("cdd-prev");
        const next = document.getElementById("cdd-next");
        if (pi)   pi.textContent = `${_caDauPage} / ${totalPages}`;
        if (prev) prev.disabled = _caDauPage <= 1;
        if (next) next.disabled = _caDauPage >= totalPages;
        const info = document.getElementById("cdd-info");
        if (info) {
            const start = ((_caDauPage - 1) * _caDauPerPage) + 1;
            const end   = Math.min(_caDauPage * _caDauPerPage, totalFiltered);
            info.textContent = totalFiltered > 0
                ? `Hiển thị ${start}–${end} / ${totalFiltered} ca đấu`
                : "Không có ca đấu nào phù hợp.";
        }
    }

    // Render bảng từ dữ liệu đã filter+sort+paginate
    function _caDauRenderTable(list) {
        const tbody = document.getElementById("hostSlotsBody");
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:24px;">Không có ca đấu nào phù hợp.</td></tr>`;
            return;
        }

        tbody.innerHTML = "";
        list.forEach((slot, idx) => {
            // idx = vị trí trong trang hiện tại, STT = toàn cục
            const globalIdx = (_caDauPage - 1) * _caDauPerPage + idx + 1;
            const guests    = _caDauSlotMap[slot.id] || [];
            const daDen     = guests.filter(g => g.trang_thai_di_danh === "Đã tham gia").length;
            const tongKhach = guests.length;
            const daChot    = !!slot.da_chot_ca;
            const isExpired = _isExpiredCa(slot);
            const st        = _caDauStatus(slot);

            // Giá: .price-container căn giữa khối trong cột; label+value thẳng hàng dọc
            const giaNam = slot.gia_nam || 0;
            const giaNu  = slot.gia_nu  || 0;
            const giaHtml = `<div class="price-container">${
                giaNam > 0 ? `<div class="price-row"><span class="price-label">Nam:</span><span class="price-value" style="color:#00ff88;">${_formatVND(giaNam)}</span></div>` : ""
            }${
                giaNu  > 0 ? `<div class="price-row"><span class="price-label">Nữ:</span><span class="price-value" style="color:#f472b6;">${_formatVND(giaNu)}</span></div>`  : ""
            }${
                giaNam === 0 && giaNu === 0 ? `<span style="color:#64748b;font-size:0.75rem;">--</span>` : ""
            }</div>`;

            // Ngày+Giờ gộp 1 cột — căn giữa
            const ngayGioHtml = slot.ngay_danh
                ? `<div style="font-weight:700;font-size:0.82rem;color:#e2e8f0;white-space:nowrap;text-align:center;">${_formatDate(slot.ngay_danh)}</div>
                   <div style="font-size:0.75rem;color:#94a3b8;white-space:nowrap;text-align:center;">${(slot.gio_bat_dau||"--").slice(0,5)} → ${(slot.gio_ket_thuc||"--").slice(0,5)}</div>`
                : `<div style="color:#64748b;text-align:center;">--</div>`;

            // Màu hàng xen kẽ
            const rowBg = idx % 2 === 0
                ? "rgba(15,30,53,1)"
                : "rgba(26,40,68,0.7)";

            const isTamKhoa = !!slot.is_tam_khoa;

            // Status badge — bao gồm TẠM KHÓA
            let statusBadge;
            if (daChot) {
                statusBadge = `<span class="status-badge status-closed"><i class="fa-solid fa-lock"></i> Đã chốt</span>`;
            } else if (isTamKhoa) {
                statusBadge = `<span class="status-badge" style="background:rgba(234,88,12,0.12);color:#ea580c;border:1px solid rgba(234,88,12,0.3);padding:4px 8px;border-radius:6px;font-size:0.72rem;white-space:nowrap;"><i class="fa-solid fa-ban"></i> Tạm khóa</span>`;
            } else if (isExpired) {
                statusBadge = `<span class="status-badge" style="background:rgba(251,146,60,0.12);color:#fb923c;border:1px solid rgba(251,146,60,0.3);padding:4px 8px;border-radius:6px;font-size:0.72rem;white-space:nowrap;"><i class="fa-solid fa-clock"></i> Hết giờ</span>`;
            } else {
                statusBadge = `<span class="status-badge status-active"><i class="fa-solid fa-circle" style="font-size:0.5rem;"></i> Đang mở</span>`;
            }

            const tenSanEsc = (slot.ten_san||"").replace(/'/g,"\\x27");
            const tdB  = "border-right:1px solid rgba(255,255,255,0.07);";
            const tr = document.createElement("tr");
            tr.style.background = rowBg;
            tr.dataset.status = st;
            tr.innerHTML = `
                <td style="padding:8px 6px;text-align:center;${tdB}font-size:0.78rem;color:#64748b;">${globalIdx}</td>
                <td style="padding:8px 10px;text-align:center;${tdB}">${ngayGioHtml}</td>
                <td style="padding:8px 10px;text-align:left;${tdB}">
                    <div style="font-weight:600;font-size:0.82rem;color:#e2e8f0;">${slot.ten_san || "--"}</div>
                    <div style="font-size:0.75rem;color:#94a3b8;margin-top:1px;">${slot.quan_huyen || ""}${slot.tinh_thanh ? ", " + slot.tinh_thanh : ""}</div>
                    <div style="font-size:0.75rem;color:#7dd3fc;margin-top:2px;">${_hienThiGioiTinh(slot.gioi_tinh_can)} · ${_hienThiTrinhDo(slot)}</div>
                </td>
                <td style="padding:8px 8px;text-align:center;${tdB}">
                    <div style="font-size:0.82rem;font-weight:700;color:#60a5fa;">${tongKhach}${slot.tong_slot_can > 0 ? `<span style='color:#64748b;font-weight:400;'>/${slot.tong_slot_can}</span>` : ""}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;margin-bottom:4px;">${daDen} tham gia</div>
                    <button class="btn-mini btn-mini-cyan"
                        style="width:100%;justify-content:center;font-size:0.72rem;padding:4px 6px;"
                        onclick="window.openGuestListModal('${slot.id}','${tenSanEsc}')">
                        <i class="fa-solid fa-users"></i> DS Khách
                    </button>
                </td>
                <td style="padding:8px 10px;text-align:left;${tdB}">${giaHtml}</td>
                <td style="padding:8px 8px;text-align:center;${tdB}">${statusBadge}</td>
                <td style="padding:6px 8px;text-align:center;">
                    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px;">
                        ${!daChot ? `
                        <button class="btn-mini btn-mini-gold"
                            style="justify-content:center;white-space:nowrap;font-size:0.71rem;padding:5px 6px;"
                            onclick="window._moModalSuaCa('${slot.id}')">
                            <i class="fa-solid fa-pen"></i> Sửa
                        </button>
                        <button class="btn-mini btn-mini-green"
                            style="justify-content:center;white-space:nowrap;font-size:0.71rem;padding:5px 6px;"
                            onclick="window.chotCaDau('${slot.id}')">
                            <i class="fa-solid fa-flag-checkered"></i> Chốt Ca
                        </button>
                        ${isTamKhoa ? `
                        <button class="btn-mini"
                            style="justify-content:center;white-space:nowrap;font-size:0.71rem;padding:5px 6px;background:rgba(34,197,94,0.1);color:#4ade80;border:1px solid rgba(34,197,94,0.3);"
                            onclick="window.moLaiCaDau('${slot.id}')">
                            <i class="fa-solid fa-lock-open"></i> Mở Lại
                        </button>` : `
                        <button class="btn-mini"
                            style="justify-content:center;white-space:nowrap;font-size:0.71rem;padding:5px 6px;background:rgba(234,88,12,0.1);color:#ea580c;border:1px solid rgba(234,88,12,0.3);"
                            onclick="window.tamKhoaCaDau('${slot.id}')">
                            <i class="fa-solid fa-ban"></i> Tạm Khóa
                        </button>`}
                        <button class="btn-mini btn-mini-red"
                            style="justify-content:center;white-space:nowrap;font-size:0.71rem;padding:5px 6px;"
                            onclick="window.xoaCaDau('${slot.id}')">
                            <i class="fa-solid fa-trash"></i> Xóa
                        </button>` : `
                        <button class="btn-mini"
                            style="justify-content:center;white-space:nowrap;font-size:0.71rem;padding:5px 6px;background:rgba(34,211,238,0.1);color:#22d3ee;border:1px solid rgba(34,211,238,0.3);"
                            onclick="window.xemChiTietCaDau('${slot.id}')">
                            <i class="fa-solid fa-eye"></i> Chi tiết
                        </button>
                        <button class="btn-mini btn-mini-cyan"
                            style="justify-content:center;white-space:nowrap;font-size:0.71rem;padding:5px 6px;"
                            onclick="window.moModalDanhGiaCa('${slot.id}','${tenSanEsc}')">
                            <i class="fa-solid fa-star"></i> Đánh giá
                        </button>
                        <button class="btn-mini btn-mini-red" disabled
                            style="justify-content:center;white-space:nowrap;font-size:0.71rem;padding:5px 6px;">
                            <i class="fa-solid fa-trash"></i> Xóa
                        </button>
                        <span></span>`}
                    </div>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    // Áp dụng filter + sort + search rồi render
    function _caDauApply() {
        let list = [..._caDauRawData];

        // Filter theo trạng thái
        if (_caDauFilterSt !== "all") {
            list = list.filter(s => _caDauStatus(s) === _caDauFilterSt);
        }

        // Tìm kiếm: sân, khách (tên, SĐT)
        const kw = _caDauSearch.trim().toLowerCase();
        if (kw) {
            list = list.filter(slot => {
                if ((slot.ten_san || "").toLowerCase().includes(kw)) return true;
                if ((slot.tinh_thanh || "").toLowerCase().includes(kw)) return true;
                if ((slot.quan_huyen || "").toLowerCase().includes(kw)) return true;
                // Tìm trong danh sách khách của ca này
                const guests = _caDauSlotMap[slot.id] || [];
                return guests.some(g =>
                    (g.ten_khach || "").toLowerCase().includes(kw) ||
                    (g.sdt_khach || "").toLowerCase().includes(kw) ||
                    (g.ma_slot   || "").toLowerCase().includes(kw)
                );
            });
        }

        // Sort
        const col = _caDauSortCol;
        const dir = _caDauSortDir;
        list.sort((a, b) => {
            let va, vb;
            if (col === "#") {
                va = _caDauRawData.indexOf(a);
                vb = _caDauRawData.indexOf(b);
            } else if (col === "ngay_danh") {
                va = (a.ngay_danh || "") + (a.gio_bat_dau || "");
                vb = (b.ngay_danh || "") + (b.gio_bat_dau || "");
            } else if (col === "gia_nam") {
                va = a.gia_nam || 0; vb = b.gia_nam || 0;
            } else if (col === "da_chot_ca") {
                va = _caDauStatus(a); vb = _caDauStatus(b);
            } else {
                va = (a[col] || "").toString().toLowerCase();
                vb = (b[col] || "").toString().toLowerCase();
            }
            if (va < vb) return dir === "asc" ? -1 : 1;
            if (va > vb) return dir === "asc" ?  1 : -1;
            return 0;
        });

        // Phân trang: slice list theo trang hiện tại
        const totalFiltered = list.length;
        const start = (_caDauPage - 1) * _caDauPerPage;
        const pageList = list.slice(start, start + _caDauPerPage);

        _caDauUpdateSortIcons();
        _caDauUpdatePagination(totalFiltered);
        _caDauRenderTable(pageList);
    }

    // Hàm public: sort theo cột
    window._caDauSort = function (col) {
        if (_caDauSortCol === col) {
            _caDauSortDir = _caDauSortDir === "asc" ? "desc" : "asc";
        } else {
            _caDauSortCol = col;
            _caDauSortDir = col === "ngay_danh" ? "desc" : "asc";
        }
        _caDauPage = 1; // reset về trang 1 khi sort
        _caDauApply();
    };

    // Hàm public: filter trạng thái
    window._caDauLocTrangThai = function (val) {
        _caDauFilterSt = val;
        _caDauPage = 1; // reset về trang 1 khi filter
        _caDauApply();
    };

    // Hàm public: tìm kiếm
    window._caDauTimKiem = function (val) {
        _caDauSearch = val;
        _caDauPage = 1; // reset về trang 1 khi search
        _caDauApply();
    };

    // Hàm public: đổi số dòng/trang
    window._caDauSetPerPage = function (val) {
        _caDauPerPage = Number(val) || 10;
        _caDauPage = 1;
        _caDauApply();
    };

    // Hàm public: chuyển trang (delta = +1 hoặc -1)
    window._caDauChangePage = function (delta) {
        _caDauPage += delta;
        _caDauApply();
    };

    async function _taiLichSuCaDau() {
        const tbody = document.getElementById("hostSlotsBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:20px;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;

        try {
            const _myUser  = window.currentUser || window.currentGuest;
            const _myPhone = _myUser?.sdt_khach;
            const _myKey   = _myUser?.ma_key_host || window.currentHostKey;

            let mySlotsByPhone = [];
            let mySlotsByKey   = [];
            const allDatSlot = await window.dbEngine.docThu("dat_slot") || [];

            if (_myPhone) {
                const r = await window.dbEngine.docThu("ca_dau", {
                    eq: { sdt_nguoi_tao: _myPhone }, order: "created_at.desc"
                });
                mySlotsByPhone = r || [];
            }
            if (_myKey && typeof _myKey === "string" && _myKey.startsWith("TVL-")) {
                const r2 = await window.dbEngine.docThu("ca_dau", {
                    eq: { ma_key_host: _myKey }, order: "created_at.desc"
                });
                mySlotsByKey = r2 || [];
            }

            // Gộp, loại trùng
            const seenIds = new Set();
            const mySlots = [...mySlotsByPhone, ...mySlotsByKey].filter(s => {
                if (seenIds.has(s.id)) return false;
                seenIds.add(s.id); return true;
            }).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            // Nhóm dat_slot theo id_ca_dau
            _caDauSlotMap = {};
            allDatSlot.forEach(s => {
                if (!_caDauSlotMap[s.id_ca_dau]) _caDauSlotMap[s.id_ca_dau] = [];
                _caDauSlotMap[s.id_ca_dau].push(s);
            });

            _caDauRawData = mySlots;

            if (mySlots.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:20px;">
                    Chưa có ca đấu nào. Đăng kèo đầu tiên ngay!</td></tr>`;
                const info = document.getElementById("cdd-info");
                if (info) info.textContent = "";
                return;
            }

            // AUTO-LOCK: nhắc host xác nhận ca hết giờ chưa chốt
            const canAutoLock = mySlots.filter(s => !s.da_chot_ca && _isExpiredCa(s));
            if (canAutoLock.length > 0) {
                setTimeout(() => {
                    window.hienToast(
                        `⏰ ${canAutoLock.length} ca đã hết giờ`,
                        "Vui lòng kiểm tra và xác nhận số liệu thực tế trước khi chốt ca.",
                        "warning"
                    );
                    window.moModalXacNhanChotCa(canAutoLock[0].id, _caDauSlotMap[canAutoLock[0].id] || []);
                }, 800);
            }

            // Reset filter/search state khi tải lại từ đầu
            _caDauFilterSt = document.getElementById("cdd-filter-status")?.value || "all";
            _caDauSearch   = document.getElementById("cdd-search")?.value || "";
            _caDauApply();

        } catch (e) {
            console.error("Lỗi tải lịch sử:", e);
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:20px;">
                Lỗi tải dữ liệu. Kiểm tra kết nối.</td></tr>`;
        }
    }

    /* ═══════════════════════════════════════════════════
     * 11. CHỈNH SỬA CA ĐẤU — mở modal inline (không redirect sang tab Đăng)
     * ═══════════════════════════════════════════════════ */

    // Alias giữ backward compat nếu code khác gọi chinhSuaCaDau
    window.chinhSuaCaDau = async function (id) { await window._moModalSuaCa(id); };
    window.huyChinhSuaCaDau = function () { window._dongModalSuaCa(); };

    window._dongModalSuaCa = function () {
        const m = document.getElementById("modal-sua-ca");
        if (m) m.style.display = "none";
    };

    window._moModalSuaCa = async function (id) {
        const modal = document.getElementById("modal-sua-ca");
        const body  = document.getElementById("modal-sua-ca-body");
        if (!modal || !body) return;
        modal.dataset.caId = id;
        body.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>`;
        modal.style.display = "flex";

        try {
            const list = await window.dbEngine.doc("ca_dau", { eq: { id } });
            const slot = list[0];
            if (!slot) { window.hienToast("Không tìm thấy", "Ca đấu không còn tồn tại.", "danger"); window._dongModalSuaCa(); return; }
            if (slot.da_chot_ca) { window.hienToast("Đã chốt", "Không thể sửa ca đã chốt.", "danger"); window._dongModalSuaCa(); return; }

            const fld = (id, val, label, type="text", extra="") =>
                `<div style="margin-bottom:12px;">
                    <label style="display:block;font-size:0.73rem;color:#94a3b8;margin-bottom:4px;">${label}</label>
                    <input id="msc_${id}" type="${type}" value="${val ?? ""}" ${extra}
                        style="width:100%;padding:9px 12px;background:rgba(30,58,95,0.7);border:1px solid #2d4a6e;border-radius:8px;color:#e2e8f0;font-size:0.85rem;box-sizing:border-box;font-family:inherit;outline:none;">
                </div>`;

            const fldNum = (id, val, label) =>
                `<div style="margin-bottom:12px;">
                    <label style="display:block;font-size:0.73rem;color:#94a3b8;margin-bottom:4px;">${label}</label>
                    <input id="msc_${id}" type="number" value="${Number(val)||0}" min="0"
                        style="width:100%;padding:9px 12px;background:rgba(30,58,95,0.7);border:1px solid #2d4a6e;border-radius:8px;color:#e2e8f0;font-size:0.85rem;box-sizing:border-box;font-family:inherit;outline:none;">
                </div>`;

            // Danh sách loại cầu
            const cauList = Array.isArray(slot.loai_cau_su_dung) ? slot.loai_cau_su_dung : [];
            const cauRows = cauList.map((c, i) =>
                `<div style="display:grid;grid-template-columns:1fr 80px 80px;gap:8px;align-items:center;margin-bottom:8px;">
                    <span style="font-size:0.8rem;color:#e2e8f0;">${c.ten || "Cầu " + (i+1)}</span>
                    <div>
                        <label style="font-size:0.68rem;color:#64748b;">Số lượng</label>
                        <input type="number" id="msc_cau_sl_${i}" value="${c.so_luong||0}" min="0"
                            style="width:100%;padding:5px 8px;background:rgba(30,58,95,0.7);border:1px solid #2d4a6e;border-radius:6px;color:#e2e8f0;font-size:0.82rem;box-sizing:border-box;font-family:inherit;">
                    </div>
                    <div>
                        <label style="font-size:0.68rem;color:#64748b;">Giá/ống (đ)</label>
                        <input type="number" id="msc_cau_gia_${i}" value="${c.gia_ong||0}" min="0" step="1000"
                            style="width:100%;padding:5px 8px;background:rgba(30,58,95,0.7);border:1px solid #2d4a6e;border-radius:6px;color:#e2e8f0;font-size:0.82rem;box-sizing:border-box;font-family:inherit;">
                    </div>
                </div>`
            ).join("");

            body.innerHTML = `
                <div style="font-size:0.8rem;color:#fbbf24;padding:8px 12px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.2);border-radius:8px;margin-bottom:14px;">
                    <i class="fa-solid fa-pen"></i> Chỉnh sửa ca: <strong>${slot.ten_san||""}</strong> — ${_formatDate(slot.ngay_danh)}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">
                    ${fld("gia_nam", Math.round((slot.gia_nam||0)/1000), "Giá Nam (K đồng)", "number", 'min="0" step="1"')}
                    ${fld("gia_nu",  Math.round((slot.gia_nu ||0)/1000), "Giá Nữ (K đồng)",  "number", 'min="0" step="1"')}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">
                    ${fldNum("so_nguoi_nam", slot.so_nguoi_nam, "Số người Nam (dự kiến)")}
                    ${fldNum("so_nguoi_nu",  slot.so_nguoi_nu,  "Số người Nữ (dự kiến)")}
                </div>
                ${fldNum("tong_slot_can", slot.tong_slot_can, "Tổng số slot cần tuyển")}
                ${fldNum("so_san_mo", slot.so_san_mo||1, "Số sân mở (khu vực sân)")}
                <div style="margin-bottom:14px;">
                    <label style="display:block;font-size:0.73rem;color:#94a3b8;margin-bottom:6px;">Chi phí thuê sân thực tế (đ)</label>
                    <input id="msc_gia_thue_san_1h" type="number" value="${Number(slot.gia_thue_san_1h||0)}" min="0" step="1000"
                        style="width:100%;padding:9px 12px;background:rgba(30,58,95,0.7);border:1px solid #2d4a6e;border-radius:8px;color:#e2e8f0;font-size:0.85rem;box-sizing:border-box;font-family:inherit;">
                </div>
                <div style="margin-bottom:14px;">
                    <label style="display:block;font-size:0.73rem;color:#94a3b8;margin-bottom:6px;">Chi phí nước / phát sinh khác (đ)</label>
                    <input id="msc_chi_phi_nuoc_khac" type="number" value="${Number(slot.chi_phi_nuoc_khac||0)}" min="0" step="1000"
                        style="width:100%;padding:9px 12px;background:rgba(30,58,95,0.7);border:1px solid #2d4a6e;border-radius:8px;color:#e2e8f0;font-size:0.85rem;box-sizing:border-box;font-family:inherit;">
                </div>
                ${cauList.length ? `
                <div style="margin-bottom:6px;">
                    <label style="display:block;font-size:0.73rem;color:#94a3b8;margin-bottom:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Loại cầu sử dụng</label>
                    <div id="msc-cau-list" data-count="${cauList.length}">${cauRows}</div>
                </div>` : ""}`;

        } catch (e) {
            console.error("Lỗi load modal sửa:", e);
            body.innerHTML = `<div style="text-align:center;padding:30px;color:#ef4444;">Lỗi tải dữ liệu. Thử lại.</div>`;
        }
    };

    window._luuSuaCa = async function () {
        const modal = document.getElementById("modal-sua-ca");
        if (!modal) return;
        const id = modal.dataset.caId;
        if (!id) return;

        const g = (elId) => {
            const el = document.getElementById(elId);
            return el ? el.value : null;
        };
        const num = (elId, mul=1) => Math.round((Number(g(elId)) || 0) * mul);

        // Lấy cập nhật loại cầu từ inputs
        let cauListEl = document.getElementById("msc-cau-list");
        let cauCount  = cauListEl ? Number(cauListEl.dataset.count || 0) : 0;
        let cauListUp = [];
        if (cauCount > 0) {
            // Đọc dữ liệu ca hiện tại để giữ tên + loại
            let originalCau = [];
            try {
                const orig = await window.dbEngine.docThu("ca_dau", { eq: { id } });
                originalCau = orig?.[0]?.loai_cau_su_dung || [];
            } catch {}
            for (let i = 0; i < cauCount; i++) {
                const sl  = num(`msc_cau_sl_${i}`);
                const gia = num(`msc_cau_gia_${i}`);
                const orig = originalCau[i] || {};
                cauListUp.push({
                    ...orig,
                    so_luong: sl,
                    gia_ong: gia,
                    gia_qua: orig.loai ? Math.round(gia / (orig.loai || 12)) : 0,
                    thanh_tien: sl * gia
                });
            }
        }
        const tong_chi_phi_cau = cauListUp.reduce((s, c) => s + (c.thanh_tien || 0), 0);

        const payload = {
            gia_nam:            num("msc_gia_nam", 1000),
            gia_nu:             num("msc_gia_nu",  1000),
            so_nguoi_nam:       num("msc_so_nguoi_nam"),
            so_nguoi_nu:        num("msc_so_nguoi_nu"),
            tong_slot_can:      num("msc_tong_slot_can"),
            so_san_mo:          num("msc_so_san_mo") || 1,
            gia_thue_san_1h:    num("msc_gia_thue_san_1h"),
            chi_phi_nuoc_khac:  num("msc_chi_phi_nuoc_khac"),
        };
        if (cauListUp.length > 0) {
            payload.loai_cau_su_dung  = cauListUp;
            payload.tong_chi_phi_cau  = tong_chi_phi_cau;
        }

        try {
            await window.dbEngine.ghi("ca_dau", payload, { id });
            window.hienToast("Đã lưu ✅", "Thông tin ca đấu đã được cập nhật.", "success");
            window._dongModalSuaCa();
            await _taiLichSuCaDau();
        } catch (e) {
            console.error("Lỗi lưu sửa ca:", e);
            window.hienToast("Lỗi lưu", "Không thể cập nhật. Thử lại.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 12. CHỐT CA ĐẤU (KHÔNG ĐẢO NGƯỢC)
     * ═══════════════════════════════════════════════════ */
    window.chotCaDau = async function (id) {
        if (!await window.xacNhanModal("CHỐT CA — KHÔNG THỂ ĐẢO NGƯỢC!\n\nSau khi chốt, bạn KHÔNG thể sửa hay xóa ca này. Dữ liệu lưu vĩnh viễn.\n\nBạn chắc chắn muốn chốt ca này?", '🔒')) return;
        try {
            await window.dbEngine.ghi("ca_dau", { da_chot_ca: true }, { id });
            window.hienToast("Đã chốt ca! 🔒", "Ca đấu đã được khóa vĩnh viễn. Bạn có thể đánh giá khách.", "success");
            await _taiLichSuCaDau();
        } catch (e) {
            console.error("Lỗi chốt ca:", e);
            window.hienToast("Lỗi", "Không thể chốt ca. Thử lại.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 12B. MODAL XÁC NHẬN SỐ LIỆU THỰC TẾ TRƯỚC KHI CHỐT CA
     *   (Hiện ra khi ca đã hết giờ nhưng chưa chốt)
     * ═══════════════════════════════════════════════════ */
    window.moModalXacNhanChotCa = async function (caId, slotsOfCa) {
        const overlay = document.getElementById("modal-xacnhan-chot");
        if (!overlay) return;
        const body = document.getElementById("modal-xacnhan-chot-body");
        if (!body) return;

        // Lấy dữ liệu ca đấu
        let caList;
        try { caList = await window.dbEngine.doc("ca_dau", { eq: { id: caId } }); }
        catch (_) { caList = []; }
        const ca = caList[0];
        if (!ca) return;

        const _fmt = n => (n || 0).toLocaleString("vi-VN") + "đ";
        const cauList = Array.isArray(ca.loai_cau_su_dung) ? ca.loai_cau_su_dung : [];
        const cauRows = cauList.map((c, i) => `
            <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <span style="font-size:0.82rem;color:#e2e8f0;">${c.ten || 'Cầu ' + (i + 1)}</span>
                <input type="number" class="xnc-input" data-sc-idx="${i}" data-field="so_luong"
                    value="${c.so_luong || 0}" min="0" placeholder="quả"
                    style="width:72px;background:rgba(30,58,95,0.8);border:1px solid #2d4a6e;border-radius:6px;padding:5px 8px;color:#e2e8f0;font-size:0.82rem;text-align:right;"
                    oninput="_recalcXacNhan()">
                <span style="font-size:0.72rem;color:#64748b;">quả</span>
            </div>`).join("");

        body.innerHTML = `
            <div style="font-size:0.82rem;padding:10px 14px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.25);border-radius:8px;margin-bottom:14px;color:#fbbf24;">
                <i class="fa-solid fa-triangle-exclamation"></i>
                Ca đấu <strong>${ca.ten_san || ""}</strong> ngày <strong>${ca.ngay_danh || ""}</strong> đã hết giờ.<br>
                Hãy điền lại số liệu thực tế trước khi chốt khoá.
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                <div>
                    <label style="font-size:0.7rem;color:#94a3b8;display:block;margin-bottom:4px;">Tiền thuê sân thực tế (đ)</label>
                    <input type="number" id="xnc_tien_san" class="xnc-input"
                        value="${ca.chi_phi_san_co_dinh || 0}" min="0"
                        style="width:100%;background:rgba(30,58,95,0.8);border:1px solid #2d4a6e;border-radius:8px;padding:8px 12px;color:#e2e8f0;font-size:0.85rem;box-sizing:border-box;"
                        oninput="_recalcXacNhan()">
                </div>
                <div>
                    <label style="font-size:0.7rem;color:#94a3b8;display:block;margin-bottom:4px;">Nước / phát sinh khác (đ)</label>
                    <input type="number" id="xnc_tien_nuoc" class="xnc-input"
                        value="${ca.chi_phi_nuoc_khac || 0}" min="0"
                        style="width:100%;background:rgba(30,58,95,0.8);border:1px solid #2d4a6e;border-radius:8px;padding:8px 12px;color:#e2e8f0;font-size:0.85rem;box-sizing:border-box;"
                        oninput="_recalcXacNhan()">
                </div>
            </div>

            ${cauRows.length ? `
            <div style="font-size:0.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">
                Số cầu thực tế đã dùng
            </div>
            <div id="xnc-cau-list" data-ca-id="${caId}">${cauRows}</div>` : ""}

            <div style="margin-top:14px;padding:10px 14px;background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.2);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.82rem;color:#94a3b8;"><i class="fa-solid fa-calculator" style="color:#00ff88;margin-right:6px;"></i>Tổng chi phí thực tế:</span>
                <strong id="xnc-tong-chi" style="color:#00ff88;font-size:1rem;">${_fmt((ca.chi_phi_san_co_dinh || 0) + (ca.tong_chi_phi_cau || 0) + (ca.chi_phi_nuoc_khac || 0))}</strong>
            </div>`;

        // Lưu data để xử lý khi submit
        overlay.dataset.caId = caId;
        overlay.dataset.cauList = JSON.stringify(cauList);
        overlay.style.display  = "flex";

        // Recalc ngay sau khi render
        window._recalcXacNhan = function () {
            const tienSan  = Number(document.getElementById("xnc_tien_san")?.value)  || 0;
            const tienNuoc = Number(document.getElementById("xnc_tien_nuoc")?.value) || 0;
            // Tính tiền cầu từ các input số lượng
            let tongCau = 0;
            const cauListLocal = JSON.parse(overlay.dataset.cauList || "[]");
            document.querySelectorAll(".xnc-input[data-field='so_luong']").forEach(inp => {
                const idx = Number(inp.dataset.scIdx);
                const cauItem = cauListLocal[idx];
                if (cauItem) tongCau += (Number(inp.value) || 0) * (cauItem.gia_qua || 0);
            });
            const total = tienSan + tongCau + tienNuoc;
            const el = document.getElementById("xnc-tong-chi");
            if (el) el.textContent = total.toLocaleString("vi-VN") + "đ";
        };
    };

    // Xác nhận & chốt ca với số liệu đã chỉnh
    window.xacNhanVaChotCa = async function () {
        const overlay = document.getElementById("modal-xacnhan-chot");
        if (!overlay) return;
        const caId = overlay.dataset.caId;
        if (!caId) return;

        if (!await window.xacNhanModal("Xác nhận chốt ca? Sau khi chốt KHÔNG THỂ sửa nữa.", '🔒')) return;

        const tienSan  = Number(document.getElementById("xnc_tien_san")?.value)  || 0;
        const tienNuoc = Number(document.getElementById("xnc_tien_nuoc")?.value) || 0;

        // Cập nhật số lượng cầu thực tế
        const cauListLocal = JSON.parse(overlay.dataset.cauList || "[]");
        document.querySelectorAll(".xnc-input[data-field='so_luong']").forEach(inp => {
            const idx = Number(inp.dataset.scIdx);
            if (cauListLocal[idx] !== undefined) {
                const soLuong = Number(inp.value) || 0;
                const gia_qua = cauListLocal[idx].gia_qua || 0;
                cauListLocal[idx].so_luong  = soLuong;
                cauListLocal[idx].thanh_tien = soLuong * gia_qua;
            }
        });
        const tong_chi_phi_cau = cauListLocal.reduce((s, c) => s + (c.thanh_tien || 0), 0);

        try {
            await window.dbEngine.ghi("ca_dau", {
                chi_phi_san_co_dinh: tienSan,
                chi_phi_nuoc_khac:   tienNuoc,
                tong_chi_phi_cau,
                loai_cau_su_dung:    cauListLocal,
                da_chot_ca:          true
            }, { id: caId });
            window.hienToast("✅ Đã chốt ca!", "Số liệu thực tế đã được lưu và ca đấu đã khoá.", "success");
            window.dongModalXacNhanChot();
            await _taiLichSuCaDau();
        } catch (e) {
            window.hienToast("Lỗi chốt ca", (e.message || "Thử lại.").slice(0, 80), "danger");
        }
    };

    window.dongModalXacNhanChot = function () {
        const overlay = document.getElementById("modal-xacnhan-chot");
        if (overlay) overlay.style.display = "none";
    };

    /* ═══════════════════════════════════════════════════
     * 13. XÓA CA ĐẤU
     * ═══════════════════════════════════════════════════ */
    window.xoaCaDau = async function (id) {
        if (!await window.xacNhanModal("Bạn có chắc muốn xóa ca đấu này?\nHành động này không thể hoàn tác.", '🗑️')) return;
        try {
            await window.dbEngine.xoa("ca_dau", { id });

            // Xác minh xóa thực sự thành công (RLS anon có thể silently no-op → HTTP 204 nhưng 0 rows)
            const check = await window.dbEngine.docThu("ca_dau", { eq: { id } });
            if (check && check.length > 0) {
                window.hienToast("Không thể xóa", "Ca đấu vẫn còn trên hệ thống. Có thể do quyền truy cập. Liên hệ Admin nếu cần xóa gấp.", "danger");
                return;
            }

            // Cập nhật local state ngay — không cần tải lại toàn bộ
            _caDauRawData = _caDauRawData.filter(s => s.id !== id);
            delete _caDauSlotMap[id];
            _caDauApply();
            window.hienToast("Đã xóa ✅", "Ca đấu đã bị xóa khỏi hệ thống.", "info");
        } catch (e) {
            console.error("Lỗi xóa ca:", e);
            window.hienToast("Lỗi", "Không thể xóa ca đấu. Thử lại.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 13B. TẠM KHÓA / MỞ LẠI CA ĐẤU
     *   is_tam_khoa=true → không nhận slot mới, vẫn hiển thị ngoài trang chủ
     *   Cần chạy SQL: ALTER TABLE ca_dau ADD COLUMN IF NOT EXISTS is_tam_khoa BOOLEAN DEFAULT FALSE;
     * ═══════════════════════════════════════════════════ */
    window.tamKhoaCaDau = async function (id) {
        if (!await window.xacNhanModal(
            "Tạm khóa ca đấu này?\nKhách đã đăng ký vẫn giữ slot, nhưng không ai đăng ký thêm được.\nBạn có thể mở lại bất cứ lúc nào.",
            '🔒')) return;
        try {
            await window.dbEngine.ghi("ca_dau", { is_tam_khoa: true }, { id });
            // Cập nhật local state
            const slot = _caDauRawData.find(s => s.id === id);
            if (slot) slot.is_tam_khoa = true;
            _caDauApply();
            window.hienToast("Đã tạm khóa 🔒", "Ca đấu không nhận thêm đăng ký mới.", "info");
        } catch (e) {
            console.error("Lỗi tạm khóa:", e);
            window.hienToast("Lỗi", "Không thể tạm khóa. Thử lại sau.", "danger");
        }
    };

    window.moLaiCaDau = async function (id) {
        try {
            await window.dbEngine.ghi("ca_dau", { is_tam_khoa: false }, { id });
            const slot = _caDauRawData.find(s => s.id === id);
            if (slot) slot.is_tam_khoa = false;
            _caDauApply();
            window.hienToast("Đã mở lại ✅", "Ca đấu đang nhận đăng ký bình thường.", "success");
        } catch (e) {
            console.error("Lỗi mở lại ca:", e);
            window.hienToast("Lỗi", "Không thể mở lại. Thử lại sau.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 14. MODAL DANH SÁCH KHÁCH (đọc từ bảng dat_slot)
     * ═══════════════════════════════════════════════════ */
    window.moModalDanhSachKhach = async function (slotId) {
        const overlay = document.getElementById("modalDanhSachKhachOverlay");
        const tbody   = document.getElementById("danhSachKhachBody");
        if (!overlay || !tbody) return;

        overlay.dataset.slotId = slotId;
        overlay.style.display  = "flex";
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b;">Đang tải...</td></tr>`;

        try {
            // Tải thông tin ca đấu và danh sách dat_slot song song
            const [caDauList, datSlotList] = await Promise.all([
                window.dbEngine.doc("ca_dau", { eq: { id: slotId } }),
                window.dbEngine.doc("dat_slot", { eq: { id_ca_dau: slotId } })
            ]);
            const slot   = caDauList[0];
            const isChot = slot?.da_chot_ca || false;

            const header = document.getElementById("modalKhachHeader");
            if (header && slot) {
                header.textContent = `${slot.ten_san || "--"} | ${_formatDate(slot.ngay_danh)} ${slot.gio_bat_dau || ""} – ${slot.gio_ket_thuc || ""}`;
            }

            if (datSlotList.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b;">Chưa có khách đăng ký.</td></tr>`;
                return;
            }

            tbody.innerHTML = "";
            datSlotList.forEach((g, idx) => {
                const tt = g.trang_thai_di_danh || "Chờ đánh";
                const statusClass = tt === "Đã tham gia" ? "status-active" : tt === "Bùng kèo" ? "status-closed" : "status-pending";
                // C6: icon giới tính
                const gioiTinhHtml = g.gioi_tinh === "female"
                    ? '<span style="color:#f472b6;">👩 Nữ</span>'
                    : '<span style="color:#60a5fa;">👨 Nam</span>';
                // C6: checkbox xác nhận tham gia (disabled khi đã chốt)
                const cbChecked  = tt === "Đã tham gia" ? "checked" : "";
                const cbDisabled = isChot ? "disabled" : "";
                const cbHtml = `<input type="checkbox" ${cbChecked} ${cbDisabled}
                    data-guest-id="${g.id}"
                    onchange="window.xacNhanThamGia(this)"
                    style="width:18px;height:18px;cursor:${isChot ? 'not-allowed' : 'pointer'};">`;
                // Nút duyệt/từ chối khi slot "Chờ Host duyệt"
                const pendingBtns = tt === "Chờ Host duyệt" && !isChot
                    ? `<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">
                        <button class="btn-mini btn-mini-cyan" onclick="window.capNhatTrangThaiKhach('${g.id}','Chờ đánh')" title="Duyệt tham gia">✅ Duyệt</button>
                        <button class="btn-mini btn-mini-red" onclick="window.capNhatTrangThaiKhach('${g.id}','Khách hủy')" title="Từ chối">❌ Từ chối</button>
                       </div>` : "";

                // Nút báo ghost — chỉ hiện sau khi ca đã qua giờ kết thúc + slot đang "Chờ đánh" hoặc "Bùng kèo"
                const nowMs = Date.now();
                const caEndDt = slot?.ngay_danh && slot?.gio_ket_thuc
                    ? new Date(`${slot.ngay_danh}T${slot.gio_ket_thuc}`).getTime() : Infinity;
                const ghostBtn = !isChot && nowMs > caEndDt && (tt === "Chờ đánh" || tt === "Bùng kèo")
                    ? `<button class="btn-mini btn-mini-red" style="margin-top:3px;font-size:0.65rem;" onclick="window.baoCaoGhost('${g.id}','${(g.sdt_khach||'').replace(/'/g,"\\'")}')">👻 Ghost</button>` : "";

                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td style="text-align:center;color:#64748b;font-size:0.78rem;">${idx + 1}</td>
                <td style="font-size:0.82rem;font-weight:700;">${g.ten_khach || "--"}</td>
                <td style="font-size:0.8rem;color:#94a3b8;">${g.sdt_khach || "--"}</td>
                <td>${gioiTinhHtml}</td>
                <td><span class="status-badge ${statusClass}">${tt}</span>${tt === "Chờ Host duyệt" ? `<span class="badge-pending-host">CHỜ DUYỆT</span>` : ""}${pendingBtns}${ghostBtn}</td>
                <td style="text-align:center;">${cbHtml}</td>`;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Lỗi tải danh sách khách:", e);
            tbody.innerHTML = `<tr><td colspan="6" style="color:red;padding:20px;">Lỗi tải dữ liệu.</td></tr>`;
        }
    };

    // Ghost report: Host báo khách ghost sau ca kết thúc → trừ 15 điểm
    window.baoCaoGhost = async function (datSlotId, sdtKhach) {
        if (!confirm(`Xác nhận báo cáo ${sdtKhach} là GHOST (không đến, không hủy)?\nHành động sẽ trừ 15 điểm uy tín của tài khoản này.`)) return;
        try {
            await window.dbEngine.ghi("dat_slot", { trang_thai_di_danh: "Bùng kèo" }, { id: datSlotId });
            const users = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: sdtKhach } });
            const u = (users || [])[0];
            if (u && !u.is_whitelisted) {
                const newScore = Math.max(0, (u.diem_uy_tin ?? 100) - 15);
                await window.dbEngine.ghi("nguoi_dung", { diem_uy_tin: newScore }, { sdt_khach: sdtKhach });
                if (newScore < 40 && u.is_active !== false) {
                    await window.dbEngine.ghi("nguoi_dung", { is_active: false }, { sdt_khach: sdtKhach });
                }
            }
            window.hienToast("Đã báo cáo Ghost ✅", `Trừ 15 điểm uy tín của ${sdtKhach}.`, "success");
            const overlay = document.getElementById("modalDanhSachKhachOverlay");
            if (overlay?.dataset.slotId) window.moModalDanhSachKhach(overlay.dataset.slotId);
        } catch (e) {
            window.hienToast("Lỗi", "Không thể gửi báo cáo ghost.", "danger");
        }
    };

    window.dongModalDanhSachKhach = function () {
        const overlay = document.getElementById("modalDanhSachKhachOverlay");
        if (overlay) overlay.style.display = "none";
    };

    /**
     * H-JS3: openGuestListModal(matchId, matchTitle)
     * Mở modal #modal-guest-list, fetch dat_slot từ DB, render bảng khách.
     * onclick="window.openGuestListModal(id, tenSan)" từ bảng ca đấu.
     */
    window.openGuestListModal = async function (matchId, matchTitle) {
        const modal   = document.getElementById("modal-guest-list");
        const title   = document.getElementById("modal-guest-list-title");
        const tbody   = document.getElementById("modal-guest-list-body");
        const loading = document.getElementById("modal-guest-list-loading");
        const empty   = document.getElementById("modal-guest-list-empty");
        const table   = document.getElementById("modal-guest-list-table");
        if (!modal) return;

        // Ghi nhớ matchId trên modal để xacNhanThamGia có thể reload
        modal.dataset.matchId = matchId;

        // Cập nhật tiêu đề
        if (title) title.textContent = matchTitle ? `DS Khách — ${matchTitle}` : "Danh Sách Khách";

        // Xóa nội dung cũ, hiện loading
        if (tbody)   tbody.innerHTML = "";
        if (loading) loading.style.display = "block";
        if (empty)   empty.style.display   = "none";
        if (table)   table.style.display   = "none";
        // Reset bulk bar
        const _bulkBarInit = document.getElementById("gl-bulk-bar");
        const _cbAll = document.getElementById("gl-cb-all");
        if (_bulkBarInit) _bulkBarInit.style.display = "none";
        if (_cbAll) _cbAll.checked = false;

        // Hiện modal
        modal.classList.remove("hidden");
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";

        // Helper: format timestamp → "HH:mm DD/MM/YYYY"
        function _formatTS(ts) {
            if (!ts) return "--";
            const d = new Date(ts);
            if (isNaN(d)) return "--";
            const hh = String(d.getHours()).padStart(2,"0");
            const mm = String(d.getMinutes()).padStart(2,"0");
            const dd = String(d.getDate()).padStart(2,"0");
            const mo = String(d.getMonth()+1).padStart(2,"0");
            return `${hh}:${mm} ${dd}/${mo}/${d.getFullYear()}`;
        }

        try {
            // [4] Fetch song song: khách + ca đấu (kiểm tra da_chot_ca) + đánh giá hiện có
            const [guests, caDauList, reviewsRaw] = await Promise.all([
                window.dbEngine.doc("dat_slot", { eq: { id_ca_dau: matchId } }),
                window.dbEngine.doc("ca_dau",   { eq: { id: matchId } }).catch(() => []),
                window.dbEngine.doc("danh_gia_tin_dung", {
                    eq: { id_ca_dau: matchId, loai_danh_gia: "HostToGuest" }
                }).catch(() => [])
            ]);
            const daChotCa   = !!(caDauList[0]?.da_chot_ca);
            // Kiểm tra ca đã bắt đầu chưa — dùng để disable "Khách hủy" option
            const _caInfo = caDauList[0];
            const isMatchStarted = (() => {
                if (!_caInfo?.ngay_danh || !_caInfo?.gio_bat_dau) return false;
                return Date.now() >= new Date(`${_caInfo.ngay_danh}T${_caInfo.gio_bat_dau}`).getTime();
            })();
            // Lưu trên modal dataset để bulkDoiTrangThai + _triggerGlCdd đọc được
            if (modal) modal.dataset.matchStarted = isMatchStarted ? "1" : "0";
            // Cập nhật nút "Khách hủy" trong bulk bar
            const _bulkHuyBtn = document.querySelector("#gl-bulk-bar button[onclick*='Khách hủy']");
            if (_bulkHuyBtn) {
                _bulkHuyBtn.disabled = isMatchStarted;
                _bulkHuyBtn.title = isMatchStarted ? "Ca đã bắt đầu — chỉ dùng Bùng kèo" : "";
                _bulkHuyBtn.style.opacity = isMatchStarted ? "0.35" : "";
                _bulkHuyBtn.style.cursor  = isMatchStarted ? "not-allowed" : "";
            }
            // Auto-update Chờ đánh → Đã tham gia nếu ca đã hết giờ
            const _gioKetThuc = _caInfo?.gio_ket_thuc || _caInfo?.thoi_gian_ket_thuc;
            if (_gioKetThuc) window.autoUpdateChoDao(matchId, _gioKetThuc).catch(() => {});
            // Map: sdt_nguoi_bi_danh_gia → review object
            const reviewsMap = new Map((reviewsRaw || []).map(r => [r.sdt_nguoi_bi_danh_gia, r]));

            // [4b] Fetch trinh_do từ nguoi_dung theo danh sách SĐT của khách
            const sdtList = (guests || []).map(g => g.sdt_khach).filter(Boolean);
            const userList = sdtList.length > 0
                ? await window.dbEngine.doc("nguoi_dung", {
                    in: { sdt_khach: sdtList },
                    select: "sdt_khach,trinh_do"
                }).catch(() => [])
                : [];
            const userMap = new Map((userList || []).map(u => [u.sdt_khach, u]));

            if (loading) loading.style.display = "none";

            if (!guests || guests.length === 0) {
                if (empty) empty.style.display = "block";
                return;
            }

            // Debug: in ra field names của guest đầu tiên để verify mapping (xem DevTools Console)
            if (guests.length > 0) {
                console.log("[DS Khách] Mẫu dữ liệu guest[0]:", JSON.stringify(guests[0], null, 2));
            }

            // Render bảng — sort cố định theo thoi_gian_dat/created_at asc để thứ tự không đảo
            const sortedGuests = [...guests].sort((a, b) => {
                const ta = new Date(a.thoi_gian_dat || a.created_at || 0);
                const tb = new Date(b.thoi_gian_dat || b.created_at || 0);
                return ta - tb;
            });
            // Lưu daChotCa trên modal để doiTrangThaiDiDanh đọc mà không cần refetch
            if (modal) modal.dataset.daChotCa = daChotCa ? "1" : "0";

            if (table) table.style.display = "table";

            // ── Bulk action bar ─────────────────────────────────────────────
            const _bulkBar = document.getElementById("gl-bulk-bar");
            const _bulkCount = document.getElementById("gl-bulk-count");
            function _capNhatBulkBar() {
                const checkedBoxes = tbody ? tbody.querySelectorAll(".gl-row-cb:checked") : [];
                const n = checkedBoxes.length;
                if (_bulkBar) _bulkBar.style.display = n > 0 ? "flex" : "none";
                if (_bulkCount) _bulkCount.textContent = `${n} người`;
            }
            window._glCapNhatBulkBar = _capNhatBulkBar;

            // Hàm helper render toggle switch thanh toán
            function _renderToggleTT(slotId, daTT) {
                const onStyle  = "background:#00ff88;";
                const offStyle = "background:#334155;";
                const knobOn   = "transform:translateX(16px);";
                const knobOff  = "transform:translateX(2px);";
                return `<div onclick="event.stopPropagation();window.capNhatThanhToanToggle('${slotId}',this)" data-slot-id="${slotId}" data-checked="${daTT ? "1" : "0"}"
                    title="${daTT ? "Đã trả — click để bỏ" : "Chưa trả — click để đánh dấu"}"
                    style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;user-select:none;">
                    <div id="tt-sw-track-${slotId}" style="position:relative;width:34px;height:18px;border-radius:9px;transition:background 0.22s;flex-shrink:0;${daTT ? onStyle : offStyle}">
                        <div id="tt-sw-knob-${slotId}" style="position:absolute;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform 0.22s;box-shadow:0 1px 3px rgba(0,0,0,0.4);${daTT ? knobOn : knobOff}"></div>
                    </div>
                    <span id="tt-badge-${slotId}" style="font-size:0.72rem;font-weight:600;white-space:nowrap;${daTT ? "color:#34d399;" : "color:#64748b;"}">${daTT ? "Đã trả" : "Chưa trả"}</span>
                </div>`;
            }

            // Custom dropdown trạng thái — thay <select> native, hỗ trợ cả Khách hủy đổi ngược
            // isMatchStarted được đóng gói từ scope ngoài (tính ở đầu openGuestListModal)
            function _renderCustomDropdown(guestId, caId, trangThai, sdt, ten, daTT, tienBung) {
                // "Khách hủy" bị disable khi ca đã bắt đầu
                const _khachHuyDisabled = isMatchStarted;
                const _opts = [
                    { val: "Chờ đánh",    label: "Chờ đánh",    color: "#94a3b8", bg: "rgba(100,116,139,0.15)", border: "rgba(100,116,139,0.3)",
                      icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="11" height="11" rx="3" stroke="#94a3b8" stroke-width="1.3"/><path d="M6.5 3.5v3l2 1.5" stroke="#94a3b8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
                    { val: "Đã tham gia", label: "Đã tham gia", color: "#00ff88", bg: "rgba(0,255,136,0.10)", border: "rgba(0,255,136,0.3)",
                      icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="#00ff88" stroke-width="1.3"/><path d="M4 6.5l1.8 1.8L9 4" stroke="#00ff88" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
                    { val: "Bùng kèo",    label: "Bùng kèo",    color: "#fb923c", bg: "rgba(251,146,60,0.10)", border: "rgba(251,146,60,0.3)",
                      icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5L12 11.5H1L6.5 1.5Z" stroke="#fb923c" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.5 5v3M6.5 9.5v.2" stroke="#fb923c" stroke-width="1.3" stroke-linecap="round"/></svg>` },
                    { val: "Khách hủy",   label: "Khách hủy",   color: "#f87171", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.28)",
                      disabled: _khachHuyDisabled, disabledTitle: "Ca đã bắt đầu — không thể dùng Khách hủy",
                      icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="#f87171" stroke-width="1.3"/><path d="M4.5 4.5l4 4M8.5 4.5l-4 4" stroke="#f87171" stroke-width="1.3" stroke-linecap="round"/></svg>` },
                ];
                const cur = _opts.find(o => o.val === trangThai) || _opts[0];
                const uid = `cdd-${guestId}`;
                // data-* encode để doiTrangThaiDiDanh đọc được qua _triggerCustomDd()
                return `<div id="${uid}" class="gl-cdd" style="position:relative;display:inline-block;min-width:130px;">
                    <button type="button"
                        onclick="window._toggleGlCdd('${uid}')"
                        data-guest-id="${guestId}" data-ca-id="${caId}"
                        data-sdt="${sdt}" data-ten="${ten}"
                        data-da-thanh-toan="${daTT}" data-tien-bung="${tienBung}"
                        data-current="${trangThai}"
                        style="display:flex;align-items:center;gap:6px;width:100%;padding:5px 8px;
                               background:${cur.bg};border:1px solid ${cur.border};border-radius:8px;
                               color:${cur.color};font-size:0.76rem;font-family:inherit;cursor:pointer;
                               white-space:nowrap;justify-content:space-between;">
                        <span style="display:flex;align-items:center;gap:6px;">${cur.icon}${cur.label}</span>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="${cur.color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <div class="gl-cdd-menu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;z-index:9999;
                         background:#0f1e35;border:1px solid #1e3a5f;border-radius:9px;
                         box-shadow:0 8px 24px rgba(0,0,0,0.6);min-width:140px;overflow:hidden;">
                        ${_opts.map(o => o.disabled
                            ? `<div class="gl-cdd-opt" title="${o.disabledTitle||""}"
                                 style="display:flex;align-items:center;gap:7px;padding:8px 12px;font-size:0.76rem;
                                        color:${o.color};opacity:0.3;cursor:not-allowed;user-select:none;">
                                ${o.icon}<span>${o.label}</span>
                                <span style="margin-left:auto;font-size:0.65rem;color:#64748b;">🔒</span>
                               </div>`
                            : `<div onclick="window._triggerGlCdd('${uid}','${o.val}')" class="gl-cdd-opt"
                                 style="display:flex;align-items:center;gap:7px;padding:8px 12px;cursor:pointer;font-size:0.76rem;
                                        color:${o.color};transition:background 0.12s;${trangThai===o.val?"background:"+o.bg+";":""}"
                                 onmouseover="this.style.background='${o.bg}'"
                                 onmouseout="this.style.background='${trangThai===o.val?o.bg:"transparent"}'">
                                ${o.icon}<span>${o.label}</span>
                                ${trangThai===o.val?`<svg style="margin-left:auto;" width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5L9 3" stroke="${o.color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`:""}
                               </div>`
                        ).join("")}
                    </div>
                </div>`;
            }

            // Hàm helper render badge trạng thái dạng pill SVG
            function _renderBadgeTT(trangThai) {
                if (trangThai === "Đã tham gia") return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:0.72rem;font-weight:700;background:rgba(0,255,136,0.10);color:#00ff88;border:1px solid rgba(0,255,136,0.25);white-space:nowrap;"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="3.5" fill="#00ff88"/><path d="M2 4l1.5 1.5L6 2.5" stroke="#0f1e35" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Đã tham gia</span>`;
                if (trangThai === "Bùng kèo")    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:0.72rem;font-weight:700;background:rgba(239,68,68,0.10);color:#f87171;border:1px solid rgba(239,68,68,0.25);white-space:nowrap;"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="3.5" fill="#f87171"/><path d="M2.5 2.5l3 3M5.5 2.5l-3 3" stroke="#0f1e35" stroke-width="1.2" stroke-linecap="round"/></svg>Bùng kèo</span>`;
                if (trangThai === "Khách hủy")   return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:0.72rem;font-weight:700;background:rgba(239,68,68,0.08);color:#f87171;border:1px solid rgba(239,68,68,0.20);white-space:nowrap;"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="3.5" fill="#f87171" opacity=".7"/><path d="M2.5 2.5l3 3M5.5 2.5l-3 3" stroke="#0f1e35" stroke-width="1.2" stroke-linecap="round"/></svg>Khách hủy</span>`;
                return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:0.72rem;font-weight:700;background:rgba(100,116,139,0.15);color:#94a3b8;border:1px solid rgba(100,116,139,0.25);white-space:nowrap;"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="3.5" fill="#64748b"/></svg>Chờ đánh</span>`;
            }

            const rowsHTML = sortedGuests.map((g, idx) => {
                const trangThai  = g.trang_thai_di_danh || "Chờ đánh";
                const isActive   = trangThai === "Đã tham gia";
                const isKhachHuy = trangThai === "Khách hủy";
                const isBung     = trangThai === "Bùng kèo";
                const isHuy      = isKhachHuy || isBung;
                const canRate    = isActive || isBung;
                const gioiTinh   = g.gioi_tinh === "female" ? "Nữ" : "Nam";
                const genderClr  = g.gioi_tinh === "female" ? "#f472b6" : "#60a5fa";

                // Cột Trạng thái: custom dropdown cho tất cả (kể cả Khách hủy có thể đổi ngược)
                const selectHTML = _renderCustomDropdown(g.id, matchId, trangThai,
                    (g.sdt_khach||"").replace(/"/g,""),
                    (g.ten_khach||"").replace(/"/g,""),
                    g.da_thanh_toan ? "1" : "0",
                    g.tien_thu_bung || 0);

                // Cột Thanh toán
                let ttCellHTML;
                if (isKhachHuy) {
                    ttCellHTML = `<span style="color:#475569;font-size:0.72rem;">—</span>`;
                } else if (isBung) {
                    const tienBung = Math.round((g.tien_thu_bung || 0) / 1000);
                    ttCellHTML = `<div style="display:inline-flex;align-items:center;gap:0;position:relative;">
                        <input type="number" data-slot-id="${g.id}" value="${tienBung}" min="0" step="1"
                               onchange="window.capNhatTienBung(this)"
                               placeholder="0"
                               style="width:62px;background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.3);
                                      color:#fb923c;border-radius:6px 0 0 6px;padding:4px 6px;font-size:0.75rem;
                                      text-align:right;font-family:inherit;outline:none;box-sizing:border-box;
                                      -moz-appearance:textfield;appearance:textfield;">
                        <span style="background:rgba(251,146,60,0.15);border:1px solid rgba(251,146,60,0.3);border-left:none;
                                     color:#fb923c;font-size:0.7rem;font-weight:700;padding:4px 5px;border-radius:0 6px 6px 0;
                                     line-height:1;display:flex;align-items:center;">K</span>
                    </div>`;
                } else if (isActive) {
                    const daTT = !!g.da_thanh_toan;
                    ttCellHTML = _renderToggleTT(g.id, daTT);
                } else {
                    ttCellHTML = `<span style="color:#475569;font-size:0.72rem;">—</span>`;
                }

                // Cột Thời gian hủy — lấy huy_luc ưu tiên, fallback các field khác
                const tgHuyClr  = isBung ? "#fb923c" : (isKhachHuy ? "#f87171" : "#475569");
                const _tgHuyRaw = g.huy_luc || g.cancelled_at || (isHuy ? g.updated_at : null);
                const tgHuy     = isHuy ? _formatTS(_tgHuyRaw) : "--";

                // Cột Đánh giá
                const tenKhachEsc = (g.ten_khach || "").replace(/'/g, "\\x27");
                const sdtKhachEsc = (g.sdt_khach || "").replace(/'/g, "\\x27");
                let ratingCellHTML;
                if (!canRate) {
                    ratingCellHTML = `<span style="color:#475569;font-size:0.72rem;">—</span>`;
                } else {
                    const existingRev = reviewsMap.get(g.sdt_khach);
                    if (existingRev) {
                        const starStr = "★".repeat(Math.min(5, existingRev.so_sao || 0));
                        const tooltip = (existingRev.nhan_xet || "").replace(/"/g,"&quot;").slice(0, 80);
                        ratingCellHTML = `<span title="${tooltip}" style="color:#fbbf24;font-size:0.95rem;letter-spacing:1px;">${starStr}</span>
                            <span style="display:block;font-size:0.68rem;color:#64748b;white-space:nowrap;margin-top:2px;">${existingRev.so_sao}/5 sao</span>`;
                    } else if (daChotCa) {
                        ratingCellHTML = `<button
                            onclick="window.moQuickDanhGiaKhach('${sdtKhachEsc}','${tenKhachEsc}','${matchId}')"
                            style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;padding:4px 12px;border-radius:7px;cursor:pointer;font-size:0.75rem;font-family:inherit;white-space:nowrap;">
                            ⭐ Đánh giá
                        </button>`;
                    } else {
                        ratingCellHTML = `<span style="color:#475569;font-size:0.7rem;white-space:nowrap;">Chờ chốt ca</span>`;
                    }
                }

                const rowBgOdd  = "rgba(15,30,53,0.95)";
                const rowBgEven = "rgba(20,38,65,0.7)";
                const bg = idx % 2 === 0 ? rowBgEven : rowBgOdd;
                // table-layout:fixed — clip text ở td thường; td dropdown KHÔNG clip (overflow:visible)
                const _tdBase = "padding:7px 8px;border-bottom:1px solid rgba(30,58,95,0.4);border-right:1px solid rgba(255,255,255,0.04);overflow:hidden;";
                const td = (content, extra="") => `<td style="${_tdBase}${extra}">${content}</td>`;
                const tdLast = (content, extra="") =>
                    `<td style="padding:7px 8px;border-bottom:1px solid rgba(30,58,95,0.4);overflow:hidden;${extra}">${content}</td>`;
                // td dành cho cột dropdown — class td-cdd + overflow:visible để menu thoát ra ngoài
                const tdDd = (content) =>
                    `<td class="td-cdd" style="padding:7px 8px;border-bottom:1px solid rgba(30,58,95,0.4);border-right:1px solid rgba(255,255,255,0.04);">${content}</td>`;

                const trinhDo = userMap.get(g.sdt_khach)?.trinh_do || "--";
                const trinhDoHtml = trinhDo !== "--"
                    ? `<span style="padding:2px 6px;border-radius:10px;font-size:0.71rem;background:rgba(96,165,250,0.12);color:#60a5fa;border:1px solid rgba(96,165,250,0.25);white-space:nowrap;display:inline-block;">${trinhDo}</span>`
                    : `<span style="color:#475569;font-size:0.72rem;">—</span>`;

                // Checkbox bulk-select — Khách hủy vẫn có checkbox để có thể chọn khôi phục
                const cbHTML = `<input type="checkbox" class="gl-row-cb" data-guest-id="${g.id}"
                              onchange="window._glCapNhatBulkBar && window._glCapNhatBulkBar()"
                              style="width:14px;height:14px;accent-color:#00ff88;cursor:pointer;">`;

                return `<tr data-guest-idx="${idx}" style="background:${bg};transition:background 0.12s;"
                            onmouseover="this.style.background='rgba(30,58,95,0.5)'"
                            onmouseout="this.style.background='${bg}'">
                    ${td(cbHTML, "text-align:center;")}
                    ${td(`<button onclick="window.xemHoSoKhach('${sdtKhachEsc}','${tenKhachEsc}','${matchId}')"
                                  onmouseover="this.style.textDecoration='underline'"
                                  onmouseout="this.style.textDecoration='none'"
                                  style="background:none;border:none;color:#e2e8f0;font-weight:600;cursor:pointer;padding:0;font-family:inherit;font-size:0.81rem;text-decoration:none;text-align:left;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:block;">
                            ${g.ten_khach || "—"}
                        </button>`, "text-align:left;")}
                    ${td(`<span style="color:#94a3b8;font-family:monospace;font-size:0.76rem;white-space:nowrap;">${g.sdt_khach || "—"}</span>`, "text-align:center;")}
                    ${td(`<span style="color:${genderClr};font-weight:600;font-size:0.8rem;">${gioiTinh}</span>`, "text-align:center;")}
                    ${td(trinhDoHtml, "text-align:center;")}
                    ${td(`<span style="color:#94a3b8;font-size:0.73rem;white-space:nowrap;">${_formatTS(g.thoi_gian_dat || g.created_at)}</span>`, "text-align:center;")}
                    ${td(`<span style="color:${tgHuyClr};font-size:0.73rem;white-space:nowrap;">${tgHuy}</span>`, "text-align:center;")}
                    ${td(ttCellHTML, "text-align:center;")}
                    ${tdDd(selectHTML)}
                    ${tdLast(ratingCellHTML, "text-align:center;")}
                </tr>`;
            }).join("");

            if (tbody) tbody.innerHTML = rowsHTML;

        } catch (err) {
            if (loading) loading.style.display = "none";
            if (tbody)   tbody.innerHTML = `<tr><td colspan="10" style="padding:24px;text-align:center;color:#f87171;">Lỗi tải danh sách: ${(err.message || "").slice(0, 80)}</td></tr>`;
            if (table)   table.style.display = "table";
            console.error("openGuestListModal error:", err);
        }
    };

    /** H-JS3: Đóng modal #modal-guest-list */
    window.closeGuestListModal = function () {
        const modal = document.getElementById("modal-guest-list");
        if (modal) { modal.classList.add("hidden"); modal.style.display = "none"; }
        document.body.style.overflow = "";
        // Đóng portal nếu đang mở
        window._closeGlPortal && window._closeGlPortal();
    };
    window._dongGuestListModal = window.closeGuestListModal;

    /* ── Custom dropdown helpers ─────────────────────────────────── */
    // Đóng tất cả dropdown đang mở (gọi khi click ngoài)
    document.addEventListener("click", function (e) {
        // Đóng portal nếu click ra ngoài trigger button hoặc ngoài portal
        if (!e.target.closest(".gl-cdd") && !e.target.closest("#gl-cdd-portal")) {
            window._closeGlPortal();
        }
    }, true);

    // Đóng portal khi bảng danh sách khách được scroll (tránh menu lạc vị trí)
    document.addEventListener("scroll", function (e) {
        const p = document.getElementById("gl-cdd-portal");
        if (p && p.style.display !== "none") window._closeGlPortal();
    }, true);

    // Helper: lấy hoặc tạo portal div trên body (dùng chung cho tất cả dropdown)
    function _getGlPortal() {
        let p = document.getElementById("gl-cdd-portal");
        if (!p) {
            p = document.createElement("div");
            p.id = "gl-cdd-portal";
            p.style.cssText = [
                "position:fixed",
                "z-index:999999",
                "display:none",
                "background:#0f1e35",
                "border:1px solid #1e3a5f",
                "border-radius:9px",
                "box-shadow:0 8px 32px rgba(0,0,0,0.75)",
                "min-width:148px",
                "overflow:hidden",
                "animation:glFadeIn .12s ease"
            ].join(";");
            document.body.appendChild(p);
        }
        return p;
    }

    window._closeGlPortal = function () {
        const p = document.getElementById("gl-cdd-portal");
        if (p) { p.style.display = "none"; p.dataset.uid = ""; }
        document.querySelectorAll(".tr-cdd-open").forEach(r => r.classList.remove("tr-cdd-open"));
    };

    window._toggleGlCdd = function (uid) {
        const wrap = document.getElementById(uid);
        if (!wrap) return;
        const menu = wrap.querySelector(".gl-cdd-menu");
        if (!menu) return;

        const portal = _getGlPortal();
        const isThisOpen = portal.style.display !== "none" && portal.dataset.uid === uid;

        // Đóng portal (dù là cùng uid hay khác uid)
        window._closeGlPortal();
        if (isThisOpen) return; // Toggle: đang mở thì đóng thôi

        // Đổ nội dung các option vào portal
        portal.innerHTML = menu.innerHTML;

        // Đo vị trí trigger button để định vị portal
        const btn     = wrap.querySelector("button[data-guest-id]");
        const btnRect = btn.getBoundingClientRect();

        // Hiện tạm (invisible) để đo chiều cao thực
        portal.style.visibility = "hidden";
        portal.style.display    = "block";
        const portalH = portal.offsetHeight;
        portal.style.visibility = "";

        // Tính top/bottom: ưu tiên mở xuống, đảo ngược nếu không đủ chỗ
        const spaceBelow = window.innerHeight - btnRect.bottom - 8;
        if (spaceBelow >= portalH) {
            portal.style.top    = (btnRect.bottom + 4) + "px";
            portal.style.bottom = "auto";
        } else {
            portal.style.top    = Math.max(4, btnRect.top - portalH - 4) + "px";
            portal.style.bottom = "auto";
        }

        // Canh trái — tránh bị cắt ở cạnh phải màn hình
        const portalW = portal.offsetWidth || 148;
        const leftPos = Math.min(btnRect.left, window.innerWidth - portalW - 8);
        portal.style.left = Math.max(4, leftPos) + "px";

        portal.dataset.uid = uid;

        // Đẩy <tr> lên z-index cao
        const tr = wrap.closest("tr");
        if (tr) tr.classList.add("tr-cdd-open");
    };

    window._triggerGlCdd = function (uid, newState) {
        const wrap = document.getElementById(uid);
        if (!wrap) return;
        const btn = wrap.querySelector("button[data-guest-id]");
        if (!btn) return;
        // Đóng portal
        window._closeGlPortal();
        // Không làm gì nếu chọn lại trạng thái hiện tại
        if (btn.dataset.current === newState) return;
        // Tạo proxy object giống select element để doiTrangThaiDiDanh dùng được
        const proxy = {
            dataset: { ...btn.dataset },
            value: newState,
            disabled: false,
            closest: (sel) => btn.closest(sel)
        };
        Object.defineProperty(proxy, "disabled", {
            get() { return btn.disabled; },
            set(v) { btn.disabled = v; }
        });
        // Cập nhật data-current để tránh gọi lại
        btn.dataset.current = newState;
        window.doiTrangThaiDiDanh(proxy).then(() => {
            // Sau khi thành công → cập nhật visual button
            const _opts = [
                { val: "Chờ đánh",    color: "#94a3b8", bg: "rgba(100,116,139,0.15)", border: "rgba(100,116,139,0.3)",
                  icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="11" height="11" rx="3" stroke="#94a3b8" stroke-width="1.3"/><path d="M6.5 3.5v3l2 1.5" stroke="#94a3b8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
                { val: "Đã tham gia", color: "#00ff88", bg: "rgba(0,255,136,0.10)", border: "rgba(0,255,136,0.3)",
                  icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="#00ff88" stroke-width="1.3"/><path d="M4 6.5l1.8 1.8L9 4" stroke="#00ff88" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
                { val: "Bùng kèo",    color: "#fb923c", bg: "rgba(251,146,60,0.10)", border: "rgba(251,146,60,0.3)",
                  icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5L12 11.5H1L6.5 1.5Z" stroke="#fb923c" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.5 5v3M6.5 9.5v.2" stroke="#fb923c" stroke-width="1.3" stroke-linecap="round"/></svg>` },
                { val: "Khách hủy",   color: "#f87171", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.28)",
                  icon: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="#f87171" stroke-width="1.3"/><path d="M4.5 4.5l4 4M8.5 4.5l-4 4" stroke="#f87171" stroke-width="1.3" stroke-linecap="round"/></svg>` },
            ];
            const cur = _opts.find(o => o.val === newState) || _opts[0];
            btn.style.background = cur.bg;
            btn.style.borderColor = cur.border;
            btn.style.color = cur.color;
            const labelSpan = btn.querySelector("span");
            if (labelSpan) labelSpan.innerHTML = `${cur.icon}${cur.label}`;
            const chevron = btn.querySelector("svg:last-child");
            if (chevron) chevron.querySelector("path").setAttribute("stroke", cur.color);
            // Cập nhật trạng thái active trong menu opts
            wrap.querySelectorAll(".gl-cdd-opt").forEach(opt => {
                const optVal = opt.getAttribute("onclick")?.match(/'([^']+)'\)$/)?.[1] || "";
                const optCur = _opts.find(o => o.val === optVal);
                if (!optCur) return;
                if (optVal === newState) {
                    opt.style.background = optCur.bg;
                    if (!opt.querySelector("svg:last-child")) {
                        opt.innerHTML += `<svg style="margin-left:auto;" width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5l2.5 2.5L9 3" stroke="${optCur.color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                    }
                } else {
                    opt.style.background = "transparent";
                    opt.onmouseover = () => opt.style.background = optCur.bg;
                    opt.onmouseout  = () => opt.style.background = "transparent";
                    const chk = opt.querySelector("svg:last-child");
                    if (chk) chk.remove();
                }
            });
        }).catch(() => {
            // Rollback visual
            btn.dataset.current = proxy.dataset.current;
        });
    };

    /* ═══════════════════════════════════════════════════
     * [4] QUICK ĐÁNH GIÁ KHÁCH từ modal DS Khách
     *     Mở modal nhỏ #modal-quick-dg, lưu vào danh_gia_tin_dung
     * ═══════════════════════════════════════════════════ */
    let _qdStarVal = 5;
    const _qdStarLabels = ["", "1 sao — Tệ", "2 sao — Không tốt", "3 sao — Bình thường", "4 sao — Tốt", "5 sao — Xuất sắc"];

    function _renderQdStars(selected) {
        _qdStarVal = selected;
        const container = document.getElementById("qd-stars");
        const labelEl   = document.getElementById("qd-star-label");
        if (!container) return;
        container.innerHTML = [1,2,3,4,5].map(n =>
            `<span onclick="window._setQdStar(${n})"
                   onmouseover="window._hoverQdStar(${n})"
                   onmouseout="window._hoverQdStar(0)"
                   style="color:${n <= selected ? "#fbbf24" : "#334155"};transition:color 0.1s;cursor:pointer;user-select:none;">★</span>`
        ).join("");
        if (labelEl) labelEl.textContent = _qdStarLabels[selected] || "";
    }

    window._setQdStar = function(n) { _qdStarVal = n; _renderQdStars(n); };
    window._hoverQdStar = function(n) {
        const container = document.getElementById("qd-stars");
        if (!container) return;
        container.querySelectorAll("span").forEach((s, i) => {
            s.style.color = (n > 0 && i < n) ? "#fbbf24" : (i < _qdStarVal ? "#fbbf24" : "#334155");
        });
    };

    window.moQuickDanhGiaKhach = function (sdtKhach, tenKhach, caId) {
        const modal = document.getElementById("modal-quick-dg");
        if (!modal) return;
        document.getElementById("qd-sdt").value   = sdtKhach;
        document.getElementById("qd-ca-id").value = caId;
        const titleEl   = document.getElementById("qd-title");
        const commentEl = document.getElementById("qd-comment");
        if (titleEl)   titleEl.textContent = `⭐ Đánh giá: ${tenKhach}`;
        if (commentEl) commentEl.value = "";
        _renderQdStars(5);
        modal.classList.remove("hidden");
    };

    window.dongQuickDanhGia = function () {
        const modal = document.getElementById("modal-quick-dg");
        if (modal) modal.classList.add("hidden");
    };

    window.guiQuickDanhGia = async function () {
        const sdtKhach = document.getElementById("qd-sdt")?.value?.trim();
        const caId     = document.getElementById("qd-ca-id")?.value?.trim();
        const comment  = document.getElementById("qd-comment")?.value?.trim();
        const btn      = document.getElementById("qd-submit-btn");

        if (!sdtKhach || !caId) {
            window.hienToast("Lỗi", "Thiếu thông tin khách hoặc ca đấu.", "danger"); return;
        }
        const hostPhone = window.currentHostInfo?.sdt_host || window.currentHostKey;
        if (!hostPhone) {
            window.hienToast("Lỗi", "Không xác định được tài khoản Host.", "danger"); return;
        }

        // Kiểm tra đã đánh giá chưa
        const existed = await window.dbEngine.doc("danh_gia_tin_dung", {
            eq: { id_ca_dau: caId, sdt_nguoi_viet: hostPhone, loai_danh_gia: "HostToGuest", sdt_nguoi_bi_danh_gia: sdtKhach }
        }).catch(() => []);
        if (existed.length > 0) {
            window.hienToast("Đã đánh giá", "Bạn đã gửi đánh giá cho khách này rồi.", "warning"); return;
        }

        if (btn) { btn.disabled = true; btn.textContent = "Đang gửi..."; }
        try {
            await window.dbEngine.ghi("danh_gia_tin_dung", {
                id_ca_dau:             caId,
                sdt_nguoi_viet:        hostPhone,
                sdt_nguoi_bi_danh_gia: sdtKhach,
                loai_danh_gia:         "HostToGuest",
                so_sao:                _qdStarVal,
                nhan_xet:              comment || null
            });
            window.hienToast("Đánh giá thành công! ⭐", `Đã gửi ${_qdStarVal} sao cho khách.`, "success");
            window.dongQuickDanhGia();
            // Reload lại DS Khách để cập nhật cột Đánh giá
            const guestModal = document.getElementById("modal-guest-list");
            if (guestModal?.dataset.matchId) {
                const titleEl = document.getElementById("modal-guest-list-title");
                const currentTitle = (titleEl?.textContent || "").replace(/^DS Khách — /, "");
                window.openGuestListModal(guestModal.dataset.matchId, currentTitle).catch(() => {});
            }
        } catch (e) {
            console.error("Lỗi gửi quick đánh giá:", e);
            window.hienToast("Lỗi", "Không gửi được đánh giá: " + (e.message || "").slice(0, 60), "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-star"></i> Gửi đánh giá'; }
        }
    };

    /* Cập nhật trạng thái khách qua bảng dat_slot */
    window.capNhatTrangThaiKhach = async function (datSlotId, newStatus) {
        try {
            await window.dbEngine.ghi("dat_slot", { trang_thai_di_danh: newStatus }, { id: datSlotId });
            window.hienToast("Cập nhật thành công", `Đã đổi trạng thái → ${newStatus}`, "success");
            // Reload modal
            const overlay = document.getElementById("modalDanhSachKhachOverlay");
            if (overlay?.dataset.slotId) await window.moModalDanhSachKhach(overlay.dataset.slotId);
            await _taiLichSuCaDau();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể cập nhật trạng thái.", "danger");
        }
    };

    /* H-JS3 / C6 — Xác nhận tham gia qua checkbox
     * Fix: capNhatTrangThaiKhach swallow error nội bộ → rollback không bao giờ chạy.
     * Giờ gọi dbEngine.ghi trực tiếp để kiểm soát lỗi và rollback đúng cách.
     */
    window.xacNhanThamGia = async function (checkbox) {
        const guestId   = checkbox.dataset.guestId;
        const isChecked = checkbox.checked;                              // trạng thái người dùng vừa chọn
        const trangThai = isChecked ? "Đã tham gia" : "Chờ đánh";
        checkbox.disabled = true;                                        // ngăn click trùng trong lúc gọi API

        try {
            await window.dbEngine.ghi("dat_slot", { trang_thai_di_danh: trangThai }, { id: guestId });
            window.hienToast("Đã cập nhật trạng thái", trangThai, "success");

            // Cộng điểm uy tín +2 khi xác nhận "Đã tham gia"
            if (isChecked) {
                const slotList = await window.dbEngine.docThu("dat_slot", { eq: { id: guestId } }).catch(() => []);
                const sdt = (slotList || [])[0]?.sdt_khach;
                if (sdt) {
                    const users = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: sdt } }).catch(() => []);
                    const u = (users || [])[0];
                    if (u && !u.is_whitelisted) {
                        const newScore = Math.min(100, (u.diem_uy_tin ?? 100) + 2);
                        const newCa    = (u.so_ca_thanh_cong ?? 0) + 1;
                        window.dbEngine.ghi("nguoi_dung", { diem_uy_tin: newScore, so_ca_thanh_cong: newCa }, { sdt_khach: sdt }).catch(() => {});
                    }
                }
            }
            // Reload modal #modal-guest-list và bảng ca đấu (background — không await để UI không bị freeze)
            const modal = document.getElementById("modal-guest-list");
            if (modal?.dataset.matchId) {
                const titleEl = document.getElementById("modal-guest-list-title");
                const currentTitle = titleEl ? titleEl.textContent.replace(/^DS Khách — /, "") : "";
                window.openGuestListModal(modal.dataset.matchId, currentTitle).catch(() => {});
            }
            _taiLichSuCaDau().catch(() => {});
        } catch (e) {
            // Rollback checkbox về trạng thái trước khi click
            checkbox.checked = !isChecked;
            console.error("Lỗi xacNhanThamGia:", e);
            window.hienToast("Lỗi cập nhật", "Không thể lưu trạng thái. Thử lại sau.", "danger");
        } finally {
            checkbox.disabled = false;
        }
    };

    /* ─── doiTrangThaiDiDanh ───────────────────────────────────────
     * Hàm mới thay checkbox — xử lý select 3 trạng thái:
     * "Chờ đánh" | "Đã tham gia" | "Bùng kèo"
     * (xacNhanThamGia giữ nguyên cho backward compat với moModalDanhSachKhach cũ)
     * ──────────────────────────────────────────────────────────────── */
    window.doiTrangThaiDiDanh = async function (selectEl) {
        const guestId  = selectEl.dataset.guestId;
        const newState = selectEl.value;
        const prevVal  = selectEl.dataset.prev || selectEl.value;
        selectEl.disabled = true;

        try {
            // Frontend guard: chặn "Khách hủy" sau khi ca đã bắt đầu
            if (newState === "Khách hủy") {
                const _modal = document.getElementById("modal-guest-list");
                if (_modal?.dataset.matchStarted === "1") {
                    window.hienToast("Không được phép", "Ca đã bắt đầu — chỉ dùng Bùng kèo.", "warning");
                    selectEl.disabled = false;
                    return;
                }
            }
            // Ghi thêm huy_luc = now() khi đổi sang trạng thái hủy/bùng (cần cột huy_luc — migration-dat-slot-v2.sql)
            const payload = { trang_thai_di_danh: newState };
            if (newState === "Bùng kèo" || newState === "Khách hủy") {
                payload.huy_luc = new Date().toISOString();
            }
            await window.dbEngine.ghi("dat_slot", payload, { id: guestId });
            selectEl.dataset.prev = newState;
            window.hienToast("Đã cập nhật ✅", newState, "success");

            // Cập nhật DOM trực tiếp — KHÔNG reload lại modal (tránh đảo thứ tự + mất UX)
            const tr = selectEl.closest("tr");
            if (tr) {
                const cells       = tr.querySelectorAll("td");
                const ttCell      = cells[7]; // cột Thanh Toán (index 7)
                const rateCell    = cells[9]; // cột Đánh Giá (index 9)
                const isNewActive = newState === "Đã tham gia";
                const isNewBung   = newState === "Bùng kèo";
                const daChotCa    = document.getElementById("modal-guest-list")?.dataset.daChotCa === "1";
                const daTT        = selectEl.dataset.daThanhtoan === "1"; // data-da-thanh-toan → daThanhtoan
                const tienBung    = Number(selectEl.dataset.tienBung) || 0;
                const sdtEsc      = (selectEl.dataset.sdt || "").replace(/'/g,"\\x27");
                const tenEsc      = (selectEl.dataset.ten || "").replace(/'/g,"\\x27");
                const matchId     = selectEl.dataset.caId;

                // Cập nhật ô Thanh Toán
                if (ttCell) {
                    if (isNewBung) {
                        const tienBungK = Math.round(tienBung / 1000);
                        ttCell.innerHTML = `<div style="display:inline-flex;align-items:center;gap:0;position:relative;">
                            <input type="number" data-slot-id="${guestId}" value="${tienBungK}" min="0" step="1"
                                   onchange="window.capNhatTienBung(this)" placeholder="0"
                                   style="width:62px;background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.3);
                                          color:#fb923c;border-radius:6px 0 0 6px;padding:4px 6px;font-size:0.75rem;
                                          text-align:right;font-family:inherit;outline:none;box-sizing:border-box;
                                          -moz-appearance:textfield;appearance:textfield;">
                            <span style="background:rgba(251,146,60,0.15);border:1px solid rgba(251,146,60,0.3);border-left:none;
                                         color:#fb923c;font-size:0.7rem;font-weight:700;padding:4px 5px;border-radius:0 6px 6px 0;
                                         line-height:1;display:flex;align-items:center;">K</span>
                        </div>`;
                    } else if (isNewActive) {
                        ttCell.innerHTML = `<div onclick="event.stopPropagation();window.capNhatThanhToanToggle('${guestId}',this)" data-slot-id="${guestId}" data-checked="${daTT ? "1" : "0"}"
                            title="${daTT ? "Đã trả — click để bỏ" : "Chưa trả — click để đánh dấu"}"
                            style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;user-select:none;">
                            <div id="tt-sw-track-${guestId}" style="position:relative;width:34px;height:18px;border-radius:9px;transition:background 0.22s;flex-shrink:0;background:${daTT ? "#00ff88" : "#334155"};">
                                <div id="tt-sw-knob-${guestId}" style="position:absolute;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform 0.22s;box-shadow:0 1px 3px rgba(0,0,0,0.4);transform:${daTT ? "translateX(16px)" : "translateX(2px)"};"></div>
                            </div>
                            <span id="tt-badge-${guestId}" style="font-size:0.72rem;font-weight:600;white-space:nowrap;${daTT ? "color:#34d399;" : "color:#64748b;"}">${daTT ? "Đã trả" : "Chưa trả"}</span>
                        </div>`;
                    } else {
                        ttCell.innerHTML = `<span style="color:#475569;font-size:0.72rem;">—</span>`;
                    }
                }

                // Cập nhật ô Đánh Giá
                if (rateCell && (isNewActive || isNewBung)) {
                    if (daChotCa) {
                        rateCell.innerHTML = `<button
                            onclick="window.moQuickDanhGiaKhach('${sdtEsc}','${tenEsc}','${matchId}')"
                            style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;padding:4px 12px;border-radius:7px;cursor:pointer;font-size:0.75rem;font-family:inherit;white-space:nowrap;">
                            ⭐ Đánh giá
                        </button>`;
                    } else {
                        rateCell.innerHTML = `<span style="color:#475569;font-size:0.7rem;white-space:nowrap;">Chờ chốt ca</span>`;
                    }
                } else if (rateCell && !isNewActive && !isNewBung) {
                    rateCell.innerHTML = `<span style="color:#475569;font-size:0.72rem;">—</span>`;
                }
            }

            // Cập nhật bảng chính Ca Đã Đăng (cập nhật count tham gia) — không cần refetch modal
            _taiLichSuCaDau().catch(() => {});
        } catch (e) {
            selectEl.value = prevVal; // rollback select về giá trị cũ
            console.error("Lỗi doiTrangThaiDiDanh:", e);
            // KHÔNG show toast ở đây — dbEngine.ghi đã gọi hienLoiMang() rồi (tránh double toast)
        } finally {
            selectEl.disabled = false;
        }
    };

    /* ─── capNhatTienBung ──────────────────────────────────────────
     * Lưu số tiền thu được khi khách Bùng kèo (0 = không thu, >0 = phạt)
     * Đọc từ input[type=number] trong cột Thanh toán của "Bùng kèo" row
     * ──────────────────────────────────────────────────────────────── */
    window.capNhatTienBung = async function (inputEl) {
        const slotId = inputEl.dataset.slotId;
        // Input đơn vị K → nhân 1000 để lưu vào DB
        const kVal  = Math.max(0, parseInt(inputEl.value) || 0);
        const amount = kVal * 1000;
        inputEl.disabled = true;
        try {
            await window.dbEngine.ghi("dat_slot", { tien_thu_bung: amount }, { id: slotId });
            window.hienToast(
                "Đã lưu tiền bùng",
                amount > 0 ? `Thu được ${amount.toLocaleString("vi-VN")}đ` : "Không thu được tiền",
                "success"
            );
        } catch (e) {
            console.error("Lỗi capNhatTienBung:", e);
            window.hienToast("Lỗi lưu", "Không thể lưu số tiền. Thử lại sau.", "danger");
        } finally {
            inputEl.disabled = false;
        }
    };

    /* L2 — Toggle switch thanh toán (thay checkbox cũ)
     * Guard kép: _thanhToanDangXu (Set) + _thanhToanCooldown (Map+timestamp 3s)
     */
    const _thanhToanDangXu   = new Set();
    const _thanhToanCooldown = new Map();

    window.capNhatThanhToan = function (checkbox, domEvent) {
        if (domEvent) domEvent.stopPropagation();
        const slotId = checkbox.dataset.slotId;
        if (!slotId) return;
        if (_thanhToanDangXu.has(slotId)) { checkbox.checked = !checkbox.checked; return; }
        const cooldownUntil = _thanhToanCooldown.get(slotId) || 0;
        if (Date.now() < cooldownUntil) { checkbox.checked = !checkbox.checked; return; }
        const isChecked = checkbox.checked;
        _thanhToanDangXu.add(slotId);
        checkbox.disabled = true;
        window.dbEngine.ghi("dat_slot", { da_thanh_toan: isChecked }, { id: slotId })
            .then(() => {
                _thanhToanCooldown.delete(slotId);
                const badge = document.getElementById(`tt-badge-${slotId}`);
                if (badge) {
                    badge.textContent = isChecked ? "Đã trả" : "Chưa trả";
                    badge.style.cssText = isChecked
                        ? "padding:2px 7px;border-radius:10px;font-size:0.72rem;font-weight:600;white-space:nowrap;background:rgba(6,78,59,0.6);color:#34d399;border:1px solid rgba(5,46,37,0.5);"
                        : "padding:2px 7px;border-radius:10px;font-size:0.72rem;font-weight:600;white-space:nowrap;background:rgba(51,65,85,0.5);color:#94a3b8;";
                }
                window.hienToast("Đã cập nhật.", isChecked ? "Đã đánh dấu thanh toán." : "Đã bỏ đánh dấu.", "success");
            })
            .catch(e => {
                checkbox.checked = !isChecked;
                _thanhToanCooldown.set(slotId, Date.now() + 3000);
                console.error("Lỗi capNhatThanhToan:", e);
            })
            .finally(() => { checkbox.disabled = false; _thanhToanDangXu.delete(slotId); });
    };

    /* Toggle switch mới — thay thế checkbox cho cột Thanh Toán */
    window.capNhatThanhToanToggle = function (slotId, wrapEl) {
        if (_thanhToanDangXu.has(slotId)) return;
        const cooldownUntil = _thanhToanCooldown.get(slotId) || 0;
        if (Date.now() < cooldownUntil) return;

        const isChecked = wrapEl.dataset.checked !== "1"; // toggle
        _thanhToanDangXu.add(slotId);
        wrapEl.style.opacity = "0.5";
        wrapEl.style.pointerEvents = "none";

        window.dbEngine.ghi("dat_slot", { da_thanh_toan: isChecked }, { id: slotId })
            .then(() => {
                _thanhToanCooldown.delete(slotId);
                wrapEl.dataset.checked = isChecked ? "1" : "0";
                wrapEl.title = isChecked ? "Đã trả — click để bỏ" : "Chưa trả — click để đánh dấu";
                const track = document.getElementById(`tt-sw-track-${slotId}`);
                const knob  = document.getElementById(`tt-sw-knob-${slotId}`);
                const badge = document.getElementById(`tt-badge-${slotId}`);
                if (track) track.style.background = isChecked ? "#00ff88" : "#334155";
                if (knob)  knob.style.transform   = isChecked ? "translateX(16px)" : "translateX(2px)";
                if (badge) { badge.textContent = isChecked ? "Đã trả" : "Chưa trả"; badge.style.color = isChecked ? "#34d399" : "#64748b"; }
                window.hienToast("Đã cập nhật.", isChecked ? "Đã đánh dấu thanh toán." : "Đã bỏ đánh dấu.", "success");
            })
            .catch(e => {
                _thanhToanCooldown.set(slotId, Date.now() + 3000);
                console.error("Lỗi capNhatThanhToanToggle:", e);
            })
            .finally(() => { wrapEl.style.opacity = ""; wrapEl.style.pointerEvents = ""; _thanhToanDangXu.delete(slotId); });
    };

    /* ── Bulk confirm popover cho "Khách hủy" ─────────────────────── */
    window.bulkDoiTrangThaiConfirm = function (newState) {
        if (newState === "Khách hủy") {
            // Chặn ngay nếu ca đã bắt đầu — không cần confirm
            const _modal = document.getElementById("modal-guest-list");
            if (_modal?.dataset.matchStarted === "1") {
                window.hienToast("Không được phép", "Ca đã bắt đầu — chỉ dùng Bùng kèo.", "warning");
                return;
            }
            const confirmEl = document.getElementById("gl-confirm-huy");
            if (confirmEl) { confirmEl.style.display = "flex"; return; }
        }
        window.bulkDoiTrangThai(newState);
    };

    /* ── Bulk action: đổi trạng thái nhiều khách cùng lúc ─────────── */
    window.bulkDoiTrangThai = async function (newState) {
        const tbody = document.getElementById("modal-guest-list-body");
        if (!tbody) return;
        const checkedBoxes = Array.from(tbody.querySelectorAll(".gl-row-cb:checked"));
        if (checkedBoxes.length === 0) return;

        const _glModal = document.getElementById("modal-guest-list");
        const matchId = _glModal?.dataset.matchId;
        // Backend-side guard: chặn bulk "Khách hủy" sau khi ca đã bắt đầu
        if (newState === "Khách hủy" && _glModal?.dataset.matchStarted === "1") {
            window.hienToast("Không được phép", "Ca đã bắt đầu — chỉ dùng Bùng kèo.", "warning");
            return;
        }
        const payload = { trang_thai_di_danh: newState };
        if (newState === "Bùng kèo" || newState === "Khách hủy") payload.huy_luc = new Date().toISOString();

        let ok = 0, fail = 0;
        await Promise.all(checkedBoxes.map(async cb => {
            const guestId = cb.dataset.guestId;
            try {
                await window.dbEngine.ghi("dat_slot", payload, { id: guestId });
                ok++;
            } catch { fail++; }
        }));

        window.hienToast(`Bulk update xong`, `${ok} thành công${fail > 0 ? `, ${fail} lỗi` : ""}`, ok > 0 ? "success" : "danger");
        // Reload lại modal để cập nhật DOM
        if (matchId) {
            const titleEl = document.getElementById("modal-guest-list-title");
            const currentTitle = (titleEl?.textContent || "").replace(/^DS Khách — /, "");
            window.openGuestListModal(matchId, currentTitle).catch(() => {});
        }
    };

    /* ── Auto-update: Chờ đánh → Đã tham gia khi hết giờ ca ──────── */
    window.autoUpdateChoDao = async function (matchId, gioKetThuc) {
        if (!matchId || !gioKetThuc) return;
        const ketThuc = new Date(gioKetThuc);
        if (isNaN(ketThuc) || Date.now() < ketThuc.getTime()) return; // Ca chưa kết thúc

        try {
            const guests = await window.dbEngine.doc("dat_slot", { eq: { id_ca_dau: matchId } });
            const choDao = (guests || []).filter(g => (g.trang_thai_di_danh || "Chờ đánh") === "Chờ đánh");
            if (choDao.length === 0) return;

            await Promise.all(choDao.map(g =>
                window.dbEngine.ghi("dat_slot", { trang_thai_di_danh: "Đã tham gia" }, { id: g.id }).catch(() => {})
            ));
            window.hienToast("Tự động cập nhật", `${choDao.length} khách "Chờ đánh" → "Đã tham gia"`, "success");
        } catch (e) {
            console.error("autoUpdateChoDao error:", e);
        }
    };

    /* ═══════════════════════════════════════════════════
     * L3: ĐÁNH GIÁ CA ĐẤU — modal đơn giản
     *     Lưu ghi chú vào field danh_gia trong bảng ca_dau
     *     (Khác với moModalDanhGiaKhach — chấm điểm cá nhân từng khách)
     * ═══════════════════════════════════════════════════ */
    window.moModalDanhGiaCa = async function (slotId, tenSan) {
        const modal = document.getElementById("modal-danh-gia-ca");
        if (!modal) return;
        modal.dataset.slotId = slotId;

        // Cập nhật subtitle
        const sub = document.getElementById("modal-danh-gia-ca-sTitle");
        if (sub) sub.textContent = tenSan ? `Sân: ${tenSan}` : `Ca đấu: ${slotId.slice(0,8)}...`;

        // Pre-fill nội dung đã lưu trước đó (nếu có)
        const textarea = document.getElementById("modal-danh-gia-ca-text");
        if (textarea) {
            textarea.value = "";
            try {
                const list = await window.dbEngine.doc("ca_dau", { eq: { id: slotId } });
                if (list?.[0]?.danh_gia) textarea.value = list[0].danh_gia;
            } catch (_) { /* bỏ qua lỗi pre-fill */ }
        }

        modal.classList.remove("hidden");
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
        if (textarea) setTimeout(() => textarea.focus(), 80);
    };

    window.dongModalDanhGiaCa = function () {
        const modal = document.getElementById("modal-danh-gia-ca");
        if (modal) { modal.classList.add("hidden"); modal.style.display = "none"; }
        document.body.style.overflow = "";
    };

    window.luuDanhGiaCa = async function () {
        const modal    = document.getElementById("modal-danh-gia-ca");
        const slotId   = modal?.dataset.slotId;
        const textarea = document.getElementById("modal-danh-gia-ca-text");
        const ghiChu   = textarea?.value?.trim() || "";

        if (!slotId) { window.hienToast("Lỗi", "Không tìm thấy ca đấu.", "danger"); return; }

        const btn = modal?.querySelector("button[onclick*='luuDanhGiaCa']");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'; }

        try {
            await window.dbEngine.ghi("ca_dau", { danh_gia: ghiChu || null }, { id: slotId });
            window.hienToast("Đã lưu đánh giá ⭐", "Ghi chú ca đấu đã được cập nhật.", "success");
            window.dongModalDanhGiaCa();
        } catch (e) {
            console.error("Lỗi luuDanhGiaCa:", e);
            window.hienToast("Lỗi lưu đánh giá", "Không thể lưu. Thử lại sau.", "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu'; }
        }
    };

    /* ═══════════════════════════════════════════════════
     * 15. ĐÁNH GIÁ KHÁCH (SAU KHI CHỐT CA)
     *     Lưu vào bảng danh_gia_tin_dung
     * ═══════════════════════════════════════════════════ */
    window.moModalDanhGiaKhach = async function (slotId) {
        const overlay = document.getElementById("modalDanhGiaKhachOverlay");
        if (!overlay) return;

        try {
            // Tải ca đấu
            const caDauList = await window.dbEngine.doc("ca_dau", { eq: { id: slotId } });
            const slot = caDauList[0];
            if (!slot) return;

            // Điều kiện 1: Đã chốt ca
            if (!slot.da_chot_ca) {
                window.hienToast("Chưa chốt ca", "Bạn cần chốt ca trước khi đánh giá khách.", "warning"); return;
            }

            // Lấy khách đủ điều kiện: trang_thai_di_danh = "Đã tham gia"
            const duKienGuests = await window.dbEngine.doc("dat_slot", {
                eq: { id_ca_dau: slotId, trang_thai_di_danh: "Đã tham gia" }
            });

            if (duKienGuests.length === 0) {
                window.hienToast("Không có khách đủ điều kiện", "Chưa có khách nào được xác nhận 'Đã tham gia'.", "warning"); return;
            }

            // Lấy danh sách đã được đánh giá bởi host này
            const hostPhone = window.currentHostInfo?.sdt_host || window.currentHostKey;
            const existingReviews = await window.dbEngine.doc("danh_gia_tin_dung", {
                eq: { id_ca_dau: slotId, sdt_nguoi_viet: hostPhone, loai_danh_gia: "HostToGuest" }
            }).catch(() => []);
            const daDanhGiaPhones = new Set(existingReviews.map(r => r.sdt_nguoi_bi_danh_gia));

            overlay.dataset.slotId = slotId;
            overlay.style.display  = "flex";

            const sel = document.getElementById("hostReviewGuestSelect");
            if (sel) {
                sel.innerHTML = '<option value="">-- Chọn khách để đánh giá --</option>';
                duKienGuests.forEach(g => {
                    const reviewed = daDanhGiaPhones.has(g.sdt_khach);
                    const opt = document.createElement("option");
                    opt.value = g.sdt_khach;
                    opt.textContent = `${g.ten_khach} (${g.sdt_khach}) ${reviewed ? "✅ Đã đánh giá" : ""}`;
                    if (reviewed) opt.disabled = true;
                    sel.appendChild(opt);
                });
            }

            window.hostRatingStarIndex = 5;
            _capNhatStarUIHost(5);
            const commentEl = document.getElementById("hostReviewComment");
            if (commentEl) commentEl.value = "";
        } catch (e) { console.error("Lỗi mở modal đánh giá:", e); }
    };

    window.dongModalDanhGiaKhach = function () {
        const overlay = document.getElementById("modalDanhGiaKhachOverlay");
        if (overlay) overlay.style.display = "none";
    };

    window.guiDanhGiaKhach = async function () {
        const overlay   = document.getElementById("modalDanhGiaKhachOverlay");
        const slotId    = overlay?.dataset.slotId;
        const sel       = document.getElementById("hostReviewGuestSelect");
        const guestPhone = sel?.value;
        const comment   = document.getElementById("hostReviewComment")?.value?.trim();

        if (!slotId || !guestPhone) {
            window.hienToast("Chưa chọn khách", "Vui lòng chọn khách để đánh giá.", "warning"); return;
        }

        const hostPhone = window.currentHostInfo?.sdt_host || window.currentHostKey;

        try {
            // Kiểm tra đã đánh giá chưa
            const existed = await window.dbEngine.doc("danh_gia_tin_dung", {
                eq: { id_ca_dau: slotId, sdt_nguoi_viet: hostPhone, loai_danh_gia: "HostToGuest", sdt_nguoi_bi_danh_gia: guestPhone }
            }).catch(() => []);
            if (existed.length > 0) {
                window.hienToast("Đã đánh giá", "Bạn đã gửi đánh giá cho khách này rồi.", "warning"); return;
            }

            // Ghi vào bảng danh_gia_tin_dung
            await window.dbEngine.ghi("danh_gia_tin_dung", {
                id_ca_dau:              slotId,
                sdt_nguoi_viet:         hostPhone,
                sdt_nguoi_bi_danh_gia:  guestPhone,
                loai_danh_gia:          "HostToGuest",
                so_sao:                 window.hostRatingStarIndex,
                nhan_xet:               comment || null
            });

            window.hienToast("Đánh giá thành công! ⭐", `Đã gửi ${window.hostRatingStarIndex} sao.`, "success");
            window.dongModalDanhGiaKhach();
        } catch (e) {
            console.error("Lỗi gửi đánh giá:", e);
            window.hienToast("Lỗi", "Không gửi được đánh giá.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 16. HỆ THỐNG SAO ĐÁNH GIÁ
     * ═══════════════════════════════════════════════════ */
    function _khoiTaoStarRating() {
        _initStarContainer("hostRatingStars", (n) => { window.hostRatingStarIndex = n; });
    }

    function _initStarContainer(containerId, onSelect) {
        const ctr = document.getElementById(containerId);
        if (!ctr) return;
        ctr.innerHTML = "";
        for (let i = 1; i <= 5; i++) {
            const star = document.createElement("i");
            star.className = "fa-solid fa-star star-item";
            star.dataset.val = i;
            star.addEventListener("click", () => { onSelect(i); _capNhatStarUI(ctr, i); });
            star.addEventListener("mouseenter", () => _capNhatStarUI(ctr, i, true));
            star.addEventListener("mouseleave", () => _capNhatStarUI(ctr, Number(ctr.dataset.selected) || 5));
            ctr.appendChild(star);
        }
        ctr.dataset.selected = 5;
        _capNhatStarUI(ctr, 5);
    }

    function _capNhatStarUI(ctr, val, isHover = false) {
        if (!isHover) ctr.dataset.selected = val;
        ctr.querySelectorAll(".star-item").forEach((s, i) => {
            s.style.color = i < val ? "#fbbf24" : "#374151";
        });
    }

    function _capNhatStarUIHost(val) {
        const ctr = document.getElementById("hostRatingStars");
        if (ctr) _capNhatStarUI(ctr, val);
    }

    /* ═══════════════════════════════════════════════════
     * 17. TIỆN ÍCH HIỂN THỊ
     * ═══════════════════════════════════════════════════ */
    function _formatVND(n) {
        return Number(n || 0).toLocaleString("vi-VN") + "đ";
    }

    // Hiển thị tiền theo đơn vị K (dùng trong modal kế toán)
    function _formatK(n) {
        const k = Math.round((n || 0) / 1000);
        return (k >= 1000 ? k.toLocaleString("vi-VN") : String(k)) + "K";
    }
    window._formatK = _formatK;

    /**
     * Format input chế độ K: người dùng gõ "100" → hiển thị "100" → rawValue lưu "100000"
     * Hỗ trợ số âm (dùng cho Chênh lệch giá).
     */
    window._formatInputTienTeK = function(input) {
        const raw = input.value.replace(/[^0-9-]/g, "");
        const num = parseInt(raw, 10);
        if (!isNaN(num) && raw !== "" && raw !== "-") {
            input.value = String(num);
        }
        input.dataset.rawValue = String((!isNaN(num) && raw !== "" && raw !== "-") ? num * 1000 : 0);
    };

    /**
     * Gán giá trị K vào input (khi load data từ DB — giá trị đầu vào là đồng đầy đủ).
     * Display = num/1000, rawValue = num.
     */
    function _setCurrencyInputK(elId, num) {
        const el = document.getElementById(elId);
        if (!el) return;
        const n = Number(num) || 0;
        const k = Math.round(n / 1000);
        el.value = k !== 0 ? String(k) : "";
        el.dataset.rawValue = String(n);
    }
    window._setCurrencyInputK = _setCurrencyInputK;

    /**
     * 3G — Format input tiền tệ realtime (dấu chấm nghìn kiểu Việt Nam).
     * Dùng cho input type="text" (KHÔNG dùng cho type="number").
     * Lưu giá trị thô vào dataset.rawValue để ghi DB.
     */
    window._formatInputTienTe = function(input) {
        // Cho phép ký tự số + dấu âm (ô chênh lệch giá có thể âm)
        const raw = input.value.replace(/\./g, "").replace(/[^0-9-]/g, "");
        const num = parseInt(raw, 10);
        if (!isNaN(num) && raw !== "") {
            input.value = num.toLocaleString("vi-VN"); // "150.000"
        }
        input.dataset.rawValue = raw || "0";
    };

    /**
     * Lấy giá trị số thô từ input đã format (bỏ dấu chấm nghìn).
     * Hỗ trợ cả type="text" (formatted) và type="number" (legacy).
     */
    window._layGiaTriThoInput = function(input) {
        if (!input) return 0;
        return parseInt(input.dataset.rawValue || input.value.replace(/\./g, "") || "0", 10);
    };

    /**
     * Lấy số tiền từ element ID — thay thế cho Number(el.value).
     * Tự động nhận dạng cả input có format dấu chấm lẫn type=number thuần.
     */
    function _parseCurrency(elId) {
        const el = document.getElementById(elId);
        if (!el) return 0;
        return window._layGiaTriThoInput(el);
    }

    /**
     * Gán giá trị đã format vào input tiền tệ (khi load data / apply pricing suggestion).
     */
    function _setCurrencyInput(elId, num) {
        const el = document.getElementById(elId);
        if (!el) return;
        const n = Number(num) || 0;
        el.value = n.toLocaleString("vi-VN");
        el.dataset.rawValue = String(n);
    }

    function _formatDate(str) {
        if (!str) return "--";
        const d = new Date(str);
        if (isNaN(d)) return str;
        return d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
    }

    function _hienThiGioiTinh(g) {
        if (g === "Nam")    return '<span style="color:#38bdf8"><i class="fa-solid fa-mars"></i> Nam</span>';
        if (g === "Nữ")     return '<span style="color:#f472b6"><i class="fa-solid fa-venus"></i> Nữ</span>';
        return '<span style="color:#00ff88"><i class="fa-solid fa-venus-mars"></i> Cả hai</span>';
    }

    function _hienThiTrinhDo(slot) {
        const td = slot.yeu_cau_trinh_do || {};
        const ml = (td.nam || []).join(", ");
        const fl = (td.nu  || []).join(", ");
        if (slot.gioi_tinh_can === "Cả hai") return `Nam: ${ml || "--"} | Nữ: ${fl || "--"}`;
        if (slot.gioi_tinh_can === "Nữ") return fl || "--";
        return ml || "--";
    }

    /* ═══════════════════════════════════════════════════
     * 18. GĐ4A — DASHBOARD DOANH THU HOST
     * Tab "📊 Doanh Thu" trong host console
     * Cache TTL 60 giây — switch tab lần 2 không fetch lại
     * ═══════════════════════════════════════════════════ */
    let _doanhThuCache = null;       // { ts: timestamp, data: [...] }
    let _doanhThuAllSlots = null;    // cache dat_slot

    window.chuyenTabDoanhThu = async function () {
        // Đổi active tab
        document.querySelectorAll(".hs-tab-btn").forEach(b => b.classList.remove("active"));
        const tabBtn = document.getElementById("tabBtnDoanhThu");
        if (tabBtn) tabBtn.classList.add("active");

        document.querySelectorAll(".hs-tab-panel").forEach(p => p.style.display = "none");
        const panel = document.getElementById("tabDoanhThu");
        if (panel) panel.style.display = "block";

        await _taiDoanhThuHost();
    };

    /* ── [7] Tab Hướng Dẫn Sử Dụng ── */
    window.chuyenTabHuongDan = function () {
        document.querySelectorAll(".hs-tab-btn").forEach(b => b.classList.remove("active"));
        const tabBtn = document.getElementById("tabBtnHuongDan");
        if (tabBtn) tabBtn.classList.add("active");

        document.querySelectorAll(".hs-tab-panel").forEach(p => p.style.display = "none");
        const panel = document.getElementById("tabHuongDan");
        if (panel) panel.style.display = "block";
    };

    async function _taiDoanhThuHost(tuNgay, denNgay) {
        const panel = document.getElementById("tabDoanhThu");
        if (!panel) return;

        // Cache check (60s TTL, chỉ dùng khi không có filter)
        const now = Date.now();
        if (!tuNgay && !denNgay && _doanhThuCache && (now - _doanhThuCache.ts < 60000)) {
            _renderDoanhThu(_doanhThuCache.danhSachCa, _doanhThuCache.slotMap, tuNgay, denNgay);
            return;
        }

        panel.innerHTML = `<div style="text-align:center;padding:32px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin fa-2x"></i><br><br>Đang tải dữ liệu doanh thu...</div>`;

        try {
            const [danhSachCa, allDatSlot] = await Promise.all([
                window.dbEngine.doc("ca_dau", {
                    eq: { ma_key_host: window.currentHostKey },
                    order: "ngay_danh.desc"
                }),
                window.dbEngine.doc("dat_slot").catch(() => [])
            ]);

            // Nhóm dat_slot theo id_ca_dau
            const slotMap = {};
            allDatSlot.forEach(s => {
                if (!slotMap[s.id_ca_dau]) slotMap[s.id_ca_dau] = [];
                slotMap[s.id_ca_dau].push(s);
            });

            // Lưu cache
            _doanhThuCache   = { ts: now, danhSachCa, slotMap };
            _doanhThuAllSlots = slotMap;

            _renderDoanhThu(danhSachCa, slotMap, tuNgay, denNgay);
        } catch (e) {
            if (panel) panel.innerHTML = `<div style="text-align:center;padding:32px;color:#ef4444;">
                Lỗi tải dữ liệu. Vui lòng kiểm tra kết nối và thử lại.</div>`;
        }
    }

    function _renderDoanhThu(danhSachCa, slotMap, tuNgay, denNgay) {
        const panel = document.getElementById("tabDoanhThu");
        if (!panel) return;

        // Filter theo thời gian nếu có
        let caDauHienThi = danhSachCa;
        if (tuNgay || denNgay) {
            caDauHienThi = danhSachCa.filter(c => {
                const ngay = c.ngay_danh;
                if (tuNgay && ngay < tuNgay) return false;
                if (denNgay && ngay > denNgay) return false;
                return true;
            });
        } else {
            // Mặc định: lọc theo bộ lọc đang chọn trên UI
            const filterEl = document.getElementById("doanhThuFilter");
            if (filterEl) {
                const filter = filterEl.value;
                const now = new Date();
                if (filter === "week") {
                    const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
                    const monStr = mon.toLocaleDateString("sv-SE");
                    caDauHienThi = danhSachCa.filter(c => c.ngay_danh >= monStr);
                } else if (filter === "month") {
                    const monStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
                    caDauHienThi = danhSachCa.filter(c => c.ngay_danh >= monStr);
                } else if (filter === "year") {
                    const yearStr = `${now.getFullYear()}-01-01`;
                    caDauHienThi = danhSachCa.filter(c => c.ngay_danh >= yearStr);
                }
            }
        }

        // Tính metrics
        let tongCa = caDauHienThi.length;
        let tongCaChotted = 0, tongKhach = 0, tongDoanhThu = 0, tongLoiLo = 0;

        const doanhThuRows = caDauHienThi.map(c => {
            const slots = slotMap[c.id] || [];
            const slotsDiDanh = slots.filter(s => s.trang_thai_di_danh === "Đã tham gia");
            const soKhach    = slotsDiDanh.length;
            // Chỉ tính tiền từ khách ĐÃ THANH TOÁN (da_thanh_toan=true)
            const doanhThuVe = slotsDiDanh
                .filter(s => !!s.da_thanh_toan)
                .reduce((sum, s) =>
                    sum + (s.gioi_tinh === "female" ? (c.gia_nu || 0) : (c.gia_nam || 0)), 0);
            // Cộng thêm tiền thu từ bùng kèo (phạt bùng)
            const tienBungThu = slots
                .filter(s => s.trang_thai_di_danh === "Bùng kèo")
                .reduce((sum, s) => sum + (s.tien_thu_bung || 0), 0);
            const tongThu = doanhThuVe + tienBungThu;
            // Tổng chi phí nội bộ (sân + cầu + nước)
            const tongChi = (c.chi_phi_san_co_dinh || 0) + (c.tong_chi_phi_cau || 0) + (c.chi_phi_nuoc_khac || 0);
            const loiLo   = tongThu - tongChi;
            if (c.da_chot_ca) {
                tongCaChotted++;
                tongKhach    += soKhach;
                tongDoanhThu += tongThu;
                tongLoiLo    += loiLo;
            }
            return { ...c, soKhach, doanhThu: tongThu, tongThu, tongChi, loiLo };
        });

        // Chỉ hiện ca đã chốt trong bảng lịch sử
        const caChoTted = doanhThuRows.filter(c => c.da_chot_ca);

        panel.innerHTML = `
        <!-- Bộ lọc thời gian -->
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:20px;">
            <span style="color:#94a3b8;font-size:0.85rem;">Xem theo:</span>
            <select id="doanhThuFilter" class="form-control" style="width:auto;min-width:160px;font-size:0.85rem;"
                onchange="_locDoanhThuTheoFilter()">
                <option value="all">Tất cả thời gian</option>
                <option value="week">Tuần này</option>
                <option value="month">Tháng này</option>
                <option value="year">Năm nay</option>
            </select>
            <span style="color:#64748b;font-size:0.78rem;">hoặc</span>
            <input type="date" id="doanhThuTuNgay" class="form-control" style="width:auto;font-size:0.85rem;"
                placeholder="Từ ngày">
            <span style="color:#64748b;font-size:0.78rem;">→</span>
            <input type="date" id="doanhThuDenNgay" class="form-control" style="width:auto;font-size:0.85rem;"
                placeholder="Đến ngày">
            <button class="btn-mini btn-mini-cyan" onclick="_locDoanhThuKhoangNgay()" style="font-size:0.82rem;">
                <i class="fa-solid fa-filter"></i> Lọc
            </button>
        </div>

        <!-- 4 Metric Cards -->
        <div class="stats-grid-4" style="margin-bottom:24px;">
            <div class="stat-card">
                <div class="stat-icon" style="color:#64748b;"><i class="fa-solid fa-calendar-days"></i></div>
                <div class="stat-value" style="font-size:1.6rem;">${tongCa}</div>
                <div class="stat-label">Tổng Ca Đấu</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="color:#00ff88;"><i class="fa-solid fa-lock"></i></div>
                <div class="stat-value" style="font-size:1.6rem;color:#00ff88;">${tongCaChotted}</div>
                <div class="stat-label">Ca Đã Chốt</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="color:#60a5fa;"><i class="fa-solid fa-users"></i></div>
                <div class="stat-value" style="font-size:1.6rem;color:#60a5fa;">${tongKhach}</div>
                <div class="stat-label">Tổng Khách Tham Gia</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="color:#f59e0b;"><i class="fa-solid fa-coins"></i></div>
                <div class="stat-value" style="font-size:1.3rem;color:#f59e0b;">${_formatVND(tongDoanhThu)}</div>
                <div class="stat-label">Tổng Thu Thực Tế</div>
                <div style="margin-top:5px;font-size:0.78rem;font-weight:700;color:${tongLoiLo >= 0 ? '#00ff88' : '#f87171'};">
                    Lời/Lỗ: ${tongLoiLo >= 0 ? '+' : '−'}${_formatVND(Math.abs(tongLoiLo))}
                </div>
            </div>
        </div>

        <!-- Bảng lịch sử ca đã chốt -->
        <div style="margin-bottom:12px;">
            <h4 style="color:#e2e8f0;font-size:0.9rem;display:flex;align-items:center;gap:8px;">
                <i class="fa-solid fa-table-list" style="color:#00ff88;"></i>
                Lịch Sử Ca Đã Chốt
                <span style="background:#1e3a5f;color:#94a3b8;font-size:0.72rem;padding:2px 8px;border-radius:10px;">${caChoTted.length} ca</span>
            </h4>
        </div>
        ${caChoTted.length === 0 ? `
        <div style="text-align:center;padding:32px;color:#64748b;border:1px dashed #1e3a5f;border-radius:10px;">
            <i class="fa-solid fa-inbox fa-2x" style="margin-bottom:12px;opacity:0.4;"></i><br>
            Chưa có ca nào được chốt trong khoảng thời gian này.
        </div>` : `
        <div style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;">
        <table class="hs-table" style="min-width:860px;">
            <thead><tr>
                <th>Ngày</th>
                <th>Tên Sân</th>
                <th style="text-align:center;">Khách</th>
                <th>Tổng Chi</th>
                <th>Tổng Thu</th>
                <th>Lời / Lỗ</th>
                <th>Thao Tác</th>
            </tr></thead>
            <tbody>
                ${caChoTted.map((c, i) => {
                    const loiLoColor  = (c.loiLo || 0) >= 0 ? "#00ff88" : "#f87171";
                    const loiLoPrefix = (c.loiLo || 0) >= 0 ? "+" : "−";
                    const loiLoAbs    = _formatVND(Math.abs(c.loiLo || 0));
                    const chiSan      = _formatVND(c.chi_phi_san_co_dinh || 0);
                    const chiCau      = _formatVND(c.tong_chi_phi_cau    || 0);
                    const chiNuoc     = _formatVND(c.chi_phi_nuoc_khac   || 0);
                    return `<tr style="${i % 2 === 0 ? "" : "background:rgba(255,255,255,0.02)"}">
                    <td style="white-space:nowrap;">
                        <div style="font-weight:600;font-size:0.85rem;">${_formatDate(c.ngay_danh)}</div>
                        <div style="font-size:0.72rem;color:#94a3b8;">${c.gio_bat_dau||""} – ${c.gio_ket_thuc||""}</div>
                    </td>
                    <td>
                        <div style="font-weight:600;font-size:0.82rem;">${c.ten_san || "--"}</div>
                        <div style="font-size:0.7rem;color:#64748b;">${c.quan_huyen||""}, ${c.tinh_thanh||""}</div>
                    </td>
                    <td style="text-align:center;">
                        <span style="font-size:1.1rem;font-weight:700;color:#60a5fa;">${c.soKhach}</span>
                        <span style="font-size:0.72rem;color:#64748b;"> người</span>
                    </td>
                    <td style="white-space:nowrap;">
                        <div style="font-size:0.85rem;font-weight:700;color:#e2e8f0;">${_formatVND(c.tongChi || 0)}</div>
                        <div style="font-size:0.68rem;color:#64748b;margin-top:3px;line-height:1.65;">
                            🏟 Sân: ${chiSan}<br>🏸 Cầu: ${chiCau}<br>💧 Khác: ${chiNuoc}
                        </div>
                    </td>
                    <td>
                        <span style="font-size:0.9rem;font-weight:700;color:#f59e0b;">${_formatVND(c.tongThu || 0)}</span>
                    </td>
                    <td>
                        <span style="font-size:1rem;font-weight:700;color:${loiLoColor};">${loiLoPrefix}${loiLoAbs}</span>
                    </td>
                    <td>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <button class="btn-mini btn-mini-cyan" onclick="window.xemChiTietCaDau('${c.id}')" title="Xem chi tiết ca đấu">
                                <i class="fa-solid fa-eye"></i> Chi tiết
                            </button>
                            <button class="btn-mini btn-mini-gold" onclick="window.xuatCSVCaDau('${c.id}')" title="Xuất CSV">
                                <i class="fa-solid fa-file-csv"></i> CSV
                            </button>
                            <button class="btn-mini" style="background:rgba(148,163,184,0.15);color:#94a3b8;border:1px solid #334155;"
                                onclick="window.inCaDau('${c.id}')" title="In danh sách">
                                <i class="fa-solid fa-print"></i> In
                            </button>
                        </div>
                    </td>
                </tr>`;
                }).join("")}
            </tbody>
        </table>
        </div>`}`;

        // Giữ bộ lọc đã chọn
        const filterEl = document.getElementById("doanhThuFilter");
        if (filterEl && !tuNgay && !denNgay) { /* đã đặt mặc định "all" */ }
    }

    window._locDoanhThuTheoFilter = function () {
        // Xóa cache để re-render với filter mới
        _doanhThuCache = null;
        _taiDoanhThuHost();
    };

    window._locDoanhThuKhoangNgay = function () {
        const tuNgay  = document.getElementById("doanhThuTuNgay")?.value;
        const denNgay = document.getElementById("doanhThuDenNgay")?.value;
        _taiDoanhThuHost(tuNgay || undefined, denNgay || undefined);
    };

    /* ═══════════════════════════════════════════════════
     * [3] CHI TIẾT CA ĐẤU — modal xem đầy đủ thu/chi + cầu + khách
     * Gọi từ: nút "Chi tiết" trong bảng ca đấu + tab Doanh Thu
     * ═══════════════════════════════════════════════════ */
    window.xemChiTietCaDau = async function (caId) {
        const modal = document.getElementById("modal-ca-detail");
        if (!modal) { window.hienToast("Lỗi", "Không tìm thấy modal chi tiết ca.", "danger"); return; }
        const body = document.getElementById("modal-ca-detail-body");
        if (body) body.innerHTML = `<div style="text-align:center;padding:40px;color:#64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><br><br>Đang tải...</div>`;
        modal.classList.remove("hidden");
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";

        try {
            const [caList, slots] = await Promise.all([
                window.dbEngine.doc("ca_dau", { eq: { id: caId } }),
                window.dbEngine.doc("dat_slot", { eq: { id_ca_dau: caId } }).catch(() => [])
            ]);
            const ca = caList[0];
            if (!ca) {
                if (body) body.innerHTML = `<p style="color:#f87171;text-align:center;padding:32px;">Không tìm thấy ca đấu.</p>`;
                return;
            }

            // Phân loại slot
            const slotsDiDanh = slots.filter(s => s.trang_thai_di_danh === "Đã tham gia");
            const slotsBung   = slots.filter(s => s.trang_thai_di_danh === "Bùng kèo");
            const slotsHuy    = slots.filter(s => s.trang_thai_di_danh === "Khách hủy");
            const slotsCho    = slots.filter(s => !["Đã tham gia","Bùng kèo","Khách hủy"].includes(s.trang_thai_di_danh));

            // Tính toán tài chính — chỉ cộng tiền khi Đã tham gia VÀ da_thanh_toan=true
            const slotsDaTra   = slotsDiDanh.filter(s => !!s.da_thanh_toan);
            const slotsChưaTra = slotsDiDanh.filter(s => !s.da_thanh_toan);
            const doanhThuVe  = slotsDaTra.reduce((sum, s) =>
                sum + (s.gioi_tinh === "female" ? (ca.gia_nu || 0) : (ca.gia_nam || 0)), 0);
            const tienBung    = slotsBung.reduce((sum, s) => sum + (s.tien_thu_bung || 0), 0);
            const tongThu     = doanhThuVe + tienBung;
            const tongChi     = (ca.chi_phi_san_co_dinh || 0) + (ca.tong_chi_phi_cau || 0) + (ca.chi_phi_nuoc_khac || 0);
            const loiLo       = tongThu - tongChi;
            const loiLoColor  = loiLo >= 0 ? "#00ff88" : "#f87171";
            const loiLoPrefix = loiLo >= 0 ? "+" : "−";

            // Bảng cầu tiêu thụ
            const cauList  = Array.isArray(ca.loai_cau_su_dung) ? ca.loai_cau_su_dung : [];
            const _thStyle = "padding:8px 10px;text-align:left;font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #1e3a5f;background:rgba(15,30,53,0.6);";
            const _tdStyle = "padding:9px 10px;font-size:0.8rem;color:#e2e8f0;border-bottom:1px solid rgba(30,58,95,0.5);";
            const cauHTML  = cauList.length === 0
                ? `<div style="color:#64748b;text-align:center;padding:14px;border:1px dashed rgba(30,58,95,0.8);border-radius:8px;font-size:0.82rem;">Không có dữ liệu cầu.</div>`
                : `<div style="overflow-x:auto;border-radius:10px;border:1px solid #1e3a5f;"><table style="width:100%;min-width:380px;font-size:0.8rem;border-collapse:collapse;">
                    <thead><tr>
                        <th style="${_thStyle}">Loại cầu</th>
                        <th style="${_thStyle}">Quy cách</th>
                        <th style="${_thStyle}text-align:right;">Giá/quả</th>
                        <th style="${_thStyle}text-align:right;">Số lượng</th>
                        <th style="${_thStyle}text-align:right;">Thành tiền</th>
                    </tr></thead>
                    <tbody>${cauList.map(cb => `<tr style="transition:background .15s;" onmouseover="this.style.background='rgba(30,58,95,0.4)'" onmouseout="this.style.background=''">
                        <td style="${_tdStyle}font-weight:600;">${cb.ten || "--"}</td>
                        <td style="${_tdStyle}color:#94a3b8;">${cb.don_vi || cb.quy_cach || "--"}</td>
                        <td style="${_tdStyle}text-align:right;color:#94a3b8;">${_formatVND(cb.gia_qua || 0)}</td>
                        <td style="${_tdStyle}text-align:right;">${cb.so_luong || 0} quả</td>
                        <td style="${_tdStyle}text-align:right;color:#f59e0b;font-weight:600;">${_formatVND(cb.thanh_tien || 0)}</td>
                    </tr>`).join("")}</tbody>
                </table></div>`;

            // Bảng khách — thêm cột Thanh Toán, logic Tiền theo da_thanh_toan
            const guestHTML = slots.length === 0
                ? `<div style="color:#64748b;text-align:center;padding:14px;border:1px dashed rgba(30,58,95,0.8);border-radius:8px;font-size:0.82rem;">Không có khách đăng ký.</div>`
                : `<div style="overflow-x:auto;border-radius:10px;border:1px solid #1e3a5f;"><table style="width:100%;min-width:440px;font-size:0.8rem;border-collapse:collapse;">
                    <thead><tr>
                        <th style="${_thStyle}">Tên khách</th>
                        <th style="${_thStyle}">SĐT</th>
                        <th style="${_thStyle}text-align:center;">GT</th>
                        <th style="${_thStyle}text-align:center;">Trạng thái</th>
                        <th style="${_thStyle}text-align:center;">Thanh Toán</th>
                        <th style="${_thStyle}text-align:right;">Tiền</th>
                    </tr></thead>
                    <tbody>${slots.map(s => {
                        const gt    = s.gioi_tinh === "female" ? "Nữ" : "Nam";
                        const gtBg  = s.gioi_tinh === "female" ? "rgba(244,114,182,0.12)" : "rgba(96,165,250,0.12)";
                        const gtClr = s.gioi_tinh === "female" ? "#f472b6" : "#60a5fa";
                        const tt    = s.trang_thai_di_danh || "Chờ đánh";
                        const ttClr = tt === "Đã tham gia" ? "#00ff88" : tt === "Bùng kèo" ? "#fb923c" : tt === "Khách hủy" ? "#f87171" : "#94a3b8";
                        const ttBg  = tt === "Đã tham gia" ? "rgba(0,255,136,0.1)" : tt === "Bùng kèo" ? "rgba(251,146,60,0.1)" : tt === "Khách hủy" ? "rgba(239,68,68,0.1)" : "rgba(100,116,139,0.1)";
                        const ttBd  = tt === "Đã tham gia" ? "rgba(0,255,136,0.25)" : tt === "Bùng kèo" ? "rgba(251,146,60,0.25)" : tt === "Khách hủy" ? "rgba(239,68,68,0.25)" : "rgba(100,116,139,0.2)";

                        // Cột Thanh Toán — badge nhỏ theo trạng thái
                        let ttBadge;
                        if (tt === "Đã tham gia") {
                            ttBadge = s.da_thanh_toan
                                ? `<span style="background:rgba(6,78,59,0.5);color:#34d399;border:1px solid rgba(52,211,153,0.3);padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:700;white-space:nowrap;">Đã trả</span>`
                                : `<span style="background:rgba(51,65,85,0.4);color:#94a3b8;border:1px solid rgba(100,116,139,0.25);padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:700;white-space:nowrap;">Chưa trả</span>`;
                        } else if (tt === "Bùng kèo") {
                            const pb = s.tien_thu_bung || 0;
                            ttBadge = pb > 0
                                ? `<span style="background:rgba(251,146,60,0.12);color:#fb923c;border:1px solid rgba(251,146,60,0.3);padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:700;white-space:nowrap;">Phạt ${_formatVND(pb)}</span>`
                                : `<span style="background:rgba(51,65,85,0.3);color:#64748b;padding:2px 8px;border-radius:12px;font-size:0.7rem;white-space:nowrap;">0đ</span>`;
                        } else {
                            ttBadge = `<span style="color:#475569;font-size:0.72rem;">—</span>`;
                        }

                        // Cột Tiền — chỉ hiển thị tiền thực sự thu được
                        let tienText = `<span style="color:#475569;">—</span>`;
                        if (tt === "Đã tham gia" && s.da_thanh_toan) {
                            const gia = s.gioi_tinh === "female" ? (ca.gia_nu || 0) : (ca.gia_nam || 0);
                            tienText = `<span style="color:#f59e0b;font-weight:600;">${_formatVND(gia)}</span>`;
                        } else if (tt === "Đã tham gia" && !s.da_thanh_toan) {
                            const gia = s.gioi_tinh === "female" ? (ca.gia_nu || 0) : (ca.gia_nam || 0);
                            tienText = `<span style="color:#475569;text-decoration:line-through;font-size:0.73rem;">${_formatVND(gia)}</span>`;
                        } else if (tt === "Bùng kèo" && s.tien_thu_bung > 0) {
                            tienText = `<span style="color:#fb923c;font-weight:600;">${_formatVND(s.tien_thu_bung)}</span>`;
                        }
                        return `<tr style="transition:background .15s;" onmouseover="this.style.background='rgba(30,58,95,0.35)'" onmouseout="this.style.background=''">
                            <td style="${_tdStyle}font-weight:600;">${s.ten_khach || "—"}</td>
                            <td style="${_tdStyle}font-family:monospace;font-size:0.75rem;color:#64748b;">${s.sdt_khach || "—"}</td>
                            <td style="${_tdStyle}text-align:center;"><span style="background:${gtBg};color:${gtClr};padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:600;">${gt}</span></td>
                            <td style="${_tdStyle}text-align:center;"><span style="background:${ttBg};color:${ttClr};border:1px solid ${ttBd};padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:600;">${tt}</span></td>
                            <td style="${_tdStyle}text-align:center;">${ttBadge}</td>
                            <td style="${_tdStyle}text-align:right;">${tienText}</td>
                        </tr>`;
                    }).join("")}</tbody>
                </table></div>`;

            if (body) body.innerHTML = `
                <!-- ── THÔNG TIN CA ── -->
                <div style="background:rgba(0,255,136,0.05);border:1px solid rgba(0,255,136,0.18);border-radius:12px;padding:16px 20px;margin-bottom:20px;">
                    <div style="font-size:1.05rem;font-weight:700;color:#e2e8f0;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00ff88" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        ${ca.ten_san || "—"}
                        <span style="font-size:0.72rem;color:#64748b;font-weight:400;">${ca.quan_huyen ? ca.quan_huyen + ", " : ""}${ca.tinh_thanh || ""}</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:7px;">
                        <div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:#94a3b8;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            ${_formatDate(ca.ngay_danh)}
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:#94a3b8;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            ${ca.gio_bat_dau || "—"} – ${ca.gio_ket_thuc || "—"} <span style="color:#64748b;margin-left:4px;">(${ca.so_gio_choi || "?"} giờ)</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:#94a3b8;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                            ${ca.so_san_mo || 1} sân${ca.so_san_cu_the ? " — " + ca.so_san_cu_the : ""}
                        </div>
                        ${ca.dia_chi_san ? `<div style="display:flex;align-items:flex-start;gap:8px;font-size:0.82rem;color:#94a3b8;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            <span>${ca.dia_chi_san}</span>
                        </div>` : ""}
                    </div>
                </div>

                <!-- ── 3 CARD TÀI CHÍNH ── -->
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
                    <div style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:14px 12px;text-align:center;">
                        <div style="display:flex;align-items:center;justify-content:center;gap:5px;margin-bottom:8px;">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            <span style="font-size:0.62rem;color:#f87171;font-weight:700;text-transform:uppercase;letter-spacing:.8px;">TỔNG CHI</span>
                        </div>
                        <div style="font-size:1.05rem;font-weight:800;color:#fca5a5;margin-bottom:8px;">${_formatVND(tongChi)}</div>
                        <div style="font-size:0.68rem;color:#475569;line-height:2;border-top:1px solid rgba(239,68,68,0.15);padding-top:8px;">
                            <div style="display:flex;justify-content:space-between;"><span>Thuê sân</span><span style="color:#64748b;">${_formatVND(ca.chi_phi_san_co_dinh||0)}</span></div>
                            <div style="display:flex;justify-content:space-between;"><span>Mua cầu</span><span style="color:#64748b;">${_formatVND(ca.tong_chi_phi_cau||0)}</span></div>
                            <div style="display:flex;justify-content:space-between;"><span>Chi phí khác</span><span style="color:#64748b;">${_formatVND(ca.chi_phi_nuoc_khac||0)}</span></div>
                        </div>
                    </div>
                    <div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:14px 12px;text-align:center;">
                        <div style="display:flex;align-items:center;justify-content:center;gap:5px;margin-bottom:8px;">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                            <span style="font-size:0.62rem;color:#f59e0b;font-weight:700;text-transform:uppercase;letter-spacing:.8px;">TỔNG THU</span>
                        </div>
                        <div style="font-size:1.05rem;font-weight:800;color:#fcd34d;margin-bottom:8px;">${_formatVND(tongThu)}</div>
                        <div style="font-size:0.68rem;color:#475569;line-height:2;border-top:1px solid rgba(245,158,11,0.15);padding-top:8px;">
                            <div style="display:flex;justify-content:space-between;"><span>Tham gia (${slotsDaTra.length}/${slotsDiDanh.length})</span><span style="color:#64748b;">${_formatVND(doanhThuVe)}</span></div>
                            <div style="display:flex;justify-content:space-between;"><span>Phạt bùng (${slotsBung.length})</span><span style="color:#64748b;">${_formatVND(tienBung)}</span></div>
                        </div>
                    </div>
                    <div style="background:rgba(${loiLo >= 0 ? "0,255,136" : "239,68,68"},0.07);border:1px solid rgba(${loiLo >= 0 ? "0,255,136" : "239,68,68"},0.2);border-radius:12px;padding:14px 12px;text-align:center;">
                        <div style="display:flex;align-items:center;justify-content:center;gap:5px;margin-bottom:8px;">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${loiLoColor}" stroke-width="2.5" stroke-linecap="round"><polyline points="${loiLo >= 0 ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}"/></svg>
                            <span style="font-size:0.62rem;color:${loiLoColor};font-weight:700;text-transform:uppercase;letter-spacing:.8px;">LỜI / LỖ</span>
                        </div>
                        <div style="font-size:1.25rem;font-weight:800;color:${loiLoColor};margin-bottom:8px;">${loiLoPrefix}${_formatVND(Math.abs(loiLo))}</div>
                        <div style="font-size:0.72rem;color:${loiLo >= 0 ? "#34d399" : "#fdba74"};border-top:1px solid rgba(${loiLo >= 0 ? "0,255,136" : "239,68,68"},0.15);padding-top:10px;font-weight:600;">
                            ${loiLo >= 0 ? "Buổi này có lời" : "Buổi này bị lỗ"}
                        </div>
                    </div>
                </div>

                <!-- ── BADGE THỐNG KÊ KHÁCH ── -->
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:20px;padding:10px 14px;background:rgba(15,30,53,0.5);border:1px solid rgba(30,58,95,0.7);border-radius:10px;">
                    <span style="font-size:0.68rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Khách:</span>
                    <span style="background:rgba(0,255,136,0.1);color:#00ff88;border:1px solid rgba(0,255,136,0.25);padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;">Tham gia: ${slotsDiDanh.length} (đã trả: ${slotsDaTra.length})</span>
                    <span style="background:rgba(251,146,60,0.1);color:#fb923c;border:1px solid rgba(251,146,60,0.25);padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;">Bùng kèo: ${slotsBung.length}</span>
                    <span style="background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.25);padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;">Khách hủy: ${slotsHuy.length}</span>
                    ${slotsCho.length > 0 ? `<span style="background:rgba(100,116,139,0.1);color:#94a3b8;border:1px solid rgba(100,116,139,0.2);padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;">Chờ đánh: ${slotsCho.length}</span>` : ""}
                </div>

                <!-- ── BẢNG CẦU TIÊU THỤ ── -->
                <div style="margin-bottom:20px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                        <div style="width:4px;height:16px;background:#00ff88;border-radius:2px;flex-shrink:0;"></div>
                        <span style="font-size:0.82rem;font-weight:700;color:#e2e8f0;">Cầu tiêu thụ</span>
                        <span style="font-size:0.72rem;color:#64748b;">${cauList.length} loại</span>
                    </div>
                    ${cauHTML}
                </div>

                <!-- ── BẢNG KHÁCH ── -->
                <div>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                        <div style="width:4px;height:16px;background:#60a5fa;border-radius:2px;flex-shrink:0;"></div>
                        <span style="font-size:0.82rem;font-weight:700;color:#e2e8f0;">Danh sách khách</span>
                        <span style="font-size:0.72rem;color:#64748b;">${slots.length} người</span>
                    </div>
                    ${guestHTML}
                </div>`;

        } catch(e) {
            console.error("xemChiTietCaDau error:", e);
            if (body) body.innerHTML = `<p style="color:#f87171;text-align:center;padding:32px;">Lỗi tải dữ liệu: ${(e.message||"").slice(0,60)}</p>`;
        }
    };

    window.dongModalCaDetail = function () {
        const modal = document.getElementById("modal-ca-detail");
        if (modal) { modal.style.display = "none"; modal.classList.add("hidden"); }
        document.body.style.overflow = "";
    };

    /* ═══════════════════════════════════════════════════
     * [1] HỒ SƠ KHÁCH — click tên khách trong DS Khách
     *     Mở modal xem lịch sử, stats, đánh giá của khách tại sân
     * ═══════════════════════════════════════════════════ */
    window.xemHoSoKhach = async function (sdt, ten, _currentCaId) {
        const modal = document.getElementById("modal-ho-so-khach");
        if (!modal) { window.hienToast("Lỗi", "Không tìm thấy modal hồ sơ khách.", "danger"); return; }
        // Lưu sdt + ten vào modal dataset để huySlotTuHoSo có thể reload
        modal.dataset.sdt = sdt;
        modal.dataset.ten = ten || "";
        const body = document.getElementById("modal-ho-so-khach-body");
        if (body) body.innerHTML = `<div style="text-align:center;padding:40px;color:#64748b;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><br><br>Đang tải hồ sơ...</div>`;
        modal.classList.remove("hidden");
        document.body.style.overflow = "hidden";

        try {
            // Fetch song song: tất cả slot của sdt + ca của host hiện tại + reviews về sdt này + reviews do sdt gửi
            const [allSlots, myCaDau, reviews, guestSentReviews] = await Promise.all([
                window.dbEngine.doc("dat_slot", { eq: { sdt_khach: sdt } }).catch(() => []),
                window.dbEngine.doc("ca_dau",   { eq: { ma_key_host: window.currentHostKey } }).catch(() => []),
                window.dbEngine.doc("danh_gia_tin_dung", {
                    eq: { sdt_nguoi_bi_danh_gia: sdt, loai_danh_gia: "HostToGuest" }
                }).catch(() => []),
                window.dbEngine.doc("danh_gia_tin_dung", {
                    eq: { sdt_nguoi_viet: sdt }
                }).then(r => r.filter(x => x.loai_danh_gia === "GuestToHost")).catch(() => [])
            ]);

            // Chỉ xem slot liên quan đến ca của HOST này
            const caMap = {};
            myCaDau.forEach(c => { caMap[c.id] = c; });
            const hostSlots   = allSlots.filter(s => caMap[s.id_ca_dau]);
            const sortedSlots = [...hostSlots].sort((a, b) =>
                new Date(b.thoi_gian_dat || 0) - new Date(a.thoi_gian_dat || 0));

            // Stats
            const totalSessions = hostSlots.length;
            const attended  = hostSlots.filter(s => s.trang_thai_di_danh === "Đã tham gia").length;
            const bung      = hostSlots.filter(s => s.trang_thai_di_danh === "Bùng kèo").length;

            // Tổng tiền đã chi (chỉ ca chốt + tham gia)
            const tongChiTieu = hostSlots
                .filter(s => s.trang_thai_di_danh === "Đã tham gia")
                .reduce((sum, s) => {
                    const ca = caMap[s.id_ca_dau];
                    if (!ca?.da_chot_ca) return sum;
                    return sum + (s.gioi_tinh === "female" ? (ca.gia_nu || 0) : (ca.gia_nam || 0));
                }, 0);

            // Sao TB từ TẤT CẢ reviews HostToGuest về sdt này
            const hostPhone = window.currentHostInfo?.sdt_host || window.currentHostKey;
            const myReviews = reviews.filter(r => r.sdt_nguoi_viet === hostPhone);
            const allAvgStars = reviews.length > 0
                ? (reviews.reduce((s, r) => s + (r.so_sao || 0), 0) / reviews.length).toFixed(1)
                : null;
            const allAvgNum = parseFloat(allAvgStars || 0);
            const starStr = allAvgStars
                ? `<span style="color:#fbbf24;font-size:0.95rem;">${"★".repeat(Math.round(allAvgNum))}${"☆".repeat(5-Math.round(allAvgNum))}</span>
                   <span style="color:#94a3b8;font-size:0.75rem;margin-left:4px;">${allAvgStars}/5 (${reviews.length} đánh giá)</span>`
                : `<span style="font-size:0.78rem;color:#64748b;">Chưa có đánh giá</span>`;

            // Render từng dòng lịch sử
            const historyRows = sortedSlots.map(s => {
                const ca  = caMap[s.id_ca_dau];
                const tt  = s.trang_thai_di_danh || "Chờ đánh";
                const ttClr = tt === "Đã tham gia" ? "#00ff88" : tt === "Bùng kèo" ? "#fb923c" : tt === "Khách hủy" ? "#f87171" : "#94a3b8";
                const caInfo = ca
                    ? `<div style="font-size:0.8rem;font-weight:600;color:#e2e8f0;">${ca.ten_san || "—"}</div>
                       <div style="font-size:0.68rem;color:#64748b;">${_formatDate(ca.ngay_danh)} ${ca.gio_bat_dau||""}</div>`
                    : `<em style="color:#64748b;font-size:0.75rem;">Ca đấu khác</em>`;
                let tienText;
                if (tt === "Đã tham gia" && ca?.da_chot_ca) {
                    const gia = s.gioi_tinh === "female" ? (ca.gia_nu || 0) : (ca.gia_nam || 0);
                    tienText = `<span style="color:#f59e0b;">${_formatVND(gia)}</span>`;
                } else if (tt === "Bùng kèo" && (s.tien_thu_bung || 0) > 0) {
                    tienText = `<span style="color:#fb923c;">${_formatVND(s.tien_thu_bung)}</span>`;
                } else if (tt === "Đã tham gia") {
                    tienText = `<span style="color:#64748b;font-size:0.7rem;">Chờ chốt</span>`;
                } else {
                    tienText = `<span style="color:#475569;">—</span>`;
                }
                const canCancel = ca && !ca.da_chot_ca && (tt === "Chờ đánh" || tt === "Đã tham gia");
                const tenEsc    = (ten || "").replace(/'/g, "\\x27");
                const cancelBtn = canCancel
                    ? `<button onclick="window.huySlotTuHoSo('${s.id}','${sdt}','${tenEsc}')"
                               style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;
                                      padding:3px 10px;border-radius:6px;cursor:pointer;font-size:0.72rem;font-family:inherit;">
                           Hủy slot
                       </button>`
                    : `<span style="color:#475569;font-size:0.72rem;">—</span>`;
                return `<tr style="border-bottom:1px solid rgba(30,58,95,0.4);">
                    <td style="padding:8px;">${caInfo}</td>
                    <td style="padding:8px;text-align:center;"><span style="color:${ttClr};font-weight:600;font-size:0.78rem;">${tt}</span></td>
                    <td style="padding:8px;text-align:right;">${tienText}</td>
                    <td style="padding:8px;text-align:center;">${cancelBtn}</td>
                </tr>`;
            }).join("");

            // Render tất cả đánh giá HostToGuest về khách này
            const allReviewsHTML = reviews.length === 0
                ? `<p style="color:#64748b;text-align:center;padding:12px;border:1px dashed #1e3a5f;border-radius:8px;font-size:0.82rem;">Chưa có đánh giá nào từ chủ sân.</p>`
                : `<div style="display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto;">
                    ${reviews.map(r => `
                    <div style="background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.18);border-radius:8px;padding:10px 12px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                            <span style="color:#fbbf24;font-size:0.9rem;">${"★".repeat(r.so_sao||0)}${"☆".repeat(5-(r.so_sao||0))}</span>
                            <span style="font-size:0.68rem;color:#94a3b8;">${r.so_sao}/5 sao</span>
                            <span style="font-size:0.65rem;color:#475569;margin-left:auto;">${r.sdt_nguoi_viet === hostPhone ? '<span style="color:#00ff88;">✦ Đánh giá của bạn</span>' : r.sdt_nguoi_viet}</span>
                        </div>
                        ${r.nhan_xet ? `<div style="font-size:0.79rem;color:#e2e8f0;">${r.nhan_xet}</div>` : ""}
                    </div>`).join("")}
                   </div>`;

            // Render đánh giá khách đã gửi cho chủ sân (GuestToHost)
            const guestSentHTML = guestSentReviews.length === 0
                ? `<p style="color:#64748b;text-align:center;padding:12px;border:1px dashed #1e3a5f;border-radius:8px;font-size:0.82rem;">Khách chưa gửi đánh giá nào cho chủ sân.</p>`
                : `<div style="display:flex;flex-direction:column;gap:8px;max-height:160px;overflow-y:auto;">
                    ${guestSentReviews.map(r => `
                    <div style="background:rgba(96,165,250,0.05);border:1px solid rgba(96,165,250,0.2);border-radius:8px;padding:10px 12px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <span style="color:#60a5fa;font-size:0.9rem;">${"★".repeat(r.so_sao||0)}${"☆".repeat(5-(r.so_sao||0))}</span>
                            <span style="font-size:0.68rem;color:#94a3b8;">${r.so_sao}/5 sao</span>
                            <span style="font-size:0.65rem;color:#475569;margin-left:auto;">→ ${r.sdt_nguoi_bi_danh_gia}</span>
                        </div>
                        ${r.nhan_xet ? `<div style="font-size:0.79rem;color:#e2e8f0;">${r.nhan_xet}</div>` : ""}
                    </div>`).join("")}
                   </div>`;

            if (body) body.innerHTML = `
                <!-- Avatar + tên -->
                <div style="display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:1px solid #1e3a5f;margin-bottom:14px;">
                    <div style="width:50px;height:50px;background:linear-gradient(135deg,#1e3a5f,#2d4a6e);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">👤</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:1.05rem;font-weight:700;color:#e2e8f0;">${ten || "—"}</div>
                        <div style="font-size:0.8rem;color:#94a3b8;font-family:monospace;">${sdt}</div>
                        <div style="margin-top:4px;">${starStr}</div>
                    </div>
                </div>
                <!-- 4 stats -->
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
                    <div style="background:rgba(26,40,68,0.8);border:1px solid #2d4a6e;border-radius:8px;padding:10px;text-align:center;">
                        <div style="font-size:1.3rem;font-weight:700;color:#e2e8f0;">${totalSessions}</div>
                        <div style="font-size:0.65rem;color:#64748b;margin-top:2px;">Lần đặt slot</div>
                    </div>
                    <div style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.2);border-radius:8px;padding:10px;text-align:center;">
                        <div style="font-size:1.3rem;font-weight:700;color:#00ff88;">${attended}</div>
                        <div style="font-size:0.65rem;color:#64748b;margin-top:2px;">Đã tham gia</div>
                    </div>
                    <div style="background:rgba(251,146,60,0.06);border:1px solid rgba(251,146,60,0.2);border-radius:8px;padding:10px;text-align:center;">
                        <div style="font-size:1.3rem;font-weight:700;color:#fb923c;">${bung}</div>
                        <div style="font-size:0.65rem;color:#64748b;margin-top:2px;">Bùng kèo</div>
                    </div>
                    <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:10px;text-align:center;">
                        <div style="font-size:1rem;font-weight:700;color:#f59e0b;">${_formatVND(tongChiTieu)}</div>
                        <div style="font-size:0.65rem;color:#64748b;margin-top:2px;">Tổng chi tiêu</div>
                    </div>
                </div>
                <!-- Đánh giá về khách (tất cả chủ sân) -->
                <h4 style="color:#e2e8f0;font-size:0.82rem;margin:0 0 8px;display:flex;align-items:center;gap:6px;">
                    <i class="fa-solid fa-star" style="color:#fbbf24;"></i>
                    Đánh giá từ chủ sân (${reviews.length})
                    ${reviews.length > 0 ? `<span style="font-size:0.7rem;color:#94a3b8;font-weight:400;">— TB: ${allAvgStars}/5</span>` : ""}
                </h4>
                ${allReviewsHTML}
                <!-- Lịch sử tại sân này -->
                <h4 style="color:#e2e8f0;font-size:0.82rem;margin:14px 0 8px;display:flex;align-items:center;gap:6px;">
                    <i class="fa-solid fa-clock-rotate-left" style="color:#60a5fa;"></i>
                    Lịch sử tại sân của bạn (${hostSlots.length})
                </h4>
                ${hostSlots.length === 0
                    ? `<p style="color:#64748b;text-align:center;padding:16px;border:1px dashed #1e3a5f;border-radius:8px;font-size:0.85rem;">Chưa có lịch sử tại sân của bạn.</p>`
                    : `<div style="overflow-x:auto;">
                        <table class="hs-table" style="min-width:380px;font-size:0.8rem;">
                            <thead><tr>
                                <th>Ca đấu</th>
                                <th style="text-align:center;">Trạng thái</th>
                                <th style="text-align:right;">Tiền</th>
                                <th style="text-align:center;">Thao tác</th>
                            </tr></thead>
                            <tbody>${historyRows}</tbody>
                        </table>
                       </div>`}
                <!-- Đánh giá khách đã gửi cho chủ sân -->
                <h4 style="color:#e2e8f0;font-size:0.82rem;margin:14px 0 8px;display:flex;align-items:center;gap:6px;">
                    <i class="fa-solid fa-paper-plane" style="color:#60a5fa;"></i>
                    Đánh giá khách đã gửi (${guestSentReviews.length})
                </h4>
                ${guestSentHTML}`;

        } catch(e) {
            console.error("xemHoSoKhach error:", e);
            if (body) body.innerHTML = `<p style="color:#f87171;text-align:center;padding:32px;">Lỗi tải dữ liệu: ${(e.message||"").slice(0,60)}</p>`;
        }
    };

    window.dongModalHoSoKhach = function () {
        const modal = document.getElementById("modal-ho-so-khach");
        if (modal) modal.classList.add("hidden");
        document.body.style.overflow = "";
    };

    /** Hủy slot từ modal hồ sơ khách */
    window.huySlotTuHoSo = async function (datSlotId, sdt, ten) {
        if (!await window.xacNhanModal(`Hủy slot của khách "${ten}" (${sdt})?\nTrạng thái sẽ đổi thành "Khách hủy". Không thể hoàn tác.`, '❌')) return;
        try {
            await window.dbEngine.ghi("dat_slot", { trang_thai_di_danh: "Khách hủy" }, { id: datSlotId });
            window.hienToast("Đã hủy slot", `Slot của ${ten} đã được hủy.`, "warning");
            // Reload hồ sơ khách
            const modal = document.getElementById("modal-ho-so-khach");
            if (modal?.dataset.sdt) {
                window.xemHoSoKhach(modal.dataset.sdt, modal.dataset.ten || ten, null).catch(() => {});
            }
            // Reload DS Khách modal nếu đang mở
            const guestModal = document.getElementById("modal-guest-list");
            if (guestModal?.dataset.matchId) {
                const titleEl = document.getElementById("modal-guest-list-title");
                const currentTitle = (titleEl?.textContent || "").replace(/^DS Khách — /, "");
                window.openGuestListModal(guestModal.dataset.matchId, currentTitle).catch(() => {});
            }
            _taiLichSuCaDau().catch(() => {});
        } catch(e) {
            console.error("huySlotTuHoSo error:", e);
            window.hienToast("Lỗi hủy slot", "Không thể hủy slot. Thử lại sau.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 19. GĐ4B — XUẤT CSV & IN CA ĐẤU
     * Chỉ dùng cho ca đã chốt (da_chot_ca = true)
     * ═══════════════════════════════════════════════════ */

    // Cache dùng chung cho CSV và In (tránh fetch lại)
    window._hostCaDauMap  = window._hostCaDauMap  || {};
    window._hostDatSlotMap = window._hostDatSlotMap || {};

    async function _layCaDauVaSlots(idCaDau) {
        // Dùng cache nếu còn hiệu lực (60s)
        const cached = window._hostCaDauMap[idCaDau];
        const cachedSlots = window._hostDatSlotMap[idCaDau];
        if (cached && cachedSlots) return { ca: cached, slots: cachedSlots };

        const [caList, slotList] = await Promise.all([
            window.dbEngine.doc("ca_dau", { eq: { id: idCaDau } }),
            window.dbEngine.doc("dat_slot", { eq: { id_ca_dau: idCaDau } })
        ]);
        const ca    = caList[0]  || null;
        const slots = slotList   || [];
        window._hostCaDauMap[idCaDau]   = ca;
        window._hostDatSlotMap[idCaDau] = slots;
        return { ca, slots };
    }

    window.xuatCSVCaDau = async function (idCaDau) {
        try {
            const { ca, slots } = await _layCaDauVaSlots(idCaDau);
            if (!ca) { window.hienToast("Lỗi", "Không tìm thấy ca đấu.", "danger"); return; }

            // BOM UTF-8 để Excel mở đúng tiếng Việt
            const header = "﻿STT,Tên Khách,Số Điện Thoại,Mã Slot,Giới Tính,Trạng Thái,Tiền Thu\n";
            const rows = slots.map((s, i) => {
                const gioiTinh = (s.gioi_tinh === "female") ? "Nữ" : "Nam";
                const tienThu  = (s.gioi_tinh === "female") ? (ca.gia_nu || 0) : (ca.gia_nam || 0);
                const ten    = `"${(s.ten_khach || "").replace(/"/g, '""')}"`;
                const sdt    = `"${s.sdt_khach  || ""}"`;
                const maSlot = `"${s.ma_slot    || ""}"`;
                const tt     = `"${s.trang_thai_di_danh || ""}"`;
                return `${i + 1},${ten},${sdt},${maSlot},${gioiTinh},${tt},${tienThu}`;
            }).join("\n");

            const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            const ngay = (ca.ngay_danh || "unknown").replace(/-/g, "");
            const tenSan = (ca.ten_san || "ca-dau").replace(/\s+/g, "-").replace(/[^a-zA-Z0-9À-ỹ\-]/g, "");
            a.href = url;
            a.download = `${ngay}_${tenSan}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            window.hienToast("Xuất thành công", `File CSV đã được tải xuống: ${a.download}`, "success");
        } catch (e) {
            console.error("Lỗi xuất CSV:", e);
            window.hienToast("Lỗi", "Không thể xuất CSV. Thử lại.", "danger");
        }
    };

    window.inCaDau = async function (idCaDau) {
        try {
            const { ca, slots } = await _layCaDauVaSlots(idCaDau);
            if (!ca) { window.hienToast("Lỗi", "Không tìm thấy ca đấu.", "danger"); return; }

            const rows = slots.map((s, i) => {
                const gioiTinh = (s.gioi_tinh === "female") ? "Nữ" : "Nam";
                const tienThu  = _formatVND((s.gioi_tinh === "female") ? (ca.gia_nu || 0) : (ca.gia_nam || 0));
                const ttClass  = s.trang_thai_di_danh === "Đã tham gia" ? "color:#16a34a"
                               : s.trang_thai_di_danh === "Bùng kèo"    ? "color:#dc2626"
                               : s.trang_thai_di_danh === "Khách hủy"   ? "color:#9ca3af" : "";
                return `<tr>
                    <td style="text-align:center">${i + 1}</td>
                    <td>${s.ten_khach || "--"}</td>
                    <td>${s.sdt_khach || "--"}</td>
                    <td style="font-family:monospace">${s.ma_slot || "--"}</td>
                    <td style="text-align:center">${gioiTinh}</td>
                    <td style="${ttClass}">${s.trang_thai_di_danh || "Chờ đánh"}</td>
                    <td style="text-align:right;font-weight:600">${tienThu}</td>
                </tr>`;
            }).join("");

            const daDen  = slots.filter(s => s.trang_thai_di_danh === "Đã tham gia").length;
            const tongThu = slots
                .filter(s => s.trang_thai_di_danh === "Đã tham gia")
                .reduce((sum, s) => sum + ((s.gioi_tinh === "female") ? (ca.gia_nu || 0) : (ca.gia_nam || 0)), 0);

            const win = window.open("", "_blank", "width=820,height=640");
            if (!win) { window.hienToast("Bị chặn", "Vui lòng cho phép popup để in.", "warning"); return; }

            win.document.write(`<!DOCTYPE html><html lang="vi"><head>
            <meta charset="utf-8">
            <title>In Ca Đấu — ${ca.ten_san || ""}</title>
            <style>
                body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111; font-size: 13px; }
                h2 { margin: 0 0 4px; font-size: 1.2rem; }
                .meta { color: #555; font-size: 0.85rem; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
                th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 12px; }
                td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
                .summary { display: flex; gap: 32px; padding: 12px 0; border-top: 2px solid #111; }
                .summary span { font-weight: bold; }
                .footer { margin-top: 20px; font-size: 0.78rem; color: #9ca3af; }
                @media print { body { padding: 0; } }
            </style></head><body>
            <h2>🏸 ${ca.ten_san || "Ca Đấu"}</h2>
            <div class="meta">
                📅 ${_formatDate(ca.ngay_danh)} &nbsp;|&nbsp;
                🕐 ${ca.gio_bat_dau || ""} – ${ca.gio_ket_thuc || ""} &nbsp;|&nbsp;
                📍 ${ca.dia_chi_san || ca.quan_huyen + ", " + ca.tinh_thanh || ""}
            </div>
            <table>
                <thead><tr>
                    <th>#</th><th>Tên Khách</th><th>Số ĐT</th>
                    <th>Mã Slot</th><th>GT</th><th>Trạng Thái</th><th>Tiền Thu</th>
                </tr></thead>
                <tbody>${rows || "<tr><td colspan='7' style='text-align:center;color:#9ca3af'>Chưa có khách đăng ký</td></tr>"}</tbody>
            </table>
            <div class="summary">
                <div>Tổng đăng ký: <span>${slots.length}</span> người</div>
                <div>Đã tham gia: <span>${daDen}</span> người</div>
                <div>Doanh thu thực: <span>${_formatVND(tongThu)}</span></div>
            </div>
            <div class="footer">
                In bởi Hệ Thống Vãng Lai — TUYENVANGLAI.IO.VN — ${new Date().toLocaleString("vi-VN")}
            </div>
            </body></html>`);
            win.document.close();
            win.focus();
            // Đợi fonts load xong rồi print
            setTimeout(() => { win.print(); win.close(); }, 600);
        } catch (e) {
            console.error("Lỗi in ca đấu:", e);
            window.hienToast("Lỗi", "Không thể in. Thử lại.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 20. F3 — NOMINATIM MAPS INLINE
     * Autocomplete địa chỉ + minimap preview
     * NGOẠI LỆ DUY NHẤT cho phép gọi fetch() trực tiếp
     * (không phải Supabase — dịch vụ OpenStreetMap)
     * ═══════════════════════════════════════════════════ */
    let _nominatimTimer = null;

    window.timDiaChiNominatim = function (inputEl, dropdownEl) {
        clearTimeout(_nominatimTimer);
        const q = (inputEl.value || "").trim();
        if (q.length < 3) { if (dropdownEl) dropdownEl.style.display = "none"; return; }

        _nominatimTimer = setTimeout(async () => {
            try {
                const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=vn&accept-language=vi`;
                const res  = await fetch(url, { headers: { "Accept-Language": "vi" } });
                const data = await res.json();

                if (!data || data.length === 0) {
                    if (dropdownEl) dropdownEl.style.display = "none";
                    return;
                }

                if (!dropdownEl) return;
                dropdownEl.innerHTML = data.map((d, i) => {
                    // Truyền boundingbox để minimap zoom chính xác
                    const bb = JSON.stringify(d.boundingbox || []).replace(/"/g, "'");
                    return `<div class="nominatim-item" data-idx="${i}"
                        onclick="window.chonDiaChi('${d.display_name.replace(/'/g, "\\'").replace(/\n/g,"")}', ${d.lat}, ${d.lon}, ${bb})">
                        📍 ${d.display_name}
                    </div>`;
                }).join("");
                dropdownEl.style.display = "block";
            } catch (err) {
                console.warn("Nominatim lỗi:", err);
                if (dropdownEl) dropdownEl.style.display = "none";
            }
        }, 400); // Debounce 400ms
    };

    window.chonDiaChi = function (name, lat, lon, boundingbox) {
        // Điền địa chỉ vào ô input
        const diaChi = document.getElementById("hostCourtAddress");
        if (diaChi) diaChi.value = name;

        // Lưu tọa độ vào hidden fields
        const hidLat = document.getElementById("hiddenLat");
        const hidLon = document.getElementById("hiddenLon");
        if (hidLat) hidLat.value = lat;
        if (hidLon) hidLon.value = lon;

        // Đóng dropdown
        const dropdown = document.getElementById("nominatimDropdown");
        if (dropdown) dropdown.style.display = "none";

        // Hiện minimap preview — dùng boundingbox từ Nominatim nếu có (chính xác hơn)
        const iframe = document.getElementById("minimapPreview");
        if (iframe) {
            let bboxStr;
            if (boundingbox && boundingbox.length === 4) {
                // Nominatim trả về [lat_min, lat_max, lon_min, lon_max]
                const bboxS = parseFloat(boundingbox[0]);
                const bboxN = parseFloat(boundingbox[1]);
                const bboxW = parseFloat(boundingbox[2]);
                const bboxE = parseFloat(boundingbox[3]);
                bboxStr = `${bboxW},${bboxS},${bboxE},${bboxN}`;
            } else {
                // Fallback: tính thủ công với delta nhỏ hơn để zoom gần hơn
                const delta = 0.005;
                bboxStr = `${Number(lon)-delta},${Number(lat)-delta},${Number(lon)+delta},${Number(lat)+delta}`;
            }
            iframe.src   = `https://www.openstreetmap.org/export/embed.html?bbox=${bboxStr}&layer=mapnik&marker=${lat},${lon}`;
            iframe.style.display = "block";
        }

        // Cũng update link_maps cho khách xem
        const mapsLink = document.getElementById("hostMapsLink");
        if (mapsLink) {
            mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
            mapsLink.style.display = "inline-flex";
            mapsLink.textContent   = "🗺 Xem bản đồ";
        }
    };

    /* Đóng dropdown Nominatim khi click ra ngoài */
    document.addEventListener("click", function (e) {
        const dropdown = document.getElementById("nominatimDropdown");
        const addrInput = document.getElementById("hostCourtAddress");
        if (dropdown && addrInput && !addrInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = "none";
        }
    });

    /* ═══════════════════════════════════════════════════
     * 21. KHỞI ĐỘNG KHI LOAD TRANG
     * ═══════════════════════════════════════════════════ */
    document.addEventListener("DOMContentLoaded", () => {
        // Khi phan-he-ung-dung.js (SPA coordinator) đã load → bỏ qua, để SPA tự điều phối
        // Chỉ tự khởi tạo khi chạy độc lập (host.html standalone — không có SPA coordinator)
        if (window.khoiTaoUngDung) return;
        const checkReady = setInterval(() => {
            if (window.khoiTaoTheme && window.khoiTaoHologramGlow && window.dbEngine) {
                clearInterval(checkReady);
                window.khoiTaoTheme();
                window.khoiTaoHologramGlow();
                window.khoiTaoTrangHost();
                setTimeout(_tinhChiPhiCau, 300);
            }
        }, 100);
    });

    console.log("⚡ [Phân Hệ HOST SÂN v3.0]: Session-auth + GĐ4A/4B + F3 Nominatim ✅");
})();


