-- ============================================================
-- SUPABASE SCHEMA — TUYENVANGLAI.IO.VN
-- Phiên bản: 2.0 | Cập nhật: 2026-06-01
-- Chạy toàn bộ file này trên Supabase SQL Editor
-- (Database → SQL Editor → New query → Paste → Run)
-- ============================================================

-- ============================================================
-- BƯỚC 1: XÓA CÁC BẢNG CŨ NẾU TỒN TẠI (để chạy lại an toàn)
-- ============================================================
DROP TABLE IF EXISTS danh_gia_tin_dung  CASCADE;
DROP TABLE IF EXISTS dat_slot           CASCADE;
DROP TABLE IF EXISTS ca_dau             CASCADE;
DROP TABLE IF EXISTS nguoi_dung         CASCADE;
DROP TABLE IF EXISTS khach_vang_lai     CASCADE;
DROP TABLE IF EXISTS quan_ly_key        CASCADE;
DROP TABLE IF EXISTS cau_hinh_he_thong  CASCADE;

-- ============================================================
-- BẢNG 1: quan_ly_key — Hệ thống Key Host
-- ============================================================
CREATE TABLE quan_ly_key (
    ma_key          TEXT        PRIMARY KEY,
    ten_host        TEXT,
    sdt_host        TEXT,
    so_ngay_duoc_xai INTEGER    DEFAULT 30,
    trang_thai      TEXT        DEFAULT 'Chưa kích hoạt',
    id_thiet_bi     TEXT,
    ngay_kich_hoat  TIMESTAMPTZ,
    ngay_het_han    TIMESTAMPTZ,
    ghi_chu         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- BẢNG 2: ca_dau — Thông tin Kèo & Kế toán
-- ============================================================
CREATE TABLE ca_dau (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_key_host             TEXT        REFERENCES quan_ly_key(ma_key) ON DELETE SET NULL,
    sdt_nguoi_tao           TEXT,
    vung_mien               TEXT,
    tinh_thanh              TEXT,
    quan_huyen              TEXT,
    ten_san                 TEXT,
    so_san_cu_the           TEXT,
    dia_chi_san             TEXT,
    link_maps               TEXT,
    so_san_mo               INTEGER     DEFAULT 1,
    ngay_danh               DATE,
    gio_bat_dau             TIME,
    gio_ket_thuc            TIME,
    so_gio_choi             NUMERIC(4,2),
    gioi_tinh_can           TEXT        DEFAULT 'Cả hai',
    yeu_cau_trinh_do        JSONB       DEFAULT '{"nam":[],"nu":[]}',
    gia_nam                 INTEGER     DEFAULT 0,
    gia_nu                  INTEGER     DEFAULT 0,
    tien_ich_bao_gom        JSONB       DEFAULT '{"san":false,"cau":false,"nuoc":false,"gui_xe":false}',
    gia_thue_san_1h         INTEGER     DEFAULT 0,
    chi_phi_san_co_dinh     INTEGER     DEFAULT 0,
    loai_cau_su_dung        JSONB       DEFAULT '[]',
    tong_chi_phi_cau        INTEGER     DEFAULT 0,
    chi_phi_nuoc_khac       INTEGER     DEFAULT 0,
    so_nguoi_nam            INTEGER     DEFAULT 0,
    so_nguoi_nu             INTEGER     DEFAULT 0,
    chenh_lech_gia          INTEGER     DEFAULT 0,
    tong_doanh_thu_du_kien  INTEGER     DEFAULT 0,
    da_chot_ca              BOOLEAN     DEFAULT false,
    created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ca_dau_sdt_nguoi_tao ON ca_dau(sdt_nguoi_tao);

-- ============================================================
-- BẢNG 3: nguoi_dung — Tài khoản người dùng (bảng chính)
-- Thay thế hoàn toàn khach_vang_lai
-- ============================================================
CREATE TABLE nguoi_dung (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ten_khach            TEXT        NOT NULL,
    sdt_khach            TEXT        UNIQUE NOT NULL,
    mat_khau_hash        TEXT,
    gioi_tinh            TEXT        DEFAULT 'male',
    vai_tro              TEXT        DEFAULT 'guest',
    sdt_zalo             TEXT,
    facebook_link        TEXT,
    gmail                TEXT,
    bio                  TEXT,
    avatar_url           TEXT,
    trinh_do             TEXT,
    ma_gioi_thieu        TEXT,
    telegram_id          TEXT,
    is_active            BOOLEAN     DEFAULT TRUE,
    trang_thai_tai_khoan BOOLEAN     DEFAULT TRUE,
    ngay_tham_gia        TIMESTAMPTZ DEFAULT now(),
    created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nguoi_dung_sdt ON nguoi_dung(sdt_khach);

-- ============================================================
-- BẢNG 4: dat_slot — Danh sách Đăng ký tham gia ca đấu
-- ============================================================
CREATE TABLE dat_slot (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    id_ca_dau           UUID        REFERENCES ca_dau(id) ON DELETE CASCADE,
    ten_khach           TEXT        NOT NULL,
    sdt_khach           TEXT        NOT NULL,
    ma_slot             TEXT        UNIQUE,
    gioi_tinh           TEXT        DEFAULT 'male',
    trang_thai_di_danh  TEXT        DEFAULT 'Chờ đánh',
    thoi_gian_dat       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dat_slot_sdt      ON dat_slot(sdt_khach);
CREATE INDEX idx_dat_slot_ca_dau   ON dat_slot(id_ca_dau);
CREATE INDEX idx_dat_slot_trang_thai ON dat_slot(trang_thai_di_danh);

-- ============================================================
-- BẢNG 5: danh_gia_tin_dung — Hệ thống Review (khóa cứng sau INSERT)
-- ============================================================
CREATE TABLE danh_gia_tin_dung (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    id_ca_dau               UUID        REFERENCES ca_dau(id) ON DELETE SET NULL,
    sdt_nguoi_viet          TEXT        NOT NULL,
    sdt_nguoi_bi_danh_gia   TEXT        NOT NULL,
    loai_danh_gia           TEXT        NOT NULL,
    so_sao                  INTEGER     NOT NULL CHECK (so_sao BETWEEN 1 AND 5),
    nhan_xet                TEXT,
    created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dg_nguoi_viet  ON danh_gia_tin_dung(sdt_nguoi_viet);
CREATE INDEX idx_dg_nguoi_bi_dg ON danh_gia_tin_dung(sdt_nguoi_bi_danh_gia);
CREATE INDEX idx_dg_loai        ON danh_gia_tin_dung(loai_danh_gia);

-- ============================================================
-- BẢNG 6: cau_hinh_he_thong — Tham số Vận hành
-- ============================================================
CREATE TABLE cau_hinh_he_thong (
    id                  TEXT        PRIMARY KEY,
    noi_dung_thong_bao  TEXT
);

-- ============================================================
-- DỮ LIỆU MẶC ĐỊNH (Seed data)
-- ============================================================
INSERT INTO cau_hinh_he_thong (id, noi_dung_thong_bao) VALUES
    ('popup_chinh',     'Chào mừng đến TUYENVANGLAI.IO.VN! 🏸 Nền tảng tuyển vãng lai cầu lông toàn quốc. Tìm kèo, đặt slot, ra sân ngay hôm nay!'),
    ('host_access_key', ''),
    ('so_keo_hien_thi', '0'),
    ('so_thanh_vien',   '0');

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE quan_ly_key         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_dau              ENABLE ROW LEVEL SECURITY;
ALTER TABLE nguoi_dung          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dat_slot            ENABLE ROW LEVEL SECURITY;
ALTER TABLE danh_gia_tin_dung   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cau_hinh_he_thong   ENABLE ROW LEVEL SECURITY;

-- quan_ly_key
CREATE POLICY "anon_doc_key"       ON quan_ly_key FOR SELECT TO anon USING (true);
CREATE POLICY "anon_cap_nhat_key"  ON quan_ly_key FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ca_dau
CREATE POLICY "anon_doc_ca_dau"   ON ca_dau FOR SELECT TO anon USING (true);
CREATE POLICY "anon_them_ca_dau"  ON ca_dau FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_sua_ca_dau"   ON ca_dau FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- nguoi_dung (bảng chính, thay thế khach_vang_lai)
CREATE POLICY "anon_doc_nguoi_dung"   ON nguoi_dung FOR SELECT TO anon USING (true);
CREATE POLICY "anon_them_nguoi_dung"  ON nguoi_dung FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_sua_nguoi_dung"   ON nguoi_dung FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_xoa_nguoi_dung"   ON nguoi_dung FOR DELETE TO anon USING (true);

-- dat_slot
CREATE POLICY "anon_dat_slot"   ON dat_slot FOR SELECT TO anon USING (true);
CREATE POLICY "anon_them_slot"  ON dat_slot FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_sua_slot"   ON dat_slot FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- danh_gia_tin_dung (không có UPDATE — khóa cứng)
CREATE POLICY "anon_doc_danh_gia"  ON danh_gia_tin_dung FOR SELECT TO anon USING (true);
CREATE POLICY "anon_them_danh_gia" ON danh_gia_tin_dung FOR INSERT TO anon WITH CHECK (true);

-- cau_hinh_he_thong
CREATE POLICY "anon_doc_config" ON cau_hinh_he_thong FOR SELECT TO anon USING (true);
CREATE POLICY "anon_sua_config" ON cau_hinh_he_thong FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- KIỂM TRA sau khi chạy
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
-- SELECT * FROM cau_hinh_he_thong;
