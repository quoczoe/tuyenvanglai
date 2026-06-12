/*
 * =========================================================================
 * 🔔 HỆ THỐNG THÔNG BÁO v1 — PHAN-HE-THONG-BAO.JS
 * Dự án: TUYENVANGLAI.IO.VN
 * Phương án: Polling 30s (theo docs/THIET-KE-THONG-BAO.md). Phạm vi v1: 7 sự kiện
 *            G1 / G2 / G3 / H1 / H2 / H3b / S1.
 *
 * Đọc/ghi/đánh-dấu CHỈ qua RPC SECURITY DEFINER (migration-thong-bao-v1.sql):
 *   ghi_thong_bao · lay_thong_bao · dem_thong_bao_chua_doc ·
 *   danh_dau_da_doc · danh_dau_tat_ca_da_doc
 * Mỗi RPC tự xác thực token phiên (guest_sessions) ↔ SĐT → không dựa filter client.
 *
 * EXPOSE:
 *   window.guiThongBao({nguoiNhan, loai, tieuDe, noiDung, linkData, gopGiay})
 *       → phát 1 thông báo (best-effort, fire-and-forget; KHÔNG bao giờ ném lỗi
 *         làm vỡ luồng chính). Token + SĐT người gửi lấy tự động từ currentGuest.
 *   window.khoiDongThongBao() / window.dungThongBao()  → bật/tắt chuông + poll.
 *   window.moDrawerThongBao() / window.dongDrawerThongBao()
 *   window.danhDauTatCaThongBao() / window.moThongBao(id)
 * =========================================================================
 */
