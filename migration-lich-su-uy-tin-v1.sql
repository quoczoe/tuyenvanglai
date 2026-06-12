-- =====================================================================
-- MIGRATION: LỊCH SỬ ĐIỂM UY TÍN v1 — TUYENVANGLAI.IO.VN
-- Trạng thái: 🔴 CHỜ DUYỆT — KHÔNG tự chạy. Chạy 1 lần trên Supabase SQL Editor
--             SAU khi chủ app duyệt. (Thiết kế: docs/THIET-KE-NHOM3.md §3B)
--
-- ---------------------------------------------------------------------
-- MỤC ĐÍCH: mỗi lần điểm uy tín của 1 SĐT thay đổi → ghi 1 dòng audit.
--   Nguồn ghi (client): window.apDiemTheoTrangThai (Tham gia/Bùng/Khách hủy/
--   Host từ chối) + path host-hủy ca + admin chỉnh tay. UI: tab "Lịch sử điểm"
--   (Hồ sơ, khách đọc của CHÍNH mình) + admin xem của user bất kỳ (xét khiếu nại).
--
-- ---------------------------------------------------------------------
-- ĐỊNH DANH & BẢO MẬT (đồng bộ migration-thong-bao-v1.sql):
--   • Định danh người dùng = SĐT (TEXT). Khách/Host KHÔNG có auth.uid() — đăng
--     nhập qua RPC → UUID session token ở `guest_sessions`. Chỉ ADMIN có auth.uid().
--   • RLS bật, KHÔNG policy anon trực tiếp → anon không SELECT/UPDATE/DELETE qua REST.
--   • Đọc của CHÍNH MÌNH (khách/host): RPC token-verified `lay_lich_su_uy_tin`.
--   • Đọc của user bất kỳ (admin): RPC `get_lich_su_uy_tin_admin` — chỉ cấp cho
--     role `authenticated` (trong app này chỉ ADMIN là authenticated) + chặn
--     auth.uid() NULL. (Siết chặt hơn = bọc is_admin() khi đã chạy security-auth-v4.)
--   • GHI: RPC tin cậy `ghi_lich_su_uy_tin` (SECURITY DEFINER).
--     ⚠ CAVEAT v1 (theo chữ ký đã duyệt — KHÔNG có token): hàm ghi cấp cho anon
--       nên user đã đăng nhập có thể giả 1 dòng lịch sử (cùng mức rủi ro
--       ghi_thong_bao v1). Lý do bỏ token: hàm được gọi từ apDiemTheoTrangThai khi
--       HOST đổi trạng thái KHÁCH → actor là host, sdt ghi log là khách → không có
--       token của khách trong tay. Hardening tương lai: dời lời gọi ghi vào
--       action-RPC server-side (lộ trình bảo mật).
-- =====================================================================


-- ============================================================
-- PHẦN 1: BẢNG lich_su_uy_tin + INDEX
-- ============================================================
CREATE TABLE IF NOT EXISTS lich_su_uy_tin (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sdt         TEXT        NOT NULL,                 -- người được/bị thay đổi điểm
    delta       INTEGER     NOT NULL,                 -- +2, -10, -20, ...
    ly_do       TEXT        NOT NULL,                 -- "Tham gia ca đấu" | "Bùng kèo (lần N)" | ...
    ca_id       TEXT,                                 -- id ca_dau (text, nullable nếu admin chỉnh tay)
    ten_san     TEXT,                                 -- denormalize để hiển thị không cần join
    diem_truoc  INTEGER,                              -- điểm TRƯỚC khi áp
    diem_sau    INTEGER,                              -- điểm SAU khi áp (để hiển thị)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_lsut_ly_do_len  CHECK (char_length(ly_do) <= 120),
    CONSTRAINT chk_lsut_ten_len    CHECK (ten_san IS NULL OR char_length(ten_san) <= 160)
);

-- Đọc lịch sử 1 người (mới → cũ)
CREATE INDEX IF NOT EXISTS idx_lsut_sdt_time
    ON lich_su_uy_tin (sdt, created_at DESC);


-- ============================================================
-- PHẦN 2: RLS — khóa anon trực tiếp, chỉ thao tác qua RPC
-- ============================================================
ALTER TABLE lich_su_uy_tin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lsut_admin_all" ON lich_su_uy_tin;

-- KHÔNG tạo policy nào cho anon → mọi REST trực tiếp của anon bị từ chối.
-- Hàm SECURITY DEFINER bên dưới chạy bằng quyền owner nên bỏ qua RLS.

-- Admin (JWT) toàn quyền — CHỈ tạo nếu is_admin() tồn tại (security-auth-v4 Phần 2).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin') THEN
        EXECUTE 'CREATE POLICY "lsut_admin_all" ON lich_su_uy_tin FOR ALL TO authenticated '
             || 'USING (is_admin()) WITH CHECK (is_admin())';
    END IF;
END $$;


-- ============================================================
-- PHẦN 3: HÀM NỘI BỘ — xác thực phiên (token ↔ SĐT), tự đứng vững
-- (không phụ thuộc file khác; trùng pattern _tb_phien_hop_le)
-- ============================================================
CREATE OR REPLACE FUNCTION _lsut_phien_hop_le(p_token TEXT, p_sdt TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM guest_sessions
        WHERE token      = p_token
          AND sdt_khach  = p_sdt
          AND expires_at > now()
    );
$$;
-- Hàm nội bộ — KHÔNG cấp EXECUTE cho anon.


