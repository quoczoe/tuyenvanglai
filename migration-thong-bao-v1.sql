-- =====================================================================
-- MIGRATION: HỆ THỐNG THÔNG BÁO v1 — TUYENVANGLAI.IO.VN
-- Trạng thái: 🔴 CHỜ DUYỆT — KHÔNG tự chạy. Chạy 1 lần trên Supabase SQL Editor
--             SAU khi chủ app duyệt.
-- Phương án:  Polling 30s (theo docs/THIET-KE-THONG-BAO.md — đã duyệt).
-- Phạm vi v1: 7 sự kiện G1 / G2 / G3 / H1 / H2 / H3b / S1.
--             (Admin broadcast = v2 — KHÔNG nằm trong file này.)
--
-- ---------------------------------------------------------------------
-- QUYẾT ĐỊNH BƯỚC 0 — KIỂU ĐỊNH DANH NGƯỜI NHẬN:  nguoi_nhan TEXT (= SĐT)
-- ---------------------------------------------------------------------
--   KHÔNG dùng user_id UUID. Lý do:
--   • Khách và Host đăng nhập qua RPC `phan_he_guest_login` → nhận UUID
--     SESSION TOKEN lưu ở bảng `guest_sessions` (token ↔ sdt_khach). Cả hai vai
--     trò KHÔNG có tài khoản Supabase Auth → KHÔNG có auth.uid(). Chỉ ADMIN có
--     auth.uid() (UUID), và admin broadcast để v2.
--   • Toàn bộ schema định danh người dùng bằng SĐT (TEXT): nguoi_dung.sdt_khach,
--     ca_dau.sdt_nguoi_tao, dat_slot.sdt_khach, danh_gia_tin_dung.sdt_nguoi_viet
--     / sdt_nguoi_bi_danh_gia. Tại 7 điểm phát thông báo, code đã có sẵn SĐT của
--     người nhận trong tay → dùng TEXT khớp 100%, không phải tra cứu auth.uid().
--
-- ---------------------------------------------------------------------
-- BẢO MẬT (đáp ứng yêu cầu "đọc/cập-nhật của chính mình, KHÔNG dựa filter client"):
-- ---------------------------------------------------------------------
--   • RLS bật trên `thong_bao` và KHÔNG tạo policy trực tiếp cho `anon`
--     → anon KHÔNG thể SELECT/INSERT/UPDATE/DELETE bảng này qua REST
--     → không thể xem trộm / sửa / xóa thông báo của người khác bằng cách đổi
--       tham số filter ở client.
--   • Đọc / đếm chưa đọc / đánh dấu đã đọc / GHI: CHỈ thực hiện qua các hàm
--     SECURITY DEFINER bên dưới. Mỗi hàm tự xác thực TOKEN PHIÊN khớp đúng SĐT
--     người gọi (tra `guest_sessions`) trước khi thao tác.
--   • INSERT chỉ qua hàm tin cậy `ghi_thong_bao` (không có policy INSERT cho anon).
--     `ghi_thong_bao` bắt buộc token người GỬI hợp lệ → chỉ user đã đăng nhập mới
--     phát được thông báo (giảm spam ẩn danh).
--   • Tự verify token NỘI BỘ (`_tb_phien_hop_le`) — KHÔNG phụ thuộc
--     `verify_guest_token` (security-auth-v4 Phần 5). Migration tự đứng vững miễn
--     `guest_sessions` tồn tại (security-auth-v4 Phần 1 — đã chạy) và RPC login
--     đang hoạt động (đã xác nhận: login chỉ có đường RPC, đang sinh token sống).
--     ⚠ Chủ ý KHÔNG kiểm is_active trong verify đọc → user bị KHÓA vẫn đọc được
--       thông báo "tài khoản bị khóa" (S1).
-- =====================================================================


