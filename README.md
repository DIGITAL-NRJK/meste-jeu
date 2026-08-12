# MESTE — Héritage Congo

Application web mobile-first de quiz culturel consacrée à la République du Congo (Congo-Brazzaville), conçue pour l'événement MESTE du 15 août 2026.

## Prérequis

- Node.js 22.13 ou plus récent ;
- npm 11 ;
- un projet Neon pour les tâches nécessitant PostgreSQL.

## Installation

```bash
npm install
cp .env.example .env.local
npm run dev
```

L'application est disponible sur `http://localhost:3000`. Le health check est exposé sur `http://localhost:3000/api/health`.

Remplacez toutes les valeurs d'exemple dans `.env.local` avant d'utiliser une fonctionnalité serveur. Ne versionnez jamais ce fichier.

## Commandes

```bash
npm run dev             # serveur de développement
npm run lint            # règles ESLint et Next.js
npm run typecheck       # TypeScript strict sans émission
npm test                # tests unitaires Vitest
npm run test:integration:db # réservé au workflow Neon de prévisualisation
npm run test:watch      # Vitest en mode interactif
npm run test:e2e        # smoke tests Playwright mobile
npm run build           # build de production Next.js (compilateur Webpack)
npm run netlify:build   # build local avec le contexte Netlify
npm run db:check        # vérifier l'intégrité de l'historique des migrations
npm run db:generate     # générer les migrations Drizzle
npm run db:migrate      # appliquer les migrations Drizzle
npm run db:studio       # ouvrir Drizzle Studio
```

Installez Chromium une première fois avant les tests E2E :

```bash
npx playwright install chromium
```

## Base de données

L'application utilise Drizzle ORM et le pilote HTTP `@neondatabase/serverless`, adapté aux fonctions serverless Netlify. Utilisez :

- `DATABASE_URL` avec l'URL Neon poolée pour le trafic applicatif ;
- `DATABASE_URL_UNPOOLED` avec l'URL directe pour Drizzle Kit et les migrations.

Le schéma métier est défini dans `db/schema/index.ts` et les migrations versionnées dans `db/migrations`. Après une modification du schéma, générez la migration avec `npm run db:generate`, vérifiez-la, puis exécutez `npm run db:check`.

Le workflow GitHub crée une branche Neon éphémère pour chaque PR et y applique automatiquement les migrations. N'exécutez jamais une migration sur la base de production sans instruction explicite.

Les choix de modélisation et les invariants sont détaillés dans `docs/database-schema.md`.

## API joueur

- `POST /api/register` crée un joueur et sa session à partir de `eventSlug` et `nickname` ;
- `GET /api/me` restaure le joueur courant depuis son cookie sécurisé.

Le token joueur brut reste exclusivement dans un cookie `HttpOnly`. Seule son empreinte HMAC est stockée dans PostgreSQL. Le contrat complet est documenté dans `docs/player-registration.md`.

## Bibliothèque de questions

La couche serveur permet de créer les catégories et de gérer le cycle `DRAFT → REVIEW → VALIDATED → ARCHIVED` des questions texte ou image. La revue et la validation exigent de deux à quatre propositions, exactement une bonne réponse et au moins une source. Les interfaces administrateur seront raccordées lors de la TASK 09 ; aucun secret de réponse n’est exposé par une route publique à ce stade.

Le contrat métier et les invariants sont documentés dans `docs/question-library.md`.

## Moteur de session

Le moteur serveur crée et configure les sessions, n’accepte que des questions validées et contrôle les cycles `DRAFT → READY → LIVE → FINISHED` et `PENDING → OPEN → CLOSED → REVEALED`. PostgreSQL garantit qu’une seule occurrence peut être ouverte à la fois dans une session.

Le DTO joueur omet la bonne réponse et l’explication avant la révélation. Les interfaces joueur et administrateur seront raccordées dans les tâches dédiées. Le contrat complet est documenté dans `docs/session-engine.md`.

## Déploiement Netlify

Netlify détecte Next.js et applique automatiquement l'adaptateur OpenNext. Configurez les variables de `.env.example` dans l'interface Netlify, puis utilisez la commande de build `npm run build` et le répertoire de publication `.next`.

Le build force Webpack, pris en charge par Next.js, car Turbopack ouvre un port de compilation PostCSS qui n'est pas disponible dans certains environnements d'intégration isolés.

## Documentation

- Cahier des charges : `docs/cahier-des-charges-v1.md`
- Inscription et session joueur : `docs/player-registration.md`
- Bibliothèque de questions : `docs/question-library.md`
- Moteur de session : `docs/session-engine.md`
- Roadmap : `docs/roadmap-v1.md`
- Instructions agents : `AGENTS.md`
