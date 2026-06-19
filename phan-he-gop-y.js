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

        // Fetch CMS data nếu chưa có (cần cho Telegram notify khi gửi góp ý)
        await _loadCmsData();

        // Setup trạng thái form góp ý (đã/chưa đánh giá)
        _apDungCheDoRated();

        // Mặc định: mở tab "Gửi góp ý" (Ủng hộ đã tách ra Header → cuộn tới QR trang chủ)
        chuyenTabUho("gopy");
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
        const map = {
            gopy:   { tab: "uhoTabGopy",   btn: "uhoBtnGopy" },
            lichsu: { tab: "uhoTabLichSu", btn: "uhoBtnLichSu" }
        };
        const active = map[tab] ? tab : "gopy";
        Object.keys(map).forEach(k => {
            const t = document.getElementById(map[k].tab);
            const b = document.getElementById(map[k].btn);
            if (t) t.style.display = k === active ? "block" : "none";
            if (b) b.classList.toggle("active", k === active);
        });
        if (active === "lichsu") _taiLichSuGopY();
    };

    /* ═══════════════════════════════════════════════════
     * LỊCH SỬ GÓP Ý CỦA TÔI — fetch qua RPC token-verified
     * ═══════════════════════════════════════════════════ */
    const _LS_TT = {
        cho_xu_ly:      { nhan: "Chờ xử lý",      color: "#94a3b8", bg: "rgba(148,163,184,0.16)" },
        dang_thuc_hien: { nhan: "Đang thực hiện", color: "#60a5fa", bg: "rgba(96,165,250,0.16)" },
        da_xong:        { nhan: "Đã xong",        color: "#4ade80", bg: "rgba(74,222,128,0.16)" },
        tu_choi:        { nhan: "Từ chối",        color: "#f87171", bg: "rgba(248,113,113,0.16)" }
    };
    function _escLs(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    async function _taiLichSuGopY() {
        const body = document.getElementById("uhoLichSuBody");
        if (!body) return;

        const actor = window.currentUser || window.currentGuest;
        if (!actor || !actor.sdt_khach || !actor._token) {
            body.innerHTML = `<div class="uho-ls-empty">🔒 Vui lòng đăng nhập để xem lịch sử góp ý của bạn.</div>`;
            return;
        }

        body.innerHTML = `<div class="uho-ls-empty">Đang tải...</div>`;
        let rows = [];
        try {
            rows = await window.guestRPC.layGopYCuaToi(actor._token, actor.sdt_khach);
        } catch (e) {
            body.innerHTML = `<div class="uho-ls-empty">❌ Không tải được lịch sử. Kiểm tra kết nối và thử lại.</div>`;
            return;
        }
        if (!rows || rows.length === 0) {
            body.innerHTML = `<div class="uho-ls-empty">📭 Bạn chưa gửi góp ý nào.<br>Hãy chia sẻ ý kiến ở tab "💬 Góp ý" nhé!</div>`;
            return;
        }

        body.innerHTML = rows.map(g => {
            const tt   = _LS_TT[g.trang_thai] || _LS_TT.cho_xu_ly;
            const sao  = Math.max(0, Math.min(5, g.so_sao || 0));
            const stars = sao ? `<span class="uho-ls-stars">${"★".repeat(sao)}</span>` : "";
            const loai = g.loai_gop_y ? `<span class="uho-ls-loai">${_escLs(g.loai_gop_y)}</span>` : "";
            let thoiGian = "—";
            if (g.created_at) {
                const d = new Date(g.created_at);
                thoiGian = `${d.toLocaleDateString("vi-VN")} ${d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}`;
            }
            const nd = g.noi_dung ? `<div class="uho-ls-nd">${_escLs(g.noi_dung)}</div>`
                                  : `<div class="uho-ls-nd" style="color:#475569;font-style:italic;">(Chỉ đánh giá sao, không kèm nội dung)</div>`;
            const reply = g.noi_dung_phan_hoi
                ? `<div class="uho-ls-reply">💬 Admin phản hồi: ${_escLs(g.noi_dung_phan_hoi)}</div>` : "";
            return `<div class="uho-ls-card">
                <div class="uho-ls-top">
                    <span>${stars}${loai}</span>
                    <span class="uho-ls-badge" style="color:${tt.color};background:${tt.bg};">${tt.nhan}</span>
                </div>
                ${nd}
                <div class="uho-ls-time" style="margin-top:7px;">🕒 ${thoiGian}</div>
                ${reply}
            </div>`;
        }).join("");
    }

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

        // ── CHẶN KHÁCH CHƯA ĐĂNG NHẬP ──────────────────────────────────────
        // Chỉ user đã định danh (currentUser/currentGuest có sdt_khach) mới gửi.
        const _actor = window.currentUser || window.currentGuest;
        if (!_actor || !_actor.sdt_khach) {
            _hienThongBaoUho("warning", "🔒 Vui lòng đăng nhập để gửi góp ý / đánh giá.");
            return;
        }

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

        // ── BẮT BUỘC NHẬP NỘI DUNG ─────────────────────────────────────────
        // Chặn vote sao trống không kèm chữ (góp ý rỗng, vô nghĩa).
        if (noiDung.length < 5) {
            const ta = document.getElementById("uhoTextarea");
            if (ta) {
                ta.style.animation = "uho-shake 0.35s ease";
                setTimeout(() => { ta.style.animation = ""; }, 400);
                try { ta.focus(); } catch (_) {}
            }
            _hienThongBaoUho("warning", "✍️ Vui lòng nhập nội dung góp ý (tối thiểu 5 ký tự) — không nhận đánh giá trống.");
            return;
        }

        const loai     = _selectedChip || "Khác";
        const tenUser  = _actor.ten_khach || "Người dùng";
        const sdtUser  = _actor.sdt_khach || null;

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
