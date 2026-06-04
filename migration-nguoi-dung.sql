-- ============================================================
-- MIGRATION CUỐI CÙNG: Hợp nhất khach_vang_lai → nguoi_dung
-- Chỉ dùng 1 bảng duy nhất cho toàn bộ người dùng
-- An toàn để chạy nhiều lần
-- Chạy file này trong Supabase Dashboard → SQL Editor
-- ============================================================

-- BƯỚC 1: Tạo bảng nguoi_dung nếu chưa có
CREATE TABLE IF NOT EXISTS nguoi_dung (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ten_khach       TEXT        NOT NULL,
    sdt_khach       TEXT        UNIQUE NOT NULL,
    mat_khau_hash   TEXT,
    gioi_tinh       TEXT        DEFAULT 'male',
    vai_tro         TEXT        DEFAULT 'guest',
    sdt_zalo        TEXT,
    facebook_link   TEXT,
    gmail           TEXT,
    bio             TEXT,
    avatar_url      TEXT,
    trinh_do        TEXT,
    ma_gioi_thieu   TEXT,
    telegram_id     TEXT,
    is_active       BOOLEAN     DEFAULT TRUE,
    trang_thai_tai_khoan BOOLEAN DEFAULT TRUE,
    ngay_tham_gia   TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- BƯỚC 2: Đảm bảo tất cả cột tồn tại (an toàn nếu bảng đã có schema cũ)
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS mat_khau_hash         TEXT;
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS gioi_tinh             TEXT        DEFAULT 'male';
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS vai_tro               TEXT        DEFAULT 'guest';
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS sdt_zalo              TEXT;
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS facebook_link         TEXT;
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS gmail                 TEXT;
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS bio                   TEXT;
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS avatar_url            TEXT;
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS trinh_do              TEXT;
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS ma_gioi_thieu         TEXT;
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS telegram_id           TEXT;
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS is_active             BOOLEAN     DEFAULT TRUE;
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS trang_thai_tai_khoan  BOOLEAN     DEFAULT TRUE;
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS ngay_tham_gia         TIMESTAMPTZ DEFAULT now();
ALTER TABLE nguoi_dung ADD COLUMN IF NOT EXISTS created_at            TIMESTAMPTZ DEFAULT now();

-- BƯỚC 3: Bật RLS và tạo lại policy (an toàn nếu đã có)
ALTER TABLE nguoi_dung ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_doc_nguoi_dung"  ON nguoi_dung;
DROP POLICY IF EXISTS "anon_them_nguoi_dung" ON nguoi_dung;
DROP POLICY IF EXISTS "anon_sua_nguoi_dung"  ON nguoi_dung;
DROP POLICY IF EXISTS "anon_xoa_nguoi_dung"  ON nguoi_dung;

CREATE POLICY "anon_doc_nguoi_dung"
    ON nguoi_dung FOR SELECT TO anon USING (true);
CREATE POLICY "anon_them_nguoi_dung"
    ON nguoi_dung FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_sua_nguoi_dung"
    ON nguoi_dung FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_xoa_nguoi_dung"
    ON nguoi_dung FOR DELETE TO anon USING (true);

CREATE INDEX IF NOT EXISTS idx_nguoi_dung_sdt ON nguoi_dung(sdt_khach);

-- BƯỚC 4: Copy data từ khach_vang_lai (chỉ chạy nếu bảng đó tồn tại)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'khach_vang_lai'
    ) THEN
        INSERT INTO nguoi_dung (ten_khach, sdt_khach, ngay_tham_gia)
        SELECT ten_khach, sdt_khach, ngay_tham_gia
        FROM khach_vang_lai
        WHERE NOT EXISTS (
            SELECT 1 FROM nguoi_dung nd WHERE nd.sdt_khach = khach_vang_lai.sdt_khach
        );

        DROP TABLE IF EXISTS khach_vang_lai CASCADE;
    END IF;
END $$;

-- BƯỚC 6: Thêm cột sdt_nguoi_tao vào ca_dau
ALTER TABLE ca_dau ADD COLUMN IF NOT EXISTS sdt_nguoi_tao TEXT;
CREATE INDEX IF NOT EXISTS idx_ca_dau_sdt_nguoi_tao ON ca_dau(sdt_nguoi_tao);

-- BƯỚC 7: Thêm cột tong_slot_can vào ca_dau (số slot cần tuyển)
ALTER TABLE ca_dau ADD COLUMN IF NOT EXISTS tong_slot_can INTEGER DEFAULT 0;
