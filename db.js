/* db.js — Supabase cloud database layer
   Replaces localforage with Supabase PostgreSQL.
   All data is scoped to the authenticated user (auth.uid()).
*/
const db = {

    /* ── Auth helpers ─────────────────────────── */

    async getUser() {
        const { data: { user } } = await _supabase.auth.getUser();
        return user;
    },

    async signInWithGoogle() {
        const { error } = await _supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.href }
        });
        if (error) console.error('Google sign-in error:', error.message);
    },

    async signOut() {
        await _supabase.auth.signOut();
        window.location.reload();
    },

    /* ── Init ─────────────────────────────────── */

    async init() {
        // Auth session is managed by Supabase SDK — nothing extra needed
    },

    /* ── Settings ────────────────────────────── */

    async getSettings() {
        const user = await this.getUser();
        if (!user) return { superRate: 12, feeRate: 30 };

        const { data, error } = await _supabase
            .from('settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (error || !data) return { superRate: 12, feeRate: 30 };

        return {
            superRate:       data.super_rate      ?? 12,
            feeRate:         data.fee_rate         ?? 30,
            providerDetails: data.provider_details ?? '',
            bankDetails:     data.bank_details     ?? '',
            billedTo:        data.billed_to        ?? '',
            lastBackupDate:  data.last_backup_date ?? null,
        };
    },

    async saveSettings(settings) {
        const user = await this.getUser();
        if (!user) return;

        await _supabase.from('settings').upsert({
            user_id:          user.id,
            super_rate:       settings.superRate       ?? 12,
            fee_rate:         settings.feeRate          ?? 30,
            provider_details: settings.providerDetails ?? '',
            bank_details:     settings.bankDetails     ?? '',
            billed_to:        settings.billedTo        ?? '',
            last_backup_date: settings.lastBackupDate  ?? null,
        }, { onConflict: 'user_id' });
    },

    /* ── Services ────────────────────────────── */

    async getServices() {
        const user = await this.getUser();
        if (!user) return [];

        const { data, error } = await _supabase
            .from('services')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });

        if (error) { console.error(error); return []; }
        return (data || []).map(s => ({
            id:      s.id,
            name:    s.name,
            price:   s.price,
            feePct:  s.fee_pct,
        }));
    },

    async saveService(service) {
        const user = await this.getUser();
        if (!user) return;

        const row = {
            user_id: user.id,
            name:    service.name,
            price:   service.price,
            fee_pct: service.feePct ?? null,
        };

        if (service.id) {
            await _supabase.from('services').upsert({ id: service.id, ...row }, { onConflict: 'id' });
        } else {
            const { data } = await _supabase.from('services').insert(row).select().single();
            service.id = data?.id;
        }
    },

    async deleteService(id) {
        await _supabase.from('services').delete().eq('id', id);
    },

    /* ── Records ─────────────────────────────── */

    async getRecords() {
        const user = await this.getUser();
        if (!user) return [];

        const { data, error } = await _supabase
            .from('records')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false });

        if (error) { console.error(error); return []; }
        return (data || []).map(r => ({
            id:            r.id,
            date:          r.date,
            client:        r.client,
            childName:     r.child_name   ?? '',
            childAge:      r.child_age    ?? '',
            serviceId:     r.service_id   ?? '',
            price:         r.price,
            feePct:        r.fee_pct,
            discountCode:  r.discount_code ?? '',
            invoiced:      r.invoiced      ?? false,
            invoiceDate:   r.invoice_date  ?? null,
        }));
    },

    async saveRecord(record) {
        const user = await this.getUser();
        if (!user) return;

        const row = {
            user_id:       user.id,
            date:          record.date,
            client:        record.client,
            child_name:    record.childName    ?? '',
            child_age:     record.childAge     ?? '',
            service_id:    record.serviceId    ?? null,
            price:         record.price,
            fee_pct:       record.feePct       ?? null,
            discount_code: record.discountCode ?? '',
            invoiced:      record.invoiced     ?? false,
            invoice_date:  record.invoiceDate  ?? null,
        };

        if (record.id) {
            await _supabase.from('records').upsert({ id: record.id, ...row }, { onConflict: 'id' });
        } else {
            const { data } = await _supabase.from('records').insert(row).select().single();
            record.id = data?.id;
        }
    },

    async deleteRecord(id) {
        await _supabase.from('records').delete().eq('id', id);
    },

    async markRecordsInvoiced(ids) {
        if (!ids || ids.length === 0) return;
        await _supabase
            .from('records')
            .update({ invoiced: true, invoice_date: new Date().toISOString() })
            .in('id', ids);
    },

    /* ── Invoices ────────────────────────────── */

    async getInvoices() {
        const user = await this.getUser();
        if (!user) return [];

        const { data, error } = await _supabase
            .from('invoices')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false });

        if (error) { console.error(error); return []; }
        return (data || []).map(i => ({
            id:              i.id,
            date:            i.date,
            dateStr:         i.date_str,
            billingPeriod:   i.billing_period   ?? null,
            providerDetails: i.provider_details ?? '',
            bankDetails:     i.bank_details     ?? '',
            billedTo:        i.billed_to        ?? '',
            tableData:       i.table_data       ?? [],
            summary:         i.summary          ?? {},
            recordIds:       i.record_ids       ?? [],
        }));
    },

    async saveInvoice(invoice) {
        const user = await this.getUser();
        if (!user) return;

        await _supabase.from('invoices').upsert({
            id:               invoice.id,
            user_id:          user.id,
            date:             invoice.date,
            date_str:         invoice.dateStr,
            billing_period:   invoice.billingPeriod   ?? null,
            provider_details: invoice.providerDetails ?? '',
            bank_details:     invoice.bankDetails     ?? '',
            billed_to:        invoice.billedTo        ?? '',
            table_data:       invoice.tableData       ?? [],
            summary:          invoice.summary         ?? {},
            record_ids:       invoice.recordIds       ?? [],
        }, { onConflict: 'id' });
    },

    async deleteInvoice(id) {
        await _supabase.from('invoices').delete().eq('id', id);
    },

    /* ── Clients ─────────────────────────────── */

    async getClients() {
        const user = await this.getUser();
        if (!user) return [];

        const { data, error } = await _supabase
            .from('clients')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) { console.error(error); return []; }
        return (data || []).map(c => ({
            id:          c.id,
            parentName:  c.parent_name,
            childName:   c.child_name,
            childAge:    c.child_age,
            packageType: c.package_type,
            startDate:   c.start_date,
            endDate:     c.end_date,
            status:      c.status,
            keyGoals:    c.key_goals,
            createdAt:   c.created_at
        }));
    },

    async saveClient(client) {
        const user = await this.getUser();
        if (!user) return;

        const { data, error } = await _supabase.from('clients').upsert({
            id:           client.id,
            user_id:      user.id,
            parent_name:  client.parentName,
            child_name:   client.childName,
            child_age:    client.childAge,
            package_type: client.packageType,
            start_date:   client.startDate,
            end_date:     client.endDate,
            status:       client.status || 'Active',
            key_goals:    client.keyGoals || '',
            created_at:   client.createdAt || new Date().toISOString()
        }, { onConflict: 'id' }).select();
        if (error) {
            console.error('Supabase Error:', error);
            alert("Database Error: " + error.message);
        }
        return data ? data[0] : null;
    },

    async deleteClient(id) {
        await _supabase.from('clients').delete().eq('id', id);
        // Also delete associated interactions
        await _supabase.from('interactions').delete().eq('client_id', id);
    },

    /* ── Interactions ────────────────────────── */

    async getInteractions(clientId = null) {
        const user = await this.getUser();
        if (!user) return [];

        let query = _supabase
            .from('interactions')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false });
            
        if (clientId) {
            query = query.eq('client_id', clientId);
        }

        const { data, error } = await query;

        if (error) { console.error(error); return []; }
        return (data || []).map(i => ({
            id:       i.id,
            clientId: i.client_id,
            date:     i.date,
            category: i.category,
            notes:    i.notes,
            author:   i.author
        }));
    },

    async saveInteraction(interaction) {
        const user = await this.getUser();
        if (!user) return;

        await _supabase.from('interactions').upsert({
            id:        interaction.id,
            user_id:   user.id,
            client_id: interaction.clientId,
            date:      interaction.date,
            category:  interaction.category,
            notes:     interaction.notes,
            author:    interaction.author || 'Me'
        }, { onConflict: 'id' });
    },

    async deleteInteraction(id) {
        await _supabase.from('interactions').delete().eq('id', id);
    },

    /* ── Export (local backup download) ─────── */

    async exportData() {
        const data = {
            settings:     await this.getSettings(),
            services:     await this.getServices(),
            clients:      await this.getClients(),
            records:      await this.getRecords(),
            invoices:     await this.getInvoices(),
            interactions: await this.getInteractions(),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `sleep-records-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    async importData(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            if (data.settings)     await this.saveSettings(data.settings);
            if (data.services)     for (const s of data.services)     await this.saveService(s);
            if (data.clients)      for (const c of data.clients)      await this.saveClient(c);
            if (data.records)      for (const r of data.records)      await this.saveRecord(r);
            if (data.invoices)     for (const i of data.invoices)     await this.saveInvoice(i);
            if (data.interactions) for (const x of data.interactions) await this.saveInteraction(x);
            return true;
        } catch (e) {
            console.error('Import failed', e);
            return false;
        }
    },
};
