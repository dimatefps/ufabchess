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
