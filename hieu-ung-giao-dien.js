/* =========================================================================
 * 🎨 HỆ THỐNG ĐIỀU KHIỂN GIAO DIỆN & HIỆU ỨNG CYBER - HIEU-UNG-GIAO-DIEN.JS
 * Dự án: TUYENVANGLAI.IO.VN
 * Chức năng: Quản lý chế độ sáng/tối (Light/Dark Mode) phong thủy Mộc-Thủy cát tường,
 *            điều hướng màn hình SPA siêu mượt, báo cáo Toast Cyber, hiệu ứng Hologram mouse glow
 *            và khởi chạy cấu hình giao diện ban đầu.
 * =========================================================================
 */

(function () {
    // 1. Chuyển đổi chủ đề Sáng / Tối (Light & Dark Theme) phong thủy
    // Tối ưu hóa chế độ sáng (Light Mode): Tông màu Dew-mist ngọc bích cực kỳ sinh động mát mắt
    window.chuyenDoiTheme = function () {
        const body = document.body;
        const currentTheme = body.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        
        body.setAttribute("data-theme", newTheme);
        localStorage.setItem("tvl_theme", newTheme);
        capNhatIconNutTheme(newTheme);
        
        // Tạo hiệu ứng hạt lá dương liễu lay động nhẹ khi chuyển đổi giao diện sáng tối
        hieuUngDươngLieuTuongTac();
        
        window.hienToast(
            "Thay đổi chủ đề", 
            `Chế độ ${newTheme === 'dark' ? 'Tối (Huyền Vũ)' : 'Sáng (Thanh Long)'} đã kích hoạt cát tường.`, 
            "success"
        );
    };

    window.khoiTaoTheme = function () {
        const savedTheme = localStorage.getItem("tvl_theme") || "dark";
        document.body.setAttribute("data-theme", savedTheme);
        capNhatIconNutTheme(savedTheme);
    };

    function capNhatIconNutTheme(theme) {
        const icon = document.getElementById("themeIcon");
        const btn = document.getElementById("themeBtn");
        if (!icon || !btn) return;
        
        if (theme === "dark") {
            icon.className = "fa-solid fa-sun";
            btn.classList.remove("light-active");
            btn.setAttribute("title", "Chuyển sang chế độ Thanh Long (Sáng)");
        } else {
            icon.className = "fa-solid fa-moon";
            btn.classList.add("light-active");
            btn.setAttribute("title", "Chuyển sang chế độ Huyền Vũ (Tối)");
        }
    }

    // 2. Điều hướng màn hình SPA (Single Page Application) mượt mà với hiệu ứng Fade-scale
    window.chuyenView = function (viewId) {
        const views = document.querySelectorAll(".panel-view");
        let targetFound = false;

        views.forEach(view => {
            if (view.id === viewId) {
                view.classList.add("active");
                targetFound = true;
            } else {
                view.classList.remove("active");
            }
        });

        // Tự động cuộn mượt lên đỉnh đầu trang web
        window.scrollTo({ top: 0, behavior: "smooth" });

        if (targetFound) {
            console.log(`🚀 [SPA Navigation]: Đã chuyển hướng sang phân hệ: #${viewId}`);
        } else {
            console.error(`❌ [SPA Navigation]: Không tìm thấy màn hình giao diện #${viewId}`);
        }
    };

    // 3. Công cụ thông báo Toast Cyber Engine cao cấp
    window.hienToast = function (title, msg, type = "success") {
        const container = document.getElementById("toastContainer");
        if (!container) {
            console.warn("⚠️ [Toast Engine]: Không tìm thấy thẻ #toastContainer trong HTML.");
            return;
        }

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        
        let icon = "fa-solid fa-circle-check";
        if (type === "danger") icon = "fa-solid fa-circle-exclamation";
        if (type === "warning") icon = "fa-solid fa-triangle-exclamation";
        
        toast.innerHTML = `
            <div class="toast-icon"><i class="${icon}"></i></div>
            <div class="toast-content">
                <h4>${title}</h4>
                <p>${msg}</p>
            </div>
        `;
        
        container.appendChild(toast);
        
        // Kích hoạt animation trượt xiên mượt mà
        setTimeout(() => toast.classList.add("active"), 50);
        
        // Tự động giải phóng bộ nhớ sau 4 giây hiển thị
        setTimeout(() => {
            toast.classList.remove("active");
            setTimeout(() => toast.remove(), 400);
        }, 4200);
    };

    // 4. Hiệu ứng tương tác rèm lá dương liễu đặc trưng phong thủy tuổi Nhâm Ngọ 2002 (Mệnh Mộc)
    function hieuUngDươngLieuTuongTac() {
        const decors = document.querySelectorAll(".willow-decor");
        decors.forEach(decor => {
            decor.style.transform = "rotate(5deg) scale(1.05)";
            setTimeout(() => {
                decor.style.transform = "rotate(0deg) scale(1)";
            }, 600);
        });
    }

    // 5. Hologram Mouse Glow Tracker bám đuổi tọa độ con trỏ trên các Card kính mờ ảo
    window.khoiTaoHologramGlow = function () {
        const targetCards = document.querySelectorAll(".gateway-card, .pricing-engine-wrapper, .form-control");
        targetCards.forEach(card => {
            card.addEventListener("mousemove", e => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                card.style.setProperty("--x", `${x}px`);
                card.style.setProperty("--y", `${y}px`);
            });
        });
    };

    console.log("⚡ [Hệ thống giao diện]: Khởi động bộ điều khiển giao diện & hiệu ứng thành công.");

    // 6. Custom Confirm Modal — dùng chung cho mọi trang (thay confirm() browser)
    // Cần có #confirmModalOverlay trong DOM của trang. Fallback về window.confirm nếu không có.
    window.xacNhanModal = function(msg, icon) {
        return new Promise(function(resolve) {
            var overlay   = document.getElementById('confirmModalOverlay');
            var msgEl     = document.getElementById('confirmModalMsg');
            var iconEl    = document.getElementById('confirmModalIcon');
            var okBtn     = document.getElementById('confirmModalOk');
            var cancelBtn = document.getElementById('confirmModalCancel');
            if (!overlay) { resolve(window.confirm(msg)); return; }
            if (msgEl)  msgEl.textContent  = msg  || 'Bạn có chắc chắn không?';
            if (iconEl) iconEl.textContent = icon || '⚠️';
            overlay.classList.add('show');
            function cleanup(result) {
                overlay.classList.remove('show');
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                resolve(result);
            }
            function onOk()     { cleanup(true);  }
            function onCancel() { cleanup(false); }
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            overlay.addEventListener('click', function onOut(e) {
                if (e.target === overlay) { overlay.removeEventListener('click', onOut); cleanup(false); }
            });
        });
    };

    // 7. Scroll Reveal — fade-in + slide-up khi phần tử vào viewport
    window.khoiTaoScrollReveal = function () {
        const obs = new IntersectionObserver(function(entries) {
            entries.forEach(function(e) {
                if (e.isIntersecting) {
                    e.target.classList.add('visible');
                    obs.unobserve(e.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
        document.querySelectorAll('.reveal').forEach(function(el) { obs.observe(el); });
    };
    // Tự động kích hoạt sau khi DOM sẵn sàng
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.khoiTaoScrollReveal);
    } else {
        window.khoiTaoScrollReveal();
    }
    // Re-scan khi có content động được thêm vào (slot cards...)
    window.addEventListener('load', window.khoiTaoScrollReveal);
})();
