import open from 'open';
import SysTray from 'systray2';
import { readFile } from 'fs/promises';

export class Tray {
    async init({ icon, accounts }) {
        const SysTraySeparator = {
            title: '<SEPARATOR>',
            enabled: false,
        };

        const systray = this._systray = new SysTray.default({
            menu: {
                icon: await readFile(icon, 'base64'),
                title: 'dcntr',
                items: [
                    {
                        title: 'open',
                        enabled: true,
                        click: () => {
                            open('http://dcntr.localhost:32687');
                        },
                    },
                    {
                        title: 'accounts',
                        enabled: true,
                        items: accounts.map(({ id, publicPath, url }) => {
                            return {
                                title: `${id.substr(0, 8)}...`,
                                enabled: true,
                                items: [
                                    {
                                        title: 'public folder',
                                        enabled: true,
                                        click: () => {
                                            console.log(`opening ${publicPath}`)
                                            open(`${publicPath}`);
                                        },
                                    },
                                    {
                                        title: 'browse url',
                                        enabled: true,
                                        click: () => {
                                            console.log(`opening ${url}`)
                                            open(`${url}`);
                                        },
                                    }
                                ],
                            }
                        }),
                    },
                    {
                        title: 'quit',
                        enabled: true,
                        click: () => {
                            systray.kill();
                        },
                    }]
            },
            debug: false,
            copyDir: true, // copy go tray binary to outside directory, useful for packing tool like pkg.
        });

        systray.onClick(async (action) => {
            if (action.item.click != null) {
                action.item.click()
            }
        });
    }
}

export default Tray;