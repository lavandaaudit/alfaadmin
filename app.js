const REPO_OWNER = 'lavandaaudit';
const REPO_NAME = 'alfa_4';
const FILE_PATH = 'src/data/products.json';

// App State
let githubToken = localStorage.getItem('github_token') || '';
let products = [];
let fileSha = '';
let hasUnsavedChanges = false;
let editingProductId = null;

// DOM Elements
const views = {
    loading: document.getElementById('loading'),
    dashboard: document.getElementById('dashboard'),
    editor: document.getElementById('product-editor')
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    
    if (!githubToken) {
        document.getElementById('settings-modal').classList.remove('hidden');
    } else {
        loadData();
    }
});

function initEvents() {
    // Settings
    document.getElementById('btn-settings').addEventListener('click', () => {
        document.getElementById('github-token').value = githubToken;
        document.getElementById('settings-modal').classList.remove('hidden');
    });
    
    document.getElementById('btn-close-settings').addEventListener('click', () => {
        document.getElementById('settings-modal').classList.add('hidden');
    });
    
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        githubToken = document.getElementById('github-token').value.trim();
        localStorage.setItem('github_token', githubToken);
        document.getElementById('settings-modal').classList.add('hidden');
        loadData();
    });

    // Dashboard
    document.getElementById('btn-refresh').addEventListener('click', loadData);
    document.getElementById('btn-add-product').addEventListener('click', () => openEditor());
    document.getElementById('btn-publish-changes').addEventListener('click', publishChanges);

    // Editor
    document.getElementById('btn-back').addEventListener('click', () => showView('dashboard'));
    document.getElementById('btn-add-tier').addEventListener('click', () => addTierRow());
    document.getElementById('product-form').addEventListener('submit', saveProductToMemory);
    document.getElementById('product-image').addEventListener('input', updateImagePreview);
}

function showView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
}

async function fetchWithAuth(url, options = {}) {
    const headers = {
        'Accept': 'application/vnd.github.v3+json'
    };
    if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
    }
    
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
        throw new Error('Помилка авторизації. Перевірте GitHub Token.');
    }
    return response;
}

async function loadData() {
    showView('loading');
    const statusBadge = document.getElementById('repo-status');
    
    try {
        const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
        const response = await fetchWithAuth(url);
        
        if (!response.ok) throw new Error('Не вдалося завантажити дані з GitHub');
        
        const data = await response.json();
        fileSha = data.sha;
        
        // Base64 decode (handle utf-8 properly)
        const content = decodeURIComponent(escape(atob(data.content)));
        products = JSON.parse(content);
        
        hasUnsavedChanges = false;
        updateUnsavedPanel();
        renderProducts();
        
        statusBadge.textContent = 'Підключено до lavandaaudit/alfa_4';
        statusBadge.className = 'status-badge status-ok';
        showView('dashboard');
        
    } catch (error) {
        console.error(error);
        statusBadge.textContent = 'Помилка підключення';
        statusBadge.className = 'status-badge status-error';
        alert(error.message);
        showView('dashboard'); // show dashboard anyway to let user see settings
    }
}