-- ============================================================
-- PHẦN 4: RPC GHI LỊCH SỬ (trusted insert — theo chữ ký đã duyệt, KHÔNG token)
-- Gọi sau khi PATCH điểm thành công, trong nhánh đã tính delta (đúng 1 lần).
-- ============================================================
CREATE OR REPLACE FUNCTION ghi_lich_su_uy_tin(
    p_sdt        TEXT,
    p_delta      INTEGER,
    p_ly_do      TEXT,
    p_ca_id      TEXT    DEFAULT NULL,
    p_ten_san    TEXT    DEFAULT NULL,
    p_diem_truoc INTEGER DEFAULT NULL,
    p_diem_sau   INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Validation tối thiểu
    IF p_sdt IS NULL OR char_length(p_sdt) = 0 OR char_length(p_sdt) > 15
       OR p_delta IS NULL
       OR p_ly_do IS NULL OR char_length(p_ly_do) = 0 THEN
        RETURN jsonb_build_object('status', 'invalid_input');
    END IF;

    p_ly_do   := left(p_ly_do, 120);
    p_ten_san := left(p_ten_san, 160);

    INSERT INTO lich_su_uy_tin (sdt, delta, ly_do, ca_id, ten_san, diem_truoc, diem_sau)
    VALUES (p_sdt, p_delta, p_ly_do, p_ca_id, p_ten_san, p_diem_truoc, p_diem_sau)
    RETURNING id INTO v_id;

    -- Dọn rác xác suất 1% — giữ 365 ngày (lịch sử nên giữ lâu hơn thông báo)
    IF random() < 0.01 THEN
        DELETE FROM lich_su_uy_tin WHERE created_at < now() - INTERVAL '365 days';
    END IF;

    RETURN jsonb_build_object('status', 'ok', 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION ghi_lich_su_uy_tin(TEXT, INTEGER, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO anon;


-- ============================================================
-- PHẦN 5: RPC ĐỌC LỊCH SỬ CỦA CHÍNH MÌNH (token-verified)
-- ============================================================
CREATE OR REPLACE FUNCTION lay_lich_su_uy_tin(
    p_token    TEXT,
    p_sdt      TEXT,
    p_gioi_han INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rows JSONB;
BEGIN
    IF NOT _lsut_phien_hop_le(p_token, p_sdt) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    WITH src AS (
        SELECT id, delta, ly_do, ca_id, ten_san, diem_truoc, diem_sau, created_at
        FROM lich_su_uy_tin
        WHERE sdt = p_sdt
        ORDER BY created_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_gioi_han, 50), 1), 200)
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(src) ORDER BY src.created_at DESC), '[]'::jsonb)
      INTO v_rows
    FROM src;

    RETURN jsonb_build_object('status', 'ok', 'data', v_rows);
END;
$$;
GRANT EXECUTE ON FUNCTION lay_lich_su_uy_tin(TEXT, TEXT, INTEGER) TO anon;


-- ============================================================
-- PHẦN 6: RPC ADMIN — đọc lịch sử của user BẤT KỲ (xét khiếu nại)
-- Chỉ role `authenticated` (admin) + chặn auth.uid() NULL. KHÔNG cấp anon.
-- ============================================================
CREATE OR REPLACE FUNCTION get_lich_su_uy_tin_admin(
    p_sdt      TEXT,
    p_gioi_han INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rows JSONB;
BEGIN
    -- Chỉ người đăng nhập Supabase Auth (admin) mới gọi được.
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    -- (Hardening: nếu is_admin() đã có → kiểm chặt hơn)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin') THEN
        IF NOT is_admin() THEN
            RETURN jsonb_build_object('status', 'forbidden');
        END IF;
    END IF;

    WITH src AS (
        SELECT id, delta, ly_do, ca_id, ten_san, diem_truoc, diem_sau, created_at
        FROM lich_su_uy_tin
        WHERE sdt = p_sdt
        ORDER BY created_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_gioi_han, 100), 1), 500)
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(src) ORDER BY src.created_at DESC), '[]'::jsonb)
      INTO v_rows
    FROM src;

    RETURN jsonb_build_object('status', 'ok', 'data', v_rows);
END;
$$;
REVOKE EXECUTE ON FUNCTION get_lich_su_uy_tin_admin(TEXT, INTEGER) FROM anon;
GRANT  EXECUTE ON FUNCTION get_lich_su_uy_tin_admin(TEXT, INTEGER) TO authenticated;


-- =====================================================================
-- VERIFY — chạy sau khi đã chạy toàn bộ phần trên
-- =====================================================================
-- 1) Bảng + cột (mong đợi 9 cột):
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'lich_su_uy_tin'
--  ORDER BY ordinal_position;
--
-- 2) Index (mong đợi idx_lsut_sdt_time):
-- SELECT indexname FROM pg_indexes
--  WHERE schemaname = 'public' AND tablename = 'lich_su_uy_tin';
--
-- 3) RLS bật (mong đợi true):
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'lich_su_uy_tin';
--
-- 4) Hàm RPC (mong đợi 4 dòng):
-- SELECT routine_name FROM information_schema.routines
--  WHERE routine_schema = 'public'
--    AND routine_name IN ('_lsut_phien_hop_le','ghi_lich_su_uy_tin',
--        'lay_lich_su_uy_tin','get_lich_su_uy_tin_admin')
--  ORDER BY routine_name;
--
-- 5) anon KHÔNG đọc trực tiếp được (RLS khóa) — chạy bằng anon key phải trả []:
--    GET .../rest/v1/lich_su_uy_tin?select=*   → kỳ vọng [] (0 dòng)
--
-- 6) Smoke ghi+đọc (thay <SĐT>/<TOKEN> bằng phiên thật):
--    SELECT ghi_lich_su_uy_tin('<SĐT>', -10, 'Bùng kèo (lần 1)', NULL, 'Sân Test', 100, 90);
--    SELECT lay_lich_su_uy_tin('<TOKEN>', '<SĐT>', 20);   → status ok + 1 dòng
-- =====================================================================
