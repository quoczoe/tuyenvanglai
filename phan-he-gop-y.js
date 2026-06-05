/* =========================================================================
 * PHÂN HỆ GÓP Ý & ỦNG HỘ — phan-he-gop-y.js (v1.0)
 * Dự án: TUYENVANGLAI.IO.VN
 *
 * Popup modal 2 tab:
 *   Tab 1 — ☕ Ủng hộ: hiển thị QR donate từ CMS (cau_hinh_he_thong)
 *   Tab 2 — 💬 Góp ý: form rating + chip + textarea → INSERT gop_y_he_thong
 *                      + Telegram notification (fire-and-forget)
 * =========================================================================
 */

(function () {
    // ── Trạng thái module ──
    let _cmsData      = null;  // Cache CMS config (chỉ fetch 1 lần)
    let _tgToken      = "";
    let _tgChatId     = "";
    let _selectedStar = 0;     // Sao đang được chọn (1–5)
    let _selectedChip = "";    // Chip category đang active
    let _dangGui      = false; // Prevent double-submit

    // ── Rate limiting: tối đa 5 góp ý/ngày, cách nhau ít nhất 5 phút ──
    const _RL_MAX_DAY   = 5;
    const _RL_COOLDOWN  = 5 * 60 * 1000; // 5 phút (ms)

    function _docLichSuGopY() {
        try { return JSON.parse(localStorage.getItem("tvl_gopy_ts") || "[]"); }
        catch { return []; }
    }
    function _kiemTraRateLimit() {
        const now    = Date.now();
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const hist   = _docLichSuGopY().filter(ts => ts > dayAgo);
        const last   = hist[hist.length - 1];
        if (last && now - last < _RL_COOLDOWN) {
            const waitMin = Math.ceil((_RL_COOLDOWN - (now - last)) / 60000);
            return { ok: false, msg: `⏳ Vui lòng đợi ${waitMin} phút trước khi gửi tiếp.` };
        }
        if (hist.length >= _RL_MAX_DAY) {
            return { ok: false, msg: `📋 Bạn đã gửi ${_RL_MAX_DAY} góp ý hôm nay. Vui lòng thử lại vào ngày mai.` };
        }
        return { ok: true };
    }
    function _ghiNhanGopY() {
        const now    = Date.now();
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const hist   = _docLichSuGopY().filter(ts => ts > dayAgo);
        hist.push(now);
        localStorage.setItem("tvl_gopy_ts", JSON.stringify(hist));
    }

    /* ═══════════════════════════════════════════════════
     * MỞ MODAL
     * ═══════════════════════════════════════════════════ */
    /* ─── localStorage helpers ─── */
    function _layDanhGiaDaLuu() {
        try { return JSON.parse(localStorage.getItem("tvl_uho_rated") || "null"); }
        catch { return null; }
    }
    function _luuDanhGia(star) {
        localStorage.setItem("tvl_uho_rated", JSON.stringify({ star, ts: Date.now() }));
    }

    /* ─── Áp dụng mode: đã đánh giá hoặc chưa ─── */
    function _apDungCheDoRated() {
        const rated          = _layDanhGiaDaLuu();
        const ratingSection  = document.getElementById("uhoRatingSection");
        const daRatedWrap    = document.getElementById("uhoDaRatedWrap");
        const daRatedStars   = document.getElementById("uhoDaRatedStars");

        if (rated && rated.star >= 1) {
            // Đã đánh giá: ẩn form sao, hiện badge khoá
            if (ratingSection) ratingSection.style.display = "none";
            if (daRatedWrap)   daRatedWrap.style.display   = "block";
            if (daRatedStars) {
                daRatedStars.innerHTML = Array(5).fill(0).map((_, i) =>
                    `<span class="uho-star" style="color:${i < rated.star ? "#fbbf24" : "rgba(255,255,255,0.18)"};pointer-events:none;">★</span>`
                ).join("");
            }
            _selectedStar = rated.star; // pre-set để guiGopY dùng khi đã rated
        } else {
            // Chưa đánh giá: hiện form sao tương tác
            if (ratingSection) ratingSection.style.display = "block";
            if (daRatedWrap)   daRatedWrap.style.display   = "none";
            _selectedStar = 0;
        }
    }

    window.moUHoModal = async function () {
        const overlay = document.getElementById("uHoModalOverlay");
        if (!overlay) return;
        overlay.style.display = "flex";
        document.body.style.overflow = "hidden";

        // Fetch CMS data nếu chưa có
        await _loadCmsData();

        // Render tab Ủng hộ
        _renderDonate();

        // Setup trạng thái form góp ý (đã/chưa đánh giá)
        _apDungCheDoRated();

        // Mặc định: mở tab Ủng hộ
        chuyenTabUho("ungho");
    };

    /* ═══════════════════════════════════════════════════
     * ĐÓNG MODAL
     * ═══════════════════════════════════════════════════ */
    window.dongUHoModal = function () {
        const overlay = document.getElementById("uHoModalOverlay");
        if (overlay) overlay.style.display = "none";
        document.body.style.overflow = "";
        _resetForm();
    };

    /* ═══════════════════════════════════════════════════
     * CHUYỂN TAB TRONG MODAL
     * ═══════════════════════════════════════════════════ */
    window.chuyenTabUho = function (tab) {
        const tabUngho = document.getElementById("uhoTabUngho");
        const tabGopy  = document.getElementById("uhoTabGopy");
        const btnUngho = document.getElementById("uhoBtnUngho");
        const btnGopy  = document.getElementById("uhoBtnGopy");

        if (tab === "ungho") {
            if (tabUngho) tabUngho.style.display = "block";
            if (tabGopy)  tabGopy.style.display  = "none";
            if (btnUngho) btnUngho.classList.add("active");
            if (btnGopy)  btnGopy.classList.remove("active");
        } else {
            if (tabUngho) tabUngho.style.display = "none";
            if (tabGopy)  tabGopy.style.display  = "block";
            if (btnUngho) btnUngho.classList.remove("active");
            if (btnGopy)  btnGopy.classList.add("active");
        }
    };

    /* ═══════════════════════════════════════════════════
     * STAR RATING
     * ═══════════════════════════════════════════════════ */
    window.uhoHoverStar = function (n) {
        _paintStars(n);
    };
    window.uhoLeaveStar = function () {
        _paintStars(_selectedStar);
    };
    window.uhoClickStar = function (n) {
        _selectedStar = n;
        _paintStars(n);
    };

    function _paintStars(n) {
        for (let i = 1; i <= 5; i++) {
            const el = document.getElementById("uhoStar" + i);
            if (!el) continue;
            el.style.color     = i <= n ? "#fbbf24" : "rgba(255,255,255,0.18)";
            el.style.transform = i <= n ? "scale(1.15)" : "scale(1)";
        }
    }

    /* ═══════════════════════════════════════════════════
     * CHIP CATEGORY
     * ═══════════════════════════════════════════════════ */
    window.uhoChonChip = function (el, value) {
        // Bỏ active tất cả chip
        document.querySelectorAll(".uho-chip").forEach(c => c.classList.remove("active"));
        // Set active chip được click
        el.classList.add("active");
        _selectedChip = value;
    };

    /* ═══════════════════════════════════════════════════
     * GỬI GÓP Ý
     * ═══════════════════════════════════════════════════ */
    /* ─── Thông báo inline bên trong modal ─── */
    function _hienThongBaoUho(loai, noiDung) {
        const el = document.getElementById("uhoInlineMsg");
        if (!el) return;
        el.textContent = noiDung;
        el.style.display = "block";
        const styles = {
            success: { bg: "rgba(34,197,94,0.15)",  border: "1px solid rgba(34,197,94,0.4)",  color: "#4ade80" },
            warning: { bg: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", color: "#fbbf24" },
            danger:  { bg: "rgba(239,68,68,0.15)",  border: "1px solid rgba(239,68,68,0.4)",  color: "#f87171" }
        };
        const s = styles[loai] || styles.danger;
        el.style.background = s.bg;
        el.style.border      = s.border;
        el.style.color       = s.color;
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => { el.style.display = "none"; }, 6000);
    }

    window.guiGopY = async function () {
        if (_dangGui) return;

        // Kiểm tra rate limit trước khi validate
        const rl = _kiemTraRateLimit();
        if (!rl.ok) {
            _hienThongBaoUho("warning", rl.msg);
            return;
        }

        // Validate sao
        if (_selectedStar < 1) {
            const starRow = document.getElementById("uhoStarRow");
            if (starRow) {
                starRow.style.animation = "uho-shake 0.35s ease";
                setTimeout(() => { starRow.style.animation = ""; }, 400);
            }
            _hienThongBaoUho("warning", "⚠️ Vui lòng bấm chọn số sao đánh giá trước khi gửi.");
            return;
        }

        const noiDung  = (document.getElementById("uhoTextarea")?.value || "").trim();
        const loai     = _selectedChip || "Khác";
        const tenUser  = window.currentUser?.ten_khach
                      || window.currentGuest?.ten_khach
                      || "Khách vãng lai";
        const sdtUser  = window.currentUser?.sdt_khach
                      || window.currentGuest?.sdt_khach
                      || null;

        _dangGui = true;
        const btn = document.getElementById("uhoBtnGui");
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...'; }

        try {
            // INSERT vào Supabase
            await window.dbEngine.ghi("gop_y_he_thong", {
                ten_user:   tenUser,
                sdt_user:   sdtUser,
                so_sao:     _selectedStar,
                loai_gop_y: loai,
                noi_dung:   noiDung || null
            }, null);

            // Ghi nhận lần gửi vào lịch sử rate limit
            _ghiNhanGopY();

            // Lưu đánh giá sao vào localStorage (chỉ lần đầu chưa có)
            if (!_layDanhGiaDaLuu()) {
                _luuDanhGia(_selectedStar);
                _apDungCheDoRated(); // Chuyển sang mode đã đánh giá
            }

            // Telegram notification — fire-and-forget
            _guiTelegram(tenUser, _selectedStar, loai, noiDung);

            // Reset chips + textarea để sẵn sàng góp ý thêm, KHÔNG đóng modal
            const ta = document.getElementById("uhoTextarea");
            if (ta) ta.value = "";
            document.querySelectorAll(".uho-chip").forEach(c => c.classList.remove("active"));
            _selectedChip = "";

            _hienThongBaoUho("success", "✅ Cảm ơn bạn! Góp ý đã được ghi nhận. Bạn có thể tiếp tục góp ý thêm.");
        } catch (e) {
            _hienThongBaoUho("danger", "❌ Không gửi được. Vui lòng kiểm tra kết nối và thử lại.");
        } finally {
            _dangGui = false;
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi góp ý'; }
        }
    };

    /* ═══════════════════════════════════════════════════
     * HELPER: Load CMS data (cache sau lần đầu)
     * ═══════════════════════════════════════════════════ */
    async function _loadCmsData() {
        if (_cmsData !== null) return; // Đã có cache
        if (!window.dbEngine) return;

        try {
            const list = await window.dbEngine.docThu("cau_hinh_he_thong", {});
            if (!list) return;
            _cmsData = {};
            list.forEach(c => { if (c.id) _cmsData[c.id] = c.noi_dung_thong_bao || ""; });
            _tgToken  = _cmsData["telegram_bot_token"] || "";
            _tgChatId = _cmsData["telegram_chat_id"]   || "";
        } catch (e) {
            _cmsData = {}; // Tránh retry liên tục nếu lỗi mạng
        }
    }

    /* ═══════════════════════════════════════════════════
     * HELPER: Render tab Ủng hộ
     * ═══════════════════════════════════════════════════ */
    function _renderDonate() {
        if (!_cmsData) return;
        const qrUrl    = _cmsData["qr_donate"]      || "";
        const tieude   = _cmsData["tieu_de_donate"] || "MỜI ADMIN LY CAFE CHỐT KÈO ☕";
        const qrText   = _cmsData["text_donate"]    || "☕ Ủng hộ tác giả 1 ly cà phê nhé!";

        const titleEl2 = document.getElementById("uhoTitleEl");
        const imgEl    = document.getElementById("uhoQrImg");
        const textEl   = document.getElementById("uhoQrText");
        const emptyEl  = document.getElementById("uhoQrEmpty");
        if (titleEl2) titleEl2.textContent = tieude;

        if (qrUrl) {
            if (imgEl)   { imgEl.src = qrUrl; imgEl.style.display = "block"; }
            if (emptyEl) emptyEl.style.display = "none";
        } else {
            if (imgEl)   imgEl.style.display = "none";
            if (emptyEl) emptyEl.style.display = "flex";
        }
        if (textEl) textEl.textContent = qrText;
    }

    /* ═══════════════════════════════════════════════════
     * HELPER: Gửi Telegram (fire-and-forget)
     * ═══════════════════════════════════════════════════ */
    function _guiTelegram(ten, sao, loai, noiDung) {
        if (!_tgToken || !_tgChatId) return;
        const stars = "⭐".repeat(sao) + "☆".repeat(5 - sao);
        const msg   = `📬 *Góp ý mới*\n👤 ${ten}\n${stars} ${sao}/5\n🏷️ ${loai}${noiDung ? "\n💬 " + noiDung : ""}`;
        fetch(`https://api.telegram.org/bot${_tgToken}/sendMessage`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ chat_id: _tgChatId, text: msg, parse_mode: "Markdown" })
        }).catch(() => {}); // Im lặng nếu lỗi
    }

    /* ═══════════════════════════════════════════════════
     * HELPER: Reset form về trạng thái ban đầu
     * ═══════════════════════════════════════════════════ */
    function _resetForm() {
        // Chỉ reset chip + textarea — không xóa star vì _selectedStar giữ từ localStorage
        _selectedChip = "";
        _paintStars(_selectedStar); // Giữ sao đã chọn (0 nếu chưa rated)
        document.querySelectorAll(".uho-chip").forEach(c => c.classList.remove("active"));
        const ta  = document.getElementById("uhoTextarea");
        if (ta) ta.value = "";
        const msg = document.getElementById("uhoInlineMsg");
        if (msg) msg.style.display = "none";
    }

    /* ═══════════════════════════════════════════════════
     * Đóng khi click ngoài modal box
     * ═══════════════════════════════════════════════════ */
    document.addEventListener("click", function (e) {
        const overlay = document.getElementById("uHoModalOverlay");
        if (overlay && e.target === overlay) dongUHoModal();
    });

    /* ═══════════════════════════════════════════════════
     * Đóng khi bấm ESC
     * ═══════════════════════════════════════════════════ */
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            const overlay = document.getElementById("uHoModalOverlay");
            if (overlay && overlay.style.display !== "none") dongUHoModal();
        }
    });

})();
