/* =========================================================================
 * 🏸 PHÂN HỆ KHÁCH CHƠI VÃNG LAI - PHAN-HE-KHACH-CHOI.JS
 * Dự án: TUYENVANGLAI.IO.VN
 * Chức năng: Đăng nhập nhanh, tìm kiếm kèo cầu lông, đặt slot,
 *            hồ sơ cá nhân + thống kê chi tiêu, đánh giá host.
 * =========================================================================
 */

(function () {
    // ── Trạng thái toàn cục ──
    window.currentGuest = null;
    let _guestRatingVal = 5;
    let _filterTimeout = null;

    /* ═══════════════════════════════════════════════════
     * 1. KHỞI TẠO TRANG KHÁCH
     * ═══════════════════════════════════════════════════ */
    window.khoiTaoTrangKhach = function () {
        // Kiểm tra phiên cũ
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

        // Nạp tỉnh thành vào bộ lọc
        _napDropdownBoLoc();
        // Tải tất cả kèo mặc định
        window.timKiemCaDau();
        // Khởi tạo sao đánh giá
        _initStarGuest();
    };

    function _hienManDangNhap() {
        const auth = document.getElementById("guestAuthPanel");
        const profile = document.getElementById("guestProfileBlock");
        if (auth) auth.style.display = "block";
        if (profile) profile.style.display = "none";
    }

    function _hienThiDashboardKhach() {
        const auth = document.getElementById("guestAuthPanel");
        const profile = document.getElementById("guestProfileBlock");
        if (auth) auth.style.display = "none";
        if (profile) profile.style.display = "block";

        // Hiển thị tên và thông tin
        const g = window.currentGuest;
        if (!g) return;

        const nameEl = document.getElementById("profileGuestName");
        const phoneEl = document.getElementById("profileGuestPhone");
        const dateEl = document.getElementById("profileGuestDate");
        if (nameEl) nameEl.textContent = g.name || "Lông thủ ẩn danh";
        if (phoneEl) phoneEl.textContent = `SĐT: ${g.phone || "--"}`;
        if (dateEl) {
            const joined = g.joined_at ? new Date(g.joined_at).toLocaleDateString("vi-VN") : new Date().toLocaleDateString("vi-VN");
            dateEl.textContent = `Gia nhập: ${joined}`;
        }

        // Tải thống kê
        _taiThongKeKhach();
        // Tải danh sách host để đánh giá
        _taiDanhSachHostChoGuestDanhGia();
    }

    /* ═══════════════════════════════════════════════════
     * 2. ĐĂNG NHẬP NHANH (KHÔNG MẬT KHẨU)
     * ═══════════════════════════════════════════════════ */
    window.xacThucKhachChoi = async function () {
        const nameEl = document.getElementById("guestInputName");
        const phoneEl = document.getElementById("guestInputPhone");
        if (!nameEl || !phoneEl) return;

        const name = nameEl.value.trim();
        const phone = phoneEl.value.trim().replace(/\D/g, "");

        if (!name) { window.hienToast("Thiếu tên", "Vui lòng nhập tên hoặc biệt danh.", "danger"); return; }
        if (!phone || !/^[0-9]{9,11}$/.test(phone)) {
            window.hienToast("SĐT không hợp lệ", "Vui lòng nhập số điện thoại đúng (9-11 số).", "danger"); return;
        }

        const btn = document.querySelector("[onclick='xacThucKhachChoi()']");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối...'; }

        try {
            // Tra cứu khách cũ theo SĐT
            const users = await window.dbEngine.doc("users");
            let guest = users.find(u => u.phone === phone);

            if (!guest) {
                // Tạo mới hồ sơ
                const results = await window.dbEngine.ghi("users", {
                    name, phone,
                    role: "guest",
                    joined_at: new Date().toISOString()
                });
                guest = results[0];
            } else {
                // Cập nhật tên nếu đổi tên
                if (guest.name !== name) {
                    guest.name = name;
                    await window.dbEngine.ghi("users", { name }, { id: guest.id });
                }
            }

            window.currentGuest = guest;
            localStorage.setItem("tvl_guest", JSON.stringify(guest));

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
            opt.value = p.name;
            opt.textContent = p.name;
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
        if (prov) {
            prov.districts.forEach(d => {
                const opt = document.createElement("option");
                opt.value = d;
                opt.textContent = d;
                distSel.appendChild(opt);
            });
        }
    }

    window.capNhatQuanHuyenLoc = function () {
        const provVal = document.getElementById("filterProvince")?.value;
        _capNhatHuyenBoLoc(provVal);
    };

    /* ═══════════════════════════════════════════════════
     * 4. TÌM KIẾM & HIỂN THỊ CA ĐẤU
     * ═══════════════════════════════════════════════════ */
    window.timKiemCaDau = function () {
        clearTimeout(_filterTimeout);
        _filterTimeout = setTimeout(_thucHienTimKiem, 300);
    };

    async function _thucHienTimKiem() {
        const container = document.getElementById("slotsSearchResultContainer");
        const countEl = document.getElementById("countSearchResult");
        if (!container) return;

        container.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;margin-bottom:8px;display:block;"></i>
            Đang tìm kèo phù hợp...
        </div>`;

        const province = document.getElementById("filterProvince")?.value || "";
        const district = document.getElementById("filterDistrict")?.value || "";
        const gender = document.getElementById("filterGender")?.value || "";
        const level = document.getElementById("filterLevel")?.value || "";
        const maxPrice = Number(document.getElementById("filterMaxPrice")?.value) || 0;
        const courtName = document.getElementById("filterCourtName")?.value?.trim().toLowerCase() || "";
        const filterDate = document.getElementById("filterDate")?.value || "";
        const timeFrame = document.getElementById("filterTimeFrame")?.value || "";

        try {
            const all = await window.dbEngine.doc("slots");
            const now = new Date();
            const todayStr = now.toLocaleDateString("sv-SE");

            let results = all.filter(s => {
                // Chỉ hiện ca đang active và chưa chốt
                if (s.da_chot_ca || s.status === "closed") return false;
                // Chỉ hiện ca hôm nay trở đi
                if (s.date_play && s.date_play < todayStr) return false;

                // Lọc tỉnh
                if (province && s.province !== province) return false;
                // Lọc huyện
                if (district && s.district !== district) return false;
                // Lọc giới tính
                if (gender) {
                    if (gender === "male" && s.gender === "female") return false;
                    if (gender === "female" && s.gender === "male") return false;
                }
                // Lọc trình độ
                if (level) {
                    const mLevels = s.levels_male || s.levels || [];
                    const fLevels = s.levels_female || [];
                    const allLevels = [...mLevels, ...fLevels];
                    if (!allLevels.some(l => l.toLowerCase().includes(level.toLowerCase()))) return false;
                }
                // Lọc giá tối đa
                if (maxPrice > 0) {
                    const minPrice = Math.min(s.price_male || 0, s.price_female || s.price_male || 0);
                    if (minPrice > maxPrice) return false;
                }
                // Lọc tên sân
                if (courtName && !(s.court_name || "").toLowerCase().includes(courtName)) return false;
                // Lọc ngày
                if (filterDate && s.date_play !== filterDate) return false;
                // Lọc khung giờ
                if (timeFrame && s.time_start) {
                    const h = parseInt(s.time_start.split(":")[0]);
                    if (timeFrame === "morning" && (h < 5 || h >= 12)) return false;
                    if (timeFrame === "afternoon" && (h < 12 || h >= 17)) return false;
                    if (timeFrame === "evening" && (h < 17 || h >= 23)) return false;
                }
                return true;
            });

            // Sắp xếp: hôm nay trước, theo giờ bắt đầu gần nhất
            results.sort((a, b) => {
                const dtA = new Date(`${a.date_play}T${a.time_start || "00:00"}`);
                const dtB = new Date(`${b.date_play}T${b.time_start || "00:00"}`);
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
                const card = _taoCaCard(slot);
                container.appendChild(card);
            });
        } catch (e) {
            console.error("Lỗi tìm kiếm:", e);
            container.innerHTML = `<div style="text-align:center;padding:30px;color:hsl(var(--danger));">
                Lỗi tải dữ liệu. Vui lòng thử lại.
            </div>`;
        }
    }

    function _taoCaCard(slot) {
        const card = document.createElement("div");
        card.className = "slot-card";

        const guests = slot.registered_guests || [];
        const soKhach = guests.length;
        const isToday = slot.date_play === new Date().toLocaleDateString("sv-SE");

        // Badge giới tính
        const genderMap = { male: '<span class="gender-badge male"><i class="fa-solid fa-mars"></i> Nam</span>',
                            female: '<span class="gender-badge female"><i class="fa-solid fa-venus"></i> Nữ</span>',
                            both: '<span class="gender-badge both"><i class="fa-solid fa-venus-mars"></i> Cả hai</span>' };
        const genderBadge = genderMap[slot.gender] || "";

        // Trình độ
        const mLevels = (slot.levels_male || slot.levels || []).join(", ");
        const fLevels = (slot.levels_female || []).join(", ");
        let levelText = "";
        if (slot.gender === "both") levelText = `Nam: ${mLevels || "--"} | Nữ: ${fLevels || "--"}`;
        else if (slot.gender === "female") levelText = fLevels || "--";
        else levelText = mLevels || "--";

        // Tiện ích
        const tichs = [];
        if (slot.inc_court) tichs.push('<span class="tien-ich"><i class="fa-solid fa-map"></i> Sân</span>');
        if (slot.inc_shuttle) tichs.push('<span class="tien-ich"><i class="fa-solid fa-feather-pointed"></i> Cầu</span>');
        if (slot.inc_water) tichs.push('<span class="tien-ich"><i class="fa-solid fa-bottle-water"></i> Nước</span>');
        if (slot.inc_parking) tichs.push('<span class="tien-ich"><i class="fa-solid fa-motorcycle"></i> Gửi xe</span>');

        // Ngày giờ
        const dateObj = new Date(slot.date_play);
        const dateStr = dateObj.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" });

        card.innerHTML = `
        <div class="slot-card-inner">
            <div class="slot-card-header">
                <div class="slot-header-left">
                    ${isToday ? '<span class="badge-today">🔥 HÔM NAY</span>' : ''}
                    <span class="slot-date">${dateStr}</span>
                    <span class="slot-time"><i class="fa-regular fa-clock"></i> ${slot.time_start || "--"} – ${slot.time_end || "--"} (${slot.duration || 0}h)</span>
                </div>
                <div class="slot-header-right">
                    ${genderBadge}
                </div>
            </div>

            <div class="slot-card-body">
                <div class="slot-court-info">
                    <h4 class="slot-court-name"><i class="fa-solid fa-location-dot" style="color:hsl(var(--neon-mint));margin-right:6px;"></i>${slot.court_name || "Chưa có tên sân"}</h4>
                    <p class="slot-court-address">${slot.court_address || ""}</p>
                    <p class="slot-location">${slot.district || ""}, ${slot.province || ""}</p>
                    ${slot.court_number ? `<p style="font-size:0.75rem;color:#64748b;">Sân số: ${slot.court_number} (${slot.court_quantity || 1} sân)</p>` : ""}
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
                        <span class="price-value">${_formatVND(slot.price_male)}</span>
                    </div>
                    <div class="price-item price-female">
                        <span class="price-label"><i class="fa-solid fa-venus"></i> Nữ</span>
                        <span class="price-value">${_formatVND(slot.price_female)}</span>
                    </div>
                </div>

                ${tichs.length > 0 ? `<div class="tien-ich-row">Bao gồm: ${tichs.join("")}</div>` : ""}

                <div class="slot-host-row">
                    <i class="fa-solid fa-user-tie" style="color:#64748b;font-size:0.8rem;"></i>
                    <span style="font-size:0.78rem;color:#94a3b8;">${slot.host_name || "Chủ Sân"}</span>
                </div>
            </div>

            <div class="slot-card-footer">
                ${window.currentGuest
                    ? `<button class="btn-dat-slot" onclick="window.datSlot('${slot.id}')">
                        <i class="fa-solid fa-ticket"></i> ĐẶT SLOT THAM GIA
                       </button>`
                    : `<button class="btn-dat-slot btn-dat-slot-disabled" onclick="window.hienToast('Cần đăng nhập','Đăng nhập để đặt slot.','warning')">
                        <i class="fa-solid fa-lock"></i> ĐĂNG NHẬP ĐỂ ĐẶT SLOT
                       </button>`
                }
            </div>
        </div>`;

        return card;
    }

    /* ═══════════════════════════════════════════════════
     * 5. ĐẶT SLOT THAM GIA
     * ═══════════════════════════════════════════════════ */
    window.datSlot = async function (slotId) {
        if (!window.currentGuest) {
            window.hienToast("Chưa đăng nhập", "Vui lòng đăng nhập trước.", "warning");
            return;
        }

        try {
            const all = await window.dbEngine.doc("slots");
            const slot = all.find(s => s.id === slotId);
            if (!slot) { window.hienToast("Không tìm thấy", "Ca đấu không còn tồn tại.", "danger"); return; }
            if (slot.da_chot_ca) { window.hienToast("Đã đóng", "Ca đấu này đã được chốt, không nhận thêm người.", "warning"); return; }

            // Kiểm tra đã đăng ký chưa
            const guests = slot.registered_guests || [];
            const alreadyReg = guests.find(g => (g.phone || g.sdt_khach) === window.currentGuest.phone);
            if (alreadyReg) {
                window.hienToast("Đã đăng ký rồi", `Bạn đã có mã slot: ${alreadyReg.slot_code || alreadyReg.ma_slot}`, "info");
                return;
            }

            // Sinh mã SLOT-XXXXX
            const slotCode = "SLOT-" + Math.random().toString(36).slice(2, 7).toUpperCase();

            const newGuest = {
                name: window.currentGuest.name,
                ten_khach: window.currentGuest.name,
                phone: window.currentGuest.phone,
                sdt_khach: window.currentGuest.phone,
                slot_code: slotCode,
                ma_slot: slotCode,
                attendance: "Chờ đánh",
                trang_thai: "Chờ đánh",
                registered_at: new Date().toISOString(),
                host_review_sent: false,
                guest_review_sent: false
            };

            const updatedGuests = [...guests, newGuest];
            await window.dbEngine.ghi("slots", { ...slot, registered_guests: updatedGuests }, { id: slotId });

            window.hienToast("Đặt slot thành công! 🎉", `Mã của bạn: ${slotCode}. Liên hệ host qua Zalo để xác nhận.`, "success");
            _taiThongKeKhach();
            window.timKiemCaDau();
        } catch (e) {
            console.error("Lỗi đặt slot:", e);
            window.hienToast("Lỗi", "Không thể đặt slot. Thử lại sau.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 6. THỐNG KÊ HỒ SƠ CÁ NHÂN KHÁCH
     * ═══════════════════════════════════════════════════ */
    window.locThongKeKhach = _taiThongKeKhach;

    async function _taiThongKeKhach() {
        if (!window.currentGuest) return;

        const fromDate = document.getElementById("statsDateFrom")?.value;
        const toDate = document.getElementById("statsDateTo")?.value;

        try {
            const all = await window.dbEngine.doc("slots");
            const myPhone = window.currentGuest.phone;

            let soCaBuoi = 0, tongChiTieu = 0;
            const hostSet = new Set();

            all.forEach(slot => {
                // Lọc theo thời gian nếu có
                if (fromDate && slot.date_play && slot.date_play < fromDate) return;
                if (toDate && slot.date_play && slot.date_play > toDate) return;

                const guests = slot.registered_guests || [];
                const myRecord = guests.find(g => (g.phone || g.sdt_khach) === myPhone &&
                    (g.attendance === "Đã tham gia" || g.attendance === "present"));

                if (myRecord) {
                    soCaBuoi++;
                    // Tính tiền dựa trên giới tính (mặc định tính theo giá thấp hơn)
                    const gia = slot.price_male || slot.price_female || 0;
                    tongChiTieu += gia;
                    if (slot.host_key) hostSet.add(slot.host_key);
                }
            });

            // Cập nhật UI thống kê
            const el1 = document.getElementById("statsTotalSlots");
            const el2 = document.getElementById("statsTotalCost");
            const el3 = document.getElementById("statsTotalHosts");
            const el4 = document.getElementById("statsPending");

            if (el1) el1.textContent = `${soCaBuoi} Ca`;
            if (el2) el2.textContent = _formatVND(tongChiTieu);
            if (el3) el3.textContent = `${hostSet.size} Host`;

            // Đang chờ đánh
            let soCho = 0;
            all.forEach(slot => {
                if (slot.da_chot_ca) return;
                const guests = slot.registered_guests || [];
                const myRecord = guests.find(g => (g.phone || g.sdt_khach) === myPhone &&
                    g.attendance === "Chờ đánh");
                if (myRecord) soCho++;
            });
            if (el4) el4.textContent = `${soCho} Ca`;

        } catch (e) {
            console.error("Lỗi tải thống kê:", e);
        }
    }

    // Nút lọc nhanh thời gian
    window.locNhanhThoiGian = function (loai, btnEl) {
        const now = new Date();
        const fromEl = document.getElementById("statsDateFrom");
        const toEl = document.getElementById("statsDateTo");
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
            toEl.value = "";
            _taiThongKeKhach();
            return;
        }
        toEl.value = toStr;
        _taiThongKeKhach();

        // Highlight nút được chọn
        document.querySelectorAll(".btn-time-filter").forEach(b => b.classList.remove("active"));
        if (btnEl) btnEl.classList.add("active");
    };

    /* ═══════════════════════════════════════════════════
     * 7. HỆ THỐNG ĐÁNH GIÁ HOST (3 ĐIỀU KIỆN AND)
     * ═══════════════════════════════════════════════════ */
    async function _taiDanhSachHostChoGuestDanhGia() {
        if (!window.currentGuest) return;
        const sel = document.getElementById("guestReviewHostSelect");
        if (!sel) return;

        sel.innerHTML = '<option value="">-- Đang tải... --</option>';

        try {
            const all = await window.dbEngine.doc("slots");
            const myPhone = window.currentGuest.phone;

            // Lọc ra các ca đủ điều kiện để guest đánh giá:
            // 1. Đã đăng ký (có trong registered_guests)
            // 2. Đã chốt ca (da_chot_ca = true)
            // 3. Host đã xác nhận "Đã tham gia"
            const eligible = [];

            all.forEach(slot => {
                if (!slot.da_chot_ca && slot.status !== "closed") return;
                const guests = slot.registered_guests || [];
                const myRecord = guests.find(g => (g.phone || g.sdt_khach) === myPhone);
                if (!myRecord) return;
                if (myRecord.attendance !== "Đã tham gia" && myRecord.attendance !== "present") return;

                eligible.push({
                    slot,
                    myRecord,
                    alreadyReviewed: myRecord.guest_review_sent
                });
            });

            sel.innerHTML = '<option value="">-- Chọn ca đấu để đánh giá --</option>';
            if (eligible.length === 0) {
                sel.innerHTML += '<option disabled>Chưa có ca đấu đủ điều kiện</option>';
                return;
            }

            eligible.forEach(({ slot, alreadyReviewed }) => {
                const opt = document.createElement("option");
                opt.value = slot.id;
                const dateStr = slot.date_play ? new Date(slot.date_play).toLocaleDateString("vi-VN") : "--";
                opt.textContent = `${slot.court_name} | ${dateStr} ${alreadyReviewed ? "✅ Đã đánh giá" : ""}`;
                if (alreadyReviewed) opt.disabled = true;
                sel.appendChild(opt);
            });
        } catch (e) {
            console.error("Lỗi tải host list:", e);
            sel.innerHTML = '<option value="">Lỗi tải dữ liệu</option>';
        }
    }

    window.guiDanhGiaHost = async function () {
        if (!window.currentGuest) { window.hienToast("Chưa đăng nhập", "Vui lòng đăng nhập trước.", "warning"); return; }

        const sel = document.getElementById("guestReviewHostSelect");
        const comment = document.getElementById("guestReviewComment")?.value?.trim();
        const slotId = sel?.value;

        if (!slotId) { window.hienToast("Chưa chọn ca", "Vui lòng chọn ca đấu cần đánh giá.", "warning"); return; }

        try {
            const all = await window.dbEngine.doc("slots");
            const slot = all.find(s => s.id === slotId);
            if (!slot) { window.hienToast("Lỗi", "Không tìm thấy ca đấu.", "danger"); return; }

            const myPhone = window.currentGuest.phone;
            const guests = [...(slot.registered_guests || [])];
            const myIdx = guests.findIndex(g => (g.phone || g.sdt_khach) === myPhone);

            if (myIdx === -1) { window.hienToast("Lỗi", "Bạn không có trong danh sách ca này.", "danger"); return; }
            if (guests[myIdx].guest_review_sent) { window.hienToast("Đã đánh giá", "Bạn đã gửi đánh giá cho ca này rồi.", "warning"); return; }

            // Ghi đánh giá
            await window.dbEngine.ghi("reviews", {
                slot_id: slotId,
                reviewer_phone: myPhone,
                reviewed_phone: slot.host_phone || slot.host_key,
                loai: "GuestToHost",
                so_sao: _guestRatingVal,
                nhan_xet: comment,
                created_at: new Date().toISOString()
            });

            // Đánh dấu đã đánh giá
            guests[myIdx] = { ...guests[myIdx], guest_review_sent: true, guest_rating: _guestRatingVal };
            await window.dbEngine.ghi("slots", { ...slot, registered_guests: guests }, { id: slotId });

            window.hienToast("Đánh giá thành công! ⭐", `Đã gửi ${_guestRatingVal} sao cho ${slot.host_name || "Chủ Sân"}.`, "success");

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
            s.addEventListener("click", () => { onSelect(i); _capNhatStarUI(ctr, i); ctr.dataset.sel = i; });
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
            s.style.color = i < val ? "hsl(var(--neon-gold))" : "#374151";
            s.style.transform = i < val ? "scale(1.1)" : "scale(1)";
        });
    }

    /* ═══════════════════════════════════════════════════
     * 9. TIỆN ÍCH
     * ═══════════════════════════════════════════════════ */
    function _formatVND(n) {
        return Number(n || 0).toLocaleString("vi-VN") + "đ";
    }

    // Expose cho trang khach.html tự khởi động
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

    console.log("⚡ [Phân Hệ Khách Chơi]: Khởi động thành công.");
})();
