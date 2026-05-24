/* =========================================================================
 * 🏸 PHÂN HỆ KHÁCH CHƠI VÃNG LAI - PHAN-HE-KHACH-CHOI.JS (v2.0)
 * Dự án: TUYENVANGLAI.IO.VN
 * v2.0: Đồng bộ field mapping với Supabase schema thật
 *       khach_vang_lai / ca_dau / dat_slot / danh_gia_tin_dung
 *       Bỏ hoàn toàn registered_guests[] — đặt slot → INSERT dat_slot
 * =========================================================================
 */

(function () {
    // ── Trạng thái toàn cục ──
    window.currentGuest = null;
    let _guestRatingVal = 5;
    let _filterTimeout  = null;

    /* ═══════════════════════════════════════════════════
     * 1. KHỞI TẠO TRANG KHÁCH
     * ═══════════════════════════════════════════════════ */
    window.khoiTaoTrangKhach = function () {
        const saved = localStorage.getItem("tvl_guest");
        if (saved) {
            try {
                window.currentGuest = JSON.parse(saved);
                _hienThiDashboardKhach();
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
        // Ẩn các card phụ chỉ dành cho khách đã đăng nhập
        ["cardDaKySlot", "cardLichSuChiTieu", "cardDanhGiaVeToi"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });
    }

    function _hienThiDashboardKhach() {
        const auth    = document.getElementById("guestAuthPanel");
        const profile = document.getElementById("guestProfileBlock");
        if (auth)    auth.style.display    = "none";
        if (profile) profile.style.display = "block";

        const g = window.currentGuest;
        if (!g) return;

        const nameEl = document.getElementById("profileGuestName");
        const phoneEl = document.getElementById("profileGuestPhone");
        const dateEl  = document.getElementById("profileGuestDate");
        if (nameEl)  nameEl.textContent  = g.ten_khach || "Lông thủ ẩn danh";
        if (phoneEl) phoneEl.textContent = `SĐT: ${g.sdt_khach || "--"}`;
        if (dateEl) {
            const joined = g.ngay_tham_gia ? new Date(g.ngay_tham_gia).toLocaleDateString("vi-VN") : "--";
            dateEl.textContent = `Gia nhập: ${joined}`;
        }
        _taiThongKeKhach();
        _taiDanhSachHostChoGuestDanhGia();

        // Hiện và tải các card phụ GĐ3
        ["cardDaKySlot", "cardLichSuChiTieu", "cardDanhGiaVeToi"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "block";
        });
        _taiDaKySlot();
        _taiLichSuChiTieu();
        _taiDanhGiaVeToi();
    }

    /* ═══════════════════════════════════════════════════
     * 2. ĐĂNG NHẬP NHANH → khach_vang_lai
     * ═══════════════════════════════════════════════════ */
    window.xacThucKhachChoi = async function () {
        const nameEl  = document.getElementById("guestInputName");
        const phoneEl = document.getElementById("guestInputPhone");
        if (!nameEl || !phoneEl) return;

        const name  = nameEl.value.trim();
        const phone = phoneEl.value.trim().replace(/\D/g, "");

        if (!name)  { window.hienToast("Thiếu tên", "Vui lòng nhập tên hoặc biệt danh.", "danger"); return; }
        if (!phone || !/^[0-9]{9,11}$/.test(phone)) {
            window.hienToast("SĐT không hợp lệ", "Vui lòng nhập số điện thoại đúng (9-11 số).", "danger"); return;
        }

        const btn = document.querySelector("[onclick='xacThucKhachChoi()']");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối...'; }

        try {
            // Tra cứu theo sdt_khach (UNIQUE trong schema)
            const users = await window.dbEngine.doc("khach_vang_lai", { eq: { sdt_khach: phone } });
            let guest = users[0] || null;

            if (!guest) {
                // Tạo hồ sơ mới — ngay_tham_gia auto-set bởi DEFAULT now()
                const results = await window.dbEngine.ghi("khach_vang_lai", {
                    ten_khach: name,
                    sdt_khach: phone
                });
                guest = results[0] || { ten_khach: name, sdt_khach: phone };
            } else if (guest.ten_khach !== name) {
                // Cập nhật tên nếu đổi
                await window.dbEngine.ghi("khach_vang_lai", { ten_khach: name }, { sdt_khach: phone });
                guest.ten_khach = name;
            }

            window.currentGuest = guest;
            // localStorage chỉ lưu định danh tối thiểu
            localStorage.setItem("tvl_guest", JSON.stringify({
                ten_khach: guest.ten_khach,
                sdt_khach: guest.sdt_khach,
                ngay_tham_gia: guest.ngay_tham_gia || null
            }));

            window.hienToast(`🏸 Chào ${name}!`, "Đã vào sàn vãng lai. Chúc bạn tìm được kèo ưng ý!", "success");
            _hienThiDashboardKhach();
        } catch (e) {
            console.error("Lỗi đăng nhập khách:", e);
            window.hienToast("Lỗi kết nối", "Không thể xác thực. Thử lại sau.", "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Đăng Nhập Sàn'; }
        }
    };

    window.dangXuatKhach = function () {
        localStorage.removeItem("tvl_guest");
        window.currentGuest = null;
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
            // Tải ca_dau và dat_slot song song để đếm khách
            const [allCaDau, allDatSlot] = await Promise.all([
                window.dbEngine.doc("ca_dau"),
                window.dbEngine.doc("dat_slot").catch(() => [])
            ]);

            // Nhóm dat_slot theo id_ca_dau để đếm
            const datSlotMap = {};
            allDatSlot.forEach(s => {
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
                <div style="text-align:center;padding:40px 20px;color:#64748b;">
                    <i class="fa-solid fa-magnifying-glass" style="font-size:2rem;margin-bottom:12px;display:block;opacity:0.4;"></i>
                    <p style="font-size:0.9rem;">Không tìm thấy kèo phù hợp.</p>
                    <p style="font-size:0.8rem;margin-top:4px;">Thử thay đổi bộ lọc hoặc xem tất cả kèo.</p>
                </div>`;
                return;
            }

            results.forEach(slot => {
                const soKhach = (datSlotMap[slot.id] || []).length;
                const card = _taoCaCard(slot, soKhach);
                container.appendChild(card);
            });
        } catch (e) {
            console.error("Lỗi tìm kiếm:", e);
            container.innerHTML = `<div style="text-align:center;padding:30px;color:#ef4444;">
                Lỗi tải dữ liệu. Vui lòng thử lại.
            </div>`;
        }
    }

    function _taoCaCard(slot, soKhach = 0) {
        const card = document.createElement("div");
        card.className = "slot-card";

        const isToday = slot.ngay_danh === new Date().toLocaleDateString("sv-SE");

        // Badge giới tính (gioi_tinh_can = "Nam" | "Nữ" | "Cả hai")
        const genderMap = {
            "Nam":    '<span class="gender-badge male"><i class="fa-solid fa-mars"></i> Nam</span>',
            "Nữ":     '<span class="gender-badge female"><i class="fa-solid fa-venus"></i> Nữ</span>',
            "Cả hai": '<span class="gender-badge both"><i class="fa-solid fa-venus-mars"></i> Cả hai</span>'
        };
        const genderBadge = genderMap[slot.gioi_tinh_can] || "";

        // Trình độ từ JSONB yeu_cau_trinh_do
        const td = slot.yeu_cau_trinh_do || {};
        const mLevels = (td.nam || []).join(", ");
        const fLevels = (td.nu  || []).join(", ");
        let levelText = "";
        if (slot.gioi_tinh_can === "Cả hai") levelText = `Nam: ${mLevels || "--"} | Nữ: ${fLevels || "--"}`;
        else if (slot.gioi_tinh_can === "Nữ") levelText = fLevels || "--";
        else levelText = mLevels || "--";

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
                    ${slot.so_san_cu_the ? `<p style="font-size:0.75rem;color:#64748b;">Sân số: ${slot.so_san_cu_the} (${slot.so_san_mo || 1} sân)</p>` : ""}
                </div>

                <div class="slot-details-row">
                    <div class="slot-detail-item">
                        <span class="detail-label">Trình độ</span>
                        <span class="detail-value" style="font-size:0.75rem;">${levelText}</span>
                    </div>
                    <div class="slot-detail-item">
                        <span class="detail-label">Đã đăng ký</span>
                        <span class="detail-value">${soKhach} người</span>
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
                    <span style="font-size:0.78rem;color:#94a3b8;">Chủ sân: ${slot.ma_key_host || "--"}</span>
                    ${slot.link_maps ? `<a href="${slot.link_maps}" target="_blank" rel="noopener noreferrer"
                        style="font-size:0.76rem;color:#00ff88;margin-left:8px;">
                        <i class="fa-solid fa-map-location-dot"></i> Bản đồ</a>` : ""}
                </div>
            </div>

            <div class="slot-card-footer" style="display:flex;gap:8px;align-items:center;">
                <button class="kh-btn-detail" onclick="window.moModalChiTietKeo('${slot.id}')">
                    <i class="fa-solid fa-circle-info"></i> Chi tiết
                </button>
                ${window.currentGuest
                    ? `<button class="btn-dat-slot" style="flex:1;" onclick="window.datSlot('${slot.id}')">
                        <i class="fa-solid fa-ticket"></i> ĐẶT SLOT
                       </button>`
                    : `<button class="btn-dat-slot btn-dat-slot-disabled" style="flex:1;"
                        onclick="window.hienToast('Cần đăng nhập','Đăng nhập để đặt slot.','warning')">
                        <i class="fa-solid fa-lock"></i> ĐẶT SLOT
                       </button>`
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

            // INSERT vào bảng dat_slot
            await window.dbEngine.ghi("dat_slot", {
                id_ca_dau:         caDauId,
                ten_khach:         window.currentGuest.ten_khach,
                sdt_khach:         window.currentGuest.sdt_khach,
                ma_slot:           maSlot,
                gioi_tinh:         "male", // Mặc định, có thể cải tiến sau
                trang_thai_di_danh: "Chờ đánh"
            });

            window.hienToast("Đặt slot thành công! 🎉", `Mã của bạn: ${maSlot}. Liên hệ host qua Zalo để xác nhận.`, "success");
            _taiThongKeKhach();
            window.timKiemCaDau();
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

            let soCaBuoi = 0, tongChiTieu = 0;
            const hostSet = new Set();
            let soCho = 0;

            myDatSlots.forEach(slot => {
                const caDau = caDauMap[slot.id_ca_dau];
                if (!caDau) return;

                // Lọc theo khoảng thời gian
                if (fromDate && caDau.ngay_danh && caDau.ngay_danh < fromDate) return;
                if (toDate   && caDau.ngay_danh && caDau.ngay_danh > toDate)   return;

                // Đang chờ đánh (chưa chốt ca)
                if (!caDau.da_chot_ca && slot.trang_thai_di_danh === "Chờ đánh") {
                    soCho++;
                }

                // Đã tham gia
                if (slot.trang_thai_di_danh === "Đã tham gia") {
                    soCaBuoi++;
                    // Chỉ tính tiền khi ca đã chốt (da_chot_ca = true)
                    if (caDau.da_chot_ca) {
                        const gia = slot.gioi_tinh === "female" ? (caDau.gia_nu || 0) : (caDau.gia_nam || 0);
                        tongChiTieu += gia;
                        if (caDau.ma_key_host) hostSet.add(caDau.ma_key_host);
                    }
                }
            });

            // Cập nhật UI
            const el1 = document.getElementById("statsTotalSlots");
            const el2 = document.getElementById("statsTotalCost");
            const el3 = document.getElementById("statsTotalHosts");
            const el4 = document.getElementById("statsPending");
            if (el1) el1.textContent = `${soCaBuoi} Ca`;
            if (el2) el2.textContent = _formatVND(tongChiTieu);
            if (el3) el3.textContent = `${hostSet.size} Host`;
            if (el4) el4.textContent = `${soCho} Ca`;

        } catch (e) { console.error("Lỗi tải thống kê:", e); }
    }

    window.locNhanhThoiGian = function (loai, btnEl) {
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

        document.querySelectorAll(".btn-time-filter").forEach(b => b.classList.remove("active"));
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
            const [caDauList, datSlotList] = await Promise.all([
                window.dbEngine.doc("ca_dau", { eq: { id: idCaDau } }),
                window.dbEngine.doc("dat_slot", { eq: { id_ca_dau: idCaDau } })
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

            // Danh sách khách đã đăng ký (ẩn SĐT)
            const khoachDaKy = datSlotList.filter(g => g.trang_thai_di_danh !== "Khách hủy");
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
                        <div class="kh-modal-info-val">${s.so_san_cu_the || "--"} (${s.so_san_mo || 1} sân)</div>
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
            ${!s.da_chot_ca ? `
            <div style="padding-top:8px;border-top:1px solid var(--border);margin-top:8px;">
                ${window.currentGuest
                    ? `<button class="btn-dat-slot" style="width:100%;" onclick="window.datSlot('${s.id}');window.dongModalChiTietKeo()">
                        <i class="fa-solid fa-ticket"></i> ĐẶT SLOT THAM GIA
                       </button>`
                    : `<p style="text-align:center;font-size:0.82rem;color:#64748b;">
                        <a href="#" onclick="window.dongModalChiTietKeo()" style="color:#00ff88;">Đăng nhập</a>
                        để đặt slot tham gia ca này.</p>`
                }
            </div>` : `<div style="text-align:center;padding:10px;font-size:0.82rem;color:#64748b;">
                <i class="fa-solid fa-lock" style="color:#fbbf24;margin-right:6px;"></i>Ca đấu đã được chốt.
            </div>`}`;
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
            await Promise.all([_taiDaKySlot(), _taiThongKeKhach(), _taiLichSuChiTieu()]);
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
                        <div class="kh-slot-meta">${ngayDanh}${gioBD ? " · " + gioBD : ""} · <span style="color:${ttColor};font-weight:600;">${slot.trang_thai_di_danh}</span></div>
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
        _taiLichSuChiTieu();
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
            const [reviews, allCaDau] = await Promise.all([
                window.dbEngine.doc("danh_gia_tin_dung", {
                    eq: {
                        sdt_nguoi_bi_danh_gia: window.currentGuest.sdt_khach,
                        loai_danh_gia:         "HostToGuest"
                    }
                }).catch(() => []),
                window.dbEngine.doc("ca_dau").catch(() => [])
            ]);

            const caDauMap = {};
            allCaDau.forEach(c => { caDauMap[c.id] = c; });

            // Sắp xếp mới nhất trước
            reviews.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            if (reviews.length === 0) {
                container.innerHTML = `<p style="font-size:0.78rem;color:#64748b;text-align:center;padding:10px 0;">
                    Chưa có chủ sân nào đánh giá bạn.</p>`;
                return;
            }

            container.innerHTML = reviews.map(r => {
                const soSao  = Math.max(0, Math.min(5, r.so_sao || 0));
                const stars  = Array(5).fill(0).map((_, i) =>
                    `<i class="fa-solid fa-star" style="color:${i < soSao ? "#fbbf24" : "#2d3748"};font-size:0.78rem;"></i>`
                ).join("");
                const ca     = caDauMap[r.id_ca_dau];
                const caInfo = ca ? `${ca.ten_san || ""}${ca.ngay_danh ? " · " + new Date(ca.ngay_danh).toLocaleDateString("vi-VN") : ""}` : "";
                const nhanXet = r.nhan_xet || "";

                return `<div class="kh-review-about">
                    <div class="kh-review-stars">${stars}</div>
                    ${caInfo ? `<div style="font-size:0.7rem;color:#64748b;margin-bottom:3px;"><i class="fa-solid fa-table-tennis-paddle-ball" style="color:#00ff88;margin-right:4px;"></i>${caInfo}</div>` : ""}
                    ${nhanXet ? `<div style="font-size:0.78rem;color:var(--text-main);line-height:1.5;">"${nhanXet}"</div>` : `<div style="font-size:0.75rem;color:#64748b;font-style:italic;">Không có nhận xét</div>`}
                    <div style="font-size:0.68rem;color:#64748b;margin-top:4px;">
                        ${r.created_at ? new Date(r.created_at).toLocaleDateString("vi-VN") : ""}
                    </div>
                </div>`;
            }).join("");
        } catch (e) {
            console.error("Lỗi tải đánh giá về mình:", e);
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

    console.log("⚡ [Phân Hệ Khách Chơi v2.0]: Đồng bộ Supabase schema thật ✅");
})();
