/* ============================================
   Renato Stolarija – Korisnici (Admin modul)
   Upravljanje korisnicima – samo za admina
   ============================================ */

(function () {
    'use strict';

    const Korisnici = {
        init() {
            document.addEventListener('module:shown', (e) => {
                if (e.detail.module === 'users') this.render();
            });
            // Navigacija iz Više menija
            document.querySelectorAll('.menu-item[data-target="users"]').forEach(btn => {
                btn.addEventListener('click', () => App.Nav.show('users'));
            });
        },

        render() {
            // Sigurnosna provjera: samo admin smije vidjeti ovaj modul
            if (!App.Auth.isAdmin()) {
                App.Nav.show('dashboard');
                return;
            }
            const root = document.getElementById('users-content');
            if (!root) return;
            root.innerHTML = '<p class="placeholder-hint">Učitavanje...</p>';
            this._fetchAndRender(root);
        },

        async _fetchAndRender(root) {
            let users = [];
            try {
                users = await App.Api.apiCall('GET', '/users');
            } catch (e) {
                root.innerHTML = '<p class="placeholder-hint">Greška pri učitavanju korisnika.</p>';
                return;
            }

            const currentId = App.Auth.currentUser()?.id;

            root.innerHTML = `
                <div class="users-toolbar">
                    <button type="button" class="btn btn-primary" id="users-add-btn">+ Novi korisnik</button>
                </div>
                <div id="users-form-container"></div>
                <div class="users-list" id="users-list"></div>
            `;

            this._renderList(root, users, currentId);

            root.querySelector('#users-add-btn').addEventListener('click', () => {
                this._showForm(null, root, users, currentId);
            });
        },

        _renderList(root, users, currentId) {
            const listEl = root.querySelector('#users-list');
            if (!listEl) return;
            if (!users.length) {
                listEl.innerHTML = '<p class="placeholder-hint">Nema korisnika.</p>';
                return;
            }
            listEl.innerHTML = users.map(u => this._renderCard(u, currentId)).join('');

            listEl.querySelectorAll('.user-edit-btn').forEach(btn => {
                const id = btn.dataset.id;
                btn.addEventListener('click', () => {
                    const user = users.find(u => u.id === id);
                    this._showForm(user, root, users, currentId);
                });
            });

            listEl.querySelectorAll('.user-delete-btn').forEach(btn => {
                const id = btn.dataset.id;
                btn.addEventListener('click', () => this._deleteUser(id, root));
            });
        },

        _renderCard(user, currentId) {
            const isMe = user.id === currentId;
            const roleBadge = user.role === 'admin'
                ? '<span class="user-role-badge user-role-admin">Admin</span>'
                : '<span class="user-role-badge user-role-user">Korisnik</span>';
            const meLabel = isMe ? ' <span class="user-me-label">(ti)</span>' : '';
            return `
                <div class="user-card">
                    <div class="user-card-info">
                        <div class="user-card-name">${this._esc(user.display_name)}${meLabel}</div>
                        <div class="user-card-username">@${this._esc(user.username)}</div>
                        ${roleBadge}
                    </div>
                    <div class="user-card-actions">
                        <button type="button" class="btn btn-secondary user-edit-btn"
                                data-id="${user.id}">Uredi</button>
                        ${!isMe
                            ? `<button type="button" class="btn btn-danger user-delete-btn"
                                       data-id="${user.id}">Obriši</button>`
                            : ''}
                    </div>
                </div>
            `;
        },

        _showForm(user, root, users, currentId) {
            const isNew = !user;
            const fc = root.querySelector('#users-form-container');
            fc.innerHTML = `
                <form id="user-form" class="user-form card">
                    <h3 class="user-form-title">${isNew ? 'Novi korisnik' : 'Uredi korisnika'}</h3>
                    <div class="form-group">
                        <label class="form-label" for="uf-username">Korisničko ime</label>
                        <input type="text" id="uf-username" class="form-input"
                               value="${isNew ? '' : this._esc(user.username)}"
                               autocomplete="off"
                               ${isNew ? 'required' : 'readonly'}>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="uf-display">Ime za prikaz</label>
                        <input type="text" id="uf-display" class="form-input"
                               value="${isNew ? '' : this._esc(user.display_name)}"
                               autocomplete="off" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="uf-password">
                            ${isNew ? 'Lozinka' : 'Nova lozinka (prazno = bez promjene)'}
                        </label>
                        <input type="password" id="uf-password" class="form-input"
                               autocomplete="new-password"
                               ${isNew ? 'minlength="8" required' : ''}>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="uf-role">Uloga</label>
                        <select id="uf-role" class="form-input">
                            <option value="user" ${!user || user.role !== 'admin' ? 'selected' : ''}>Korisnik</option>
                            <option value="admin" ${user && user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                    </div>
                    <div id="uf-error" class="form-error hidden"></div>
                    <div class="user-form-btns">
                        <button type="submit" class="btn btn-primary">Spremi</button>
                        <button type="button" class="btn btn-secondary" id="uf-cancel">Odustani</button>
                    </div>
                </form>
            `;

            fc.querySelector('#uf-cancel').addEventListener('click', () => {
                fc.innerHTML = '';
            });

            fc.querySelector('#user-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                await this._saveUser(isNew, user, fc, root);
            });
        },

        async _saveUser(isNew, user, fc, root) {
            const errEl = fc.querySelector('#uf-error');
            errEl.classList.add('hidden');
            const btn = fc.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Spremanje...';

            const data = {
                display_name: fc.querySelector('#uf-display').value.trim(),
                role:         fc.querySelector('#uf-role').value,
            };
            const pw = fc.querySelector('#uf-password').value;
            if (isNew) {
                data.username = fc.querySelector('#uf-username').value.trim();
                data.password = pw;
            } else if (pw) {
                data.password = pw;
            }

            try {
                if (isNew) {
                    await App.Api.apiCall('POST', '/users', data);
                } else {
                    await App.Api.apiCall('PUT', '/users/' + user.id, data);
                }
                fc.innerHTML = '';
                // Osvježi popis i globalni cache
                await App.Users.fetchUsers();
                this._fetchAndRender(root);
            } catch (err) {
                const msg = err.message === 'username_exists'
                    ? 'Korisničko ime već postoji.'
                    : 'Greška pri spremanju.';
                errEl.textContent = msg;
                errEl.classList.remove('hidden');
                btn.disabled = false;
                btn.textContent = 'Spremi';
            }
        },

        async _deleteUser(id, root) {
            if (!confirm('Stvarno obrisati ovog korisnika?')) return;
            try {
                await App.Api.apiCall('DELETE', '/users/' + id);
                await App.Users.fetchUsers();
                this._fetchAndRender(root);
            } catch (err) {
                alert('Greška pri brisanju: ' + err.message);
            }
        },

        _esc(s) {
            if (s === null || s === undefined) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    };

    document.addEventListener('DOMContentLoaded', () => Korisnici.init());
    window.App = window.App || {};
    window.App.Korisnici = Korisnici;
}());
