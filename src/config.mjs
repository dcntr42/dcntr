import appDirs from 'appdirsjs';

export default class AppConfig {
    static init({ name, tld, port }) {
        [
            process.env['APP_NAME'],
            process.env['APP_TLD'],
            process.env['APP_PORT'],
        ] = [name, tld, port];
    }

    static get name() {
        return process.env['APP_NAME'];
    }

    static get tld() {
        return process.env['APP_TLD'];
    }

    static get port() {
        return process.env['APP_PORT'];
    }

    static get dirs() {
        return appDirs.default({ appName: process.env['APP_NAME'] || '_undefined' });
    }
}