async function injectComponents() {
    try {
        const headerRes = await fetch('header.html');
        const headerHtml = await headerRes.text();
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = headerHtml;

        const sidebar = tempDiv.querySelector('.sidebar-drawer');
        const overlay = tempDiv.querySelector('.sidebar-overlay');
        
        if (sidebar) document.body.appendChild(sidebar);
        if (overlay) document.body.appendChild(overlay);
        
        const placeholder = document.getElementById('header-placeholder');
        if (placeholder) {
            placeholder.innerHTML = '';
            while (tempDiv.firstChild) {
                placeholder.appendChild(tempDiv.firstChild);
            }
        }

        window.dispatchEvent(new Event('componentsInjected'));

        const footerRes = await fetch('footer.html');
        const footerHtml = await footerRes.text();
        const footerPlaceholder = document.getElementById('footer-placeholder');
        if (footerPlaceholder) {
            footerPlaceholder.innerHTML = footerHtml;
        }
    } catch (error) {
        console.error("Injection Error:", error);
    }
}

injectComponents();