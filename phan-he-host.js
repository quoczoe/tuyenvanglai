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
        // Đọc session từ tvl_guest (cơ chế mới — MODULE 4)
        const savedGuest = localStorage.getItem("tvl_guest");

        // Backward compat: nếu vẫn còn tvl_host_key cũ (trước khi migrate)
        const savedKeyOld = localStorage.getItem("tvl_host_key");

        if (!savedGuest && !savedKeyOld) {
            // Chưa đăng nhập → redirect về khach.html để đăng nhập
            window.hienToast("Chưa đăng nhập", "Vui lòng đăng nhập để vào trang Host.", "warning");
            setTimeout(() => { window.location.href = "khach.html?redirect=host"; }, 1500);
            _hienThiManKichHoat(); // Ẩn console, hiện placeholder
            return;
        }

        let key = null;
        if (savedGuest) {
            // Cơ chế mới: đọc từ tvl_guest
            try {
                const guestData = JSON.parse(savedGuest);
                if (guestData.vai_tro !== "host" || !guestData.ma_key_host) {
                    // Đăng nhập rồi nhưng chưa phải host
                    // FIX E: KHÔNG redirect — hiện màn hình nhập Key tại chỗ
                    window.currentUser = guestData;
                    _hienThiManKichHoat();
                    _hienHuongDanMuaKey(guestData.ten_khach || "");
                    return;
                }
                key = guestData.ma_key_host;
                // Cập nhật window.currentUser để các module khác dùng
                window.currentUser = guestData;
            } catch { /* JSON lỗi → fall through */ }
        }

        if (!key && savedKeyOld) {
            // Backward compat: dùng key cũ
            key = savedKeyOld;
        }

        if (!key) {
            _hienThiManKichHoat();
            return;
        }

        // Verify key vẫn hợp lệ trên DB
        try {
            const keys = await window.dbEngine.doc("quan_ly_key", { eq: { ma_key: key } });
            const keyData = keys[0];
            if (!keyData || keyData.trang_thai === "Bị khóa") {
                window.hienToast("Key bị khóa", "Key Host của bạn đã bị khóa. Liên hệ Admin.", "danger");
                setTimeout(() => { window.location.href = "khach.html"; }, 2000);
                _hienThiManKichHoat();
                return;
            }
            if (keyData.ngay_het_han && new Date(keyData.ngay_het_han) < new Date()) {
                window.hienToast("Key hết hạn", "Key Host đã hết hạn. Liên hệ Admin gia hạn.", "danger");
                setTimeout(() => { window.location.href = "khach.html"; }, 2000);
                _hienThiManKichHoat();
                return;
            }
            window.currentHostKey  = key;
            window.currentHostInfo = keyData;
        } catch (e) {
            console.warn("Không verify được key — tiếp tục dùng cache:", e);
            window.currentHostKey = key;
        }

        _hienThiDashboard();
        _khoiTaoStarRating();
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

        try {
            // Tải thông tin key từ bảng quan_ly_key
            const keys = await window.dbEngine.doc("quan_ly_key", { eq: { ma_key: window.currentHostKey } });
            window.currentHostInfo = keys[0] || null;
            const nameEl = document.getElementById("hostDisplayName");
            const keyEl  = document.getElementById("hostDisplayKey");
            const expEl  = document.getElementById("hostDisplayExpiry");
            if (window.currentHostInfo) {
                if (nameEl) nameEl.textContent = window.currentHostInfo.ten_host || "Host Sân";
                if (keyEl)  keyEl.textContent  = window.currentHostKey;
                if (expEl) {
                    const exp = new Date(window.currentHostInfo.ngay_het_han);
                    expEl.textContent = `Hết hạn: ${exp.toLocaleDateString("vi-VN")}`;
                }
            }
        } catch (e) { console.warn("Không tải được info host:", e); }

        _napDropdownTinhThanh("hostProvince", "hostDistrict");

        const dateInput = document.getElementById("hostDatePlay");
        if (dateInput) {
            const today = new Date().toLocaleDateString("sv-SE");
            dateInput.min = today;
            if (!dateInput.value) dateInput.value = today;
        }

        const ts = document.getElementById("hostTimeStart");
        const te = document.getElementById("hostTimeEnd");
        if (ts && !ts.value) ts.value = "18:00";
        if (te && !te.value) te.value = "20:00";

        window.shuttlecocksList = [];
        const ctr = document.getElementById("shuttlecockListContainer");
        if (ctr) ctr.innerHTML = "";
        _themHangCauMoi("Hải Yến", "12", 240000, 5);

        _tinhThoiGian();
        await _taiLichSuCaDau();
        _resetFormDangCa();
    }

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

    window.dangXuatHost = function () {
        if (!confirm("Bạn có chắc muốn đăng xuất khỏi Trạm Host?\nBạn sẽ được chuyển về trang Khách.")) return;
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
        setTimeout(() => { window.location.href = "khach.html"; }, 1500);
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
    function _napDropdownTinhThanh(provId, distId) {
        const provSel = document.getElementById(provId);
        if (!provSel || !window.MOCK_PROVINCES) return;
        provSel.innerHTML = '<option value="">-- Chọn Tỉnh/Thành --</option>';
        window.MOCK_PROVINCES.forEach(p => {
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
        if (!provName || !window.MOCK_PROVINCES) return;
        const prov = window.MOCK_PROVINCES.find(p => p.name === provName);
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
     * 4. TÍNH THỜI GIAN CA CHƠI
     * ═══════════════════════════════════════════════════ */
    window.tinhToanThoiGianHieuLuc = _tinhThoiGian;

    function _tinhThoiGian() {
        const dateStr  = document.getElementById("hostDatePlay")?.value;
        const startStr = document.getElementById("hostTimeStart")?.value;
        const endStr   = document.getElementById("hostTimeEnd")?.value;
        const durEl    = document.getElementById("hostTotalDuration");
        if (!dateStr || !startStr || !endStr || !durEl) return;

        const tS = new Date(`${dateStr}T${startStr}`);
        let   tE = new Date(`${dateStr}T${endStr}`);
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

    function _themHangCauMoi(ten = "", loai = "12", gia = 240000, daDung = 0) {
        const ctr = document.getElementById("shuttlecockListContainer");
        if (!ctr) return;
        const id    = "sc_" + Math.random().toString(36).slice(2, 10);
        const div   = document.createElement("div");
        div.className = "shuttlecock-row";
        div.id = `row_${id}`;
        const giaLe = loai === "12" ? Math.round(gia / 12) : loai === "6" ? Math.round(gia / 6) : gia;
        div.innerHTML = `
        <div class="sc-row-grid">
            <div class="form-group" style="margin-bottom:0;position:relative;">
                <label class="form-label" style="font-size:0.7rem;">Tên cầu</label>
                <input type="text" class="form-control" id="scName_${id}" value="${ten}"
                    placeholder="Hải Yến, Victor..." oninput="window._goiYCau('${id}')">
                <div id="scSuggest_${id}" style="position:absolute;top:100%;left:0;right:0;background:hsl(var(--card));border:1px solid var(--border);border-radius:var(--radius-sm);max-height:140px;overflow-y:auto;z-index:50;display:none;"></div>
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" style="font-size:0.7rem;">Loại mua</label>
                <select class="form-control" id="scLoai_${id}" onchange="window._dongBoGia('${id}','loai')">
                    <option value="12" ${loai==="12"?"selected":""}>Ống 12 quả</option>
                    <option value="6"  ${loai==="6"?"selected":""}>Ống 6 quả</option>
                    <option value="1"  ${loai==="1"?"selected":""}>Quả lẻ</option>
                </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" style="font-size:0.7rem;">Giá/Ống hoặc /Quả lẻ</label>
                <input type="number" class="form-control" id="scGiaOng_${id}" value="${gia}"
                    placeholder="Giá ống" onchange="window._dongBoGia('${id}','ong')">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" style="font-size:0.7rem;">Giá 1 quả lẻ</label>
                <input type="number" class="form-control" id="scGiaLe_${id}" value="${giaLe}"
                    placeholder="Auto tính" onchange="window._dongBoGia('${id}','le')">
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" style="font-size:0.7rem;">Đã dùng (quả)</label>
                <input type="number" class="form-control" id="scDaDung_${id}" value="${daDung}"
                    min="0" placeholder="0" oninput="_tinhGoiYGia()">
            </div>
            <div style="display:flex;align-items:flex-end;">
                <button type="button" class="btn-remove-sc" onclick="window.xoaLoaiCau('${id}')" title="Xóa loại cầu này">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>`;
        ctr.appendChild(div);
        window.shuttlecocksList.push(id);
        _tinhGoiYGia();
    }

    window._dongBoGia = function (id, nguon) {
        const loaiEl  = document.getElementById(`scLoai_${id}`);
        const giOngEl = document.getElementById(`scGiaOng_${id}`);
        const giLeEl  = document.getElementById(`scGiaLe_${id}`);
        if (!loaiEl || !giOngEl || !giLeEl) return;
        const loai = Number(loaiEl.value);
        if (nguon === "ong" || nguon === "loai") {
            if (loai > 1) giLeEl.value = Math.round(Number(giOngEl.value || 0) / loai);
        } else if (nguon === "le") {
            if (loai > 1) giOngEl.value = Math.round(Number(giLeEl.value || 0) * loai);
        }
        _tinhGoiYGia();
    };

    window.xoaLoaiCau = function (id) {
        if (window.shuttlecocksList.length <= 1) {
            window.hienToast("Không được xóa", "Cần ít nhất 1 loại cầu.", "warning"); return;
        }
        document.getElementById(`row_${id}`)?.remove();
        window.shuttlecocksList = window.shuttlecocksList.filter(x => x !== id);
        _tinhGoiYGia();
    };

    window._goiYCau = function (id) {
        const inp = document.getElementById(`scName_${id}`);
        const box = document.getElementById(`scSuggest_${id}`);
        if (!inp || !box) return;
        const q = inp.value.toLowerCase().trim();
        box.innerHTML = "";
        if (!q) { box.style.display = "none"; return; }
        const matched = (window.SHUTTLECOCK_BRANDS || []).filter(b => b.toLowerCase().includes(q));
        if (matched.length === 0) { box.style.display = "none"; return; }
        box.style.display = "block";
        matched.forEach(b => {
            const d = document.createElement("div");
            d.style.cssText = "padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid var(--border);";
            d.textContent = b;
            d.onmouseenter = () => d.style.background = "rgba(255,255,255,0.05)";
            d.onmouseleave = () => d.style.background = "";
            d.onclick = () => { inp.value = b; box.style.display = "none"; _tinhGoiYGia(); };
            box.appendChild(d);
        });
    };

    /* ═══════════════════════════════════════════════════
     * 7. BỘ MÁY KẾ TOÁN - GỢI Ý GIÁ
     * ═══════════════════════════════════════════════════ */
    window.tinhToanPricingGoiY = _tinhGoiYGia;

    function _tinhGoiYGia() {
        const dur     = parseFloat(document.getElementById("hostTotalDuration")?.value) || 0;
        const soSan   = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const giaSanH = Number(document.getElementById("hostAccountingCourtPrice")?.value) || 0;
        const tienNuoc = Number(document.getElementById("hostAccountingWaterCost")?.value) || 0;
        const soNam   = Number(document.getElementById("hostAccountingEstMale")?.value) || 0;
        const soNu    = Number(document.getElementById("hostAccountingEstFemale")?.value) || 0;
        const chenh   = Number(document.getElementById("hostAccountingGap")?.value) || 0;

        const tienSan = giaSanH * dur * soSan;
        let tienCau = 0;
        window.shuttlecocksList.forEach(id => {
            const loai   = Number(document.getElementById(`scLoai_${id}`)?.value) || 12;
            const giaOng = Number(document.getElementById(`scGiaOng_${id}`)?.value) || 0;
            const daDung = Number(document.getElementById(`scDaDung_${id}`)?.value) || 0;
            const giaLe  = loai > 1 ? giaOng / loai : giaOng;
            tienCau += giaLe * daDung;
        });

        const tongCP    = tienSan + tienCau + tienNuoc;
        const tongNguoi = soNam + soNu;

        const tongCPEl = document.getElementById("hostTotalCost");
        if (tongCPEl) tongCPEl.textContent = _formatVND(tongCP);

        if (tongNguoi === 0) {
            ["sugValBreakEven","sugValSmall","sugValBig"].forEach(id => {
                const el = document.getElementById(id); if (el) el.textContent = "--";
            });
            return;
        }

        function tinhGiaNamNu(tongDT) {
            const giaNu  = Math.round((tongDT - soNam * chenh) / tongNguoi / 1000) * 1000;
            const giaNam = giaNu + chenh;
            return { giaNam: Math.max(0, giaNam), giaNu: Math.max(0, giaNu) };
        }

        const beBreak = tinhGiaNamNu(tongCP);
        const beSmall = tinhGiaNamNu(tongCP * 1.12);
        const beBig   = tinhGiaNamNu(tongCP * 1.32);

        _calcBreakEvenMale = beBreak.giaNam; _calcBreakEvenFemale = beBreak.giaNu;
        _calcSmallMale = beSmall.giaNam;     _calcSmallFemale = beSmall.giaNu;
        _calcBigMale   = beBig.giaNam;       _calcBigFemale   = beBig.giaNu;

        const thu = (n, u) => soNam * n + soNu * u;

        const set4 = (namId, nuId, laiId, n, u) => {
            const en = document.getElementById(namId); if (en) en.textContent = `Nam: ${_formatVND(n)}`;
            const eu = document.getElementById(nuId);  if (eu) eu.textContent = `Nữ: ${_formatVND(u)}`;
            const el = document.getElementById(laiId);
            if (el) {
                const t = thu(n, u);
                el.textContent = laiId === "sugBreakLai"
                    ? `Thu: ${_formatVND(t)} | Lãi: 0đ`
                    : `Thu: ${_formatVND(t)} | Lãi ~${_formatVND(t - tongCP)}`;
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
        const inpNam = document.getElementById("hostPublicPriceMale");
        const inpNu  = document.getElementById("hostPublicPriceFemale");
        if (inpNam) inpNam.value = giaNam;
        if (inpNu)  inpNu.value  = giaNu;
        ["sugBoxBreak","sugBoxSmall","sugBoxBig"].forEach(id => document.getElementById(id)?.classList.remove("selected"));
        const box = document.getElementById(`sugBox${phuongAn === "breakeven" ? "Break" : phuongAn === "small" ? "Small" : "Big"}`);
        if (box) box.classList.add("selected");
        window.hienToast("Đã áp dụng giá ✅", `Giá Nam: ${_formatVND(giaNam)} | Giá Nữ: ${_formatVND(giaNu)}`, "success");
    };

    /* ═══════════════════════════════════════════════════
     * 8. GOOGLE MAPS — MỞ LINK TÌM KIẾM MIỄN PHÍ
     * ═══════════════════════════════════════════════════ */
    window.giaLapTimGoogleMaps = function () {
        const addr   = (document.getElementById("hostCourtAddress")?.value || "").trim();
        const tenSan = (document.getElementById("hostCourtName")?.value || "").trim();
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
        if (!window.currentHostKey) {
            window.hienToast("Chưa kích hoạt", "Bạn cần kích hoạt Key trước.", "danger"); return;
        }

        const tinh_thanh  = document.getElementById("hostProvince")?.value;
        const quan_huyen  = document.getElementById("hostDistrict")?.value;
        const ten_san     = document.getElementById("hostCourtName")?.value?.trim();
        const dia_chi_san = document.getElementById("hostCourtAddress")?.value?.trim();
        const so_san_mo   = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const so_san_cu_the = document.getElementById("hostCourtNumber")?.value?.trim();
        const ngay_danh   = document.getElementById("hostDatePlay")?.value;
        const gio_bat_dau = document.getElementById("hostTimeStart")?.value;
        const gio_ket_thuc = document.getElementById("hostTimeEnd")?.value;
        const durStr      = document.getElementById("hostTotalDuration")?.value;
        const gia_nam     = Number(document.getElementById("hostPublicPriceMale")?.value) || 0;
        const gia_nu      = Number(document.getElementById("hostPublicPriceFemale")?.value) || 0;

        if (!tinh_thanh || !quan_huyen || !ten_san || !dia_chi_san || !ngay_danh || !gio_bat_dau || !gio_ket_thuc) {
            window.hienToast("Thiếu thông tin", "Vui lòng điền đầy đủ: Tỉnh/Thành, Quận/Huyện, Tên sân, Địa chỉ, Ngày giờ.", "danger");
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
        const gia_thue_san_1h = Number(document.getElementById("hostAccountingCourtPrice")?.value) || 0;
        const chi_phi_nuoc_khac = Number(document.getElementById("hostAccountingWaterCost")?.value) || 0;
        const so_nguoi_nam  = Number(document.getElementById("hostAccountingEstMale")?.value) || 0;
        const so_nguoi_nu   = Number(document.getElementById("hostAccountingEstFemale")?.value) || 0;
        const chenh_lech_gia = Number(document.getElementById("hostAccountingGap")?.value) || 0;
        const chi_phi_san_co_dinh = gia_thue_san_1h * so_gio_choi * so_san_mo;
        const tong_doanh_thu_du_kien = so_nguoi_nam * gia_nam + so_nguoi_nu * gia_nu;

        // Danh sách cầu (JSONB)
        let tong_chi_phi_cau = 0;
        const loai_cau_su_dung = window.shuttlecocksList.map(id => {
            const loai   = Number(document.getElementById(`scLoai_${id}`)?.value) || 12;
            const giaOng = Number(document.getElementById(`scGiaOng_${id}`)?.value) || 0;
            const daDung = Number(document.getElementById(`scDaDung_${id}`)?.value) || 0;
            const ten    = document.getElementById(`scName_${id}`)?.value || "";
            const gia_qua = loai > 1 ? Math.round(giaOng / loai) : giaOng;
            const thanh_tien = gia_qua * daDung;
            tong_chi_phi_cau += thanh_tien;
            const donViMap = { "12": "ống 12 quả", "6": "ống 6 quả", "1": "quả lẻ" };
            return { ten, don_vi: donViMap[String(loai)] || "ống", gia_qua, so_luong: daDung, thanh_tien, gia_ong: giaOng, loai };
        });

        const payload = {
            ma_key_host: window.currentHostKey,
            vung_mien:   _xacDinhVungMien(tinh_thanh),
            tinh_thanh, quan_huyen, ten_san, dia_chi_san,
            so_san_mo, so_san_cu_the,
            ngay_danh, gio_bat_dau, gio_ket_thuc, so_gio_choi,
            gioi_tinh_can, yeu_cau_trinh_do,
            gia_nam, gia_nu, tien_ich_bao_gom,
            gia_thue_san_1h, chi_phi_san_co_dinh,
            loai_cau_su_dung, tong_chi_phi_cau, chi_phi_nuoc_khac,
            so_nguoi_nam, so_nguoi_nu, chenh_lech_gia,
            tong_doanh_thu_du_kien,
            da_chot_ca: false
        };

        const btn = document.getElementById("btnDangCa");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng...'; }

        try {
            if (window.currentEditingSlotId) {
                await window.dbEngine.ghi("ca_dau", payload, { id: window.currentEditingSlotId });
                window.hienToast("Đã cập nhật! ✅", "Thông tin ca đấu đã được chỉnh sửa thành công.", "success");
                window.currentEditingSlotId = null;
            } else {
                await window.dbEngine.ghi("ca_dau", payload);
                window.hienToast("Đăng tuyển thành công! 🏸", "Ca đấu đã lên hệ thống, khách sẽ thấy ngay!", "success");
            }
            _resetFormDangCa();
            await _taiLichSuCaDau();
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
                     "hostPublicPriceMale","hostPublicPriceFemale","hostMaleCustomLevel","hostFemaleCustomLevel"];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
        [["hostAccountingCourtPrice", 80000],["hostAccountingWaterCost", 30000],
         ["hostAccountingEstMale", 6],["hostAccountingEstFemale", 4],["hostAccountingGap", 5000]
        ].forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });

        const today = new Date().toLocaleDateString("sv-SE");
        const dateEl = document.getElementById("hostDatePlay");
        if (dateEl) dateEl.value = today;

        window.shuttlecocksList = [];
        const ctr = document.getElementById("shuttlecockListContainer");
        if (ctr) ctr.innerHTML = "";
        _themHangCauMoi("Hải Yến", "12", 240000, 5);

        const genderMale = document.getElementById("genderMale");
        if (genderMale) { genderMale.checked = true; window.chuyenTrangThaiLienKetGioiTinh(); }

        ["inc_san","inc_cau","inc_nuoc","inc_xe"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = (id === "inc_san" || id === "inc_cau");
        });

        const btnEl = document.getElementById("btnDangCa");
        if (btnEl) btnEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> XÁC NHẬN ĐĂNG TUYỂN';
        const cancelBtn = document.getElementById("btnHuyChinhSua");
        if (cancelBtn) cancelBtn.style.display = "none";

        _tinhThoiGian();
    }

    /* ═══════════════════════════════════════════════════
     * 10. TẢI & HIỂN THỊ LỊCH SỬ CA ĐẤU
     * ═══════════════════════════════════════════════════ */
    window.loadLichSuCaDauHost = _taiLichSuCaDau;

    async function _taiLichSuCaDau() {
        const tbody = document.getElementById("hostSlotsBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:20px;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;

        try {
            // Tải ca đấu của host + tất cả dat_slot để đếm khách
            const [mySlots, allDatSlot] = await Promise.all([
                window.dbEngine.doc("ca_dau", {
                    eq: { ma_key_host: window.currentHostKey },
                    order: "created_at.desc"
                }),
                window.dbEngine.doc("dat_slot").catch(() => [])
            ]);

            // Nhóm dat_slot theo id_ca_dau
            const slotMap = {};
            allDatSlot.forEach(s => {
                if (!slotMap[s.id_ca_dau]) slotMap[s.id_ca_dau] = [];
                slotMap[s.id_ca_dau].push(s);
            });

            if (mySlots.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:20px;">
                    Chưa có ca đấu nào. Đăng kèo đầu tiên ngay!</td></tr>`;
                return;
            }

            tbody.innerHTML = "";
            mySlots.forEach(slot => {
                const guests   = slotMap[slot.id] || [];
                const daDen    = guests.filter(g => g.trang_thai_di_danh === "Đã tham gia").length;
                const tongKhach = guests.length;
                const daChot   = !!slot.da_chot_ca;

                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td>
                    <div style="font-weight:700;font-size:0.85rem;">${_formatDate(slot.ngay_danh)}</div>
                    <div style="font-size:0.75rem;color:#94a3b8;">${slot.gio_bat_dau || ""} – ${slot.gio_ket_thuc || ""}</div>
                </td>
                <td>
                    <div style="font-weight:600;font-size:0.82rem;">${slot.ten_san || "--"}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;">${slot.quan_huyen || ""}, ${slot.tinh_thanh || ""}</div>
                    <div style="font-size:0.7rem;color:#64748b;">${slot.so_san_cu_the ? "Sân: " + slot.so_san_cu_the : ""}</div>
                </td>
                <td class="col-hide-sm">
                    <div style="font-size:0.78rem;">${_hienThiGioiTinh(slot.gioi_tinh_can)}</div>
                    <div style="font-size:0.7rem;color:#94a3b8;">${_hienThiTrinhDo(slot)}</div>
                </td>
                <td class="col-hide-sm">
                    <div style="font-size:0.82rem;font-weight:700;color:#00ff88;">${_formatVND(slot.gia_nam || 0)}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;">Nam</div>
                    <div style="font-size:0.82rem;font-weight:700;color:#f472b6;">${_formatVND(slot.gia_nu || 0)}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;">Nữ</div>
                </td>
                <td>
                    <div class="badge-slot-count"><i class="fa-solid fa-users" style="font-size:0.7rem;"></i> ${daDen}/${tongKhach} khách</div>
                    <button class="btn-mini btn-mini-cyan" style="margin-top:6px;width:100%;"
                        onclick="window.moModalDanhSachKhach('${slot.id}')">
                        <i class="fa-solid fa-list-check"></i> DS Khách
                    </button>
                </td>
                <td>
                    ${daChot
                        ? `<span class="status-badge status-closed"><i class="fa-solid fa-lock"></i> Đã chốt</span>`
                        : `<span class="status-badge status-active"><i class="fa-solid fa-circle"></i> Đang mở</span>`
                    }
                </td>
                <td>
                    <div class="hs-actions-cell">
                        ${!daChot ? `
                        <button class="btn-mini btn-mini-gold hs-action-btn" onclick="window.chinhSuaCaDau('${slot.id}')">
                            <i class="fa-solid fa-pen"></i> Sửa
                        </button>
                        <button class="btn-mini btn-mini-green hs-action-btn" onclick="window.chotCaDau('${slot.id}')">
                            <i class="fa-solid fa-flag-checkered"></i> Chốt Ca
                        </button>` : `
                        <button class="btn-mini btn-mini-cyan hs-action-btn" onclick="window.moModalDanhGiaKhach('${slot.id}')">
                            <i class="fa-solid fa-star"></i> Đánh giá
                        </button>
                        <button class="btn-mini btn-mini-gold hs-action-btn" onclick="window.xuatCSVCaDau('${slot.id}')" title="Xuất danh sách khách ra Excel">
                            <i class="fa-solid fa-file-csv"></i> CSV
                        </button>
                        <button class="btn-mini hs-action-btn" style="background:rgba(148,163,184,0.15);color:#94a3b8;border:1px solid #334155;" onclick="window.inCaDau('${slot.id}')" title="In danh sách khách">
                            <i class="fa-solid fa-print"></i> In
                        </button>`}
                        <button class="btn-mini btn-mini-red hs-action-btn" onclick="window.xoaCaDau('${slot.id}')" ${daChot ? "disabled" : ""}>
                            <i class="fa-solid fa-trash"></i> Xóa
                        </button>
                    </div>
                </td>`;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Lỗi tải lịch sử:", e);
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:20px;">
                Lỗi tải dữ liệu. Kiểm tra kết nối.</td></tr>`;
        }
    }

    /* ═══════════════════════════════════════════════════
     * 11. CHỈNH SỬA CA ĐẤU
     * ═══════════════════════════════════════════════════ */
    window.chinhSuaCaDau = async function (id) {
        try {
            const list = await window.dbEngine.doc("ca_dau", { eq: { id } });
            const slot = list[0];
            if (!slot) { window.hienToast("Không tìm thấy", "Ca đấu không còn tồn tại.", "danger"); return; }
            if (slot.da_chot_ca) { window.hienToast("Đã chốt", "Không thể sửa ca đã chốt.", "danger"); return; }

            window.currentEditingSlotId = id;

            const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ""; };
            set("hostProvince", slot.tinh_thanh);
            _capNhatHuyen(slot.tinh_thanh, "hostDistrict");
            setTimeout(() => set("hostDistrict", slot.quan_huyen), 100);
            set("hostCourtName",    slot.ten_san);
            set("hostCourtAddress", slot.dia_chi_san);
            set("hostCourtNumber",  slot.so_san_cu_the);
            set("hostCourtQuantity", slot.so_san_mo || 1);
            set("hostDatePlay",     slot.ngay_danh);
            set("hostTimeStart",    slot.gio_bat_dau);
            set("hostTimeEnd",      slot.gio_ket_thuc);
            set("hostPublicPriceMale",   slot.gia_nam || 0);
            set("hostPublicPriceFemale", slot.gia_nu  || 0);
            set("hostAccountingCourtPrice", slot.gia_thue_san_1h    || 0);
            set("hostAccountingWaterCost",  slot.chi_phi_nuoc_khac  || 0);
            set("hostAccountingEstMale",    slot.so_nguoi_nam        || 0);
            set("hostAccountingEstFemale",  slot.so_nguoi_nu         || 0);
            set("hostAccountingGap",        slot.chenh_lech_gia      || 0);

            // Giới tính — ngược map
            const gRev = { "Nam": "male", "Nữ": "female", "Cả hai": "both" };
            const gEl = document.querySelector(`input[name="hostGenderSelect"][value="${gRev[slot.gioi_tinh_can] || 'male'}"]`);
            if (gEl) { gEl.checked = true; window.chuyenTrangThaiLienKetGioiTinh(); }

            // Tiện ích
            const baoGom = slot.tien_ich_bao_gom || {};
            if (document.getElementById("inc_san"))  document.getElementById("inc_san").checked  = !!baoGom.san;
            if (document.getElementById("inc_cau"))  document.getElementById("inc_cau").checked  = !!baoGom.cau;
            if (document.getElementById("inc_nuoc")) document.getElementById("inc_nuoc").checked = !!baoGom.nuoc;
            if (document.getElementById("inc_xe"))   document.getElementById("inc_xe").checked   = !!baoGom.gui_xe;

            // Cầu
            window.shuttlecocksList = [];
            const ctr = document.getElementById("shuttlecockListContainer");
            if (ctr) ctr.innerHTML = "";
            (slot.loai_cau_su_dung || []).forEach(sc => {
                _themHangCauMoi(sc.ten || "", String(sc.loai || 12), sc.gia_ong || (sc.gia_qua * (sc.loai || 12)) || 0, sc.so_luong || 0);
            });
            if (window.shuttlecocksList.length === 0) _themHangCauMoi("Hải Yến", "12", 240000, 0);

            _tinhThoiGian();
            const btn = document.getElementById("btnDangCa");
            if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> LƯU CHỈNH SỬA CA';
            const cancelBtn = document.getElementById("btnHuyChinhSua");
            if (cancelBtn) cancelBtn.style.display = "inline-flex";

            document.getElementById("hostFormSection")?.scrollIntoView({ behavior: "smooth" });
            window.hienToast("Đang chỉnh sửa", "Điều chỉnh rồi bấm 'Lưu Chỉnh Sửa'.", "info");
        } catch (e) { console.error("Lỗi load ca chỉnh sửa:", e); }
    };

    window.huyChinhSuaCaDau = function () {
        _resetFormDangCa();
        window.hienToast("Đã hủy", "Thao tác chỉnh sửa đã bị hủy.", "info");
    };

    /* ═══════════════════════════════════════════════════
     * 12. CHỐT CA ĐẤU (KHÔNG ĐẢO NGƯỢC)
     * ═══════════════════════════════════════════════════ */
    window.chotCaDau = async function (id) {
        if (!confirm("⚠️ CHỐT CA - THAO TÁC KHÔNG THỂ ĐẢO NGƯỢC!\n\nSau khi chốt, bạn KHÔNG thể sửa hay xóa ca này.\nDữ liệu lưu vĩnh viễn.\n\nBạn chắc chắn muốn chốt ca này?")) return;
        try {
            // Chỉ cần cập nhật da_chot_ca = true, không cần ghi lại toàn bộ
            await window.dbEngine.ghi("ca_dau", { da_chot_ca: true }, { id });
            window.hienToast("Đã chốt ca! 🔒", "Ca đấu đã được khóa vĩnh viễn. Bạn có thể đánh giá khách.", "success");
            await _taiLichSuCaDau();
        } catch (e) {
            console.error("Lỗi chốt ca:", e);
            window.hienToast("Lỗi", "Không thể chốt ca. Thử lại.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 13. XÓA CA ĐẤU
     * ═══════════════════════════════════════════════════ */
    window.xoaCaDau = async function (id) {
        if (!confirm("Bạn có chắc muốn xóa ca đấu này?")) return;
        try {
            await window.dbEngine.xoa("ca_dau", { id });
            window.hienToast("Đã xóa", "Ca đấu đã bị xóa khỏi hệ thống.", "info");
            await _taiLichSuCaDau();
        } catch (e) { window.hienToast("Lỗi", "Không thể xóa ca đấu.", "danger"); }
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
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748b;">Đang tải...</td></tr>`;

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
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748b;">Chưa có khách đăng ký.</td></tr>`;
                return;
            }

            tbody.innerHTML = "";
            datSlotList.forEach(g => {
                const tt = g.trang_thai_di_danh || "Chờ đánh";
                const statusClass = tt === "Đã tham gia" ? "status-active" : tt === "Bùng kèo" ? "status-closed" : "status-pending";
                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td style="font-size:0.82rem;font-weight:700;">${g.ten_khach || "--"}</td>
                <td style="font-size:0.8rem;color:#94a3b8;">${g.sdt_khach || "--"}</td>
                <td><span class="slot-code">${g.ma_slot || "--"}</span></td>
                <td><span class="status-badge ${statusClass}">${tt}</span></td>
                <td>
                    ${!isChot ? `
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        <button class="btn-mini btn-mini-green" onclick="window.capNhatTrangThaiKhach('${g.id}', 'Đã tham gia')">✅ Đã đến</button>
                        <button class="btn-mini btn-mini-red" onclick="window.capNhatTrangThaiKhach('${g.id}', 'Bùng kèo')">❌ Bùng</button>
                    </div>` : "<span style='color:#64748b;font-size:0.72rem;'>Đã chốt</span>"}
                </td>`;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Lỗi tải danh sách khách:", e);
            tbody.innerHTML = `<tr><td colspan="5" style="color:red;padding:20px;">Lỗi tải dữ liệu.</td></tr>`;
        }
    };

    window.dongModalDanhSachKhach = function () {
        const overlay = document.getElementById("modalDanhSachKhachOverlay");
        if (overlay) overlay.style.display = "none";
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

    /**
     * 3G — Format input tiền tệ realtime (dấu chấm nghìn kiểu Việt Nam).
     * Dùng cho input type="text" (KHÔNG dùng cho type="number").
     * Lưu giá trị thô vào dataset.rawValue để ghi DB.
     */
    window._formatInputTienTe = function(input) {
        const raw = input.value.replace(/\./g, "").replace(/[^0-9]/g, "");
        const num = parseInt(raw, 10);
        if (!isNaN(num) && raw !== "") {
            input.value = num.toLocaleString("vi-VN"); // "150.000"
        }
        input.dataset.rawValue = raw || "0";
    };

    /**
     * Lấy giá trị số thô từ input đã format (bỏ dấu chấm nghìn).
     */
    window._layGiaTriThoInput = function(input) {
        return parseInt(input.dataset.rawValue || input.value.replace(/\./g, "") || "0", 10);
    };

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
        let tongCaChotted = 0, tongKhach = 0, tongDoanhThu = 0;

        const doanhThuRows = caDauHienThi.map(c => {
            const slots = slotMap[c.id] || [];
            const slotsDiDanh = slots.filter(s => s.trang_thai_di_danh === "Đã tham gia");
            const soKhach = slotsDiDanh.length;
            const doanhThu = slotsDiDanh.reduce((sum, s) =>
                sum + (s.gioi_tinh === "female" ? (c.gia_nu || 0) : (c.gia_nam || 0)), 0);
            if (c.da_chot_ca) {
                tongCaChotted++;
                tongKhach   += soKhach;
                tongDoanhThu += doanhThu;
            }
            return { ...c, soKhach, doanhThu };
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
                <div class="stat-label">Doanh Thu Thực Thu</div>
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
        <div class="table-responsive">
        <table class="hs-table">
            <thead><tr>
                <th>Ngày</th>
                <th>Tên Sân</th>
                <th>Số Khách</th>
                <th>Doanh Thu</th>
                <th>Thao Tác</th>
            </tr></thead>
            <tbody>
                ${caChoTted.map((c, i) => `
                <tr style="${i % 2 === 0 ? "" : "background:rgba(255,255,255,0.02)"}">
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
                    <td>
                        <span style="font-size:0.9rem;font-weight:700;color:#f59e0b;">${_formatVND(c.doanhThu)}</span>
                    </td>
                    <td>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            <button class="btn-mini btn-mini-gold" onclick="window.xuatCSVCaDau('${c.id}')" title="Xuất CSV">
                                <i class="fa-solid fa-file-csv"></i> CSV
                            </button>
                            <button class="btn-mini" style="background:rgba(148,163,184,0.15);color:#94a3b8;border:1px solid #334155;"
                                onclick="window.inCaDau('${c.id}')" title="In danh sách">
                                <i class="fa-solid fa-print"></i> In
                            </button>
                        </div>
                    </td>
                </tr>`).join("")}
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
        const checkReady = setInterval(() => {
            if (window.khoiTaoTheme && window.khoiTaoHologramGlow && window.dbEngine) {
                clearInterval(checkReady);
                window.khoiTaoTheme();
                window.khoiTaoHologramGlow();
                window.khoiTaoTrangHost();
            }
        }, 100);
    });

    console.log("⚡ [Phân Hệ HOST SÂN v3.0]: Session-auth + GĐ4A/4B + F3 Nominatim ✅");
})();

