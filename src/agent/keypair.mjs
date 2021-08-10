import ed from 'ed25519-supercop';
import base32Encode from 'base32-encode';
import base32Decode from 'base32-decode';

function encode(data) {
    return base32Encode(data, 'RFC4648', { padding: false }).toLowerCase();
}

function decode(data) {
    return Buffer.from(base32Decode(data.toUpperCase(), 'RFC4648'));
}

export default class KeyPair {
    static type = 'ed25519-supercop';
    pk = null;
    sk = null;

    constructor({ pk, sk }) {
        this.pk = pk;
        this.sk = sk;
    }

    get id() {
        return encode(this.pk);
    }

    static create() {
        const seed = ed.createSeed();
        const { publicKey: pk, secretKey: sk } = ed.createKeyPair(seed);
        return new KeyPair({ pk, sk });
    }

    static sign(message, publicKey, secretKey) {
        return ed.sign(message, publicKey, secretKey);
    }

    sign(message) {
        return KeyPair.sign(message, this.pk, this.sk);
    }

    static verify(signature, message, publicKey) {
        return ed.verify(signature, message, publicKey);
    }

    static fromJSON(data) {
        if (data.type !== KeyPair.type) throw new Error(`expected keypair type '${this.type}', but found '${data.type}'`);

        return new KeyPair({
            pk: decode(data.pk),
            sk: decode(data.sk),
        });
    }

    toJSON() {
        return {
            type: KeyPair.type,
            pk: encode(this.pk),
            sk: encode(this.sk),
        };
    }
}