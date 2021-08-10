import { createHash } from 'crypto';
import base32Encode from 'base32-encode';
import base32Decode from 'base32-decode';


function sha256(data) {
    const hash = createHash('sha256');
    hash.update(data);
    return hash.digest();
}

export default class Resolver {
    static VERSION = Buffer.from([1]);
    static TLD = Buffer.from('.dcntr');

    static getPublicKeyFromHostname(hostname) {
        const hostnameBinary = Buffer.from(base32Decode(hostname.toUpperCase(), 'RFC4648'));
        const version = hostnameBinary.slice(-1);
        if (!version.equals(this.VERSION)) {
            throw new Error(`unsupported version ${version}`);
        }

        const publicKey = hostnameBinary.slice(0, -3);
        const checksum = hostnameBinary.slice(-3, -1);
        const checksumExpected = sha256(Buffer.concat([this.TLD, publicKey, this.VERSION])).slice(0, 2);

        if (!checksum.equals(checksumExpected)) {
            throw new Error(`checksum ${checksum} does not match ${checksumExpected}`);
        }

        return publicKey;
    }

    static getHostnameFromPublicKey(publicKey) {
        // const hostnameBinary = base32(PUBKEY | CHECKSUM | VERSION)
        // const checksum = H(TLD | PUBKEY | VERSION)

        const checksum = sha256(Buffer.concat([this.TLD, publicKey, this.VERSION])).slice(0, 2);
        const hostnameBinary = Buffer.concat([publicKey, checksum, this.VERSION]);
        const hostname = base32Encode(hostnameBinary, 'RFC4648', { padding: false }).toLowerCase();

        return hostname;
    }

    static getHostnameFromAccount(account) {
        return this.getHostnameFromPublicKey(account.keypair.pk);
    }
}