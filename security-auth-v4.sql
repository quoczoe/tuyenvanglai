-- =====================================================================
-- SECURITY AUTH v4.2 — TUYENVANGLAI.IO.VN
-- Chạy toàn bộ file này trên Supabase Dashboard → SQL Editor
--
-- TRƯỚC KHI CHẠY:
--   1. Project Settings → Auth → "Allow new users to sign up" → TẮT OFF
--   2. Authentication → Users → "Add user manually"
--      Email: mynameisanhquocpro@gmail.com | UUID: 236254f1-ee49-41d2-9901-957e1b7eeac8
--      SĐT admin: 0961446003 — ĐÃ ĐIỀN SẴN BÊN DƯỚI
-- =====================================================================


-- ============================================================
-- PHẦN 1: CẤU TRÚC BẢNG MỚI
-- ============================================================

-- 1a. Thêm cột liên kết Admin với Supabase Auth
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS auth_uid UUID UNIQUE;

-- 1b. Nâng tài khoản thành admin
UPDATE nguoi_dung
SET vai_tro  = 'admin',
    auth_uid = '236254f1-ee49-41d2-9901-957e1b7eeac8'
WHERE sdt_khach = '0961446003';

-- 1c. Constraint vai_tro hợp lệ
ALTER TABLE nguoi_dung DROP CONSTRAINT IF EXISTS chk_vai_tro;
ALTER TABLE nguoi_dung ADD CONSTRAINT chk_vai_tro
    CHECK (vai_tro IN ('guest', 'host', 'admin'));