function renderProducts() {
    const tbody = document.getElementById('product-list');
    tbody.innerHTML = '';
    
    products.forEach(p => {
        const tr = document.createElement('tr');
        
        let imgUrl = '';
        if (p.media && p.media.main) imgUrl = p.media.main;
        else if (typeof p.media === 'string') imgUrl = p.media;

        tr.innerHTML = `
            <td>
                ${imgUrl ? `<img src="${imgUrl}" alt="${p.name}">` : '<div style="width:50px;height:50px;background:#eee;border-radius:4px"></div>'}
            </td>
            <td><strong>${p.name || 'Без назви'}</strong><br><small class="text-muted">${p.id}</small></td>
            <td>${p.category || ''}</td>
            <td>€${parseFloat(p.basePrice || 0).toFixed(2)}</td>
            <td class="actions-cell">
                <button class="btn btn-sm btn-secondary" onclick="editProduct('${p.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openEditor(productId = null) {
    editingProductId = productId;
    const form = document.getElementById('product-form');
    form.reset();
    document.getElementById('tiers-container').innerHTML = '';
    document.getElementById('image-preview').innerHTML = '<span>Немає фото</span>';
    
    if (productId) {
        document.getElementById('editor-title').textContent = 'Редагування товару';
        const product = products.find(p => p.id === productId);
        if (product) {
            document.getElementById('product-id').value = product.id;
            document.getElementById('product-name').value = product.name || '';
            document.getElementById('product-category').value = product.category || '';
            document.getElementById('product-subcategory').value = product.subcategory || '';
            document.getElementById('product-description').value = product.description || '';
            document.getElementById('product-base-price').value = product.basePrice || '';
            document.getElementById('product-min-qty').value = product.minOrderQty || '';
            document.getElementById('product-lead-time').value = product.productionDays || '';
            
            // Image
            let imgUrl = '';
            if (product.media && product.media.main) imgUrl = product.media.main;
            else if (typeof product.media === 'string') imgUrl = product.media;
            document.getElementById('product-image').value = imgUrl;
            updateImagePreview();
            
            // Colors
            if (product.colorTags && Array.isArray(product.colorTags)) {
                document.getElementById('product-colors').value = product.colorTags.join(', ');
            }
            
            // Tiers
            if (product.tiers && Array.isArray(product.tiers)) {
                product.tiers.forEach(t => addTierRow(t.qty, t.pricePerUnit));
            }
        }
    } else {
        document.getElementById('editor-title').textContent = 'Новий товар';
        document.getElementById('product-id').value = 'prod-' + Date.now();
        addTierRow(50, ''); // add one empty tier by default
    }
    
    showView('editor');
}

window.editProduct = openEditor;

window.deleteProduct = function(id) {
    if (confirm('Ви впевнені, що хочете видалити цей товар?')) {
        products = products.filter(p => p.id !== id);
        hasUnsavedChanges = true;
        updateUnsavedPanel();
        renderProducts();
    }
};

function addTierRow(qty = '', price = '') {
    const container = document.getElementById('tiers-container');
    const row = document.createElement('div');
    row.className = 'tier-row';
    row.innerHTML = `
        <input type="number" placeholder="Кількість (від)" value="${qty}" class="tier-qty" required>
        <span>шт. →</span>
        <input type="number" step="0.01" placeholder="Ціна за 1 шт." value="${price}" class="tier-price" required>
        <span>€</span>
        <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(row);
}

function updateImagePreview() {
    const url = document.getElementById('product-image').value;
    const preview = document.getElementById('image-preview');
    if (url) {
        preview.innerHTML = `<img src="${url}" onerror="this.parentElement.innerHTML='<span>Помилка завантаження</span>'">`;
    } else {
        preview.innerHTML = '<span>Немає фото</span>';
    }
}

function saveProductToMemory(e) {
    e.preventDefault();
    
    const id = document.getElementById('product-id').value;
    
    // Parse tiers
    const tierRows = document.querySelectorAll('.tier-row');
    const tiers = [];
    tierRows.forEach(row => {
        const qty = parseInt(row.querySelector('.tier-qty').value);
        const price = parseFloat(row.querySelector('.tier-price').value);
        if (!isNaN(qty) && !isNaN(price)) {
            tiers.push({ qty, pricePerUnit: price });
        }
    });
    
    // Parse colors
    const colorStr = document.getElementById('product-colors').value;
    const colorTags = colorStr.split(',').map(c => c.trim()).filter(c => c);

    const productData = {
        id: id,
        name: document.getElementById('product-name').value,
        category: document.getElementById('product-category').value,
        subcategory: document.getElementById('product-subcategory').value,
        description: document.getElementById('product-description').value,
        basePrice: parseFloat(document.getElementById('product-base-price').value),
        minOrderQty: parseInt(document.getElementById('product-min-qty').value) || 0,
        productionDays: parseInt(document.getElementById('product-lead-time').value) || 0,
        tiers: tiers,
        colorTags: colorTags,
        media: {
            main: document.getElementById('product-image').value
        }
    };
    
    const existingIndex = products.findIndex(p => p.id === id);
    if (existingIndex >= 0) {
        // Update keeping other fields
        products[existingIndex] = { ...products[existingIndex], ...productData };
    } else {
        // Add new
        products.push(productData);
    }
    
    hasUnsavedChanges = true;
    updateUnsavedPanel();
    renderProducts();
    showView('dashboard');
}

function updateUnsavedPanel() {
    const panel = document.getElementById('unsaved-changes-panel');
    if (hasUnsavedChanges) {
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

async function publishChanges() {
    if (!githubToken) {
        alert('Будь ласка, вкажіть GitHub Token в налаштуваннях.');
        document.getElementById('settings-modal').classList.remove('hidden');
        return;
    }
    
    const btn = document.getElementById('btn-publish-changes');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Збереження...';
    btn.disabled = true;
    
    try {
        const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
        
        // Encode content properly for GitHub API (utf-8 to base64)
        const jsonContent = JSON.stringify(products, null, 2);
        const encodedContent = btoa(unescape(encodeURIComponent(jsonContent)));
        
        const body = {
            message: 'Update products via Admin Panel',
            content: encodedContent,
            sha: fileSha
        };
        
        const response = await fetchWithAuth(url, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || 'Невідома помилка при збереженні');
        }
        
        const result = await response.json();
        fileSha = result.content.sha; // update SHA for next save
        
        hasUnsavedChanges = false;
        updateUnsavedPanel();
        alert('Успішно збережено! Файл products.json у репозиторії alfa_4 оновлено.');
        
    } catch (error) {
        console.error(error);
        alert('Помилка при збереженні: ' + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