-- ============================================================
-- PHẦN 1: BẢNG thong_bao + INDEX
-- ============================================================
CREATE TABLE IF NOT EXISTS thong_bao (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nguoi_nhan  TEXT        NOT NULL,                  -- SĐT người nhận (khách / host)
    loai        TEXT        NOT NULL,                  -- mã loại: G1/G2/G3/H1/H2/H3b/S1
    tieu_de     TEXT        NOT NULL,
    noi_dung    TEXT,
    link_data   JSONB       NOT NULL DEFAULT '{}'::jsonb, -- {caId, slotId, tab, gop_key,...} điều hướng + gộp
    da_doc      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Chặn data flooding
    CONSTRAINT chk_tb_tieu_de_len  CHECK (char_length(tieu_de) <= 200),
    CONSTRAINT chk_tb_noi_dung_len CHECK (noi_dung IS NULL OR char_length(noi_dung) <= 600),
    CONSTRAINT chk_tb_loai_len     CHECK (char_length(loai) <= 40)
);

-- Đọc danh sách của 1 người (mới → cũ)
CREATE INDEX IF NOT EXISTS idx_thong_bao_nhan_time
    ON thong_bao (nguoi_nhan, created_at DESC);

-- Đếm chưa đọc của 1 người
CREATE INDEX IF NOT EXISTS idx_thong_bao_nhan_chuadoc
    ON thong_bao (nguoi_nhan, da_doc);


-- ============================================================
-- PHẦN 2: RLS — khóa anon trực tiếp, chỉ thao tác qua RPC
-- ============================================================
ALTER TABLE thong_bao ENABLE ROW LEVEL SECURITY;

-- Dọn policy cũ (chạy lại an toàn)
DROP POLICY IF EXISTS "tb_admin_all" ON thong_bao;

-- KHÔNG tạo policy nào cho anon → mọi REST trực tiếp của anon bị từ chối.
-- Các hàm SECURITY DEFINER bên dưới chạy bằng quyền owner nên BỎ QUA RLS → vẫn hoạt động.

-- Admin (JWT) toàn quyền (hỗ trợ/gỡ rối) — CHỈ tạo nếu is_admin() tồn tại
-- (security-auth-v4 Phần 2). Bọc trong DO để file không lỗi khi is_admin() chưa có.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin') THEN
        EXECUTE 'CREATE POLICY "tb_admin_all" ON thong_bao FOR ALL TO authenticated '
             || 'USING (is_admin()) WITH CHECK (is_admin())';
    END IF;
END $$;


-- ============================================================
-- PHẦN 3: HÀM NỘI BỘ — xác thực phiên (token ↔ SĐT)
-- KHÔNG kiểm is_active (để user bị khóa vẫn đọc được TB khóa TK — S1)
-- ============================================================
CREATE OR REPLACE FUNCTION _tb_phien_hop_le(p_token TEXT, p_sdt TEXT)
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
-- Hàm nội bộ — KHÔNG cấp EXECUTE cho anon (chỉ gọi từ các hàm SECURITY DEFINER khác).


