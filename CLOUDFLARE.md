# Cloudflare Pages

1. Push the Bloom repository to GitHub.
2. In Cloudflare, open Workers & Pages, choose Create, then Pages and Connect to Git.
3. Select kqq-seven/Bloom on main. Use npm run build as the build command and dist as the output directory.
4. In D1, create a database named bloom-db.
5. Open the Pages project settings and add a D1 binding named DB for the bloom-db database.
6. In the D1 console, run migrations/0001_init.sql.
7. Redeploy the Pages project. Use its pages.dev address for the public preview.

The Pages Functions use the DB binding for authentication, sessions, and per-user data. No database URL or payment card is needed for the D1 binding.
