/* =========================================================================
 * 🏸 PHÂN HỆ KHÁCH CHƠI VÃNG LAI - PHAN-HE-KHACH-CHOI.JS
 * Dự án: TUYENVANGLAI.IO.VN
 * Chức năng: Quản lý logic truy cập nhanh của Guest, tìm kiếm và lọc kèo đấu 
 *            badminton trên 63 tỉnh thành Việt Nam, đăng ký/hủy slot, 
 *            thống kê chi tiêu thời gian và bình chọn sao uy tín cho Host.
 * =========================================================================
 */

(function () {
    // Biến trạng thái đăng nhập khách chơi hiện tại ở phạm vi toàn cục window
    window.currentGuest = null;
    let currentRatingIndex = 5; // Điểm đánh giá sao mặc định dành cho Host

    // 1. Khởi tạo trang Khách chơi độc lập (cho khach.html)
    window.khoiTaoTrangKhach = function () {
        // Kiểm tra xem đã có phiên đăng nhập của khách trước đó lưu ở LocalStorage chưa
        const savedGuest = localStorage.getItem("tvl_logged_guest");
        if (savedGuest && savedGuest !== "null") {
            try {
                window.currentGuest = JSON.parse(savedGuest);
                window.hienThiDashboardKhach();
            } catch (e) {
                console.error("Lỗi parse saved guest:", e);
                window.currentGuest = null;
                window.hienThiGiaoDienChuaDangNhap();
            }
        } else {
            window.currentGuest = null;
            window.hienThiGiaoDienChuaDangNhap();
        }

        // Luôn nạp tỉnh thành và tìm kiếm các ca đấu sẵn có (kể cả chưa đăng nhập)
        window.napTinhThanhVaTimKiemSlot();
        window.khoiTaoDanhGiaStarsKhach();
    };

    // Hiển thị giao diện khi chưa đăng nhập
    window.hienThiGiaoDienChuaDangNhap = function () {
        const authPanel = document.getElementById("guestAuthPanel");
        const profileBlock = document.getElementById("guestProfileBlock");
        if (authPanel) authPanel.classList.remove("d-none");
        if (profileBlock) profileBlock.classList.add("d-none");

        const inputName = document.getElementById("guestInputName");
        const inputPhone = document.getElementById("guestInputPhone");
        if (inputName) inputName.value = "";
        if (inputPhone) inputPhone.value = "";
    };

    // 2. Xác thực định danh khách chơi siêu tốc không mật khẩu
    window.xacThucKhachChoi = async function () {
        const nameInput = document.getElementById("guestInputName");
        const phoneInput = document.getElementById("guestInputPhone");
        if (!nameInput || !phoneInput) return;

        const name = nameInput.value.trim();
        const phone = phoneInput.value.trim();

        if (!name || !phone) {
            window.hienToast("Dữ liệu trống", "Cầu thủ vui lòng điền đầy đủ Họ tên và Số điện thoại.", "danger");
            return;
        }

        // Định dạng SĐT thô
        if (!/^[0-9]{9,11}$/.test(phone)) {
            window.hienToast("SĐT không hợp lệ", "Vui lòng nhập số điện thoại đúng chuẩn từ 9 - 11 số.", "warning");
            return;
        }

        try {
            // Tra cứu cơ sở dữ liệu users xem có thông tin khách hàng cũ chưa
            const users = await window.dbEngine.doc("users");
            let player = users.find(p => p.phone === phone);

            if (!player) {
                // Tạo mới hồ sơ cầu thủ vãng lai
                const results = await window.dbEngine.ghi("users", {
                    name: name,
                    phone: phone,
                    role: "guest",
                    registered_slots: 0,
                    total_spent: 0
                });
                player = results[0];
            } else {
                // Nếu khách cũ có đổi tên, đồng bộ cập nhật lại
                player.name = name;
                await window.dbEngine.ghi("users", player, { id: player.id });
            }

            window.currentGuest = player;
            localStorage.setItem("tvl_logged_guest", JSON.stringify(player));

            window.hienToast("Chào mừng cầu thủ", `Xin chào lông thủ ${name}! Chúc bạn tìm được kèo ưng ý.`, "success");
            window.hienThiDashboardKhach();
        } catch (e) {
            console.error("Lỗi xác thực khách chơi:", e);
            window.hienToast("Lỗi kết nối", "Không thể xác thực thông tin cầu thủ lên đám mây.", "danger");
        }
    };

    // 3. Hiển thị Dashboard tương tác dành cho Khách chơi đã đăng nhập
    window.hienThiDashboardKhach = async function () {
        const authPanel = document.getElementById("guestAuthPanel");
        const profileBlock = document.getElementById("guestProfileBlock");
        if (authPanel) authPanel.classList.add("d-none");
        if (profileBlock) profileBlock.classList.remove("d-none");

        // Cập nhật giao diện cá nhân
        const profileName = document.getElementById("profileGuestName");
        const profilePhone = document.getElementById("profileGuestPhone");
        const profileDate = document.getElementById("profileGuestDate");

        if (profileName) profileName.innerText = window.currentGuest.name;
        if (profilePhone) profilePhone.innerText = `SĐT: ${window.currentGuest.phone}`;
        if (profileDate) {
            const joinDate = window.currentGuest.created_at ? new Date(window.currentGuest.created_at) : new Date();
            profileDate.innerText = `Ký danh: ${joinDate.toLocaleDateString("vi-VN")}`;
        }

        // Tải danh sách Hosts vào ô chọn đánh giá (review host)
        try {
            const slots = await window.dbEngine.doc("slots");
            const selectHost = document.getElementById("guestReviewHostSelect");
            if (selectHost) {
                selectHost.innerHTML = '<option value="">-- Chọn Host đã từng chơi --</option>';
                const uniqueHosts = [...new Set(slots.map(s => s.host_key).filter(Boolean))];
                uniqueHosts.forEach(hKey => {
                    const opt = document.createElement("option");
                    opt.value = hKey;
                    opt.innerText = `Host Trạm: ${hKey.substring(0, 16)}...`;
                    selectHost.appendChild(opt);
                });
            }
        } catch (e) {
            console.warn("Không thể tải danh sách Host để đánh giá:", e);
        }

        // Thiết lập bộ lọc thời gian mặc định cho Thống kê (Lọc 30 ngày gần đây)
        const dateToInput = document.getElementById("statsDateTo");
        const dateFromInput = document.getElementById("statsDateFrom");
        if (dateToInput && dateFromInput) {
            const today = new Date().toLocaleDateString('sv-SE');
            dateToInput.value = today;

            const dateMonthAgo = new Date();
            dateMonthAgo.setDate(dateMonthAgo.getDate() - 30);
            dateFromInput.value = dateMonthAgo.toLocaleDateString('sv-SE');
        }

        // Cập nhật thống kê chi tiêu
        window.locThongKeKhach();
    };

    // Đăng xuất khách chơi
    window.dangXuatKhach = function () {
        localStorage.removeItem("tvl_logged_guest");
        window.currentGuest = null;
        window.hienToast("Đã đăng xuất", "Hẹn gặp lại lông thủ!", "info");
        window.hienThiGiaoDienChuaDangNhap();
        window.timKiemCaDau(); // Cập nhật lại danh sách ca đấu để chuyển đổi nút bấm về trạng thái khách vãng lai
    };

    // 4. Lọc thống kê tần suất chơi & Tổng chi tiêu của cá nhân Khách
    window.locThongKeKhach = async function () {
        const dateFromInput = document.getElementById("statsDateFrom");
        const dateToInput = document.getElementById("statsDateTo");
        if (!dateFromInput || !dateToInput || !window.currentGuest) return;

        const dateFrom = dateFromInput.value;
        const dateTo = dateToInput.value;

        if (!dateFrom || !dateTo) return;

        try {
            const slots = await window.dbEngine.doc("slots");
            
            // Lọc ra các ca đấu mà khách đã đăng ký tham gia nằm trong khoảng thời gian lọc
            const registeredList = slots.filter(slot => {
                const registerPlayers = slot.registered_guests || [];
                const matched = registerPlayers.some(p => p.phone === window.currentGuest.phone);
                const playDate = slot.date_play;
                return matched && playDate >= dateFrom && playDate <= dateTo;
            });

            const totalSlotsElem = document.getElementById("statsTotalSlots");
            const totalCostElem = document.getElementById("statsTotalCost");

            if (totalSlotsElem) totalSlotsElem.innerText = `${registeredList.length} Ca`;

            let totalSpent = 0;
            registeredList.forEach(slot => {
                const regData = slot.registered_guests.find(p => p.phone === window.currentGuest.phone);
                const price = regData.gender === "female" ? (slot.price_female || slot.price_male) : slot.price_male;
                totalSpent += Number(price || 0);
            });

            if (totalCostElem) totalCostElem.innerText = `${totalSpent.toLocaleString("vi-VN")}đ`;
        } catch (e) {
            console.error("Lỗi khi thống kê lịch sử khách chơi:", e);
        }
    };

    // 5. Nạp cấu trúc địa phận tỉnh thành Việt Nam vào dropdown
    window.napTinhThanhVaTimKiemSlot = function () {
        const filterProv = document.getElementById("filterProvince");
        if (!filterProv) return;

        filterProv.innerHTML = '<option value="">-- Toàn Quốc --</option>';
        if (window.MOCK_PROVINCES) {
            window.MOCK_PROVINCES.forEach(prov => {
                const opt = document.createElement("option");
                opt.value = prov.name;
                opt.innerText = prov.name;
                filterProv.appendChild(opt);
            });
        }

        window.capNhatQuanHuyenLoc();
        window.timKiemCaDau();
    };

    // Cập nhật nhanh quận/huyện tương ứng với tỉnh thành đã chọn
    window.capNhatQuanHuyenLoc = function () {
        const provSelect = document.getElementById("filterProvince");
        const distSelect = document.getElementById("filterDistrict");
        if (!provSelect || !distSelect) return;

        const selectedProvName = provSelect.value;
        distSelect.innerHTML = '<option value="">-- Tất cả Quận/Huyện --</option>';

        if (window.MOCK_PROVINCES) {
            const matchedProv = window.MOCK_PROVINCES.find(p => p.name === selectedProvName);
            if (matchedProv) {
                matchedProv.districts.forEach(dist => {
                    const opt = document.createElement("option");
                    opt.value = dist;
                    opt.innerText = dist;
                    distSelect.appendChild(opt);
                });
            }
        }
    };

    // 6. Tìm kiếm và lọc danh sách ca cầu lông vãng lai đang mở
    window.timKiemCaDau = async function () {
        const prov = document.getElementById("filterProvince")?.value || "";
        const dist = document.getElementById("filterDistrict")?.value || "";
        const gender = document.getElementById("filterGender")?.value || "";
        const level = document.getElementById("filterLevel")?.value || "";
        const maxPrice = Number(document.getElementById("filterMaxPrice")?.value) || Infinity;
        const courtName = document.getElementById("filterCourtName")?.value.trim().toLowerCase() || "";
        const filterDate = document.getElementById("filterDate")?.value || "";
        const filterTimeFrame = document.getElementById("filterTimeFrame")?.value || "";

        try {
            const slots = await window.dbEngine.doc("slots");
            console.log(`[Tìm kiếm] Tổng slots từ dbEngine: ${slots.length}`);

            // Chỉ hiển thị những ca đấu có trạng thái hoạt động (không lọc "locked" ra)
            const activeSlots = slots.filter(s => {
                const isActive = s.status === "active" || !s.status;
                if (!isActive) console.log(`[Filter] Bỏ slot ${s.id} vì status=${s.status}`);
                return isActive;
            });
            console.log(`[Tìm kiếm] Slots active: ${activeSlots.length}`);

            // Tiến hành lọc dữ liệu
            const filtered = activeSlots.filter(slot => {
                if (prov && slot.province !== prov) return false;
                if (dist && slot.district !== dist) return false;
                
                // Lọc giới tính: "both" luôn khớp với mọi filter; "male"/"female" chỉ khớp với chính nó hoặc "both"
                if (gender) {
                    if (slot.gender !== "both" && slot.gender !== gender) return false;
                }
                
                // Lọc trình độ
                if (level) {
                    const levelsList = slot.levels || [];
                    if (!levelsList.includes(level)) return false;
                }

                // Lọc theo chi phí (Giá Nam làm chuẩn)
                const price = slot.price_male || 0;
                if (price > maxPrice) return false;

                // Lọc tên sân cầu lông
                if (courtName && !slot.court_name.toLowerCase().includes(courtName)) return false;

                // Lọc theo ngày chơi cụ thể
                if (filterDate && slot.date_play !== filterDate) return false;

                // Lọc theo khung giờ ca chơi
                if (filterTimeFrame) {
                    const startTime = slot.time_start || "";
                    const hour = parseInt(startTime.split(":")[0]) || 0;
                    if (filterTimeFrame === "morning" && (hour < 5 || hour >= 12)) return false;
                    if (filterTimeFrame === "afternoon" && (hour < 12 || hour >= 17)) return false;
                    if (filterTimeFrame === "evening" && (hour < 17 || hour >= 23)) return false;
                }

                return true;
            });
            
            console.log(`[Tìm kiếm] Kết quả sau lọc: ${filtered.length} slot(s)`);

            const countResult = document.getElementById("countSearchResult");
            if (countResult) countResult.innerText = filtered.length;

            hienThiSlotsKhach(filtered);
        } catch (e) {
            console.error("Lỗi khi tìm ca đấu:", e);
        }
    };


    // Render HTML các Card Kèo Cầu Lông Vãng Lai
    function hienThiSlotsKhach(slots) {
        const container = document.getElementById("slotsSearchResultContainer");
        if (!container) return;

        container.innerHTML = "";

        if (slots.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; border: 1px dashed hsl(var(--border)); border-radius: 12px; background: rgba(0,0,0,0.01);">
                    <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; display:block; margin-bottom:12px; color: hsl(var(--muted-foreground));"></i>
                    <p style="color: hsl(var(--muted-foreground)); font-size: 0.9rem; line-height: 1.6;">Không tìm thấy ca đấu cầu lông phù hợp với bộ lọc hiện tại.<br><span style="font-size:0.8rem; opacity:0.7;">Hãy thử thay đổi bộ lọc hoặc tìm kiếm toàn quốc.</span></p>
                </div>`;
            return;
        }

        slots.forEach(slot => {
            const isRegistered = window.currentGuest && (slot.registered_guests || []).some(p => p.phone === window.currentGuest.phone);
            const regCount = (slot.registered_guests || []).length;
            const limitPlayers = (slot.court_quantity || 1) * 6; // Tiêu chuẩn 6 slot/sân
            
            const includesList = [];
            if (slot.inc_court) includesList.push("Tiền Sân");
            if (slot.inc_shuttle) includesList.push("Quả Cầu");
            if (slot.inc_water) includesList.push("Nước uống");
            if (slot.inc_parking) includesList.push("Gửi xe");

            // Huy hiệu giới tính
            let genderBadge = "";
            if (slot.gender === "both") {
                genderBadge = `<span class="chip-item chip-item-mint"><i class="fa-solid fa-venus-mars"></i> Cả Nam & Nữ</span>`;
            } else if (slot.gender === "male") {
                genderBadge = `<span class="chip-item" style="color:hsl(var(--neon-cyan)); border-color:rgba(0,195,255,0.2);"><i class="fa-solid fa-mars"></i> Chỉ Tuyển Nam</span>`;
            } else {
                genderBadge = `<span class="chip-item" style="color:hsl(var(--neon-pink)); border-color:rgba(255,0,127,0.2);"><i class="fa-solid fa-venus"></i> Chỉ Tuyển Nữ</span>`;
            }

            // Format số sân hiển thị đẹp
            const courtNumberDisplay = chuanHoaSoSan(slot.court_number);
            
            // Format giá tiền với dấu phân cách nghìn và đơn vị
            const priceMaleStr = Number(slot.price_male).toLocaleString("vi-VN") + "đ";
            const priceFemaleStr = Number(slot.price_female || slot.price_male).toLocaleString("vi-VN") + "đ";

            // Màu thanh trạng thái cho phần trăm đã đăng ký
            const fillPercent = Math.min(100, Math.round((regCount / limitPlayers) * 100));
            const fillColor = fillPercent >= 100 ? "#ef4444" : fillPercent >= 70 ? "hsl(var(--neon-gold))" : "hsl(var(--neon-mint))";

            const card = document.createElement("div");
            card.className = "card-keo-cauthi";
            
            // Nếu ca đấu đã khóa kết toán, mờ đi
            if (slot.status === "locked") {
                card.style.opacity = "0.75";
            }

            card.innerHTML = `
                <div class="card-keo-header">
                    ${slot.status === "locked" 
                        ? `<span class="card-badge" style="background: rgba(100,116,139,0.15); color: #94a3b8; border: 1px solid rgba(100,116,139,0.25);"><i class="fa-solid fa-lock"></i> ĐÃ CHỐT CA</span>`
                        : `<span class="card-badge badge-mint"><i class="fa-solid fa-circle-play"></i> KÈO HOẠT ĐỘNG</span>`
                    }
                    <span class="card-keo-price">
                        ♂️ ${priceMaleStr} | ♀️ ${priceFemaleStr}
                    </span>
                </div>
                <div style="margin: 10px 0;">
                    <h4 class="card-keo-title">
                        ${slot.court_name} 
                        <span style="font-size:0.8rem;" class="text-mint">[${courtNumberDisplay}]</span>
                    </h4>
                    <p class="card-keo-address-text"><i class="fa-solid fa-location-dot text-mint" style="margin-right:4px;"></i>${slot.court_address}</p>
                </div>
                <div class="card-keo-meta-box">
                    <div class="card-keo-meta-row"><i class="fa-regular fa-calendar-days text-mint" style="width:18px;"></i> Ngày chơi: <b>${new Date(slot.date_play).toLocaleDateString("vi-VN")}</b></div>
                    <div class="card-keo-meta-row"><i class="fa-regular fa-clock text-mint" style="width:18px;"></i> Giờ đấu: <b>${slot.time_start} - ${slot.time_end}</b> (${slot.duration} giờ)</div>
                    <div class="card-keo-meta-row" style="display:flex; align-items:center; gap:6px;"><i class="fa-solid fa-venus-mars text-mint" style="width:18px;"></i> Giới tính: ${genderBadge}</div>
                    <div class="card-keo-meta-row" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <i class="fa-solid fa-ranking-star text-mint" style="width:18px;"></i> Trình độ: 
                        <span class="chip-group">
                            ${(slot.levels || []).map(lvl => `<span class="chip-item chip-item-mint">${lvl}</span>`).join("")}
                        </span>
                    </div>
                    <div class="card-keo-meta-row"><i class="fa-solid fa-square-check text-mint" style="width:18px;"></i> Dịch vụ trọn gói: <b class="text-mint">${includesList.join(", ") || "Chưa thiết lập"}</b></div>
                </div>
                
                <!-- Thanh tiến trình slot đã đăng ký -->
                <div style="margin-bottom: 12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <span class="card-keo-count-text">👥 Đã đăng ký: <b>${regCount}</b> / ${limitPlayers} Slots</span>
                        <span style="font-size:0.72rem; color: hsl(var(--muted-foreground));">${fillPercent}% đầy</span>
                    </div>
                    <div style="height:4px; background: rgba(255,255,255,0.06); border-radius:99px; overflow:hidden;">
                        <div style="height:100%; width:${fillPercent}%; background:${fillColor}; border-radius:99px; transition:width 0.6s ease;"></div>
                    </div>
                </div>
                
                <div class="flex justify-between align-center" style="gap:10px;">
                    ${slot.status === "locked"
                        ? `<span class="chip-item" style="color:#64748b; border-color:rgba(100,116,139,0.15);"><i class="fa-solid fa-lock"></i> Đã Chốt Ca</span>`
                        : (isRegistered 
                            ? `<button class="btn-cyber" style="flex:1; max-width: 140px; border-color: hsl(var(--danger)); color: hsl(var(--danger)); box-shadow: none;" onclick="huySlotVangLai('${slot.id}')"><i class="fa-solid fa-user-xmark"></i> Hủy Kèo</button>` 
                            : `<button class="btn-cyber-gold w-full btn-register-slot" onclick="dangKySlotVangLai('${slot.id}')"><i class="fa-solid fa-user-plus"></i> Đăng Ký Kèo Ngay</button>`
                        )
                    }
                </div>
            `;
            container.appendChild(card);
        });
    }

    // Hàm chuẩn hóa số sân: nhập "1,2" hoặc "1.2" → "Sân 1, Sân 2"
    function chuanHoaSoSan(courtNumber) {
        if (!courtNumber) return "Chung";
        // Nếu đã có dạng "Sân X" thì trả về nguyên
        if (/sân/i.test(courtNumber)) return courtNumber;
        // Tách bằng dấu phẩy hoặc dấu chấm
        const parts = courtNumber.split(/[,\.]+/).map(s => s.trim()).filter(Boolean);
        if (parts.length === 0) return courtNumber;
        return parts.map(p => `Sân ${p}`).join(", ");
    }


    // 7. Đăng ký tham ca chơi vãng lai badminton
    window.dangKySlotVangLai = async function (slotId) {
        if (!window.currentGuest) {
            window.hienToast("Yêu cầu ký danh", "Vui lòng điền thông tin ký danh siêu tốc ở cột trái trước khi đặt slot.", "warning");
            
            // Rung lắc nhẹ form ký danh để thu hút sự chú ý
            const authPanel = document.getElementById("guestAuthPanel");
            if (authPanel) {
                authPanel.classList.add("shake-animation");
                setTimeout(() => authPanel.classList.remove("shake-animation"), 500);
                authPanel.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            return;
        }

        try {
            const slots = await window.dbEngine.doc("slots");
            const slot = slots.find(s => s.id === slotId);
            if (!slot) return;

            if (slot.status === "locked") {
                window.hienToast("Ca đã khóa", "Kèo đấu cầu lông này đã được Host chốt kết toán và khóa dữ liệu.", "danger");
                return;
            }

            const regGuests = slot.registered_guests || [];
            
            // Tránh trùng SĐT
            if (regGuests.some(p => p.phone === window.currentGuest.phone)) {
                window.hienToast("Đăng ký trùng lặp", "Số điện thoại của bạn đã có trong danh sách ca chơi này.", "warning");
                return;
            }

            // Giới hạn số người chơi / sân (Tiêu chuẩn tối đa 6 người/sân để đảm bảo thể lực)
            const maxSlots = (slot.court_quantity || 1) * 6;
            if (regGuests.length >= maxSlots) {
                window.hienToast("Ca đấu đầy slot", "Ca chơi này đã đủ số lượng cầu thủ tối đa. Vui lòng tìm kèo khác!", "warning");
                return;
            }

            // Xác định giới tính đăng ký để máy kế toán tính tiền public
            const selectGenderInput = confirm("Xác nhận giới tính đặt sân chơi cầu lông:\n- Bấm [OK / YES]: Nếu bạn đăng ký Slot NAM (♂️)\n- Bấm [CANCEL / NO]: Nếu bạn đăng ký Slot NỮ (♀️)");
            const confirmedGender = selectGenderInput ? "male" : "female";

            regGuests.push({
                name: window.currentGuest.name,
                phone: window.currentGuest.phone,
                gender: confirmedGender,
                registered_at: new Date().toISOString()
            });

            slot.registered_guests = regGuests;
            await window.dbEngine.ghi("slots", slot, { id: slot.id });
            
            // Cập nhật lại số liệu thống kê người dùng đám mây
            window.currentGuest.registered_slots = (window.currentGuest.registered_slots || 0) + 1;
            const pricePaid = confirmedGender === "female" ? (slot.price_female || slot.price_male) : slot.price_male;
            window.currentGuest.total_spent = (window.currentGuest.total_spent || 0) + Number(pricePaid);
            
            await window.dbEngine.ghi("users", window.currentGuest, { id: window.currentGuest.id });
            localStorage.setItem("tvl_logged_guest", JSON.stringify(window.currentGuest));

            window.hienToast("Đăng ký thành công", "Đã đặt Slot vãng lai thành công. Hãy chuẩn bị vợt và đến đúng giờ nhé!", "success");
            window.hienThiDashboardKhach();
            window.timKiemCaDau(); // Tải lại danh sách ca đấu để đổi trạng thái nút
        } catch (e) {
            console.error("Lỗi khi đăng ký slot vãng lai:", e);
            window.hienToast("Lỗi đăng ký", "Không thể lưu thông tin đăng ký lên hệ thống dữ liệu.", "danger");
        }
    };

    // 8. Hủy bỏ Slot vãng lai đã đăng ký
    window.huySlotVangLai = async function (slotId) {
        if (!window.currentGuest) return;

        try {
            const slots = await window.dbEngine.doc("slots");
            const slot = slots.find(s => s.id === slotId);
            if (!slot) return;

            if (slot.status === "locked") {
                window.hienToast("Không thể hủy", "Kèo đấu này đã được Host chốt kết toán và khóa vĩnh viễn.", "danger");
                return;
            }

            let regGuests = slot.registered_guests || [];
            const regData = regGuests.find(p => p.phone === window.currentGuest.phone);
            if (!regData) return;

            // Xóa khách ra khỏi mảng
            regGuests = regGuests.filter(p => p.phone !== window.currentGuest.phone);
            slot.registered_guests = regGuests;
            await window.dbEngine.ghi("slots", slot, { id: slot.id });

            // Cập nhật lại số liệu thống kê chi tiêu khách
            window.currentGuest.registered_slots = Math.max(0, (window.currentGuest.registered_slots || 0) - 1);
            const pricePaid = regData.gender === "female" ? (slot.price_female || slot.price_male) : slot.price_male;
            window.currentGuest.total_spent = Math.max(0, (window.currentGuest.total_spent || 0) - Number(pricePaid));
            
            await window.dbEngine.ghi("users", window.currentGuest, { id: window.currentGuest.id });
            localStorage.setItem("tvl_logged_guest", JSON.stringify(window.currentGuest));

            window.hienToast("Hủy kèo thành công", "Bạn đã rút tên ra khỏi danh sách tham gia ca đấu.", "success");
            window.hienThiDashboardKhach();
            window.timKiemCaDau(); // Tải lại danh sách
        } catch (e) {
            console.error("Lỗi khi hủy slot vãng lai:", e);
            window.hienToast("Lỗi hệ thống", "Không thể xử lý yêu cầu rút tên khỏi ca chơi.", "danger");
        }
    };

    // 9. Quản lý tương tác đánh giá sao của khách hàng dành cho Host
    window.khoiTaoDanhGiaStarsKhach = function () {
        const stars = document.querySelectorAll("#guestRatingStars i");
        if (!stars.length) return;
        stars.forEach(star => {
            // Loại bỏ các listener cũ để tránh trùng lặp
            const newStar = star.cloneNode(true);
            star.parentNode.replaceChild(newStar, star);
            
            newStar.addEventListener("click", () => {
                const idx = newStar.getAttribute("data-index");
                currentRatingIndex = Number(idx);
                capNhatGiaoDienStars(currentRatingIndex);
            });
        });
    };

    function capNhatGiaoDienStars(index) {
        const stars = document.querySelectorAll("#guestRatingStars i");
        stars.forEach(s => {
            const i = Number(s.getAttribute("data-index"));
            if (i <= index) {
                s.classList.add("active");
            } else {
                s.classList.remove("active");
            }
        });
    }

    // Gửi đánh giá uy tín của Host trạm lên hệ thống đám mây
    window.guiDanhGiaHost = async function () {
        if (!window.currentGuest) {
            window.hienToast("Đăng nhập yêu cầu", "Bạn cần đăng nhập để gửi nhận xét.", "warning");
            return;
        }

        const hostKeySelect = document.getElementById("guestReviewHostSelect");
        const commentInput = document.getElementById("guestReviewComment");
        if (!hostKeySelect || !commentInput) return;

        const hostKey = hostKeySelect.value;
        const comment = commentInput.value.trim();

        if (!hostKey) {
            window.hienToast("Chưa chọn Host", "Cầu thủ vui lòng chọn Host trạm cầu lông cần đánh giá.", "danger");
            return;
        }

        if (!comment) {
            window.hienToast("Nhận xét trống", "Vui lòng nhập nhận xét chi tiết về dịch vụ của Host.", "danger");
            return;
        }

        try {
            await window.dbEngine.ghi("reviews", {
                reviewer_name: window.currentGuest.name,
                reviewer_phone: window.currentGuest.phone,
                target_identity: hostKey,
                role: "host_rating", // Guest đánh giá cho Host
                stars: currentRatingIndex,
                comment: comment
            });

            commentInput.value = "";
            capNhatGiaoDienStars(5);
            currentRatingIndex = 5;

            window.hienToast("Cảm ơn đóng góp", "Nhận xét uy tín của Host đã được đồng bộ lên máy chủ đám mây.", "success");
        } catch (e) {
            console.error("Lỗi khi gửi đánh giá host:", e);
            window.hienToast("Lỗi đám mây", "Không thể gửi dữ liệu bình chọn sao.", "danger");
        }
    };

    // Tự động khởi chạy phân hệ độc lập khi load trang khach.html
    document.addEventListener("DOMContentLoaded", async () => {
        // Chờ dbEngine sẵn sàng
        const checkDb = setInterval(() => {
            if (window.dbEngine) {
                clearInterval(checkDb);
                window.khoiTaoTrangKhach();
            }
        }, 100);
    });

    console.log("⚡ [Phân hệ khách chơi]: Khởi động bộ máy vận hành Guest độc lập thành công.");
})();
