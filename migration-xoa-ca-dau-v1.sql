-- ============================================================
-- MIGRATION: RPC XÓA CA ĐẤU (token-verified, SECURITY DEFINER)
-- Dự án: TUYENVANGLAI.IO.VN  ·  Phiên: 2026-06-19
-- ------------------------------------------------------------
-- VẤN ĐỀ (đã xác nhận live):
--   role `anon` KHÔNG có policy DELETE trên ca_dau/dat_slot → REST DELETE
--   trả HTTP 204 nhưng XÓA 0 DÒNG (silent no-op). Host bấm "Xóa" ca của
--   chính mình → app verify thấy ca VẪN CÒN → toast "Ca đấu vẫn còn trên
--   hệ thống. Có thể do quyền truy cập. Liên hệ Admin...".
--
-- GIẢI PHÁP:
--   1 hàm SECURITY DEFINER (chạy bằng quyền OWNER → BỎ QUA RLS). Hàm tự:
--     • Xác thực TOKEN PHIÊN khớp đúng SĐT người gọi (tra guest_sessions).
--     • So khớp QUYỀN SỞ HỮU: ca_dau.sdt_nguoi_tao = SĐT người gọi.
--     • Dọn dat_slot CON trước (an toàn kể cả khi FK thiếu ON DELETE CASCADE),
--       rồi xóa ca_dau GỐC.
--   App (phan-he-host.js → guestRPC.xoaCaDau) gọi hàm này; nếu RPC chưa deploy
--   thì fallback REST trực tiếp (chỉ chạy được trong context có quyền DELETE).
--
-- PHỤ THUỘC: bảng guest_sessions(token, sdt_khach, expires_at) đã tồn tại
--   (security-auth-v4 Phần 1 — đã chạy). Cùng pattern với guest_dat_slot,
--   guest_huy_slot, ghi_thong_bao...  KHÔNG thêm bảng/cột mới.
-- ============================================================

CREATE OR REPLACE FUNCTION guest_xoa_ca_dau(
    p_token TEXT,
    p_sdt   TEXT,
    p_ca_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner TEXT;
    v_n     INTEGER := 0;
BEGIN
    -- 1. Phiên đăng nhập hợp lệ (token ↔ sdt, chưa hết hạn)
    IF NOT EXISTS (
        SELECT 1 FROM guest_sessions
        WHERE token = p_token AND sdt_khach = p_sdt AND expires_at > now()
    ) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    -- 2. Ca tồn tại?
    SELECT sdt_nguoi_tao INTO v_owner FROM ca_dau WHERE id = p_ca_id;
    IF NOT FOUND THEN
        -- Ca không còn (đã bị xóa trước đó) → coi như hoàn tất, không lỗi.
        RETURN jsonb_build_object('status', 'khong_ton_tai');
    END IF;

    -- 3. So khớp QUYỀN SỞ HỮU — CHỈ chủ ca mới được xóa
    IF v_owner IS DISTINCT FROM p_sdt THEN
        RETURN jsonb_build_object('status', 'khong_so_huu');
    END IF;

    -- 4. Dọn slot con TRƯỚC (FK) rồi xóa ca GỐC theo đúng chủ sở hữu
    DELETE FROM dat_slot WHERE id_ca_dau = p_ca_id;
    DELETE FROM ca_dau   WHERE id = p_ca_id AND sdt_nguoi_tao = p_sdt;
    GET DIAGNOSTICS v_n = ROW_COUNT;

    RETURN jsonb_build_object('status', 'ok', 'deleted', v_n);
END;
$$;

-- Chỉ cấp EXECUTE cho anon (app gọi bằng anon key + token phiên trong tham số).
GRANT EXECUTE ON FUNCTION guest_xoa_ca_dau(TEXT, TEXT, UUID) TO anon;

-- ── VERIFY (chạy tay trên SQL Editor sau khi tạo hàm) ─────────
--   SELECT guest_xoa_ca_dau('<token-sai>', '<sdt>', '<ca_uuid>');
--     → {"status":"unauthorized"}
--   SELECT guest_xoa_ca_dau('<token-đúng>', '<sdt-không-phải-chủ>', '<ca_uuid>');
--     → {"status":"khong_so_huu"}
--   SELECT guest_xoa_ca_dau('<token-đúng>', '<sdt-chủ-ca>', '<ca_uuid>');
--     → {"status":"ok","deleted":1}  (ca + slot con biến mất khỏi DB)
-- ============================================================
