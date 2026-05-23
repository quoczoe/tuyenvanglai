/* =========================================================================
 * 👑 PHÂN HỆ QUẢN TRỊ VIÊN TỐI CAO - PHAN-HE-QUAN-TRI.JS (v2)
 * Dự án: TUYENVANGLAI.IO.VN
 * Chức năng: Xác thực admin, CRUD key host, xem big data khách vãng lai,
 *            kiểm duyệt đánh giá, cấu hình thông báo trang chủ.
 * =========================================================================
 */

(function () {
    // ── Thông tin đăng nhập Admin (hardcoded client-side) ──
    const ADMIN_USER = "admin";
    const MAT_MAU_ADMIN = "TVL@2026";  // Đổi trước khi deploy thật

    let _editingKeyId = null;

    /* ═══════════════════════════════════════════════════
     * 1. KHỞI TẠO TRANG ADMIN
     * ═══════════════════════════════════════════════════ */
    window.khoiTaoTrangAdmin = function () {
        const ok = sessionStorage.getItem("tvl_admin");
        if (ok === "ok") {
            _hienConsole();
        } else {
            _hienManLogin();
        }
    };

    function _hienManLogin() {
        _setDisplay("adminAuthPanel", "block");
        _setDisplay("adminConsole", "none");
    }

    function _hienConsole() {
        _setDisplay("adminAuthPanel", "none");
        _setDisplay("adminConsole", "block");
        window.chuyenTabAdmin("keys");
    }

    function _setDisplay(id, val) {
        const el = document.getElementById(id);
        if (el) el.style.display = val;
    }

    /* ═══════════════════════════════════════════════════
     * 2. XÁC THỰC ADMIN
     * ═══════════════════════════════════════════════════ */
    window.xacThucQuyenAdmin = function () {
        const userEl = document.getElementById("adminUsername");
        const passEl = document.getElementById("adminSecretPassword");
        const user = userEl?.value?.trim() || "";
        const pass = passEl?.value || "";

        if (user !== ADMIN_USER || pass !== MAT_MAU_ADMIN) {
            window.hienToast("Sai thông tin đăng nhập", "Tên đăng nhập hoặc mật khẩu không đúng.", "danger");
            if (passEl) passEl.value = "";
            return;
        }

        sessionStorage.setItem("tvl_admin", "ok");
        window.hienToast("Chào Admin! 👑", "Đã vào Trung Tâm Chỉ Huy thành công.", "success");
        _hienConsole();
    };

    window.dangXuatAdmin = function () {
        sessionStorage.removeItem("tvl_admin");
        window.hienToast("Đã đăng xuất", "Phiên Admin đã kết thúc an toàn.", "info");
        _hienManLogin();
    };

    /* ═══════════════════════════════════════════════════
     * 3. ĐIỀU HƯỚNG TAB
     * ═══════════════════════════════════════════════════ */
    window.chuyenTabAdmin = function (tabName) {
        document.querySelectorAll(".admin-tab-content").forEach(el => el.classList.remove("active"));
        document.querySelectorAll(".admin-tab-btn").forEach(el => el.classList.remove("active"));

        const content = document.getElementById(`adminTab_${tabName}`);
        if (content) content.classList.add("active");
        const btn = document.querySelector(`.admin-tab-btn[data-tab="${tabName}"]`);
        if (btn) btn.classList.add("active");

        // Tải dữ liệu tương ứng
        if (tabName === "keys") _taiDanhSachKey();
        else if (tabName === "guests") _taiDanhSachKhach();
        else if (tabName === "reviews") _taiDanhSachDanhGia();
        else if (tabName === "config") _taiThongBao();
        else if (tabName === "stats") _taiThongKe();
    };

    /* ═══════════════════════════════════════════════════
     * 4. THỐNG KÊ TỔNG QUAN
     * ═══════════════════════════════════════════════════ */
    async function _taiThongKe() {
        try {
            const [keys, slots, users, reviews] = await Promise.all([
                window.dbEngine.doc("keys"),
                window.dbEngine.doc("slots"),
                window.dbEngine.doc("users"),
                window.dbEngine.doc("reviews")
            ]);
            _st("statTotalKeys", keys.length);
            _st("statTotalSlots", slots.length);
            _st("statTotalGuests", users.length);
            _st("statTotalReviews", reviews.length);
            _st("statActiveKeys", keys.filter(k => (k.status || "") === "active").length);
            _st("statOpenSlots", slots.filter(s => !s.da_chot_ca && s.status !== "closed").length);
        } catch (e) { console.error("Thống kê lỗi:", e); }
    }

    function _st(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    /* ═══════════════════════════════════════════════════
     * 5. QUẢN LÝ KEY HOST
     * ═══════════════════════════════════════════════════ */
    async function _taiDanhSachKey() {
        const tbody = document.getElementById("adminKeysBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:16px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;
        try {
            const keys = await window.dbEngine.doc("keys");
            keys.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            if (keys.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:#64748b;">Chưa có Key. Tạo Key đầu tiên!</td></tr>`;
                return;
            }
            tbody.innerHTML = "";
            keys.forEach(k => {
                const keyVal = k.key || k.ma_key || "--";
                const status = k.status || k.trang_thai || "inactive";
                const expDate = k.expires_at || k.ngay_het_han;
                const isExpired = expDate && new Date(expDate) < new Date();
                const sClass = status === "active" ? "status-active" : status === "locked" ? "status-closed" : "status-pending";
                const sText = status === "active" ? "Đang chạy" : status === "locked" ? "Bị khóa" : "Chưa kích hoạt";
                const hasDevice = !!(k.id_thiet_bi || k.device_id);
                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td><code style="font-size:0.75rem;color:hsl(var(--neon-mint));background:rgba(0,255,157,0.08);padding:3px 7px;border-radius:4px;">${keyVal}</code></td>
                <td style="font-size:0.82rem;font-weight:600;">${k.ten_host || k.note || "--"}</td>
                <td style="font-size:0.78rem;color:#94a3b8;">${k.sdt_host || k.phone || "--"}</td>
                <td><span class="status-badge ${sClass}">${sText}</span>${isExpired ? '<br><span class="status-badge status-closed" style="margin-top:2px;font-size:0.65rem;">Hết hạn</span>' : ""}</td>
                <td style="font-size:0.78rem;">${expDate ? new Date(expDate).toLocaleDateString("vi-VN") : "--"}</td>
                <td style="font-size:0.75rem;">${hasDevice ? '<span style="color:hsl(var(--neon-mint))">🔗 Liên kết</span>' : '<span style="color:#374151;">⬜ Trống</span>'}</td>
                <td style="font-size:0.78rem;color:#94a3b8;">${k.so_ngay_duoc_xai || k.days || 30} ngày</td>
                <td>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;">
                        <button class="btn-mini btn-mini-gold" onclick="window.moModalSuaKey('${keyVal}')" title="Sửa"><i class="fa-solid fa-pen"></i></button>
                        ${status !== "locked" ? `<button class="btn-mini btn-mini-red" onclick="window.khoaKeyAdmin('${keyVal}')" title="Khóa"><i class="fa-solid fa-lock"></i></button>`
                            : `<button class="btn-mini btn-mini-green" onclick="window.moKhoaKeyAdmin('${keyVal}')" title="Mở khóa"><i class="fa-solid fa-lock-open"></i></button>`}
                        ${hasDevice ? `<button class="btn-mini btn-mini-cyan" onclick="window.resetThietBiAdmin('${keyVal}')" title="Reset thiết bị"><i class="fa-solid fa-rotate-right"></i></button>` : ""}
                        <button class="btn-mini btn-mini-red" onclick="window.xoaKeyAdmin('${keyVal}')" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>`;
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:red;padding:16px;">Lỗi tải dữ liệu.</td></tr>`;
        }
    }

    // Sinh mã TVL-XXXXX-XXXX
    function _sinhMaKey() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const rand = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        return `TVL-${rand(5)}-${rand(4)}`;
    }

    window.moModalTaoKey = function () {
        _editingKeyId = null;
        const el = document.getElementById("keyFormMaKey");
        if (el) { el.value = _sinhMaKey(); el.readOnly = false; }
        _setVal("keyFormTenHost", "");
        _setVal("keyFormSdtHost", "");
        _setVal("keyFormSoNgay", "30");
        _setVal("keyFormGoi", "basic");
        _setVal("keyFormStatus", "active");
        _st("modalKeyTitle", "Tạo Key Mới");
        _setDisplay("modalKeyOverlay", "flex");
    };

    window.sinhLaiMaKey = function () {
        const el = document.getElementById("keyFormMaKey");
        if (el && !el.readOnly) el.value = _sinhMaKey();
    };

    window.moModalSuaKey = async function (keyVal) {
        try {
            const keys = await window.dbEngine.doc("keys");
            const k = keys.find(x => (x.key || x.ma_key) === keyVal);
            if (!k) { window.hienToast("Không tìm thấy", "Key không còn tồn tại.", "danger"); return; }
            _editingKeyId = keyVal;
            const el = document.getElementById("keyFormMaKey");
            if (el) { el.value = k.key || k.ma_key || ""; el.readOnly = true; }
            _setVal("keyFormTenHost", k.ten_host || k.note || "");
            _setVal("keyFormSdtHost", k.sdt_host || k.phone || "");
            _setVal("keyFormSoNgay", String(k.so_ngay_duoc_xai || k.days || 30));
            _setVal("keyFormGoi", k.goi_dich_vu || k.plan || "basic");
            _setVal("keyFormStatus", k.status || k.trang_thai || "active");
            _st("modalKeyTitle", "Chỉnh Sửa Key");
            _setDisplay("modalKeyOverlay", "flex");
        } catch (e) { window.hienToast("Lỗi", "Không tải được key.", "danger"); }
    };

    function _setVal(id, val) {
        const el = document.getElementById(id);
        if (el) el.value = val;
    }

    window.dongModalKey = function () {
        _setDisplay("modalKeyOverlay", "none");
        const el = document.getElementById("keyFormMaKey");
        if (el) el.readOnly = false;
        _editingKeyId = null;
    };

    window.luuKey = async function () {
        const maKey = document.getElementById("keyFormMaKey")?.value?.trim().toUpperCase();
        const tenHost = document.getElementById("keyFormTenHost")?.value?.trim();
        const sdtHost = document.getElementById("keyFormSdtHost")?.value?.trim();
        const soNgay = Number(document.getElementById("keyFormSoNgay")?.value) || 30;
        const goi = document.getElementById("keyFormGoi")?.value || "basic";
        const status = document.getElementById("keyFormStatus")?.value || "active";
        if (!maKey || !tenHost) { window.hienToast("Thiếu thông tin", "Điền Mã Key và Tên Host.", "danger"); return; }

        const btn = document.getElementById("btnLuuKey");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
        try {
            const now = new Date();
            const exp = new Date(now.getTime() + soNgay * 86400000);
            const payload = {
                key: maKey, ma_key: maKey,
                ten_host: tenHost, note: tenHost,
                sdt_host: sdtHost, phone: sdtHost,
                so_ngay_duoc_xai: soNgay, days: soNgay,
                goi_dich_vu: goi, plan: goi,
                status, trang_thai: status === "active" ? "Đang chạy" : status === "locked" ? "Bị khóa" : "Chưa kích hoạt",
                expires_at: exp.toISOString(), ngay_het_han: exp.toISOString()
            };
            if (_editingKeyId) {
                await window.dbEngine.ghi("keys", payload, { key: _editingKeyId });
                window.hienToast("Cập nhật Key ✅", `Key ${maKey} đã được chỉnh sửa.`, "success");
            } else {
                payload.created_at = now.toISOString();
                await window.dbEngine.ghi("keys", payload);
                window.hienToast("Tạo Key thành công! 🔑", `Key ${maKey} cho ${tenHost}.`, "success");
            }
            window.dongModalKey();
            await _taiDanhSachKey();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể lưu Key.", "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Key'; }
        }
    };

    window.khoaKeyAdmin = async function (k) {
        if (!confirm(`Khóa Key ${k}?`)) return;
        try {
            await window.dbEngine.ghi("keys", { status: "locked", trang_thai: "Bị khóa" }, { key: k });
            window.hienToast("Đã khóa 🔒", `Key ${k} bị khóa.`, "success");
            await _taiDanhSachKey();
        } catch (e) { window.hienToast("Lỗi", "Không khóa được.", "danger"); }
    };

    window.moKhoaKeyAdmin = async function (k) {
        try {
            await window.dbEngine.ghi("keys", { status: "active", trang_thai: "Đang chạy" }, { key: k });
            window.hienToast("Đã mở khóa 🔓", `Key ${k} hoạt động trở lại.`, "success");
            await _taiDanhSachKey();
        } catch (e) { window.hienToast("Lỗi", "Không mở khóa được.", "danger"); }
    };

    window.resetThietBiAdmin = async function (k) {
        if (!confirm(`Reset thiết bị cho Key ${k}?`)) return;
        try {
            await window.dbEngine.ghi("keys", { id_thiet_bi: null, device_id: null }, { key: k });
            window.hienToast("Reset thiết bị ✅", `Key ${k} có thể kích hoạt thiết bị mới.`, "success");
            await _taiDanhSachKey();
        } catch (e) { window.hienToast("Lỗi", "Không reset được.", "danger"); }
    };

    window.xoaKeyAdmin = async function (k) {
        if (!confirm(`XÓA VĨNH VIỄN Key ${k}?\nKHÔNG THỂ HOÀN TÁC!`)) return;
        try {
            await window.dbEngine.xoa("keys", { key: k });
            window.hienToast("Đã xóa Key", `Key ${k} đã bị xóa.`, "info");
            await _taiDanhSachKey();
        } catch (e) { window.hienToast("Lỗi", "Không xóa được.", "danger"); }
    };

    window.locKeyAdmin = function () {
        const q = document.getElementById("adminKeySearch")?.value?.toLowerCase() || "";
        document.querySelectorAll("#adminKeysBody tr").forEach(r => {
            r.style.display = !q || r.textContent.toLowerCase().includes(q) ? "" : "none";
        });
    };

    /* ═══════════════════════════════════════════════════
     * 6. BIG DATA KHÁCH VÃNG LAI
     * ═══════════════════════════════════════════════════ */
    async function _taiDanhSachKhach() {
        const tbody = document.getElementById("adminGuestsBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px;color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>`;
        try {
            const [slots, users] = await Promise.all([window.dbEngine.doc("slots"), window.dbEngine.doc("users")]);
            const map = new Map();
            users.forEach(u => {
                if (!map.has(u.phone)) map.set(u.phone, { name: u.name, phone: u.phone, joined: u.joined_at || u.created_at, sessions: 0, spent: 0, hosts: new Set() });
            });
            slots.forEach(slot => {
                (slot.registered_guests || []).forEach(g => {
                    const p = g.phone || g.sdt_khach || "";
                    if (!p) return;
                    if (!map.has(p)) map.set(p, { name: g.name || g.ten_khach || "Ẩn danh", phone: p, joined: g.registered_at || null, sessions: 0, spent: 0, hosts: new Set() });
                    const info = map.get(p);
                    if (g.attendance === "Đã tham gia" || g.attendance === "present") {
                        info.sessions++;
                        info.spent += slot.price_male || slot.price_female || 0;
                        if (slot.host_key) info.hosts.add(slot.host_key);
                    }
                });
            });
            const list = Array.from(map.values()).sort((a, b) => b.sessions - a.sessions);
            _st("adminGuestCount", `${list.length} thành viên`);
            if (list.length === 0) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b;">Chưa có khách nào.</td></tr>`; return; }
            tbody.innerHTML = "";
            list.forEach((g, i) => {
                const tr = document.createElement("tr");
                const d = g.joined ? new Date(g.joined).toLocaleDateString("vi-VN") : "--";
                tr.innerHTML = `
                <td style="color:#64748b;font-size:0.8rem;">${i + 1}</td>
                <td style="font-weight:700;font-size:0.85rem;">${g.name}</td>
                <td><a href="https://zalo.me/${g.phone}" target="_blank" style="color:hsl(var(--neon-cyan));font-size:0.82rem;"><i class="fa-solid fa-comment"></i> ${g.phone}</a></td>
                <td style="font-size:0.8rem;color:#94a3b8;">${d}</td>
                <td style="font-weight:700;color:hsl(var(--neon-mint));">${g.sessions} ca</td>
                <td>
                    <span style="font-weight:700;color:hsl(var(--neon-gold));">${_fVND(g.spent)}</span>
                    <br><span style="font-size:0.7rem;color:#64748b;">${g.hosts.size} host</span>
                </td>`;
                tbody.appendChild(tr);
            });
        } catch (e) { tbody.innerHTML = `<tr><td colspan="6" style="color:red;text-align:center;padding:16px;">Lỗi tải dữ liệu.</td></tr>`; }
    }

    window.locKhachAdmin = function () {
        const q = document.getElementById("adminGuestSearch")?.value?.toLowerCase() || "";
        document.querySelectorAll("#adminGuestsBody tr").forEach(r => {
            r.style.display = !q || r.textContent.toLowerCase().includes(q) ? "" : "none";
        });
    };

    /* ═══════════════════════════════════════════════════
     * 7. QUẢN LÝ ĐÁNH GIÁ
     * ═══════════════════════════════════════════════════ */
    async function _taiDanhSachDanhGia() {
        const tbody = document.getElementById("adminReviewsBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px;color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>`;
        try {
            const reviews = await window.dbEngine.doc("reviews");
            reviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            if (reviews.length === 0) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b;">Chưa có đánh giá nào.</td></tr>`; return; }
            tbody.innerHTML = "";
            reviews.forEach(r => {
                const stars = Array(5).fill(0).map((_, i) =>
                    `<i class="fa-solid fa-star" style="color:${i < (r.so_sao || 0) ? "hsl(var(--neon-gold))" : "#374151"};font-size:0.8rem;"></i>`
                ).join("");
                const badge = r.loai === "GuestToHost"
                    ? '<span class="status-badge status-active" style="font-size:0.65rem;">Guest→Host</span>'
                    : '<span class="status-badge status-pending" style="font-size:0.65rem;">Host→Guest</span>';
                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td>${badge}</td>
                <td style="font-size:0.78rem;color:#94a3b8;">${r.reviewer_phone || "--"}</td>
                <td style="font-size:0.78rem;color:#94a3b8;">${r.reviewed_phone || "--"}</td>
                <td>${stars}</td>
                <td style="font-size:0.78rem;max-width:200px;">${r.nhan_xet || "<em style='color:#64748b'>Không nhận xét</em>"}</td>
                <td style="font-size:0.72rem;color:#64748b;">
                    ${r.created_at ? new Date(r.created_at).toLocaleDateString("vi-VN") : "--"}
                    <br><button class="btn-mini btn-mini-red" onclick="window.xoaDanhGiaAdmin('${r.id}')"><i class="fa-solid fa-trash"></i> Xóa</button>
                </td>`;
                tbody.appendChild(tr);
            });
        } catch (e) { tbody.innerHTML = `<tr><td colspan="6" style="color:red;text-align:center;padding:16px;">Lỗi tải.</td></tr>`; }
    }

    window.xoaDanhGiaAdmin = async function (id) {
        if (!confirm("Xóa đánh giá này?")) return;
        try {
            await window.dbEngine.xoa("reviews", { id });
            window.hienToast("Đã xóa đánh giá", "Bài đánh giá đã bị gỡ.", "info");
            await _taiDanhSachDanhGia();
        } catch (e) { window.hienToast("Lỗi", "Không xóa được.", "danger"); }
    };

    /* ═══════════════════════════════════════════════════
     * 8. CẤU HÌNH THÔNG BÁO TRANG CHỦ
     * ═══════════════════════════════════════════════════ */
    async function _taiThongBao() {
        try {
            const configs = await window.dbEngine.doc("cau_hinh_he_thong");
            const cfg = Array.isArray(configs) ? configs[0] : configs;
            _setVal("adminAnnouncementContent", cfg?.noi_dung_thong_bao || cfg?.announcement || "");
            _setVal("adminConfigTotalSlots", String(cfg?.total_slots || 45));
            _setVal("adminConfigOnlinePlayers", String(cfg?.online_players || 1820));
        } catch (e) { console.error("Lỗi tải thông báo:", e); }
    }

    window.luuThongBaoAdmin = async function () {
        const content = document.getElementById("adminAnnouncementContent")?.value?.trim() || "";
        const total = Number(document.getElementById("adminConfigTotalSlots")?.value) || 45;
        const online = Number(document.getElementById("adminConfigOnlinePlayers")?.value) || 1820;
        const btn = document.getElementById("btnLuuThongBao");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
        try {
            await window.dbEngine.ghi("cau_hinh_he_thong", {
                id: "popup_chinh",
                noi_dung_thong_bao: content, announcement: content,
                total_slots: total, online_players: online,
                updated_at: new Date().toISOString()
            });
            window.hienToast("Đã lưu thông báo ✅", "Thông báo trang chủ cập nhật thành công.", "success");
        } catch (e) { window.hienToast("Lỗi", "Không lưu được.", "danger"); }
        finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Thông Báo'; } }
    };

    /* ═══════════════════════════════════════════════════
     * 9. TIỆN ÍCH
     * ═══════════════════════════════════════════════════ */
    function _fVND(n) { return Number(n || 0).toLocaleString("vi-VN") + "đ"; }

    // Khởi chạy khi load trang admin.html
    document.addEventListener("DOMContentLoaded", () => {
        const check = setInterval(() => {
            if (window.khoiTaoTheme && window.khoiTaoHologramGlow && window.dbEngine) {
                clearInterval(check);
                window.khoiTaoTheme();
                window.khoiTaoHologramGlow();
                window.khoiTaoTrangAdmin();
            }
        }, 100);
    });

    console.log("⚡ [Phân Hệ Admin]: Khởi động thành công.");
})();
