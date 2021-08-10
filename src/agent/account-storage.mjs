import { readdir, mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import AppConfig from '../config.mjs';

import Account from './account.mjs';


export default class AccountStorage {
    _config = {
        datadir: null,
    };

    constructor(config) {
        this._config = Object.assign({
            datadir: path.join(AppConfig.dirs.data, 'accounts'),
        }, config);
    }

    getDefaultAccountRefPath() {
        const { datadir } = this._config;
        return path.join(datadir, '.default');
    }

    getAccountPath(id) {
        const { datadir } = this._config;
        return path.join(datadir, id);
    }

    getAccountConfigPath(id) {
        return path.join(this.getAccountPath(id), '.config');
    }

    getAccountInformationPath(id) {
        return path.join(this.getAccountPath(id), '.config', 'account.json');
    }

    getAccountPublicPath(id) {
        return path.join(this.getAccountPath(id), 'public');
    }

    async listAccounts() {
        const { datadir } = this._config;
        await mkdir(datadir, { recursive: true });

        const accounts = (await readdir(datadir, { withFileTypes: true }))
            .filter(file => !file.name.startsWith('.'))
            .filter(file => file.isDirectory())
            .map(file => file.name);

        return accounts.map(id => ({ id }));
    }

    async getDefaultAccount(creator) {
        let defaultAccount;
        try {
            defaultAccount = await readFile(this.getDefaultAccountRefPath(), 'utf-8');
        } catch (err) { }

        const accounts = await this.listAccounts();
        if (accounts.length > 0) {
            defaultAccount = accounts[0].id;
            await this.setDefaultAccount(defaultAccount);
        } else if (creator) {
            const account = creator();
            await this.saveAccount(account);
            defaultAccount = account.id;
            await this.setDefaultAccount(defaultAccount);
        }

        return defaultAccount;
    }

    async getDefaultAccountOrSetOneFrom(accounts) {
        const defaultAccount = await this.getDefaultAccount();
        if (!accounts.find(id => id === defaultAccount)) {
            defaultAccount = accounts[0];
            await this.setDefaultAccount(defaultAccount);
        }
        return defaultAccount;
    }

    async setDefaultAccount(id) {
        return await writeFile(this.getDefaultAccountRefPath(), id);
    }

    async loadAccountInformation(id) {
        return JSON.parse(await readFile(this.getAccountInformationPath(id)));
    }

    async saveAccountInformation(id, data) {
        const filepath = this.getAccountInformationPath(id);
        await mkdir(path.dirname(filepath), { recursive: true });
        await writeFile(filepath, JSON.stringify(data));
    }

    async loadAccount(id) {
        if (!id) id = await this.getDefaultAccount();

        const data = await this.loadAccountInformation(id);
        return Account.fromJSON(data);
    }

    async saveAccount(account) {
        const data = account.toJSON();
        await this.saveAccountInformation(account.id, data);
        await mkdir(this.getAccountPublicPath(account.id), { recursive: true });
    }
}