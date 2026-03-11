# AkiCrop

Image framing PWA (crop, carousel, stack) – SvelteKit.

**Versioning** (semver while in dev): `MAJOR.MINOR.PATCH`  
- **First** (major): big release (e.g. 1.0 when leaving “dev”).  
- **Second** (minor): bigger improvement / new features.  
- **Third** (patch): bugfixes.  
We’re on **0.x.y** until stable.

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.12.4 create --template minimal --types ts --no-install AkiCrop
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
