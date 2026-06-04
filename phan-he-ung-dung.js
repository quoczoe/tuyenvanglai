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

        // Auto-open modal nếu URL có ?ca=<id>
        const caId = new URLSearchParams(window.location.search).get("ca");
        if (caId && window.moModalChiTietKeo) {
            setTimeout(() => window.moModalChiTietKeo(caId), 700);
        }

        // Xử lý Back/Forward qua popstate (History API)
        window.addEventListener("popstate", function (e) {
            const pSlug = window.location.pathname.replace(/^\//, "").replace(/^index\.html$/, "").trim();
            const tab   = SLUG_TO_TAB[pSlug] || (e.state?.tab) || "gioi-thieu";
            chuyenTab(tab, true);
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
        _setProfileField("profileTrindDo",  u.trinh_do  || "");
        _setProfileField("profileFacebook", u.facebook_link || "");
        _setProfileField("profileZalo",     u.sdt_zalo  || "");
        _setProfileField("profileGmail",    u.gmail     || "");
        _setProfileField("profileBio",      u.bio       || "");

        // Điểm uy tín — tải từ DB
        _taiDiemUyTin(u.sdt_khach);

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

        const payload = {
            ten_khach:    document.getElementById("profileName")?.value?.trim()     || u.ten_khach,
            gioi_tinh:    document.getElementById("profileGender")?.value           || u.gioi_tinh,
            trinh_do:     document.getElementById("profileTrindDo")?.value          || "",
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
        // Sync state
        window.currentUser  = user;
        window.currentGuest = user;

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

        if (window.currentUser) {
            if (loginBtn)   loginBtn.style.display  = "none";
            if (userInfo)   userInfo.style.display  = "flex";
            if (userNameEl) userNameEl.textContent  = window.currentUser.ten_khach
                                                    || window.currentUser.sdt_khach
                                                    || "Tài khoản";
        } else {
            if (loginBtn)   loginBtn.style.display  = "inline-flex";
            if (userInfo)   userInfo.style.display  = "none";
        }
    }

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
