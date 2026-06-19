/* =========================================================================
 * 🏸 PHÂN HỆ ỨNG DỤNG CHÍNH - PHAN-HE-UNG-DUNG.JS (v1.0)
 * Dự án: TUYENVANGLAI.IO.VN
 *
 * File coordinator cho /feed/index.html
 * Gom auth + tab routing + profile + tìm kèo + đăng kèo + lịch sử
 * Tái sử dụng logic từ phan-he-khach-choi.js và phan-he-host.js
 *
 * Mô hình mới: 1 tài khoản duy nhất — mọi user đều có thể tìm kèo VÀ đăng kèo
 * Không còn Key SaaS — đăng nhập → dùng ngay toàn bộ tính năng
 * =========================================================================
 */

(function () {
    // ── Trạng thái toàn cục ──
    window.currentUser  = null;  // User hiện tại (session chính)
    window.currentGuest = null;  // Alias backward compat (trỏ về currentUser)

    /* ═══════════════════════════════════════════════════
     * MOBILE HAMBURGER NAV
     * ═══════════════════════════════════════════════════ */
    window.toggleMobileNav = function () {
        const drawer  = document.getElementById("mobileNavDrawer");
        const overlay = document.getElementById("mobileNavOverlay");
        const btn     = document.getElementById("btnHamburger");
        if (!drawer) return;
        const isOpen = drawer.classList.contains("open");
        if (isOpen) {
            window.closeMobileNav();
        } else {
            drawer.classList.add("open");
            overlay?.classList.add("open");
            btn?.classList.add("is-open");
            document.body.style.overflow = "hidden";
        }
    };

    window.closeMobileNav = function () {
        document.getElementById("mobileNavDrawer")?.classList.remove("open");
        document.getElementById("mobileNavOverlay")?.classList.remove("open");
        document.getElementById("btnHamburger")?.classList.remove("is-open");
        document.body.style.overflow = "";
    };

    /* Đo chiều cao header thực tế → set padding-top cho app-body qua inline style
     * (Inline style > !important CSS → không bị override bởi bất kỳ cascade nào)
     * Ngoại lệ: mobile + has-subtab → để CSS !important 108px xử lý */
    window._syncBodyPadding = function () {
        const header  = document.querySelector(".app-header");
        const appBody = document.querySelector(".app-body");
        if (!header || !appBody) return;
        const hh       = Math.round(header.getBoundingClientRect().height);
        const isMobile = window.innerWidth <= 768;
        const hasSub   = document.body.classList.contains("has-subtab");
        if (hasSub && isMobile) {
            appBody.style.paddingTop = ""; // nhường CSS 108px !important
        } else {
            appBody.style.paddingTop = hh + "px";
        }
    };
    window.addEventListener("resize", window._syncBodyPadding);

    // Đóng drawer khi chuyển tab (từ desktop hoặc external call)
    const _origChuyenTab = window.chuyenTab;
    window.addEventListener("DOMContentLoaded", () => {
        // Patch chuyenTab sau khi nó được định nghĩa
        const _patch = () => {
            const orig = window.chuyenTab;
            if (orig && orig !== window._chuyenTabPatched) {
                window._chuyenTabPatched = function (...args) {
                    window.closeMobileNav();
                    return orig(...args);
                };
                window.chuyenTab = window._chuyenTabPatched;
            }
        };
        setTimeout(_patch, 100);
    });

    /* ═══════════════════════════════════════════════════
     * KHỞI TẠO ỨNG DỤNG
     * ═══════════════════════════════════════════════════ */
    /* Brand config — chỉ quản lý favicon (logo đã hardcode trong HTML) */
    function _apDungBrandConfigSync() {
        const faviconUrl = localStorage.getItem("tvl_brand_favicon") || "";
        if (faviconUrl) {
            const link = document.querySelector('link[rel="icon"]');
            if (link) link.href = faviconUrl;
        }
    }

    async function _apDungBrandConfig() {
        try {
            if (!window.dbEngine) return;
            const list = await window.dbEngine.docThu("cau_hinh_he_thong", {});
            if (!list) return;
            const cfg = {};
            list.forEach(c => { if (c.id) cfg[c.id] = c.noi_dung_thong_bao || ""; });

            const faviconUrl = cfg["favicon_url"] || "";
            if (faviconUrl) {
                localStorage.setItem("tvl_brand_favicon", faviconUrl);
                const link = document.querySelector('link[rel="icon"]');
                if (link) link.href = faviconUrl;
            }
        } catch (e) { /* im lặng — không block app */ }
    }

    window.khoiTaoUngDung = function () {
        // Đọc session từ localStorage (hỗ trợ cả tvl_user mới lẫn tvl_guest cũ)
        const saved = localStorage.getItem("tvl_user") || localStorage.getItem("tvl_guest");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed._expires_at && Date.now() > parsed._expires_at) {
                    localStorage.removeItem("tvl_user");
                    localStorage.removeItem("tvl_guest");
                    window.currentUser  = null;
                    window.currentGuest = null;
                } else {
                    window.currentUser  = parsed;
                    window.currentGuest = parsed; // backward compat cho phan-he-khach-choi.js
                }
            } catch {
                window.currentUser  = null;
                window.currentGuest = null;
            }
        }

        // Áp dụng brand từ cache localStorage NGAY LẬP TỨC (sync, không đợi Supabase)
        _apDungBrandConfigSync();

        // Khởi động hiệu ứng
        if (window.khoiTaoTheme)        window.khoiTaoTheme();
        if (window.khoiTaoHologramGlow) window.khoiTaoHologramGlow();
        if (window.khoiTaoScrollReveal) window.khoiTaoScrollReveal();

        // Fetch Supabase cập nhật cache (chạy ngầm, không block UI)
        _apDungBrandConfig();

        // ── Bảng slug → tabId (hỗ trợ cả path sạch lẫn hash legacy) ──
        const SLUG_TO_TAB = {
            "tim-keo":      "tim-keo",
            "dang-quan-ly": "dang-quan-ly",
            "dang-keo":     "dang-quan-ly",
            "ca-nhan":      "ca-nhan",
            "ho-so":        "ca-nhan",
            "lich-su":      "lich-su",
            "gioi-thieu":   "gioi-thieu",
            "profile":      "ca-nhan",
            "keo":          "tim-keo",
            "host":         "dang-quan-ly",
            "history":      "lich-su",
            "home":         "gioi-thieu"
        };

        // Đọc slug từ pathname (URL sạch /tim-keo) → hash legacy (#tim-keo) → ?tab= fallback
        const queryTab = new URLSearchParams(window.location.search).get("tab");
        const pathSlug = window.location.pathname.replace(/^\//, "").replace(/^index\.html$/, "").trim();
        const hashSlug = (window.location.hash || "").replace(/^#\/?/, "").trim(); // backward compat bookmark cũ

        const initTab = SLUG_TO_TAB[pathSlug]
                     || SLUG_TO_TAB[hashSlug]
                     || SLUG_TO_TAB[queryTab]
                     || "gioi-thieu";

        // Nếu URL đang dùng hash cũ → đổi sang path sạch ngay lập tức
        if (hashSlug && SLUG_TO_TAB[hashSlug] && !pathSlug) {
            const cleanPath = "/" + hashSlug;
            window.history.replaceState({ tab: SLUG_TO_TAB[hashSlug] }, "", cleanPath);
        }

        _capNhatHeaderState();
        chuyenTab(initTab, true); // true = không cập nhật URL lại (đã đúng)
        // Đảm bảo padding-top khớp header thực tế sau khi layout ổn định
        setTimeout(window._syncBodyPadding, 0);

        // Auto-open modal nếu URL có ?id=<id> (cũ ?ca= vẫn hỗ trợ)
        const _p = new URLSearchParams(window.location.search);
        const caId = _p.get("id") || _p.get("ca");
        if (caId && window.moModalChiTietKeo) {
            setTimeout(() => window.moModalChiTietKeo(caId), 700);
        }

        // Xử lý Back/Forward qua popstate (History API)
        window.addEventListener("popstate", function (e) {
            const pSlug = window.location.pathname.replace(/^\//, "").replace(/^index\.html$/, "").trim();
            const tab   = SLUG_TO_TAB[pSlug] || (e.state?.tab) || "gioi-thieu";
            chuyenTab(tab, true);
        });

        // ── CƯỠNG CHẾ ĐỔI TÊN: quét khi MỞ WEB / F5 + khi ĐỔI TAB trình duyệt ──
        if (window.currentUser || window.currentGuest) {
            setTimeout(() => window.quetTenViPham && window.quetTenViPham(), 1000);
        }
        document.addEventListener("visibilitychange", function () {
            if (!document.hidden) setTimeout(() => window.quetTenViPham && window.quetTenViPham(), 300);
        });
    };

    /* ═══════════════════════════════════════════════════
     * CHUYỂN TAB MẸ — No-Reload
     * ═══════════════════════════════════════════════════ */
    // Bảng tabId → path sạch (HTML5 History Mode — không có #)
    const TAB_TO_PATH = {
        "gioi-thieu":   "/",
        "tim-keo":      "/tim-keo",
        "dang-quan-ly": "/dang-quan-ly",
        "ca-nhan":      "/ca-nhan",
        "lich-su":      "/lich-su"
    };

    window.chuyenTab = function (tabId, _noUpdateUrl) {
        document.querySelectorAll(".tab-section").forEach(s => s.style.display = "none");
        document.querySelectorAll(".tab-nav-btn").forEach(b => b.classList.remove("active"));

        const section = document.getElementById("tab-" + tabId);
        if (section) section.style.display = "block";
        const btn = document.querySelector(`.tab-nav-btn[data-tab="${tabId}"]`);
        if (btn) btn.classList.add("active");

        document.body.classList.toggle("is-landing-tab", tabId === "gioi-thieu");
        // Thêm has-subtab khi tab có subtab-nav — giúp padding-top đúng trên mobile
        const tabsWithSubtab = ["dang-quan-ly", "lich-su"];
        document.body.classList.toggle("has-subtab", tabsWithSubtab.includes(tabId));
        // Sync padding-top theo chiều cao header thực tế (fix dải đen mobile)
        window._syncBodyPadding?.();

        // Cập nhật URL sạch qua History API (server Vercel đã cấu hình fallback /:path* → index.html)
        if (!_noUpdateUrl) {
            const newPath = TAB_TO_PATH[tabId] || "/";
            if (window.location.pathname !== newPath) {
                window.history.pushState({ tab: tabId }, "", newPath);
            }
        }

        // Logic khởi tạo theo tab
        if (tabId === "ca-nhan")      _khoiTaoTabCaNhan();
        if (tabId === "tim-keo")      _khoiTaoTabTimKeo();
        if (tabId === "dang-quan-ly") _khoiTaoTabDangQuanLy();
        if (tabId === "lich-su")      _khoiTaoTabLichSu();
        if (tabId === "gioi-thieu")   _khoiTaoTabGioiThieu();

        // Scroll lên đầu
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    /* ═══════════════════════════════════════════════════
     * CHUYỂN SUB-TAB (tab con trong Tab 3)
     * ═══════════════════════════════════════════════════ */
    window.chuyenSubTab = function (parentTabId, subTabId) {
        const parent = document.getElementById("tab-" + parentTabId);
        if (!parent) return;

        parent.querySelectorAll(".subtab-section").forEach(s => {
            s.style.display = "none";
        });
        parent.querySelectorAll(".subtab-btn").forEach(b => {
            b.classList.remove("active");
        });

        const subSection = document.getElementById(`subtab-${parentTabId}-${subTabId}`);
        if (subSection) subSection.style.display = "block";
        const subBtn = parent.querySelector(`.subtab-btn[data-subtab="${subTabId}"]`);
        if (subBtn) subBtn.classList.add("active");
    };

    /* ═══════════════════════════════════════════════════
     * TAB 1 — CÁ NHÂN (Profile + Login/Register)
     * ═══════════════════════════════════════════════════ */
    function _khoiTaoTabCaNhan() {
        const loginSection   = document.getElementById("section-login");
        const profileSection = document.getElementById("section-profile");

        if (!window.currentUser) {
            // Chưa đăng nhập — hiện form đăng nhập
            if (loginSection)   loginSection.style.display   = "block";
            if (profileSection) profileSection.style.display = "none";
            // Reset inline style của guestAuthPanel — có thể bị ẩn từ session trước sau logout
            const authPanel  = document.getElementById("guestAuthPanel");
            const profBlock  = document.getElementById("guestProfileBlock");
            if (authPanel)  authPanel.style.display  = "block";
            if (profBlock)  profBlock.style.display  = "none";
            // Đóng form phụ đăng ký nếu đang mở (sau đăng ký rồi logout ngay)
            const extraFields = document.getElementById("authExtraFields");
            if (extraFields) {
                extraFields.classList.remove("is-open");
                extraFields.dataset.phone  = "";
                extraFields.dataset.pass   = "";
                extraFields.dataset.gender = "";
            }
            const btnXN = document.getElementById("btnXacNhan");
            if (btnXN) btnXN.textContent = "XÁC NHẬN →";
            // Hiện widget Turnstile ngay khi form login mount + render thủ công (tránh race condition SPA)
            const tsWrapLogin = document.getElementById("cfTurnstileWrap");
            if (tsWrapLogin) tsWrapLogin.style.display = "block";
            if (window._tvlRenderTs) window._tvlRenderTs("turnstile-container");
            // Khởi dropdown bộ lọc tìm kèo (không gọi khoiTaoTrangKhach để tránh xung đột)
            if (window._napDropdownBoLoc) window._napDropdownBoLoc();
        } else {
            // Đã đăng nhập — hiện profile
            if (loginSection)   loginSection.style.display   = "none";
            if (profileSection) profileSection.style.display = "block";
            _renderProfile();
        }
    }

    function _renderProfile() {
        const u = window.currentUser;
        if (!u) return;

        // Điền thông tin vào form profile
        _setProfileField("profileName",     u.ten_khach || "");
        _setProfileField("profilePhone",    u.sdt_khach || "");
        _setProfileField("profileGender",   u.gioi_tinh || "");
        _setProfileField("profileTrindDo",  window.chuanHoaTrinhDo ? window.chuanHoaTrinhDo(u.trinh_do) : (u.trinh_do || ""));
        _setProfileField("profileFacebook", u.facebook_link || "");
        _setProfileField("profileZalo",     u.sdt_zalo  || "");
        _setProfileField("profileGmail",    u.gmail     || "");
        _setProfileField("profileBio",      u.bio       || "");

        // Điểm uy tín — tải từ DB
        _taiDiemUyTin(u.sdt_khach);
        // Thanh uy tín — gọi sau F5 (khi currentGuest đã restore từ localStorage)
        window._hienTrustScoreBar?.();

        // Tên hiển thị và avatar
        const nameEl   = document.getElementById("profileDisplayName");
        const avatarEl = document.getElementById("profileAvatar");
        if (nameEl) nameEl.textContent = u.ten_khach || u.sdt_khach || "Người dùng";
        if (avatarEl && u.avatar_url) avatarEl.src = u.avatar_url;
    }

    function _setProfileField(id, val) {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
            el.value = val;
        } else {
            el.textContent = val;
        }
    }

    async function _taiDiemUyTin(sdt) {
        const ratingEl = document.getElementById("profileRating");
        const countEl  = document.getElementById("profileRatingCount");
        if (!ratingEl) return;
        // Dùng docThu để im lặng nếu lỗi — không hiện toast "lỗi kết nối" giả
        const reviews = await window.dbEngine.docThu("danh_gia_tin_dung", {
            eq: { sdt_nguoi_bi_danh_gia: sdt }
        });
        if (!reviews || reviews.length === 0) {
            ratingEl.textContent = "—";
            if (countEl) countEl.textContent = "Chưa có đánh giá";
            return;
        }
        const avg = reviews.reduce((s, r) => s + (r.so_sao || 0), 0) / reviews.length;
        ratingEl.textContent = avg.toFixed(1);
        if (countEl) countEl.textContent = `${reviews.length} đánh giá`;
    }

    /* Lưu profile — gọi từ button [💾 Lưu Lại] */
    window.luuProfile = async function () {
        const u = window.currentUser;
        if (!u) return;

        // Validate Họ tên TRƯỚC khi lưu (chặt — chống tên rác/phá hoại/lách luật)
        const _tenMoi = (document.getElementById("profileName")?.value?.trim() || u.ten_khach || "").toUpperCase() || u.ten_khach;
        if (window.kiemTraTenHopLe) {
            const _kqTen = window.kiemTraTenHopLe(_tenMoi);
            if (!_kqTen.ok) {
                window.hienToast("Tên không hợp lệ", _kqTen.lyDo, "danger");
                const _el = document.getElementById("profileName");
                if (_el) { try { _el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {} _el.focus(); }
                return;
            }
        }

        const payload = {
            ten_khach:    _tenMoi,
            gioi_tinh:    document.getElementById("profileGender")?.value           || u.gioi_tinh,
            trinh_do:     (window.chuanHoaTrinhDo ? window.chuanHoaTrinhDo(document.getElementById("profileTrindDo")?.value) : document.getElementById("profileTrindDo")?.value) || "",
            facebook_link:document.getElementById("profileFacebook")?.value?.trim() || null,
            sdt_zalo:     document.getElementById("profileZalo")?.value?.trim()     || null,
            gmail:        document.getElementById("profileGmail")?.value?.trim()    || null,
            bio:          document.getElementById("profileBio")?.value?.trim()      || null,
        };

        const btn = document.getElementById("btnLuuProfile");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }

        try {
            await window.dbEngine.ghi("nguoi_dung", payload, { sdt_khach: u.sdt_khach });
            // Cập nhật session local
            Object.assign(window.currentUser, payload);
            window.currentGuest = window.currentUser;
            const sessionKey = localStorage.getItem("tvl_user") ? "tvl_user" : "tvl_guest";
            localStorage.setItem(sessionKey, JSON.stringify(window.currentUser));
            window.hienToast("Đã lưu! ✅", "Thông tin hồ sơ đã được cập nhật.", "success");
            _capNhatHeaderState();
            // Tên đã hợp lệ → xóa cờ vi phạm (DB + localStorage) + đóng modal tối hậu thư nếu có
            window._xoaCanhBaoTen && window._xoaCanhBaoTen(u.sdt_khach);
            window._dongModalViPhamTen && window._dongModalViPhamTen();
        } catch (e) {
            window.hienToast("Lỗi", "Không thể lưu. Thử lại sau.", "danger");
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Lại'; }
        }
    };

    /* Đăng xuất */
    window.dangXuatUngDung = async function () {
        if (!await window.xacNhanModal("Đăng xuất tài khoản?", "🚪")) return;
        localStorage.removeItem("tvl_user");
        localStorage.removeItem("tvl_guest");
        window.currentUser  = null;
        window.currentGuest = null;
        // Cập nhật header ngay (ẩn avatar, hiện nút đăng nhập)
        _capNhatHeaderState();
        window.hienToast("Đã đăng xuất", "Hẹn gặp lại bạn! 🏸", "info");
        // Chuyển về tab Cá Nhân → hiện form đăng nhập
        setTimeout(() => chuyenTab("ca-nhan"), 400);
    };

    /* ─────────────────────────────────────────────────────────────
     * Callback ĐĂNG NHẬP THÀNH CÔNG — đăng ký để phan-he-khach-choi.js gọi lại
     * Cập nhật toàn bộ feed UI mà không cần reload trang
     * ───────────────────────────────────────────────────────────── */
    window._onDangNhapThanhCong = function (user) {
        // GIỮ _token: _luuSessionVaDangNhap (phan-he-khach-choi.js) đã set
        // window.currentGuest._token TRƯỚC khi gọi hook này. `user` (hồ sơ DB) KHÔNG
        // có _token → nếu gán thẳng sẽ MẤT token → mọi RPC token (guiThongBao,
        // layLichSuUyTin, datSlot/huySlot bảo mật) hỏng tới khi F5. Hợp nhất để giữ.
        const _tk = (window.currentGuest && window.currentGuest._token)
                 || (window.currentUser && window.currentUser._token) || null;
        const merged = _tk ? { ...user, _token: _tk } : user;
        window.currentUser  = merged;
        window.currentGuest = merged;

        // Cập nhật header
        _capNhatHeaderState();

        // Chuyển từ form login → profile section
        const loginSection   = document.getElementById("section-login");
        const profileSection = document.getElementById("section-profile");
        if (loginSection)   loginSection.style.display   = "none";
        if (profileSection) profileSection.style.display = "block";

        // Render thông tin profile
        _renderProfile();

        // Nếu đang ở tab Cá Nhân → cập nhật active state
        const tabSection = document.getElementById("tab-ca-nhan");
        if (tabSection && tabSection.style.display !== "none") {
            // Tab đang active, UI đã được cập nhật ở trên
        } else {
            // Không ở tab cá nhân → chuyển sang tab cá nhân để user thấy
            setTimeout(() => chuyenTab("ca-nhan"), 200);
        }

        // Quét tên vi phạm ngay sau khi đăng nhập thành công
        setTimeout(() => window.quetTenViPham && window.quetTenViPham(), 700);
    };

    /* ═══════════════════════════════════════════════════
     * CƯỠNG CHẾ ĐỔI TÊN — quét tên vi phạm + tối hậu thư 24h + khóa is_active
     *   Validate: window.kiemTraTenHopLe (bo-may-du-lieu.js).
     *   Timestamp cảnh báo lần đầu: cột DB `ten_canh_bao_luc` (primary) + localStorage
     *   fallback (an toàn khi cột chưa tồn tại / verify). Khóa = is_active=false.
     * ═══════════════════════════════════════════════════ */
    const _TEN_VP_24H = 24 * 60 * 60 * 1000;
    const _TEN_SNOOZE_2H = 2 * 60 * 60 * 1000; // "Bỏ qua (Hiện lại sau 2h)"
    // Font stack hệ thống hỗ trợ tiếng Việt 100% — chống nhảy dấu/lệch chữ trong modal
    const _MODAL_FONT = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
    let _quetTenBusy = false;
    let _tenColOK = null; // null=chưa biết · true=cột ten_canh_bao_luc có · false=chưa có (dùng localStorage, tránh spam 400)

    function _escTen(s) {
        return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Lưu mốc cảnh báo (ms) — DB `ten_canh_bao_luc` + localStorage bản sao
    async function _ghiMocCanhBao(sdt, ms) {
        try { localStorage.setItem("tvl_ten_vp_" + sdt, String(ms)); } catch (_) {}
        if (_tenColOK === false) return; // cột chưa có → chỉ localStorage (tránh spam 400)
        try { await window.dbEngine.ghi("nguoi_dung", { ten_canh_bao_luc: new Date(ms).toISOString() }, { sdt_khach: sdt }); }
        catch (_) { _tenColOK = false; }
    }
    // Đọc mốc cảnh báo (ms) — ưu tiên DB (nếu cột tồn tại), fallback localStorage. 0 nếu chưa có.
    async function _layMocCanhBao(sdt) {
        if (_tenColOK !== false) {
            const rows = await window.dbEngine.docThu("nguoi_dung", { eq: { sdt_khach: sdt }, select: "ten_canh_bao_luc" });
            if (rows === null) { _tenColOK = false; }          // đọc lỗi (cột chưa có) → khóa DB path
            else {
                _tenColOK = true;
                const v = rows[0] && rows[0].ten_canh_bao_luc;
                if (v) { const t = Date.parse(v); if (!isNaN(t)) return t; }
            }
        }
        return Number(localStorage.getItem("tvl_ten_vp_" + sdt) || 0) || 0;
    }
    // Xóa cờ cảnh báo (tên đã hợp lệ)
    window._xoaCanhBaoTen = async function (sdt) {
        if (!sdt) return;
        try { localStorage.removeItem("tvl_ten_vp_" + sdt); localStorage.removeItem("tvl_ten_snooze_" + sdt); } catch (_) {}
        if (_tenColOK === false) return;
        try { await window.dbEngine.ghi("nguoi_dung", { ten_canh_bao_luc: null }, { sdt_khach: sdt }); }
        catch (_) { _tenColOK = false; }
    };

    window._dongModalViPhamTen = function () {
        document.getElementById("modalViPhamTen")?.remove();
    };
    // "Bỏ qua (Hiện lại sau 2h)" → đóng modal + lưu mốc hiện-lại = now + 2h (per SĐT)
    window._boQuaTen2h = function () {
        const u = window.currentUser || window.currentGuest;
        if (u && u.sdt_khach) {
            try { localStorage.setItem("tvl_ten_snooze_" + u.sdt_khach, String(Date.now() + _TEN_SNOOZE_2H)); } catch (_) {}
        }
        window._dongModalViPhamTen();
    };
    // "Đổi ngay" → sang tab Cá Nhân + focus ô Họ tên
    window._doiTenNgay = function () {
        window._dongModalViPhamTen();
        if (window.chuyenTab) window.chuyenTab("ca-nhan");
        setTimeout(() => {
            const inp = document.getElementById("profileName");
            if (inp) { try { inp.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {} inp.focus(); try { inp.select(); } catch (_) {} }
        }, 380);
    };

    function _hienModalViPhamTen(kq, ts) {
        if (document.getElementById("modalViPhamTen") || document.getElementById("modalDaKhoaTen")) return;
        const gioConLai = Math.max(1, Math.ceil((_TEN_VP_24H - (Date.now() - ts)) / 3600000));
        const modal = document.createElement("div");
        modal.id = "modalViPhamTen";
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;";
        modal.innerHTML = `
            <div style="font-family:${_MODAL_FONT};background:#1a2233;border:1px solid #ef4444;border-radius:16px;padding:26px 22px;max-width:440px;width:100%;box-shadow:0 24px 70px rgba(0,0,0,0.7);">
                <div style="font-size:2.4rem;text-align:center;margin-bottom:6px;line-height:1;">⚠️</div>
                <h3 style="color:#ef4444;margin:0 0 12px;font-size:1.18rem;text-align:center;font-weight:700;letter-spacing:0.2px;line-height:1.3;">TÊN TÀI KHOẢN VI PHẠM</h3>
                <p style="color:#e2e8f0;font-size:0.92rem;margin:0 0 12px;line-height:1.6;font-weight:500;">${_escTen(kq.lyDo)}</p>
                <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);border-radius:10px;padding:11px 13px;margin:0 0 18px;">
                    <p style="color:#fca5a5;font-size:0.86rem;margin:0;line-height:1.6;font-weight:500;">
                        Bạn phải <strong style="font-weight:700;">ĐỔI TÊN NGAY</strong>. Nếu sau <strong style="font-weight:700;">24 giờ</strong> (còn ~${gioConLai}h) tên vẫn vi phạm, tài khoản sẽ bị <strong style="font-weight:700;">KHÓA</strong>.
                    </p>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button onclick="window._doiTenNgay()" style="font-family:inherit;flex:1 1 120px;padding:12px;background:#ef4444;color:#fff;border:none;border-radius:9px;font-weight:700;cursor:pointer;font-size:0.95rem;line-height:1.2;">Đổi ngay</button>
                    <button onclick="window._boQuaTen2h()" style="font-family:inherit;flex:1 1 150px;padding:12px 14px;background:transparent;color:#9ca3af;border:1px solid #374151;border-radius:9px;cursor:pointer;font-size:0.84rem;font-weight:600;line-height:1.2;white-space:nowrap;">Bỏ qua (Hiện lại sau 2h)</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    function _hienModalDaKhoaTen(kq) {
        document.getElementById("modalViPhamTen")?.remove();
        if (document.getElementById("modalDaKhoaTen")) return;
        const modal = document.createElement("div");
        modal.id = "modalDaKhoaTen";
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:100001;display:flex;align-items:center;justify-content:center;padding:16px;";
        modal.innerHTML = `
            <div style="font-family:${_MODAL_FONT};background:#1a2233;border:1px solid #ef4444;border-radius:16px;padding:28px 22px;max-width:420px;width:100%;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,0.8);">
                <div style="font-size:2.6rem;margin-bottom:8px;line-height:1;">🔒</div>
                <h3 style="color:#ef4444;margin:0 0 12px;font-size:1.2rem;font-weight:700;letter-spacing:0.2px;line-height:1.3;">TÀI KHOẢN ĐÃ BỊ KHÓA</h3>
                <p style="color:#e2e8f0;font-size:0.92rem;margin:0 0 18px;line-height:1.6;font-weight:500;">
                    Quá 24 giờ nhưng tên vẫn vi phạm (${_escTen(kq.lyDo)}). Tài khoản đã bị khóa. Liên hệ Admin để được hỗ trợ mở khóa.
                </p>
                <button onclick="document.getElementById('modalDaKhoaTen')?.remove()" style="font-family:inherit;padding:11px 26px;background:#ef4444;color:#fff;border:none;border-radius:9px;font-weight:700;cursor:pointer;font-size:0.92rem;">Đã hiểu</button>
            </div>`;
        document.body.appendChild(modal);
    }

    // Quét tên user hiện tại — kích hoạt khi open web/F5, đăng nhập, đổi tab
    window.quetTenViPham = async function () {
        if (_quetTenBusy) return;
        const u = window.currentUser || window.currentGuest;
        if (!u || !u.sdt_khach || !window.kiemTraTenHopLe) return;
        const kq = window.kiemTraTenHopLe(u.ten_khach || u.ten || "");
        if (kq.ok) { window._xoaCanhBaoTen(u.sdt_khach); window._dongModalViPhamTen(); return; }

        _quetTenBusy = true;
        try {
            let ts = await _layMocCanhBao(u.sdt_khach);
            if (!ts) { ts = Date.now(); await _ghiMocCanhBao(u.sdt_khach, ts); }

            if (Date.now() - ts > _TEN_VP_24H) {
                // Tối hậu thư hết hạn → KHÓA tài khoản
                try { await window.dbEngine.ghi("nguoi_dung", { is_active: false }, { sdt_khach: u.sdt_khach }); } catch (_) {}
                _hienModalDaKhoaTen(kq);
                try { localStorage.removeItem("tvl_user"); localStorage.removeItem("tvl_guest"); } catch (_) {}
                window.currentUser = null; window.currentGuest = null;
                _capNhatHeaderState();
                window.dungThongBao && window.dungThongBao();
            } else {
                // "Bỏ qua (Hiện lại sau 2h)": còn trong mốc hiện-lại → KHÔNG hiện modal nhắc
                let snoozeUntil = 0;
                try { snoozeUntil = Number(localStorage.getItem("tvl_ten_snooze_" + u.sdt_khach) || 0); } catch (_) {}
                if (Date.now() < snoozeUntil) return;   // còn trong 2h → bỏ qua (lock 24h vẫn chạy ở nhánh trên)
                _hienModalViPhamTen(kq, ts);
            }
        } finally { _quetTenBusy = false; }
    };

    /* ═══════════════════════════════════════════════════
     * TAB 2 — TÌM KÈO
     * ═══════════════════════════════════════════════════ */
    function _khoiTaoTabTimKeo() {
        if (window._napDropdownBoLoc)  window._napDropdownBoLoc();
        if (window._napDropdownDrawer) window._napDropdownDrawer();
        if (window.timKiemCaDau)       window.timKiemCaDau();
    }

    /* ═══════════════════════════════════════════════════
     * TAB 3 — ĐĂNG & QUẢN LÝ
     * ═══════════════════════════════════════════════════ */
    function _khoiTaoTabDangQuanLy() {
        if (!window.currentUser) {
            // Chưa đăng nhập — hiện prompt
            const prompt = document.getElementById("dql-login-prompt");
            if (prompt) prompt.style.display = "flex";
            const content = document.getElementById("dql-content");
            if (content) content.style.display = "none";
            return;
        }
        const prompt = document.getElementById("dql-login-prompt");
        if (prompt) prompt.style.display = "none";
        const content = document.getElementById("dql-content");
        if (content) content.style.display = "block";

        // Mặc định mở sub-tab "Đăng Ca Mới" nếu chưa có nút nào active
        const activeBtn = document.querySelector("#tab-dang-quan-ly .subtab-btn.active");
        if (!activeBtn) {
            chuyenSubTab("dang-quan-ly", "dang-ca");
        }

        // Khởi giao diện đăng ca từ phan-he-host.js nếu chưa init
        if (!window._hostDashboardInited) {
            window._hostDashboardInited = true;
            if (window.khoiTaoTrangHost) window.khoiTaoTrangHost();
        }

        // Tải danh sách ca đấu của tôi (sub-tab 3C)
        if (window.loadLichSuCaDauHost) {
            window.loadLichSuCaDauHost();
        }

        // Hiện và render Turnstile widget cho form đăng ca
        const tsHostWrap = document.getElementById("cfTurnstileHostWrap");
        if (tsHostWrap) tsHostWrap.style.display = "block";
        if (window._tvlRenderTs) window._tvlRenderTs("cfTurnstileHost");
    }

    /* ═══════════════════════════════════════════════════
     * TAB 4 — LỊCH SỬ & ĐÁNH GIÁ
     * ═══════════════════════════════════════════════════ */
    function _khoiTaoTabLichSu() {
        const prompt   = document.getElementById("ls-login-prompt");
        const navWrap  = document.getElementById("ls-nav-wrap");
        if (!window.currentUser) {
            if (prompt)  prompt.style.display  = "flex";
            if (navWrap) navWrap.style.display  = "none";
            return;
        }
        if (prompt)  prompt.style.display  = "none";
        if (navWrap) navWrap.style.display  = "block";

        // Mặc định sub-tab Lịch Sử Tham Gia
        chuyenSubTab("lich-su", "tham-gia");

        // Tải lịch sử tham gia từ phan-he-khach-choi.js
        if (window._taiLichSuDau) window._taiLichSuDau();
    }

    /* ═══════════════════════════════════════════════════
     * TAB 5 — GIỚI THIỆU (Landing page content)
     * Tải số liệu thực tế vào stats grid (gtHudSlots, gtHudMembers)
     * ═══════════════════════════════════════════════════ */
    let _gtDaLoad = false;
    async function _khoiTaoTabGioiThieu() {
        if (_gtDaLoad) return;
        if (!window.dbEngine) return;
        try {
            const [cacCaDau, cacDatSlot, cfgList] = await Promise.all([
                window.dbEngine.docThu("ca_dau",   {}),
                window.dbEngine.docThu("dat_slot",  {}),
                window.dbEngine.docThu("cau_hinh_he_thong", {})
            ]);
            // ── HUD stats ──
            if (cacCaDau) {
                const homNay = new Date().toISOString().split("T")[0];
                const soKeo = cacCaDau.filter(c => !c.da_chot_ca && (c.ngay_danh || "") >= homNay).length;
                const el = document.getElementById("gtHudSlots");
                if (el) el.textContent = Math.max(soKeo, 50).toLocaleString("vi-VN") + "+";
            }
            if (cacDatSlot) {
                const sdtSet = new Set(cacDatSlot.filter(s => s.sdt_khach).map(s => s.sdt_khach));
                const el = document.getElementById("gtHudMembers");
                if (el) el.textContent = (sdtSet.size + 499).toLocaleString("vi-VN") + "+";
            }
            // ── CMS: render nội dung động từ bảng cau_hinh_he_thong ──
            if (cfgList) {
                const cfg = {};
                cfgList.forEach(c => { if (c.id) cfg[c.id] = c.noi_dung_thong_bao || ""; });
                // text_quang_cao → hero description
                const descEl = document.getElementById("heroDescText");
                if (descEl && cfg["text_quang_cao"]) {
                    descEl.textContent = cfg["text_quang_cao"];
                }
                // qr_donate + tieu_de_donate + text_donate → khối donate footer
                const qrUrl   = cfg["qr_donate"]     || "";
                const tieude  = cfg["tieu_de_donate"] || "MỜI ADMIN LY CAFE CHỐT KÈO ☕";
                const wrap    = document.getElementById("donateSectionWrap");
                const img     = document.getElementById("donateQrImg");
                const titleEl = document.getElementById("donateTitleEl");
                const txt     = document.getElementById("donateTextEl");
                if (titleEl) titleEl.textContent = tieude;
                if (wrap) {
                    if (qrUrl) {
                        wrap.style.display = "block";
                        if (img) img.src = qrUrl;
                        if (txt) txt.textContent = cfg["text_donate"] || "";
                    } else {
                        wrap.style.display = "none";
                    }
                }
            }
            _gtDaLoad = true;
        } catch (e) { /* giữ nội dung mặc định khi lỗi mạng */ }
    }

    /* ═══════════════════════════════════════════════════
     * HEADER STATE — avatar / tên / nút đăng nhập
     * ═══════════════════════════════════════════════════ */
    function _capNhatHeaderState() {
        const loginBtn    = document.getElementById("headerLoginBtn");
        const userInfo    = document.getElementById("headerUserInfo");
        const userNameEl  = document.getElementById("headerUserName");
        // Mục "Tài Khoản / Đăng Nhập" trong menu 3 gạch mobile — ẩn khi đã đăng nhập
        // (icon trang cá nhân đã hiện sẵn ngoài header → tránh trùng lặp).
        const mbAccItem   = document.getElementById("mobileNavAccountItem");

        if (window.currentUser) {
            if (loginBtn)   loginBtn.style.display  = "none";
            if (userInfo)   userInfo.style.display  = "flex";
            if (mbAccItem)  mbAccItem.style.display = "none";
            if (userNameEl) userNameEl.textContent  = window.currentUser.ten_khach
                                                    || window.currentUser.sdt_khach
                                                    || "Tài khoản";
        } else {
            if (loginBtn)   loginBtn.style.display  = "inline-flex";
            if (userInfo)   userInfo.style.display  = "none";
            if (mbAccItem)  mbAccItem.style.display = "";
        }
    }
    window._capNhatHeaderState = _capNhatHeaderState;

    /* ═══════════════════════════════════════════════════
     * CONFIRM MODAL — dùng chung (nếu chưa có từ giao-dien.css)
     * ═══════════════════════════════════════════════════ */
    if (!window.xacNhanModal) {
        window.xacNhanModal = function (msg, icon) {
            return Promise.resolve(window.confirm((icon ? icon + " " : "") + msg));
        };
    }

    /* ═══════════════════════════════════════════════════
     * KHỞI ĐỘNG KHI DOM SẴN SÀNG
     * ═══════════════════════════════════════════════════ */
    document.addEventListener("DOMContentLoaded", function () {
        const check = setInterval(function () {
            if (window.dbEngine && window.hienToast) {
                clearInterval(check);
                window.khoiTaoUngDung();
            }
        }, 80);
    });

})();
