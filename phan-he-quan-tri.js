/* =========================================================================
 * 🛡️ PHÂN HỆ QUẢN TRỊ VIÊN TỐI CAO - PHAN-HE-QUAN-TRI.JS
 * Dự án: TUYENVANGLAI.IO.VN
 * Chức năng: Cung cấp các công cụ tối thượng dành cho Admin để tạo/khoá/xoá Key thuê trạm,
 *            lưu trữ danh sách cầu thủ vãng lai và lịch sử ca chơi phục vụ khai thác Data,
 *            kiểm duyệt ý kiến đánh giá hai chiều, thay đổi popup thông báo tin tức và
 *            chạy chữ trên trang chủ thông qua đồng bộ đám mây.
 * =========================================================================
 */

(function () {
    // Mật khẩu quản trị hệ thống tối cao mặc định
    const MAT_MAU_ADMIN = "admin2026";

    // 1. Khởi tạo trang Admin độc lập (cho admin.html)
    window.khoiTaoTrangAdmin = function () {
        const passInput = document.getElementById("adminSecretPassword");
        if (passInput) passInput.value = "";

        // Kiểm tra xem Admin đã đăng nhập trong phiên làm việc này chưa
        const isAdmin = localStorage.getItem("tvl_logged_admin") === "true";
        if (isAdmin) {
            window.hienThiConsoleAdmin();
        } else {
            window.hienThiGiaoDienChuaDangNhapAdmin();
        }
    };

    // Hiển thị giao diện khi chưa đăng nhập Admin
    window.hienThiGiaoDienChuaDangNhapAdmin = function () {
        const authPanel = document.getElementById("adminAuthPanel");
        const consolePanel = document.getElementById("adminConsole");
        if (authPanel) authPanel.classList.remove("d-none");
        if (consolePanel) consolePanel.classList.add("d-none");

        const passInput = document.getElementById("adminSecretPassword");
        if (passInput) passInput.value = "";
    };

    // 2. Xác thực quyền năng quản trị viên tối cao
    window.xacThucQuyenAdmin = function () {
        const passInput = document.getElementById("adminSecretPassword");
        if (!passInput) return;

        const pass = passInput.value;
        if (pass === MAT_MAU_ADMIN) {
            localStorage.setItem("tvl_logged_admin", "true");
            window.hienToast("Root Admin Connected", "Chào mừng quản trị viên tối cao gia nhập hệ thống.", "success");
            window.hienThiConsoleAdmin();
        } else {
            window.hienToast("Sai mật khẩu", "Mật mã quản trị viên cấp cao chưa chính xác. Truy cập bị từ chối!", "danger");
        }
    };

    // Đăng xuất Admin
    window.dangXuatAdmin = function () {
        localStorage.removeItem("tvl_logged_admin");
        window.hienToast("Đăng xuất thành công", "Đã ngắt kết nối an toàn với máy chủ Admin.", "success");
        window.hienThiGiaoDienChuaDangNhapAdmin();
    };

    // 3. Hiển thị Console Admin và chuyển tab mặc định
    window.hienThiConsoleAdmin = function () {
        const authPanel = document.getElementById("adminAuthPanel");
        const consolePanel = document.getElementById("adminConsole");
        if (authPanel) authPanel.classList.add("d-none");
        if (consolePanel) consolePanel.classList.remove("d-none");
        
        window.chuyenAdminTab("keys");
    };

    // Chuyển đổi qua lại giữa các Tab chức năng của Admin
    window.chuyenAdminTab = function (tabName) {
        const tabs = document.querySelectorAll(".admin-tab-view");
        tabs.forEach(tab => tab.classList.add("d-none"));

        if (tabName === "keys") {
            const keyTab = document.getElementById("adminTabKeys");
            if (keyTab) keyTab.classList.remove("d-none");
            window.taiDanhSachKeysAdmin();
        } else if (tabName === "players") {
            const playersTab = document.getElementById("adminTabPlayers");
            if (playersTab) playersTab.classList.remove("d-none");
            window.taiDanhSachKhachChoiAdmin();
        } else if (tabName === "reviews") {
            const reviewsTab = document.getElementById("adminTabReviews");
            if (reviewsTab) reviewsTab.classList.remove("d-none");
            window.taiKhoDanhGiaAdmin();
        } else if (tabName === "config") {
            const configTab = document.getElementById("adminTabConfig");
            if (configTab) configTab.classList.remove("d-none");
            window.taiConfigTrangChuAdmin();
        }
    };

    // =========================================================================
    // 🔑 TAB 1: QUẢN LÝ KEY THUÊ TRẠM CỦA HOST
    // =========================================================================
    
    // Tải danh sách Key thuê
    window.taiDanhSachKeysAdmin = async function () {
        try {
            const keys = await window.dbEngine.doc("keys");
            const tbody = document.querySelector("#adminKeysTable tbody");
            if (!tbody) return;

            tbody.innerHTML = "";

            if (keys.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding:20px;">Không có mã Key thuê nào tồn tại trên hệ thống.</td></tr>';
                return;
            }

            keys.forEach(k => {
                const tr = document.createElement("tr");
                const isExpired = new Date(k.expires_at) < new Date();
                
                let badge = "";
                if (k.status === "locked") {
                    badge = '<span class="chip-item" style="color:hsl(var(--danger)); border-color:rgba(239,68,68,0.15);">ĐÃ KHÓA</span>';
                } else if (isExpired) {
                    badge = '<span class="chip-item" style="color:#64748b; border-color:rgba(100,116,139,0.15);">HẾT HẠN</span>';
                } else {
                    badge = '<span class="chip-item chip-item-mint">ĐANG CHẠY</span>';
                }

                tr.innerHTML = `
                    <td><b class="text-mint">${k.key}</b></td>
                    <td><b>${new Date(k.expires_at).toLocaleDateString("vi-VN")}</b></td>
                    <td>${k.note || "Chưa có ghi chú"}</td>
                    <td>${badge}</td>
                    <td>
                        <div class="flex gap-2">
                            ${k.status === "active" 
                                ? `<button class="btn-hud-back" style="padding: 4px 8px; font-size:0.7rem; color:hsl(var(--danger)); border-color:rgba(239,68,68,0.15);" onclick="window.khoaHoacMoKeyAdmin('${k.key}', 'locked')"><i class="fa-solid fa-lock"></i> Khóa</button>`
                                : `<button class="btn-hud-back" style="padding: 4px 8px; font-size:0.7rem; color:hsl(var(--neon-mint)); border-color:rgba(0,255,157,0.15);" onclick="window.khoaHoacMoKeyAdmin('${k.key}', 'active')"><i class="fa-solid fa-unlock"></i> Mở khóa</button>`
                            }
                            <button class="btn-hud-back" style="padding: 4px 8px; font-size:0.7rem; color:#64748b;" onclick="window.xoaKeyAdmin('${k.key}')"><i class="fa-solid fa-trash-can"></i> Xóa</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Lỗi tải danh sách keys admin:", e);
        }
    };

    // Sinh mã Key thuê trạm mới
    window.taoKeyMoiChoHost = async function () {
        const daysInput = document.getElementById("adminNewKeyExpiryDays");
        const noteInput = document.getElementById("adminNewKeyNote");
        if (!daysInput || !noteInput) return;

        const days = Number(daysInput.value) || 30;
        const note = noteInput.value.trim();

        if (!note) {
            window.hienToast("Trống thông tin", "Vui lòng nhập tên Host thuê (ví dụ: Sân Bách Khoa, Sân Viettel) để tiện quản lý.", "danger");
            return;
        }

        // Sinh key ngẫu nhiên theo chuẩn Emerald Premium
        const randKey = `KEY-EMERALD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);

        try {
            await window.dbEngine.ghi("keys", {
                key: randKey,
                note: note,
                expires_at: expiryDate.toISOString(),
                status: "active"
            });

            noteInput.value = "";
            window.hienToast("Tạo key thành công", `Đã cấp Key thuê trạm: ${randKey}`, "success");
            window.taiDanhSachKeysAdmin();
        } catch (e) {
            console.error("Lỗi khi tạo key mới:", e);
            window.hienToast("Lỗi hệ thống", "Không thể tạo key mới lên đám mây.", "danger");
        }
    };

    // Khóa hoặc mở khóa quyền năng của Key thuê trạm
    window.khoaHoacMoKeyAdmin = async function (key, newStatus) {
        try {
            const keys = await window.dbEngine.doc("keys");
            const matched = keys.find(k => k.key === key);
            if (!matched) return;

            matched.status = newStatus;
            await window.dbEngine.ghi("keys", matched, { key: key });

            window.hienToast("Cập nhật key", `Đã thay đổi trạng thái key ${key} sang ${newStatus === 'locked' ? 'Khóa' : 'Hoạt động'}.`, "success");
            window.taiDanhSachKeysAdmin();
        } catch (e) {
            console.error("Lỗi cập nhật key:", e);
        }
    };

    // Xóa vĩnh viễn Key thuê khỏi trạm
    window.xoaKeyAdmin = async function (key) {
        const c = confirm(`❌ XÓA KEY THUÊ TRẠM VĨNH VIỄN:\nBạn có chắc chắn muốn xóa Key ${key}? Toàn bộ lịch sử ca chơi của Host sử dụng key này sẽ bị ảnh hưởng.`);
        if (!c) return;

        try {
            await window.dbEngine.xoa("keys", { key: key });
            window.hienToast("Đã xóa key", "Key thuê trạm đã được rút ra khỏi cơ sở dữ liệu hệ thống.", "success");
            window.taiDanhSachKeysAdmin();
        } catch (e) {
            console.error("Lỗi xóa key admin:", e);
        }
    };

    // =========================================================================
    // 👥 TAB 2: LƯU TRỮ HỒ SƠ DANH SÁCH USER (KHÁCH VÀNG LAI) LÀM DATA
    // =========================================================================
    
    window.taiDanhSachKhachChoiAdmin = async function () {
        try {
            const users = await window.dbEngine.doc("users");
            const tbody = document.querySelector("#adminPlayersTable tbody");
            if (!tbody) return;

            tbody.innerHTML = "";

            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding:20px;">Chưa có cầu thủ vãng lai nào lưu hồ sơ.</td></tr>';
                return;
            }

            users.forEach(u => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><b style="color:#fff;">${u.name}</b></td>
                    <td><b>${u.phone}</b></td>
                    <td>${new Date(u.created_at || Date.now()).toLocaleDateString("vi-VN")}</td>
                    <td><b class="text-mint">${u.registered_slots || 0} Buổi ca</b></td>
                    <td><b class="text-gold">${Number(u.total_spent || 0).toLocaleString()}đ</b></td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Lỗi tải danh sách users admin:", e);
        }
    };

    // =========================================================================
    // ⭐ TAB 3: KIỂM DUYỆT ĐÁNH GIÁ 2 CHIỀU GIỮA HOST VÀ GUEST
    // =========================================================================
    
    window.taiKhoDanhGiaAdmin = async function () {
        try {
            const reviews = await window.dbEngine.doc("reviews");
            const tbody = document.querySelector("#adminReviewsTable tbody");
            if (!tbody) return;

            tbody.innerHTML = "";

            if (reviews.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding:20px;">Chưa có nhận xét hay bình chọn uy tín nào trên hệ thống.</td></tr>';
                return;
            }

            reviews.forEach(r => {
                const tr = document.createElement("tr");
                const roleBadge = r.role === "host_rating" 
                    ? '<span class="chip-item chip-item-mint">KHÁCH VOTE HOST</span>'
                    : '<span class="chip-item" style="color:hsl(var(--neon-gold)); border-color:rgba(255,215,0,0.15);">HOST VOTE KHÁCH</span>';

                tr.innerHTML = `
                    <td>
                        <b style="color:#fff;">${r.reviewer_name}</b>
                        <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">📞 ${r.reviewer_phone}</div>
                    </td>
                    <td><span style="font-size:0.8rem; color:#cbd5e1;">${r.target_identity}</span></td>
                    <td>${roleBadge}</td>
                    <td><b class="text-gold"><i class="fa-solid fa-star"></i> ${r.stars} Sao</b></td>
                    <td><span style="font-size:0.85rem; color:#e2e8f0; font-style:italic;">"${r.comment}"</span></td>
                    <td>
                        <button class="btn-hud-back" style="padding: 4px 8px; font-size:0.7rem; color:hsl(var(--danger)); border-color:rgba(239,68,68,0.15);" onclick="window.xoaDanhGiaAdmin('${r.id}')"><i class="fa-solid fa-ban"></i> Gỡ bỏ</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Lỗi tải đánh giá admin:", e);
        }
    };

    window.xoaDanhGiaAdmin = async function (reviewId) {
        const c = confirm("⚠️ KIỂM DUYỆT ĐÁNH GIÁ:\nBạn có chắc chắn muốn xóa đánh giá này khỏi hệ thống? Dữ liệu uy tín sẽ được cập nhật lại.");
        if (!c) return;

        try {
            await window.dbEngine.xoa("reviews", { id: reviewId });
            window.hienToast("Đã gỡ nhận xét", "Nhận xét không phù hợp đã bị xóa bỏ khỏi máy chủ đám mây.", "success");
            window.taiKhoDanhGiaAdmin();
        } catch (e) {
            console.error("Lỗi xóa review admin:", e);
        }
    };

    // =========================================================================
    // ⚙️ TAB 4: THIẾT LẬP CẤU HÌNH POPUP CHẠY CHỮ TRANG CHỦ
    // =========================================================================
    
    window.taiConfigTrangChuAdmin = async function () {
        try {
            const config = await window.dbEngine.doc("cau_hinh_he_thong");
            if (config && config.length > 0) {
                const data = config[0];
                const announceInput = document.getElementById("adminConfigAnnouncement");
                const slotsInput = document.getElementById("adminConfigTotalSlots");
                const playersInput = document.getElementById("adminConfigOnlinePlayers");

                if (announceInput) announceInput.value = data.announcement || "";
                if (slotsInput) slotsInput.value = data.total_slots || 45;
                if (playersInput) playersInput.value = data.online_players || 1820;
            }
        } catch (e) {
            console.error("Lỗi tải cấu hình tin tức admin:", e);
        }
    };

    window.luuCauHinhTrangChu = async function () {
        const announce = document.getElementById("adminConfigAnnouncement")?.value.trim() || "";
        const total = Number(document.getElementById("adminConfigTotalSlots")?.value) || 0;
        const online = Number(document.getElementById("adminConfigOnlinePlayers")?.value) || 0;

        const payload = {
            id: "popup_chinh",
            announcement: announce,
            total_slots: total,
            online_players: online
        };

        try {
            await window.dbEngine.ghi("cau_hinh_he_thong", payload, { id: "popup_chinh" });
            window.hienToast("Đồng bộ thành công", "Cấu hình tin tức trang chủ đã được lưu vĩnh viễn.", "success");
            window.taiConfigTrangChuAdmin();
        } catch (e) {
            console.error("Lỗi đồng bộ cấu hình trang chủ:", e);
            window.hienToast("Lỗi đồng bộ", "Không thể lưu cấu hình lên máy chủ đám mây.", "danger");
        }
    };

    // Tự động khởi chạy khi load trang admin.html
    document.addEventListener("DOMContentLoaded", () => {
        const checkDb = setInterval(() => {
            if (window.dbEngine) {
                clearInterval(checkDb);
                window.khoiTaoTrangAdmin();
            }
        }, 100);
    });

})();
