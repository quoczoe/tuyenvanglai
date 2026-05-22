/* ==========================================================================
   HỆ THỐNG KẾT NỐI CƠ SỞ DỮ LIỆU ĐÁM MÂY SUPABASE (ket-noi-supabase.js)
   Nền tảng: CHỢ KÈO VÃNG LAI (tuyenvanglai.io.vn)
   Trạng thái: ĐÃ VÁ LỖI CÚ PHÁP TIÊU ĐỀ - SẴN SÀNG VẬN HÀNH PRODUCTION
   ========================================================================== */

// Khai báo các tham số cấu hình hạ tầng đám mây chính chủ từ Supabase
const SUPABASE_URL = "https://kyidswbpfafsoqsdhfpu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3Cb5pwmj_zzz88iNiVNmow_JGUWmDzI";

// Định nghĩa đối tượng quản trị luồng dữ liệu toàn cục
const khoDuLieuVinhVien = {
    
    /**
     * 1. HÀM GHI DỮ LIỆU MỚI (POST)
     * Thêm một bản ghi mới vào bảng chỉ định
     * @param {string} tenBang - Tên bảng trên Supabase (ca_dau, dat_slot,...)
     * @param {object} duLieuMuonLuu - Gói dữ liệu dạng Object cần chèn vào database
     */
    ghiData: async function(tenBang, duLieuMuonLuu) {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/${tenBang}`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(duLieuMuonLuu)
            });
            return await response.json();
        } catch (error) { 
            console.error("Lỗi nghiêm trọng khi ghi dữ liệu lên Supabase:", error);
            return null; 
        }
    },

    /**
     * 2. HÀM ĐỌC / TRUY VẤN DỮ LIỆU (GET) - ĐÃ ĐƯỢC VÁ LỖI CÚ PHÁP HOÀN TOÀN
     * Lấy dữ liệu từ bảng kết hợp các tham số lọc động
     * @param {string} tenBang - Tên bảng cần lấy dữ liệu
     * @param {string} cauLenhLoc - Chuỗi tham số lọc chuẩn REST (Ví dụ: id=eq.popup_chinh)
     */
    docData: async function(tenBang, cauLenhLoc = "") {
        try {
            // Chuẩn hóa đường dẫn URL, kiểm tra nếu có tham số lọc thì nối chuỗi hợp lệ
            const urlDich = cauLenhLoc ? `${SUPABASE_URL}/rest/v1/${tenBang}?${cauLenhLoc}` : `${SUPABASE_URL}/rest/v1/${tenBang}`;
            
            const response = await fetch(urlDich, {
                method: 'GET',
                headers: { 
                    'apikey': SUPABASE_ANON_KEY, 
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}` 
                }
            });
            return await response.json();
        } catch (error) { 
            console.error("Lỗi nghiêm trọng khi truy vấn dữ liệu từ Supabase:", error);
            return []; 
        }
    },

    /**
     * 3. HÀM XÓA BẢN GHI DỮ LIỆU (DELETE)
     * Gỡ bỏ dữ liệu thỏa mãn điều kiện chỉ định
     * @param {string} tenBang - Tên bảng chứa bản ghi cần xóa
     * @param {string} cotDieuKien - Tên cột dùng để đối chiếu (Ví dụ: id, ma_key,...)
     * @param {string|number} giaTriDieuKien - Giá trị đích cần xóa
     */
    xoaData: async function(tenBang, cotDieuKien, giaTriDieuKien) {
        try {
            await fetch(`${SUPABASE_URL}/rest/v1/${tenBang}?${cotDieuKien}=eq.${giaTriDieuKien}`, {
                method: 'DELETE',
                headers: { 
                    'apikey': SUPABASE_ANON_KEY, 
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}` 
                }
            });
            return true;
        } catch (error) { 
            console.error("Lỗi nghiêm trọng khi thực thi xóa dữ liệu trên Supabase:", error);
            return false; 
        }
    }
};

// Đóng gói và đính kèm thực thể xử lý vào đối tượng window toàn cục của trình duyệt
window.khoDuLieuVinhVien = khoDuLieuVinhVien;