-- 1d. Bảng Session Token cho Guest/Host (thay thế localStorage self-service)
CREATE TABLE IF NOT EXISTS guest_sessions (
    token      TEXT      PRIMARY KEY,
    sdt_khach  TEXT      NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 1e. Bảng Rate Limiting đăng nhập
CREATE TABLE IF NOT EXISTS login_attempts (
    sdt_khach  TEXT      NOT NULL,
    attempt_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts (sdt_khach, attempt_at);


-- ============================================================
-- PHẦN 2: RPC — GUEST LOGIN
-- Trả về token ngẫu nhiên, KHÔNG trả mat_khau_hash
-- Rate limit: 5 lần sai / 15 phút
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
    -- Rate limit: 5 lần sai trong 15 phút
    IF (SELECT COUNT(*) FROM login_attempts
        WHERE sdt_khach = p_sdt
          AND attempt_at > now() - INTERVAL '15 minutes') >= 5 THEN
        RETURN jsonb_build_object('status', 'rate_limited');
    END IF;

    SELECT * INTO v_user FROM nguoi_dung WHERE sdt_khach = p_sdt;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_user.is_active = false THEN
        RETURN jsonb_build_object('status', 'blocked');
    END IF;
    IF v_user.mat_khau_hash IS NULL THEN
        RETURN jsonb_build_object('status', 'no_pass');
    END IF;
    IF v_user.mat_khau_hash != p_pass_hash THEN
        -- Ghi lại attempt thất bại
        INSERT INTO login_attempts (sdt_khach) VALUES (p_sdt);
        -- Dọn attempt cũ hơn 1 giờ
        DELETE FROM login_attempts WHERE attempt_at < now() - INTERVAL '1 hour';
        RETURN jsonb_build_object('status', 'wrong_pass');
    END IF;

    -- Đăng nhập thành công → xóa lịch sử attempt
    DELETE FROM login_attempts WHERE sdt_khach = p_sdt;

    -- Tạo session token UUID không thể đoán
    v_token   := gen_random_uuid()::TEXT;
    v_expires := now() + INTERVAL '7 days';

    -- Xóa session cũ, tạo session mới
    DELETE FROM guest_sessions WHERE sdt_khach = p_sdt;
    INSERT INTO guest_sessions (token, sdt_khach, expires_at)
    VALUES (v_token, p_sdt, v_expires);

    -- Trả về token + dữ liệu user (KHÔNG có mat_khau_hash)
    RETURN jsonb_build_object(
        'status', 'ok',
        'token', v_token,
        'user', jsonb_build_object(
            'sdt_khach',    v_user.sdt_khach,
            'ten_khach',    v_user.ten_khach,
            'gioi_tinh',    v_user.gioi_tinh,
            'vai_tro',      v_user.vai_tro,
            'ma_key_host',  v_user.ma_key_host,
            'ngay_tham_gia',v_user.ngay_tham_gia,
            'sdt_zalo',     v_user.sdt_zalo,
            'facebook_link',v_user.facebook_link,
            'bio',          v_user.bio,
            'avatar_url',   v_user.avatar_url
        )
    );
END;
$$;
GRANT EXECUTE ON FUNCTION phan_he_guest_login TO anon;


-- ============================================================
-- PHẦN 3: RPC — ĐĂNG KÝ / ĐẶT MẬT KHẨU LẦN ĐẦU
-- Validation độ dài input tại đây
-- ============================================================
CREATE OR REPLACE FUNCTION phan_he_dat_pass_lan_dau(
    p_sdt      TEXT,
    p_ten      TEXT,
    p_gioi_tinh TEXT,
    p_pass_hash TEXT,
    p_sdt_zalo TEXT DEFAULT NULL,
    p_facebook TEXT DEFAULT NULL
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
    -- Validation độ dài input (chống Data Flooding)
    IF length(p_sdt) > 15 OR length(p_ten) > 100 THEN
        RETURN jsonb_build_object('status', 'invalid_input');
    END IF;
    IF p_facebook IS NOT NULL AND length(p_facebook) > 255 THEN
        RETURN jsonb_build_object('status', 'invalid_input');
    END IF;
    IF p_sdt_zalo IS NOT NULL AND length(p_sdt_zalo) > 20 THEN
        RETURN jsonb_build_object('status', 'invalid_input');
    END IF;

    SELECT * INTO v_user FROM nguoi_dung WHERE sdt_khach = p_sdt;

    IF NOT FOUND THEN
        -- Tạo user mới
        INSERT INTO nguoi_dung
            (sdt_khach, ten_khach, gioi_tinh, mat_khau_hash, vai_tro, is_active, sdt_zalo, facebook_link)
        VALUES
            (p_sdt, p_ten, p_gioi_tinh, p_pass_hash, 'guest', true, p_sdt_zalo, p_facebook);
    ELSIF v_user.mat_khau_hash IS NULL THEN
        -- Cập nhật user cũ chưa đặt mật khẩu
        UPDATE nguoi_dung
        SET ten_khach = p_ten, mat_khau_hash = p_pass_hash
        WHERE sdt_khach = p_sdt;
    ELSE
        RETURN jsonb_build_object('status', 'already_has_pass');
    END IF;

    -- Login ngay sau đăng ký
    v_token := gen_random_uuid()::TEXT;
    DELETE FROM guest_sessions WHERE sdt_khach = p_sdt;
    INSERT INTO guest_sessions (token, sdt_khach, expires_at)
    VALUES (v_token, p_sdt, now() + INTERVAL '7 days');

    RETURN jsonb_build_object('status', 'ok', 'token', v_token);
END;
$$;
GRANT EXECUTE ON FUNCTION phan_he_dat_pass_lan_dau TO anon;


-- ============================================================
-- PHẦN 4: RPC — VERIFY TOKEN (dùng cho tất cả mutations)
-- JOIN nguoi_dung để check is_active realtime
-- → Admin block user → token bị vô hiệu ngay lập tức
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
        WHERE s.token    = p_token
          AND s.sdt_khach = p_sdt
          AND s.expires_at > now()
          AND u.is_active  = true   -- Block user → token vô hiệu ngay
    );
END;
$$;
GRANT EXECUTE ON FUNCTION verify_guest_token TO anon;


-- ============================================================
-- PHẦN 5: RPC — ĐẶT SLOT
-- Lấy ten_khach từ DB (không tin client)
-- Mã slot 8 ký tự + collision loop
-- ============================================================
CREATE OR REPLACE FUNCTION guest_dat_slot(
    p_token TEXT,
    p_sdt   TEXT,
    p_id_ca UUID
)
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

    -- Ca đấu phải còn mở
    IF NOT EXISTS (SELECT 1 FROM ca_dau WHERE id = p_id_ca AND da_chot_ca = false) THEN
        RETURN jsonb_build_object('status', 'ca_da_chot');
    END IF;

    -- Chưa đặt slot (chưa hoặc đã hủy)
    IF EXISTS (
        SELECT 1 FROM dat_slot
        WHERE id_ca_dau = p_id_ca
          AND sdt_khach = p_sdt
          AND trang_thai_di_danh != 'Khách hủy'
    ) THEN
        RETURN jsonb_build_object('status', 'da_dat_roi');
    END IF;

    -- Lấy tên thật từ DB (không tin giá trị client truyền lên)
    SELECT ten_khach INTO v_ten_that FROM nguoi_dung WHERE sdt_khach = p_sdt;

    -- Tạo mã slot 8 ký tự + vòng lặp chống collision
    LOOP
        v_ma_slot := 'SLOT-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 8));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM dat_slot WHERE ma_slot = v_ma_slot);
        v_attempt := v_attempt + 1;
        IF v_attempt > 10 THEN
            RAISE EXCEPTION 'Không thể tạo mã slot duy nhất sau 10 lần thử';
        END IF;
    END LOOP;

    INSERT INTO dat_slot (id_ca_dau, ten_khach, sdt_khach, ma_slot, trang_thai_di_danh)
    VALUES (p_id_ca, v_ten_that, p_sdt, v_ma_slot, 'Chờ đánh');

    RETURN jsonb_build_object('status', 'ok', 'ma_slot', v_ma_slot);
END;
$$;
GRANT EXECUTE ON FUNCTION guest_dat_slot TO anon;


-- ============================================================
-- PHẦN 6: RPC — HỦY SLOT
-- ============================================================
CREATE OR REPLACE FUNCTION guest_huy_slot(
    p_token      TEXT,
    p_sdt        TEXT,
    p_dat_slot_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT verify_guest_token(p_token, p_sdt) THEN
        RETURN jsonb_build_object('status', 'unauthorized');
    END IF;

    UPDATE dat_slot
    SET trang_thai_di_danh = 'Khách hủy'
    WHERE id        = p_dat_slot_id
      AND sdt_khach = p_sdt
      AND id_ca_dau IN (SELECT id FROM ca_dau WHERE da_chot_ca = false);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'khong_the_huy');
    END IF;

    RETURN jsonb_build_object('status', 'ok');
END;
$$;
GRANT EXECUTE ON FUNCTION guest_huy_slot TO anon;


-- ============================================================
-- PHẦN 7: RPC — LẤY PROFILE HIỆN TẠI (refresh từ DB)
-- Dùng để sync trạng thái is_active sau mỗi lần mở app
-- ============================================================
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
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_user.is_active = false THEN
        RETURN jsonb_build_object('status', 'blocked');
    END IF;

    RETURN jsonb_build_object('status', 'ok', 'user', jsonb_build_object(
        'sdt_khach',    v_user.sdt_khach,
        'ten_khach',    v_user.ten_khach,
        'gioi_tinh',    v_user.gioi_tinh,
        'vai_tro',      v_user.vai_tro,
        'ma_key_host',  v_user.ma_key_host,
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
-- ============================================================

-- Bật RLS
ALTER TABLE nguoi_dung        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dat_slot          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_dau            ENABLE ROW LEVEL SECURITY;
ALTER TABLE danh_gia_tin_dung ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions    ENABLE ROW LEVEL SECURITY;

-- Xóa policies cũ trước khi tạo mới
DROP POLICY IF EXISTS "anon_read_by_sdt"         ON nguoi_dung;
DROP POLICY IF EXISTS "admin_read_all"            ON nguoi_dung;
DROP POLICY IF EXISTS "admin_update_all"          ON nguoi_dung;
DROP POLICY IF EXISTS "only_admin_update_vai_tro" ON nguoi_dung;
DROP POLICY IF EXISTS "anon_insert_new_user"      ON nguoi_dung;
DROP POLICY IF EXISTS "anon_read_ca_dau_chua_chot" ON ca_dau;

-- Policy: Admin (Supabase Auth JWT) đọc được tất cả nguoi_dung
CREATE POLICY "admin_read_all" ON nguoi_dung
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM nguoi_dung nd
        WHERE nd.auth_uid = auth.uid()
          AND nd.vai_tro  = 'admin'
          AND nd.is_active = true
    )
);

-- Policy: Chỉ Admin mới được UPDATE nguoi_dung (đổi vai trò, khóa tài khoản...)
CREATE POLICY "admin_update_all" ON nguoi_dung
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM nguoi_dung nd
        WHERE nd.auth_uid = auth.uid()
          AND nd.vai_tro  = 'admin'
          AND nd.is_active = true
    )
);

