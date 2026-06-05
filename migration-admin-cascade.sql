-- ============================================================
-- MIGRATION: admin_cascade_xoa_user v2 + policies
-- Mục đích: Admin xóa tài khoản → xóa sạch toàn bộ dữ liệu liên quan
-- Phiên bản 2: không phụ thuộc auth_uid (cột này chỉ có trong security-auth-v4.sql)
-- Cách chạy: Paste toàn bộ vào Supabase Dashboard → SQL Editor → Run
-- ============================================================


-- ── PHẦN 1: RPC cascade delete (SECURITY DEFINER — bypass RLS) ──
-- Chỉ yêu cầu auth.uid() IS NOT NULL (có Supabase Auth JWT).
-- Không phụ thuộc cột auth_uid hay hàm is_admin() → chạy được ngay cả khi
-- security-auth-v4.sql chưa được deploy.

CREATE OR REPLACE FUNCTION admin_cascade_xoa_user(p_sdt TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Chỉ cho Supabase Auth session hợp lệ (admin panel dùng signInWithPassword)
    -- anon key sẽ có auth.uid() = NULL → bị chặn
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    -- Bước 1: Xóa slot của user trong ca đấu của người khác
    DELETE FROM dat_slot WHERE sdt_khach = p_sdt;

    -- Bước 2: Xóa ca đấu do user này tổ chức
    --         FK CASCADE (dat_slot.id_ca_dau → ca_dau.id ON DELETE CASCADE)
    --         tự xóa dat_slot trong những ca này
    DELETE FROM ca_dau WHERE sdt_nguoi_tao = p_sdt;

    -- Bước 3: Xóa session token (bảng có thể chưa tồn tại nếu security SQL chưa deploy)
    BEGIN
        DELETE FROM guest_sessions WHERE sdt_khach = p_sdt;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Bảng chưa tồn tại hoặc lỗi khác → bỏ qua, tiếp tục
    END;

    -- Bước 4: Xóa tài khoản chính
    DELETE FROM nguoi_dung WHERE sdt_khach = p_sdt;

    RETURN jsonb_build_object('status', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION admin_cascade_xoa_user TO authenticated;


-- ── PHẦN 2: DELETE policy cho Admin trên dat_slot ──

DROP POLICY IF EXISTS "admin_delete_dat_slot" ON dat_slot;
CREATE POLICY "admin_delete_dat_slot"
    ON dat_slot FOR DELETE
    TO authenticated
    USING (auth.uid() IS NOT NULL);


-- ── PHẦN 3: DELETE policy cho Admin trên nguoi_dung ──
-- Cho phép admin (authenticated JWT) xóa user — cần cho REST fallback

DROP POLICY IF EXISTS "admin_delete_nguoi_dung_v2" ON nguoi_dung;
CREATE POLICY "admin_delete_nguoi_dung_v2"
    ON nguoi_dung FOR DELETE
    TO authenticated
    USING (auth.uid() IS NOT NULL);


-- ── PHẦN 4: ALL policy cho Admin trên ca_dau (nếu chưa có) ──

DROP POLICY IF EXISTS "admin_all_ca_dau_v2" ON ca_dau;
CREATE POLICY "admin_all_ca_dau_v2"
    ON ca_dau FOR ALL
    TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);


-- ── PHẦN 5: Quyền Admin trên guest_sessions (nếu bảng tồn tại) ──

DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'guest_sessions'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS "admin_all_guest_sessions" ON guest_sessions';
        EXECUTE '
            CREATE POLICY "admin_all_guest_sessions"
                ON guest_sessions FOR ALL
                TO authenticated
                USING (auth.uid() IS NOT NULL)
                WITH CHECK (auth.uid() IS NOT NULL)
        ';
    END IF;
END $$;
