const app = {
    settings: {},
    services: [],
    records: [],
    invoices: [],
    invoiceSelection: new Set(),

    async init() {
        await db.init();
        await this.loadData();
        
        // Setup Nav
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
                // Update active state
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });

        // 14-Day Auto-Backup check
        this.runAutoBackupCheck();

        // Initialize icons
        lucide.createIcons();
    },

    async runAutoBackupCheck() {
        const lastBackup = this.settings.lastBackupDate;
        const now = new Date();
        const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

        if (!lastBackup || (now - new Date(lastBackup)) > twoWeeksMs) {
            console.log("Triggering 14-day automated backup...");
            // We'll export the database. 
            // Browser security might require user interaction, so we do it via a minor delay or prompt.
            // But since this is a local utility app, we trigger the download.
            await this.exportDatabase();
            this.settings.lastBackupDate = now.toISOString();
            await db.saveSettings(this.settings);
        }
    },

    async loadData() {
        this.settings = await db.getSettings();
        this.services = await db.getServices();
        this.records = await db.getRecords();
        this.invoices = await db.getInvoices();

        this.updateDashboard();
        this.renderServicesTable();
        this.renderRecordsTable();
        this.populateServiceDropdown();
        this.populateInvoiceServiceFilter();
        
        // Update Setting Input
        document.getElementById('setting-super-rate').value = this.settings.superRate || 12;
        if (document.getElementById('setting-fee-rate')) document.getElementById('setting-fee-rate').value = this.settings.feeRate || 30;
        if (document.getElementById('inv-fee-override')) document.getElementById('inv-fee-override').value = this.settings.feeRate || 30;
        document.getElementById('inv-super-label').innerText = `Super (${this.settings.superRate || 12}%):`;
        if (document.getElementById('th-super-header')) {
            document.getElementById('th-super-header').innerText = `Super (${this.settings.superRate || 12}%)`;
        }
        if (document.getElementById('setting-provider-details')) document.getElementById('setting-provider-details').value = this.settings.providerDetails || '';
        if (document.getElementById('setting-bank-details')) document.getElementById('setting-bank-details').value = this.settings.bankDetails || '';
        if (document.getElementById('setting-billed-to')) document.getElementById('setting-billed-to').value = this.settings.billedTo || '';
    },

    switchView(viewId) {
        document.querySelectorAll('.view').forEach(v => {
            v.classList.add('hidden');
            v.classList.remove('active');
        });
        const view = document.getElementById(`view-${viewId}`);
        if(view) {
            view.classList.remove('hidden');
            view.classList.add('active');
        }

        if (viewId === 'invoices') {
            this.renderInvoiceRecordsList();
        } else if (viewId === 'history') {
            this.renderInvoiceHistoryTable();
        } else if (viewId === 'tax') {
            this.populateTaxFYDropdown();
            this.renderTaxSummary();
        }
    },

    // --- Dashboard ---
    updateDashboard() {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const currentFY = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;

        let monthEarnings = 0;
        let monthSuper = 0;
        let fyEarnings = 0;
        let uninvoicedCount = 0;

        const recentUninvoiced = [];

        this.records.forEach(r => {
            const rDate = new Date(r.date);
            const rFY = rDate.getMonth() >= 6 ? rDate.getFullYear() : rDate.getFullYear() - 1;
            
            if (!r.invoiced) {
                uninvoicedCount++;
                if (recentUninvoiced.length < 5) { // get top 5
                    recentUninvoiced.push(r);
                }
            }

            const fin = this.getFinancials(r.price, r.feePct, r.discountCode);

            // Month Stats based on Date of Service
            if (rDate.getMonth() === currentMonth && rDate.getFullYear() === currentYear) {
                monthEarnings += fin.netPay;
                monthSuper += fin.superAmt;
            }

            // FY Stats based on Date of Service
            if (rFY === currentFY) {
                fyEarnings += fin.netPay;
            }
        });

        document.getElementById('dash-earnings-month').innerText = this.formatCurrency(monthEarnings);
        document.getElementById('dash-super-month').innerText = this.formatCurrency(monthSuper);
        if (document.getElementById('dash-earnings-fy')) {
            document.getElementById('dash-earnings-fy').innerText = this.formatCurrency(fyEarnings);
        }
        document.getElementById('dash-uninvoiced-count').innerText = uninvoicedCount;

        // Render Recent Uninvoiced in Dashboard
        const tbody = document.getElementById('dash-recent-records');
        tbody.innerHTML = '';
        recentUninvoiced.forEach(r => {
            const fin = this.getFinancials(r.price, r.feePct || (this.settings.feeRate || 30), r.discountCode);
            const childInfo = (r.childName || r.childAge) ? 
                `<br/><span class="text-muted" style="font-size:0.85em;">Child: ${r.childName || '-'}${r.childAge ? ` (Age: ${r.childAge})` : ''}</span>` : '';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${this.formatDate(r.date)}</td>
                <td>${r.client}${childInfo}</td>
                <td>${this.getServiceName(r.serviceId)}</td>
                <td><strong>${this.formatCurrency(fin.netPay)}</strong></td>
            `;
            tbody.appendChild(tr);
        });
    },

    // --- Services ---
    openServiceModal(id = null) {
        document.getElementById('service-id').value = '';
        document.getElementById('service-name').value = '';
        document.getElementById('service-price').value = '';
        document.getElementById('service-modal-title').innerText = 'Add Service';

        if (id) {
            const service = this.services.find(s => s.id === id);
            if (service) {
                document.getElementById('service-id').value = service.id;
                document.getElementById('service-name').value = service.name;
                document.getElementById('service-price').value = service.price;
                document.getElementById('service-modal-title').innerText = 'Edit Service';
            }
        }
        
        document.getElementById('service-modal-overlay').classList.remove('hidden');
    },

    async saveService(e) {
        e.preventDefault();
        const service = {
            id: document.getElementById('service-id').value || null,
            name: document.getElementById('service-name').value,
            price: document.getElementById('service-price').value
        };

        await db.saveService(service);
        await this.loadData();
        this.closeModal('service-modal-overlay');
    },

    async deleteService(id) {
        this.showConfirm("Are you sure you want to delete this service template?", async () => {
            await db.deleteService(id);
            await this.loadData();
        });
    },

    renderServicesTable() {
        const tbody = document.getElementById('services-table-body');
        tbody.innerHTML = '';
        this.services.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${s.name}</td>
                <td>${this.formatCurrency(s.price)}</td>
                <td>
                    <button class="btn-icon" onclick="app.openServiceModal('${s.id}')"><i data-lucide="edit"></i></button>
                    <button class="btn-icon text-danger" onclick="app.deleteService('${s.id}')"><i data-lucide="trash-2"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    getServiceName(id) {
        const s = this.services.find(srv => srv.id === id);
        return s ? s.name : 'Unknown Service';
    },

    // --- Records ---
    populateServiceDropdown() {
        const select = document.getElementById('record-service');
        // keep first option
        select.innerHTML = '<option value="">-- Select a Service --</option>';
        this.services.forEach(s => {
            select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
        });
    },

    openRecordModal(id = null) {
        document.getElementById('record-id').value = '';
        
        // Default to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('record-date').value = today;
        
        document.getElementById('record-client').value = '';
        document.getElementById('record-child-name').value = '';
        document.getElementById('record-child-age').value = '';
        document.getElementById('record-service').value = '';
        document.getElementById('record-price').value = '';
        document.getElementById('record-fee-pct').value = this.settings.feeRate || 30;
        if(document.getElementById('record-discount-code')) document.getElementById('record-discount-code').value = '';
        document.getElementById('record-modal-title').innerText = 'Add Record';

        this.calculateRecordPreview();

        if (id) {
            const r = this.records.find(rec => rec.id === id);
            if (r) {
                document.getElementById('record-id').value = r.id;
                document.getElementById('record-date').value = r.date;
                document.getElementById('record-client').value = r.client;
                document.getElementById('record-child-name').value = r.childName || '';
                document.getElementById('record-child-age').value = r.childAge || '';
                document.getElementById('record-service').value = r.serviceId;
                document.getElementById('record-price').value = r.price;
                document.getElementById('record-fee-pct').value = r.feePct ?? (this.settings.feeRate || 30);
                if(document.getElementById('record-discount-code')) document.getElementById('record-discount-code').value = r.discountCode || '';
                document.getElementById('record-modal-title').innerText = 'Edit Record';
                this.calculateRecordPreview();
            }
        }
        
        document.getElementById('record-modal-overlay').classList.remove('hidden');
    },

    autoFillServiceData() {
        const sId = document.getElementById('record-service').value;
        const s = this.services.find(srv => srv.id === sId);
        if (s) {
            document.getElementById('record-price').value = s.price;
            document.getElementById('record-fee-pct').value = s.feePct ?? (this.settings.feeRate || 30);
            this.calculateRecordPreview();
        }
    },

    calculateRecordPreview() {
        const p = document.getElementById('record-price').value;
        const f = document.getElementById('record-fee-pct').value;
        const dc = document.getElementById('record-discount-code');
        const fin = this.getFinancials(p, f, dc ? dc.value : '');

        document.getElementById('preview-total').innerText = this.formatCurrency(fin.effectivePrice);
        document.getElementById('preview-super').innerText = this.formatCurrency(fin.superAmt);
        document.getElementById('preview-pay').innerText = this.formatCurrency(fin.netPay);
    },

    async saveRecord(e) {
        e.preventDefault();
        const record = {
            id: document.getElementById('record-id').value || null,
            date: document.getElementById('record-date').value,
            client: document.getElementById('record-client').value,
            childName: document.getElementById('record-child-name').value,
            childAge: document.getElementById('record-child-age').value,
            serviceId: document.getElementById('record-service').value,
            price: document.getElementById('record-price').value,
            feePct: document.getElementById('record-fee-pct').value,
            discountCode: document.getElementById('record-discount-code') ? document.getElementById('record-discount-code').value : '',
            invoiced: false, // Default
            invoiceDate: null
        };

        if (record.id) {
            const existing = this.records.find(r => r.id === record.id);
            if (existing) {
                record.invoiced = existing.invoiced;
                record.invoiceDate = existing.invoiceDate;
            }
        }

        await db.saveRecord(record);
        await this.loadData();
        this.closeModal('record-modal-overlay');
    },

    async deleteRecord(id) {
        this.showConfirm("Are you sure you want to delete this record? This cannot be undone.", async () => {
            await db.deleteRecord(id);
            await this.loadData();
        });
    },

    renderRecordsTable() {
        const tbody = document.getElementById('records-table-body');
        tbody.innerHTML = '';
        this.records.forEach(r => {
            const fin = this.getFinancials(r.price, r.feePct, r.discountCode);

            const statusBadge = r.invoiced ?  
                `<span class="badge success">Invoiced</span>` : 
                `<span class="badge warning">Pending</span>`;

            const priceDisp = fin.discountCodeApplied ? 
                `<span style="text-decoration:line-through; color:#9ca3af; font-size:0.85em;">${this.formatCurrency(fin.basePrice)}</span><br/>${this.formatCurrency(fin.effectivePrice)} <span class="badge" style="background:#E0E7FF;color:#3730A3;font-size:0.7em;">${fin.discountCodeApplied}</span>` 
                : this.formatCurrency(fin.basePrice);

            const childInfo = (r.childName || r.childAge) ? 
                `<br/><span class="text-muted" style="font-size:0.85em;">Child: ${r.childName || '-'}${r.childAge ? ` (Age: ${r.childAge})` : ''}</span>` : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${this.formatDate(r.date)}</td>
                <td>${r.client}${childInfo}</td>
                <td>${this.getServiceName(r.serviceId)}</td>
                <td>${priceDisp}</td>
                <td>${r.feePct || (this.settings.feeRate || 30)}%</td>
                <td>${this.formatCurrency(fin.effectivePrice)}</td>
                <td>${this.formatCurrency(fin.superAmt)}</td>
                <td><strong class="highlight-text-small">${this.formatCurrency(fin.netPay)}</strong></td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-icon" onclick="app.openRecordModal('${r.id}')"><i data-lucide="edit"></i></button>
                    <button class="btn-icon text-danger" onclick="app.deleteRecord('${r.id}')"><i data-lucide="trash-2"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    // --- Invoices ---
    async populateInvoiceServiceFilter() {
        const filter = document.getElementById('inv-filter-service');
        if(!filter) return;
        filter.innerHTML = '<option value="">All Services</option>';
        if (this.services.length === 0) return;

        this.services.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.innerText = s.name;
            filter.appendChild(opt);
        });
    },

    renderInvoiceRecordsList() {
        const container = document.getElementById('invoice-records-body');
        if(!container) return;
        container.innerHTML = '';

        const sDate = document.getElementById('inv-filter-start').value;
        const eDate = document.getElementById('inv-filter-end').value;
        const sService = document.getElementById('inv-filter-service').value;

        let filtered = this.records.filter(r => !r.invoiced);

        if (sDate) {
            const start = new Date(sDate);
            start.setHours(0,0,0,0);
            filtered = filtered.filter(r => new Date(r.date) >= start);
        }
        if (eDate) {
            const end = new Date(eDate);
            end.setHours(23,59,59,999);
            filtered = filtered.filter(r => new Date(r.date) <= end);
        }
        if (sService) {
            filtered = filtered.filter(r => r.serviceId === sService);
        }

        filtered.sort((a,b) => new Date(a.date) - new Date(b.date));

        if(filtered.length === 0) {
            container.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:1rem;">No uninvoiced records match your filters.</td></tr>`;
            return;
        }

        filtered.forEach(r => {
            const rowFee = r.feePct || (this.settings.feeRate || 30);
            const fin = this.getFinancials(r.price, rowFee, r.discountCode);
            const isSelected = this.invoiceSelection.has(r.id);
            const serviceName = this.getServiceName(r.serviceId);

            let priceDisp = this.formatCurrency(fin.basePrice);
            if (fin.discountCodeApplied) {
                priceDisp = `<div style="display:flex; flex-direction:column; align-items:flex-start; gap:2px;">
                                <div style="display:flex; align-items:center; gap:4px;">
                                    <span style="text-decoration: line-through; opacity: 0.6; font-size: 0.8rem;">${this.formatCurrency(fin.basePrice)}</span> 
                                    <span style="color:var(--primary); font-weight:bold;">${this.formatCurrency(fin.effectivePrice)}</span>
                                </div>
                                <span class="badge" style="background:#E0E7FF;color:#3730A3; white-space:nowrap;">${fin.discountCodeApplied}</span>
                             </div>`;
            }

            const tr = document.createElement('tr');
            if (isSelected) tr.classList.add('selected-row');
            
            tr.innerHTML = `
                <td style="text-align:center;">
                    <input style="transform: scale(1.3); cursor: pointer;" type="checkbox" id="inv-chk-${r.id}" ${isSelected ? 'checked' : ''} onchange="app.toggleInvoiceSelection('${r.id}')">
                </td>
                <td>${this.formatDate(r.date)}</td>
                <td><strong>${r.client}</strong></td>
                <td>${serviceName}</td>
                <td>${priceDisp}</td>
            `;

            tr.addEventListener('click', (e) => {
                if(e.target.tagName !== 'INPUT') {
                    const chk = document.getElementById(`inv-chk-${r.id}`);
                    chk.checked = !chk.checked;
                    this.toggleInvoiceSelection(r.id);
                }
            });

            container.appendChild(tr);
        });
    },

    selectAllFilteredInvoices() {
        const sDate = document.getElementById('inv-filter-start').value;
        const eDate = document.getElementById('inv-filter-end').value;
        const sService = document.getElementById('inv-filter-service').value;

        let filtered = this.records.filter(r => !r.invoiced);

        if (sDate) {
            const start = new Date(sDate);
            start.setHours(0,0,0,0);
            filtered = filtered.filter(r => new Date(r.date) >= start);
        }
        if (eDate) {
            const end = new Date(eDate);
            end.setHours(23,59,59,999);
            filtered = filtered.filter(r => new Date(r.date) <= end);
        }
        if (sService) {
            filtered = filtered.filter(r => r.serviceId === sService);
        }

        filtered.forEach(r => this.invoiceSelection.add(r.id));
        this.renderInvoiceRecordsList();
        this.updateInvoiceSummary();
    },

    toggleInvoiceSelection(id) {
        if (this.invoiceSelection.has(id)) {
            this.invoiceSelection.delete(id);
        } else {
            this.invoiceSelection.add(id);
        }
        
        const chk = document.getElementById(`inv-chk-${id}`);
        if (chk) {
            const tr = chk.closest('tr');
            if (this.invoiceSelection.has(id)) {
                chk.checked = true;
                tr.classList.add('selected-row');
            } else {
                chk.checked = false;
                tr.classList.remove('selected-row');
            }
        }
        
        this.updateInvoiceSummary();
    },

    updateInvoiceSummary() {
        let totalCount = 0;
        let totalPrice = 0;
        let totalFee = 0;
        let totalGrossPay = 0;
        let totalPay = 0;
        let totalSuper = 0;

        const superRate = this.settings.superRate || 12;

        this.invoiceSelection.forEach(id => {
            const r = this.records.find(rec => rec.id === id);
            if (r) {
                totalCount++;
                const fin = this.getFinancials(r.price, r.feePct || (this.settings.feeRate || 30), r.discountCode);
                totalPrice += fin.effectivePrice;
                totalFee += fin.feeAmt;
            } else {
                this.invoiceSelection.delete(id);
            }
        });

        totalGrossPay = totalPrice - totalFee;
        totalSuper = totalGrossPay * (superRate / 100);
        totalPay = totalGrossPay - totalSuper;

        document.getElementById('inv-sel-count').innerText = totalCount;
        document.getElementById('inv-sel-price').innerText = this.formatCurrency(totalPrice);
        document.getElementById('inv-sel-fee').innerText = `-${this.formatCurrency(totalFee)}`;
        document.getElementById('inv-sel-subtotal').innerText = this.formatCurrency(totalGrossPay);
        document.getElementById('inv-sel-super').innerText = this.formatCurrency(totalSuper);
        document.getElementById('inv-sel-pay').innerText = this.formatCurrency(totalPay);

        document.getElementById('btn-generate-invoice').disabled = totalCount === 0;
    },

    async generateInvoice() {
        if (this.invoiceSelection.size === 0) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        let totalPrice = 0;
        let totalFee = 0;
        let totalGrossPay = 0;
        let totalPay = 0;
        let totalSuper = 0;
        const superRate = this.settings.superRate || 12;
        
        const tableData = [];
        
        const selectedIds = Array.from(this.invoiceSelection);
        const selectedRecords = this.records.filter(r => selectedIds.includes(r.id)).sort((a,b) => new Date(a.date) - new Date(b.date));

        selectedRecords.forEach(r => {
            const fin = this.getFinancials(r.price, r.feePct || (this.settings.feeRate || 30), r.discountCode);

            totalPrice += fin.effectivePrice;
            totalFee += fin.feeAmt;

            tableData.push([
                this.formatDate(r.date),
                r.client,
                this.getServiceName(r.serviceId),
                this.formatCurrency(fin.basePrice),
                fin.discountCodeApplied ? fin.discountCodeApplied.split(' ')[0] : '-',
                this.formatCurrency(fin.effectivePrice),
                `${r.feePct || (this.settings.feeRate || 30)}% (-${this.formatCurrency(fin.feeAmt)})`,
                this.formatCurrency(fin.grossPay)
            ]);
        });

        totalGrossPay = totalPrice - totalFee;
        totalSuper = totalGrossPay * (superRate / 100);
        totalPay = totalGrossPay - totalSuper;

        const invoiceId = 'INV-' + Date.now().toString().slice(-6);
        const dateStr = new Date().toLocaleDateString();

        const invoiceData = {
            id: invoiceId,
            date: new Date().toISOString(),
            dateStr: dateStr,
            providerDetails: this.settings.providerDetails || "Provider Name\nABN: 00 000 000 000",
            bankDetails: this.settings.bankDetails || "Bank Details\nBSB: 000-000\nACC: 000000",
            billedTo: this.settings.billedTo || "Billed To Details",
            tableData: tableData,
            summary: {
                totalPrice, totalFee, totalGrossPay, totalSuper, totalPay, superRate, feeRate: 'Mixed'
            },
            recordIds: selectedIds
        };

        this.createInvoicePDF(invoiceData);

        // Automatically mark as invoiced and save to history
        await db.saveInvoice(invoiceData);
        await db.markRecordsInvoiced(selectedIds);
        this.invoiceSelection.clear();
        await this.loadData();
        this.switchView('history');
    },

    createInvoicePDF(invoice) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l');

        // Header
        doc.setFontSize(26);
        doc.setTextColor(34, 34, 34);
        doc.setFont("helvetica", "bold");
        doc.text("INVOICE", 14, 22);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`Date: ${invoice.dateStr}`, 14, 32);
        doc.text(`Invoice #${invoice.id}`, 14, 37);

        // Billed To
        doc.setFont("helvetica", "bold");
        doc.setTextColor(34, 34, 34);
        doc.text("BILLED TO:", 14, 50);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        const billedToLines = doc.splitTextToSize(invoice.billedTo, 80);
        doc.text(billedToLines, 14, 55);

        // Provider Details
        doc.setFont("helvetica", "bold");
        doc.setTextColor(34, 34, 34);
        doc.text("FROM:", 200, 50);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        const providerLines = doc.splitTextToSize(invoice.providerDetails, 80);
        doc.text(providerLines, 200, 55);

        const startY = Math.max(55 + (billedToLines.length * 5), 55 + (providerLines.length * 5)) + 10;

        // Table
        doc.autoTable({
            startY: startY,
            head: [['Date', 'Client', 'Service', 'Base Price', 'Discount', 'Sub Total', 'Service Fee', 'Gross Pay']],
            body: invoice.tableData,
            theme: 'striped',
            headStyles: { fillColor: [63, 61, 86] },
            styles: { fontSize: 10, cellPadding: 4 }
        });

        const finalY = doc.lastAutoTable.finalY + 10;
        const sumX = 200;
        
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text("Summary:", sumX, finalY);
        doc.text(`Subtotal: ${this.formatCurrency(invoice.summary.totalPrice)}`, sumX, finalY + 6);
        doc.text(`Total Service Fees: -${this.formatCurrency(invoice.summary.totalFee)}`, sumX, finalY + 12);
        
        doc.setFontSize(12);
        doc.setTextColor(34, 34, 34);
        doc.setFont("helvetica", "bold");
        doc.text(`Gross Pay: ${this.formatCurrency(invoice.summary.totalGrossPay)}`, sumX, finalY + 20);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`Superannuation (${invoice.summary.superRate}%): ${this.formatCurrency(invoice.summary.totalSuper)}`, sumX, finalY + 26);

        doc.setFontSize(12);
        doc.setTextColor(34, 34, 34);
        doc.setFont("helvetica", "bold");
        doc.text(`Billed Total (Net Pay): ${this.formatCurrency(invoice.summary.totalPay)}`, sumX, finalY + 34);

        // Bank Details
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("PAYMENT DETAILS:", 14, finalY);
        doc.setFont("helvetica", "normal");
        const bankLines = doc.splitTextToSize(invoice.bankDetails, 80);
        doc.text(bankLines, 14, finalY + 5);

        doc.save(`${invoice.id}_${invoice.dateStr.replace(/\//g,'-')}.pdf`);
    },

    renderInvoiceHistoryTable() {
        const tbody = document.getElementById('history-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        if(this.invoices.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:1rem;">No invoices generated yet.</td></tr>`;
            return;
        }

        this.invoices.forEach(inv => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${this.formatDate(inv.date)}</td>
                <td><strong>${inv.id}</strong></td>
                <td><small>${inv.billedTo ? inv.billedTo.split('\n')[0] : 'N/A'}</small></td>
                <td><strong>${this.formatCurrency(inv.summary.totalPay)}</strong></td>
                <td>
                    <button class="btn-icon" onclick="app.downloadPastInvoice('${inv.id}')" title="Download PDF"><i data-lucide="download"></i></button>
                    <button class="btn-icon text-danger" onclick="app.deleteInvoice('${inv.id}')" title="Delete Ledger Entry"><i data-lucide="trash-2"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    },

    downloadPastInvoice(id) {
        const inv = this.invoices.find(i => i.id === id);
        if(inv) {
            this.createInvoicePDF(inv);
        }
    },

    async deleteInvoice(id) {
        this.showConfirm("Are you sure you want to delete this invoice from your history? The underlying service records will NOT be un-invoiced.", async () => {
            await db.deleteInvoice(id);
            await this.loadData();
            this.switchView('history');
        });
    },

    // --- Tax Summaries ---
    getFYString(dateStr) {
        const d = new Date(dateStr);
        if (d.getMonth() >= 6) {
            return `${d.getFullYear()}-${(d.getFullYear() + 1).toString().slice(-2)}`;
        } else {
            return `${d.getFullYear() - 1}-${d.getFullYear().toString().slice(-2)}`;
        }
    },

    populateTaxFYDropdown() {
        const select = document.getElementById('tax-fy-select');
        const fys = new Set();
        
        this.invoices.forEach(inv => {
            fys.add(this.getFYString(inv.date));
        });
        
        const sortedFys = Array.from(fys).sort((a,b) => b.localeCompare(a));
        
        select.innerHTML = '';
        if (sortedFys.length === 0) {
            select.innerHTML = '<option value="">No Invoice Data</option>';
            document.getElementById('btn-export-tax').disabled = true;
        } else {
            sortedFys.forEach(fy => {
                const opt = document.createElement('option');
                opt.value = fy;
                opt.innerText = `FY ${fy}`;
                select.appendChild(opt);
            });
            document.getElementById('btn-export-tax').disabled = false;
        }
    },

    renderTaxSummary() {
        const fy = document.getElementById('tax-fy-select').value;
        if (!fy) {
            document.getElementById('tax-gross').innerText = "$0.00";
            document.getElementById('tax-fees').innerText = "$0.00";
            document.getElementById('tax-super').innerText = "$0.00";
            document.getElementById('tax-net').innerText = "$0.00";
            document.getElementById('tax-monthly-body').innerHTML = '<tr><td colspan="6" class="text-center text-muted">No data.</td></tr>';
            return;
        }

        const fInvoices = this.invoices.filter(inv => this.getFYString(inv.date) === fy);
        const monthly = {};
        
        let gross = 0, fees = 0, superAmt = 0, net = 0;

        fInvoices.forEach(inv => {
            const invGross = inv.summary.totalPrice || 0;
            const invFee = inv.summary.totalFee || 0;
            const invSuper = inv.summary.totalSuper || 0;
            const invNet = inv.summary.totalPay || 0;
            
            gross += invGross;
            fees += invFee;
            superAmt += invSuper;
            net += invNet;
            
            const mData = new Date(inv.date);
            const mKey = mData.toLocaleDateString('en-AU', { month: 'short', year:'numeric' });
            
            if (!monthly[mKey]) monthly[mKey] = { key: mKey, rawMonth: mData.getMonth(), rawYear: mData.getFullYear(), count: 0, gross: 0, fee: 0, sup: 0, net: 0 };
            monthly[mKey].count += inv.recordIds ? inv.recordIds.length : 1;
            monthly[mKey].gross += invGross;
            monthly[mKey].fee += invFee;
            monthly[mKey].sup += invSuper;
            monthly[mKey].net += invNet;
        });

        document.getElementById('tax-gross').innerText = this.formatCurrency(gross);
        document.getElementById('tax-fees').innerText = `-${this.formatCurrency(fees)}`;
        document.getElementById('tax-super').innerText = this.formatCurrency(superAmt);
        document.getElementById('tax-net').innerText = this.formatCurrency(net);

        const mBody = document.getElementById('tax-monthly-body');
        mBody.innerHTML = '';
        
        const sortedMonths = Object.values(monthly).sort((a,b) => {
            if (a.rawYear !== b.rawYear) return a.rawYear - b.rawYear;
            return a.rawMonth - b.rawMonth;
        });
        
        if (sortedMonths.length === 0) {
            mBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No invoices generated in this FY.</td></tr>';
            return;
        }

        sortedMonths.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${m.key}</strong></td>
                <td>${m.count}</td>
                <td>${this.formatCurrency(m.gross)}</td>
                <td>-${this.formatCurrency(m.fee)}</td>
                <td>${this.formatCurrency(m.sup)}</td>
                <td><strong>${this.formatCurrency(m.net)}</strong></td>
            `;
            mBody.appendChild(tr);
        });
    },

    generateTaxStatementPDF() {
        const fy = document.getElementById('tax-fy-select').value;
        if (!fy) return;

        const fInvoices = this.invoices.filter(inv => this.getFYString(inv.date) === fy);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(22);
        doc.setTextColor(34, 34, 34);
        doc.setFont("helvetica", "bold");
        doc.text(`FINANCIAL YEAR STATEMENT`, 14, 22);
        
        doc.setFontSize(12);
        doc.setTextColor(80, 80, 80);
        doc.setFont("helvetica", "normal");
        doc.text(`Financial Year: ${fy}`, 14, 30);
        doc.text(`Generated: ${new Date().toLocaleDateString('en-AU')}`, 14, 35);
        
        doc.setFont("helvetica", "bold");
        doc.text("PROVIDER DETAILS:", 14, 50);
        doc.setFont("helvetica", "normal");
        const providerLines = doc.splitTextToSize(this.settings.providerDetails || "", 80);
        doc.text(providerLines, 14, 55);

        let gross = 0, fees = 0, superAmt = 0, net = 0;
        const monthly = {};
        
        fInvoices.forEach(inv => {
            const invGross = inv.summary.totalPrice || 0;
            const invFee = inv.summary.totalFee || 0;
            const invSuper = inv.summary.totalSuper || 0;
            const invNet = inv.summary.totalPay || 0;
            
            gross += invGross;
            fees += invFee;
            superAmt += invSuper;
            net += invNet;
            
            const mData = new Date(inv.date);
            const mKey = mData.toLocaleDateString('en-AU', { month: 'short', year:'numeric' });
            
            if (!monthly[mKey]) monthly[mKey] = { key: mKey, rawMonth: mData.getMonth(), rawYear: mData.getFullYear(), count: 0, gross: 0, fee: 0, sup: 0, net: 0 };
            monthly[mKey].count += inv.recordIds ? inv.recordIds.length : 1;
            monthly[mKey].gross += invGross;
            monthly[mKey].fee += invFee;
            monthly[mKey].sup += invSuper;
            monthly[mKey].net += invNet;
        });

        const sortedMonths = Object.values(monthly).sort((a,b) => {
            if (a.rawYear !== b.rawYear) return a.rawYear - b.rawYear;
            return a.rawMonth - b.rawMonth;
        });
        
        const tableData = [];
        sortedMonths.forEach(m => {
            tableData.push([
                m.key,
                m.count.toString(),
                this.formatCurrency(m.gross),
                `-${this.formatCurrency(m.fee)}`,
                this.formatCurrency(m.sup),
                this.formatCurrency(m.net)
            ]);
        });
        
        tableData.push([
            'TOTAL',
            '-',
            this.formatCurrency(gross),
            `-${this.formatCurrency(fees)}`,
            this.formatCurrency(superAmt),
            this.formatCurrency(net)
        ]);
        
        let startY = 55 + (providerLines.length * 5) + 10;
        
        doc.autoTable({
            startY: startY,
            head: [['Month', 'Invoiced Records', 'Gross Income', 'Service Fees', 'Super', 'Net Pay']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [63, 61, 86] },
            styles: { fontSize: 10, cellPadding: 4 },
            willDrawCell: function(data) {
                if(data.row.index === tableData.length - 1) { // total row highlight
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(34, 34, 34);
                }
            }
        });
        
        doc.save(`Tax_Statement_FY${fy.replace('-', '_')}.pdf`);
    },

    // --- Settings / Backup ---
    async saveSettings() {
        const rate = parseFloat(document.getElementById('setting-super-rate').value) || 12;
        const feeRate = parseFloat(document.getElementById('setting-fee-rate').value) || 30;
        this.settings.superRate = rate;
        this.settings.feeRate = feeRate;
        
        if (document.getElementById('setting-provider-details')) {
            this.settings.providerDetails = document.getElementById('setting-provider-details').value;
            this.settings.bankDetails = document.getElementById('setting-bank-details').value;
            this.settings.billedTo = document.getElementById('setting-billed-to').value;
        }

        await db.saveSettings(this.settings);
        
        const msg = document.getElementById('settings-save-msg');
        if (msg) {
            msg.classList.remove('hidden');
            setTimeout(() => msg.classList.add('hidden'), 3000);
        }
        
        const configMsg = document.getElementById('config-save-msg');
        if (configMsg) {
            configMsg.classList.remove('hidden');
            setTimeout(() => configMsg.classList.add('hidden'), 3000);
        }
        
        await this.loadData();
    },

    async exportDatabase() {
        await db.exportData();
    },

    importDatabase(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const success = await db.importData(event.target.result);
            if (success) {
                alert("Data imported successfully!");
                await this.loadData();
            } else {
                alert("Failed to import data. Please check the file format.");
            }
            e.target.value = '';
        };
        reader.readAsText(file);
    },

    // --- Utils ---
    getFinancials(basePrice, feePct, discountCode) {
        let price = parseFloat(basePrice) || 0;
        let pFeePct = parseFloat(feePct) || 0;
        
        let effectivePrice = price;
        let discountCodeApplied = '';
        if (discountCode) {
            if (discountCode.trim().toUpperCase() === 'TPAV') {
                effectivePrice = price * 0.9;
                discountCodeApplied = 'TPAV (10%)';
            } else if (discountCode.trim().toUpperCase() === 'FAMILY') {
                effectivePrice = price * 0.9;
                discountCodeApplied = 'Family (10%)';
            }
        }

        let feeAmt = effectivePrice * (pFeePct / 100);
        let grossPay = effectivePrice - feeAmt;
        let superRate = this.settings.superRate || 12;
        let superAmt = grossPay - (grossPay / (1 + superRate / 100));
        let netPay = grossPay - superAmt;

        return { basePrice: price, effectivePrice, feeAmt, grossPay, netPay, superAmt, discountCodeApplied };
    },

    closeModal(id) {
        document.getElementById(id).classList.add('hidden');
    },

    showConfirm(message, onConfirm) {
        document.getElementById('confirm-modal-message').innerText = message;
        const btn = document.getElementById('confirm-modal-btn');
        
        // Use a new button to clear old event listeners
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', () => {
            onConfirm();
            this.closeModal('confirm-modal-overlay');
        });
        
        document.getElementById('confirm-modal-overlay').classList.remove('hidden');
    },

    formatCurrency(value) {
        // Handle undefined or strings
        const num = parseFloat(value) || 0;
        return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(num);
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