(function () {
    "use strict";

    const _URL = "https://kyidswbpfafsoqsdhfpu.supabase.co";
    const _KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5aWRzd2JwZmFmc29xc2RoZnB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDI1ODksImV4cCI6MjA5NDkxODU4OX0.ustQ0xaRQqxyCWid1dkC-1YuhX0yA0wQJ5JOyq98TRY";

    const POLL_MS = 30000;     // 30s khi tab visible
    let _timer    = null;
    let _items    = [];        // danh sách thông báo đã tải (cho drawer)
    let _soChuaDoc = 0;
    let _dangMo   = false;     // drawer đang mở?
    let _visBound = false;     // đã gắn listener visibilitychange chưa

    // ── Supabase JS client dùng chung (tự khởi tạo, không phụ thuộc thứ tự load) ──
    function _client() {
        if (window._sbClient) return window._sbClient;
        if (window.supabase && window.supabase.createClient) {
            window._sbClient = window.supabase.createClient(_URL, _KEY);
            return window._sbClient;
        }
        return null;
    }

    // ── Actor hiện tại (người đăng nhập) — cần token + SĐT để gọi RPC ──
    function _actor() {
        const g = window.currentGuest;
        if (g && g._token && g.sdt_khach) {
            return { token: g._token, sdt: g.sdt_khach, ten: g.ten_khach || "" };
        }
        return null;
    }

    // ── escHTML (chuẩn XSS — đồng bộ cách làm cho toast) ──
    function _esc(s) {
        const d = document.createElement("div");
        d.textContent = (s == null) ? "" : String(s);
        return d.innerHTML;
    }

    // ── Thời gian tương đối tiếng Việt ──
    function _thoiGianTuongDoi(iso) {
        const t = new Date(iso).getTime();
        if (!t) return "";
        const s = Math.floor((Date.now() - t) / 1000);
        if (s < 60) return "vừa xong";
        const m = Math.floor(s / 60); if (m < 60) return m + " phút trước";
        const h = Math.floor(m / 60); if (h < 24) return h + " giờ trước";
        const d = Math.floor(h / 24); if (d < 7) return d + " ngày trước";
        return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    }

    // ── Màu theo MỨC ĐỘ sự kiện (KHÔNG dùng emoji/icon — chỉ left-border accent + chấm) ──
    //    Cao = đỏ #ff4444 · TB = cam #ff8800 · Thấp = xanh accent #00ff88
    const _META = {
        G1:  { mau: "#00ff88" }, // Thấp — host xác nhận đã tham gia (tin vui)
        G2:  { mau: "#ff4444" }, // Cao  — host hủy ca
        G3:  { mau: "#ff4444" }, // Cao  — bị đánh dấu bùng / khách hủy
        H1:  { mau: "#00ff88" }, // Thấp — khách đặt slot (tin vui)
        H2:  { mau: "#ff8800" }, // TB   — khách hủy slot
        H3b: { mau: "#ff4444" }, // Cao  — khách bùng kèo (ghi cho host)
        S1:  { mau: "#ff4444" }, // Cao  — tài khoản bị khóa
        G4:  { mau: "#ff8800" }, // TB   — host từ chối slot của khách (Nhóm 3)
        _:   { mau: "#94a3b8" }  // mặc định — trung tính
    };

    /* ═══════════════════════════════════════════════════
     * GHI THÔNG BÁO — gọi từ các điểm phát (fire-and-forget)
     * ═══════════════════════════════════════════════════ */
    window.guiThongBao = async function (o) {
        try {
            const a = _actor();
            const c = _client();
            if (!a || !c || !o || !o.nguoiNhan) return;
            await c.rpc("ghi_thong_bao", {
                p_token:         a.token,
                p_sdt_nguoi_gui: a.sdt,
                p_nguoi_nhan:    String(o.nguoiNhan),
                p_loai:          o.loai || "",
                p_tieu_de:       o.tieuDe || "",
                p_noi_dung:      o.noiDung != null ? o.noiDung : null,
                p_link_data:     o.linkData || {},
                p_gop_giay:      o.gopGiay || 0
            });
            // Nếu thông báo này dành cho CHÍNH actor (vd S1 tự khóa) → cập nhật badge ngay
            if (String(o.nguoiNhan) === String(a.sdt)) _poll();
        } catch (_) {
            // Im lặng — thông báo là phụ, không được chặn luồng chính.
        }
    };

    /* ═══════════════════════════════════════════════════
     * LỊCH SỬ ĐIỂM UY TÍN (Nhóm 3) — ghi (no-token) + đọc của chính mình (token)
     * RPC: ghi_lich_su_uy_tin / lay_lich_su_uy_tin (migration-lich-su-uy-tin-v1.sql)
     * ═══════════════════════════════════════════════════ */
    // Ghi 1 dòng lịch sử điểm — best-effort, fire-and-forget (KHÔNG chặn luồng chính).
    // o = { sdt, delta, lyDo, caId, tenSan, diemTruoc, diemSau }
    window.ghiLichSuUyTin = async function (o) {
        try {
            const c = _client();
            if (!c || !o || !o.sdt || o.delta == null || !o.lyDo) return;
            await c.rpc("ghi_lich_su_uy_tin", {
                p_sdt:        String(o.sdt),
                p_delta:      Math.round(o.delta),
                p_ly_do:      String(o.lyDo),
                p_ca_id:      o.caId != null ? String(o.caId) : null,
                p_ten_san:    o.tenSan != null ? String(o.tenSan) : null,
                p_diem_truoc: o.diemTruoc != null ? Math.round(o.diemTruoc) : null,
                p_diem_sau:   o.diemSau != null ? Math.round(o.diemSau) : null
            });
        } catch (_) { /* im lặng — lịch sử là phụ */ }
    };

    // Đọc lịch sử điểm của CHÍNH MÌNH (token-verified). Trả về MẢNG (rỗng nếu lỗi).
    window.layLichSuUyTin = async function (gioiHan) {
        try {
            const a = _actor();
            const c = _client();
            if (!a || !c) return [];
            const { data } = await c.rpc("lay_lich_su_uy_tin", {
                p_token: a.token, p_sdt: a.sdt, p_gioi_han: gioiHan || 50
            });
            if (data && data.status === "ok" && Array.isArray(data.data)) return data.data;
            return [];
        } catch (_) { return []; }
    };

    /* ═══════════════════════════════════════════════════
     * POLL — đếm chưa đọc (badge) + làm mới danh sách nếu drawer mở
     * ═══════════════════════════════════════════════════ */
    async function _poll() {
        const a = _actor();
        const c = _client();
        if (!a || !c) { _anChuong(); return; }
        _hienChuong();
        try {
            const { data } = await c.rpc("dem_thong_bao_chua_doc", { p_token: a.token, p_sdt: a.sdt });
            if (data && data.status === "ok") {
                _soChuaDoc = data.so_chua_doc || 0;
                _setBadge(_soChuaDoc);
            }
            if (_dangMo) await _taiDanhSach();
        } catch (_) { /* mạng lỗi — bỏ qua, lần poll sau thử lại */ }
    }

    async function _taiDanhSach() {
        const a = _actor();
        const c = _client();
        if (!a || !c) return;
        try {
            const { data } = await c.rpc("lay_thong_bao", {
                p_token: a.token, p_sdt: a.sdt, p_tu_luc: null, p_gioi_han: 50
            });
            if (data && data.status === "ok") {
                _items = Array.isArray(data.data) ? data.data : [];
                _render();
            }
        } catch (_) { /* bỏ qua */ }
    }

    /* ═══════════════════════════════════════════════════
     * RENDER — chuông/badge + danh sách trong drawer
     * ═══════════════════════════════════════════════════ */
    function _setBadge(n) {
        const b = document.getElementById("tbBadge");
        if (!b) return;
        if (n > 0) {
            b.textContent = n > 99 ? "99+" : String(n);
            b.style.display = "flex";
        } else {
            b.style.display = "none";
        }
    }
    function _hienChuong() { const el = document.getElementById("tbChuong"); if (el) el.style.display = "inline-flex"; }
    function _anChuong()   { const el = document.getElementById("tbChuong"); if (el) el.style.display = "none"; _setBadge(0); }

    function _render() {
        const body = document.getElementById("tbDrawerBody");
        if (!body) return;
        if (!_items.length) {
            body.innerHTML = `<div class="tb-empty"><span>Chưa có thông báo nào.</span></div>`;
            return;
        }
        body.innerHTML = _items.map(it => {
            const m = _META[it.loai] || _META._;
            const desc = it.noi_dung ? `<span class="tb-item-desc">${_esc(it.noi_dung)}</span>` : "";
            // KHÔNG icon/emoji: mức độ thể hiện qua left-border (inline) + chấm màu 8px.
            // Chưa đọc: thêm chấm xanh góc trái (.tb-dot).
            return `<button type="button" class="tb-item${it.da_doc ? "" : " tb-unread"}" style="border-left-color:${m.mau};" onclick="window.moThongBao('${_esc(it.id)}')">
                ${it.da_doc ? "" : `<span class="tb-dot" aria-label="chưa đọc"></span>`}
                <span class="tb-cat-dot" style="background:${m.mau};"></span>
                <span class="tb-item-main">
                    <span class="tb-item-title">${_esc(it.tieu_de)}</span>
                    ${desc}
                    <span class="tb-item-time">${_esc(_thoiGianTuongDoi(it.created_at))}</span>
                </span>
            </button>`;
        }).join("");
    }

    /* ═══════════════════════════════════════════════════
     * DRAWER — mở / đóng / đánh dấu tất cả / click 1 thông báo
     * ═══════════════════════════════════════════════════ */
    window.moDrawerThongBao = async function () {
        const ov = document.getElementById("tbOverlay");
        const dr = document.getElementById("tbDrawer");
        if (!dr) return;
        _dangMo = true;
        if (ov) ov.classList.add("tb-open");
        dr.classList.add("tb-open");
        document.body.style.overflow = "hidden";
        // Tải danh sách tươi mỗi lần mở
        const body = document.getElementById("tbDrawerBody");
        if (body && !_items.length) body.innerHTML = `<div class="tb-empty"><span>Đang tải…</span></div>`;
        await _taiDanhSach();
    };

    window.dongDrawerThongBao = function () {
        const ov = document.getElementById("tbOverlay");
        const dr = document.getElementById("tbDrawer");
        _dangMo = false;
        if (ov) ov.classList.remove("tb-open");
        if (dr) dr.classList.remove("tb-open");
        document.body.style.overflow = "";
    };

    window.danhDauTatCaThongBao = async function () {
        const a = _actor();
        const c = _client();
        if (!a || !c) return;
        try {
            await c.rpc("danh_dau_tat_ca_da_doc", { p_token: a.token, p_sdt: a.sdt });
        } catch (_) { /* bỏ qua */ }
        _items = _items.map(it => ({ ...it, da_doc: true }));
        _soChuaDoc = 0;
        _setBadge(0);
        _render();
    };

    // Click 1 thông báo → đánh dấu đã đọc + điều hướng đúng đích
    window.moThongBao = async function (id) {
        const it = _items.find(x => String(x.id) === String(id));
        if (!it) return;

        if (!it.da_doc) {
            it.da_doc = true;
            _soChuaDoc = Math.max(0, _soChuaDoc - 1);
            _setBadge(_soChuaDoc);
            _render();
            const a = _actor(); const c = _client();
            if (a && c) { try { await c.rpc("danh_dau_da_doc", { p_token: a.token, p_sdt: a.sdt, p_ids: [id] }); } catch (_) {} }
        }

        const ld = it.link_data || {};
        window.dongDrawerThongBao();

        try {
            if (ld.tab === "guestList" && ld.caId && typeof window.openGuestListModal === "function") {
                window.chuyenTab && window.chuyenTab("dang-quan-ly");
                window.openGuestListModal(ld.caId, ld.tenSan || "").catch(() => {});
            } else if (ld.tab === "lichSu") {
                window.chuyenTab && window.chuyenTab("lich-su");
            } else if (ld.tab === "timKeo") {
                window.chuyenTab && window.chuyenTab("tim-keo");
            }
            // tab 'khoa' (S1) / không có tab → giữ nguyên (chỉ đọc trong drawer)
        } catch (_) { /* điều hướng best-effort */ }
    };

    /* ═══════════════════════════════════════════════════
     * VÒNG ĐỜI — bật/tắt theo trạng thái đăng nhập + visibility
     * ═══════════════════════════════════════════════════ */
    function _khoiDongTimer() {
        _dungTimer();
        if (document.visibilityState === "visible") _timer = setInterval(_poll, POLL_MS);
    }
    function _dungTimer() { if (_timer) { clearInterval(_timer); _timer = null; } }

    function _onVis() {
        if (document.visibilityState === "visible") { _poll(); _khoiDongTimer(); }
        else { _dungTimer(); }   // tab ẩn → ngưng poll (tiết kiệm)
    }

    window.khoiDongThongBao = function () {
        if (!_visBound) { document.addEventListener("visibilitychange", _onVis); _visBound = true; }
        if (!_actor()) { _anChuong(); _dungTimer(); return; }
        _poll();
        _khoiDongTimer();
    };

    window.dungThongBao = function () {
        _dungTimer();
        _anChuong();
        _items = [];
        _soChuaDoc = 0;
        window.dongDrawerThongBao && window.dongDrawerThongBao();
    };

    // Tự khởi động sau khi session khôi phục xong (khoiTaoTrangKhach chạy bất đồng bộ).
    document.addEventListener("DOMContentLoaded", function () {
        setTimeout(function () { window.khoiDongThongBao(); }, 1500);
    });

    console.log("🔔 [Hệ thống Thông báo v1]: phan-he-thong-bao.js đã sẵn sàng.");
})();
