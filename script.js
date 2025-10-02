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
    // Modal Elements
    const settingsBtn = document.getElementById('settingsBtn');
    const contactBtn = document.getElementById('contactBtn');
    const settingsModal = document.getElementById('settingsModal');
    const contactModal = document.getElementById('contactModal');
    const closeModalBtns = document.querySelectorAll('.modal-close');
    const resetAppBtn = document.getElementById('resetAppBtn');

    // State
    let dataFolkestone = [], dataVendome = [], dataWashington = [], dataLeHavre = [];
    let currentData = [], orderList = [], lastSearchResults = [];
    let allHeaders = [], visibleColumns = [];

    // --- LOCALSTORAGE ---
    function loadStateFromLocalStorage() {
        const savedOrder = localStorage.getItem('mercurialeOrder');
        const savedColumns = localStorage.getItem('mercurialeColumns');
        
        orderList = savedOrder ? JSON.parse(savedOrder) : [];
        visibleColumns = savedColumns ? JSON.parse(savedColumns) : ['Libellé produit', 'Marque', 'Prix'];
    }
    
    function saveOrderToLocalStorage() {
        localStorage.setItem('mercurialeOrder', JSON.stringify(orderList));
    }

    function saveColumnsToLocalStorage() {
        localStorage.setItem('mercurialeColumns', JSON.stringify(visibleColumns));
    }
    
    // --- INITIALISATION ---
    loadStateFromLocalStorage();
    initializeModals();

    Promise.all([
        fetch('data/mercuriale-folkestone.json').then(r => r.json()),
        fetch('data/mercuriale-vendome.json').then(r => r.json()),
        fetch('data/mercuriale-washington.json').then(r => r.json()),
        fetch('data/mercuriale-lehavre.json').then(r => r.json())
    ])
    .then(([folkestone, vendome, washington, lehavre]) => {
        dataFolkestone = folkestone.map(x => ({...x, _source: 'Folkestone'}));
        dataVendome = vendome.map(x => ({...x, _source: 'Vendôme'}));
        dataWashington = washington.map(x => ({...x, _source: 'Washington'}));
        dataLeHavre = lehavre.map(x => ({...x, _source: 'Le Havre'}));
        
        if (dataFolkestone.length > 0) {
            allHeaders = Object.keys(dataFolkestone[0]).filter(h => h !== '_source');
            populateColumnSelector();
        }
        
        updateCurrentData();
        updateProductCount();
        renderOrderList();
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
        saveColumnsToLocalStorage();
        displaySearchResults(lastSearchResults, searchInput.value.trim().toLowerCase());
        renderOrderList();
    }
    
    function performSearch() {
        const query = searchInput.value.trim();
        const field = searchField.value;

        if (query.length === 0) {
            lastSearchResults = [];
            displaySearchResults([], "");
            return;
        }

        // CORRIGÉ: Logique de recherche multi-codes
        if (field === 'Code Produit' && query.includes(',')) {
            const codes = query.split(',').map(code => code.trim().toLowerCase()).filter(code => code);
            lastSearchResults = currentData.filter(item => {
                const itemCode = String(item['Code Produit'] ?? '').trim().toLowerCase();
                return codes.includes(itemCode);
            });
        } else {
            const lowerCaseQuery = query.toLowerCase();
            lastSearchResults = currentData.filter(item => {
                if (field === "all") return Object.values(item).some(val => String(val).toLowerCase().includes(lowerCaseQuery));
                return (item[field]?.toString().toLowerCase() || '').includes(lowerCaseQuery);
            });
        }
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
                                ${visibleColumns.map(header => {
                                    let cellContent = highlightText(item[header], query);
                                    if (header === 'Prix') {
                                        cellContent = formatPriceFromFloat(parsePriceAsFloat(item[header]));
                                    }
                                    return `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${cellContent}</td>`;
                                }).join('')}
                                ${isOrder ? `
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <input type="number" min="0" value="${item._quantity || 1}" class="w-20 px-2 py-1 border border-gray-300 rounded-md text-sm quantity-input"
                                               data-code="${item['Code Produit']}" data-source="${item._source}">
                                    </td>` : ''}
                                <td class="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                                    ${getActionButtonHTML(item, type)}
                                </td>
                            </tr>
                            ${!isOrder ? `<tr><td colspan="${visibleColumns.length + 2}" class="p-0">${showPriceComparison(item["Code Produit"])}</td></tr>` : ''}
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function displaySearchResults(results, query) {
        if (results.length === 0) {
            if (query.length > 0) searchResultsContainer.innerHTML = `<div class="text-center py-8 px-4"><p class="text-gray-500">Aucun résultat pour "<strong>${query}</strong>"</p></div>`;
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
        if (selectedSources.includes('lehavre')) currentData.push(...dataLeHavre);
    }
    
    function addProductToOrder(code, source) {
        if (orderList.some(p => p["Code Produit"] == code && p._source === source)) {
            showNotification(`Cet article est déjà dans la commande.`, 'warning'); return;
        }
        const allData = [...dataFolkestone, ...dataVendome, ...dataWashington, ...dataLeHavre];
        const product = allData.find(p => p["Code Produit"] == code && p._source === source);
        if (product) {
            orderList.push({...product, _quantity: 1});
            saveOrderToLocalStorage();
            renderOrderList();
            showNotification('Article ajouté', 'success');
        }
    }

    function removeProductFromOrder(code, source) {
        orderList = orderList.filter(p => !(p["Code Produit"] == code && p._source === source));
        saveOrderToLocalStorage();
        renderOrderList();
        showNotification('Article retiré', 'info');
    }
    
    function showPriceComparison(productCode) {
        if (!productCode) return '';
        const allProducts = [...dataFolkestone, ...dataVendome, ...dataWashington, ...dataLeHavre];
        const sameProducts = allProducts.filter(p => p["Code Produit"] == productCode);
        
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
                            <div class="text-gray-800 font-bold mt-1">${formatPriceFromFloat(parsePriceAsFloat(product.Prix))}</div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }

    function updateProductQuantity(code, source, newQuantity) {
        const productIndex = orderList.findIndex(p => p["Code Produit"] == code && p._source === source);
        if (productIndex !== -1) {
            const quantity = parseInt(newQuantity);
            if (isNaN(quantity) || quantity <= 0) {
                orderList.splice(productIndex, 1);
            } else {
                orderList[productIndex]._quantity = quantity;
            }
            saveOrderToLocalStorage();
            renderOrderList();
        }
    }

    function updateOrderTotal() {
        let totalElement = document.getElementById('orderTotal');
        if (orderList.length === 0) {
            totalElement?.remove();
            return;
        }
        
        // CORRIGÉ: Calcul en centimes pour la précision
        const totalInCents = orderList.reduce((sum, p) => {
            const priceInCents = parsePriceAsCents(p.Prix);
            const quantity = p._quantity || 1;
            return sum + (priceInCents * quantity);
        }, 0);
        
        if (!totalElement) {
            totalElement = document.createElement('div');
            totalElement.id = 'orderTotal';
            totalElement.className = 'mt-4 p-4 bg-green-50 border-l-4 border-green-400';
            orderListContainer.parentNode.insertBefore(totalElement, orderListContainer.nextSibling);
        }
        totalElement.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="font-semibold text-green-800 text-lg">Total de la commande :</span>
                <span class="text-2xl font-bold text-green-700">${formatPriceFromCents(totalInCents)}</span>
            </div>`;
    }
    
    // --- NOUVELLES FONCTIONS DE GESTION DES PRIX ---
    function parsePriceAsFloat(priceStr) {
        if (typeof priceStr !== 'string') priceStr = String(priceStr);
        return parseFloat(priceStr.replace(',', '.')) || 0;
    }

    function parsePriceAsCents(priceStr) {
        const priceFloat = parsePriceAsFloat(priceStr);
        return Math.round(priceFloat * 100);
    }

    function formatPriceFromFloat(priceFloat) {
        return (priceFloat || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    }
    
    function formatPriceFromCents(priceInCents) {
        return formatPriceFromFloat((priceInCents || 0) / 100);
    }
    
    function initializeModals() {
        settingsBtn.addEventListener('click', (e) => { e.preventDefault(); settingsModal.classList.remove('hidden'); });
        contactBtn.addEventListener('click', (e) => { e.preventDefault(); contactModal.classList.remove('hidden'); });
        
        closeModalBtns.forEach(btn => btn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
            contactModal.classList.add('hidden');
        }));

        resetAppBtn.addEventListener('click', () => {
            if (confirm("Êtes-vous sûr de vouloir tout réinitialiser ? Votre commande et vos préférences de colonnes seront perdues.")) {
                localStorage.removeItem('mercurialeOrder');
                localStorage.removeItem('mercurialeColumns');
                location.reload();
            }
        });
    }

    // --- FONCTIONS D'EXPORT ---
    function downloadOrderAsCSV() {
        const headers = ['Source', ...visibleColumns, 'Quantité', 'Total'];
        const csvContent = [
            headers.join(';'),
            ...orderList.map(row => {
                const total = (parsePriceAsFloat(row.Prix) * (row._quantity || 1)).toFixed(2).replace('.', ',');
                const values = [
                    row._source, 
                    ...visibleColumns.map(h => row[h] ?? ''),
                    row._quantity || 1,
                    total
                ];
                return values.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';');
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
                const price = parsePriceAsFloat(row.Prix);
                const quantity = row._quantity || 1;
                return [
                    row._source, 
                    ...visibleColumns.map(h => (h === 'Prix') ? price : (row[h] ?? '')),
                    quantity,
                    price * quantity
                ];
            })
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // AMÉLIORÉ: Mise en forme des colonnes
        const priceColIndex = visibleColumns.indexOf('Prix') + 1; // +1 pour la colonne "Source"
        const totalColIndex = headers.length - 1;
        const currencyFormat = '#,##0.00" €"';

        for(let i = 1; i < wsData.length; i++) { // Boucle sur les lignes de données
            const priceCellAddress = XLSX.utils.encode_cell({r: i, c: priceColIndex});
            const totalCellAddress = XLSX.utils.encode_cell({r: i, c: totalColIndex});
            if(ws[priceCellAddress]) ws[priceCellAddress].z = currencyFormat;
            if(ws[totalCellAddress]) ws[totalCellAddress].z = currencyFormat;
        }
        
        ws['!cols'] = headers.map(h => ({ wch: (h === 'Libellé produit') ? 40 : 15 }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Commande");
        XLSX.writeFile(wb, `commande_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    // --- FONCTIONS AUXILIAIRES ---
    function getActionButtonHTML(item, type) {
        const dataAttrs = `data-code="${item["Code Produit"]}" data-source="${item._source}"`;
        if (type === 'search') {
            const isInOrder = orderList.some(p => p["Code Produit"] == item["Code Produit"] && p._source === item._source);
            return `<button class="btn-primary text-white px-3 py-1 rounded-md text-xs flex items-center btn-add" ${dataAttrs} ${isInOrder ? 'disabled' : ''}><i class="fas fa-plus mr-1"></i>Ajouter</button>`;
        }
        return `<button class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-xs flex items-center btn-remove" ${dataAttrs}><i class="fas fa-trash-alt mr-1"></i>Supprimer</button>`;
    }

    function getSourceColor(source) {
        switch(source) {
            case 'Folkestone': return 'bg-blue-100 text-blue-800';
            case 'Vendôme': return 'bg-purple-100 text-purple-800';
            case 'Washington': return 'bg-green-100 text-green-800';
            case 'Le Havre': return 'bg-orange-100 text-orange-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    function updateProductCount() {
        productCountElement.textContent = `${currentData.length} produits`;
    }

    function highlightText(text, query) {
        const content = text ?? '';
        if (!query || !content || query.includes(',')) return content;
        return String(content).replace(new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'), '<span class="search-highlight">$1</span>');
    }
    
    function updatePlaceholder() {
        searchResultsContainer.innerHTML = `<div class="text-center py-8 px-4"><p class="text-gray-500">Commencez à taper pour rechercher...</p></div>`;
    }

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