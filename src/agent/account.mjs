import KeyPair from './keypair.mjs';

export default class Account {
    keypair = null;

    constructor({ keypair }) {
        this.keypair = keypair;
    }

    get id() {
        return this.keypair.id;
    }

    static create() {
        return new Account({ keypair: KeyPair.create() });
    }

    static fromJSON(data) {
        return new Account({
            keypair: KeyPair.fromJSON(data.keypair),
        });
    }

    toJSON() {
        return {
            keypair: this.keypair.toJSON(),
        };
    }
}