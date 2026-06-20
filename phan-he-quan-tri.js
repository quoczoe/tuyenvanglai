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
        // adminConsole là flex container (flex-direction:column) trong flex layout
        const co = document.getElementById("adminConsole");
        if (co) co.style.display = "flex";
        // Hiện nút Đăng Xuất trên header
        const btnLogout = document.getElementById("btnHeaderLogout");
        if (btnLogout) btnLogout.style.display = "inline-flex";
        // Khôi phục tab từ URL hash nếu có, mặc định "guests"
        const hashTab   = (location.hash || "").replace("#tab-", "");
        const validTabs = ["guests", "reviews", "config", "stats", "cadau", "gopy", "baocao"];
        window.chuyenTabAdmin(validTabs.includes(hashTab) ? hashTab : "guests");
        // Load metrics top dashboard ngay sau khi console hiện
        setTimeout(_loadMetrics, 200);
        // Fit table height sau khi layout ổn định
        setTimeout(window._fitTable, 50);
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
        // Ẩn nút Đăng Xuất trên header
        const btnLogout = document.getElementById("btnHeaderLogout");
        if (btnLogout) btnLogout.style.display = "none";
        window.hienToast("Đã đăng xuất", "Phiên Admin đã kết thúc an toàn.", "info");
        _hienManLogin();
    };

    /* ═══════════════════════════════════════════════════
     * 2B. TÍNH TOÁN CHIỀU CAO BẢNG (chống dual-scroll)
     * Đặt max-height cho table-responsive bằng chiều cao còn lại sau khi
     * trừ sticky-top và các phần tử trên/dưới bảng trong tab hiện tại.
     * ═══════════════════════════════════════════════════ */
    window._fitTable = function () {
        try {
            const activeTab = document.querySelector(".ad-tab-content.active");
            if (!activeTab) return;
            const tr = activeTab.querySelector(".table-responsive");
            if (!tr) return; // tab config/stats không có bảng

            // Chiều cao khả dụng của tab-content (flex:1 trong adminConsole)
            const tabH = activeTab.clientHeight || activeTab.offsetHeight;
            if (!tabH) return;

            // Phần tử chứa table: ad-table-wrap hoặc chính table-responsive
            const tableWrap = tr.closest(".ad-table-wrap") || tr;

            // Đo chiều cao phần TRÊN bảng trong tab
            let aboveH = 0;
            let sibling = activeTab.firstElementChild;
            while (sibling && sibling !== tableWrap) {
                aboveH += sibling.offsetHeight;
                const sStyle = getComputedStyle(sibling);
                aboveH += parseFloat(sStyle.marginTop || 0) + parseFloat(sStyle.marginBottom || 0);
                sibling = sibling.nextElementSibling;
            }

            // Đo chiều cao phần DƯỚI bảng trong tab (pagination, etc.)
            let belowH = 0;
            let nextEl = tableWrap.nextElementSibling;
            while (nextEl) {
                belowH += nextEl.offsetHeight;
                const nStyle = getComputedStyle(nextEl);
                belowH += parseFloat(nStyle.marginTop || 0) + parseFloat(nStyle.marginBottom || 0);
                nextEl = nextEl.nextElementSibling;
            }

            // Padding của tab-content
            const cs = getComputedStyle(activeTab);
            const padV = parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0);

            const maxH = Math.max(150, Math.floor(tabH - aboveH - belowH - padV));
            tr.style.maxHeight = maxH + "px";
        } catch (_) { /* silent */ }
    };

    // Fit lại khi resize (debounced)
    let _fitTimer = null;
    window.addEventListener("resize", function () {
        clearTimeout(_fitTimer);
        _fitTimer = setTimeout(window._fitTable, 120);
    });

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

        // Sau khi tab và dữ liệu đã render, fit chiều cao bảng
        setTimeout(window._fitTable, 80);
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

    function _capNhatMetric(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = typeof val === "number" ? val.toLocaleString("vi-VN") : (val ?? "--");
    }

    /* ═══════════════════════════════════════════════════
     * 4B. CA ĐẤU — ADMIN QUẢN LÝ TOÀN HỆ THỐNG
     * ═══════════════════════════════════════════════════ */

    // ── State CA ĐẤU ──
    let _allCaDauAdmin    = [];
    let _userMapCaDau     = {}; // sdt → ten_khach (người đăng)
    let _datSlotCountMap  = {};
    let _editingCaId      = null;
    let _sortCaDauCol     = "ngay_danh";
    let _sortCaDauDir     = "desc";
    let _pageSizeCaDau    = 20;
    let _pageNumCaDau     = 1;
    let _lastFilteredCaDau= [];
    let _filterCaDauLoai  = "all";

    // Cắt giờ:phút từ HH:MM:SS
    function _fGio(raw) { return raw ? String(raw).substring(0, 5) : "--:--"; }

    // Định dạng khu vực: Quận/Tỉnh
    function _fKhuVuc(tinh, quan) {
        if (!tinh && !quan) return "—";
        if (!quan) return tinh;
        // Rút gọn tên tỉnh phổ biến
        const tinhRutGon = (tinh || "")
            .replace("Thành phố", "TP.").replace("thành phố", "TP.")
            .replace("Tỉnh ", "").replace("tỉnh ", "");
        return `${quan} / ${tinhRutGon}`;
    }

    async function _taiDanhSachCaDauAdmin() {
        const tbody = document.getElementById("adminCaDauBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:28px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu ca đấu...</td></tr>`;
        try {
            const [caDauList, users, datSlots] = await Promise.all([
                window.dbEngine.doc("ca_dau"),
                window.dbEngine.doc("nguoi_dung").catch(() => []),
                window.dbEngine.doc("dat_slot").catch(() => [])
            ]);

            // Map sdt → tên người đăng
            _userMapCaDau = {};
            (users || []).forEach(u => { if (u.sdt_khach) _userMapCaDau[u.sdt_khach] = u.ten_khach || u.sdt_khach; });

            // Map id_ca_dau → số khách
            _datSlotCountMap = {};
            (datSlots || []).forEach(s => {
                if (s.trang_thai_di_danh !== "Khách hủy")
                    _datSlotCountMap[s.id_ca_dau] = (_datSlotCountMap[s.id_ca_dau] || 0) + 1;
            });

            // Gán seqID theo ngày tạo
            caDauList.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
            caDauList.forEach((c, i) => { c._seqId = i + 1; });
            // Sort mặc định: ngày đánh mới nhất trước
            caDauList.sort((a, b) => new Date(b.ngay_danh || 0) - new Date(a.ngay_danh || 0));
            _allCaDauAdmin = caDauList;
            _apDungSortFilterCaDau();
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:28px;color:#ef4444;">
                <i class="fa-solid fa-triangle-exclamation"></i> Lỗi tải dữ liệu: ${_escHtml(e.message || "Không rõ")}</td></tr>`;
        }
    }

    function _apDungSortFilterCaDau() {
        const q     = (document.getElementById("adminCaDauSearch")?.value || "").toLowerCase();
        const today = new Date().toISOString().split("T")[0];

        let list = _allCaDauAdmin.filter(c => {
            if (_filterCaDauLoai === "open"   && c.da_chot_ca) return false;
            if (_filterCaDauLoai === "closed" && !c.da_chot_ca) return false;
            if (_filterCaDauLoai === "today"  && c.ngay_danh !== today) return false;
            if (q) {
                const nguoiDang = (_userMapCaDau[c.sdt_nguoi_tao] || c.sdt_nguoi_tao || "").toLowerCase();
                return (c.ten_san || "").toLowerCase().includes(q)
                    || (c.tinh_thanh || "").toLowerCase().includes(q)
                    || (c.quan_huyen || "").toLowerCase().includes(q)
                    || nguoiDang.includes(q)
                    || (c.id || "").toLowerCase().includes(q);
            }
            return true;
        });

        // Sắp xếp
        const col = _sortCaDauCol;
        const dir = _sortCaDauDir === "asc" ? 1 : -1;
        list.sort((a, b) => {
            let va = col === "ngay_danh" ? new Date(a.ngay_danh || 0).getTime()
                   : col === "_seqId"   ? (a._seqId || 0)
                   : a[col];
            let vb = col === "ngay_danh" ? new Date(b.ngay_danh || 0).getTime()
                   : col === "_seqId"   ? (b._seqId || 0)
                   : b[col];
            if (typeof va === "string") return dir * va.localeCompare(vb, "vi");
            return dir * ((va > vb ? 1 : va < vb ? -1 : 0));
        });

        _lastFilteredCaDau = list;
        _pageNumCaDau = 1;
        _renderCaDauVoiPhanTrang();
        _capNhatMetric("metricOpenCaDau", list.filter(c => !c.da_chot_ca).length);

        const cols = ["ngay_danh","_seqId","ten_san","soKhach","da_chot_ca","gia_nam"];
        cols.forEach(c => {
            const el = document.getElementById(`sortIconCa_${c}`);
            if (!el) return;
            el.textContent = c === col ? (dir === 1 ? "↑" : "↓") : "↕";
            el.style.color  = c === col ? "#00ff88" : "#64748b";
        });
    }

    function _renderCaDauVoiPhanTrang() {
        const total    = _lastFilteredCaDau.length;
        const from     = (_pageNumCaDau - 1) * _pageSizeCaDau;
        const to       = Math.min(from + _pageSizeCaDau, total);
        _renderCaDauAdmin(_lastFilteredCaDau.slice(from, to));
        setTimeout(window._fitTable, 0);

        // Thanh phân trang
        const bar = document.getElementById("caDauPaginationBar");
        if (!bar) return;
        const totalPages = Math.max(1, Math.ceil(total / _pageSizeCaDau));
        if (totalPages <= 1) { bar.innerHTML = ""; return; }
        const f = from + 1, t = Math.min(to, total);
        bar.innerHTML = `
            <span style="font-size:0.78rem;color:#94a3b8;">${f}–${t} / ${total} ca đấu</span>
            <div style="display:flex;gap:4px;">
                <button class="ad-btn-ghost" style="padding:4px 10px;font-size:0.78rem;"
                    ${_pageNumCaDau<=1?"disabled style='opacity:.4'":""}
                    onclick="window._caDauChuyenTrang(${_pageNumCaDau-1})">‹ Trước</button>
                <span style="font-size:0.78rem;color:#e2e8f0;padding:0 8px;white-space:nowrap;">Trang ${_pageNumCaDau}/${totalPages}</span>
                <button class="ad-btn-ghost" style="padding:4px 10px;font-size:0.78rem;"
                    ${_pageNumCaDau>=totalPages?"disabled style='opacity:.4'":""}
                    onclick="window._caDauChuyenTrang(${_pageNumCaDau+1})">Sau ›</button>
            </div>`;
    }
    window._caDauChuyenTrang = function(p) {
        _pageNumCaDau = Math.max(1, Math.min(p, Math.ceil(_lastFilteredCaDau.length/_pageSizeCaDau)));
        _renderCaDauVoiPhanTrang();
    };
    window._caDauDoiSoTrang = function(n) { _pageSizeCaDau = parseInt(n)||20; _pageNumCaDau=1; _renderCaDauVoiPhanTrang(); };
    window._sortCaDau = function(col) {
        _sortCaDauDir = (_sortCaDauCol === col && _sortCaDauDir === "desc") ? "asc" : "desc";
        _sortCaDauCol = col;
        _apDungSortFilterCaDau();
    };

    function _renderCaDauAdmin(list) {
        const tbody = document.getElementById("adminCaDauBody");
        if (!tbody) return;
        const _vnd = n => (window.formatTienK ? window.formatTienK(n) : (n||0).toLocaleString("vi-VN") + "K");

        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:32px;color:#64748b;">
                <i class="fa-solid fa-calendar-xmark" style="font-size:1.5rem;display:block;margin-bottom:8px;"></i>
                Không tìm thấy ca đấu nào.</td></tr>`;
            document.getElementById("caDauBulkBar").style.display = "none";
            return;
        }

        tbody.innerHTML = list.map(c => {
            const cId      = _escHtml(c.id);
            const tenSan   = _escHtml(c.ten_san || "—");
            const nguoiDang= _escHtml(_userMapCaDau[c.sdt_nguoi_tao] || c.sdt_nguoi_tao || "—");
            const khuVuc   = _escHtml(_fKhuVuc(c.tinh_thanh, c.quan_huyen));
            const soKhach  = _datSlotCountMap[c.id] || 0;
            const ngay     = c.ngay_danh ? _fNgayGio(c.ngay_danh).split(" ")[0] : "—";
            const gioBD    = _fGio(c.gio_bat_dau);
            const gioKT    = _fGio(c.gio_ket_thuc);
            const trangThai = c.da_chot_ca
                ? `<span style="font-size:0.72rem;background:rgba(100,116,139,0.15);color:#94a3b8;padding:2px 8px;border-radius:10px;font-weight:700;white-space:nowrap;"><i class="fa-solid fa-lock" style="font-size:0.6em;"></i> Đã chốt</span>`
                : `<span style="font-size:0.72rem;background:rgba(0,255,136,0.1);color:#00ff88;padding:2px 8px;border-radius:10px;font-weight:700;white-space:nowrap;"><i class="fa-solid fa-circle" style="font-size:0.5em;"></i> Đang mở</span>`;

            return `<tr>
                <td style="text-align:center;">
                    <input type="checkbox" class="ca-chk" data-id="${cId}"
                        style="cursor:pointer;accent-color:#f87171;"
                        onchange="window._caDauCapNhatBulk()">
                </td>
                <td style="font-family:monospace;font-size:0.75rem;color:#64748b;" title="${cId}">${c._seqId || "—"}</td>
                <td>
                    <div style="position:relative;display:inline-block;">
                        <button class="btn-mini" style="padding:4px 8px;gap:4px;"
                            onclick="window._toggleCaMenu(this,'${cId}')">
                            <i class="fa-solid fa-ellipsis-vertical"></i>
                        </button>
                        <div class="ca-action-menu" data-caid="${cId}" style="display:none;position:absolute;left:0;top:100%;z-index:300;
                            background:#1a2844;border:1px solid rgba(0,255,136,0.2);border-radius:8px;padding:4px;
                            box-shadow:0 8px 24px rgba(0,0,0,0.4);min-width:130px;">
                            <button onclick="window.suaCaDauAdmin('${cId}');window._closeCaMenus();"
                                style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;background:none;border:none;color:#60a5fa;font-size:0.8rem;cursor:pointer;border-radius:5px;font-family:inherit;"
                                onmouseover="this.style.background='rgba(96,165,250,0.1)'" onmouseout="this.style.background='none'">
                                <i class="fa-solid fa-pen-to-square"></i> Sửa ca
                            </button>
                            ${c.da_chot_ca
                                ? `<button onclick="window.moChocCaDauAdmin('${cId}',false);window._closeCaMenus();"
                                    style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;background:none;border:none;color:#fb923c;font-size:0.8rem;cursor:pointer;border-radius:5px;font-family:inherit;"
                                    onmouseover="this.style.background='rgba(251,146,60,0.1)'" onmouseout="this.style.background='none'">
                                    <i class="fa-solid fa-lock-open"></i> Mở lại
                                </button>`
                                : `<button onclick="window.moChocCaDauAdmin('${cId}',true);window._closeCaMenus();"
                                    style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;background:none;border:none;color:#94a3b8;font-size:0.8rem;cursor:pointer;border-radius:5px;font-family:inherit;"
                                    onmouseover="this.style.background='rgba(100,116,139,0.1)'" onmouseout="this.style.background='none'">
                                    <i class="fa-solid fa-lock"></i> Chốt ca
                                </button>`}
                            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:3px 0;">
                            <button onclick="window.xoaCaDauAdmin('${cId}','${tenSan}');window._closeCaMenus();"
                                style="display:flex;align-items:center;gap:8px;width:100%;padding:6px 10px;background:none;border:none;color:#f87171;font-size:0.8rem;cursor:pointer;border-radius:5px;font-family:inherit;"
                                onmouseover="this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.background='none'">
                                <i class="fa-solid fa-trash-can"></i> Xóa
                            </button>
                        </div>
                    </div>
                </td>
                <td style="font-weight:600;white-space:nowrap;">${tenSan}</td>
                <td style="font-size:0.8rem;white-space:nowrap;">
                    ${c.sdt_nguoi_tao
                        ? `<a href="#" onclick="event.preventDefault();window.moModalQuanLyThanhVien('${_escHtml(c.sdt_nguoi_tao)}')"
                               style="color:#60a5fa;text-decoration:none;" title="Ấn để quản lý tài khoản này">${nguoiDang}</a>`
                        : `<span style="color:#64748b;">${nguoiDang}</span>`}
                </td>
                <td style="font-size:0.78rem;color:#9ca3af;white-space:nowrap;">${khuVuc}</td>
                <td style="white-space:nowrap;font-size:0.8rem;">${ngay}</td>
                <td style="font-size:0.78rem;color:#94a3b8;white-space:nowrap;">${gioBD}–${gioKT}</td>
                <td><span style="background:rgba(99,102,241,0.15);color:#a78bfa;padding:2px 8px;border-radius:10px;font-size:0.8rem;font-weight:700;">${soKhach}</span></td>
                <td>${trangThai}</td>
                <td style="font-size:0.75rem;text-align:left;">
                    <div style="white-space:nowrap;">Nam: <span style="color:#00ff88;font-weight:600;">${_vnd(c.gia_nam)}</span></div>
                    <div style="white-space:nowrap;">Nữ: <span style="color:#f472b6;font-weight:600;">${_vnd(c.gia_nu)}</span></div>
                </td>
            </tr>`;
        }).join("");
    }

    // Toggle dropdown hành động ca đấu — dùng position:fixed để không bị clip bởi table-responsive
    window._toggleCaMenu = function(btn, caId) {
        window._closeCaMenus();
        const menu = document.querySelector(`.ca-action-menu[data-caid="${caId}"]`);
        if (!menu) return;

        // Tính vị trí viewport của nút
        const rect = btn.getBoundingClientRect();
        menu.style.position   = "fixed";
        menu.style.left       = rect.left + "px";
        menu.style.top        = (rect.bottom + 3) + "px";
        menu.style.zIndex     = "9500";
        menu.style.display    = "block";
        menu.style.minWidth   = "140px";

        // Điều chỉnh nếu tràn phải / tràn dưới
        requestAnimationFrame(function() {
            const mr = menu.getBoundingClientRect();
            if (mr.right > window.innerWidth - 8) {
                menu.style.left = (rect.right - mr.width) + "px";
            }
            if (mr.bottom > window.innerHeight - 8) {
                menu.style.top = (rect.top - mr.height - 3) + "px";
            }
        });

        // Đóng khi click ngoài
        function _handler(e) {
            if (!btn.contains(e.target) && !menu.contains(e.target)) {
                window._closeCaMenus();
                document.removeEventListener("click", _handler, true);
            }
        }
        // setTimeout để tránh đóng ngay lập tức do sự kiện click hiện tại
        setTimeout(function() {
            document.addEventListener("click", _handler, true);
        }, 10);

        // Đóng khi cuộn bảng (vì dùng fixed nên vị trí lệch khi scroll)
        const tbl = document.querySelector("#adminTab_cadau .table-responsive");
        if (tbl && !tbl._caMenuScrollBound) {
            tbl._caMenuScrollBound = true;
            tbl.addEventListener("scroll", function() { window._closeCaMenus(); });
        }
    };
    window._closeCaMenus = function() {
        document.querySelectorAll(".ca-action-menu").forEach(function(m) {
            m.style.display   = "none";
            m.style.position  = "absolute";
            m.style.left      = "0";
            m.style.top       = "100%";
            m.style.zIndex    = "300";
        });
    };

    // Bulk select CA ĐẤU
    window._caDauCapNhatBulk = function() {
        const checked = document.querySelectorAll("#adminCaDauBody .ca-chk:checked");
        const bar = document.getElementById("caDauBulkBar");
        const cnt = document.getElementById("caDauBulkCount");
        if (bar) bar.style.display = checked.length > 0 ? "flex" : "none";
        if (cnt) cnt.textContent = `Đã chọn ${checked.length} ca đấu`;
    };
    window._caDauChonTatCa = function(chk) {
        document.querySelectorAll("#adminCaDauBody .ca-chk").forEach(c => c.checked = chk);
        window._caDauCapNhatBulk();
    };
    window._caDauBoChonHet = function() {
        document.querySelectorAll("#adminCaDauBody .ca-chk").forEach(c => c.checked = false);
        const all = document.getElementById("caDauChkAll"); if (all) all.checked = false;
        window._caDauCapNhatBulk();
    };

    // Xóa nhiều ca đấu
    window.xoaNhieuCaDauAdmin = async function() {
        const ids = Array.from(document.querySelectorAll("#adminCaDauBody .ca-chk:checked")).map(c => c.dataset.id);
        if (!ids.length) return;
        if (!confirm(`Xác nhận xóa vĩnh viễn ${ids.length} ca đấu?\nHành động này KHÔNG THỂ hoàn tác.`)) return;
        let ok = 0, fail = 0;
        for (const id of ids) {
            try { await window.dbEngine.xoa("ca_dau", { id }); ok++; } catch { fail++; }
        }
        window.hienToast(ok>0?"Đã Xóa ✅":"Thất Bại ❌", `Đã xóa ${ok} ca đấu.${fail>0?` ${fail} thất bại.`:""}`, ok>0?"success":"danger");
        window._caDauBoChonHet();
        _taiDanhSachCaDauAdmin();
    };

    window.locCaDauAdmin = function () { _apDungSortFilterCaDau(); };

    window.locCaDauTheoTrangThai = function (loai, btnEl) {
        document.querySelectorAll("#adminTab_cadau .ad-pill").forEach(b => b.classList.remove("active"));
        if (btnEl) btnEl.classList.add("active");
        _filterCaDauLoai = loai;
        _apDungSortFilterCaDau();
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

            // Người đăng: ưu tiên sdt_nguoi_tao → tìm tên từ _userMapCaDau
            const nguoiDangSdt = c.sdt_nguoi_tao || c.ma_key_host || "";
            const nguoiDangTen = _userMapCaDau[nguoiDangSdt] || nguoiDangSdt || "—";

            body.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:8px;margin-bottom:4px;cursor:pointer;"
                     onclick="${nguoiDangSdt ? `window.moModalQuanLyThanhVien('${_escHtml(nguoiDangSdt)}')` : ''}">
                    <i class="fa-solid fa-user" style="color:#60a5fa;"></i>
                    <div>
                        <div style="font-size:0.78rem;color:#64748b;">Người Đăng (ấn để quản lý)</div>
                        <div style="font-weight:700;color:#60a5fa;">${_escHtml(nguoiDangTen)}</div>
                        <div style="font-size:0.72rem;color:#64748b;font-family:monospace;">${_escHtml(nguoiDangSdt)}</div>
                    </div>
                    <i class="fa-solid fa-arrow-right" style="color:#60a5fa;margin-left:auto;font-size:0.8rem;"></i>
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
    const _LOAI_COLOR = {
        "Lỗi/Bug":       { bg:"rgba(239,68,68,0.15)",   color:"#f87171" },
        "Ý tưởng mới":   { bg:"rgba(234,179,8,0.15)",   color:"#facc15" },
        "Giao diện/UX":  { bg:"rgba(168,85,247,0.15)",  color:"#c084fc" },
        "Khác":          { bg:"rgba(148,163,184,0.12)", color:"#94a3b8" },
    };

    let _gopYAllData  = [];
    let _gopYFiltered = [];
    let _gopYPage     = 1;
    let _gopYPerPage  = 10;
    let _gopYSortCol  = "created_at";
    let _gopYSortDir  = "desc";

    function _resetBulkBar() {
        const bar = document.getElementById("gopYBulkBar");
        if (bar) bar.style.display = "none";
        const chkAll = document.getElementById("gopYChkAll");
        if (chkAll) chkAll.checked = false;
    }

    /* Tải toàn bộ data từ DB, lưu vào _gopYAllData rồi render */
    window._taiDanhSachGopY = async function _taiDanhSachGopY() {
        _resetBulkBar();
        const tbody = document.getElementById("adminGopyBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;
        const list = await window.dbEngine.docThu("gop_y_he_thong", { order: "created_at.desc" });
        if (list === null) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#f87171;">
                ⚠️ Không tải được dữ liệu. Kiểm tra RLS policy hoặc kết nối mạng.
                <br><button onclick="window._taiDanhSachGopY()" style="margin-top:8px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);color:#f87171;padding:4px 14px;border-radius:6px;cursor:pointer;font-size:0.82rem;">Thử lại</button>
                </td></tr>`;
            return;
        }
        // Gán _rank cố định theo id tăng dần (nhỏ nhất = cũ nhất = _rank 1)
        const sorted = [...list].sort((a, b) => (a.id || 0) - (b.id || 0));
        sorted.forEach((g, i) => { g._rank = i + 1; });
        _gopYAllData = list;
        _gopYPage    = 1;
        window._gopYApplyFilter();
    };

    /* Hàm so sánh dùng tham số tường minh — không dùng closure để tránh bug */
    function _gopYCompare(a, b, col, dir) {
        let va, vb;
        if (col === "id") {
            va = a._rank || 0; vb = b._rank || 0;
        } else {
            va = a[col] ?? ""; vb = b[col] ?? "";
        }
        if (typeof va === "string") { va = va.toLowerCase(); vb = String(vb).toLowerCase(); }
        if (va < vb) return dir === "asc" ? -1 : 1;
        if (va > vb) return dir === "asc" ?  1 : -1;
        return 0;
    }

    /* Chỉ sắp xếp _gopYFiltered theo trạng thái sort hiện tại rồi render */
    function _gopYDoSort() {
        const col = _gopYSortCol;
        const dir = _gopYSortDir;
        _gopYFiltered.sort((a, b) => _gopYCompare(a, b, col, dir));
    }

    /* Lọc từ _gopYAllData → sort → render */
    window._gopYApplyFilter = function () {
        const kw   = (document.getElementById("gopYSearch")?.value || "").trim().toLowerCase();
        const loai = document.getElementById("gopYFilterLoai")?.value || "";
        const sao  = document.getElementById("gopYFilterSao")?.value || "";

        _gopYFiltered = _gopYAllData.filter(g => {
            if (loai && g.loai_gop_y !== loai) return false;
            if (sao  && String(g.so_sao) !== sao) return false;
            if (kw) {
                const hay = `${g.ten_user || ""} ${g.noi_dung || ""}`.toLowerCase();
                if (!hay.includes(kw)) return false;
            }
            return true;
        });

        _gopYDoSort();
        _gopYPage = 1;
        _gopYRenderPage();
    };

    /* Đổi cột / chiều sắp xếp — chỉ re-sort _gopYFiltered, không filter lại */
    window._gopYSort = function (col) {
        if (_gopYSortCol === col) {
            _gopYSortDir = _gopYSortDir === "asc" ? "desc" : "asc";
        } else {
            _gopYSortCol = col;
            _gopYSortDir = col === "created_at" ? "desc" : "asc";
        }
        _gopYDoSort();
        _gopYPage = 1;
        _gopYRenderPage();
    };

    window._gopYResetFilter = function () {
        ["gopYSearch","gopYFilterLoai","gopYFilterSao"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        window._gopYApplyFilter();
    };

    window._gopYPrevPage = function () {
        if (_gopYPage > 1) { _gopYPage--; _gopYRenderPage(); }
    };
    window._gopYNextPage = function () {
        if (_gopYPage < Math.ceil(_gopYFiltered.length / _gopYPerPage)) { _gopYPage++; _gopYRenderPage(); }
    };
    window._gopYSetPerPage = function () {
        _gopYPerPage = Number(document.getElementById("gopYPerPage")?.value || 10);
        _gopYPage    = 1;
        _gopYRenderPage();
    };

    /* Render slice của trang hiện tại */
    function _gopYRenderPage() {
        const tbody = document.getElementById("adminGopyBody");
        if (!tbody) return;
        _resetBulkBar();

        const total      = _gopYFiltered.length;
        const start      = (_gopYPage - 1) * _gopYPerPage;
        const end        = Math.min(start + _gopYPerPage, total);
        const page       = _gopYFiltered.slice(start, end);
        const totalPages = Math.max(1, Math.ceil(total / _gopYPerPage));

        const pageInfo = document.getElementById("gopYPageInfo");
        const pageNum  = document.getElementById("gopYPageNum");
        const prevBtn  = document.getElementById("gopYPrevBtn");
        const nextBtn  = document.getElementById("gopYNextBtn");
        if (pageInfo) pageInfo.textContent = total > 0 ? `${start + 1}–${end} / ${total} góp ý` : "0 góp ý";
        if (pageNum)  pageNum.textContent  = `Trang ${_gopYPage} / ${totalPages}`;
        if (prevBtn)  prevBtn.disabled     = _gopYPage <= 1;
        if (nextBtn)  nextBtn.disabled     = _gopYPage >= totalPages;

        document.querySelectorAll(".gy-sort-th").forEach(th => {
            const col   = th.dataset.sort;
            const arrow = th.querySelector(".gy-arr");
            if (!arrow) return;
            arrow.textContent = col === _gopYSortCol ? (_gopYSortDir === "asc" ? " ↑" : " ↓") : " ↕";
            arrow.style.opacity = col === _gopYSortCol ? "1" : "0.35";
        });

        if (page.length === 0) {
            const msg = _gopYAllData.length === 0 ? "Chưa có góp ý nào." : "Không tìm thấy kết quả phù hợp.";
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:#64748b;">${msg}</td></tr>`;
            return;
        }

        const _stars = n => {
            const f = n || 0;
            return `<span style="color:#fbbf24;letter-spacing:1px;">${"★".repeat(f)}</span><span style="color:rgba(255,255,255,0.18);letter-spacing:1px;">${"★".repeat(5 - f)}</span><span style="color:#9ca3af;font-size:0.7rem;margin-left:3px;">${f}/5</span>`;
        };

        tbody.innerHTML = page.map((g, i) => {
            const stt   = g._rank ?? (start + i + 1);
            const loai  = g.loai_gop_y || "Khác";
            const lc    = _LOAI_COLOR[loai] || { bg:"rgba(34,211,238,0.1)", color:"#22d3ee" };
            const nd    = g.noi_dung || "";
            const rowId = `gy_${g.id}`;

            let thoiGian = "—";
            if (g.created_at) {
                const d = new Date(g.created_at);
                thoiGian = `${d.toLocaleDateString("vi-VN")} ${d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}`;
            }

            const sdtSafe = _escHtml(g.sdt_user || "");
            const tenHtml = sdtSafe
                ? `<span style="cursor:pointer;color:#60a5fa;text-decoration:underline;text-underline-offset:2px;" onclick="window.moModalQuanLyThanhVien('${sdtSafe}')" title="Xem thông tin user">${_escHtml(g.ten_user||"Ẩn danh")}</span>`
                : `<span style="color:#e2e8f0;">${_escHtml(g.ten_user||"Ẩn danh")}</span>`;

            let ndHtml;
            if (!nd) {
                ndHtml = `<span style="color:#475569;font-style:italic;font-size:0.8rem;">—</span>`;
            } else {
                const esc = _escHtml(nd);
                if (nd.length <= 55) {
                    ndHtml = `<span style="color:#cbd5e1;font-size:0.82rem;">${esc}</span>`;
                } else {
                    ndHtml = `<span id="${rowId}_s" style="display:block;color:#cbd5e1;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc}</span>
                              <span id="${rowId}_f" style="display:none;color:#cbd5e1;font-size:0.82rem;white-space:pre-wrap;word-break:break-word;">${esc}</span>
                              <button id="${rowId}_btn" onclick="window._moRongGopY('${rowId}')" style="background:none;border:none;color:#60a5fa;font-size:0.72rem;cursor:pointer;padding:2px 0;">Xem thêm ▼</button>`;
                }
            }

            return `<tr>
                <td style="text-align:center;padding:6px 4px;">
                    <input type="checkbox" class="gy-chk" value="${g.id}" style="cursor:pointer;accent-color:#f87171;" onchange="window._capNhatBulkBar()">
                </td>
                <td style="text-align:center;color:#64748b;font-size:0.78rem;padding:6px 4px;">${stt}</td>
                <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tenHtml}</td>
                <td style="white-space:nowrap;">${_stars(g.so_sao)}</td>
                <td><span style="background:${lc.bg};color:${lc.color};padding:2px 8px;border-radius:10px;font-size:0.73rem;white-space:nowrap;">${_escHtml(loai)}</span></td>
                <td style="max-width:220px;">${ndHtml}</td>
                <td style="font-size:0.75rem;white-space:nowrap;color:#94a3b8;">${thoiGian}</td>
                <td style="text-align:center;white-space:nowrap;">${_gopYBadge(g.trang_thai)}</td>
                <td style="text-align:center;white-space:nowrap;">
                    <button onclick="window._moModalPhanHoiGopY(${g.id})" title="Xử lý / phản hồi góp ý" style="background:rgba(96,165,250,0.14);border:1px solid rgba(96,165,250,0.35);color:#60a5fa;padding:3px 8px;border-radius:6px;cursor:pointer;font-size:0.72rem;margin-right:4px;">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="window.xoaGopY(${g.id})" title="Xóa góp ý" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;padding:3px 8px;border-radius:6px;cursor:pointer;font-size:0.72rem;">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>`;
        }).join("");

        setTimeout(window._fitTable, 0);
    }

    /* ── Trạng thái góp ý: nhãn + màu badge ── */
    const _GOPY_TT = {
        cho_xu_ly:      { nhan: "Chờ xử lý",      color: "#94a3b8", bg: "rgba(148,163,184,0.14)", border: "rgba(148,163,184,0.4)" },
        dang_thuc_hien: { nhan: "Đang thực hiện", color: "#60a5fa", bg: "rgba(96,165,250,0.14)",  border: "rgba(96,165,250,0.4)" },
        da_xong:        { nhan: "Đã xong",        color: "#4ade80", bg: "rgba(74,222,128,0.14)",  border: "rgba(74,222,128,0.4)" },
        tu_choi:        { nhan: "Từ chối",        color: "#f87171", bg: "rgba(248,113,113,0.14)", border: "rgba(248,113,113,0.4)" }
    };
    function _gopYBadge(tt) {
        const c = _GOPY_TT[tt] || _GOPY_TT.cho_xu_ly;
        return `<span style="display:inline-block;background:${c.bg};color:${c.color};border:1px solid ${c.border};padding:2px 9px;border-radius:10px;font-size:0.72rem;font-weight:600;white-space:nowrap;">${c.nhan}</span>`;
    }

    /* ── Modal Xử lý / Phản hồi góp ý (dựng động, inline-style vì admin không nạp giao-dien.css) ── */
    window._moModalPhanHoiGopY = function (id) {
        const g = _gopYAllData.find(x => String(x.id) === String(id));
        if (!g) { window.hienToast("Lỗi", "Không tìm thấy góp ý.", "danger"); return; }
        document.getElementById("phgyOverlay")?.remove();

        const tt   = g.trang_thai || "cho_xu_ly";
        const ph   = g.noi_dung_phan_hoi || "";
        const opts = ["cho_xu_ly","dang_thuc_hien","da_xong","tu_choi"]
            .map(k => `<option value="${k}"${k === tt ? " selected" : ""}>${_GOPY_TT[k].nhan}</option>`).join("");
        const ndGoc = _escHtml(g.noi_dung || "(không có nội dung)");

        const ov = document.createElement("div");
        ov.id = "phgyOverlay";
        ov.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;";
        ov.onclick = e => { if (e.target === ov) window._dongModalPhanHoiGopY(); };
        ov.innerHTML = `
          <div style="width:100%;max-width:460px;background:#0d1525;border:1px solid #1e3a5f;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.6);overflow:hidden;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
            <div style="padding:16px 20px;border-bottom:1px solid #1e3a5f;display:flex;align-items:center;gap:10px;">
              <i class="fa-solid fa-pen-to-square" style="color:#60a5fa;"></i>
              <span style="font-weight:700;color:#e2e8f0;font-size:1rem;">Xử lý góp ý #${g.id}</span>
            </div>
            <div style="padding:18px 20px;">
              <div style="font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">Nội dung góp ý</div>
              <div style="background:rgba(255,255,255,0.04);border:1px solid #1e3a5f;border-radius:8px;padding:10px 12px;color:#cbd5e1;font-size:0.85rem;max-height:120px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin-bottom:16px;">${ndGoc}</div>

              <label style="display:block;font-size:0.78rem;font-weight:600;color:#94a3b8;margin-bottom:6px;">Trạng thái xử lý</label>
              <select id="phgySelect" style="width:100%;background:#132033;border:1px solid #1e3a5f;border-radius:8px;color:#e2e8f0;font-size:0.9rem;padding:9px 11px;margin-bottom:16px;cursor:pointer;">${opts}</select>

              <label style="display:block;font-size:0.78rem;font-weight:600;color:#94a3b8;margin-bottom:6px;">Lời nhắn phản hồi (gửi kèm tới người dùng)</label>
              <textarea id="phgyText" rows="4" placeholder="Nhập lời nhắn... vd: Đã sửa lỗi bạn báo, cảm ơn góp ý!" style="width:100%;background:#132033;border:1px solid #1e3a5f;border-radius:8px;color:#e2e8f0;font-size:0.88rem;padding:10px 12px;resize:vertical;font-family:inherit;box-sizing:border-box;">${_escHtml(ph)}</textarea>
              <div style="font-size:0.72rem;color:#64748b;margin-top:6px;">
                <i class="fa-solid fa-bell" style="color:#fbbf24;"></i>
                🔔 Mọi thay đổi trạng thái xử lý sẽ lập tức kích hoạt chuông 🔔 của người gửi kèm lời nhắn.
              </div>
            </div>
            <div style="padding:14px 20px;border-top:1px solid #1e3a5f;display:flex;gap:10px;justify-content:flex-end;">
              <button onclick="window._dongModalPhanHoiGopY()" style="background:rgba(255,255,255,0.06);border:1px solid #334155;color:#94a3b8;padding:9px 16px;border-radius:8px;cursor:pointer;font-size:0.85rem;font-family:inherit;">Hủy</button>
              <button id="phgyConfirmBtn" onclick="window._xacNhanPhanHoiGopY(${g.id})" style="background:linear-gradient(135deg,#3b82f6,#60a5fa);border:none;color:#fff;padding:9px 18px;border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:700;font-family:inherit;">Xác nhận</button>
            </div>
          </div>`;
        document.body.appendChild(ov);
    };

    window._dongModalPhanHoiGopY = function () {
        document.getElementById("phgyOverlay")?.remove();
    };

    let _phgyBusy = false;
    window._xacNhanPhanHoiGopY = async function (id) {
        if (_phgyBusy) return;
        const tt   = document.getElementById("phgySelect")?.value || "cho_xu_ly";
        const phan = (document.getElementById("phgyText")?.value || "").trim();
        const btn  = document.getElementById("phgyConfirmBtn");
        if (!window._sbClient) { window.hienToast("Lỗi", "Chưa kết nối Supabase (đăng nhập lại).", "danger"); return; }

        _phgyBusy = true;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
        try {
            const { data, error } = await window._sbClient.rpc("admin_phan_hoi_gop_y", {
                p_gop_y_id: id,
                p_trang_thai: tt,
                p_noi_dung_phan_hoi: phan || null
            });
            if (error) throw error;
            const st = (data && data.status) || "";
            if (st !== "ok") {
                const lyDo = st === "khong_ton_tai" ? "Góp ý không còn tồn tại."
                          : st === "trang_thai_khong_hop_le" ? "Trạng thái không hợp lệ."
                          : "Không cập nhật được. Hãy chắc chắn đã chạy migration-gopy-phanhoi-v1.sql.";
                window.hienToast("Thất bại", lyDo, "danger");
                return;
            }
            // Cập nhật local + render
            const row = _gopYAllData.find(x => String(x.id) === String(id));
            if (row) { row.trang_thai = tt; row.noi_dung_phan_hoi = phan || null; }
            window._gopYApplyFilter();
            const extra = data.da_gui_tb ? " · đã bắn thông báo 🔔 cho người gửi." : "";
            window.hienToast("Đã cập nhật ✅", `Trạng thái: ${_GOPY_TT[tt].nhan}${extra}`, "success");
            window._dongModalPhanHoiGopY();
        } catch (e) {
            window.hienToast("Lỗi", "Không gọi được RPC. Kiểm tra migration-gopy-phanhoi-v1.sql đã chạy chưa.", "danger");
        } finally {
            _phgyBusy = false;
            if (btn) { btn.disabled = false; btn.innerHTML = "Xác nhận"; }
        }
    };

    window._moRongGopY = function (rowId) {
        document.getElementById(rowId + "_s")?.style.setProperty("display", "none");
        document.getElementById(rowId + "_f")?.style.setProperty("display", "block");
        const btn = document.getElementById(rowId + "_btn");
        if (btn) { btn.textContent = "Thu gọn ▲"; btn.onclick = () => window._thuGonGopY(rowId); }
    };
    window._thuGonGopY = function (rowId) {
        document.getElementById(rowId + "_s")?.style.setProperty("display", "block");
        document.getElementById(rowId + "_f")?.style.setProperty("display", "none");
        const btn = document.getElementById(rowId + "_btn");
        if (btn) { btn.textContent = "Xem thêm ▼"; btn.onclick = () => window._moRongGopY(rowId); }
    };

    window.xoaGopY = async function (id) {
        if (!confirm(`Xóa góp ý #${id}? Không thể hoàn tác.`)) return;
        try {
            await window.dbEngine.xoa("gop_y_he_thong", { id });
            window.hienToast("Đã xóa", `Góp ý #${id} đã bị xóa.`, "success");
            _gopYAllData = _gopYAllData.filter(g => g.id !== id);
            window._gopYApplyFilter();
        } catch (e) {
            window.hienToast("Xóa thất bại", "Không thể xóa. Kiểm tra kết nối mạng và thử lại.", "danger");
        }
    };

    window._capNhatBulkBar = function () {
        const ticked = document.querySelectorAll(".gy-chk:checked");
        const bar    = document.getElementById("gopYBulkBar");
        const cnt    = document.getElementById("gopYChkCount");
        const chkAll = document.getElementById("gopYChkAll");
        const total  = document.querySelectorAll(".gy-chk").length;
        if (bar)    bar.style.display    = ticked.length > 0 ? "flex" : "none";
        if (cnt)    cnt.textContent      = `Đã chọn ${ticked.length} / ${total} dòng trang này`;
        if (chkAll) chkAll.indeterminate = ticked.length > 0 && ticked.length < total;
        if (chkAll) chkAll.checked       = ticked.length === total && total > 0;
    };

    window._gopYChkAllToggle = function (chkAll) {
        document.querySelectorAll(".gy-chk").forEach(c => { c.checked = chkAll.checked; });
        window._capNhatBulkBar();
    };

    window._gopYBoChonHet = function () {
        document.querySelectorAll(".gy-chk").forEach(c => { c.checked = false; });
        window._capNhatBulkBar();
    };

    window.xoaNhieuGopY = async function () {
        const ticked = [...document.querySelectorAll(".gy-chk:checked")];
        if (ticked.length === 0) return;
        if (!confirm(`Xóa ${ticked.length} góp ý đã chọn? Không thể hoàn tác.`)) return;
        const ids = ticked.map(c => Number(c.value));
        try {
            await Promise.all(ids.map(id => window.dbEngine.xoa("gop_y_he_thong", { id })));
            window.hienToast("Đã xóa", `Xóa thành công ${ids.length} góp ý.`, "success");
            _gopYAllData = _gopYAllData.filter(g => !ids.includes(g.id));
            window._gopYApplyFilter();
        } catch (e) {
            window.hienToast("Xóa không hoàn toàn", "Một số góp ý không thể xóa — kiểm tra kết nối.", "danger");
            window._taiDanhSachGopY();
        }
    };

    /* ═══════════════════════════════════════════════════
     * 6. QUẢN LÝ THÀNH VIÊN — v2.0
     * + Sắp xếp theo từng cột, bộ lọc vai trò/tình trạng
     * + Cột: Ca Đăng | Ca Tham Gia | Điểm Uy Tín | Tình Trạng | Thiết Bị
     * + Tạo tài khoản test hàng loạt
     * ═══════════════════════════════════════════════════ */
    let _allKhachData   = [];  // toàn bộ data sau khi load
    let _sortKhachCol   = "ngayTG";
    let _sortKhachDir   = "desc"; // "asc" | "desc"
    const ADMIN_GOC_SDT = "0961446003"; // Admin gốc — bất khả xâm phạm

    // Trust score → badge định dạng "Điểm - Trạng thái"
    function _trustBadge(diem) {
        const d = diem ?? 100;
        if (d >= 80) return `<span style="font-size:0.8rem;font-weight:700;color:#00ff88;white-space:nowrap;">${d} <span style="color:#64748b;">—</span> Tốt</span>`;
        if (d >= 60) return `<span style="font-size:0.8rem;font-weight:700;color:#fbbf24;white-space:nowrap;">${d} <span style="color:#64748b;">—</span> Cảnh báo</span>`;
        if (d >= 40) return `<span style="font-size:0.8rem;font-weight:700;color:#fb923c;white-space:nowrap;">${d} <span style="color:#64748b;">—</span> Rủi ro</span>`;
        return `<span style="font-size:0.8rem;font-weight:700;color:#ef4444;white-space:nowrap;">${d} <span style="color:#64748b;">—</span> Nguy hiểm</span>`;
    }

    function _vaiTroBadge(vt) {
        if (vt === "admin") return '<span style="font-size:0.72rem;background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);padding:2px 8px;border-radius:10px;font-weight:700;">👑 Admin</span>';
        return '<span style="font-size:0.72rem;background:rgba(96,165,250,0.1);color:#60a5fa;border:1px solid rgba(96,165,250,0.2);padding:2px 8px;border-radius:10px;font-weight:600;">👤 Thành Viên</span>';
    }

    function _tinhTrangBadge(isActive) {
        return isActive !== false
            ? '<span style="font-size:0.72rem;background:rgba(0,255,136,0.1);color:#00ff88;border:1px solid rgba(0,255,136,0.25);padding:2px 8px;border-radius:10px;font-weight:600;"><i class="fa-solid fa-circle" style="font-size:0.5em;margin-right:4px;"></i>Hoạt động</span>'
            : '<span style="font-size:0.72rem;background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.25);padding:2px 8px;border-radius:10px;font-weight:600;"><i class="fa-solid fa-lock" style="font-size:0.65em;margin-right:4px;"></i>Bị khóa</span>';
    }

    async function _taiDanhSachKhach() {
        const tbody = document.getElementById("adminGuestsBody");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="15" style="text-align:center;padding:20px;color:#64748b;">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;
        try {
            const [datSlots, khachVL, caDau, allDanhGia] = await Promise.all([
                window.dbEngine.doc("dat_slot"),
                window.dbEngine.doc("nguoi_dung"),
                window.dbEngine.doc("ca_dau"),
                window.dbEngine.doc("danh_gia_tin_dung")
            ]);

            // reviewMap: sdt → { saoArr, danhGia }
            reviewMap = {};
            (allDanhGia || []).forEach(r => {
                const sdt = r.sdt_nguoi_bi_danh_gia;
                if (!sdt) return;
                if (!reviewMap[sdt]) reviewMap[sdt] = { saoArr: [], danhGia: [] };
                reviewMap[sdt].saoArr.push(r.so_sao);
                reviewMap[sdt].danhGia.push(r);
            });

            // Map ca_dau
            const mapCaDau = new Map();
            caDau.forEach(s => mapCaDau.set(s.id, s));

            // Map sdt → tổng hợp
            const map = new Map();
            khachVL.forEach(u => {
                const sdt = u.sdt_khach || "";
                if (!sdt) return;
                if (u.ma_gioi_thieu === "HOST_AO") return;   // Ẩn host ẢO (ca đấu seed) khỏi DS thành viên + không tính count
                map.set(sdt, {
                    ten:            u.ten_khach || "Ẩn danh",
                    sdt,
                    gmail:          u.gmail || u.email || "",   // Gmail thành viên (đồng bộ từ Supabase)
                    ngayTG:         u.created_at || u.ngay_tham_gia || null,
                    vai_tro:        u.vai_tro || "guest",
                    isActive:       u.is_active !== false,
                    diemUyTin:      u.diem_uy_tin ?? 100,
                    deviceFp:       u.device_fingerprint || null,
                    caDang:         0,
                    caTG:           0,
                    tongChi:        0,
                    _fromNguoiDung: true  // flag: có record trong bảng nguoi_dung
                });
            });

            // Đếm Ca đã đăng (ca_dau.sdt_nguoi_tao = sdt)
            caDau.forEach(c => {
                const sdt = c.sdt_nguoi_tao || "";
                if (sdt && map.has(sdt)) map.get(sdt).caDang++;
            });

            // Đếm Ca tham gia + tổng chi từ dat_slot
            // Chỉ cộng stats cho user đã tồn tại trong map (từ nguoi_dung)
            // KHÔNG tạo virtual entry — tránh user đã xóa vẫn xuất hiện trong danh sách
            datSlots.forEach(slot => {
                const sdt = slot.sdt_khach || "";
                const ca  = mapCaDau.get(slot.id_ca_dau);
                if (!sdt || !ca || !map.has(sdt)) return;
                if (ca.da_chot_ca === true && slot.trang_thai_di_danh === "Đã tham gia") {
                    const info = map.get(sdt);
                    info.caTG++;
                    const gia = slot.gioi_tinh === "female" ? (ca.gia_nu || 0) : (ca.gia_nam || 0);
                    info.tongChi += gia;
                }
            });

            // Gán memberID theo thứ tự tạo tài khoản — admin gốc luôn = 1
            const allArr = Array.from(map.values());
            allArr.sort((a, b) => {
                if (a.sdt === ADMIN_GOC_SDT) return -1;
                if (b.sdt === ADMIN_GOC_SDT) return 1;
                return (a.ngayTG ? new Date(a.ngayTG).getTime() : 0) - (b.ngayTG ? new Date(b.ngayTG).getTime() : 0);
            });
            allArr.forEach((u, i) => { u.memberID = i + 1; });
            _allKhachData = allArr;
            _st("adminGuestCount", `${_allKhachData.length} thành viên`);
            _capNhatMetric("metricTotalMembers", _allKhachData.length);
            _ganEventListenerFilter(); // gắn event listeners khi tab hiện và data sẵn sàng
            _apDungSortFilter();
        } catch (e) {
            console.error("[Admin] Lỗi tải thành viên:", e);
            tbody.innerHTML = `<tr><td colspan="15" style="color:#ef4444;text-align:center;padding:16px;">
                Lỗi: ${_escHtml(e.message || String(e))}</td></tr>`;
        }
    }

    let _pageSizeTK  = 20;   // số dòng mỗi trang
    let _pageNumTK   = 1;    // trang hiện tại
    let _lastFiltered = [];   // kết quả sau filter (trước phân trang)

    function _apDungSortFilter() {
        try {
            if (!_allKhachData || !_allKhachData.length) return; // chưa load xong data

            const q          = (document.getElementById("adminGuestSearch")?.value || "").toLowerCase().trim();
            const fVaiTro    = document.getElementById("filterVaiTro")?.value    || "";
            const fTinhTrang = document.getElementById("filterTinhTrang")?.value || "";

            // Tách admin gốc ra khỏi luồng filter/sort — luôn ghim đầu tiên
            const adminGoc = _allKhachData.find(g => g.sdt === ADMIN_GOC_SDT);
            const phannConLai = _allKhachData.filter(g => g.sdt !== ADMIN_GOC_SDT);

            // Lọc tài khoản thường
            let list = phannConLai.filter(g => {
                if (q && !(g.ten.toLowerCase().includes(q) || g.sdt.includes(q))) return false;
                if (fVaiTro && g.vai_tro !== fVaiTro) return false;
                if (fTinhTrang === "active" && g.isActive !== true)  return false;
                if (fTinhTrang === "locked" && g.isActive !== false) return false;
                return true;
            });

            // Sắp xếp các tài khoản còn lại
            const col = _sortKhachCol;
            const dir = _sortKhachDir === "asc" ? 1 : -1;
            list.sort((a, b) => {
                let va = a[col], vb = b[col];
                if (col === "ngayTG") {
                    va = va ? new Date(va).getTime() : 0;
                    vb = vb ? new Date(vb).getTime() : 0;
                }
                va = (va === null || va === undefined) ? (typeof vb === "number" ? -Infinity : "") : va;
                vb = (vb === null || vb === undefined) ? (typeof va === "number" ? -Infinity : "") : vb;
                if (typeof va === "string") return dir * va.localeCompare(vb, "vi");
                return dir * ((va > vb ? 1 : va < vb ? -1 : 0));
            });

            // Nếu admin gốc khớp filter (hoặc không có filter vai trò/trạng thái), ghim lên đầu
            if (adminGoc) {
                const gocPhuHop = (
                    (!q || (adminGoc.ten.toLowerCase().includes(q) || adminGoc.sdt.includes(q))) &&
                    (!fVaiTro || adminGoc.vai_tro === fVaiTro) &&
                    (fTinhTrang !== "locked" || adminGoc.isActive === false) &&
                    (fTinhTrang !== "active" || adminGoc.isActive === true)
                );
                if (gocPhuHop) list = [adminGoc, ...list];
            }

            _lastFiltered = list;
            _pageNumTK = 1; // reset về trang 1 khi filter thay đổi
            _renderKhachVoiPhanTrang();

            // Cập nhật sort icons
            ["ngayTG","caDang","caTG","tongChi","diemUyTin","isActive","vai_tro","ten","sao","memberID"].forEach(c => {
                const el = document.getElementById(`sortIcon_${c}`);
                if (!el) return;
                el.textContent = c === col ? (dir === 1 ? "↑" : "↓") : "↕";
                el.style.color = c === col ? "#00ff88" : "#64748b";
            });

            // Hiện thị kết quả filter
            const countEl = document.getElementById("adminGuestCount");
            if (countEl) countEl.textContent = `${list.length}/${_allKhachData.length} thành viên`;

        } catch (err) {
            console.error("[Admin] Lỗi bộ lọc:", err);
        }
    }

    function _renderKhachVoiPhanTrang() {
        const total    = _lastFiltered.length;
        const pageSize = _pageSizeTK;
        const from     = (_pageNumTK - 1) * pageSize;
        const to       = Math.min(from + pageSize, total);
        const pageData = _lastFiltered.slice(from, to);

        _renderKhachAdmin(pageData);
        _renderPaginationTV(total, pageSize);
        // Fit bảng sau khi render xong
        setTimeout(window._fitTable, 0);
    }

    function _renderPaginationTV(total, pageSize) {
        const container = document.getElementById("tvPaginationBar");
        if (!container) return;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (totalPages <= 1) { container.innerHTML = ""; return; }

        const from = (_pageNumTK - 1) * pageSize + 1;
        const to   = Math.min(_pageNumTK * pageSize, total);

        container.innerHTML = `
            <span style="font-size:0.78rem;color:#94a3b8;">${from}–${to} / ${total} thành viên</span>
            <div style="display:flex;gap:4px;align-items:center;">
                <button class="ad-btn-ghost" style="padding:4px 10px;font-size:0.78rem;"
                    ${_pageNumTK <= 1 ? "disabled style='opacity:.4'" : ""}
                    onclick="window._tvChuyenTrang(${_pageNumTK - 1})">‹ Trước</button>
                <span style="font-size:0.78rem;color:#e2e8f0;padding:0 8px;white-space:nowrap;">
                    Trang ${_pageNumTK} / ${totalPages}
                </span>
                <button class="ad-btn-ghost" style="padding:4px 10px;font-size:0.78rem;"
                    ${_pageNumTK >= totalPages ? "disabled style='opacity:.4'" : ""}
                    onclick="window._tvChuyenTrang(${_pageNumTK + 1})">Sau ›</button>
            </div>`;
    }

    window._tvChuyenTrang = function(page) {
        const totalPages = Math.ceil(_lastFiltered.length / _pageSizeTK);
        _pageNumTK = Math.max(1, Math.min(page, totalPages));
        _renderKhachVoiPhanTrang();
        document.getElementById("adminGuestsBody")?.closest(".table-responsive")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    window._tvDoiSoTrang = function(n) {
        _pageSizeTK = parseInt(n) || 20;
        _pageNumTK  = 1;
        _renderKhachVoiPhanTrang();
    };

    // Re-export rõ ràng để HTML gọi được
    window.locKhachAdmin       = function() { _apDungSortFilter(); };
    window.adminLamMoiThanhVien = function() { _pageNumTK=1; _taiDanhSachKhach(); };

    // Gắn event listener sau khi tab guests được hiện (gọi từ _taiDanhSachKhach)
    function _ganEventListenerFilter() {
        const ids = ["adminGuestSearch", "filterVaiTro", "filterTinhTrang"];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el || el.dataset.listenerGan) return;
            el.addEventListener("input",  () => _apDungSortFilter());
            el.addEventListener("change", () => _apDungSortFilter());
            el.dataset.listenerGan = "1"; // đánh dấu đã gán, không gán lại
        });
    }

    window._sortKhach = function(col) {
        if (_sortKhachCol === col) {
            _sortKhachDir = _sortKhachDir === "asc" ? "desc" : "asc";
        } else {
            _sortKhachCol = col;
            _sortKhachDir = "desc";
        }
        _apDungSortFilter();
    };

    // Format ngày + giờ: dd/mm/yyyy HH:MM
    function _fNgayGio(raw) {
        if (!raw) return "--";
        const d = new Date(raw);
        if (isNaN(d)) return "--";
        const dd   = String(d.getDate()).padStart(2, "0");
        const mm   = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = d.getFullYear();
        const hh   = String(d.getHours()).padStart(2, "0");
        const mi   = String(d.getMinutes()).padStart(2, "0");
        return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
    }

    // Checkbox bulk select helpers
    window._tvChonTatCa = function(checked) {
        document.querySelectorAll("#adminGuestsBody .tv-chk").forEach(c => { c.checked = checked; });
        _tvCapNhatBulkBar();
    };
    window._tvBoChonHet = function() {
        document.querySelectorAll("#adminGuestsBody .tv-chk").forEach(c => { c.checked = false; });
        const all = document.getElementById("tvChkAll"); if (all) all.checked = false;
        _tvCapNhatBulkBar();
    };
    function _tvCapNhatBulkBar() {
        const checked = document.querySelectorAll("#adminGuestsBody .tv-chk:checked");
        const bar = document.getElementById("tvBulkBar");
        const cnt = document.getElementById("tvBulkCount");
        if (bar) bar.style.display = checked.length > 0 ? "flex" : "none";
        if (cnt) cnt.textContent = `Đã chọn ${checked.length} tài khoản`;
    }

    function _renderKhachAdmin(list) {
        const tbody = document.getElementById("adminGuestsBody");
        if (!tbody) return;

        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="15" style="text-align:center;padding:32px;color:#64748b;">
                <i class="fa-solid fa-users-slash" style="font-size:1.5rem;display:block;margin-bottom:8px;"></i>
                Không tìm thấy thành viên nào phù hợp bộ lọc.</td></tr>`;
            document.getElementById("tvBulkBar").style.display = "none";
            return;
        }

        tbody.innerHTML = "";
        list.forEach((g) => {
            const sdtSafe   = _escHtml(g.sdt);
            const tenSafe   = _escHtml(g.ten);
            const isGoc     = g.sdt === ADMIN_GOC_SDT; // admin gốc — bất khả xâm phạm
            const rv        = reviewMap[g.sdt];
            const tb        = rv && rv.saoArr.length
                ? (rv.saoArr.reduce((a,b)=>a+b,0)/rv.saoArr.length).toFixed(1)
                : null;

            const saoCellHTML = tb
                ? `<span style="color:#fbbf24;font-weight:700;white-space:nowrap;">${tb}⭐<br><span style="font-size:0.68rem;color:#9ca3af;">(${rv.saoArr.length} lượt)</span></span>`
                : `<span style="color:#4b5563;font-size:0.75rem;">—</span>`;

            const fpShort = g.deviceFp ? g.deviceFp.substring(0, 10) + "…" : "—";
            const deviceCell = g.deviceFp
                ? `<div style="display:flex;align-items:center;gap:5px;justify-content:center;">
                       <span style="font-family:monospace;font-size:0.68rem;color:#64748b;" title="${_escHtml(g.deviceFp)}">${_escHtml(fpShort)}</span>
                       <button class="btn-mini" style="background:rgba(239,68,68,0.08);color:#f87171;border:1px solid rgba(239,68,68,0.2);flex-shrink:0;padding:2px 6px;"
                           onclick="window.xoaFingerprintTV('${sdtSafe}')">
                           <i class="fa-solid fa-trash-can"></i>
                       </button>
                   </div>`
                : `<span style="color:#374151;font-size:0.75rem;">—</span>`;

            // Nút thao tác — admin gốc không có nút sửa/xóa
            const hanhDong = isGoc
                ? `<span style="font-size:0.7rem;color:#fbbf24;" title="Admin gốc — không thể chỉnh sửa">🔱 Gốc</span>`
                : `<button class="mv-ql-btn" onclick="window.moModalQuanLyThanhVien('${sdtSafe}')">
                       <i class="fa-solid fa-gear"></i>
                   </button>`;

            // Checkbox — admin gốc không có checkbox
            const chkCell = isGoc
                ? `<span style="font-size:0.75rem;color:#64748b;">—</span>`
                : `<input type="checkbox" class="tv-chk" data-sdt="${sdtSafe}"
                       style="cursor:pointer;accent-color:#f87171;"
                       onchange="(function(){
                           const all = document.getElementById('tvChkAll');
                           const chks = document.querySelectorAll('#adminGuestsBody .tv-chk');
                           const checked = document.querySelectorAll('#adminGuestsBody .tv-chk:checked');
                           if(all) all.checked = chks.length===checked.length;
                           const bar = document.getElementById('tvBulkBar');
                           const cnt = document.getElementById('tvBulkCount');
                           if(bar) bar.style.display = checked.length>0?'flex':'none';
                           if(cnt) cnt.textContent = 'Đã chọn '+checked.length+' tài khoản';
                       })()">`;

            const tr = document.createElement("tr");
            if (isGoc) tr.style.background = "rgba(245,158,11,0.04)";
            tr.dataset.sdt = g.sdt;
            tr.innerHTML = `
                <td>${chkCell}</td>
                <td style="font-weight:800;font-size:0.85rem;color:${isGoc ? '#fbbf24' : '#94a3b8'};">${g.memberID}</td>
                <td>${hanhDong}</td>
                <td style="font-weight:700;font-size:0.85rem;white-space:nowrap;">${tenSafe}${isGoc ? ' <span title="Admin gốc bất khả xâm phạm" style="color:#fbbf24;">👑</span>' : ''}</td>
                <td style="white-space:nowrap;">${_vaiTroBadge(g.vai_tro)}</td>
                <td>
                    <a href="https://zalo.me/${g.sdt}" target="_blank"
                       style="font-size:0.8rem;text-decoration:none;color:#60a5fa;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;">
                        <i class="fa-solid fa-comment" style="color:#00d4ff;flex-shrink:0;"></i>${g.sdt}
                    </a>
                </td>
                <td style="font-size:0.78rem;white-space:nowrap;">${
                    g.gmail
                        ? `<a href="mailto:${_escHtml(g.gmail)}" style="text-decoration:none;color:#fbbf24;display:inline-flex;align-items:center;gap:4px;" title="${_escHtml(g.gmail)}">
                               <i class="fa-regular fa-envelope" style="color:#f59e0b;flex-shrink:0;"></i>${_escHtml(g.gmail)}
                           </a>`
                        : `<span style="color:#4b5563;">—</span>`
                }</td>
                <td style="font-weight:700;color:#a78bfa;">${g.caDang}</td>
                <td style="font-weight:700;color:#00ff88;">${g.caTG}</td>
                <td style="white-space:nowrap;">${_fVND(g.tongChi)}</td>
                <td>${_trustBadge(g.diemUyTin)}</td>
                <td>${saoCellHTML}</td>
                <td style="white-space:nowrap;">${_tinhTrangBadge(g.isActive)}</td>
                <td>${deviceCell}</td>
                <td style="text-align:right;font-size:0.75rem;color:#64748b;white-space:nowrap;">${_fNgayGio(g.ngayTG)}</td>`;
            tbody.appendChild(tr);
        });
    }

    // Xóa device fingerprint binding — cho phép đăng nhập lại từ thiết bị khác (dùng để test)
    window.xoaFingerprintTV = async function(sdt) {
        if (!confirm(`Xóa binding thiết bị của ${sdt}?\nSau đó tài khoản có thể đăng nhập từ thiết bị bất kỳ.`)) return;
        try {
            await window.dbEngine.ghi("nguoi_dung", { device_fingerprint: null }, { sdt_khach: sdt });
            window.hienToast("Đã xóa", "Binding thiết bị đã được xóa.", "success");
            _taiDanhSachKhach();
        } catch(e) {
            window.hienToast("Lỗi", e.message || "Không thể xóa.", "danger");
        }
    };

    // Tạo tài khoản test hàng loạt
    // Số thứ tự bằng chữ tiếng Việt
    const _CHU_SO_VI = ["MỘT","HAI","BA","BỐN","NĂM","SÁU","BẢY","TÁM","CHÍN","MƯỜI",
        "MƯỜI MỘT","MƯỜI HAI","MƯỜI BA","MƯỜI BỐN","MƯỜI LĂM","MƯỜI SÁU","MƯỜI BẢY","MƯỜI TÁM","MƯỜI CHÍN","HAI MƯƠI",
        "HAI MƯƠI MỐT","HAI MƯƠI HAI","HAI MƯƠI BA","HAI MƯƠI BỐN","HAI MƯƠI LĂM","HAI MƯƠI SÁU","HAI MƯƠI BẢY","HAI MƯƠI TÁM","HAI MƯƠI CHÍN","BA MƯƠI",
        "BA MƯƠI MỐT","BA MƯƠI HAI","BA MƯƠI BA","BA MƯƠI BỐN","BA MƯƠI LĂM","BA MƯƠI SÁU","BA MƯƠI BẢY","BA MƯƠI TÁM","BA MƯƠI CHÍN","BỐN MƯƠI",
        "BỐN MƯƠI MỐT","BỐN MƯƠI HAI","BỐN MƯƠI BA","BỐN MƯƠI BỐN","BỐN MƯƠI LĂM","BỐN MƯƠI SÁU","BỐN MƯƠI BẢY","BỐN MƯƠI TÁM","BỐN MƯƠI CHÍN","NĂM MƯƠI"];

    window.moModalTaoTaiKhoanTest = function() {
        const existing = document.getElementById("modalTaoTestOverlay");
        if (existing) { existing.style.display = "flex"; return; }
        const box = document.createElement("div");
        box.id = "modalTaoTestOverlay";
        box.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;";
        box.innerHTML = `
            <div style="background:#1a2844;border:1px solid rgba(0,255,136,0.3);border-radius:16px;padding:28px 24px;max-width:420px;width:100%;">
                <div style="font-size:1.05rem;font-weight:800;color:#00ff88;margin-bottom:10px;">🧪 Tạo Tài Khoản Demo Hàng Loạt</div>
                <div style="color:#9ca3af;font-size:0.82rem;margin-bottom:16px;line-height:1.5;">
                    Tạo tài khoản với SĐT ngẫu nhiên 10 số.<br>
                    <strong style="color:#e2e8f0;">Mật khẩu mặc định = chính SĐT của tài khoản đó</strong> (dễ đăng nhập test).<br>
                    Tên: <em style="color:#60a5fa;">TÀI KHOẢN DEMO MỘT, HAI, BA...</em>
                </div>
                <div class="ad-form-group">
                    <label class="ad-label">Số lượng tài khoản (1–50)</label>
                    <input type="number" id="testAccountQty" class="ad-input" value="5" min="1" max="50">
                </div>
                <div style="display:flex;gap:10px;margin-top:16px;">
                    <button class="ad-btn-primary" onclick="window.taoTaiKhoanTestHangLoat()" style="flex:1;">
                        <i class="fa-solid fa-user-plus"></i> Tạo ngay
                    </button>
                    <button class="ad-btn-ghost" onclick="document.getElementById('modalTaoTestOverlay').style.display='none';">
                        Hủy
                    </button>
                </div>
                <div id="testAccountProgress" style="margin-top:12px;font-size:0.8rem;color:#94a3b8;min-height:20px;"></div>
            </div>`;
        document.body.appendChild(box);
    };

    window.taoTaiKhoanTestHangLoat = async function() {
        const qty      = Math.min(50, Math.max(1, parseInt(document.getElementById("testAccountQty")?.value || "5")));
        const progress = document.getElementById("testAccountProgress");
        if (progress) progress.textContent = `Đang chuẩn bị tạo ${qty} tài khoản...`;

        const SALT = "tvl_pepper_2026";
        const _hashSdt = async (sdt) => {
            const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sdt + SALT));
            return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
        };

        let ok = 0, fail = 0, firstErr = "";
        for (let i = 0; i < qty; i++) {
            const prefixArr = ["03","05","07","08","09"];
            const randSdt = prefixArr[Math.floor(Math.random()*5)] + String(Math.floor(10000000 + Math.random() * 89999999));
            const ten     = "TÀI KHOẢN DEMO " + (_CHU_SO_VI[i] || String(i + 1));
            const passHash = await _hashSdt(randSdt); // mật khẩu = SĐT
            const gt      = Math.random() > 0.5 ? "male" : "female";

            let taoOK = false;

            // Ưu tiên 1: RPC phan_he_dat_pass_lan_dau (SECURITY DEFINER — bypass RLS hoàn toàn)
            if (window.guestRPC?.datPassLanDau) {
                try {
                    const r = await window.guestRPC.datPassLanDau(randSdt, ten, gt, passHash, null, null, null, null);
                    if (r?.status === "ok") taoOK = true;
                    else if (r?.status) { if (!firstErr) firstErr = `RPC trả về: ${r.status}`; }
                } catch (e2) { if (!firstErr) firstErr = e2.message || "RPC lỗi"; }
            }

            // Ưu tiên 2: khoDuLieuVinhVien (dùng admin JWT — cần INSERT policy)
            if (!taoOK) {
                try {
                    await window.khoDuLieuVinhVien.ghiData("nguoi_dung", {
                        sdt_khach: randSdt, ten_khach: ten, mat_khau_hash: passHash,
                        vai_tro: "guest", is_active: true, gioi_tinh: gt
                    }, null);
                    taoOK = true;
                } catch (e3) { if (!firstErr) firstErr = e3.message || "Lỗi chèn DB"; }
            }

            if (taoOK) {
                ok++;
                if (progress) progress.textContent = `Đã tạo ${ok}/${qty} tài khoản...`;
            } else { fail++; }
        }

        const isRLSErr = firstErr.includes("row-level security") || firstErr.includes("policy");
        let moTa;
        if (ok > 0) {
            moTa = `Đã tạo thành công ${ok} tài khoản demo.${fail > 0 ? ` ${fail} thất bại.` : ""}`;
        } else if (isRLSErr) {
            moTa = "Bị chặn bởi chính sách bảo mật DB. Cần chạy SQL: CREATE POLICY admin_insert_users ON nguoi_dung FOR INSERT TO authenticated WITH CHECK (is_admin());";
        } else {
            moTa = `Không tạo được tài khoản nào. Nguyên nhân: ${firstErr || "Không rõ"}`;
        }
        window.hienToast(ok > 0 ? "Tạo Thành Công ✅" : "Tạo Thất Bại ❌", moTa, ok > 0 ? "success" : "danger");
        document.getElementById("modalTaoTestOverlay").style.display = "none";
        _taiDanhSachKhach();
    };

    /* ═══════════════════════════════════════════════════════════════
     * SINH CA ĐẤU ẢO (Seed Virtual Matches) — tăng mật độ & uy tín
     *   • Host ảo = nguoi_dung vai_tro='host_ao' (KHÔNG cột mới, KHÔNG SQL)
     *   • Khóa đặt: ~70% FULL (seed đủ slot) + ~30% LIVE (đang diễn ra)
     *   • Khu vực HCM + Hà Nội, map Quận↔sân chuẩn (khớp window.MOCK_PROVINCES)
     * ═══════════════════════════════════════════════════════════════ */
    const _KHU_VUC_SAN = [
        { tinh: "TP. Hồ Chí Minh", vung: "Miền Nam", quans: {
            "Quận 12":    ["Sân Hải Yến", "Sân Tân Thới Hiệp", "Sân Hiệp Thành"],
            "Gò Vấp":     ["Sân Khang An", "Sân Đại Phát", "Sân Quang Trung"],
            "Tân Bình":   ["Sân Bàu Cát", "Sân K300", "Sân Hoàng Hoa Thám"],
            "Bình Thạnh": ["Sân Phan Đăng Lưu", "Sân Thanh Đa", "Sân Hồng Bàng"],
            "Thủ Đức":    ["Sân Hiệp Bình", "Sân Linh Đông", "Sân Tam Phú"],
            "Quận 7":     ["Sân Phú Mỹ Hưng", "Sân Tân Quy", "Sân Him Lam"],
            "Bình Tân":   ["Sân Tên Lửa", "Sân Bình Trị Đông", "Sân An Lạc"],
            "Quận 10":    ["Sân Kỳ Hòa", "Sân Bắc Hải", "Sân Thành Long"],
        }},
        { tinh: "Hà Nội", vung: "Miền Bắc", quans: {
            "Cầu Giấy":     ["Sân Cầu Giấy", "Sân Dịch Vọng", "Sân Trần Thái Tông"],
            "Đống Đa":      ["Sân Kim Liên", "Sân Thái Hà", "Sân Hoàng Cầu"],
            "Hai Bà Trưng": ["Sân Bách Khoa", "Sân Quỳnh Mai", "Sân Vĩnh Tuy"],
            "Thanh Xuân":   ["Sân Nhân Chính", "Sân Khương Trung", "Sân Royal City"],
            "Hà Đông":      ["Sân Văn Quán", "Sân Mỗ Lao", "Sân Hà Cầu"],
            "Long Biên":    ["Sân Việt Hưng", "Sân Ngọc Lâm", "Sân Sài Đồng"],
            "Nam Từ Liêm":  ["Sân Mỹ Đình", "Sân Mễ Trì", "Sân Trung Văn"],
            "Hoàng Mai":    ["Sân Linh Đàm", "Sân Định Công", "Sân Đại Kim"],
        }},
    ];
    const _HO      = ["Nguyễn","Trần","Lê","Phạm","Hoàng","Huỳnh","Phan","Vũ","Võ","Đặng","Bùi","Đỗ","Hồ","Ngô","Dương","Lý"];
    const _DEM_NAM = ["Văn","Hữu","Đức","Minh","Quang","Hoàng","Thành","Công","Bá","Đình","Xuân","Ngọc"];
    const _TEN_NAM = ["Long","Quân","Hùng","Nam","Sơn","Tuấn","Khoa","Phong","Dũng","Hải","Đạt","Trung","Bình","Kiên","Phúc","Thắng"];
    const _DEM_NU  = ["Thị","Ngọc","Thanh","Thu","Khánh","Phương","Mỹ","Kim","Hương","Thúy"];
    const _TEN_NU  = ["Linh","Hương","Trang","Anh","Ngân","Thảo","Vy","Nhi","Hà","Mai","Yến","Quỳnh","Diệp","Châu"];
    const _CAU_BRANDS = ["Cầu 88","Vina","Lining","NewStar","Hải Yến S70","Hải Yến S80","Ba Sao Pro X","HyFA hồng","Taro"];
    const _GIO_PHO_BIEN = [5, 8, 17, 18, 20];

    const _rndItem = arr => arr[Math.floor(Math.random() * arr.length)];
    const _rndIntS = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const _pad2S   = n => String(n).padStart(2, "0");
    function _tenVietHoa(gioiTinh) {
        const isNu = gioiTinh === "female";
        const ho  = _rndItem(_HO);
        const dem = isNu ? _rndItem(_DEM_NU) : _rndItem(_DEM_NAM);
        const ten = isNu ? _rndItem(_TEN_NU) : _rndItem(_TEN_NAM);
        const r = Math.random();
        let parts;
        if (r < 0.25)      parts = [ho, ten];                                                  // 2 từ
        else if (r < 0.82) parts = [ho, dem, ten];                                             // 3 từ
        else               parts = [ho, dem, (isNu ? _rndItem(_TEN_NU) : _rndItem(_TEN_NAM)), ten]; // 4 từ
        return parts.join(" ").toUpperCase();
    }
    function _sdtAoNgauNhien() {
        return _rndItem(["03","05","07","08","09"]) + String(_rndIntS(10000000, 99999999));
    }
    function _hexS(n) {
        let s = ""; for (let i = 0; i < n; i++) s += "0123456789ABCDEF"[Math.floor(Math.random() * 16)];
        return s;
    }
    async function _hashRand() {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("vk_" + Date.now() + Math.random()));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    function _uuidS() {
        return (crypto.randomUUID && crypto.randomUUID()) ||
            (_hexS(8) + "-" + _hexS(4) + "-4" + _hexS(3) + "-" + _hexS(4) + "-" + _hexS(12)).toLowerCase();
    }

    window.moModalSeedCaAo = function () {
        const existing = document.getElementById("modalSeedCaAoOverlay");
        if (existing) { existing.style.display = "flex"; return; }
        const box = document.createElement("div");
        box.id = "modalSeedCaAoOverlay";
        box.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;";
        box.innerHTML = `
            <div style="background:#1a2844;border:1px solid rgba(0,255,136,0.3);border-radius:16px;padding:28px 24px;max-width:440px;width:100%;">
                <div style="font-size:1.05rem;font-weight:800;color:#00ff88;margin-bottom:10px;">🏟️ Sinh Ca Đấu Ảo</div>
                <div style="color:#9ca3af;font-size:0.82rem;margin-bottom:16px;line-height:1.5;">
                    Tạo ca đấu ẢO trông tự nhiên (HCM + Hà Nội) để tăng mật độ trang Tìm Kèo.<br>
                    <strong style="color:#e2e8f0;">Khách KHÔNG đặt được</strong> (full slot hoặc đang diễn ra) &amp; KHÔNG xem được hồ sơ host ảo.
                </div>
                <div class="ad-form-group">
                    <label class="ad-label">Số lượng ca (1–50)</label>
                    <input type="number" id="seedCaAoQty" class="ad-input" value="10" min="1" max="50">
                </div>
                <div style="display:flex;gap:10px;margin-top:16px;">
                    <button class="ad-btn-primary" onclick="window.seedCaDauAo()" style="flex:1;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Sinh ngay
                    </button>
                    <button class="ad-btn-ghost" onclick="document.getElementById('modalSeedCaAoOverlay').style.display='none';">Hủy</button>
                </div>
                <div id="seedCaAoProgress" style="margin-top:12px;font-size:0.8rem;color:#94a3b8;min-height:20px;"></div>
            </div>`;
        document.body.appendChild(box);
    };

    let _seedAoBusy = false;
    window.seedCaDauAo = async function (qtyArg) {
        if (_seedAoBusy) return;
        const qty = Math.min(50, Math.max(1, parseInt(qtyArg != null ? qtyArg : (document.getElementById("seedCaAoQty")?.value || "10"), 10)));
        const progress = document.getElementById("seedCaAoProgress");
        const _prog = m => { if (progress) progress.textContent = m; };
        _seedAoBusy = true;
        // Ép vai trò ANON cho toàn bộ thao tác ghi: anon có sẵn INSERT policy
        // (ca_dau/nguoi_dung/dat_slot); authenticated (admin JWT) có thể THIẾU policy → bị chặn.
        const _savedJWT = window._adminJWT;
        window._adminJWT = null;
        try {
            _prog("Đang chuẩn bị host ảo...");
            // 1) Pool host ảo (tái dùng nếu có; bù tới TARGET_HOST, có cap chống treo)
            const TARGET_HOST = 12;
            let hostPool = [];
            try {
                const existed = await window.dbEngine.doc("nguoi_dung", { eq: { ma_gioi_thieu: "HOST_AO" } });
                hostPool = (existed || []).map(u => ({ sdt: u.sdt_khach, ten: u.ten_khach, gioi_tinh: u.gioi_tinh }));
            } catch (_) {}
            const seenSdt = new Set(hostPool.map(h => h.sdt));
            let _hostTries = 0;
            while (hostPool.length < TARGET_HOST && _hostTries < TARGET_HOST * 4) {
                _hostTries++;
                const gt = Math.random() > 0.5 ? "male" : "female";
                let sdt = _sdtAoNgauNhien(), guard = 0;
                while (seenSdt.has(sdt) && guard++ < 8) sdt = _sdtAoNgauNhien();
                seenSdt.add(sdt);
                try {
                    // Marker host ẢO = ma_gioi_thieu='HOST_AO' (vai_tro='host' để hợp lệ chk_vai_tro;
                    // ma_gioi_thieu là TEXT tự do, KHÔNG hiển thị trên card → an toàn nhận diện)
                    await window.khoDuLieuVinhVien.ghiData("nguoi_dung", {
                        ten_khach: _tenVietHoa(gt), sdt_khach: sdt, mat_khau_hash: await _hashRand(),
                        vai_tro: "host", ma_gioi_thieu: "HOST_AO", gioi_tinh: gt, is_active: true, diem_uy_tin: _rndIntS(88, 100)
                    }, null);
                    hostPool.push({ sdt, ten: "", gioi_tinh: gt });
                } catch (e) { /* trùng SĐT / lỗi mạng → thử SĐT khác (đã có cap) */ }
            }
            if (hostPool.length === 0) { window.hienToast("Lỗi", "Không tạo được host ảo (kiểm tra quyền ghi nguoi_dung).", "danger"); return; }

            const LV = (window.TRINH_DO_LIST || ["NEWBIE","YẾU-","YẾU","YẾU+","TBY-","TBY","TBY+","TB-","TB","TB+"]).slice(0, 10);
            const now = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();
            let okCa = 0, okSlot = 0;

            for (let i = 0; i < qty; i++) {
                _prog(`Đang sinh ca ${i + 1}/${qty}...`);
                const kv   = _rndItem(_KHU_VUC_SAN);
                const quan = _rndItem(Object.keys(kv.quans));
                const sanRaw = _rndItem(kv.quans[quan]);
                // Quy chuẩn tên sân: "SÂN CẦU LÔNG <TÊN>" (bỏ tiền tố "Sân " trong dataset)
                const tenSan = "SÂN CẦU LÔNG " + sanRaw.replace(/^Sân\s+/i, "").toUpperCase();
                const host = _rndItem(hostPool);

                const gioiTinhCan = _rndItem(["Nam", "Nữ", "Cả hai"]);
                // Dải trình độ RỘNG & tự nhiên: [startIdx,endIdx] trong LV=NEWBIE..TB+ (0..9).
                // Luôn bắt đầu từ ĐÁY band (0/1/4/7), trải ≥2 band (NEWBIE→YẾU, NEWBIE→TBY,
                // YẾU→TB...), KHÔNG quanh quẩn 1 band, KHÔNG chạm TB KHÁ/KHÁ (bán chuyên).
                const _DAI = [
                    [0, 2], [0, 3],          // NEWBIE→YẾU / YẾU+  (trình THẤP → giá rẻ)
                    [0, 4], [0, 5], [1, 5], [1, 6],   // NEWBIE/YẾU → TBY (trình TB-yếu → giá vừa)
                    [1, 8], [4, 8], [4, 9], [7, 9]    // YẾU/TBY/TB → TB+ (trình CAO → giá cao)
                ];
                const namRange = _rndItem(_DAI);
                const nuRange  = _rndItem(_DAI.filter(r => r[1] <= namRange[1]));  // nữ trần ≤ nam trần
                const namLevels = LV.slice(namRange[0], namRange[1] + 1);
                const nuLevels  = LV.slice(nuRange[0],  nuRange[1]  + 1);

                // GIÁ tỷ lệ thuận TRẦN trình độ (topIdx): thấp→rẻ, cao→đắt (loại ca trình thấp giá cao)
                const topIdx = (gioiTinhCan === "Nữ" ? nuRange[1] : namRange[1]);
                const giaNamK = topIdx <= 3 ? _rndItem([50, 55, 60])          // NEWBIE..YẾU+
                              : topIdx <= 6 ? _rndItem([60, 65, 70])          // TBY-..TBY+
                              :               _rndItem([70, 75, 80, 85]);     // TB-..TB+
                const giaNuK  = Math.max(50, giaNamK - _rndItem([5, 10]));
                const gia_nam = gioiTinhCan === "Nữ"  ? 0 : giaNamK * 1000;
                const gia_nu  = gioiTinhCan === "Nam" ? 0 : giaNuK * 1000;

                const soSan = _rndIntS(1, 3);
                // Số người tuyển/sân linh hoạt 3–8 (lẻ lẫn chẵn) — cộng độc lập từng sân → tổng tự nhiên
                let tongSlot = 0;
                for (let _s = 0; _s < soSan; _s++) tongSlot += _rndIntS(3, 8);
                const giaThue1h = _rndIntS(90, 140) * 1000;
                const dur = _rndIntS(2, 3);

                const isLive = Math.random() < 0.3;                 // ~30% live / ~70% full
                let ngay_danh, gio_bat_dau, gio_ket_thuc;
                if (isLive) {
                    // LIVE: hôm nay, bắt đầu trước now, kết thúc sau now (an toàn qua-nửa-đêm)
                    const startMin = Math.max(0, nowMin - _rndIntS(30, 90));
                    let endMin = startMin + dur * 60;
                    if (endMin <= nowMin) endMin = nowMin + 60;
                    ngay_danh    = now.toLocaleDateString("sv-SE");
                    gio_bat_dau  = _pad2S(Math.floor(startMin / 60) % 24) + ":" + _pad2S(startMin % 60) + ":00";
                    gio_ket_thuc = _pad2S(Math.floor(endMin / 60) % 24) + ":" + _pad2S(endMin % 60) + ":00";
                } else {
                    // FULL: giờ chẵn phổ biến CHƯA qua (hôm nay hoặc 1-4 ngày tới)
                    const gioBd = _rndItem(_GIO_PHO_BIEN);
                    let off = _rndIntS(0, 4);
                    if (off === 0 && gioBd <= now.getHours()) off = _rndIntS(1, 4);
                    const d = new Date(now); d.setDate(now.getDate() + off);
                    ngay_danh    = d.toLocaleDateString("sv-SE");
                    gio_bat_dau  = _pad2S(gioBd) + ":00:00";
                    gio_ket_thuc = _pad2S((gioBd + dur) % 24) + ":00:00";
                }

                const caId = _uuidS();
                const caPayload = {
                    id: caId, ma_key_host: null, sdt_nguoi_tao: host.sdt,
                    vung_mien: kv.vung, tinh_thanh: kv.tinh, quan_huyen: quan,
                    ten_san: tenSan, so_san_cu_the: "S" + _rndIntS(1, 8),
                    dia_chi_san: [tenSan, quan, kv.tinh].join(", "),
                    so_san_mo: soSan, ngay_danh, gio_bat_dau, gio_ket_thuc, so_gio_choi: dur,
                    gioi_tinh_can: gioiTinhCan,
                    yeu_cau_trinh_do: { nam: gioiTinhCan === "Nữ" ? [] : namLevels, nu: gioiTinhCan === "Nam" ? [] : nuLevels },
                    gia_nam, gia_nu,
                    tien_ich_bao_gom: { san: true, cau: true, nuoc: Math.random() < 0.5, gui_xe: true },
                    gia_thue_san_1h: giaThue1h, chi_phi_san_co_dinh: giaThue1h * dur * soSan,
                    loai_cau_su_dung: [{ ten: _rndItem(_CAU_BRANDS) }],
                    tong_chi_phi_cau: 0, chi_phi_nuoc_khac: 0,
                    so_nguoi_nam: 0, so_nguoi_nu: 0, chenh_lech_gia: 0, tong_doanh_thu_du_kien: 0,
                    tong_slot_can: tongSlot,
                    da_chot_ca: false, yeu_cau_coc: Math.random() < 0.3, scam_warning: false
                };
                try { await window.khoDuLieuVinhVien.ghiData("ca_dau", caPayload, null); okCa++; }
                catch (e) { continue; }

                // Số slot cần seed: FULL = đủ tong_slot_can; LIVE = một phần (≥ nửa, < full)
                // → ca "Đang diễn ra" LUÔN có người tham gia, không bao giờ 0; vẫn không full để giữ nhãn LIVE.
                let slotCount = tongSlot;
                if (isLive) {
                    const _lo = Math.max(2, Math.ceil(tongSlot * 0.5));
                    const _hi = Math.max(_lo, tongSlot - 1);
                    slotCount = _rndIntS(_lo, _hi);
                }
                if (slotCount > 0) {
                    const usedNames = new Set(), usedMa = new Set(), rows = [];
                    for (let k = 0; k < slotCount; k++) {
                        const sg = gioiTinhCan === "Nam" ? "male" : gioiTinhCan === "Nữ" ? "female" : (Math.random() > 0.5 ? "male" : "female");
                        let tenK = _tenVietHoa(sg), g2 = 0;
                        while (usedNames.has(tenK) && g2++ < 6) tenK = _tenVietHoa(sg);
                        usedNames.add(tenK);
                        // Mã slot ĐỒNG BỘ với khách thật: "SLOT-" + 8 hex IN HOA
                        let ma = "SLOT-" + _hexS(8); while (usedMa.has(ma)) ma = "SLOT-" + _hexS(8);
                        usedMa.add(ma);
                        rows.push({
                            id_ca_dau: caId, ten_khach: tenK, sdt_khach: _sdtAoNgauNhien(),
                            ma_slot: ma, gioi_tinh: sg,
                            trang_thai_di_danh: "Chờ đánh", thoi_gian_dat: new Date().toISOString()
                        });
                    }
                    try { await window.khoDuLieuVinhVien.ghiData("dat_slot", rows, null); okSlot += rows.length; }
                    catch (_) { /* batch lỗi → ca vẫn còn (sẽ không full); bỏ qua */ }
                }
            }

            window._tkInvalidateCache?.();
            _prog(`✅ Đã sinh ${okCa} ca (${okSlot} slot ảo).`);
            window.hienToast("Sinh ca ảo thành công ✅", `Đã tạo ${okCa} ca đấu ảo. Mở trang Tìm Kèo để xem.`, "success");
        } catch (e) {
            window.hienToast("Lỗi sinh ca ảo", e.message || "Không rõ", "danger");
        } finally {
            window._adminJWT = _savedJWT;   // khôi phục JWT admin
            _seedAoBusy = false;
        }
    };

    window.donDepCaAo = async function () {
        const ok = window.xacNhanModal
            ? await window.xacNhanModal("Dọn toàn bộ ca đấu ảo? (ẩn ca + xóa host ảo)", "🧹")
            : window.confirm("Dọn toàn bộ ca đấu ảo? (ẩn ca + xóa host ảo)");
        if (!ok) return;
        const _savedJWT = window._adminJWT;
        window._adminJWT = null;   // ép anon: anon có UPDATE/DELETE policy cần thiết
        try {
            const hosts = await window.dbEngine.doc("nguoi_dung", { eq: { ma_gioi_thieu: "HOST_AO" } });
            const hostSdts = new Set((hosts || []).map(u => u.sdt_khach));
            if (hostSdts.size === 0) { window.hienToast("Không có ca ảo", "Không tìm thấy host ảo nào.", "info"); return; }
            const allCa = await window.dbEngine.doc("ca_dau", { limit: 10000 });
            const caAo  = (allCa || []).filter(c => hostSdts.has(c.sdt_nguoi_tao));
            const caIds = new Set(caAo.map(c => c.id));
            // (1) dat_slot của ca ảo → "Khách hủy" (anon KHÔNG DELETE được ca/slot do RLS → NEUTRALIZE)
            const allSlot = await window.dbEngine.doc("dat_slot", { limit: 10000 });
            let nSlot = 0;
            for (const s of (allSlot || [])) {
                if (!caIds.has(s.id_ca_dau)) continue;
                try { await window.dbEngine.ghi("dat_slot", { trang_thai_di_danh: "Khách hủy" }, { id: s.id }); nSlot++; } catch (_) {}
            }
            // (2) ca_dau ảo → da_chot_ca=true (ẩn khỏi /tim-keo)
            let nCa = 0;
            for (const c of caAo) {
                try { await window.dbEngine.ghi("ca_dau", { da_chot_ca: true }, { id: c.id }); nCa++; } catch (_) {}
            }
            // (3) DELETE host ảo (anon DELETE nguoi_dung được; sdt_nguoi_tao là TEXT, không FK → an toàn)
            let nHost = 0;
            for (const sdt of hostSdts) {
                try { await window.dbEngine.xoa("nguoi_dung", { sdt_khach: sdt }); nHost++; } catch (_) {}
            }
            window._tkInvalidateCache?.();
            _taiDanhSachKhach();
            window.hienToast("Đã dọn ca ảo ✅", `Ẩn ${nCa} ca, hủy ${nSlot} slot, xóa ${nHost} host ảo.`, "success");
        } catch (e) {
            window.hienToast("Lỗi dọn ca ảo", e.message || "Không rõ", "danger");
        } finally {
            window._adminJWT = _savedJWT;
        }
    };

    /* ─── Cascade delete một user — xóa toàn bộ dữ liệu liên quan ─── */
    async function _cascadeXoaUser(sdt) {
        // Đường ưu tiên: RPC admin_cascade_xoa_user (SECURITY DEFINER, bypass RLS hoàn toàn)
        // Cần chạy migration-admin-cascade.sql trên Supabase Dashboard trước
        if (window._sbClient) {
            try {
                const { data, error } = await window._sbClient.rpc("admin_cascade_xoa_user", { p_sdt: sdt });
                if (!error && data?.status === "ok") return;
                // Nếu RPC trả lỗi / chưa deploy → fall through sang REST fallback
            } catch (_) { /* RPC chưa deploy → tiếp tục REST fallback */ }
        }

        // Fallback: REST API — thứ tự quan trọng
        // Bước 1: xóa slot khách này đã đặt trong ca đấu của người khác
        await window.dbEngine.xoa("dat_slot", { sdt_khach: sdt }).catch(() => {});

        // Bước 2: tìm & xóa ca đấu do user này tổ chức (sdt_nguoi_tao — cột tồn tại trong schema)
        //         FK CASCADE trong DB sẽ tự xóa dat_slot trong các ca đó
        let userCaDau = [];
        try {
            userCaDau = (await window.dbEngine.doc("ca_dau", { eq: { sdt_nguoi_tao: sdt } })) || [];
        } catch (_) { userCaDau = []; }
        for (const ca of userCaDau) {
            await window.dbEngine.xoa("ca_dau", { id: ca.id }).catch(() => {});
        }

        // Bước 3: xóa session token
        await window.dbEngine.xoa("guest_sessions", { sdt_khach: sdt }).catch(() => {});

        // Bước 4: xóa tài khoản chính — sau khi xóa, verify_guest_token fail luôn (JOIN không còn)
        await window.dbEngine.xoa("nguoi_dung", { sdt_khach: sdt });
    }

    // Xóa nhiều tài khoản đã chọn (bulk delete)
    window.xoaNhieuTaiKhoanTest = async function() {
        const checked = document.querySelectorAll("#adminGuestsBody .tv-chk:checked");
        if (!checked.length) { window.hienToast("Thông báo", "Chưa chọn tài khoản nào.", "warning"); return; }

        // Chỉ lấy SĐT của tài khoản tồn tại trong nguoi_dung (xuất hiện trong _allKhachData từ nguoi_dung)
        const sdtsTuNguoiDung = new Set(_allKhachData.filter(g => g._fromNguoiDung).map(g => g.sdt));
        const sdts = Array.from(checked)
            .map(c => c.dataset.sdt)
            .filter(s => s && s !== ADMIN_GOC_SDT && sdtsTuNguoiDung.has(s));

        const toanBoChon = Array.from(checked).map(c => c.dataset.sdt).filter(s => s && s !== ADMIN_GOC_SDT);
        const skipped    = toanBoChon.length - sdts.length;

        if (!sdts.length) {
            window.hienToast("Không thể xóa", skipped > 0
                ? `${skipped} tài khoản chỉ tồn tại trong lịch sử đặt slot, không có trong bảng người dùng.`
                : "Các tài khoản đã chọn đều được bảo vệ.", "warning");
            return;
        }

        if (!confirm(`Xác nhận xóa vĩnh viễn ${sdts.length} tài khoản?\n${skipped > 0 ? `(${skipped} tài khoản slot-only sẽ bỏ qua)\n` : ""}Hành động này KHÔNG THỂ hoàn tác.`)) return;

        // Xóa tuần tự cascade — slot, ca đấu, session rồi mới xóa tài khoản
        let ok = 0, fail = 0, errMsg = "";
        for (const sdt of sdts) {
            try {
                await _cascadeXoaUser(sdt);
                ok++;
            } catch(e) {
                fail++;
                if (!errMsg) errMsg = e?.message || "Lỗi không rõ";
            }
        }

        window.hienToast(
            ok > 0 ? "Đã Xóa ✅" : "Thất Bại ❌",
            `Đã xóa ${ok} tài khoản.${fail > 0 ? ` ${fail} thất bại: ${errMsg.slice(0,60)}` : ""}`,
            ok > 0 ? "success" : "danger"
        );
        window._tvBoChonHet();
        // Reload sau 300ms để đảm bảo DB đã xử lý xong
        setTimeout(() => _taiDanhSachKhach(), 300);
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
        // Admin gốc ID 1 — bất khả xâm phạm, không mở modal chỉnh sửa
        if (sdt === ADMIN_GOC_SDT) {
            window.hienToast("Không thể chỉnh sửa", "Tài khoản Admin gốc (ID 1) được bảo vệ và không thể thay đổi.", "warning");
            return;
        }
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
                        <div class="mv-inline-row" style="display:flex;align-items:center;gap:8px;">
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
                        <label class="mv-label">Địa chỉ Gmail</label>
                        <div class="mv-inline-row" style="display:flex;align-items:center;gap:8px;">
                            <input type="email" id="mvGmail" class="mv-input" style="flex:1;"
                                value="${_mvEsc(u.gmail || u.email || '')}" placeholder="email@gmail.com">
                            <button class="mv-btn" title="Sao chép Gmail"
                                onclick="navigator.clipboard.writeText(document.getElementById('mvGmail').value||'').then(()=>window.hienToast('Đã sao chép 📋','Gmail đã vào clipboard','success')).catch(()=>{})"
                                style="padding:0 10px;height:40px;flex-shrink:0;">
                                <i class="fa-regular fa-copy"></i>
                            </button>
                        </div>
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
                <div class="mv-inline-row" style="display:flex;align-items:center;gap:8px;">
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
                        onclick="window._ap.xacNhanDoiVaiTro('${sdtAttr}', 'guest')">👤 Thành Viên</button>
                    <button class="mv-btn ${vaiTro === 'admin' ? 'mv-btn-active' : ''}"
                        onclick="window._ap.xacNhanDoiVaiTro('${sdtAttr}', 'admin')">👑 Admin</button>
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
                        <div class="mv-inline-row" style="display:flex;align-items:center;gap:8px;">
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
                <div class="mv-inline-row" style="display:flex;gap:8px;">
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

            <!-- ── E2: Lịch sử điểm uy tín (Nhóm 3) ── -->
            <div class="mv-section">
                <div class="mv-section-title">📜 Lịch Sử Điểm Uy Tín</div>
                <button class="mv-btn" style="margin-bottom:10px;"
                    onclick="window._xemLichSuDiemAdmin('${sdtAttr}')">
                    <i class="fa-solid fa-clock-rotate-left"></i> Tải lịch sử điểm
                </button>
                <div id="mvLichSuDiem" style="max-height:240px;overflow-y:auto;"></div>
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
        const gmail    = document.getElementById("mvGmail")?.value?.trim();
        const telegram = document.getElementById("input-member-telegram")?.value?.trim();

        const payload = {};
        if (ten      !== undefined) payload.ten_khach     = ten      || null;
        if (sodu     !== undefined) payload.so_du_vi      = Number(sodu) || 0;
        if (fb       !== undefined) payload.facebook_link = fb       || null;
        if (zalo     !== undefined) payload.sdt_zalo      = zalo     || null;
        if (gmail    !== undefined) payload.gmail         = gmail ? gmail.toLowerCase() : null;
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

    // Namespace riêng — không expose tên hàm ra window trực tiếp
    window._ap = window._ap || {};

    // B — Hiện confirm nội tuyến trước khi đổi vai trò
    window._ap.xacNhanDoiVaiTro = function (sdt, vaiTroMoi) {
        const box  = document.getElementById("mvRoleConfirm");
        const txt  = document.getElementById("mvRoleConfirmText");
        const btn  = document.getElementById("mvRoleConfirmYes");
        if (!box || !txt || !btn) return;
        txt.innerHTML = `Đổi vai trò thành <strong style="color:#00ff88;">${vaiTroMoi}</strong>?`;
        btn.onclick   = function () { window._ap.thucHienDoiVaiTro(sdt, vaiTroMoi); };
        box.style.display = "block";
    };

    // B — Thực hiện đổi vai trò sau khi confirm
    window._ap.thucHienDoiVaiTro = async function (sdt, vaiTroMoi) {
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
            window.hienToast("Mật khẩu mới đã lưu ✅", "Mật khẩu đã được cập nhật thành công.", "success");
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
        if (sdt === ADMIN_GOC_SDT) { window.hienToast("Không được phép", "Không thể khóa tài khoản Admin gốc.", "warning"); return; }
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

    // E2 — Lịch sử điểm uy tín của 1 user (Nhóm 3) — RPC admin (authenticated)
    function _renderAdminLsutRow(it) {
        const delta = Number(it.delta) || 0;
        const up = delta > 0;
        const dStr = (up ? "+" : "") + delta;
        const dt = it.created_at ? new Date(it.created_at) : null;
        const tg = dt && !isNaN(dt.getTime())
            ? dt.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
        const san = it.ten_san ? ` · <span style="color:#22d3ee;">${_escHtml(it.ten_san)}</span>` : "";
        const after = it.diem_sau != null ? `${_escHtml(it.diem_sau)}đ` : "";
        const dColor = up ? "#00ff88" : "#ff6b6b";
        const dBg = up ? "rgba(0,255,136,0.1)" : "rgba(239,68,68,0.1)";
        return `<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 4px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="flex-shrink:0;min-width:44px;text-align:center;font-weight:800;font-size:0.8rem;padding:3px 6px;border-radius:6px;color:${dColor};background:${dBg};">${_escHtml(dStr)}</span>
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.83rem;font-weight:600;color:#e2e8f0;">${_escHtml(it.ly_do)}</div>
                <div style="font-size:0.72rem;color:#64748b;margin-top:2px;">${_escHtml(tg)}${san}</div>
            </div>
            <span style="flex-shrink:0;font-size:0.72rem;color:#94a3b8;align-self:center;white-space:nowrap;">${after}</span>
        </div>`;
    }
    window._xemLichSuDiemAdmin = async function (sdt) {
        const box = document.getElementById("mvLichSuDiem");
        if (!box) return;
        box.innerHTML = `<div style="text-align:center;color:#64748b;padding:18px;font-size:0.85rem;">Đang tải…</div>`;
        try {
            const { data, error } = await window._sbClient.rpc("get_lich_su_uy_tin_admin", { p_sdt: sdt, p_gioi_han: 100 });
            if (error) throw error;
            if (!data || data.status !== "ok" || !Array.isArray(data.data) || !data.data.length) {
                box.innerHTML = `<div style="text-align:center;color:#64748b;padding:18px;font-size:0.85rem;">Chưa có lịch sử điểm.</div>`;
                return;
            }
            box.innerHTML = data.data.map(_renderAdminLsutRow).join("");
        } catch (e) {
            box.innerHTML = `<div style="color:#ef4444;padding:14px;font-size:0.82rem;">Lỗi tải lịch sử: ${_escHtml((e && e.message || "").slice(0, 80))}</div>`;
        }
    };

    // E — Xóa tài khoản (kiểm tra SĐT nhập đúng → cascade delete)
    window._xoaTV = async function (sdt) {
        if (sdt === ADMIN_GOC_SDT) { window.hienToast("Không được phép", "Không thể xóa tài khoản Admin gốc.", "warning"); return; }
        const nhapSdt = (document.getElementById("mvXoaConfirmSdt")?.value || "").trim();
        if (nhapSdt !== sdt) {
            window.hienToast("Xác nhận sai", `SĐT nhập vào (${nhapSdt || "rỗng"}) không khớp với ${sdt}.`, "danger");
            return;
        }
        try {
            // Cascade: xóa slot, ca đấu, session rồi mới xóa tài khoản
            await _cascadeXoaUser(sdt);
            window.hienToast("Đã xóa ✅", `Tài khoản ${sdt} và toàn bộ dữ liệu liên quan đã bị xóa vĩnh viễn.`, "warning");
            window.dongModalThanhVien();
            _taiDanhSachKhach();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể xóa tài khoản: " + (e.message || "").slice(0, 80), "danger");
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
                    ? _escHtml(r.nhan_xet)
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
                    <div style="font-weight:600;font-size:0.82rem;">${_escHtml(_layTen(sdtViet))}</div>
                    <div style="font-size:0.7rem;color:#64748b;">${_escHtml(_rutGonSdt(sdtViet))}</div>
                </td>
                <td>
                    <div style="font-weight:600;font-size:0.82rem;">${_escHtml(_layTen(sdtBiDG))}</div>
                    <div style="font-size:0.7rem;color:#64748b;">${_escHtml(_rutGonSdt(sdtBiDG))}</div>
                </td>
                <td>${thongTinCa}</td>
                <td style="white-space:nowrap;">${stars}</td>
                <td style="font-size:0.78rem;max-width:220px;">${
                    r.nhan_xet ? _escHtml(r.nhan_xet) : "<em style='color:#64748b'>Không có nhận xét</em>"
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
        setTimeout(window._fitTable, 0);
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
    // Ảnh chụp nội dung/bật-tắt popup lúc tải — để biết khi nào cần bump mốc thời gian.
    let _popupSnap = null;

    async function _taiThongBao() {
        try {
            const configs   = await window.dbEngine.doc("cau_hinh_he_thong");
            const cfgMap    = {};
            configs.forEach(c => { if (c.id) cfgMap[c.id] = c; });
            _popupSnap = {
                content: cfgMap["popup_chinh"]?.noi_dung_thong_bao || "",
                enabled: cfgMap["popup_enabled"]?.noi_dung_thong_bao === "true" ? "true" : "false"
            };

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
            // Mốc thời gian popup: CHỈ bump khi nội dung HOẶC trạng thái bật/tắt thay đổi
            // → popup chỉ hiện lại cho khách khi Admin thực sự đổi thông báo (không phải mỗi lần lưu).
            const popupChanged = !_popupSnap || _popupSnap.content !== content || _popupSnap.enabled !== popupEnabled;
            const writes = [
                up("popup_chinh",       content),
                up("popup_enabled",     popupEnabled),
                up("qr_donate",         qrDonate),
                up("tieu_de_donate",    tieuDeDonate),
                up("text_donate",       textDonate),
                up("text_quang_cao",    textQuangCao),
                up("telegram_bot_token",tgBotToken),
                up("telegram_chat_id",  tgChatId)
            ];
            if (popupChanged) writes.push(up("popup_updated_at", String(Date.now())));
            await Promise.all(writes);
            _popupSnap = { content, enabled: popupEnabled }; // cập nhật ảnh chụp
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
        return window.formatTienK ? window.formatTienK(n) : (Number(n || 0).toLocaleString("vi-VN") + "K");
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
                    <td style="font-size:0.78rem;">${_escHtml(ca.ten_san || b.id_ca_dau?.slice(0,8) || "--")}${frozen}</td>
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
