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
        // Khôi phục tab từ URL hash nếu có, không thì mặc định "keys"
        const hashTab = (location.hash || '').replace('#tab-', '');
        const validTabs = ['keys','guests','reviews','config','stats'];
        window.chuyenTabAdmin(validTabs.includes(hashTab) ? hashTab : "keys");
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
        // Hỗ trợ cả 2 tên class (ad-tab-* mới và admin-tab-* cũ) để tương thích
        document.querySelectorAll(".ad-tab-content, .admin-tab-content").forEach(el => {
            el.classList.remove("active");
            el.style.display = "none";
        });
        document.querySelectorAll(".ad-tab-btn, .admin-tab-btn").forEach(el => el.classList.remove("active"));

        const content = document.getElementById(`adminTab_${tabName}`);
        if (content) {
            content.classList.add("active");
            content.style.display = "block";
        }
        const btn = document.querySelector(`.ad-tab-btn[data-tab="${tabName}"], .admin-tab-btn[data-tab="${tabName}"]`);
        if (btn) btn.classList.add("active");

        // Ghi hash URL (không reload)
        history.replaceState(null, '', '#tab-' + tabName);

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
            const now = new Date();
            const activeKeys = keys.filter(k => {
                const s = k.status || k.trang_thai || '';
                return s === 'active' || s === 'Đang chạy';
            }).length;
            const openSlots = slots.filter(s => !s.da_chot_ca && s.status !== "closed").length;

            // Tab Thống kê
            _st("statTotalKeys",    keys.length);
            _st("statActiveKeys",   activeKeys);
            _st("statTotalSlots",   slots.length);
            _st("statOpenSlots",    openSlots);
            _st("statTotalGuests",  users.length);
            _st("statTotalReviews", reviews.length);

            // 4 Metric cards đầu trang
            const expiredKeys = keys.filter(k => {
                const exp = k.expires_at || k.ngay_het_han;
                return exp && new Date(exp) < now;
            }).length;
            _capNhatMetric('metricTotalKeys',   keys.length);
            _capNhatMetric('metricActiveKeys',  activeKeys);
            _capNhatMetric('metricExpiredKeys', expiredKeys);
            _capNhatMetric('metricTotalHosts',  keys.filter(k => !!(k.ten_host || k.note)).length);

            // Phân tích trạng thái key
            const breakdown = document.getElementById("keyStatusBreakdown");
            if (breakdown) {
                const locked   = keys.filter(k => (k.status||k.trang_thai||'') === 'locked' || (k.status||k.trang_thai||'') === 'Bị khóa').length;
                const inactive = keys.filter(k => {
                    const s = k.status || k.trang_thai || '';
                    return s === 'inactive' || s === 'Chưa kích hoạt' || s === '';
                }).length;
                breakdown.innerHTML = `
                    <div style="display:flex;justify-content:space-between;font-size:0.82rem;">
                        <span style="color:#9ca3af;">Đang chạy</span>
                        <span style="color:#00ff88;font-weight:700;">${activeKeys}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.82rem;">
                        <span style="color:#9ca3af;">Chưa kích hoạt</span>
                        <span style="color:#9ca3af;font-weight:700;">${inactive}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.82rem;">
                        <span style="color:#9ca3af;">Bị khóa</span>
                        <span style="color:#ef4444;font-weight:700;">${locked}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.82rem;">
                        <span style="color:#9ca3af;">Hết hạn</span>
                        <span style="color:#fb923c;font-weight:700;">${expiredKeys}</span>
                    </div>`;
            }
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
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;
        try {
            const keys = await window.dbEngine.doc("keys");
            keys.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            // ── Cập nhật 4 metric cards ──
            const now = new Date();
            const totalKeys = keys.length;
            const activeKeys = keys.filter(k => {
                const s = k.status || k.trang_thai || '';
                return s === 'active' || s === 'Đang chạy';
            }).length;
            const expiredKeys = keys.filter(k => {
                const exp = k.expires_at || k.ngay_het_han;
                return exp && new Date(exp) < now;
            }).length;
            const totalHosts = keys.filter(k => !!(k.ten_host || k.note)).length;
            _capNhatMetric('metricTotalKeys',   totalKeys);
            _capNhatMetric('metricActiveKeys',  activeKeys);
            _capNhatMetric('metricExpiredKeys', expiredKeys);
            _capNhatMetric('metricTotalHosts',  totalHosts);
            // Gọi hook từ admin.html nếu có
            if (typeof window._capNhatMetricsAdmin === 'function') window._capNhatMetricsAdmin(keys);

            if (keys.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">Chưa có Key nào. Bấm "Tạo Key Mới" để bắt đầu!</td></tr>`;
                return;
            }
            tbody.innerHTML = "";
            keys.forEach(k => {
                const keyVal   = k.key || k.ma_key || "--";
                // Chuẩn hoá status về 3 giá trị: active / locked / inactive
                let rawStatus  = k.status || k.trang_thai || "inactive";
                let normStatus = "inactive";
                if (rawStatus === "active"   || rawStatus === "Đang chạy")      normStatus = "active";
                else if (rawStatus === "locked" || rawStatus === "Bị khóa")     normStatus = "locked";

                const expDate  = k.expires_at || k.ngay_het_han;
                const isExpired = expDate && new Date(expDate) < now;
                const isExpiring = !isExpired && expDate && (new Date(expDate) - now) / 86400000 <= 7;
                /*
                 * FIX 2 — NÚT RESET THIẾT BỊ:
                 * Kiểm tra chặt chẽ: chỉ coi là "có thiết bị" khi trường
                 * id_thiet_bi (hoặc device_id) tồn tại VÀ không phải chuỗi rỗng.
                 * Ngăn nút Reset hiện ở các Key chưa được kích hoạt lần nào.
                 */
                const hasDevice = (
                    !!(k.id_thiet_bi && String(k.id_thiet_bi).trim() !== '') ||
                    !!(k.device_id   && String(k.device_id).trim()   !== '')
                );
                const goi = k.goi_dich_vu || k.plan || "basic";

                // Badge trạng thái
                let badgeHTML = '';
                if (normStatus === 'active' && !isExpired) {
                    badgeHTML = `<span class="ad-badge-running"><i class="fa-solid fa-circle" style="font-size:0.45em;"></i> Đang chạy</span>`;
                } else if (normStatus === 'locked') {
                    badgeHTML = `<span class="ad-badge-locked"><i class="fa-solid fa-lock" style="font-size:0.7em;"></i> Bị khóa</span>`;
                } else if (isExpired) {
                    badgeHTML = `<span class="ad-badge-inactive"><i class="fa-solid fa-hourglass-end" style="font-size:0.7em;"></i> Hết hạn</span>`;
                } else {
                    badgeHTML = `<span class="ad-badge-inactive"><i class="fa-regular fa-clock" style="font-size:0.7em;"></i> Chưa kích hoạt</span>`;
                }
                if (isExpiring && normStatus === 'active') {
                    badgeHTML += `<br><span class="ad-badge-expiring" style="margin-top:3px;"><i class="fa-solid fa-triangle-exclamation" style="font-size:0.7em;"></i> Sắp hết hạn</span>`;
                }

                // Gói dịch vụ
                const goiLabel = goi === 'vip' ? `<span class="plan-vip">🥇 VIP</span>`
                    : goi === 'pro' ? `<span class="plan-pro">🥈 Pro</span>`
                    : `<span class="plan-basic">🥉 Basic</span>`;

                const tr = document.createElement("tr");
                // ⬇ data-status và data-expiry để filter hoạt động
                tr.setAttribute('data-status', isExpired ? 'inactive' : normStatus);
                tr.setAttribute('data-expiry', expDate || '');
                tr.innerHTML = `
                <td class="mono">${keyVal}</td>
                <td style="font-weight:600;">${k.ten_host || k.note || "--"}</td>
                <td style="color:#9ca3af;">${k.sdt_host || k.phone || "--"}</td>
                <td>${badgeHTML}</td>
                <td style="font-size:0.78rem;color:${isExpired ? '#ef4444' : isExpiring ? '#fb923c' : '#9ca3af'};">
                    ${expDate ? new Date(expDate).toLocaleDateString("vi-VN") : "--"}
                </td>
                <td style="font-size:0.75rem;">
                    ${hasDevice
                        ? `<span style="color:#00ff88;"><i class="fa-solid fa-link"></i> Liên kết</span>`
                        : `<span style="color:#64748b;"><i class="fa-solid fa-link-slash"></i> Trống</span>`}
                </td>
                <td>${goiLabel} <span style="color:#64748b;font-size:0.75rem;">/ ${k.so_ngay_duoc_xai || k.days || 30}d</span></td>
                <td>
                    <div class="ad-actions">
                        <button class="ad-btn-icon" onclick="window.moModalSuaKey('${keyVal}')" title="Sửa key"><i class="fa-solid fa-pen"></i></button>
                        ${normStatus !== "locked"
                            ? `<button class="ad-btn-icon" onclick="window.khoaKeyAdmin('${keyVal}')" title="Khóa key" style="color:#fb923c;border-color:rgba(251,146,60,0.4);"><i class="fa-solid fa-lock"></i></button>`
                            : `<button class="ad-btn-icon" onclick="window.moKhoaKeyAdmin('${keyVal}')" title="Mở khóa" style="color:#00ff88;border-color:rgba(0,255,136,0.4);"><i class="fa-solid fa-lock-open"></i></button>`}
                        ${hasDevice
                            ? `<button class="ad-btn-icon" onclick="window.resetThietBiAdmin('${keyVal}')" title="Reset thiết bị" style="color:#60a5fa;border-color:rgba(96,165,250,0.4);"><i class="fa-solid fa-rotate-right"></i></button>`
                            : ""}
                        <button class="ad-btn-icon red" onclick="window.xoaKeyAdmin('${keyVal}')" title="Xóa key"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>`;
                tbody.appendChild(tr);
            });

            // Áp lại filter hiện tại (nếu đang chọn filter khác "all")
            if (typeof window.locKeyTheoTrangThai === 'function' && window._currentKeyFilter && window._currentKeyFilter !== 'all') {
                window.locKeyTheoTrangThai(window._currentKeyFilter, null);
            }
        } catch (e) {
            console.error("Lỗi tải key:", e);
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#ef4444;padding:20px;">
                <i class="fa-solid fa-circle-exclamation"></i> Lỗi tải dữ liệu: ${e.message || e}</td></tr>`;
        }
    }

    function _capNhatMetric(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
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
        /* FIX 3: cập nhật colspan từ 6 → 7 (cột "Tổng Chi / Host" đã tách thành 2 cột) */
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:16px;color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>`;
        try {
            const [slots, users] = await Promise.all([window.dbEngine.doc("slots"), window.dbEngine.doc("users")]);

            /* Xây dựng map SĐT → thông tin khách từ bảng users */
            const map = new Map();
            users.forEach(u => {
                if (!map.has(u.phone)) map.set(u.phone, {
                    name: u.name, phone: u.phone,
                    joined: u.joined_at || u.created_at,
                    sessions: 0, spent: 0, hosts: new Set()
                });
            });

            /* Quét toàn bộ slot để cộng dồn chi phí và đếm host */
            slots.forEach(slot => {
                (slot.registered_guests || []).forEach(g => {
                    const p = g.phone || g.sdt_khach || "";
                    if (!p) return;
                    if (!map.has(p)) map.set(p, {
                        name: g.name || g.ten_khach || "Ẩn danh",
                        phone: p, joined: g.registered_at || null,
                        sessions: 0, spent: 0, hosts: new Set()
                    });
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

            if (list.length === 0) {
                /* FIX 3: colspan 7 */
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">Chưa có khách nào.</td></tr>`;
                return;
            }

            tbody.innerHTML = "";
            list.forEach((g, i) => {
                const tr = document.createElement("tr");
                const d = g.joined ? new Date(g.joined).toLocaleDateString("vi-VN") : "--";
                tr.innerHTML = `
                <td style="color:#64748b;font-size:0.8rem;">${i + 1}</td>
                <td style="font-weight:700;font-size:0.85rem;">${g.name}</td>
                <td><a href="https://zalo.me/${g.phone}" target="_blank"
                    style="color:#00d4ff;font-size:0.82rem;text-decoration:none;">
                    <i class="fa-solid fa-comment"></i> ${g.phone}
                </a></td>
                <td style="font-size:0.8rem;color:#94a3b8;">${d}</td>
                <td style="font-weight:700;color:#00ff88;">${g.sessions} ca</td>
                <!-- FIX 3: tách thành 2 ô riêng biệt, rõ ràng từng số liệu -->
                <td style="font-weight:700;color:#00ff88;">${_fVND(g.spent)}</td>
                <td style="font-weight:700;color:#a78bfa;text-align:center;">${g.hosts.size}</td>`;
                tbody.appendChild(tr);
            });
        } catch (e) {
            /* FIX 3: colspan 7 */
            tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444;text-align:center;padding:16px;">Lỗi tải dữ liệu: ${e.message || e}</td></tr>`;
        }
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
    /*
     * FIX 4 — KIỂM DUYỆT ĐÁNH GIÁ:
     * Tải song song reviews + users + keys + slots để xây dựng bản đồ tra cứu.
     * Mỗi đánh giá sẽ hiển thị:
     *   - Người viết / Đối tượng: "Tên (SĐT rút gọn)" thay vì SĐT thuần
     *   - Ca Đấu: "Tên sân - Ngày đánh" để Admin nhận biết ngữ cảnh
     */
    /*
     * ═══════════════════════════════════════════════════════════════
     * KIỂM DUYỆT ĐÁNH GIÁ — _taiDanhSachDanhGia()
     *
     * Chiến lược tải dữ liệu Ca Đấu (FIX 2 — cột Ca Đấu hiển thị "--"):
     *   - Tải song song: reviews, users, keys, slots (ca_dau).
     *   - Thử thêm dbEngine.doc("ca_dau") như nguồn dự phòng.
     *     Nếu dbEngine không nhận key "ca_dau", Promise.catch trả về [].
     *   - Gộp cả 2 nguồn vào mapCaDauTheoId để tăng tỷ lệ tìm thấy.
     *   - Tra cứu theo: r.id_ca_dau → r.id_ca → r.match_id (fallback chain).
     *   - Nếu tìm thấy → hiển thị Tên Sân + Ngày đánh.
     *   - Nếu có ID nhưng chưa có data → hiện 8 ký tự đầu UUID để tra cứu.
     *   - Nếu không có ID → hiện badge "Chưa liên kết" màu muted.
     * ═══════════════════════════════════════════════════════════════
     */
    async function _taiDanhSachDanhGia() {
        const tbody = document.getElementById("adminReviewsBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:16px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải đánh giá...</td></tr>`;
        try {
            /*
             * Tải song song 5 nguồn — ca_dau là nguồn dự phòng cho cột Ca Đấu.
             * Dùng .catch(() => []) để hàm không bị lỗi nếu dbEngine không hỗ trợ key "ca_dau".
             */
            const [reviews, users, keys, slots, caDauDuPhong] = await Promise.all([
                window.dbEngine.doc("reviews"),
                window.dbEngine.doc("users"),
                window.dbEngine.doc("keys"),
                window.dbEngine.doc("slots"),          /* Ánh xạ chính: bảng ca_dau */
                window.dbEngine.doc("ca_dau").catch(() => []) /* Ánh xạ dự phòng tên khác */
            ]);

            /* ── Bản đồ SĐT Khách → Tên hiển thị (từ bảng users) ── */
            const mapKhachTheoSdt = new Map();
            users.forEach(u => {
                const sdt = u.phone || u.sdt_khach || "";
                const ten = u.name  || u.ten_khach || "";
                if (sdt && ten && !mapKhachTheoSdt.has(sdt)) mapKhachTheoSdt.set(sdt, ten);
            });

            /* ── Bản đồ SĐT Host → Tên Host (từ bảng quan_ly_key) ── */
            const mapHostTheoSdt = new Map();
            keys.forEach(k => {
                const sdt = k.sdt_host || k.phone || "";
                const ten = k.ten_host || k.note  || "";
                if (sdt && ten && !mapHostTheoSdt.has(sdt)) mapHostTheoSdt.set(sdt, ten);
            });

            /*
             * ── Bản đồ ID Ca Đấu → { tenSan, ngayDanh } ──
             * Gộp cả "slots" (ánh xạ chính) và "caDauDuPhong" (dự phòng).
             * Các trường được thử theo thứ tự ưu tiên để tương thích với
             * cả schema Supabase thật và LocalStorage sandbox.
             */
            const mapCaDauTheoId = new Map();
            [...slots, ...caDauDuPhong].forEach(s => {
                /* Thử nhiều tên trường ID khác nhau */
                const id = s.id || s.id_ca_dau || "";
                if (!id) return;
                /* Lấy tên sân theo thứ tự ưu tiên */
                const tenSan = s.ten_san || s.venue_name || s.venue || "Ca đấu không tên";
                /* Lấy ngày theo thứ tự ưu tiên */
                const ngay   = s.ngay_danh || s.match_date || s.date || "";
                if (!mapCaDauTheoId.has(id)) {
                    mapCaDauTheoId.set(id, { tenSan, ngay });
                }
            });

            /* Tra tên người dùng theo SĐT: ưu tiên bảng khách, fallback bảng host */
            function _layTen(sdt) {
                if (!sdt) return "Ẩn danh";
                return mapKhachTheoSdt.get(sdt) || mapHostTheoSdt.get(sdt) || "Ẩn danh";
            }

            /*
             * Rút gọn SĐT: hiển thị 6 ký tự đầu + "..."
             * Ví dụ: "096144..." giúp nhận diện mà không lộ hoàn toàn.
             */
            function _rutGonSdt(sdt) {
                if (!sdt) return "--";
                return sdt.length > 6 ? sdt.substring(0, 6) + "..." : sdt;
            }

            /* Sắp xếp đánh giá: mới nhất lên đầu */
            reviews.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            if (reviews.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">
                    <i class="fa-solid fa-star" style="font-size:1.5rem;opacity:0.3;display:block;margin-bottom:8px;"></i>
                    Chưa có đánh giá nào trong hệ thống.
                </td></tr>`;
                return;
            }

            tbody.innerHTML = "";
            reviews.forEach(r => {
                /* Dải sao từ 1 đến 5 — sao vàng / sao xám */
                const soSao = Math.max(0, Math.min(5, r.so_sao || r.rating || 0));
                const stars = Array(5).fill(0).map((_, i) =>
                    `<i class="fa-solid fa-star" style="color:${i < soSao ? '#fbbf24' : '#2d3748'};font-size:0.82rem;"></i>`
                ).join("");

                /* Badge loại đánh giá: Khách→Host hoặc Host→Khách */
                const loai = r.loai_danh_gia || r.loai_danh_gia || r.review_type || r.loai || "";
                const badge = loai === "GuestToHost"
                    ? `<span class="ad-badge-running" style="font-size:0.65rem;white-space:nowrap;gap:3px;">👤→🏸 Khách→Host</span>`
                    : `<span class="ad-badge-inactive" style="font-size:0.65rem;white-space:nowrap;gap:3px;">🏸→👤 Host→Khách</span>`;

                /* SĐT và tên người viết / đối tượng bị đánh giá */
                const sdtViet = r.sdt_nguoi_viet        || r.reviewer_phone  || "";
                const sdtBiDG = r.sdt_nguoi_bi_danh_gia || r.reviewed_phone  || "";
                const tenViet  = _layTen(sdtViet);
                const tenBiDG  = _layTen(sdtBiDG);

                /*
                 * Thông tin Ca Đấu — tra cứu theo fallback chain:
                 * r.id_ca_dau → r.id_ca → r.match_id → r.session_id
                 */
                const idCa  = r.id_ca_dau || r.id_ca || r.match_id || r.session_id || "";
                const caDau = mapCaDauTheoId.get(idCa);

                let thongTinCa;
                if (caDau) {
                    /* Tìm thấy ca đấu → hiển thị Tên Sân + Ngày */
                    const ngayStr = caDau.ngay
                        ? new Date(caDau.ngay).toLocaleDateString("vi-VN") : "";
                    thongTinCa = `
                        <div style="font-weight:600;font-size:0.78rem;color:var(--text-main);
                            max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
                            title="${caDau.tenSan}">
                            🏸 ${caDau.tenSan}
                        </div>
                        ${ngayStr
                            ? `<div style="font-size:0.68rem;color:#64748b;">
                               <i class="fa-regular fa-calendar" style="margin-right:3px;"></i>${ngayStr}
                               </div>`
                            : ""}`;
                } else if (idCa) {
                    /* Có ID nhưng chưa load được data → hiển thị UUID rút gọn để tra cứu */
                    thongTinCa = `
                        <div style="font-size:0.72rem;color:#64748b;font-style:italic;">
                            <i class="fa-solid fa-link" style="margin-right:3px;opacity:0.5;"></i>
                            ID: ${idCa.substring(0, 8)}…
                        </div>`;
                } else {
                    /* Không có ID ca đấu → chưa liên kết */
                    thongTinCa = `
                        <span style="font-size:0.7rem;color:#374151;background:rgba(255,255,255,0.04);
                            padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);">
                            Chưa liên kết
                        </span>`;
                }

                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td>${badge}</td>
                <td>
                    <div style="font-weight:600;font-size:0.82rem;color:var(--text-main);">${tenViet}</div>
                    <div style="font-size:0.7rem;color:#64748b;">${_rutGonSdt(sdtViet)}</div>
                </td>
                <td>
                    <div style="font-weight:600;font-size:0.82rem;color:var(--text-main);">${tenBiDG}</div>
                    <div style="font-size:0.7rem;color:#64748b;">${_rutGonSdt(sdtBiDG)}</div>
                </td>
                <td>${thongTinCa}</td>
                <td style="white-space:nowrap;">${stars}</td>
                <td style="font-size:0.78rem;max-width:220px;">${
                    r.nhan_xet || r.content || r.comment ||
                    "<em style='color:#64748b'>Không có nhận xét</em>"
                }</td>
                <td style="font-size:0.72rem;color:#64748b;white-space:nowrap;">
                    ${r.created_at ? new Date(r.created_at).toLocaleDateString("vi-VN") : "--"}
                    <br>
                    <button class="ad-btn-icon red" onclick="window.xoaDanhGiaAdmin('${r.id || r._id}')"
                        title="Xóa đánh giá này" style="margin-top:4px;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>`;
                tbody.appendChild(tr);
            });

        } catch (e) {
            console.error("[Admin] Lỗi tải đánh giá:", e);
            tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444;text-align:center;padding:20px;">
                <i class="fa-solid fa-circle-exclamation"></i> Lỗi tải đánh giá: ${e.message || e}
            </td></tr>`;
        }
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
