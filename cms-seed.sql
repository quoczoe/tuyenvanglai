-- ============================================================
-- CMS SEED v2 — An toàn khi chạy lại nhiều lần
-- Dùng DROP POLICY IF EXISTS trước khi tạo → không lỗi "already exists"
-- Chạy trên Supabase Dashboard > SQL Editor > Run
-- ============================================================


-- ============================================================
-- 1. INSERT các key config động (idempotent — ON CONFLICT DO NOTHING)
-- ============================================================

INSERT INTO cau_hinh_he_thong (id, noi_dung_thong_bao) VALUES
  ('qr_donate',         ''),
  ('tieu_de_donate',    'MỜI ADMIN LY CAFE CHỐT KÈO ☕'),
  ('text_donate',       '☕ Nếu thấy hữu ích, ủng hộ tác giả 1 ly cà phê nhé!'),
  ('text_quang_cao',    'Kết nối người chơi vãng lai và chủ sân cầu lông toàn quốc. Đặt slot, quản lý ca đấu, xây dựng uy tín tức thì.'),
  ('telegram_bot_token',''),
  ('telegram_chat_id',  ''),
  ('popup_enabled',     'true'),
  ('logo_url',          ''),
  ('favicon_url',       '')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 2. RLS cho bảng cau_hinh_he_thong
--    Admin dùng anon key → cần cấp quyền SELECT + INSERT + UPDATE
--    DROP trước để tránh lỗi "policy already exists"
-- ============================================================

ALTER TABLE cau_hinh_he_thong ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_anon_select" ON cau_hinh_he_thong;
CREATE POLICY "config_anon_select" ON cau_hinh_he_thong
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "config_anon_insert" ON cau_hinh_he_thong;
CREATE POLICY "config_anon_insert" ON cau_hinh_he_thong
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "config_anon_update" ON cau_hinh_he_thong;
CREATE POLICY "config_anon_update" ON cau_hinh_he_thong
  FOR UPDATE TO anon USING (true) WITH CHECK (true);


-- ============================================================
-- 3. Bảng lưu góp ý (tạo nếu chưa có)
-- ============================================================

CREATE TABLE IF NOT EXISTS gop_y_he_thong (
  id          bigserial PRIMARY KEY,
  ten_user    text,
  sdt_user    text,
  so_sao      int CHECK (so_sao BETWEEN 1 AND 5),
  loai_gop_y  text,
  noi_dung    text,
  created_at  timestamptz DEFAULT now()
);
-- Thêm cột sdt_user nếu bảng đã tồn tại từ trước (chạy lại an toàn)
ALTER TABLE gop_y_he_thong ADD COLUMN IF NOT EXISTS sdt_user text;

ALTER TABLE gop_y_he_thong ENABLE ROW LEVEL SECURITY;

-- Dùng DROP trước để an toàn khi chạy lại
DROP POLICY IF EXISTS "gop_y_anon_insert"       ON gop_y_he_thong;
DROP POLICY IF EXISTS "gop_y_anon_no_select"    ON gop_y_he_thong;
DROP POLICY IF EXISTS "gop_y_anon_select"       ON gop_y_he_thong;
DROP POLICY IF EXISTS "gop_y_anon_delete"       ON gop_y_he_thong;
DROP POLICY IF EXISTS "gop_y_auth_select"       ON gop_y_he_thong;
DROP POLICY IF EXISTS "gop_y_auth_delete"       ON gop_y_he_thong;

-- Khách (anon) chỉ được INSERT
CREATE POLICY "gop_y_anon_insert" ON gop_y_he_thong
  FOR INSERT TO anon WITH CHECK (true);

-- Khách (anon) có thể SELECT (cần cho metric header nếu dùng anon key)
CREATE POLICY "gop_y_anon_select" ON gop_y_he_thong
  FOR SELECT TO anon USING (true);

-- Admin (authenticated JWT) đọc toàn bộ góp ý
CREATE POLICY "gop_y_auth_select" ON gop_y_he_thong
  FOR SELECT TO authenticated USING (true);

-- Admin (authenticated JWT) xóa góp ý
CREATE POLICY "gop_y_auth_delete" ON gop_y_he_thong
  FOR DELETE TO authenticated USING (true);


-- ============================================================
-- 4. Kiểm tra sau khi chạy
-- ============================================================

-- SELECT id, noi_dung_thong_bao FROM cau_hinh_he_thong ORDER BY id;
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('cau_hinh_he_thong','gop_y_he_thong');
