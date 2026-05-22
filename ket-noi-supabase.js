// FILE: ket-noi-supabase.js
// CẤU HÌNH HẠ TẦNG KẾT NỐI SUPABASE CHUẨN SẢN XUẤT

const SUPABASE_URL = "https://kyidswbpfafsoqsdhfpu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3Cb5pwmj_zzz88iNiVNmow_JGUWmDzI";

const khoDuLieuVinhVien = {
    // 1. Luồng ghi dữ liệu (POST)
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
            console.error("Lỗi ghi dữ liệu lên Cloud:", error);
            return null; 
        }
    },
    
    // 2. Luồng đọc dữ liệu (GET) - ĐÃ ĐƯỢC VÁ LỖI CÚ PHÁP TIÊU ĐỀ HỢP LỆ
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
            console.error("Lỗi truy vấn dữ liệu từ Cloud:", error);
            return []; 
        }
    },
    
    // 3. Luồng xóa dữ liệu (DELETE)
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
            console.error("Lỗi xóa dữ liệu trên Cloud:", error);
            return false; 
        }
    }
};

// Khởi tạo thực thể đối tượng lên cửa sổ trình duyệt toàn cục
window.khoDuLieuVinhVien = khoDuLieuVinhVien;
