const SUPABASE_URL = "https://kyidswbpfafsoqsdhfpu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3Cb5pwmj_zzz88iNiVNmow_JGUWmDzI";

const khoDuLieuVinhVien = {
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
        } catch (error) { return null; }
    },
    docData: async function(tenBang, cauLenhLoc = "") {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/${tenBang}?${cauLenhLoc}`, {
                method: 'GET',
                headers: { 'apikey': varKey = SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
            });
            return await response.json();
        } catch (error) { return []; }
    },
    xoaData: async function(tenBang, cotDieuKien, giaTriDieuKien) {
        try {
            await fetch(`${SUPABASE_URL}/rest/v1/${tenBang}?${cotDieuKien}=eq.${giaTriDieuKien}`, {
                method: 'DELETE',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
            });
            return true;
        } catch (error) { return false; }
    }
};
window.khoDuLieuVinhVien = khoDuLieuVinhVien;
