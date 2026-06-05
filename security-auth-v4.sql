-- =====================================================================
-- SECURITY AUTH v4.3 — TUYENVANGLAI.IO.VN
-- Cập nhật: Fix circular RLS, phone enumeration, password spray,
--           DB congestion, thêm fields đăng ký
--
-- Thông tin admin đã điền sẵn:
--   Email: mynameisanhquocpro@gmail.com
--   UUID:  236254f1-ee49-41d2-9901-957e1b7eeac8
--   SĐT:   0961446003
-- =====================================================================


-- ============================================================
-- PHẦN 1: CẤU TRÚC BẢNG
-- ============================================================

ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS auth_uid UUID UNIQUE;

-- Nâng tài khoản admin (đã điền sẵn)
UPDATE nguoi_dung
SET vai_tro  = 'admin',
    auth_uid = '236254f1-ee49-41d2-9901-957e1b7eeac8'
WHERE sdt_khach = '0961446003';

ALTER TABLE nguoi_dung DROP CONSTRAINT IF EXISTS chk_vai_tro;
ALTER TABLE nguoi_dung ADD CONSTRAINT chk_vai_tro
    CHECK (vai_tro IN ('guest', 'host', 'admin'));

CREATE TABLE IF NOT EXISTS guest_sessions (
    token      TEXT      PRIMARY KEY,
    sdt_khach  TEXT      NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_attempts (
    sdt_khach  TEXT      NOT NULL,
    attempt_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_sdt  ON login_attempts (sdt_khach, attempt_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts (attempt_at);


-- ============================================================
-- PHẦN 2: is_admin() — helper function tránh circular RLS
-- SECURITY DEFINER = chạy với quyền system, bypass RLS nội bộ
-- Tránh vòng lặp: policy trên nguoi_dung → subquery nguoi_dung
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nguoi_dung
    WHERE auth_uid  = auth.uid()
      AND vai_tro   = 'admin'
      AND is_active = true
  );
$$;


-- ============================================================
-- PHẦN 3: RPC — GUEST LOGIN
-- Fix so với v4.2:
--   - Rate limit áp dụng cho CẢ not_found (chặn phone enumeration)
--   - Global rate limit: > 30 attempt toàn hệ thống / phút → chặn spray
--   - Cleanup xác suất 2% (tránh congestion khi bị tấn công)
-- ============================================================
CREATE OR REPLACE FUNCTION phan_he_guest_login(p_sdt TEXT, p_pass_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user     nguoi_dung;
    v_token    TEXT;
    v_expires  TIMESTAMP;
BEGIN
    -- [SPRAY FIX] Global rate limit: nếu toàn hệ thống có > 30 attempt/phút → đang bị tấn công
    IF (SELECT COUNT(*) FROM login_attempts
        WHERE attempt_at > now() - INTERVAL '1 minute') > 30 THEN
        RETURN jsonb_build_object('status', 'rate_limited');
    END IF;

    -- [PER-PHONE] Rate limit: 5 lần thử / 15 phút (kể cả not_found để chặn enumeration)
    IF (SELECT COUNT(*) FROM login_attempts
        WHERE sdt_khach  = p_sdt
          AND attempt_at > now() - INTERVAL '15 minutes') >= 5 THEN
        RETURN jsonb_build_object('status', 'rate_limited');
    END IF;

    SELECT * INTO v_user FROM nguoi_dung WHERE sdt_khach = p_sdt;

    IF NOT FOUND THEN
        -- [ENUMERATION FIX] Ghi attempt kể cả khi phone không tồn tại
        INSERT INTO login_attempts (sdt_khach) VALUES (p_sdt);
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_user.is_active = false THEN
        RETURN jsonb_build_object('status', 'blocked');
    END IF;
    IF v_user.mat_khau_hash IS NULL THEN
        RETURN jsonb_build_object('status', 'no_pass');
    END IF;
    IF v_user.mat_khau_hash != p_pass_hash THEN
        INSERT INTO login_attempts (sdt_khach) VALUES (p_sdt);
        -- [CONGESTION FIX] Cleanup xác suất 2% thay vì mỗi lần → giảm lock table
        IF random() < 0.02 THEN
            DELETE FROM login_attempts WHERE attempt_at < now() - INTERVAL '1 hour';
        END IF;
        RETURN jsonb_build_object('status', 'wrong_pass');
    END IF;

    -- Đăng nhập thành công → xóa attempt của phone này
    DELETE FROM login_attempts WHERE sdt_khach = p_sdt;

    v_token   := gen_random_uuid()::TEXT;
    v_expires := now() + INTERVAL '7 days';
    DELETE FROM guest_sessions WHERE sdt_khach = p_sdt;
    INSERT INTO guest_sessions (token, sdt_khach, expires_at) VALUES (v_token, p_sdt, v_expires);

    RETURN jsonb_build_object(
        'status', 'ok', 'token', v_token,
        'user', jsonb_build_object(
            'sdt_khach',     v_user.sdt_khach,
            'ten_khach',     v_user.ten_khach,
            'gioi_tinh',     v_user.gioi_tinh,
            'vai_tro',       v_user.vai_tro,
            'ngay_tham_gia', v_user.ngay_tham_gia,
            'sdt_zalo',      v_user.sdt_zalo,
            'facebook_link', v_user.facebook_link,
            'bio',           v_user.bio,
            'avatar_url',    v_user.avatar_url
        )
    );
END;
$$;
GRANT EXECUTE ON FUNCTION phan_he_guest_login TO anon;


-- ============================================================
-- PHẦN 4: RPC — ĐĂNG KÝ / ĐẶT MẬT KHẨU LẦN ĐẦU
-- Fix so với v4.2:
--   - Thêm p_ma_gioi_thieu, p_device_fp
--   - Ghi diem_uy_tin=100, free_pass khi tạo mới
-- ============================================================
CREATE OR REPLACE FUNCTION phan_he_dat_pass_lan_dau(
    p_sdt           TEXT,
    p_ten           TEXT,
    p_gioi_tinh     TEXT,
    p_pass_hash     TEXT,
    p_sdt_zalo      TEXT DEFAULT NULL,
    p_facebook      TEXT DEFAULT NULL,
    p_ma_gioi_thieu TEXT DEFAULT NULL,
    p_device_fp     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user  nguoi_dung;
    v_token TEXT;
BEGIN
    -- Validation độ dài (chặn data flooding)
    IF length(p_sdt) > 15 OR length(p_ten) > 100 THEN
        RETURN jsonb_build_object('status', 'invalid_input');
    END IF;
    IF p_facebook IS NOT NULL AND length(p_facebook) > 255 THEN
        RETURN jsonb_build_object('status', 'invalid_input');
    END IF;

    SELECT * INTO v_user FROM nguoi_dung WHERE sdt_khach = p_sdt;

    IF NOT FOUND THEN
        INSERT INTO nguoi_dung (
            sdt_khach, ten_khach, gioi_tinh, mat_khau_hash, vai_tro, is_active,
            sdt_zalo, facebook_link, ma_gioi_thieu, device_fingerprint,
            diem_uy_tin, free_pass_thang, free_pass_reset_thang
        ) VALUES (
            p_sdt, p_ten, p_gioi_tinh, p_pass_hash, 'guest', true,
            p_sdt_zalo, p_facebook, p_ma_gioi_thieu, p_device_fp,
            100, 1, EXTRACT(MONTH FROM now())::int
        );
    ELSIF v_user.mat_khau_hash IS NULL THEN
        UPDATE nguoi_dung
        SET ten_khach = p_ten, mat_khau_hash = p_pass_hash
        WHERE sdt_khach = p_sdt;
    ELSE
        RETURN jsonb_build_object('status', 'already_has_pass');
    END IF;

    v_token := gen_random_uuid()::TEXT;
    DELETE FROM guest_sessions WHERE sdt_khach = p_sdt;
    INSERT INTO guest_sessions (token, sdt_khach, expires_at)
    VALUES (v_token, p_sdt, now() + INTERVAL '7 days');

    RETURN jsonb_build_object('status', 'ok', 'token', v_token);
END;
$$;
GRANT EXECUTE ON FUNCTION phan_he_dat_pass_lan_dau TO anon;


-- ============================================================
-- PHẦN 5: RPC — VERIFY TOKEN
-- JOIN nguoi_dung check is_active → block user tức thì
-- ============================================================
CREATE OR REPLACE FUNCTION verify_guest_token(p_token TEXT, p_sdt TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM guest_sessions s
        JOIN nguoi_dung u ON s.sdt_khach = u.sdt_khach
        WHERE s.token     = p_token
          AND s.sdt_khach = p_sdt
          AND s.expires_at > now()
          AND u.is_active  = true
    );
END;
$$;
GRANT EXECUTE ON FUNCTION verify_guest_token TO anon;


-- ============================================================
-- PHẦN 6: RPC — ĐẶT SLOT
-- Fetch ten_khach từ DB (không tin client), mã 8 ký tự + loop
-- ============================================================
CREATE OR REPLACE FUNCTION guest_dat_slot(p_token TEXT, p_sdt TEXT, p_id_ca UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ma_slot  TEXT;
    v_ten_that TEXT;
    v_attempt  INT := 0;
BEGIN
    IF NOT verify_guest_token(p_token, p_sdt) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ca_dau WHERE id = p_id_ca AND da_chot_ca = false) THEN
        RETURN jsonb_build_object('status', 'ca_da_chot');
    END IF;
    IF EXISTS (SELECT 1 FROM dat_slot
               WHERE id_ca_dau = p_id_ca AND sdt_khach = p_sdt
               AND trang_thai_di_danh != 'Khách hủy') THEN
        RETURN jsonb_build_object('status', 'da_dat_roi');
    END IF;
    SELECT ten_khach INTO v_ten_that FROM nguoi_dung WHERE sdt_khach = p_sdt;
    LOOP
        v_ma_slot := 'SLOT-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 8));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM dat_slot WHERE ma_slot = v_ma_slot);
        v_attempt := v_attempt + 1;
        IF v_attempt > 10 THEN RAISE EXCEPTION 'Không thể tạo mã slot duy nhất'; END IF;
    END LOOP;
    INSERT INTO dat_slot (id_ca_dau, ten_khach, sdt_khach, ma_slot, trang_thai_di_danh)
    VALUES (p_id_ca, v_ten_that, p_sdt, v_ma_slot, 'Chờ đánh');
    RETURN jsonb_build_object('status', 'ok', 'ma_slot', v_ma_slot);
END;
$$;
GRANT EXECUTE ON FUNCTION guest_dat_slot TO anon;


-- ============================================================
-- PHẦN 7: RPC — HỦY SLOT + PROFILE REFRESH
-- ============================================================
CREATE OR REPLACE FUNCTION guest_huy_slot(p_token TEXT, p_sdt TEXT, p_dat_slot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT verify_guest_token(p_token, p_sdt) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    UPDATE dat_slot SET trang_thai_di_danh = 'Khách hủy'
    WHERE id = p_dat_slot_id AND sdt_khach = p_sdt
    AND id_ca_dau IN (SELECT id FROM ca_dau WHERE da_chot_ca = false);
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'khong_the_huy'); END IF;
    RETURN jsonb_build_object('status', 'ok');
END;
$$;
GRANT EXECUTE ON FUNCTION guest_huy_slot TO anon;

CREATE OR REPLACE FUNCTION get_current_guest_profile(p_token TEXT, p_sdt TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user nguoi_dung;
BEGIN
    IF NOT verify_guest_token(p_token, p_sdt) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    SELECT * INTO v_user FROM nguoi_dung WHERE sdt_khach = p_sdt;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
    IF v_user.is_active = false THEN RETURN jsonb_build_object('status', 'blocked'); END IF;
    RETURN jsonb_build_object('status', 'ok', 'user', jsonb_build_object(
        'sdt_khach',    v_user.sdt_khach,
        'ten_khach',    v_user.ten_khach,
        'gioi_tinh',    v_user.gioi_tinh,
        'vai_tro',      v_user.vai_tro,
        'is_active',    v_user.is_active,
        'sdt_zalo',     v_user.sdt_zalo,
        'bio',          v_user.bio,
        'avatar_url',   v_user.avatar_url
    ));
END;
$$;
GRANT EXECUTE ON FUNCTION get_current_guest_profile TO anon;


-- ============================================================
-- PHẦN 8: RLS POLICIES
-- Dùng is_admin() SECURITY DEFINER thay vì subquery trực tiếp
-- → Tránh circular dependency hoàn toàn
-- ============================================================

ALTER TABLE nguoi_dung        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dat_slot          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_dau            ENABLE ROW LEVEL SECURITY;
ALTER TABLE danh_gia_tin_dung ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions    ENABLE ROW LEVEL SECURITY;

-- Xóa policies cũ (có thể có circular)
DROP POLICY IF EXISTS "anon_read_by_sdt"            ON nguoi_dung;
DROP POLICY IF EXISTS "admin_read_all"               ON nguoi_dung;
DROP POLICY IF EXISTS "admin_update_all"             ON nguoi_dung;
DROP POLICY IF EXISTS "admin_delete_users"           ON nguoi_dung;
DROP POLICY IF EXISTS "anon_read_ca_dau"             ON ca_dau;
DROP POLICY IF EXISTS "anon_read_ca_dau_chua_chot"   ON ca_dau;
DROP POLICY IF EXISTS "admin_all_ca_dau"             ON ca_dau;
DROP POLICY IF EXISTS "admin_read_dat_slot"          ON dat_slot;
DROP POLICY IF EXISTS "anon_read_danh_gia"           ON danh_gia_tin_dung;
DROP POLICY IF EXISTS "admin_all_danh_gia"           ON danh_gia_tin_dung;

-- nguoi_dung: chỉ Admin JWT (dùng is_admin() — không circular)
CREATE POLICY "admin_read_all"     ON nguoi_dung FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admin_update_all"   ON nguoi_dung FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "admin_delete_users" ON nguoi_dung FOR DELETE TO authenticated USING (is_admin());

-- ca_dau: anon đọc (khách xem kèo công khai), Admin quản lý
CREATE POLICY "anon_read_ca_dau"   ON ca_dau FOR SELECT TO anon          USING (true);
CREATE POLICY "admin_all_ca_dau"   ON ca_dau FOR ALL    TO authenticated USING (is_admin());

-- dat_slot: Admin đọc tất cả
CREATE POLICY "admin_read_dat_slot" ON dat_slot FOR SELECT TO authenticated USING (is_admin());

-- danh_gia_tin_dung: anon đọc, Admin quản lý
CREATE POLICY "anon_read_danh_gia"  ON danh_gia_tin_dung FOR SELECT TO anon          USING (true);
CREATE POLICY "admin_all_danh_gia"  ON danh_gia_tin_dung FOR ALL    TO authenticated USING (is_admin());


-- ============================================================
-- VERIFY — chạy sau khi xong tất cả phần trên
-- ============================================================
-- SELECT sdt_khach, ten_khach, vai_tro, auth_uid, is_active
-- FROM nguoi_dung WHERE sdt_khach = '0961446003';
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('phan_he_guest_login','phan_he_dat_pass_lan_dau',
--       'verify_guest_token','guest_dat_slot','guest_huy_slot',
--       'get_current_guest_profile','is_admin');
