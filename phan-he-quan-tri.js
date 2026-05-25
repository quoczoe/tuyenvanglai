/* =========================================================================
 * 👑 PHÂN HỆ QUẢN TRỊ VIÊN TỐI CAO - PHAN-HE-QUAN-TRI.JS (v3.1 — Supabase chuẩn)
 * Dự án: TUYENVANGLAI.IO.VN
 * Chức năng: Xác thực admin, CRUD key host, xem big data khách vãng lai,
 *            kiểm duyệt đánh giá, cấu hình thông báo trang chủ.
 *
 * Thay đổi v3.0:
 *   - Toàn bộ tên bảng đồng bộ với Supabase schema thật:
 *       "keys"    → "quan_ly_key"      (match: { ma_key })
 *       "slots"   → "ca_dau"
 *       "users"   → "nguoi_dung"   (fields: sdt_khach, ten_khach)
 *       "reviews" → "danh_gia_tin_dung"
 *       thêm mới: "dat_slot"
 *   - Xóa payload kép (key+ma_key, ten_host+note, ...)
 *   - Xóa goi_dich_vu / plan (không có trong schema)
 *   - Trạng thái Key lưu bằng tiếng Việt: "Chưa kích hoạt" / "Đang chạy" / "Bị khóa"
 *   - _taiDanhSachKhach: dùng dat_slot + nguoi_dung (bỏ registered_guests[])
 *   - luuThongBaoAdmin: 3 PATCH call riêng biệt vào cau_hinh_he_thong
 * =========================================================================
 */

