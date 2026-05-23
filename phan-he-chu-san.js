/* =========================================================================
 * 🏟️ PHÂN HỆ CHỦ SÂN (HOST PORTAL) - PHAN-HE-CHU-SAN.JS
 * Dự án: TUYENVANGLAI.IO.VN
 * Chức năng: Quản lý kích hoạt Key, đăng ca đấu, kế toán thông minh,
 *            quản lý danh sách khách, chốt ca, và hệ thống đánh giá 2 chiều.
 * =========================================================================
 */

(function () {
    // ── Trạng thái toàn cục phân hệ Host ──
    window.currentHostKey = null;      // Key hiện đang dùng
    window.currentHostInfo = null;     // Thông tin key đầy đủ
    window.shuttlecocksList = [];      // Danh sách ID các hàng cầu đã thêm
    window.currentEditingSlotId = null; // ID ca đấu đang chỉnh sửa (null = tạo mới)
    window.hostRatingStarIndex = 5;    // Số sao chọn cho đánh giá khách

    // Kết quả tính từ máy kế toán (lưu để áp dụng khi chọn phương án)
    let _calcBreakEvenMale = 0, _calcBreakEvenFemale = 0;
    let _calcSmallMale = 0, _calcSmallFemale = 0;
    let _calcBigMale = 0, _calcBigFemale = 0;

    /* ═══════════════════════════════════════════════════
     * 1. KHỞI TẠO TRANG HOST
     * ═══════════════════════════════════════════════════ */
    window.khoiTaoTrangHost = function () {
        // Kiểm tra phiên đăng nhập cũ từ localStorage
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
        const con = document.getElementById("hostConsole");
        if (auth) auth.style.display = "block";
        if (con) con.style.display = "none";
    }

    async function _hienThiDashboard() {
        const auth = document.getElementById("hostAuthPanel");
        const con = document.getElementById("hostConsole");
        if (auth) auth.style.display = "none";
        if (con) con.style.display = "block";

        // Cập nhật tên host
        try {
            const keys = await window.dbEngine.doc("keys");
            window.currentHostInfo = keys.find(k => k.key === window.currentHostKey);
            const nameEl = document.getElementById("hostDisplayName");
            const keyEl = document.getElementById("hostDisplayKey");
            const expEl = document.getElementById("hostDisplayExpiry");
            if (window.currentHostInfo) {
                if (nameEl) nameEl.textContent = window.currentHostInfo.ten_host || window.currentHostInfo.note || "Chủ Sân";
                if (keyEl) keyEl.textContent = window.currentHostKey;
                if (expEl) {
                    const exp = new Date(window.currentHostInfo.expires_at || window.currentHostInfo.ngay_het_han);
                    expEl.textContent = `Hết hạn: ${exp.toLocaleDateString("vi-VN")}`;
                }
            }
        } catch (e) { console.warn("Không tải được info host:", e); }

        // Nạp dropdown tỉnh thành
        _napDropdownTinhThanh("hostProvince", "hostDistrict");

        // Đặt ngày tối thiểu và mặc định cho input ngày
        const dateInput = document.getElementById("hostDatePlay");
        if (dateInput) {
            const today = new Date().toLocaleDateString("sv-SE");
            dateInput.min = today;
            if (!dateInput.value) dateInput.value = today;
        }

        // Giờ mặc định
        const ts = document.getElementById("hostTimeStart");
        const te = document.getElementById("hostTimeEnd");
        if (ts && !ts.value) ts.value = "18:00";
        if (te && !te.value) te.value = "20:00";

        // Khởi tạo danh sách cầu với 1 hàng mặc định
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
            const keys = await window.dbEngine.doc("keys");
            const matched = keys.find(k => (k.key || k.ma_key) === key);

            if (!matched) {
                window.hienToast("Key không tồn tại", "Mã Key này không có trong hệ thống. Vui lòng kiểm tra lại.", "danger");
                return;
            }

            const trangThai = matched.status || matched.trang_thai;
            if (trangThai === "locked" || trangThai === "Bị khóa") {
                window.hienToast("Key bị khóa", "Key này đã bị Admin khóa tạm thời. Liên hệ Admin để mở khóa.", "danger");
                return;
            }

            const ngayHetHan = new Date(matched.expires_at || matched.ngay_het_han);
            if (ngayHetHan < new Date()) {
                window.hienToast("Key đã hết hạn", `Key hết hạn từ ${ngayHetHan.toLocaleDateString("vi-VN")}. Liên hệ Admin gia hạn.`, "danger");
                return;
            }

            // Kiểm tra ràng buộc thiết bị
            const deviceId = _layHoacTaoDeviceId();
            const savedDevice = matched.id_thiet_bi || matched.device_id;
            if (savedDevice && savedDevice !== deviceId) {
                window.hienToast("Thiết bị không khớp", "Key này đã được kích hoạt trên thiết bị khác. Liên hệ Admin để reset.", "danger");
                return;
            }

            // Nếu key chưa có device_id thì ghi vào
            if (!savedDevice) {
                try {
                    await window.dbEngine.ghi("keys", { id_thiet_bi: deviceId, device_id: deviceId }, { key: key });
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
        window.currentHostKey = null;
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
     * 3. QUẢN LÝ DROPDOWN TỈNH/HUYỆN
     * ═══════════════════════════════════════════════════ */
    function _napDropdownTinhThanh(provId, distId) {
        const provSel = document.getElementById(provId);
        if (!provSel || !window.MOCK_PROVINCES) return;

        provSel.innerHTML = '<option value="">-- Chọn Tỉnh/Thành --</option>';
        window.MOCK_PROVINCES.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.name;
            opt.textContent = p.name;
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
        if (prov) {
            prov.districts.forEach(d => {
                const opt = document.createElement("option");
                opt.value = d;
                opt.textContent = d;
                distSel.appendChild(opt);
            });
        }
    }

    window.capNhatQuanHuyenHost = function () {
        const provVal = document.getElementById("hostProvince")?.value;
        _capNhatHuyen(provVal, "hostDistrict");
    };

    /* ═══════════════════════════════════════════════════
     * 4. TÍNH THỜI GIAN CA CHƠI
     * ═══════════════════════════════════════════════════ */
    window.tinhToanThoiGianHieuLuc = _tinhThoiGian;

    function _tinhThoiGian() {
        const dateStr = document.getElementById("hostDatePlay")?.value;
        const startStr = document.getElementById("hostTimeStart")?.value;
        const endStr = document.getElementById("hostTimeEnd")?.value;
        const durEl = document.getElementById("hostTotalDuration");
        if (!dateStr || !startStr || !endStr || !durEl) return;

        const tS = new Date(`${dateStr}T${startStr}`);
        let tE = new Date(`${dateStr}T${endStr}`);
        if (tE <= tS) tE = new Date(tE.getTime() + 86400000); // qua đêm

        const hours = (tE - tS) / 3600000;
        durEl.value = `${hours.toFixed(1)} Giờ`;
        _tinhGoiYGia();
    }

    /* ═══════════════════════════════════════════════════
     * 5. QUẢN LÝ GIỚI TÍNH - TRÌNH ĐỘ LIÊN KẾT
     * ═══════════════════════════════════════════════════ */
    window.chuyenTrangThaiLienKetGioiTinh = function () {
        const val = document.querySelector('input[name="hostGenderSelect"]:checked')?.value || "male";
        const maleBlock = document.getElementById("linkedMaleLevelBlock");
        const femaleBlock = document.getElementById("linkedFemaleLevelBlock");

        if (val === "male") {
            if (maleBlock) maleBlock.style.display = "block";
            if (femaleBlock) femaleBlock.style.display = "none";
        } else if (val === "female") {
            if (maleBlock) maleBlock.style.display = "none";
            if (femaleBlock) femaleBlock.style.display = "block";
        } else { // both
            if (maleBlock) maleBlock.style.display = "block";
            if (femaleBlock) femaleBlock.style.display = "block";
        }
    };

    /* ═══════════════════════════════════════════════════
     * 6. QUẢN LÝ CẦU LÔN - THÊM/XÓA/ĐỒNG BỘ GIÁ
     * ═══════════════════════════════════════════════════ */
    window.themLoaiCauMoi = function (ten = "", loai = "12", gia = 240000, daDung = 0) {
        _themHangCauMoi(ten, loai, gia, daDung);
    };

    function _themHangCauMoi(ten = "", loai = "12", gia = 240000, daDung = 0) {
        const ctr = document.getElementById("shuttlecockListContainer");
        if (!ctr) return;

        const id = "sc_" + Math.random().toString(36).slice(2, 10);
        const div = document.createElement("div");
        div.className = "shuttlecock-row";
        div.id = `row_${id}`;

        const giaLe = loai === "12" ? Math.round(gia / 12) : loai === "6" ? Math.round(gia / 6) : gia;

        div.innerHTML = `
        <div class="sc-row-grid">
            <div class="form-group" style="margin-bottom:0; position:relative;">
                <label class="form-label" style="font-size:0.7rem;">Tên cầu</label>
                <input type="text" class="form-control" id="scName_${id}" value="${ten}"
                    placeholder="Hải Yến, Victor..." oninput="window._goiYCau('${id}')">
                <div id="scSuggest_${id}" style="position:absolute;top:100%;left:0;right:0;background:hsl(var(--card));border:1px solid var(--border);border-radius:var(--radius-sm);max-height:140px;overflow-y:auto;z-index:50;display:none;"></div>
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" style="font-size:0.7rem;">Loại mua</label>
                <select class="form-control" id="scLoai_${id}" onchange="window._dongBoGia('${id}','loai')">
                    <option value="12" ${loai==="12"?"selected":""}>Ống 12 quả</option>
                    <option value="6" ${loai==="6"?"selected":""}>Ống 6 quả</option>
                    <option value="1" ${loai==="1"?"selected":""}>Quả lẻ</option>
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

    // Đồng bộ 2 chiều giữa giá ống và giá lẻ
    window._dongBoGia = function (id, nguon) {
        const loaiEl = document.getElementById(`scLoai_${id}`);
        const giOngEl = document.getElementById(`scGiaOng_${id}`);
        const giLeEl = document.getElementById(`scGiaLe_${id}`);
        if (!loaiEl || !giOngEl || !giLeEl) return;

        const loai = Number(loaiEl.value);
        if (nguon === "ong" || nguon === "loai") {
            const giOng = Number(giOngEl.value) || 0;
            if (loai > 1) {
                giLeEl.value = Math.round(giOng / loai);
            }
        } else if (nguon === "le") {
            const giLe = Number(giLeEl.value) || 0;
            if (loai > 1) {
                giOngEl.value = Math.round(giLe * loai);
            }
        }
        _tinhGoiYGia();
    };

    window.xoaLoaiCau = function (id) {
        if (window.shuttlecocksList.length <= 1) {
            window.hienToast("Không được xóa", "Cần ít nhất 1 loại cầu.", "warning");
            return;
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
        const brands = window.SHUTTLECOCK_BRANDS || [];
        const matched = brands.filter(b => b.toLowerCase().includes(q));
        if (matched.length === 0) { box.style.display = "none"; return; }
        box.style.display = "block";
        matched.forEach(b => {
            const d = document.createElement("div");
            d.style.cssText = "padding:8px 12px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid var(--border);";
            d.textContent = b;
            d.onmouseenter = () => d.style.background = "rgba(255,255,255,0.05)";
            d.onmouseleave = () => d.style.background = "";
            d.onclick = () => {
                inp.value = b;
                box.style.display = "none";
                _tinhGoiYGia();
            };
            box.appendChild(d);
        });
    };

    /* ═══════════════════════════════════════════════════
     * 7. BỘ MÁY KẾ TOÁN - TÍNH GỢI Ý GIÁ THU
     * ═══════════════════════════════════════════════════ */
    window.tinhToanPricingGoiY = _tinhGoiYGia;

    function _tinhGoiYGia() {
        const dur = parseFloat(document.getElementById("hostTotalDuration")?.value) || 0;
        const soSan = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const giaSanH = Number(document.getElementById("hostAccountingCourtPrice")?.value) || 0;
        const tienNuoc = Number(document.getElementById("hostAccountingWaterCost")?.value) || 0;
        const soNam = Number(document.getElementById("hostAccountingEstMale")?.value) || 0;
        const soNu = Number(document.getElementById("hostAccountingEstFemale")?.value) || 0;
        const chenh = Number(document.getElementById("hostAccountingGap")?.value) || 0;

        // Tổng tiền sân
        const tienSan = giaSanH * dur * soSan;

        // Tổng tiền cầu
        let tienCau = 0;
        window.shuttlecocksList.forEach(id => {
            const loai = Number(document.getElementById(`scLoai_${id}`)?.value) || 12;
            const giaOng = Number(document.getElementById(`scGiaOng_${id}`)?.value) || 0;
            const daDung = Number(document.getElementById(`scDaDung_${id}`)?.value) || 0;
            const giaLe = loai > 1 ? giaOng / loai : giaOng;
            tienCau += giaLe * daDung;
        });

        const tongCP = tienSan + tienCau + tienNuoc;
        const tongNguoi = soNam + soNu;

        // Hiển thị tổng chi phí
        const tongCPEl = document.getElementById("hostTotalCost");
        if (tongCPEl) tongCPEl.textContent = _formatVND(tongCP);

        if (tongNguoi === 0) {
            ["sugValBreakEven","sugValSmall","sugValBig"].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = "--";
            });
            return;
        }

        // Hàm tính giá Nam và Nữ từ tổng doanh thu mong muốn
        function tinhGiaNamNu(tongDoanhThu) {
            // tongDoanhThu = soNam * giaNam + soNu * giaNu
            // giaNam = giaNu + chenh
            // => tongDoanhThu = soNam * (giaNu + chenh) + soNu * giaNu
            // => tongDoanhThu = giaNu * (soNam + soNu) + soNam * chenh
            // => giaNu = (tongDoanhThu - soNam * chenh) / (soNam + soNu)
            const giaNu = Math.round((tongDoanhThu - soNam * chenh) / tongNguoi / 1000) * 1000;
            const giaNam = giaNu + chenh;
            return { giaNam: Math.max(0, giaNam), giaNu: Math.max(0, giaNu) };
        }

        // 3 phương án
        const beBreak = tinhGiaNamNu(tongCP);
        const beSmall = tinhGiaNamNu(tongCP * 1.12);
        const beBig = tinhGiaNamNu(tongCP * 1.32);

        _calcBreakEvenMale = beBreak.giaNam; _calcBreakEvenFemale = beBreak.giaNu;
        _calcSmallMale = beSmall.giaNam; _calcSmallFemale = beSmall.giaNu;
        _calcBigMale = beBig.giaNam; _calcBigFemale = beBig.giaNu;

        const tinhTongThu = (nam, nu) => soNam * nam + soNu * nu;

        // Cập nhật UI gợi ý
        const elBreakNam = document.getElementById("sugBreakNam");
        const elBreakNu = document.getElementById("sugBreakNu");
        const elBreakLai = document.getElementById("sugBreakLai");
        if (elBreakNam) elBreakNam.textContent = `Nam: ${_formatVND(beBreak.giaNam)}`;
        if (elBreakNu) elBreakNu.textContent = `Nữ: ${_formatVND(beBreak.giaNu)}`;
        if (elBreakLai) elBreakLai.textContent = `Thu: ${_formatVND(tinhTongThu(beBreak.giaNam, beBreak.giaNu))} | Lãi: 0đ`;

        const elSmallNam = document.getElementById("sugSmallNam");
        const elSmallNu = document.getElementById("sugSmallNu");
        const elSmallLai = document.getElementById("sugSmallLai");
        const thuSmall = tinhTongThu(beSmall.giaNam, beSmall.giaNu);
        if (elSmallNam) elSmallNam.textContent = `Nam: ${_formatVND(beSmall.giaNam)}`;
        if (elSmallNu) elSmallNu.textContent = `Nữ: ${_formatVND(beSmall.giaNu)}`;
        if (elSmallLai) elSmallLai.textContent = `Thu: ${_formatVND(thuSmall)} | Lãi ~${_formatVND(thuSmall - tongCP)}`;

        const elBigNam = document.getElementById("sugBigNam");
        const elBigNu = document.getElementById("sugBigNu");
        const elBigLai = document.getElementById("sugBigLai");
        const thuBig = tinhTongThu(beBig.giaNam, beBig.giaNu);
        if (elBigNam) elBigNam.textContent = `Nam: ${_formatVND(beBig.giaNam)}`;
        if (elBigNu) elBigNu.textContent = `Nữ: ${_formatVND(beBig.giaNu)}`;
        if (elBigLai) elBigLai.textContent = `Thu: ${_formatVND(thuBig)} | Lãi ~${_formatVND(thuBig - tongCP)}`;
    }

    // Áp dụng phương án gợi ý vào ô công khai
    window.apDungGoiYGia = function (phuongAn) {
        let giaNam = 0, giaNu = 0;
        if (phuongAn === "breakeven") { giaNam = _calcBreakEvenMale; giaNu = _calcBreakEvenFemale; }
        else if (phuongAn === "small") { giaNam = _calcSmallMale; giaNu = _calcSmallFemale; }
        else if (phuongAn === "big") { giaNam = _calcBigMale; giaNu = _calcBigFemale; }

        const inpNam = document.getElementById("hostPublicPriceMale");
        const inpNu = document.getElementById("hostPublicPriceFemale");
        if (inpNam) inpNam.value = giaNam;
        if (inpNu) inpNu.value = giaNu;

        // Nổi bật phương án được chọn
        ["sugBoxBreak","sugBoxSmall","sugBoxBig"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove("selected");
        });
        const selectedBox = document.getElementById(`sugBox${phuongAn === "breakeven" ? "Break" : phuongAn === "small" ? "Small" : "Big"}`);
        if (selectedBox) selectedBox.classList.add("selected");

        window.hienToast("Đã áp dụng giá ✅", `Giá Nam: ${_formatVND(giaNam)} | Giá Nữ: ${_formatVND(giaNu)}`, "success");
    };

    /* ═══════════════════════════════════════════════════
     * 8. GOOGLE MAPS INTEGRATION
     * ═══════════════════════════════════════════════════ */
    let _mapsTimeout = null;

    window.giaLapTimGoogleMaps = function () {
        const overlay = document.getElementById("mapsMockModalOverlay");
        if (overlay) {
            overlay.style.display = "flex";
            const inp = document.getElementById("mapsSearchInput");
            if (inp) { inp.value = ""; inp.focus(); }
            document.getElementById("mapsSuggestionsContainer").innerHTML = "";
        }
    };

    window.dongMapsMockModal = function () {
        const overlay = document.getElementById("mapsMockModalOverlay");
        if (overlay) overlay.style.display = "none";
    };

    window.goiYDiaChiMaps = function () {
        clearTimeout(_mapsTimeout);
        _mapsTimeout = setTimeout(() => {
            const q = document.getElementById("mapsSearchInput")?.value?.trim();
            const ctr = document.getElementById("mapsSuggestionsContainer");
            if (!ctr || !q || q.length < 2) { if (ctr) ctr.innerHTML = ""; return; }

            // Lọc từ danh sách sân mẫu
            const filtered = (window.MOCK_COURTS || []).filter(c =>
                c.name.toLowerCase().includes(q.toLowerCase()) ||
                c.address.toLowerCase().includes(q.toLowerCase())
            );

            ctr.innerHTML = "";
            if (filtered.length === 0) {
                ctr.innerHTML = `<div style="padding:10px;color:#64748b;font-size:0.82rem;">Không tìm thấy. Bạn có thể điền địa chỉ tự do.</div>`;
                const useText = document.createElement("div");
                useText.className = "maps-suggestion-item";
                useText.innerHTML = `<i class="fa-solid fa-pencil" style="color:hsl(var(--neon-mint));margin-right:8px;"></i> Dùng "${q}" làm địa chỉ`;
                useText.onclick = () => {
                    document.getElementById("hostCourtAddress").value = q;
                    document.getElementById("hostMapLinkState").innerHTML = `<i class='fa-solid fa-circle-check' style='color:hsl(var(--neon-mint));'></i> Địa chỉ tự nhập`;
                    window.dongMapsMockModal();
                };
                ctr.appendChild(useText);
                return;
            }

            filtered.forEach(c => {
                const item = document.createElement("div");
                item.className = "maps-suggestion-item";
                item.innerHTML = `
                    <i class="fa-solid fa-location-dot" style="color:hsl(var(--neon-mint));margin-right:8px;flex-shrink:0;"></i>
                    <div>
                        <div style="font-weight:700;font-size:0.85rem;">${c.name}</div>
                        <div style="font-size:0.72rem;color:#94a3b8;">${c.address}</div>
                    </div>`;
                item.onclick = () => {
                    document.getElementById("hostCourtAddress").value = c.address;
                    document.getElementById("hostCourtName").value = c.name;
                    document.getElementById("hostMapLinkState").innerHTML = `<i class='fa-solid fa-circle-check' style='color:hsl(var(--neon-mint));'></i> Đã xác định vị trí: ${c.name}`;
                    window.dongMapsMockModal();
                };
                ctr.appendChild(item);
            });
        }, 300);
    };

    /* ═══════════════════════════════════════════════════
     * 9. ĐĂNG / CHỈNH SỬA CA ĐẤU
     * ═══════════════════════════════════════════════════ */
    window.dangCaDauCuaHost = async function () {
        if (!window.currentHostKey) {
            window.hienToast("Chưa kích hoạt", "Bạn cần kích hoạt Key trước.", "danger");
            return;
        }

        // Thu thập dữ liệu từ form
        const province = document.getElementById("hostProvince")?.value;
        const district = document.getElementById("hostDistrict")?.value;
        const courtName = document.getElementById("hostCourtName")?.value?.trim();
        const courtAddress = document.getElementById("hostCourtAddress")?.value?.trim();
        const courtQty = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const courtNum = document.getElementById("hostCourtNumber")?.value?.trim();
        const datePlay = document.getElementById("hostDatePlay")?.value;
        const timeStart = document.getElementById("hostTimeStart")?.value;
        const timeEnd = document.getElementById("hostTimeEnd")?.value;
        const durStr = document.getElementById("hostTotalDuration")?.value;
        const priceMale = Number(document.getElementById("hostPublicPriceMale")?.value) || 0;
        const priceFemale = Number(document.getElementById("hostPublicPriceFemale")?.value) || 0;

        // Validate
        if (!province || !district || !courtName || !courtAddress || !datePlay || !timeStart || !timeEnd) {
            window.hienToast("Thiếu thông tin", "Vui lòng điền đầy đủ: Tỉnh/Thành, Quận/Huyện, Tên sân, Địa chỉ, Ngày giờ.", "danger");
            return;
        }

        // Giới tính được chọn
        const genderVal = document.querySelector('input[name="hostGenderSelect"]:checked')?.value || "male";

        // Trình độ Nam
        let mLevels = [];
        if (genderVal === "male" || genderVal === "both") {
            ["newbie","yeu","tby","tb_minus","tb_plus","tbk"].forEach(lv => {
                const cb = document.getElementById(`m_lvl_${lv}`);
                if (cb?.checked) mLevels.push(cb.value);
            });
            const custom = document.getElementById("hostMaleCustomLevel")?.value?.trim();
            if (custom) mLevels.push(custom);
        }

        // Trình độ Nữ
        let fLevels = [];
        if (genderVal === "female" || genderVal === "both") {
            ["newbie","yeu","tby","tb_minus","tb_plus","tbk"].forEach(lv => {
                const cb = document.getElementById(`f_lvl_${lv}`);
                if (cb?.checked) fLevels.push(cb.value);
            });
            const custom = document.getElementById("hostFemaleCustomLevel")?.value?.trim();
            if (custom) fLevels.push(custom);
        }

        // Tiện ích
        const incSan = document.getElementById("inc_san")?.checked;
        const incCau = document.getElementById("inc_cau")?.checked;
        const incNuoc = document.getElementById("inc_nuoc")?.checked;
        const incXe = document.getElementById("inc_xe")?.checked;

        // Kế toán nội bộ
        const durHours = parseFloat(durStr) || 0;
        const courtPriceH = Number(document.getElementById("hostAccountingCourtPrice")?.value) || 0;
        const waterCost = Number(document.getElementById("hostAccountingWaterCost")?.value) || 0;
        const estMale = Number(document.getElementById("hostAccountingEstMale")?.value) || 0;
        const estFemale = Number(document.getElementById("hostAccountingEstFemale")?.value) || 0;
        const gap = Number(document.getElementById("hostAccountingGap")?.value) || 0;

        // Thu thập thông tin cầu
        const shutList = window.shuttlecocksList.map(id => {
            const loai = Number(document.getElementById(`scLoai_${id}`)?.value) || 12;
            const giaOng = Number(document.getElementById(`scGiaOng_${id}`)?.value) || 0;
            const daDung = Number(document.getElementById(`scDaDung_${id}`)?.value) || 0;
            const ten = document.getElementById(`scName_${id}`)?.value || "";
            return { ten, loai, gia_ong: giaOng, gia_le: loai > 1 ? Math.round(giaOng / loai) : giaOng, da_dung: daDung };
        });

        // Thông tin host
        const hostInfo = window.currentHostInfo || {};
        const hostName = hostInfo.ten_host || hostInfo.note || "Chủ Sân";
        const hostPhone = hostInfo.sdt_host || hostInfo.phone || "";

        const payload = {
            id: window.currentEditingSlotId || ("slot-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7)),
            host_key: window.currentHostKey,
            host_name: hostName,
            host_phone: hostPhone,
            province, district, court_name: courtName, court_address: courtAddress,
            court_quantity: courtQty, court_number: courtNum,
            date_play: datePlay, time_start: timeStart, time_end: timeEnd, duration: durHours,
            gender: genderVal,
            levels_male: mLevels, levels_female: fLevels,
            price_male: priceMale, price_female: priceFemale,
            inc_court: !!incSan, inc_shuttle: !!incCau, inc_water: !!incNuoc, inc_parking: !!incXe,
            accounting_court_price: courtPriceH,
            accounting_water_cost: waterCost,
            accounting_est_male: estMale, accounting_est_female: estFemale,
            accounting_gap: gap,
            accounting_shuttlecocks: shutList,
            status: "active",
            da_chot_ca: false,
            registered_guests: [],
            created_at: new Date().toISOString()
        };

        const btn = document.getElementById("btnDangCa");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng...'; }

        try {
            if (window.currentEditingSlotId) {
                await window.dbEngine.ghi("slots", payload, { id: window.currentEditingSlotId });
                window.hienToast("Đã cập nhật! ✅", "Thông tin ca đấu đã được chỉnh sửa thành công.", "success");
                window.currentEditingSlotId = null;
            } else {
                await window.dbEngine.ghi("slots", payload);
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
        // Reset form
        const ids = ["hostProvince","hostDistrict","hostCourtName","hostCourtAddress","hostCourtNumber",
                     "hostPublicPriceMale","hostPublicPriceFemale","hostMaleCustomLevel","hostFemaleCustomLevel",
                     "hostAccountingCourtPrice","hostAccountingWaterCost"];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = el.type === "number" ? (id === "hostAccountingCourtPrice" ? 80000 : id === "hostAccountingWaterCost" ? 30000 : 0) : "";
        });
        document.getElementById("hostAccountingEstMale").value = 6;
        document.getElementById("hostAccountingEstFemale").value = 4;
        document.getElementById("hostAccountingGap").value = 5000;

        // Reset ngày về hôm nay
        const today = new Date().toLocaleDateString("sv-SE");
        const dateEl = document.getElementById("hostDatePlay");
        if (dateEl) dateEl.value = today;

        // Reset shuttlecocks
        window.shuttlecocksList = [];
        const ctr = document.getElementById("shuttlecockListContainer");
        if (ctr) ctr.innerHTML = "";
        _themHangCauMoi("Hải Yến", "12", 240000, 5);

        // Reset gender
        const genderMale = document.getElementById("genderMale");
        if (genderMale) { genderMale.checked = true; window.chuyenTrangThaiLienKetGioiTinh(); }

        // Reset checkboxes dịch vụ
        ["inc_san","inc_cau","inc_nuoc","inc_xe"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = id === "inc_san" || id === "inc_cau";
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
            const all = await window.dbEngine.doc("slots");
            const mySlots = all.filter(s => s.host_key === window.currentHostKey);
            // Sắp xếp mới nhất trước
            mySlots.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            if (mySlots.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:20px;">
                    Chưa có ca đấu nào. Đăng kèo đầu tiên ngay!</td></tr>`;
                return;
            }

            tbody.innerHTML = "";
            mySlots.forEach(slot => {
                const guests = slot.registered_guests || [];
                const daDen = guests.filter(g => g.attendance === "present" || g.trang_thai === "Đã tham gia").length;
                const tongKhach = guests.length;
                const daChot = slot.da_chot_ca || slot.status === "closed";
                const isEditable = !daChot;

                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td>
                    <div style="font-weight:700;font-size:0.85rem;">${_formatDate(slot.date_play)}</div>
                    <div style="font-size:0.75rem;color:#94a3b8;">${slot.time_start || ""} – ${slot.time_end || ""}</div>
                </td>
                <td>
                    <div style="font-weight:600;font-size:0.82rem;">${slot.court_name || "--"}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;">${slot.district || ""}, ${slot.province || ""}</div>
                    <div style="font-size:0.7rem;color:#64748b;">${slot.court_number ? "Sân: " + slot.court_number : ""}</div>
                </td>
                <td>
                    <div style="font-size:0.78rem;">
                        ${_hienThiGioiTinh(slot.gender)}
                        <br>
                        <span style="color:#94a3b8;font-size:0.7rem;">${_hienThiTrinhDo(slot)}</span>
                    </div>
                </td>
                <td>
                    <div style="font-size:0.82rem;font-weight:700;color:hsl(var(--neon-mint));">${_formatVND(slot.price_male || 0)}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;">Nam</div>
                    <div style="font-size:0.82rem;font-weight:700;color:hsl(var(--neon-pink));">${_formatVND(slot.price_female || 0)}</div>
                    <div style="font-size:0.72rem;color:#94a3b8;">Nữ</div>
                </td>
                <td>
                    <div class="badge-slot-count">
                        <i class="fa-solid fa-users" style="font-size:0.7rem;"></i>
                        ${daDen}/${tongKhach} khách
                    </div>
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
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        ${isEditable ? `
                        <button class="btn-mini btn-mini-gold" onclick="window.chinhSuaCaDau('${slot.id}')">
                            <i class="fa-solid fa-pen"></i> Sửa
                        </button>
                        <button class="btn-mini btn-mini-green" onclick="window.chotCaDau('${slot.id}')">
                            <i class="fa-solid fa-flag-checkered"></i> Chốt Ca
                        </button>` : `
                        <button class="btn-mini btn-mini-cyan" onclick="window.moModalDanhGiaKhach('${slot.id}')">
                            <i class="fa-solid fa-star"></i> Đánh giá
                        </button>`}
                        <button class="btn-mini btn-mini-red" onclick="window.xoaCaDau('${slot.id}')" ${daChot ? "disabled" : ""}>
                            <i class="fa-solid fa-trash"></i> Xóa
                        </button>
                    </div>
                </td>`;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Lỗi tải lịch sử:", e);
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:hsl(var(--danger));padding:20px;">
                Lỗi tải dữ liệu. Kiểm tra kết nối.</td></tr>`;
        }
    }

    /* ═══════════════════════════════════════════════════
     * 11. CHỈNH SỬA CA ĐẤU
     * ═══════════════════════════════════════════════════ */
    window.chinhSuaCaDau = async function (id) {
        try {
            const all = await window.dbEngine.doc("slots");
            const slot = all.find(s => s.id === id);
            if (!slot) { window.hienToast("Không tìm thấy", "Ca đấu này không còn tồn tại.", "danger"); return; }
            if (slot.da_chot_ca) { window.hienToast("Đã chốt", "Không thể sửa ca đã chốt.", "danger"); return; }

            window.currentEditingSlotId = id;

            // Điền dữ liệu vào form
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
            set("hostProvince", slot.province);
            _capNhatHuyen(slot.province, "hostDistrict");
            setTimeout(() => set("hostDistrict", slot.district), 100);
            set("hostCourtName", slot.court_name);
            set("hostCourtAddress", slot.court_address);
            set("hostCourtNumber", slot.court_number);
            set("hostCourtQuantity", slot.court_quantity || 1);
            set("hostDatePlay", slot.date_play);
            set("hostTimeStart", slot.time_start);
            set("hostTimeEnd", slot.time_end);
            set("hostPublicPriceMale", slot.price_male || 0);
            set("hostPublicPriceFemale", slot.price_female || 0);
            set("hostAccountingCourtPrice", slot.accounting_court_price || 0);
            set("hostAccountingWaterCost", slot.accounting_water_cost || 0);
            set("hostAccountingEstMale", slot.accounting_est_male || 0);
            set("hostAccountingEstFemale", slot.accounting_est_female || 0);
            set("hostAccountingGap", slot.accounting_gap || 0);

            // Giới tính
            const gEl = document.querySelector(`input[name="hostGenderSelect"][value="${slot.gender}"]`);
            if (gEl) { gEl.checked = true; window.chuyenTrangThaiLienKetGioiTinh(); }

            // Checkboxes dịch vụ
            if (document.getElementById("inc_san")) document.getElementById("inc_san").checked = !!slot.inc_court;
            if (document.getElementById("inc_cau")) document.getElementById("inc_cau").checked = !!slot.inc_shuttle;
            if (document.getElementById("inc_nuoc")) document.getElementById("inc_nuoc").checked = !!slot.inc_water;
            if (document.getElementById("inc_xe")) document.getElementById("inc_xe").checked = !!slot.inc_parking;

            // Nạp lại cầu
            window.shuttlecocksList = [];
            const ctr = document.getElementById("shuttlecockListContainer");
            if (ctr) ctr.innerHTML = "";
            (slot.accounting_shuttlecocks || []).forEach(sc => {
                _themHangCauMoi(sc.ten || "", String(sc.loai || 12), sc.gia_ong || 0, sc.da_dung || 0);
            });
            if (window.shuttlecocksList.length === 0) _themHangCauMoi("Hải Yến", "12", 240000, 0);

            _tinhThoiGian();

            // Cập nhật nút
            const btn = document.getElementById("btnDangCa");
            if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> LƯU CHỈNH SỬA CA';
            const cancelBtn = document.getElementById("btnHuyChinhSua");
            if (cancelBtn) cancelBtn.style.display = "inline-flex";

            // Scroll lên form
            document.getElementById("hostFormSection")?.scrollIntoView({ behavior: "smooth" });
            window.hienToast("Đang chỉnh sửa", "Điều chỉnh thông tin rồi bấm 'Lưu Chỉnh Sửa'.", "info");
        } catch (e) {
            console.error("Lỗi load ca chỉnh sửa:", e);
        }
    };

    window.huyChinhSuaCaDau = function () {
        _resetFormDangCa();
        window.hienToast("Đã hủy", "Thao tác chỉnh sửa đã bị hủy.", "info");
    };

    /* ═══════════════════════════════════════════════════
     * 12. CHỐT CA ĐẤU (KHÔNG ĐẢO NGƯỢC)
     * ═══════════════════════════════════════════════════ */
    window.chotCaDau = async function (id) {
        if (!confirm("⚠️ CHỐT CA - THAO TÁC KHÔNG THỂ ĐẢO NGƯỢC!\n\nSau khi chốt, bạn KHÔNG thể sửa hay xóa ca này.\nDữ liệu sẽ lưu vĩnh viễn.\n\nBạn chắc chắn muốn chốt ca này?")) return;

        try {
            const all = await window.dbEngine.doc("slots");
            const slot = all.find(s => s.id === id);
            if (!slot) { window.hienToast("Lỗi", "Không tìm thấy ca đấu.", "danger"); return; }

            await window.dbEngine.ghi("slots", { ...slot, da_chot_ca: true, status: "closed", chot_at: new Date().toISOString() }, { id });
            window.hienToast("Đã chốt ca! 🔒", "Ca đấu đã được khóa vĩnh viễn. Bạn có thể đánh giá khách đã tham gia.", "success");
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
            await window.dbEngine.xoa("slots", { id });
            window.hienToast("Đã xóa", "Ca đấu đã bị xóa khỏi hệ thống.", "info");
            await _taiLichSuCaDau();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể xóa ca đấu.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 14. MODAL DANH SÁCH KHÁCH ĐĂNG KÝ
     * ═══════════════════════════════════════════════════ */
    window.moModalDanhSachKhach = async function (slotId) {
        const overlay = document.getElementById("modalDanhSachKhachOverlay");
        const tbody = document.getElementById("danhSachKhachBody");
        if (!overlay || !tbody) return;

        overlay.dataset.slotId = slotId;
        overlay.style.display = "flex";
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748b;">Đang tải...</td></tr>`;

        try {
            const all = await window.dbEngine.doc("slots");
            const slot = all.find(s => s.id === slotId);
            if (!slot) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Không tìm thấy ca.</td></tr>`; return; }

            const guests = slot.registered_guests || [];
            const isChot = slot.da_chot_ca || slot.status === "closed";

            // Header modal
            const header = document.getElementById("modalKhachHeader");
            if (header) header.textContent = `${slot.court_name} | ${_formatDate(slot.date_play)} ${slot.time_start} – ${slot.time_end}`;

            if (guests.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#64748b;">Chưa có khách đăng ký.</td></tr>`;
                return;
            }

            tbody.innerHTML = "";
            guests.forEach((g, idx) => {
                const att = g.attendance || g.trang_thai || "Chờ đánh";
                const statusClass = att === "Đã tham gia" || att === "present" ? "status-active" : att === "Bùng kèo" || att === "absent" ? "status-closed" : "status-pending";
                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td style="font-size:0.82rem;font-weight:700;">${g.name || g.ten_khach || "--"}</td>
                <td style="font-size:0.8rem;color:#94a3b8;">${g.phone || g.sdt_khach || "--"}</td>
                <td><span class="slot-code">${g.slot_code || g.ma_slot || "--"}</span></td>
                <td>
                    <span class="status-badge ${statusClass}">
                        ${att === "present" ? "Đã tham gia" : att === "absent" ? "Bùng kèo" : att}
                    </span>
                </td>
                <td>
                    ${!isChot ? `
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        <button class="btn-mini btn-mini-green" onclick="window.capNhatTrangThaiKhach('${slotId}', ${idx}, 'Đã tham gia')">✅ Đã đến</button>
                        <button class="btn-mini btn-mini-red" onclick="window.capNhatTrangThaiKhach('${slotId}', ${idx}, 'Bùng kèo')">❌ Bùng</button>
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

    window.capNhatTrangThaiKhach = async function (slotId, guestIdx, newStatus) {
        try {
            const all = await window.dbEngine.doc("slots");
            const slot = all.find(s => s.id === slotId);
            if (!slot) return;

            const guests = [...(slot.registered_guests || [])];
            if (!guests[guestIdx]) return;

            guests[guestIdx] = { ...guests[guestIdx], attendance: newStatus, trang_thai: newStatus };
            await window.dbEngine.ghi("slots", { ...slot, registered_guests: guests }, { id: slotId });
            window.hienToast("Cập nhật thành công", `${guests[guestIdx].name || "Khách"} → ${newStatus}`, "success");
            await window.moModalDanhSachKhach(slotId);
            await _taiLichSuCaDau();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể cập nhật trạng thái.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 15. HỆ THỐNG ĐÁNH GIÁ KHÁCH (SAU KHI CHỐT CA)
     * ═══════════════════════════════════════════════════ */
    window.moModalDanhGiaKhach = async function (slotId) {
        const overlay = document.getElementById("modalDanhGiaKhachOverlay");
        if (!overlay) return;

        try {
            const all = await window.dbEngine.doc("slots");
            const slot = all.find(s => s.id === slotId);
            if (!slot) return;

            // Điều kiện 1: Đã chốt ca
            if (!slot.da_chot_ca && slot.status !== "closed") {
                window.hienToast("Chưa chốt ca", "Bạn cần chốt ca trước khi đánh giá khách.", "warning");
                return;
            }

            // Lọc khách Đã tham gia
            const duKienGuests = (slot.registered_guests || []).filter(
                g => g.attendance === "Đã tham gia" || g.attendance === "present"
            );

            if (duKienGuests.length === 0) {
                window.hienToast("Không có khách đủ điều kiện", "Chưa có khách nào được xác nhận 'Đã tham gia'.", "warning");
                return;
            }

            overlay.dataset.slotId = slotId;
            overlay.style.display = "flex";

            const sel = document.getElementById("hostReviewGuestSelect");
            if (sel) {
                sel.innerHTML = '<option value="">-- Chọn khách để đánh giá --</option>';
                duKienGuests.forEach((g, idx) => {
                    const opt = document.createElement("option");
                    opt.value = idx;
                    const reviewed = g.host_review_sent;
                    opt.textContent = `${g.name || g.ten_khach} (${g.phone || g.sdt_khach}) ${reviewed ? "✅ Đã đánh giá" : ""}`;
                    if (reviewed) opt.disabled = true;
                    sel.appendChild(opt);
                });
            }

            window.hostRatingStarIndex = 5;
            _capNhatStarUIHost(5);
            const commentEl = document.getElementById("hostReviewComment");
            if (commentEl) commentEl.value = "";
        } catch (e) {
            console.error("Lỗi mở modal đánh giá:", e);
        }
    };

    window.dongModalDanhGiaKhach = function () {
        const overlay = document.getElementById("modalDanhGiaKhachOverlay");
        if (overlay) overlay.style.display = "none";
    };

    window.guiDanhGiaKhach = async function () {
        const overlay = document.getElementById("modalDanhGiaKhachOverlay");
        const slotId = overlay?.dataset.slotId;
        const sel = document.getElementById("hostReviewGuestSelect");
        const comment = document.getElementById("hostReviewComment")?.value?.trim();

        if (!slotId || !sel?.value) {
            window.hienToast("Chưa chọn khách", "Vui lòng chọn khách để đánh giá.", "warning");
            return;
        }

        const guestIdx = Number(sel.value);

        try {
            const all = await window.dbEngine.doc("slots");
            const slot = all.find(s => s.id === slotId);
            const guests = [...(slot.registered_guests || [])];
            const guest = guests[guestIdx];

            if (guest.host_review_sent) {
                window.hienToast("Đã đánh giá", "Bạn đã gửi đánh giá cho khách này rồi.", "warning");
                return;
            }

            // Ghi đánh giá
            await window.dbEngine.ghi("reviews", {
                slot_id: slotId,
                reviewer_phone: window.currentHostInfo?.sdt_host || window.currentHostKey,
                reviewed_phone: guest.phone || guest.sdt_khach,
                loai: "HostToGuest",
                so_sao: window.hostRatingStarIndex,
                nhan_xet: comment,
                created_at: new Date().toISOString()
            });

            // Đánh dấu đã đánh giá trong danh sách guest
            guests[guestIdx] = { ...guest, host_review_sent: true, host_rating: window.hostRatingStarIndex };
            await window.dbEngine.ghi("slots", { ...slot, registered_guests: guests }, { id: slotId });

            window.hienToast("Đánh giá thành công! ⭐", `Đã gửi ${window.hostRatingStarIndex} sao cho ${guest.name || "khách"}.`, "success");
            window.dongModalDanhGiaKhach();
        } catch (e) {
            console.error("Lỗi gửi đánh giá:", e);
            window.hienToast("Lỗi", "Không gửi được đánh giá.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 16. HỆ THỐNG SAO ĐÁNH GIÁ HOST
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
            star.addEventListener("click", () => {
                onSelect(i);
                _capNhatStarUI(ctr, i);
            });
            star.addEventListener("mouseenter", () => _capNhatStarUI(ctr, i, true));
            star.addEventListener("mouseleave", () => _capNhatStarUI(ctr, ctr.dataset.selected || 5));
            ctr.appendChild(star);
        }
        ctr.dataset.selected = 5;
        _capNhatStarUI(ctr, 5);
    }

    function _capNhatStarUI(ctr, val, isHover = false) {
        if (!isHover) ctr.dataset.selected = val;
        ctr.querySelectorAll(".star-item").forEach((s, i) => {
            s.style.color = i < val ? "hsl(var(--neon-gold))" : "#374151";
        });
    }

    function _capNhatStarUIHost(val) {
        const ctr = document.getElementById("hostRatingStars");
        if (ctr) _capNhatStarUI(ctr, val);
    }

    /* ═══════════════════════════════════════════════════
     * 17. TIỆN ÍCH
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
        if (g === "male") return '<span style="color:hsl(var(--neon-cyan))"><i class="fa-solid fa-mars"></i> Nam</span>';
        if (g === "female") return '<span style="color:hsl(var(--neon-pink))"><i class="fa-solid fa-venus"></i> Nữ</span>';
        return '<span style="color:hsl(var(--neon-mint))"><i class="fa-solid fa-venus-mars"></i> Cả hai</span>';
    }

    function _hienThiTrinhDo(slot) {
        const ml = (slot.levels_male || slot.levels || []).join(", ");
        const fl = (slot.levels_female || []).join(", ");
        if (slot.gender === "both") return `Nam: ${ml || "--"} | Nữ: ${fl || "--"}`;
        if (slot.gender === "female") return fl || "--";
        return ml || "--";
    }

    // Expose init cho trang host.html
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

    console.log("⚡ [Phân Hệ Chủ Sân]: Khởi động thành công.");
})();
