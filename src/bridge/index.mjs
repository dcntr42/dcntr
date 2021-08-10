import Koa from 'koa';
import Router from '@koa/router';
import serve from 'koa-static';
import ranger from '@masx200/koa-range';

import { URL } from 'url';
import path from 'path';
import AppConfig from '../config.mjs';


class Cache {
    _data = {};
    _update = {};

    get(key) {
        return this._data[key];
    }

    put(key, value) {
        this._data[key] = value;
    }

    async getAndUpdate(key, update) {
        if (!(key in this._update)) {
            this._update[key] = update();
            (async () => {
                this.put(key, await this._update[key]);
                delete this._update[key];
            })();
        }

        if (!(key in this._data)) {
            return await this._update[key];
        }

        return this.get(key);
    }
}

const cache = new Cache();

const core = new Router();

// TODO: local control panel, with node stats, message history/queues, etc...

core.get('/', (ctx, next) => {
    ctx.body = 'assets/';
});

core.get('/browse', (ctx, next) => {
    // /?uri=%s
    const { request, response } = ctx;
    const { uri } = request.query;
    if (uri) {
        // dcntr uri
        const { hostname, pathname } = uri && new URL(uri);
        if (hostname) {
            // redirect to content
            const { protocol } = request;
            const redirectURL = `${protocol}://${hostname}.${AppConfig.tld}.localhost:${AppConfig.port}${pathname}`;
            return response.redirect(redirectURL);
        } else {
            // redirect to metadata?
        }
    } else {
        // redirect to other stuff?
    }
});

export function serveDcntrManagement(client) {
    const router = new Router();
    router.use(core.routes())
    router.use(core.allowedMethods())
    const middleware = router.routes();
    return async (ctx, next) => {
        await middleware(ctx, next);
    }
}

export function mapSubdomainsOf(domain, middleware) {
    return async (ctx, next) => {
        const { hostname } = ctx.request;
        if (hostname.endsWith(domain)) {
            await middleware(ctx, next);
        } else {
            await next();
        }
    };
}

class VFS {
    _tree = { entries: {} };

    add(file) {
        const { _tree: tree } = this;
        const { path: filepath } = file;
        const entry = filepath.split(path.sep).reduce((tree, name) => {
            if (!(name in tree.entries)) tree.entries[name] = { entries: {} };
            return tree.entries[name];
        }, tree);
        delete entry.entries;
        entry.content = file;
    }

    get(filepath) {
        const { _tree: tree } = this;
        return filepath.split(path.sep).reduce((tree, name) => {
            if (name === '') return tree;
            return tree.entries[name];
        }, tree);
    }

    walk(callback) {
        const { _tree: tree } = this;

        const walker = (tree) => {
            tree.entries && Object.keys(tree.entries).forEach(name => {
                const entry = tree.entries[name];
                callback(name, entry);
                walker(entry);
            });
        };

        walker(tree);
    }
}

export function serveDcntrContent(agent) {
    return async (ctx, next) => {
        const { request, response } = ctx;

        const hostname = request.hostname.split('.')[0];
        const pathname = request.path; //fileURLToPath(new URL(request.path, 'file://'));

        const { content } = await cache.getAndUpdate(`torrent:${hostname}`, () => agent.fetch(hostname));

        const vpath = path.join(content.name, pathname);
        const vfs = new VFS;
        content.files.forEach(file => vfs.add(file));
        try {
            const indexNames = ['index.html', 'index.htm', 'README.md'];
            let entry = vfs.get(vpath);
            if (!!entry.entries) {
                const indexFile = indexNames.map(name => entry.entries[name]).find(entry => !!entry);
                if (!indexFile) {
                    response.type = '.html';
                    response.body = Object.keys(entry.entries).map(name => `<a href="./${name}/">${name}</a><br />`).join('\n');
                    return;
                } else {
                    entry = indexFile;
                }
            }
            if (!!entry.content) {
                const file = entry.content;

                response.type = path.extname(file.path);
                response.body = await new Promise((resolve, reject) => {
                    file.getBuffer((err, buffer) => {
                        if (err) return reject(err);
                        resolve(buffer);
                    });
                });
                // response.body = file.createReadStream();
                return;
            }

            throw new Error('should never happen...');
        } catch (err) {
            response.status = 404;
        }
    };
}

async function logger(ctx, next) {
    console.log(`${new Date().toISOString()} > ${ctx.method} ${ctx.host}${ctx.path}`);
    await next();
    console.log(`${new Date().toISOString()} <`)
}

export function Bridge(agent) {
    const app = new Koa();

    app
        .use(logger)
        .use(ranger)
        .use(serve('assets'))
        .use(mapSubdomainsOf(`.${AppConfig.tld}.localhost`, serveDcntrContent(agent)))
        .use(serveDcntrManagement(agent))

    return app;
}

export default Bridge;