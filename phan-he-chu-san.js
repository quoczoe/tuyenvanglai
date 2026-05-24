/* =========================================================================
 * 🏟️ PHÂN HỆ CHỦ SÂN (HOST PORTAL) - PHAN-HE-CHU-SAN.JS (v2.0)
 * Dự án: TUYENVANGLAI.IO.VN
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
     * 1. KHỞI TẠO TRANG HOST
     * ═══════════════════════════════════════════════════ */
    window.khoiTaoTrangHost = function () {
        const savedKey = localStorage.getItem("tvl_host_key");
        if (savedKey) {
            window.currentHostKey = savedKey;
            _hienThiDashboard();
        } else {
            _hienThiManKichHoat();
        }
        _khoiTaoStarRating();
    };

    function _hienThiManKichHoat() {
        const auth = document.getElementById("hostAuthPanel");
        const con  = document.getElementById("hostConsole");
        if (auth) auth.style.display = "block";
        if (con)  con.style.display  = "none";
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
                if (nameEl) nameEl.textContent = window.currentHostInfo.ten_host || "Chủ Sân";
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

            window.currentHostKey = key;
            localStorage.setItem("tvl_host_key", key);
            window.hienToast("Kích hoạt thành công! ✅", "Hệ thống đã xác nhận Key hợp lệ. Chào mừng Chủ Sân!", "success");
            _hienThiDashboard();

        } catch (e) {
            console.error("Lỗi xác thực key:", e);
            window.hienToast("Lỗi kết nối", "Không thể xác thực Key lên máy chủ. Vui lòng thử lại.", "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key"></i> Kích Hoạt Quyền Quản Trị'; }
        }
    };

    window.dangXuatHost = function () {
        if (!confirm("Bạn có chắc muốn đăng xuất khỏi Trạm Quản Trị?")) return;
        localStorage.removeItem("tvl_host_key");
        window.currentHostKey  = null;
        window.currentHostInfo = null;
        window.hienToast("Đã đăng xuất", "Phiên quản trị đã kết thúc an toàn.", "info");
        _hienThiManKichHoat();
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
     * 18. KHỞI ĐỘNG KHI LOAD TRANG
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

    console.log("⚡ [Phân Hệ Chủ Sân v2.0]: Đồng bộ Supabase schema thật ✅");
})();
