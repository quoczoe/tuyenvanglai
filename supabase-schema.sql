-- ============================================================
-- SUPABASE SCHEMA — TUYENVANGLAI.IO.VN
-- Phiên bản: 1.0 | Ngày: 2026-05-24
-- Chạy toàn bộ file này trên Supabase SQL Editor
-- (Database → SQL Editor → New query → Paste → Run)
-- ============================================================

-- ============================================================
-- BƯỚC 1: XÓA CÁC BẢNG CŨ NẾU TỒN TẠI (để chạy lại an toàn)
-- ============================================================
DROP TABLE IF EXISTS danh_gia_tin_dung  CASCADE;
DROP TABLE IF EXISTS dat_slot           CASCADE;
DROP TABLE IF EXISTS ca_dau             CASCADE;
DROP TABLE IF EXISTS khach_vang_lai     CASCADE;
DROP TABLE IF EXISTS quan_ly_key        CASCADE;
DROP TABLE IF EXISTS cau_hinh_he_thong  CASCADE;

-- ============================================================
-- BẢNG 1: quan_ly_key — Hệ thống Key Host
-- ============================================================
CREATE TABLE quan_ly_key (
    ma_key          TEXT        PRIMARY KEY,            -- Định dạng TVL-XXXXX-XXXX
    ten_host        TEXT,                               -- Tên chủ sân
    sdt_host        TEXT,                               -- Số điện thoại chủ sân
    so_ngay_duoc_xai INTEGER    DEFAULT 30,             -- Số ngày sử dụng
    trang_thai      TEXT        DEFAULT 'Chưa kích hoạt', -- 'Chưa kích hoạt' | 'Đang chạy' | 'Bị khóa'
    id_thiet_bi     TEXT,                               -- Fingerprint thiết bị — NULL cho đến khi kích hoạt
    ngay_kich_hoat  TIMESTAMPTZ,                        -- Null cho đến khi Host nhập Key lần đầu
    ngay_het_han    TIMESTAMPTZ,                        -- ngay_kich_hoat + so_ngay_duoc_xai days
    ghi_chu         TEXT,                               -- Ghi chú thêm của Admin
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- BẢNG 2: ca_dau — Thông tin Kèo & Kế toán
-- ============================================================
CREATE TABLE ca_dau (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ma_key_host             TEXT        REFERENCES quan_ly_key(ma_key) ON DELETE SET NULL,
    -- Địa lý
    vung_mien               TEXT,                       -- 'Nam' | 'Trung' | 'Bắc'
    tinh_thanh              TEXT,                       -- Tên tỉnh/thành
    quan_huyen              TEXT,                       -- Tên quận/huyện
    -- Thông tin sân
    ten_san                 TEXT,                       -- Tên sân cầu lông
    so_san_cu_the           TEXT,                       -- Ví dụ: "sân 3", "1,2"
    dia_chi_san             TEXT,                       -- Địa chỉ đầy đủ
    link_maps               TEXT,                       -- Google Maps URL (nullable)
    so_san_mo               INTEGER     DEFAULT 1,      -- Số lượng sân mở (1-8)
    -- Thời gian
    ngay_danh               DATE,                       -- Ngày tổ chức ca đấu
    gio_bat_dau             TIME,                       -- Giờ bắt đầu
    gio_ket_thuc            TIME,                       -- Giờ kết thúc
    so_gio_choi             NUMERIC(4,2),               -- Tự tính: gio_ket_thuc - gio_bat_dau
    -- Yêu cầu người chơi
    gioi_tinh_can           TEXT        DEFAULT 'Cả hai', -- 'Nam' | 'Nữ' | 'Cả hai'
    yeu_cau_trinh_do        JSONB       DEFAULT '{"nam":[],"nu":[]}', -- {nam:[...], nu:[...]}
    -- Giá công khai
    gia_nam                 INTEGER     DEFAULT 0,      -- Giá thu Nam (VNĐ)
    gia_nu                  INTEGER     DEFAULT 0,      -- Giá thu Nữ (VNĐ)
    tien_ich_bao_gom        JSONB       DEFAULT '{"san":false,"cau":false,"nuoc":false,"gui_xe":false}',
    -- Kế toán nội bộ (ẩn với khách)
    gia_thue_san_1h         INTEGER     DEFAULT 0,      -- Giá thuê sân mỗi giờ
    chi_phi_san_co_dinh     INTEGER     DEFAULT 0,      -- Tổng tiền sân = gia_thue_san_1h × so_gio × so_san_mo
    loai_cau_su_dung        JSONB       DEFAULT '[]',   -- [{ten, don_vi, gia_qua, so_luong, thanh_tien}]
    tong_chi_phi_cau        INTEGER     DEFAULT 0,      -- Tổng tiền cầu
    chi_phi_nuoc_khac       INTEGER     DEFAULT 0,      -- Tiền nước + phát sinh khác
    so_nguoi_nam            INTEGER     DEFAULT 0,      -- Số người Nam dự kiến
    so_nguoi_nu             INTEGER     DEFAULT 0,      -- Số người Nữ dự kiến
    chenh_lech_gia          INTEGER     DEFAULT 0,      -- Nam cao hơn Nữ X đồng (âm = Nam thấp hơn)
    tong_doanh_thu_du_kien  INTEGER     DEFAULT 0,      -- Doanh thu dự kiến
    -- Trạng thái
    da_chot_ca              BOOLEAN     DEFAULT false,  -- FALSE → đang chạy | TRUE → đã khóa sổ
    created_at              TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- BẢNG 3: khach_vang_lai — Hồ sơ Khách
-- ============================================================
CREATE TABLE khach_vang_lai (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ten_khach       TEXT        NOT NULL,               -- Tên / biệt danh
    sdt_khach       TEXT        UNIQUE NOT NULL,        -- SĐT Zalo — dùng làm định danh
    ngay_tham_gia   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- BẢNG 4: dat_slot — Danh sách Đăng ký tham gia ca đấu
-- ============================================================
CREATE TABLE dat_slot (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    id_ca_dau           UUID        REFERENCES ca_dau(id) ON DELETE CASCADE,
    ten_khach           TEXT        NOT NULL,           -- Tên / biệt danh khách
    sdt_khach           TEXT        NOT NULL,           -- SĐT Zalo
    ma_slot             TEXT        UNIQUE,             -- Định dạng SLOT-XXXXX
    gioi_tinh           TEXT        DEFAULT 'male',     -- 'male' | 'female'
    trang_thai_di_danh  TEXT        DEFAULT 'Chờ đánh', -- 'Chờ đánh' | 'Đã tham gia' | 'Bùng kèo' | 'Khách hủy'
    thoi_gian_dat       TIMESTAMPTZ DEFAULT now()
);

-- Index tăng tốc truy vấn theo SĐT và ca đấu
CREATE INDEX idx_dat_slot_sdt     ON dat_slot(sdt_khach);
CREATE INDEX idx_dat_slot_ca_dau  ON dat_slot(id_ca_dau);
CREATE INDEX idx_dat_slot_trang_thai ON dat_slot(trang_thai_di_danh);

-- ============================================================
-- BẢNG 5: danh_gia_tin_dung — Hệ thống Review
-- QUAN TRỌNG: Không cho phép UPDATE sau khi INSERT (khóa cứng)
-- ============================================================
CREATE TABLE danh_gia_tin_dung (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    id_ca_dau               UUID        REFERENCES ca_dau(id) ON DELETE SET NULL,
    sdt_nguoi_viet          TEXT        NOT NULL,       -- SĐT người viết đánh giá
    sdt_nguoi_bi_danh_gia   TEXT        NOT NULL,       -- SĐT người bị đánh giá
    loai_danh_gia           TEXT        NOT NULL,       -- 'HostToGuest' | 'GuestToHost'
    so_sao                  INTEGER     NOT NULL CHECK (so_sao BETWEEN 1 AND 5),
    nhan_xet                TEXT,                       -- Nội dung nhận xét
    created_at              TIMESTAMPTZ DEFAULT now()   -- KHÔNG cho UPDATE sau khi tạo
);

-- Index tra cứu đánh giá theo SĐT
CREATE INDEX idx_dg_nguoi_viet      ON danh_gia_tin_dung(sdt_nguoi_viet);
CREATE INDEX idx_dg_nguoi_bi_dg     ON danh_gia_tin_dung(sdt_nguoi_bi_danh_gia);
CREATE INDEX idx_dg_loai            ON danh_gia_tin_dung(loai_danh_gia);

-- ============================================================
-- BẢNG 6: cau_hinh_he_thong — Tham số Vận hành
-- ============================================================
CREATE TABLE cau_hinh_he_thong (
    id                  TEXT        PRIMARY KEY,        -- Định danh cố định
    noi_dung_thong_bao  TEXT                            -- Nội dung thông báo / cấu hình
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
-- ROW LEVEL SECURITY (RLS) — Bảo mật theo dòng dữ liệu
-- ============================================================

-- Bật RLS cho tất cả bảng
ALTER TABLE quan_ly_key         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_dau              ENABLE ROW LEVEL SECURITY;
ALTER TABLE khach_vang_lai      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dat_slot            ENABLE ROW LEVEL SECURITY;
ALTER TABLE danh_gia_tin_dung   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cau_hinh_he_thong   ENABLE ROW LEVEL SECURITY;

-- ── quan_ly_key: anon đọc để xác thực Key, UPDATE để ghi device ID
CREATE POLICY "anon_doc_key"
    ON quan_ly_key FOR SELECT TO anon USING (true);
CREATE POLICY "anon_cap_nhat_key"
    ON quan_ly_key FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── ca_dau: anon đọc tất cả, INSERT và UPDATE (host tạo/sửa kèo)
CREATE POLICY "anon_doc_ca_dau"
    ON ca_dau FOR SELECT TO anon USING (true);
CREATE POLICY "anon_them_ca_dau"
    ON ca_dau FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_sua_ca_dau"
    ON ca_dau FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── khach_vang_lai: anon toàn quyền (đăng ký/cập nhật hồ sơ)
CREATE POLICY "anon_khach"
    ON khach_vang_lai FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── dat_slot: anon đọc/ghi/UPDATE trạng thái
CREATE POLICY "anon_dat_slot"
    ON dat_slot FOR SELECT TO anon USING (true);
CREATE POLICY "anon_them_slot"
    ON dat_slot FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_sua_slot"
    ON dat_slot FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── danh_gia_tin_dung: anon đọc + INSERT, KHÔNG cho UPDATE (khóa cứng)
CREATE POLICY "anon_doc_danh_gia"
    ON danh_gia_tin_dung FOR SELECT TO anon USING (true);
CREATE POLICY "anon_them_danh_gia"
    ON danh_gia_tin_dung FOR INSERT TO anon WITH CHECK (true);
-- KHÔNG tạo policy UPDATE → đánh giá bị khóa vĩnh viễn sau khi gửi
-- Chỉ Admin (service_role) mới xóa được (qua Supabase dashboard)

-- ── cau_hinh_he_thong: anon đọc (khách thấy popup), anon UPDATE (admin ghi qua anon key)
CREATE POLICY "anon_doc_config"
    ON cau_hinh_he_thong FOR SELECT TO anon USING (true);
CREATE POLICY "anon_sua_config"
    ON cau_hinh_he_thong FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- KIỂM TRA — Chạy sau khi tạo xong để verify
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT * FROM cau_hinh_he_thong;
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- ============================================================
-- GHI CHÚ QUAN TRỌNG
-- ============================================================
-- 1. Sau khi chạy file này, vào Settings → API → lấy anon/public key (JWT dạng eyJ...)
--    Thay thế vào SUPABASE_ANON_KEY trong ket-noi-supabase.js
--
-- 2. Test kết nối: mở khach.html trên browser, F12 → Console,
--    gõ: window.khoDuLieuVinhVien.docData('ca_dau', {}).then(console.log)
--    Nếu thấy [] là thành công (bảng trống, chưa có data)
--
-- 3. Tạo 1 key test trong Admin để chạy luồng end-to-end:
--    INSERT INTO quan_ly_key (ma_key, ten_host, sdt_host, trang_thai)
--    VALUES ('TVL-TEST1-0001', 'Host Test', '0909000001', 'Chưa kích hoạt');
