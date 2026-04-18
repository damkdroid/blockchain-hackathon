// Check if user is already logged in, redirect to dashboard
if (WalletAPI && WalletAPI.isLoggedIn()) {
    window.location.href = './pages/dashboard.html';
}

document.addEventListener('DOMContentLoaded', () => {
    initProtocolCanvas();
    initScrollAnimations();
});

function initProtocolCanvas() {
    const canvas = document.getElementById('protocolCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width, height;
    let nodes = [];
    let animationId;

    function resize() {
        const wrapper = canvas.parentElement;
        width = wrapper.clientWidth;
        height = 280;
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    function createNodes() {
        nodes = [];
        const count = Math.floor(width / 80);
        for (let i = 0; i < count; i++) {
            nodes.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                r: Math.random() * 2 + 1.5,
                glow: Math.random()
            });
        }
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    const alpha = (1 - dist / 120) * 0.15;
                    ctx.beginPath();
                    ctx.moveTo(nodes[i].x, nodes[i].y);
                    ctx.lineTo(nodes[j].x, nodes[j].y);
                    ctx.strokeStyle = `rgba(0, 224, 255, ${alpha})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }

        nodes.forEach(node => {
            node.glow += 0.01;
            const glowAlpha = 0.3 + Math.sin(node.glow * 2) * 0.2;

            ctx.beginPath();
            ctx.arc(node.x, node.y, node.r + 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 224, 255, ${glowAlpha * 0.15})`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 224, 255, ${glowAlpha + 0.3})`;
            ctx.fill();

            node.x += node.vx;
            node.y += node.vy;

            if (node.x < 0 || node.x > width) node.vx *= -1;
            if (node.y < 0 || node.y > height) node.vy *= -1;
        });

        animationId = requestAnimationFrame(draw);
    }

    resize();
    createNodes();
    draw();

    window.addEventListener('resize', () => {
        cancelAnimationFrame(animationId);
        resize();
        createNodes();
        draw();
    });
}

function initScrollAnimations() {
    const elements = document.querySelectorAll('.feature-card, .section-label, .section-desc');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, i * 100);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    elements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
}
