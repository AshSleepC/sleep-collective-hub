/* db.js - Database layer encapsulating localforage */
const db = {
    async init() {
        localforage.config({
            name: 'SleepCollectiveRecords'
        });
        // Ensure default settings
        let settings = await localforage.getItem('settings');
        if (!settings) {
            await localforage.setItem('settings', { superRate: 12, feeRate: 30 });
        }
        
        let services = await localforage.getItem('services');
        if (!services) await localforage.setItem('services', []);
        
        let records = await localforage.getItem('records');
        if (!records) await localforage.setItem('records', []);
        
        let invoices = await localforage.getItem('invoices');
        if (!invoices) await localforage.setItem('invoices', []);
    },

    // Settings
    async getSettings() {
        return await localforage.getItem('settings');
    },
    async saveSettings(settings) {
        await localforage.setItem('settings', settings);
    },

    // Services
    async getServices() {
        return await localforage.getItem('services') || [];
    },
    async saveService(service) {
        let services = await this.getServices();
        if (service.id) {
            let index = services.findIndex(s => s.id === service.id);
            if (index !== -1) services[index] = service;
            else services.push(service);
        } else {
            service.id = Date.now().toString();
            services.push(service);
        }
        await localforage.setItem('services', services);
    },
    async deleteService(id) {
        let services = await this.getServices();
        services = services.filter(s => s.id !== id);
        await localforage.setItem('services', services);
    },

    // Records
    async getRecords() {
        let records = await localforage.getItem('records') || [];
        // sort by date desc
        records.sort((a,b) => new Date(b.date) - new Date(a.date));
        return records;
    },
    async saveRecord(record) {
        let records = await this.getRecords();
        if (record.id) {
            let index = records.findIndex(r => r.id === record.id);
            if (index !== -1) records[index] = record;
            else records.push(record);
        } else {
            record.id = Date.now().toString();
            records.push(record);
        }
        await localforage.setItem('records', records);
    },
    async deleteRecord(id) {
        let records = await this.getRecords();
        records = records.filter(r => r.id !== id);
        await localforage.setItem('records', records);
    },
    async markRecordsInvoiced(ids) {
        let records = await this.getRecords();
        for (let r of records) {
            if (ids.includes(r.id)) {
                r.invoiced = true;
                r.invoiceDate = new Date().toISOString();
            }
        }
        await localforage.setItem('records', records);
    },

    // Invoices
    async getInvoices() {
        let invoices = await localforage.getItem('invoices') || [];
        invoices.sort((a,b) => new Date(b.date) - new Date(a.date));
        return invoices;
    },
    async saveInvoice(invoice) {
        let invoices = await this.getInvoices();
        if (invoice.id && invoices.some(i => i.id === invoice.id)) {
            let index = invoices.findIndex(i => i.id === invoice.id);
            invoices[index] = invoice;
        } else {
            if (!invoice.id) invoice.id = 'INV-' + Date.now().toString().slice(-6);
            invoices.push(invoice);
        }
        await localforage.setItem('invoices', invoices);
    },
    async deleteInvoice(id) {
        let invoices = await this.getInvoices();
        invoices = invoices.filter(i => i.id !== id);
        await localforage.setItem('invoices', invoices);
    },

    // Export & Import Backup
    async exportData() {
        const data = {
            settings: await this.getSettings(),
            services: await this.getServices(),
            records: await this.getRecords(),
            invoices: await this.getInvoices()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sleep-records-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
    async importData(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            if (data.settings) await localforage.setItem('settings', data.settings);
            if (data.services) await localforage.setItem('services', data.services);
            if (data.records) await localforage.setItem('records', data.records);
            if (data.invoices) await localforage.setItem('invoices', data.invoices);
            return true;
        } catch (e) {
            console.error("Import failed", e);
            return false;
        }
    }
};
