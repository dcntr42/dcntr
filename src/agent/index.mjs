import { readFile, writeFile, mkdir } from 'fs/promises';
import glob from 'glob';
import { createReadStream } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

import WebTorrent from 'webtorrent';

import KeyPair from './keypair.mjs';
import Resolver from './resolver.mjs';

import AppConfig from '../config.mjs';


function sha1(data) {
    const hash = createHash('sha1');
    hash.update(data);
    return hash.digest();
}


class DHT {
    _seqCache = {};

    constructor(client) {
        this._client = client;
    }

    async get(key, salt) {
        const { _client: client } = this;
        return new Promise(async (resolve, reject) => {
            client.get(key, {
                salt,
                cache: false,
            }, (err, res) => {
                if (err) return reject(err);
                resolve(res);
            });
        });
    }

    async getMutable(pk, salt) {
        const key = sha1(salt ? Buffer.concat([pk, salt]) : pk);
        return this.get(key, salt);
    }

    async put(value, salt) {
        const { _client: client } = this;
        return new Promise(async (resolve, reject) => {
            client.put({
                v: value,
                salt
            }, (err, hash, nodes) => {
                if (err) return reject(err);
                resolve({ hash, nodes });
            });
        });

    }

    async putMutable(keypair, value, salt) {
        const { _client: client } = this;
        const { pk } = keypair;

        const key = sha1(salt ? Buffer.concat([pk, salt]) : pk);
        if (!(salt in this._seqCache)) {
            try {
                const res = await this.get(key, salt);
                this._seqCache[key] = res.seq;
            } catch (err) {
                this._seqCache[key] = 0;
            }
        }
        this._seqCache[key]++;

        return new Promise(async (resolve, reject) => {
            client.put({
                k: pk,
                v: value,
                seq: this._seqCache[key],
                salt,
                sign: (buf) => keypair.sign(buf),
            }, (err, hash, nodes) => {
                if (err) return reject(err);
                resolve({ hash, nodes });
            });
        });
    }
}

async function getFileStreamsFromDir(dirpath) {
    const filepaths = await new Promise((resolve, reject) => glob('**', { cwd: dirpath, dot: true, nodir: true }, (err, files) => err ? reject(err) : resolve(files)));
    return filepaths.map(filepath => {
        const stream = createReadStream(path.join(dirpath, filepath));
        stream.name = filepath;
        return stream;
    });
}

export class Agent {
    _config = {
        cachedir: null,
    };
    _peersKnown = new Set();

    constructor(config) {
        this._config = Object.assign({
            cachedir: AppConfig.dirs.cache,
        }, config);

        this._client = new WebTorrent({
            dht: {
                verify: KeyPair.verify,
                bootstrap: [
                    'dht.libtorrent.org:25401',
                    'router.bittorrent.com:6881',
                    'router.utorrent.com:6881',
                    'dht.transmissionbt.com:6881',
                ]
            },
        });

        this._dht = new DHT(this._client.dht);

        const client = this._client;
        client.on('error', (err) => {
            console.error('Torrent error occurred.', err.message);
        });

        const dht = this._client.dht;
        dht.on('error', (err) => {
            console.error('DHT error occurred', err.message);
        });

        dht.on('peer', (peer) => this._peersKnown.add(`${peer.host}:${peer.port}`));

        (async () => {
            const { cachedir } = this._config;
            const statePath = path.join(cachedir, 'dcntr.state');

            // load agent state
            try {
                await mkdir(cachedir, { recursive: true });
                const { dht: { nodes }, peersKnown } = JSON.parse(await readFile(statePath));
                nodes.forEach((node) => dht.addNode(node));
                this._peersKnown = new Set(peersKnown);
            } catch (err) { } // first time? no worries

            // setup autosave agent state
            setInterval(async () => {
                try {
                    const data = {
                        dht: dht.toJSON(),
                        peersKnown: [...this._peersKnown],
                    };
                    await writeFile(statePath, JSON.stringify(data));
                } catch (err) {
                    console.error('Could not save dcntr agent state.', err);
                }
            }, 60000);

            // prefetch dcntr content
            try {
                await this.fetch('dcntr42s5hct7pqomwwyevinja43eolslzhhoxbi2qgnjinmyox4bzqb');
            } catch (err) {
                console.error('Could not prefetch dcntr content.', err);
            }
        })();
    }

    getPeersCommon() {
        return this._peersKnown;
    }

    async publishContent(hostname, contentPath) {
        const client = this._client;

        const streams = await getFileStreamsFromDir(contentPath);
        if (streams.length === 0) throw new EmptyPublishError('there are no files to be published');

        return new Promise((resolve) => {
            const torrent = client.seed(streams, { name: hostname, announceList: [], singleFileTorrent: false }, async (torrent) => {
                resolve(torrent);
            });

            torrent.on('wire', (wire, addr) => this._peersKnown.add(addr));
            // torrent.on('wire', (wire, addr) => console.log('wire', { addr }));
            // torrent.on('upload', (bytes) => console.log('upload', { bytes }));
            // torrent.on('download', (bytes) => console.log('download', { bytes }));

            torrent.on('infoHash', () => {
                this.getPeersCommon().forEach(peer => torrent.addPeer(peer));
            });
        });
    }

    async fetchContent(infoHashBuffer) {
        const { _client: client } = this;

        if (!infoHashBuffer) throw new InvalidInfohashError(`'${infoHashBuffer}' is not a valid infohash`);

        const torrent = client.torrents.find(torrent => torrent.infoHashBuffer.equals(infoHashBuffer));
        if (torrent) return torrent;

        return new Promise((resolve) => {
            const torrent = client.add(infoHashBuffer, (torrent) => {
                resolve(torrent);
            });

            torrent.on('wire', (wire, addr) => this._peersKnown.add(addr));
            // torrent.on('wire', (wire, addr) => console.log('wire', { addr }));
            // torrent.on('upload', (bytes) => console.log('upload', { bytes }));
            // torrent.on('download', (bytes) => console.log('download', { bytes }));

            torrent.on('infoHash', () => {
                this.getPeersCommon().forEach(peer => torrent.addPeer(peer));
            });
        });
    }

    async updateAccountContentRef(account, infoHashBuffer) {
        const dht = this._dht;

        const { keypair } = account;
        const response = await dht.putMutable(keypair, { ih: infoHashBuffer });

        return {
            _raw: response,
            infoHashBuffer,
            magnetURI: `magnet:?xs=urn:btpk:${keypair.pk.toString('hex')}`,
        }
    }

    async fetchAccountContentRef(publicKey) {
        const dht = this._dht;

        const response = await dht.getMutable(publicKey) || {};
        const infoHashBuffer = response && response.v && response.v.ih;

        return {
            _raw: response,
            infoHashBuffer,
            magnetURI: `magnet:?xs=urn:btpk:${publicKey.toString('hex')}`,
        }
    }

    async publish({ contentPath, account }) {
        const hostname = Resolver.getHostnameFromAccount(account);

        const content = await this.publishContent(hostname, contentPath);

        const contentRef = await this.updateAccountContentRef(account, content.infoHashBuffer);

        return { hostname, content, contentRef };
    }

    async fetch(hostname) {
        const publicKey = Resolver.getPublicKeyFromHostname(hostname);

        const contentRef = await this.fetchAccountContentRef(publicKey);

        const content = await this.fetchContent(contentRef.infoHashBuffer);

        return { publicKey, content, contentRef };
    }
}

export class InvalidInfohashError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidInfohashError';
    }
}
export class EmptyPublishError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EmptyPublishError';
    }
}

export default Agent;