(function () {
    // ── Thông tin đăng nhập Admin (hardcoded client-side) ──
    const ADMIN_USER    = "admin";
    const MAT_MAU_ADMIN = "TVL@2026";

    let _editingKeyId = null; // ma_key đang được chỉnh sửa
    // reviewMap — module-level để xemDanhGiaThanhVien() và xoaDanhGia() truy cập sau _taiDanhSachKhach()
    let reviewMap = {};

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
        _setDisplay("adminConsole",   "none");
    }

    function _hienConsole() {
        _setDisplay("adminAuthPanel", "none");
        _setDisplay("adminConsole",   "block");
        // Khôi phục tab từ URL hash nếu có, mặc định "keys"
        const hashTab   = (location.hash || "").replace("#tab-", "");
        const validTabs = ["keys", "guests", "reviews", "config", "stats"];
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
        const user   = userEl?.value?.trim() || "";
        const pass   = passEl?.value         || "";

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
        document.querySelectorAll(".ad-tab-content, .admin-tab-content").forEach(el => {
            el.classList.remove("active");
            el.style.display = "none";
        });
        document.querySelectorAll(".ad-tab-btn, .admin-tab-btn").forEach(el => el.classList.remove("active"));

        const content = document.getElementById(`adminTab_${tabName}`);
        if (content) { content.classList.add("active"); content.style.display = "block"; }
        const btn = document.querySelector(`.ad-tab-btn[data-tab="${tabName}"], .admin-tab-btn[data-tab="${tabName}"]`);
        if (btn) btn.classList.add("active");

        history.replaceState(null, "", "#tab-" + tabName);

        // Tải dữ liệu tab tương ứng
        if      (tabName === "keys")    _taiDanhSachKey();
        else if (tabName === "guests")  _taiDanhSachKhach();
        else if (tabName === "reviews") _taiDanhSachDanhGia();
        else if (tabName === "config")  _taiThongBao();
        else if (tabName === "stats")   _taiThongKe();
    };

    /* ═══════════════════════════════════════════════════
     * 4. THỐNG KÊ TỔNG QUAN
     * ═══════════════════════════════════════════════════ */
    async function _taiThongKe() {
        try {
            const [keys, caDau, khachVL, danhGia] = await Promise.all([
                window.dbEngine.doc("quan_ly_key"),
                window.dbEngine.doc("ca_dau"),
                window.dbEngine.doc("nguoi_dung"),
                window.dbEngine.doc("danh_gia_tin_dung")
            ]);

            const now        = new Date();
            const activeKeys = keys.filter(k => k.trang_thai === "Đang chạy").length;
            const openSlots  = caDau.filter(s => !s.da_chot_ca).length;

            // Tab Thống kê (id từ admin.html)
            _st("statTotalKeys",    keys.length);
            _st("statActiveKeys",   activeKeys);
            _st("statTotalSlots",   caDau.length);
            _st("statOpenSlots",    openSlots);
            _st("statTotalGuests",  khachVL.length);
            _st("statTotalReviews", danhGia.length);

            // 4 Metric cards đầu trang
            const expiredKeys = keys.filter(k => {
                const exp = k.ngay_het_han;
                return exp && new Date(exp) < now;
            }).length;
            _capNhatMetric("metricTotalKeys",   keys.length);
            _capNhatMetric("metricActiveKeys",  activeKeys);
            _capNhatMetric("metricExpiredKeys", expiredKeys);
            _capNhatMetric("metricTotalHosts",  keys.filter(k => !!k.ten_host).length);

            // Bảng phân tích trạng thái key
            const breakdown = document.getElementById("keyStatusBreakdown");
            if (breakdown) {
                const locked   = keys.filter(k => k.trang_thai === "Bị khóa").length;
                const inactive = keys.filter(k => k.trang_thai === "Chưa kích hoạt").length;
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
        } catch (e) {
            console.error("[Admin] Thống kê lỗi:", e);
        }
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
            const keys = await window.dbEngine.doc("quan_ly_key");
            keys.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            // Cập nhật 4 metric cards đầu trang
            const now         = new Date();
            const activeKeys  = keys.filter(k => k.trang_thai === "Đang chạy").length;
            const expiredKeys = keys.filter(k => k.ngay_het_han && new Date(k.ngay_het_han) < now).length;
            _capNhatMetric("metricTotalKeys",   keys.length);
            _capNhatMetric("metricActiveKeys",  activeKeys);
            _capNhatMetric("metricExpiredKeys", expiredKeys);
            _capNhatMetric("metricTotalHosts",  keys.filter(k => !!k.ten_host).length);
            if (typeof window._capNhatMetricsAdmin === "function") window._capNhatMetricsAdmin(keys);

            if (keys.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">
                    Chưa có Key nào. Bấm "Tạo Key Mới" để bắt đầu!</td></tr>`;
                return;
            }

            tbody.innerHTML = "";
            keys.forEach(k => {
                const keyVal    = k.ma_key || "--";
                const trangThai = k.trang_thai || "Chưa kích hoạt";
                const expDate   = k.ngay_het_han;
                const isExpired  = expDate && new Date(expDate) < now;
                const isExpiring = !isExpired && expDate && (new Date(expDate) - now) / 86400000 <= 7;

                // Kiểm tra thiết bị đã liên kết chưa
                const hasDevice = !!(k.id_thiet_bi && String(k.id_thiet_bi).trim() !== "");

                // Badge trạng thái
                let badgeHTML;
                if (trangThai === "Đang chạy" && !isExpired) {
                    badgeHTML = `<span class="ad-badge-running"><i class="fa-solid fa-circle" style="font-size:0.45em;"></i> Đang chạy</span>`;
                } else if (trangThai === "Bị khóa") {
                    badgeHTML = `<span class="ad-badge-locked"><i class="fa-solid fa-lock" style="font-size:0.7em;"></i> Bị khóa</span>`;
                } else if (isExpired) {
                    badgeHTML = `<span class="ad-badge-inactive"><i class="fa-solid fa-hourglass-end" style="font-size:0.7em;"></i> Hết hạn</span>`;
                } else {
                    badgeHTML = `<span class="ad-badge-inactive"><i class="fa-regular fa-clock" style="font-size:0.7em;"></i> Chưa kích hoạt</span>`;
                }
                if (isExpiring && trangThai === "Đang chạy") {
                    badgeHTML += `<br><span class="ad-badge-expiring" style="margin-top:3px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:0.7em;"></i> Sắp hết hạn</span>`;
                }

                const tr = document.createElement("tr");
                tr.setAttribute("data-status", isExpired ? "inactive" : (
                    trangThai === "Đang chạy" ? "active" : trangThai === "Bị khóa" ? "locked" : "inactive"
                ));
                tr.setAttribute("data-expiry", expDate || "");
                tr.innerHTML = `
                <td class="mono">${keyVal}</td>
                <td style="font-weight:600;">${k.ten_host || "--"}</td>
                <td style="color:#9ca3af;">${k.sdt_host || "--"}</td>
                <td>${badgeHTML}</td>
                <td style="font-size:0.78rem;color:${isExpired ? "#ef4444" : isExpiring ? "#fb923c" : "#9ca3af"};">
                    ${expDate ? new Date(expDate).toLocaleDateString("vi-VN") : "--"}
                </td>
                <td style="font-size:0.75rem;">
                    ${hasDevice
                        ? `<span style="color:#00ff88;"><i class="fa-solid fa-link"></i> Liên kết</span>`
                        : `<span style="color:#64748b;"><i class="fa-solid fa-link-slash"></i> Trống</span>`}
                </td>
                <td style="font-size:0.78rem;color:#94a3b8;">${k.so_ngay_duoc_xai || 30} ngày</td>
                <td>
                    <div class="ad-actions">
                        <button class="ad-btn-icon" onclick="window.moModalSuaKey('${keyVal}')" title="Sửa">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        ${trangThai !== "Bị khóa"
                            ? `<button class="ad-btn-icon" onclick="window.khoaKeyAdmin('${keyVal}')"
                                title="Khóa" style="color:#fb923c;border-color:rgba(251,146,60,0.4);">
                                <i class="fa-solid fa-lock"></i></button>`
                            : `<button class="ad-btn-icon" onclick="window.moKhoaKeyAdmin('${keyVal}')"
                                title="Mở khóa" style="color:#00ff88;border-color:rgba(0,255,136,0.4);">
                                <i class="fa-solid fa-lock-open"></i></button>`}
                        ${hasDevice
                            ? `<button class="ad-btn-icon" onclick="window.resetThietBiAdmin('${keyVal}')"
                                title="Reset thiết bị" style="color:#60a5fa;border-color:rgba(96,165,250,0.4);">
                                <i class="fa-solid fa-rotate-right"></i></button>`
                            : ""}
                        <button class="ad-btn-icon red" onclick="window.xoaKeyAdmin('${keyVal}')" title="Xóa">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>`;
                tbody.appendChild(tr);
            });

            // Áp lại filter hiện tại nếu đang chọn filter khác "all"
            if (typeof window.locKeyTheoTrangThai === "function" &&
                window._currentKeyFilter && window._currentKeyFilter !== "all") {
                window.locKeyTheoTrangThai(window._currentKeyFilter, null);
            }
        } catch (e) {
            console.error("[Admin] Lỗi tải key:", e);
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
        const rand  = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        return `TVL-${rand(5)}-${rand(4)}`;
    }

    window.moModalTaoKey = function () {
        _editingKeyId = null;
        const el = document.getElementById("keyFormMaKey");
        if (el) { el.value = _sinhMaKey(); el.readOnly = false; }
        _setVal("keyFormTenHost", "");
        _setVal("keyFormSdtHost", "");
        _setVal("keyFormSoNgay",  "30");
        _setVal("keyFormStatus",  "Chưa kích hoạt");
        _st("modalKeyTitle", "Tạo Key Mới");
        _setDisplay("modalKeyOverlay", "flex");
    };

    window.sinhLaiMaKey = function () {
        const el = document.getElementById("keyFormMaKey");
        if (el && !el.readOnly) el.value = _sinhMaKey();
    };

    window.moModalSuaKey = async function (keyVal) {
        try {
            // Truy vấn trực tiếp key cần sửa
            const keys = await window.dbEngine.doc("quan_ly_key", { eq: { ma_key: keyVal } });
            const k    = keys[0];
            if (!k) { window.hienToast("Không tìm thấy", "Key không còn tồn tại.", "danger"); return; }

            _editingKeyId = keyVal;
            const el = document.getElementById("keyFormMaKey");
            if (el) { el.value = k.ma_key || ""; el.readOnly = true; }
            _setVal("keyFormTenHost", k.ten_host          || "");
            _setVal("keyFormSdtHost", k.sdt_host          || "");
            _setVal("keyFormSoNgay",  String(k.so_ngay_duoc_xai || 30));
            _setVal("keyFormStatus",  k.trang_thai        || "Chưa kích hoạt");
            _st("modalKeyTitle", "Chỉnh Sửa Key");
            _setDisplay("modalKeyOverlay", "flex");
        } catch (e) {
            window.hienToast("Lỗi", "Không tải được thông tin key.", "danger");
        }
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
        const maKey   = document.getElementById("keyFormMaKey")?.value?.trim().toUpperCase();
        const tenHost = document.getElementById("keyFormTenHost")?.value?.trim();
        const sdtHost = document.getElementById("keyFormSdtHost")?.value?.trim();
        const soNgay  = Number(document.getElementById("keyFormSoNgay")?.value) || 30;
        const status  = document.getElementById("keyFormStatus")?.value || "Chưa kích hoạt";

        if (!maKey) {
            window.hienToast("Thiếu thông tin", "Vui lòng điền Mã Key.", "danger");
            return;
        }

        const btn = document.getElementById("btnLuuKey");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
        try {
            if (_editingKeyId) {
                // Cập nhật key đang sửa — chỉ ghi các trường cho phép thay đổi
                const payload = {
                    ten_host:          tenHost,
                    sdt_host:          sdtHost,
                    so_ngay_duoc_xai:  soNgay,
                    trang_thai:        status
                };
                // Nếu admin muốn đặt lại ngày hết hạn (từ hôm nay + số ngày)
                const exp = new Date(Date.now() + soNgay * 86400000);
                payload.ngay_het_han = exp.toISOString();

                await window.dbEngine.ghi("quan_ly_key", payload, { ma_key: _editingKeyId });
                window.hienToast("Cập nhật Key ✅", `Key ${maKey} đã được chỉnh sửa.`, "success");
            } else {
                // Tạo key mới — ten_host và sdt_host hardcode "--"
                // Host sẽ tự cập nhật 2 trường này khi kích hoạt key thành công
                const payload = {
                    ma_key:           maKey,
                    ten_host:         "--",
                    sdt_host:         "--",
                    so_ngay_duoc_xai: soNgay,
                    trang_thai:       "Chưa kích hoạt"
                };
                await window.dbEngine.ghi("quan_ly_key", payload);
                window.hienToast("Tạo Key thành công! 🔑", `Key ${maKey} — Host nhập key để kích hoạt.`, "success");
            }
            window.dongModalKey();
            await _taiDanhSachKey();
        } catch (e) {
            // FIX 2: Hiển thị chi tiết lỗi (thường do Supabase RLS chặn anon INSERT)
            const detail = (e.message || String(e)).slice(0, 120);
            console.error("[luuKey] Chi tiết lỗi:", e);
            window.hienToast("Lỗi lưu Key", detail || "Không thể lưu Key. Kiểm tra kết nối hoặc RLS Supabase.", "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Key'; }
        }
    };

    window.khoaKeyAdmin = async function (k) {
        if (!confirm(`Khóa Key ${k}?\nHost sẽ không thể đăng nhập cho đến khi mở khóa.`)) return;
        try {
            await window.dbEngine.ghi("quan_ly_key", { trang_thai: "Bị khóa" }, { ma_key: k });
            window.hienToast("Đã khóa 🔒", `Key ${k} bị khóa.`, "success");
            await _taiDanhSachKey();
        } catch (e) { window.hienToast("Lỗi", "Không thể khóa Key.", "danger"); }
    };

    window.moKhoaKeyAdmin = async function (k) {
        try {
            await window.dbEngine.ghi("quan_ly_key", { trang_thai: "Đang chạy" }, { ma_key: k });
            window.hienToast("Đã mở khóa 🔓", `Key ${k} hoạt động trở lại.`, "success");
            await _taiDanhSachKey();
        } catch (e) { window.hienToast("Lỗi", "Không thể mở khóa Key.", "danger"); }
    };

    window.resetThietBiAdmin = async function (k) {
        if (!confirm(`Reset thiết bị cho Key ${k}?\nHost có thể kích hoạt trên thiết bị mới.`)) return;
        try {
            await window.dbEngine.ghi("quan_ly_key", { id_thiet_bi: null }, { ma_key: k });
            window.hienToast("Reset thiết bị ✅", `Key ${k} sẵn sàng cho thiết bị mới.`, "success");
            await _taiDanhSachKey();
        } catch (e) { window.hienToast("Lỗi", "Không thể reset thiết bị.", "danger"); }
    };

    window.xoaKeyAdmin = async function (k) {
        if (!confirm(`XÓA VĨNH VIỄN Key ${k}?\nKHÔNG THỂ HOÀN TÁC!`)) return;
        try {
            await window.dbEngine.xoa("quan_ly_key", { ma_key: k });
            window.hienToast("Đã xóa Key", `Key ${k} đã bị xóa vĩnh viễn.`, "info");
            await _taiDanhSachKey();
        } catch (e) { window.hienToast("Lỗi", "Không thể xóa Key.", "danger"); }
    };

    window.locKeyAdmin = function () {
        const q = document.getElementById("adminKeySearch")?.value?.toLowerCase() || "";
        document.querySelectorAll("#adminKeysBody tr").forEach(r => {
            r.style.display = !q || r.textContent.toLowerCase().includes(q) ? "" : "none";
        });
    };

    /* ═══════════════════════════════════════════════════
     * 6. QUẢN LÝ THÀNH VIÊN
     * Tải song song: dat_slot + nguoi_dung + ca_dau + danh_gia_tin_dung
     * Tổng hợp: chỉ đếm ca + tính tiền khi da_chot_ca = true
     * reviewMap: sdt → { saoArr[], danhGia[] } — module-level để các hàm khác dùng
     * ═══════════════════════════════════════════════════ */
    async function _taiDanhSachKhach() {
        const tbody = document.getElementById("adminGuestsBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:16px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;
        try {
            // Tải song song 4 bảng để tổng hợp dữ liệu thành viên
            const [datSlots, khachVL, caDau, allDanhGia] = await Promise.all([
                window.dbEngine.doc("dat_slot"),
                window.dbEngine.doc("nguoi_dung"),
                window.dbEngine.doc("ca_dau"),
                window.dbEngine.doc("danh_gia_tin_dung")
            ]);

            // Xây dựng reviewMap module-level: sdt → { saoArr, danhGia }
            reviewMap = {};
            (allDanhGia || []).forEach(r => {
                const sdt = r.sdt_nguoi_bi_danh_gia;
                if (!sdt) return;
                if (!reviewMap[sdt]) reviewMap[sdt] = { saoArr: [], danhGia: [] };
                reviewMap[sdt].saoArr.push(r.so_sao);
                reviewMap[sdt].danhGia.push(r);
            });

            // Hàm tính sao trung bình
            function _tbSao(sdt) {
                const data = reviewMap[sdt];
                if (!data || data.saoArr.length === 0) return null;
                return (data.saoArr.reduce((a, b) => a + b, 0) / data.saoArr.length).toFixed(1);
            }

            // Bản đồ id ca_dau → thông tin ca (da_chot_ca, gia_nam, gia_nu, ma_key_host)
            const mapCaDau = new Map();
            caDau.forEach(s => mapCaDau.set(s.id, s));

            // Bản đồ sdt_khach → thông tin tổng hợp của khách
            const map = new Map();

            // Khởi tạo từ bảng nguoi_dung — lưu thêm vai_tro, trang_thai_tai_khoan
            khachVL.forEach(u => {
                const sdt = u.sdt_khach || "";
                if (!sdt) return;
                if (!map.has(sdt)) {
                    map.set(sdt, {
                        ten:       u.ten_khach || "Ẩn danh",
                        sdt,
                        ngayTG:    u.created_at || u.ngay_tham_gia || null,
                        soBuiloi:  0,
                        tongChi:   0,
                        hosts:     new Set(),
                        vai_tro:   u.vai_tro || "guest",
                        trang_thai_tai_khoan: u.trang_thai_tai_khoan !== false
                    });
                }
            });

            // Cộng dồn thống kê từ dat_slot — chỉ tính khi ca đã chốt
            datSlots.forEach(slot => {
                const sdt    = slot.sdt_khach || "";
                const ca     = mapCaDau.get(slot.id_ca_dau);
                if (!sdt || !ca) return;

                // Đảm bảo khách có trong map (khách có thể chưa có trong nguoi_dung)
                if (!map.has(sdt)) {
                    map.set(sdt, {
                        ten: slot.ten_khach || "Ẩn danh",
                        sdt,
                        ngayTG:   slot.thoi_gian_dat || null,
                        soBuiloi: 0,
                        tongChi:  0,
                        hosts:    new Set(),
                        vai_tro:  "guest",
                        trang_thai_tai_khoan: true
                    });
                }
                const info = map.get(sdt);

                // Chỉ đếm tài chính khi ca đã chốt VÀ khách thực sự tham gia
                if (ca.da_chot_ca === true && slot.trang_thai_di_danh === "Đã tham gia") {
                    info.soBuiloi++;
                    // Xác định giá theo giới tính đặt slot
                    const gia = slot.gioi_tinh === "female" ? (ca.gia_nu || 0) : (ca.gia_nam || 0);
                    info.tongChi += gia;
                    if (ca.ma_key_host) info.hosts.add(ca.ma_key_host);
                }
            });

            const list = Array.from(map.values()).sort((a, b) => b.soBuiloi - a.soBuiloi);
            _st("adminGuestCount", `${list.length} thành viên`);

            if (list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:#64748b;">
                    Chưa có thành viên nào trong hệ thống.</td></tr>`;
                return;
            }

            // Bản đồ badge vai trò
            const _vaiTroBadge = function(vt) {
                if (vt === "admin") return '<span class="mv-role-badge-admin">👑 Admin</span>';
                if (vt === "host")  return '<span class="mv-role-badge-host">🏟️ Host</span>';
                return '<span class="mv-role-badge-guest">👤 Guest</span>';
            };

            tbody.innerHTML = "";
            list.forEach((g, i) => {
                const d  = g.ngayTG ? new Date(g.ngayTG).toLocaleDateString("vi-VN") : "--";
                const tb = _tbSao(g.sdt);
                const soLuotDG = reviewMap[g.sdt]?.saoArr.length || 0;
                // Escape SĐT cho onclick (safe to use trong attribute)
                const sdtSafe = g.sdt.replace(/'/g, "\\'").replace(/"/g, "&quot;");

                // Cell ⭐ Sao TB
                const tenSafe = (g.ten || "").replace(/'/g, "\\'");
                const saoCellHTML = tb
                    ? `<span class="sao-badge">${tb} ⭐</span>
                       <span style="font-size:0.72rem;color:#9ca3af;display:block;margin-top:2px;">(${soLuotDG} lượt)</span>
                       <button class="btn-mini" style="margin-top:4px;"
                           onclick="window.xemDanhGiaThanhVien('${sdtSafe}', '${tenSafe}')">
                           📋 Chi tiết
                       </button>`
                    : `<span style="color:#6b7280;font-size:0.78rem;">Chưa có</span>`;

                // Cell Hành động — nút đơn mở modal toàn diện
                const hanhDongHTML = `<button class="mv-ql-btn" onclick="window.moModalQuanLyThanhVien('${sdtSafe}')">⚙️ Quản lý</button>`;

                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td style="color:#64748b;font-size:0.8rem;">${i + 1}</td>
                <td style="font-weight:700;font-size:0.85rem;">${g.ten}</td>
                <td style="text-align:center;">${_vaiTroBadge(g.vai_tro)}</td>
                <td>
                    <a href="https://zalo.me/${g.sdt}" target="_blank"
                        style="color:#00d4ff;font-size:0.82rem;text-decoration:none;">
                        <i class="fa-solid fa-comment"></i> ${g.sdt}
                    </a>
                </td>
                <td style="font-size:0.8rem;color:#94a3b8;">${d}</td>
                <td style="font-weight:700;color:#00ff88;">${g.soBuiloi} ca</td>
                <td style="font-weight:700;color:#00ff88;">${_fVND(g.tongChi)}</td>
                <td style="font-weight:700;color:#a78bfa;text-align:center;">${g.hosts.size}</td>
                <td style="text-align:center;">${saoCellHTML}</td>
                <td style="text-align:center;">${hanhDongHTML}</td>`;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("[Admin] Lỗi tải thành viên:", e);
            tbody.innerHTML = `<tr><td colspan="10" style="color:#ef4444;text-align:center;padding:16px;">
                Lỗi tải dữ liệu: ${e.message || e}</td></tr>`;
        }
    }

    window.locKhachAdmin = function () {
        const q = document.getElementById("adminGuestSearch")?.value?.toLowerCase() || "";
        document.querySelectorAll("#adminGuestsBody tr").forEach(r => {
            r.style.display = !q || r.textContent.toLowerCase().includes(q) ? "" : "none";
        });
    };

    /* ═══════════════════════════════════════════════════
     * 6B. MODAL QUẢN LÝ THÀNH VIÊN — 5 section, không dùng alert()/confirm()
     * Gồm: sửa thông tin, đổi vai trò, cấp mật khẩu, khóa/mở, xóa TK
     * ═══════════════════════════════════════════════════ */

    // Hàm helper: escape chuỗi cho HTML attribute
    function _mvEsc(s) {
        if (s === null || s === undefined) return "";
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    // SHA-256 hash phía client (Web Crypto API) — dùng khi admin cấp mật khẩu mới
    async function _hashMK(plain) {
        const SALT    = "tvl_pepper_2026";
        const encoder = new TextEncoder();
        const data    = encoder.encode(SALT + plain);
        const buf     = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    // Mở modal Quản Lý Thành Viên (5 section xếp chồng)
    window.moModalQuanLyThanhVien = async function (sdt) {
        const overlay = document.getElementById("modalThanhVienOverlay");
        const body    = document.getElementById("modalThanhVienTitle");
        const bodyEl  = document.getElementById("modalThanhVienBody");
        if (!overlay || !bodyEl) return;

        // Hiện modal với trạng thái đang tải
        if (body) body.textContent = "Đang tải thông tin...";
        bodyEl.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>`;
        overlay.style.display = "flex";

        try {
            const users = await window.dbEngine.doc("nguoi_dung");
            const u = (users || []).find(x => x.sdt_khach === sdt);
            if (!u) {
                window.hienToast("Lỗi", "Không tìm thấy thành viên.", "danger");
                overlay.style.display = "none";
                return;
            }

            if (body) body.textContent = `⚙️ Quản lý: ${u.ten_khach || sdt}`;

            const sdtAttr  = _mvEsc(sdt);
            const vaiTro   = u.vai_tro || "guest";
            const isActive = u.is_active !== false; // mặc định true nếu cột chưa có

            bodyEl.innerHTML = `
            <!-- ── A: Thông tin cơ bản ── -->
            <div class="mv-section">
                <div class="mv-section-title">✏️ Thông Tin Cơ Bản</div>
                <div class="mv-form-grid">
                    <div>
                        <label class="mv-label">Họ tên</label>
                        <input type="text" id="mvTenKhach" class="mv-input"
                            value="${_mvEsc(u.ten_khach)}" placeholder="Họ tên">
                    </div>
                    <div>
                        <label class="mv-label">SĐT (khóa chính — không đổi được)</label>
                        <input type="text" class="mv-input" value="${sdtAttr}" disabled>
                    </div>
                    <div>
                        <label class="mv-label">Số dư ví (đ)</label>
                        <input type="number" id="mvSoDu" class="mv-input"
                            value="${Number(u.so_du_vi) || 0}" min="0" placeholder="0">
                    </div>
                    <div>
                        <label class="mv-label">Link Facebook</label>
                        <input type="url" id="mvFacebook" class="mv-input"
                            value="${_mvEsc(u.facebook_link)}" placeholder="https://fb.com/...">
                    </div>
                    <div>
                        <label class="mv-label">SĐT Zalo liên lạc</label>
                        <input type="tel" id="mvSdtZalo" class="mv-input"
                            value="${_mvEsc(u.sdt_zalo)}" placeholder="0909...">
                    </div>
                </div>
                <button class="mv-btn mv-btn-primary" style="width:100%;"
                    onclick="window._luuThongTinTV('${sdtAttr}')">
                    💾 Lưu thông tin
                </button>
            </div>

            <!-- ── B: Đổi vai trò ── -->
            <div class="mv-section">
                <div class="mv-section-title">🎭 Vai Trò &nbsp;<span style="color:#00ff88;font-weight:700;">${vaiTro}</span></div>
                <div class="mv-role-btns">
                    <button class="mv-btn ${vaiTro === 'guest' ? 'mv-btn-active' : ''}"
                        onclick="window._xacNhanDoiVaiTro('${sdtAttr}', 'guest')">👤 Guest</button>
                    <button class="mv-btn ${vaiTro === 'host' ? 'mv-btn-active' : ''}"
                        onclick="window._xacNhanDoiVaiTro('${sdtAttr}', 'host')">🏟️ Host</button>
                    <button class="mv-btn ${vaiTro === 'admin' ? 'mv-btn-active' : ''}"
                        onclick="window._xacNhanDoiVaiTro('${sdtAttr}', 'admin')">👑 Admin</button>
                </div>
                <div id="mvRoleConfirm" class="mv-confirm-box" style="display:none;">
                    <span id="mvRoleConfirmText" style="font-size:0.85rem;"></span>
                    <div style="display:flex;gap:8px;margin-top:10px;">
                        <button class="mv-btn mv-btn-primary" id="mvRoleConfirmYes" style="flex:1;">✅ Xác nhận đổi</button>
                        <button class="mv-btn" style="flex:1;"
                            onclick="document.getElementById('mvRoleConfirm').style.display='none'">❌ Hủy</button>
                    </div>
                </div>
            </div>

            <!-- ── C: Cấp lại mật khẩu ── -->
            <div class="mv-section">
                <div class="mv-section-title">🔑 Cấp Lại Mật Khẩu</div>
                <div class="mv-form-grid" style="margin-bottom:10px;">
                    <div>
                        <label class="mv-label">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                        <input type="password" id="mvNewPassword" class="mv-input" placeholder="••••••••">
                    </div>
                    <div>
                        <label class="mv-label">Xác nhận mật khẩu</label>
                        <input type="password" id="mvConfirmPassword" class="mv-input" placeholder="••••••••">
                    </div>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="mv-btn mv-btn-primary" style="flex:1;"
                        onclick="window._luuMatKhauTV('${sdtAttr}')">🔑 Đặt mật khẩu mới</button>
                    <button class="mv-btn"
                        onclick="window._xoaHashMKTV('${sdtAttr}')">🗑️ Xóa hash</button>
                </div>
            </div>

            <!-- ── D: Khóa / Mở tài khoản ── -->
            <div class="mv-section">
                <div class="mv-section-title">🔐 Trạng Thái Tài Khoản</div>
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                    <span style="font-size:0.88rem;color:#94a3b8;">Hiện tại:
                        <strong style="color:${isActive ? '#00ff88' : '#ef4444'};">
                            ${isActive ? '✅ Đang hoạt động' : '🔒 Đã bị khóa'}
                        </strong>
                    </span>
                    <button class="mv-btn ${isActive ? 'mv-btn-warn' : 'mv-btn-primary'}"
                        onclick="window._khoaMoTV('${sdtAttr}', ${isActive})">
                        ${isActive ? '🔒 Khóa tài khoản' : '🔓 Mở khóa tài khoản'}
                    </button>
                </div>
            </div>

            <!-- ── E: Xóa tài khoản ── -->
            <div class="mv-section mv-section-danger">
                <div class="mv-section-title" style="color:#ef4444;">🗑️ Xóa Tài Khoản Vĩnh Viễn</div>
                <p style="font-size:0.8rem;color:#9ca3af;margin:0 0 10px;line-height:1.5;">
                    Hành động <strong style="color:#ef4444;">KHÔNG THỂ HOÀN TÁC</strong>.
                    Nhập chính xác SĐT <code style="color:#fbbf24;background:rgba(251,191,36,0.1);
                    padding:2px 6px;border-radius:4px;">${sdtAttr}</code> để xác nhận.
                </p>
                <div class="mv-form-grid" style="margin-bottom:10px;">
                    <div>
                        <label class="mv-label">Nhập SĐT để xác nhận</label>
                        <input type="text" id="mvXoaConfirmSdt" class="mv-input"
                            placeholder="${sdtAttr}">
                    </div>
                </div>
                <button class="mv-btn mv-btn-danger" style="width:100%;"
                    onclick="window._xoaTV('${sdtAttr}')">
                    🗑️ Xóa vĩnh viễn tài khoản này
                </button>
            </div>`;

        } catch (e) {
            window.hienToast("Lỗi", "Không thể tải dữ liệu thành viên.", "danger");
            overlay.style.display = "none";
        }
    };

    // A — Lưu thông tin cơ bản
    window._luuThongTinTV = async function (sdt) {
        const ten  = document.getElementById("mvTenKhach")?.value?.trim();
        const sodu = document.getElementById("mvSoDu")?.value;
        const fb   = document.getElementById("mvFacebook")?.value?.trim();
        const zalo = document.getElementById("mvSdtZalo")?.value?.trim();

        const payload = {};
        if (ten  !== undefined) payload.ten_khach    = ten  || null;
        if (sodu !== undefined) payload.so_du_vi     = Number(sodu) || 0;
        if (fb   !== undefined) payload.facebook_link = fb  || null;
        if (zalo !== undefined) payload.sdt_zalo      = zalo || null;

        try {
            await window.dbEngine.ghi("nguoi_dung", payload, { sdt_khach: sdt });
            window.hienToast("Đã lưu ✅", "Thông tin thành viên đã cập nhật.", "success");
            _taiDanhSachKhach();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể lưu: " + (e.message || "").slice(0, 80), "danger");
        }
    };

    // B — Hiện confirm nội tuyến trước khi đổi vai trò
    window._xacNhanDoiVaiTro = function (sdt, vaiTroMoi) {
        const box  = document.getElementById("mvRoleConfirm");
        const txt  = document.getElementById("mvRoleConfirmText");
        const btn  = document.getElementById("mvRoleConfirmYes");
        if (!box || !txt || !btn) return;
        txt.innerHTML = `Đổi vai trò thành <strong style="color:#00ff88;">${vaiTroMoi}</strong>?`;
        btn.onclick   = function () { window._thucHienDoiVaiTro(sdt, vaiTroMoi); };
        box.style.display = "block";
    };

    // B — Thực hiện đổi vai trò sau khi confirm
    window._thucHienDoiVaiTro = async function (sdt, vaiTroMoi) {
        try {
            await window.dbEngine.ghi("nguoi_dung", { vai_tro: vaiTroMoi }, { sdt_khach: sdt });
            window.hienToast("Đã đổi vai trò ✅", `${sdt} → ${vaiTroMoi}`, "success");
            _taiDanhSachKhach();
            // Reload lại modal để phản ánh vai trò mới
            window.moModalQuanLyThanhVien(sdt);
        } catch (e) {
            window.hienToast("Lỗi", "Không thể đổi vai trò.", "danger");
        }
    };

    // C — Đặt mật khẩu mới (hash phía client)
    window._luuMatKhauTV = async function (sdt) {
        const pw  = document.getElementById("mvNewPassword")?.value  || "";
        const pw2 = document.getElementById("mvConfirmPassword")?.value || "";
        if (pw.length < 6) {
            window.hienToast("Lỗi", "Mật khẩu tối thiểu 6 ký tự.", "danger");
            return;
        }
        if (pw !== pw2) {
            window.hienToast("Lỗi", "Mật khẩu xác nhận không khớp.", "danger");
            return;
        }
        try {
            const hash = await _hashMK(pw);
            await window.dbEngine.ghi("nguoi_dung", { mat_khau_hash: hash }, { sdt_khach: sdt });
            window.hienToast("Mật khẩu mới đã lưu ✅", "Hash đã cập nhật vào DB.", "success");
            const p1 = document.getElementById("mvNewPassword");
            const p2 = document.getElementById("mvConfirmPassword");
            if (p1) p1.value = "";
            if (p2) p2.value = "";
        } catch (e) {
            window.hienToast("Lỗi", "Không thể lưu mật khẩu.", "danger");
        }
    };

    // C — Xóa hash (reset, user tự đặt mới khi đăng nhập)
    window._xoaHashMKTV = async function (sdt) {
        try {
            await window.dbEngine.ghi("nguoi_dung", { mat_khau_hash: null }, { sdt_khach: sdt });
            window.hienToast("Đã xóa hash ✅", "User sẽ đặt mật khẩu mới khi đăng nhập.", "success");
        } catch (e) {
            window.hienToast("Lỗi", "Không thể xóa hash.", "danger");
        }
    };

    // D — Khóa hoặc mở khóa tài khoản (toggle is_active)
    window._khoaMoTV = async function (sdt, isActive) {
        const newActive = !isActive;
        const label     = newActive ? "Mở khóa" : "Khóa";
        try {
            await window.dbEngine.ghi("nguoi_dung", { is_active: newActive }, { sdt_khach: sdt });
            window.hienToast(
                `${label} thành công ✅`,
                `Tài khoản ${sdt} ${newActive ? "đã được mở khóa" : "đã bị khóa"}.`,
                newActive ? "success" : "warning"
            );
            _taiDanhSachKhach();
            // Reload modal để nút phản ánh trạng thái mới
            window.moModalQuanLyThanhVien(sdt);
        } catch (e) {
            window.hienToast("Lỗi", `Không thể ${label.toLowerCase()} tài khoản.`, "danger");
        }
    };

    // E — Xóa tài khoản (kiểm tra SĐT nhập đúng → xóa)
    window._xoaTV = async function (sdt) {
        const nhapSdt = (document.getElementById("mvXoaConfirmSdt")?.value || "").trim();
        if (nhapSdt !== sdt) {
            window.hienToast("Xác nhận sai", `SĐT nhập vào (${nhapSdt || "rỗng"}) không khớp với ${sdt}.`, "danger");
            return;
        }
        try {
            await window.dbEngine.xoa("nguoi_dung", { sdt_khach: sdt });
            window.hienToast("Đã xóa ✅", `Tài khoản ${sdt} đã bị xóa vĩnh viễn.`, "warning");
            window.dongModalThanhVien();
            _taiDanhSachKhach();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể xóa tài khoản.", "danger");
        }
    };

    // Đóng modal thành viên
    window.dongModalThanhVien = function () {
        const overlay = document.getElementById("modalThanhVienOverlay");
        if (overlay) overlay.style.display = "none";
    };

    // Click bên ngoài hộp modal → đóng
    document.addEventListener("click", function (e) {
        const overlay = document.getElementById("modalThanhVienOverlay");
        if (overlay && e.target === overlay) window.dongModalThanhVien();
    });

    /* ═══════════════════════════════════════════════════
     * 6C. XEM CHI TIẾT ĐÁNH GIÁ CỦA THÀNH VIÊN (modal)
     * Dùng reviewMap đã được build trong _taiDanhSachKhach()
     * ═══════════════════════════════════════════════════ */

    window.xemDanhGiaThanhVien = function (sdt, tenHienThi) {
        const data    = reviewMap[sdt];
        const dsList  = data?.danhGia || [];
        const tbSao   = dsList.length
            ? (dsList.reduce((s, r) => s + (r.so_sao || 0), 0) / dsList.length).toFixed(1)
            : "—";

        const rowsHTML = dsList.length === 0
            ? `<p style="color:#9ca3af;text-align:center;padding:20px 0;">Chưa có đánh giá nào.</p>`
            : dsList.map(r => {
                const ngay = r.created_at
                    ? new Date(r.created_at).toLocaleDateString("vi-VN")
                    : "--";
                const loaiClass   = r.loai_danh_gia === "GuestToHost" ? "host" : "guest";
                const loaiLabel   = r.loai_danh_gia === "GuestToHost"
                    ? "🏟️→👤 Khách đánh Host"
                    : "👤→🏟️ Host đánh Khách";
                const noiDung = r.nhan_xet
                    ? r.nhan_xet.replace(/</g, "&lt;").replace(/>/g, "&gt;")
                    : "<em style='color:#6b7280'>Không có nhận xét</em>";
                return `
                <div class="dg-item">
                    <div class="dg-item-header">
                        <span class="sao-badge">${r.so_sao || "?"} ⭐</span>
                        <span class="dg-loai-badge ${loaiClass}">${loaiLabel}</span>
                        <span style="font-size:0.72rem;color:#6b7280;margin-left:auto;">${ngay}</span>
                    </div>
                    <div class="dg-item-noi-dung">${noiDung}</div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
                        <span style="font-size:0.72rem;color:#9ca3af;">Người viết: ${r.sdt_nguoi_viet || "?"}</span>
                        <button onclick="window.xoaDanhGia('${r.id}','${sdt}','${(tenHienThi||sdt).replace(/'/g,"\\'")}')"
                            style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);
                                   color:#ef4444;padding:3px 10px;border-radius:6px;font-size:0.72rem;cursor:pointer;">
                            🗑️ Xóa
                        </button>
                    </div>
                </div>`;
            }).join("");

        const tenRut = (tenHienThi || sdt).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        document.getElementById("modalThanhVienTitle").textContent =
            `Đánh giá về: ${tenRut} — TB: ${tbSao} ⭐ (${dsList.length} lượt)`;
        document.getElementById("modalThanhVienBody").innerHTML = `
            <div class="dg-list" style="max-height:55vh;overflow-y:auto;padding-right:4px;">
                ${rowsHTML}
            </div>
            <div style="text-align:right;margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);">
                <button onclick="window.dongModalThanhVien()"
                    style="padding:9px 20px;background:rgba(255,255,255,0.06);border:1px solid #2d4a6e;
                           border-radius:8px;color:#94a3b8;cursor:pointer;font-size:0.9rem;">
                    Đóng
                </button>
            </div>`;
        document.getElementById("modalThanhVienOverlay").style.display = "flex";
    };

    // Xóa một bài đánh giá khỏi DB + cập nhật reviewMap + reload modal
    window.xoaDanhGia = async function (idDanhGia, sdt, tenHienThi) {
        if (!confirm("Xóa bài đánh giá này?\nHành động không thể hoàn tác.")) return;
        try {
            await window.dbEngine.xoa("danh_gia_tin_dung", { id: idDanhGia });
            // Cập nhật reviewMap local (không cần reload toàn bộ từ server)
            if (reviewMap[sdt]) {
                reviewMap[sdt].danhGia = reviewMap[sdt].danhGia.filter(r => r.id !== idDanhGia);
                reviewMap[sdt].saoArr  = reviewMap[sdt].danhGia.map(r => r.so_sao);
            }
            window.hienToast("Đã xóa ✅", "Bài đánh giá đã bị xóa.", "warning");
            // Mở lại modal để refresh nội dung
            window.xemDanhGiaThanhVien(sdt, tenHienThi);
            // Reload bảng thành viên để cập nhật cột sao TB
            _taiDanhSachKhach();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể xóa đánh giá.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 7. KIỂM DUYỆT ĐÁNH GIÁ
     * Bảng dùng: danh_gia_tin_dung, nguoi_dung, quan_ly_key, ca_dau
     * ═══════════════════════════════════════════════════ */
    async function _taiDanhSachDanhGia() {
        const tbody = document.getElementById("adminReviewsBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:16px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải đánh giá...</td></tr>`;
        try {
            // Tải song song 4 bảng liên quan
            const [danhGia, khachVL, keys, caDau] = await Promise.all([
                window.dbEngine.doc("danh_gia_tin_dung"),
                window.dbEngine.doc("nguoi_dung"),
                window.dbEngine.doc("quan_ly_key"),
                window.dbEngine.doc("ca_dau")
            ]);

            // Bản đồ sdt → tên (khách) — ưu tiên bảng nguoi_dung
            const mapKhach = new Map();
            khachVL.forEach(u => {
                if (u.sdt_khach && !mapKhach.has(u.sdt_khach)) {
                    mapKhach.set(u.sdt_khach, u.ten_khach || "Ẩn danh");
                }
            });

            // Bản đồ sdt_host → tên host (từ quan_ly_key)
            const mapHost = new Map();
            keys.forEach(k => {
                if (k.sdt_host && !mapHost.has(k.sdt_host)) {
                    mapHost.set(k.sdt_host, k.ten_host || "Host ẩn danh");
                }
            });

            // Bản đồ id ca_dau → { ten_san, ngay_danh }
            const mapCaDau = new Map();
            caDau.forEach(s => {
                if (s.id) mapCaDau.set(s.id, { tenSan: s.ten_san || "Ca đấu", ngay: s.ngay_danh || "" });
            });

            // Tra tên người dùng theo SĐT (thử khách trước, rồi host)
            function _layTen(sdt) {
                if (!sdt) return "Ẩn danh";
                return mapKhach.get(sdt) || mapHost.get(sdt) || "Ẩn danh";
            }

            // Rút gọn SĐT: 6 ký tự đầu + "..."
            function _rutGonSdt(sdt) {
                if (!sdt) return "--";
                return sdt.length > 6 ? sdt.substring(0, 6) + "..." : sdt;
            }

            // Sắp xếp mới nhất lên đầu
            danhGia.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            if (danhGia.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">
                    <i class="fa-solid fa-star" style="font-size:1.5rem;opacity:0.3;display:block;margin-bottom:8px;"></i>
                    Chưa có đánh giá nào trong hệ thống.
                </td></tr>`;
                return;
            }

            tbody.innerHTML = "";
            danhGia.forEach(r => {
                // Dải sao 1-5
                const soSao = Math.max(0, Math.min(5, r.so_sao || 0));
                const stars  = Array(5).fill(0).map((_, i) =>
                    `<i class="fa-solid fa-star" style="color:${i < soSao ? "#fbbf24" : "#2d3748"};font-size:0.82rem;"></i>`
                ).join("");

                // Badge loại đánh giá
                const loai  = r.loai_danh_gia || "";
                const badge = loai === "GuestToHost"
                    ? `<span class="ad-badge-running" style="font-size:0.65rem;white-space:nowrap;">👤→🏸 Khách→Host</span>`
                    : `<span class="ad-badge-inactive" style="font-size:0.65rem;white-space:nowrap;">🏸→👤 Host→Khách</span>`;

                // Người viết & đối tượng
                const sdtViet = r.sdt_nguoi_viet        || "";
                const sdtBiDG = r.sdt_nguoi_bi_danh_gia || "";

                // Thông tin ca đấu
                const caDauInfo = mapCaDau.get(r.id_ca_dau);
                let thongTinCa;
                if (caDauInfo) {
                    const ngayStr = caDauInfo.ngay
                        ? new Date(caDauInfo.ngay).toLocaleDateString("vi-VN") : "";
                    thongTinCa = `
                        <div style="font-weight:600;font-size:0.78rem;max-width:150px;
                            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
                            title="${caDauInfo.tenSan}">
                            🏸 ${caDauInfo.tenSan}
                        </div>
                        ${ngayStr ? `<div style="font-size:0.68rem;color:#64748b;">
                            <i class="fa-regular fa-calendar" style="margin-right:3px;"></i>${ngayStr}
                        </div>` : ""}`;
                } else if (r.id_ca_dau) {
                    thongTinCa = `<div style="font-size:0.72rem;color:#64748b;font-style:italic;">
                        ID: ${String(r.id_ca_dau).substring(0, 8)}…</div>`;
                } else {
                    thongTinCa = `<span style="font-size:0.7rem;color:#374151;background:rgba(255,255,255,0.04);
                        padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);">
                        Chưa liên kết</span>`;
                }

                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td>${badge}</td>
                <td>
                    <div style="font-weight:600;font-size:0.82rem;">${_layTen(sdtViet)}</div>
                    <div style="font-size:0.7rem;color:#64748b;">${_rutGonSdt(sdtViet)}</div>
                </td>
                <td>
                    <div style="font-weight:600;font-size:0.82rem;">${_layTen(sdtBiDG)}</div>
                    <div style="font-size:0.7rem;color:#64748b;">${_rutGonSdt(sdtBiDG)}</div>
                </td>
                <td>${thongTinCa}</td>
                <td style="white-space:nowrap;">${stars}</td>
                <td style="font-size:0.78rem;max-width:220px;">${
                    r.nhan_xet || "<em style='color:#64748b'>Không có nhận xét</em>"
                }</td>
                <td style="font-size:0.72rem;color:#64748b;white-space:nowrap;">
                    ${r.created_at ? new Date(r.created_at).toLocaleDateString("vi-VN") : "--"}
                    <br>
                    <button class="ad-btn-icon red" onclick="window.xoaDanhGiaAdmin('${r.id}')"
                        title="Xóa đánh giá" style="margin-top:4px;">
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
        if (!confirm("Xóa đánh giá này? Hành động không thể hoàn tác.")) return;
        try {
            await window.dbEngine.xoa("danh_gia_tin_dung", { id });
            window.hienToast("Đã xóa đánh giá", "Bài đánh giá đã bị gỡ khỏi hệ thống.", "info");
            await _taiDanhSachDanhGia();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể xóa đánh giá.", "danger");
        }
    };

    /* ═══════════════════════════════════════════════════
     * 8. CẤU HÌNH THÔNG BÁO & SỐ LIỆU TRANG CHỦ
     * Bảng cau_hinh_he_thong — mỗi key config là 1 dòng riêng:
     *   id='popup_chinh'    → nội dung thông báo popup cho khách
     *   id='so_keo_hien_thi' → số ca đấu HUD trang chủ
     *   id='so_thanh_vien'   → số thành viên HUD trang chủ
     * ═══════════════════════════════════════════════════ */
    async function _taiThongBao() {
        try {
            const configs   = await window.dbEngine.doc("cau_hinh_he_thong");
            const cfgMap    = {};
            configs.forEach(c => { if (c.id) cfgMap[c.id] = c; });

            _setVal("adminAnnouncementContent",
                cfgMap["popup_chinh"]?.noi_dung_thong_bao || "");
            _setVal("adminConfigTotalSlots",
                String(Number(cfgMap["so_keo_hien_thi"]?.noi_dung_thong_bao) || 45));
            _setVal("adminConfigOnlinePlayers",
                String(Number(cfgMap["so_thanh_vien"]?.noi_dung_thong_bao) || 1820));
        } catch (e) {
            console.error("[Admin] Lỗi tải cấu hình:", e);
        }
    }

    window.luuThongBaoAdmin = async function () {
        const content = document.getElementById("adminAnnouncementContent")?.value?.trim() || "";
        const total   = Number(document.getElementById("adminConfigTotalSlots")?.value)   || 45;
        const online  = Number(document.getElementById("adminConfigOnlinePlayers")?.value) || 1820;

        const btn = document.getElementById("btnLuuThongBao");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
        try {
            // TASK 1.3: Dùng upsert (INSERT … ON CONFLICT DO UPDATE) thay vì PATCH thuần
            // → Tránh trường hợp row chưa tồn tại → PATCH trả về 0 row thay đổi
            await Promise.all([
                window.dbEngine.upsert("cau_hinh_he_thong",
                    { id: "popup_chinh",    noi_dung_thong_bao: content }),
                window.dbEngine.upsert("cau_hinh_he_thong",
                    { id: "so_keo_hien_thi", noi_dung_thong_bao: String(total) }),
                window.dbEngine.upsert("cau_hinh_he_thong",
                    { id: "so_thanh_vien",   noi_dung_thong_bao: String(online) })
            ]);
            window.hienToast("Đã lưu cấu hình ✅", "Thông báo và số liệu trang chủ đã cập nhật.", "success");
        } catch (e) {
            window.hienToast("Lỗi", "Không thể lưu cấu hình. Vui lòng thử lại.", "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Thông Báo'; }
        }
    };

    /* ═══════════════════════════════════════════════════
     * 9. TIỆN ÍCH
     * ═══════════════════════════════════════════════════ */
    function _fVND(n) {
        return Number(n || 0).toLocaleString("vi-VN") + "đ";
    }

    // Khởi chạy khi admin.html load xong
    // Có fallback timeout 8 giây + try/catch toàn diện — tránh crash silent → màn trắng
    document.addEventListener("DOMContentLoaded", () => {
        let attempts = 0;
        const check = setInterval(() => {
            attempts++;
            try {
                if (window.khoiTaoTheme && window.khoiTaoHologramGlow && window.dbEngine) {
                    // Tất cả dependency sẵn sàng → khởi tạo bình thường
                    clearInterval(check);
                    window.khoiTaoTheme();
                    window.khoiTaoHologramGlow();
                    window.khoiTaoTrangAdmin();
                } else if (attempts >= 80) {
                    // Sau 80×100ms = 8 giây vẫn chưa load được → hiện auth panel dự phòng
                    clearInterval(check);
                    console.warn("[Admin Init] Timeout 8s — dbEngine chưa sẵn sàng, hiện auth panel dự phòng.");
                    const ap = document.getElementById("adminAuthPanel");
                    if (ap) ap.style.display = "block";
                }
            } catch (err) {
                // Crash trong init → dừng interval, hiện auth panel ngay, log lỗi
                clearInterval(check);
                console.error("[Admin Init] Crash trong init interval:", err);
                try {
                    const ap = document.getElementById("adminAuthPanel");
                    if (ap) ap.style.display = "block";
                } catch (_) { /* DOM lỗi — không làm gì thêm */ }
            }
        }, 100);
    });

    console.log("⚡ [Phân Hệ Admin v3.0]: Khởi động thành công — Supabase schema chuẩn.");
})();
