/* 
 * =========================================================================
 * ⚙️ HỆ THỐNG ĐIỀU VẬN DỮ LIỆU ĐÁM MÂY - KET-NOI-SUPABASE.JS
 * Dự án: TUYENVANGLAI.IO.VN
 * Chức năng: Cung cấp đối tượng toàn cục window.khoDuLieuVinhVien giao tiếp trực tiếp
 *            với Supabase REST API bằng phương thức Fetch thuần túy (không cần SDK cồng kềnh).
 * =========================================================================
 */

(function () {
    // 1. Cấu hình thông số bảo mật Supabase cố định từ Bản đặc tả
    const SUPABASE_URL = "https://kyidswbpfafsoqsdhfpu.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5aWRzd2JwZmFmc29xc2RoZnB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNDI1ODksImV4cCI6MjA5NDkxODU4OX0.ustQ0xaRQqxyCWid1dkC-1YuhX0yA0wQJ5JOyq98TRY";

    // 2. Thiết lập Headers tiêu chuẩn để xác thực với Supabase REST API
    const LAY_HEADERS_CHUAN = () => {
        return {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation" // Yêu cầu trả về dữ liệu sau khi ghi/sửa
        };
    };

    /**
     * Hàm nội bộ chuyển đổi đối tượng Query sang chuỗi tham số URL của Supabase REST API
     * Ví dụ: { id: "123", trang_thai: "Đang chạy" } -> id=eq.123&trang_thai=eq.Đang%20chạy
     */
    function xayDungQueryString(matchQuery) {
        if (!matchQuery) return "";
        const parts = [];
        for (const [key, value] of Object.entries(matchQuery)) {
            if (value === null) {
                parts.push(`${key}=is.null`);
            } else {
                parts.push(`${key}=eq.${encodeURIComponent(value)}`);
            }
        }
        return parts.join("&");
    }

    // 3. Khởi tạo đối tượng kho lưu trữ toàn cục
    window.khoDuLieuVinhVien = {
        
        /**
         * A. PHƯƠNG THỨC ĐỌC DỮ LIỆU (READ) - docData
         * @param {string} tenBang - Tên bảng PostgreSQL trên Supabase (ví dụ: 'ca_dau', 'dat_slot')
         * @param {Object} boLoc - Các tham số lọc dữ liệu
         * @param {Object} boLoc.eq - Lọc bằng nhau (Ví dụ: { trang_thai: 'Đang chạy' })
         * @param {string} boLoc.select - Các cột cần lấy, mặc định là '*'
         * @param {string} boLoc.order - Sắp xếp (Ví dụ: 'created_at.desc')
         * @param {number} boLoc.limit - Giới hạn số dòng trả về
         * @returns {Promise<Array>} Danh sách kết quả trả về từ database
         */
        async docData(tenBang, boLoc = {}) {
            try {
                let url = `${SUPABASE_URL}/rest/v1/${tenBang}`;
                const thamSoUrl = [];

                // 1. Áp dụng bộ lọc bằng nhau (eq)
                if (boLoc.eq) {
                    for (const [key, val] of Object.entries(boLoc.eq)) {
                        if (val !== undefined && val !== null) {
                            thamSoUrl.push(`${key}=eq.${encodeURIComponent(val)}`);
                        }
                    }
                }

                // 2. Áp dụng cấu hình cột cần lấy (mặc định lấy hết '*')
                const selectCol = boLoc.select || "*";
                thamSoUrl.push(`select=${encodeURIComponent(selectCol)}`);

                // 3. Áp dụng sắp xếp (order)
                if (boLoc.order) {
                    thamSoUrl.push(`order=${encodeURIComponent(boLoc.order)}`);
                }

                // 4. Áp dụng giới hạn số dòng (limit)
                if (boLoc.limit) {
                    thamSoUrl.push(`limit=${boLoc.limit}`);
                }

                // Ghép tham số vào URL chính
                if (thamSoUrl.length > 0) {
                    url += `?${thamSoUrl.join("&")}`;
                }

                // Gửi yêu cầu GET tới Supabase
                const response = await fetch(url, {
                    method: "GET",
                    headers: LAY_HEADERS_CHUAN()
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Lỗi API Supabase khi đọc bảng ${tenBang}: ${errorText}`);
                }

                const data = await response.json();
                return data;
            } catch (error) {
                console.error("❌ [Lỗi Đọc Data]:", error);
                throw error;
            }
        },

        /**
         * B. PHƯƠNG THỨC GHI DỮ LIỆU (INSERT / UPDATE) - ghiData
         * @param {string} tenBang - Tên bảng PostgreSQL trên Supabase
         * @param {Object} payload - Dữ liệu cần ghi vào bảng
         * @param {Object|null} matchQuery - Lọc dòng cần UPDATE. 
         *                                   - Nếu truyền null: Tự động hiểu là THÊM MỚI (INSERT).
         *                                   - Nếu truyền đối tượng lọc (vd: { id: "..." }): Tiến hành CẬP NHẬT (UPDATE).
         * @returns {Promise<Array>} Trả về bản ghi vừa được ghi nhận thành công trong cơ sở dữ liệu
         */
        async ghiData(tenBang, payload, matchQuery = null) {
            try {
                let url = `${SUPABASE_URL}/rest/v1/${tenBang}`;
                let phuongThuc = "POST"; // Mặc định là INSERT
                
                // Nếu có điều kiện lọc matchQuery, chuyển sang chế độ UPDATE (PATCH)
                if (matchQuery && Object.keys(matchQuery).length > 0) {
                    phuongThuc = "PATCH";
                    const queryString = xayDungQueryString(matchQuery);
                    url += `?${queryString}`;
                }

                const response = await fetch(url, {
                    method: phuongThuc,
                    headers: LAY_HEADERS_CHUAN(),
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Lỗi API Supabase khi ghi vào bảng ${tenBang} (${phuongThuc}): ${errorText}`);
                }

                const data = await response.json();
                return data;
            } catch (error) {
                console.error(`❌ [Lỗi Ghi Data - ${tenBang}]:`, error);
                throw error;
            }
        },

        /**
         * C. PHƯƠNG THỨC XÓA DỮ LIỆU (DELETE) - xoaData
         * @param {string} tenBang - Tên bảng PostgreSQL trên Supabase
         * @param {Object} matchQuery - Bộ lọc xác định chính xác các dòng cần xóa (RÀNG BUỘC: Không được để trống để tránh xóa sạch bảng)
         * @returns {Promise<Array>} Trả về bản ghi vừa bị xóa
         */
        async xoaData(tenBang, matchQuery) {
            try {
                // Ràng buộc bảo mật tối cao: Không cho phép chạy xoaData nếu matchQuery rỗng
                if (!matchQuery || Object.keys(matchQuery).length === 0) {
                    throw new Error("Cảnh báo bảo mật: Không thể chạy hàm xoaData với bộ lọc rỗng để tránh mất mát dữ liệu toàn bảng.");
                }

                let url = `${SUPABASE_URL}/rest/v1/${tenBang}`;
                const queryString = xayDungQueryString(matchQuery);
                url += `?${queryString}`;

                const response = await fetch(url, {
                    method: "DELETE",
                    headers: LAY_HEADERS_CHUAN()
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Lỗi API Supabase khi xóa trong bảng ${tenBang}: ${errorText}`);
                }

                const data = await response.json();
                return data;
            } catch (error) {
                console.error(`❌ [Lỗi Xóa Data - ${tenBang}]:`, error);
                throw error;
            }
        },

        /**
         * D. UPSERT — INSERT hoặc UPDATE nếu đã tồn tại (conflict on PK)
         * Dùng Supabase Prefer: resolution=merge-duplicates
         * @param {string} tenBang  - Tên bảng
         * @param {Object|Array} payload - Dữ liệu (object đơn hoặc mảng)
         * @returns {Promise<Array>}
         */
        async upsertData(tenBang, payload) {
            try {
                const url = `${SUPABASE_URL}/rest/v1/${tenBang}`;
                const headers = Object.assign({}, LAY_HEADERS_CHUAN(), {
                    "Prefer": "resolution=merge-duplicates,return=representation"
                });
                const response = await fetch(url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload)
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Lỗi upsert bảng ${tenBang}: ${errorText}`);
                }
                const data = await response.json();
                return data;
            } catch (error) {
                console.error(`❌ [Lỗi Upsert - ${tenBang}]:`, error);
                throw error;
            }
        }
    };

    console.log("⚡ [Hệ thống điều vận Supabase]: Đã kích hoạt đối tượng window.khoDuLieuVinhVien thành công.");
})();
