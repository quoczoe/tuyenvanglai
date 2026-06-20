/* =========================================================================
 * ⚙️ BỘ MÁY DỮ LIỆU — BO-MAY-DU-LIEU.JS (v2.0)
 * Dự án: TUYENVANGLAI.IO.VN
 *
 * THAY ĐỔI v2.0 (2026-05-24):
 * - XÓA HOÀN TOÀN localStorage fallback cho dữ liệu nghiệp vụ
 * - localStorage CHỈ dùng để lưu 2 loại định danh:
 *     + tvl_host_key  → Mã Key Host kích hoạt
 *     + tvl_guest     → { ten, sdt } đăng nhập nhanh Khách
 * - Toàn bộ I/O ca đấu / đặt slot / đánh giá → Supabase REST API
 * - Mất mạng → thông báo lỗi trực quan, KHÔNG dùng data local
 * =========================================================================
 */

(function () {

    /* ═══════════════════════════════════════════════════════════════
     * 0. ĐỊNH DẠNG TIỀN — ĐƠN VỊ "K" DÙNG CHUNG TOÀN HỆ THỐNG
     * Quy tắc: 75.000đ → "75K" · 1.250.000đ → "1.250K" · số lẻ <1000đ
     *          làm tròn tới 0,1K (vd 75.500đ → "75,5K"). vi-VN: "." ngăn nghìn, "," thập phân.
     * Mọi nơi render giá trị tiền PHẢI dùng hàm này (các _formatVND/_fmtK cũ đã route về đây).
     * ═══════════════════════════════════════════════════════════════ */
    window.formatTienK = function (n) {
        const v = Math.round(Number(n) || 0);            // số tiền (đ)
        const k = Math.round((v / 1000) * 10) / 10;       // quy ra K, làm tròn 0,1K
        return k.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "K";
    };

    /* ═══════════════════════════════════════════════════════════════
     * 0B. BẢNG THƯỞNG/PHẠT UY TÍN — SSOT DUY NHẤT
     * Mọi nơi tính điểm uy tín PHẢI đọc từ window.DIEM_UY_TIN — KHÔNG hardcode
     * con số phạt rải rác. Chỉnh mốc/mức tại ĐÚNG MỘT chỗ này.
     *
     * Thang giờ khai báo dạng mảng mốc {phut, diem} XẾP GIẢM dần theo `phut`:
     *   - phần tử ĐẦU (phut lớn nhất) = ngưỡng MIỄN phạt, áp dụng khi
     *     phutConLai > phut (so sánh NGHIÊM ngặt > → đúng mốc vẫn bị phạt).
     *   - các phần tử sau: áp dụng khi phutConLai >= phut.
     * Dùng window.tinhDiemPhatTheoGio(thang, phutConLai) để tra cứu.
     * ═══════════════════════════════════════════════════════════════ */
    window.DIEM_UY_TIN = {
        SAN: 0,            // điểm sàn (không tụt dưới)
        TRAN: 100,         // điểm trần (không vượt)

        THAM_GIA_OK: 2,    // host xác nhận khách "Đã tham gia" → +2 (cap 100)

        // KHÁCH hủy slot — phạt theo khoảng cách (phút) tới giờ đánh
        //   > 4h: 0 · 2h–4h: -2 · 30p–2h: -4 · < 30p: -6
        KHACH_HUY: [
            { phut: 240, diem: 0 },   // > 4h  → miễn phạt
            { phut: 120, diem: -2 },  // 2h–4h
            { phut: 30,  diem: -4 },  // 30p–2h
            { phut: 0,   diem: -6 }   // < 30p
        ],

        // HOST hủy ca ĐÃ CÓ NGƯỜI ĐẶT — thang tương tự, nặng hơn
        //   > 4h: 0 · 2h–4h: -3 · 30p–2h: -6 · < 30p: -8
        HOST_HUY: [
            { phut: 240, diem: 0 },
            { phut: 120, diem: -3 },
            { phut: 30,  diem: -6 },
            { phut: 0,   diem: -8 }
        ],

        // BÙNG KÈO (không đến không báo) — "quá tam ba bận", đếm số lần
        // trong CỬA SỔ LĂN `cuaSoNgay` ngày gần nhất.
        BUNG: {
            cuaSoNgay: 30,     // cửa sổ lăn 30 ngày
            lan1: -10,         // lần 1 trong cửa sổ
            lan2: -20,         // lần 2 trong cửa sổ (kèm cảnh báo)
            khoaTuLan: 3       // từ lần 3 → khóa tài khoản tạm thời (is_active=false)
        },

        // Mốc ngưỡng quyền lợi (giữ nguyên logic cũ)
        NGUONG: {
            khoa: 40,          // < 40 → khóa đặt slot
            siet: 60,          // 40–59 → siết 1 slot/ngày
            uyTin: 80          // ≥ 80 → quyền lợi highTrust
        }
    };

    /* Tra điểm phạt theo thang giờ. `phutConLai` = số phút còn lại tới giờ đánh
     * (âm = đã qua giờ → coi như mốc thấp nhất). Trả về số ÂM hoặc 0. */
    window.tinhDiemPhatTheoGio = function (thang, phutConLai) {
        if (!Array.isArray(thang) || !thang.length) return 0;
        for (let i = 0; i < thang.length; i++) {
            const t = thang[i];
            if (i === 0) { if (phutConLai > t.phut) return t.diem; }   // ngưỡng miễn: strict >
            else if (phutConLai >= t.phut) return t.diem;
        }
        return thang[thang.length - 1].diem; // dưới mốc thấp nhất → mức nặng nhất
    };

    /* Số phút còn lại từ BÂY GIỜ tới giờ đánh (GMT+7 — trình duyệt VN chạy giờ local).
     * ngayDanh "YYYY-MM-DD", gioBatDau "HH:MM[:SS]". Thiếu dữ liệu → null. */
    window.phutConLaiToiGioDanh = function (ngayDanh, gioBatDau) {
        if (!ngayDanh || !gioBatDau) return null;
        const start = new Date(ngayDanh + "T" + gioBatDau);
        if (isNaN(start.getTime())) return null;
        return Math.round((start.getTime() - Date.now()) / 60000);
    };

    /* Mô tả thời gian còn lại cho UI xác nhận: "1h25p", "45p", "đã quá giờ". */
    window.moTaThoiGianConLai = function (phut) {
        if (phut == null) return "";
        if (phut < 0) return "đã quá giờ đánh";
        const h = Math.floor(phut / 60);
        const m = phut % 60;
        if (h > 0 && m > 0) return `${h}h${m}p`;
        if (h > 0) return `${h}h`;
        return `${m}p`;
    };

    /* ── SSOT THỜI ĐIỂM CA (GMT+7) — XỬ LÝ CA QUA NỬA ĐÊM ──────────────
     * Giờ lưu dạng "HH:MM"; new Date("YYYY-MM-DDTHH:MM") (KHÔNG offset) = giờ LOCAL
     * = GMT+7 trên trình duyệt VN, nhất quán với Date.now(). Bug ca 22:00–00:00:
     * gio_ket_thuc "00:00" parse ra 00:00 ĐẦU ngày (đã qua) → phải +1 NGÀY khi
     * gio_ket_thuc <= gio_bat_dau. Mọi nơi tính "ca đã kết thúc?" PHẢI dùng 2 hàm này. */
    window.thoiDiemBatDauCa = function (ngayDanh, gioBatDau) {
        if (!ngayDanh || !gioBatDau) return null;
        const t = new Date(ngayDanh + "T" + gioBatDau);
        return isNaN(t.getTime()) ? null : t.getTime();
    };
    window.thoiDiemKetThucCa = function (ngayDanh, gioBatDau, gioKetThuc) {
        if (!ngayDanh || !gioKetThuc) return null;
        let end = new Date(ngayDanh + "T" + gioKetThuc);
        if (isNaN(end.getTime())) return null;
        const start = gioBatDau ? new Date(ngayDanh + "T" + gioBatDau) : null;
        // Ca qua nửa đêm: giờ kết thúc <= giờ bắt đầu → kết thúc thuộc NGÀY HÔM SAU
        if (start && !isNaN(start.getTime()) && end.getTime() <= start.getTime()) {
            end = new Date(end.getTime() + 24 * 3600 * 1000);
        }
        return end.getTime();
    };

    /* PHA của ca theo giờ (GMT+7) — SSOT cho khóa trạng thái + badge.
     *   "truoc" : chưa tới giờ bắt đầu  → host chỉ "Từ chối khách"
     *   "trong" : đang trong giờ        → host chọn "Đã tham gia"/"Bùng kèo"
     *   "sau"   : đã qua giờ kết thúc    → host chốt trạng thái cuối
     * ca: { ngay_danh, gio_bat_dau, gio_ket_thuc }. Thiếu dữ liệu → null. Ca qua đêm OK. */
    window.phaCaDau = function (ca) {
        if (!ca) return null;
        const start = window.thoiDiemBatDauCa(ca.ngay_danh, ca.gio_bat_dau);
        if (start == null) return null;
        const now = Date.now();
        if (now < start) return "truoc";
        const end = window.thoiDiemKetThucCa(ca.ngay_danh, ca.gio_bat_dau, ca.gio_ket_thuc);
        if (end == null) return "trong"; // không có giờ kết thúc → coi như đang trong giờ
        return now <= end ? "trong" : "sau";
    };

    /* ═══════════════════════════════════════════════════════════════
     * 1. DỮ LIỆU TĨnh ĐỊA LÝ — 63 TỈNH THÀNH VIỆT NAM
     * Dùng cho dropdown Tỉnh/Thành + Quận/Huyện trên form
     * ═══════════════════════════════════════════════════════════════ */
    window.MOCK_PROVINCES = [
        // ── ƯU TIÊN ĐẦU: HCM & HÀ NỘI ──
        { name: "TP. Hồ Chí Minh", districts: ["Quận 1", "Quận 3", "Quận 4", "Quận 5", "Quận 6", "Quận 7", "Quận 8", "Quận 10", "Quận 11", "Quận 12", "Tân Bình", "Bình Thạnh", "Gò Vấp", "Thủ Đức", "Phú Nhuận", "Tân Phú", "Bình Tân", "Hóc Môn", "Củ Chi", "Nhà Bè", "Bình Chánh", "Cần Giờ"] },
        { name: "Hà Nội", districts: ["Ba Đình", "Hoàn Kiếm", "Tây Hồ", "Long Biên", "Cầu Giấy", "Đống Đa", "Hai Bà Trưng", "Hoàng Mai", "Thanh Xuân", "Sóc Sơn", "Đông Anh", "Gia Lâm", "Nam Từ Liêm", "Thanh Trì", "Bắc Từ Liêm", "Mê Linh", "Hà Đông", "Sơn Tây", "Ba Vì", "Chương Mỹ", "Đan Phượng", "Hoài Đức", "Mỹ Đức", "Phú Xuyên", "Quốc Oai", "Thạch Thất", "Thanh Oai", "Thường Tín", "Ứng Hòa"] },
        // ── TIẾP THEO: CÁC TỈNH THÀNH KHÁC ──
        { name: "Đà Nẵng", districts: ["Hải Châu", "Thanh Khê", "Sơn Trà", "Ngũ Hành Sơn", "Liên Chiểu", "Cẩm Lệ", "Hòa Vang", "Hoàng Sa"] },
        { name: "Bình Dương", districts: ["Thủ Dầu Một", "Thuận An", "Dĩ An", "Bến Cát", "Tân Uyên", "Bàu Bàng", "Dầu Tiếng", "Phú Giáo", "Bắc Tân Uyên"] },
        { name: "Đồng Nai", districts: ["Biên Hòa", "Long Khánh", "Cẩm Mỹ", "Định Quán", "Long Thành", "Nhơn Trạch", "Tân Phú", "Thống Nhất", "Trảng Bom", "Vĩnh Cửu", "Xuân Lộc"] },
        { name: "Cần Thơ", districts: ["Ninh Kiều", "Bình Thủy", "Cái Răng", "Ô Môn", "Thốt Nốt", "Phong Điền", "Cờ Đỏ", "Thới Lai", "Vĩnh Thạnh"] },
        { name: "Hải Phòng", districts: ["Hồng Bàng", "Ngô Quyền", "Lê Chân", "Hải An", "Kiến An", "Đồ Sơn", "Dương Kinh", "Thủy Nguyên", "An Dương", "An Lão", "Kiến Thụy", "Tiên Lãng", "Vĩnh Bảo", "Cát Hải", "Bạch Long Vĩ"] },
        { name: "Bà Rịa - Vũng Tàu", districts: ["Vũng Tàu", "Bà Rịa", "Phú Mỹ", "Long Điền", "Đất Đỏ", "Châu Đức", "Xuyên Mộc", "Côn Đảo"] },
        { name: "Lâm Đồng", districts: ["Đà Lạt", "Bảo Lộc", "Lạc Dương", "Đơn Dương", "Đức Trọng", "Lâm Hà", "Di Linh", "Bảo Lâm", "Đạ Huoai", "Đạ Tẻh", "Cát Tiên", "Đam Rông"] },
        { name: "Khánh Hòa", districts: ["Nha Trang", "Cam Ranh", "Ninh Hòa", "Vạn Ninh", "Diên Khánh", "Khánh Vĩnh", "Khánh Sơn", "Trường Sa", "Cam Lâm"] },
        { name: "An Giang", districts: ["Long Xuyên", "Châu Đốc", "Tân Châu", "An Phú", "Tịnh Biên", "Tri Tôn", "Châu Phú", "Chợ Mới", "Phú Tân", "Thoại Sơn", "Châu Thành"] },
        { name: "Bạc Liêu", districts: ["Bạc Liêu", "Giá Rai", "Hồng Dân", "Phước Long", "Vĩnh Lợi", "Đông Hải", "Hòa Bình"] },
        { name: "Bắc Giang", districts: ["Bắc Giang", "Việt Yên", "Hiệp Hòa", "Lạng Giang", "Lục Nam", "Lục Ngạn", "Sơn Động", "Tân Yên", "Yên Dũng", "Yên Thế"] },
        { name: "Bắc Kạn", districts: ["Bắc Kạn", "Ba Be", "Bạch Thông", "Chợ Đồn", "Chợ Mới", "Na Rì", "Ngân Sơn", "Pác Nặm"] },
        { name: "Bắc Ninh", districts: ["Bắc Ninh", "Từ Sơn", "Quế Võ", "Thuận Thành", "Gia Bình", "Lương Tài", "Tiên Du", "Yên Phong"] },
        { name: "Bến Tre", districts: ["Bến Tre", "Ba Tri", "Bình Đại", "Châu Thành", "Chợ Lách", "Mỏ Cày Bắc", "Mỏ Cày Nam", "Thạnh Phú", "Giồng Trôm"] },
        { name: "Bình Định", districts: ["Quy Nhơn", "An Nhơn", "Hoài Nhơn", "An Lão", "Hoài Ân", "Phù Cát", "Phù Mỹ", "Tuy Phước", "Tây Sơn", "Vân Canh", "Vĩnh Thạnh"] },
        { name: "Bình Phước", districts: ["Đồng Xoài", "Bình Long", "Phước Long", "Chơn Thành", "Đồng Phú", "Bù Đăng", "Bù Đốp", "Bù Gia Mập", "Lộc Ninh", "Hớn Quản", "Phú Riềng"] },
        { name: "Bình Thuận", districts: ["Phan Thiết", "La Gi", "Tuy Phong", "Bắc Bình", "Hàm Thuận Bắc", "Hàm Thuận Nam", "Tánh Linh", "Đức Linh", "Hàm Tân", "Phú Quy"] },
        { name: "Cà Mau", districts: ["Cà Mau", "Cái Nước", "Đầm Dơi", "Năm Căn", "Ngọc Hiển", "Phú Tân", "Thới Bình", "Trần Văn Thời", "U Minh"] },
        { name: "Cao Bằng", districts: ["Cao Bằng", "Bảo Lạc", "Bảo Lâm", "Hạ Lang", "Hà Quảng", "Hòa An", "Nguyên Bình", "Quảng Hòa", "Thạch An", "Trùng Khánh"] },
        { name: "Đắk Lắk", districts: ["Buôn Ma Thuột", "Buôn Hồ", "Buôn Đôn", "Cư Kuin", "Cư M'gar", "Ea H'leo", "Ea Kar", "Ea Súp", "Krông Ana", "Krông Bông", "Krông Búk", "Krông Pắc", "Krông Năng", "Krông Trắc", "M'Drắk"] },
        { name: "Đắk Nông", districts: ["Gia Nghĩa", "Cư Jút", "Đắk Glong", "Đắk Mil", "Đắk R'lấp", "Đắk Song", "Krông Nô", "Tuy Đức"] },
        { name: "Điện Biên", districts: ["Điện Biên Phủ", "Mường Lay", "Điện Biên", "Điện Biên Đông", "Mường Ảng", "Mường Chà", "Mường Nhé", "Nậm Pồ", "Tủa Chùa", "Tuần Giáo"] },
        { name: "Đồng Tháp", districts: ["Cao Lãnh", "Sa Đéc", "Hồng Ngự", "Huyện Cao Lãnh", "Huyện Hồng Ngự", "Lai Vung", "Lấp Vò", "Tam Nông", "Tân Hồng", "Thanh Bình", "Tháp Mười", "Châu Thành"] },
        { name: "Gia Lai", districts: ["Pleiku", "An Khê", "Ayun Pa", "Chư Păh", "Chư Prông", "Chư Sê", "Đak Đoa", "Đak Pơ", "Đức Cơ", "Ia Grai", "Ia Pa", "K'Bang", "Kông Chro", "Krông Pa", "Mang Yang", "Phú Thiện", "Chư Pưh"] },
        { name: "Hà Giang", districts: ["Hà Giang", "Bắc Mê", "Bắc Quang", "Đồng Văn", "Hoàng Su Phì", "Mèo Vạc", "Quản Bạ", "Quang Bình", "Vị Xuyên", "Xín Mần", "Yên Minh"] },
        { name: "Hà Nam", districts: ["Phủ Lý", "Duy Tiên", "Kim Bảng", "Lý Nhân", "Thanh Liêm", "Bình Lục"] },
        { name: "Hà Tĩnh", districts: ["Hà Tĩnh", "Hồng Lĩnh", "Kỳ Anh", "Cẩm Xuyên", "Can Lộc", "Đức Thọ", "Hương Khê", "Hương Sơn", "Kỳ Anh (Huyện)", "Nghi Xuân", "Thạch Hà", "Vũ Quang", "Lộc Hà"] },
        { name: "Hải Dương", districts: ["Hải Dương", "Chí Linh", "Kinh Môn", "Bình Giang", "Cẩm Giàng", "Gia Lộc", "Kim Thành", "Nam Sách", "Thanh Hà", "Thanh Miện", "Tứ Kỳ", "Ninh Giang"] },
        { name: "Hậu Giang", districts: ["Vị Thanh", "Ngã Bảy", "Long Mỹ", "Vị Thủy", "Long Mỹ (Huyện)", "Phụng Hiệp", "Châu Thành", "Châu Thành A"] },
        { name: "Hòa Bình", districts: ["Hòa Bình", "Lương Sơn", "Cao Phong", "Đà Bắc", "Kim Bôi", "Lạc Sơn", "Lạc Thủy", "Mai Châu", "Tân Lạc", "Yên Thủy"] },
        { name: "Hưng Yên", districts: ["Hưng Yên", "Mỹ Hào", "Ân Thi", "Khoái Châu", "Kim Động", "Phù Cừ", "Tiên Lữ", "Văn Giang", "Văn Lâm", "Yên Mỹ"] },
        { name: "Kiên Giang", districts: ["Rạch Giá", "Hà Tiên", "Phú Quốc", "Kiên Lương", "Hòn Đất", "Tân Hiệp", "Châu Thành", "Giồng Riềng", "Gò Quao", "An Biên", "An Minh", "Vĩnh Thuận", "Kiên Hải", "Giang Thành"] },
        { name: "Kon Tum", districts: ["Kon Tum", "Đăk Hà", "Đăk Tô", "Đăk Glei", "Sa Thầy", "Kon Rẫy", "Kon Plông", "Ngọc Hồi", "Tu Mơ Rông", "Ia H'Drai"] },
        { name: "Lai Châu", districts: ["Lai Châu", "Mường Tè", "Phong Thổ", "Sìn Hồ", "Tam Đường", "Than Uyên", "Tân Uyên", "Nậm Nhùn"] },
        { name: "Lạng Sơn", districts: ["Lạng Sơn", "Tràng Định", "Bình Gia", "Văn Lãng", "Bắc Sơn", "Văn Quan", "Cao Lộc", "Lộc Bình", "Chi Lăng", "Đình Lập", "Hữu Lũng"] },
        { name: "Lào Cai", districts: ["Lào Cai", "Sa Pa", "Bát Xát", "Mường Khương", "Si Ma Cai", "Bắc Hàng", "Bảo Thắng", "Bảo Yên", "Văn Bàn"] },
        { name: "Long An", districts: ["Tân An", "Kiến Tường", "Tân Hưng", "Vĩnh Hưng", "Mộc Hóa", "Tân Thạnh", "Thạnh Hóa", "Đức Huệ", "Đức Hòa", "Bến Lức", "Thủ Thừa", "Tân Trụ", "Cần Đước", "Cần Giuộc", "Châu Thành"] },
        { name: "Nam Định", districts: ["Nam Định", "Mỹ Lộc", "Vụ Bản", "Ý Yên", "Nghĩa Hưng", "Nam Trực", "Trực Ninh", "Xuân Trường", "Giao Thủy", "Hải Hậu"] },
        { name: "Nghệ An", districts: ["Vinh", "Cửa Lò", "Thái Hòa", "Quỳnh Lưu", "Diễn Châu", "Nghi Lộc", "Yên Thành", "Hưng Nguyên", "Nam Đàn", "Thanh Chương", "Đô Lương", "Anh Sơn", "Con Cuông", "Tương Dương", "Kỳ Sơn", "Quỳ Hợp", "Quỳ Châu", "Quế Phong", "Tân Kỳ", "Nghĩa Đàn", "Hoàng Mai"] },
        { name: "Ninh Bình", districts: ["Ninh Bình", "Tam Điệp", "Nho Quan", "Gia Viễn", "Hoa Lư", "Yên Khánh", "Kim Sơn", "Yên Mô"] },
        { name: "Ninh Thuận", districts: ["Phan Rang - Tháp Chàm", "Bác Ái", "Ninh Sơn", "Ninh Hải", "Ninh Phước", "Thuận Bắc", "Thuận Nam"] },
        { name: "Phú Thọ", districts: ["Việt Trì", "Phú Thọ", "Đoan Hùng", "Hạ Hòa", "Thanh Ba", "Phù Ninh", "Yên Lập", "Cẩm Khê", "Tam Nông", "Thanh Thủy", "Lâm Thao", "Thanh Sơn", "Tân Sơn"] },
        { name: "Phú Yên", districts: ["Tuy Hòa", "Sông Cầu", "Đông Hòa", "Đồng Xuân", "Tuy An", "Sơn Hòa", "Sông Hinh", "Tây Hòa", "Phú Hòa"] },
        { name: "Quảng Bình", districts: ["Đồng Hới", "Ba Đồn", "Minh Hóa", "Tuyên Hóa", "Quảng Trạch", "Bố Trạch", "Quảng Ninh", "Lệ Thủy"] },
        { name: "Quảng Nam", districts: ["Tam Kỳ", "Hội An", "Điện Bàn", "Đông Giang", "Tây Giang", "Nam Giang", "Phước Sơn", "Bắc Trà My", "Nam Trà My", "Hiệp Đức", "Tiên Phước", "Nông Sơn", "Duy Xuyên", "Đại Lộc", "Thăng Bình", "Quế Sơn", "Núi Thành", "Phú Ninh"] },
        { name: "Quảng Ngãi", districts: ["Quảng Ngãi", "Lý Sơn", "Bình Sơn", "Trà Bồng", "Sơn Tịnh", "Tư Nghĩa", "Nghĩa Hành", "Mộ Đức", "Đức Phổ", "Ba Tơ", "Minh Long", "Sơn Hà", "Sơn Tây"] },
        { name: "Quảng Ninh", districts: ["Hạ Long", "Móng Cái", "Cẩm Phả", "Uông Bí", "Đông Triều", "Quảng Yên", "Vân Đồn", "Tiên Yên", "Hải Hà", "Đầm Hà", "Cô Tô", "Bình Liêu", "Ba Chẽ"] },
        { name: "Quảng Trị", districts: ["Đông Hà", "Quảng Trị", "Vĩnh Linh", "Hướng Hóa", "Gio Linh", "Đakrông", "Cam Lộ", "Triệu Phong", "Hải Lăng", "Cồn Cỏ"] },
        { name: "Sóc Trăng", districts: ["Sóc Trăng", "Ngã Năm", "Vĩnh Châu", "Châu Thành", "Mỹ Xuyên", "Trần Đề", "Long Phú", "Mỹ Tú", "Thạnh Trị", "Cù Lao Dung", "Kế Sách"] },
        { name: "Sơn La", districts: ["Sơn La", "Quỳnh Nhai", "Thuận Châu", "Mường La", "Bắc Yên", "Phù Yên", "Mộc Châu", "Yên Châu", "Mai Sơn", "Sông Mã", "Sốp Cộp", "Vân Hồ"] },
        { name: "Tây Ninh", districts: ["Tây Ninh", "Trảng Bàng", "Hòa Thành", "Tân Biên", "Tân Châu", "Dương Minh Châu", "Châu Thành", "Bến Cầu", "Gò Dầu"] },
        { name: "Thái Bình", districts: ["Thái Bình", "Quỳnh Phụ", "Hưng Hà", "Đông Hưng", "Thái Thụy", "Tiền Hải", "Kiến Xương", "Vũ Thư"] },
        { name: "Thái Nguyên", districts: ["Thái Nguyên", "Sông Công", "Phổ Yên", "Định Hóa", "Phú Lương", "Đồng Hỷ", "Võ Nhai", "Đại Từ", "Phú Bình"] },
        { name: "Thanh Hóa", districts: ["Thanh Hóa", "Sầm Sơn", "Bỉm Sơn", "Nghi Sơn", "Mường Lát", "Quan Hóa", "Quan Sơn", "Bá Thước", "Lang Chánh", "Thường Xuân", "Như Xuân", "Như Thanh", "Thạch Thành", "Hà Trung", "Vĩnh Lộc", "Yên Định", "Thọ Xuân", "Triệu Sơn", "Thiệu Hóa", "Hoằng Hóa", "Hậu Lộc", "Quảng Xương", "Nông Cống", "Đông Sơn"] },
        { name: "Thừa Thiên Huế", districts: ["Huế", "Hương Thủy", "Hương Trà", "Phong Điền", "Quảng Điền", "Phú Vang", "Phú Lộc", "A Lưới", "Nam Đông"] },
        { name: "Tiền Giang", districts: ["Mỹ Tho", "Gò Công", "Cai Lậy", "Huyện Cai Lậy", "Cái Bè", "Châu Thành", "Chợ Gạo", "Gò Công Tây", "Gò Công Đông", "Tân Phước", "Tân Phú Đông"] },
        { name: "Trà Vinh", districts: ["Trà Vinh", "Duyên Hải", "Càng Long", "Cầu Kè", "Tiểu Cần", "Châu Thành", "Trà Cú", "Cầu Ngang", "Duyên Hải (Huyện)"] },
        { name: "Tuyên Quang", districts: ["Tuyên Quang", "Chiêm Hóa", "Hàm Yên", "Na Hang", "Sơn Dương", "Yên Sơn", "Lâm Bình"] },
        { name: "Vĩnh Long", districts: ["Vĩnh Long", "Bình Minh", "Long Hồ", "Mang Thít", "Vũng Liêm", "Tam Bình", "Trà Ôn", "Bình Tân"] },
        { name: "Vĩnh Phúc", districts: ["Vĩnh Yên", "Phúc Yên", "Lập Thạch", "Sông Lô", "Tam Dương", "Bình Xuyên", "Yên Lạc", "Vĩnh Tường", "Tam Đảo"] },
        { name: "Yên Bái", districts: ["Yên Bái", "Nghĩa Lộ", "Lục Yên", "Văn Yên", "Mù Căng Chải", "Trạm Tấu", "Trấn Yên", "Yên Bình", "Văn Chấn"] }
    ];

    /* ═══════════════════════════════════════════════════════════════
     * 2. DỮ LIỆU TĨnh: THƯƠNG HIỆU CẦU — dùng cho autocomplete
     * ═══════════════════════════════════════════════════════════════ */
    window.SHUTTLECOCK_BRANDS = [
        // ── THƯƠNG HIỆU QUỐC TẾ ──
        "Yonex Aerosensa 20", "Yonex Aerosensa 30", "Yonex Aerosensa 40", "Yonex Aerosensa 50",
        "Yonex Mavis 350", "Yonex Mavis 2000",
        "Victor Gold Champion", "Victor Gold 3", "Victor New Gold 1",
        "RSL Classic 1", "RSL Classic 2", "RSL Tourney 1", "RSL Silver 2",
        "Li-Ning A+ 50", "Li-Ning A+ 30", "Li-Ning Champion No.1",
        "Carlton Tour", "Carlton Heritage", "Carlton Vapour Trail",
        "Babolat Feather Shuttle",
        "Apacs Gold Champion", "Apacs Nano Feather",
        "Fleet No.1", "Fleet Tournament",
        "Kumpoo Gold 1", "Kumpoo Gold 2",
        "Pro Kennex Gold", "Pro Kennex Silver",
        // ── THƯƠNG HIỆU VIỆT NAM & PHỔ BIẾN ──
        "Hải Yến Giải Đấu", "Hải Yến Vàng", "Hải Yến Bạc",
        "Ba Sao Vàng", "Ba Sao Bạc", "Ba Sao Đồng",
        "Lê Quang Giải Đấu", "Lê Quang Vàng", "Lê Quang Standard",
        "Taro Vàng", "Taro Bạc", "Taro Training",
        "Thủy Nguyên Vàng", "Thủy Nguyên Bạc",
        "Đức Phát Vàng", "Đức Phát Training",
        "Ngôi Sao Vàng", "Ngôi Sao Bạc",
        "Kim Phát Vàng", "Kim Phát Training",
        "Phú Hòa Vàng", "Phú Hòa Bạc",
        "Thiên Lý Vàng", "Thiên Lý Standard",
        "Toàn Phát No.1", "Toàn Phát No.2",
        "Minh Châu Giải Đấu", "Minh Châu Training",
        "Hùng Cường Vàng", "Hùng Cường Bạc",
        "Thanh Long Vàng", "Thanh Long Training",
        "Phát Đạt No.1", "Phát Đạt No.2",
        "Nam Hưng Vàng", "Nam Hưng Bạc",
        "Đồng Nai Vàng", "Đồng Nai Training",
        "Thành Công Vàng", "Thành Công Standard",
        "Vina Star Giải Đấu", "Vina Star Training",
        "Bubadu Gold", "Bubadu Training",
        // ── NHÃN GENERIC / TRAINING ──
        "Cầu Tập 13 quả/ống", "Cầu Tập Nylon (Mavis)", "Cầu Lông Vũ Training",
        "Cầu Giải Đấu Cao Cấp", "Cầu Thi Đấu Tiêu Chuẩn"
    ];

    /* ═══════════════════════════════════════════════════════════════
     * 2B. TAXONOMY TRÌNH ĐỘ CẦU LÔNG — NGUỒN DUY NHẤT (single source of truth)
     * 12 mức từ THẤP → CAO. Mọi nơi (Hồ sơ / Host đăng ca / Filter / pills)
     * render từ đây — KHÔNG hardcode lặp lại ở chỗ khác.
     * Giá trị lưu trữ = IN HOA toàn bộ. Mức "KHÁ" có nhãn hiển thị riêng.
     * ═══════════════════════════════════════════════════════════════ */
    window.TRINH_DO_LIST = [
        "NEWBIE", "YẾU-", "YẾU", "YẾU+",
        "TBY-", "TBY", "TBY+",
        "TB-", "TB", "TB+",
        "TB KHÁ", "KHÁ"
    ];
    // Nhãn hiển thị khác giá trị lưu trữ (giá trị lưu vẫn là "KHÁ")
    window.TRINH_DO_LABEL = { "KHÁ": "KHÁ (BÁN CHUYÊN)" };
    // Nhãn hiển thị cho 1 giá trị (fallback = chính giá trị)
    window.nhanTrinhDo = function (v) {
        return (window.TRINH_DO_LABEL && window.TRINH_DO_LABEL[v]) || v;
    };
    // Chuẩn hóa chống lệch hoa-thường / khoảng trắng khi so sánh & lọc
    window.chuanHoaTrinhDo = function (s) {
        return (s == null ? "" : String(s)).trim().toUpperCase();
    };

    /* Render TOÀN BỘ UI trình độ từ TRINH_DO_LIST — chạy 1 lần khi DOM sẵn sàng.
     * Container: Hồ sơ select, Filter select + pills (PC + mobile), Host Nam/Nữ. */
    window._renderTrinhDoUI = function () {
        const list = window.TRINH_DO_LIST || [];
        const optHtml = (placeholder) =>
            `<option value="">${placeholder}</option>` +
            list.map(v => `<option value="${v}">${window.nhanTrinhDo(v)}</option>`).join("");

        // 1) Hồ sơ — select trình độ chơi
        const profSel = document.getElementById("profileTrindDo");
        if (profSel) profSel.innerHTML = optHtml("— Chọn trình độ —");

        // 2) Filter — select ẩn (đồng bộ legacy)
        const fSel = document.getElementById("filterLevel");
        if (fSel) fSel.innerHTML = optHtml("Tất cả trình độ");

        // 3) Filter — pills PC
        const fp = document.getElementById("filterLevelPills");
        if (fp) fp.innerHTML = list.map(v =>
            `<button class="tk-pill" data-value="${v}" onclick="window._toggleLevelPill(this)">${window.nhanTrinhDo(v)}</button>`).join("");

        // 4) Filter — pills mobile (drawer)
        const fpm = document.getElementById("filterLevelPillsMobile");
        if (fpm) fpm.innerHTML = list.map(v =>
            `<button class="tk-pill" data-value="${v}" onclick="window._toggleMobileLevelPill(this)">${window.nhanTrinhDo(v)}</button>`).join("");

        // 5) Host — checkbox Nam + Nữ (giữ ô nhập tự do ở cuối)
        const customPh = "Vd: chơi 1 năm đổ lên, chơi 6 tháng liên tục...";
        const buildHostPills = (prefix, customId) =>
            list.map((v, i) =>
                `<input type="checkbox" id="${prefix}${i}" value="${v}" class="lvl-cb"><label for="${prefix}${i}" class="lvl-pill">${window.nhanTrinhDo(v)}</label>`
            ).join("") +
            `<input type="text" id="${customId}" class="app-input lvl-custom" placeholder="${customPh}">`;
        const namGroup = document.getElementById("levelNamPills");
        if (namGroup) namGroup.innerHTML = buildHostPills("m_lvl_", "hostMaleCustomLevel");
        const nuGroup = document.getElementById("levelNuPills");
        if (nuGroup) nuGroup.innerHTML = buildHostPills("f_lvl_", "hostFemaleCustomLevel");
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", window._renderTrinhDoUI);
    } else {
        window._renderTrinhDoUI();
    }

    /* ═══════════════════════════════════════════════════════════════
     * 3. HÀM TIỆN ÍCH — THÔNG BÁO LỖI MẠNG TRỰC QUAN
     * Gọi khi Supabase không kết nối được
     * ═══════════════════════════════════════════════════════════════ */
    function hienLoiMang(tenTacVu) {
        // Thông báo chung — KHÔNG lộ tên bảng nội bộ ra UI người dùng
        const msg = "Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối Internet và thử lại.";
        // Dùng hienToast nếu đã load hieu-ung-giao-dien.js
        if (typeof window.hienToast === "function") {
            window.hienToast("Mất kết nối", msg, "danger");
        } else {
            // Fallback: alert đơn giản
            alert("⚠️ " + msg);
        }
        // Ghi chi tiết ra console để developer debug (không hiện cho người dùng)
        console.error(`[dbEngine] Lỗi mạng — ${tenTacVu}`);
    }

    /* ═══════════════════════════════════════════════════════════════
     * 4. WINDOW.DBENGINE — PROXY THẲNG LÊN SUPABASE
     *
     * NGUYÊN TẮC:
     * - Mọi I/O nghiệp vụ đều qua window.khoDuLieuVinhVien
     * - Không có localStorage fallback cho dữ liệu ca đấu / slot / đánh giá
     * - Mất mạng → hiện lỗi → throw để caller xử lý
     * ═══════════════════════════════════════════════════════════════ */
    window.dbEngine = {

        /**
         * Đọc dữ liệu từ Supabase.
         * @param {string} tenBang - Tên bảng Supabase (đúng tên schema)
         * @param {object} boLoc   - Bộ lọc tùy chọn { eq: {col:val}, order: "col.asc", limit: N }
         * @returns {Array} Mảng các bản ghi
         */
        async doc(tenBang, boLoc = {}) {
            if (!window.khoDuLieuVinhVien) {
                throw new Error("window.khoDuLieuVinhVien chưa sẵn sàng — kiểm tra ket-noi-supabase.js đã load chưa");
            }
            try {
                const data = await window.khoDuLieuVinhVien.docData(tenBang, boLoc);
                return Array.isArray(data) ? data : [];
            } catch (e) {
                hienLoiMang(`Đọc bảng "${tenBang}"`);
                throw e; // Ném tiếp để caller biết thao tác thất bại
            }
        },

        /**
         * "Thử đọc im lặng" — không hiện toast lỗi, trả về null nếu thất bại.
         * Dùng để kiểm tra xem bảng có tồn tại không trước khi gọi doc() thật.
         * Ví dụ: probe "nguoi_dung" → nếu null thì fallback sang "khach_vang_lai"
         * @param {string} tenBang - Tên bảng cần kiểm tra
         * @param {object} boLoc   - Bộ lọc tùy chọn
         * @returns {Array|null} Mảng bản ghi nếu thành công, null nếu lỗi
         */
        async docThu(tenBang, boLoc = {}) {
            if (!window.khoDuLieuVinhVien) return null;
            try {
                const data = await window.khoDuLieuVinhVien.docData(tenBang, boLoc);
                return Array.isArray(data) ? data : [];
            } catch (e) {
                // Im lặng — không hiện toast, chỉ ghi console để debug
                console.warn(`[dbEngine.docThu] "${tenBang}" không truy cập được:`, e.message);
                return null;
            }
        },

        /**
         * Ghi / cập nhật dữ liệu lên Supabase.
         * @param {string} tenBang    - Tên bảng
         * @param {object} payload    - Dữ liệu cần ghi
         * @param {object|null} match - Điều kiện match để UPSERT (null = INSERT mới)
         * @returns {Array} Bản ghi sau khi ghi
         */
        async ghi(tenBang, payload, match = null) {
            if (!window.khoDuLieuVinhVien) {
                throw new Error("window.khoDuLieuVinhVien chưa sẵn sàng");
            }
            try {
                return await window.khoDuLieuVinhVien.ghiData(tenBang, payload, match);
            } catch (e) {
                hienLoiMang(`Ghi vào bảng "${tenBang}"`);
                throw e;
            }
        },

        /**
         * Xóa dữ liệu khỏi Supabase.
         * @param {string} tenBang  - Tên bảng
         * @param {object} match    - Điều kiện để xác định dòng cần xóa
         * @returns {Array} Bản ghi đã xóa
         */
        async xoa(tenBang, match) {
            if (!window.khoDuLieuVinhVien) {
                throw new Error("window.khoDuLieuVinhVien chưa sẵn sàng");
            }
            try {
                return await window.khoDuLieuVinhVien.xoaData(tenBang, match);
            } catch (e) {
                hienLoiMang(`Xóa khỏi bảng "${tenBang}"`);
                throw e;
            }
        },

        /**
         * INSERT hoặc UPDATE khi conflict PK — dùng cho cau_hinh_he_thong v.v.
         */
        async upsert(tenBang, payload) {
            if (!window.khoDuLieuVinhVien) {
                throw new Error("window.khoDuLieuVinhVien chưa sẵn sàng");
            }
            try {
                return await window.khoDuLieuVinhVien.upsertData(tenBang, payload);
            } catch (e) {
                hienLoiMang(`Upsert vào bảng "${tenBang}"`);
                throw e;
            }
        }
    };

    /* ═══════════════════════════════════════════════════════════════
     * 5. MODULE VALIDATE TẬP TRUNG — dùng chung toàn bộ project
     * Tất cả rule kiểm tra đầu vào tập trung tại đây, tránh trùng lặp
     * ═══════════════════════════════════════════════════════════════ */
    window.VALIDATE = {
        /**
         * Kiểm tra tên người dùng tiếng Việt:
         * Chỉ chữ cái (có dấu) + khoảng trắng, 2–50 ký tự.
         */
        ten: function (val) {
            return /^[a-zA-ZÀ-ỹ\s]{2,50}$/u.test((val || "").trim());
        },

        /**
         * Kiểm tra SĐT Việt Nam:
         * 10 số, bắt đầu bằng 03x / 05x / 07x / 08x / 09x.
         */
        sdt: function (val) {
            return /^(0[35789][0-9]{8})$/.test((val || "").replace(/\D/g, ""));
        },

        /**
         * Kiểm tra mật khẩu: tối thiểu 6 ký tự.
         */
        pass: function (val) {
            return val !== null && val !== undefined && String(val).length >= 6;
        },

        /**
         * Kiểm tra link Facebook:
         * Rỗng → hợp lệ (tùy chọn). Có nhập → phải bắt đầu bằng https://facebook.com hoặc fb.com.
         */
        facebook: function (val) {
            if (!val || val.trim() === "") return true;
            return /^https?:\/\/(www\.)?(facebook\.com|fb\.com)\//.test(val.trim());
        },

        /**
         * Kiểm tra định dạng mã Key Host: TVL-XXXXX-XXXX (chữ hoa + số).
         */
        keyHost: function (val) {
            return /^TVL-[A-Z0-9]{5}-[A-Z0-9]{4}$/.test((val || "").trim().toUpperCase());
        },

        /**
         * Kiểm tra Email (ưu tiên Gmail nhưng chấp nhận email hợp lệ chung).
         * Rỗng → KHÔNG hợp lệ (dùng cho ô bắt buộc; nơi tùy chọn tự check rỗng trước).
         */
        email: function (val) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((val || "").trim().toLowerCase());
        }
    };

    /**
     * Nhận diện 1 chuỗi đầu vào là EMAIL hay SĐT (hoặc không xác định).
     * Trả { loai: 'email'|'sdt'|'?', giaTri } — giaTri đã chuẩn hóa.
     */
    window.nhanDienDinhDanh = function (raw) {
        const s = String(raw == null ? "" : raw).trim();
        if (s.indexOf("@") >= 0) {
            return { loai: "email", giaTri: s.toLowerCase() };
        }
        const digits = s.replace(/\D/g, "");
        if (digits.length >= 9) return { loai: "sdt", giaTri: digits };
        return { loai: "?", giaTri: s };
    };

    /* ═══════════════════════════════════════════════════════════════
     * VALIDATE TÊN NGƯỜI DÙNG (CHẶT) — window.kiemTraTenHopLe(raw)
     * Trả { ok:boolean, loai:string, lyDo:string }.
     * Dùng cho Đăng ký + Đổi tên (chặn tên rác/phá hoại/lách luật).
     * ═══════════════════════════════════════════════════════════════ */

    // Bỏ dấu tiếng Việt + IN HOA (Đ→D) — dùng so khớp từ cấm "whole-word"
    function _boDauTen(s) {
        return String(s == null ? "" : s)
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[Đđ]/g, "D")
            .toUpperCase();
    }

    // Nguyên âm tiếng Việt (kể cả có dấu) — phát hiện spam phụ âm liên tiếp
    const _TEN_NGUYEN_AM = /[AÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬEÈÉẺẼẸÊỀẾỂỄỆIÌÍỈĨỊOÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢUÙÚỦŨỤƯỪỨỬỮỰYỲÝỶỸỴ]/u;

    // Ký tự đặc biệt / phân tách bị cấm — chống lách luật "D.I.T", "D_I_T", "D-I-T"...
    const _TEN_KY_TU_CAM = /[,._+\-@/\\*#$%^&!?;:'"()<>=|{}\[\]~]/;

    // BƯỚC 1 — Whitelist NGUYÊN DẤU: từ thật VN khi bỏ dấu dễ trùng từ bậy → MIỄN kiểm bước 2
    const _TEN_WHITELIST = new Set([
        "CÁC", "MỄ", "MỆ", "KÍCH", "CÚC", "CỐC", "ĐÍCH", "ĐỊCH", "DIỄM", "DĨ", "CÒ"
    ]);

    // BƯỚC 2 — Từ cấm whole-word (ĐÃ BỎ DẤU): test/mạo danh BQT + tục tĩu/mất dạy
    const _TEN_CAM_TOKEN = new Set([
        // test / mạo danh
        "TEST", "DEMO", "CHECK", "USER", "ACCOUNT", "ABC", "XYZ", "ASD", "QWE", "AAA", "NULL", "UNDEFINED", "NAN", "SAMPLE",
        "AD", "ADMIN", "ADMINS", "ADMINISTRATOR", "MOD", "MODS", "MODERATOR", "BQT", "SUPPORT", "SYSTEM", "ROOT", "SUDO", "STAFF", "CTV", "SUPERADMIN",
        // tục tĩu / mất dạy
        "DIT", "CAC", "LON", "BUOI", "CHO", "DEO", "DM", "DMM", "DKM", "DKMM", "VCL", "VKL", "CLM", "DCM", "CC", "CAVE", "DJT", "DICK", "FUCK", "SHIT", "SEX", "CUT", "BUOM"
    ]);

    // BƯỚC 3 — Cụm nhiều từ cấm (so trên CHUỖI ĐÃ BỎ DẤU — chứa là chặn, bắt viết liền/cách thưa)
    const _TEN_CAM_CUM = [
        "QUAN TRI VIEN", "QUAN TRI", "BAN QUAN TRI", "HE THONG", "NHA CAI",
        "DIT ME", "DIT MIE", "DIT CON", "SUC VAT", "CHET ME", "CON ME MAY", "AN HAI", "AN CUT"
    ];

    window.kiemTraTenHopLe = function (raw, isAdmin) {
        // ── 0. BYPASS ADMIN ───────────────────────────────────────────────
        // Admin (vận hành/quản trị/test) được đặt tên tùy ý: bỏ qua TOÀN BỘ
        // bộ lọc (độ dài, số từ, khoảng trắng, ký tự đặc biệt, từ cấm, spam).
        // Chấp nhận: isAdmin===true | "admin" | { vai_tro:"admin" } | { is_admin:true }
        let _admin = false;
        if (isAdmin === true || isAdmin === "admin") {
            _admin = true;
        } else if (isAdmin && typeof isAdmin === "object") {
            const vt = String(isAdmin.vai_tro || isAdmin.role || "").toLowerCase();
            _admin = vt === "admin" || isAdmin.is_admin === true || isAdmin.isAdmin === true;
        }
        if (_admin) return { ok: true, loai: "admin", lyDo: "" };

        const goc = String(raw == null ? "" : raw);

        // ── 1. KIỂM TRA THÔ (trên chuỗi GỐC, trước khi xử lý) ──────────────
        // 1a. Ký tự đặc biệt / phân tách lách luật
        if (_TEN_KY_TU_CAM.test(goc)) {
            return { ok: false, loai: "kytu", lyDo: "Tên không được chứa ký tự đặc biệt hoặc ký tự phân tách." };
        }
        // 1b. Khoảng trắng thừa đầu/cuối
        if (goc !== goc.trim()) {
            return { ok: false, loai: "khoangtrang", lyDo: "Tên không được có khoảng trắng thừa ở đầu hoặc cuối." };
        }
        // 1c. ≥2 khoảng trắng liên tiếp giữa các từ (chống "D   I   T")
        if (/\s{2,}/.test(goc)) {
            return { ok: false, loai: "khoangtrang", lyDo: "Các từ chỉ được cách nhau bằng một khoảng trắng." };
        }

        // Chuẩn hóa IN HOA (GIỮ dấu) — đến đây chỉ còn khoảng trắng đơn, không thừa đầu/cuối
        const ten = goc.normalize("NFC").toUpperCase();

        // ── 2. ĐỘ DÀI + KÝ TỰ CHO PHÉP + SỐ TỪ ────────────────────────────
        if (ten.length < 5)  return { ok: false, loai: "ngan", lyDo: "Tên quá ngắn — cần tối thiểu 5 ký tự." };
        if (ten.length > 35) return { ok: false, loai: "dai",  lyDo: "Tên quá dài — tối đa 35 ký tự (chặn tên dài làm vỡ giao diện)." };
        if (!/^[A-ZÀ-Ỹ ]+$/u.test(ten)) {
            return { ok: false, loai: "kytu", lyDo: "Tên chỉ được chứa chữ cái tiếng Việt và khoảng trắng." };
        }
        const tokens = ten.split(" ");
        if (tokens.length < 2) return { ok: false, loai: "itu",     lyDo: "Tên phải có ít nhất 2 từ (Họ và Tên)." };
        if (tokens.length > 5) return { ok: false, loai: "nhieutu", lyDo: "Tên không hợp lệ — tối đa 5 từ." };

        // ── 3. LỌC TỪ CẤM (whitelist nguyên dấu → bỏ dấu → so khớp whole-word) ──
        for (const tk of tokens) {
            if (_TEN_WHITELIST.has(tk)) continue;        // BƯỚC 1: từ thật an toàn → bỏ qua
            if (_TEN_CAM_TOKEN.has(_boDauTen(tk))) {     // BƯỚC 2: bỏ dấu so khớp nguyên từ
                return { ok: false, loai: "tuctiu", lyDo: `Tên chứa từ cấm/không phù hợp ("${tk}"). Vui lòng dùng tên thật.` };
            }
        }
        const fullStripped = _boDauTen(ten);             // BƯỚC 3: cụm nhiều từ (đã bỏ dấu)
        for (const cum of _TEN_CAM_CUM) {
            if (fullStripped.includes(cum)) {
                return { ok: false, loai: "tuctiu", lyDo: "Tên chứa cụm từ cấm/không phù hợp. Vui lòng đặt tên nghiêm túc." };
            }
        }

        // ── 4. CHẶN SPAM PHÍM (gõ bừa vô nghĩa) ────────────────────────────
        for (const tk of tokens) {
            if (tk.length > 8) {
                return { ok: false, loai: "spam", lyDo: "Tên có từ quá dài bất thường (nghi gõ bừa). Vui lòng nhập tên thật." };
            }
            if (tk.length >= 4 && !_TEN_NGUYEN_AM.test(tk)) {
                return { ok: false, loai: "spam", lyDo: "Tên chứa chuỗi phụ âm vô nghĩa (không có nguyên âm). Vui lòng nhập tên thật." };
            }
        }

        return { ok: true, loai: "", lyDo: "" };
    };

    /**
     * Validate realtime — gắn vào sự kiện oninput của input.
     * Tự động toggle class "input-error" và hiện hint lỗi trong .input-hint kế tiếp.
     *
     * @param {HTMLElement} inputEl  - Phần tử input cần validate
     * @param {string}      ruleName - Tên rule trong window.VALIDATE
     * @param {string}      errorMsg - Thông báo lỗi hiển thị khi không hợp lệ
     * @returns {boolean} true nếu hợp lệ
     */
    window.validateRealtime = function (inputEl, ruleName, errorMsg) {
        const val = inputEl.value;
        const rule = window.VALIDATE[ruleName];
        const ok   = rule ? rule(val) : true;
        // Thêm/xóa class lỗi — chỉ bật khi đã có giá trị nhưng không hợp lệ
        inputEl.classList.toggle("input-error", val.length > 0 && !ok);
        // Hiện hint lỗi trong span.input-hint kế ngay sau input
        const hint = inputEl.nextElementSibling;
        if (hint && hint.classList.contains("input-hint")) {
            hint.textContent = (val.length > 0 && !ok) ? errorMsg : "";
            hint.style.color = "#ef4444";
        }
        return ok;
    };

    /* ═══════════════════════════════════════════════════════════════
     * 6. GIỮ TƯƠNG THÍCH — Stub hàm sandbox cũ để tránh lỗi runtime
     * Nếu code cũ nào đó vẫn gọi khoiTaoSandbox() sẽ không crash
     * ═══════════════════════════════════════════════════════════════ */
    window.khoiTaoSandbox = function () {
        console.info("[bo-may-du-lieu v3.0] Sandbox đã bị vô hiệu hóa — hệ thống dùng Supabase thật.");
    };

    console.log("⚡ [bo-may-du-lieu v3.0] Khởi động: 63 tỉnh thành ✅ | dbEngine → Supabase trực tiếp ✅ | VALIDATE module ✅ | ~70 thương hiệu cầu ✅");

})();
