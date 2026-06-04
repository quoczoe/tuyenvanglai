-- ═══════════════════════════════════════════════════════════════════
-- SECURITY MIGRATION — TUYENVANGLAI.IO.VN
-- Chạy toàn bộ file này trên Supabase SQL Editor (Dashboard)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Thêm cột mới vào bảng nguoi_dung ──────────────────────────
ALTER TABLE nguoi_dung
  ADD COLUMN IF NOT EXISTS diem_uy_tin             INTEGER      DEFAULT 100,
  ADD COLUMN IF NOT EXISTS is_whitelisted          BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS device_fingerprint      TEXT,
  ADD COLUMN IF NOT EXISTS free_pass_thang         INTEGER      DEFAULT 1,
  ADD COLUMN IF NOT EXISTS free_pass_reset_thang   INTEGER      DEFAULT EXTRACT(MONTH FROM NOW())::INTEGER,
  ADD COLUMN IF NOT EXISTS so_ca_thanh_cong        INTEGER      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS so_sao_tb               NUMERIC(3,2) DEFAULT 0;

-- ── 2. Thêm cột mới vào bảng ca_dau ─────────────────────────────
ALTER TABLE ca_dau
  ADD COLUMN IF NOT EXISTS scam_warning   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS yeu_cau_coc    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bao_cao_count  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_frozen      BOOLEAN DEFAULT FALSE;

-- ── 3. Bảng mới: bao_cao (hệ thống báo cáo) ─────────────────────
CREATE TABLE IF NOT EXISTS bao_cao (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_ca_dau        UUID        REFERENCES ca_dau(id) ON DELETE CASCADE,
  sdt_nguoi_bao_cao TEXT       NOT NULL,
  sdt_bi_bao_cao   TEXT        NOT NULL,
  loai_bao_cao     TEXT        DEFAULT 'lua_coc',
  mo_ta            TEXT,
  trang_thai       TEXT        DEFAULT 'cho_xu_ly',
  created_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE bao_cao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bao_cao_anon" ON bao_cao;
CREATE POLICY "bao_cao_anon" ON bao_cao FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── 4. Bảng mới: fingerprint_blacklist ───────────────────────────
CREATE TABLE IF NOT EXISTS fingerprint_blacklist (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_id TEXT        NOT NULL UNIQUE,
  ly_do          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE fingerprint_blacklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fp_bl_read" ON fingerprint_blacklist;
CREATE POLICY "fp_bl_read" ON fingerprint_blacklist FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "fp_bl_insert" ON fingerprint_blacklist;
CREATE POLICY "fp_bl_insert" ON fingerprint_blacklist FOR INSERT TO anon WITH CHECK (true);

-- ── 5. Seed: đặt diem_uy_tin = 100 cho toàn bộ user cũ (chưa có) ─
UPDATE nguoi_dung SET diem_uy_tin = 100 WHERE diem_uy_tin IS NULL;
UPDATE nguoi_dung SET is_whitelisted = FALSE WHERE is_whitelisted IS NULL;
UPDATE nguoi_dung SET free_pass_thang = 1 WHERE free_pass_thang IS NULL;
UPDATE nguoi_dung SET free_pass_reset_thang = EXTRACT(MONTH FROM NOW())::INTEGER WHERE free_pass_reset_thang IS NULL;
UPDATE nguoi_dung SET so_ca_thanh_cong = 0 WHERE so_ca_thanh_cong IS NULL;
UPDATE nguoi_dung SET so_sao_tb = 0 WHERE so_sao_tb IS NULL;
