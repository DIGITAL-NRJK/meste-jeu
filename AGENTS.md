# Instructions de contribution — MESTE Héritage Congo

## Références obligatoires

Avant toute modification importante :

1. lire `docs/cahier-des-charges-v1.md` ;
2. lire `docs/roadmap-v1.md` ;
3. limiter les changements à la tâche explicitement demandée.

## Règles produit

- Dans tout le projet, « Congo » désigne la République du Congo / Congo-Brazzaville. « RDC » désigne la République démocratique du Congo. Ne jamais les confondre.
- Ne pas inventer de fonctionnalité absente du cahier des charges.
- Privilégier un monolithe Next.js simple et mobile-first.
- Le serveur est l'autorité pour le temps, les réponses, le scoring et le classement.
- Ne jamais exposer une bonne réponse ou une explication révélatrice avant la phase de révélation.
- Ne jamais exposer un secret au client ni l'écrire dans les logs.
- Toute migration de base de données doit être versionnée.
- Ne jamais modifier les données de production sans instruction explicite.
- Toute modification du scoring nécessite des tests unitaires.

## Architecture

- UI et routes : `src/app`, `src/components`
- Logique partagée : `src/lib`
- Accès aux données et cas d'usage serveur : `src/server`
- Schéma et migrations : `db`
- Tests unitaires et E2E : `tests`

La logique métier ne doit pas être placée dans les composants React.

## Validation avant livraison

Exécuter et corriger, dans cet ordre :

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Exécuter également les tests E2E concernés avec `npm run test:e2e` lorsqu'un parcours utilisateur est modifié.

Une tâche n'est terminée que si les vérifications concernées passent, qu'aucun secret n'est exposé et que la documentation utile est à jour. Signaler toute divergence entre le code et le cahier des charges.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
