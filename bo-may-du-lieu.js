/* =========================================================================
 * ⚙️ BỘ MÁY DỮ LIỆU ĐỊA PHƯƠNG & VIRTUAL DATABASE - BO-MAY-DU-LIEU.JS
 * Dự án: TUYENVANGLAI.IO.VN
 * Chức năng: Quản lý các mảng dữ liệu tĩnh (tỉnh thành, sân bãi) và cung cấp
 *            đối tượng điều vận window.dbEngine tự động đồng bộ đám mây Supabase
 *            hoặc dự phòng LocalStorage Sandbox thông minh.
 * =========================================================================
 */

(function () {
    // 1. Dữ liệu tĩnh tỉnh thành quy chuẩn đầy đủ 100% 63 tỉnh thành Việt Nam
    window.MOCK_PROVINCES = [
        { name: "TP. Hồ Chí Minh", districts: ["Quận 1", "Quận 3", "Quận 4", "Quận 5", "Quận 6", "Quận 7", "Quận 8", "Quận 10", "Quận 11", "Quận 12", "Tân Bình", "Bình Thạnh", "Gò Vấp", "Thủ Đức", "Phú Nhuận", "Tân Phú", "Bình Tân", "Hóc Môn", "Củ Chi", "Nhà Bè", "Bình Chánh", "Cần Giờ"] },
        { name: "Hà Nội", districts: ["Ba Đình", "Hoàn Kiếm", "Tây Hồ", "Long Biên", "Cầu Giấy", "Đống Đa", "Hai Bà Trưng", "Hoàng Mai", "Thanh Xuân", "Sóc Sơn", "Đông Anh", "Gia Lâm", "Nam Từ Liêm", "Thanh Trì", "Bắc Từ Liêm", "Mê Linh", "Hà Đông", "Sơn Tây", "Ba Vì", "Chương Mỹ", "Đan Phượng", "Hoài Đức", "Mỹ Đức", "Phú Xuyên", "Quốc Oai", "Thạch Thất", "Thanh Oai", "Thường Tín", "Ứng Hòa"] },
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
        { name: "Tây Tây Ninh", districts: ["Tây Ninh", "Trảng Bàng", "Hòa Thành", "Tân Biên", "Tân Châu", "Dương Minh Châu", "Châu Thành", "Bến Cầu", "Gò Dầu"] },
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

    // Sửa lỗi chính tả "Tây Tây Ninh" thành "Tây Ninh"
    window.MOCK_PROVINCES = window.MOCK_PROVINCES.map(p => {
        if (p.name === "Tây Tây Ninh") p.name = "Tây Ninh";
        return p;
    });

    window.SHUTTLECOCK_BRANDS = [
        "Hải Yến", "Victor", "Yonex", "Ba Sao", "Thành Công", "Vina Star", "Kumpoo", "Pro Kennex", "Lining", "RSL", "Bubadu"
    ];

    window.MOCK_COURTS = [
        { name: "Sân Cầu Lông Viettel Quận 10", address: "Hẻm 285 Cách Mạng Tháng Tám, Quận 10, TP. HCM" },
        { name: "Sân Cầu Lông Tân Sơn Gò Vấp", address: "Đường Tân Sơn, Quận Gò Vấp, TP. HCM" },
        { name: "Sân Cầu Lông Kỳ Hòa", address: "Đường Sư Vạn Hạnh, Quận 10, TP. HCM" },
        { name: "Sân Cầu Lông Cầu Giấy Hà Nội", address: "Đường Nguyễn Phong Sắc, Cầu Giấy, Hà Nội" },
        { name: "Sân Cầu Lông Đại học Bách Khoa", address: "Đại Cồ Việt, Hai Bà Trưng, Hà Nội" },
        { name: "Sân Cầu Lông Chu Văn An Bình Thạnh", address: "Đường Chu Văn An, Quận Bình Thạnh, TP. HCM" },
        { name: "Sân Cầu Lông Gia Định Phú Nhuận", address: "Đường Hoàng Minh Giám, Quận Phú Nhuận, TP. HCM" },
        { name: "Sân Cầu Lông T&T", address: "Số 120 Dương Quảng Hàm, Quận Gò Vấp, TP. HCM" },
        { name: "Sân Cầu Lông Bình Minh", address: "Đường Bùi Đình Túy, Quận Bình Thạnh, TP. HCM" },
        { name: "Sân Cầu Lông Sky", address: "Đường số 9, Phường Linh Tây, TP. Thủ Đức, TP. HCM" }
    ];

    // 2. Khởi tạo cấu trúc Virtual Tables trong LocalStorage nếu chưa tồn tại
    window.khoiTaoSandbox = function () {
        if (!localStorage.getItem("vl_keys")) {
            localStorage.setItem("vl_keys", JSON.stringify([
                { key: "KEY-EMERALD-ADMIN-TEST", note: "Key Quản Trị Hệ Thống", expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), status: "active" },
                { key: "KEY-EMERALD-TEST-GUEST", note: "Key Thử Nghiệm Ngắn Hạn", expires_at: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(), status: "active" }
            ]));
        }
        
        // Nạp ca đấu mẫu có hiệu lực nếu chưa có ca đấu nào hoặc vl_slots chứa dữ liệu cấu trúc cũ
        const rawSlots = localStorage.getItem("vl_slots");
        let activeSlots = rawSlots ? JSON.parse(rawSlots) : [];
        const homNay = new Date().toLocaleDateString('sv-SE');
        const ngayMai = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE');
        const ngayKia = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE');
        
        // Force nạp lại data mẫu nếu vl_slots rỗng hoặc có cấu trúc cũ
        const canNhapLai = activeSlots.length === 0 || activeSlots.some(s => s.hasOwnProperty("price_per_slot")) || !activeSlots.some(s => s.status === "active");
        
        if (canNhapLai) {
            console.log("[Sandbox] Nạp dữ liệu mẫu 3 ca đấu cầu lông vào LocalStorage...");
            activeSlots = [
                {
                    id: "slot-demo-1",
                    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
                    host_key: "KEY-EMERALD-ADMIN-TEST",
                    host_name: "CLB Cầu Lông Kỳ Hòa",
                    host_phone: "0901234567",
                    title: "Kèo Giao Lưu Tối Nay - Sân Kỳ Hòa Q10",
                    province: "TP. Hồ Chí Minh",
                    district: "Quận 10",
                    court_name: "Sân Cầu Lông Kỳ Hòa",
                    court_address: "Đường Sư Vạn Hạnh, Quận 10, TP. HCM",
                    court_number: "Sân 1, Sân 2",
                    court_quantity: 2,
                    date_play: homNay,
                    time_start: "18:00",
                    time_end: "20:00",
                    duration: 2.0,
                    gender: "both",
                    levels: ["tby", "tb-", "tb+"],
                    price_male: 60000,
                    price_female: 50000,
                    inc_court: true,
                    inc_shuttle: true,
                    inc_water: true,
                    inc_parking: false,
                    accounting_court_price: 80000,
                    accounting_water_cost: 20000,
                    accounting_shuttlecocks: [
                        { name: "Hải Yến", qty_type: "12", price: 240000, used: 12 }
                    ],
                    status: "active",
                    registered_guests: [
                        { name: "Nguyễn Văn Hùng", phone: "0912345678", gender: "male", registered_at: new Date(Date.now() - 50 * 60 * 1000).toISOString(), attendance: "present", review_score_by_host: 5, review_comment_by_host: "Đánh tốt, vui vẻ và đúng giờ!" },
                        { name: "Lê Minh Tuấn", phone: "0987654321", gender: "male", registered_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(), attendance: "registered", review_score_by_host: null, review_comment_by_host: null },
                        { name: "Phạm Thanh Hà", phone: "0966778899", gender: "female", registered_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), attendance: "registered", review_score_by_host: null, review_comment_by_host: null }
                    ]
                },
                {
                    id: "slot-demo-2",
                    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                    host_key: "KEY-EMERALD-ADMIN-TEST",
                    host_name: "CLB Gò Vấp Sport",
                    host_phone: "0934567890",
                    title: "Tuyển Vãng Lai Chiều Mai - Sân Tân Sơn Gò Vấp",
                    province: "TP. Hồ Chí Minh",
                    district: "Gò Vấp",
                    court_name: "Sân Cầu Lông Tân Sơn Gò Vấp",
                    court_address: "Đường Tân Sơn, Quận Gò Vấp, TP. HCM",
                    court_number: "Sân 3",
                    court_quantity: 1,
                    date_play: ngayMai,
                    time_start: "15:00",
                    time_end: "17:00",
                    duration: 2.0,
                    gender: "both",
                    levels: ["newbie", "yếu", "tby"],
                    price_male: 50000,
                    price_female: 40000,
                    inc_court: true,
                    inc_shuttle: true,
                    inc_water: false,
                    inc_parking: false,
                    accounting_court_price: 70000,
                    accounting_water_cost: 0,
                    accounting_shuttlecocks: [
                        { name: "Victor", qty_type: "12", price: 280000, used: 8 }
                    ],
                    status: "active",
                    registered_guests: [
                        { name: "Trần Thế Anh", phone: "0944556677", gender: "male", registered_at: new Date(Date.now() - 100 * 60 * 1000).toISOString(), attendance: "registered", review_score_by_host: null, review_comment_by_host: null }
                    ]
                },
                {
                    id: "slot-demo-3",
                    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
                    host_key: "KEY-EMERALD-ADMIN-TEST",
                    host_name: "Lông Thủ Cầu Giấy",
                    host_phone: "0909998887",
                    title: "Ca Cầu Giao Lưu Thân Thiện - Sân Cầu Giấy Hà Nội",
                    province: "Hà Nội",
                    district: "Cầu Giấy",
                    court_name: "Sân Cầu Lông Cầu Giấy Hà Nội",
                    court_address: "Đường Nguyễn Phong Sắc, Cầu Giấy, Hà Nội",
                    court_number: "Sân 1, Sân 2",
                    court_quantity: 2,
                    date_play: homNay,
                    time_start: "19:00",
                    time_end: "21:00",
                    duration: 2.0,
                    gender: "both",
                    levels: ["tb-", "tb+", "tbk"],
                    price_male: 70000,
                    price_female: 60000,
                    inc_court: true,
                    inc_shuttle: true,
                    inc_water: true,
                    inc_parking: true,
                    accounting_court_price: 90000,
                    accounting_water_cost: 30000,
                    accounting_shuttlecocks: [
                        { name: "Yonex", qty_type: "12", price: 320000, used: 10 }
                    ],
                    status: "active",
                    registered_guests: []
                }
            ];
            localStorage.setItem("vl_slots", JSON.stringify(activeSlots));
            console.log(`[Sandbox] Đã nạp ${activeSlots.length} ca đấu mẫu. Slots IDs:`, activeSlots.map(s => s.id));
        } else {
            console.log(`[Sandbox] LocalStorage đã có ${activeSlots.length} ca đấu, giữ nguyên.`);
        }

        if (!localStorage.getItem("vl_users")) {
            localStorage.setItem("vl_users", JSON.stringify([]));
        }
        if (!localStorage.getItem("vl_reviews")) {
            localStorage.setItem("vl_reviews", JSON.stringify([]));
        }
        if (!localStorage.getItem("vl_config")) {
            localStorage.setItem("vl_config", JSON.stringify({
                announcement: "Chào mừng quý khách đến với TUYENVANGLAI.IO.VN! Cổng tuyển vãng lai môn cầu lông quy chuẩn công nghệ cao số 1 Việt Nam. Chúc các lông thủ có những ca cầu đầy năng lượng!",
                total_slots: 45,
                online_players: 1820
            }));
        }
    };

    // 3. Đối tượng điều vận toàn cục window.dbEngine tích hợp đám mây Supabase
    window.dbEngine = {
        async doc(tenBang, boLoc = {}) {
            try {
                if (window.khoDuLieuVinhVien) {
                    const data = await window.khoDuLieuVinhVien.docData(tenBang, boLoc);
                    if (data && data.length > 0) {
                        console.log(`[Supabase OK] Bảng ${tenBang}: ${data.length} dòng`);
                        return data;
                    }
                    console.log(`[Supabase Rỗng] Bảng ${tenBang} không có data, chuyển sang LocalStorage Sandbox.`);
                }
            } catch (e) {
                console.warn(`[Supabase Lỗi] Chuyển sang LocalStorage Sandbox cho bảng: ${tenBang}`, e.message || e);
            }
            
            // Sandbox LocalStorage fallback
            const keyMapping = { "cau_hinh_he_thong": "vl_config", "keys": "vl_keys", "slots": "vl_slots", "users": "vl_users", "reviews": "vl_reviews" };
            const localKey = keyMapping[tenBang] || tenBang;
            const raw = localStorage.getItem(localKey);
            let parsed = raw ? JSON.parse(raw) : [];
            
            if (tenBang === "cau_hinh_he_thong") {
                return [parsed];
            }
            
            if (boLoc.eq) {
                parsed = parsed.filter(item => {
                    for (const [k, v] of Object.entries(boLoc.eq)) {
                        if (item[k] !== v) return false;
                    }
                    return true;
                });
            }
            if (boLoc.order) {
                const [c, dir] = boLoc.order.split(".");
                parsed.sort((a, b) => {
                    if (dir === "desc") {
                        return (b[c] > a[c]) ? 1 : -1;
                    } else {
                        return (a[c] > b[c]) ? 1 : -1;
                    }
                });
            }
            if (boLoc.limit) {
                parsed = parsed.slice(0, boLoc.limit);
            }
            return parsed;
        },

        async ghi(tenBang, payload, boLocMatch = null) {
            try {
                if (window.khoDuLieuVinhVien) {
                    return await window.khoDuLieuVinhVien.ghiData(tenBang, payload, boLocMatch);
                }
            } catch (e) {
                console.warn(`[Supabase Không Khả Dụng] Chuyển đổi ghi Sandbox cho bảng: ${tenBang}`, e);
            }

            // Sandbox LocalStorage fallback
            const keyMapping = { "cau_hinh_he_thong": "vl_config", "keys": "vl_keys", "slots": "vl_slots", "users": "vl_users", "reviews": "vl_reviews" };
            const localKey = keyMapping[tenBang] || tenBang;
            
            if (tenBang === "cau_hinh_he_thong") {
                localStorage.setItem(localKey, JSON.stringify(payload));
                return [payload];
            }

            const raw = localStorage.getItem(localKey);
            let list = raw ? JSON.parse(raw) : [];
            
            if (boLocMatch) {
                // UPDATE dòng khớp điều kiện
                list = list.map(item => {
                    let matches = true;
                    for (const [k, v] of Object.entries(boLocMatch)) {
                        if (item[k] !== v) matches = false;
                    }
                    return matches ? { ...item, ...payload } : item;
                });
                localStorage.setItem(localKey, JSON.stringify(list));
                return [payload];
            } else {
                // INSERT dòng mới
                const newRow = { 
                    id: Math.random().toString(36).substr(2, 9), 
                    created_at: new Date().toISOString(), 
                    ...payload 
                };
                list.push(newRow);
                localStorage.setItem(localKey, JSON.stringify(list));
                return [newRow];
            }
        },

        async xoa(tenBang, boLocMatch) {
            try {
                if (window.khoDuLieuVinhVien) {
                    return await window.khoDuLieuVinhVien.xoaData(tenBang, boLocMatch);
                }
            } catch (e) {
                console.warn(`[Supabase Không Khả Dụng] Chuyển đổi xóa Sandbox cho bảng: ${tenBang}`, e);
            }

            const keyMapping = { "keys": "vl_keys", "slots": "vl_slots", "users": "vl_users", "reviews": "vl_reviews" };
            const localKey = keyMapping[tenBang] || tenBang;
            const raw = localStorage.getItem(localKey);
            let list = raw ? JSON.parse(raw) : [];
            
            const deleted = list.filter(item => {
                for (const [k, v] of Object.entries(boLocMatch)) {
                    if (item[k] === v) return true;
                }
                return false;
            });

            list = list.filter(item => {
                for (const [k, v] of Object.entries(boLocMatch)) {
                    if (item[k] === v) return false;
                }
                return true;
            });

            localStorage.setItem(localKey, JSON.stringify(list));
            return deleted;
        }
    };

    // Đảm bảo chạy khởi tạo sandbox ngay lập tức để nạp dữ liệu mẫu
    window.khoiTaoSandbox();

    console.log("⚡ [Bộ máy dữ liệu]: Khởi động Sandbox & dbEngine thành công và nạp đầy đủ 63 tỉnh thành & ca đấu mẫu.");
})();
