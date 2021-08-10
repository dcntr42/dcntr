#!/usr/bin/env node

import { Command } from 'commander/esm.mjs';
import chokidar from 'chokidar';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

import { Agent, EmptyPublishError as AgentEmptyPublishError } from './agent/index.mjs';
import Bridge from './bridge/index.mjs';
import Tray from './gui.mjs';

import Account from './agent/account.mjs';
import AccountStorage from './agent/account-storage.mjs';
import Resolver from './agent/resolver.mjs';
import AppConfig from './config.mjs';


AppConfig.init({
    name: 'dcntr',
    tld: 'dcntr',
    port: 32687,
});

const app = new Command();

const accounts = app
    .command('account')
    .description('account management commands');

accounts
    .command('list')
    .description('list accounts')
    .action(async (options) => {
        try {
            const accountStorage = new AccountStorage();
            const accounts = await accountStorage.listAccounts();
            accounts.forEach(account => console.log(`- ${account.id}`));
        } catch (err) {
            console.error('Could not list accounts.', err);
        }
    });

accounts
    .command('create')
    .description('create account')
    .action(async (options) => {
        try {
            const accountStorage = new AccountStorage();
            const account = Account.create();
            await accountStorage.saveAccount(account);
            console.log(`account created: ${account.id}`);
        } catch (err) {
            console.error('Could not create account.', err);
        }
    });

accounts
    .command('explore [account]')
    .description('explore account files')
    .action(async (id, options) => {
        try {
            const accountStorage = new AccountStorage();
            id = id || await accountStorage.getDefaultAccount();
            const accountPath = accountStorage.getAccountPath(id);
            console.log(`exploring account files at ${accountPath}`);
            open(accountPath);
        } catch (err) {
            console.error('Could not open account folder.', err);
        }
    });


app
    .command('bridge')
    .description('bridge access to dcntr network')
    .action(async () => {
        try {
            await setupAndRun();
        } catch (err) {
            console.error('Could not setup bridge.', err);
        }
    });


app
    .command('gui', { isDefault: true })
    .description('graphical user interface')
    .action(async () => {
        try {
            const ConsoleWindow = await import('node-hide-console-window');
            ConsoleWindow.hideConsole();
            process.on('exit', () => ConsoleWindow.showConsole());
        } catch (err) { }

        try {
            const { accountStorage } = await setupAndRun();

            const tray = new Tray();
            const __dirname = path.dirname(fileURLToPath(import.meta.url));
            const icon = (process.platform == 'win32')
                ? path.join(__dirname, `../assets/icons/icon.ico`)
                : path.join(__dirname, `../assets/icons/icon.png`);

            await tray.init({
                icon,
                accounts: await Promise.all((await accountStorage.listAccounts()).map(async ({ id }) => ({
                    id,
                    publicPath: accountStorage.getAccountPublicPath(id),
                    url: `http://${Resolver.getHostnameFromAccount(await accountStorage.loadAccount(id))}.${AppConfig.tld}.localhost:${AppConfig.port}`,
                }))),
            });
        } catch (err) {
            console.error('Could not setup tray application.', err);
        }
    });

async function setupAndRun() {
    const agent = new Agent();

    const bridge = Bridge(agent);
    bridge.listen(AppConfig.port, '127.0.0.1');
    console.log(`listen on http://${AppConfig.tld}.localhost:${AppConfig.port}`);

    const accountStorage = new AccountStorage();

    const defaultAccount = await accountStorage.getDefaultAccount(() => {
        open(`http://${AppConfig.tld}.localhost:${AppConfig.port}`);
        return Account.create();
    });

    const publishedList = autoPublish(agent, accountStorage);

    return { agent, bridge, accountStorage, defaultAccount, publishedList };
}

async function publishAndReport(label, agent, account, contentPath) {
    const { id } = account;
    try {
        console.log(`${label} [${id}]...`);
        const result = await agent.publish({ contentPath, account });
        console.log([
            `${label} [${id}] succeeded!`,
            ` - url: web+dcntr://${result.hostname}`,
            ` - mutable magnet: ${result.contentRef.magnetURI}`,
            ` - static magnet: ${result.content.magnetURI}`,
        ].join('\n'));
        return result;
    } catch (err) {
        console.error(`${label} [${id}] failed!`);
        if (err instanceof AgentEmptyPublishError) {
            console.error(` - public folder is empty`);
        } else {
            console.error(err);
        }
    }
}

async function autoPublish(agent, accountStorage) {
    const accounts = await Promise.all(
        (await accountStorage.listAccounts())
            .map(async ({ id }) => {
                const account = await accountStorage.loadAccount(id);
                return {
                    account,
                    contentPath: accountStorage.getAccountPublicPath(id),
                };
            })
    );

    const published = accounts
        .map(async ({ account, contentPath }) => {
            const result = await publishAndReport('publish', agent, account, contentPath)

            if (result) {
                result.watcher = chokidar.watch(contentPath, { persistent: true, ignoreInitial: true, }).on('all', debounce(5000)(async () => {
                    await publishAndReport('republish', agent, account, contentPath)
                }));
            }

            return result;
        });

    return await Promise.all(published);
}


function debounce(wait) {
    let timeout;
    return (fn) => {
        return function () {
            const context = this, args = arguments;
            const defered = () => {
                fn.apply(context, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(defered, wait);
        }
    };
};

app.parse();