-- ============================================================
-- PHẦN 4: RPC GHI THÔNG BÁO (trusted insert + chống spam gộp)
-- Bắt token NGƯỜI GỬI (actor đã đăng nhập). Người nhận = p_nguoi_nhan (SĐT).
-- p_gop_giay > 0 + link_data.gop_key → gộp vào TB chưa đọc cùng khóa trong cửa sổ
--   (dùng cho H1/H2: "N khách vừa đặt/hủy ca X" thay vì N dòng).
-- ============================================================
CREATE OR REPLACE FUNCTION ghi_thong_bao(
    p_token         TEXT,
    p_sdt_nguoi_gui TEXT,
    p_nguoi_nhan    TEXT,
    p_loai          TEXT,
    p_tieu_de       TEXT,
    p_noi_dung      TEXT      DEFAULT NULL,
    p_link_data     JSONB     DEFAULT '{}'::jsonb,
    p_gop_giay      INTEGER   DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id      UUID;
    v_gop_key TEXT := p_link_data->>'gop_key';
BEGIN
    -- Người gửi phải là phiên hợp lệ
    IF NOT _tb_phien_hop_le(p_token, p_sdt_nguoi_gui) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    -- Validation tối thiểu
    IF p_nguoi_nhan IS NULL OR char_length(p_nguoi_nhan) = 0 OR char_length(p_nguoi_nhan) > 15
       OR p_tieu_de IS NULL OR char_length(p_tieu_de) = 0 THEN
        RETURN jsonb_build_object('status', 'invalid_input');
    END IF;

    -- Cắt độ dài an toàn (phòng vượt CHECK)
    p_tieu_de  := left(p_tieu_de, 200);
    p_noi_dung := left(p_noi_dung, 600);
    p_loai     := left(COALESCE(p_loai, ''), 40);
    p_link_data := COALESCE(p_link_data, '{}'::jsonb);

    -- CHỐNG SPAM: gộp vào bản CHƯA đọc cùng (nguoi_nhan, loai, gop_key) trong cửa sổ
    IF p_gop_giay > 0 AND v_gop_key IS NOT NULL THEN
        UPDATE thong_bao
           SET noi_dung   = p_noi_dung,
               tieu_de    = p_tieu_de,
               link_data  = p_link_data,
               da_doc     = false,
               created_at = now()
         WHERE id = (
             SELECT id FROM thong_bao
              WHERE nguoi_nhan = p_nguoi_nhan
                AND loai = p_loai
                AND link_data->>'gop_key' = v_gop_key
                AND da_doc = false
                AND created_at > now() - make_interval(secs => p_gop_giay)
              ORDER BY created_at DESC
              LIMIT 1
         )
         RETURNING id INTO v_id;

        IF v_id IS NOT NULL THEN
            RETURN jsonb_build_object('status', 'ok', 'id', v_id, 'gop', true);
        END IF;
    END IF;

    INSERT INTO thong_bao (nguoi_nhan, loai, tieu_de, noi_dung, link_data)
    VALUES (p_nguoi_nhan, p_loai, p_tieu_de, p_noi_dung, p_link_data)
    RETURNING id INTO v_id;

    -- Dọn rác xác suất 2% (giảm lock table) — xóa TB > 30 ngày
    IF random() < 0.02 THEN
        DELETE FROM thong_bao WHERE created_at < now() - INTERVAL '30 days';
    END IF;

    RETURN jsonb_build_object('status', 'ok', 'id', v_id, 'gop', false);
END;
$$;
GRANT EXECUTE ON FUNCTION ghi_thong_bao(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER) TO anon;


-- ============================================================
-- PHẦN 5: RPC ĐỌC THÔNG BÁO CỦA CHÍNH MÌNH (token-verified, lọc 30 ngày)
-- p_tu_luc: nếu truyền → chỉ lấy created_at > p_tu_luc (poll delta).
-- ============================================================
CREATE OR REPLACE FUNCTION lay_thong_bao(
    p_token    TEXT,
    p_sdt      TEXT,
    p_tu_luc   TIMESTAMPTZ DEFAULT NULL,
    p_gioi_han INTEGER     DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rows JSONB;
BEGIN
    IF NOT _tb_phien_hop_le(p_token, p_sdt) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    WITH src AS (
        SELECT id, loai, tieu_de, noi_dung, link_data, da_doc, created_at
        FROM thong_bao
        WHERE nguoi_nhan = p_sdt
          AND created_at > now() - INTERVAL '30 days'
          AND (p_tu_luc IS NULL OR created_at > p_tu_luc)
        ORDER BY created_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_gioi_han, 50), 1), 100)
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(src) ORDER BY src.created_at DESC), '[]'::jsonb)
      INTO v_rows
    FROM src;

    RETURN jsonb_build_object('status', 'ok', 'data', v_rows);
END;
$$;
GRANT EXECUTE ON FUNCTION lay_thong_bao(TEXT, TEXT, TIMESTAMPTZ, INTEGER) TO anon;


