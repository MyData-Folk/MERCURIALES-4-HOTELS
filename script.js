document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const searchInput = document.getElementById('searchInput');
    const searchField = document.getElementById('searchField');
    const sourceCheckboxes = document.querySelectorAll('input[name="source"]');
    const searchResultsContainer = document.getElementById('searchResults');
    const orderListContainer = document.getElementById('orderList');
    const downloadCsvBtn = document.getElementById('downloadCsvBtn');
    const downloadXlsxBtn = document.getElementById('downloadXlsxBtn');
    const orderCountElement = document.getElementById('orderCount');
    const productCountElement = document.getElementById('productCount');
    const columnSelectorBtn = document.getElementById('columnSelectorBtn');
    const columnSelectorDropdown = document.getElementById('columnSelectorDropdown');
    const columnCheckboxesContainer = document.getElementById('columnCheckboxes');

    // State
    let dataFolkestone = [], dataVendome = [], dataWashington = [], dataLeHavre = [];
    let currentData = [], orderList = [], lastSearchResults = [];
    let allHeaders = [], visibleColumns = [];

    // --- INITIALISATION ---
    Promise.all([
        fetch('data/mercuriale-folkestone.json').then(r => r.json()),
        fetch('data/mercuriale-vendome.json').then(r => r.json()),
        fetch('data/mercuriale-washington.json').then(r => r.json()),
        fetch('data/mercuriale-lehavre.json').then(r => r.json()) // Nouvelle source
    ])
    .then(([folkestone, vendome, washington, lehavre]) => {
        dataFolkestone = folkestone.map(x => ({...x, _source: 'Folkestone'}));
        dataVendome = vendome.map(x => ({...x, _source: 'Vendôme'}));
        dataWashington = washington.map(x => ({...x, _source: 'Washington'}));
        dataLeHavre = lehavre.map(x => ({...x, _source: 'Le Havre'})); // Nouvelle source
        
        if (dataFolkestone.length > 0) {
            allHeaders = Object.keys(dataFolkestone[0]).filter(h => h !== '_source');
            visibleColumns = ['Libellé produit', 'Marque', 'Prix'];
            populateColumnSelector();
        }
        
        updateCurrentData();
        updateProductCount();
    })
    .catch(error => {
        console.error("Erreur de chargement des fichiers JSON:", error);
        searchResultsContainer.innerHTML = `<div class="bg-red-50 border-l-4 border-red-400 p-4"><p class="text-sm text-red-700">Erreur : Impossible de charger les données.</p></div>`;
    });

    // --- GESTIONNAIRES D'ÉVÉNEMENTS ---
    sourceCheckboxes.forEach(cb => cb.addEventListener('change', () => {
        updateCurrentData();
        performSearch();
        updateProductCount();
    }));
    
    searchField.addEventListener('change', performSearch);
    searchInput.addEventListener('input', performSearch);

    columnSelectorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        columnSelectorDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', () => columnSelectorDropdown.classList.add('hidden'));
    columnSelectorDropdown.addEventListener('click', e => e.stopPropagation());

    searchResultsContainer.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.btn-add');
        if (addBtn) addProductToOrder(addBtn.dataset.code, addBtn.dataset.source);
        const removeBtn = e.target.closest('.btn-remove-from-search');
        if (removeBtn) removeProductFromOrder(removeBtn.dataset.code, removeBtn.dataset.source);
    });
    
    orderListContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.btn-remove');
        if (removeBtn) removeProductFromOrder(removeBtn.dataset.code, removeBtn.dataset.source);
    });

    orderListContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('quantity-input')) {
            updateProductQuantity(e.target.dataset.code, e.target.dataset.source, e.target.value);
        }
    });

    downloadCsvBtn.addEventListener('click', downloadOrderAsCSV);
    downloadXlsxBtn.addEventListener('click', downloadOrderAsXLSX);

    // --- FONCTIONS PRINCIPALES ---

    function populateColumnSelector() {
        columnCheckboxesContainer.innerHTML = '';
        allHeaders.forEach(header => {
            const isChecked = visibleColumns.includes(header);
            const checkboxHTML = `
                <label class="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded-md cursor-pointer">
                    <input type="checkbox" value="${header}" ${isChecked ? 'checked' : ''}
                           class="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 column-checkbox">
                    <span class="text-sm text-gray-700">${header}</span>
                </label>`;
            columnCheckboxesContainer.insertAdjacentHTML('beforeend', checkboxHTML);
        });
        
        document.querySelectorAll('.column-checkbox').forEach(cb => cb.addEventListener('change', handleColumnSelectionChange));
    }
    
    function handleColumnSelectionChange(e) {
        const { value, checked } = e.target;
        if (checked) {
            visibleColumns.push(value);
        } else {
            visibleColumns = visibleColumns.filter(col => col !== value);
        }
        displaySearchResults(lastSearchResults, searchInput.value.trim().toLowerCase());
        renderOrderList();
    }
    
    function performSearch() {
        const query = searchInput.value.trim().toLowerCase();
        if (query.length < 2) {
            lastSearchResults = [];
            displaySearchResults([], query);
            return;
        }
        const field = searchField.value;
        lastSearchResults = currentData.filter(item => {
            if (field === "all") return Object.values(item).some(val => String(val).toLowerCase().includes(query));
            else return (item[field]?.toString().toLowerCase() || '').includes(query);
        });
        displaySearchResults(lastSearchResults, query);
    }
    
    function createTableHTML(data, type, query = '') {
        const isOrder = type === 'order';
        return `
            <div class="custom-scrollbar" style="max-height: 400px; overflow-y: auto;">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider whitespace-nowrap">Source</th>
                            ${visibleColumns.map(header => `<th class="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider whitespace-nowrap">${header}</th>`).join('')}
                            ${isOrder ? '<th class="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider whitespace-nowrap">Quantité</th>' : ''}
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider whitespace-nowrap">Action</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${data.map(item => `
                            <tr class="hover:bg-gray-50">
                                <td class="px-6 py-4 whitespace-nowrap"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getSourceColor(item._source)}">${item._source}</span></td>
                                ${visibleColumns.map(header => `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${highlightText(item[header], query)}</td>`).join('')}
                                ${isOrder ? `
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <input type="number" min="0" value="${item._quantity || 1}" class="w-20 px-2 py-1 border border-gray-300 rounded-md text-sm quantity-input"
                                               data-code="${item['Code Produit']}" data-source="${item._source}">
                                    </td>` : ''}
                                <td class="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                                    ${getActionButtonHTML(item, type)}
                                </td>
                            </tr>
                            ${!isOrder ? `<tr><td colspan="${visibleColumns.length + 2}" class="p-0">${showPriceComparison(item["Code Produit"], item["Libellé produit"])}</td></tr>` : ''}
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function displaySearchResults(results, query) {
        if (results.length === 0) {
            if (query.length >= 2) searchResultsContainer.innerHTML = `<div class="text-center py-8 px-4"><p class="text-gray-500">Aucun résultat pour "<strong>${query}</strong>"</p></div>`;
            else updatePlaceholder();
            return;
        }
        searchResultsContainer.innerHTML = createTableHTML(results, 'search', query);
    }

    function renderOrderList() {
        orderCountElement.textContent = orderList.length;
        if (orderList.length === 0) {
            orderListContainer.innerHTML = `<p class="text-center text-gray-500 py-8 px-4">Aucun article ajouté.</p>`;
            downloadCsvBtn.disabled = true;
            downloadXlsxBtn.disabled = true;
        } else {
            orderListContainer.innerHTML = createTableHTML(orderList, 'order');
            downloadCsvBtn.disabled = false;
            downloadXlsxBtn.disabled = false;
        }
        updateOrderTotal();
    }

    // --- FONCTIONS UTILITAIRES ---
    function updateCurrentData() {
        const selectedSources = Array.from(sourceCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        currentData = [];
        if (selectedSources.includes('folkestone')) currentData.push(...dataFolkestone);
        if (selectedSources.includes('vendome')) currentData.push(...dataVendome);
        if (selectedSources.includes('washington')) currentData.push(...dataWashington);
        if (selectedSources.includes('lehavre')) currentData.push(...dataLeHavre); // Nouvelle source
    }
    
    function addProductToOrder(code, source) {
        if (orderList.some(p => p["Code Produit"] == code && p._source === source)) {
            showNotification(`Cet article est déjà dans la commande.`, 'warning'); return;
        }
        const product = currentData.find(p => p["Code Produit"] == code && p._source === source);
        if (product) {
            orderList.push({...product, _quantity: 1}); // Quantité par défaut
            renderOrderList();
            showNotification('Article ajouté', 'success');
        }
    }

    function removeProductFromOrder(code, source) {
        const initialLength = orderList.length;
        orderList = orderList.filter(p => !(p["Code Produit"] == code && p._source === source));
        if (orderList.length < initialLength) {
            renderOrderList();
            showNotification('Article retiré', 'info');
        }
    }
    
    // --- NOUVELLES FONCTIONNALITÉS ---
    function showPriceComparison(productCode, productName) {
        const allProducts = [...dataFolkestone, ...dataVendome, ...dataWashington, ...dataLeHavre];
        const sameProducts = allProducts.filter(p => p["Code Produit"] == productCode || p["Libellé produit"] === productName);
        
        if (sameProducts.length <= 1) return '';

        return `
            <div class="m-2 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <h4 class="text-sm font-semibold text-indigo-800 mb-2 flex items-center">
                    <i class="fas fa-chart-line mr-2"></i>Comparaison des prix
                </h4>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    ${sameProducts.map(product => `
                        <div class="text-center p-2 bg-white rounded border">
                            <div class="font-medium ${getSourceColor(product._source).replace('bg-', 'text-').split(' ')[0]}">${product._source}</div>
                            <div class="text-gray-800 font-bold mt-1">${formatPrice(product.Prix)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }

    function updateProductQuantity(code, source, newQuantity) {
        const productIndex = orderList.findIndex(p => p["Code Produit"] == code && p._source === source);
        if (productIndex !== -1) {
            const quantity = parseInt(newQuantity) || 0;
            if (quantity <= 0) {
                orderList.splice(productIndex, 1);
            } else {
                orderList[productIndex]._quantity = quantity;
            }
            renderOrderList();
        }
    }

    function updateOrderTotal() {
        let totalElement = document.getElementById('orderTotal');
        if (orderList.length === 0) {
            totalElement?.remove();
            return;
        }
        
        const total = orderList.reduce((sum, p) => sum + (parseFloat(p.Prix) || 0) * (p._quantity || 1), 0);
        
        if (!totalElement) {
            totalElement = document.createElement('div');
            totalElement.id = 'orderTotal';
            totalElement.className = 'mt-4 p-4 bg-green-50 border-l-4 border-green-400';
            orderListContainer.parentNode.insertBefore(totalElement, orderListContainer.nextSibling);
        }
        totalElement.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="font-semibold text-green-800 text-lg">Total de la commande :</span>
                <span class="text-2xl font-bold text-green-700">${formatPrice(total)}</span>
            </div>`;
    }

    function formatPrice(price) {
        const num = parseFloat(price);
        return isNaN(num) ? '0,00 €' : num.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    }

    // --- FONCTIONS D'EXPORT MISES À JOUR ---
    function downloadOrderAsCSV() {
        const headers = ['Source', ...visibleColumns, 'Quantité', 'Total'];
        const csvContent = [
            headers.join(';'),
            ...orderList.map(row => {
                const price = parseFloat(row.Prix) || 0;
                const quantity = row._quantity || 1;
                const total = price * quantity;
                return [
                    row._source, 
                    ...visibleColumns.map(h => {
                        let cell = row[h] ?? '';
                        cell = `"${cell.toString().replace(/"/g, '""')}"`;
                        return cell;
                    }),
                    quantity,
                    total.toFixed(2).replace('.', ',')
                ].join(';');
            })
        ].join('\n');
        
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `commande_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function downloadOrderAsXLSX() {
        const headers = ['Source', ...visibleColumns, 'Quantité', 'Total'];
        const wsData = [
            headers, 
            ...orderList.map(row => {
                const price = parseFloat(row.Prix) || 0;
                const quantity = row._quantity || 1;
                return [
                    row._source, 
                    ...visibleColumns.map(h => row[h] || ''),
                    quantity,
                    price * quantity
                ];
            })
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        // Formatter les colonnes de prix et total
        ws['!cols'] = [{wch: 12}, ...visibleColumns.map(() => ({wch: 25})), {wch: 10}, {wch: 12}];
        const priceCol = String.fromCharCode(65 + visibleColumns.indexOf('Prix') + 1);
        const totalCol = String.fromCharCode(65 + headers.length - 1);

        for(let i = 2; i <= orderList.length + 1; i++) {
            if(ws[priceCol+i]) ws[priceCol+i].z = '#,##0.00" €"';
            if(ws[totalCol+i]) ws[totalCol+i].z = '#,##0.00" €"';
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Commande");
        XLSX.writeFile(wb, `commande_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    // --- Fonctions auxiliaires ---
    function getActionButtonHTML(item, type) {
        const dataAttrs = `data-code="${item["Code Produit"]}" data-source="${item._source}"`;
        if (type === 'search') {
            const isInOrder = orderList.some(p => p["Code Produit"] == item["Code Produit"] && p._source === item._source);
            return `<div class="flex items-center space-x-2">
                <button class="btn-primary text-white px-3 py-1 rounded-md text-xs flex items-center btn-add ${isInOrder ? 'opacity-50 cursor-not-allowed' : ''}" ${dataAttrs} ${isInOrder ? 'disabled' : ''}>
                    <i class="fas fa-plus mr-1"></i>Ajouter
                </button>
            </div>`;
        }
        return `<button class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-xs flex items-center btn-remove" ${dataAttrs}>
                    <i class="fas fa-trash-alt mr-1"></i>Supprimer
                </button>`;
    }

    function getSourceColor(source) {
        switch(source) {
            case 'Folkestone': return 'bg-blue-100 text-blue-800';
            case 'Vendôme': return 'bg-purple-100 text-purple-800';
            case 'Washington': return 'bg-green-100 text-green-800';
            case 'Le Havre': return 'bg-orange-100 text-orange-800'; // Nouvelle couleur
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    function updateProductCount() { productCountElement.textContent = `${currentData.length} produits`; }
    function highlightText(text, query) { if (!query || !text) return text ?? ''; return String(text).replace(new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'), '<span class="search-highlight">$1</span>'); }
    function updatePlaceholder() { searchResultsContainer.innerHTML = `<div class="text-center py-8 px-4"><p class="text-gray-500">Commencez à taper pour rechercher...</p></div>`; }
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        const icons = {'success': 'fa-check-circle', 'error': 'fa-exclamation-circle', 'warning': 'fa-exclamation-triangle', 'info': 'fa-info-circle'};
        const colors = {'success': 'bg-green-500', 'error': 'bg-red-500', 'warning': 'bg-yellow-500', 'info': 'bg-blue-500'};
        notification.className = `fixed bottom-4 right-4 text-white px-4 py-3 rounded-md shadow-lg flex items-center z-50 transition-all duration-300 transform translate-y-16 opacity-0 ${colors[type] || colors['info']}`;
        notification.innerHTML = `<i class="fas ${icons[type] || icons['info']} mr-2"></i><span>${message}</span>`;
        document.body.appendChild(notification);
        setTimeout(() => { notification.classList.remove('translate-y-16', 'opacity-0'); }, 10);
        setTimeout(() => { notification.classList.add('opacity-0', 'translate-y-4'); setTimeout(() => notification.remove(), 300); }, 3000);
    }
});