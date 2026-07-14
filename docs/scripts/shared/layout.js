// ==========================================
// INJEÇÃO DO GOOGLE TAG MANAGER (GTM)
// ==========================================
function injectGTM() {
    const gtmId = 'GTM-WLTL3FZ3'; // ID do seu container do GTM

    try {
        // 1. Injeta o script principal do GTM no <head>
        const script = document.createElement('script');
        script.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${gtmId}');`;
        document.head.appendChild(script);

        // 2. Injeta a tag <noscript> para fallback no início do <body>
        const noscript = document.createElement('noscript');
        noscript.innerHTML = `<iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}"
        height="0" width="0" style="display:none;visibility:hidden"></iframe>`;
        document.body.insertBefore(noscript, document.body.firstChild);

        console.log("GTM injetado dinamicamente com sucesso!");
    } catch (e) {
        console.error("Erro ao injetar o GTM:", e);
    }
}

// Inicializa o GTM imediatamente
injectGTM();

// ==========================================
// CARREGAMENTO DINÂMICO DE COMPONENTES
// ==========================================
async function loadComponent(id, file) {
    try {
        const response = await fetch(file);
        const html = await response.text();
        document.getElementById(id).innerHTML = html;

        // Se o componente carregado for o header, ativamos o menu IMEDIATAMENTE
        if (id === "site-header") {
            setupMobileMenu();
        }
    } catch (error) {
        console.error("Erro ao carregar componente:", error);
    }
}

function setupMobileMenu() {
    const menuToggle = document.querySelector('.menu-toggle');
    const headerLinks = document.querySelector('.header-links');

    if (menuToggle && headerLinks) {
        // Removemos qualquer evento antigo antes de adicionar para evitar duplicação
        menuToggle.onclick = function() {
            headerLinks.classList.toggle('active');
        };
        console.log("Menu mobile configurado com sucesso!");
    }
}

const isRoot = !window.location.pathname.includes("/pages/");

loadComponent("site-header", isRoot ? "components/header-root.html" : "../components/header-pages.html");

loadComponent("site-footer", isRoot ? "components/footer.html" : "../components/footer.html");