-- ============================================================
-- PHẦN 6: RPC ĐẾM CHƯA ĐỌC (badge số trên chuông)
-- ============================================================
CREATE OR REPLACE FUNCTION dem_thong_bao_chua_doc(p_token TEXT, p_sdt TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_so INTEGER;
BEGIN
    IF NOT _tb_phien_hop_le(p_token, p_sdt) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    SELECT count(*) INTO v_so
    FROM thong_bao
    WHERE nguoi_nhan = p_sdt
      AND da_doc = false
      AND created_at > now() - INTERVAL '30 days';

    RETURN jsonb_build_object('status', 'ok', 'so_chua_doc', v_so);
END;
$$;
GRANT EXECUTE ON FUNCTION dem_thong_bao_chua_doc(TEXT, TEXT) TO anon;


-- ============================================================
-- PHẦN 7: RPC ĐÁNH DẤU ĐÃ ĐỌC (theo danh sách id — chỉ của chính mình)
-- ============================================================
CREATE OR REPLACE FUNCTION danh_dau_da_doc(p_token TEXT, p_sdt TEXT, p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_so INTEGER;
BEGIN
    IF NOT _tb_phien_hop_le(p_token, p_sdt) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
        RETURN jsonb_build_object('status', 'ok', 'so_cap_nhat', 0);
    END IF;

    WITH upd AS (
        UPDATE thong_bao SET da_doc = true
         WHERE nguoi_nhan = p_sdt
           AND id = ANY(p_ids)
           AND da_doc = false
        RETURNING 1
    )
    SELECT count(*) INTO v_so FROM upd;

    RETURN jsonb_build_object('status', 'ok', 'so_cap_nhat', v_so);
END;
$$;
GRANT EXECUTE ON FUNCTION danh_dau_da_doc(TEXT, TEXT, UUID[]) TO anon;


-- ============================================================
-- PHẦN 8: RPC ĐÁNH DẤU TẤT CẢ ĐÃ ĐỌC
-- ============================================================
CREATE OR REPLACE FUNCTION danh_dau_tat_ca_da_doc(p_token TEXT, p_sdt TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_so INTEGER;
BEGIN
    IF NOT _tb_phien_hop_le(p_token, p_sdt) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    WITH upd AS (
        UPDATE thong_bao SET da_doc = true
         WHERE nguoi_nhan = p_sdt
           AND da_doc = false
           AND created_at > now() - INTERVAL '30 days'
        RETURNING 1
    )
    SELECT count(*) INTO v_so FROM upd;

    RETURN jsonb_build_object('status', 'ok', 'so_cap_nhat', v_so);
END;
$$;
GRANT EXECUTE ON FUNCTION danh_dau_tat_ca_da_doc(TEXT, TEXT) TO anon;


-- =====================================================================
-- VERIFY — chạy sau khi đã chạy toàn bộ phần trên
-- =====================================================================
-- 1) Bảng + cột:
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'thong_bao'
--  ORDER BY ordinal_position;
--
-- 2) Index (mong đợi: idx_thong_bao_nhan_time, idx_thong_bao_nhan_chuadoc):
-- SELECT indexname FROM pg_indexes
--  WHERE schemaname = 'public' AND tablename = 'thong_bao';
--
-- 3) RLS bật + policy (mong đợi: rowsecurity = true; chỉ có tb_admin_all nếu is_admin() tồn tại):
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'thong_bao';
-- SELECT policyname, cmd, roles FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'thong_bao';
--
-- 4) Hàm RPC (mong đợi 6 dòng):
-- SELECT routine_name FROM information_schema.routines
--  WHERE routine_schema = 'public'
--    AND routine_name IN ('_tb_phien_hop_le','ghi_thong_bao','lay_thong_bao',
--        'dem_thong_bao_chua_doc','danh_dau_da_doc','danh_dau_tat_ca_da_doc')
--  ORDER BY routine_name;
--
-- 5) anon KHÔNG đọc trực tiếp được (RLS khóa) — chạy bằng anon key phải trả [] / lỗi:
--    GET .../rest/v1/thong_bao?select=*   → kỳ vọng [] (0 dòng)
-- =====================================================================
