---
sidebar: false
aside: false
---

# Ecosystem

Independent plugins can use Harmony where the official DSH extension points do not reach. This catalog follows the category vocabulary of [Awesome DSH Plugin](https://github.com/Deep-Space-Nine/awesome-dsh-plugin), while keeping each project under its own repository, release process and governance.

<EcosystemShowcase mode="full" locale="en" />

## Add a project

The catalog is maintained through pull requests. Edit [`docs/.vitepress/ecosystem.ts`](https://github.com/memorax-ai/dsh-harmony/edit/docs/docs/.vitepress/ecosystem.ts) and add one factual entry with:

- a public source repository and published package;
- real use of Harmony, normally through a `dsh.harmony` Patch declaration or a documented Harmony integration;
- one category from the existing Awesome DSH Plugin vocabulary;
- a short English and Chinese description of what the plugin does;
- a working installation command.

Keep claims verifiable and descriptions concise. A listing helps discovery; it is not a security review, compatibility guarantee, certification, or endorsement by the Harmony maintainers.