-- Policy: Admin DELETE nguoi_dung
CREATE POLICY "admin_delete_users" ON nguoi_dung
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM nguoi_dung nd
        WHERE nd.auth_uid = auth.uid()
          AND nd.vai_tro  = 'admin'
          AND nd.is_active = true
    )
);

-- Policy: ca_dau — anon đọc được (cần cho khách xem kèo công khai)
CREATE POLICY "anon_read_ca_dau" ON ca_dau
FOR SELECT TO anon
USING (true);

-- Policy: Admin quản lý ca_dau
CREATE POLICY "admin_all_ca_dau" ON ca_dau
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM nguoi_dung nd
        WHERE nd.auth_uid = auth.uid()
          AND nd.vai_tro  = 'admin'
    )
);

-- Policy: dat_slot — Admin đọc được tất cả
CREATE POLICY "admin_read_dat_slot" ON dat_slot
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM nguoi_dung nd
        WHERE nd.auth_uid = auth.uid()
          AND nd.vai_tro  = 'admin'
    )
);

-- Policy: danh_gia_tin_dung — anon đọc được (hiển thị public)
CREATE POLICY "anon_read_danh_gia" ON danh_gia_tin_dung
FOR SELECT TO anon
USING (true);

-- Policy: Admin quản lý danh_gia
CREATE POLICY "admin_all_danh_gia" ON danh_gia_tin_dung
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM nguoi_dung nd
        WHERE nd.auth_uid = auth.uid()
          AND nd.vai_tro  = 'admin'
    )
);

-- Policy: guest_sessions — anon KHÔNG đọc trực tiếp (chỉ qua RPC SECURITY DEFINER)
-- (Không tạo SELECT policy = mặc định bị chặn với anon)

-- Cấp quyền cho anon gọi RPC profile refresh
GRANT EXECUTE ON FUNCTION get_current_guest_profile TO anon;
