// FILE: ket-noi-supabase.js
// NHIỆM VỤ: Giữ chìa khóa và mở cổng kết nối vĩnh viễn giữa Web và Kho dữ liệu đám mây Supabase

// 1. Khai báo thông số cấu hình chính chủ của Quốc
const SUPABASE_URL = "https://kyidswbpfafsoqsdhfpu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3Cb5pwmj_zzz88iNiVNmow_JGUWmDzI";

// 2. Bộ não xử lý gửi lệnh lên đám mây (Hệ thống Vietsub logic xử lý dữ liệu)
const khoDuLieuVinhVien = {
    // Hàm gửi dữ liệu lên bảng (Ví dụ: Thêm ca đấu mới, Thêm khách đăng ký)
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
            console.error(`❌ Lỗi ghi dữ liệu vào bảng ${tenBang}:`, error);
            return null;
        }
    },

    // Hàm lục lại dữ liệu cũ từ trên mạng về web (Ví dụ: Lấy danh sách ca đấu, Xem lịch sử tiền của khách)
    docData: async function(tenBang, cauLenhLoc = "") {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/${tenBang}?${cauLenhLoc}`, {
                method: 'GET',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            return await response.json();
        } catch (error) {
            console.error(`❌ Lỗi đọc dữ liệu từ bảng ${tenBang}:`, error);
            return [];
        }
    },

    // Hàm xóa dữ liệu (Ví dụ: Host gỡ ca đấu, Khách hủy slot ca đánh)
    xoaData: async function(tenBang, cotDieuKien, giaTriDieuKien) {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/${tenBang}?${cotDieuKien}=eq.${giaTriDieuKien}`, {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            return true;
        } catch (error) {
            console.error(`❌ Lỗi xóa dữ liệu trên bảng ${tenBang}:`, error);
            return false;
        }
    }
};

// Xuất bộ mã này ra toàn hệ thống để các file giao diện khác chỉ việc gọi lệnh sử dụng
window.khoDuLieuVinhVien = khoDuLieuVinhVien;
