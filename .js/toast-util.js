const style = document.createElement('style');
style.textContent = `
    .ap-toast {
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: #FF8C00;
        color: white;
        padding: 12px 28px;
        border-radius: 50px;
        font-size: 0.95rem;
        font-weight: 500;
        white-space: nowrap;
        z-index: 99999; 
        pointer-events: none;
        opacity: 0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
    }
    .ap-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
    }
`;
document.head.appendChild(style);

let toastElement = document.getElementById('toast');
if (!toastElement) {
    toastElement = document.createElement('div');
    toastElement.id = 'toast';
    toastElement.className = 'ap-toast';
    document.body.appendChild(toastElement);
}

export const showToast = (msg) => {
    toastElement.textContent = msg;
    toastElement.classList.add('show');
    setTimeout(() => {
        toastElement.classList.remove('show');
    }, 3000);
};