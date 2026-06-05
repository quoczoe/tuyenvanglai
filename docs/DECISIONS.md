# TECHNICAL DECISIONS — TUYENVANGLAI.IO.VN

## Kiến trúc & Dữ liệu
| Quyết định | Lý do |
|---|---|
| Dark mode duy nhất, không toggle | Đã xác nhận, bỏ toggle giảm CSS complexity |
| localStorage chỉ lưu session (ma_key + tvl_guest) | Mọi nghiệp vụ từ Supabase, tránh stale data |
| Không fallback localStorage khi mất mạng | Hiện lỗi rõ ràng, tránh thao tác với data cũ |
| dat_slot PK là `id` UUID (không phải id_slot) | Schema SQL thực tế |
| 3 PATCH riêng vào `cau_hinh_he_thong` | Schema chỉ có `id` + `noi_dung_thong_bao` per row |
| Admin dùng Supabase Auth JWT (không hardcode) | TVL@2026 lộ plaintext trong JS |
| Guest dùng Session Token UUID trong DB | localStorage sdt_khach bị sửa → IDOR attack |
| `window._adminJWT` cache cho dbEngine | Inject JWT để RLS authenticated context hoạt động |
| `is_admin()` SECURITY DEFINER | EXISTS subquery trong policy → circular RLS → query rỗng |
| Rate limit áp dụng cả `not_found` | Không ghi = hacker scan SĐT không bị chặn |
| `admin_cascade_xoa_user` chỉ check `auth.uid() IS NOT NULL` | Tránh phụ thuộc cột `auth_uid` chưa tồn tại |

## Logic Nghiệp Vụ
| Quyết định | Chi tiết |
|---|---|
| Huỷ slot = UPDATE không DELETE | `trang_thai_di_danh = "Khách hủy"` — host vẫn theo dõi lịch sử |
| Khách KHÔNG đặt lại sau khi huỷ | Block nếu existingSlot.trang_thai === "Khách hủy" |
| Chỉ tính tiền khi `da_chot_ca=true + "Đã tham gia"` | Khớp tiền thật đã thu |
| Đánh giá khóa vĩnh viễn sau INSERT | NO UPDATE trên DB — tránh hối lộ |
| Chốt ca KHÔNG đảo ngược | da_chot_ca = TRUE → host bị khóa hoàn toàn |
| 3 điều kiện AND cho cả 2 chiều đánh giá | Đảm bảo căn cứ thực tế (xem CLAUDE.md) |

## UI/UX
| | |
|---|---|
| Palette | `#0f1e35` nền · `#1a2844` card · `#e2e8f0` text · `#00ff88` accent · `#1e3a5f` border |
| Font | Inter (admin/host/guest), Bebas Neue + Barlow Condensed (index) |
| Admin layout | Flex column với `_fitTable()` JS (CSS calc không đo được offsetHeight) |
| `#adminConsole` show | `display:flex` (không block) — cần flex container cho sticky-top |
| `_toggleCaMenu` | `position:fixed` + getBoundingClientRect — tránh bị clip bởi overflow:auto |
| adminAuthPanel | Starts `display:none` — tránh F5 flash |
| Sticky header bảng | `border-collapse:separate; border-spacing:0` — Chromium bỏ qua z-index với collapse |

## Security SQL Notes
- `auth_uid` column chỉ có sau `security-auth-v4.sql` Part 1
- `is_admin()` function chỉ có sau Part 2
- Nếu chỉ có `supabase-schema.sql`: anon có SELECT/INSERT/UPDATE/DELETE trên nguoi_dung (rất mở)
- `migration-admin-cascade.sql` v2 không phụ thuộc auth_uid hay is_admin()
