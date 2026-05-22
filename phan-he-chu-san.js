/* =========================================================================
 * 🏟️ PHÂN HỆ CHỦ SÂN (HOST PORTAL & SMART ACCOUNTING ENGINE) - PHAN-HE-CHU-SAN.JS
 * Dự án: TUYENVANGLAI.IO.VN
 * Chức năng: Quản lý kích hoạt Key thuê trạm, đăng ca chơi tự động đồng bộ đám mây,
 *            tích hợp bộ máy kế toán thông minh dự toán chi phí cầu tiêu thụ lẻ và tiền sân,
 *            định vị qua Google Maps API giả lập, đóng khóa chốt ca chơi vĩnh viễn và bình chọn 2 chiều.
 * =========================================================================
 */

(function () {
    // Biến trạng thái toàn cục của phân hệ Host
    window.currentHostKey = null;
    window.shuttlecocksList = []; // Mảng theo dõi các loại cầu tiêu dùng được Host khai báo
    
    let hostRatingIndex = 5; // Bình chọn thái độ khách mặc định
    let suggestBreakEvenPrice = null;
    let suggestSmallProfitPrice = null;
    let suggestBigProfitPrice = null;

    // 1. Khởi tạo trang Host độc lập (cho host.html)
    window.khoiTaoTrangHost = function () {
        // Kiểm tra xem Host đã đăng nhập từ phiên làm việc trước chưa
        const savedKey = localStorage.getItem("tvl_logged_host_key");
        if (savedKey) {
            window.currentHostKey = savedKey;
            window.hienThiDashboardHost();
        } else {
            window.currentHostKey = null;
            window.hienThiGiaoDienChuaKichHoat();
        }

        window.khoiTaoReviewStarsHost();
    };

    // Hiển thị giao diện khi chưa kích hoạt key
    window.hienThiGiaoDienChuaKichHoat = function () {
        const authPanel = document.getElementById("hostAuthPanel");
        const consolePanel = document.getElementById("hostConsole");
        if (authPanel) authPanel.classList.remove("d-none");
        if (consolePanel) consolePanel.classList.add("d-none");

        const keyInput = document.getElementById("hostActivationKey");
        if (keyInput) keyInput.value = "";
    };

    // 2. Xác thực Key thuê kích hoạt trạm quản trị
    window.xacThucKeyHost = async function () {
        const keyInput = document.getElementById("hostActivationKey");
        if (!keyInput) return;

        const key = keyInput.value.trim();
        if (!key) {
            window.hienToast("Trống thông tin", "Vui lòng nhập Key thuê kích hoạt trạm.", "danger");
            return;
        }

        try {
            const keys = await window.dbEngine.doc("keys");
            const matchedKey = keys.find(k => k.key === key);

            if (!matchedKey) {
                window.hienToast("Mã Key không tồn tại", "Key này không có trên cơ sở dữ liệu hệ thống. Vui lòng kiểm tra lại.", "danger");
                return;
            }

            if (matchedKey.status !== "active") {
                window.hienToast("Key bị khóa", "Key thuê trạm này đã bị Admin tạm thời khóa hiệu lực.", "danger");
                return;
            }

            if (new Date(matchedKey.expires_at) < new Date()) {
                window.hienToast("Key hết hạn thuê", "Key thuê trạm đã hết hạn. Vui lòng liên hệ Admin gia hạn thuê.", "danger");
                return;
            }

            window.currentHostKey = key;
            localStorage.setItem("tvl_logged_host_key", key);

            window.hienToast("Kích hoạt thành công", "Hệ thống đã kích hoạt toàn quyền trạm cho Host.", "success");
            window.hienThiDashboardHost();
        } catch (e) {
            console.error("Lỗi xác thực key host:", e);
            window.hienToast("Lỗi kết nối", "Không thể xác thực Key thuê lên máy chủ.", "danger");
        }
    };

    // Đăng xuất Host
    window.dangXuatHost = function () {
        localStorage.removeItem("tvl_logged_host_key");
        window.currentHostKey = null;
        window.hienToast("Đã đăng xuất", "Phiên quản trị chủ sân đã kết thúc.", "info");
        window.hienThiGiaoDienChuaKichHoat();
    };

    // 3. Tải bảng điều khiển điều hành chính của Chủ sân
    window.hienThiDashboardHost = function () {
        const authPanel = document.getElementById("hostAuthPanel");
        const consolePanel = document.getElementById("hostConsole");
        if (authPanel) authPanel.classList.add("d-none");
        if (consolePanel) consolePanel.classList.remove("d-none");

        // Nạp 63 tỉnh thành Việt Nam vào dropdown Đăng ca đấu
        const provSelect = document.getElementById("hostProvince");
        if (provSelect) {
            provSelect.innerHTML = '<option value="">-- Chọn Tỉnh / Thành --</option>';
            if (window.MOCK_PROVINCES) {
                window.MOCK_PROVINCES.forEach(prov => {
                    const opt = document.createElement("option");
                    opt.value = prov.name;
                    opt.innerText = prov.name;
                    provSelect.appendChild(opt);
                });
            }
        }

        // Đặt giới hạn ngày đấu tối thiểu là hôm nay
        const dateInput = document.getElementById("hostDatePlay");
        if (dateInput) {
            const todayStr = new Date().toLocaleDateString('sv-SE');
            dateInput.value = todayStr;
            dateInput.min = todayStr;
        }

        // Đặt mặc định giờ giấc ca chơi thông dụng
        const timeStartInput = document.getElementById("hostTimeStart");
        const timeEndInput = document.getElementById("hostTimeEnd");
        if (timeStartInput) timeStartInput.value = "18:00";
        if (timeEndInput) timeEndInput.value = "20:00";

        // Khởi động mảng khai báo các hãng quả cầu
        window.shuttlecocksList = [];
        const shuttleContainer = document.getElementById("shuttlecockListContainer");
        if (shuttleContainer) {
            shuttleContainer.innerHTML = "";
            // Đăng ký loại cầu phổ biến mặc định Hải Yến: Ống 12 quả, Giá 240k, Ca chơi dùng hết 5 quả lẻ
            window.themLoaiCauMoi("Hải Yến", 12, 240000, 5); 
        }

        // Tự động tính toán tổng số giờ, gợi ý giá tiền, tải danh sách lịch sử ca đấu
        window.tinhToanThoiGianHieuLuc();
        window.loadLichSuCaDauHost();
    };

    // Cập nhật Quận/Huyện tương ứng bên phía Host
    window.capNhatQuanHuyenHost = function () {
        const provSelect = document.getElementById("hostProvince");
        const distSelect = document.getElementById("hostDistrict");
        if (!provSelect || !distSelect) return;

        const provName = provSelect.value;
        distSelect.innerHTML = '<option value="">-- Chọn Quận/Huyện --</option>';

        if (window.MOCK_PROVINCES) {
            const matched = window.MOCK_PROVINCES.find(p => p.name === provName);
            if (matched) {
                matched.districts.forEach(dist => {
                    const opt = document.createElement("option");
                    opt.value = dist;
                    opt.innerText = dist;
                    distSelect.appendChild(opt);
                });
            }
        }
    };

    // 4. Tính toán thời lượng ca chơi (tính cả ca xuyên đêm sang ngày hôm sau)
    window.tinhToanThoiGianHieuLuc = function () {
        const dateStr = document.getElementById("hostDatePlay")?.value;
        const startStr = document.getElementById("hostTimeStart")?.value;
        const endStr = document.getElementById("hostTimeEnd")?.value;
        const durationInput = document.getElementById("hostTotalDuration");

        if (!dateStr || !startStr || !endStr || !durationInput) return;

        const tStart = new Date(`${dateStr}T${startStr}`);
        let tEnd = new Date(`${dateStr}T${endStr}`);

        // Nếu giờ kết thúc nhỏ hơn giờ bắt đầu, tự động cộng thêm 1 ngày chơi (xuyên đêm)
        if (tEnd < tStart) {
            tEnd = new Date(tEnd.getTime() + 24 * 60 * 60 * 1000);
        }

        const diffHours = (tEnd - tStart) / (1000 * 60 * 60);
        durationInput.value = `${diffHours.toFixed(1)} Giờ`;

        window.tinhToanPricingGoiY();
    };

    // 5. Thêm/Xóa/Khai báo nhiều loại quả cầu tiêu dùng của ca đấu
    window.themLoaiCauMoi = function (macDinhTen = "", macDinhQua = 12, macDinhGia = 240000, macDinhDaDung = 0) {
        const container = document.getElementById("shuttlecockListContainer");
        if (!container) return;

        const randId = Math.random().toString(36).substr(2, 9);
        const row = document.createElement("div");
        row.className = "shuttlecock-row";
        row.id = `shuttleRow_${randId}`;
        
        row.innerHTML = `
            <div style="position: relative;">
                <input type="text" class="form-control" id="shuttleName_${randId}" placeholder="Loại cầu (Vd: Hải Yến)" value="${macDinhTen}" oninput="window.goiYTenCau('${randId}')">
                <div id="shuttleSuggests_${randId}" style="position:absolute; width:100%; max-height:120px; overflow-y:auto; background: #080a0f; border:1px solid var(--border); z-index:30; display:none; border-radius:4px;"></div>
            </div>
            <select class="form-control" id="shuttleQtyType_${randId}" onchange="window.quyDoiLeTuDong('${randId}')">
                <option value="12" ${macDinhQua === 12 ? 'selected' : ''}>Ống 12 quả</option>
                <option value="6" ${macDinhQua === 6 ? 'selected' : ''}>Ống 6 quả</option>
                <option value="1" ${macDinhQua === 1 ? 'selected' : ''}>Quả lẻ</option>
            </select>
            <input type="number" class="form-control" id="shuttlePrice_${randId}" placeholder="Giá bán" value="${macDinhGia}" onchange="window.quyDoiLeTuDong('${randId}'); window.tinhToanPricingGoiY();">
            <input type="number" class="form-control" id="shuttleUsed_${randId}" placeholder="Đã dùng" value="${macDinhDaDung}" onchange="window.tinhToanPricingGoiY()" style="width: 70px;">
            <button class="btn-hud-back" type="button" style="padding: 10px; color:hsl(var(--danger)); border-color:rgba(239,68,68,0.15);" onclick="window.xoaLoaiCau('${randId}')"><i class="fa-solid fa-trash-can"></i></button>
        `;
        
        container.appendChild(row);
        window.shuttlecocksList.push(randId);
        window.tinhToanPricingGoiY();
    };

    window.xoaLoaiCau = function (id) {
        if (window.shuttlecocksList.length <= 1) {
            window.hienToast("Không thể xóa", "Phải khai báo ít nhất một loại cầu được sử dụng ca đấu.", "warning");
            return;
        }
        const row = document.getElementById(`shuttleRow_${id}`);
        if (row) row.remove();
        window.shuttlecocksList = window.shuttlecocksList.filter(item => item !== id);
        window.tinhToanPricingGoiY();
    };

    window.quyDoiLeTuDong = function (id) {
        window.tinhToanPricingGoiY();
    };

    window.goiYTenCau = function (id) {
        const input = document.getElementById(`shuttleName_${id}`);
        const box = document.getElementById(`shuttleSuggests_${id}`);
        if (!input || !box) return;

        const query = input.value.trim().toLowerCase();
        box.innerHTML = "";

        if (!query) {
            box.style.display = "none";
            return;
        }

        if (window.SHUTTLECOCK_BRANDS) {
            const matched = window.SHUTTLECOCK_BRANDS.filter(b => b.toLowerCase().includes(query));
            if (matched.length > 0) {
                box.style.display = "block";
                matched.forEach(brand => {
                    const opt = document.createElement("div");
                    opt.style.padding = "6px 12px";
                    opt.style.cursor = "pointer";
                    opt.style.fontSize = "0.8rem";
                    opt.innerText = brand;
                    opt.addEventListener("click", () => {
                        input.value = brand;
                        box.style.display = "none";
                        window.tinhToanPricingGoiY();
                    });
                    box.appendChild(opt);
                });
            } else {
                box.style.display = "none";
            }
        }
    };

    // 6. BỘ MÁY KẾ TOÁN TƯ DOANH THÔNG MINH (PRICING ESTIMATION ENGINE)
    window.tinhToanPricingGoiY = function () {
        const dur = parseFloat(document.getElementById("hostTotalDuration")?.value) || 0;
        const qty = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const courtPerHour = Number(document.getElementById("hostAccountingCourtPrice")?.value) || 0;
        const water = Number(document.getElementById("hostAccountingWaterCost")?.value) || 0;

        const estMale = Number(document.getElementById("hostAccountingEstMale")?.value) || 0;
        const estFemale = Number(document.getElementById("hostAccountingEstFemale")?.value) || 0;
        const gap = Number(document.getElementById("hostAccountingGap")?.value) || 0;

        // Tổng chi phí tiền thuê sân bãi
        const totalCourtCost = courtPerHour * dur * qty;

        // Tính tổng tiền cầu tiêu thụ thực tế
        let totalShuttleCost = 0;
        window.shuttlecocksList.forEach(id => {
            const qtyType = Number(document.getElementById(`shuttleQtyType_${id}`)?.value) || 12;
            const price = Number(document.getElementById(`shuttlePrice_${id}`)?.value) || 0;
            const used = Number(document.getElementById(`shuttleUsed_${id}`)?.value) || 0;

            const pricePerPiece = price / qtyType;
            totalShuttleCost += pricePerPiece * used;
        });

        // Tổng chi phí vận hành cho cả ca chơi hôm đó
        const totalSessionCost = totalCourtCost + totalShuttleCost + water;
        const totalPlayersCount = estMale + estFemale;

        const breakevenVal = document.getElementById("sugValBreakEven");
        const smallVal = document.getElementById("sugValSmallProfit");
        const bigVal = document.getElementById("sugValBigProfit");

        if (totalPlayersCount === 0) {
            if (breakevenVal) breakevenVal.innerText = "--";
            if (smallVal) smallVal.innerText = "--";
            if (bigVal) bigVal.innerText = "--";
            return;
        }

        // Thuật toán chia đều tài chính có sự ưu đãi chênh lệch gap Nam/Nữ
        function phanBoChiPhi(targetRevenue) {
            const femalePrice = (targetRevenue - (gap * estMale)) / totalPlayersCount;
            const malePrice = femalePrice + gap;
            return {
                male: Math.round(malePrice / 5000) * 5000, // Làm tròn chốt số đẹp hàng 5 nghìn
                female: Math.round(femalePrice / 5000) * 5000
            };
        }

        // A. Huề Vốn
        const breakevenRes = phanBoChiPhi(totalSessionCost);
        suggestBreakEvenPrice = breakevenRes;
        if (breakevenVal) breakevenVal.innerText = `${breakevenRes.male.toLocaleString()}/${breakevenRes.female.toLocaleString()}`;
        
        const breakevenProfit = document.getElementById("sugProfitBreakEven");
        if (breakevenProfit) breakevenProfit.innerText = `Lãi: 0đ`;

        // B. Lãi Ít (Target 15% lợi nhuận làm quỹ nước)
        const smallRes = phanBoChiPhi(totalSessionCost * 1.15);
        suggestSmallProfitPrice = smallRes;
        if (smallVal) smallVal.innerText = `${smallRes.male.toLocaleString()}/${smallRes.female.toLocaleString()}`;
        
        const profitSmall = (smallRes.male * estMale + smallRes.female * estFemale) - totalSessionCost;
        const smallProfitText = document.getElementById("sugProfitSmallProfit");
        if (smallProfitText) smallProfitText.innerText = `Lãi: +${Math.round(profitSmall).toLocaleString()}đ`;

        // C. Lãi Nhiều (Target 30% lợi nhuận thu hồi vốn dụng cụ)
        const bigRes = phanBoChiPhi(totalSessionCost * 1.30);
        suggestBigProfitPrice = bigRes;
        if (bigVal) bigVal.innerText = `${bigRes.male.toLocaleString()}/${bigRes.female.toLocaleString()}`;
        
        const profitBig = (bigRes.male * estMale + bigRes.female * estFemale) - totalSessionCost;
        const bigProfitText = document.getElementById("sugProfitBigProfit");
        if (bigProfitText) bigProfitText.innerText = `Lãi: +${Math.round(profitBig).toLocaleString()}đ`;
    };

    // Áp dụng đề xuất giá trị gợi ý thu tiền khách lên Form Đăng ca
    window.apDungGoiYThuTien = function (type) {
        let target = null;
        
        const breakEvenBox = document.getElementById("sugBoxBreakEven");
        const smallBox = document.getElementById("sugBoxSmallProfit");
        const bigBox = document.getElementById("sugBoxBigProfit");

        if (breakEvenBox) breakEvenBox.classList.remove("active");
        if (smallBox) smallBox.classList.remove("active");
        if (bigBox) bigBox.classList.remove("active");

        if (type === "breakeven") {
            target = suggestBreakEvenPrice;
            if (breakEvenBox) breakEvenBox.classList.add("active");
        } else if (type === "small") {
            target = suggestSmallProfitPrice;
            if (smallBox) smallBox.classList.add("active");
        } else if (type === "big") {
            target = suggestBigProfitPrice;
            if (bigBox) bigBox.classList.add("active");
        }

        if (target) {
            const malePriceInput = document.getElementById("hostPublicPriceMale");
            const femalePriceInput = document.getElementById("hostPublicPriceFemale");
            if (malePriceInput) malePriceInput.value = target.male;
            if (femalePriceInput) femalePriceInput.value = target.female;

            window.hienToast("Áp dụng kế toán", `Đã thiết lập chi phí vãng lai: Nam ${target.male.toLocaleString()}đ, Nữ ${target.female.toLocaleString()}đ.`, "success");
        }
    };

    // 7. Logic liên kết hiển thị trình độ phù hợp giới tính
    window.chuyenTrangThaiLienKetGioiTinh = function () {
        const isMale = document.getElementById("genderMale")?.checked;
        const isFemale = document.getElementById("genderFemale")?.checked;
        const isBoth = document.getElementById("genderBoth")?.checked;

        const maleBlock = document.getElementById("linkedMaleLevelBlock");
        const femaleBlock = document.getElementById("linkedFemaleLevelBlock");

        if (isMale) {
            if (maleBlock) maleBlock.classList.remove("d-none");
            if (femaleBlock) femaleBlock.classList.add("d-none");
        } else if (isFemale) {
            if (maleBlock) maleBlock.classList.add("d-none");
            if (femaleBlock) femaleBlock.classList.remove("d-none");
        } else {
            if (maleBlock) maleBlock.classList.remove("d-none");
            if (femaleBlock) femaleBlock.classList.remove("d-none");
        }
    };

    // 8. Tích hợp định vị sân đấu qua API giả lập Google Maps
    window.giaLapTimGoogleMaps = function () {
        const searchInput = document.getElementById("mapsSearchInput");
        const courtNameInput = document.getElementById("hostCourtName");
        const modalOverlay = document.getElementById("mapsMockModalOverlay");

        if (searchInput && courtNameInput) {
            searchInput.value = courtNameInput.value;
        }

        window.goiYDiaChiMaps();
        if (modalOverlay) modalOverlay.classList.add("active");
    };

    window.dongMapsMockModal = function () {
        const modalOverlay = document.getElementById("mapsMockModalOverlay");
        if (modalOverlay) modalOverlay.classList.remove("active");
    };

    window.goiYDiaChiMaps = function () {
        const searchInput = document.getElementById("mapsSearchInput");
        const container = document.getElementById("mapsSuggestionsContainer");
        if (!searchInput || !container) return;

        const query = searchInput.value.trim().toLowerCase();
        container.innerHTML = "";

        if (!query || query.length < 2) {
            container.innerHTML = '<p style="color:#64748b; font-size:0.8rem; text-align:center; padding:10px;">Nhập ít nhất 2 ký tự để tìm kiếm địa chỉ sân...</p>';
            return;
        }

        // Tìm trong danh sách sân mẫu + xây dựng gợi ý thông minh từ query
        const allCourts = window.MOCK_COURTS || [];
        const matched = allCourts.filter(c => 
            c.name.toLowerCase().includes(query) || 
            c.address.toLowerCase().includes(query)
        );

        // Tạo thêm gợi ý thông minh từ tỉnh thành đang chọn
        const provSelect = document.getElementById("hostProvince");
        const distSelect = document.getElementById("hostDistrict");
        const selectedProv = provSelect?.value || "";
        const selectedDist = distSelect?.value || "";

        // Tổng hợp kết quả
        const smartSuggestions = [];

        if (matched.length > 0) {
            matched.forEach(c => smartSuggestions.push(c));
        }

        // Nếu ít kết quả, bổ sung gợi ý từ tỉnh thành đang chọn
        if (smartSuggestions.length < 3 && selectedProv) {
            const locationHint = selectedDist ? `${selectedDist}, ${selectedProv}` : selectedProv;
            const templates = [
                { name: `Sân Cầu Lông ${query.charAt(0).toUpperCase() + query.slice(1)} Sport`, address: `Đường ${query.charAt(0).toUpperCase() + query.slice(1)}, ${locationHint}` },
                { name: `Trung Tâm Thể Thao ${locationHint}`, address: `Khu vực trung tâm, ${locationHint}` },
                { name: `Sân Cầu Lông ${locationHint}`, address: `${query}, ${locationHint}` }
            ];
            templates.forEach(t => {
                if (!smartSuggestions.find(s => s.name === t.name)) {
                    smartSuggestions.push(t);
                }
            });
        }

        if (smartSuggestions.length > 0) {
            smartSuggestions.slice(0, 5).forEach(c => {
                const div = document.createElement("div");
                div.style.padding = "10px";
                div.style.background = "rgba(255,255,255,0.02)";
                div.style.border = "1px solid hsl(var(--border))";
                div.style.borderRadius = "6px";
                div.style.cursor = "pointer";
                div.style.transition = "background 0.2s ease";
                div.innerHTML = `
                    <h5 style="font-size:0.85rem; font-weight:800; color:hsl(var(--foreground));"><i class="fa-solid fa-map-pin text-mint" style="margin-right:6px;"></i>${c.name}</h5>
                    <p style="font-size:0.75rem; color:hsl(var(--muted-foreground)); margin-top:2px;"><i class="fa-solid fa-location-dot" style="margin-right:4px; opacity:0.6;"></i>${c.address}</p>
                `;
                div.addEventListener("mouseenter", () => div.style.background = "rgba(0,255,157,0.03)");
                div.addEventListener("mouseleave", () => div.style.background = "rgba(255,255,255,0.02)");
                div.addEventListener("click", () => {
                    const courtName = document.getElementById("hostCourtName");
                    const courtAddr = document.getElementById("hostCourtAddress");
                    const mapState = document.getElementById("hostMapLinkState");

                    if (courtName) courtName.value = c.name;
                    if (courtAddr) courtAddr.value = c.address;
                    
                    if (mapState) {
                        mapState.innerHTML = `<i class="fa-solid fa-circle-check text-mint"></i> Đã chọn địa chỉ: <b>${c.name}</b>`;
                    }

                    window.dongMapsMockModal();
                    window.hienToast("Đã chọn địa chỉ", `Đã điền địa chỉ sân: ${c.name}`, "success");
                });
                container.appendChild(div);
            });
        } else {
            // Cho phép nhập địa chỉ tự do
            const div = document.createElement("div");
            div.style.padding = "12px";
            div.style.border = "1px dashed hsl(var(--border))";
            div.style.borderRadius = "6px";
            div.style.cursor = "pointer";
            div.innerHTML = `
                <h5 style="font-size:0.82rem; color:hsl(var(--foreground));"><i class="fa-solid fa-keyboard text-mint" style="margin-right:6px;"></i>Dùng địa chỉ tùy chỉnh: "${query}"</h5>
                <p style="font-size:0.75rem; color:hsl(var(--muted-foreground)); margin-top:2px;">Bấm để điền địa chỉ bạn đang nhập vào ô địa chỉ sân.</p>
            `;
            div.addEventListener("click", () => {
                const courtAddr = document.getElementById("hostCourtAddress");
                const mapState = document.getElementById("hostMapLinkState");
                if (courtAddr && !courtAddr.value) courtAddr.value = searchInput.value;
                if (mapState) {
                    mapState.innerHTML = `<i class="fa-solid fa-circle-info"></i> Địa chỉ tự nhập tay - kiểm tra lại cho chính xác`;
                }
                window.dongMapsMockModal();
            });
            container.appendChild(div);
        }
    };

    // Hàm chuẩn hóa số sân phía Host: "1,2" hoặc "1.2" → "Sân 1, Sân 2"
    function chuanHoaSoSanHost(courtNumber) {
        if (!courtNumber) return "";
        // Nếu đã có dạng "Sân X" thì trả về nguyên
        if (/sân/i.test(courtNumber)) return courtNumber;
        // Tách bằng dấu phẩy hoặc dấu chấm
        const parts = courtNumber.split(/[,\.]+/).map(s => s.trim()).filter(Boolean);
        if (parts.length === 0) return courtNumber;
        if (parts.length === 1) return `Sân ${parts[0]}`;
        return parts.map(p => `Sân ${p}`).join(", ");
    }

    // 9. Chủ sân đăng kèo cầu lông vãng lai công khai
    window.dangCaDauCuaHost = async function () {
        const prov = document.getElementById("hostProvince")?.value;
        const dist = document.getElementById("hostDistrict")?.value;
        const datePlay = document.getElementById("hostDatePlay")?.value;
        const start = document.getElementById("hostTimeStart")?.value;
        const end = document.getElementById("hostTimeEnd")?.value;
        const court = document.getElementById("hostCourtName")?.value.trim();
        const addr = document.getElementById("hostCourtAddress")?.value.trim();
        const qty = Number(document.getElementById("hostCourtQuantity")?.value) || 1;
        const courtNumRaw = document.getElementById("hostCourtNumber")?.value.trim();
        // Chuẩn hóa số sân: "1,2" hoặc "1.2" → "Sân 1, Sân 2"
        const courtNum = chuanHoaSoSanHost(courtNumRaw);

        const priceM = Number(document.getElementById("hostPublicPriceMale")?.value) || 0;
        const priceF = Number(document.getElementById("hostPublicPriceFemale")?.value) || 0;

        if (!prov || !dist || !datePlay || !start || !end || !court || !addr || !courtNum) {
            window.hienToast("Trống thông tin", "Vui lòng điền đầy đủ biểu mẫu tuyển vãng lai công khai.", "danger");
            return;
        }

        // Thu thập kỹ thuật trình độ
        const levels = [];
        const isMale = document.getElementById("genderMale")?.checked;
        const isFemale = document.getElementById("genderFemale")?.checked;
        const isBoth = document.getElementById("genderBoth")?.checked;

        if (isMale || isBoth) {
            if (document.getElementById("m_lvl_newbie")?.checked) levels.push("newbie");
            if (document.getElementById("m_lvl_yếu")?.checked) levels.push("yếu");
            if (document.getElementById("m_lvl_tby")?.checked) levels.push("tby");
            if (document.getElementById("m_lvl_tb_minus")?.checked) levels.push("tb-");
            if (document.getElementById("m_lvl_tb_plus")?.checked) levels.push("tb+");
            if (document.getElementById("m_lvl_tbk")?.checked) levels.push("tbk");
            
            const customVal = document.getElementById("hostMaleCustomLevel")?.value.trim();
            if (customVal) levels.push(customVal);
        }
        if (isFemale || isBoth) {
            if (document.getElementById("f_lvl_newbie")?.checked) levels.push("newbie (nữ)");
            if (document.getElementById("f_lvl_yếu")?.checked) levels.push("yếu (nữ)");
            if (document.getElementById("f_lvl_tby")?.checked) levels.push("tby (nữ)");
            if (document.getElementById("f_lvl_tb_minus")?.checked) levels.push("tb- (nữ)");
            if (document.getElementById("f_lvl_tb_plus")?.checked) levels.push("tb+ (nữ)");
            if (document.getElementById("f_lvl_tbk")?.checked) levels.push("tbk (nữ)");
            
            const customVal = document.getElementById("hostFemaleCustomLevel")?.value.trim();
            if (customVal) levels.push(customVal + " (nữ)");
        }

        const activeGenderStr = isBoth ? "both" : (isMale ? "male" : "female");

        // Thu thập các vật liệu quả cầu đã khai báo kế toán
        const shuttlecocksData = window.shuttlecocksList.map(id => {
            const name = document.getElementById(`shuttleName_${id}`)?.value || "Chưa đặt tên";
            const qtyType = document.getElementById(`shuttleQtyType_${id}`)?.value || "12";
            const price = Number(document.getElementById(`shuttlePrice_${id}`)?.value) || 0;
            const used = Number(document.getElementById(`shuttleUsed_${id}`)?.value) || 0;
            return { name, qty_type: qtyType, price, used };
        });

        const slotPayload = {
            host_key: window.currentHostKey,
            province: prov,
            district: dist,
            date_play: datePlay,
            time_start: start,
            time_end: end,
            duration: parseFloat(document.getElementById("hostTotalDuration")?.value) || 0,
            court_name: court,
            court_address: addr,
            court_quantity: qty,
            court_number: courtNum,
            gender: activeGenderStr,
            levels: levels,
            price_male: priceM,
            price_female: priceF,
            inc_court: document.getElementById("inc_san")?.checked,
            inc_shuttle: document.getElementById("inc_cau")?.checked,
            inc_water: document.getElementById("inc_nuoc")?.checked,
            inc_parking: document.getElementById("inc_xe")?.checked,
            // Dữ liệu kế toán bảo mật
            accounting_court_price: Number(document.getElementById("hostAccountingCourtPrice")?.value) || 0,
            accounting_water_cost: Number(document.getElementById("hostAccountingWaterCost")?.value) || 0,
            accounting_shuttlecocks: shuttlecocksData,
            status: "active",
            registered_guests: []
        };

        try {
            await window.dbEngine.ghi("slots", slotPayload);
            window.hienToast("Đăng ca thành công", "Ca tuyển vãng lai của bạn đã được công khai trên hệ thống đám mây.", "success");
            
            // Xóa form trống để chuẩn bị cho ca tiếp theo
            const courtNumInput = document.getElementById("hostCourtNumber");
            if (courtNumInput) courtNumInput.value = "";
            
            window.loadLichSuCaDauHost();
        } catch (e) {
            console.error("Lỗi khi đăng ca đấu cầu lông:", e);
            window.hienToast("Lỗi hệ thống", "Không thể xuất bản ca đấu lên đám mây.", "danger");
        }
    };

    // 10. Tải danh sách lịch sử các ca tuyển vãng lai do Host này quản lý
    window.loadLichSuCaDauHost = async function () {
        if (!window.currentHostKey) return;

        try {
            const slots = await window.dbEngine.doc("slots", {
                eq: { host_key: window.currentHostKey },
                order: "date_play.desc"
            });

            const tbody = document.querySelector("#hostSlotsTable tbody");
            if (!tbody) return;

            tbody.innerHTML = "";

            if (slots.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding:20px;">Bạn chưa đăng ca tuyển vãng lai nào trên trạm này.</td></tr>';
                return;
            }

            slots.forEach(slot => {
                const regCount = (slot.registered_guests || []).length;
                const statusHtml = slot.status === "locked" 
                    ? '<span class="status-badge status-closed"><i class="fa-solid fa-lock" style="margin-right:4px;"></i> ĐÃ KHÓA SỐ</span>'
                    : '<span class="status-badge status-active"><i class="fa-solid fa-circle-play" style="margin-right:4px;"></i> ĐON KHÁCH</span>';

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>
                        <b class="text-mint">${new Date(slot.date_play).toLocaleDateString("vi-VN")}</b>
                        <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">🕰️ ${slot.time_start} - ${slot.time_end}</div>
                    </td>
                    <td>
                        <b style="color:#fff;">${slot.court_name}</b>
                        <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">📍 Số sân: ${slot.court_number} (${slot.court_quantity} sân)</div>
                    </td>
                    <td>
                        <span style="font-size:0.82rem;">${slot.gender === "both" ? "Cả Nam & Nữ" : (slot.gender === "male" ? "Chỉ Nam" : "Chỉ Nữ")}</span>
                        <div style="font-size:0.75rem; color:hsl(var(--neon-gold)); margin-top:2px; font-weight:800;">👥 Đã ĐK: ${regCount} người</div>
                    </td>
                    <td style="font-size:0.78rem; color:#64748b;">${slot.host_key.substring(0, 10)}...</td>
                    <td>
                        <span style="font-size:0.8rem;">♂️ ${Number(slot.price_male).toLocaleString("vi-VN")}đ / ♀️ ${Number(slot.price_female || slot.price_male).toLocaleString("vi-VN")}đ</span>
                        <div style="font-size:0.72rem; color:#64748b; margin-top:2px;">Sân thuê: ${Number(slot.accounting_court_price).toLocaleString("vi-VN")}đ/h</div>
                    </td>
                    <td>${statusHtml}</td>
                    <td>
                        <div class="flex gap-2">
                            ${slot.status === "locked" 
                                ? `<button class="btn-hud-back" style="padding: 4px 8px; font-size:0.7rem;" onclick="window.xemBieuToanHost('${slot.id}')"><i class="fa-solid fa-eye"></i> Xem báo biểu</button>`
                                : `
                                    <button class="btn-hud-back" style="padding: 4px 8px; font-size:0.7rem; color:hsl(var(--neon-mint)); border-color:rgba(0,255,157,0.15);" onclick="window.chotVaKhoaCa('${slot.id}')"><i class="fa-solid fa-check-double"></i> Chốt sổ</button>
                                    <button class="btn-hud-back" style="padding: 4px 8px; font-size:0.7rem; color:hsl(var(--danger)); border-color:rgba(239,68,68,0.15);" onclick="window.xoaCaDauHost('${slot.id}')"><i class="fa-solid fa-xmark"></i> Hủy</button>
                                `
                            }
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Lỗi khi tải lịch sử ca đấu của Host:", e);
        }
    };

    // 11. Chốt và Khóa số liệu kế toán ca đấu vĩnh viễn
    window.chotVaKhoaCa = async function (slotId) {
        try {
            const slots = await window.dbEngine.doc("slots");
            const slot = slots.find(s => s.id === slotId);
            if (!slot) return;

            const c = confirm("⚠️ CẢNH BÁO KẾ TOÁN TRẠM CHỦ SÂN:\nBạn có chắc chắn muốn CHỐT ca chơi cầu lông này?\nHệ thống sẽ khóa vĩnh viễn số liệu chi phí sân, chi phí cầu tiêu thụ thực tế để lưu hồ sơ lịch sử, không cho phép sửa đổi hay hủy bỏ nữa.");
            if (!c) return;

            slot.status = "locked";
            await window.dbEngine.ghi("slots", slot, { id: slot.id });

            window.hienToast("Đã chốt & khóa số", "Hệ thống đã kết toán và khóa vĩnh viễn dữ liệu ca chơi thành công.", "success");
            
            // Tự động mở phân hệ đánh giá khách hàng vãng lai sau ca đấu
            window.moHostReviewGuestPanel(slot);
            window.loadLichSuCaDauHost();
        } catch (e) {
            console.error("Lỗi khi chốt khóa ca chơi:", e);
            window.hienToast("Lỗi chốt ca", "Không thể hoàn thành kết toán ca chơi.", "danger");
        }
    };

    // Mở ô đánh giá cầu thủ vãng lai
    window.moHostReviewGuestPanel = function (slot) {
        const select = document.getElementById("hostReviewGuestSelect");
        const panel = document.getElementById("hostReviewGuestPanel");
        if (!select || !panel) return;

        select.innerHTML = '<option value="">-- Chọn khách chơi đã tham gia --</option>';

        const regGuests = slot.registered_guests || [];
        if (regGuests.length === 0) {
            window.hienToast("Không có khách vãng lai", "Ca đấu không có khách vãng lai đăng ký nên không cần đánh giá.", "warning");
            return;
        }

        regGuests.forEach(g => {
            const opt = document.createElement("option");
            opt.value = g.phone;
            opt.innerText = `${g.name} (${g.phone})`;
            select.appendChild(opt);
        });

        panel.classList.remove("d-none");
        panel.scrollIntoView({ behavior: "smooth" });
    };

    window.dongHostReviewGuestPanel = function () {
        const panel = document.getElementById("hostReviewGuestPanel");
        if (panel) panel.classList.add("d-none");
    };

    // Đánh giá thái độ của khách hàng vãng lai
    window.guiDanhGiaKhach = async function () {
        const guestPhoneSelect = document.getElementById("hostReviewGuestSelect");
        const commentInput = document.getElementById("hostReviewComment");
        if (!guestPhoneSelect || !commentInput || !window.currentHostKey) return;

        const guestPhone = guestPhoneSelect.value;
        const comment = commentInput.value.trim();

        if (!guestPhone) {
            window.hienToast("Dữ liệu trống", "Vui lòng chọn khách chơi cần đánh giá.", "danger");
            return;
        }

        if (!comment) {
            window.hienToast("Nhận xét trống", "Vui lòng viết nhận xét thái độ chơi của khách vãng lai.", "danger");
            return;
        }

        try {
            await window.dbEngine.ghi("reviews", {
                reviewer_name: `Chủ Sân Trạm Key: ${window.currentHostKey.substring(0, 10)}...`,
                reviewer_phone: "host",
                target_identity: guestPhone,
                role: "guest_rating", // Host đánh giá khách hàng
                stars: hostRatingIndex,
                comment: comment
            });

            commentInput.value = "";
            window.dongHostReviewGuestPanel();
            window.hienToast("Đã lưu đánh giá", "Nhận xét chất lượng và thái độ của khách chơi đã gửi lên hệ thống.", "success");
        } catch (e) {
            console.error("Lỗi khi gửi nhận xét khách hàng:", e);
            window.hienToast("Lỗi đám mây", "Không thể gửi dữ liệu bình chọn sao.", "danger");
        }
    };

    // Hủy bỏ ca chơi chưa khóa số
    window.xoaCaDauHost = async function (slotId) {
        const c = confirm("❌ HỦY BỎ CA TUYỂN VÃNG LAI:\nBạn có chắc chắn muốn hủy bỏ ca chơi cầu lông này? Hệ thống sẽ thu hồi hiển thị kèo đấu ngay lập tức.");
        if (!c) return;

        try {
            await window.dbEngine.xoa("slots", { id: slotId });
            window.hienToast("Đã hủy ca đấu", "Đã gỡ ca vãng lai khỏi bản đồ hiển thị thành công.", "success");
            window.loadLichSuCaDauHost();
        } catch (e) {
            console.error("Lỗi khi hủy ca đấu:", e);
        }
    };

    // Xem chi tiết biểu toán của ca đã kết toán
    window.xemBieuToanHost = async function (slotId) {
        try {
            const slots = await window.dbEngine.doc("slots");
            const slot = slots.find(s => s.id === slotId);
            if (!slot) return;

            // Tính toán tài chính thực tế ca chơi
            const courtCost = slot.accounting_court_price * slot.duration * slot.court_quantity;
            let shuttleCost = 0;
            let shuttleDetail = "";
            
            if (slot.accounting_shuttlecocks) {
                slot.accounting_shuttlecocks.forEach(s => {
                    const pricePerPiece = s.price / Number(s.qty_type);
                    const cost = pricePerPiece * s.used;
                    shuttleCost += cost;
                    shuttleDetail += `\n- Cầu ${s.name}: Dùng ${s.used} quả lẻ (${Number(pricePerPiece.toFixed(0))}đ/quả) => Chi phí: ${cost.toLocaleString()}đ`;
                });
            }

            const waterCost = slot.accounting_water_cost || 0;
            const totalCost = courtCost + shuttleCost + waterCost;

            // Doanh thu thực tế thu từ khách đã đặt slot
            let totalRevenue = 0;
            const guestsList = slot.registered_guests || [];
            guestsList.forEach(g => {
                const price = g.gender === "female" ? (slot.price_female || slot.price_male) : slot.price_male;
                totalRevenue += Number(price);
            });

            const netProfit = totalRevenue - totalCost;

            alert(`📊 --- BÁO BIỂU CHI TIẾT TÀI CHÍNH CA ĐẤU ---
Sân chơi: ${slot.court_name} (${slot.court_number})
Thời gian: ${new Date(slot.date_play).toLocaleDateString("vi-VN")} (${slot.time_start} - ${slot.time_end})

💸 CHI PHÍ VẬN HÀNH CA ĐẤU:
1. Tiền sân: ${courtCost.toLocaleString()}đ (${slot.duration} giờ x ${slot.court_quantity} sân x ${slot.accounting_court_price.toLocaleString()}đ/giờ)
2. Quả cầu dùng thực tế: ${shuttleCost.toLocaleString()}đ${shuttleDetail}
3. Nước uống / Chi khác: ${waterCost.toLocaleString()}đ
==> TỔNG CHI PHÍ THỰC TẾ: ${totalCost.toLocaleString()}đ

💰 DOANH THU GHI NHẬN TỪ KHÁCH:
- Đã đăng ký chơi: ${guestsList.length} khách vãng lai
==> TỔNG DOANH THU THU VỀ: ${totalRevenue.toLocaleString()}đ

📈 KẾT QUẢ ĐẠT ĐƯỢC:
- Lợi nhuận ròng: ${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString()}đ (${netProfit >= 0 ? 'Có Lãi' : 'Lỗ ca chơi'})
-----------------------------------------
Trạng thái: CA ĐẤU ĐÃ KẾT TOÁN VÀ KHÓA DỮ LIỆU.`);
        } catch (e) {
            console.error("Lỗi khi kết xuất biểu toán:", e);
        }
    };

    // Khởi tạo các sự kiện Click đánh giá sao Host dành cho Khách hàng vãng lai
    window.khoiTaoReviewStarsHost = function () {
        const stars = document.querySelectorAll("#hostRatingStars i");
        stars.forEach(star => {
            // Dọn dẹp listener cũ
            const newStar = star.cloneNode(true);
            star.parentNode.replaceChild(newStar, star);

            newStar.addEventListener("click", () => {
                const idx = newStar.getAttribute("data-index");
                hostRatingIndex = Number(idx);
                capNhatGiaoDienStarsHost(hostRatingIndex);
            });
        });
    };

    function capNhatGiaoDienStarsHost(index) {
        const stars = document.querySelectorAll("#hostRatingStars i");
        stars.forEach(s => {
            const i = Number(s.getAttribute("data-index"));
            if (i <= index) {
                s.classList.add("active");
            } else {
                s.classList.remove("active");
            }
        });
    }

    // Tự động khởi chạy khi load trang host.html
    document.addEventListener("DOMContentLoaded", () => {
        const checkDb = setInterval(() => {
            if (window.dbEngine) {
                clearInterval(checkDb);
                window.khoiTaoTrangHost();
            }
        }, 100);
    });

    console.log("⚡ [Phân hệ chủ sân]: Bộ máy kế toán & Quản trị trạm Host đã khởi động độc lập.");
})();
