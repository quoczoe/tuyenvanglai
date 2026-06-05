-- ============================================================
-- MIGRATION: admin_cascade_xoa_user + admin DELETE policies
-- Mục đích: Admin xóa tài khoản → xóa sạch toàn bộ dữ liệu liên quan
--           (dat_slot, ca_dau, guest_sessions, nguoi_dung) trong 1 transaction
-- Cách chạy: Paste toàn bộ file này vào Supabase Dashboard → SQL Editor → Run
-- ============================================================


-- ── PHẦN 1: RPC cascade delete (SECURITY DEFINER — bypass RLS hoàn toàn) ──

CREATE OR REPLACE FUNCTION admin_cascade_xoa_user(p_sdt TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Kiểm tra quyền: chỉ Supabase Auth JWT (authenticated) mới được gọi
    -- Admin panel dùng supabase.auth.signInWithPassword() → vai_tro = 'admin'
    IF auth.role() != 'authenticated' THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    -- Kiểm tra user gọi hàm có phải admin không
    -- (Dùng SECURITY DEFINER nên không bị circular RLS)
    IF NOT EXISTS (
        SELECT 1 FROM nguoi_dung
        WHERE auth_uid = auth.uid()
          AND vai_tro   = 'admin'
          AND is_active = true
    ) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    -- Bước 1: Xóa slot khách này đã đặt trong ca đấu của người khác
    DELETE FROM dat_slot WHERE sdt_khach = p_sdt;

    -- Bước 2: Xóa ca đấu do user này tổ chức
    --         FK CASCADE (dat_slot.id_ca_dau → ca_dau.id ON DELETE CASCADE)
    --         sẽ tự động xóa dat_slot trong các ca này
    DELETE FROM ca_dau WHERE sdt_nguoi_tao = p_sdt;

    -- Bước 3: Xóa session token (văng ngay khi có action tiếp theo)
    BEGIN
        DELETE FROM guest_sessions WHERE sdt_khach = p_sdt;
    EXCEPTION WHEN undefined_table THEN
        NULL; -- Bảng chưa tồn tại (security SQL chưa chạy) — bỏ qua
    END;

    -- Bước 4: Xóa tài khoản chính
    DELETE FROM nguoi_dung WHERE sdt_khach = p_sdt;

    RETURN jsonb_build_object('status', 'ok');
END;
$$;

-- Cho phép authenticated (admin JWT) gọi RPC này
GRANT EXECUTE ON FUNCTION admin_cascade_xoa_user TO authenticated;


-- ── PHẦN 2: Thêm quyền DELETE cho Admin trên dat_slot ──
-- (Dùng khi REST fallback — nếu có admin_delete_dat_slot thì REST cũng xóa được)

DROP POLICY IF EXISTS "admin_delete_dat_slot" ON dat_slot;
CREATE POLICY "admin_delete_dat_slot"
    ON dat_slot FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM nguoi_dung
            WHERE auth_uid  = auth.uid()
              AND vai_tro   = 'admin'
              AND is_active = true
        )
    );


-- ── PHẦN 3: Quyền Admin trên guest_sessions (nếu bảng đã tồn tại) ──

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
                USING (
                    EXISTS (
                        SELECT 1 FROM nguoi_dung
                        WHERE auth_uid  = auth.uid()
                          AND vai_tro   = ''admin''
                          AND is_active = true
                    )
                )
        ';
    END IF;
END $$;
