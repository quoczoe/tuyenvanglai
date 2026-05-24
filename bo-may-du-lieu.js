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
        "Hải Yến", "Victor", "Yonex", "Ba Sao", "Thành Công",
        "Vina Star", "Kumpoo", "Pro Kennex", "Lining", "RSL", "Bubadu"
    ];

    /* ═══════════════════════════════════════════════════════════════
     * 3. HÀM TIỆN ÍCH — THÔNG BÁO LỖI MẠNG TRỰC QUAN
     * Gọi khi Supabase không kết nối được
     * ═══════════════════════════════════════════════════════════════ */
    function hienLoiMang(tenTacVu) {
        const msg = `Không thể kết nối máy chủ khi thực hiện: ${tenTacVu}. Vui lòng kiểm tra kết nối Internet và thử lại.`;
        // Dùng hienToast nếu đã load hieu-ung-giao-dien.js
        if (typeof window.hienToast === "function") {
            window.hienToast("Mất kết nối", msg, "error");
        } else {
            // Fallback: alert đơn giản
            alert("⚠️ " + msg);
        }
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
        }
    };

    /* ═══════════════════════════════════════════════════════════════
     * 5. GIỮ TƯƠNG THÍCH — Stub hàm sandbox cũ để tránh lỗi runtime
     * Nếu code cũ nào đó vẫn gọi khoiTaoSandbox() sẽ không crash
     * ═══════════════════════════════════════════════════════════════ */
    window.khoiTaoSandbox = function () {
        console.info("[bo-may-du-lieu v2.0] Sandbox đã bị vô hiệu hóa — hệ thống dùng Supabase thật.");
    };

    console.log("⚡ [bo-may-du-lieu v2.0] Khởi động: 63 tỉnh thành ✅ | dbEngine → Supabase trực tiếp ✅ | localStorage sandbox ❌ đã tắt");

})();
