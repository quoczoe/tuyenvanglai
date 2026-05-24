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

        if (!maKey || !tenHost) {
            window.hienToast("Thiếu thông tin", "Vui lòng điền Mã Key và Tên Host.", "danger");
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
                // Tạo key mới — trang thái mặc định "Chưa kích hoạt"
                // ngay_kich_hoat và ngay_het_han sẽ do host tự động điền khi kích hoạt
                const payload = {
                    ma_key:           maKey,
                    ten_host:         tenHost,
                    sdt_host:         sdtHost,
                    so_ngay_duoc_xai: soNgay,
                    trang_thai:       "Chưa kích hoạt"
                };
                await window.dbEngine.ghi("quan_ly_key", payload);
                window.hienToast("Tạo Key thành công! 🔑", `Key ${maKey} cho ${tenHost}.`, "success");
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
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:16px;color:#64748b;">
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
                tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:#64748b;">
                    Chưa có thành viên nào trong hệ thống.</td></tr>`;
                return;
            }

            tbody.innerHTML = "";
            list.forEach((g, i) => {
                const d  = g.ngayTG ? new Date(g.ngayTG).toLocaleDateString("vi-VN") : "--";
                const tb = _tbSao(g.sdt);
                const soLuotDG = reviewMap[g.sdt]?.saoArr.length || 0;

                // Cell ⭐ Sao TB
                const saoCellHTML = tb
                    ? `<span class="sao-badge">${tb} ⭐</span>
                       <span style="font-size:0.72rem;color:#9ca3af;display:block;margin-top:2px;">(${soLuotDG} lượt)</span>
                       <button class="btn-mini" style="margin-top:4px;"
                           onclick="window.xemDanhGiaThanhVien('${g.sdt}', '${(g.ten||"").replace(/'/g,"\\'")}')">
                           📋 Chi tiết
                       </button>`
                    : `<span style="color:#6b7280;font-size:0.78rem;">Chưa có</span>`;

                // Cell Hành động — dropdown
                const trangThaiTK = g.trang_thai_tai_khoan !== false;
                const hanhDongHTML = `
                    <div class="ad-action-dropdown-wrap">
                        <button class="btn-mini" onclick="window.moHanhDongThanhVien('${g.sdt}', this)">
                            ⚙️ Hành động ▾
                        </button>
                        <div class="ad-action-dropdown" id="dropdown_${g.sdt.replace(/\+/g,'plus')}" style="display:none;">
                            <button onclick="window.moModalSuaThanhVien('${g.sdt}')">✏️ Sửa thông tin</button>
                            <button onclick="window.doiVaiTroThanhVien('${g.sdt}', '${g.vai_tro}')">🔄 Đổi vai trò</button>
                            <button onclick="window.capLaiMatKhau('${g.sdt}')">🔑 Cấp lại mật khẩu</button>
                            <button onclick="window.khoaMoTaiKhoan('${g.sdt}', ${trangThaiTK})">
                                ${trangThaiTK ? '🔒 Khóa TK' : '🔓 Mở khóa'}
                            </button>
                            <button class="danger" onclick="window.xoaTaiKhoan('${g.sdt}')">🗑️ Xóa TK</button>
                        </div>
                    </div>`;

                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td style="color:#64748b;font-size:0.8rem;">${i + 1}</td>
                <td style="font-weight:700;font-size:0.85rem;">${g.ten}</td>
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
                <td>${hanhDongHTML}</td>`;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("[Admin] Lỗi tải thành viên:", e);
            tbody.innerHTML = `<tr><td colspan="9" style="color:#ef4444;text-align:center;padding:16px;">
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
     * 6B. CRUD THÀNH VIÊN — Dropdown hành động, Modal sửa, Xóa, Khóa/Mở
     * ═══════════════════════════════════════════════════ */

    // Toggle dropdown hành động — đóng tất cả dropdown khác trước khi mở cái này
    window.moHanhDongThanhVien = function (sdt, btnEl) {
        const safeSdt = sdt.replace(/\+/g, "plus");
        document.querySelectorAll(".ad-action-dropdown").forEach(d => {
            if (d.id !== "dropdown_" + safeSdt) d.style.display = "none";
        });
        const dd = document.getElementById("dropdown_" + safeSdt);
        if (dd) dd.style.display = (dd.style.display === "none" ? "block" : "none");
    };

    // Click ngoài vùng dropdown → đóng tất cả
    document.addEventListener("click", function (e) {
        if (!e.target.closest(".ad-action-dropdown-wrap")) {
            document.querySelectorAll(".ad-action-dropdown").forEach(d => {
                d.style.display = "none";
            });
        }
    });

    // Mở modal sửa thông tin thành viên với dữ liệu pre-filled
    window.moModalSuaThanhVien = async function (sdt) {
        try {
            const users = await window.dbEngine.doc("nguoi_dung");
            const u = (users || []).find(x => x.sdt_khach === sdt);
            if (!u) {
                window.hienToast("Lỗi", "Không tìm thấy thành viên.", "danger");
                return;
            }
            document.getElementById("modalThanhVienTitle").textContent = "Sửa Thành Viên: " + sdt;
            document.getElementById("modalThanhVienBody").innerHTML = `
                <div style="display:flex;flex-direction:column;gap:14px;">
                    <div>
                        <label style="font-size:0.78rem;color:#94a3b8;display:block;margin-bottom:4px;">Họ tên</label>
                        <input type="text" id="editTenKhach" value="${(u.ten_khach||'').replace(/"/g,'&quot;')}"
                            placeholder="Họ tên"
                            style="width:100%;padding:9px 12px;background:#0f1e35;border:1px solid #2d4a6e;
                                   border-radius:8px;color:#e2e8f0;font-size:0.9rem;box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:0.78rem;color:#94a3b8;display:block;margin-bottom:4px;">SĐT Zalo</label>
                        <input type="tel" id="editSdtZalo" value="${u.sdt_zalo||''}"
                            placeholder="SĐT Zalo"
                            style="width:100%;padding:9px 12px;background:#0f1e35;border:1px solid #2d4a6e;
                                   border-radius:8px;color:#e2e8f0;font-size:0.9rem;box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:0.78rem;color:#94a3b8;display:block;margin-bottom:4px;">Facebook</label>
                        <input type="url" id="editFacebook" value="${u.facebook_link||''}"
                            placeholder="Link Facebook"
                            style="width:100%;padding:9px 12px;background:#0f1e35;border:1px solid #2d4a6e;
                                   border-radius:8px;color:#e2e8f0;font-size:0.9rem;box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:0.78rem;color:#94a3b8;display:block;margin-bottom:4px;">Vai trò</label>
                        <select id="editVaiTro"
                            style="width:100%;padding:9px 12px;background:#0f1e35;border:1px solid #2d4a6e;
                                   border-radius:8px;color:#e2e8f0;font-size:0.9rem;box-sizing:border-box;">
                            <option value="guest" ${u.vai_tro==='guest'||!u.vai_tro ? 'selected':''}>Guest (Khách)</option>
                            <option value="host"  ${u.vai_tro==='host' ? 'selected':''}>Host (Chủ sân)</option>
                        </select>
                    </div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:6px;">
                        <button onclick="window.dongModalThanhVien()"
                            style="padding:9px 20px;background:rgba(255,255,255,0.06);border:1px solid #2d4a6e;
                                   border-radius:8px;color:#94a3b8;cursor:pointer;font-size:0.9rem;">
                            Hủy
                        </button>
                        <button onclick="window.luuSuaThanhVien('${sdt}')"
                            style="padding:9px 20px;background:linear-gradient(135deg,#00d4ff,#00ff88);
                                   border:none;border-radius:8px;color:#0f1e35;font-weight:700;cursor:pointer;font-size:0.9rem;">
                            💾 Lưu thay đổi
                        </button>
                    </div>
                </div>`;
            document.getElementById("modalThanhVienOverlay").style.display = "flex";
        } catch (e) {
            window.hienToast("Lỗi", "Không thể tải dữ liệu thành viên.", "danger");
        }
    };

    // Lưu thay đổi thông tin thành viên vào Supabase
    window.luuSuaThanhVien = async function (sdt) {
        const payload = {};
        const ten   = document.getElementById("editTenKhach")?.value?.trim();
        const zalo  = document.getElementById("editSdtZalo")?.value?.trim();
        const fb    = document.getElementById("editFacebook")?.value?.trim();
        const role  = document.getElementById("editVaiTro")?.value;
        if (ten  !== undefined && ten  !== "") payload.ten_khach     = ten;
        if (zalo !== undefined)                payload.sdt_zalo      = zalo  || null;
        if (fb   !== undefined)                payload.facebook_link = fb    || null;
        if (role)                              payload.vai_tro       = role;

        try {
            await window.dbEngine.ghi("nguoi_dung", payload, { sdt_khach: sdt });
            window.hienToast("Thành công ✅", "Đã cập nhật thông tin thành viên.", "success");
            window.dongModalThanhVien();
            _taiDanhSachKhach(); // Reload bảng
        } catch (e) {
            window.hienToast("Lỗi", "Không thể lưu: " + (e.message || "").slice(0, 80), "danger");
        }
    };

    // Đổi vai trò guest ↔ host
    window.doiVaiTroThanhVien = async function (sdt, vaiTroHienTai) {
        const moi = vaiTroHienTai === "guest" ? "host" : "guest";
        if (!confirm(`Đổi vai trò của ${sdt}\ntừ "${vaiTroHienTai}" → "${moi}"?`)) return;
        try {
            await window.dbEngine.ghi("nguoi_dung", { vai_tro: moi }, { sdt_khach: sdt });
            window.hienToast("Đã đổi vai trò ✅", `${sdt} giờ là: ${moi}`, "success");
            _taiDanhSachKhach();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể đổi vai trò.", "danger");
        }
    };

    // Cấp lại mật khẩu — xóa hash, user đặt lại khi đăng nhập kế tiếp
    window.capLaiMatKhau = async function (sdt) {
        if (!confirm(`Reset mật khẩu cho ${sdt}?\nLần đăng nhập kế tiếp họ sẽ được đặt mật khẩu mới.`)) return;
        try {
            await window.dbEngine.ghi("nguoi_dung", { mat_khau_hash: null }, { sdt_khach: sdt });
            window.hienToast("Đã reset ✅", "Mật khẩu đã bị xóa. User đặt mới khi đăng nhập.", "success");
        } catch (e) {
            window.hienToast("Lỗi", "Không thể reset mật khẩu.", "danger");
        }
    };

    // Khóa hoặc mở khóa tài khoản (toggle trang_thai_tai_khoan)
    window.khoaMoTaiKhoan = async function (sdt, trangThaiHienTai) {
        const moiLaActive = !trangThaiHienTai; // Toggle: true → false hoặc ngược lại
        const label = moiLaActive ? "Mở khóa" : "Khóa";
        if (!confirm(`${label} tài khoản ${sdt}?`)) return;
        try {
            await window.dbEngine.ghi("nguoi_dung", { trang_thai_tai_khoan: moiLaActive }, { sdt_khach: sdt });
            window.hienToast(
                label + " thành công ✅",
                `Tài khoản ${sdt} đã ${moiLaActive ? "được mở khóa" : "bị khóa"}.`,
                moiLaActive ? "success" : "warning"
            );
            _taiDanhSachKhach();
        } catch (e) {
            window.hienToast("Lỗi", `Không thể ${label.toLowerCase()} tài khoản.`, "danger");
        }
    };

    // Xóa tài khoản — double confirm, chỉ xóa nguoi_dung (giữ lịch sử dat_slot)
    window.xoaTaiKhoan = async function (sdt) {
        if (!confirm(`⚠️ XÓA VĨNH VIỄN tài khoản ${sdt}?\nHành động này KHÔNG thể hoàn tác!`)) return;
        if (!confirm(`Xác nhận lần 2: Xóa tài khoản ${sdt}?`)) return;
        try {
            await window.dbEngine.xoa("nguoi_dung", { sdt_khach: sdt });
            window.hienToast("Đã xóa ✅", `Tài khoản ${sdt} đã bị xóa vĩnh viễn.`, "warning");
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

    // Click outside modal → đóng
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
            // Mỗi config key là 1 bản ghi riêng biệt trong cau_hinh_he_thong
            await Promise.all([
                window.dbEngine.ghi("cau_hinh_he_thong",
                    { noi_dung_thong_bao: content },
                    { id: "popup_chinh" }),
                window.dbEngine.ghi("cau_hinh_he_thong",
                    { noi_dung_thong_bao: String(total) },
                    { id: "so_keo_hien_thi" }),
                window.dbEngine.ghi("cau_hinh_he_thong",
                    { noi_dung_thong_bao: String(online) },
                    { id: "so_thanh_vien" })
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
