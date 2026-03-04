This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Authentification

L'application utilise un système d'authentification fermé :
- Pas d'inscription publique ; les comptes sont créés uniquement par les administrateurs dans **Paramètres**.
- Connexion obligatoire pour accéder à l'application.

### Configuration initiale

1. **Activer Neon Auth** dans la [Neon Console](https://console.neon.tech) : Projet → Branche → Auth → Configuration.

2. **Variables d'environnement** (`.env.local`) :
   ```
   NEON_AUTH_BASE_URL=https://ep-xxx.neonauth.us-east-1.aws.neon.tech/neondb/auth
   NEON_AUTH_COOKIE_SECRET=<générer avec: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
   ```

3. **Migration base de données** : exécuter les migrations dans l'ordre sur votre base Neon :
   - `migrations/001_processed_by_user_id_to_uuid.sql`
   - … jusqu'à `migrations/010_invoices.sql` (facturation)

4. **Facturation** (optionnel) : pour générer des factures PDF, configurer Cloudinary :
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

5. **Premier administrateur** : aller sur `/auth/setup` pour créer le premier compte. Après création, assigner le rôle admin dans la Neon Console (Auth → Users → Make admin).

6. Ensuite, les utilisateurs supplémentaires sont créés dans **Paramètres** par un admin.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
