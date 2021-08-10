# dcntr

web decentralization software experiment

## Usage

Before browsing `web+dcntr://` urls, you need to install and run dcntr.

### From binaries

- download app for your platform
- run

### From source

```bash
git clone https://gitlab.com/dcntr/dcntr.git
npm install
npm start
```

You can also clone/fetch from http://dcntr42s5hct7pqomwwyevinja43eolslzhhoxbi2qgnjinmyox4bzqb.dcntr.localhost:32687/dcntr.git, after you have dcntr running. ;)

## Development

### Why?

Social media platforms made content more accessible, but with their influence and filtering power, they are diminishing freedom, by promoting cherry picked "truths" and suppressing "wrongthink" speech.

### How?

Reinventing the wheel, the lazy way.

Let's start with every content bundle being distributed by torrent, with peers and metadata discoverable by DHT, like usual.
Content bundles may be superseeded by new ones with a DHT mutable put. The public key used for that may be mapped to a hostname, like Tor Hidden Services.
User content will be shared with DHT mutable put using the public key of target as salt.

Maybe integrate or replace this with [Hypercore](https://hypercore-protocol.org/) or [IPFS](https://ipfs.io/) in the future? Sure.

Maybe realize that [ZeroNet](https://zeronet.io/) is just better? Probably...

### What?

- [x] Publish (static) content
- [x] Browse by content URL
- [ ] Custom error/autoindex pages/templates
- [ ] User ("dynamic") content
- [ ] Node admin/stats
- [ ] Private (e2e) content
- [ ] Domain permissions/transfer

> 🄯 000000000000000000071f7145692f86d0b513a5b94f1876104f8dd5a334b3f4 dcntr42. ideas are not scarse, copy == multiply != steal
