// FILE: ket-noi-supabase.js
// NHIỆM VỤ: Giữ chìa khóa bảo mật và xử lý cổng trung chuyển dữ liệu đám mây của Quốc Zoe

const SUPABASE_URL = "https://kyidswbpfafsoqsdhfpu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3Cb5pwmj_zzz88iNiVNmow_JGUWmDzI";

const khoDuLieuVinhVien = {
    // Hàm ghi mới data vào bảng
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
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`❌ Lỗi ghi bảng ${tenBang}:`, error);
            return null;
        }
    },

    // Hàm đọc data từ mây về web
    docData: async function(tenBang, cauLenhLoc = "") {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/${tenBang}?${cauLenhLoc}`, {
                method: 'GET',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`❌ Lỗi đọc bảng ${tenBang}:`, error);
            return [];
        }
    },

    // Hàm xóa data vĩnh viễn trên mây
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
            console.error(`❌ Lỗi xóa bảng ${tenBang}:`, error);
            return false;
        }
    }
};

window.khoDuLieuVinhVien = khoDuLieuVinhVien;
