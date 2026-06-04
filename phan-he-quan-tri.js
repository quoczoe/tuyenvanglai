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
    // ── Auth Admin: Supabase JWT (không còn hardcode) ──

    let _editingKeyId = null; // ma_key đang được chỉnh sửa
    // reviewMap — module-level để xemDanhGiaThanhVien() và xoaDanhGia() truy cập sau _taiDanhSachKhach()
    let reviewMap = {};

    /* ═══════════════════════════════════════════════════
     * 1. KHỞI TẠO TRANG ADMIN
     * ═══════════════════════════════════════════════════ */
    window.khoiTaoTrangAdmin = async function () {
        try {
            const session = await window.supabaseAuth.laySession();
            if (!session) { _hienManLogin(); return; }

            // Re-verify vai_tro='admin' thực sự trong DB (dùng JWT authenticated context)
            const { data, error } = await window._sbClient
                .from("nguoi_dung")
                .select("ten_khach")
                .eq("auth_uid",  session.user.id)
                .eq("vai_tro",   "admin")
                .eq("is_active", true)
                .single();

            if (error || !data) {
                await window.supabaseAuth.dangXuat();
                _hienManLogin();
                return;
            }
            // Cache JWT để dbEngine dùng được RLS authenticated context
            window._adminJWT = session.access_token;
            _hienConsole();
        } catch (e) {
            console.warn("[Admin] Kiểm tra session lỗi:", e);
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
        // Khôi phục tab từ URL hash nếu có, mặc định "guests"
        const hashTab   = (location.hash || "").replace("#tab-", "");
        const validTabs = ["guests", "reviews", "config", "stats", "cadau", "gopy", "baocao"];
        window.chuyenTabAdmin(validTabs.includes(hashTab) ? hashTab : "guests");
        // Load metrics top dashboard ngay sau khi console hiện
        setTimeout(_loadMetrics, 200);
    }

    function _setDisplay(id, val) {
        const el = document.getElementById(id);
        if (el) el.style.display = val;
    }

    /* ═══════════════════════════════════════════════════
     * 2. XÁC THỰC ADMIN
     * ═══════════════════════════════════════════════════ */
    window.xacThucQuyenAdmin = async function () {
        const email = (document.getElementById("adminEmail")?.value || "").trim();
        const pass  = document.getElementById("adminSecretPassword")?.value || "";

        if (!email || !pass) {
            window.hienToast("Thiếu thông tin", "Nhập đầy đủ email và mật khẩu.", "danger");
            return;
        }

        const btn = document.getElementById("btnAdminLogin");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực...'; }

        try {
            // Bước 1: Supabase Auth signInWithPassword — JWT có chữ ký server, không thể giả mạo
            const authData = await window.supabaseAuth.dangNhap(email, pass);
            if (!authData?.session) throw new Error("Không lấy được session từ Supabase Auth");

            // Bước 2: Verify vai_tro='admin' trong nguoi_dung (dùng JWT vừa lấy)
            const { data, error } = await window._sbClient
                .from("nguoi_dung")
                .select("ten_khach")
                .eq("auth_uid",  authData.session.user.id)
                .eq("vai_tro",   "admin")
                .eq("is_active", true)
                .single();

            if (error || !data) {
                await window.supabaseAuth.dangXuat();
                throw new Error("Tài khoản không có quyền Quản Trị Viên");
            }

            // Cache JWT để dbEngine dùng được RLS authenticated context
            window._adminJWT = authData.session.access_token;
            window.hienToast("Chào Admin! 👑", `Xin chào ${data.ten_khach} — Trung Tâm Chỉ Huy đã sẵn sàng.`, "success");
            _hienConsole();
        } catch (e) {
            window.hienToast("Đăng nhập thất bại", e.message || "Sai email hoặc mật khẩu.", "danger");
            const passEl = document.getElementById("adminSecretPassword");
            if (passEl) passEl.value = "";
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Đăng Nhập Admin'; }
        }
    };

    window.dangXuatAdmin = async function () {
        window._adminJWT = null; // Xóa JWT cache để dbEngine quay về anon key
        await window.supabaseAuth.dangXuat();
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
        if      (tabName === "guests")  _taiDanhSachKhach();
        else if (tabName === "reviews") _taiDanhSachDanhGia();
        else if (tabName === "config")  _taiThongBao();
        else if (tabName === "stats")   _taiThongKe();
        else if (tabName === "cadau")   _taiDanhSachCaDauAdmin();
        else if (tabName === "gopy")    _taiDanhSachGopY();
        else if (tabName === "baocao")  window.adminTaiBaoCao();
    };

    /* ═══════════════════════════════════════════════════
     * 4. THỐNG KÊ TỔNG QUAN
     * ═══════════════════════════════════════════════════ */
    async function _taiThongKe() {
        try {
            const [caDau, khachVL, danhGia, gopY] = await Promise.all([
                window.dbEngine.doc("ca_dau"),
                window.dbEngine.doc("nguoi_dung"),
                window.dbEngine.doc("danh_gia_tin_dung"),
                window.dbEngine.docThu("gop_y_he_thong", {}) || []
            ]);

            const openSlots   = caDau.filter(s => !s.da_chot_ca).length;
            const closedSlots = caDau.filter(s =>  s.da_chot_ca).length;

            // Tab Thống kê
            _st("statTotalSlots",   caDau.length);
            _st("statOpenSlots",    openSlots);
            _st("statClosedSlots",  closedSlots);
            _st("statTotalGuests",  khachVL.length);
            _st("statTotalReviews", danhGia.length);
            _st("statTotalGopY",    (gopY || []).length);

            // 4 Metric cards đầu trang
            _capNhatMetric("metricTotalMembers", khachVL.length);
            _capNhatMetric("metricOpenCaDau",    openSlots);
            _capNhatMetric("metricGopY",         (gopY || []).length);
            _capNhatMetric("metricDanhGia",       danhGia.length);
        } catch (e) {
            console.error("[Admin] Thống kê lỗi:", e);
        }
    }

    // Load nhẹ metrics top dashboard — gọi ngay khi admin đăng nhập
    async function _loadMetrics() {
        try {
            const [caDau, khachVL, danhGia, gopY] = await Promise.all([
                window.dbEngine.docThu("ca_dau", {}) || [],
                window.dbEngine.docThu("nguoi_dung", {}) || [],
                window.dbEngine.docThu("danh_gia_tin_dung", {}) || [],
                window.dbEngine.docThu("gop_y_he_thong", {}) || []
            ]);
            const openSlots = (caDau || []).filter(s => !s.da_chot_ca).length;
            _capNhatMetric("metricTotalMembers", (khachVL || []).length);
            _capNhatMetric("metricOpenCaDau",    openSlots);
            _capNhatMetric("metricGopY",         (gopY || []).length);
            _capNhatMetric("metricDanhGia",       (danhGia || []).length);
        } catch (e) { /* im lặng */ }
    }

    function _st(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    /* ═══════════════════════════════════════════════════
     * 4B. CA ĐẤU — ADMIN QUẢN LÝ TOÀN HỆ THỐNG
     * ═══════════════════════════════════════════════════ */

    // Dữ liệu ca đấu đã tải — dùng cho filter + search
    let _allCaDauAdmin = [];
    let _keyHostMap    = {}; // ma_key → ten_host
    let _datSlotCountMap = {}; // id_ca_dau → số slot đã đặt (tất cả trạng thái trừ Khách hủy)
    // ID ca đang chỉnh sửa
    let _editingCaId   = null;

    async function _taiDanhSachCaDauAdmin() {
        const tbody = document.getElementById("adminCaDauBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu ca đấu...</td></tr>`;
        try {
            // Tải song song: ca_dau + quan_ly_key + dat_slot
            const [caDauList, keys, datSlots] = await Promise.all([
                window.dbEngine.doc("ca_dau"),
                window.dbEngine.doc("quan_ly_key"),
                window.dbEngine.doc("dat_slot")
            ]);

            // Tạo map host key → tên host
            _keyHostMap = {};
            keys.forEach(k => { if (k.ma_key) _keyHostMap[k.ma_key] = k.ten_host || k.ma_key; });

            // Tạo map id_ca_dau → số khách (loại trừ "Khách hủy")
            _datSlotCountMap = {};
            datSlots.forEach(s => {
                if (s.trang_thai_di_danh !== "Khách hủy") {
                    _datSlotCountMap[s.id_ca_dau] = (_datSlotCountMap[s.id_ca_dau] || 0) + 1;
                }
            });

            // Sắp xếp: mới nhất trước
            caDauList.sort((a, b) => new Date(b.ngay_danh || 0) - new Date(a.ngay_danh || 0));
            _allCaDauAdmin = caDauList;

            _renderCaDauAdmin(caDauList);
        } catch (e) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:28px;color:#ef4444;">
                <i class="fa-solid fa-triangle-exclamation"></i> Lỗi tải dữ liệu: ${e.message || "Không rõ"}</td></tr>`;
        }
    }

    function _renderCaDauAdmin(list) {
        const tbody = document.getElementById("adminCaDauBody");
        if (!tbody) return;

        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:#64748b;">
                <i class="fa-solid fa-calendar-xmark" style="font-size:1.5rem;display:block;margin-bottom:8px;"></i>
                Không tìm thấy ca đấu nào.</td></tr>`;
            return;
        }

        const _vnd = (n) => (n || 0).toLocaleString("vi-VN") + "đ";

        tbody.innerHTML = list.map(c => {
            const tenHost    = _keyHostMap[c.ma_key_host] || c.ma_key_host || "—";
            const soKhach    = _datSlotCountMap[c.id] || 0;
            const trangThai  = c.da_chot_ca
                ? `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(100,116,139,0.15);color:#94a3b8;padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;"><i class="fa-solid fa-lock" style="font-size:0.65em;"></i> Đã chốt</span>`
                : `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(0,255,136,0.12);color:#00ff88;padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;"><i class="fa-solid fa-circle" style="font-size:0.5em;"></i> Đang mở</span>`;
            const ngay       = c.ngay_danh ? new Date(c.ngay_danh).toLocaleDateString("vi-VN") : "—";
            const gio        = `${c.gio_bat_dau || "--:--"} – ${c.gio_ket_thuc || "--:--"}`;
            const tinh       = [c.tinh_thanh, c.quan_huyen].filter(Boolean).join(" / ") || "—";

            return `<tr>
                <td style="white-space:nowrap;font-weight:600;color:#e2e8f0;">${ngay}</td>
                <td>
                    <div style="font-size:0.8rem;color:#60a5fa;font-weight:600;">${_escHtml(tenHost)}</div>
                    <div style="font-size:0.7rem;color:#64748b;font-family:monospace;">${c.ma_key_host || ""}</div>
                </td>
                <td style="font-weight:500;color:#e2e8f0;">${_escHtml(c.ten_san || "—")}</td>
                <td style="font-size:0.8rem;color:#9ca3af;">${_escHtml(tinh)}</td>
                <td style="font-size:0.82rem;color:#94a3b8;white-space:nowrap;">${gio}</td>
                <td style="text-align:center;">
                    <span style="background:rgba(99,102,241,0.15);color:#a78bfa;padding:3px 10px;border-radius:12px;font-size:0.8rem;font-weight:700;">${soKhach}</span>
                </td>
                <td style="font-size:0.8rem;white-space:nowrap;">
                    <span style="color:#00ff88;">Nam: ${_vnd(c.gia_nam)}</span><br>
                    <span style="color:#f472b6;">Nữ: ${_vnd(c.gia_nu)}</span>
                </td>
                <td>${trangThai}</td>
                <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        <button class="btn-mini" onclick="window.suaCaDauAdmin('${c.id}')"
                            style="background:rgba(96,165,250,0.1);color:#60a5fa;border:1px solid rgba(96,165,250,0.3);">
                            <i class="fa-solid fa-pen-to-square"></i> Sửa
                        </button>
                        <button class="btn-mini" onclick="window.xoaCaDauAdmin('${c.id}','${_escHtml(c.ten_san || c.id)}')"
                            style="background:rgba(239,68,68,0.08);color:#f87171;border:1px solid rgba(239,68,68,0.25);">
                            <i class="fa-solid fa-trash-can"></i> Xóa
                        </button>
                        ${c.da_chot_ca
                            ? `<button class="btn-mini" onclick="window.moChocCaDauAdmin('${c.id}', false)"
                                style="background:rgba(251,146,60,0.1);color:#fb923c;border:1px solid rgba(251,146,60,0.3);">
                                <i class="fa-solid fa-lock-open"></i> Mở lại
                               </button>`
                            : `<button class="btn-mini" onclick="window.moChocCaDauAdmin('${c.id}', true)"
                                style="background:rgba(100,116,139,0.1);color:#94a3b8;border:1px solid rgba(100,116,139,0.3);">
                                <i class="fa-solid fa-lock"></i> Chốt
                               </button>`
                        }
                    </div>
                </td>
            </tr>`;
        }).join("");
    }

    // Hàm tìm kiếm ca đấu theo text
    window.locCaDauAdmin = function () {
        const q = (document.getElementById("adminCaDauSearch")?.value || "").toLowerCase();
        if (!q) { _renderCaDauAdmin(_allCaDauAdmin); return; }
        const filtered = _allCaDauAdmin.filter(c => {
            const tenHost = (_keyHostMap[c.ma_key_host] || "").toLowerCase();
            return (c.ten_san   || "").toLowerCase().includes(q)
                || (c.tinh_thanh || "").toLowerCase().includes(q)
                || (c.quan_huyen || "").toLowerCase().includes(q)
                || tenHost.includes(q)
                || (c.ma_key_host || "").toLowerCase().includes(q);
        });
        _renderCaDauAdmin(filtered);
    };

    // Hàm lọc theo trạng thái
    window.locCaDauTheoTrangThai = function (loai, btnEl) {
        document.querySelectorAll("#adminTab_cadau .ad-pill").forEach(b => b.classList.remove("active"));
        if (btnEl) btnEl.classList.add("active");

        const today = new Date().toISOString().split("T")[0];
        let filtered;
        if      (loai === "open")   filtered = _allCaDauAdmin.filter(c => !c.da_chot_ca);
        else if (loai === "closed") filtered = _allCaDauAdmin.filter(c => c.da_chot_ca);
        else if (loai === "today")  filtered = _allCaDauAdmin.filter(c => c.ngay_danh === today);
        else                        filtered = _allCaDauAdmin;

        _renderCaDauAdmin(filtered);
    };

    // Mở modal sửa ca đấu
    window.suaCaDauAdmin = async function (caId) {
        _editingCaId = caId;
        const body = document.getElementById("modalSuaCaDauBody");
        if (!body) return;
        body.innerHTML = `<div style="text-align:center;padding:28px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin fa-lg"></i><br><br>Đang tải thông tin...</div>`;

        // Hiện modal
        const overlay = document.getElementById("modalSuaCaDauOverlay");
        if (overlay) { overlay.style.display = "flex"; }

        try {
            const list = await window.dbEngine.doc("ca_dau", { eq: { id: caId } });
            const c    = list[0];
            if (!c) {
                body.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px;">Không tìm thấy ca đấu.</div>`;
                return;
            }

            const tenHost = _keyHostMap[c.ma_key_host] || c.ma_key_host || "—";

            body.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:8px;margin-bottom:4px;">
                    <i class="fa-solid fa-circle-info" style="color:#60a5fa;"></i>
                    <div>
                        <div style="font-size:0.78rem;color:#64748b;">Host</div>
                        <div style="font-weight:700;color:#60a5fa;">${_escHtml(tenHost)}</div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="ad-form-group">
                        <label class="ad-label">Tên Sân</label>
                        <input type="text" class="ad-input" id="editCaTenSan" value="${_escHtml(c.ten_san || '')}">
                    </div>
                    <div class="ad-form-group">
                        <label class="ad-label">Ngày Đánh</label>
                        <input type="date" class="ad-input" id="editCaNgayDanh" value="${c.ngay_danh || ''}">
                    </div>
                    <div class="ad-form-group">
                        <label class="ad-label">Giờ Bắt Đầu</label>
                        <input type="time" class="ad-input" id="editCaGioBatDau" value="${(c.gio_bat_dau || '').substring(0,5)}">
                    </div>
                    <div class="ad-form-group">
                        <label class="ad-label">Giờ Kết Thúc</label>
                        <input type="time" class="ad-input" id="editCaGioKetThuc" value="${(c.gio_ket_thuc || '').substring(0,5)}">
                    </div>
                    <div class="ad-form-group">
                        <label class="ad-label">Giá Nam (VNĐ)</label>
                        <input type="number" class="ad-input" id="editCaGiaNam" value="${c.gia_nam || 0}" min="0">
                    </div>
                    <div class="ad-form-group">
                        <label class="ad-label">Giá Nữ (VNĐ)</label>
                        <input type="number" class="ad-input" id="editCaGiaNu" value="${c.gia_nu || 0}" min="0">
                    </div>
                    <div class="ad-form-group">
                        <label class="ad-label">Tỉnh / Thành Phố</label>
                        <input type="text" class="ad-input" id="editCaTinh" value="${_escHtml(c.tinh_thanh || '')}">
                    </div>
                    <div class="ad-form-group">
                        <label class="ad-label">Quận / Huyện</label>
                        <input type="text" class="ad-input" id="editCaQuan" value="${_escHtml(c.quan_huyen || '')}">
                    </div>
                </div>

                <div class="ad-form-group">
                    <label class="ad-label">Địa Chỉ Sân</label>
                    <input type="text" class="ad-input" id="editCaDiaChi" value="${_escHtml(c.dia_chi_san || '')}">
                </div>

                <div class="ad-form-group">
                    <label class="ad-label" style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                        <input type="checkbox" id="editCaDaChot" ${c.da_chot_ca ? "checked" : ""}
                            style="width:16px;height:16px;cursor:pointer;accent-color:#00ff88;">
                        <span>Ca đấu đã chốt (da_chot_ca)</span>
                    </label>
                    <div style="font-size:0.72rem;color:#64748b;margin-top:4px;">
                        ⚠️ Thay đổi trạng thái chốt ca sẽ khóa/mở khóa toàn bộ thao tác của Host.
                    </div>
                </div>`;
        } catch (e) {
            body.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px;">
                Lỗi: ${e.message || "Không thể tải thông tin"}</div>`;
        }
    };

    // Lưu thay đổi ca đấu (Admin)
    window.luuSuaCaDauAdmin = async function () {
        if (!_editingCaId) return;
        const payload = {
            ten_san:           document.getElementById("editCaTenSan")?.value?.trim()   || undefined,
            ngay_danh:         document.getElementById("editCaNgayDanh")?.value         || undefined,
            gio_bat_dau:       document.getElementById("editCaGioBatDau")?.value        || undefined,
            gio_ket_thuc:      document.getElementById("editCaGioKetThuc")?.value       || undefined,
            gia_nam:           Number(document.getElementById("editCaGiaNam")?.value)   || 0,
            gia_nu:            Number(document.getElementById("editCaGiaNu")?.value)    || 0,
            tinh_thanh:        document.getElementById("editCaTinh")?.value?.trim()     || undefined,
            quan_huyen:        document.getElementById("editCaQuan")?.value?.trim()     || undefined,
            dia_chi_san:       document.getElementById("editCaDiaChi")?.value?.trim()   || undefined,
            da_chot_ca:        !!document.getElementById("editCaDaChot")?.checked,
        };
        // Xóa key undefined để không ghi đè bằng undefined
        Object.keys(payload).forEach(k => { if (payload[k] === undefined) delete payload[k]; });

        try {
            await window.dbEngine.ghi("ca_dau", payload, { id: _editingCaId });
            window.hienToast("Đã lưu", "Ca đấu đã được cập nhật thành công.", "success");
            window.dongModalSuaCaDau();
            _taiDanhSachCaDauAdmin(); // Reload bảng
        } catch (e) {
            window.hienToast("Lỗi lưu", (e.message || "Không thể lưu ca đấu").slice(0, 80), "danger");
        }
    };

    // Đóng modal sửa ca đấu
    window.dongModalSuaCaDau = function () {
        const overlay = document.getElementById("modalSuaCaDauOverlay");
        if (overlay) overlay.style.display = "none";
        _editingCaId = null;
    };

    // Xóa ca đấu (double confirm)
    window.xoaCaDauAdmin = async function (caId, tenSan) {
        if (!await window.xacNhanModal(`Xóa ca đấu "${tenSan}"?\nToàn bộ slot đặt trong ca này SẼ BỊ XÓA. Hành động KHÔNG THỂ hoàn tác!`, '🗑️')) return;
        if (!await window.xacNhanModal(`Xác nhận lần 2: Xóa vĩnh viễn ca đấu "${tenSan}"?`, '⚠️')) return;
        try {
            // Xóa các dat_slot liên quan trước
            const slotsOfCa = await window.dbEngine.doc("dat_slot", { eq: { id_ca_dau: caId } });
            await Promise.all(slotsOfCa.map(s => window.dbEngine.xoa("dat_slot", { id: s.id }).catch(() => {})));
            // Xóa ca đấu
            await window.dbEngine.xoa("ca_dau", { id: caId });
            window.hienToast("Đã xóa", `Ca đấu "${tenSan}" và ${slotsOfCa.length} slot liên quan đã bị xóa.`, "warning");
            _taiDanhSachCaDauAdmin();
        } catch (e) {
            window.hienToast("Lỗi xóa", (e.message || "Không thể xóa").slice(0, 80), "danger");
        }
    };

    // Chốt / Mở lại ca đấu (Admin)
    window.moChocCaDauAdmin = async function (caId, daChot) {
        const label = daChot ? "Chốt" : "Mở lại";
        if (!await window.xacNhanModal(`${label} ca đấu này?`, '🏸')) return;
        try {
            await window.dbEngine.ghi("ca_dau", { da_chot_ca: daChot }, { id: caId });
            window.hienToast(`Đã ${label}`, `Ca đấu đã được ${label.toLowerCase()} thành công.`, daChot ? "warning" : "success");
            _taiDanhSachCaDauAdmin();
        } catch (e) {
            window.hienToast("Lỗi", (e.message || "Không thể thực hiện").slice(0, 80), "danger");
        }
    };

    // Escape HTML để tránh XSS trong template literal
    function _escHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    /* ═══════════════════════════════════════════════════
     * 5.5 — GÓP Ý HỆ THỐNG
     * ═══════════════════════════════════════════════════ */
    /* Màu badge theo loại góp ý */
    const _LOAI_COLOR = {
        "Lỗi/Bug":       { bg:"rgba(239,68,68,0.15)",   color:"#f87171" },
        "Ý tưởng mới":   { bg:"rgba(234,179,8,0.15)",   color:"#facc15" },
        "Giao diện/UX":  { bg:"rgba(168,85,247,0.15)",  color:"#c084fc" },
        "Khác":          { bg:"rgba(148,163,184,0.12)", color:"#94a3b8" },
    };

    /* Reset bulk bar mỗi khi load lại bảng */
    function _resetBulkBar() {
        const bar = document.getElementById("gopYBulkBar");
        if (bar) bar.style.display = "none";
        const chkAll = document.getElementById("gopYChkAll");
        if (chkAll) chkAll.checked = false;
    }

    async function _taiDanhSachGopY() {
        _resetBulkBar();
        const tbody = document.getElementById("adminGopyBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;
        try {
            const list = (await window.dbEngine.docThu("gop_y_he_thong", {
                order: "created_at.desc"
            })) || [];
            if (list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">
                    Chưa có góp ý nào.</td></tr>`;
                return;
            }
            const stars = n => {
                const filled = n || 0;
                return `<span style="color:#fbbf24;">${"★".repeat(filled)}</span><span style="color:rgba(255,255,255,0.18);">${"★".repeat(5-filled)}</span>
                        <span style="color:#9ca3af;font-size:0.72rem;margin-left:2px;">${filled}/5</span>`;
            };
            tbody.innerHTML = list.map((g, i) => {
                const loai  = g.loai_gop_y || "Khác";
                const lc    = _LOAI_COLOR[loai] || { bg:"rgba(34,211,238,0.1)", color:"#22d3ee" };
                // Thời gian: ngày + giờ:phút
                let thoiGian = "—";
                if (g.created_at) {
                    const d = new Date(g.created_at);
                    thoiGian = d.toLocaleDateString("vi-VN") + "<br>"
                             + `<span style="color:#64748b;font-size:0.72rem;">${d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}</span>`;
                }
                // Tên user — clickable nếu có SĐT
                const sdtSafe = _escHtml(g.sdt_user || "");
                const tenHtml = sdtSafe
                    ? `<span style="cursor:pointer;color:#60a5fa;text-decoration:underline;text-underline-offset:2px;"
                             onclick="window.moModalQuanLyThanhVien('${sdtSafe}')" title="Xem thông tin user">${_escHtml(g.ten_user||"Ẩn danh")}</span>`
                    : `<span style="color:#e2e8f0;">${_escHtml(g.ten_user||"Ẩn danh")}</span>`;
                // Nội dung: cắt 80 ký tự, có nút xem thêm
                const nd     = g.noi_dung || "";
                const MAX    = 80;
                let   ndHtml = "";
                if (nd.length <= MAX) {
                    ndHtml = `<span style="color:#cbd5e1;font-size:0.82rem;">${_escHtml(nd) || "<span style='color:#475569;font-style:italic;'>Không có nội dung</span>"}</span>`;
                } else {
                    const short  = _escHtml(nd.slice(0, MAX));
                    const full   = _escHtml(nd);
                    const rowId  = `gy_${g.id}`;
                    ndHtml = `<span id="${rowId}_short" style="color:#cbd5e1;font-size:0.82rem;">${short}…
                                <button onclick="window._moRongGopY('${rowId}')" style="background:none;border:none;color:#60a5fa;font-size:0.75rem;cursor:pointer;padding:0 4px;">Xem thêm</button>
                              </span>
                              <span id="${rowId}_full" style="display:none;color:#cbd5e1;font-size:0.82rem;">${full}
                                <button onclick="window._thuGonGopY('${rowId}')" style="background:none;border:none;color:#60a5fa;font-size:0.75rem;cursor:pointer;padding:0 4px;">Thu gọn</button>
                              </span>`;
                }
                return `<tr>
                    <td style="text-align:center;">
                        <input type="checkbox" class="gy-chk" value="${g.id}"
                               style="cursor:pointer;accent-color:#f87171;"
                               onchange="window._capNhatBulkBar()">
                    </td>
                    <td>${tenHtml}</td>
                    <td style="white-space:nowrap;">${stars(g.so_sao)}</td>
                    <td><span style="background:${lc.bg};color:${lc.color};padding:2px 9px;border-radius:10px;font-size:0.73rem;white-space:nowrap;">${_escHtml(loai)}</span></td>
                    <td style="max-width:260px;">${ndHtml}</td>
                    <td style="font-size:0.75rem;white-space:nowrap;">${thoiGian}</td>
                    <td style="text-align:center;">
                        <button onclick="window.xoaGopY(${g.id})"
                                style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;
                                       padding:3px 8px;border-radius:6px;cursor:pointer;font-size:0.72rem;">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>`;
            }).join("");
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:20px;">Lỗi tải dữ liệu.</td></tr>`;
        }
    }

    window._moRongGopY = function (rowId) {
        const s = document.getElementById(rowId + "_short");
        const f = document.getElementById(rowId + "_full");
        if (s) s.style.display = "none";
        if (f) f.style.display = "inline";
    };
    window._thuGonGopY = function (rowId) {
        const s = document.getElementById(rowId + "_short");
        const f = document.getElementById(rowId + "_full");
        if (f) f.style.display = "none";
        if (s) s.style.display = "inline";
    };

    window.xoaGopY = async function (id) {
        if (!confirm(`Xóa góp ý #${id}? Không thể hoàn tác.`)) return;
        try {
            await window.dbEngine.xoa("gop_y_he_thong", { id });
            window.hienToast("Đã xóa", `Góp ý #${id} đã bị xóa.`, "success");
            _taiDanhSachGopY();
        } catch (e) {
            window.hienToast("Lỗi", "Không xóa được. Kiểm tra RLS hoặc kết nối.", "danger");
        }
    };

    /* Cập nhật bulk bar: đếm số dòng đang tick */
    window._capNhatBulkBar = function () {
        const ticked = document.querySelectorAll(".gy-chk:checked");
        const bar    = document.getElementById("gopYBulkBar");
        const cnt    = document.getElementById("gopYChkCount");
        const chkAll = document.getElementById("gopYChkAll");
        const total  = document.querySelectorAll(".gy-chk").length;
        if (bar)    bar.style.display    = ticked.length > 0 ? "flex" : "none";
        if (cnt)    cnt.textContent       = `Đã chọn ${ticked.length} / ${total} dòng`;
        if (chkAll) chkAll.indeterminate  = ticked.length > 0 && ticked.length < total;
        if (chkAll) chkAll.checked        = ticked.length === total && total > 0;
    };

    /* Tick / bỏ tick toàn bộ */
    window._gopYChkAllToggle = function (chkAll) {
        document.querySelectorAll(".gy-chk").forEach(c => { c.checked = chkAll.checked; });
        window._capNhatBulkBar();
    };

    /* Bỏ chọn hết */
    window._gopYBoChonHet = function () {
        document.querySelectorAll(".gy-chk").forEach(c => { c.checked = false; });
        window._capNhatBulkBar();
    };

    /* Xóa nhiều — xóa song song các ID đang tick */
    window.xoaNhieuGopY = async function () {
        const ticked = [...document.querySelectorAll(".gy-chk:checked")];
        if (ticked.length === 0) return;
        if (!confirm(`Xóa ${ticked.length} góp ý đã chọn? Không thể hoàn tác.`)) return;
        const ids = ticked.map(c => Number(c.value));
        try {
            await Promise.all(ids.map(id => window.dbEngine.xoa("gop_y_he_thong", { id })));
            window.hienToast("Đã xóa", `Xóa thành công ${ids.length} góp ý.`, "success");
            _taiDanhSachGopY();
        } catch (e) {
            window.hienToast("Lỗi", "Một số dòng không xóa được. Kiểm tra RLS.", "danger");
            _taiDanhSachGopY();
        }
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
            // Chỉ dùng nguoi_dung — bảng duy nhất sau migration hợp nhất
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

            // Bản đồ badge vai trò (hỗ trợ cả mô hình cũ lẫn mới)
            const _vaiTroBadge = function(vt) {
                if (vt === "admin")   return '<span class="mv-role-badge-admin">👑 Admin</span>';
                if (vt === "host")    return '<span class="mv-role-badge-host">🏟️ Host (cũ)</span>';
                if (vt === "user")    return '<span class="mv-role-badge-guest">👤 Thành Viên</span>';
                return '<span class="mv-role-badge-guest">👤 Thành Viên</span>';
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
                const hanhDongHTML = `<button class="mv-ql-btn" onclick="window.moModalQuanLyThanhVien('${sdtSafe}')"><i class="fa-solid fa-gear"></i> Quản lý</button>`;

                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td style="color:#64748b;font-size:0.8rem;">${i + 1}</td>
                <td style="font-weight:700;font-size:0.85rem;">${g.ten}</td>
                <td style="text-align:center;">${_vaiTroBadge(g.vai_tro)}</td>
                <td>
                    <a href="https://zalo.me/${g.sdt}" target="_blank"
                        style="font-size:0.82rem;text-decoration:none;color:inherit;">
                        <i class="fa-solid fa-comment" style="color:#00d4ff;"></i> ${g.sdt}
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
        const data    = encoder.encode(plain + SALT);
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
            // Chỉ đọc từ nguoi_dung — bảng duy nhất
            let u = null;
            const ndUsers = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: sdt } });
            if (ndUsers && ndUsers.length > 0) u = ndUsers[0];
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
            <!-- A.3: Wrapper flex-column gap-16px -->
            <div style="display:flex;flex-direction:column;gap:16px;">
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
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="text" id="mvSdtPK" class="mv-input" value="${sdtAttr}" readonly
                                style="background:rgba(30,41,59,0.6);flex:1;cursor:default;">
                            <button class="mv-btn" title="Sao chép SĐT"
                                onclick="navigator.clipboard.writeText(document.getElementById('mvSdtPK').value||'').then(()=>window.hienToast('Đã sao chép 📋','SĐT đã vào clipboard','success')).catch(()=>{})"
                                style="padding:0 10px;height:40px;flex-shrink:0;">
                                <i class="fa-regular fa-copy"></i>
                            </button>
                        </div>
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
                    <div>
                        <label class="mv-label">Telegram / Username</label>
                        <input type="text" id="input-member-telegram" class="mv-input"
                            value="${_mvEsc(u.telegram || '')}" placeholder="@username hoặc link t.me/...">
                    </div>
                </div>
                <button class="mv-btn mv-btn-primary" style="width:100%;"
                    onclick="window._luuThongTinTV('${sdtAttr}')">
                    💾 Lưu thông tin
                </button>
            </div>

            <!-- ── A+: Whitelist & Trust Score ── -->
            <div class="mv-section">
                <div class="mv-section-title">🛡️ Đặc Quyền & Uy Tín</div>
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.85rem;color:#e2e8f0;">
                        <input type="checkbox" id="mvIsWhitelisted" ${u.is_whitelisted ? "checked" : ""}
                            style="width:18px;height:18px;cursor:pointer;accent-color:#00ff88;">
                        <span>⭐ Whitelist (điểm uy tín khóa cứng 100, bypass mọi giới hạn)</span>
                    </label>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <label class="mv-label" style="margin:0;white-space:nowrap;">Điểm uy tín:</label>
                    <input type="number" id="mvDiemUyTin" class="mv-input" style="max-width:100px;"
                        value="${u.diem_uy_tin ?? 100}" min="0" max="100" placeholder="0-100">
                    <span style="font-size:0.75rem;color:#64748b;">(0–100)</span>
                </div>
                <button class="mv-btn mv-btn-primary" style="width:100%;margin-top:10px;"
                    onclick="window._luuUyTinTV('${sdtAttr}')">
                    🛡️ Lưu Whitelist & Điểm Uy Tín
                </button>
            </div>

            <!-- ── B: Đổi vai trò ── -->
            <div class="mv-section">
                <div class="mv-section-title">🎭 Vai Trò &nbsp;<span style="color:#00ff88;font-weight:700;">${vaiTro}</span></div>
                <div class="mv-role-btns">
                    <button class="mv-btn ${(vaiTro === 'user' || vaiTro === 'guest') ? 'mv-btn-active' : ''}"
                        onclick="window._xacNhanDoiVaiTro('${sdtAttr}', 'user')">👤 Thành Viên</button>
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
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="password" id="mvNewPassword" class="mv-input" placeholder="••••••••"
                                style="flex:1;">
                            <button class="mv-btn" title="Sao chép mật khẩu"
                                onclick="navigator.clipboard.writeText(document.getElementById('mvNewPassword').value||'').then(()=>window.hienToast('Đã sao chép 📋','Mật khẩu đã vào clipboard','success')).catch(()=>{})"
                                style="padding:0 10px;height:40px;flex-shrink:0;">
                                <i class="fa-regular fa-copy"></i>
                            </button>
                        </div>
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
                <div class="mv-form-grid" style="margin-bottom:12px;">
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
            </div>
            </div><!-- /.flex-column.gap-16px -->`;

        } catch (e) {
            window.hienToast("Lỗi", "Không thể tải dữ liệu thành viên.", "danger");
            overlay.style.display = "none";
        }
    };

    // A — Lưu thông tin cơ bản (A6: thêm Telegram field)
    window._luuThongTinTV = async function (sdt) {
        const ten      = document.getElementById("mvTenKhach")?.value?.trim();
        const sodu     = document.getElementById("mvSoDu")?.value;
        const fb       = document.getElementById("mvFacebook")?.value?.trim();
        const zalo     = document.getElementById("mvSdtZalo")?.value?.trim();
        const telegram = document.getElementById("input-member-telegram")?.value?.trim();

        const payload = {};
        if (ten      !== undefined) payload.ten_khach     = ten      || null;
        if (sodu     !== undefined) payload.so_du_vi      = Number(sodu) || 0;
        if (fb       !== undefined) payload.facebook_link = fb       || null;
        if (zalo     !== undefined) payload.sdt_zalo      = zalo     || null;
        if (telegram !== undefined) payload.telegram      = telegram || null;

        try {
            await window.dbEngine.ghi("nguoi_dung", payload, { sdt_khach: sdt });
            window.hienToast("Đã lưu ✅", "Thông tin thành viên đã cập nhật.", "success");
            _taiDanhSachKhach();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể lưu: " + (e.message || "").slice(0, 80), "danger");
        }
    };

    // A+ — Lưu whitelist và điểm uy tín
    window._luuUyTinTV = async function (sdt) {
        const isWL  = document.getElementById("mvIsWhitelisted")?.checked ?? false;
        const diem  = Number(document.getElementById("mvDiemUyTin")?.value) || 0;
        const diemCap = Math.min(100, Math.max(0, diem));
        try {
            await window.dbEngine.ghi("nguoi_dung", {
                is_whitelisted: isWL,
                diem_uy_tin:    isWL ? 100 : diemCap
            }, { sdt_khach: sdt });
            window.hienToast("Đã lưu ✅", isWL ? "Tài khoản được whitelist — uy tín khóa 100." : `Điểm uy tín: ${diemCap}`, "success");
            _taiDanhSachKhach();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể cập nhật.", "danger");
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
            // Chỉ dùng nguoi_dung — bảng duy nhất
            await window.dbEngine.ghi("nguoi_dung", { is_active: newActive }, { sdt_khach: sdt });

            window.hienToast(
                `${label} thành công ✅`,
                `Tài khoản ${sdt} ${newActive ? "đã được mở khóa" : "đã bị khóa"}.`,
                newActive ? "success" : "warning"
            );
            _taiDanhSachKhach();
            window.moModalQuanLyThanhVien(sdt);
        } catch (e) {
            window.hienToast("Lỗi", `Không thể ${label.toLowerCase()} tài khoản.`, "danger");
        }
    };

    // E — Xóa tài khoản (kiểm tra SĐT nhập đúng → xóa ở cả 2 bảng)
    window._xoaTV = async function (sdt) {
        const nhapSdt = (document.getElementById("mvXoaConfirmSdt")?.value || "").trim();
        if (nhapSdt !== sdt) {
            window.hienToast("Xác nhận sai", `SĐT nhập vào (${nhapSdt || "rỗng"}) không khớp với ${sdt}.`, "danger");
            return;
        }
        try {
            // Xóa từ nguoi_dung — bảng duy nhất
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
        if (!await window.xacNhanModal("Xóa bài đánh giá này?\nHành động không thể hoàn tác.", '⭐')) return;
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
    function _resetBulkBarDanhGia() {
        const bar = document.getElementById("rvBulkBar");
        if (bar) bar.style.display = "none";
        const ca = document.getElementById("rvChkAll");
        if (ca) ca.checked = false;
    }

    async function _taiDanhSachDanhGia() {
        _resetBulkBarDanhGia();
        const tbody = document.getElementById("adminReviewsBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:16px;color:#64748b;">
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
                tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">
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
                <td style="text-align:center;">
                    <input type="checkbox" class="rv-chk" value="${r.id}"
                           style="cursor:pointer;accent-color:#f87171;"
                           onchange="window._capNhatBulkBarDanhGia()">
                </td>
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
            tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444;text-align:center;padding:20px;">
                <i class="fa-solid fa-circle-exclamation"></i> Lỗi tải đánh giá: ${e.message || e}
            </td></tr>`;
        }
    }

    window._capNhatBulkBarDanhGia = function () {
        const ticked = document.querySelectorAll(".rv-chk:checked");
        const bar    = document.getElementById("rvBulkBar");
        const cnt    = document.getElementById("rvChkCount");
        const ca     = document.getElementById("rvChkAll");
        const total  = document.querySelectorAll(".rv-chk").length;
        if (bar)  bar.style.display   = ticked.length > 0 ? "flex" : "none";
        if (cnt)  cnt.textContent      = `Đã chọn ${ticked.length} / ${total} đánh giá`;
        if (ca)   ca.indeterminate     = ticked.length > 0 && ticked.length < total;
        if (ca)   ca.checked           = ticked.length === total && total > 0;
    };
    window._rvChkAllToggle = function (ca) {
        document.querySelectorAll(".rv-chk").forEach(c => { c.checked = ca.checked; });
        window._capNhatBulkBarDanhGia();
    };
    window._rvBoChonHet = function () {
        document.querySelectorAll(".rv-chk").forEach(c => { c.checked = false; });
        window._capNhatBulkBarDanhGia();
    };
    window.xoaNhieuDanhGia = async function () {
        const ticked = [...document.querySelectorAll(".rv-chk:checked")];
        if (ticked.length === 0) return;
        if (!confirm(`Xóa ${ticked.length} đánh giá đã chọn? Không thể hoàn tác.`)) return;
        const ids = ticked.map(c => c.value);
        try {
            await Promise.all(ids.map(id => window.dbEngine.xoa("danh_gia_tin_dung", { id })));
            window.hienToast("Đã xóa", `Xóa thành công ${ids.length} đánh giá.`, "success");
            _taiDanhSachDanhGia();
        } catch (e) {
            window.hienToast("Lỗi", "Một số đánh giá không xóa được.", "danger");
            _taiDanhSachDanhGia();
        }
    };

    window.xoaDanhGiaAdmin = async function (id) {
        if (!await window.xacNhanModal("Xóa đánh giá này? Hành động không thể hoàn tác.", '⭐')) return;
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
     *   id='popup_chinh'        → nội dung thông báo popup cho khách
     *   id='popup_enabled'      → bật/tắt popup
     *   id='qr_donate'          → link ảnh QR donate
     *   id='tieu_de_donate'     → tiêu đề phía trên QR donate
     *   id='text_donate'        → text mô tả donate
     *   id='text_quang_cao'     → text mô tả landing page
     *   id='telegram_bot_token' → bot token Telegram
     *   id='telegram_chat_id'   → chat ID nhận thông báo
     *   id='logo_url'           → URL ảnh logo trên header
     *   id='favicon_url'        → URL favicon tab trình duyệt
     * ═══════════════════════════════════════════════════ */
    async function _taiThongBao() {
        try {
            const configs   = await window.dbEngine.doc("cau_hinh_he_thong");
            const cfgMap    = {};
            configs.forEach(c => { if (c.id) cfgMap[c.id] = c; });

            _setVal("adminAnnouncementContent",
                cfgMap["popup_chinh"]?.noi_dung_thong_bao || "");
            // C.1: Đọc trạng thái bật/tắt popup
            const popupEnabledEl = document.getElementById("adminPopupEnabled");
            if (popupEnabledEl) {
                popupEnabledEl.checked = cfgMap["popup_enabled"]?.noi_dung_thong_bao === "true";
            }
            // CMS: nội dung động + Telegram
            _setVal("adminQrDonate",      cfgMap["qr_donate"]?.noi_dung_thong_bao        || "");
            _setVal("adminTieuDeDonate",  cfgMap["tieu_de_donate"]?.noi_dung_thong_bao   || "");
            _setVal("adminTextDonate",    cfgMap["text_donate"]?.noi_dung_thong_bao      || "");
            _setVal("adminTextQuangCao",  cfgMap["text_quang_cao"]?.noi_dung_thong_bao   || "");
            _setVal("adminTgBotToken",    cfgMap["telegram_bot_token"]?.noi_dung_thong_bao || "");
            _setVal("adminTgChatId",      cfgMap["telegram_chat_id"]?.noi_dung_thong_bao  || "");
            // Hiện preview QR nếu có URL
            const qrUrl  = cfgMap["qr_donate"]?.noi_dung_thong_bao || "";
            const qrWrap = document.getElementById("qrPreviewWrap");
            const qrImg  = document.getElementById("qrPreviewImg");
            if (qrUrl && qrWrap && qrImg) { qrWrap.style.display = "block"; qrImg.src = qrUrl; }
        } catch (e) {
            console.error("[Admin] Lỗi tải cấu hình:", e);
        }
    }

    window.luuThongBaoAdmin = async function () {
        const content      = document.getElementById("adminAnnouncementContent")?.value?.trim() || "";
        const popupEnabled = document.getElementById("adminPopupEnabled")?.checked ? "true" : "false";
        const qrDonate     = document.getElementById("adminQrDonate")?.value?.trim()      || "";
        const tieuDeDonate = document.getElementById("adminTieuDeDonate")?.value?.trim() || "";
        const textDonate   = document.getElementById("adminTextDonate")?.value?.trim()   || "";
        const textQuangCao = document.getElementById("adminTextQuangCao")?.value?.trim()|| "";
        const tgBotToken   = document.getElementById("adminTgBotToken")?.value?.trim()   || "";
        const tgChatId     = document.getElementById("adminTgChatId")?.value?.trim()     || "";

        const btn = document.getElementById("btnLuuThongBao");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

        // Dùng khoDuLieuVinhVien trực tiếp để tránh mỗi upsert hiện 1 toast lỗi riêng.
        // Tất cả lỗi được bắt tại 1 chỗ duy nhất → chỉ hiện 1 toast.
        if (!window.khoDuLieuVinhVien) {
            window.hienToast("Lỗi", "Chưa kết nối Supabase.", "danger");
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Cấu Hình'; }
            return;
        }
        try {
            const up = (id, val) => window.khoDuLieuVinhVien.upsertData(
                "cau_hinh_he_thong", { id, noi_dung_thong_bao: val }
            );
            await Promise.all([
                up("popup_chinh",       content),
                up("popup_enabled",     popupEnabled),
                up("qr_donate",         qrDonate),
                up("tieu_de_donate",    tieuDeDonate),
                up("text_donate",       textDonate),
                up("text_quang_cao",    textQuangCao),
                up("telegram_bot_token",tgBotToken),
                up("telegram_chat_id",  tgChatId)
            ]);
            window.hienToast("Đã lưu cấu hình ✅", "Cập nhật thành công.", "success");
        } catch (e) {
            window.hienToast("Lỗi lưu cấu hình", "Kiểm tra kết nối Supabase hoặc RLS permissions.", "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Cấu Hình'; }
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

    /* ═══════════════════════════════════════════════════
     * BÁO CÁO — ADMIN QUẢN LÝ
     * ═══════════════════════════════════════════════════ */
    window.adminTaiBaoCao = async function () {
        const tbody = document.getElementById("baoCaoTableBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">Đang tải...</td></tr>`;
        try {
            const [bcList, caList] = await Promise.all([
                window.dbEngine.doc("bao_cao", { order: "created_at.desc" }),
                window.dbEngine.doc("ca_dau").catch(() => [])
            ]);
            const caMap = {};
            caList.forEach(c => { caMap[c.id] = c; });
            if (bcList.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">Chưa có báo cáo nào.</td></tr>`;
                return;
            }
            const loaiLabel = { lua_coc: "Lừa cọc", khong_to_chuc: "Không tổ chức", thong_tin_sai: "TT sai", khac: "Khác" };
            const ttColor = { cho_xu_ly: "#fbbf24", hop_le: "#00ff88", gia_mao: "#ef4444" };
            tbody.innerHTML = bcList.map(b => {
                const ca = caMap[b.id_ca_dau] || {};
                const ngay = b.created_at ? new Date(b.created_at).toLocaleDateString("vi-VN") : "--";
                const frozen = ca.is_frozen ? `<span style="color:#ef4444;font-size:0.7rem;"> 🔒Đóng băng</span>` : "";
                return `<tr>
                    <td style="font-size:0.75rem;color:#94a3b8;">${ngay}</td>
                    <td style="font-size:0.78rem;">${ca.ten_san || b.id_ca_dau?.slice(0,8) || "--"}${frozen}</td>
                    <td style="font-size:0.78rem;">${b.sdt_nguoi_bao_cao || "--"}</td>
                    <td style="font-size:0.78rem;color:#fca5a5;">${b.sdt_bi_bao_cao || "--"}</td>
                    <td><span style="font-size:0.7rem;padding:2px 6px;background:rgba(251,191,36,0.1);border-radius:4px;">${loaiLabel[b.loai_bao_cao] || b.loai_bao_cao}</span></td>
                    <td><span style="color:${ttColor[b.trang_thai]||'#94a3b8'};font-size:0.75rem;font-weight:700;">${b.trang_thai}</span></td>
                    <td style="display:flex;gap:4px;flex-wrap:wrap;">
                        <button class="btn-mini btn-mini-red" onclick="window.adminPhatBC('${b.id}','${(b.sdt_nguoi_bao_cao||'').replace(/'/g,"\\'")}','${(b.sdt_bi_bao_cao||'').replace(/'/g,"\\'")}','${b.id_ca_dau||''}')">⚡ Phạt</button>
                        <button class="btn-mini btn-mini-cyan" onclick="window.adminThaBC('${b.id}','${(b.sdt_nguoi_bao_cao||'').replace(/'/g,"\\'")}')">✅ Tha</button>
                        ${ca.is_frozen ? `<button class="btn-mini" onclick="window.adminKhoiPhucCa('${b.id_ca_dau||''}','${b.id}')">🔓 Mở ca</button>` : ""}
                    </td>
                </tr>`;
            }).join("");
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444;padding:20px;">Lỗi tải dữ liệu.</td></tr>`;
        }
    };

    window.adminPhatBC = async function (bcId, sdtBaoCao, sdtBiBaoCao, idCaDau) {
        if (!confirm(`Xác nhận PHẠT báo cáo này?\n- BAN ${sdtBiBaoCao} (host bị báo)\n- Thêm fingerprint vào blacklist`)) return;
        try {
            await window.dbEngine.ghi("nguoi_dung", { is_active: false }, { sdt_khach: sdtBiBaoCao });
            await window.dbEngine.ghi("bao_cao", { trang_thai: "hop_le" }, { id: bcId });
            if (idCaDau) await window.dbEngine.ghi("ca_dau", { is_frozen: true }, { id: idCaDau });
            window.hienToast("Đã xử lý ✅", `Host ${sdtBiBaoCao} bị khóa.`, "success");
            window.adminTaiBaoCao();
        } catch (e) { window.hienToast("Lỗi", "Không thể xử lý.", "danger"); }
    };

    window.adminThaBC = async function (bcId, sdtNguoiBaoCao) {
        if (!confirm(`Phạt gậy ngược — Báo cáo giả mạo?\n→ BAN vĩnh viễn + fingerprint blacklist: ${sdtNguoiBaoCao}`)) return;
        try {
            await window.dbEngine.ghi("bao_cao", { trang_thai: "gia_mao" }, { id: bcId });
            const users = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: sdtNguoiBaoCao } });
            const u = (users||[])[0];
            if (u && !u.is_whitelisted) {
                // BAN vĩnh viễn + trừ điểm về 0
                await window.dbEngine.ghi("nguoi_dung", { is_active: false, diem_uy_tin: 0 }, { sdt_khach: sdtNguoiBaoCao });
                // Thêm fingerprint vào blacklist nếu có
                if (u.device_fingerprint) {
                    await window.dbEngine.ghi("fingerprint_blacklist", {
                        fingerprint_id: u.device_fingerprint,
                        ly_do: `Báo cáo giả mạo — BAN bởi Admin. SĐT: ${sdtNguoiBaoCao}`
                    }, null);
                }
            }
            window.hienToast("Phạt gậy ngược ✅", `BAN vĩnh viễn + fingerprint blacklist: ${sdtNguoiBaoCao}.`, "success");
            window.adminTaiBaoCao();
        } catch (e) { window.hienToast("Lỗi", "Không thể xử lý.", "danger"); }
    };

    window.adminKhoiPhucCa = async function (idCaDau, bcId) {
        try {
            await window.dbEngine.ghi("ca_dau", { is_frozen: false }, { id: idCaDau });
            await window.dbEngine.ghi("bao_cao", { trang_thai: "gia_mao" }, { id: bcId });
            window.hienToast("Đã khôi phục ca ✅", "Ca đấu hiện lại trên trang chủ.", "success");
            window.adminTaiBaoCao();
        } catch (e) { window.hienToast("Lỗi", "Không thể khôi phục.", "danger"); }
    };

    console.log("⚡ [Phân Hệ Admin v4.0]: members ✅ | cadau ✅ | reviews ✅ | config-cms ✅ | telegram ✅ | gopy ✅");
})();
